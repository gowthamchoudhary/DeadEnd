# Demo tasks for ticketdesk-api

These prompts and beats are for a truthful, repeatable DeadEnd demo.

## Pre-demo setup

1. Open `deadend-demo-workspace/` in the editor.
2. Sign in, choose the demo team, then select **Private team context only**
   when asked about global context.
3. Run **DeadEnd: Load demo memories into team** from the Command Palette.
   It adds ten labelled, team-private fixtures and is safe to repeat. Existing
   entries are detected, so running it again only adds new fixtures.
4. In the DeadEnd panel, preview the complex task below. Confirm several
   compatibility, validation, persistence, and API-contract memories appear.

## Demo beat 1: inspect the memory

Show the team-private entry titled **Urgent tickets demoted by the legacy
priority override**. Point out its failure signature, failed approaches,
proposed fix, and the `Demo seed` label. It is example data, not a production
incident or a cross-team verified memory.

## Demo beat 2: retrieve several memories for a multi-file task

Task:

> Add a typed POST /tickets/batch endpoint to ticketdesk-api without changing
> the existing POST /tickets response. Accept up to 50 ticket messages with an
> optional legacy priority override. Validate the whole batch before writing:
> empty and whitespace-only messages must be rejected with no partial tickets.
> Route priority overrides through the existing compatibility helper, but
> urgent network or hardware reports must stay high while routine tickets may
> still use a low override. Keep legacy aliases such as urgent, critical, and
> normal working and reject malformed overrides. Preserve deterministic
> per-ticket IDs independent of batch order or answer-template text, and make
> every returned ID fetchable through GET /tickets/{ticket_id}. Add focused
> regression tests for these cases and keep the existing single-ticket tests
> passing.

Show:

- Preview context lists several relevant team-private memories.
- The live timeline reports actual retrieval and injection counts.
- OpenCode works across the route, compatibility wrapper, ticket store, and
  tests rather than making a one-line keyword change.
- The tests pass for batch atomicity, urgency precedence, legacy aliases,
  deterministic IDs, GET-by-ID, and the existing single-ticket contract.

Key point: DeadEnd supplied a prior failure and proposed fix before the agent
started; the agent then applied and tested the fix in this workspace.

## Demo beat 3: compare with memory off

Run the same task with **Use DeadEnd memory** unchecked. Show that the run is
marked as baseline and has no retrieve or inject phases. This comparison is
optional if time is short.

## Prompts to paste

### Complex task with memory

> Add a typed POST /tickets/batch endpoint to ticketdesk-api without changing
> the existing POST /tickets response. Accept up to 50 ticket messages with an
> optional legacy priority override. Validate the whole batch before writing:
> empty and whitespace-only messages must be rejected with no partial tickets.
> Route priority overrides through the existing compatibility helper, but
> urgent network or hardware reports must stay high while routine tickets may
> still use a low override. Keep legacy aliases such as urgent, critical, and
> normal working and reject malformed overrides. Preserve deterministic
> per-ticket IDs independent of batch order or answer-template text, and make
> every returned ID fetchable through GET /tickets/{ticket_id}. Add focused
> regression tests for these cases and keep the existing single-ticket tests
> passing.

### Baseline without memory

> Add a typed POST /tickets/batch endpoint to ticketdesk-api without changing
> the existing POST /tickets response. Accept up to 50 ticket messages with an
> optional legacy priority override. Validate the whole batch before writing:
> empty and whitespace-only messages must be rejected with no partial tickets.
> Route priority overrides through the existing compatibility helper, but
> urgent network or hardware reports must stay high while routine tickets may
> still use a low override. Keep legacy aliases such as urgent, critical, and
> normal working and reject malformed overrides. Preserve deterministic
> per-ticket IDs independent of batch order or answer-template text, and make
> every returned ID fetchable through GET /tickets/{ticket_id}. Add focused
> regression tests for these cases and keep the existing single-ticket tests
> passing.
