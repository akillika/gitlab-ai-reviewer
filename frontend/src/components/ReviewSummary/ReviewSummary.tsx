/**
 * ReviewSummary — Top bar showing review stats at a glance.
 * Displays risk score badge, severity counts, total/unposted, and actions.
 */
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { GateBadge } from '../GateBadge/GateBadge';
import type { ReviewComment, RiskSummary, GateResult } from '../../services/api';

interface ReviewSummaryProps {
  comments: ReviewComment[];
  mrTitle: string;
  projectPath: string;
  mrIid: number;
  onPostAll: () => void;
  postingAll: boolean;
  hasDiffRefs: boolean;
  riskSummary?: RiskSummary | null;
  gateResult?: GateResult | null;
  projectId?: number;
  className?: string;
}

function getRiskBadge(score: number): { color: string; bg: string; label: string } {
  if (score >= 80) return { color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40', label: 'Low Risk' };
  if (score >= 50) return { color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40', label: 'Medium' };
  return { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40', label: 'High Risk' };
}

export function ReviewSummary({
  comments,
  mrTitle,
  projectPath,
  mrIid,
  onPostAll,
  postingAll,
  hasDiffRefs,
  riskSummary,
  gateResult,
  projectId,
  className,
}: ReviewSummaryProps) {
  const navigate = useNavigate();
  const major = comments.filter((c) => c.severity === 'major').length;
  const minor = comments.filter((c) => c.severity === 'minor').length;
  const suggestion = comments.filter((c) => c.severity === 'suggestion').length;
  const unposted = comments.filter((c) => !c.posted).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'bg-surface border-b border-border px-5 py-3 flex items-center gap-6',
        className
      )}
    >
      {/* MR Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold text-txt-primary truncate">
            {projectPath}!{mrIid}
          </span>
          {/* Risk score badge — inline in the summary bar */}
          {riskSummary && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold',
                getRiskBadge(riskSummary.overall_risk_score).bg,
                getRiskBadge(riskSummary.overall_risk_score).color
              )}
            >
              {riskSummary.overall_risk_score}
              <span className="font-normal">
                {getRiskBadge(riskSummary.overall_risk_score).label}
              </span>
            </span>
          )}
          {/* Gate status badge */}
          {gateResult && gateResult.gate_status !== 'no_gate' && (
            <GateBadge gate={gateResult} />
          )}
        </div>
        <p className="text-body-sm text-txt-secondary truncate">{mrTitle}</p>
      </div>

      {/* Severity pills */}
      <div className="flex items-center gap-3">
        <StatPill color="bg-severity-major" count={major} label="Major" />
        <StatPill color="bg-severity-minor" count={minor} label="Minor" />
        <StatPill color="bg-severity-suggestion" count={suggestion} label="Suggestion" />

        <div className="w-px h-5 bg-border mx-1" />

        <span className="text-body-sm text-txt-tertiary whitespace-nowrap">
          {comments.length} total &middot; {unposted} unposted
        </span>
      </div>

      {/* Health dashboard link */}
      {projectId && (
        <button
          onClick={() => navigate(`/health?projectId=${projectId}`)}
          className="text-caption text-accent hover:underline whitespace-nowrap"
          title="View code health trends"
        >
          Health Trends
        </button>
      )}

      {/* Post All button */}
      {unposted > 0 && hasDiffRefs && (
        <Button
          variant="primary"
          size="md"
          onClick={onPostAll}
          loading={postingAll}
        >
          Post All ({unposted})
        </Button>
      )}
    </motion.div>
  );
}

function StatPill({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx('w-2.5 h-2.5 rounded-full', color)} />
      <span className="text-body-sm font-medium text-txt-primary">{count}</span>
      <span className="text-caption text-txt-tertiary">{label}</span>
    </div>
  );
}
