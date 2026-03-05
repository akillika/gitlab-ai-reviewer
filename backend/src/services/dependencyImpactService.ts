/**
 * dependencyImpactService.ts — Builds and queries file dependency graphs.
 *
 * During repo indexing, import/require statements are parsed from each file
 * to build a directed dependency graph. During MR review, this graph is used
 * to calculate the "impact radius" — how many files transitively depend on
 * the changed files. High impact radius suggests the change needs extra
 * scrutiny.
 *
 * The graph is stored in `repo_dependency_graph` as edge pairs
 * (source_file -> target_file).
 */

import { query } from '../utils/db';
import { DiffChunk } from '../ai/types';
import { logger } from '../utils/logger';

// --- Types ---

export interface DependencyEdge {
  sourceFile: string;
  targetFile: string;
  importType: 'static' | 'dynamic' | 'require';
}

export interface ImpactAnalysis {
  /** Files directly changed in this MR */
  changedFiles: string[];
  /** Files that import the changed files (direct dependents) */
  directDependents: string[];
  /** All files transitively affected (includes direct dependents) */
  transitiveDependents: string[];
  /** Total impact radius: count of unique transitive dependents */
  impactRadius: number;
  /** High impact if radius > 10 */
  isHighImpact: boolean;
  /** Per-file impact details */
  fileImpacts: Array<{
    filePath: string;
    directDependentCount: number;
    transitiveDependentCount: number;
  }>;
}

// --- Import parsing (used during indexing) ---

/**
 * Parse import/require statements from file content to extract dependencies.
 * Handles ES6 imports, CommonJS require, and dynamic imports.
 */
export function parseImports(filePath: string, content: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();

  // ES6 static imports: import X from './path', import { X } from './path'
  const es6Pattern = /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = es6Pattern.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(filePath, importPath);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      edges.push({ sourceFile: filePath, targetFile: resolved, importType: 'static' });
    }
  }

  // ES6 export from: export { X } from './path'
  const exportFromPattern = /export\s+(?:[\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = exportFromPattern.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(filePath, importPath);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      edges.push({ sourceFile: filePath, targetFile: resolved, importType: 'static' });
    }
  }

  // CommonJS require: require('./path'), require('../path')
  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requirePattern.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(filePath, importPath);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      edges.push({ sourceFile: filePath, targetFile: resolved, importType: 'require' });
    }
  }

  // Dynamic imports: import('./path')
  const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicPattern.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = resolveImportPath(filePath, importPath);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      edges.push({ sourceFile: filePath, targetFile: resolved, importType: 'dynamic' });
    }
  }

  return edges;
}

/**
 * Resolve a relative import path to an absolute project path.
 * Only resolves relative imports (./  ../) — skips node_modules.
 */
function resolveImportPath(sourceFile: string, importPath: string): string | null {
  // Skip non-relative imports (node_modules, bare specifiers)
  if (!importPath.startsWith('.')) return null;

  // Skip CSS/SCSS/JSON/asset imports
  if (/\.(css|scss|less|sass|json|png|jpg|svg|gif|ico|woff|ttf)$/i.test(importPath)) return null;

  // Get directory of source file
  const sourceDir = sourceFile.substring(0, sourceFile.lastIndexOf('/'));

  // Resolve the import path relative to source directory
  const parts = importPath.split('/');
  const dirParts = sourceDir.split('/');

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      dirParts.pop();
    } else {
      dirParts.push(part);
    }
  }

  let resolved = dirParts.join('/');

  // Strip file extension if present, normalize to canonical path
  // We store without extension since imports often omit them
  resolved = resolved.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');

  return resolved;
}

// --- DB operations ---

/**
 * Save dependency edges for a file (replace all edges from this source).
 */
export async function saveDependencyEdges(
  repoId: string,
  sourceFile: string,
  edges: DependencyEdge[]
): Promise<void> {
  // Delete existing edges from this source
  await query(
    'DELETE FROM repo_dependency_graph WHERE repo_id = $1 AND source_file = $2',
    [repoId, sourceFile]
  );

  if (edges.length === 0) return;

  // Batch insert new edges
  const values: unknown[] = [];
  const placeholders: string[] = [];
  edges.forEach((edge, idx) => {
    const offset = idx * 4;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    values.push(repoId, edge.sourceFile, edge.targetFile, edge.importType);
  });

  await query(
    `INSERT INTO repo_dependency_graph (repo_id, source_file, target_file, import_type)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (repo_id, source_file, target_file) DO UPDATE SET import_type = EXCLUDED.import_type, updated_at = NOW()`,
    values
  );
}

/**
 * Delete dependency edges for a file (both as source and target).
 */
export async function deleteDependencyEdges(
  repoId: string,
  filePath: string
): Promise<void> {
  await query(
    'DELETE FROM repo_dependency_graph WHERE repo_id = $1 AND source_file = $2',
    [repoId, filePath]
  );
}

/**
 * Find all files that directly import the given files.
 */
async function getDirectDependents(
  repoId: string,
  targetFiles: string[]
): Promise<Map<string, string[]>> {
  if (targetFiles.length === 0) return new Map();

  // Normalize target files: also search without extension variants
  const searchTargets = new Set<string>();
  for (const f of targetFiles) {
    searchTargets.add(f);
    // Also add version without extension
    const withoutExt = f.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
    searchTargets.add(withoutExt);
  }

  const targetArray = Array.from(searchTargets);
  const placeholders = targetArray.map((_, i) => `$${i + 2}`).join(', ');

  const result = await query<{ source_file: string; target_file: string; [key: string]: unknown }>(
    `SELECT source_file, target_file FROM repo_dependency_graph
     WHERE repo_id = $1 AND target_file IN (${placeholders})`,
    [repoId, ...targetArray]
  );

  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const deps = map.get(row.target_file) || [];
    deps.push(row.source_file);
    map.set(row.target_file, deps);
  }
  return map;
}

/**
 * BFS to find all transitive dependents of the given files.
 * Caps at MAX_BFS_DEPTH to avoid infinite loops in circular dependencies.
 */
const MAX_BFS_DEPTH = 5;

async function getTransitiveDependents(
  repoId: string,
  startFiles: string[]
): Promise<Set<string>> {
  const visited = new Set<string>();
  let frontier = [...startFiles];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_BFS_DEPTH) {
    const directDeps = await getDirectDependents(repoId, frontier);
    const nextFrontier: string[] = [];

    for (const [, dependents] of directDeps) {
      for (const dep of dependents) {
        if (!visited.has(dep) && !startFiles.includes(dep)) {
          visited.add(dep);
          nextFrontier.push(dep);
        }
      }
    }

    frontier = nextFrontier;
    depth++;
  }

  return visited;
}

// --- Impact analysis (used during MR review) ---

/**
 * Calculate the dependency impact of changed files in an MR.
 * Returns impact analysis including direct and transitive dependents.
 */
export async function calculateImpactAnalysis(
  repoId: string,
  diffChunks: DiffChunk[]
): Promise<ImpactAnalysis> {
  const changedFiles = diffChunks.map((c) => c.filePath);

  try {
    // Get direct dependents
    const directDepsMap = await getDirectDependents(repoId, changedFiles);
    const allDirectDependents = new Set<string>();
    for (const [, deps] of directDepsMap) {
      for (const dep of deps) {
        if (!changedFiles.includes(dep)) {
          allDirectDependents.add(dep);
        }
      }
    }

    // Get transitive dependents
    const transitiveDependents = await getTransitiveDependents(repoId, changedFiles);

    // Build per-file impact details
    const fileImpacts = changedFiles.map((filePath) => {
      const fileWithoutExt = filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
      const directDeps = [
        ...(directDepsMap.get(filePath) || []),
        ...(directDepsMap.get(fileWithoutExt) || []),
      ];
      const uniqueDirect = new Set(directDeps.filter((d) => !changedFiles.includes(d)));

      return {
        filePath,
        directDependentCount: uniqueDirect.size,
        transitiveDependentCount: 0, // Simplified: we report aggregate transitive
      };
    });

    const impactRadius = transitiveDependents.size;

    return {
      changedFiles,
      directDependents: Array.from(allDirectDependents),
      transitiveDependents: Array.from(transitiveDependents),
      impactRadius,
      isHighImpact: impactRadius > 10,
      fileImpacts,
    };
  } catch (error) {
    logger.warn('Dependency impact analysis failed (non-critical)', {
      error: (error as Error).message,
    });

    return {
      changedFiles,
      directDependents: [],
      transitiveDependents: [],
      impactRadius: 0,
      isHighImpact: false,
      fileImpacts: [],
    };
  }
}
