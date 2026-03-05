import { ParsedMrUrl, DiffLineInfo } from './types';

/**
 * Parses a GitLab MR URL to extract project path and MR IID.
 *
 * Supports formats:
 *   https://gitlab.company.com/group/subgroup/project/-/merge_requests/123
 *   https://gitlab.company.com/group/project/-/merge_requests/123
 *   group/project!123  (shorthand)
 */
export function parseMrUrl(input: string): ParsedMrUrl {
  // Try full URL pattern
  const urlPattern = /^https?:\/\/[^/]+\/(.+)\/-\/merge_requests\/(\d+)\/?$/;
  const urlMatch = input.match(urlPattern);
  if (urlMatch) {
    return {
      projectPath: urlMatch[1],
      mrIid: parseInt(urlMatch[2], 10),
    };
  }

  // Try shorthand: group/project!123
  const shorthandPattern = /^(.+)!(\d+)$/;
  const shorthandMatch = input.match(shorthandPattern);
  if (shorthandMatch) {
    return {
      projectPath: shorthandMatch[1],
      mrIid: parseInt(shorthandMatch[2], 10),
    };
  }

  throw new Error(
    'Invalid MR URL format. Expected: https://gitlab.example.com/group/project/-/merge_requests/123'
  );
}

/**
 * Parse a diff string to extract changed line numbers (new side).
 * Returns a set of line numbers that were added or modified.
 */
export function parseChangedLineNumbers(diff: string): Set<number> {
  const changedLines = new Set<number>();
  const lines = diff.split('\n');
  let currentNewLine = 0;

  for (const line of lines) {
    // Parse hunk headers: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      changedLines.add(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed lines don't increment new line counter
      continue;
    } else {
      // Context line
      currentNewLine++;
    }
  }

  return changedLines;
}

/**
 * Parse a diff string to build a complete map of all lines visible in the diff.
 *
 * GitLab's MR discussions API requires precise position parameters:
 * - Added lines ('+') → only new_line
 * - Removed lines ('-') → only old_line
 * - Context lines (unchanged) → both old_line AND new_line
 *
 * Returns a Map keyed by new_line number for added/context lines,
 * and by negative old_line for removed lines (to avoid key collision).
 * Also returns a separate lookup array sorted by new_line for nearest-line search.
 */
export function parseDiffLineMap(diff: string): {
  /** Map from new_line → DiffLineInfo for added/context lines */
  byNewLine: Map<number, DiffLineInfo>;
  /** All lines in the diff, sorted by new_line (null new_lines at end) */
  allLines: DiffLineInfo[];
} {
  const byNewLine = new Map<number, DiffLineInfo>();
  const allLines: DiffLineInfo[] = [];
  const lines = diff.split('\n');
  let currentNewLine = 0;
  let currentOldLine = 0;

  for (const line of lines) {
    // Parse hunk headers: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentOldLine = parseInt(hunkMatch[1], 10);
      currentNewLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    // Skip diff header lines
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    // Skip "\ No newline at end of file"
    if (line.startsWith('\\')) continue;

    if (line.startsWith('+')) {
      // Added line: only new_line
      const info: DiffLineInfo = { type: 'added', old_line: null, new_line: currentNewLine };
      byNewLine.set(currentNewLine, info);
      allLines.push(info);
      currentNewLine++;
    } else if (line.startsWith('-')) {
      // Removed line: only old_line
      const info: DiffLineInfo = { type: 'removed', old_line: currentOldLine, new_line: null };
      allLines.push(info);
      currentOldLine++;
    } else {
      // Context line: both old_line and new_line
      const info: DiffLineInfo = { type: 'context', old_line: currentOldLine, new_line: currentNewLine };
      byNewLine.set(currentNewLine, info);
      allLines.push(info);
      currentNewLine++;
      currentOldLine++;
    }
  }

  return { byNewLine, allLines };
}

/**
 * Find the nearest line in the diff map to the target new_line number.
 * Returns the DiffLineInfo if found within tolerance, or null.
 *
 * Prefers: exact match > added lines nearby > context lines nearby
 * This ensures comments land on the most relevant line in the diff.
 */
export function findNearestDiffLine(
  diffMap: Map<number, DiffLineInfo>,
  targetNewLine: number,
  tolerance: number = 5
): DiffLineInfo | null {
  // Exact match
  const exact = diffMap.get(targetNewLine);
  if (exact) return exact;

  // Search within tolerance, preferring added lines over context lines
  let bestMatch: DiffLineInfo | null = null;
  let bestDistance = tolerance + 1;
  let bestIsAdded = false;

  for (let offset = 1; offset <= tolerance; offset++) {
    for (const dir of [targetNewLine - offset, targetNewLine + offset]) {
      const info = diffMap.get(dir);
      if (!info) continue;

      const distance = offset;
      const isAdded = info.type === 'added';

      // Prefer added lines; at same distance prefer added over context
      if (
        distance < bestDistance ||
        (distance === bestDistance && isAdded && !bestIsAdded)
      ) {
        bestMatch = info;
        bestDistance = distance;
        bestIsAdded = isAdded;
      }
    }
  }

  return bestMatch;
}
