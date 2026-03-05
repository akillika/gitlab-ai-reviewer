/**
 * DashboardPage — Repository dashboard with MR input and review history.
 *
 * Apple-style clean layout:
 * - MR URL input with fetch/review actions
 * - MR details preview card
 * - Repository index status
 * - Past reviews list
 * - Shimmer loading states
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ShimmerCard } from '../components/ui/Shimmer';
import { IndexProgressCard } from '../components/IndexProgressCard/IndexProgressCard';
import {
  fetchMR,
  runReview,
  getReviews,
  type MergeRequestData,
  type ReviewData,
  type ReviewListItem,
} from '../services/api';
import { useToast } from '../components/Toast/Toast';

function extractGitlabBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [mrUrl, setMrUrl] = useState('');
  const [mrData, setMrData] = useState<MergeRequestData | null>(null);
  const [fetchingMr, setFetchingMr] = useState(false);
  const [runningReview, setRunningReview] = useState(false);
  const [error, setError] = useState('');
  const [pastReviews, setPastReviews] = useState<ReviewListItem[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    getReviews()
      .then((res) => setPastReviews(res.data.reviews))
      .catch(() => {})
      .finally(() => setLoadingReviews(false));
  }, []);

  const handleFetchMr = async () => {
    if (!mrUrl.trim()) return;
    setFetchingMr(true);
    setError('');
    setMrData(null);
    try {
      const res = await fetchMR(mrUrl.trim());
      setMrData(res.data);
      addToast('success', 'Merge request loaded');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to fetch merge request';
      setError(msg);
    } finally {
      setFetchingMr(false);
    }
  };

  const handleRunReview = async () => {
    if (!mrUrl.trim()) return;
    setRunningReview(true);
    setError('');
    try {
      const res = await runReview(mrUrl.trim());
      const reviewData: ReviewData = res.data;
      addToast('success', `Review complete \u2014 ${reviewData.comments.length} comments`);
      navigate(`/review/${reviewData.reviewId}`, {
        state: { reviewData, mrData },
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to run AI review';
      setError(msg);
      addToast('error', msg);
    } finally {
      setRunningReview(false);
    }
  };

  const gitlabBaseUrl = useMemo(() => extractGitlabBaseUrl(mrUrl), [mrUrl]);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-title text-txt-primary dark:text-txt-dark-primary">Dashboard</h1>
        <p className="text-body-sm text-txt-secondary mt-1">
          Paste a GitLab merge request URL to start reviewing.
        </p>
      </div>

      {/* MR Input Card */}
      <div className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5">
        <label className="block text-body-sm font-medium text-txt-primary dark:text-txt-dark-primary mb-2">
          Merge Request URL
        </label>
        <div className="flex gap-2.5">
          <input
            type="text"
            value={mrUrl}
            onChange={(e) => setMrUrl(e.target.value)}
            placeholder="https://gitlab.company.com/group/project/-/merge_requests/123"
            className="flex-1 px-3.5 py-2.5 text-body-sm bg-surface-secondary dark:bg-surface-dark-tertiary border border-border dark:border-border-dark rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-txt-tertiary font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleFetchMr()}
          />
          <Button
            variant="secondary"
            onClick={handleFetchMr}
            loading={fetchingMr}
            disabled={!mrUrl.trim()}
          >
            Fetch
          </Button>
          <Button
            variant="primary"
            onClick={handleRunReview}
            loading={runningReview}
            disabled={!mrUrl.trim()}
          >
            {runningReview ? 'Reviewing\u2026' : 'Run AI Review'}
          </Button>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3"
            >
              <p className="text-body-sm text-severity-major bg-severity-major-bg border border-severity-major-border px-3 py-2 rounded-xl">
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        <AnimatePresence>
          {runningReview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-center gap-3 text-body-sm text-txt-secondary"
            >
              <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              AI is reviewing your merge request. This may take a minute\u2026
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MR Details Preview */}
      <AnimatePresence>
        {mrData && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-section text-txt-primary dark:text-txt-dark-primary">
                  !{mrData.mergeRequest.iid}: {mrData.mergeRequest.title}
                </h3>
                <p className="text-body-sm text-txt-secondary mt-0.5">
                  {mrData.projectPath}
                </p>
              </div>
              <Badge
                variant={
                  mrData.mergeRequest.state === 'opened'
                    ? 'success'
                    : mrData.mergeRequest.state === 'merged'
                      ? 'info'
                      : 'error'
                }
              >
                {mrData.mergeRequest.state}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <InfoRow label="Source">
                <code className="text-code bg-surface-secondary dark:bg-surface-dark-tertiary px-2 py-0.5 rounded-md">
                  {mrData.mergeRequest.sourceBranch}
                </code>
              </InfoRow>
              <InfoRow label="Target">
                <code className="text-code bg-surface-secondary dark:bg-surface-dark-tertiary px-2 py-0.5 rounded-md">
                  {mrData.mergeRequest.targetBranch}
                </code>
              </InfoRow>
              <InfoRow label="Author">
                <span className="font-medium">{mrData.mergeRequest.author.name}</span>
              </InfoRow>
              <InfoRow label="Changed Files">
                <span className="font-medium">{mrData.changes.length}</span>
              </InfoRow>
            </div>

            {/* Changed files list */}
            {mrData.changes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {mrData.changes.map((change, i) => (
                    <div key={i} className="flex items-center gap-2 text-caption">
                      <FileChangeBadge change={change} />
                      <span className="font-mono text-txt-secondary truncate">{change.newPath}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Repo Index Status */}
      {mrData && gitlabBaseUrl && (
        <IndexProgressCard
          projectId={mrData.projectId}
          gitlabBaseUrl={gitlabBaseUrl}
          branch={mrData.mergeRequest.targetBranch}
        />
      )}

      {/* Past Reviews */}
      <div>
        <h2 className="text-section text-txt-primary dark:text-txt-dark-primary mb-3">Recent Reviews</h2>
        {loadingReviews ? (
          <div className="space-y-3">
            <ShimmerCard />
            <ShimmerCard />
          </div>
        ) : pastReviews.length === 0 ? (
          <div className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark p-8 text-center">
            <p className="text-body-sm text-txt-tertiary">
              No reviews yet. Enter a merge request URL above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastReviews.map((review, index) => (
              <motion.button
                key={review.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`/review/${review.id}`)}
                className="w-full text-left bg-surface dark:bg-surface-dark-secondary rounded-xl border border-border dark:border-border-dark p-4 hover:shadow-card-hover hover:border-accent/30 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-body-sm font-semibold text-txt-primary dark:text-txt-dark-primary group-hover:text-accent transition-colors">
                      {review.project_path}!{review.mr_iid}
                    </span>
                    <span className="ml-2 text-body-sm text-txt-secondary truncate">
                      {review.mr_title}
                    </span>
                  </div>
                  <span className="text-caption text-txt-tertiary flex-shrink-0 ml-4">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-txt-tertiary">{label}:</span>
      {children}
    </div>
  );
}

function FileChangeBadge({ change }: { change: MergeRequestData['changes'][0] }) {
  const { letter, style } = change.newFile
    ? { letter: 'A', style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
    : change.deletedFile
      ? { letter: 'D', style: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
      : change.renamedFile
        ? { letter: 'R', style: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' }
        : { letter: 'M', style: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };

  return (
    <span className={clsx('w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0', style)}>
      {letter}
    </span>
  );
}
