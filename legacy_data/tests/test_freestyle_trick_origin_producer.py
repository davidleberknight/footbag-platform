"""
Who owns each freestyle trick row, and what an owner may do with it.

Three committed producers create trick rows and each owns a different part of the
dictionary: the base dictionary a small minority, the expert overlay the great
majority, the footbag.org intake a handful. A producer that could delete rows it
did not create would wipe out the others, which is why ownership is recorded per
row rather than as a single committed-or-curator flag.

Two rules carry the safety. Rewriting a row never acquires it, so the rows the
base dictionary creates and the expert overlay rewrites stay the base
dictionary's. And an unowned row is nobody's to delete, so a classification that
fails leaves rows protected rather than exposed.

These tests run the real loaders against a throwaway database and read what they
stamped, then run the backfill against the same data with the stamps removed and
require it to reach the identical answer. Nothing here touches a real database.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_trick_origin_producer.py -v
"""
import csv
import re
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_ownership import (  # noqa: E402
    BASE_DICTIONARY,
    CURATOR_PUBLICATION,
    EXPERT_ADDITIONS,
    FOOTBAG_ORG_PENDING,
    may_retire,
    may_transfer_ownership,
)

SCHEMA = REPO_ROOT / "database" / "schema.sql"
LOADERS = REPO_ROOT / "freestyle" / "loaders"
BACKFILL = REPO_ROOT / "freestyle" / "scripts" / "backfill_trick_origin_producer.py"
INPUTS = REPO_ROOT / "freestyle" / "inputs"

# The dictionary sequence, in the order the rebuild runs it. Ownership is a
# property of that order: each producer inserts only what the ones before it
# left unclaimed.
DICTIONARY_LOADERS = [
    "17_load_trick_dictionary.py",
    "19_load_red_additions.py",
    "20_link_footbag_org_sources.py",
    "21_load_footbag_org_pending_tricks.py",
]

# A bound on every spawn, so a wedged loader fails the run instead of parking it.
SPAWN_TIMEOUT = 120


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


@pytest.fixture(scope="module")
def loaded_db(tmp_path_factory):
    """A dictionary built by the real loaders, in a throwaway database."""
    db = tmp_path_factory.mktemp("freestyle-origin") / "footbag.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()

    for loader in DICTIONARY_LOADERS:
        result = subprocess.run(
            [sys.executable, str(LOADERS / loader), "--db", str(db)],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
        )
        assert result.returncode == 0, f"{loader} failed:\n{result.stderr}"
    return db


def owners(db) -> dict:
    conn = sqlite3.connect(db)
    try:
        return dict(conn.execute("SELECT slug, trick_origin_producer FROM freestyle_tricks"))
    finally:
        conn.close()


def test_every_row_is_classified(loaded_db):
    """A clean load leaves no row unowned; an unowned row is unrefreshable."""
    o = owners(loaded_db)
    assert len(o) == 1032
    assert [s for s, p in o.items() if p is None] == []


def test_producer_counts_match_the_writer_inventory(loaded_db):
    """Each producer owns exactly the rows it inserts."""
    o = owners(loaded_db)
    counts = {}
    for producer in o.values():
        counts[producer] = counts.get(producer, 0) + 1
    assert counts == {
        BASE_DICTIONARY: 70,
        EXPERT_ADDITIONS: 955,
        FOOTBAG_ORG_PENDING: 7,
    }


def test_rewriting_a_row_does_not_acquire_it(loaded_db):
    """The overlay rewrites rows the base dictionary created and claims none.

    These slugs appear in both curated inputs. The base dictionary inserts them;
    the overlay updates their name, difficulty, family, description and status.
    Ownership follows the insert, so all of them stay the base dictionary's.
    """
    with (INPUTS / "base_dictionary" / "tricks.csv").open(encoding="utf-8") as fh:
        base = {_slug(r["trick_canon"]) for r in csv.DictReader(fh)}
    with (INPUTS / "curated" / "tricks" / "red_additions_2026_04_20.csv").open(
            encoding="utf-8") as fh:
        overlay = {_slug(r["canonical_name"]) for r in csv.DictReader(fh)}

    shared = base & overlay
    assert len(shared) == 35, "the overlap this rule exists for has changed size"

    o = owners(loaded_db)
    misowned = sorted(s for s in shared if o[s] != BASE_DICTIONARY)
    assert misowned == []


def test_the_intake_owns_only_what_it_creates(loaded_db):
    """The footbag.org intake inserts names nothing already curated resolves to."""
    o = owners(loaded_db)
    intake = sorted(s for s, p in o.items() if p == FOOTBAG_ORG_PENDING)
    assert intake == [
        "fairy_spyro_mirage",
        "miraging_pincher",
        "pandora",
        "spyro_illusion",
        "spyro_mirage",
        "spyro_whirl",
        "stepping_p_s_whirling_x_body_rake",
    ]


def test_backfill_reaches_the_same_answer_as_the_loaders(loaded_db, tmp_path):
    """An existing database classifies to exactly what a clean load would stamp."""
    copy = tmp_path / "backfill.db"
    copy.write_bytes(Path(loaded_db).read_bytes())
    conn = sqlite3.connect(copy)
    with conn:
        conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = NULL")
    conn.close()

    result = subprocess.run(
        [sys.executable, str(BACKFILL), "--db", str(copy), "--apply"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )
    assert result.returncode == 0, result.stderr
    assert owners(copy) == owners(loaded_db)


def test_backfill_is_idempotent(loaded_db, tmp_path):
    copy = tmp_path / "again.db"
    copy.write_bytes(Path(loaded_db).read_bytes())
    result = subprocess.run(
        [sys.executable, str(BACKFILL), "--db", str(copy), "--apply"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )
    assert result.returncode == 0, result.stderr
    assert "Stamped 0 rows" in result.stdout
    assert owners(copy) == owners(loaded_db)


def test_backfill_leaves_an_unaccountable_row_unowned(loaded_db, tmp_path):
    """A row no committed input accounts for keeps the protected state.

    This is what a curator-created trick looks like to the backfill, and it is
    why absence from a file is never read as committed origin: the two cannot be
    told apart from the rows alone, so neither is claimed.
    """
    copy = tmp_path / "native.db"
    copy.write_bytes(Path(loaded_db).read_bytes())
    conn = sqlite3.connect(copy)
    with conn:
        conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = NULL")
        conn.execute(
            "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
            " is_active, is_core, sort_order, loaded_at)"
            " VALUES ('a_trick_no_file_carries', 'a trick no file carries', '4',"
            " 'curated', 1, 0, 9999, '2026-08-29T00:00:00.000Z')"
        )
    conn.close()

    result = subprocess.run(
        [sys.executable, str(BACKFILL), "--db", str(copy), "--apply"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )
    assert result.returncode == 0, result.stderr
    assert owners(copy)["a_trick_no_file_carries"] is None
    assert "unclassified" in result.stdout


class TestWhatAnOwnerMayDo:
    """The helper every reconciliation step will ask before deleting anything."""

    def test_a_producer_may_retire_only_its_own_rows(self):
        assert may_retire(BASE_DICTIONARY, BASE_DICTIONARY) is True
        assert may_retire(EXPERT_ADDITIONS, BASE_DICTIONARY) is False
        assert may_retire(FOOTBAG_ORG_PENDING, EXPERT_ADDITIONS) is False

    def test_an_unowned_row_is_never_deletable(self):
        for producer in (BASE_DICTIONARY, EXPERT_ADDITIONS, FOOTBAG_ORG_PENDING,
                         CURATOR_PUBLICATION):
            assert may_retire(None, producer) is False

    def test_a_curator_row_is_never_deletable_by_a_refresh(self):
        for producer in (BASE_DICTIONARY, EXPERT_ADDITIONS, FOOTBAG_ORG_PENDING):
            assert may_retire(CURATOR_PUBLICATION, producer) is False

    def test_ownership_moves_between_committed_producers(self):
        assert may_transfer_ownership(BASE_DICTIONARY, EXPERT_ADDITIONS) is True
        assert may_transfer_ownership(None, EXPERT_ADDITIONS) is True

    def test_ownership_never_moves_away_from_a_curator(self):
        for producer in (BASE_DICTIONARY, EXPERT_ADDITIONS, FOOTBAG_ORG_PENDING):
            assert may_transfer_ownership(CURATOR_PUBLICATION, producer) is False

    def test_a_refresh_cannot_hand_a_row_to_a_curator(self):
        assert may_transfer_ownership(BASE_DICTIONARY, CURATOR_PUBLICATION) is False
