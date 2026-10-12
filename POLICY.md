# Data integrity

DeadEnd displays real records from connected agent runs, curated memories,
reuse events, and integration traces. Production routes do not insert sample
memories or simulated runs. Empty and unavailable states remain explicit.

Tests may use isolated fixtures to check behavior; test fixtures are never
loaded into a user's team or presented as recorded product activity. Imported
records retain their provenance and seeded status where applicable.

# Secrets

Secrets are never stored in DeadEnd surfaces. The curator scans for
secret-like strings before writing an entry and quarantines content when it
finds a secret or prompt-injection pattern. Integration keys are configured
through environment variables and remain on the service that uses them.
