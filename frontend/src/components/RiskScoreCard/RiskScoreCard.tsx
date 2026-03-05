/**
 * RiskScoreCard — Displays the overall risk score with a color-coded indicator.
 *
 * Score ranges:
 * - 80-100: Green  (Low risk / healthy)
 * - 50-79:  Yellow (Medium risk / needs attention)
 * - 0-49:   Red    (High risk / critical issues)
 *
 * Shows the numeric score in a circular gauge, with severity breakdown below.
 */
import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { RiskSummary } from '../../services/api';

interface RiskScoreCardProps {
  summary: RiskSummary;
  className?: string;
}

function getScoreColor(score: number): { text: string; bg: string; ring: string; label: string } {
  if (score >= 80) {
    return {
      text: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/30',
      ring: 'stroke-green-500',
      label: 'Low Risk',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      ring: 'stroke-amber-500',
      label: 'Medium Risk',
    };
  }
  return {
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
    ring: 'stroke-red-500',
    label: 'High Risk',
  };
}

export function RiskScoreCard({ summary, className }: RiskScoreCardProps) {
  const { text, bg, ring, label } = getScoreColor(summary.overall_risk_score);

  // SVG circle gauge parameters
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = (summary.overall_risk_score / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'flex items-center gap-4 px-4 py-3 rounded-xl border border-border',
        bg,
        className
      )}
    >
      {/* Circular gauge */}
      <div className="relative w-16 h-16 flex-shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          {/* Background circle */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="4"
            className="stroke-current text-gray-200 dark:text-gray-700"
          />
          {/* Progress arc */}
          <motion.circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className={ring}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={clsx('text-lg font-bold', text)}>
            {summary.overall_risk_score}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('text-body font-semibold', text)}>{label}</span>
        </div>
        <div className="flex items-center gap-3 text-caption text-txt-secondary">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-major inline-block" />
            {summary.total_major} major
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-minor inline-block" />
            {summary.total_minor} minor
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-suggestion inline-block" />
            {summary.total_suggestion} suggestion
          </span>
        </div>
      </div>
    </motion.div>
  );
}
