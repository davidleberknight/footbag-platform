"""
The routine refresh keeps the database; the reset flags say they destroy it.

Two operations that used to look interchangeable. One reconciles committed inputs
into the database that is already there and preserves everything a curator wrote.
The other deletes the database file and rebuilds it, discarding authored drafts,
publication state and curator-created tricks that no committed file can restore.
The refresh is what a maintainer should reach for; the reset is deliberate.

These tests run the refresh against throwaway databases and read the launcher's
help text. They never invoke a destructive path and never touch the checkout's own
database: the refresh script refuses any target but this checkout's development
database, so the refresh half is exercised through the loader sequence it runs,
which is the same sequence with the same guards.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_refresh_command_safety.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
LOADERS = REPO_ROOT / "freestyle" / "loaders"
REFRESH_SCRIPT = REPO_ROOT / "freestyle" / "run_freestyle.sh"
LAUNCHER = REPO_ROOT / "run_dev.sh"
SPAWN_TIMEOUT = 240

NOTATION = "CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]"

#: The refresh, read out of the script itself so the test cannot drift from it.
def refresh_stages() -> list[tuple[str, list[str]]]:
    stages: list[tuple[str, list[str]]] = []
    for line in REFRESH_SCRIPT.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith('"${PY}" "${L}/'):
            continue
        name = line.split('"${L}/', 1)[1].split('"', 1)[0]
        # Everything the script passes after the database, with its own
        # substitutions resolved, so a stage that needs an input file gets it.
        tail = line.split('--db "${DB}"', 1)[1] if '--db "${DB}"' in line else ""
        tail = tail.split("||", 1)[0]  # the script's own advisory fallback, not an argument
        args = [
            token.strip('"').replace('${I}', str(REPO_ROOT / "freestyle" / "inputs"))
            for token in tail.split()
        ]
        stages.append((name, args))
    return stages


def run(loader: str, db: Path, args=None):
    return subprocess.run(
        [sys.executable, str(LOADERS / loader), "--db", str(db), *(args or [])],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )


def refresh(db: Path):
    """Every stage the refresh script runs that takes a --db, in its order."""
    for name, args in refresh_stages():
        if not (LOADERS / name).exists():
            continue
        result = run(name, db, args)
        if result.returncode != 0:
            return name, result
    return None, None


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    db = tmp_path_factory.mktemp("refresh-safety") / "footbag.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()
    failed, result = refresh(db)
    assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
    return db


@pytest.fixture
def db_with_authority(built, tmp_path):
    """A database carrying exactly what a curator can create and no file holds."""
    db = tmp_path / "footbag.db"
    db.write_bytes(Path(built).read_bytes())
    conn = connect(db)
    with conn:
        cid = conn.execute(
            "SELECT candidate_id FROM freestyle_ev_adjudications"
            " WHERE version = 1 AND published_trick_slug IS NULL"
            " ORDER BY sequence_no LIMIT 1").fetchone()[0]
        conn.execute(
            "UPDATE freestyle_ev_adjudications"
            "   SET authored_notation = ?, notation_evidence_basis = 'footage',"
            "       notation_derivation_method = 'reconstruction',"
            "       notation_provenance_note = 'read off a record video',"
            "       notation_authored_at = '2026-08-30T00:00:00.000Z',"
            "       notation_authored_by = 'admin-1', version = version + 1"
            " WHERE candidate_id = ?", (NOTATION, cid))
        conn.execute(
            "INSERT INTO freestyle_tricks (slug, canonical_name, adds, review_status,"
            " is_active, is_core, sort_order, loaded_at, operational_notation,"
            " trick_origin_producer)"
            " VALUES ('a_published_trick', 'a published trick', '4', 'curated', 1, 0,"
            " 99999, '2026-08-30T00:00:00.000Z', ?, 'curator-publication')", (NOTATION,))
        conn.execute(
            "INSERT INTO freestyle_trick_aliases (alias_slug, alias_text, trick_slug,"
            " alias_type, alias_display, alias_origin_producer, created_at)"
            " VALUES ('a_published_nickname', 'a published nickname', 'a_published_trick',"
            " 'common', 1, 'curator-application', '2026-08-30T00:00:00.000Z')")
        conn.execute(
            "UPDATE freestyle_ev_adjudications"
            "   SET published_trick_slug = 'a_published_trick', ev_state = 'canonical',"
            "       final_disposition = 'A', version = version + 1"
            " WHERE candidate_id = ?", (cid,))
    conn.close()
    return db, cid


def authority(db: Path, cid: str) -> dict:
    conn = connect(db)
    try:
        ruling = conn.execute(
            "SELECT authored_notation, notation_evidence_basis, notation_provenance_note,"
            "       notation_authored_by, published_trick_slug, ev_state, version"
            "  FROM freestyle_ev_adjudications WHERE candidate_id = ?", (cid,)).fetchone()
        trick = conn.execute(
            "SELECT canonical_name, adds, operational_notation, trick_origin_producer"
            "  FROM freestyle_tricks WHERE slug = 'a_published_trick'").fetchone()
        alias = conn.execute(
            "SELECT alias_text, trick_slug FROM freestyle_trick_aliases"
            " WHERE alias_slug = 'a_published_nickname'").fetchone()
        return {"ruling": ruling, "trick": trick, "alias": alias}
    finally:
        conn.close()


class TestTheRoutineRefreshKeepsTheDatabase:
    def test_it_never_deletes_or_recreates_the_file(self, db_with_authority):
        db, _cid = db_with_authority
        before_inode = db.stat().st_ino
        failed, result = refresh(db)
        assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
        assert db.exists()
        # A recreated file is a different one, however similar its contents.
        assert db.stat().st_ino == before_inode

    def test_the_refresh_script_never_removes_its_target(self):
        """It reconciles the database it is given; deleting one is a reset.

        Scoped to the script rather than to every loader, because a loader may
        legitimately unlink a temp database it made for itself, and a blanket
        scan reads that as destruction.
        """
        body = REFRESH_SCRIPT.read_text(encoding="utf-8")
        for line in body.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            assert not stripped.startswith(("rm ", "rm -", "unlink ")), stripped
            assert "${DB}" not in stripped or "rm" not in stripped.split("${DB}")[0], \
                stripped

    def test_authored_adjudication_state_survives(self, db_with_authority):
        db, cid = db_with_authority
        before = authority(db, cid)
        assert refresh(db)[0] is None
        assert authority(db, cid)["ruling"] == before["ruling"]

    def test_the_curator_created_trick_survives(self, db_with_authority):
        db, cid = db_with_authority
        before = authority(db, cid)
        assert refresh(db)[0] is None
        assert authority(db, cid)["trick"] == before["trick"]

    def test_its_publication_link_and_attachments_survive(self, db_with_authority):
        db, cid = db_with_authority
        before = authority(db, cid)
        assert refresh(db)[0] is None
        after = authority(db, cid)
        assert after["ruling"][4] == "a_published_trick"
        assert after["alias"] == before["alias"]

    @staticmethod
    def _semantic(db: Path):
        """Everything except the stamps an upsert refreshes on every pass.

        A row rewritten with identical content still carries a new loaded_at, so
        comparing whole rows would report a change where none was made. What must
        not move is the content.
        """
        conn = connect(db)
        try:
            return (
                sorted(conn.execute(
                    "SELECT slug, canonical_name, adds, base_trick, trick_family,"
                    "       category, description, operational_notation, review_status,"
                    "       is_active, sort_order, trick_origin_producer"
                    "  FROM freestyle_tricks")),
                sorted(conn.execute(
                    "SELECT alias_slug, alias_text, trick_slug, alias_type, alias_display"
                    "  FROM freestyle_trick_aliases")),
                sorted(conn.execute(
                    "SELECT candidate_id, sequence_no, submitted_name, ev_state,"
                    "       final_disposition, published_trick_slug, authored_notation,"
                    "       notation_evidence_basis, notation_authored_by, version"
                    "  FROM freestyle_ev_adjudications")),
            )
        finally:
            conn.close()

    def test_it_succeeds_twice_and_the_second_run_changes_nothing(self, db_with_authority):
        db, _cid = db_with_authority
        assert refresh(db)[0] is None
        snapshot = self._semantic(db)
        assert refresh(db)[0] is None
        assert self._semantic(db) == snapshot


class TestTheLauncherSaysWhichCommandsDestroy:
    """Read-only over the help text. No destructive path is ever invoked."""

    @staticmethod
    def help_text() -> str:
        return LAUNCHER.read_text(encoding="utf-8")

    @pytest.mark.parametrize("flag", ["--reset", "--from-csv", "--soup-to-nuts",
                                      "--all-data"])
    def test_each_rebuild_flag_is_marked_destructive(self, flag):
        text = self.help_text()
        described = [line for line in text.splitlines()
                     if line.strip().startswith(flag)]
        assert described, f"{flag} has no help entry"
        assert any("DESTRUCTIVE" in line for line in described), \
            f"{flag} is not marked destructive where it is described"

    def test_the_help_says_what_a_reset_discards(self):
        text = self.help_text()
        for loss in ("authored adjudication drafts", "curator-created canonical tricks",
                     "publication and resolution state"):
            assert loss in text, f"the help does not say a reset discards {loss}"

    def test_no_rebuild_flag_is_called_a_refresh(self):
        """The word belongs to the command that preserves authority."""
        for line in self.help_text().splitlines():
            stripped = line.strip()
            if stripped.startswith(("--reset", "--from-csv", "--soup-to-nuts",
                                    "--all-data")):
                assert "refresh" not in stripped.lower(), stripped

    def test_reset_is_not_described_as_merely_fast(self):
        """It was called a "fast reset", which reads as cheap rather than lossy."""
        assert "Fast reset from committed seeds" not in self.help_text()

    def test_the_help_points_to_the_authority_preserving_refresh(self):
        """In the help a developer reads, not only in a comment at the top.

        The pointer appears twice in the file, so a check for the string alone
        cannot tell whether the help itself still carries it.
        """
        text = self.help_text()
        marker = "Refreshing freestyle without losing local work:"
        assert marker in text, "the help has no section naming the routine refresh"
        section = text.split(marker, 1)[1].split("DB rebuild modes", 1)[0]
        assert "freestyle/run_freestyle.sh" in section
        assert "reconciles in place" in section


class TestTheFreestyleDocsDescribeTheCurrentLifecycle:
    @pytest.mark.parametrize("doc", ["freestyle/CLAUDE.md", "freestyle/README.md"])
    def test_they_no_longer_claim_every_loader_replaces_its_table(self, doc):
        text = (REPO_ROOT / doc).read_text(encoding="utf-8")
        for stale in ("Loaders are DELETE+INSERT, idempotent",
                      "All mutations are `DELETE`+`INSERT`"):
            assert stale not in text, f"{doc} still claims: {stale}"

    @pytest.mark.parametrize("doc", ["freestyle/CLAUDE.md", "freestyle/README.md"])
    def test_they_name_the_routine_refresh_and_what_a_reset_costs(self, doc):
        text = (REPO_ROOT / doc).read_text(encoding="utf-8")
        assert "run_freestyle.sh" in text
        assert "routine refresh" in text
        for loss in ("curator-created canonical tricks", "authored"):
            assert loss in text, f"{doc} does not say a reset discards {loss}"
