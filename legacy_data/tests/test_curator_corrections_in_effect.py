"""
test_curator_corrections_in_effect.py
=====================================

Every correction the curator ledger declares is actually in the database.

The ledger is a list of field-level rulings: this trick's family is that slug,
this one's notation is that string. The loader applies them near the end of its
run, so anything that writes the same column afterwards silently wins, and so
does a partial rebuild that runs an earlier loader without running this one
again. Either way the ledger and the database disagree, nothing says so, and the
database is what every surface reads.

That is not hypothetical. The dictionary loader derives a trick's family from the
raw base value in the base dictionary, which spells one family with an
abbreviation; the ledger corrects it to the canonical slug. Re-run the dictionary
stage on its own and the abbreviation comes back, three tricks split off from the
twenty-one others in their lineage, and the only thing that notices is a
downstream integrity check whose message sends the reader to the ledger, which
was right all along. Finding that cost an afternoon of reading a correct file.

The comparison itself is not written here. It lives in the shared freshness
module, because the builders that derive committed artifacts from this database
have to make the same judgement before they write, and a second copy of it would
be free to disagree with this one. What this file adds is the part a guard cannot
do from inside a build: the ledger-hygiene questions, and the floor that stops
the whole thing passing vacuously.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_curator_corrections_in_effect.py -v
"""
import sqlite3
import sys
from pathlib import Path

from built_db import DB_PATH, require_loaded

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_db_freshness import (  # noqa: E402
    REBUILD_COMMAND,
    corrections_not_in_effect,
    last_wins_corrections,
)

# Corrections whose trick no committed input creates, so they can never take
# effect. Listed rather than ignored: the point of the list is that adding to it
# takes a deliberate act, and the entry states what is known rather than
# inventing a ruling.
KNOWN_ABSENT: dict[str, str] = {}


def _present_slugs() -> set:
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        return {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
    finally:
        conn.close()


def test_the_ledger_parses_into_rulings_at_all():
    # Floor before the verdict: every assertion below concludes from finding no
    # disagreement, so a ledger that parsed into nothing would pass them all
    # having compared nothing. The figure is a floor, not a count to maintain.
    rulings = last_wins_corrections()
    assert len(rulings) > 1000, (
        f"the curator ledger parsed into only {len(rulings)} ruling(s), which is far "
        "below what it carries. The comparisons below would pass having examined "
        "almost nothing, so the parse is what to fix first."
    )


def test_every_correction_is_in_effect_in_the_database():
    require_loaded("freestyle_tricks")
    drift = corrections_not_in_effect(DB_PATH)
    assert not drift, (
        f"{len(drift)} curator ruling(s) are not in effect in the database:\n"
        + "\n".join(
            f"  {slug}.{field}: ledger says {expected!r}, database holds {actual!r}"
            for slug, field, expected, actual in drift[:20]
        )
        + ("\n  ..." if len(drift) > 20 else "")
        + "\n\nThe ledger is applied near the end of the dictionary rebuild, so the two "
        "ways to reach this are a later step writing the same column, and a partial "
        "rebuild that ran an earlier loader without running the corrections again. "
        f"Rebuild with {REBUILD_COMMAND} and re-read this before changing the ledger, "
        "which is usually the file that was already right."
    )


def test_every_correction_names_a_trick_that_exists():
    # The other way a ruling goes unapplied, and the one a freshness guard cannot
    # tell from a healthy database: the trick it names was never created, so
    # there was nothing to apply it to and no drift to see.
    require_loaded("freestyle_tricks")
    present = _present_slugs()
    ruled_on = {slug for (slug, _f) in last_wins_corrections()}

    absent = sorted(ruled_on - present)
    unexplained = [slug for slug in absent if slug not in KNOWN_ABSENT]
    assert not unexplained, (
        "the ledger rules on tricks no committed input creates, so those rulings can "
        "never take effect and nothing else reports them: " + ", ".join(unexplained)
        + ". Either the trick belongs in an input, or the rows belong retired; add a "
        "reason here only once that is decided."
    )


def test_no_known_absent_entry_that_explains_nothing():
    # An entry naming a trick the scan would never have flagged does nothing and
    # reads as load-bearing to the next editor: it looks like the reason that
    # trick is allowed to differ, when removing it changes no outcome.
    require_loaded("freestyle_tricks")
    present = _present_slugs()
    ruled_on = {slug for (slug, _f) in last_wins_corrections()}

    dead = sorted(
        slug for slug in KNOWN_ABSENT if slug not in ruled_on or slug in present
    )
    assert not dead, (
        "these entries explain nothing and should be deleted: " + ", ".join(dead)
    )


def test_every_known_absent_entry_carries_a_reason():
    for slug, reason in KNOWN_ABSENT.items():
        assert len(reason) > 40, f"{slug} needs a real reason, not a label"
