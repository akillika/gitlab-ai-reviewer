/**
 * repoHealthService.ts — Code health trends analytics.
 *
 * Queries review_history to produce aggregate health metrics:
 * - Risk score trend over time
 * - Severity distribution over time
 * - Average risk score
 * - Improvement/degradation indicators
 *
 * Powers the /repos/:repoId/health endpoint and frontend dashboard.
 */

import { query } from '../utils/db';
import { logger } from '../utils/logger';

// --- Types ---

export interface HealthTrendPoint {
  review_id: number;
  mr_iid: number;
  risk_score: number;
  total_major: number;
  total_minor: number;
  total_suggestion: number;
  created_at: string;
}

export interface HealthSummary {
  /** Average risk score across all reviews */
  avg_risk_score: number;
  /** Total number of reviews */
  total_reviews: number;
  /** Risk score trend: "improving", "stable", "degrading" */
  trend: 'improving' | 'stable' | 'degrading';
  /** Average risk score of the last 5 reviews */
  recent_avg_risk_score: number;
  /** Average risk score of the previous 5 reviews (before the recent ones) */
  previous_avg_risk_score: number;
  /** Total major issues across all reviews */
  total_majors_all_time: number;
  /** Total minor issues across all reviews */
  total_minors_all_time: number;
  /** Total suggestions across all reviews */
  total_suggestions_all_time: number;
  /** Individual review data points for charting */
  trend_data: HealthTrendPoint[];
}

// --- Analytics queries ---

/**
 * Get health summary for a project.
 *
 * @param projectId  The GitLab project ID.
 * @param limit      Max number of data points to return (default 50).
 * @returns Health summary with trend data.
 */
export async function getProjectHealth(
  projectId: number,
  limit: number = 50
): Promise<HealthSummary> {
  try {
    // Get trend data (most recent first)
    const trendResult = await query<HealthTrendPoint & { [key: string]: unknown }>(
      `SELECT review_id, mr_iid, risk_score, total_major, total_minor, total_suggestion, created_at
       FROM review_history
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit]
    );

    const trendData = trendResult.rows;

    if (trendData.length === 0) {
      return {
        avg_risk_score: 100,
        total_reviews: 0,
        trend: 'stable',
        recent_avg_risk_score: 100,
        previous_avg_risk_score: 100,
        total_majors_all_time: 0,
        total_minors_all_time: 0,
        total_suggestions_all_time: 0,
        trend_data: [],
      };
    }

    // Get aggregate stats
    const statsResult = await query<{
      avg_risk: string;
      total_reviews: string;
      total_majors: string;
      total_minors: string;
      total_suggestions: string;
      [key: string]: unknown;
    }>(
      `SELECT
        ROUND(AVG(risk_score)) as avg_risk,
        COUNT(*) as total_reviews,
        SUM(total_major) as total_majors,
        SUM(total_minor) as total_minors,
        SUM(total_suggestion) as total_suggestions
       FROM review_history
       WHERE project_id = $1`,
      [projectId]
    );

    const stats = statsResult.rows[0];

    // Calculate recent vs previous averages for trend
    const recent5 = trendData.slice(0, 5);
    const previous5 = trendData.slice(5, 10);

    const recentAvg = recent5.length > 0
      ? Math.round(recent5.reduce((sum, d) => sum + d.risk_score, 0) / recent5.length)
      : 100;

    const previousAvg = previous5.length > 0
      ? Math.round(previous5.reduce((sum, d) => sum + d.risk_score, 0) / previous5.length)
      : recentAvg;

    // Determine trend direction
    const diff = recentAvg - previousAvg;
    let trend: 'improving' | 'stable' | 'degrading';
    if (diff > 5) {
      trend = 'improving'; // Higher score = better health
    } else if (diff < -5) {
      trend = 'degrading';
    } else {
      trend = 'stable';
    }

    // Reverse trend data for chronological order (oldest first for charts)
    const chronologicalData = [...trendData].reverse();

    return {
      avg_risk_score: parseInt(stats.avg_risk) || 100,
      total_reviews: parseInt(stats.total_reviews) || 0,
      trend,
      recent_avg_risk_score: recentAvg,
      previous_avg_risk_score: previousAvg,
      total_majors_all_time: parseInt(stats.total_majors) || 0,
      total_minors_all_time: parseInt(stats.total_minors) || 0,
      total_suggestions_all_time: parseInt(stats.total_suggestions) || 0,
      trend_data: chronologicalData,
    };
  } catch (error) {
    logger.warn('Health analytics query failed', {
      projectId,
      error: (error as Error).message,
    });

    return {
      avg_risk_score: 100,
      total_reviews: 0,
      trend: 'stable',
      recent_avg_risk_score: 100,
      previous_avg_risk_score: 100,
      total_majors_all_time: 0,
      total_minors_all_time: 0,
      total_suggestions_all_time: 0,
      trend_data: [],
    };
  }
}
