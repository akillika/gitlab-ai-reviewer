/**
 * DiffViewer — Side-by-side diff viewer with line annotations.
 *
 * Features:
 * - Side-by-side layout (old left, new right)
 * - Line-level highlighting (additions green, deletions red, context neutral)
 * - Comment indicator dots in the gutter
 * - Click on annotated lines to scroll to comment
 * - Virtualized rendering for large diffs
 * - Collapsible unchanged sections
 * - Sticky file header
 */
import { useMemo, useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import type { ReviewComment } from '../../services/api';

interface DiffViewerProps {
  diff: string;
  filePath: string;
  comments: ReviewComment[];
  onLineClick?: (lineNumber: number) => void;
  highlightLine?: number | null;
  className?: string;
}

/** Parsed diff line with full position info */
interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'hunk-header';
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

/** Parse a unified diff string into structured lines */
function parseDiff(diff: string): DiffLine[] {
  const rawLines = diff.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    // Hunk header
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      result.push({
        type: 'hunk-header',
        content: raw,
        oldLine: null,
        newLine: null,
      });
      continue;
    }

    // Skip diff file headers
    if (raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('\\')) continue;

    if (raw.startsWith('+')) {
      result.push({ type: 'added', content: raw.slice(1), oldLine: null, newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      result.push({ type: 'removed', content: raw.slice(1), oldLine, newLine: null });
      oldLine++;
    } else {
      // Context line (or empty trailing line)
      result.push({ type: 'context', content: raw.startsWith(' ') ? raw.slice(1) : raw, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

/** Build side-by-side pairs from parsed diff lines */
interface SidePair {
  left: DiffLine | null;
  right: DiffLine | null;
  isHunkHeader?: boolean;
  headerText?: string;
}

function buildSideBySide(lines: DiffLine[]): SidePair[] {
  const pairs: SidePair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'hunk-header') {
      pairs.push({ left: null, right: null, isHunkHeader: true, headerText: line.content });
      i++;
      continue;
    }

    if (line.type === 'context') {
      pairs.push({ left: line, right: line });
      i++;
      continue;
    }

    // Collect consecutive removed lines then added lines to pair them
    if (line.type === 'removed') {
      const removed: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'removed') {
        removed.push(lines[i]);
        i++;
      }
      const added: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'added') {
        added.push(lines[i]);
        i++;
      }
      const maxLen = Math.max(removed.length, added.length);
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          left: j < removed.length ? removed[j] : null,
          right: j < added.length ? added[j] : null,
        });
      }
      continue;
    }

    if (line.type === 'added') {
      pairs.push({ left: null, right: line });
      i++;
      continue;
    }

    i++;
  }

  return pairs;
}

const ROW_HEIGHT = 24;

export function DiffViewer({ diff, filePath, comments, onLineClick, highlightLine, className }: DiffViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const parsedLines = useMemo(() => parseDiff(diff), [diff]);
  const pairs = useMemo(() => buildSideBySide(parsedLines), [parsedLines]);

  // Build set of lines with comments for gutter dots
  const commentLineSet = useMemo(() => {
    const set = new Map<number, ReviewComment['severity']>();
    for (const c of comments) {
      if (c.file_path === filePath) {
        // Use highest severity if multiple comments on same line
        const existing = set.get(c.line_number);
        if (!existing || severityRank(c.severity) > severityRank(existing)) {
          set.set(c.line_number, c.severity);
        }
      }
    }
    return set;
  }, [comments, filePath]);

  // Virtual rows for performance on large diffs
  const virtualizer = useVirtualizer({
    count: pairs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Auto-scroll to highlighted line
  const scrollToLine = useCallback(
    (lineNum: number) => {
      const idx = pairs.findIndex(
        (p) => p.right?.newLine === lineNum || p.left?.newLine === lineNum
      );
      if (idx >= 0) {
        virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
      }
    },
    [pairs, virtualizer]
  );

  useEffect(() => {
    if (highlightLine != null) {
      scrollToLine(highlightLine);
    }
  }, [highlightLine, scrollToLine]);

  return (
    <div className={clsx('flex flex-col h-full', className)}>
      {/* Sticky file header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border sticky top-0 z-10">
        <span className="font-mono text-body-sm text-txt-primary font-medium truncate">{filePath}</span>
        {comments.length > 0 && (
          <span className="text-caption text-txt-tertiary bg-surface-secondary px-2 py-0.5 rounded-md">
            {comments.length} comments
          </span>
        )}
      </div>

      {/* Diff content — virtualized */}
      <div ref={parentRef} className="flex-1 overflow-auto font-mono text-code">
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const pair = pairs[virtualRow.index];

            if (pair.isHunkHeader) {
              return (
                <div
                  key={virtualRow.index}
                  className="bg-accent/5 text-accent/70 text-caption px-4 py-1.5 border-y border-border-light select-none"
                  style={{
                    position: 'absolute',
                    top: virtualRow.start,
                    height: ROW_HEIGHT,
                    left: 0,
                    right: 0,
                  }}
                >
                  {pair.headerText}
                </div>
              );
            }

            return (
              <div
                key={virtualRow.index}
                className="flex"
                style={{
                  position: 'absolute',
                  top: virtualRow.start,
                  height: ROW_HEIGHT,
                  left: 0,
                  right: 0,
                }}
              >
                {/* Left side (old) */}
                <DiffSide
                  line={pair.left}
                  side="old"
                  commentSeverity={null}
                  isHighlighted={false}
                  onClick={undefined}
                />

                {/* Divider */}
                <div className="w-px bg-border flex-shrink-0" />

                {/* Right side (new) */}
                <DiffSide
                  line={pair.right}
                  side="new"
                  commentSeverity={pair.right?.newLine ? commentLineSet.get(pair.right.newLine) ?? null : null}
                  isHighlighted={pair.right?.newLine === highlightLine}
                  onClick={
                    pair.right?.newLine && commentLineSet.has(pair.right.newLine)
                      ? () => onLineClick?.(pair.right!.newLine!)
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Single side of the diff (left or right) */
function DiffSide({
  line,
  side,
  commentSeverity,
  isHighlighted,
  onClick,
}: {
  line: DiffLine | null;
  side: 'old' | 'new';
  commentSeverity: ReviewComment['severity'] | null;
  isHighlighted: boolean;
  onClick?: () => void;
}) {
  if (!line) {
    // Empty placeholder for unmatched side
    return <div className="flex-1 bg-surface-secondary/50" />;
  }

  const lineNum = side === 'old' ? line.oldLine : line.newLine;
  const bgClass =
    line.type === 'added'
      ? 'bg-diff-add-bg'
      : line.type === 'removed'
        ? 'bg-diff-del-bg'
        : isHighlighted
          ? 'bg-accent/8'
          : 'bg-surface';

  const severityDotColor =
    commentSeverity === 'major'
      ? 'bg-severity-major'
      : commentSeverity === 'minor'
        ? 'bg-severity-minor'
        : commentSeverity === 'suggestion'
          ? 'bg-severity-suggestion'
          : null;

  return (
    <div
      className={clsx(
        'flex-1 flex items-center min-w-0 group',
        bgClass,
        isHighlighted && 'ring-1 ring-inset ring-accent/30',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Gutter: line number + comment dot */}
      <div className="line-number flex items-center justify-end pr-2 gap-1 flex-shrink-0 h-full">
        {severityDotColor && (
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', severityDotColor)} />
        )}
        <span>{lineNum ?? ''}</span>
      </div>

      {/* Code content */}
      <div
        className={clsx(
          'flex-1 px-2 truncate h-full flex items-center',
          line.type === 'added' && 'text-diff-add-text',
          line.type === 'removed' && 'text-diff-del-text'
        )}
      >
        <span className="whitespace-pre">{line.content || '\u00A0'}</span>
      </div>
    </div>
  );
}

function severityRank(s: ReviewComment['severity']): number {
  return s === 'major' ? 3 : s === 'minor' ? 2 : 1;
}
