"""A placement the source records survives even when its competitor cannot be named.

Some result lines name a competitor by a single word: a first name, a surname cut
from "Surname (CZ)", or a garbled fragment such as a country. A single word cannot
tell a real name from a fragment, so an unlinked one is not shown; but the source
establishes that the place existed, so the placement stays, held by the unknown
sentinel the site shows as "Unknown". The remediation pass also refuses to leave a
discipline with none of the results it held.

These exercise the shipped functions on synthetic rows.
"""
from __future__ import annotations

from pathlib import Path

_SCRIPT = (Path(__file__).resolve().parents[1] / "pipeline" / "05p5_remediate_canonical.py")
SOURCE = _SCRIPT.read_text(encoding="utf-8")


def _fix8() -> dict:
    """The pass's own functions, lifted out of the script so these exercise the
    shipped code rather than a copy of it that could drift."""
    ns: dict = {"disciplines": []}
    start = SOURCE.index("import re as _re")
    end = SOURCE.index("_f8_discs_with_results_before =")
    exec(SOURCE[start:end], ns)  # noqa: S102 - the functions under test
    return ns


def _p(name, ev="E", dk="open_freestyle", pl="1", pid="", notes=""):
    return {"event_key": ev, "discipline_key": dk, "placement": pl,
            "display_name": name, "person_id": pid, "notes": notes}


def test_a_single_name_keeps_its_place_as_unknown():
    # Defect caught: a real placement deleted because the source printed one name.
    rows = [_p("Jean", pl="3"), _p("Poland", pl="4")]
    unknown, _ = _fix8()["mark_artifact_participants"](rows, set())
    assert [(r["placement"], r["display_name"]) for r in rows] == [("3", "[UNKNOWN]"), ("4", "[UNKNOWN]")]
    assert unknown == 2


def test_a_doubles_artifact_becomes_the_unknown_partner():
    rows = [_p("Jean", dk="open_doubles_net")]
    unknown, sentineled = _fix8()["mark_artifact_participants"](rows, {("E", "open_doubles_net")})
    assert rows[0]["display_name"] == "[UNKNOWN PARTNER]" and (unknown, sentineled) == (0, 1)


def test_trusted_names_linked_people_and_club_standings_are_untouched():
    # Defect caught: a real competitor or a club standing replaced by "Unknown".
    rows = [_p("Jean Dupont"), _p("Jean", pid="p1"), _p("Footstars", notes="club_standing")]
    unknown, sentineled = _fix8()["mark_artifact_participants"](rows, set())
    assert [r["display_name"] for r in rows] == ["Jean Dupont", "Jean", "Footstars"]
    assert (unknown, sentineled) == (0, 0)


def test_a_discipline_left_with_no_results_is_reported():
    # Defect caught: a whole division of results disappearing with nothing said.
    before = {("E", "open_freestyle"), ("E", "open_net")}
    after = [{"event_key": "E", "discipline_key": "open_net"}]
    assert _fix8()["disciplines_emptied"](before, after) == [("E", "open_freestyle")]
    assert _fix8()["disciplines_emptied"](before, after + [
        {"event_key": "E", "discipline_key": "open_freestyle"}]) == []


def test_the_pass_stops_rather_than_emptying_a_discipline():
    # Defect caught: the refusal reduced to a warning that lets the build ship.
    block = SOURCE.split("_f8_emptied = disciplines_emptied(", 1)[1][:600]
    assert "raise SystemExit(" in block
