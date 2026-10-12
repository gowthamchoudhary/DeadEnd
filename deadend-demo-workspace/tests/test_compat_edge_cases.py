from __future__ import annotations

import pytest

from compat.classifier import classify_with_compat, _normalise_priority_input


def test_normalise_priority_input_urgent_synonyms() -> None:
    assert _normalise_priority_input("urgent") == "high"
    assert _normalise_priority_input("critical") == "high"
    assert _normalise_priority_input("high") == "high"


def test_normalise_priority_input_medium_synonyms() -> None:
    assert _normalise_priority_input("medium") == "medium"
    assert _normalise_priority_input("normal") == "medium"
    assert _normalise_priority_input("moderate") == "medium"


def test_normalise_priority_input_low_synonyms() -> None:
    assert _normalise_priority_input("low") == "low"
    assert _normalise_priority_input("minor") == "low"
    assert _normalise_priority_input("trivial") == "low"


def test_normalise_priority_input_rejects_malformed() -> None:
    with pytest.raises(ValueError):
        _normalise_priority_input("not a priority")


def test_compat_wrapper_keeps_classified_priority_when_override_absent() -> None:
    cat, pri, ans = classify_with_compat("My laptop won't boot after the update.")
    assert cat == "hardware"
    assert pri == "high"
    assert ans


def test_compat_wrapper_override_is_normalised_not_bypass() -> None:
    # The bug story: a legacy caller passed a raw priority form that the old
    # helper accepted. The compat wrapper must normalise it, not silently trust it.
    cat, pri, ans = classify_with_compat(
        "Printer on floor 3 is jammed again.", priority_override="low")
    assert pri == "low"


def test_compat_wrapper_urgent_override_still_counts_as_high() -> None:
    cat, pri, ans = classify_with_compat(
        "Printer on floor 3 is jammed again.", priority_override="urgent")
    assert pri == "high"
