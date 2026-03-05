/**
 * AISuggestionsPanel — Right pane showing AI review comments.
 *
 * Features:
 * - Grouped by file, sorted by severity
 * - Severity filter toggle (major/minor/suggestion)
 * - Severity badge, line number, clean explanation
 * - Duplicate logic comments displayed with distinct icon
 * - Edit, delete, post to GitLab actions
 * - Checkbox selection for batch posting
 * - Slide-in animation
 * - Keyboard shortcut hints
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { ReviewComment } from '../../services/api';

type SeverityFilter = 'all' | 'major' | 'minor' | 'suggestion';

interface AISuggestionsPanelProps {
  comments: ReviewComment[];
  selectedFile: string | null;
  activeCommentId: number | null;
  onCommentClick: (comment: ReviewComment) => void;
  onEdit: (commentId: number, updates: { comment?: string; severity?: string }) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onPost: (commentId: number) => Promise<void>;
  onPostSelected: (ids: number[]) => Promise<void>;
  postingId: number | null;
  postingAll: boolean;
  hasDiffRefs: boolean;
}

export function AISuggestionsPanel({
  comments,
  selectedFile,
  activeCommentId,
  onCommentClick,
  onEdit,
  onDelete,
  onPost,
  onPostSelected,
  postingId,
  postingAll,
  hasDiffRefs,
}: AISuggestionsPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const commentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Filter to selected file, then by severity
  const displayComments = useMemo(() => {
    let filtered = selectedFile
      ? comments.filter((c) => c.file_path === selectedFile)
      : comments;

    // Apply severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter((c) => c.severity === severityFilter);
    }

    // Sort: major first, then minor, then suggestion; within same severity by line
    return [...filtered].sort((a, b) => {
      const rank = (s: string) => (s === 'major' ? 0 : s === 'minor' ? 1 : 2);
      return rank(a.severity) - rank(b.severity) || a.line_number - b.line_number;
    });
  }, [comments, selectedFile, severityFilter]);

  // Auto-scroll to active comment
  useEffect(() => {
    if (activeCommentId != null) {
      const el = commentRefs.current.get(activeCommentId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCommentId]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handlePostSelected = async () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const c = comments.find((c) => c.id === id);
      return c && !c.posted;
    });
    if (ids.length > 0) {
      await onPostSelected(ids);
      setSelectedIds(new Set());
    }
  };

  const unpostedSelected = Array.from(selectedIds).filter((id) => {
    const c = comments.find((c) => c.id === id);
    return c && !c.posted;
  });

  // Severity counts for the file/all context
  const scopedComments = selectedFile
    ? comments.filter((c) => c.file_path === selectedFile)
    : comments;
  const majorCount = scopedComments.filter((c) => c.severity === 'major').length;
  const minorCount = scopedComments.filter((c) => c.severity === 'minor').length;
  const suggestionCount = scopedComments.filter((c) => c.severity === 'suggestion').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-caption font-semibold text-txt-secondary uppercase tracking-wider">
            AI Suggestions
          </h3>
          <span className="text-caption text-txt-tertiary">
            {displayComments.length} comments
            {selectedFile && ' in file'}
          </span>
        </div>
        {unpostedSelected.length > 0 && hasDiffRefs && (
          <Button
            size="sm"
            variant="primary"
            onClick={handlePostSelected}
            loading={postingAll}
          >
            Post Selected ({unpostedSelected.length})
          </Button>
        )}
      </div>

      {/* Severity filter toggle */}
      <div className="px-4 py-2 border-b border-border-light flex gap-1.5">
        <FilterChip
          label="All"
          count={scopedComments.length}
          active={severityFilter === 'all'}
          onClick={() => setSeverityFilter('all')}
        />
        <FilterChip
          label="Major"
          count={majorCount}
          active={severityFilter === 'major'}
          onClick={() => setSeverityFilter('major')}
          dotColor="bg-severity-major"
        />
        <FilterChip
          label="Minor"
          count={minorCount}
          active={severityFilter === 'minor'}
          onClick={() => setSeverityFilter('minor')}
          dotColor="bg-severity-minor"
        />
        <FilterChip
          label="Suggestion"
          count={suggestionCount}
          active={severityFilter === 'suggestion'}
          onClick={() => setSeverityFilter('suggestion')}
          dotColor="bg-severity-suggestion"
        />
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {displayComments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 px-4 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mb-3">
                <span className="text-xl text-txt-tertiary">{'\u2714'}</span>
              </div>
              <p className="text-body-sm text-txt-secondary font-medium">
                {severityFilter !== 'all' ? `No ${severityFilter} issues` : 'No issues found'}
              </p>
              <p className="text-caption text-txt-tertiary mt-1">
                {severityFilter !== 'all'
                  ? 'Try selecting a different filter.'
                  : selectedFile
                    ? 'This file looks clean.'
                    : 'No AI comments for this review.'}
              </p>
            </motion.div>
          ) : (
            displayComments.map((comment, index) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                index={index}
                isActive={activeCommentId === comment.id}
                isSelected={selectedIds.has(comment.id)}
                isEditing={editingId === comment.id}
                onCommentClick={onCommentClick}
                onToggleSelect={toggleSelect}
                onStartEdit={setEditingId}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={async (id, updates) => {
                  await onEdit(id, updates);
                  setEditingId(null);
                }}
                onDelete={onDelete}
                onPost={onPost}
                postingId={postingId}
                hasDiffRefs={hasDiffRefs}
                refCallback={(el) => {
                  if (el) commentRefs.current.set(comment.id, el);
                  else commentRefs.current.delete(comment.id);
                }}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Keyboard shortcut hints */}
      <div className="px-4 py-2 border-t border-border-light flex gap-3 text-caption text-txt-tertiary">
        <span><kbd className="px-1 py-0.5 bg-surface-secondary rounded text-[10px]">J</kbd> Next</span>
        <span><kbd className="px-1 py-0.5 bg-surface-secondary rounded text-[10px]">K</kbd> Prev</span>
        <span><kbd className="px-1 py-0.5 bg-surface-secondary rounded text-[10px]">{'\u2318'}+\u23CE</kbd> Post</span>
      </div>
    </div>
  );
}

/* ─── Severity filter chip ─── */

function FilterChip({
  label,
  count,
  active,
  onClick,
  dotColor,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-medium transition-colors',
        active
          ? 'bg-accent/10 text-accent'
          : 'text-txt-tertiary hover:bg-surface-secondary hover:text-txt-secondary'
      )}
    >
      {dotColor && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColor)} />}
      {label}
      <span className={clsx(
        'text-[10px] font-bold',
        active ? 'text-accent' : 'text-txt-tertiary'
      )}>
        {count}
      </span>
    </button>
  );
}

/* ─── Individual comment card ─── */

interface CommentItemProps {
  comment: ReviewComment;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onCommentClick: (comment: ReviewComment) => void;
  onToggleSelect: (id: number) => void;
  onStartEdit: (id: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: number, updates: { comment?: string; severity?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPost: (id: number) => Promise<void>;
  postingId: number | null;
  hasDiffRefs: boolean;
  refCallback: (el: HTMLDivElement | null) => void;
}

/** Check if a comment is a duplicate logic detection comment (from duplicateDetector) */
function isDuplicateComment(comment: ReviewComment): boolean {
  return comment.comment.includes('Similar logic exists in') && comment.comment.includes('similarity');
}

/** Check if a comment is an architecture rule violation (from ruleEngine) */
function isRuleViolation(comment: ReviewComment): boolean {
  return comment.comment.startsWith('**Architecture Rule:');
}

function CommentItem({
  comment,
  index,
  isActive,
  isSelected,
  isEditing,
  onCommentClick,
  onToggleSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onPost,
  postingId,
  hasDiffRefs,
  refCallback,
}: CommentItemProps) {
  const [editText, setEditText] = useState(comment.comment);
  const [editSeverity, setEditSeverity] = useState(comment.severity);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDuplicate = isDuplicateComment(comment);
  const isRule = isRuleViolation(comment);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveEdit(comment.id, {
        comment: editText !== comment.comment ? editText : undefined,
        severity: editSeverity !== comment.severity ? editSeverity : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      ref={refCallback}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className={clsx(
        'border-b border-border-light px-4 py-3 transition-colors duration-150',
        isActive && 'bg-accent/5',
        !isActive && 'hover:bg-surface-secondary/50'
      )}
    >
      {/* Top row: checkbox, severity, source tag, line, posted status */}
      <div className="flex items-center gap-2 mb-2">
        {!comment.posted && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(comment.id)}
            className="w-3.5 h-3.5 rounded border-border text-accent focus:ring-accent/40 cursor-pointer"
          />
        )}
        <Badge variant={comment.severity} dot>
          {comment.severity.toUpperCase()}
        </Badge>
        {/* Source tag for special comment types */}
        {isDuplicate && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-[10px] font-semibold text-purple-700 dark:text-purple-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            DUP
          </span>
        )}
        {isRule && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-[10px] font-semibold text-orange-700 dark:text-orange-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            RULE
          </span>
        )}
        <span className="text-caption text-txt-tertiary font-mono">
          Line {comment.line_number}
        </span>
        {comment.posted && (
          <Badge variant="success">Posted</Badge>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onCommentClick(comment)}
          className="text-caption text-accent hover:underline"
        >
          View in diff
        </button>
      </div>

      {/* Comment body or edit form */}
      {isEditing ? (
        <div className="space-y-2">
          <select
            value={editSeverity}
            onChange={(e) => setEditSeverity(e.target.value as ReviewComment['severity'])}
            className="text-body-sm border border-border rounded-lg px-2 py-1 bg-surface"
          >
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="suggestion">Suggestion</option>
          </select>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            className="w-full text-body-sm border border-border rounded-xl px-3 py-2 bg-surface resize-y focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-body-sm text-txt-primary whitespace-pre-wrap leading-relaxed">
            {comment.comment}
          </p>

          {/* Action buttons */}
          {!comment.posted && (
            <div className="flex gap-2 mt-2.5">
              <Button size="sm" variant="ghost" onClick={() => {
                setEditText(comment.comment);
                setEditSeverity(comment.severity);
                onStartEdit(comment.id);
              }}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
              {hasDiffRefs && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onPost(comment.id)}
                  loading={postingId === comment.id}
                >
                  Post to GitLab
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
