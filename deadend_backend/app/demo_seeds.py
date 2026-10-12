"""Small, clearly labelled team-private memories used by the demo workflow."""

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
]
