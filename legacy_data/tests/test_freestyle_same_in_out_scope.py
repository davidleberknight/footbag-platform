"""
test_freestyle_same_in_out_scope.py
===================================

The canonical operational layer is direction-resolved. Around the World is inward
(SAME IN) and Orbit is outward (SAME OUT), so a scored dexterity in a canonical
trick's operational_notation must commit to IN or OUT; the direction-neutral
`SAME IN/OUT` fold is never a canonical operational value.

Allowlist and scope. The original expectation was "only Twisted/Dragon". Dragon was
audited and removed from the allowlist because Dragon's own direction is already
resolved, not stale: the dragon atom is `SET > SAME OUT [XBD] [DEL]` (OUT), and all
eight dragon-family canonicals (swirl_dragon, reverse_swirl_dragon, butterfly_dragon,
double_swirl_dragon, hopover_swirl_dragon, miraging_dragon, dragonfly_kick) commit to
an exact IN or OUT token; zero dragon rows or descendants carry `SAME IN/OUT`. Dragon
uses a different structural axis than this token describes: its scored dexterity is a
resolved swirl/cross-body, and the SAME IN/OUT the "Dragon" expectation referred to
actually belongs to the Twisted structure — a Dragon-based compound whose paradox-dex
(`DRAGON > SAME FRONT SWIRL [DEX] > SAME IN/OUT [PDX][DEX]`) is genuinely side-either.
Twisted renders in the compositional/canonical-set content, not in any
freestyle_tricks.operational_notation row. So the exact allowlist for THIS layer (the
DB operational_notation) is empty: zero active canonical rows may carry `SAME IN/OUT`.
Twisted (root structure only) is the sole legitimate SAME IN/OUT anywhere; no dragon-
or ATW-family descendant inherits the direction-neutral form.

Out of scope by design (provenance, deliberately preserved, not canonical claims):
the footbag.org move snapshot and the observational grammar/reconciliation CSVs,
the opaque Jobs `notation` field (source notation, preserved verbatim per the
dictionary doctrine), and the verbatim source tracked-names module. Those record
what the source wrote; the operational layer is where the ruling is enforced.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_same_in_out_scope.py -v
"""
import re
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"

SAME_IN_OUT_RE = re.compile(r"SAME\s+IN\s*/\s*OUT", re.IGNORECASE)

# Exact-slug allowlist for the DB operational layer. Empty on purpose: no canonical
# trick's operational_notation legitimately carries SAME IN/OUT (Twisted renders in
# the compositional-set content, not here).
OPERATIONAL_SAME_IN_OUT_ALLOWLIST: set[str] = set()


def test_no_active_canonical_operational_notation_is_direction_neutral():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            "SELECT slug, COALESCE(operational_notation, '') FROM freestyle_tricks "
            "WHERE is_active = 1"
        ).fetchall()
    finally:
        conn.close()
    offenders = sorted(
        slug for slug, op in rows
        if SAME_IN_OUT_RE.search(op) and slug not in OPERATIONAL_SAME_IN_OUT_ALLOWLIST
    )
    assert not offenders, (
        "Canonical operational_notation must resolve each dex direction to IN or OUT "
        "(Around the World is inward, Orbit is outward). These active tricks still store "
        f"a direction-neutral SAME IN/OUT: {offenders}. If a new one is a genuine Twisted/"
        "Dragon structure, add its exact slug to OPERATIONAL_SAME_IN_OUT_ALLOWLIST with a reason."
    )
