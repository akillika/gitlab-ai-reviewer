/**
 * aiGateService.ts — Pre-merge AI gate (advisory).
 *
 * Evaluates MR quality against configurable thresholds stored in `repo_settings`.
 * NOTE: This gate is advisory — it reports status to the frontend but does NOT
 * enforce merge blocking via the GitLab API. To enforce blocking, integrate
 * with GitLab's external approval rules or pipeline status checks.
 *
 * Checks:
 * 1. block_on_major: Flags MRs with ≥1 major severity comment.
 * 2. min_risk_score: Flags MRs with risk score below this threshold.
 *    (Higher risk score = safer. E.g., min_risk_score=50 means flag if score < 50.)
 *
 * Gate status:
 * - "pass"    — All checks passed, safe to merge.
 * - "fail"    — One or more checks failed (advisory — does not block merge in GitLab).
 * - "warn"    — No blocking rules configured, but risk indicators detected.
 * - "no_gate" — No repo settings configured (gate not enabled).
 */

import { query } from '../utils/db';
import { RiskSummary } from './riskCalculator';
import { logger } from '../utils/logger';

// --- Types ---

export interface RepoSettings {
  id: number;
  repo_id: string;
  block_on_major: boolean;
  max_allowed_risk_score: number;
  auto_post_comments: boolean;
  created_at: string;
  updated_at: string;
}

export interface GateResult {
  /** Overall gate status */
  gate_status: 'pass' | 'fail' | 'warn' | 'no_gate';
  /** Human-readable reason for the status */
  reason: string;
  /** Individual check results */
  checks: GateCheck[];
  /** Whether auto-post is enabled */
  auto_post: boolean;
}

export interface GateCheck {
  name: string;
  passed: boolean;
  message: string;
}

// --- DB operations ---

/**
 * Get repo settings. Returns null if not configured.
 */
export async function getRepoSettings(repoId: string): Promise<RepoSettings | null> {
  const result = await query<RepoSettings & { [key: string]: unknown }>(
    'SELECT * FROM repo_settings WHERE repo_id = $1',
    [repoId]
  );
  return result.rows[0] || null;
}

/**
 * Create or update repo settings.
 */
export async function upsertRepoSettings(
  repoId: string,
  settings: {
    blockOnMajor?: boolean;
    maxAllowedRiskScore?: number;
    autoPostComments?: boolean;
  }
): Promise<RepoSettings> {
  const result = await query<RepoSettings & { [key: string]: unknown }>(
    `INSERT INTO repo_settings (repo_id, block_on_major, max_allowed_risk_score, auto_post_comments)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (repo_id) DO UPDATE SET
       block_on_major = COALESCE($2, repo_settings.block_on_major),
       max_allowed_risk_score = COALESCE($3, repo_settings.max_allowed_risk_score),
       auto_post_comments = COALESCE($4, repo_settings.auto_post_comments),
       updated_at = NOW()
     RETURNING *`,
    [
      repoId,
      settings.blockOnMajor ?? false,
      settings.maxAllowedRiskScore ?? 0,
      settings.autoPostComments ?? false,
    ]
  );
  return result.rows[0];
}

// --- Gate evaluation ---

/**
 * Evaluate the pre-merge AI gate for a review.
 *
 * @param repoId   The repo UUID (may be null if repo not indexed).
 * @param summary  The computed risk summary from the review.
 * @returns Gate result with status and check details.
 */
export async function evaluateGate(
  repoId: string | null,
  summary: RiskSummary
): Promise<GateResult> {
  // No repo = no gate
  if (!repoId) {
    return {
      gate_status: 'no_gate',
      reason: 'Repository not indexed. AI gate not available.',
      checks: [],
      auto_post: false,
    };
  }

  try {
    const settings = await getRepoSettings(repoId);

    // No settings = no gate configured
    if (!settings) {
      // Still provide advisory warnings
      return buildAdvisoryResult(summary);
    }

    const checks: GateCheck[] = [];
    let hasFailed = false;

    // Check 1: Block on major
    if (settings.block_on_major) {
      const passed = summary.total_major === 0;
      checks.push({
        name: 'No Major Issues',
        passed,
        message: passed
          ? 'No major severity issues found.'
          : `${summary.total_major} major issue${summary.total_major > 1 ? 's' : ''} found. Resolve before merging.`,
      });
      if (!passed) hasFailed = true;
    }

    // Check 2: Minimum risk score threshold
    // Risk score is 0-100 where 100 = no issues, 0 = critical.
    // If min threshold is 50, MRs scoring below 50 are flagged.
    if (settings.max_allowed_risk_score > 0) {
      const minScore = settings.max_allowed_risk_score;
      const passed = summary.overall_risk_score >= minScore;
      checks.push({
        name: 'Minimum Risk Score',
        passed,
        message: passed
          ? `Risk score ${summary.overall_risk_score}/100 meets minimum threshold of ${minScore}.`
          : `Risk score ${summary.overall_risk_score}/100 is below minimum threshold of ${minScore}. Higher score = safer.`,
      });
      if (!passed) hasFailed = true;
    }

    // If no checks were configured (both settings are default), provide advisory
    if (checks.length === 0) {
      return buildAdvisoryResult(summary);
    }

    const failedChecks = checks.filter((c) => !c.passed);

    return {
      gate_status: hasFailed ? 'fail' : 'pass',
      reason: hasFailed
        ? `${failedChecks.length} gate check${failedChecks.length > 1 ? 's' : ''} failed.`
        : 'All gate checks passed.',
      checks,
      auto_post: settings.auto_post_comments,
    };
  } catch (error) {
    logger.warn('Gate evaluation failed (non-critical)', {
      error: (error as Error).message,
    });

    return {
      gate_status: 'no_gate',
      reason: 'Gate evaluation failed. Proceeding without gate check.',
      checks: [],
      auto_post: false,
    };
  }
}

/**
 * Build advisory-only result when no gate rules are configured.
 * Provides warnings for high-risk MRs but never blocks.
 */
function buildAdvisoryResult(summary: RiskSummary): GateResult {
  const warnings: string[] = [];

  if (summary.total_major > 0) {
    warnings.push(`${summary.total_major} major issue${summary.total_major > 1 ? 's' : ''}`);
  }
  if (summary.overall_risk_score < 50) {
    warnings.push(`risk score ${summary.overall_risk_score}/100`);
  }

  if (warnings.length > 0) {
    return {
      gate_status: 'warn',
      reason: `Advisory: ${warnings.join(', ')}. Consider configuring gate rules.`,
      checks: [],
      auto_post: false,
    };
  }

  return {
    gate_status: 'pass',
    reason: 'No gate rules configured. Review looks healthy.',
    checks: [],
    auto_post: false,
  };
}
