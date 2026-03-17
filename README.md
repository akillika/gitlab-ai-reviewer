# AI MR Reviewer - Open Source AI Code Review Tool for GitLab

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-black?logo=openai)](https://openai.com/)

**AI MR Reviewer** is a self-hosted, open-source **AI-powered code review tool** for **GitLab merge requests**. It uses **OpenAI GPT models** and **RAG (Retrieval-Augmented Generation)** to deliver context-aware code reviews — detecting bugs, security vulnerabilities, architectural drift, and code quality issues automatically.

Paste a merge request URL, get instant, actionable feedback with risk scores, inline comments, and one-click posting back to GitLab.

---

## Why AI MR Reviewer?

- **Catch real bugs, not style nits** — Focuses on data loss, security holes, race conditions, and production risks. Ignores cosmetic issues like naming and formatting.
- **Understands your codebase** — RAG-powered repository indexing gives the AI full context of your architecture, patterns, and conventions.
- **Self-hosted & private** — Your code never leaves your infrastructure. Runs on your own servers with your own OpenAI key.
- **Works with any GitLab instance** — Supports GitLab.com, self-managed, and dedicated GitLab instances.
- **Low cost** — Default model (GPT-4o-mini) costs ~$0.001–0.01 per review.

---

## Key Features

### AI-Powered Code Review
Automated code analysis using OpenAI GPT models that identifies real bugs, security vulnerabilities, data loss risks, and production concerns in your merge request diffs.

### Risk Scoring
Every review generates a 0–100 risk score based on severity-weighted issues (major, minor, suggestion), giving teams a quantifiable measure of merge request risk.

### Repository Context with RAG
Indexes your entire codebase into vector embeddings using pgvector. During reviews, relevant code is retrieved via semantic similarity search, enabling context-aware AI analysis that understands your project's architecture.

### Architectural Drift Detection
Automatically detects when code changes violate established architectural patterns — like controllers directly accessing repositories or business logic leaking into utility files.

### Dependency Impact Analysis
Builds a file dependency graph from imports and calculates the blast radius of changes. Flags high-impact modifications that affect 10+ dependent files.

### Duplicate Code Detection
Uses semantic embeddings to find similar code blocks across the repository and suggests reuse opportunities when similarity exceeds 92%.

### AI-Generated Test Suggestions
Generates targeted test case ideas covering edge cases, error handling, null inputs, and concurrency scenarios for changed code.

### Merge Request Summaries
Produces three-perspective summaries for every MR:
- **Technical** — what changed and how
- **Business** — impact on users and product
- **Risk** — potential regressions and concerns
- Plus a one-liner **release note**

### Pre-Merge Quality Gates
Configurable rules per repository that flag MRs based on risk score thresholds or major issue counts. Currently advisory — reports pass/fail in the dashboard but does not enforce merge blocking in GitLab.

### Repository Health Dashboard
Tracks code quality trends over time with risk score history, severity distribution charts, and improvement indicators across reviews.

### Post Comments to GitLab
Review, edit, or delete AI suggestions before posting. Post individual comments or bulk-post all unposted comments as inline notes directly on the GitLab merge request.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| **Backend** | Node.js 20, Express, TypeScript |
| **Database** | PostgreSQL 16 + pgvector (vector similarity search) |
| **Queue** | Redis 7 + BullMQ (background job processing) |
| **AI / LLM** | OpenAI API (GPT-4o-mini, GPT-4.1, text-embedding-3-small) |
| **Security** | JWT, bcrypt, AES-256-GCM encrypted token storage |
| **Deployment** | Docker, Docker Compose, Nginx |

---

## Project Structure

```
ai-mr-reviewer/
├── backend/
│   └── src/
│       ├── ai/              # OpenAI integration, prompt engineering, RAG pipeline
│       ├── controllers/     # Express request handlers
│       ├── gitlab/          # GitLab API client and diff parsing
│       ├── middleware/       # Auth, rate limiting, input validation
│       ├── queue/           # BullMQ background indexing worker
│       ├── routes/          # Express route definitions
│       ├── services/        # Core business logic (review, risk, drift, impact, etc.)
│       └── utils/           # Config, DB pool, Redis, encryption, logging
├── frontend/
│   └── src/
│       ├── components/      # DiffViewer, FileTree, AISuggestionsPanel, RiskScoreCard, etc.
│       ├── hooks/           # Auth state management, keyboard shortcuts
│       ├── layouts/         # App shell and review layouts
│       ├── pages/           # Login, Dashboard, Review, Settings, Health Dashboard
│       └── services/        # API client
├── schema.sql               # PostgreSQL database schema
├── docker-compose.yml       # Full-stack Docker Compose setup
└── SETUP.md                 # Detailed setup and deployment guide
```

---

## Getting Started

### Prerequisites

- **Node.js 20+**
- **PostgreSQL 13+** with the [pgvector](https://github.com/pgvector/pgvector) extension
- **Redis 7+**
- **OpenAI API key**

### 1. Clone and Configure

```bash
git clone https://github.com/akillika/gitlab-ai-reviewer.git
cd ai-mr-reviewer

cd backend
cp .env.example .env
```

Edit `backend/.env` with your values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_mr_reviewer
JWT_SECRET=<generate-with-command-below>
MASTER_ENCRYPTION_KEY=<generate-with-command-below>
OPENAI_API_KEY=sk-your-key-here
REDIS_URL=redis://localhost:6379
```

Generate secrets:

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Master Encryption Key (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Set Up the Database

```bash
createdb ai_mr_reviewer
psql ai_mr_reviewer -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 3. Install Dependencies and Run

```bash
# Backend
cd backend
npm install
npm run migrate
npm run dev        # http://localhost:3001

# Frontend (in another terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### 4. First Use

1. Open http://localhost:5173 and register an account
2. Go to **Settings** and add your GitLab base URL + Personal Access Token (needs `api` and `read_user` scopes)
3. Go to **Dashboard**, paste a merge request URL, and run your first AI code review

### Docker Deployment

```bash
# Start the full stack (PostgreSQL + pgvector, Redis, backend, frontend)
docker-compose up -d
# Frontend available at http://localhost
```

> Set `OPENAI_API_KEY` and secrets in `backend/.env` before running.

For detailed setup instructions, production deployment notes, and troubleshooting, see [SETUP.md](SETUP.md).

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Session signing secret (32+ chars) |
| `MASTER_ENCRYPTION_KEY` | Yes | — | AES-256-GCM key for encrypting GitLab PATs (64 hex chars) |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `PORT` | No | `3001` | Backend server port |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend URL for CORS |
| `OPENAI_REVIEW_MODEL` | No | `gpt-4o-mini` | Model for code reviews |
| `OPENAI_DEEP_REVIEW_MODEL` | No | `gpt-4.1` | Model for deep reviews |
| `OPENAI_EMBEDDING_MODEL` | No | `text-embedding-3-small` | Model for RAG embeddings |
| `OPENAI_MAX_CONCURRENCY` | No | `2` | Max concurrent OpenAI requests |
| `OPENAI_TIMEOUT` | No | `120000` | OpenAI request timeout (ms) |

### OpenAI Cost Estimates

| Model | Approximate Cost | Use Case |
|-------|-----------------|----------|
| gpt-4o-mini | ~$0.001–0.01 per MR | Default code reviews |
| gpt-4.1 | ~$0.02–0.10 per MR | Deep code reviews |
| text-embedding-3-small | ~$0.0001 per file | Repository indexing (RAG) |

Token usage is logged to the `ai_usage_logs` table for cost tracking and monitoring.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new account |
| `POST` | `/api/auth/login` | Login and receive a JWT |
| `GET` | `/api/auth/me` | Get current authenticated user |
| `POST` | `/api/tokens/configure` | Store and validate a GitLab PAT |
| `GET` | `/api/tokens/status` | Check token configuration status |
| `DELETE` | `/api/tokens` | Remove all stored tokens |
| `POST` | `/api/mr/fetch` | Fetch merge request details from GitLab |
| `POST` | `/api/reviews/run` | Run an AI code review on a merge request |
| `GET` | `/api/reviews` | List all reviews for the current user |
| `GET` | `/api/reviews/:id` | Get a review with all comments |
| `PATCH` | `/api/reviews/:id/comments/:cid` | Edit a review comment |
| `DELETE` | `/api/reviews/:id/comments/:cid` | Delete a review comment |
| `POST` | `/api/reviews/:id/comments/:cid/post` | Post a single comment to GitLab |
| `POST` | `/api/reviews/:id/post-all` | Bulk post all unposted comments to GitLab |
| `GET` | `/api/repos/index-status` | Check repository indexing status |
| `POST` | `/api/repos/trigger-index` | Trigger repository indexing for RAG |

---

## Security

- **Self-hosted** — all code review data stays on your infrastructure
- **Per-user GitLab tokens** — each user provides their own PAT; tokens are AES-256-GCM encrypted at rest and never returned to the frontend
- **Single org-level OpenAI key** — configured server-side, not exposed to users
- **Password hashing** — bcrypt with 12 salt rounds
- **JWT sessions** — stateless authentication with 24-hour expiry
- **Rate limiting** — auth (10/min), reviews (5/min), bulk post (3/min)
- **Input validation** — email, password, URL, and MR URL sanitization on all endpoints

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and commit
4. Push to your branch and open a pull request

Please open an issue first for major changes to discuss the approach.

---

## License

This project is licensed under the [MIT License](LICENSE).
