import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: '24h',
  },

  encryption: {
    masterKey: requireEnv('MASTER_ENCRYPTION_KEY'),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  openai: {
    apiKey: requireEnv('OPENAI_API_KEY'),
    reviewModel: process.env.OPENAI_REVIEW_MODEL || 'gpt-4o-mini',
    deepReviewModel: process.env.OPENAI_DEEP_REVIEW_MODEL || 'gpt-4.1',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    /** Maximum concurrent OpenAI API requests */
    maxConcurrency: parseInt(process.env.OPENAI_MAX_CONCURRENCY || '2', 10),
    /** Request timeout in milliseconds */
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '120000', 10),
  },
} as const;
