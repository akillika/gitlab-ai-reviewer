import { query } from '../utils/db';
import { logger } from '../utils/logger';

// --- Cost estimation ---
// Prices per 1M tokens (as of early 2025)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini':                { input: 0.15,  output: 0.60  },
  'gpt-4.1':                    { input: 2.00,  output: 8.00  },
  'gpt-4o':                     { input: 2.50,  output: 10.00 },
  'text-embedding-3-small':     { input: 0.02,  output: 0     },
  'text-embedding-3-large':     { input: 0.13,  output: 0     },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 1.0, output: 1.0 };
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

// --- Public API ---

export interface UsageLogEntry {
  userId: number;
  reviewId?: number;
  repoId?: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  purpose: 'review' | 'embedding' | 'retry';
}

/**
 * Log a single AI usage event to the ai_usage_logs table.
 * Fire-and-forget — errors are logged but not propagated.
 */
export async function logUsage(entry: UsageLogEntry): Promise<void> {
  const estimatedCost = estimateCost(entry.model, entry.tokensInput, entry.tokensOutput);

  try {
    await query(
      `INSERT INTO ai_usage_logs (user_id, review_id, repo_id, model, tokens_input, tokens_output, estimated_cost, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId,
        entry.reviewId || null,
        entry.repoId || null,
        entry.model,
        entry.tokensInput,
        entry.tokensOutput,
        estimatedCost,
        entry.purpose,
      ]
    );
  } catch (error) {
    // Non-critical — don't crash the review if logging fails
    logger.warn('Failed to log AI usage', {
      error: (error as Error).message,
      model: entry.model,
      tokensInput: entry.tokensInput,
      tokensOutput: entry.tokensOutput,
    });
  }
}

/**
 * Log usage for a batch of calls (e.g., multiple file reviews in one MR).
 */
export async function logBatchUsage(entries: UsageLogEntry[]): Promise<void> {
  for (const entry of entries) {
    await logUsage(entry);
  }
}
