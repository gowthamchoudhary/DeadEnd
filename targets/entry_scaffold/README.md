# Seeded-bug target repos (Step 4 / Step 8)

Each bug directory under `targets/` is a real workspace checkout: its own
git repo, a genuine bug in the app code, and a real pytest suite that
fails on the buggy code. Its README describes what the service does —
NOT what the bug is. Finding and fixing the bug is the agent's job,
exactly like a ticket handed to a real engineer.

Layout per target:
- `app/` — the buggy application code
- `tests/` — real pytest suite (passes iff the bug is fixed correctly)
- `run_tests.sh` — pristine checkout test command
- the bug was verified to reproduce on a clean clone, then the checkout
  was reset to the buggy state; the fix is never committed to the repo
