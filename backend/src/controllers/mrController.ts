import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getDecryptedGitlabToken } from '../services/userService';
import { createGitLabClient } from '../gitlab/client';
import { resolveProjectId, getMergeRequest, getMergeRequestChanges, getMergeRequestVersions } from '../gitlab/api';
import { parseMrUrl } from '../gitlab/parser';
import { logger } from '../utils/logger';

export async function fetchMergeRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const { mrUrl } = req.body;

    const parsed = parseMrUrl(mrUrl);
    logger.info('Fetching MR', { projectPath: parsed.projectPath, mrIid: parsed.mrIid });

    const gitlab = await getDecryptedGitlabToken(req.user.userId);
    const client = createGitLabClient(gitlab.baseUrl, gitlab.token);

    const projectId = await resolveProjectId(client, parsed.projectPath);

    const [mrDetails, mrChanges, mrVersions] = await Promise.all([
      getMergeRequest(client, projectId, parsed.mrIid),
      getMergeRequestChanges(client, projectId, parsed.mrIid),
      getMergeRequestVersions(client, projectId, parsed.mrIid),
    ]);

    const latestVersion = mrVersions[0];

    res.json({
      projectId,
      projectPath: parsed.projectPath,
      mergeRequest: {
        iid: mrDetails.iid,
        title: mrDetails.title,
        description: mrDetails.description,
        state: mrDetails.state,
        sourceBranch: mrDetails.source_branch,
        targetBranch: mrDetails.target_branch,
        author: mrDetails.author,
        webUrl: mrDetails.web_url,
      },
      diffRefs: mrDetails.diff_refs,
      changes: mrChanges.changes.map((change) => ({
        oldPath: change.old_path,
        newPath: change.new_path,
        newFile: change.new_file,
        renamedFile: change.renamed_file,
        deletedFile: change.deleted_file,
        diff: change.diff,
      })),
      latestVersion: latestVersion
        ? {
            id: latestVersion.id,
            headCommitSha: latestVersion.head_commit_sha,
            baseCommitSha: latestVersion.base_commit_sha,
            startCommitSha: latestVersion.start_commit_sha,
          }
        : null,
    });
  } catch (error) {
    const msg = (error as Error).message || '';
    if (msg.includes('Invalid MR URL') || msg.includes('not configured')) {
      next(new AppError(400, msg));
    } else {
      next(error);
    }
  }
}
