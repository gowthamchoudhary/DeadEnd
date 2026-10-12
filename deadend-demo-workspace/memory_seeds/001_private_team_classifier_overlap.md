# Memory seed: private / team
# DeadEnd entry: classifier priority logic ignores urgent cues at boundaries
# Scope: private
# Team-scoped memory for this org only.

## What failed

The support-desk classifier tagged:
- "My laptop won't boot after the update." as **low** priority
- "Printer on floor 3 is jammed again." as **low** priority

Both should have been higher. The classifier's priority cue list was missing
the exact urgent phrases users actually typed.

## Signature (normalized)

support desk classifier sets low priority on urgent hardware messages
because urgent-cue list is incomplete

## Failed attempts

1. Tried adding a generic "urgent" keyword only; missed the compound urgent
   phrases like "won't boot" and "no internet".
2. Tried tuning thresholds on priority counts; did not fix the wording gap.

## Why it failed

The classifier used a small closed list of urgency cues. Real users type
phrases like "won't boot" and "printer jammed again" that were not in that
list, so high-urgency tickets got low priority.

## Verified fix

- Expand urgency cues to include the exact user-phrase patterns the desk
  actually sees: "won't boot", "won't connect", "down", "blocked", "can't work",
  "asap", "immediately".
- Keep the existing count-based medium/low fallback, but make high-urgency
  phrases short-circuit to high priority first.
- Add a regression test for the two misclassified messages above and one
  network message.

## Constraints

- Keep classification deterministic.
- Keep the answer templates unchanged.
- Do not start calling external services.

## Environment

language: python
framework: fastapi
os: linux
