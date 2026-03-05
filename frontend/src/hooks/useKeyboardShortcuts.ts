/**
 * useKeyboardShortcuts — Global keyboard shortcuts for the review workspace.
 * J/K navigation, Cmd+Enter to post, Escape to deselect.
 */
import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  onNextComment?: () => void;
  onPrevComment?: () => void;
  onPostSelected?: () => void;
  onEscape?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const isMeta = e.metaKey || e.ctrlKey;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          handlers.onNextComment?.();
          break;
        case 'k':
          e.preventDefault();
          handlers.onPrevComment?.();
          break;
        case 'Enter':
          if (isMeta) {
            e.preventDefault();
            handlers.onPostSelected?.();
          }
          break;
        case 'Escape':
          e.preventDefault();
          handlers.onEscape?.();
          break;
        case '/':
          if (!isMeta) {
            e.preventDefault();
            handlers.onSearch?.();
          }
          break;
      }
    },
    [handlers, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
