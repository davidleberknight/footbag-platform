"""
test_freestyle_butterfly_side_default.py
========================================

The butterfly base atom defaults to the far / opposite-side form. By curator
ruling the published butterfly is the opposite-side default (`OP OUT`); the
same-side execution is the explicitly named `butterfly_same_side` variant
(`SAME OUT`), and `far_butterfly` is an alias of the base (it has no standalone
row and so inherits the base `OP OUT`). The side-either `SAME/OP` fold that once
sat on the canonical row is superseded.

This guard pins the stored atom, not the family: a butterfly dexterity inside a
compound is genuinely symmetric and legitimately reads `SAME/OP` there, so the
check is scoped to the three atom-level slugs and never to the wider family. The
render-side authoritative source (CORE_TRICK_SPEC) is pinned separately in
tests/unit/coreTrickSpecNotation.test.ts.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_butterfly_side_default.py -v
"""
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"


def _conn():
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def _notation(conn, slug):
    row = conn.execute(
        "SELECT operational_notation FROM freestyle_tricks WHERE slug = ?", (slug,)
    ).fetchone()
    return row[0] if row else None


def test_butterfly_atom_defaults_to_far_opposite_side():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = _conn()
    try:
        butterfly = _notation(conn, "butterfly")
        same_side = _notation(conn, "butterfly_same_side")
    finally:
        conn.close()

    assert butterfly and "OP OUT [DEX]" in butterfly and "SAME/OP" not in butterfly, (
        f"butterfly should default to the far / opposite-side OP OUT, got: {butterfly!r}"
    )
    assert same_side and "SAME OUT [DEX]" in same_side, (
        f"butterfly_same_side should be the same-side SAME OUT variant, got: {same_side!r}"
    )


def test_far_butterfly_is_an_alias_of_the_base():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = _conn()
    try:
        row = conn.execute(
            "SELECT trick_slug FROM freestyle_trick_aliases WHERE alias_slug = 'far_butterfly'"
        ).fetchone()
    finally:
        conn.close()
    assert row and row[0] == "butterfly", (
        f"far_butterfly should alias the butterfly base, got: {row and row[0]!r}"
    )
