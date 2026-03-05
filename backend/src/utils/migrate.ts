import { pool } from './db';
import { logger } from './logger';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                      SERIAL PRIMARY KEY,
  email                   VARCHAR(255) NOT NULL UNIQUE,
  password_hash           TEXT NOT NULL,
  gitlab_base_url         TEXT,
  gitlab_user_id          INTEGER,
  gitlab_username         VARCHAR(255),
  encrypted_gitlab_token  TEXT,
  encrypted_llm_api_key   TEXT,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  INTEGER NOT NULL,
  project_path VARCHAR(512) NOT NULL,
  mr_iid      INTEGER NOT NULL,
  mr_title    VARCHAR(1024),
  status      VARCHAR(50) DEFAULT 'pending',
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project_mr ON reviews(project_id, mr_iid);

CREATE TABLE IF NOT EXISTS review_comments (
  id          SERIAL PRIMARY KEY,
  review_id   INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  file_path   VARCHAR(1024) NOT NULL,
  line_number INTEGER NOT NULL,
  severity    VARCHAR(50) NOT NULL,
  comment     TEXT NOT NULL,
  posted      BOOLEAN DEFAULT FALSE,
  gitlab_note_id INTEGER,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review_id ON review_comments(review_id);

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Repos table: one row per GitLab project
CREATE TABLE IF NOT EXISTS repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id INTEGER NOT NULL,
  gitlab_base_url TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  last_indexed_commit_sha TEXT,
  indexing_status TEXT NOT NULL DEFAULT 'idle',
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  triggered_by_user_id INTEGER REFERENCES users(id),
  embedding_version INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, gitlab_base_url)
);

-- Repo files: tracks per-file indexing state
CREATE TABLE IF NOT EXISTS repo_files (
  id SERIAL PRIMARY KEY,
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  last_indexed_sha TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repo_id, file_path)
);

-- Repo chunks: code chunks with vector embeddings
-- Using 1536 dimensions for OpenAI text-embedding-3-small
CREATE TABLE IF NOT EXISTS repo_chunks (
  id SERIAL PRIMARY KEY,
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  commit_sha TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repos_project ON repos(project_id, gitlab_base_url);
CREATE INDEX IF NOT EXISTS idx_repo_files_repo ON repo_files(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_chunks_repo ON repo_chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_chunks_file ON repo_chunks(repo_id, file_path);

-- AI usage tracking
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_id   INTEGER REFERENCES reviews(id) ON DELETE SET NULL,
  repo_id     UUID REFERENCES repos(id) ON DELETE SET NULL,
  model       VARCHAR(100) NOT NULL,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
  purpose     VARCHAR(50) NOT NULL DEFAULT 'review',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at);

-- Architecture rule engine: configurable regex-based rules
CREATE TABLE IF NOT EXISTS architecture_rules (
  id              SERIAL PRIMARY KEY,
  rule_name       VARCHAR(255) NOT NULL,
  rule_description TEXT NOT NULL,
  pattern_to_detect TEXT NOT NULL,
  severity        VARCHAR(50) NOT NULL DEFAULT 'suggestion',
  file_pattern    TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Review history: aggregated summary per review for analytics
CREATE TABLE IF NOT EXISTS review_history (
  id              SERIAL PRIMARY KEY,
  review_id       INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  repo_id         UUID REFERENCES repos(id) ON DELETE SET NULL,
  project_id      INTEGER NOT NULL,
  mr_iid          INTEGER NOT NULL,
  total_major     INTEGER NOT NULL DEFAULT 0,
  total_minor     INTEGER NOT NULL DEFAULT 0,
  total_suggestion INTEGER NOT NULL DEFAULT 0,
  risk_score      INTEGER NOT NULL DEFAULT 100,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_history_project ON review_history(project_id);
CREATE INDEX IF NOT EXISTS idx_review_history_review ON review_history(review_id);

-- Phase 2: Architectural drift detection profiles
CREATE TABLE IF NOT EXISTS repo_architecture_profile (
  id              SERIAL PRIMARY KEY,
  repo_id         UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  detected_patterns JSONB NOT NULL DEFAULT '[]',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repo_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_repo_arch_profile_repo ON repo_architecture_profile(repo_id);

-- Phase 2: Dependency graph edges (file-level imports)
CREATE TABLE IF NOT EXISTS repo_dependency_graph (
  id              SERIAL PRIMARY KEY,
  repo_id         UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  source_file     TEXT NOT NULL,
  target_file     TEXT NOT NULL,
  import_type     TEXT NOT NULL DEFAULT 'static',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repo_id, source_file, target_file)
);

CREATE INDEX IF NOT EXISTS idx_repo_dep_graph_repo ON repo_dependency_graph(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_dep_graph_target ON repo_dependency_graph(repo_id, target_file);

-- Phase 2: Per-repo configurable settings (AI gate, thresholds)
CREATE TABLE IF NOT EXISTS repo_settings (
  id                      SERIAL PRIMARY KEY,
  repo_id                 UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE UNIQUE,
  block_on_major          BOOLEAN NOT NULL DEFAULT FALSE,
  max_allowed_risk_score  INTEGER NOT NULL DEFAULT 0,
  auto_post_comments      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repo_settings_repo ON repo_settings(repo_id);
`;

/**
 * Seed default architecture rules. Uses ON CONFLICT to be idempotent.
 */
const SEED_ARCHITECTURE_RULES_SQL = `
INSERT INTO architecture_rules (rule_name, rule_description, pattern_to_detect, severity, file_pattern)
VALUES
  ('No direct repository access from controller',
   'Controllers should not access repositories directly. Use a service layer instead.',
   'repository\\.', 'major', 'controller'),
  ('No hardcoded credentials',
   'Hardcoded passwords, tokens, or secrets detected. Use environment variables.',
   '(password|secret|token|apikey|api_key)\\s*[:=]\\s*[''"](?!\\$\\{)', 'major', NULL),
  ('Avoid System.out.println',
   'Use a proper logging framework instead of System.out.println.',
   'System\\.out\\.print', 'minor', '\\.java$'),
  ('Avoid console.log in production code',
   'Use a proper logger instead of console.log in non-test files.',
   'console\\.(log|debug|info)\\(', 'suggestion', '(?<!test|spec)\\.ts$')
ON CONFLICT DO NOTHING;
`;

/**
 * Migration to upgrade existing databases from 768-dim (Ollama/nomic) to 1536-dim (OpenAI).
 * This drops old embeddings since they're incompatible with the new model.
 */
const UPGRADE_EMBEDDING_DIMENSION_SQL = `
DO $$
DECLARE
  col_type text;
BEGIN
  -- Check if repo_chunks table exists and has the old 768-dim embedding column
  SELECT data_type || '(' || character_maximum_length || ')' INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'repo_chunks' AND column_name = 'embedding';

  -- If the column exists and is the wrong dimension, migrate it
  IF col_type IS NULL THEN
    -- Column exists but character_maximum_length is null for vector type
    -- Check via pg_attribute instead
    PERFORM 1 FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_type t ON a.atttypid = t.oid
    WHERE c.relname = 'repo_chunks'
      AND a.attname = 'embedding'
      AND t.typname = 'vector';

    IF FOUND THEN
      -- Drop old embeddings (they're incompatible with the new model)
      EXECUTE 'DELETE FROM repo_chunks WHERE embedding IS NOT NULL';

      -- Alter column to new dimension
      EXECUTE 'ALTER TABLE repo_chunks ALTER COLUMN embedding TYPE vector(1536)';

      -- Reset all repos to require re-indexing
      EXECUTE 'UPDATE repos SET indexing_status = ''idle'', last_indexed_commit_sha = NULL, embedding_version = 2';

      -- Drop old index if exists and recreate
      EXECUTE 'DROP INDEX IF EXISTS idx_repo_chunks_embedding';

      RAISE NOTICE 'Upgraded embedding dimension from 768 to 1536. All repos need re-indexing.';
    END IF;
  END IF;
END
$$;
`;

async function migrate() {
  try {
    logger.info('Running database migrations...');
    await pool.query(MIGRATION_SQL);
    logger.info('Base migrations completed');

    // Run embedding dimension upgrade (safe to run multiple times)
    await pool.query(UPGRADE_EMBEDDING_DIMENSION_SQL);
    logger.info('Embedding dimension check completed');

    // Seed default architecture rules (idempotent)
    await pool.query(SEED_ARCHITECTURE_RULES_SQL);
    logger.info('Architecture rules seed completed');

    logger.info('All database migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error: (error as Error).message });
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
