"""The shared mechanics behind the per-event division rebuilds of the placements lock.

A rebuild replaces the named divisions of one event and nothing else, refuses a
second run, and refuses a row that names a person by an id whose record says
otherwise: identity is asserted, never decided, by these patches.

These run against temporary copies; the real lock is never touched.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_TOOL = Path(__file__).resolve().parents[1] / "tools" / "lock_division_rebuild.py"
_spec = importlib.util.spec_from_file_location("lock_division_rebuild", _TOOL)
tool = importlib.util.module_from_spec(_spec)
sys.modules["lock_division_rebuild"] = tool
_spec.loader.exec_module(tool)

HEADER = ("event_id,year,division_canon,division_category,place,competitor_type,person_id,"
          "team_person_key,person_canon,team_display_name,coverage_flag,person_unresolved,norm,division_raw")
OTHER = '9,2001,Open,freestyle,1,player,p9,,"Other, Person",,complete,,other person,'
LOCK = "\n".join([
    HEADER,
    OTHER,
    "1,2001,Open Combo,freestyle,1,team,,k1,__NON_PERSON__,Alpha Player / Legbeater -> Vortex,complete,,,",
    "1,2001,Open Shred,freestyle,1,player,pa,,Alpha Player,,complete,,alpha player,",
])
PT = "effective_person_id,person_canon\npa,Alpha Player\npb,Beta Player\n"


@pytest.fixture
def files(tmp_path, monkeypatch):
    lock, pt = tmp_path / "lock.csv", tmp_path / "pt.csv"
    lock.write_text(LOCK, encoding="utf-8")
    pt.write_text(PT, encoding="utf-8")
    monkeypatch.setattr(tool, "PBP", lock)
    monkeypatch.setattr(tool, "PT", pt)
    return lock


COMBO = [tool.Division("Open Combo", "freestyle", "complete", (
    tool.Player(1, "Alpha Player", "pa"), tool.Player(2, "Gamma Player")))]


def test_only_the_named_division_is_replaced(files):
    # Defect caught: a rebuild rewriting rows of other divisions or events.
    tool.rebuild("1", "2001", {"Open Combo": 1}, COMBO)
    lines = files.read_text(encoding="utf-8").split("\n")
    assert lines[1] == OTHER  # copied through byte for byte, quoting included
    assert lines[-1] == LOCK.split("\n")[-1]
    assert [ln.split(",")[8] for ln in lines if ",Open Combo," in ln] == ["Alpha Player", "Gamma Player"]
    unresolved = [ln for ln in lines if "Gamma Player" in ln][0].split(",")
    assert unresolved[6] == "" and unresolved[11] == "1"


def test_a_second_run_refuses(files):
    # Defect caught: a rerun replacing the rebuilt rows again or duplicating them.
    tool.rebuild("1", "2001", {"Open Combo": 1}, COMBO)
    with pytest.raises(AssertionError, match="already rebuilt"):
        tool.rebuild("1", "2001", {"Open Combo": 1}, COMBO)


def test_a_division_the_lock_lacks_is_added_beside_the_event(files):
    # Defect caught: a recovered division written elsewhere in the file, or not at all.
    new = [tool.Division("Open Golf", "golf", "complete", (tool.Player(1, "Alpha Player", "pa"),))]
    tool.rebuild("1", "2001", {}, new)
    lines = files.read_text(encoding="utf-8").split("\n")
    assert lines[-1].startswith("1,2001,Open Golf,golf,1,player,pa,")
    assert lines[1] == OTHER


def test_adding_a_division_the_lock_already_holds_refuses(files):
    # Defect caught: a second copy of a division instead of a rebuild of it.
    dup = [tool.Division("Open Shred", "freestyle", "complete", (tool.Player(1, "Alpha Player", "pa"),))]
    with pytest.raises(AssertionError, match="already in the lock"):
        tool.rebuild("1", "2001", {}, dup)
    assert files.read_text(encoding="utf-8") == LOCK


def test_an_id_whose_record_names_someone_else_refuses_and_writes_nothing(files):
    # Defect caught: a patch linking a placement to the wrong person.
    wrong = [tool.Division("Open Combo", "freestyle", "complete", (tool.Player(1, "Alpha Player", "pb"),))]
    with pytest.raises(AssertionError, match="not 'Alpha Player'"):
        tool.rebuild("1", "2001", {"Open Combo": 1}, wrong)
    assert files.read_text(encoding="utf-8") == LOCK
