"""
test_curated_variant_a_ties.py
==============================

A Variant A curated results file (one row per player) marks a real team in the
notes column ("doubles"). Players sharing a place without that mark are tied
individuals. The results block the adapter hands the parser must keep the two
apart: a tie must never read as a partnership, every tied player must survive,
and a marked team (including a trio) stays one entry.

Run from repo root:
    python -m pytest legacy_data/tests/test_curated_variant_a_ties.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "pipeline" / "adapters" / "curated_events_adapter.py"


def _load():
    spec = importlib.util.spec_from_file_location("curated_events_adapter", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    # The adapter defines dataclasses, which look their module up by name.
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


adapter = _load()


def _row(div, place, name, notes=""):
    return {"division": div, "place": str(place), "player_name": name, "notes": notes}


def _lines(rows):
    block, warnings = adapter._build_block_variant_a(rows)
    return block.splitlines(), warnings


def test_a_singles_tie_keeps_each_player_on_their_own_line():
    # Defect caught: two tied singles players shown as one doubles team.
    lines, _ = _lines([_row("Women's Overall", 5, "Lisa Monti"),
                       _row("Women's Overall", 5, "Valeria Davidson")])
    assert "5. Lisa Monti" in lines and "5. Valeria Davidson" in lines
    assert not any("/" in l for l in lines)


def test_a_multi_way_tie_keeps_every_tied_player():
    # Defect caught: a five-way tie cut to two names, or joined into one entry.
    names = ["Brent Stewart", "Patrick Keehan", "Dennis Ross", "Ahren Gehrman", "Tu Vu"]
    lines, _ = _lines([_row("Men's Overall", 65, n) for n in names])
    assert [l for l in lines if l.startswith("65. ")] == [f"65. {n}" for n in names]


def test_a_marked_doubles_team_stays_one_entry():
    # Defect caught: a real partnership split into two individual results.
    lines, warnings = _lines([_row("Open Dbls Net", 1, "Kenny Shults", "doubles"),
                              _row("Open Dbls Net", 1, "Randy Mulder", "doubles")])
    assert "1. Kenny Shults / Randy Mulder" in lines
    assert not warnings


def test_a_marked_trio_keeps_all_three_members():
    # Defect caught: a three-person team losing its third member.
    lines, _ = _lines([_row("Open Team Footbag Freestyle", 1, n, "doubles")
                       for n in ("Scott Cleere", "Bill Bethurum", "Randy Nelson")])
    assert "1. Scott Cleere / Bill Bethurum / Randy Nelson" in lines


def test_scores_travel_after_the_name_for_ties_and_teams():
    # Defect caught: a curated score dropped before it can reach the canonical
    # result, or attached to only one tied player.
    rows = [dict(_row("Women's Overall", 5, "Lisa Monti"), score="755"),
            dict(_row("Women's Overall", 5, "Valeria Davidson"), score="755"),
            dict(_row("Open Dbls Distance", 1, "Allan Petersen", "doubles"), score="355"),
            dict(_row("Open Dbls Distance", 1, "Remi Kristensen", "doubles"), score="355")]
    lines, _ = _lines(rows)
    assert "5. Lisa Monti - 755" in lines and "5. Valeria Davidson - 755" in lines
    assert "1. Allan Petersen / Remi Kristensen - 355" in lines


def test_a_team_and_a_tie_at_one_place_are_reported_and_both_kept():
    lines, warnings = _lines([_row("Mixed", 2, "A One", "doubles"),
                              _row("Mixed", 2, "B Two", "doubles"),
                              _row("Mixed", 2, "C Three")])
    assert "2. A One / B Two" in lines and "2. C Three" in lines
    assert any(w.startswith("mixed_team_and_solo") for w in warnings)


def test_every_shared_place_in_the_committed_variant_a_files_is_marked_or_singles():
    # Defect caught: an unmarked shared place in a team division, which this
    # adapter would now split into individuals.
    import csv
    import re
    team_div = re.compile(r"doubles|dbls|team|pair|mixed", re.I)
    structured = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "events" / "structured"
    offenders, checked = [], 0
    for p in sorted(structured.glob("*.txt")) + sorted(structured.glob("*.csv")):
        head = p.read_text(encoding="utf-8", errors="replace").splitlines()[:1]
        if not head or "player_name" not in head[0] or "player_1" in head[0]:
            continue
        groups = {}
        for r in csv.DictReader(open(p, encoding="utf-8", errors="replace")):
            groups.setdefault((r["event_name"], r["year"], r["division"], r["place"]), []).append(r)
        for (ev, yr, div, pl), g in groups.items():
            if len(g) < 2:
                continue
            checked += 1
            unmarked = [r for r in g if not adapter._TEAM_MARK_RE.search(r.get("notes") or "")]
            if unmarked and team_div.search(div):
                offenders.append(f"{p.name}:{yr}:{div}:p{pl}")
    assert checked, "no shared places found, so nothing was checked"
    assert not offenders, "unmarked shared places in team divisions: " + "; ".join(offenders)
