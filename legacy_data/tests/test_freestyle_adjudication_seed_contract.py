"""
What the Emerging Vocabulary seed may and may not do to an existing database.

The ruling table was seeded from a committed ledger and then became writable
authority: curators author a movement onto a ruling, and publishing its trick
resolves it. The ledger is now only a seed source, so the loader that reads it
tops up what is missing and verifies what is there. It never writes over a row
that exists, because everything it would write back is older than what the
database holds.

Three groups of fields, and the difference between them is the whole contract.
The historical facts a ruling does not change are verified. The five fields the
publication funnel rewrites are verified only while the row is untouched, which
its version records. Everything a curator can write is never compared at all.

These tests run the real loader against throwaway databases.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_adjudication_seed_contract.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
LOADERS = REPO_ROOT / "freestyle" / "loaders"
SEED = "28_load_ev_adjudications.py"
SPAWN_TIMEOUT = 180

DICTIONARY = [
    ("16_preflight_trick_ownership.py", []),
    ("17_load_trick_dictionary.py", ["--stage", "tricks"]),
    ("19_load_red_additions.py", []),
    ("17_load_trick_dictionary.py", ["--stage", "aliases"]),
    ("20_link_footbag_org_sources.py", []),
    ("21_load_footbag_org_pending_tricks.py", []),
    ("21a_load_alias_additions.py", []),
    ("21b_apply_alias_overrides.py", []),
    ("21c_retire_stale_tricks.py", []),
]

NOTATION = "CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]"


def run(loader: str, db: Path, args=None):
    return subprocess.run(
        [sys.executable, str(LOADERS / loader), "--db", str(db), *(args or [])],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    db = tmp_path_factory.mktemp("ev-seed") / "footbag.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()
    for loader, args in DICTIONARY:
        r = run(loader, db, args)
        assert r.returncode == 0, f"{loader} failed:\n{r.stderr}"
    r = run(SEED, db)
    assert r.returncode == 0, r.stderr
    return db


@pytest.fixture
def db(seeded, tmp_path):
    copy = tmp_path / "footbag.db"
    copy.write_bytes(Path(seeded).read_bytes())
    return copy


def rows(db: Path) -> dict:
    conn = connect(db)
    try:
        cur = conn.execute("SELECT * FROM freestyle_ev_adjudications")
        cols = [d[0] for d in cur.description]
        return {r[0]: dict(zip(cols, r)) for r in cur}
    finally:
        conn.close()


def pristine_candidate(db: Path) -> str:
    conn = connect(db)
    try:
        return conn.execute(
            "SELECT candidate_id FROM freestyle_ev_adjudications"
            " WHERE version = 1 AND published_trick_slug IS NULL"
            " ORDER BY sequence_no LIMIT 1").fetchone()[0]
    finally:
        conn.close()


def author_on(db: Path, candidate_id: str) -> None:
    """Everything the authoring save writes, as it writes it."""
    conn = connect(db)
    with conn:
        conn.execute(
            "UPDATE freestyle_ev_adjudications"
            "   SET authored_notation = ?, notation_evidence_basis = 'footage',"
            "       notation_derivation_method = 'reconstruction',"
            "       notation_provenance_note = 'read off a record video',"
            "       notation_authored_at = '2026-08-30T00:00:00.000Z',"
            "       notation_authored_by = 'admin-1', updated_by = 'admin-1',"
            "       version = version + 1"
            " WHERE candidate_id = ?", (NOTATION, candidate_id))
    conn.close()


class TestAFreshDatabaseIsUnchanged:
    def test_it_seeds_every_ruling_in_the_ledger(self, seeded):
        assert len(rows(seeded)) == 871

    def test_it_seeds_the_historical_links(self, seeded):
        linked = {r["candidate_id"] for r in rows(seeded).values()
                  if r["published_trick_slug"] is not None}
        assert len(linked) == 9

    def test_every_seeded_row_starts_at_version_one(self, seeded):
        assert {r["version"] for r in rows(seeded).values()} == {1}


class TestAnExistingRowIsNeverWrittenOver:
    def test_authored_notation_and_its_provenance_survive(self, db):
        cid = pristine_candidate(db)
        author_on(db, cid)
        before = rows(db)[cid]
        assert run(SEED, db).returncode == 0
        after = rows(db)[cid]
        for field in ("authored_notation", "notation_evidence_basis",
                      "notation_derivation_method", "notation_provenance_note",
                      "notation_authored_at", "notation_authored_by"):
            assert after[field] == before[field], field

    def test_the_version_is_neither_reset_nor_bumped(self, db):
        """The loader is not a curator and must not look like one."""
        cid = pristine_candidate(db)
        author_on(db, cid)
        before = rows(db)[cid]["version"]
        assert run(SEED, db).returncode == 0
        assert rows(db)[cid]["version"] == before

    def test_a_funnel_publication_link_survives(self, db):
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute(
                "UPDATE freestyle_ev_adjudications"
                "   SET published_trick_slug = 'butterfly', ev_state = 'canonical',"
                "       final_disposition = 'A', match_type = 'promoted-canonical',"
                "       matched_existing_object = 'butterfly', version = version + 1"
                " WHERE candidate_id = ?", (cid,))
        conn.close()
        assert run(SEED, db).returncode == 0
        after = rows(db)[cid]
        assert after["published_trick_slug"] == "butterfly"
        assert after["ev_state"] == "canonical"
        assert after["final_disposition"] == "A"

    def test_a_resolved_ruling_is_not_reverted_to_the_ledger(self, db):
        """Past version 1 the five funnel fields are not compared at all."""
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute(
                "UPDATE freestyle_ev_adjudications"
                "   SET ev_state = 'canonical', hold_kind = 'canonical',"
                "       match_type = 'promoted-canonical', final_disposition = 'A',"
                "       matched_existing_object = 'butterfly', version = 4"
                " WHERE candidate_id = ?", (cid,))
        conn.close()
        assert run(SEED, db).returncode == 0
        after = rows(db)[cid]
        assert (after["ev_state"], after["final_disposition"], after["version"]) \
            == ("canonical", "A", 4)

    def test_running_it_twice_changes_nothing(self, db):
        author_on(db, pristine_candidate(db))
        assert run(SEED, db).returncode == 0
        before = rows(db)
        assert run(SEED, db).returncode == 0
        assert rows(db) == before


class TestMissingRowsAreToppedUp:
    def test_a_deleted_ruling_returns_at_its_own_ordinal(self, db):
        conn = connect(db)
        victim = conn.execute(
            "SELECT candidate_id, sequence_no FROM freestyle_ev_adjudications"
            " WHERE version = 1 ORDER BY sequence_no LIMIT 1 OFFSET 40").fetchone()
        with conn:
            conn.execute("DELETE FROM freestyle_ev_adjudications WHERE candidate_id = ?",
                         (victim[0],))
        conn.close()
        assert run(SEED, db).returncode == 0
        after = rows(db)[victim[0]]
        # Its ledger position, not one past the end: the number is the position.
        assert after["sequence_no"] == victim[1]
        assert after["version"] == 1

    def test_a_top_up_leaves_every_other_row_alone(self, db):
        cid = pristine_candidate(db)
        author_on(db, cid)
        conn = connect(db)
        victim = conn.execute(
            "SELECT candidate_id FROM freestyle_ev_adjudications"
            " WHERE version = 1 ORDER BY sequence_no DESC LIMIT 1").fetchone()[0]
        with conn:
            conn.execute("DELETE FROM freestyle_ev_adjudications WHERE candidate_id = ?",
                         (victim,))
        conn.close()
        before = rows(db)
        assert run(SEED, db).returncode == 0
        after = rows(db)
        assert set(after) - set(before) == {victim}
        for cid_ in before:
            assert after[cid_] == before[cid_], cid_

    def test_a_missing_historical_link_returns_with_its_row(self, db):
        conn = connect(db)
        victim = conn.execute(
            "SELECT candidate_id, published_trick_slug FROM freestyle_ev_adjudications"
            " WHERE published_trick_slug IS NOT NULL AND version = 1 LIMIT 1").fetchone()
        with conn:
            conn.execute("DELETE FROM freestyle_ev_adjudications WHERE candidate_id = ?",
                         (victim[0],))
        conn.close()
        assert run(SEED, db).returncode == 0
        assert rows(db)[victim[0]]["published_trick_slug"] == victim[1]


class TestItRefusesRatherThanRepairing:
    @pytest.mark.parametrize("field,value", [
        ("owner", "somebody-else"),
        ("submitted_name", "a different name"),
        ("evidence_state", "none"),
        ("blocker_id", "Q99"),
        ("note", "rewritten"),
        ("source", "elsewhere"),
        ("proposed_formula", "made up"),
    ])
    def test_a_changed_historical_fact_stops_the_seed(self, db, field, value):
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute(
                f"UPDATE freestyle_ev_adjudications SET {field} = ? WHERE candidate_id = ?",
                (value, cid))
        conn.close()
        r = run(SEED, db)
        assert r.returncode != 0
        assert cid in r.stderr and field in r.stderr and value in r.stderr
        assert "Nothing was written" in r.stderr

    def test_a_changed_sequence_number_stops_the_seed(self, db):
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET sequence_no = 99999"
                         " WHERE candidate_id = ?", (cid,))
        conn.close()
        r = run(SEED, db)
        assert r.returncode != 0
        assert "sequence_no" in r.stderr and "99999" in r.stderr

    def test_a_historical_link_pointing_elsewhere_stops_the_seed(self, db):
        conn = connect(db)
        cid = conn.execute(
            "SELECT candidate_id FROM freestyle_ev_adjudications"
            " WHERE published_trick_slug IS NOT NULL LIMIT 1").fetchone()[0]
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET published_trick_slug ="
                         " 'butterfly' WHERE candidate_id = ?", (cid,))
        conn.close()
        r = run(SEED, db)
        assert r.returncode != 0
        assert "published_trick_slug" in r.stderr

    def test_a_ruling_field_is_only_compared_while_the_row_is_untouched(self, db):
        """Version 1 compares; past it the funnel owns the field."""
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET ev_state = 'canonical'"
                         " WHERE candidate_id = ?", (cid,))
        conn.close()
        assert run(SEED, db).returncode != 0

        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET version = 2"
                         " WHERE candidate_id = ?", (cid,))
        conn.close()
        assert run(SEED, db).returncode == 0

    def test_it_writes_nothing_at_all_when_it_refuses(self, db):
        cid = pristine_candidate(db)
        conn = connect(db)
        other = conn.execute(
            "SELECT candidate_id FROM freestyle_ev_adjudications"
            " WHERE version = 1 ORDER BY sequence_no DESC LIMIT 1").fetchone()[0]
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET owner = 'wrong'"
                         " WHERE candidate_id = ?", (cid,))
            conn.execute("DELETE FROM freestyle_ev_adjudications WHERE candidate_id = ?",
                         (other,))
        conn.close()
        before = rows(db)
        assert run(SEED, db).returncode != 0
        # The missing row is not topped up either: a refusal is total.
        assert rows(db) == before


class TestTheLinkInvariant:
    def test_an_extra_funnel_link_is_not_treated_as_corruption(self, db):
        """The old check compared totals and called this a broken seed."""
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET published_trick_slug ="
                         " 'butterfly', version = 2 WHERE candidate_id = ?", (cid,))
        conn.close()
        r = run(SEED, db)
        assert r.returncode == 0, r.stderr
        assert rows(db)[cid]["published_trick_slug"] == "butterfly"

    def test_every_historical_link_still_points_where_the_ledger_says(self, seeded):
        linked = {r["candidate_id"]: r["published_trick_slug"]
                  for r in rows(seeded).values() if r["published_trick_slug"]}
        assert sorted(linked.values()) == sorted([
            "fairy_spyro_mirage", "inspinning_same_side_illusion",
            "inspinning_same_side_mirage", "miraging_pincher", "pandora",
            "spyro_illusion", "spyro_mirage", "spyro_whirl",
            "stepping_p_s_whirling_x_body_rake",
        ])

    def test_no_link_is_removed_to_restore_the_historical_total(self, db):
        cid = pristine_candidate(db)
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_ev_adjudications SET published_trick_slug ="
                         " 'butterfly', version = 2 WHERE candidate_id = ?", (cid,))
        conn.close()
        assert run(SEED, db).returncode == 0
        after = [r for r in rows(db).values() if r["published_trick_slug"]]
        assert len(after) == 10
