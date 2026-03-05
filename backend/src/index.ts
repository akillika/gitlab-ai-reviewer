import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import tokenRoutes from './routes/tokens';
import mrRoutes from './routes/mr';
import reviewRoutes from './routes/review';
import repoRoutes from './routes/repos';
import { startWorker, stopWorker } from './queue/indexingWorker';
import { closeRedisConnection } from './utils/redis';
import { closeQueue } from './queue/indexingQueue';

const app = express();

// Middleware
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/mr', mrRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/repos', repoRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start BullMQ worker if Redis URL is configured
if (config.redis.url) {
  try {
    startWorker();
  } catch (err) {
    logger.warn('Failed to start indexing worker (Redis may not be available)', {
      error: (err as Error).message,
    });
  }
}

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  try {
    await stopWorker();
    await closeQueue();
    await closeRedisConnection();
  } catch (err) {
    logger.error('Error during shutdown', { error: (err as Error).message });
  }
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
});

export default app;
