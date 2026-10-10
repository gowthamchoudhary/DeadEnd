# DeadEnd

DeadEnd is a failure-memory and context-sharing platform for coding agents.
It stores every failure, constraint, failed attempt (with why it failed)
and verified fix from agent work — and hands that context to agents *before*
they start, so they stop paying to rediscover the same dead ends.

Two scopes:

- **Private Engineering Context** — a private Entire repo per team.
- **Global Context** — opt-in, redacted, verified, shared worldwide and
  retrieved by confidence score.

## Status

The platform is being built step by step. This README is the high-level
map: the exact install/run instructions per step land in the step docs
under `docs/` as that step completes.

- Roadmap: `docs/ROADMAP.md`
- Data model: `docs/DATA-MODEL.md`
- Contract, stats, seeded-data rules: `docs/CONTRACT.md`, `docs/STATS.md`,
  `POLICY.md`, `seeds/README.md`
