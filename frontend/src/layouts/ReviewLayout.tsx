/**
 * ReviewLayout — Three-pane split layout for the review workspace.
 *
 * Layout:
 * ┌──────────┬───────────────────────────────┬──────────────────┐
 * │ FileTree │       DiffViewer (center)      │ AI Suggestions   │
 * │  (left)  │                               │   (right)         │
 * │ 240px    │        flex-1                 │   360px          │
 * └──────────┴───────────────────────────────┴──────────────────┘
 *
 * - Left pane collapsible
 * - Right pane collapsible
 * - Responsive: stacks on small screens
 */
import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ReviewLayoutProps {
  /** Summary bar (full width at top) */
  summary: ReactNode;
  /** File tree (left pane) */
  fileTree: ReactNode;
  /** Diff viewer (center pane) */
  diffViewer: ReactNode;
  /** AI suggestions panel (right pane) */
  suggestionsPanel: ReactNode;
  /** Optional alert bar below summary */
  alert?: ReactNode;
}

export function ReviewLayout({ summary, fileTree, diffViewer, suggestionsPanel, alert }: ReviewLayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-surface dark:bg-surface-dark overflow-hidden">
      {/* Summary bar — full width */}
      {summary}

      {/* Alert */}
      {alert}

      {/* Three-pane workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left pane — File Tree */}
        <AnimatePresence initial={false}>
          {!leftCollapsed && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="border-r border-border dark:border-border-dark bg-surface dark:bg-surface-dark overflow-hidden flex-shrink-0"
            >
              {fileTree}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse toggle (left) */}
        <button
          onClick={() => setLeftCollapsed((p) => !p)}
          className={clsx(
            'w-5 flex items-center justify-center flex-shrink-0',
            'bg-surface-secondary/50 hover:bg-surface-secondary dark:bg-surface-dark-secondary/50 dark:hover:bg-surface-dark-secondary',
            'text-txt-tertiary hover:text-txt-secondary transition-colors border-r border-border dark:border-border-dark'
          )}
          aria-label={leftCollapsed ? 'Show file tree' : 'Hide file tree'}
        >
          <span className="text-[10px]">{leftCollapsed ? '\u25B6' : '\u25C0'}</span>
        </button>

        {/* Center pane — Diff Viewer */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {diffViewer}
        </div>

        {/* Collapse toggle (right) */}
        <button
          onClick={() => setRightCollapsed((p) => !p)}
          className={clsx(
            'w-5 flex items-center justify-center flex-shrink-0',
            'bg-surface-secondary/50 hover:bg-surface-secondary dark:bg-surface-dark-secondary/50 dark:hover:bg-surface-dark-secondary',
            'text-txt-tertiary hover:text-txt-secondary transition-colors border-l border-border dark:border-border-dark'
          )}
          aria-label={rightCollapsed ? 'Show suggestions' : 'Hide suggestions'}
        >
          <span className="text-[10px]">{rightCollapsed ? '\u25C0' : '\u25B6'}</span>
        </button>

        {/* Right pane — AI Suggestions */}
        <AnimatePresence initial={false}>
          {!rightCollapsed && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="border-l border-border dark:border-border-dark bg-surface dark:bg-surface-dark overflow-hidden flex-shrink-0"
            >
              {suggestionsPanel}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
