# DeadEnd

DeadEnd is a failure-memory and context-sharing platform for coding agents.
It intercepts failed agent attempts, stores structured environment
fingerprints, and retrieves verified fixes via confidence-scored vector
search — so the next agent starts past the dead ends instead of repeating
them.

- **What runs where:** the agents and the `deadend-runner` live on your
  machine (Claude Code, Codex, OpenCode, Pi, Antigravity CLI, Copilot CLI).
  The backend stores the memory and shared parts of the platform.
- **Stack:** Next.js 14 app shell (`web/`), FastAPI + pgvector backend
  (`deadend_backend/`), pgvector Postgres (Supabase), Vite extension
  (`extension/`), MCP server (`deadend-mcp`), hunter (hooked into Entire).

## Quick start

```bash
# 1. Backend (Render dev)          # 2. Web
cd deadend_backend && ./start.sh   cd ../web && npx next dev
```

## Repo layout

| Path | What lives there |
| --- | --- |
| `deadend_backend/` | FastAPI app (routers, db, auth, scanner, curator/verifier), `start.sh`, `render.yaml` |
| `web/` | Next.js 14 dashboard + landing page (shadcn/ui, Tailwind, SWR, Framer Motion) |
| `extension/` | VS Code extension (device approval, run controls, Memories) |
| `deadend-mcp/` | MCP server for human-run agents |
| `seeds/` | Seeded target repos used by the verify/score pipeline |

## Environment (backend)

Copy `deadend_backend/deadend-backend.env.example` to
`.env` and fill the `DEADEND_*` keys — `DEADEND_AUTH_SECRET`,
`DEADEND_GITHUB_CLIENT_ID/SECRET`, `DEADEND_DATABASE_URL`,
`DEADEND_BASE_URL`, `DEADEND_WEB_ORIGIN`. The full table is in
`deadend_backend/README.md`.

## Deploy

- **Backend:** Render (Docker, `render.yaml` + `deadend_backend/start.sh`).
- **Web:** Vercel (Next.js, `web/`).
- **Docs:** `deadend_backend/README.md` covers the accounts and env vars you
  need (Supabase, GitHub OAuth, Render, env vars).

## Tests

```bash
cd deadend_backend && python -m pytest -q
cd web && npx next build
```

## What's here vs. what isn't

Nothing is invented: routes, response shapes and the client types in
`web/lib/api.ts` all mirror the backend routers, and every number the UI
shows comes from `/me/overview` or `GET /runs` — `null` renders as
"no data yet".
