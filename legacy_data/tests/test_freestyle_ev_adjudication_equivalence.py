"""The database rules the Emerging Vocabulary adjudications, and ruling them changed nothing.

The rulings that decide what each observational freestyle name IS are held in a
writable database table, seeded from the committed ledger that used to be the
authority. The generator reads the table. This gate is the permanent proof that
the authority sits where it is supposed to and that moving it there changed
nothing, and it proves things that do not imply each other:

  Adjudication equivalence — the table holds every ruling the ledger holds, with
  the same values. This is a claim about 871 records, and it stays meaningful
  while the ledger remains as migration history.

  Projection equivalence — a generator run emits content byte-identical to the
  committed module, which was generated before the authority moved. This is a
  claim about 909 rows composed from the corpus, most of which carry a ruling and
  some of which carry none.

  Authority — the generator reads the table and nothing else. Editing the ledger
  no longer changes what it emits; editing an adjudication does. A database that
  cannot supply the rulings aborts the run rather than quietly regenerating
  public content from the record curators no longer write to.

The two counts are both correct and are not the same measurement, which is why
each is asserted on its own terms.

The gate builds its own database from the committed inputs, so it depends on no
prior local state, and every mutation it makes is to a scratch copy: the
committed ledger, the committed module and the checkout's database are never
written.
"""
import csv
import json
import os
import re
import shutil
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


# ── Where the authority lives ───────────────────────────────────────────────

def _load_generator_module():
    """Import the generator for its path resolution, without running it."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("ev_universe_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_generator(authority_db, out_path, generator=GENERATOR, cwd=REPO_ROOT):
    env = {
        **os.environ,
        "FREESTYLE_EV_AUTHORITY_DB": str(authority_db),
        "FREESTYLE_OBSERVATIONAL_OUT": str(out_path),
    }
    return subprocess.run(
        [sys.executable, str(generator)],
        cwd=str(cwd), capture_output=True, text=True, env=env,
    )


def test_the_default_authority_is_the_checkouts_own_database(monkeypatch):
    """With nothing set in the environment, the rulings come from the platform database.

    The environment variable exists for a harness pointing the generator at a
    database it built itself. What a developer or a deploy runs must resolve to
    the checkout's own database, or the switch to it would only be true under
    test conditions.
    """
    monkeypatch.delenv("FREESTYLE_EV_AUTHORITY_DB", raising=False)
    generator = _load_generator_module()
    assert generator.authority_db_path() == REPO_ROOT / "database" / "footbag.db"


def test_the_generator_no_longer_reads_the_committed_ledger():
    """No code path in the generator opens the ledger file.

    The behavioural proofs below show that editing the ledger changes nothing.
    This one closes the gap they cannot: a fallback that only fires when the
    database is missing would pass every one of them.
    """
    source = GENERATOR.read_text(encoding="utf-8")
    code = "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith("#")
    )
    assert "EV_FORMULA_IDENTITY_ROWS" not in code, (
        "the generator still names the ledger file outside a comment"
    )


def test_an_unusable_authority_aborts_instead_of_falling_back(tmp_path):
    """Four ways the table can fail to supply the rulings, each a refusal.

    The committed ledger is present in every one of these runs, which is the
    point: a fallback to it would turn each refusal into content generated from
    a record curators no longer write to, and nothing about the output would say
    so.
    """
    out = tmp_path / "never-written.ts"

    absent = tmp_path / "no-such.db"

    no_table = tmp_path / "no-table.db"
    conn = sqlite3.connect(no_table)
    conn.execute("CREATE TABLE unrelated (id TEXT)")
    conn.close()

    empty = tmp_path / "empty.db"
    conn = sqlite3.connect(empty)
    conn.executescript(SCHEMA.read_text(encoding="utf-8"))
    conn.close()

    for db in (absent, no_table, empty):
        result = _run_generator(db, out)
        assert result.returncode != 0, f"{db.name} produced content anyway"
        assert "adjudication authority" in result.stderr, f"{db.name}: {result.stderr}"
        assert "28_load_ev_adjudications.py" in result.stderr, f"{db.name}: {result.stderr}"
        assert "Traceback" not in result.stderr, f"{db.name}: {result.stderr}"
        assert not out.exists(), f"{db.name} wrote a module before failing"


def test_an_adjudication_missing_a_field_it_cannot_be_read_without_aborts(
    seeded_db, tmp_path,
):
    """A blank owner would otherwise be classified from a default, silently."""
    incomplete = tmp_path / "incomplete.db"
    incomplete.write_bytes(seeded_db.read_bytes())
    conn = sqlite3.connect(incomplete)
    conn.execute(
        "UPDATE freestyle_ev_adjudications SET owner = '' WHERE sequence_no = 1"
    )
    conn.commit()
    conn.close()

    out = tmp_path / "never-written.ts"
    result = _run_generator(incomplete, out)
    assert result.returncode != 0
    assert "incomplete" in result.stderr
    assert "owner is empty" in result.stderr
    assert not out.exists()


def test_editing_the_ledger_no_longer_changes_the_generated_content(
    seeded_db, tmp_path,
):
    """A ledger edit is invisible to the generator now that the table rules.

    The edit happens in a scratch copy of the inputs, never in the checkout. It
    changes a blocker and an owner on a name the corpus carries, which under the
    old authority would have moved that row's section and owner in the output.
    """
    scratch = tmp_path / "scratch-tree"
    (scratch / "freestyle").mkdir(parents=True)
    for part in ("inputs", "doctrine", "scripts"):
        shutil.copytree(REPO_ROOT / "freestyle" / part, scratch / "freestyle" / part)

    scratch_ledger = scratch / "freestyle" / "inputs" / "observational" / "EV_FORMULA_IDENTITY_ROWS.csv"
    with scratch_ledger.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = [dict(r) for r in reader]
    edited = 0
    for row in rows:
        if row["blocker_id"] == "Q02":
            row["blocker_id"] = "Q01"
            row["owner"] = "evidence"
            edited += 1
    assert edited > 0, "the scratch ledger carried no row to edit"
    with scratch_ledger.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    out = tmp_path / "from-edited-ledger.ts"
    result = _run_generator(
        seeded_db, out,
        generator=scratch / "freestyle" / "scripts" / GENERATOR.name,
        cwd=scratch,
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert out.read_text(encoding="utf-8") == MODULE.read_text(encoding="utf-8"), (
        f"editing {edited} ledger rows changed the generated content, so the "
        f"ledger is still being read"
    )


def test_editing_an_adjudication_changes_the_generated_content(seeded_db, tmp_path):
    """The converse: the table is what the output actually follows.

    Without this, the test above would pass just as well against a generator that
    read neither record and emitted a constant.
    """
    edited_db = tmp_path / "edited.db"
    edited_db.write_bytes(seeded_db.read_bytes())
    conn = sqlite3.connect(edited_db)
    try:
        target = conn.execute(
            """
            SELECT normalized_name, submitted_name FROM freestyle_ev_adjudications
             WHERE evidence_state = 'compositional-name-only' AND blocker_id = 'Q02'
             ORDER BY sequence_no LIMIT 1
            """
        ).fetchone()
        assert target, "no adjudication to edit"
        conn.execute(
            "UPDATE freestyle_ev_adjudications SET evidence_state = 'verified-footage' "
            "WHERE normalized_name = ?",
            (target[0],),
        )
        conn.commit()
    finally:
        conn.close()

    out = tmp_path / "from-edited-table.ts"
    result = _run_generator(edited_db, out)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    emitted = out.read_text(encoding="utf-8")
    assert emitted != MODULE.read_text(encoding="utf-8"), (
        "editing an adjudication changed nothing, so the table is not the authority"
    )

    changed = [r for r in _module_rows(emitted) if r["evidenceState"] == "verified-footage"]
    assert changed, "the edited ruling did not reach the generated rows"
