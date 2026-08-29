"""The database holds the Emerging Vocabulary rulings without changing them or what they produce.

The rulings that decide what each observational freestyle name IS live in a
committed ledger a generator reads. They are moving into a writable database
table, because the committed file stops being writable when the rebuild pipeline
retires. This gate is the permanent proof that the move costs nothing, and it
proves two separate things that do not imply each other:

  Adjudication equivalence — the table holds every ruling the ledger holds, with
  the same values. This is a claim about 871 records.

  Projection equivalence — a generator run against the seeded table emits content
  byte-identical to the committed module. This is a claim about 909 rows composed
  from the corpus, most of which carry a ruling and some of which carry none.

The two counts are both correct and are not the same measurement, which is why
each is asserted on its own terms.

The gate builds its own database from the committed inputs, so it depends on no
prior local state and writes nothing outside its temporary directory.
"""
import csv
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
LEDGER = REPO_ROOT / "freestyle" / "inputs" / "observational" / "EV_FORMULA_IDENTITY_ROWS.csv"
MODULE = REPO_ROOT / "src" / "content" / "freestyleObservationalUniverse.ts"
GENERATOR = REPO_ROOT / "freestyle" / "scripts" / "build_observational_universe_content.py"

# The dictionary loaders that create every trick row a ruling links to, in the
# order the freestyle rebuild runs them, then the adjudication seed.
DICTIONARY_LOADERS = (
    "freestyle/loaders/17_load_trick_dictionary.py",
    "freestyle/loaders/19_load_red_additions.py",
    "freestyle/loaders/20_link_footbag_org_sources.py",
    "freestyle/loaders/21_load_footbag_org_pending_tricks.py",
)
SEED_LOADER = "freestyle/loaders/28_load_ev_adjudications.py"

# Every field of a ruling that carries meaning. The three the generator never
# reads are here too: the migration is of the record, not of the part in use.
DURABLE_FIELDS = (
    "submitted_name", "normalized_name", "ev_state", "final_disposition",
    "evidence_state", "object_type", "blocker_id", "blocker_subtype", "hold_kind",
    "matched_existing_object", "match_type", "note", "source", "confidence", "owner",
    "proposed_formula", "failure_class", "residual_home",
)

# The rulings held for a notation decision: one curator answer releases the whole
# cohort, so it is the cohort most likely to be quietly reshaped by a bad migration.
NOTATION_REQUIRED_BLOCKER = "D7"

# The rulings that are waiting on something rather than settled: a doctrine
# answer, an operator definition, authoring work, or a deliberate deferral. The
# settled states are their complement (alias, folk, parser, canonical, ready,
# governance).
BLOCKED_STATES = frozenset({"doctrine", "undefined_operator", "authoring", "deferred"})

# What a ruling means when its name never reaches the observational corpus: layer
# separation forbids a slug being both canonical and observational, so a ruling
# in one of these states is suppressed from the corpus rather than absent from
# the record. It must still be in the table.
SUPPRESSED_STATES = frozenset({"canonical", "alias", "parser", "authoring"})


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, *args], cwd=str(REPO_ROOT), capture_output=True, text=True
    )


@pytest.fixture(scope="module")
def seeded_db(tmp_path_factory) -> Path:
    """A database built from the committed inputs, with the rulings seeded into it."""
    db = tmp_path_factory.mktemp("ev-equivalence") / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()

    for loader in (*DICTIONARY_LOADERS, SEED_LOADER):
        result = _run([loader, "--db", str(db)])
        assert result.returncode == 0, (
            f"{loader} failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )
    return db


@pytest.fixture(scope="module")
def ledger_rows() -> list[dict]:
    with LEDGER.open(newline="", encoding="utf-8") as f:
        return [dict(r) for r in csv.DictReader(f)]


@pytest.fixture(scope="module")
def seeded_rows(seeded_db: Path) -> list[dict]:
    conn = sqlite3.connect(f"file:{seeded_db}?mode=ro", uri=True)
    try:
        conn.row_factory = sqlite3.Row
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM freestyle_ev_adjudications ORDER BY sequence_no"
            )
        ]
    finally:
        conn.close()


def _module_rows(text: str) -> list[dict]:
    """The generated corpus rows, one JSON object per line in the emitted module."""
    rows = []
    for line in text.splitlines():
        stripped = line.strip().rstrip(",")
        if stripped.startswith('{"name"'):
            rows.append(json.loads(stripped))
    return rows


@pytest.fixture(scope="module")
def committed_module_rows() -> list[dict]:
    return _module_rows(MODULE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def regenerated_from_db(seeded_db: Path, tmp_path_factory) -> str:
    """The module a generator run emits with the seeded table as its authority."""
    out = tmp_path_factory.mktemp("ev-projection") / "freestyleObservationalUniverse.ts"
    env = {
        **os.environ,
        "FREESTYLE_EV_AUTHORITY_DB": str(seeded_db),
        "FREESTYLE_OBSERVATIONAL_OUT": str(out),
    }
    result = subprocess.run(
        [sys.executable, str(GENERATOR)],
        cwd=str(REPO_ROOT), capture_output=True, text=True, env=env,
    )
    assert result.returncode == 0, (
        f"the generator refused the database authority.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )
    return out.read_text(encoding="utf-8")


# ── Adjudication equivalence ────────────────────────────────────────────────

def test_every_ruling_is_in_the_table(ledger_rows, seeded_rows):
    assert len(seeded_rows) == len(ledger_rows) == 871


def test_the_adjudicated_names_are_the_same_set(ledger_rows, seeded_rows):
    assert {r["normalized_name"] for r in seeded_rows} == {
        r["normalized_name"] for r in ledger_rows
    }


def test_every_durable_field_survives_the_move_unchanged(ledger_rows, seeded_rows):
    """Value by value, not distribution by distribution.

    Two records can carry identical distributions of every field and still have
    swapped them between rows, which would silently reassign rulings to names.
    """
    seeded_by_name = {r["normalized_name"]: r for r in seeded_rows}
    differences = []
    for ledger_row in ledger_rows:
        seeded = seeded_by_name[ledger_row["normalized_name"]]
        for field in DURABLE_FIELDS:
            if seeded[field] != ledger_row[field]:
                differences.append(
                    f"{ledger_row['normalized_name']}.{field}: "
                    f"ledger {ledger_row[field]!r} vs table {seeded[field]!r}"
                )
    assert not differences, "durable fields changed in the move:\n" + "\n".join(differences[:20])


def test_the_notation_required_cohort_is_the_same_thirty_six(ledger_rows, seeded_rows):
    from_ledger = {r["normalized_name"] for r in ledger_rows
                   if r["blocker_id"] == NOTATION_REQUIRED_BLOCKER}
    from_table = {r["normalized_name"] for r in seeded_rows
                  if r["blocker_id"] == NOTATION_REQUIRED_BLOCKER}
    assert len(from_ledger) == 36
    assert from_table == from_ledger


def test_the_blocked_cohort_is_the_same_two_hundred_and_twenty_one(ledger_rows, seeded_rows):
    from_ledger = {r["normalized_name"] for r in ledger_rows if r["ev_state"] in BLOCKED_STATES}
    from_table = {r["normalized_name"] for r in seeded_rows if r["ev_state"] in BLOCKED_STATES}
    assert len(from_ledger) == 221
    assert from_table == from_ledger


def test_a_ruling_suppressed_from_the_corpus_is_still_in_the_record(
    ledger_rows, seeded_rows, committed_module_rows
):
    """The 83 rulings layer separation keeps out of the observational corpus.

    A slug cannot be both canonical and observational, so a ruling whose name is
    already published, already an alias, parser-internal or authoring-suppressed
    has no corpus row. That is a display consequence, not a reason to lose the
    ruling: every one of them must be in the table.
    """
    def key(text: str) -> str:
        return re.sub(r"[^a-z0-9]", "", (text or "").lower())

    corpus_names = {key(r["name"]) for r in committed_module_rows}
    suppressed = [
        r for r in ledger_rows
        if r["normalized_name"] not in corpus_names
        and key(r["submitted_name"]) not in corpus_names
    ]
    assert len(suppressed) == 83
    assert {r["ev_state"] for r in suppressed} <= SUPPRESSED_STATES

    seeded_names = {r["normalized_name"] for r in seeded_rows}
    missing = [r["normalized_name"] for r in suppressed if r["normalized_name"] not in seeded_names]
    assert not missing, f"suppressed rulings dropped from the table: {missing}"


# ── The trick link ──────────────────────────────────────────────────────────

def test_every_prose_trick_link_became_a_foreign_key(ledger_rows, seeded_rows):
    """The nine rulings that recorded their trick row inside free text now hold it
    as a real link, and no ruling acquired one that the ledger never recorded."""
    from_prose = {
        r["normalized_name"]: m.group(1)
        for r in ledger_rows
        if (m := re.search(r"external-db-row slug=([a-z0-9_]+)", r["note"] or ""))
    }
    linked = {
        r["normalized_name"]: r["published_trick_slug"]
        for r in seeded_rows
        if r["published_trick_slug"] is not None
    }
    assert len(from_prose) == 9
    assert linked == from_prose


def test_a_linked_ruling_points_at_a_trick_row_that_exists(seeded_db, seeded_rows):
    conn = sqlite3.connect(f"file:{seeded_db}?mode=ro", uri=True)
    try:
        dangling = conn.execute(
            """
            SELECT a.normalized_name
              FROM freestyle_ev_adjudications a
         LEFT JOIN freestyle_tricks t ON t.slug = a.published_trick_slug
             WHERE a.published_trick_slug IS NOT NULL AND t.slug IS NULL
            """
        ).fetchall()
    finally:
        conn.close()
    assert dangling == []


def test_the_live_trick_row_decides_which_linked_names_are_still_candidates(seeded_db):
    """Seven linked names are still candidates and two are published.

    Both facts are read from the live trick row: held out of the dictionary means
    a candidate, live and reviewed means published. The prose that recorded the
    link says "pending" for all nine and is stale on two of them, which is the
    reason the link is a column now and the prose is only history.
    """
    conn = sqlite3.connect(f"file:{seeded_db}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            """
            SELECT t.slug, t.is_active, t.review_status
              FROM freestyle_ev_adjudications a
              JOIN freestyle_tricks t ON t.slug = a.published_trick_slug
             ORDER BY t.slug
            """
        ).fetchall()
    finally:
        conn.close()

    candidates = sorted(slug for slug, is_active, status in rows
                        if is_active == 0 and status == "pending")
    published = sorted(slug for slug, is_active, status in rows if is_active == 1)

    assert len(candidates) == 7
    assert published == ["inspinning_same_side_illusion", "inspinning_same_side_mirage"]
    assert all(status == "expert_reviewed" for slug, _, status in rows if slug in published)


def test_a_ruling_is_not_dropped_merely_because_its_trick_is_already_canonical(
    ledger_rows, seeded_rows
):
    """The two names whose trick rows went live keep their rulings and their links.

    Their adjudication is the history of how they got there. Reading the stale
    prose as current would have deleted or unlinked them as resolved candidates.
    """
    promoted = ["inspinningsamesideillusion", "inspinningsamesidemirage"]
    seeded_by_name = {r["normalized_name"]: r for r in seeded_rows}
    ledger_by_name = {r["normalized_name"]: r for r in ledger_rows}
    for name in promoted:
        row = seeded_by_name[name]
        assert row["published_trick_slug"] == ledger_by_name[name]["matched_existing_object"]
        assert row["ev_state"] == ledger_by_name[name]["ev_state"]
        assert row["note"] == ledger_by_name[name]["note"]


# ── Projection equivalence ──────────────────────────────────────────────────

def test_the_database_authority_emits_the_committed_module_byte_for_byte(regenerated_from_db):
    committed = MODULE.read_text(encoding="utf-8")
    assert regenerated_from_db == committed


def test_the_emitted_corpus_has_the_same_shape(regenerated_from_db, committed_module_rows):
    rows = _module_rows(regenerated_from_db)
    assert len(rows) == len(committed_module_rows) == 909
    assert sum(1 for r in rows if r["layer"] == "frontier") == 180
    assert sum(1 for r in rows if r["layer"] == "archive") == 729


def test_every_emitted_row_matches_the_committed_one_in_order(
    regenerated_from_db, committed_module_rows
):
    """Ordering and per-row projection, asserted field by field.

    Byte equality already implies this. It is asserted separately so a failure
    names the row and the field that moved instead of reporting that two large
    files differ.
    """
    rows = _module_rows(regenerated_from_db)
    projected = ("layer", "publicSection", "publicationState", "groupPrimary", "lexicalVariants")
    differences = []
    for emitted, committed in zip(rows, committed_module_rows):
        if emitted["name"] != committed["name"]:
            differences.append(f"order moved: {emitted['name']!r} where {committed['name']!r} was")
            continue
        for field in projected:
            if emitted[field] != committed[field]:
                differences.append(
                    f"{committed['name']}.{field}: committed {committed[field]!r} "
                    f"vs emitted {emitted[field]!r}"
                )
    assert not differences, "the projection moved:\n" + "\n".join(differences[:20])


def test_the_public_content_around_the_rows_is_unchanged(regenerated_from_db):
    """The stats, registries and trick-link map the page renders beside the rows."""
    committed = MODULE.read_text(encoding="utf-8")
    for export in ("OBSERVATIONAL_UNIVERSE_STATS", "EMERGING_QUESTIONS",
                   "EMERGING_DECISION_GROUPS", "EXTERNAL_ADJUDICATIONS"):
        marker = f"export const {export}"
        assert marker in committed and marker in regenerated_from_db
        assert (
            committed[committed.index(marker):] == regenerated_from_db[regenerated_from_db.index(marker):]
        ), f"{export} differs between the committed module and the database run"
