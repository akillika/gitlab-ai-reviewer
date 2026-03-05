/**
 * GateBadge — Displays the AI gate status for a review.
 *
 * Gate statuses:
 * - pass:    Green checkmark — all checks passed
 * - fail:    Red X — one or more checks failed
 * - warn:    Amber warning — advisory, no blocking rules
 * - no_gate: Gray — gate not configured
 *
 * Shows details on hover/click with check results.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { GateResult } from '../../services/api';

interface GateBadgeProps {
  gate: GateResult;
  className?: string;
}

const STATUS_STYLES = {
  pass: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-400',
    icon: '\u2713',
    label: 'Gate Passed',
  },
  fail: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    icon: '\u2717',
    label: 'Gate Failed',
  },
  warn: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    icon: '\u26A0',
    label: 'Advisory',
  },
  no_gate: {
    bg: 'bg-gray-50 dark:bg-gray-900/30',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-500 dark:text-gray-400',
    icon: '\u2014',
    label: 'No Gate',
  },
};

export function GateBadge({ gate, className }: GateBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);
  const style = STATUS_STYLES[gate.gate_status];

  return (
    <div className={clsx('relative inline-block', className)}>
      {/* Badge pill */}
      <button
        onClick={() => setShowDetails((p) => !p)}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-caption font-semibold transition-all',
          style.bg,
          style.border,
          style.text,
          'hover:shadow-sm'
        )}
      >
        <span className="text-xs">{style.icon}</span>
        <span>{style.label}</span>
      </button>

      {/* Details popover */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 left-0 z-50 w-72 bg-surface dark:bg-surface-dark-secondary border border-border dark:border-border-dark rounded-xl shadow-lg p-3"
          >
            {/* Reason */}
            <p className="text-body-sm text-txt-primary mb-2">{gate.reason}</p>

            {/* Individual checks */}
            {gate.checks.length > 0 && (
              <div className="space-y-1.5 border-t border-border-light pt-2">
                {gate.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={clsx(
                      'text-xs mt-0.5 flex-shrink-0',
                      check.passed
                        ? 'text-green-500'
                        : 'text-red-500'
                    )}>
                      {check.passed ? '\u2713' : '\u2717'}
                    </span>
                    <div>
                      <span className="text-caption font-medium text-txt-primary">
                        {check.name}
                      </span>
                      <p className="text-caption text-txt-tertiary">{check.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Close hint */}
            <button
              onClick={() => setShowDetails(false)}
              className="mt-2 text-caption text-txt-tertiary hover:text-txt-secondary transition-colors"
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
