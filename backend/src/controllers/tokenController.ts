import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { saveTokens, getUserById, clearTokens } from '../services/userService';
import { logger } from '../utils/logger';

interface GitLabUserResponse {
  id: number;
  username: string;
  name: string;
}

async function validateGitLabToken(baseUrl: string, token: string): Promise<GitLabUserResponse> {
  try {
    const response = await axios.get<GitLabUserResponse>(`${baseUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new AppError(401, 'Invalid GitLab Personal Access Token');
      }
      if (error.response?.status === 403) {
        throw new AppError(403, 'GitLab token lacks required scopes (needs: api, read_user)');
      }
      if (!error.response) {
        throw new AppError(502, `Cannot reach GitLab at ${baseUrl}. Please check the URL.`);
      }
    }
    throw new AppError(502, 'Failed to validate GitLab token');
  }
}

export async function configureTokens(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const { gitlabBaseUrl, gitlabToken } = req.body;

    // Validate GitLab token by calling /user
    logger.info('Validating GitLab token', { userId: req.user.userId });
    const gitlabUser = await validateGitLabToken(gitlabBaseUrl, gitlabToken);

    // Store encrypted tokens
    const user = await saveTokens(req.user.userId, {
      gitlabBaseUrl,
      gitlabToken,
      gitlabUserId: gitlabUser.id,
      gitlabUsername: gitlabUser.username,
    });

    logger.info('Tokens configured successfully', {
      userId: req.user.userId,
      gitlabUsername: gitlabUser.username,
    });

    res.json({
      message: 'Tokens validated and saved successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTokenStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const user = await getUserById(req.user.userId);
    if (!user) throw new AppError(404, 'User not found');

    res.json({
      configured: user.hasGitlabToken,
      gitlabBaseUrl: user.gitlabBaseUrl,
      gitlabUsername: user.gitlabUsername,
      hasGitlabToken: user.hasGitlabToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeTokens(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const user = await clearTokens(req.user.userId);
    logger.info('Tokens cleared', { userId: req.user.userId });

    res.json({ message: 'Tokens removed successfully', user });
  } catch (error) {
    next(error);
  }
}
