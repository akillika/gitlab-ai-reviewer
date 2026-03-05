interface SeverityBadgeProps {
  severity: 'major' | 'minor' | 'suggestion';
}

const SEVERITY_STYLES = {
  major: 'bg-red-100 text-red-800 border-red-200',
  minor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  suggestion: 'bg-blue-100 text-blue-800 border-blue-200',
} as const;

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_STYLES[severity]}`}
    >
      {severity.toUpperCase()}
    </span>
  );
}
