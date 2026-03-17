/**
 * architectureDriftService.ts — Detects architectural drift in MR changes.
 *
 * Architecture profiles are extracted during repo indexing. Each file gets
 * a set of detected_patterns (e.g., "controller", "service", "repository",
 * "middleware", "route", "model", "util"). During MR review, we compare
 * changes against the established profile to detect drift — for example,
 * a controller file importing a repository directly, or a util file
 * containing business logic patterns.
 *
 * Drift detection is a heuristic analysis, not AI-powered. It's fast and
 * runs synchronously with review.
 */

import { query } from '../utils/db';
import { AIReviewComment, DiffChunk } from '../ai/types';
import { logger } from '../utils/logger';

// --- Types ---

export interface ArchitecturePattern {
  role: string;       // controller, service, repository, middleware, route, model, util, test
  confidence: number; // 0-1
}

export interface ArchitectureProfileRow {
  id: number;
  repo_id: string;
  file_path: string;
  detected_patterns: ArchitecturePattern[];
  updated_at: string;
}

// --- Pattern extraction (used during indexing) ---

/**
 * Regex-based heuristics to classify a file's architectural role
 * based on its path and content.
 */
const PATH_ROLE_PATTERNS: Array<{ pattern: RegExp; role: string }> = [
  { pattern: /controller/i, role: 'controller' },
  { pattern: /service/i, role: 'service' },
  { pattern: /repositor(y|ies)/i, role: 'repository' },
  { pattern: /middleware/i, role: 'middleware' },
  { pattern: /route/i, role: 'route' },
  { pattern: /model/i, role: 'model' },
  { pattern: /util/i, role: 'util' },
  { pattern: /helper/i, role: 'util' },
  { pattern: /test|spec|__test__/i, role: 'test' },
  { pattern: /component/i, role: 'component' },
  { pattern: /hook/i, role: 'hook' },
  { pattern: /page/i, role: 'page' },
  { pattern: /layout/i, role: 'layout' },
  { pattern: /config/i, role: 'config' },
];

const CONTENT_ROLE_PATTERNS: Array<{ pattern: RegExp; role: string; weight: number }> = [
  // Controller patterns
  { pattern: /\b(req|request)\s*[,:]\s*(Request|express\.Request)/g, role: 'controller', weight: 0.7 },
  { pattern: /\bres\.(json|send|status|render)\b/g, role: 'controller', weight: 0.6 },
  { pattern: /\bexport\s+async\s+function\s+\w+\s*\(\s*req/g, role: 'controller', weight: 0.8 },

  // Service patterns
  { pattern: /\bexport\s+(async\s+)?function\s+\w+(create|update|delete|find|get|process|compute)/gi, role: 'service', weight: 0.6 },

  // Repository / data access patterns
  { pattern: /\b(query|pool\.query|\.execute|\.findOne|\.findMany|\.create|\.update|\.delete)\s*\(/g, role: 'repository', weight: 0.6 },
  { pattern: /\bSELECT\b.*\bFROM\b/gi, role: 'repository', weight: 0.7 },
  { pattern: /\bINSERT\s+INTO\b/gi, role: 'repository', weight: 0.7 },

  // Middleware patterns
  { pattern: /\b(req|request),\s*(res|response),\s*(next|NextFunction)/g, role: 'middleware', weight: 0.7 },

  // Route patterns
  { pattern: /\brouter\.(get|post|put|patch|delete|use)\s*\(/g, role: 'route', weight: 0.8 },
  { pattern: /\bRouter\s*\(\s*\)/g, role: 'route', weight: 0.7 },

  // Test patterns
  { pattern: /\b(describe|it|test|expect|jest|vitest|beforeEach|afterEach)\s*\(/g, role: 'test', weight: 0.8 },
];

/**
 * Drift rules: which roles should NOT import/use which other roles.
 */
const DRIFT_RULES: Array<{
  sourceRole: string;
  forbiddenPattern: RegExp;
  forbiddenRole: string;
  severity: 'major' | 'minor' | 'suggestion';
  description: string;
}> = [
  {
    sourceRole: 'controller',
    forbiddenPattern: /\b(query|pool\.query|\.execute)\s*\(|SELECT\s+.*FROM|INSERT\s+INTO/gi,
    forbiddenRole: 'repository',
    severity: 'major',
    description: 'Controller contains direct database access. Use a service/repository layer instead.',
  },
  {
    sourceRole: 'controller',
    forbiddenPattern: /\bnew\s+(Pool|Client|Sequelize|PrismaClient|DataSource)\b/g,
    forbiddenRole: 'repository',
    severity: 'major',
    description: 'Controller instantiates a database client directly. Inject via service layer.',
  },
  {
    sourceRole: 'route',
    forbiddenPattern: /\b(query|pool\.query)\s*\(/g,
    forbiddenRole: 'repository',
    severity: 'major',
    description: 'Route file contains direct database queries. Use controllers and services.',
  },
  {
    sourceRole: 'service',
    forbiddenPattern: /\bres\.(json|send|status)\b/g,
    forbiddenRole: 'controller',
    severity: 'minor',
    description: 'Service layer references HTTP response object. Services should return data, not send responses.',
  },
  {
    sourceRole: 'util',
    forbiddenPattern: /\b(req|request)\s*[,:]\s*(Request|AuthenticatedRequest)/g,
    forbiddenRole: 'controller',
    severity: 'minor',
    description: 'Utility function depends on HTTP request objects. Keep utils framework-agnostic.',
  },
  {
    sourceRole: 'model',
    forbiddenPattern: /\bimport\s+.*from\s+['"]\.\.\/(controller|route)/g,
    forbiddenRole: 'controller',
    severity: 'minor',
    description: 'Model imports from controller/route layer. Models should be independent of HTTP layer.',
  },
];

/**
 * Extract architectural patterns from a file based on its path and content.
 * Used during indexing to build repo architecture profiles.
 */
export function extractArchitecturePatterns(filePath: string, content: string): ArchitecturePattern[] {
  const patternScores = new Map<string, number>();

  // Path-based classification
  for (const { pattern, role } of PATH_ROLE_PATTERNS) {
    if (pattern.test(filePath)) {
      patternScores.set(role, (patternScores.get(role) || 0) + 0.5);
    }
  }

  // Content-based classification
  for (const { pattern, role, weight } of CONTENT_ROLE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      // Weight by number of matches (capped at 3)
      const matchWeight = Math.min(matches.length, 3) * weight / 3;
      patternScores.set(role, (patternScores.get(role) || 0) + matchWeight);
    }
  }

  // Convert to array and normalize scores to 0-1
  const patterns: ArchitecturePattern[] = [];
  for (const [role, score] of patternScores) {
    const confidence = Math.min(score, 1.0);
    if (confidence >= 0.3) { // Threshold: at least 0.3 confidence
      patterns.push({ role, confidence: Math.round(confidence * 100) / 100 });
    }
  }

  // Sort by confidence descending
  patterns.sort((a, b) => b.confidence - a.confidence);

  return patterns;
}

// --- DB operations ---

/**
 * Save architecture profile for a file (upsert).
 */
export async function saveArchitectureProfile(
  repoId: string,
  filePath: string,
  patterns: ArchitecturePattern[]
): Promise<void> {
  await query(
    `INSERT INTO repo_architecture_profile (repo_id, file_path, detected_patterns)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (repo_id, file_path)
     DO UPDATE SET detected_patterns = $3::jsonb, updated_at = NOW()`,
    [repoId, filePath, JSON.stringify(patterns)]
  );
}

/**
 * Delete architecture profile for a file.
 */
export async function deleteArchitectureProfile(
  repoId: string,
  filePath: string
): Promise<void> {
  await query(
    'DELETE FROM repo_architecture_profile WHERE repo_id = $1 AND file_path = $2',
    [repoId, filePath]
  );
}

/**
 * Get architecture profiles for files in the current MR.
 */
export async function getArchitectureProfiles(
  repoId: string,
  filePaths: string[]
): Promise<Map<string, ArchitecturePattern[]>> {
  if (filePaths.length === 0) return new Map();

  const placeholders = filePaths.map((_, i) => `$${i + 2}`).join(', ');
  const result = await query<ArchitectureProfileRow & { [key: string]: unknown }>(
    `SELECT file_path, detected_patterns FROM repo_architecture_profile
     WHERE repo_id = $1 AND file_path IN (${placeholders})`,
    [repoId, ...filePaths]
  );

  const map = new Map<string, ArchitecturePattern[]>();
  for (const row of result.rows) {
    const patterns = typeof row.detected_patterns === 'string'
      ? JSON.parse(row.detected_patterns)
      : row.detected_patterns;
    map.set(row.file_path, patterns);
  }
  return map;
}

// --- Drift detection (used during MR review) ---

/**
 * Strip single-line comments, multi-line comments, and string literals
 * from code so that regex drift patterns don't match inside them.
 */
function stripCommentsAndStrings(code: string): string {
  return code
    // Multi-line comments: /* ... */
    // Preserve newlines so line count stays 1:1 with original
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    // Single-line comments: // ...
    // Be careful not to match // inside strings — since we strip comments first
    // and strings after, URLs like "https://..." may get partially mangled.
    // This is acceptable for heuristic drift detection.
    .replace(/\/\/.*$/gm, '')
    // Hash comments: # ... (Python, Ruby, etc.)
    .replace(/#.*$/gm, '')
    // Template literals: `...` (single-line only to preserve line count)
    .replace(/`[^`\n]*`/g, '""')
    // Double-quoted strings
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    // Single-quoted strings
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

/** Minimum confidence to use a file's primary role for drift detection */
const MIN_DRIFT_CONFIDENCE = 0.5;

/**
 * Detect architectural drift in MR changes.
 * Compares added code against the file's established architectural role.
 * Returns comments for any drift violations found.
 *
 * Comments and string literals are stripped before matching to avoid
 * false positives from SQL in comments, log messages, etc.
 */
export async function detectArchitecturalDrift(
  repoId: string,
  diffChunks: DiffChunk[]
): Promise<AIReviewComment[]> {
  const driftComments: AIReviewComment[] = [];

  try {
    const filePaths = diffChunks.map((c) => c.filePath);
    const profiles = await getArchitectureProfiles(repoId, filePaths);

    for (const chunk of diffChunks) {
      const patterns = profiles.get(chunk.filePath);
      if (!patterns || patterns.length === 0) continue;

      // Get the primary role — require minimum confidence to avoid misclassification
      const primary = patterns[0];
      if (!primary || primary.confidence < MIN_DRIFT_CONFIDENCE) continue;
      const primaryRole = primary.role;

      // Extract added lines from diff
      const addedLines = extractAddedLines(chunk.diff);
      if (addedLines.length === 0) continue;

      // Strip comments and strings to avoid false positives
      const rawContent = addedLines.map((l) => l.content).join('\n');
      const cleanContent = stripCommentsAndStrings(rawContent);

      // Check drift rules for this role
      for (const rule of DRIFT_RULES) {
        if (rule.sourceRole !== primaryRole) continue;

        // Reset regex
        rule.forbiddenPattern.lastIndex = 0;
        const match = rule.forbiddenPattern.exec(cleanContent);
        if (match) {
          // Map match offset back to original added lines for line number
          const matchOffset = match.index;
          let charCount = 0;
          let matchLineIdx = 0;
          // Use the clean content line lengths (which may differ from raw)
          const cleanLines = cleanContent.split('\n');
          for (let i = 0; i < cleanLines.length; i++) {
            charCount += cleanLines[i].length + 1;
            if (charCount > matchOffset) {
              matchLineIdx = i;
              break;
            }
          }

          // Map back to original line number (clean lines are 1:1 with added lines)
          const lineNumber = addedLines[matchLineIdx]?.lineNumber || 1;

          driftComments.push({
            file_path: chunk.filePath,
            line_number: lineNumber,
            severity: rule.severity,
            comment: `[DRIFT] ${rule.description} (file role: ${primaryRole}, confidence: ${primary.confidence})`,
          });

          // One drift comment per rule per file
          break;
        }
      }
    }
  } catch (error) {
    logger.warn('Architectural drift detection failed (non-critical)', {
      error: (error as Error).message,
    });
  }

  return driftComments;
}

// --- Helpers ---

function extractAddedLines(diff: string): Array<{ lineNumber: number; content: string }> {
  const lines = diff.split('\n');
  const addedLines: Array<{ lineNumber: number; content: string }> = [];
  let currentNewLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({
        lineNumber: currentNewLine,
        content: line.substring(1),
      });
      currentNewLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line — don't increment new line counter
    } else {
      // Context line
      currentNewLine++;
    }
  }

  return addedLines;
}
