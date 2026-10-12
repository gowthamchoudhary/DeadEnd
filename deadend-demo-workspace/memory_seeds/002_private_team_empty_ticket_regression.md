# Memory seed: private / team
# DeadEnd entry: empty-ticket regression after input validation change
# Scope: private
# Team-scoped memory for this org only.

## What failed

After a validation change, posting `/tickets` with a whitespace-only message
returned 200 with an empty-looking ticket instead of 400.

## Signature (normalized)

ticket endpoint accepts whitespace-only message after validation change

## Failed attempts

1. Added a length check but only on `strip()` in one path, not the entrypoint.
2. Added tests only for empty string, not whitespace-only input.

## Why it failed

Validation lived in the model layer, but the entrypoint still accepted
messages that were only whitespace. The regression came from changing one
layer without checking the other.

## Verified fix

- Reject at the entrypoint if `message.strip()` is empty.
- Add an explicit test for whitespace-only input returning 400.
- Keep the existing happy-path tests unchanged.

## Constraints

- Keep the 400 behavior for empty/whitespace input.
- Keep ticket ids deterministic for the same real message.

## Environment

language: python
framework: fastapi
os: linux
