import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getRepoStatus, findRepo, createRepo } from '../services/repoService';
import { getDecryptedGitlabToken } from '../services/userService';
import { enqueueIndexingJob } from '../queue/indexingQueue';
import { getProjectHealth } from '../services/repoHealthService';
import { getRepoSettings, upsertRepoSettings } from '../services/aiGateService';
import { logger } from '../utils/logger';

export async function getIndexStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const projectId = parseInt(req.query.projectId as string, 10);
    const gitlabBaseUrl = req.query.gitlabBaseUrl as string;

    if (isNaN(projectId) || !gitlabBaseUrl) {
      throw new AppError(400, 'Missing projectId or gitlabBaseUrl query parameters');
    }

    const repo = await getRepoStatus(projectId, gitlabBaseUrl);

    if (!repo) {
      res.json({
        indexing_status: 'not_indexed',
        total_files: 0,
        processed_files: 0,
        failed_files: 0,
        progress_percentage: 0,
        started_at: null,
        completed_at: null,
        error_message: null,
      });
      return;
    }

    const progressPercentage = repo.total_files > 0
      ? Math.round((repo.processed_files / repo.total_files) * 100)
      : 0;

    res.json({
      indexing_status: repo.indexing_status,
      total_files: repo.total_files,
      processed_files: repo.processed_files,
      failed_files: repo.failed_files,
      progress_percentage: progressPercentage,
      started_at: repo.started_at,
      completed_at: repo.completed_at,
      error_message: repo.error_message,
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerIndexing(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const { projectId, gitlabBaseUrl, branch } = req.body;

    if (!projectId || !gitlabBaseUrl || !branch) {
      throw new AppError(400, 'Missing projectId, gitlabBaseUrl, or branch');
    }

    // Check if already indexing
    const existingRepo = await findRepo(projectId, gitlabBaseUrl);
    if (existingRepo && existingRepo.indexing_status === 'indexing') {
      const progressPercentage = existingRepo.total_files > 0
        ? Math.round((existingRepo.processed_files / existingRepo.total_files) * 100)
        : 0;

      res.json({
        message: 'Indexing already in progress',
        indexing_status: existingRepo.indexing_status,
        progress_percentage: progressPercentage,
      });
      return;
    }

    // Get user's GitLab token
    const gitlab = await getDecryptedGitlabToken(req.user.userId);

    // Create or update repo record
    const repo = await createRepo({
      projectId,
      gitlabBaseUrl,
      defaultBranch: branch,
      triggeredByUserId: req.user.userId,
    });

    // Determine if incremental
    const isIncremental = !!(repo.last_indexed_commit_sha && repo.indexing_status !== 'failed');

    // Enqueue the job
    await enqueueIndexingJob({
      repoId: repo.id,
      projectId,
      gitlabBaseUrl,
      accessToken: gitlab.token,
      isIncremental,
      userId: req.user.userId,
      branch,
    });

    logger.info('Indexing triggered', {
      repoId: repo.id,
      projectId,
      isIncremental,
      userId: req.user.userId,
    });

    res.json({
      message: isIncremental ? 'Incremental indexing started' : 'Full indexing started',
      repoId: repo.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/repos/health — Get code health trends for a project.
 * Query params: projectId (required), limit (optional, default 50)
 */
export async function getHealth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) {
      throw new AppError(400, 'Missing or invalid projectId');
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const health = await getProjectHealth(projectId, limit);

    res.json(health);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/repos/settings — Get repo AI gate settings.
 * Query params: projectId, gitlabBaseUrl
 */
export async function getSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const projectId = parseInt(req.query.projectId as string, 10);
    const gitlabBaseUrl = req.query.gitlabBaseUrl as string;

    if (isNaN(projectId) || !gitlabBaseUrl) {
      throw new AppError(400, 'Missing projectId or gitlabBaseUrl');
    }

    const repo = await findRepo(projectId, gitlabBaseUrl);
    if (!repo) {
      res.json({ configured: false, settings: null });
      return;
    }

    const settings = await getRepoSettings(repo.id);
    res.json({
      configured: !!settings,
      settings: settings
        ? {
            block_on_major: settings.block_on_major,
            max_allowed_risk_score: settings.max_allowed_risk_score,
            auto_post_comments: settings.auto_post_comments,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/repos/settings — Update repo AI gate settings.
 * Body: { projectId, gitlabBaseUrl, blockOnMajor?, maxAllowedRiskScore?, autoPostComments? }
 */
export async function updateSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const { projectId, gitlabBaseUrl, blockOnMajor, maxAllowedRiskScore, autoPostComments } = req.body;

    if (!projectId || !gitlabBaseUrl) {
      throw new AppError(400, 'Missing projectId or gitlabBaseUrl');
    }

    const repo = await findRepo(projectId, gitlabBaseUrl);
    if (!repo) {
      throw new AppError(404, 'Repository not indexed. Run a review first to index the repository.');
    }

    const settings = await upsertRepoSettings(repo.id, {
      blockOnMajor,
      maxAllowedRiskScore,
      autoPostComments,
    });

    logger.info('Repo settings updated', {
      repoId: repo.id,
      projectId,
      blockOnMajor: settings.block_on_major,
      maxAllowedRiskScore: settings.max_allowed_risk_score,
    });

    res.json({
      message: 'Settings updated',
      settings: {
        block_on_major: settings.block_on_major,
        max_allowed_risk_score: settings.max_allowed_risk_score,
        auto_post_comments: settings.auto_post_comments,
      },
    });
  } catch (error) {
    next(error);
  }
}
