/**
 * FileTree — Collapsible file list showing changed files with severity indicators.
 * Shows file name, change type badge (A/M/D/R), comment count, and severity dots.
 * Selected file is highlighted. Smooth expand/collapse animation.
 */
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { SeverityDot } from '../ui/Badge';
import type { ReviewComment } from '../../services/api';

interface FileChange {
  oldPath: string;
  newPath: string;
  newFile: boolean;
  renamedFile: boolean;
  deletedFile: boolean;
  diff: string;
}

interface FileTreeProps {
  files: FileChange[];
  comments: ReviewComment[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  collapsed?: boolean;
}

/** Extract just the filename from a full path */
function fileName(path: string): string {
  return path.split('/').pop() || path;
}

/** Extract directory path */
function dirPath(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

/** File change type badge */
function ChangeTypeBadge({ file }: { file: FileChange }) {
  const { label, color } = file.newFile
    ? { label: 'A', color: 'bg-emerald-100 text-emerald-700' }
    : file.deletedFile
      ? { label: 'D', color: 'bg-red-100 text-red-700' }
      : file.renamedFile
        ? { label: 'R', color: 'bg-purple-100 text-purple-700' }
        : { label: 'M', color: 'bg-amber-100 text-amber-700' };

  return (
    <span className={clsx('w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0', color)}>
      {label}
    </span>
  );
}

export function FileTree({ files, comments, selectedFile, onSelectFile, collapsed }: FileTreeProps) {
  // Pre-compute comment counts and severities per file
  const fileStats = useMemo(() => {
    const stats = new Map<string, { total: number; major: number; minor: number; suggestion: number }>();
    for (const c of comments) {
      const s = stats.get(c.file_path) || { total: 0, major: 0, minor: 0, suggestion: 0 };
      s.total++;
      s[c.severity]++;
      stats.set(c.file_path, s);
    }
    return stats;
  }, [comments]);

  if (collapsed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: 'auto' }}
        exit={{ opacity: 0, width: 0 }}
        className="flex flex-col h-full"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-caption font-semibold text-txt-secondary uppercase tracking-wider">
            Changed Files
          </h3>
          <span className="text-caption text-txt-tertiary">{files.length} files</span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto py-1">
          {files.map((file) => {
            const path = file.newPath;
            const stats = fileStats.get(path);
            const isSelected = selectedFile === path;
            const dir = dirPath(path);

            return (
              <motion.button
                key={path}
                onClick={() => onSelectFile(path)}
                whileTap={{ scale: 0.98 }}
                className={clsx(
                  'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors duration-150',
                  'hover:bg-surface-secondary',
                  isSelected && 'bg-accent/8 border-l-2 border-accent',
                  !isSelected && 'border-l-2 border-transparent'
                )}
              >
                <ChangeTypeBadge file={file} />

                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium text-txt-primary truncate">
                    {fileName(path)}
                  </div>
                  {dir && (
                    <div className="text-caption text-txt-tertiary truncate">{dir}</div>
                  )}
                </div>

                {/* Severity dots & count */}
                {stats && stats.total > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {stats.major > 0 && <SeverityDot severity="major" />}
                    {stats.minor > 0 && <SeverityDot severity="minor" />}
                    {stats.suggestion > 0 && <SeverityDot severity="suggestion" />}
                    <span className="text-caption text-txt-tertiary ml-0.5">
                      {stats.total}
                    </span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
