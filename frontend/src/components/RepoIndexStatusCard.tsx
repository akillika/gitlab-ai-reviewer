import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getRepoIndexStatus,
  triggerRepoIndexing,
  type RepoIndexStatus,
} from '../services/api';

interface RepoIndexStatusCardProps {
  projectId: number;
  gitlabBaseUrl: string;
  branch?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  not_indexed: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
  idle: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
  indexing: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

const STATUS_LABELS: Record<string, string> = {
  not_indexed: 'Not Indexed',
  idle: 'Idle',
  indexing: 'Indexing...',
  completed: 'Indexed',
  failed: 'Failed',
};

export function RepoIndexStatusCard({ projectId, gitlabBaseUrl, branch }: RepoIndexStatusCardProps) {
  const [status, setStatus] = useState<RepoIndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getRepoIndexStatus(projectId, gitlabBaseUrl);
      setStatus(res.data);
      setError('');
      return res.data.indexing_status;
    } catch {
      setError('Failed to fetch index status');
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId, gitlabBaseUrl]);

  // Initial fetch + polling
  useEffect(() => {
    fetchStatus().then((currentStatus) => {
      // Start polling if indexing
      if (currentStatus === 'indexing') {
        startPolling();
      }
    });

    return () => stopPolling();
  }, [fetchStatus]);

  const startPolling = () => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      const currentStatus = await fetchStatus();
      if (currentStatus && currentStatus !== 'indexing') {
        stopPolling();
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleTriggerIndex = async () => {
    if (!branch) return;
    setTriggering(true);
    setError('');
    try {
      await triggerRepoIndexing(projectId, gitlabBaseUrl, branch);
      // Start polling for updates
      await fetchStatus();
      startPolling();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to trigger indexing'
      );
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Loading index status...
        </div>
      </div>
    );
  }

  if (!status) return null;

  const colors = STATUS_COLORS[status.indexing_status] || STATUS_COLORS.idle;
  const label = STATUS_LABELS[status.indexing_status] || status.indexing_status;
  const showProgress = status.indexing_status === 'indexing' && status.total_files > 0;
  const canTrigger =
    branch &&
    ['not_indexed', 'completed', 'failed', 'idle'].includes(status.indexing_status);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-700">Codebase Index</h3>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
          >
            <span className={`w-2 h-2 rounded-full ${colors.dot} ${status.indexing_status === 'indexing' ? 'animate-pulse' : ''}`} />
            {label}
          </span>
        </div>

        {canTrigger && (
          <button
            onClick={handleTriggerIndex}
            disabled={triggering}
            className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors border border-indigo-200"
          >
            {triggering
              ? 'Starting...'
              : status.indexing_status === 'not_indexed'
                ? 'Index Repository'
                : 'Re-index'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>
              {status.processed_files} / {status.total_files} files
            </span>
            <span>{status.progress_percentage}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${status.progress_percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Completed info */}
      {status.indexing_status === 'completed' && (
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          <span>{status.processed_files} files indexed</span>
          {status.failed_files > 0 && (
            <span className="text-amber-600">{status.failed_files} failed</span>
          )}
          {status.completed_at && (
            <span>Completed {new Date(status.completed_at).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Failed info */}
      {status.indexing_status === 'failed' && status.error_message && (
        <div className="mt-2 text-xs text-red-600">
          Error: {status.error_message}
        </div>
      )}

      {/* Indexing failed files count */}
      {status.indexing_status === 'indexing' && status.failed_files > 0 && (
        <div className="mt-1 text-xs text-amber-600">
          {status.failed_files} files failed
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-600">{error}</div>
      )}
    </div>
  );
}
