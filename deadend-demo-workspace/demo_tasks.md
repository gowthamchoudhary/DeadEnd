# Demo tasks for ticketdesk-api

These prompts and beats are for a truthful, repeatable DeadEnd demo.

## Pre-demo setup

1. Open `deadend-demo-workspace/` in the editor.
2. Sign in, choose the demo team, then select **Private team context only**
   when asked about global context.
3. Run **DeadEnd: Load demo memories into team** from the Command Palette.
   It adds two labelled, team-private fixtures and is safe to repeat.
4. In the DeadEnd panel, preview the task below and confirm the compatibility
   memory appears before starting the run.

## Demo beat 1: inspect the memory

Show the team-private entry titled **Urgent tickets demoted by the legacy
priority override**. Point out its failure signature, failed approaches,
proposed fix, and the `Demo seed` label. It is example data, not a production
incident or a cross-team verified memory.

## Demo beat 2: retrieve the memory and fix the reproducible bug

Task:

> The legacy compatibility wrapper is demoting urgent network tickets to low
> when its caller passes a low priority override. Make urgency win over that
> downgrade, preserve low overrides for non-urgent tickets, and run the tests.

Show:

- Preview context lists the team-private compatibility memory.
- The live timeline reports its retrieve match and injected context.
- OpenCode updates the compatibility wrapper and adds a regression test.
- The tests pass, including the existing non-urgent override behavior.

Key point: DeadEnd supplied a prior failure and proposed fix before the agent
started; the agent then applied and tested the fix in this workspace.

## Demo beat 3: compare with memory off

Run the same task with **Use DeadEnd memory** unchecked. Show that the run is
marked as baseline and has no retrieve or inject phases. This comparison is
optional if time is short.

## Prompts to paste

### Preview / run with memory

> The legacy compatibility wrapper is demoting urgent network tickets to low
> when its caller passes a low priority override. Make urgency win over that
> downgrade, preserve low overrides for non-urgent tickets, and run the tests.

### Baseline without memory

> The legacy compatibility wrapper is demoting urgent network tickets to low
> when its caller passes a low priority override. Make urgency win over that
> downgrade, preserve low overrides for non-urgent tickets, and run the tests.
