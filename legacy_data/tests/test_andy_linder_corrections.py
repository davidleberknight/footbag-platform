"""The competitor's own corrections to his results, and how far they are carried.

`overrides/andy_linder_corrections.yaml` records what Andy Linder told us about
his own competitive record. It is provenance rather than a directive set, and the
distinction is not pedantry: its `division` tokens name no discipline key that
exists, four of its event names are not event keys, several entries are questions
rather than instructions, and its removal list names events without saying which
result. Resolving any of that means a person reading both sides.

So the pipeline does not read the file. A human resolves each entry into an
explicit, key-accurate correction, and this tests the resolved set — that the two
outstanding removals are carried, that nothing else moves, and that a correction
whose target has drifted refuses rather than quietly retiring itself.

The one entry deliberately left unresolved is pinned too, so that "not done" stays
visibly a decision rather than an oversight.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _ROOT / "legacy_data" / "pipeline" / "05p5_remediate_canonical.py"
_YAML = _ROOT / "legacy_data" / "overrides" / "andy_linder_corrections.yaml"
_CANON = _ROOT / "legacy_data" / "event_results" / "canonical_input"

SOURCE = _SCRIPT.read_text(encoding="utf-8")
ANDY = "64a7a989-aa2c-5a58-b141-e8378be4a962"

# The two removals resolved from the file, as the pipeline declares them.
EXPECTED = {
    ("S-20", "1995_worlds", "open_singles_5_minute_consecutive", "3"),
    ("S-21", "1986_worlds_golden", "open_singles_footbag_consecutive", "4"),
}


def _declared() -> set[tuple[str, str, str, str]]:
    """The declared removals, read out of the script rather than restated."""
    block = SOURCE.split("_ANDY_REMOVALS = [", 1)[1].split("]", 1)[0]
    return {m.groups() for m in
            re.finditer(r'\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)', block)}


def _participants() -> list[dict]:
    with (_CANON / "event_result_participants.csv").open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# ── the resolved set ─────────────────────────────────────────────────────────

def test_the_two_outstanding_removals_are_declared():
    assert _declared() == EXPECTED


def test_the_declared_targets_use_real_discipline_keys_not_the_file_s_wording():
    # The file says "singles_consecutives"; no such key exists. Carrying its
    # wording across verbatim would match nothing and silently do nothing.
    text = _YAML.read_text(encoding="utf-8")
    assert "singles_consecutives" in text
    assert "singles_consecutives" not in SOURCE.split("_ANDY_REMOVALS = [", 1)[1][:400]
    for _tag, _ev, dk, _pl in _declared():
        assert dk.startswith(("open_", "womens_", "advanced_", "intermediate_",
                              "mixed_", "doubles_", "singles_", "footbag_")), dk


def test_the_earlier_corrections_are_still_carried():
    # S-17 to S-19 are the same work done previously; this block extends them
    # rather than replacing them.
    for tag in ("S-17", "S-18", "S-19"):
        assert tag in SOURCE, tag
    assert "Cabin Fever Classic" in SOURCE
    assert "Oak Park - Chicago Open" in SOURCE


# ── fail closed ──────────────────────────────────────────────────────────────

def _guard():
    """The pipeline's own guard, lifted out of the script so these exercise the
    shipped code rather than a copy of it that could drift."""
    ns: dict = {}
    start = SOURCE.index("def andy_row_to_remove(")
    end = SOURCE.index("for _tag, _ev, _dk, _pl in _ANDY_REMOVALS:")
    exec(SOURCE[start:end], ns)  # noqa: S102 - the function under test
    return ns["andy_row_to_remove"]


def _apply(removals, participants):
    """Run the shipped guard over a set of removals, as the script does."""
    guard = _guard()
    out = list(participants)
    for tag, ev, dk, pl in removals:
        match = guard(out, tag, ev, dk, pl, ANDY)
        out = [r for r in out if r is not match]
    return out


def _row(ev, dk, pl, pid=ANDY, order="1"):
    return {"event_key": ev, "discipline_key": dk, "placement": pl,
            "person_id": pid, "participant_order": order, "display_name": "Andy Linder"}


def test_a_target_that_is_absent_refuses():
    # These rows come from the parsed source and are present on every build, so
    # absence means the upstream moved under a decision made against it.
    with pytest.raises(SystemExit, match="S-20"):
        _apply([("S-20", "1995_worlds", "open_singles_5_minute_consecutive", "3")], [])


def test_a_target_that_matches_twice_refuses():
    dup = [_row("1995_worlds", "open_singles_5_minute_consecutive", "3"),
           _row("1995_worlds", "open_singles_5_minute_consecutive", "3", order="2")]
    with pytest.raises(SystemExit, match="matches 2 participant rows"):
        _apply([("S-20", "1995_worlds", "open_singles_5_minute_consecutive", "3")], dup)


def test_a_row_for_a_different_person_does_not_satisfy_the_target():
    # The correction is about one competitor's record. Someone else's placement in
    # the same slot must not be mistaken for it, nor removed.
    other = [_row("1995_worlds", "open_singles_5_minute_consecutive", "3",
                  pid="11111111-1111-1111-1111-111111111111")]
    with pytest.raises(SystemExit):
        _apply([("S-20", "1995_worlds", "open_singles_5_minute_consecutive", "3")], other)
    assert len(other) == 1


def test_the_pipeline_declares_the_same_guards():
    block = SOURCE.split("_ANDY_REMOVALS = [", 1)[1]
    assert "raise SystemExit(" in block
    assert "and it does not" in block
    assert "is ambiguous" in block


# ── nothing else moves ───────────────────────────────────────────────────────

def test_only_the_named_rows_are_removed():
    keep = [
        _row("1995_worlds", "open_singles_5_minute_consecutive", "2"),   # other place
        _row("1995_worlds", "open_singles_freestyle", "3"),              # other slot
        _row("1986_worlds_golden", "open_singles_footbag_freestyle", "2"),
        _row("1986_worlds_golden", "open_overall_standings", "18"),
        _row("1991_worlds", "open_singles_freestyle", "2"),
    ]
    targets = [_row("1995_worlds", "open_singles_5_minute_consecutive", "3"),
               _row("1986_worlds_golden", "open_singles_footbag_consecutive", "4")]
    before = [dict(r) for r in keep]
    after = _apply(sorted(_declared()), keep + targets)
    assert after == before, "an unrelated row was altered or dropped"


def test_the_confirmed_results_are_never_removals():
    # The file also confirms two freestyle placements as correct. Neither may
    # appear in the removal list, or a confirmation would delete a result.
    declared = {(ev, dk) for _t, ev, dk, _p in _declared()}
    assert ("1986_worlds_golden", "open_singles_footbag_freestyle") not in declared
    assert ("1991_worlds", "open_singles_freestyle") not in declared


def test_the_ambiguous_entry_is_not_acted_on():
    """The file lists 1991 under remove_results with no division, while another
    entry confirms one of that event's two results as correct. Which row it means
    is unresolvable from the file, so it stays for a ruling — recorded here so
    that staying undone is visibly a decision."""
    assert not any(ev == "1991_worlds" for _t, ev, _d, _p in _declared())
    block = SOURCE.split("_ANDY_REMOVALS = [", 1)[0]
    assert "1991_worlds" in block[-2000:], (
        "the reason 1991 is left alone is no longer written down beside the list")


# ── against the delivered results ────────────────────────────────────────────

@pytest.mark.skipif(not (_CANON / "event_result_participants.csv").exists(),
                    reason="the canonical competitor data is not present here")
def test_each_declared_target_exists_exactly_once_in_the_delivered_data():
    """What makes these corrections outstanding rather than already done: both
    rows are still there, once each, so the guards will neither refuse nor find
    an ambiguity on the next rebuild."""
    parts = _participants()
    for tag, ev, dk, pl in sorted(_declared()):
        hits = [p for p in parts
                if p["event_key"] == ev and p["discipline_key"] == dk
                and p["placement"] == pl and p["person_id"] == ANDY]
        assert len(hits) == 1, f"{tag}: {ev}/{dk}/p{pl} matched {len(hits)}"


@pytest.mark.skipif(not (_CANON / "event_result_participants.csv").exists(),
                    reason="the canonical competitor data is not present here")
def test_the_confirmed_freestyle_placements_are_present():
    # The file's add_or_confirm entries, checked rather than assumed. Both are
    # already correct in the data, which is why they need no code.
    parts = _participants()
    for ev, dk, pl in (("1986_worlds_golden", "open_singles_footbag_freestyle", "2"),
                       ("1991_worlds", "open_singles_freestyle", "2")):
        assert any(p["event_key"] == ev and p["discipline_key"] == dk
                   and p["placement"] == pl and p["person_id"] == ANDY
                   for p in parts), f"{ev}/{dk}/p{pl} is no longer present"
