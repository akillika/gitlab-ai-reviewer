/**
 * Badge — Severity-colored pill badges and status indicators.
 * Clean, readable, minimal weight.
 */
import clsx from 'clsx';

type SeverityVariant = 'major' | 'minor' | 'suggestion';
type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  variant?: SeverityVariant | StatusVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const severityStyles: Record<SeverityVariant, string> = {
  major: 'bg-severity-major-bg text-severity-major border-severity-major-border',
  minor: 'bg-severity-minor-bg text-severity-minor border-severity-minor-border',
  suggestion: 'bg-severity-suggestion-bg text-severity-suggestion border-severity-suggestion-border',
};

const statusStyles: Record<StatusVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-surface-secondary text-txt-secondary border-border',
};

const dotColors: Record<string, string> = {
  major: 'bg-severity-major',
  minor: 'bg-severity-minor',
  suggestion: 'bg-severity-suggestion',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-txt-tertiary',
};

const allStyles: Record<string, string> = { ...severityStyles, ...statusStyles };

export function Badge({ variant = 'neutral', children, dot, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-caption font-medium rounded-md border',
        allStyles[variant],
        className
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}

/** Standalone dot indicator — for file tree severity indicators */
export function SeverityDot({ severity, className }: { severity: SeverityVariant; className?: string }) {
  return (
    <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotColors[severity], className)} />
  );
}
