/**
 * Shimmer — Beautiful loading skeletons for content placeholders.
 * Mimics Linear/Notion style loading.
 */
import clsx from 'clsx';

interface ShimmerProps {
  className?: string;
  lines?: number;
}

/** Single shimmer block */
export function Shimmer({ className }: { className?: string }) {
  return <div className={clsx('shimmer', className)} />;
}

/** Multi-line text shimmer */
export function ShimmerText({ lines = 3, className }: ShimmerProps) {
  return (
    <div className={clsx('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="shimmer h-4"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

/** Card shimmer skeleton */
export function ShimmerCard({ className }: { className?: string }) {
  return (
    <div className={clsx('bg-surface rounded-2xl border border-border p-5 space-y-4', className)}>
      <div className="flex items-center gap-3">
        <div className="shimmer w-10 h-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <div className="shimmer h-4 w-1/3" />
          <div className="shimmer h-3 w-1/4" />
        </div>
      </div>
      <ShimmerText lines={2} />
    </div>
  );
}

/** Diff line shimmer */
export function ShimmerDiff({ lines = 12 }: { lines?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex gap-0">
          <div className="shimmer h-5 w-12 rounded-none" />
          <div className="shimmer h-5 flex-1 rounded-none ml-px" style={{ width: `${50 + Math.random() * 50}%` }} />
        </div>
      ))}
    </div>
  );
}
