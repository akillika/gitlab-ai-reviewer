import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Don't redirect on login/register 401s
      const url = error.config?.url || '';
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export interface SafeUser {
  id: number;
  email: string;
  gitlabBaseUrl: string | null;
  gitlabUserId: number | null;
  gitlabUsername: string | null;
  hasGitlabToken: boolean;
}

export function registerUser(email: string, password: string) {
  return api.post<{ token: string; user: SafeUser }>('/auth/register', { email, password });
}

export function loginUser(email: string, password: string) {
  return api.post<{ token: string; user: SafeUser }>('/auth/login', { email, password });
}

export function getMe() {
  return api.get<SafeUser>('/auth/me');
}

// Token configuration
export interface TokenStatus {
  configured: boolean;
  gitlabBaseUrl: string | null;
  gitlabUsername: string | null;
  hasGitlabToken: boolean;
}

export function configureTokens(gitlabBaseUrl: string, gitlabToken: string) {
  return api.post<{ message: string; user: SafeUser }>('/tokens/configure', {
    gitlabBaseUrl,
    gitlabToken,
  });
}

export function getTokenStatus() {
  return api.get<TokenStatus>('/tokens/status');
}

export function removeTokens() {
  return api.delete<{ message: string; user: SafeUser }>('/tokens');
}

// MR
export interface MergeRequestData {
  projectId: number;
  projectPath: string;
  mergeRequest: {
    iid: number;
    title: string;
    description: string;
    state: string;
    sourceBranch: string;
    targetBranch: string;
    author: { id: number; username: string; name: string; avatar_url: string };
    webUrl: string;
  };
  diffRefs: { base_sha: string; head_sha: string; start_sha: string };
  changes: Array<{
    oldPath: string;
    newPath: string;
    newFile: boolean;
    renamedFile: boolean;
    deletedFile: boolean;
    diff: string;
  }>;
}

export function fetchMR(mrUrl: string) {
  return api.post<MergeRequestData>('/mr/fetch', { mrUrl });
}

// Reviews
export interface ReviewComment {
  id: number;
  review_id: number;
  file_path: string;
  line_number: number;
  severity: 'major' | 'minor' | 'suggestion';
  comment: string;
  posted: boolean;
  gitlab_note_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface RiskSummary {
  total_major: number;
  total_minor: number;
  total_suggestion: number;
  overall_risk_score: number;
}

export interface TestSuggestion {
  description: string;
}

// Phase 2: MR Summary
export interface MRSummaryData {
  technical_summary: string;
  business_summary: string;
  risk_summary: string;
  release_note: string;
}

// Phase 2: Dependency Impact Analysis
export interface ImpactAnalysisData {
  changedFiles: string[];
  directDependents: string[];
  transitiveDependents: string[];
  impactRadius: number;
  isHighImpact: boolean;
  fileImpacts: Array<{
    filePath: string;
    directDependentCount: number;
    transitiveDependentCount: number;
  }>;
}

// Phase 2: AI Gate
export interface GateCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface GateResult {
  gate_status: 'pass' | 'fail' | 'warn' | 'no_gate';
  reason: string;
  checks: GateCheck[];
  auto_post: boolean;
}

export interface ReviewData {
  reviewId: number;
  projectId: number;
  projectPath: string;
  mrIid: number;
  mrTitle: string;
  diffRefs: { base_sha: string; head_sha: string; start_sha: string };
  comments: ReviewComment[];
  summary?: RiskSummary;
  test_suggestions?: TestSuggestion[];
  mr_summary?: MRSummaryData | null;
  impact_analysis?: ImpactAnalysisData | null;
  gate?: GateResult;
  totalGenerated: number;
  totalValidated: number;
}

export interface ReviewListItem {
  id: number;
  user_id: number;
  project_id: number;
  project_path: string;
  mr_iid: number;
  mr_title: string;
  status: string;
  created_at: string;
}

export function runReview(mrUrl: string) {
  return api.post<ReviewData>('/reviews/run', { mrUrl });
}

export function getReviews() {
  return api.get<{ reviews: ReviewListItem[] }>('/reviews');
}

export function getReview(reviewId: number) {
  return api.get<{ review: ReviewListItem; comments: ReviewComment[] }>(`/reviews/${reviewId}`);
}

export function editComment(reviewId: number, commentId: number, updates: { comment?: string; severity?: string }) {
  return api.patch<ReviewComment>(`/reviews/${reviewId}/comments/${commentId}`, updates);
}

export function deleteComment(reviewId: number, commentId: number) {
  return api.delete(`/reviews/${reviewId}/comments/${commentId}`);
}

export function postComment(
  reviewId: number,
  commentId: number,
  diffRefs: { base_sha: string; start_sha: string; head_sha: string }
) {
  return api.post(`/reviews/${reviewId}/comments/${commentId}/post`, { diffRefs });
}

export function postAllComments(
  reviewId: number,
  diffRefs: { base_sha: string; start_sha: string; head_sha: string }
) {
  return api.post<{ posted: number; failed: number }>(`/reviews/${reviewId}/post-all`, { diffRefs });
}

// Repository Indexing
export interface RepoIndexStatus {
  indexing_status: 'not_indexed' | 'idle' | 'indexing' | 'completed' | 'failed';
  total_files: number;
  processed_files: number;
  failed_files: number;
  progress_percentage: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export function getRepoIndexStatus(projectId: number, gitlabBaseUrl: string) {
  return api.get<RepoIndexStatus>('/repos/index-status', {
    params: { projectId, gitlabBaseUrl },
  });
}

export function triggerRepoIndexing(projectId: number, gitlabBaseUrl: string, branch: string) {
  return api.post<{ message: string; repoId?: string }>('/repos/trigger-index', {
    projectId,
    gitlabBaseUrl,
    branch,
  });
}

// Phase 2: Code Health Trends
export interface HealthTrendPoint {
  review_id: number;
  mr_iid: number;
  risk_score: number;
  total_major: number;
  total_minor: number;
  total_suggestion: number;
  created_at: string;
}

export interface HealthSummary {
  avg_risk_score: number;
  total_reviews: number;
  trend: 'improving' | 'stable' | 'degrading';
  recent_avg_risk_score: number;
  previous_avg_risk_score: number;
  total_majors_all_time: number;
  total_minors_all_time: number;
  total_suggestions_all_time: number;
  trend_data: HealthTrendPoint[];
}

export function getProjectHealth(projectId: number) {
  return api.get<HealthSummary>('/repos/health', { params: { projectId } });
}

// Phase 2: Repo Settings (AI Gate configuration)
export interface RepoSettingsData {
  block_on_major: boolean;
  max_allowed_risk_score: number;
  auto_post_comments: boolean;
}

export function getRepoSettings(projectId: number, gitlabBaseUrl: string) {
  return api.get<{ configured: boolean; settings: RepoSettingsData | null }>('/repos/settings', {
    params: { projectId, gitlabBaseUrl },
  });
}

export function updateRepoSettings(
  projectId: number,
  gitlabBaseUrl: string,
  settings: Partial<{ blockOnMajor: boolean; maxAllowedRiskScore: number; autoPostComments: boolean }>
) {
  return api.post<{ message: string; settings: RepoSettingsData }>('/repos/settings', {
    projectId,
    gitlabBaseUrl,
    ...settings,
  });
}
