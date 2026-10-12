# Demo tasks for ticketdesk-api

These are the prompts and beats used in the demo video.

## Pre-demo setup

1. Open `deadend-demo-workspace/` in the editor.
2. Sign in to DeadEnd in the extension.
3. Choose a team.
4. Seed private and global memories from `memory_seeds/` if they are not
   already present in the backend you are demonstrating against.

## Demo beat 1: show the memories that already exist

Show:
- private team memory: classifier priority ignores urgent cues at boundaries
- private team memory: empty-ticket regression after validation change
- global memory: classifier priority edge cases for urgent hardware and network
  messages

For each one, point at:
- the failure signature,
- the failed attempts,
- the verified fix,
- the scope,
- the environment,
- the confidence / reuse state if the backend already has reuse events.

Say the key point:
- some memories are private to this org,
- some are global and verified,
- the global one is the "many teams hit this" one.

## Demo beat 2: task with no existing memory, then capture the solution

Task:
- "The ticket endpoint is accepting blank-looking messages again and I need it
   to stop doing that without breaking the happy path."

Watch for:
- no matching private memory exists for this exact failure yet,
- the agent has to investigate and find the regression,
- the agent proposes a fix,
- the fix is tested.

After the run:
- show the failure being saved as a new private team memory,
- show the attempts graph and the verified fix in the new memory,
- say this is the "no memory existed, so we captured the solution" story.

## Demo beat 3: task that retrieves private + global in one run

Task:
- "Urgent hardware and network tickets are getting tagged low priority again
   and the same messages keep failing."

Watch for:
- retrieval surfaces both the private team memory and the global verified
  memory,
- private is ranked above global,
- the global memory is verified and redacted,
- the agent uses the prior fix instead of inventing a new one.

Say the key point:
- this is the "memory transfer" moment,
- one team's verified fix helps another run avoid the same dead end.

## Demo beat 4: show what happens without memory

Task:
- same as demo beat 3, but with memory off / baseline.

Watch for:
- no retrieve/inject phases,
- the agent is more likely to rediscover the urgency-cue gap from scratch,
- the run is a baseline comparison, not a reuse.

Say the key point:
- memory is not magic, it is measurable: with vs without.

## Prompts to paste

### Preview before task 3
> Show me what memory this task would retrieve: urgent hardware and network
> support tickets getting tagged low priority.

### Task 3 with memory
> Urgent hardware and network tickets are getting tagged low priority again and
> the same messages keep failing.

### Task 3 baseline without memory
> Urgent hardware and network tickets are getting tagged low priority again and
> the same messages keep failing.

### Task 2 with memory on
> The ticket endpoint is accepting blank-looking messages again and I need it
> to stop doing that without breaking the happy path.

### Task 2 baseline without memory
> The ticket endpoint is accepting blank-looking messages again and I need it
> to stop doing that without breaking the happy path.
