/**
 * MRSummaryCard — Displays the AI-generated structured MR summary.
 *
 * Three perspectives:
 * - Technical: What changed technically
 * - Business: User-facing / business impact
 * - Risk: Potential risks and areas needing attention
 *
 * Plus a one-liner release note.
 * Collapsed by default to avoid clutter; expands with smooth animation.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { MRSummaryData } from '../../services/api';

interface MRSummaryCardProps {
  summary: MRSummaryData;
  className?: string;
}

const SECTIONS: Array<{
  key: keyof MRSummaryData;
  label: string;
  icon: string;
  color: string;
}> = [
  {
    key: 'technical_summary',
    label: 'Technical',
    icon: '\u2699\uFE0F',
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    key: 'business_summary',
    label: 'Business Impact',
    icon: '\uD83D\uDCBC',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'risk_summary',
    label: 'Risk Assessment',
    icon: '\u26A0\uFE0F',
    color: 'text-amber-600 dark:text-amber-400',
  },
];

export function MRSummaryCard({ summary, className }: MRSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={clsx(
        'border border-border rounded-xl bg-surface overflow-hidden',
        className
      )}
    >
      {/* Header — acts as toggle */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-body-sm font-semibold text-txt-primary">
              MR Summary
            </span>
          </div>
        </div>

        {/* Release note preview (when collapsed) */}
        {!expanded && summary.release_note && (
          <span className="text-caption text-txt-tertiary truncate max-w-[300px] mr-3">
            {summary.release_note}
          </span>
        )}

        {/* Chevron */}
        <motion.svg
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-txt-tertiary flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border-light">
              {/* Summary sections */}
              {SECTIONS.map(({ key, label, icon, color }) => {
                const text = summary[key];
                if (!text) return null;
                return (
                  <div key={key} className="pt-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-sm">{icon}</span>
                      <span className={clsx('text-caption font-semibold', color)}>{label}</span>
                    </div>
                    <p className="text-body-sm text-txt-primary leading-relaxed pl-6">
                      {text}
                    </p>
                  </div>
                );
              })}

              {/* Release note */}
              {summary.release_note && (
                <div className="pt-3 border-t border-border-light">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">{'\uD83D\uDCDD'}</span>
                    <span className="text-caption font-semibold text-purple-600 dark:text-purple-400">
                      Release Note
                    </span>
                  </div>
                  <p className="text-body-sm text-txt-primary font-medium pl-6 italic">
                    {summary.release_note}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
