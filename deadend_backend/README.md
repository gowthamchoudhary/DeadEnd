# DeadEnd Backend (FastAPI, Render + Supabase Postgres)

FastAPI backend for the public DeadEnd product. Your agents run on YOUR
machine (`deadend-runner`); this backend stores failures/attempts/fixes/
constraints/reuse events in Postgres (Supabase) with pgvector embeddings,
traces its own Curator/Verifier/promoter steps in neatlogs, and reads/
publishes Entire checkpoints via documented CLI/remote only.

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
| `DEADEND_NEATLOGS_API_KEY` | neatlogs project key (Curator/Verifier/promoter WORKFLOW spans via MCP+SDK) |
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
