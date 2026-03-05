import { getRedisConnection } from '../utils/redis';

export const QUEUE_NAME = 'repo-indexing';

export function getQueueConnection() {
  return getRedisConnection();
}
