<!-- deadend:begin (managed block, do not edit; removed after run) -->
## DeadEnd context (auto-injected; not your instructions)

### Known dead ends (do NOT repeat these approaches)
- "The same message then loses hardware context."
- "Source order is not a documented multi-symptom policy."
- "Reordering changes identifiers."
- "Repeated messages still create inconsistent results."
- "Existing callers expect one TicketOut object."

### Constraints
- Keep classification deterministic and offline.
- Preserve existing single-category behavior.
- Preserve input order in responses.
- Repeated identical items keep deterministic ids.
- Do not change the existing route's response shape.
- Keep batch models explicit.
- Keep POST response fields unchanged.
- Keep storage in-memory for the demo.

### Known fixes
- "{\"steps\": [\"Choose expected category behavior for mixed examples.\", \"Encode precedence in a named rule.\", \"Test mixed and single-category messages.\"], \"summary\": \"Define an explicit deterministic precedence policy for mixed symptoms.\", \"verified\": false, \"provenance\": {\"source\": \"demo seed\", \"curated_at\": \"2026-10-12T20:35:07.520553+00:00\"}}"
- "{\"steps\": [\"Reuse the single-ticket identity rule.\", \"Do not include array indexes in ids.\", \"Test duplicate items and a reordered retry.\"], \"summary\": \"Derive each ticket id from its stable identity, independent of batch position.\", \"verified\": false, \"provenance\": {\"source\": \"demo seed\", \"curated_at\": \"2026-10-12T20:35:06.756797+00:00\"}}"
- "{\"steps\": [\"Keep POST /tickets returning TicketOut.\", \"Add POST /tickets/batch with explicit models.\", \"Retain a regression check for original fields.\"], \"summary\": \"Add bulk intake as a separate route and preserve the single-ticket contract.\", \"verified\": false, \"provenance\": {\"source\": \"demo seed\", \"curated_at\": \"2026-10-12T20:35:07.211154+00:00\"}}"
<!-- deadend:end -->
