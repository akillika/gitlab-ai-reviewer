/**
 * TestSuggestionsPanel — Collapsible panel showing AI-generated test case suggestions.
 *
 * Displays 3-5 test case descriptions focusing on edge cases and failure scenarios.
 * Collapsed by default to avoid clutter; expands with a smooth animation.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { TestSuggestion } from '../../services/api';

interface TestSuggestionsPanelProps {
  suggestions: TestSuggestion[];
  className?: string;
}

export function TestSuggestionsPanel({ suggestions, className }: TestSuggestionsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (suggestions.length === 0) return null;

  return (
    <div
      className={clsx(
        'border border-border rounded-xl bg-surface overflow-hidden',
        className
      )}
    >
      {/* Header — always visible, acts as toggle */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
              />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-body-sm font-semibold text-txt-primary">
              Test Suggestions
            </span>
            <span className="text-caption text-txt-tertiary ml-2">
              {suggestions.length} {suggestions.length === 1 ? 'case' : 'cases'}
            </span>
          </div>
        </div>

        {/* Chevron */}
        <motion.svg
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-txt-tertiary"
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
            <div className="px-4 pb-3 space-y-2 border-t border-border-light">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex gap-3 py-2.5 first:pt-3"
                >
                  {/* Numbered circle */}
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center mt-0.5">
                    <span className="text-[10px] font-bold text-accent">{index + 1}</span>
                  </div>
                  {/* Description */}
                  <p className="text-body-sm text-txt-primary leading-relaxed">
                    {suggestion.description}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
