import { logger } from '../utils/logger';
import { AIReviewComment, DiffChunk } from './types';
import { openaiChatCompletion, ChatCompletionResult } from './openaiClient';
import { parseAIResponseWithRetry } from './jsonParser';
import { generateEmbedding } from './embedding';
import { searchSimilarChunks, ChunkRow } from '../services/repoService';
import { config } from '../utils/config';

// --- Types ---

export interface ReviewContext {
  /** MR title from GitLab */
  mrTitle?: string;
  /** MR description from GitLab */
  mrDescription?: string;
  /** Repo ID for RAG context retrieval (if repo is indexed) */
  repoId?: string;
}

export interface ReviewResult {
  comments: AIReviewComment[];
  /** Aggregated token usage across all API calls for this review */
  usage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    model: string;
    callCount: number;
  };
}

// --- Prompt construction ---

const SYSTEM_PROMPT = `You are a senior staff-level code reviewer performing a thorough, production-grade review.
You are reviewing a GitLab merge request in the context of the repository.

Review ONLY the changed lines (lines starting with + in the diff) in the context of the full file and repository patterns.

CRITICAL RULES:
- DO NOT comment on method naming, variable naming, or renaming suggestions.
- DO NOT comment on missing documentation, Javadoc, or comments.
- DO NOT comment on code formatting or style.
- DO NOT comment on import statements.
- DO NOT suggest adding logging.
- DO NOT comment on commented-out code unless it introduces a bug.
- ONLY flag real, actionable issues that could cause bugs, data loss, security holes, or production incidents.
- Every comment MUST describe a concrete problem and how to fix it.

Return ONLY valid JSON.
Do NOT include markdown, explanations, or code blocks.

Return JSON in this exact format:
[
  {
    "file_path": "exact/path/to/file.ext",
    "line_number": <number from the new file side>,
    "severity": "major" | "minor" | "suggestion",
    "comment": "Specific description of the bug/issue and the concrete fix."
  }
]

If no real issues found, return empty array: []

Severity guide:
- "major": Bugs, null pointer risks, security vulnerabilities, data loss, race conditions, crash risks, incorrect business logic
- "minor": Missing error handling, unhandled edge cases, resource leaks, incorrect exception handling, off-by-one errors
- "suggestion": Potential performance issues, missing boundary checks, thread safety concerns, better error recovery patterns

Focus EXCLUSIVELY on:
1. Logical bugs: null dereference, wrong boolean logic, incorrect comparisons, off-by-one errors
2. Null safety: missing null checks before method calls, unsafe casts, potential NPE
3. Error handling: swallowed exceptions, missing try-catch for IO operations, incorrect error propagation
4. Security: SQL injection, missing input validation, hardcoded credentials, improper authorization
5. Concurrency: race conditions, missing synchronization, unsafe shared state
6. Resource management: unclosed connections, missing finally blocks, resource leaks
7. Data integrity: missing transaction boundaries, partial updates without rollback, inconsistent state
8. Performance: N+1 queries, unnecessary allocations in loops, missing pagination, unbounded collections`;

function buildFileReviewPrompt(
  chunk: DiffChunk,
  context: ReviewContext,
  repoChunks: ChunkRow[]
): string {
  const parts: string[] = [];

  // MR metadata
  if (context.mrTitle) {
    parts.push(`MR Title: ${context.mrTitle}`);
  }
  if (context.mrDescription) {
    parts.push(`MR Description: ${context.mrDescription.substring(0, 500)}`);
  }

  // Repository context from vector search (RAG)
  if (repoChunks.length > 0) {
    parts.push('');
    parts.push('--- Repository Context (retrieved relevant code) ---');
    for (const rc of repoChunks) {
      parts.push(`\n// ${rc.file_path} (chunk ${rc.chunk_index}):`);
      parts.push(rc.chunk_text.substring(0, 1500));
    }
    parts.push('--- End Repository Context ---');
  }

  // The actual diff to review
  parts.push('');
  parts.push(`File: ${chunk.filePath}${chunk.isNewFile ? ' (NEW FILE)' : ''}${chunk.isDeletedFile ? ' (DELETED)' : ''}`);
  parts.push('');
  parts.push('Changed Diff:');
  parts.push('```diff');
  parts.push(chunk.diff);
  parts.push('```');

  return parts.join('\n');
}

function buildBatchReviewPrompt(
  chunks: DiffChunk[],
  context: ReviewContext,
  repoChunks: ChunkRow[]
): string {
  const parts: string[] = [];

  if (context.mrTitle) {
    parts.push(`MR Title: ${context.mrTitle}`);
  }
  if (context.mrDescription) {
    parts.push(`MR Description: ${context.mrDescription.substring(0, 500)}`);
  }

  if (repoChunks.length > 0) {
    parts.push('');
    parts.push('--- Repository Context (retrieved relevant code) ---');
    for (const rc of repoChunks) {
      parts.push(`\n// ${rc.file_path} (chunk ${rc.chunk_index}):`);
      parts.push(rc.chunk_text.substring(0, 1500));
    }
    parts.push('--- End Repository Context ---');
  }

  parts.push('');
  for (const chunk of chunks) {
    parts.push(`### File: ${chunk.filePath}${chunk.isNewFile ? ' (NEW FILE)' : ''}`);
    parts.push('```diff');
    parts.push(chunk.diff);
    parts.push('```');
    parts.push('');
  }

  return parts.join('\n');
}

// --- RAG context retrieval ---

/**
 * Retrieves relevant code context from the indexed repository.
 *
 * Strategy: embed the *clean added code* (with diff markers stripped) rather than
 * the raw diff. Raw diffs have +/- markers and hunk headers that distort
 * embedding similarity vs. indexed baseline code. By stripping diff syntax
 * and prepending the file path, the embedding aligns with how repo chunks
 * were indexed ("File: path\n\ncode").
 */
async function retrieveContext(
  repoId: string,
  diffChunks: DiffChunk[],
  limit: number = 5
): Promise<ChunkRow[]> {
  try {
    // Build clean code text from added lines (strip diff markers)
    const cleanParts: string[] = [];
    for (const chunk of diffChunks) {
      const addedLines = chunk.diff
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.substring(1));
      if (addedLines.length > 0) {
        cleanParts.push(`File: ${chunk.filePath}\n\n${addedLines.join('\n')}`);
      }
    }

    if (cleanParts.length === 0) return [];

    // Truncate to embedding input limit
    const textForEmbedding = cleanParts.join('\n\n').substring(0, 2000);
    const embedding = await generateEmbedding(textForEmbedding);
    const chunks = await searchSimilarChunks(repoId, embedding, limit);

    // Filter out chunks from the same files being changed — we want
    // surrounding context, not the code being reviewed.
    const changedFiles = new Set(diffChunks.map((c) => c.filePath));
    return chunks.filter((c) => !changedFiles.has(c.file_path));
  } catch (error) {
    logger.warn('Failed to retrieve RAG context, proceeding without it', {
      repoId,
      error: (error as Error).message,
    });
    return [];
  }
}

// --- Post-processing: filter out low-value comments ---

/**
 * Patterns that indicate a comment is about naming, documentation, or style
 * rather than an actual bug/issue. These get filtered out even if the model
 * produces them despite prompt instructions.
 */
const LOW_VALUE_PATTERNS = [
  /\brename\b/i,
  /\brenam(ed|ing)\b/i,
  /\bmore descriptive (name|method name|variable name)\b/i,
  /\bconsider (renaming|using a more descriptive)\b/i,
  /\badd(ing)? (a )?documentation\b/i,
  /\badd(ing)? (a )?javadoc\b/i,
  /\badd(ing)? (a )?(inline )?comment/i,
  /\bmissing (javadoc|documentation|doc comment)\b/i,
  /\bconsider adding documentation\b/i,
  /\bcould benefit from.*(name|documentation|comment)\b/i,
  /\bclarify its (purpose|functionality|role)\b/i,
  /\bimprove clarity\b/i,
  /\bmore (clear|readable) name\b/i,
  /\bbetter reflect\b/i,
  /\bcommented.out code should be removed\b/i,
  /\bconsider removing commented\b/i,
];

function isLowValueComment(comment: AIReviewComment): boolean {
  const text = comment.comment;
  return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

// --- Token budget management ---

/**
 * Rough token estimation: ~4 chars per token for English prose,
 * but code/diffs average ~3 chars per token due to operators, short names, etc.
 */
const CHARS_PER_TOKEN = 3;

/** Reserve tokens for the response */
const RESPONSE_TOKEN_RESERVE = 4096;

/**
 * Context window limits by model family.
 * Conservative estimates to avoid hitting the exact limit.
 */
function getModelContextLimit(model: string): number {
  if (model.includes('gpt-4o') || model.includes('gpt-4.1')) return 120000;
  if (model.includes('gpt-4-turbo')) return 120000;
  if (model.includes('gpt-4')) return 7500; // gpt-4 base 8K, leave margin
  return 120000; // default to large for newer models
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// --- Review orchestration ---

/** Files with diffs larger than this get individual review */
const LARGE_FILE_THRESHOLD = 5000;
/** Small files are batched together up to this limit */
const SMALL_FILE_BATCH_LIMIT = 20000;

/**
 * Reviews diffs using OpenAI with optional RAG context from the indexed repository.
 *
 * Strategy:
 * - Large files (>5000 chars of diff): reviewed individually with full RAG context
 * - Small files (<5000 chars): batched together with shared RAG context
 * - Per-file context retrieval via pgvector similarity search
 */
export async function reviewDiffs(
  diffChunks: DiffChunk[],
  context: ReviewContext = {}
): Promise<ReviewResult> {
  if (diffChunks.length === 0) {
    return { comments: [], usage: { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, model: config.openai.reviewModel, callCount: 0 } };
  }

  // Separate into large (individual) and small (batch) files
  const largeFiles: DiffChunk[] = [];
  const smallFiles: DiffChunk[] = [];

  for (const chunk of diffChunks) {
    if (chunk.diff.length >= LARGE_FILE_THRESHOLD) {
      largeFiles.push(chunk);
    } else {
      smallFiles.push(chunk);
    }
  }

  // Batch small files
  const smallFileBatches: DiffChunk[][] = [];
  if (smallFiles.length > 0) {
    let currentBatch: DiffChunk[] = [];
    let currentSize = 0;
    for (const chunk of smallFiles) {
      const chunkSize = chunk.diff.length + chunk.filePath.length + 100;
      if (currentSize + chunkSize > SMALL_FILE_BATCH_LIMIT && currentBatch.length > 0) {
        smallFileBatches.push(currentBatch);
        currentBatch = [];
        currentSize = 0;
      }
      currentBatch.push(chunk);
      currentSize += chunkSize;
    }
    if (currentBatch.length > 0) {
      smallFileBatches.push(currentBatch);
    }
  }

  // Build review tasks
  interface ReviewTask {
    label: string;
    chunks: DiffChunk[];
    isSingleFile: boolean;
  }

  const tasks: ReviewTask[] = [];

  for (const chunk of largeFiles) {
    tasks.push({
      label: `file: ${chunk.filePath} (${chunk.diff.length} chars)`,
      chunks: [chunk],
      isSingleFile: true,
    });
  }

  for (const batch of smallFileBatches) {
    const files = batch.map((c) => c.filePath).join(', ');
    tasks.push({
      label: `batch: ${files} (${batch.length} files)`,
      chunks: batch,
      isSingleFile: false,
    });
  }

  logger.info(`Review strategy: ${largeFiles.length} large file(s) individually, ${smallFiles.length} small file(s) in ${smallFileBatches.length} batch(es), ${tasks.length} total API calls`);

  const allComments: AIReviewComment[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let callCount = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    logger.info(`Reviewing task ${i + 1}/${tasks.length}: ${task.label}`);

    try {
      // Retrieve RAG context if repo is indexed
      let repoChunks: ChunkRow[] = [];
      if (context.repoId) {
        repoChunks = await retrieveContext(context.repoId, task.chunks, 5);
        if (repoChunks.length > 0) {
          logger.info(`Retrieved ${repoChunks.length} context chunks for task ${i + 1}`);
        }
      }

      // Build prompt
      let userMessage = task.isSingleFile
        ? buildFileReviewPrompt(task.chunks[0], context, repoChunks)
        : buildBatchReviewPrompt(task.chunks, context, repoChunks);

      // Token budget check: ensure prompt fits within context window
      const modelLimit = getModelContextLimit(config.openai.reviewModel);
      const systemTokens = estimateTokens(SYSTEM_PROMPT);
      let userTokens = estimateTokens(userMessage);
      const availableForPrompt = modelLimit - RESPONSE_TOKEN_RESERVE;

      if (systemTokens + userTokens > availableForPrompt) {
        logger.warn(`Prompt exceeds token budget (est. ${systemTokens + userTokens} tokens, limit ${availableForPrompt}). Trimming RAG context.`, {
          taskLabel: task.label,
        });

        // First: retry without RAG context
        userMessage = task.isSingleFile
          ? buildFileReviewPrompt(task.chunks[0], context, [])
          : buildBatchReviewPrompt(task.chunks, context, []);
        userTokens = estimateTokens(userMessage);

        if (systemTokens + userTokens > availableForPrompt) {
          // Still too large: truncate the diff itself
          const maxUserChars = (availableForPrompt - systemTokens) * CHARS_PER_TOKEN;
          userMessage = userMessage.substring(0, maxUserChars);
          logger.warn(`Diff too large even without RAG, truncated to ${maxUserChars} chars`, {
            taskLabel: task.label,
          });
        }
      }

      logger.info(`Prompt size: ${SYSTEM_PROMPT.length + userMessage.length} chars (~${systemTokens + estimateTokens(userMessage)} tokens, limit ${availableForPrompt})`);

      // Call OpenAI
      const result: ChatCompletionResult = await openaiChatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        {
          model: config.openai.reviewModel,
          temperature: 0.2,
          maxTokens: RESPONSE_TOKEN_RESERVE,
        }
      );

      totalPromptTokens += result.usage.promptTokens;
      totalCompletionTokens += result.usage.completionTokens;
      callCount++;

      logger.info(`OpenAI response: ${result.usage.totalTokens} tokens`, {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        model: result.model,
      });

      // Parse the response
      const comments = await parseAIResponseWithRetry(result.content);
      logger.info(`Parsed ${comments.length} comments from task ${i + 1}`);

      // Validate file paths
      const validPaths = new Set(task.chunks.map((c) => c.filePath));
      const validComments = comments.filter((c) => {
        if (!validPaths.has(c.file_path)) {
          logger.warn('AI returned comment for unknown file, skipping', {
            filePath: c.file_path,
            validPaths: Array.from(validPaths),
          });
          return false;
        }
        return true;
      });

      // Filter out low-value naming/documentation comments
      const highValueComments = validComments.filter((c) => {
        if (isLowValueComment(c)) {
          logger.info('Filtered low-value comment (naming/docs)', {
            filePath: c.file_path,
            line: c.line_number,
            commentPreview: c.comment.substring(0, 80),
          });
          return false;
        }
        return true;
      });

      if (highValueComments.length < validComments.length) {
        logger.info(`Filtered ${validComments.length - highValueComments.length} low-value comments from task ${i + 1}`);
      }

      allComments.push(...highValueComments);
    } catch (error) {
      logger.error(`Failed to review task ${i + 1}: ${task.label}`, {
        error: (error as Error).message,
      });
      // Continue with other tasks — partial review is better than none
    }
  }

  logger.info(`AI review complete: ${allComments.length} comments, ${callCount} API calls, ${totalPromptTokens + totalCompletionTokens} total tokens`);

  return {
    comments: allComments,
    usage: {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      model: config.openai.reviewModel,
      callCount,
    },
  };
}
