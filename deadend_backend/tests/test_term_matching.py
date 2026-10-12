from deadend_backend.app.demo_seeds import DEMO_SEEDS
from deadend_backend.app.term_matching import terms


DEMO_TASK = (
    "The legacy compatibility wrapper is demoting urgent network tickets to "
    "low when its caller passes a low priority override. Make urgency win over "
    "that downgrade, preserve low overrides for non-urgent tickets, and run tests."
)


def test_demo_task_matches_legacy_override_memory():
    memory = DEMO_SEEDS[0]
    searchable = " ".join((memory["title"], memory["signature"], memory["error"]))
    assert len(terms(DEMO_TASK) & terms(searchable)) >= 2


def test_word_forms_match_ticket_and_demote():
    assert "ticket" in terms("tickets")
    assert "demot" in terms("demoting demoted")


def test_domain_words_are_not_discarded():
    assert {"urgent", "hardware", "network"} <= terms(
        "urgent hardware and network support tickets")
