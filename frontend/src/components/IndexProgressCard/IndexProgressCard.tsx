/**
 * IndexProgressCard — Beautiful progress card for repository indexing.
 *
 * Features:
 * - Animated progress bar with gradient
 * - Status indicator (idle/indexing/completed/failed)
 * - File counts and percentage
 * - Estimated time remaining
 * - 3-second polling during indexing
 * - Smooth transitions between states
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { getRepoIndexStatus, triggerRepoIndexing, type RepoIndexStatus } from '../../services/api';

interface IndexProgressCardProps {
  projectId: number;
  gitlabBaseUrl: string;
  branch?: string;
  className?: string;
}

const POLL_INTERVAL = 3000;

const statusConfig = {
  not_indexed: { badge: 'neutral' as const, label: 'Not Indexed', icon: '\u25CB' },
  idle: { badge: 'neutral' as const, label: 'Ready', icon: '\u25CB' },
  indexing: { badge: 'info' as const, label: 'Indexing', icon: '\u21BB' },
  completed: { badge: 'success' as const, label: 'Indexed', icon: '\u2713' },
  failed: { badge: 'error' as const, label: 'Failed', icon: '\u2717' },
};

export function IndexProgressCard({ projectId, gitlabBaseUrl, branch, className }: IndexProgressCardProps) {
  const [status, setStatus] = useState<RepoIndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getRepoIndexStatus(projectId, gitlabBaseUrl);
      setStatus(res.data);
      setError('');
    } catch {
      // Not indexed yet — that's fine
      setStatus(null);
    }
  }, [projectId, gitlabBaseUrl]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchStatus().finally(() => setLoading(false));
  }, [fetchStatus]);

  // Poll during indexing
  useEffect(() => {
    if (status?.indexing_status === 'indexing') {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      pollRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    } else {
      startTimeRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status?.indexing_status, fetchStatus]);

  const isCompleted = status?.indexing_status === 'completed';

  const handleTrigger = async () => {
    setTriggering(true);
    setError('');
    try {
      // Force full re-index when user explicitly clicks "Re-index"
      await triggerRepoIndexing(projectId, branch || 'main', isCompleted);
      // Start polling
      setTimeout(fetchStatus, 1000);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to trigger indexing'
      );
    } finally {
      setTriggering(false);
    }
  };

  // Estimate remaining time
  const estimateRemaining = (): string | null => {
    if (!status || !startTimeRef.current || status.processed_files === 0) return null;
    const elapsed = Date.now() - startTimeRef.current;
    const rate = status.processed_files / elapsed;
    const remaining = (status.total_files - status.processed_files) / rate;
    if (remaining < 1000) return 'Almost done';
    if (remaining < 60000) return `~${Math.ceil(remaining / 1000)}s remaining`;
    return `~${Math.ceil(remaining / 60000)}m remaining`;
  };

  if (loading) {
    return (
      <div className={clsx('bg-surface rounded-2xl border border-border p-5', className)}>
        <div className="shimmer h-4 w-1/3 mb-3" />
        <div className="shimmer h-2 w-full mb-2" />
        <div className="shimmer h-3 w-1/4" />
      </div>
    );
  }

  const isIndexing = status?.indexing_status === 'indexing';
  const isFailed = status?.indexing_status === 'failed';
  const canTrigger = !isIndexing;
  const config = statusConfig[status?.indexing_status || 'not_indexed'];
  const progress = status?.progress_percentage ?? 0;

  return (
    <motion.div
      layout
      className={clsx(
        'bg-surface rounded-2xl border border-border p-5 transition-shadow duration-200',
        isIndexing && 'shadow-card',
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-txt-primary">Repository Index</span>
          <Badge variant={config.badge} dot>{config.label}</Badge>
        </div>
        {canTrigger && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTrigger}
            loading={triggering}
          >
            {isCompleted ? 'Re-index' : 'Index Repository'}
          </Button>
        )}
      </div>

      {/* Progress bar — only during indexing */}
      <AnimatePresence>
        {isIndexing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3"
          >
            <div className="w-full h-1.5 bg-surface-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-accent to-blue-400 animate-progress-pulse"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(progress, 2)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-caption text-txt-tertiary">
              <span>
                {status?.processed_files ?? 0} / {status?.total_files ?? 0} files
                {status?.failed_files ? ` (${status.failed_files} failed)` : ''}
              </span>
              <span>{estimateRemaining() || `${progress}%`}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completed info */}
      {isCompleted && status?.completed_at && (
        <p className="text-caption text-txt-tertiary">
          {status.processed_files} files indexed
          {status.failed_files ? ` (${status.failed_files} failed)` : ''}
          {' \u00B7 '}
          Last indexed {new Date(status.completed_at).toLocaleDateString()}
        </p>
      )}

      {/* Failed state */}
      {isFailed && (
        <p className="text-caption text-severity-major">
          {status?.error_message || 'Indexing failed. Try again.'}
        </p>
      )}

      {/* Error from trigger */}
      {error && (
        <p className="text-caption text-severity-major mt-2">{error}</p>
      )}
    </motion.div>
  );
}
