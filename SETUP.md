# AI MR Reviewer - Setup Guide

## Prerequisites

- **Node.js 20** (via nvm: `nvm use 20`)
- **PostgreSQL 13+** with the [pgvector](https://github.com/pgvector/pgvector) extension
- **Redis 7+** (for BullMQ background job queue)
- **OpenAI API key** (org-level, used for AI reviews and embeddings)
- Each reviewer needs:
  - A GitLab Personal Access Token (PAT) with `api` and `read_user` scopes

---

## 1. Database Setup

### PostgreSQL + pgvector

```bash
# Create the database
createdb ai_mr_reviewer

# Enable pgvector extension
psql ai_mr_reviewer -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

> **Note:** If pgvector is not available via your package manager for your PostgreSQL version, you may need to [build it from source](https://github.com/pgvector/pgvector#installation).

### Redis

```bash
# macOS
brew install redis
brew services start redis

# Or run directly
redis-server
# Runs on redis://localhost:6379
```

### Run Schema Migration

```bash
cd backend
npm install
npm run migrate
```

---

## 2. Environment Configuration

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# Database
DATABASE_URL=postgresql://your_user@localhost:5432/ai_mr_reviewer

# JWT session secret
JWT_SECRET=<random 32+ character string>

# Master encryption key for AES-256-GCM (must be exactly 64 hex characters = 32 bytes)
# This encrypts user GitLab PATs at rest in the database.
MASTER_ENCRYPTION_KEY=<64 hex characters>

# Redis (for BullMQ repo indexing queue)
REDIS_URL=redis://localhost:6379

# Server
PORT=3001
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# OpenAI API (required)
OPENAI_API_KEY=sk-your-openai-api-key-here

# OpenAI Models (optional — defaults shown)
# OPENAI_REVIEW_MODEL=gpt-4o-mini
# OPENAI_DEEP_REVIEW_MODEL=gpt-4.1
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_MAX_CONCURRENCY=2
# OPENAI_TIMEOUT=120000
```

Generate secure keys:

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Master Encryption Key (must be exactly 64 hex chars = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important:** The `MASTER_ENCRYPTION_KEY` is the only secret stored server-side. GitLab PATs are provided per-user via the UI and encrypted with this key before storage. If this key is lost, all stored tokens become unrecoverable.

---

## 3. Running Locally (Development)

Make sure PostgreSQL and Redis are running before starting the app.

### Backend

```bash
cd backend
npm install
npm run migrate  # First time only
npm run dev
```

Backend runs on http://localhost:3001

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

The Vite dev server proxies `/api` requests to the backend automatically.

---

## 4. First-Time Setup Flow

1. Open http://localhost:5173
2. Click "Create one" to register a new account with email and password
3. After login, navigate to **Settings**
4. Enter your:
   - **GitLab Base URL** (e.g., `https://gitlab.company.com`)
   - **GitLab Personal Access Token** (needs `api` and `read_user` scopes)
5. Click "Save Tokens" — the backend validates your GitLab PAT before saving
6. Go to **Dashboard** and paste an MR URL to start reviewing

AI reviews are powered by OpenAI (`gpt-4o-mini` by default).

---

## 5. Repository Indexing (RAG)

When you run a review, the backend automatically triggers background indexing of the repository. This indexes the entire codebase into vector embeddings so the AI can understand the broader context when reviewing changes.

- Indexing runs as a background job via **BullMQ + Redis**
- Embeddings are generated using OpenAI `text-embedding-3-small` (1536 dimensions)
- Embeddings are stored in PostgreSQL using **pgvector**
- During reviews, relevant code context is retrieved via semantic similarity search
- Indexing is shared across all users reviewing the same project
- Subsequent reviews trigger incremental indexing (only changed files)
- Progress is visible in the UI with a progress bar

### Manual Indexing

You can also trigger indexing manually from the Dashboard UI or via API:

```bash
curl -X POST http://localhost:3001/api/repos/trigger-index \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"projectId": 123, "gitlabBaseUrl": "https://gitlab.company.com", "branch": "main"}'
```

### Checking Indexing Status

```bash
curl "http://localhost:3001/api/repos/index-status?projectId=123&gitlabBaseUrl=https://gitlab.company.com" \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

## 6. OpenAI Configuration

### Models

| Purpose | Default Model | Environment Variable |
|---------|--------------|---------------------|
| Code review | `gpt-4o-mini` | `OPENAI_REVIEW_MODEL` |
| Deep review (fallback) | `gpt-4.1` | `OPENAI_DEEP_REVIEW_MODEL` |
| Embeddings | `text-embedding-3-small` | `OPENAI_EMBEDDING_MODEL` |

### Cost Estimation

The system logs token usage to the `ai_usage_logs` table. Approximate costs per review:

- **gpt-4o-mini**: ~$0.001-0.01 per MR (very affordable)
- **gpt-4.1**: ~$0.02-0.10 per MR (higher quality, more expensive)
- **text-embedding-3-small**: ~$0.0001 per file indexed

### Rate Limits

- Max concurrent OpenAI API requests: 2 (configurable via `OPENAI_MAX_CONCURRENCY`)
- Automatic exponential backoff on 429 (rate limit) responses
- Retry up to 3 times on transient failures

> **Warning:** Changing the embedding model after indexing requires re-indexing all repositories, as embedding dimensions may differ.

---

## 7. Production Deployment Notes

- Set `NODE_ENV=production` in the backend
- Use a proper PostgreSQL instance with pgvector extension
- Use a persistent Redis instance
- Set `OPENAI_API_KEY` to your production API key
- Place behind a reverse proxy (nginx/Caddy) with TLS
- Set `FRONTEND_URL` to your production frontend URL
- Protect the `MASTER_ENCRYPTION_KEY` — if lost, all stored GitLab PATs become unrecoverable
- Consider IP-based rate limiting at the reverse proxy level
- The BullMQ indexing worker runs within the backend process (concurrency: 2)

---

## Architecture Overview

```
Frontend (React + Vite + Tailwind)
  |-- /api proxy --> Backend (Express + TypeScript)
                      |-- Auth Module (email/password + JWT sessions)
                      |-- Token Module (encrypted per-user GitLab PAT storage)
                      |-- GitLab Module (MR fetching, comment posting via user PAT)
                      |-- AI Module (OpenAI GPT-4o-mini for reviews, text-embedding-3-small for embeddings)
                      |-- RAG Pipeline (diff embedding -> pgvector search -> context-enriched prompt)
                      |-- Indexing Module (BullMQ worker -> OpenAI embeddings -> pgvector)
                      |-- Usage Tracking (per-review token logging + cost estimation)
                      |-- PostgreSQL (users, reviews, comments, repos, embeddings, usage logs)
                      |-- Redis (BullMQ job queue for background indexing)
```

### Security Model

- **Single org-level OpenAI API key**: Configured server-side, not per-user
- **Per-user credentials**: Each reviewer provides their own GitLab PAT
- **AES-256-GCM encryption**: GitLab PATs encrypted at rest in the database
- **Token validation**: GitLab PAT validated via `GET /api/v4/user` before saving
- **Tokens never returned**: After submission, tokens are never sent back to the frontend
- **In-memory decryption**: Tokens are decrypted only for API calls, then immediately discarded
- **Password hashing**: bcrypt with 12 salt rounds
- **JWT sessions**: 24-hour expiry, stateless authentication
- **Rate limiting**: Auth endpoints (10/min), AI review (5/min), bulk post (3/min)
- **Input validation**: Email, password, URL, and MR URL sanitization middleware

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register with email/password |
| POST | `/api/auth/login` | Login, receive JWT |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/tokens/configure` | Validate & store GitLab PAT |
| GET | `/api/tokens/status` | Check token configuration status |
| DELETE | `/api/tokens` | Remove all stored tokens |
| POST | `/api/mr/fetch` | Fetch MR details |
| POST | `/api/reviews/run` | Run AI review on MR |
| GET | `/api/reviews` | List user's reviews |
| GET | `/api/reviews/:id` | Get review with comments |
| PATCH | `/api/reviews/:id/comments/:cid` | Edit comment |
| DELETE | `/api/reviews/:id/comments/:cid` | Delete comment |
| POST | `/api/reviews/:id/comments/:cid/post` | Post comment to GitLab |
| POST | `/api/reviews/:id/post-all` | Post all unposted comments |
| GET | `/api/repos/index-status` | Check repo indexing status |
| POST | `/api/repos/trigger-index` | Trigger repo indexing |
