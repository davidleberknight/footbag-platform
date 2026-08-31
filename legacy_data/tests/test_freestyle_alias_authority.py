"""
What a refresh may do to an alias, and what it may not.

The alias table had no owner column, so each loader deleted by whatever scope was
nearest: three by the provenance source they happened to write, and one by alias
slug regardless of who owned the row. That was safe while committed files were
the only writer. It stopped being safe when the application gained an alias
editor, because a curator's edit sat on a row still carrying the source a loader
deletes by, and the next refresh took it away.

Provenance is not authority. Where an alias's evidence came from and who may
rewrite the row are different facts, and a curator may legitimately record an
alias on the strength of the expert review. These tests hold the two apart: a
curator-owned alias survives every loader whatever source it cites, a committed
producer still reconciles the rows it owns, and a committed input that wants a
slug a curator holds stops rather than taking it.

Built with the real loaders in the real order, against a database made from the
committed inputs in a temp directory. Nothing real is read or written.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_alias_authority.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
LOADERS = REPO_ROOT / "freestyle" / "loaders"
SPAWN_TIMEOUT = 180

sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_alias_ownership import (  # noqa: E402
    ALIAS_ADDITIONS,
    ALL_PRODUCERS,
    BASE_DICTIONARY,
    COMMITTED_PRODUCERS,
    CURATOR_APPLICATION,
    EXPERT_ADDITIONS,
    FOOTBAG_ORG_PENDING,
    may_rewrite,
)

#: The refresh, in the order the rebuild runs it.
REFRESH = [
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


def run(loader: str, args: list[str], db: Path):
    return subprocess.run(
        [sys.executable, str(LOADERS / loader), "--db", str(db), *args],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=SPAWN_TIMEOUT,
    )


def refresh(db: Path):
    """Run the whole committed sequence, returning the first stage that failed."""
    for loader, args in REFRESH:
        result = run(loader, args, db)
        if result.returncode != 0:
            return loader, result
    return None, None


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def alias_state(db: Path) -> dict:
    """Every alias by slug, with the facts a refresh could disturb."""
    conn = connect(db)
    try:
        return {r[0]: r[1:] for r in conn.execute(
            "SELECT alias_slug, alias_text, trick_slug, alias_type, alias_display,"
            "       COALESCE(source_id,''), COALESCE(provenance_note,''),"
            "       COALESCE(display_reason,''), alias_origin_producer"
            "  FROM freestyle_trick_aliases")}
    finally:
        conn.close()


def add_curator_alias(db: Path, slug: str, trick: str, **over) -> None:
    """An alias the application wrote: owned by the curator, in no committed file."""
    conn = connect(db)
    with conn:
        conn.execute(
            "INSERT INTO freestyle_trick_aliases (alias_slug, alias_text, trick_slug,"
            " alias_type, alias_display, source_id, provenance_note, display_reason,"
            " alias_origin_producer, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, '2026-08-31T00:00:00.000Z')",
            (slug, over.get("text", slug.replace("_", " ")), trick,
             over.get("alias_type", "common"), over.get("alias_display", 1),
             over.get("source_id"), over.get("provenance_note"), CURATOR_APPLICATION),
        )
    conn.close()


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """A dictionary built once by the real loaders, copied per test."""
    db = tmp_path_factory.mktemp("freestyle-alias-authority") / "footbag.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()
    failed, result = refresh(db)
    assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"
    return db


@pytest.fixture
def db(built, tmp_path):
    copy = tmp_path / "footbag.db"
    copy.write_bytes(Path(built).read_bytes())
    return copy


def any_trick(db: Path) -> str:
    conn = connect(db)
    try:
        return conn.execute(
            "SELECT slug FROM freestyle_tricks WHERE is_active = 1 LIMIT 1").fetchone()[0]
    finally:
        conn.close()


class TestEveryAliasHasAnAccountableOwner:
    def test_every_row_names_a_producer_the_column_accepts(self, db):
        state = alias_state(db)
        assert state, "the build produced no aliases"
        unknown = {s: v[-1] for s, v in state.items() if v[-1] not in ALL_PRODUCERS}
        assert unknown == {}

    def test_the_build_produces_only_committed_owners(self, db):
        # Curator ownership is written by the application and never inferred, so a
        # build from committed inputs alone must not produce one.
        owners = {v[-1] for v in alias_state(db).values()}
        assert owners <= COMMITTED_PRODUCERS

    def test_each_producer_owns_what_its_input_carries(self, db):
        counts: dict[str, int] = {}
        for v in alias_state(db).values():
            counts[v[-1]] = counts.get(v[-1], 0) + 1
        # Every producer that writes aliases owns some, and none is missing.
        assert set(counts) == {
            BASE_DICTIONARY, EXPERT_ADDITIONS, ALIAS_ADDITIONS, FOOTBAG_ORG_PENDING}


class TestProvenanceIsNotAuthority:
    def test_a_curator_alias_citing_an_expert_source_survives_the_refresh(self, db):
        # The case the old scoping got wrong: the row cites the source a loader
        # deletes by, and it is not that loader's row to delete.
        trick = any_trick(db)
        add_curator_alias(db, "curator_cites_expert", trick,
                          source_id="red-husted-2026-04-20",
                          provenance_note="recorded by a curator from the expert reply")
        failed, result = refresh(db)
        assert failed is None, f"{failed} failed:\n{result.stderr if result else ''}"

        row = alias_state(db).get("curator_cites_expert")
        assert row is not None, "the refresh deleted a curator's alias"
        assert row[4] == "red-husted-2026-04-20"
        assert row[5] == "recorded by a curator from the expert reply"
        assert row[7] == CURATOR_APPLICATION

    def test_a_curator_alias_with_no_source_survives_the_refresh(self, db):
        trick = any_trick(db)
        add_curator_alias(db, "curator_unsourced", trick)
        failed, _ = refresh(db)
        assert failed is None
        assert "curator_unsourced" in alias_state(db)

    def test_a_committed_alias_keeps_its_provenance_across_a_refresh(self, db):
        before = alias_state(db)
        failed, _ = refresh(db)
        assert failed is None
        assert alias_state(db) == before


class TestCommittedProducersReconcileOnlyTheirOwn:
    def test_the_refresh_reaches_a_fixed_point(self, db):
        once = alias_state(db)
        failed, _ = refresh(db)
        assert failed is None
        assert alias_state(db) == once

    def test_an_addition_slug_a_curator_holds_stops_the_step(self, db):
        # This is the loader that used to delete by slug alone. A curator holding
        # a slug the input wants is a conflict only a person can settle, because
        # only one of the two rows exists in a committed file.
        conn = connect(db)
        try:
            held = conn.execute(
                "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases"
                " WHERE alias_origin_producer = ? LIMIT 1", (ALIAS_ADDITIONS,)).fetchone()
        finally:
            conn.close()
        assert held, "no alias-additions row to take over"
        slug, trick = held

        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_trick_aliases SET alias_origin_producer = ?"
                         " WHERE alias_slug = ?", (CURATOR_APPLICATION, slug))
        conn.close()

        result = run("21a_load_alias_additions.py", [], db)
        assert result.returncode != 0, "the step replaced an alias a curator owns"
        assert slug in result.stderr
        assert "curator" in result.stderr.lower()
        # Refused before writing: the row is still the curator's.
        assert alias_state(db)[slug][7] == CURATOR_APPLICATION

    def test_an_override_targeting_a_curator_alias_stops_the_step(self, db):
        conn = connect(db)
        try:
            target = conn.execute(
                "SELECT alias_slug FROM freestyle_trick_aliases"
                " WHERE alias_origin_producer <> ? LIMIT 1", (CURATOR_APPLICATION,)
            ).fetchone()[0]
        finally:
            conn.close()
        # Point the override file's first target at a curator-owned row.
        conn = connect(db)
        with conn:
            conn.execute("UPDATE freestyle_trick_aliases SET alias_origin_producer = ?"
                         " WHERE alias_slug = ?", (CURATOR_APPLICATION, target))
        conn.close()

        result = run("21b_apply_alias_overrides.py", [], db)
        if target in _override_slugs():
            assert result.returncode != 0
            assert target in result.stderr
        else:
            # Not a slug this file touches, so it is simply left alone.
            assert alias_state(db)[target][7] == CURATOR_APPLICATION


def _override_rows() -> list:
    import csv
    path = REPO_ROOT / "freestyle" / "inputs" / "base_dictionary" / "alias_overrides.csv"
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _override_slugs() -> set:
    return {r["alias_slug"].strip() for r in _override_rows()}


def _diverging_overrides() -> list:
    """Override rows whose display state is set against what their class implies."""
    out = []
    for r in _override_rows():
        if r["action"].strip() != "retype":
            continue
        atype = r["alias_type"].strip()
        adisplay = int(r["alias_display"].strip())
        if (adisplay == 1) != (atype == "common"):
            out.append(r)
    return out


class TestTheReasonForAnExceptionReachesItsRow:
    """Where each divergent override's reason lands, and what it does not disturb.

    This used to read the checkout's own database, so it answered differently
    depending on when that database was last built and skipped entirely on one
    built before the reason and the provenance were separated. It reads a database
    made from the committed inputs instead, so the answer is a property of the
    repository rather than of somebody's machine.
    """

    def test_every_exception_carries_its_reason_in_the_reason_column(self, db):
        rows = _diverging_overrides()
        assert rows, "the override file declares no exceptions to check"
        state = alias_state(db)
        for r in rows:
            slug = r["alias_slug"].strip()
            assert slug in state, f"{slug} is not in the built dictionary"
            assert state[slug][6] == (r.get("note") or "").strip(), (
                f"{slug}: the reason in the table is not the one the file gives")

    def test_a_reason_never_lands_in_the_provenance_column(self, db):
        # The failure the separation exists to prevent: one column holding both,
        # where writing either meaning overwrote the other.
        reasons = {(r.get("note") or "").strip() for r in _diverging_overrides()}
        for slug, v in alias_state(db).items():
            assert v[5] not in reasons or not v[5], (
                f"{slug} carries an exception's reason as its provenance")

    def test_provenance_and_reason_never_share_a_row_by_accident(self, db):
        # Both may be set, and where they are they must be saying different
        # things; identical text on one row would mean the split is cosmetic.
        for slug, v in alias_state(db).items():
            if v[5] and v[6]:
                assert v[5] != v[6], f"{slug} repeats one note in both columns"


class TestTheOwnershipRuleItself:
    def test_a_committed_producer_rewrites_only_its_own_rows(self):
        assert may_rewrite(ALIAS_ADDITIONS, ALIAS_ADDITIONS)
        assert not may_rewrite(EXPERT_ADDITIONS, ALIAS_ADDITIONS)

    def test_nothing_a_rebuild_runs_may_rewrite_a_curator_row(self):
        for producer in COMMITTED_PRODUCERS:
            assert not may_rewrite(CURATOR_APPLICATION, producer)

    def test_the_curator_is_not_a_producer_a_rebuild_can_act_as(self):
        assert not may_rewrite(BASE_DICTIONARY, CURATOR_APPLICATION)

    def test_the_database_accepts_exactly_this_vocabulary(self):
        # The CHECK and this module carry the same five values; a test rather than
        # a shared definition, because SQL and Python cannot share one.
        text = SCHEMA.read_text(encoding="utf-8")
        block = text[text.index("alias_origin_producer TEXT NOT NULL"):]
        block = block[:block.index("))")]
        assert {p for p in ALL_PRODUCERS if f"'{p}'" in block} == ALL_PRODUCERS
