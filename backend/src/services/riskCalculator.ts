/**
 * riskCalculator.ts — Computes a risk summary from AI review comments.
 *
 * Scoring logic uses exponential decay so that:
 * - Each major issue has significant impact (25 points of penalty equivalent)
 * - Each minor issue has moderate impact (8 points)
 * - Each suggestion has small impact (2 points)
 * - The score always differentiates between different issue counts
 *   (no clamping that destroys information)
 *
 * Formula: score = 100 * e^(-weightedScore / DECAY_CONSTANT)
 * This maps any positive weighted score to (0, 100] with smooth decay.
 * A score of 100 means no issues; approaching 0 means critical problems.
 */

import { AIReviewComment } from '../ai/types';

export interface RiskSummary {
  total_major: number;
  total_minor: number;
  total_suggestion: number;
  overall_risk_score: number;
  /** Raw weighted score before decay — useful for comparing reviews */
  weighted_score: number;
}

const SEVERITY_WEIGHTS = {
  major: 25,
  minor: 8,
  suggestion: 2,
} as const;

/**
 * Decay constant controls how fast the score drops.
 * At weighted_score = DECAY_CONSTANT, score ≈ 37.
 * At weighted_score = 2 * DECAY_CONSTANT, score ≈ 14.
 *
 * With DECAY_CONSTANT = 50:
 *   1 major (25pts) → score 61
 *   2 majors (50pts) → score 37
 *   3 majors (75pts) → score 22
 *   5 minors (40pts) → score 45
 *   10 suggestions (20pts) → score 67
 *   1 major + 3 minor + 5 suggestion (25+24+10=59pts) → score 31
 */
const DECAY_CONSTANT = 50;

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

  // Exponential decay: always differentiates between different issue profiles.
  // No clamping — 15 majors (375pts) → score 1, 20 majors (500pts) → score 0.005.
  const overallRiskScore = weightedScore === 0
    ? 100
    : Math.round(100 * Math.exp(-weightedScore / DECAY_CONSTANT));

  return {
    total_major: totalMajor,
    total_minor: totalMinor,
    total_suggestion: totalSuggestion,
    overall_risk_score: overallRiskScore,
    weighted_score: weightedScore,
  };
}
