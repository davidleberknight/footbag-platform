"""
test_curated_world_record_parsing.py
====================================

The authoritative 1980-85 results text prints a record-setting result as
"1st - Tricia George - World Record - 12,838" and wraps the remaining places
onto the next line. The free-text parser used to delete everything from
"World Record" to the end of the joined line, so the record count and every
later place vanished; and a division with no dash before "1st" was skipped
whole. These tests read the committed source file itself and pin the places,
the record counts and the designation the parser must keep.

Run from repo root:
    python -m pytest legacy_data/tests/test_curated_world_record_parsing.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "pipeline" / "adapters" / "curated_events_adapter.py"
SOURCE = (REPO_ROOT / "legacy_data" / "inputs" / "curated" / "events" / "structured"
          / "authoritative-results-1980-1985.txt")


def _load():
    spec = importlib.util.spec_from_file_location("curated_events_adapter_wr", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


adapter = _load()


def _divisions(year: int) -> dict[str, list[str]]:
    lines = SOURCE.read_text(encoding="utf-8", errors="replace").splitlines()
    out: dict[str, list[str]] = {}
    for block in adapter._ot_iter_blocks(lines):
        if block.year != year:
            continue
        text, _ = adapter._ot_build_block(block.raw_lines)
        div = None
        for line in text.splitlines():
            if not line:
                continue
            if line[0].isdigit():
                out.setdefault(div, []).append(line)
            else:
                div = line
    assert out, f"no {year} block parsed from the source, so nothing was checked"
    return out


def test_places_after_a_1985_world_record_survive():
    # Defect caught: 2nd and 3rd place erased by the record annotation.
    d = _divisions(1985)
    assert d["WOMEN'S SINGLES CONSECUTIVE KICKS"] == [
        "1. Tricia George [World Record] - 12838", "2. Constance Constable", "3. Marie Elsner"]
    assert d["SINGLES CONSECUTIVE KICKS"] == [
        "1. Andy Linder [World Record] - 32598", "2. Pat Castle", "3. Fred Barnum"]
    assert d["DOUBLES ONE-PASS CONSECUTIVE KICKS"] == [
        "1. Jim Caveney / Bruce Guettich [World Record] - 3747",
        "2. Mag Hughes / David Robinson", "3. Brent Welch / Bill Langbehn"]
    assert d["WOMEN'S DOUBLES ONE-PASS CONSECUTIVE KICKS"] == [
        "1. Tricia George / Constance Constable [World Record] - 722",
        "2. Jodi Chandler / Nancy Reynolds", "3. Suzanne Beauchemin / Linda Burt"]


def test_a_record_count_wrapped_onto_its_own_line_joins_its_placement():
    # Defect caught: "World Record - 1665" on the next line dropped as an
    # administrative line, losing the count and the places after it.
    d = _divisions(1984)
    assert d["DOUBLES ONE-PASS CONSECUTIVE KICKS"] == [
        "1. Gary Lautt / Jim Caveney [World Record] - 1665",
        "2. Jodi Chandler / Jon Lind", "3. Mag Hughes / Greg Cortopassi"]
    assert d["WOMEN'S DOUBLES CONSECUTIVE KICKS"] == [
        "1. Jodi Chandler / Tricia George [World Record] - 2462",
        "2. Constance Constable / Vanessa Sabala"]


def test_a_division_with_no_dash_before_first_place_is_parsed():
    # Defect caught: "Women's Doubles One-Pass Consecutive Kicks 1st - ..."
    # skipped whole because no dash separates the division from "1st".
    d = _divisions(1984)
    assert d["WOMEN'S DOUBLES ONE-PASS CONSECUTIVE KICKS"] == [
        "1. Tricia George / Constance Constable", "2. Ruth Osterman / Vanessa Sabala"]
