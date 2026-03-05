/**
 * reviewHistoryService.ts — Persists review history records for analytics.
 *
 * After each review completes, a summary row is inserted into `review_history`
 * capturing severity counts and risk score. This enables trend analysis and
 * project health dashboards without re-aggregating from review_comments.
 */

import { query } from '../utils/db';
import { RiskSummary } from './riskCalculator';
import { logger } from '../utils/logger';

export interface ReviewHistoryRecord {
  id: number;
  review_id: number;
  repo_id: string | null;
  project_id: number;
  mr_iid: number;
  total_major: number;
  total_minor: number;
  total_suggestion: number;
  risk_score: number;
  created_at: string;
}

/**
 * Insert a review history record after a review completes.
 *
 * @param params  Review metadata and computed risk summary.
 * @returns The inserted record, or null if insert fails (non-critical).
 */
export async function saveReviewHistory(params: {
  reviewId: number;
  repoId: string | null;
  projectId: number;
  mrIid: number;
  summary: RiskSummary;
}): Promise<ReviewHistoryRecord | null> {
  try {
    const result = await query<ReviewHistoryRecord & { [key: string]: unknown }>(
      `INSERT INTO review_history (review_id, repo_id, project_id, mr_iid, total_major, total_minor, total_suggestion, risk_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.reviewId,
        params.repoId,
        params.projectId,
        params.mrIid,
        params.summary.total_major,
        params.summary.total_minor,
        params.summary.total_suggestion,
        params.summary.overall_risk_score,
      ]
    );
    return result.rows[0] || null;
  } catch (error) {
    // Non-critical: log and continue
    logger.warn('Failed to save review history', {
      reviewId: params.reviewId,
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Get review history for a project (most recent first).
 */
export async function getReviewHistory(
  projectId: number,
  limit: number = 20
): Promise<ReviewHistoryRecord[]> {
  const result = await query<ReviewHistoryRecord & { [key: string]: unknown }>(
    `SELECT * FROM review_history WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit]
  );
  return result.rows;
}
