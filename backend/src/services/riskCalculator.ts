/**
 * riskCalculator.ts — Computes a risk summary from AI review comments.
 *
 * Scoring logic:
 * - major  = 10 points of issue weight
 * - minor  = 4  points
 * - suggestion = 1 point
 *
 * overall_risk_score = max(0, 100 - weighted_issue_score) capped at [0, 100].
 * A score of 100 means no issues; a score of 0 means critical problems.
 */

import { AIReviewComment } from '../ai/types';

export interface RiskSummary {
  total_major: number;
  total_minor: number;
  total_suggestion: number;
  overall_risk_score: number;
}

const SEVERITY_WEIGHTS = {
  major: 10,
  minor: 4,
  suggestion: 1,
} as const;

/**
 * Computes a risk summary from a list of review comments.
 * Pure function — no side effects, no I/O.
 */
export function computeRiskSummary(comments: AIReviewComment[]): RiskSummary {
  let totalMajor = 0;
  let totalMinor = 0;
  let totalSuggestion = 0;

  for (const comment of comments) {
    switch (comment.severity) {
      case 'major':
        totalMajor++;
        break;
      case 'minor':
        totalMinor++;
        break;
      case 'suggestion':
        totalSuggestion++;
        break;
    }
  }

  const weightedScore =
    totalMajor * SEVERITY_WEIGHTS.major +
    totalMinor * SEVERITY_WEIGHTS.minor +
    totalSuggestion * SEVERITY_WEIGHTS.suggestion;

  // Clamp to [0, 100]
  const overallRiskScore = Math.max(0, 100 - Math.min(weightedScore, 100));

  return {
    total_major: totalMajor,
    total_minor: totalMinor,
    total_suggestion: totalSuggestion,
    overall_risk_score: overallRiskScore,
  };
}
