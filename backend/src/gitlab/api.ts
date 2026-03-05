import { AxiosInstance } from 'axios';
import {
  MergeRequestDetails,
  MergeRequestChangesResponse,
  MergeRequestVersion,
  CreateDiscussionPayload,
  TreeItem,
  BranchInfo,
  CompareDiffResponse,
} from './types';
import { logger } from '../utils/logger';

export async function resolveProjectId(
  client: AxiosInstance,
  projectPath: string
): Promise<number> {
  const encoded = encodeURIComponent(projectPath);
  const response = await client.get<{ id: number }>(`/projects/${encoded}`);
  return response.data.id;
}

export async function getMergeRequest(
  client: AxiosInstance,
  projectId: number,
  mrIid: number
): Promise<MergeRequestDetails> {
  const response = await client.get<MergeRequestDetails>(
    `/projects/${projectId}/merge_requests/${mrIid}`
  );
  return response.data;
}

export async function getMergeRequestChanges(
  client: AxiosInstance,
  projectId: number,
  mrIid: number
): Promise<MergeRequestChangesResponse> {
  const response = await client.get<MergeRequestChangesResponse>(
    `/projects/${projectId}/merge_requests/${mrIid}/changes`
  );
  return response.data;
}

export async function getMergeRequestVersions(
  client: AxiosInstance,
  projectId: number,
  mrIid: number
): Promise<MergeRequestVersion[]> {
  const response = await client.get<MergeRequestVersion[]>(
    `/projects/${projectId}/merge_requests/${mrIid}/versions`
  );
  return response.data;
}

export async function postDiscussion(
  client: AxiosInstance,
  projectId: number,
  mrIid: number,
  payload: CreateDiscussionPayload
): Promise<{ id: string; notes: { id: number }[] }> {
  logger.info('Posting discussion to GitLab', {
    projectId,
    mrIid,
    file: payload.position.new_path,
    line: payload.position.new_line,
  });

  const response = await client.post<{ id: string; notes: { id: number }[] }>(
    `/projects/${projectId}/merge_requests/${mrIid}/discussions`,
    payload
  );
  return response.data;
}

export async function getExistingDiscussions(
  client: AxiosInstance,
  projectId: number,
  mrIid: number
): Promise<Array<{ notes: Array<{ body: string; position?: { new_path: string; new_line: number } }> }>> {
  const response = await client.get(
    `/projects/${projectId}/merge_requests/${mrIid}/discussions`,
    { params: { per_page: 100 } }
  );
  return response.data;
}

// --- Repository indexing API functions ---

export async function getRepoTree(
  client: AxiosInstance,
  projectId: number,
  branch: string,
  page: number = 1,
  perPage: number = 100
): Promise<TreeItem[]> {
  const response = await client.get<TreeItem[]>(
    `/projects/${projectId}/repository/tree`,
    {
      params: {
        ref: branch,
        recursive: true,
        per_page: perPage,
        page,
      },
    }
  );
  return response.data;
}

export async function getFileRaw(
  client: AxiosInstance,
  projectId: number,
  filePath: string,
  ref: string
): Promise<string> {
  const encodedPath = encodeURIComponent(filePath);
  const response = await client.get<string>(
    `/projects/${projectId}/repository/files/${encodedPath}/raw`,
    {
      params: { ref },
      // Return raw text, not parsed JSON
      transformResponse: [(data: string) => data],
    }
  );
  return response.data;
}

export async function getBranchInfo(
  client: AxiosInstance,
  projectId: number,
  branch: string
): Promise<BranchInfo> {
  const response = await client.get<BranchInfo>(
    `/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`
  );
  return response.data;
}

export async function compareCommits(
  client: AxiosInstance,
  projectId: number,
  fromSha: string,
  toSha: string
): Promise<CompareDiffResponse> {
  const response = await client.get<CompareDiffResponse>(
    `/projects/${projectId}/repository/compare`,
    {
      params: { from: fromSha, to: toSha },
    }
  );
  return response.data;
}
