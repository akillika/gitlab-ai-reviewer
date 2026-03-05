/**
 * HealthDashboardPage — Code health trends dashboard.
 *
 * Shows:
 * - Overall health stats (avg risk score, total reviews, trend)
 * - Risk score trend chart (SVG line chart)
 * - Severity distribution over time
 * - Cumulative severity counters
 *
 * Accessed via /health?projectId=X from the review page or dashboard.
 * Uses simple SVG charts — no charting library needed.
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { getProjectHealth, type HealthSummary, type HealthTrendPoint } from '../services/api';

export function HealthDashboardPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = parseInt(searchParams.get('projectId') || '', 10);

  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNaN(projectId)) {
      setError('Invalid project ID');
      setLoading(false);
      return;
    }

    getProjectHealth(projectId)
      .then((res) => setHealth(res.data))
      .catch((err) => {
        setError(
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            'Failed to load health data'
        );
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-8">
        <div className="flex items-center gap-3 text-txt-secondary">
          <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          Loading health data&hellip;
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-8">
        <div className="bg-severity-major-bg border border-severity-major-border px-4 py-3 rounded-xl text-body-sm text-severity-major">
          {error || 'No health data available'}
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 text-body-sm text-accent hover:underline"
        >
          &larr; Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title text-txt-primary dark:text-txt-dark-primary">
            Code Health Trends
          </h1>
          <p className="text-body-sm text-txt-secondary mt-1">
            Project #{projectId} &middot; {health.total_reviews} review{health.total_reviews !== 1 ? 's' : ''} analyzed
          </p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-body-sm text-accent hover:underline"
        >
          &larr; Dashboard
        </button>
      </div>

      {/* Stats cards row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Avg Risk Score"
          value={health.avg_risk_score}
          suffix="/100"
          color={health.avg_risk_score >= 80 ? 'green' : health.avg_risk_score >= 50 ? 'amber' : 'red'}
        />
        <StatCard
          label="Trend"
          value={health.trend === 'improving' ? '\u2191' : health.trend === 'degrading' ? '\u2193' : '\u2192'}
          suffix={health.trend}
          color={health.trend === 'improving' ? 'green' : health.trend === 'degrading' ? 'red' : 'gray'}
        />
        <StatCard
          label="Total Majors"
          value={health.total_majors_all_time}
          color="red"
        />
        <StatCard
          label="Total Reviews"
          value={health.total_reviews}
          color="blue"
        />
      </div>

      {/* Risk Score Trend Chart */}
      {health.trend_data.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5"
        >
          <h2 className="text-section text-txt-primary dark:text-txt-dark-primary mb-4">
            Risk Score Over Time
          </h2>
          <RiskScoreChart data={health.trend_data} />
        </motion.div>
      )}

      {/* Severity Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5"
      >
        <h2 className="text-section text-txt-primary dark:text-txt-dark-primary mb-4">
          Severity Distribution
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <SeverityBar
            label="Major"
            count={health.total_majors_all_time}
            total={health.total_majors_all_time + health.total_minors_all_time + health.total_suggestions_all_time}
            color="bg-severity-major"
          />
          <SeverityBar
            label="Minor"
            count={health.total_minors_all_time}
            total={health.total_majors_all_time + health.total_minors_all_time + health.total_suggestions_all_time}
            color="bg-severity-minor"
          />
          <SeverityBar
            label="Suggestion"
            count={health.total_suggestions_all_time}
            total={health.total_majors_all_time + health.total_minors_all_time + health.total_suggestions_all_time}
            color="bg-severity-suggestion"
          />
        </div>
      </motion.div>

      {/* Recent Review History */}
      {health.trend_data.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5"
        >
          <h2 className="text-section text-txt-primary dark:text-txt-dark-primary mb-4">
            Review History
          </h2>
          <div className="space-y-2">
            {health.trend_data.slice().reverse().slice(0, 20).map((point) => (
              <div
                key={point.review_id}
                className="flex items-center justify-between py-2 border-b border-border-light last:border-0"
              >
                <div className="flex items-center gap-3">
                  <RiskScorePill score={point.risk_score} />
                  <span className="text-body-sm text-txt-primary">
                    MR !{point.mr_iid}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-caption text-txt-tertiary">
                  <span>{point.total_major}M / {point.total_minor}m / {point.total_suggestion}s</span>
                  <span>{new Date(point.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  color: 'green' | 'amber' | 'red' | 'blue' | 'gray';
}) {
  const colorMap = {
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
    gray: 'text-gray-600 dark:text-gray-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-surface dark:bg-surface-dark-secondary rounded-xl border border-border dark:border-border-dark p-4 text-center"
    >
      <div className={clsx('text-2xl font-bold', colorMap[color])}>
        {value}
        {suffix && <span className="text-body-sm font-normal text-txt-tertiary ml-1">{suffix}</span>}
      </div>
      <div className="text-caption text-txt-tertiary mt-1">{label}</div>
    </motion.div>
  );
}

function RiskScorePill({ score }: { score: number }) {
  const color = score >= 80
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : score >= 50
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-caption font-semibold', color)}>
      {score}
    </span>
  );
}

function SeverityBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-caption font-medium text-txt-primary">{label}</span>
        <span className="text-caption text-txt-tertiary">{count} ({pct}%)</span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={clsx('h-full rounded-full', color)}
        />
      </div>
    </div>
  );
}

function RiskScoreChart({ data }: { data: HealthTrendPoint[] }) {
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const points = useMemo(() => {
    if (data.length === 0) return [];
    return data.map((d, i) => ({
      x: padding.left + (i / Math.max(data.length - 1, 1)) * innerWidth,
      y: padding.top + innerHeight - (d.risk_score / 100) * innerHeight,
      score: d.risk_score,
      mrIid: d.mr_iid,
      date: new Date(d.created_at).toLocaleDateString(),
    }));
  }, [data, innerWidth, innerHeight, padding.left, padding.top]);

  if (points.length < 2) return null;

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Area path (fill under the line)
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((tick) => {
        const y = padding.top + innerHeight - (tick / 100) * innerHeight;
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={y}
              x2={chartWidth - padding.right}
              y2={y}
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-400 dark:fill-gray-500"
              fontSize={10}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Risk zones background */}
      <rect
        x={padding.left}
        y={padding.top}
        width={innerWidth}
        height={innerHeight * 0.2}
        className="fill-green-50/50 dark:fill-green-900/10"
      />
      <rect
        x={padding.left}
        y={padding.top + innerHeight * 0.2}
        width={innerWidth}
        height={innerHeight * 0.3}
        className="fill-amber-50/50 dark:fill-amber-900/10"
      />
      <rect
        x={padding.left}
        y={padding.top + innerHeight * 0.5}
        width={innerWidth}
        height={innerHeight * 0.5}
        className="fill-red-50/50 dark:fill-red-900/10"
      />

      {/* Area fill */}
      <path d={areaPath} className="fill-accent/10" />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-accent"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={3}
            className="fill-accent stroke-white dark:stroke-gray-900"
            strokeWidth={1.5}
          />
          {/* Show score label for first, last, and every 5th point */}
          {(i === 0 || i === points.length - 1 || i % 5 === 0) && (
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              className="fill-accent"
              fontSize={9}
              fontWeight={600}
            >
              {p.score}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
