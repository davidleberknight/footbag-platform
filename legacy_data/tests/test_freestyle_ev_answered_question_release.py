"""An answered rules question stops holding its Emerging Vocabulary rows.

A ledger row records the question that held it, and that record is history the
adjudication loader never lets anyone rewrite. Whether the question still holds the
row is the question's own status: once it is explicitly answered, the row is no
longer held by it and waits on the curator's authoring instead. Nothing else
releases a row: an open question, a decision group and source recovery keep
holding, so a row is never promoted merely because its question left the queue.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

GENERATOR = (
    Path(__file__).resolve().parents[2]
    / "freestyle" / "scripts" / "build_observational_universe_content.py"
)


def _generator():
    spec = importlib.util.spec_from_file_location("ev_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


QUESTIONS = {
    "Q11": {"status": "answered"},
    "Q12": {"status": "Answered by email"},
    "Q14": {"status": "sent"},
    "Q15": {"status": "drafted"},
}


def test_an_answered_question_releases_its_rows():
    active_blocker = _generator().active_blocker
    assert active_blocker("Q11", QUESTIONS) == ("", True)
    assert active_blocker("Q12", QUESTIONS) == ("", True)


def test_only_an_explicitly_answered_question_releases():
    active_blocker = _generator().active_blocker
    assert active_blocker("Q14", QUESTIONS) == ("Q14", False)
    assert active_blocker("Q15", QUESTIONS) == ("Q15", False)
    assert active_blocker("D3", QUESTIONS) == ("D3", False)
    assert active_blocker("source-recovery", QUESTIONS) == ("source-recovery", False)
    assert active_blocker("", QUESTIONS) == ("", False)
