/**
 * ruleEngine.ts — Simple regex-based architecture rule engine.
 *
 * Scans diff lines against a set of rules loaded from the `architecture_rules`
 * database table. When a pattern matches an added line, produces a structured
 * comment referencing the violated rule.
 *
 * Rules are simple: regex or keyword patterns against added diff lines.
 * This is intentionally NOT a full AST-based linter — just a fast, lightweight
 * first-pass that catches common anti-patterns (e.g., direct repo access from
 * controllers, raw SQL in service layers, etc.).
 *
 * Graceful degradation: if DB query or regex fails, returns empty array.
 */

import { query } from '../utils/db';
import { AIReviewComment, DiffChunk } from '../ai/types';
import { logger } from '../utils/logger';

// --- DB types ---

interface ArchitectureRuleRow {
  id: number;
  rule_name: string;
  rule_description: string;
  pattern_to_detect: string;
  severity: 'major' | 'minor' | 'suggestion';
  file_pattern: string | null;
  enabled: boolean;
  [key: string]: unknown;
}

// --- Public API ---

/**
 * Loads all enabled architecture rules from the database and scans
 * the MR diffs against them.
 *
 * @param diffChunks The MR's diff chunks to scan.
 * @returns Comments for any rule violations found, or [] on failure.
 */
export async function runRuleEngine(
  diffChunks: DiffChunk[]
): Promise<AIReviewComment[]> {
  try {
    const rules = await loadRules();
    if (rules.length === 0) return [];

    const comments: AIReviewComment[] = [];

    for (const chunk of diffChunks) {
      const fileViolations = scanFileAgainstRules(chunk, rules);
      comments.push(...fileViolations);
    }

    if (comments.length > 0) {
      logger.info('Rule engine found violations', { count: comments.length });
    }

    return comments;
  } catch (error) {
    // Graceful degradation: log but continue
    logger.warn('Rule engine failed, skipping', {
      error: (error as Error).message,
    });
    return [];
  }
}

// --- Internal helpers ---

/**
 * Load all enabled architecture rules from the database.
 * Compiles regex patterns and caches them.
 */
async function loadRules(): Promise<CompiledRule[]> {
  const result = await query<ArchitectureRuleRow>(
    'SELECT * FROM architecture_rules WHERE enabled = TRUE ORDER BY id'
  );

  const compiled: CompiledRule[] = [];

  for (const row of result.rows) {
    try {
      compiled.push({
        id: row.id,
        ruleName: row.rule_name,
        ruleDescription: row.rule_description,
        pattern: new RegExp(row.pattern_to_detect, 'i'),
        severity: row.severity,
        filePattern: row.file_pattern ? new RegExp(row.file_pattern, 'i') : null,
      });
    } catch (error) {
      // Skip rules with invalid regex
      logger.warn('Skipping rule with invalid regex', {
        ruleId: row.id,
        ruleName: row.rule_name,
        pattern: row.pattern_to_detect,
        error: (error as Error).message,
      });
    }
  }

  return compiled;
}

interface CompiledRule {
  id: number;
  ruleName: string;
  ruleDescription: string;
  pattern: RegExp;
  severity: 'major' | 'minor' | 'suggestion';
  /** Optional: only apply this rule to files matching this pattern */
  filePattern: RegExp | null;
}

/**
 * Scan a single file's diff against all rules.
 * Only scans added lines ('+' prefix in diff).
 */
function scanFileAgainstRules(
  chunk: DiffChunk,
  rules: CompiledRule[]
): AIReviewComment[] {
  const comments: AIReviewComment[] = [];
  const lines = chunk.diff.split('\n');
  let currentNewLine = 0;

  // Track which rules already fired for this file (one violation per rule per file)
  const firedRules = new Set<number>();

  for (const line of lines) {
    // Parse hunk header to track line numbers
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Only check added lines
    const isAdded = line.startsWith('+') && !line.startsWith('+++');
    const isContext = !line.startsWith('-') && !line.startsWith('+') && !line.startsWith('\\');

    if (isAdded) {
      const codeContent = line.substring(1); // Strip the '+' prefix

      for (const rule of rules) {
        if (firedRules.has(rule.id)) continue;

        // If rule has a file pattern, check if this file matches
        if (rule.filePattern && !rule.filePattern.test(chunk.filePath)) {
          continue;
        }

        if (rule.pattern.test(codeContent)) {
          comments.push({
            file_path: chunk.filePath,
            line_number: currentNewLine,
            severity: rule.severity,
            comment: `**Architecture Rule: ${rule.ruleName}** — ${rule.ruleDescription}`,
          });
          firedRules.add(rule.id);
        }
      }
    }

    // Advance line counter for added and context lines (not removed lines)
    if (isAdded || isContext) {
      currentNewLine++;
    }
  }

  return comments;
}
