# Memory seed: global
# DeadEnd entry: classifier priority edge cases for urgent hardware and network messages
# Scope: global
# Verified, redacted, approved for sharing across teams.

## What failed

Across multiple teams, the same pattern showed up:
- urgent hardware messages got low priority,
- urgent network messages got low priority,
- repeated urgent messages were still mistagged because the urgency cues were
  incomplete.

This is not org-specific. It is a common triage logic gap.

## Signature (normalized)

urgent hardware and network support messages misclassified as low priority
when urgency cues are incomplete

## Failed attempts

1. Add one or two urgency keywords and stop. Misses the compound phrases.
2. Treat priority as a pure count of urgency words. Misses phrases where the
   urgency is in the relation, not the count.
3. Overfit to one team's vocabulary and break on others.

## Why it failed

Triage logic was tuned on a narrow vocabulary. Different teams type the same
urgency in different words, so a small closed cue list keeps failing in the
same way everywhere.

## Verified fix

- Use a small priority cue set that covers the common urgent phrasings across
  teams: "won't boot", "won't connect", "down", "blocked", "can't work",
  "asap", "immediately", and the single-word urgency cues too.
- Make urgency detection phrase-first, not count-first.
- Keep medium/low for everything else.
- Keep the fix generic: no hardcoded team vocabulary, no hardcoded ticket text.

## Redactions

Internal queue names and team routing labels are replaced with generic terms
before sharing globally.

## Constraints

- Keep classification deterministic.
- Keep it generic enough to apply to any similar support-desk classifier.
- Do not add external calls.

## Environment

language: python
framework: fastapi
os: linux
