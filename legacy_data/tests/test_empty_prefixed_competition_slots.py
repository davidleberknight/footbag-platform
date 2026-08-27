"""Empty duplicate competition slots on the merged pre-1985 Worlds events.

Those events were merged into surviving ones, and the merge adds a loser
discipline whenever its key is absent from the winner's set, comparing keys as
exact strings. The merged-away events spell their disciplines with an `open_`
prefix and the survivors spell them without it, so both spellings live on and the
public results page shows a second, empty section for the same competition.

The correction removes the empty prefixed copies on four named events. Which
spelling is "right" is not the question and the naming evidence points the other
way: across the archive the prefixed form is the majority. The ruling follows
which copy carries the competitors.

The reason the target list is named rather than derived is a fifth event whose
prefixed slots carry real competitors. A rule that matched on the key would
delete them. That event is pinned here as the counterexample it is.

These test the fix's logic against synthetic rows and against the shape of the
delivered data. Regenerating the competitor-results corpus is a separate step
that belongs to the cutover, so nothing here rebuilds anything.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _ROOT / "legacy_data" / "pipeline" / "05p5_remediate_canonical.py"
_CANON = _ROOT / "legacy_data" / "event_results" / "canonical_input"

SOURCE = _SCRIPT.read_text(encoding="utf-8")

# The four events whose prefixed slots are empty and are removed.
CLEARED_EVENTS = {
    "1982_worlds_oregon_city",
    "1983_worlds_boulder_wfa",
    "1983_worlds_boulder_nhsa",
    "1984_worlds_golden_wfa",
}
# The fifth event. Its prefixed slots hold competitors and must survive.
PROTECTED_EVENT = "1984_worlds_golden_fbw"

EXPECTED_TARGETS = 20


def _targets() -> list[tuple[str, str]]:
    """The declared pairs, read out of the script rather than restated, so a list
    edited in one place and not the other cannot pass."""
    block = SOURCE.split("_F13_TARGETS: list[tuple[str, str]] = [", 1)[1].split("]", 1)[0]
    return [(m.group(1), m.group(2))
            for m in re.finditer(r'\("([^"]+)",\s*"([^"]+)"\)', block)]


# ── the declared targets ─────────────────────────────────────────────────────

def test_the_target_list_is_the_audited_twenty():
    assert len(_targets()) == EXPECTED_TARGETS


def test_every_target_names_a_prefixed_slot_on_one_of_the_four_events():
    for event, discipline in _targets():
        assert event in CLEARED_EVENTS, event
        assert discipline.startswith("open_"), discipline


def test_the_protected_event_is_never_a_target():
    # The whole reason the list is named rather than derived.
    assert all(event != PROTECTED_EVENT for event, _ in _targets())


def test_no_target_is_listed_twice():
    t = _targets()
    assert len(set(t)) == len(t)


# ── the guard, on synthetic rows ─────────────────────────────────────────────

def _emptiness_checker():
    """The fix's own predicate, lifted out of the script so these exercise the
    shipped code rather than a copy of it that could drift."""
    ns: dict = {}
    start = SOURCE.index("def _f13_slot_is_empty(")
    end = SOURCE.index("_f13_discs_removed = 0")
    exec(SOURCE[start:end], ns)  # noqa: S102 - the function under test
    return ns["_f13_slot_is_empty"]


def _result(ev="E", dk="open_golf", placement="1", score_text="", notes=""):
    return {"event_key": ev, "discipline_key": dk, "placement": placement,
            "score_text": score_text, "notes": notes}


def _participant(ev="E", dk="open_golf", placement="1"):
    return {"event_key": ev, "discipline_key": dk, "placement": placement,
            "display_name": "Someone", "person_id": "p1"}


def test_an_empty_slot_reports_empty():
    check = _emptiness_checker()
    assert check("E", "open_golf", [_result()], []) == ""


def test_a_slot_with_a_participant_is_refused():
    check = _emptiness_checker()
    assert check("E", "open_golf", [_result()], [_participant()]) == "a participant"


def test_a_slot_with_score_text_is_refused():
    check = _emptiness_checker()
    assert check("E", "open_golf", [_result(score_text="15-3")], []) == "score text"


def test_a_slot_with_a_note_is_refused():
    check = _emptiness_checker()
    assert check("E", "open_golf", [_result(notes="disputed")], []) == "a note"


def test_a_participant_in_a_different_slot_does_not_protect_this_one():
    # The placement has to line up, or an unrelated competitor elsewhere in the
    # event would make every slot look occupied and the fix would never run.
    check = _emptiness_checker()
    assert check("E", "open_golf", [_result(placement="1")],
                 [_participant(placement="9")]) == ""


def test_a_participant_in_a_different_discipline_does_not_protect_this_one():
    check = _emptiness_checker()
    assert check("E", "open_golf", [_result()],
                 [_participant(dk="open_singles_net")]) == ""


# ── the fix's own contract, read from the script ─────────────────────────────

def test_a_slot_that_carries_something_aborts_rather_than_being_skipped():
    # Skipping would leave the duplicate section on the page and say nothing.
    assert "raise SystemExit(" in SOURCE.split("[Fix 13]", 1)[1][:4000]
    assert "refusing to remove" in SOURCE


def test_an_absent_target_is_a_silent_no_op():
    # A rebuild may already be clean, and a run over corrected data must not
    # start failing.
    block = SOURCE.split("for _f13_ev, _f13_dk in _F13_TARGETS:", 1)[1][:600]
    assert "_f13_absent += 1" in block
    assert "continue" in block


def test_the_discipline_and_its_results_are_removed_together():
    # Leaving either behind trips the orphaned-reference check, which is a hard
    # failure in the relational report.
    block = SOURCE.split("[Fix 13]", 1)[1]
    assert "_f13_results_removed" in block
    assert "_f13_discs_removed += 1" in block


def test_the_fix_runs_after_the_merge_that_creates_the_duplicates():
    # Ordering is the whole mechanism: before the merge there is nothing to
    # remove, because the loser event still holds its own rows.
    assert SOURCE.index("Remove all loser rows from all tables") < SOURCE.index("[Fix 13]")


# ── the delivered data still has the shape the ruling was made on ────────────

@pytest.mark.skipif(not (_CANON / "event_disciplines.csv").exists(),
                    reason="the canonical competitor data is not present here")
def test_the_protected_event_still_carries_competitors_in_its_prefixed_slots():
    """The counterexample, asserted against real data rather than described.

    If this event ever stops carrying competitors the guard has nothing left to
    protect and the named-list design needs revisiting; if it starts appearing in
    the target list, the fix would delete real results.
    """
    disciplines = list(csv.DictReader((_CANON / "event_disciplines.csv").open(encoding="utf-8")))
    results = list(csv.DictReader((_CANON / "event_results.csv").open(encoding="utf-8")))
    parts = list(csv.DictReader(
        (_CANON / "event_result_participants.csv").open(encoding="utf-8")))

    prefixed = {d["discipline_key"] for d in disciplines
                if d["event_key"] == PROTECTED_EVENT and d["discipline_key"].startswith("open_")}
    assert prefixed, "the protected event no longer has prefixed slots"

    occupied = {(p["discipline_key"], p["placement"]) for p in parts
                if p["event_key"] == PROTECTED_EVENT}
    for dk in prefixed:
        slots = {r["placement"] for r in results
                 if r["event_key"] == PROTECTED_EVENT and r["discipline_key"] == dk}
        assert any((dk, pl) in occupied for pl in slots), (
            f"{PROTECTED_EVENT}/{dk} no longer carries a competitor")
