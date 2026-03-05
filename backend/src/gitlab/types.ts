export interface MergeRequestDetails {
  iid: number;
  title: string;
  description: string;
  state: string;
  source_branch: string;
  target_branch: string;
  author: {
    id: number;
    username: string;
    name: string;
    avatar_url: string;
  };
  web_url: string;
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
}

export interface MergeRequestChange {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface MergeRequestChangesResponse extends MergeRequestDetails {
  changes: MergeRequestChange[];
}

export interface MergeRequestVersion {
  id: number;
  head_commit_sha: string;
  base_commit_sha: string;
  start_commit_sha: string;
  created_at: string;
  merge_request_id: number;
  state: string;
  real_size: string;
}

export interface ParsedMrUrl {
  projectPath: string;
  mrIid: number;
}

export interface DiscussionPosition {
  position_type: 'text';
  new_path: string;
  new_line?: number | null;
  base_sha: string;
  start_sha: string;
  head_sha: string;
  old_path?: string;
  old_line?: number | null;
}

export interface CreateDiscussionPayload {
  body: string;
  position: DiscussionPosition;
}

/**
 * Represents a single line in a diff with its position info.
 * Used to build the correct GitLab discussion position payload.
 *
 * - 'added': line exists only in new version → use new_line only
 * - 'removed': line exists only in old version → use old_line only
 * - 'context': unchanged line in diff → use both old_line and new_line
 */
export interface DiffLineInfo {
  type: 'added' | 'removed' | 'context';
  old_line: number | null;
  new_line: number | null;
}

// Repository indexing types
export interface TreeItem {
  id: string;
  name: string;
  type: 'blob' | 'tree';
  path: string;
  mode: string;
}

export interface CompareFile {
  old_path: string;
  new_path: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
  diff: string;
}

export interface CompareDiffResponse {
  diffs: CompareFile[];
}

export interface BranchInfo {
  name: string;
  commit: {
    id: string;
    message: string;
  };
}
