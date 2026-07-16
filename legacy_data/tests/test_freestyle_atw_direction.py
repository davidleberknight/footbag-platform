"""
test_freestyle_atw_direction.py
===============================

Around the World is inward; Orbit is outward. By curator ruling the two are a
direction pair that never fold into a single direction-neutral row, and repeated
Around-the-World dexterities (Double / Triple Around the World, the heel variants)
are inward as well.

This guard proves the canonical data carries the distinction: no active
Around-the-World trick may store a direction-neutral `SAME IN/OUT` dex, the
Around-the-World base atom resolves inward, and the Orbit base atom resolves
outward. The render-side authoritative source (CORE_TRICK_SPEC) is pinned
separately in tests/unit/coreTrickSpecNotation.test.ts.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_atw_direction.py -v
"""
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"


def _conn():
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def test_no_around_the_world_trick_is_direction_neutral():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = _conn()
    try:
        rows = conn.execute(
            "SELECT slug, COALESCE(operational_notation, '') FROM freestyle_tricks "
            "WHERE is_active = 1 AND slug LIKE '%around_the_world%'"
        ).fetchall()
    finally:
        conn.close()
    offenders = sorted(s for s, op in rows if "SAME IN/OUT" in op)
    assert not offenders, (
        "Around the World is inward, not direction-neutral, but these active tricks "
        f"still store a SAME IN/OUT dex: {offenders}"
    )


def test_atw_atom_resolves_inward_and_orbit_atom_outward():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = _conn()
    try:
        atw = conn.execute(
            "SELECT operational_notation FROM freestyle_tricks WHERE slug = 'around_the_world'"
        ).fetchone()
        orbit = conn.execute(
            "SELECT operational_notation FROM freestyle_tricks WHERE slug = 'orbit'"
        ).fetchone()
    finally:
        conn.close()
    assert atw and "SAME IN [DEX]" in atw[0] and "IN/OUT" not in atw[0], (
        f"around_the_world should be inward (SAME IN), got: {atw and atw[0]!r}"
    )
    assert orbit and "SAME OUT [DEX]" in orbit[0], (
        f"orbit should be outward (SAME OUT), got: {orbit and orbit[0]!r}"
    )
