/**
 * ImpactRadiusCard — Shows dependency impact radius for the MR.
 *
 * Displays:
 * - Impact radius number (how many files are transitively affected)
 * - High impact warning indicator
 * - Expandable list of affected files
 * - Per-file direct dependent counts
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { ImpactAnalysisData } from '../../services/api';

interface ImpactRadiusCardProps {
  impact: ImpactAnalysisData;
  className?: string;
}

export function ImpactRadiusCard({ impact, className }: ImpactRadiusCardProps) {
  const [expanded, setExpanded] = useState(false);

  const radiusColor = impact.isHighImpact
    ? 'text-red-600 dark:text-red-400'
    : impact.impactRadius > 5
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-green-600 dark:text-green-400';

  const bgColor = impact.isHighImpact
    ? 'bg-red-50 dark:bg-red-950/30'
    : impact.impactRadius > 5
      ? 'bg-amber-50 dark:bg-amber-950/30'
      : 'bg-green-50 dark:bg-green-950/30';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'border border-border rounded-xl overflow-hidden',
        bgColor,
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Impact radius badge */}
          <div className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            impact.isHighImpact ? 'bg-red-100 dark:bg-red-900/40' : 'bg-white/60 dark:bg-white/10'
          )}>
            <span className={clsx('text-lg font-bold', radiusColor)}>
              {impact.impactRadius}
            </span>
          </div>

          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-txt-primary">Impact Radius</span>
              {impact.isHighImpact && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 rounded">
                  High
                </span>
              )}
            </div>
            <span className="text-caption text-txt-tertiary">
              {impact.directDependents.length} direct, {impact.transitiveDependents.length} transitive
            </span>
          </div>
        </div>

        {/* Chevron */}
        {(impact.directDependents.length > 0 || impact.fileImpacts.length > 0) && (
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
        )}
      </button>

      {/* Expandable details */}
      <AnimatePresence initial={false}>
        {expanded && (impact.directDependents.length > 0 || impact.fileImpacts.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t border-border-light/50">
              {/* Per-file impacts */}
              {impact.fileImpacts.length > 0 && (
                <div className="pt-3">
                  <span className="text-caption font-semibold text-txt-secondary">Changed Files</span>
                  <div className="mt-1.5 space-y-1">
                    {impact.fileImpacts.map((fi) => (
                      <div key={fi.filePath} className="flex items-center justify-between text-caption">
                        <span className="font-mono text-txt-primary truncate max-w-[200px]">{fi.filePath}</span>
                        <span className="text-txt-tertiary flex-shrink-0 ml-2">
                          {fi.directDependentCount} dep{fi.directDependentCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct dependents list */}
              {impact.directDependents.length > 0 && (
                <div className="pt-3 mt-2 border-t border-border-light/50">
                  <span className="text-caption font-semibold text-txt-secondary">
                    Affected Files ({impact.directDependents.length})
                  </span>
                  <div className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                    {impact.directDependents.slice(0, 20).map((dep) => (
                      <div key={dep} className="text-caption font-mono text-txt-tertiary truncate">
                        {dep}
                      </div>
                    ))}
                    {impact.directDependents.length > 20 && (
                      <div className="text-caption text-txt-tertiary italic">
                        +{impact.directDependents.length - 20} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
