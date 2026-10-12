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
- It has three seeded failure+fix situations that map to real DeadEnd memory
  shapes:
  1. **Private / team** failure that only matters inside this org.
  2. **Private / team** failure that is environment-specific.
  3. **Global** failure that many teams hit, verified, redacted, and approved
     for sharing.
- It has a task prompt that has no pre-existing memory yet, so we can demo the
  "agent figures it out, then the fix gets captured as a new memory" story.

## How the demo uses it

- The extension is pointed at this folder as the workspace.
- DeadEnd is signed in and a team is chosen.
- Memories are already present (seeded) for situation 1, 2, and 3.
- We run a task that retrieves private + global memory in the same run.
- We run a task with no matching memory, watch the agent solve it, and then
  show that solution being saved as a new memory.

## Files that matter for the demo

- `app.py` — the service.
- `apps/` — feature modules.
- `compat/` — version-tolerant shims used by the demo to make failures look
  like real multi-version compatibility issues.
- `tests/` — the test suite the runner can invoke.
- `memory_seeds/` — the pre-created DeadEnd memory payloads used to seed
  private and global memories before the demo run.
- `demo_tasks.md` — the prompts and beats used in the demo.
