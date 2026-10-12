# DeadEnd

DeadEnd is a memory and verification agent for coding teams. It searches
relevant work history and curated team memories, runs a selected coding agent,
checks the result, and records the run.

## Integrations

- **Entire** captures repository sessions and checkpoints. DeadEnd searches
  the current repository's history locally and injects relevant excerpts into
  a coding run. Raw transcripts stay on the developer's machine.
- **Neatlogs** records selected run phases for traceability. The backend uses
  the project owner's configured key.
- **cfo.ai** can receive exported run and reuse data through the Economics
  workflow for business planning.

See [README.md](README.md) for architecture, development setup, supported
coding agents, and privacy boundaries.
