"""
test_freestyle_trick_family_integrity.py
========================================

A trick's family names a real trick.

The column is a relationship, not a label: a compound carries its base trick's
slug, a base trick carries its own, and a modifier carries nothing. The public
browse groups on it directly, so a value naming no trick does not fail anywhere.
It renders: the rows carrying it split off into a group of their own, under a
name no page can be reached by, cut off from the family they belong to. That is
how an alias spelling of a family, correct in prose and wrong in this column,
once separated three tricks from the twenty-one others in their lineage.

Two ways in, both quiet. A curator override can be authored with the alias
spelling, which reads correctly to anyone checking the note rather than the
value. And the dictionary loader derives the family from the raw base value, so
a correction that resolves a base trick to its full slug leaves the family it
was already derived from untouched.

A blank family is not checked here. Some rows legitimately carry none, and
whether a given trick should have one is a curator question rather than a
structural one; what this guard refuses is a value that points nowhere.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_trick_family_integrity.py -v
"""
import sqlite3

from built_db import DB_PATH, require_loaded


def _conn():
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def test_every_active_trick_family_names_a_trick():
    require_loaded("freestyle_tricks")
    conn = _conn()
    try:
        slugs = {row[0] for row in conn.execute("SELECT slug FROM freestyle_tricks")}
        families = conn.execute(
            "SELECT slug, trick_family FROM freestyle_tricks "
            "WHERE is_active = 1 AND trick_family IS NOT NULL "
            "AND TRIM(trick_family) <> ''"
        ).fetchall()
    finally:
        conn.close()

    # Floor before the verdict: this test concludes from finding no dangling
    # value, so a corpus where nothing carries a family would pass it having
    # checked nothing. require_loaded proves the table holds rows, not that any
    # of them carry this column.
    assert families, (
        "no active trick carries a family, so the integrity check examined nothing."
    )

    dangling = sorted(
        (slug, family) for slug, family in families if family not in slugs
    )
    assert not dangling, (
        f"{len(dangling)} active trick(s) carry a family that names no trick: "
        + ", ".join(f"{slug} -> {family!r}" for slug, family in dangling)
        + ". The column holds canonical trick slugs, so an alias or an abbreviation "
        "splits the family on every surface that groups by it. Correct the value at "
        "its source in the curator ledger rather than in the database."
    )


def test_modifier_rows_carry_no_family():
    require_loaded("freestyle_tricks")
    conn = _conn()
    try:
        modifiers = conn.execute(
            "SELECT slug, COALESCE(trick_family, '') FROM freestyle_tricks "
            "WHERE is_active = 1 AND category = 'modifier'"
        ).fetchall()
    finally:
        conn.close()

    # Same floor, for the same reason: no modifier rows means nothing was checked.
    assert modifiers, "no active modifier rows, so this check examined nothing."

    offenders = sorted(slug for slug, family in modifiers if family.strip())
    assert not offenders, (
        f"{len(offenders)} modifier row(s) carry a trick family: {offenders}. A "
        "modifier is not a member of a family; it is a treatment applied to one, and "
        "a family value on it puts a non-trick into a public family listing."
    )
