"""Clearly labelled synthetic team-private memories for the ticketdesk demo.

Fixtures are a coherent example history, not claims about production incidents.
"""

DEMO_SEEDS = [
    {
        "title": "Urgent tickets demoted by the legacy priority override",
        "signature": "legacy compatibility wrapper priority override demotes urgent ticket",
        "error": (
            "An urgent support ticket is classified high by the main classifier, "
            "but the legacy compatibility wrapper applies a low priority override "
            "afterward and silently demotes it."
        ),
        "attempts": [
            {
                "approach": "Fix urgency phrases only in the classifier",
                "outcome": "failed",
                "why_it_failed": (
                    "The compatibility wrapper overwrites the classifier result "
                    "after classification, so the urgent ticket remains low."
                ),
            },
            {
                "approach": "Remove priority overrides from the wrapper",
                "outcome": "failed",
                "why_it_failed": (
                    "This breaks legacy callers that legitimately request a "
                    "lower priority for non-urgent tickets."
                ),
            },
        ],
        "fix": {
            "summary": (
                "Keep the compatibility wrapper, but never let a lower legacy "
                "override demote a ticket already classified high. Preserve "
                "explicit overrides for non-urgent tickets."
            ),
            "steps": [
                "Keep classify_ticket as the source of the urgency decision.",
                "Apply a legacy override only when it does not lower a high classification.",
                "Add tests for urgent plus low override and non-urgent plus low override.",
            ],
            "verified": False,
        },
        "constraints": [
            "Keep classify_with_compat available to legacy callers.",
            "Do not change non-urgent explicit override behavior.",
            "Keep classification deterministic.",
        ],
    },
    {
        "title": "Whitespace-only ticket slips past request validation",
        "signature": "ticket endpoint accepts whitespace-only message after validation change",
        "error": (
            "Posting a whitespace-only ticket message creates an empty-looking "
            "ticket instead of returning HTTP 400."
        ),
        "attempts": [
            {
                "approach": "Validate only the raw string length",
                "outcome": "failed",
                "why_it_failed": "Whitespace has a positive length but no content.",
            },
        ],
        "fix": {
            "summary": "Reject the message at the endpoint when message.strip() is empty.",
            "steps": [
                "Add a whitespace-only request regression test expecting HTTP 400.",
                "Keep the existing valid-ticket behavior unchanged.",
            ],
            "verified": False,
        },
        "constraints": [
            "Keep HTTP 400 for empty and whitespace-only input.",
            "Keep deterministic ticket ids for identical real messages.",
        ],
    },
    {
        "title": "Created ticket cannot be fetched by its returned id",
        "signature": "ticket post creates row get ticket id returns 404 separate in-memory stores",
        "error": "POST /tickets returns a ticket_id, but GET /tickets/{ticket_id} reads a different dictionary from create_ticket and returns 404.",
        "attempts": [
            {"approach": "Change the GET path", "outcome": "failed", "why_it_failed": "The id was valid; the route and helper owned different stores."},
            {"approach": "Copy rows into a second dictionary", "outcome": "failed", "why_it_failed": "The stores drifted and reset helpers still targeted only one."},
        ],
        "fix": {"summary": "Use one shared ticket-store API for create, get, and reset.", "steps": ["Move lookup behind apps.tickets.get_ticket or an equivalent shared API.", "Remove the route-local duplicate store.", "Test POST then GET with the returned ticket_id."], "verified": False},
        "constraints": ["Keep POST response fields unchanged.", "Keep storage in-memory for the demo."],
    },
    {
        "title": "Batch validation partially creates tickets before rejecting input",
        "signature": "batch tickets blank whitespace item validation atomic no partial writes",
        "error": "A batch with valid tickets followed by a whitespace-only message can leave earlier rows stored even though the request fails.",
        "attempts": [
            {"approach": "Validate each item just before creating it", "outcome": "failed", "why_it_failed": "A later invalid item arrives after earlier writes."},
            {"approach": "Return partial successes", "outcome": "failed", "why_it_failed": "A full retry creates confusing partial results."},
        ],
        "fix": {"summary": "Validate every batch item before writing any ticket.", "steps": ["Check item count and stripped messages first.", "Classify and create rows only after all inputs pass.", "Verify invalid batches leave the store unchanged."], "verified": False},
        "constraints": ["Rejected batches have no partial writes.", "Do not change the single-ticket endpoint."],
    },
    {
        "title": "Legacy priority aliases bypass urgency normalization",
        "signature": "legacy priority override urgent critical normal synonym case whitespace normalization",
        "error": "Legacy callers pass aliases such as urgent, critical, or normal; handling aliases in only one route produces inconsistent results.",
        "attempts": [
            {"approach": "Add alias cases in the HTTP route", "outcome": "failed", "why_it_failed": "Direct users of the compatibility wrapper bypass the route."},
            {"approach": "Treat unknown values as low", "outcome": "failed", "why_it_failed": "Typos silently become valid overrides."},
        ],
        "fix": {"summary": "Normalize legacy aliases in one helper and reject malformed values.", "steps": ["Keep case and whitespace handling in the shared helper.", "Map urgent and critical to high and normal to medium.", "Test aliases and malformed values through the wrapper."], "verified": False},
        "constraints": ["Do not duplicate alias tables in routes.", "Do not coerce invalid values to low."],
    },
    {
        "title": "Routine low override was lost while protecting urgent tickets",
        "signature": "urgent network priority override high but non urgent low override preserved",
        "error": "A change that protects urgent network tickets can accidentally disable valid low overrides for routine tickets.",
        "attempts": [
            {"approach": "Ignore all caller overrides", "outcome": "failed", "why_it_failed": "Legacy integrations rely on routine downgrades."},
            {"approach": "Apply the override last", "outcome": "failed", "why_it_failed": "A low override demotes an already urgent ticket."},
        ],
        "fix": {"summary": "Urgency wins over a downgrade while routine explicit overrides still work.", "steps": ["Classify urgency first.", "Prevent an override from lowering high priority.", "Test urgent-low and routine-low cases together."], "verified": False},
        "constraints": ["Urgent network and hardware tickets stay high.", "Routine low overrides remain supported."],
    },
    {
        "title": "Ticket ids changed when answer copy changed",
        "signature": "deterministic ticket id changes answer template text repeated message idempotency",
        "error": "The ticket hash includes rendered answer text, so an editorial template change alters the id for the same message and classification.",
        "attempts": [
            {"approach": "Use a random UUID", "outcome": "failed", "why_it_failed": "Retries no longer return the same ticket id."},
            {"approach": "Hash the full response object", "outcome": "failed", "why_it_failed": "Presentation copy still changes identity."},
        ],
        "fix": {"summary": "Define identity from stable request and classification fields, not presentation copy.", "steps": ["Document the normalized identity fields.", "Exclude answer-template text from the id hash.", "Test repeat requests and a changed answer template."], "verified": False},
        "constraints": ["Accepted identical requests stay deterministic.", "Do not add a database or random ids."],
    },
    {
        "title": "Batch retries created duplicate tickets in a different order",
        "signature": "batch ticket retry duplicate messages order deterministic ids idempotent",
        "error": "A retried batch should return stable per-item ids even when identical messages repeat or item order changes.",
        "attempts": [
            {"approach": "Use batch position as id", "outcome": "failed", "why_it_failed": "Reordering changes identifiers."},
            {"approach": "Deduplicate by position", "outcome": "failed", "why_it_failed": "Repeated messages still create inconsistent results."},
        ],
        "fix": {"summary": "Derive each ticket id from its stable identity, independent of batch position.", "steps": ["Reuse the single-ticket identity rule.", "Do not include array indexes in ids.", "Test duplicate items and a reordered retry."], "verified": False},
        "constraints": ["Preserve input order in responses.", "Repeated identical items keep deterministic ids."],
    },
    {
        "title": "Single-ticket clients broke after adding the batch route",
        "signature": "post tickets response schema changed batch endpoint backward compatibility",
        "error": "Changing POST /tickets into a list response breaks clients expecting ticket_id, category, priority, and answer at the top level.",
        "attempts": [
            {"approach": "Return a one-element list from POST /tickets", "outcome": "failed", "why_it_failed": "Existing callers expect one TicketOut object."},
            {"approach": "Add a response-shape mode flag", "outcome": "failed", "why_it_failed": "Clients must branch on an avoidable response shape."},
        ],
        "fix": {"summary": "Add bulk intake as a separate route and preserve the single-ticket contract.", "steps": ["Keep POST /tickets returning TicketOut.", "Add POST /tickets/batch with explicit models.", "Retain a regression check for original fields."], "verified": False},
        "constraints": ["Do not change the existing route's response shape.", "Keep batch models explicit."],
    },
    {
        "title": "Mixed hardware and network symptoms depend on keyword order",
        "signature": "ticket classifier multiple hardware network symptoms category priority keyword precedence",
        "error": "A laptop that cannot connect may be classified only as hardware or only as network depending on which keyword branch appears first.",
        "attempts": [
            {"approach": "Move network keywords above hardware", "outcome": "failed", "why_it_failed": "The same message then loses hardware context."},
            {"approach": "Keep rearranging keyword branches", "outcome": "failed", "why_it_failed": "Source order is not a documented multi-symptom policy."},
        ],
        "fix": {"summary": "Define an explicit deterministic precedence policy for mixed symptoms.", "steps": ["Choose expected category behavior for mixed examples.", "Encode precedence in a named rule.", "Test mixed and single-category messages."], "verified": False},
        "constraints": ["Keep classification deterministic and offline.", "Preserve existing single-category behavior."],
    },
]
