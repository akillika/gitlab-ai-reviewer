import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Known operational error patterns that are safe to expose to the user
const SAFE_ERROR_PATTERNS = [
  'Invalid OpenAI API key',
  'OpenAI rate limit exceeded',
  'OpenAI service temporarily unavailable',
  'OpenAI API error',
  'Unable to reach OpenAI API',
  'OpenAI returned empty',
  'AI returned malformed JSON',
  'AI review service temporarily unavailable',
  'timeout',
];

function isSafeToExpose(message: string): boolean {
  return SAFE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { statusCode: err.statusCode });
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  // Surface known operational errors to the user instead of generic 500
  const message = isSafeToExpose(err.message)
    ? err.message
    : 'Internal server error';

  res.status(500).json({ error: message });
}
