import { QueryResultRow } from 'pg';
import { query } from '../utils/db';
import { logger } from '../utils/logger';

// --- Row types ---

export interface RepoRow extends QueryResultRow {
  id: string;
  project_id: number;
  gitlab_base_url: string;
  default_branch: string;
  last_indexed_commit_sha: string | null;
  indexing_status: string;
  total_files: number;
  processed_files: number;
  failed_files: number;
  error_message: string | null;
  triggered_by_user_id: number | null;
  embedding_version: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface RepoFileRow extends QueryResultRow {
  id: number;
  repo_id: string;
  file_path: string;
  last_indexed_sha: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ChunkRow extends QueryResultRow {
  id: number;
  repo_id: string;
  file_path: string;
  chunk_index: number;
  chunk_text: string;
  commit_sha: string;
  created_at: string;
  [key: string]: unknown;
}

// --- Repo CRUD ---

export async function findRepo(
  projectId: number,
  gitlabBaseUrl: string
): Promise<RepoRow | null> {
  const result = await query<RepoRow>(
    'SELECT * FROM repos WHERE project_id = $1 AND gitlab_base_url = $2',
    [projectId, gitlabBaseUrl]
  );
  return result.rows[0] || null;
}

export async function createRepo(params: {
  projectId: number;
  gitlabBaseUrl: string;
  defaultBranch: string;
  triggeredByUserId?: number;
}): Promise<RepoRow> {
  const result = await query<RepoRow>(
    `INSERT INTO repos (project_id, gitlab_base_url, default_branch, triggered_by_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, gitlab_base_url)
     DO UPDATE SET default_branch = EXCLUDED.default_branch, updated_at = NOW()
     RETURNING *`,
    [params.projectId, params.gitlabBaseUrl, params.defaultBranch, params.triggeredByUserId || null]
  );
  return result.rows[0];
}

export async function updateRepoStatus(
  repoId: string,
  status: string,
  updates?: {
    totalFiles?: number;
    processedFiles?: number;
    failedFiles?: number;
    errorMessage?: string | null;
    lastIndexedCommitSha?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }
): Promise<void> {
  const setClauses = ['indexing_status = $2', 'updated_at = NOW()'];
  const params: unknown[] = [repoId, status];
  let paramIdx = 3;

  if (updates?.totalFiles !== undefined) {
    setClauses.push(`total_files = $${paramIdx}`);
    params.push(updates.totalFiles);
    paramIdx++;
  }
  if (updates?.processedFiles !== undefined) {
    setClauses.push(`processed_files = $${paramIdx}`);
    params.push(updates.processedFiles);
    paramIdx++;
  }
  if (updates?.failedFiles !== undefined) {
    setClauses.push(`failed_files = $${paramIdx}`);
    params.push(updates.failedFiles);
    paramIdx++;
  }
  if (updates?.errorMessage !== undefined) {
    setClauses.push(`error_message = $${paramIdx}`);
    params.push(updates.errorMessage);
    paramIdx++;
  }
  if (updates?.lastIndexedCommitSha !== undefined) {
    setClauses.push(`last_indexed_commit_sha = $${paramIdx}`);
    params.push(updates.lastIndexedCommitSha);
    paramIdx++;
  }
  if (updates?.startedAt !== undefined) {
    setClauses.push(`started_at = $${paramIdx}`);
    params.push(updates.startedAt);
    paramIdx++;
  }
  if (updates?.completedAt !== undefined) {
    setClauses.push(`completed_at = $${paramIdx}`);
    params.push(updates.completedAt);
    paramIdx++;
  }

  await query(
    `UPDATE repos SET ${setClauses.join(', ')} WHERE id = $1`,
    params
  );
}

export async function updateRepoProgress(
  repoId: string,
  processedFiles: number,
  failedFiles?: number
): Promise<void> {
  if (failedFiles !== undefined) {
    await query(
      'UPDATE repos SET processed_files = $2, failed_files = $3, updated_at = NOW() WHERE id = $1',
      [repoId, processedFiles, failedFiles]
    );
  } else {
    await query(
      'UPDATE repos SET processed_files = $2, updated_at = NOW() WHERE id = $1',
      [repoId, processedFiles]
    );
  }
}

export async function getRepoStatus(
  projectId: number,
  gitlabBaseUrl: string
): Promise<RepoRow | null> {
  const result = await query<RepoRow>(
    'SELECT * FROM repos WHERE project_id = $1 AND gitlab_base_url = $2',
    [projectId, gitlabBaseUrl]
  );
  return result.rows[0] || null;
}

// --- Chunk operations ---

export interface ChunkInsert {
  repoId: string;
  filePath: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  commitSha: string;
}

export async function saveChunks(chunks: ChunkInsert[]): Promise<void> {
  if (chunks.length === 0) return;

  // Batch insert for efficiency
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((chunk, idx) => {
      const offset = idx * 6;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::vector, $${offset + 6})`
      );
      values.push(
        chunk.repoId,
        chunk.filePath,
        chunk.chunkIndex,
        chunk.chunkText,
        `[${chunk.embedding.join(',')}]`,
        chunk.commitSha
      );
    });

    await query(
      `INSERT INTO repo_chunks (repo_id, file_path, chunk_index, chunk_text, embedding, commit_sha)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  logger.info(`Saved ${chunks.length} chunks to database`);
}

export async function deleteFileChunks(repoId: string, filePath: string): Promise<void> {
  await query(
    'DELETE FROM repo_chunks WHERE repo_id = $1 AND file_path = $2',
    [repoId, filePath]
  );
}

export async function deleteAllChunks(repoId: string): Promise<void> {
  await query('DELETE FROM repo_chunks WHERE repo_id = $1', [repoId]);
}

// --- File record operations ---

export async function saveFileRecord(
  repoId: string,
  filePath: string,
  sha: string
): Promise<void> {
  await query(
    `INSERT INTO repo_files (repo_id, file_path, last_indexed_sha)
     VALUES ($1, $2, $3)
     ON CONFLICT (repo_id, file_path)
     DO UPDATE SET last_indexed_sha = $3, updated_at = NOW()`,
    [repoId, filePath, sha]
  );
}

export async function getFileRecords(
  repoId: string
): Promise<Map<string, string>> {
  const result = await query<RepoFileRow>(
    'SELECT file_path, last_indexed_sha FROM repo_files WHERE repo_id = $1',
    [repoId]
  );

  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(row.file_path, row.last_indexed_sha);
  }
  return map;
}

export async function deleteFileRecord(repoId: string, filePath: string): Promise<void> {
  await query(
    'DELETE FROM repo_files WHERE repo_id = $1 AND file_path = $2',
    [repoId, filePath]
  );
}

// --- Vector search ---

export async function searchSimilarChunks(
  repoId: string,
  embedding: number[],
  limit: number = 10
): Promise<ChunkRow[]> {
  const embeddingStr = `[${embedding.join(',')}]`;
  const result = await query<ChunkRow>(
    `SELECT id, repo_id, file_path, chunk_index, chunk_text, commit_sha, created_at,
            1 - (embedding <=> $2::vector) AS similarity
     FROM repo_chunks
     WHERE repo_id = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [repoId, embeddingStr, limit]
  );
  return result.rows;
}
