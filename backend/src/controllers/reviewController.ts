import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getDecryptedGitlabToken } from '../services/userService';
import { createGitLabClient } from '../gitlab/client';
import {
  resolveProjectId,
  getMergeRequestChanges,
  getMergeRequest,
  postDiscussion,
  getExistingDiscussions,
  getBranchInfo,
} from '../gitlab/api';
import { parseMrUrl, parseChangedLineNumbers, parseDiffLineMap, findNearestDiffLine } from '../gitlab/parser';
import { DiffLineInfo } from '../gitlab/types';
import { reviewDiffs, ReviewContext } from '../ai/claude';
import { DiffChunk } from '../ai/types';
import {
  createReview,
  saveReviewComments,
  getReviewsByUser,
  getReviewWithComments,
  updateComment,
  deleteComment,
  markCommentPosted,
} from '../services/reviewService';
import { findRepo, createRepo } from '../services/repoService';
import { enqueueIndexingJob } from '../queue/indexingQueue';
import { logUsage } from '../services/usageService';
import { computeRiskSummary } from '../services/riskCalculator';
import { detectDuplicates } from '../services/duplicateDetector';
import { generateTestSuggestions } from '../services/testSuggester';
import { runRuleEngine } from '../services/ruleEngine';
import { saveReviewHistory } from '../services/reviewHistoryService';
import { detectArchitecturalDrift } from '../services/architectureDriftService';
import { calculateImpactAnalysis, type ImpactAnalysis } from '../services/dependencyImpactService';
import { generateMRSummary } from '../services/mrSummaryService';
import { evaluateGate } from '../services/aiGateService';
import { logger } from '../utils/logger';

export async function runReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const { mrUrl } = req.body;

    const parsed = parseMrUrl(mrUrl);

    // Decrypt user's GitLab token in-memory for this request
    const gitlab = await getDecryptedGitlabToken(req.user.userId);

    const client = createGitLabClient(gitlab.baseUrl, gitlab.token);
    const projectId = await resolveProjectId(client, parsed.projectPath);

    const [mrChanges, mrDetails] = await Promise.all([
      getMergeRequestChanges(client, projectId, parsed.mrIid),
      getMergeRequest(client, projectId, parsed.mrIid),
    ]);

    const diffChunks: DiffChunk[] = mrChanges.changes
      .filter((change) => change.diff && !change.deleted_file)
      .map((change) => ({
        filePath: change.new_path,
        diff: change.diff,
        isNewFile: change.new_file,
        isDeletedFile: change.deleted_file,
      }));

    if (diffChunks.length === 0) {
      throw new AppError(400, 'No reviewable changes found in this merge request');
    }

    logger.info('Starting AI review', {
      projectPath: parsed.projectPath,
      mrIid: parsed.mrIid,
      fileCount: diffChunks.length,
      fileSizes: diffChunks.map((c) => ({
        path: c.filePath,
        diffChars: c.diff.length,
        diffLines: c.diff.split('\n').length,
      })),
      totalDiffChars: diffChunks.reduce((sum, c) => sum + c.diff.length, 0),
    });

    // Build review context with MR metadata and optional RAG repo ID
    const reviewContext: ReviewContext = {
      mrTitle: mrDetails.title,
      mrDescription: mrDetails.description || undefined,
    };

    // Check if the repo is indexed for RAG context
    const repo = await findRepo(projectId, gitlab.baseUrl);
    if (repo && repo.indexing_status === 'completed') {
      reviewContext.repoId = repo.id;
      logger.info('Using indexed repo for RAG context', {
        repoId: repo.id,
        lastIndexedCommit: repo.last_indexed_commit_sha,
      });
    }

    // --- Phase 1: AI Review + Rule Engine + Duplicate Detection + Drift Detection (concurrent) ---
    // Run AI review (primary), rule engine, duplicate detection, and drift detection.
    // Rule engine and drift detection run independently of AI.
    // Duplicate detection and drift detection need indexed repo.

    const repoId = repo?.id || null;

    const [reviewResult, ruleComments, duplicateComments, driftComments] = await Promise.all([
      // Primary AI review
      reviewDiffs(diffChunks, reviewContext),
      // Architecture rule engine (regex-based, no AI, fast)
      runRuleEngine(diffChunks),
      // Duplicate logic detection (needs indexed repo — gracefully returns [] if unavailable)
      repoId ? detectDuplicates(repoId, diffChunks) : Promise.resolve([]),
      // Architectural drift detection (needs indexed repo — gracefully returns [] if unavailable)
      repoId ? detectArchitecturalDrift(repoId, diffChunks) : Promise.resolve([]),
    ]);

    // Log AI usage
    logUsage({
      userId: req.user.userId,
      model: reviewResult.usage.model,
      tokensInput: reviewResult.usage.totalPromptTokens,
      tokensOutput: reviewResult.usage.totalCompletionTokens,
      purpose: 'review',
    });

    // Merge all comment sources: AI comments + rule violations + duplicate suggestions + drift
    const allRawComments = [
      ...reviewResult.comments,
      ...ruleComments,
      ...duplicateComments,
      ...driftComments,
    ];

    logger.info('Comment sources', {
      aiComments: reviewResult.comments.length,
      ruleComments: ruleComments.length,
      duplicateComments: duplicateComments.length,
      driftComments: driftComments.length,
      totalRaw: allRawComments.length,
    });

    // --- Phase 2: Validate all comments against diff lines ---

    // Build diff line maps per file for validation and position resolution.
    // The diff map tracks every line visible in the diff (added, removed, context)
    // with the correct old_line/new_line values needed by GitLab's API.
    const diffLineMaps = new Map<string, Map<number, DiffLineInfo>>();
    const changedLinesMap = new Map<string, Set<number>>();
    for (const change of mrChanges.changes) {
      if (change.diff) {
        const { byNewLine } = parseDiffLineMap(change.diff);
        diffLineMaps.set(change.new_path, byNewLine);
        changedLinesMap.set(change.new_path, parseChangedLineNumbers(change.diff));
      }
    }

    // Validate comments against actual diff lines and snap to nearest valid line.
    // Tolerance of ±3 lines — tight enough to avoid landing on unrelated code,
    // wide enough to handle GPT's occasional off-by-one/two line numbering.
    const LINE_TOLERANCE = 3;
    let droppedByFile = 0;
    let droppedByLine = 0;
    let snappedCount = 0;
    let maxSnapDistance = 0;

    const validatedComments = allRawComments
      .map((comment) => {
        // Normalize file path: strip leading ./ for consistent matching
        const normalizedPath = comment.file_path.replace(/^\.\//, '');
        const diffMap = diffLineMaps.get(normalizedPath) || diffLineMaps.get(comment.file_path);
        if (!diffMap) {
          droppedByFile++;
          logger.warn('Comment references unknown file, skipping', {
            filePath: comment.file_path,
            availableFiles: Array.from(diffLineMaps.keys()),
          });
          return null;
        }

        // Find nearest line in the diff within tolerance
        const nearest = findNearestDiffLine(diffMap, comment.line_number, LINE_TOLERANCE);
        if (!nearest) {
          droppedByLine++;
          const changedLines = changedLinesMap.get(normalizedPath) || changedLinesMap.get(comment.file_path);
          logger.warn('Comment line not in diff (±3 tolerance), dropping', {
            filePath: comment.file_path,
            lineNumber: comment.line_number,
            severity: comment.severity,
            commentPreview: comment.comment.substring(0, 80),
            nearestChangedLines: changedLines
              ? Array.from(changedLines).sort((a, b) => a - b).slice(0, 20)
              : [],
          });
          return null;
        }

        // Snap the comment to the resolved diff line
        const snappedLine = nearest.new_line ?? comment.line_number;
        if (snappedLine !== comment.line_number) {
          const distance = Math.abs(snappedLine - comment.line_number);
          snappedCount++;
          maxSnapDistance = Math.max(maxSnapDistance, distance);
          logger.info('Snapped comment line number', {
            filePath: comment.file_path,
            originalLine: comment.line_number,
            snappedLine,
            distance,
          });
        }

        return { ...comment, file_path: normalizedPath, line_number: snappedLine };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    logger.info('Comment validation results', {
      totalRaw: allRawComments.length,
      afterValidation: validatedComments.length,
      droppedByFile,
      droppedByLine,
      snappedCount,
      maxSnapDistance,
      dropRate: allRawComments.length > 0
        ? `${Math.round(((droppedByFile + droppedByLine) / allRawComments.length) * 100)}%`
        : '0%',
    });

    // --- Phase 3: Compute risk summary from validated comments ---

    const summary = computeRiskSummary(validatedComments);

    logger.info('Risk summary', {
      major: summary.total_major,
      minor: summary.total_minor,
      suggestion: summary.total_suggestion,
      riskScore: summary.overall_risk_score,
    });

    // --- Phase 4: Save review + generate test suggestions + MR summary + impact analysis (concurrent) ---

    const review = await createReview({
      userId: req.user.userId,
      projectId,
      projectPath: parsed.projectPath,
      mrIid: parsed.mrIid,
      mrTitle: mrDetails.title,
    });

    // Run concurrently: save comments, test suggestions, MR summary, and impact analysis.
    // MR summary and impact analysis are non-critical — graceful degradation.
    const [savedComments, testSuggestions, mrSummary, impactAnalysis] = await Promise.all([
      saveReviewComments(review.id, validatedComments),
      generateTestSuggestions(diffChunks),
      generateMRSummary(diffChunks, mrDetails.title, mrDetails.description || undefined),
      repoId
        ? calculateImpactAnalysis(repoId, diffChunks)
        : Promise.resolve(null as ImpactAnalysis | null),
    ]);

    // --- Phase 5: Evaluate AI gate ---

    const gateResult = await evaluateGate(repoId, summary);

    logger.info('AI gate result', {
      gateStatus: gateResult.gate_status,
      reason: gateResult.reason,
      checks: gateResult.checks.length,
    });

    // --- Phase 6: Persist review history (fire-and-forget) ---

    saveReviewHistory({
      reviewId: review.id,
      repoId,
      projectId,
      mrIid: parsed.mrIid,
      summary,
    }).catch((err) => {
      logger.warn('Failed to save review history (non-critical)', {
        error: (err as Error).message,
      });
    });

    // --- Phase 7: Return enriched response ---

    res.json({
      reviewId: review.id,
      projectId,
      projectPath: parsed.projectPath,
      mrIid: parsed.mrIid,
      mrTitle: mrDetails.title,
      diffRefs: mrDetails.diff_refs,
      comments: savedComments,
      summary,
      test_suggestions: testSuggestions,
      mr_summary: mrSummary,
      impact_analysis: impactAnalysis,
      gate: gateResult,
      totalGenerated: allRawComments.length,
      totalValidated: validatedComments.length,
      validation: {
        droppedByFile,
        droppedByLine,
        snappedCount,
      },
    });

    // Fire-and-forget: trigger repo indexing if needed
    try {
      const branchInfo = await getBranchInfo(client, projectId, mrDetails.target_branch);
      const latestSha = branchInfo.commit.id;

      if (!repo) {
        const newRepo = await createRepo({
          projectId,
          gitlabBaseUrl: gitlab.baseUrl,
          defaultBranch: mrDetails.target_branch,
          triggeredByUserId: req.user!.userId,
        });
        await enqueueIndexingJob({
          repoId: newRepo.id,
          projectId,
          gitlabBaseUrl: gitlab.baseUrl,
          accessToken: gitlab.token,
          isIncremental: false,
          userId: req.user!.userId,
          branch: mrDetails.target_branch,
        });
        logger.info('Triggered full repo indexing', { projectId, repoId: newRepo.id });
      } else if (repo.indexing_status !== 'indexing' && repo.last_indexed_commit_sha !== latestSha) {
        await enqueueIndexingJob({
          repoId: repo.id,
          projectId,
          gitlabBaseUrl: gitlab.baseUrl,
          accessToken: gitlab.token,
          isIncremental: true,
          userId: req.user!.userId,
          branch: mrDetails.target_branch,
        });
        logger.info('Triggered incremental repo indexing', { projectId, repoId: repo.id });
      }
    } catch (err) {
      logger.warn('Failed to trigger repo indexing (non-critical)', {
        error: (err as Error).message,
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function getReviews(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');
    const reviews = await getReviewsByUser(req.user.userId);
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

export async function getReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const reviewId = parseInt(req.params.reviewId, 10);
    if (isNaN(reviewId)) {
      throw new AppError(400, 'Invalid review ID');
    }

    const result = await getReviewWithComments(reviewId, req.user.userId);
    if (!result) {
      throw new AppError(404, 'Review not found');
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function editComment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const reviewId = parseInt(req.params.reviewId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (isNaN(reviewId) || isNaN(commentId)) {
      throw new AppError(400, 'Invalid review or comment ID');
    }

    const { comment, severity } = req.body;
    if (!comment && !severity) {
      throw new AppError(400, 'No updates provided');
    }
    if (severity && !['major', 'minor', 'suggestion'].includes(severity)) {
      throw new AppError(400, 'Invalid severity');
    }

    const updated = await updateComment(commentId, reviewId, req.user.userId, { comment, severity });
    if (!updated) {
      throw new AppError(404, 'Comment not found');
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export async function removeComment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const reviewId = parseInt(req.params.reviewId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (isNaN(reviewId) || isNaN(commentId)) {
      throw new AppError(400, 'Invalid review or comment ID');
    }

    const deleted = await deleteComment(commentId, reviewId, req.user.userId);
    if (!deleted) {
      throw new AppError(404, 'Comment not found');
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Build the correct GitLab discussion position for a comment.
 *
 * GitLab's MR discussions API is strict about position parameters:
 * - Added lines ('+' in diff): new_line only, old_line must be null/omitted
 * - Removed lines ('-' in diff): old_line only, new_line must be null/omitted
 * - Context lines (unchanged): BOTH old_line AND new_line required
 * - Lines not in diff at all: 400 error
 *
 * @param diffLineMaps Pre-built diff line maps per file
 * @param filePath The comment's file path
 * @param lineNumber The comment's line number (new-side)
 * @param diffRefs The MR's diff refs (base_sha, start_sha, head_sha)
 * @param change The MR change object for old_path lookup
 */
function buildPosition(
  diffLineMaps: Map<string, Map<number, DiffLineInfo>>,
  filePath: string,
  lineNumber: number,
  diffRefs: { base_sha: string; start_sha: string; head_sha: string },
  oldPath?: string
): { position_type: 'text'; new_path: string; base_sha: string; start_sha: string; head_sha: string; new_line?: number; old_line?: number; old_path?: string } {
  const diffMap = diffLineMaps.get(filePath);
  const lineInfo = diffMap?.get(lineNumber);

  const position: {
    position_type: 'text';
    new_path: string;
    base_sha: string;
    start_sha: string;
    head_sha: string;
    new_line?: number;
    old_line?: number;
    old_path?: string;
  } = {
    position_type: 'text',
    new_path: filePath,
    base_sha: diffRefs.base_sha,
    start_sha: diffRefs.start_sha,
    head_sha: diffRefs.head_sha,
  };

  if (oldPath && oldPath !== filePath) {
    position.old_path = oldPath;
  }

  if (lineInfo) {
    if (lineInfo.type === 'added') {
      // Added line: only new_line
      position.new_line = lineInfo.new_line!;
    } else if (lineInfo.type === 'removed') {
      // Removed line: only old_line
      position.old_line = lineInfo.old_line!;
    } else {
      // Context line: both old_line and new_line
      position.new_line = lineInfo.new_line!;
      position.old_line = lineInfo.old_line!;
    }
  } else {
    // Fallback: use new_line only (may fail for context lines not in diff)
    position.new_line = lineNumber;
  }

  return position;
}

export async function postComment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const reviewId = parseInt(req.params.reviewId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (isNaN(reviewId) || isNaN(commentId)) {
      throw new AppError(400, 'Invalid review or comment ID');
    }

    const reviewData = await getReviewWithComments(reviewId, req.user.userId);
    if (!reviewData) throw new AppError(404, 'Review not found');

    const commentToPost = reviewData.comments.find((c) => c.id === commentId);
    if (!commentToPost) throw new AppError(404, 'Comment not found');
    if (commentToPost.posted) throw new AppError(400, 'Comment already posted');

    const { diffRefs } = req.body;
    if (!diffRefs?.base_sha || !diffRefs?.start_sha || !diffRefs?.head_sha) {
      throw new AppError(400, 'Missing diff refs (base_sha, start_sha, head_sha)');
    }

    const gitlab = await getDecryptedGitlabToken(req.user.userId);
    const client = createGitLabClient(gitlab.baseUrl, gitlab.token);

    // Fetch MR changes to build diff line maps for correct position
    const mrChangesForPost = await getMergeRequestChanges(
      client,
      reviewData.review.project_id,
      reviewData.review.mr_iid
    );
    const postDiffLineMaps = new Map<string, Map<number, DiffLineInfo>>();
    const oldPathMap = new Map<string, string>();
    for (const change of mrChangesForPost.changes) {
      if (change.diff) {
        const { byNewLine } = parseDiffLineMap(change.diff);
        postDiffLineMaps.set(change.new_path, byNewLine);
        if (change.old_path !== change.new_path) {
          oldPathMap.set(change.new_path, change.old_path);
        }
      }
    }

    const severityEmoji =
      commentToPost.severity === 'major' ? '🔴' : commentToPost.severity === 'minor' ? '🟡' : '🔵';
    const body = `${severityEmoji} **[${commentToPost.severity.toUpperCase()}]** ${commentToPost.comment}\n\n_Posted via AI MR Reviewer_`;

    const position = buildPosition(
      postDiffLineMaps,
      commentToPost.file_path,
      commentToPost.line_number,
      diffRefs,
      oldPathMap.get(commentToPost.file_path)
    );

    const discussion = await postDiscussion(client, reviewData.review.project_id, reviewData.review.mr_iid, {
      body,
      position,
    });

    const noteId = discussion.notes[0]?.id;
    if (noteId) await markCommentPosted(commentId, noteId);

    res.json({ success: true, discussionId: discussion.id, noteId });
  } catch (error) {
    next(error);
  }
}

export async function postAllComments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const reviewId = parseInt(req.params.reviewId, 10);
    if (isNaN(reviewId)) throw new AppError(400, 'Invalid review ID');

    const reviewData = await getReviewWithComments(reviewId, req.user.userId);
    if (!reviewData) throw new AppError(404, 'Review not found');

    const { diffRefs } = req.body;
    if (!diffRefs?.base_sha || !diffRefs?.start_sha || !diffRefs?.head_sha) {
      throw new AppError(400, 'Missing diff refs');
    }

    const gitlab = await getDecryptedGitlabToken(req.user.userId);
    const client = createGitLabClient(gitlab.baseUrl, gitlab.token);

    // Fetch MR changes to build diff line maps for correct position
    const mrChangesForPost = await getMergeRequestChanges(
      client,
      reviewData.review.project_id,
      reviewData.review.mr_iid
    );
    const postDiffLineMaps = new Map<string, Map<number, DiffLineInfo>>();
    const oldPathMap = new Map<string, string>();
    for (const change of mrChangesForPost.changes) {
      if (change.diff) {
        const { byNewLine } = parseDiffLineMap(change.diff);
        postDiffLineMaps.set(change.new_path, byNewLine);
        if (change.old_path !== change.new_path) {
          oldPathMap.set(change.new_path, change.old_path);
        }
      }
    }

    const existingDiscussions = await getExistingDiscussions(
      client,
      reviewData.review.project_id,
      reviewData.review.mr_iid
    );
    const existingCommentKeys = new Set<string>();
    for (const discussion of existingDiscussions) {
      for (const note of discussion.notes) {
        if (note.position && note.body.includes('AI MR Reviewer')) {
          existingCommentKeys.add(`${note.position.new_path}:${note.position.new_line}`);
        }
      }
    }

    const unpostedComments = reviewData.comments.filter((c) => !c.posted);
    const results: Array<{ commentId: number; success: boolean; error?: string }> = [];

    for (const comment of unpostedComments) {
      const key = `${comment.file_path}:${comment.line_number}`;
      if (existingCommentKeys.has(key)) {
        results.push({ commentId: comment.id, success: false, error: 'Duplicate comment' });
        continue;
      }

      try {
        const severityEmoji =
          comment.severity === 'major' ? '🔴' : comment.severity === 'minor' ? '🟡' : '🔵';
        const body = `${severityEmoji} **[${comment.severity.toUpperCase()}]** ${comment.comment}\n\n_Posted via AI MR Reviewer_`;

        const position = buildPosition(
          postDiffLineMaps,
          comment.file_path,
          comment.line_number,
          diffRefs,
          oldPathMap.get(comment.file_path)
        );

        const discussion = await postDiscussion(
          client,
          reviewData.review.project_id,
          reviewData.review.mr_iid,
          {
            body,
            position,
          }
        );

        const noteId = discussion.notes[0]?.id;
        if (noteId) await markCommentPosted(comment.id, noteId);
        results.push({ commentId: comment.id, success: true });

        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        logger.error('Failed to post comment', {
          commentId: comment.id,
          error: (error as Error).message,
        });
        results.push({ commentId: comment.id, success: false, error: (error as Error).message });
      }
    }

    const posted = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.json({ posted, failed, results });
  } catch (error) {
    next(error);
  }
}
