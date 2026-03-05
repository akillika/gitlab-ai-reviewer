import { Request, Response, NextFunction } from 'express';
import { signToken } from '../auth/jwt';
import { createUser, authenticateUser, getUserById } from '../services/userService';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;

    try {
      const user = await createUser(email, password);
      const token = signToken({ userId: user.id, email: user.email });

      logger.info('User registered', { userId: user.id });
      res.status(201).json({ token, user });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, 'An account with this email already exists');
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;

    const user = await authenticateUser(email, password);
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const token = signToken({ userId: user.id, email: user.email });
    logger.info('User logged in', { userId: user.id });
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const user = await getUserById(req.user.userId);
    if (!user) throw new AppError(404, 'User not found');

    res.json(user);
  } catch (error) {
    next(error);
  }
}
