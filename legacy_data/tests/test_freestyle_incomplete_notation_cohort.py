"""
test_freestyle_incomplete_notation_cohort.py
============================================

Bounds the intentional active-canonical incomplete-notation cohort.

The dictionary deliberately ships a small set of active canonical tricks whose
operational notation is not yet authored: they render an honest "JOB: notation
pending" line plus an INCOMPLETE badge rather than being hidden. That designed
state is fine. What must not happen is an ACCIDENTAL incomplete promotion: a new
active canonical trick landing with blank notation and no one noticing.

This guard therefore does NOT assert "zero incomplete notation" (that would fight
the design). It asserts that the set of active, non-modifier tricks with blank
notation stays within the known, adjudicated cohort below. When a trick's notation
is authored it simply drops out of the set (still a subset, still passes). When a
new incomplete trick is intended, add it here with its reason; an unlisted one
fails the test on purpose.

The check reads the built database. On a checkout with no built database (the
loaders have not run) it skips, so it only enforces where there is real content to
enforce against.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_incomplete_notation_cohort.py -v
"""
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"

# The adjudicated cohort of active canonical tricks allowed to carry blank
# operational notation, each with the reason it is pending.
KNOWN_INCOMPLETE_NOTATION = {
    # blazing compounds: the blazing operator's structure is pending an expert
    # definition, so their notation cannot be authored yet (the ADD is evidenced).
    "blazing_butterfly",
    "blazing_drifter",
    "blazing_illusion",
    "blazing_legover",
    "blazing_mirage",
    "blazing_paradox_whirl",
    "blazing_symposium_mirage",
    "blazing_torque",
    # terraging compounds and the bare terrage: the terraging-chain arithmetic is
    # pending an expert ruling, so the notation is held.
    "terrage",
    "terraging_illusion",
    "terraging_legover",
    "terraging_mirage",
    # the down-family embedded-base coordinate frame is pending, so this cell's
    # notation is held.
    "down_double_down",
    # doctrine-clear, but curator notation required: the doctrine blocker is
    # cleared (every component operator is settled), but the exact JOB notation
    # needs a curator's movement-authoritative reading before it becomes canonical.
    #   paradox_blur: a derived candidate exists, but it creates two [PDX]
    #     brackets, so it needs explicit curator confirmation of that exact
    #     notation before it becomes canonical.
    #   big_apple_sauce: a five-operator stack on torque; needs authoritative
    #     curator notation, not a mechanical derivation.
    "paradox_blur",
    "big_apple_sauce",
    # flailing's operator definition is pending an expert confirm/deny, so this
    # compound's notation is held: doctrine-blocked, not curator-ready.
    "bill_ted_s_excellent_adventure",
}


def _active_blank_notation_slugs(conn):
    rows = conn.execute(
        "SELECT slug FROM freestyle_tricks "
        "WHERE is_active = 1 "
        "AND COALESCE(category, '') <> 'modifier' "
        "AND (operational_notation IS NULL OR TRIM(operational_notation) = '')"
    ).fetchall()
    return {r[0] for r in rows}


def test_incomplete_notation_cohort_is_bounded():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        found = _active_blank_notation_slugs(conn)
    finally:
        conn.close()
    unexpected = found - KNOWN_INCOMPLETE_NOTATION
    assert not unexpected, (
        f"{len(unexpected)} active canonical trick(s) have blank operational notation "
        f"outside the known incomplete cohort: {sorted(unexpected)}. "
        f"Author their notation, or add them to KNOWN_INCOMPLETE_NOTATION with a reason."
    )
