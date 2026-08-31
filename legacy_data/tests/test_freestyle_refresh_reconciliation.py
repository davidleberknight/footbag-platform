"""
What an ownership-aware refresh does, and what it refuses.

A refresh is preflight, then upsert, then retire. The order is the safety: the
complete map of what the committed inputs want is built before anything is
written, so no producer can retire a row while a later one still has a claim to
make on it, and nothing is removed until every claim is in.

These tests build a dictionary with the real loaders, then put the awkward cases
in front of it: a slug a curator holds, a slug nobody has classified, a row whose
owning input has handed it to another producer, and a row that has genuinely
fallen out of every input while something still references it. Nothing here
touches a real database.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_refresh_reconciliation.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_ownership import (  # noqa: E402
    BASE_DICTIONARY,
    CURATOR_PUBLICATION,
    EXPERT_ADDITIONS,
)

SCHEMA = REPO_ROOT / "database" / "schema.sql"
LOADERS = REPO_ROOT / "freestyle" / "loaders"
SPAWN_TIMEOUT = 180

PREFLIGHT = "16_preflight_trick_ownership.py"
RETIRE = "21c_retire_stale_tricks.py"

# The refresh, in the order the rebuild runs it. The dictionary loader appears
# twice: its tricks first, its aliases after the expert overlay has established
# the rows and names they resolve against, and before the intake, which reads the
# alias table to decide what to create.
REFRESH = [
    (PREFLIGHT, []),
    ("17_load_trick_dictionary.py", ["--stage", "tricks"]),
    ("19_load_red_additions.py", []),
    ("17_load_trick_dictionary.py", ["--stage", "aliases"]),
    ("20_link_footbag_org_sources.py", []),
    ("21_load_footbag_org_pending_tricks.py", []),
    ("21a_load_alias_additions.py", []),
    ("21b_apply_alias_overrides.py", []),
    (RETIRE, []),
]


def run(loader: str, db: Path, args: list[str] | None = None):
    return subprocess.run(
        [sys.executable, str(LOADERS / loader), "--db", str(db), *(args or [])],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )


def refresh(db: Path):
    """Run the whole committed sequence, returning the first stage that failed."""
    for loader, args in REFRESH:
        result = run(loader, db, args)
        if result.returncode != 0:
            return loader, result
    return None, None


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """A dictionary built once by the real loaders, copied per test.

    The rulings are seeded too. They are what makes the awkward cases real: a
    ruling naming a trick is the reference a retirement has to fail closed on,
    and it is the reference an ownership transfer has to carry across.
    """
    db = tmp_path_factory.mktemp("freestyle-reconcile") / "footbag.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()
    failed, result = refresh(db)
    assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
    seeded = run("28_load_ev_adjudications.py", db)
    assert seeded.returncode == 0, seeded.stderr
    return db


@pytest.fixture
def db(built, tmp_path):
    copy = tmp_path / "footbag.db"
    copy.write_bytes(Path(built).read_bytes())
    return copy


def owner_of(db: Path, slug: str):
    conn = connect(db)
    try:
        row = conn.execute(
            "SELECT trick_origin_producer FROM freestyle_tricks WHERE slug = ?", (slug,)
        ).fetchone()
        return row[0] if row else KeyError
    finally:
        conn.close()


def add_curator_trick(db: Path, slug: str) -> None:
    conn = connect(db)
    with conn:
        conn.execute(
            "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
            " is_active, is_core, sort_order, loaded_at, trick_origin_producer)"
            " VALUES (?, ?, '4', 'curated', 1, 0, 99999, '2026-08-29T00:00:00.000Z', ?)",
            (slug, slug.replace("_", " "), CURATOR_PUBLICATION),
        )
    conn.close()


class TestPreflightRefusesADatabaseWithoutTheOwnershipColumn:
    """A database older than the ownership model is refused, not crashed into.

    Every stage of the refresh reads trick_origin_producer, so one that predates
    the column cannot be refreshed at all. That is a precondition the preflight
    knows about, and an operator who hits it needs to be told which column is
    missing and that a rebuild is what supplies it. Letting SQLite's own message
    surface instead names the column but nothing else: not the stage that wanted
    it, not that no migration path exists before go-live, and not what to run.
    """

    def _database_predating_the_column(self, tmp_path: Path) -> Path:
        db = tmp_path / "footbag.db"
        conn = sqlite3.connect(db)
        conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        conn.execute(
            "ALTER TABLE freestyle_tricks DROP COLUMN trick_origin_producer")
        conn.commit()
        conn.close()
        return db

    def test_it_refuses_rather_than_raising(self, tmp_path):
        result = run(PREFLIGHT, self._database_predating_the_column(tmp_path))
        assert result.returncode == 1, result.stderr
        assert "Traceback" not in result.stderr
        assert "OperationalError" not in result.stderr

    def test_it_names_the_missing_column_and_the_database(self, tmp_path):
        # The database too, not only the column: this loader takes a --db flag, so
        # which database is too old is half the answer. SQLite's own message
        # carries the column name and nothing else, which is why naming the column
        # alone would be satisfied by the failure this guard exists to replace.
        db = self._database_predating_the_column(tmp_path)
        result = run(PREFLIGHT, db)
        assert "trick_origin_producer" in result.stderr
        assert str(db) in result.stderr

    def test_it_claims_only_that_ownership_work_did_not_start(self, tmp_path):
        # This stage runs after the records loaders, so a refusal here cannot say
        # the refresh changed nothing: derived record rows may already have been
        # rewritten. What it can say is that ownership reconciliation never began,
        # which is the part this stage speaks for.
        result = run(PREFLIGHT, self._database_predating_the_column(tmp_path))
        assert "Ownership reconciliation was not started" in result.stderr
        assert "Nothing was changed" not in result.stderr

    def test_it_names_what_to_run(self, tmp_path):
        # A rebuild, because before go-live that is how a schema change reaches a
        # database. Both rebuild paths are offered: the committed-data one, and
        # the one that also reloads members, because the second is what a
        # database carrying the member load needs and the first would leave those
        # tables empty.
        result = run(PREFLIGHT, self._database_predating_the_column(tmp_path))
        assert "run_dev.sh --from-csv" in result.stderr
        assert "run_dev.sh --all-data" in result.stderr

    def test_it_does_not_ask_for_a_separate_refresh_after_the_rebuild(self, tmp_path):
        # Every rebuild path runs the freestyle refresh as one of its own stages,
        # so naming the refresh as a second command sends the operator to run a
        # step that has already happened.
        result = run(PREFLIGHT, self._database_predating_the_column(tmp_path))
        assert "run_freestyle.sh" not in result.stderr


class TestPreflightRefusesWhatItMayNotClaim:
    def test_a_curator_slug_aborts_the_refresh(self, db):
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = ?"
                         " WHERE slug = 'butterfly'", (CURATOR_PUBLICATION,))
        conn.close()

        result = run(PREFLIGHT, db)
        assert result.returncode != 0
        assert "butterfly" in result.stderr
        assert "curator-publication" in result.stderr
        assert "base-dictionary" in result.stderr
        # Refused before anything moved.
        assert owner_of(db, "butterfly") == CURATOR_PUBLICATION

    def test_an_unclassified_slug_aborts_the_refresh(self, db):
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = NULL"
                         " WHERE slug = 'butterfly'")
        conn.close()

        result = run(PREFLIGHT, db)
        assert result.returncode != 0
        assert "butterfly" in result.stderr
        assert "unclassified" in result.stderr
        assert owner_of(db, "butterfly") is None

    def test_it_aborts_whole_rather_than_part_way(self, db):
        """One bad slug stops everything; a half-applied refresh is worse."""
        conn = connect(db)
        before = dict(conn.execute("SELECT slug, trick_origin_producer FROM freestyle_tricks"))
        with conn:
            conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = ?"
                         " WHERE slug = 'butterfly'", (CURATOR_PUBLICATION,))
        conn.close()

        run(PREFLIGHT, db)
        conn = connect(db)
        after = dict(conn.execute("SELECT slug, trick_origin_producer FROM freestyle_tricks"))
        conn.close()
        changed = {s for s in before if before[s] != after.get(s)}
        assert changed == {"butterfly"}, "only the row the test itself changed"


class TestCommittedOwnershipTransfer:
    def test_a_producer_move_is_applied_in_place(self, db):
        """The row and everything pointing at it survive the handover."""
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = ?"
                         " WHERE slug = 'butterfly'", (EXPERT_ADDITIONS,))
            # A ruling naming the row, so the transfer is watched by a foreign key.
            conn.execute(
                "UPDATE freestyle_ev_adjudications SET published_trick_slug = 'butterfly'"
                " WHERE candidate_id = (SELECT candidate_id FROM freestyle_ev_adjudications"
                "                        WHERE published_trick_slug IS NULL LIMIT 1)"
            )
        identity_before = conn.execute(
            "SELECT rowid, canonical_name FROM freestyle_tricks WHERE slug = 'butterfly'"
        ).fetchone()
        conn.close()

        result = run(PREFLIGHT, db)
        assert result.returncode == 0, result.stderr
        assert "butterfly: expert-additions -> base-dictionary" in result.stdout

        conn = connect(db)
        identity_after = conn.execute(
            "SELECT rowid, canonical_name FROM freestyle_tricks WHERE slug = 'butterfly'"
        ).fetchone()
        links = conn.execute(
            "SELECT COUNT(*) FROM freestyle_ev_adjudications WHERE published_trick_slug = 'butterfly'"
        ).fetchone()[0]
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        conn.close()

        assert owner_of(db, "butterfly") == BASE_DICTIONARY
        # Same row, not a replacement: a delete and re-insert would change the
        # rowid and would have had to break the reference to get there.
        assert identity_after == identity_before
        assert links == 1
        assert violations == []

    def test_enrichment_is_not_a_producer_move(self, db):
        """The 35 rows the overlay rewrites are not handed over by rewriting."""
        result = run(PREFLIGHT, db)
        assert result.returncode == 0, result.stderr
        assert "0 ownership transfers applied" in result.stdout
        assert owner_of(db, "butterfly") == BASE_DICTIONARY


class TestRetirement:
    def test_a_curator_trick_is_never_retired(self, db):
        add_curator_trick(db, "a_curator_trick")
        result = run(RETIRE, db)
        assert result.returncode == 0, result.stderr
        assert owner_of(db, "a_curator_trick") == CURATOR_PUBLICATION

    def test_an_unclassified_row_is_never_retired(self, db):
        conn = connect(db)
        with conn:
            conn.execute(
                "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
                " is_active, is_core, sort_order, loaded_at)"
                " VALUES ('an_unclassified_trick', 'an unclassified trick', '3', 'curated',"
                " 1, 0, 99998, '2026-08-29T00:00:00.000Z')"
            )
        conn.close()
        result = run(RETIRE, db)
        assert result.returncode == 0, result.stderr
        assert owner_of(db, "an_unclassified_trick") is None

    def test_a_row_another_producer_still_wants_is_never_retired(self, db):
        """A slug missing from one input is not stale while another carries it.

        The overlay's file carries this slug too. Retirement reads one complete
        map rather than each producer's own input, so a row the base dictionary
        stopped carrying is still wanted and stays.
        """
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_tricks SET trick_origin_producer = ?"
                         " WHERE slug = 'butterfly'", (EXPERT_ADDITIONS,))
        conn.close()
        result = run(RETIRE, db)
        assert result.returncode == 0, result.stderr
        assert owner_of(db, "butterfly") == EXPERT_ADDITIONS

    def test_a_genuinely_stale_row_is_retired(self, db):
        """A committed row no input asks for any more does go."""
        conn = connect(db)
        with conn:
            conn.execute(
                "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
                " is_active, is_core, sort_order, loaded_at, trick_origin_producer)"
                " VALUES ('a_withdrawn_trick', 'a withdrawn trick', '3', 'curated',"
                " 1, 0, 99997, '2026-08-29T00:00:00.000Z', ?)",
                (BASE_DICTIONARY,),
            )
        conn.close()
        result = run(RETIRE, db)
        assert result.returncode == 0, result.stderr
        assert owner_of(db, "a_withdrawn_trick") is KeyError

    def test_a_stale_row_that_is_still_referenced_fails_closed(self, db):
        """Nothing is retired, and the diagnostic names the row and the reference."""
        conn = connect(db)
        with conn:
            conn.execute(
                "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
                " is_active, is_core, sort_order, loaded_at, trick_origin_producer)"
                " VALUES ('a_referenced_stale_trick', 'a referenced stale trick', '3',"
                " 'curated', 1, 0, 99996, '2026-08-29T00:00:00.000Z', ?)",
                (BASE_DICTIONARY,),
            )
            conn.execute(
                "UPDATE freestyle_ev_adjudications"
                "   SET published_trick_slug = 'a_referenced_stale_trick'"
                " WHERE candidate_id = (SELECT candidate_id FROM freestyle_ev_adjudications"
                "                        WHERE published_trick_slug IS NULL LIMIT 1)"
            )
        conn.close()

        result = run(RETIRE, db)
        assert result.returncode != 0
        assert "a_referenced_stale_trick" in result.stderr
        assert "Emerging Vocabulary ruling" in result.stderr
        # Nothing removed, and the reference is intact: no cascade, no blanking.
        assert owner_of(db, "a_referenced_stale_trick") == BASE_DICTIONARY
        conn = connect(db)
        links = conn.execute(
            "SELECT COUNT(*) FROM freestyle_ev_adjudications"
            " WHERE published_trick_slug = 'a_referenced_stale_trick'"
        ).fetchone()[0]
        conn.close()
        assert links == 1


class TestTheRefreshAsAWhole:
    def test_it_completes_against_a_populated_database(self, db):
        failed, result = refresh(db)
        assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"

    def test_it_reaches_a_stable_state(self, db):
        def counts():
            conn = connect(db)
            try:
                return tuple(
                    conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                    for t in ("freestyle_tricks", "freestyle_trick_aliases",
                              "freestyle_trick_modifier_links", "freestyle_trick_source_links")
                )
            finally:
                conn.close()

        refresh(db)
        settled = counts()
        refresh(db)
        assert counts() == settled

    def test_a_curator_trick_survives_the_whole_refresh(self, db):
        add_curator_trick(db, "a_surviving_curator_trick")
        failed, result = refresh(db)
        assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
        assert owner_of(db, "a_surviving_curator_trick") == CURATOR_PUBLICATION
