import { Queue } from 'bullmq';
import { QUEUE_NAME, getQueueConnection } from './connection';
import { logger } from '../utils/logger';

export interface IndexingJobData {
  repoId: string;
  projectId: number;
  gitlabBaseUrl: string;
  accessToken: string;
  isIncremental: boolean;
  userId: number;
  branch: string;
}

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 1, // No auto-retry — indexing handles its own retries
      },
    });
  }
  return queue;
}

export async function enqueueIndexingJob(data: IndexingJobData): Promise<void> {
  const jobId = `repo-${data.repoId}`;
  const q = getQueue();

  try {
    // Remove any previously completed/failed job with the same ID
    // so BullMQ deduplication doesn't silently block re-enqueue.
    // This is critical after migrations or manual re-index triggers.
    const existingJob = await q.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'completed' || state === 'failed') {
        await existingJob.remove();
        logger.info('Removed stale indexing job before re-enqueue', {
          repoId: data.repoId,
          previousState: state,
        });
      } else if (state === 'active' || state === 'waiting' || state === 'delayed') {
        logger.info('Indexing job already active/queued, skipping', {
          repoId: data.repoId,
          state,
        });
        return;
      }
    }

    await q.add('index-repo', data, {
      jobId, // Deduplication: only 1 job per repo at a time
    });
    logger.info('Indexing job enqueued', {
      repoId: data.repoId,
      projectId: data.projectId,
      isIncremental: data.isIncremental,
    });
  } catch (error) {
    // BullMQ throws if a job with the same ID is already active
    logger.warn('Failed to enqueue indexing job (may already be queued)', {
      repoId: data.repoId,
      error: (error as Error).message,
    });
  }
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
