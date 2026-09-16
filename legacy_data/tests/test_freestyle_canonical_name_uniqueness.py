"""
test_freestyle_canonical_name_uniqueness.py
===========================================

One active canonical trick per name.

Two active tricks whose canonical names fold to the same key are the same trick
offered twice: a reader browsing the dictionary meets two entries that read
identically, and any lookup keyed by the folded name resolves to whichever row it
happens to reach first. The legitimate shape is one active row beside retired
predecessors, which is exactly what a naming normalization leaves behind when it
renames a trick and retires the old spelling. So this is scoped to active rows and
says nothing about retired ones: a retired twin is the evidence that a rename was
finished, not a defect.

The fold matches the one the trick-dictionary QC loader applies: lowercase, every
run of non-alphanumeric characters to a single underscore, no leading or trailing
underscore. Folding rather than comparing raw names is what catches the pair that
differs only by punctuation or case, which is the pair a reader cannot tell apart.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_canonical_name_uniqueness.py -v
"""
import re
import sqlite3
from collections import defaultdict

from built_db import DB_PATH, require_loaded


NON_ALNUM_RUN_RE = re.compile(r"[^a-z0-9]+")


def _fold(name: str) -> str:
    return NON_ALNUM_RUN_RE.sub("_", (name or "").lower()).strip("_")


def test_no_two_active_tricks_share_a_canonical_name():
    require_loaded("freestyle_tricks")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            "SELECT slug, COALESCE(canonical_name, '') FROM freestyle_tricks "
            "WHERE is_active = 1"
        ).fetchall()
    finally:
        conn.close()

    # Floor before the verdict: this test concludes from finding no collision, so an
    # empty or nameless cohort would pass it while comparing nothing. require_loaded
    # proves the table holds rows, not that any of them are active and named.
    named = [(slug, name) for slug, name in rows if name.strip()]
    assert named, (
        f"no active trick carries a canonical name ({len(rows)} active row(s) read), so "
        "the uniqueness check compared nothing."
    )

    by_fold = defaultdict(list)
    for slug, name in named:
        by_fold[_fold(name)].append(slug)
    collisions = {k: sorted(v) for k, v in by_fold.items() if len(v) > 1}

    assert not collisions, (
        f"{len(collisions)} canonical name(s) are carried by more than one ACTIVE trick: "
        + "; ".join(f"{k} -> {v}" for k, v in sorted(collisions.items()))
        + ". One active row per name: retire the superseded spelling rather than leaving "
        "both published, or give the second trick a name of its own."
    )
