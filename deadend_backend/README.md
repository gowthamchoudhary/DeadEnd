# DeadEnd Backend (FastAPI, Render + Supabase Postgres)

FastAPI backend for the public DeadEnd product. Entire is the source of the
raw coding-session history: agent hooks capture prompts, tool calls, edits,
and checkpoints, while the local `deadend-runner` searches Entire and reads
matching transcript excerpts on the developer's machine. Raw Entire
transcripts do not pass through this backend.

This service owns account/team access, the structured curated-memory index,
verification and reuse metadata, live run history, and approved sharing.
Supabase Postgres stores that index and product metadata. Neatlogs receives
privacy-limited run and curation traces. Approved global curated fixes are
also published to the configured Entire-backed archive.

## Deploy (Render)

1. Supabase: create project → copy the pooled connection string.
2. GitHub OAuth App: callback `$DEADEND_BASE_URL/auth/callback`.
3. Render: new Web Service → repo root `render.yaml` (Dockerfile inside
   `deadend_backend/`), fill `sync: false` env vars from the table below.
4. Migrations run on boot (`start.sh` → `create_all` incl. pgvector).

## Environment variables (all of them)

| Variable | Purpose |
|---|---|
| `DEADEND_ENV` | dev/prod (cookie Secure flag in prod) |
| `DEADEND_BASE_URL` | public backend URL (OAuth callbacks) |
| `DEADEND_WEB_ORIGIN` | locked CORS origin for the web app |
| `DEADEND_DATABASE_URL` | Supabase pooled Postgres URL |
| `DEADEND_AUTH_SECRET` | signs session cookies / OAuth state |
| `DEADEND_GITHUB_CLIENT_ID/SECRET` | GitHub OAuth app |
| `DEADEND_NEATLOGS_API_KEY` | owner’s Neatlogs write key; kept server-side for run and Curator/Verifier tracing |
| `DEADEND_NEATLOGS_PROJECT` | Neatlogs project name for run traces (default `DeadEnd`) |
| `DEADEND_ENTIRE_GLOBAL_REMOTE` | `entire://…deadend-global` for service-account publishing |
| `DEADEND_MAX_BODY_BYTES` | request size cap (default 1MB) |
| `DEADEND_RATE_LIMIT_PER_MIN` | per-user rate limit |
| `DEADEND_RATE_LIMIT_IP_PER_MIN` | per-IP rate limit |
| `DEADEND_BUDGET_DEFAULT_TOKENS` | retrieval context-pack budget |
| `DEADEND_VERIFY_WORKER_TIMEOUT_S` | clean-checkpoint replay cap |

Runner (user machine only): `DEADEND_BACKEND`, `DEADEND_TOKEN`,
`DEADEND_TEAM`, plus the user's own Claude credentials (never sent to
the backend).

## Accounts to create

- Supabase project (Postgres + pgvector)
- GitHub OAuth App
- Render web service
