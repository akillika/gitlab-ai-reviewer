import { AxiosInstance } from 'axios';
import { createGitLabClient } from '../gitlab/client';
import { getRepoTree, getFileRaw, getBranchInfo, compareCommits } from '../gitlab/api';
import { generateEmbedding } from '../ai/embedding';
import {
  updateRepoStatus,
  updateRepoProgress,
  saveChunks,
  deleteFileChunks,
  deleteAllChunks,
  saveFileRecord,
  getFileRecords,
  deleteFileRecord,
  ChunkInsert,
} from './repoService';
import {
  extractArchitecturePatterns,
  saveArchitectureProfile,
  deleteArchitectureProfile,
} from './architectureDriftService';
import {
  parseImports,
  saveDependencyEdges,
  deleteDependencyEdges,
} from './dependencyImpactService';
import { TreeItem } from '../gitlab/types';
import { logger } from '../utils/logger';

// --- Configuration ---

const MAX_FILES = 10000;
const MAX_FILE_LINES = 2000;
const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100KB
const MAX_CHUNKS_PER_FILE = 20;
const LINES_PER_CHUNK = 60;
const FILE_DELAY_MS = 100;
const PROGRESS_UPDATE_INTERVAL = 5;

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.bmp', '.webp', '.tiff',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.flac', '.wav',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  '.pyc', '.pyo', '.class', '.jar',
  '.min.js', '.min.css',
  '.map',
  '.lock',
  '.wasm',
]);

// Directory patterns to skip
const SKIP_DIRS = [
  'node_modules/',
  'vendor/',
  'build/',
  'dist/',
  '.git/',
  '__pycache__/',
  '.next/',
  'coverage/',
  '.cache/',
  '.idea/',
  '.vscode/',
  'target/',
  'out/',
  '.gradle/',
  'bower_components/',
];

// --- Helpers ---

function shouldSkipFile(item: TreeItem): boolean {
  // Only process blobs (files)
  if (item.type !== 'blob') return true;

  // Check directory patterns
  for (const dir of SKIP_DIRS) {
    if (item.path.includes(dir)) return true;
  }

  // Check binary extensions
  const lowerPath = item.path.toLowerCase();
  for (const ext of BINARY_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) return true;
  }

  return false;
}

export function chunkFileContent(filePath: string, content: string): { text: string; index: number }[] {
  const lines = content.split('\n');

  // Skip files that are too long
  if (lines.length > MAX_FILE_LINES) {
    logger.info(`Skipping large file (${lines.length} lines): ${filePath}`);
    return [];
  }

  const chunks: { text: string; index: number }[] = [];
  let chunkIndex = 0;

  for (let i = 0; i < lines.length; i += LINES_PER_CHUNK) {
    if (chunkIndex >= MAX_CHUNKS_PER_FILE) break;

    const chunkLines = lines.slice(i, i + LINES_PER_CHUNK);
    const chunkText = `File: ${filePath}\n\n${chunkLines.join('\n')}`;

    // Skip empty or near-empty chunks
    if (chunkText.trim().length < 20) continue;

    chunks.push({ text: chunkText, index: chunkIndex });
    chunkIndex++;
  }

  return chunks;
}

// --- Full Index ---

export async function runFullIndex(params: {
  repoId: string;
  projectId: number;
  gitlabBaseUrl: string;
  accessToken: string;
  branch: string;
  userId: number;
}): Promise<void> {
  const { repoId, projectId, gitlabBaseUrl, accessToken, branch } = params;

  logger.info('Starting full index', { repoId, projectId, branch });

  // Set status to indexing
  await updateRepoStatus(repoId, 'indexing', {
    totalFiles: 0,
    processedFiles: 0,
    failedFiles: 0,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
  });

  const client = createGitLabClient(gitlabBaseUrl, accessToken);

  try {
    // Get latest commit SHA
    const branchInfo = await getBranchInfo(client, projectId, branch);
    const commitSha = branchInfo.commit.id;

    // Fetch repository tree (paginated)
    const allFiles = await fetchFilteredTree(client, projectId, branch);

    logger.info(`Found ${allFiles.length} indexable files`, { repoId });

    await updateRepoStatus(repoId, 'indexing', {
      totalFiles: allFiles.length,
    });

    // Delete existing chunks for fresh index
    await deleteAllChunks(repoId);

    let processedFiles = 0;
    let failedFiles = 0;

    for (const file of allFiles) {
      try {
        await indexSingleFile(client, projectId, repoId, file.path, branch, commitSha);
        processedFiles++;
      } catch (error) {
        failedFiles++;
        logger.warn('Failed to index file', {
          filePath: file.path,
          error: (error as Error).message,
        });
      }

      // Update progress periodically
      if ((processedFiles + failedFiles) % PROGRESS_UPDATE_INTERVAL === 0) {
        await updateRepoProgress(repoId, processedFiles, failedFiles);
      }

      // Delay between files to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, FILE_DELAY_MS));
    }

    // Final update
    await updateRepoStatus(repoId, 'completed', {
      processedFiles,
      failedFiles,
      lastIndexedCommitSha: commitSha,
      completedAt: new Date(),
    });

    logger.info('Full index completed', {
      repoId,
      processedFiles,
      failedFiles,
      totalFiles: allFiles.length,
    });
  } catch (error) {
    logger.error('Full index failed', {
      repoId,
      error: (error as Error).message,
    });
    await updateRepoStatus(repoId, 'failed', {
      errorMessage: (error as Error).message,
    });
    throw error;
  }
}

// --- Incremental Index ---

export async function runIncrementalIndex(params: {
  repoId: string;
  projectId: number;
  gitlabBaseUrl: string;
  accessToken: string;
  branch: string;
  lastIndexedCommitSha: string;
  userId: number;
}): Promise<void> {
  const {
    repoId, projectId, gitlabBaseUrl, accessToken,
    branch, lastIndexedCommitSha,
  } = params;

  logger.info('Starting incremental index', { repoId, projectId, branch, fromSha: lastIndexedCommitSha });

  await updateRepoStatus(repoId, 'indexing', {
    processedFiles: 0,
    failedFiles: 0,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
  });

  const client = createGitLabClient(gitlabBaseUrl, accessToken);

  try {
    // Get latest commit SHA
    const branchInfo = await getBranchInfo(client, projectId, branch);
    const latestSha = branchInfo.commit.id;

    if (latestSha === lastIndexedCommitSha) {
      logger.info('No new commits since last index', { repoId });
      await updateRepoStatus(repoId, 'completed', {
        completedAt: new Date(),
      });
      return;
    }

    // Compare commits to find changed files
    const compareResult = await compareCommits(client, projectId, lastIndexedCommitSha, latestSha);
    const changedFiles = compareResult.diffs;

    logger.info(`Found ${changedFiles.length} changed files for incremental index`, { repoId });

    await updateRepoStatus(repoId, 'indexing', {
      totalFiles: changedFiles.length,
    });

    let processedFiles = 0;
    let failedFiles = 0;

    for (const change of changedFiles) {
      try {
        if (change.deleted_file) {
          // File was deleted — remove its chunks, record, architecture profile, and dependency edges
          await deleteFileChunks(repoId, change.old_path);
          await deleteFileRecord(repoId, change.old_path);
          await deleteArchitectureProfile(repoId, change.old_path);
          await deleteDependencyEdges(repoId, change.old_path);
        } else {
          const filePath = change.new_path;

          // Skip binary/vendor files
          if (shouldSkipPath(filePath)) {
            processedFiles++;
            continue;
          }

          // Delete old chunks for this file
          await deleteFileChunks(repoId, filePath);
          if (change.renamed_file && change.old_path !== change.new_path) {
            await deleteFileChunks(repoId, change.old_path);
            await deleteFileRecord(repoId, change.old_path);
            await deleteArchitectureProfile(repoId, change.old_path);
            await deleteDependencyEdges(repoId, change.old_path);
          }

          // Re-index the file (includes architecture + dependency extraction)
          await indexSingleFile(client, projectId, repoId, filePath, branch, latestSha);
        }
        processedFiles++;
      } catch (error) {
        failedFiles++;
        logger.warn('Failed to re-index file', {
          filePath: change.new_path,
          error: (error as Error).message,
        });
      }

      if ((processedFiles + failedFiles) % PROGRESS_UPDATE_INTERVAL === 0) {
        await updateRepoProgress(repoId, processedFiles, failedFiles);
      }

      await new Promise((resolve) => setTimeout(resolve, FILE_DELAY_MS));
    }

    await updateRepoStatus(repoId, 'completed', {
      processedFiles,
      failedFiles,
      lastIndexedCommitSha: latestSha,
      completedAt: new Date(),
    });

    logger.info('Incremental index completed', {
      repoId,
      processedFiles,
      failedFiles,
    });
  } catch (error) {
    logger.error('Incremental index failed', {
      repoId,
      error: (error as Error).message,
    });
    await updateRepoStatus(repoId, 'failed', {
      errorMessage: (error as Error).message,
    });
    throw error;
  }
}

// --- Internal helpers ---

function shouldSkipPath(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();

  for (const dir of SKIP_DIRS) {
    if (lowerPath.includes(dir)) return true;
  }

  for (const ext of BINARY_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) return true;
  }

  return false;
}

async function fetchFilteredTree(
  client: AxiosInstance,
  projectId: number,
  branch: string
): Promise<TreeItem[]> {
  const allItems: TreeItem[] = [];
  let page = 1;

  while (allItems.length < MAX_FILES) {
    const items = await getRepoTree(client, projectId, branch, page, 100);

    if (items.length === 0) break;

    for (const item of items) {
      if (!shouldSkipFile(item)) {
        allItems.push(item);
        if (allItems.length >= MAX_FILES) break;
      }
    }

    page++;

    // Small delay between pagination requests
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return allItems;
}

async function indexSingleFile(
  client: AxiosInstance,
  projectId: number,
  repoId: string,
  filePath: string,
  branch: string,
  commitSha: string
): Promise<void> {
  // Fetch raw file content
  const content = await getFileRaw(client, projectId, filePath, branch);

  // Skip if content is too large
  if (content.length > MAX_FILE_SIZE_BYTES) {
    logger.info(`Skipping large file (${content.length} bytes): ${filePath}`);
    return;
  }

  // Split into chunks
  const chunks = chunkFileContent(filePath, content);

  if (chunks.length === 0) return;

  // Generate embeddings for each chunk
  const chunkInserts: ChunkInsert[] = [];

  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.text);
      chunkInserts.push({
        repoId,
        filePath,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        embedding,
        commitSha,
      });
    } catch (error) {
      logger.warn('Failed to generate embedding for chunk', {
        filePath,
        chunkIndex: chunk.index,
        error: (error as Error).message,
      });
    }

    // Small delay between embedding API calls
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Save chunks to database
  if (chunkInserts.length > 0) {
    await saveChunks(chunkInserts);
  }

  // --- Phase 2: Extract architecture profile + dependency graph ---
  try {
    // Architecture pattern extraction (fast, regex-based)
    const patterns = extractArchitecturePatterns(filePath, content);
    if (patterns.length > 0) {
      await saveArchitectureProfile(repoId, filePath, patterns);
    }

    // Dependency graph extraction (import/require parsing)
    const edges = parseImports(filePath, content);
    if (edges.length > 0) {
      await saveDependencyEdges(repoId, filePath, edges);
    }
  } catch (error) {
    // Non-critical: architecture/dependency extraction failures don't block indexing
    logger.warn('Failed to extract architecture/dependency data', {
      filePath,
      error: (error as Error).message,
    });
  }

  // Save file record
  await saveFileRecord(repoId, filePath, commitSha);
}
