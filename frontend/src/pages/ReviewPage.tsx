/**
 * ReviewPage — The main split-pane review workspace.
 *
 * This is the most important screen in the app.
 * Three-pane layout:
 * - Left: FileTree with changed files and severity indicators
 * - Center: DiffViewer with side-by-side diff, line annotations
 * - Right: AISuggestionsPanel with comment cards, severity filter, actions
 *
 * Features:
 * - Risk Score card with color-coded gauge (Feature 1)
 * - Test Suggestions collapsible panel (Feature 3)
 * - Duplicate logic and rule violation tags on comments (Features 2 & 4)
 * - Severity filter toggle (Feature 5 frontend)
 * - Keyboard shortcuts (J/K navigation, Cmd+Enter to post)
 * - Click comment to scroll to line in diff
 * - Click annotated line in diff to highlight comment
 * - Batch select and post comments
 * - Missing diff refs warning
 * - Shimmer loading states
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ReviewLayout } from '../layouts/ReviewLayout';
import { ReviewSummary } from '../components/ReviewSummary/ReviewSummary';
import { RiskScoreCard } from '../components/RiskScoreCard/RiskScoreCard';
import { TestSuggestionsPanel } from '../components/TestSuggestionsPanel/TestSuggestionsPanel';
import { MRSummaryCard } from '../components/MRSummaryCard/MRSummaryCard';
import { ImpactRadiusCard } from '../components/ImpactRadiusCard/ImpactRadiusCard';
import { FileTree } from '../components/FileTree/FileTree';
import { DiffViewer } from '../components/DiffViewer/DiffViewer';
import { AISuggestionsPanel } from '../components/AISuggestionsPanel/AISuggestionsPanel';
import { ShimmerDiff } from '../components/ui/Shimmer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useToast } from '../components/Toast/Toast';
import {
  getReview,
  fetchMR,
  editComment as apiEditComment,
  deleteComment as apiDeleteComment,
  postComment as apiPostComment,
  postAllComments as apiPostAllComments,
  type ReviewComment,
  type ReviewData,
  type MergeRequestData,
  type SafeUser,
  type RiskSummary,
  type TestSuggestion,
  type MRSummaryData,
  type ImpactAnalysisData,
  type GateResult,
} from '../services/api';

export function ReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const location = useLocation();
  const { addToast } = useToast();

  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [reviewMeta, setReviewMeta] = useState<{
    projectPath: string;
    mrIid: number;
    mrTitle: string;
    projectId: number;
  } | null>(null);
  const [diffRefs, setDiffRefs] = useState<{
    base_sha: string;
    start_sha: string;
    head_sha: string;
  } | null>(null);
  const [mrData, setMrData] = useState<MergeRequestData | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);
  const [testSuggestions, setTestSuggestions] = useState<TestSuggestion[]>([]);
  const [mrSummaryData, setMrSummaryData] = useState<MRSummaryData | null>(null);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysisData | null>(null);
  const [gateResult, setGateResult] = useState<GateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<number | null>(null);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [postingId, setPostingId] = useState<number | null>(null);
  const [postingAll, setPostingAll] = useState(false);

  const id = parseInt(reviewId || '', 10);

  // --- Data loading ---
  useEffect(() => {
    const state = location.state as { reviewData?: ReviewData; mrData?: MergeRequestData } | null;

    if (state?.reviewData) {
      setComments(state.reviewData.comments);
      setDiffRefs(state.reviewData.diffRefs);
      setReviewMeta({
        projectPath: state.reviewData.projectPath,
        mrIid: state.reviewData.mrIid,
        mrTitle: state.reviewData.mrTitle,
        projectId: state.reviewData.projectId,
      });
      // Set feature data from review response (Phase 1 + Phase 2)
      if (state.reviewData.summary) {
        setRiskSummary(state.reviewData.summary);
      }
      if (state.reviewData.test_suggestions) {
        setTestSuggestions(state.reviewData.test_suggestions);
      }
      if (state.reviewData.mr_summary) {
        setMrSummaryData(state.reviewData.mr_summary);
      }
      if (state.reviewData.impact_analysis) {
        setImpactAnalysis(state.reviewData.impact_analysis);
      }
      if (state.reviewData.gate) {
        setGateResult(state.reviewData.gate);
      }
      if (state.mrData) {
        setMrData(state.mrData);
      }
      setLoading(false);
      // Auto-select first file
      if (state.mrData?.changes.length) {
        setSelectedFile(state.mrData.changes[0].newPath);
      }
      return;
    }

    if (isNaN(id)) {
      setError('Invalid review ID');
      setLoading(false);
      return;
    }

    getReview(id)
      .then((res) => {
        setComments(res.data.comments);
        setReviewMeta({
          projectPath: res.data.review.project_path,
          mrIid: res.data.review.mr_iid,
          mrTitle: res.data.review.mr_title,
          projectId: res.data.review.project_id,
        });
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load review');
      })
      .finally(() => setLoading(false));
  }, [id, location.state]);

  // Auto-fetch MR data if we don't have it (for diffs)
  useEffect(() => {
    if (mrData || !reviewMeta) return;
    // Try to reconstruct MR URL from stored user data
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const user = JSON.parse(stored) as SafeUser;
        if (user.gitlabBaseUrl) {
          const mrUrl = `${user.gitlabBaseUrl}/${reviewMeta.projectPath}/-/merge_requests/${reviewMeta.mrIid}`;
          fetchMR(mrUrl)
            .then((res) => {
              setMrData(res.data);
              if (!diffRefs) setDiffRefs(res.data.diffRefs);
              if (!selectedFile && res.data.changes.length) {
                setSelectedFile(res.data.changes[0].newPath);
              }
            })
            .catch(() => {
              // Non-critical — diff viewer just won't load
            });
        }
      }
    } catch {
      // ignore
    }
  }, [reviewMeta, mrData, diffRefs, selectedFile]);

  // --- File changes ---
  const files = useMemo(() => mrData?.changes || [], [mrData]);
  const currentFileDiff = useMemo(
    () => files.find((f) => f.newPath === selectedFile)?.diff || '',
    [files, selectedFile]
  );
  const currentFileComments = useMemo(
    () => comments.filter((c) => c.file_path === selectedFile),
    [comments, selectedFile]
  );

  // --- Flat comment list for J/K navigation ---
  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => {
      if (a.file_path !== b.file_path) return a.file_path.localeCompare(b.file_path);
      return a.line_number - b.line_number;
    });
  }, [comments]);

  // --- Comment actions ---
  const handleEdit = useCallback(async (commentId: number, updates: { comment?: string; severity?: string }) => {
    const res = await apiEditComment(id, commentId, updates);
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...res.data } : c)));
    addToast('success', 'Comment updated');
  }, [id, addToast]);

  const handleDelete = useCallback(async (commentId: number) => {
    await apiDeleteComment(id, commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    addToast('info', 'Comment deleted');
  }, [id, addToast]);

  const handlePost = useCallback(async (commentId: number) => {
    if (!diffRefs) return;
    setPostingId(commentId);
    try {
      await apiPostComment(id, commentId, diffRefs);
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, posted: true } : c)));
      addToast('success', 'Comment posted to GitLab');
    } catch (err: unknown) {
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to post comment'
      );
    } finally {
      setPostingId(null);
    }
  }, [id, diffRefs, addToast]);

  const handlePostAll = useCallback(async () => {
    if (!diffRefs) return;
    setPostingAll(true);
    try {
      const res = await apiPostAllComments(id, diffRefs);
      addToast('success', `Posted ${res.data.posted} comments${res.data.failed ? ` (${res.data.failed} failed)` : ''}`);
      const reviewRes = await getReview(id);
      setComments(reviewRes.data.comments);
    } catch (err: unknown) {
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to post comments'
      );
    } finally {
      setPostingAll(false);
    }
  }, [id, diffRefs, addToast]);

  const handlePostSelected = useCallback(async (ids: number[]) => {
    if (!diffRefs) return;
    setPostingAll(true);
    let posted = 0;
    let failed = 0;
    for (const commentId of ids) {
      try {
        await apiPostComment(id, commentId, diffRefs);
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, posted: true } : c)));
        posted++;
      } catch {
        failed++;
      }
    }
    addToast('success', `Posted ${posted} comments${failed ? ` (${failed} failed)` : ''}`);
    setPostingAll(false);
  }, [id, diffRefs, addToast]);

  // --- Navigation: click comment -> scroll to line in diff ---
  const handleCommentClick = useCallback((comment: ReviewComment) => {
    setSelectedFile(comment.file_path);
    setActiveCommentId(comment.id);
    setHighlightLine(comment.line_number);
  }, []);

  // --- Navigation: click line in diff -> highlight comment ---
  const handleLineClick = useCallback((lineNumber: number) => {
    const comment = currentFileComments.find((c) => c.line_number === lineNumber);
    if (comment) {
      setActiveCommentId(comment.id);
    }
  }, [currentFileComments]);

  // --- Keyboard shortcuts ---
  const navigateComment = useCallback(
    (direction: 1 | -1) => {
      if (sortedComments.length === 0) return;
      const currentIdx = activeCommentId
        ? sortedComments.findIndex((c) => c.id === activeCommentId)
        : -1;
      let nextIdx = currentIdx + direction;
      if (nextIdx < 0) nextIdx = sortedComments.length - 1;
      if (nextIdx >= sortedComments.length) nextIdx = 0;
      const next = sortedComments[nextIdx];
      handleCommentClick(next);
    },
    [sortedComments, activeCommentId, handleCommentClick]
  );

  useKeyboardShortcuts({
    onNextComment: () => navigateComment(1),
    onPrevComment: () => navigateComment(-1),
    onPostSelected: handlePostAll,
    onEscape: () => {
      setActiveCommentId(null);
      setHighlightLine(null);
    },
  });

  // --- Loading state ---
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="flex flex-col items-center gap-3">
          <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-body-sm text-txt-secondary">Loading review&hellip;</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface dark:bg-surface-dark">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-severity-major-bg mx-auto mb-3 flex items-center justify-center">
            <span className="text-severity-major text-xl">{'\u2717'}</span>
          </div>
          <p className="text-body font-medium text-txt-primary dark:text-txt-dark-primary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <ReviewLayout
      summary={
        <>
          <ReviewSummary
            comments={comments}
            mrTitle={reviewMeta?.mrTitle || ''}
            projectPath={reviewMeta?.projectPath || ''}
            mrIid={reviewMeta?.mrIid || 0}
            onPostAll={handlePostAll}
            postingAll={postingAll}
            hasDiffRefs={!!diffRefs}
            riskSummary={riskSummary}
            gateResult={gateResult}
            projectId={reviewMeta?.projectId}
          />
          {/* Phase 1 + Phase 2 cards below summary bar */}
          {(riskSummary || testSuggestions.length > 0 || mrSummaryData || impactAnalysis) && (
            <div className="px-5 py-3 bg-surface border-b border-border space-y-3">
              {/* Row 1: Risk Score + Impact Radius */}
              <div className="flex items-start gap-4">
                {riskSummary && (
                  <RiskScoreCard summary={riskSummary} className="flex-1" />
                )}
                {impactAnalysis && impactAnalysis.impactRadius > 0 && (
                  <ImpactRadiusCard impact={impactAnalysis} className="flex-1" />
                )}
              </div>
              {/* Row 2: MR Summary + Test Suggestions */}
              <div className="flex items-start gap-4">
                {mrSummaryData && (
                  <MRSummaryCard summary={mrSummaryData} className="flex-1" />
                )}
                {testSuggestions.length > 0 && (
                  <TestSuggestionsPanel suggestions={testSuggestions} className="flex-1" />
                )}
              </div>
            </div>
          )}
        </>
      }
      alert={
        <AnimatePresence>
          {!diffRefs && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-5 py-2 bg-severity-minor-bg border-b border-severity-minor-border text-body-sm text-severity-minor"
            >
              Diff refs not available. To post comments, re-run the review from the dashboard.
            </motion.div>
          )}
        </AnimatePresence>
      }
      fileTree={
        <FileTree
          files={files}
          comments={comments}
          selectedFile={selectedFile}
          onSelectFile={(path) => {
            setSelectedFile(path);
            setActiveCommentId(null);
            setHighlightLine(null);
          }}
        />
      }
      diffViewer={
        selectedFile && currentFileDiff ? (
          <DiffViewer
            diff={currentFileDiff}
            filePath={selectedFile}
            comments={currentFileComments}
            onLineClick={handleLineClick}
            highlightLine={highlightLine}
          />
        ) : selectedFile && !currentFileDiff ? (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2.5 border-b border-border bg-surface">
              <span className="font-mono text-body-sm text-txt-primary font-medium">{selectedFile}</span>
            </div>
            <div className="flex-1 p-4">
              <ShimmerDiff lines={20} />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center px-4">
            <div>
              <p className="text-body text-txt-secondary font-medium">Select a file</p>
              <p className="text-body-sm text-txt-tertiary mt-1">
                Choose a file from the left panel to view its diff and AI comments.
              </p>
            </div>
          </div>
        )
      }
      suggestionsPanel={
        <AISuggestionsPanel
          comments={comments}
          selectedFile={selectedFile}
          activeCommentId={activeCommentId}
          onCommentClick={handleCommentClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPost={handlePost}
          onPostSelected={handlePostSelected}
          postingId={postingId}
          postingAll={postingAll}
          hasDiffRefs={!!diffRefs}
        />
      }
    />
  );
}
