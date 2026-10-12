# Memory seed: global
# DeadEnd entry: compat wrapper lets a legacy priority override bypass urgency logic
# Scope: global
# Verified, redacted, approved for sharing across teams.

## What failed

A legacy integration path used `compat.classifier.classify_with_compat` with a
priority override. In some cases that override bypassed the urgency cue logic and
quietly demoted urgent tickets.

## Signature (normalized)

legacy compat wrapper priority override bypasses urgency classification

## Failed attempts

1. Fixed only the entrypoint, left the compat wrapper untouched.
2. Blocked all overrides globally, which broke the legacy caller.

## Why it failed

The compat wrapper was a real integration seam. The fix was not "remove the
seam", it was "make the seam normalised and safe". That distinction matters
across teams because different teams have different legacy callers.

## Verified fix

- Keep `classify_with_compat` for the legacy caller.
- Make the override go through `_normalise_priority_input` so an urgent synonym
  still yields high priority.
- Add regression tests for the override path, including urgent synonyms and
  malformed overrides.

## Redactions

Internal legacy service names are replaced with generic terms before sharing
globally.

## Constraints

- Keep the legacy caller working.
- Keep urgency logic intact.
- Keep classification deterministic.

## Environment

language: python
framework: fastapi
os: linux
