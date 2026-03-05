-- AI MR Reviewer - Database Schema
-- Run this against your PostgreSQL database to set up tables.

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
