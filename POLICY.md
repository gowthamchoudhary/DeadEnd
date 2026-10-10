Mocks are not used in DeadEnd. Populate, never fake.

- Real data comes from: agent runs recorded in neatlogs traces, curated
  entries written by agents to the Entire repos, `seeds/` seeded global
  entries, and reuse events recorded when a fix is actually replayed.
- Every seeded global entry is labeled `seeded: true` at the top level
  and its provenance says `seed: <seeds/<file>>`. Labels are never stripped.
- When data is missing (no trace, no entries, no key), surfaces show an
  empty state with a pointer to the missing prerequisite. They never
  generate placeholder data to look busy.

# Secrets

- Secrets are never stored in any DeadEnd surface. The curator scans for
  secret-like strings before writing an entry, and quarantines instead of
  writing when it finds one or a prompt-injection pattern.
- API keys live in env vars only: NEATLOGS_API_KEY and ENTIRE_TOKEN.
- neatlogs PII masking stays enabled; DeadEnd never disables it.
