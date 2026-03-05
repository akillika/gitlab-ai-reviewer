import { openaiEmbed } from './openaiClient';
import { logger } from '../utils/logger';

/**
 * Generate a single embedding vector using OpenAI text-embedding-3-small.
 * Returns a 1536-dimensional float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await openaiEmbed(text);
  return result.embedding;
}

/**
 * Generate embeddings for multiple texts with error recovery.
 * Returns null for any text that fails to embed, allowing partial success.
 *
 * Processes sequentially; the concurrency queue in openaiClient handles parallelism.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i++) {
    try {
      const embedding = await generateEmbedding(texts[i]);
      results.push(embedding);
    } catch (error) {
      logger.warn('Failed to generate embedding for text chunk', {
        error: (error as Error).message,
        chunkIndex: i,
      });
      results.push(null);
    }
  }

  return results;
}
