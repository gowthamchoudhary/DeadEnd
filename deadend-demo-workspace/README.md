# ticketdesk-api — DeadEnd demo workspace

A tiny, self-contained FastAPI microservice used as a controlled demo target
for DeadEnd: failure memory for coding agents.

It exists so we can show the real DeadEnd loop:

1. A failure happens.
2. DeadEnd captures the failure, failed attempts, and the verified fix as a
   structured **memory** (Entry).
3. Later, another task on the same or a different repo retrieves that memory
   and uses it instead of repeating the dead end.
4. The memory can live **private/team** or **global** (after approval), and
   retrieval ranks private above global, filters by environment, and ranks by
   confidence and reuse history.

This workspace is the one we point the extension / runner at for the demo.

## What this repo is for in the demo

- It is deterministic: no database, no network calls at runtime, everything
  in-memory.
- The authenticated demo seeder loads ten clearly labelled synthetic,
  **private/team** failure memories covering ticket validation, compatibility,
  priority, deterministic IDs, batch behavior, and API contracts.
- Its complex batch-intake task is designed to retrieve several related
  memories and lead the agent through a multi-file implementation.

## How the demo uses it

- The extension is pointed at this folder as the workspace.
- DeadEnd is signed in and a team is chosen.
- Run **DeadEnd: Load demo memories into team** to add the ten private fixtures.
- Preview the complex batch task and confirm relevant context before starting.
- For a comparison, run the same prompt with memory disabled.

## Files that matter for the demo

- `app.py` — the service.
- `apps/` — feature modules.
- `compat/` — version-tolerant shims used by the demo to make failures look
  like real multi-version compatibility issues.
- `tests/` — the test suite the runner can invoke.
- `memory_seeds/` — draft Markdown examples for the original private/global
  scenarios. They are not imported automatically. For the current repeatable
  demo, use **DeadEnd: Load demo memories into team**; that inserts ten labelled, team-private fixtures through the authenticated backend API.
- `demo_tasks.md` — the prompts and beats used in the demo.
