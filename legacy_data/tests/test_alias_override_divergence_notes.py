"""Carrying a curated exception's reason into the table it explains.

An alias whose publication state follows its class explains itself. One set
against the class is a curator judgement, and the running application now refuses
to save such a row without a reason. The rows ruled before that requirement
existed keep their reasons in the curated override file, and the override loader
is the only thing that reads it. After cutover the loader no longer runs, so a
reason left in the file would be a reason nobody can see: the table has to carry
it across while the loader still can.

Two rules matter more than the copying. The loader refuses a divergence with no
reason at all, rather than writing an unexplained exception. And it refuses to
replace a note already on the row, because that note came from somewhere the
override file cannot see, and silently overwriting provenance is the failure
worth failing closed on. Today no such collision exists; this proves the refusal
before one does.
"""
from __future__ import annotations

import csv
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_LOADER = _ROOT / "freestyle" / "loaders" / "21b_apply_alias_overrides.py"
_OVERRIDES = _ROOT / "freestyle" / "inputs" / "base_dictionary" / "alias_overrides.csv"

NICKNAME_CLASS = "common"


def _rows() -> list[dict]:
    with _OVERRIDES.open(newline="", encoding="utf-8") as fh:
        return [r for r in csv.DictReader(fh) if (r.get("action") or "").strip() == "retype"]


def _diverging(rows: list[dict]) -> list[dict]:
    return [r for r in rows
            if (int(r["alias_display"].strip()) == 1) != (r["alias_type"].strip() == NICKNAME_CLASS)]


def test_every_diverging_override_carries_a_reason():
    """The precondition the loader enforces, asserted on the data as it stands.

    A divergence with no reason would abort a rebuild, so this fails here with a
    readable message rather than deep inside a pipeline run.
    """
    unexplained = [r["alias_slug"] for r in _diverging(_rows())
                   if not (r.get("note") or "").strip()]
    assert not unexplained, (
        f"these override rows set display against their class with no reason: "
        f"{unexplained}. A divergence must say why."
    )


def test_the_loader_refuses_a_divergence_with_no_reason():
    # Read from the source rather than executed: running the loader needs a built
    # database, and what is being pinned is that the refusal exists at all.
    src = _LOADER.read_text(encoding="utf-8")
    assert "A divergence must say why" in src
    assert "sys.exit(" in src


def test_the_loader_refuses_to_replace_a_note_it_did_not_write():
    """Fail closed rather than overwrite provenance.

    The note on a row may have come from a source loader. The override file
    cannot know that, so where the two differ the rebuild stops and asks for a
    human rather than choosing.
    """
    src = _LOADER.read_text(encoding="utf-8")
    assert "already carries a note this override" in src
    # The guard has to compare before writing, not after.
    guard = src.index("already carries a note this override")
    write = src.index("SET alias_type = ?, alias_display = ?, notes = ?")
    assert guard < write, "the collision guard must run before the write it protects"


def test_only_diverging_rows_get_a_note_written():
    """The copy is deliberately narrow.

    Writing every override's note would put 368 rows of curator commentary into a
    column the application also writes, and would collide with loader-written
    provenance on rows that have it. Only an exception needs its reason in the
    table, because only an exception is otherwise unexplained.
    """
    src = _LOADER.read_text(encoding="utf-8")
    # The notes-writing branch sits under the divergence test, and the ordinary
    # branch writes only the two fields.
    assert re.search(r'if \(adisplay == 1\) != \(atype == "common"\):', src)
    assert "SET alias_type = ?, alias_display = ? \"\n" in src or \
           "SET alias_type = ?, alias_display = ? " in src


@pytest.mark.skipif(not (_ROOT / "database" / "footbag.db").exists(),
                    reason="the built dictionary is not present here")
def test_the_rows_the_copy_targets_are_the_ruled_ones():
    """Which rows this touches, named rather than counted.

    These are the adjudicated exceptions. If the set changes, the change is a
    curator decision and should be visible as one.
    """
    ruled = {"big_applesauce", "frigidosis", "infinity", "whirlwalk",
             "reverse_around_the_world"}
    assert {r["alias_slug"] for r in _diverging(_rows())} == ruled


@pytest.mark.skipif(not (_ROOT / "database" / "footbag.db").exists(),
                    reason="the built dictionary is not present here")
def test_no_diverging_row_currently_collides_with_a_loader_note():
    """Today the copy is safe. This says so, and notices when it stops being.

    A collision is not a defect; it means a source loader started writing a note
    on a row an override also explains. It needs reconciling by hand, and this is
    where that is discovered rather than in a failed rebuild.
    """
    db = sqlite3.connect(
        f"file:{_ROOT / 'database' / 'footbag.db'}?mode=ro", uri=True)
    try:
        collisions = []
        for row in _diverging(_rows()):
            got = db.execute(
                "SELECT notes FROM freestyle_trick_aliases WHERE alias_slug = ?",
                (row["alias_slug"],)).fetchone()
            prior = ((got[0] if got else None) or "").strip()
            if prior and prior != (row.get("note") or "").strip():
                collisions.append(row["alias_slug"])
    finally:
        db.close()
    assert not collisions, (
        f"these rows carry a note the override would replace: {collisions}. "
        "Reconcile by hand; the loader will refuse rather than overwrite."
    )
