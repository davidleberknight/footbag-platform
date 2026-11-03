"""
test_freestyle_set_homes_and_alias_targets.py
=============================================

Reads the built database. Two whole-dictionary rules a rebuild can break without
any route test noticing, since route tests seed their own rows.

A set whose only page is its set page has no active trick row, while the compounds
it opens stay active and keep their link to it.

An alias is a way to reach a trick, so it points at an active one. The aliases that
sit on an inactive trick are a short held list, and a new one fails here rather than
leaving a name that search can never resolve.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_set_homes_and_alias_targets.py -v
"""
import sqlite3

from built_db import DB_PATH, require_loaded

SETS_WITH_ONLY_A_SET_PAGE = ("blazing", "pogo", "shooting")

# Held until a curator rules on each: their targets stay inactive.
HELD_ALIASES_ON_INACTIVE_TRICKS = {"stepping_op_squeeze", "spyro_pickup"}


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def test_set_with_only_a_set_page_has_no_active_trick_row_but_keeps_its_compounds():
    require_loaded("freestyle_tricks")
    conn = _connect()
    try:
        for slug in SETS_WITH_ONLY_A_SET_PAGE:
            row = conn.execute(
                "SELECT is_active FROM freestyle_tricks WHERE slug = ?", (slug,)
            ).fetchone()
            assert row == (0,), f"{slug} should keep an inactive row, found {row}"
            active_compounds = conn.execute(
                "SELECT COUNT(*) FROM freestyle_trick_modifier_links l "
                "JOIN freestyle_tricks t ON t.slug = l.trick_slug "
                "WHERE l.modifier_slug = ? AND t.is_active = 1",
                (slug,),
            ).fetchone()[0]
            assert active_compounds > 0, f"{slug} lost the links on its active compounds"
    finally:
        conn.close()


def test_only_the_held_aliases_point_at_an_inactive_trick():
    require_loaded("freestyle_trick_aliases")
    conn = _connect()
    try:
        found = {
            r[0]
            for r in conn.execute(
                "SELECT a.alias_slug FROM freestyle_trick_aliases a "
                "JOIN freestyle_tricks t ON t.slug = a.trick_slug "
                "WHERE t.is_active = 0"
            )
        }
    finally:
        conn.close()
    unexpected = found - HELD_ALIASES_ON_INACTIVE_TRICKS
    assert not unexpected, f"aliases that can never resolve: {sorted(unexpected)}"
