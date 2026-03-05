/**
 * duplicateDetector.ts — Detects duplicate/similar code across the repository.
 *
 * For each changed file in the MR:
 * 1. Extracts the added lines from the diff.
 * 2. Generates an embedding for the added code block.
 * 3. Queries pgvector for the top 3 most similar chunks in the repo.
 * 4. If cosine similarity >= threshold (0.85), and the match is a DIFFERENT file,
 *    produces a "suggestion" comment advising reuse.
 *
 * Graceful degradation: if embedding or search fails, returns empty array.
 */

import { generateEmbedding } from '../ai/embedding';
import { searchSimilarChunks, ChunkRow } from './repoService';
import { AIReviewComment, DiffChunk } from '../ai/types';
import { logger } from '../utils/logger';

/** Minimum cosine similarity to flag as duplicate */
const SIMILARITY_THRESHOLD = 0.85;
/** Maximum similar chunks to query per file */
const TOP_K = 3;
/** Minimum added lines to consider for duplicate detection */
const MIN_ADDED_LINES = 5;

/**
 * Extract only the added lines ('+' lines) from a unified diff, stripping the
 * diff prefix. Returns the concatenated code block.
 */
function extractAddedCode(diff: string): string {
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.substring(1))
    .join('\n');
}

/**
 * Detect duplicate logic across the indexed repository for the given MR diffs.
 *
 * @param repoId  The UUID of the indexed repository (for pgvector search).
 * @param diffChunks The MR's diff chunks to analyze.
 * @returns Additional "suggestion" comments for duplicates found, or [] on failure.
 */
export async function detectDuplicates(
  repoId: string,
  diffChunks: DiffChunk[]
): Promise<AIReviewComment[]> {
  const suggestions: AIReviewComment[] = [];

  for (const chunk of diffChunks) {
    try {
      const addedCode = extractAddedCode(chunk.diff);
      const addedLines = addedCode.split('\n').filter((l) => l.trim().length > 0);

      // Skip files with too few added lines — not enough signal
      if (addedLines.length < MIN_ADDED_LINES) {
        continue;
      }

      // Truncate to avoid overly long embedding inputs
      const textForEmbedding = addedCode.substring(0, 2000);
      const embedding = await generateEmbedding(textForEmbedding);

      const similarChunks = await searchSimilarChunks(repoId, embedding, TOP_K);

      for (const similar of similarChunks) {
        // The similarity score is returned as `1 - cosine_distance` by repoService.
        // pgvector <=> returns cosine distance, so similarity = 1 - distance.
        const similarity = (similar as ChunkRow & { similarity?: number }).similarity;
        if (similarity === undefined || similarity < SIMILARITY_THRESHOLD) {
          continue;
        }

        // Skip if the match is the same file — not a cross-file duplicate
        if (similar.file_path === chunk.filePath) {
          continue;
        }

        suggestions.push({
          file_path: chunk.filePath,
          line_number: getFirstAddedLineNumber(chunk.diff),
          severity: 'suggestion',
          comment: `Similar logic exists in \`${similar.file_path}\` (${Math.round(similarity * 100)}% similarity). Consider reusing the existing implementation to reduce duplication.`,
        });

        // Only one duplicate suggestion per file to avoid noise
        break;
      }
    } catch (error) {
      // Graceful degradation: log and continue with next file
      logger.warn('Duplicate detection failed for file, skipping', {
        filePath: chunk.filePath,
        error: (error as Error).message,
      });
    }
  }

  return suggestions;
}

/**
 * Get the new-side line number of the first added line in the diff.
 * Falls back to 1 if no hunk header found.
 */
function getFirstAddedLineNumber(diff: string): number {
  const lines = diff.split('\n');
  let currentNewLine = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      return currentNewLine;
    }
    if (!line.startsWith('-')) {
      currentNewLine++;
    }
  }

  return 1;
}
