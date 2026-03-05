import { Worker, Job } from 'bullmq';
import { QUEUE_NAME, getQueueConnection } from './connection';
import { IndexingJobData } from './indexingQueue';
import { runFullIndex, runIncrementalIndex } from '../services/indexingService';
import { findRepo } from '../services/repoService';
import { logger } from '../utils/logger';

let worker: Worker | null = null;

export function startWorker(): void {
  if (worker) {
    logger.warn('Indexing worker already started');
    return;
  }

  worker = new Worker<IndexingJobData>(
    QUEUE_NAME,
    async (job: Job<IndexingJobData>) => {
      const { repoId, projectId, gitlabBaseUrl, accessToken, isIncremental, branch, userId } = job.data;

      logger.info('Processing indexing job', {
        jobId: job.id,
        repoId,
        projectId,
        isIncremental,
      });

      if (isIncremental) {
        const repo = await findRepo(projectId, gitlabBaseUrl);
        if (!repo || !repo.last_indexed_commit_sha) {
          logger.info('No previous index found, running full index instead', { repoId });
          await runFullIndex({ repoId, projectId, gitlabBaseUrl, accessToken, branch, userId });
        } else {
          await runIncrementalIndex({
            repoId,
            projectId,
            gitlabBaseUrl,
            accessToken,
            branch,
            lastIndexedCommitSha: repo.last_indexed_commit_sha,
            userId,
          });
        }
      } else {
        await runFullIndex({ repoId, projectId, gitlabBaseUrl, accessToken, branch, userId });
      }

      logger.info('Indexing job completed', { jobId: job.id, repoId });
    },
    {
      connection: getQueueConnection(),
      concurrency: 2,
      lockDuration: 600000,      // 10 minutes before lock expires
      lockRenewTime: 30000,      // Auto-renew lock every 30 seconds
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Indexing job failed', {
      jobId: job?.id,
      repoId: job?.data?.repoId,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Indexing worker error', { error: err.message });
  });

  logger.info('Indexing worker started');
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Indexing worker stopped');
  }
}
