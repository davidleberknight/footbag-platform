"""Reseed ownership contract for the two kinds of person row loader 08 removes.

Loader 08 rebuilds the results-derived person population on every run and deletes
the rows its incoming seed no longer carries. Two very different things can cause
a row to stop appearing:

A canonical person vanishing means a claimed identity disappeared. If anything
outside loader 08 still points at it, deleting it would strand that reference, so
the whole load must fail closed.

An unresolved stub vanishing means the pipeline improved. A stub is not an
assertion that a person exists, it is a placeholder minted from a display name
nothing could resolve, and its id is a hash of that name. When the name is later
corrected or matched to a real person the stub retires in the reseed itself. A
stub another table still references also stops the load, because a placeholder
reaching such a surface was treated as a real identity somewhere upstream.
"""
from __future__ import annotations

import csv
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"

LOADER_08 = "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py"

CANONICAL = "CANONICAL"
STUB = "UNRESOLVED_STUB"

# Two partners in a doubles-net entry. A stays put across both runs; B is the row
# that disappears, carrying whichever scope the test is about. C is who the entry
# resolves to on the second run.
PID_A = "aaaaaaaa-1111-1111-1111-111111111111"
PID_B = "bbbbbbbb-2222-2222-2222-222222222222"
PID_C = "cccccccc-3333-3333-3333-333333333333"

EVENT_KEY = "2001_reseed_test"
DISC_KEY = "open_doubles_net"

PERSON_FIELDS = [
    "person_id", "person_name", "member_id", "country", "first_year", "last_year",
    "event_count", "placement_count", "bap_member", "bap_nickname",
    "bap_induction_year", "hof_member", "hof_induction_year", "freestyle_sequences",
    "freestyle_max_add", "freestyle_unique_tricks", "freestyle_diversity_ratio",
    "signature_trick_1", "signature_trick_2", "signature_trick_3", "source_scope",
]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def person_row(pid: str, name: str, scope: str) -> dict:
    row = {k: "" for k in PERSON_FIELDS}
    row.update({
        "person_id": pid, "person_name": name, "country": "United States",
        "event_count": "1", "placement_count": "1", "bap_member": "0",
        "hof_member": "0", "source_scope": scope,
    })
    return row


def make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.close()
    return db


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, *args], cwd=str(REPO_ROOT), capture_output=True, text=True,
        timeout=120,
    )


def load_08(db: Path, seed_dir: Path) -> subprocess.CompletedProcess:
    return run([LOADER_08, "--db", str(db), "--seed-dir", str(seed_dir), "--no-backup"])


def build_seed(seed_dir: Path, partner_pid: str, partner_name: str,
               partner_scope: str) -> Path:
    """One doubles-net entry: PID_A partnered with whichever person the caller
    names. Everything else is held constant so the only variable across runs is
    who the second participant is and what scope their row carries."""
    seed_dir.mkdir(parents=True, exist_ok=True)
    write_csv(
        seed_dir / "seed_events.csv",
        ["event_key", "legacy_event_id", "year", "event_name", "event_slug",
         "start_date", "end_date", "city", "region", "country", "host_club",
         "status", "notes", "source"],
        [{"event_key": EVENT_KEY, "legacy_event_id": EVENT_KEY, "year": "2001",
          "event_name": "Reseed Test Open", "event_slug": "reseed_test_2001",
          "start_date": "2001-01-01", "end_date": "2001-01-02", "city": "Town",
          "region": "State", "country": "United States", "host_club": "",
          "status": "completed", "notes": "", "source": "mirror"}],
    )
    write_csv(
        seed_dir / "seed_event_disciplines.csv",
        ["event_key", "discipline_key", "discipline_name", "discipline_category",
         "team_type", "sort_order", "coverage_flag", "notes"],
        [{"event_key": EVENT_KEY, "discipline_key": DISC_KEY,
          "discipline_name": "Open Doubles Net", "discipline_category": "net",
          "team_type": "doubles", "sort_order": "1", "coverage_flag": "partial",
          "notes": ""}],
    )
    write_csv(
        seed_dir / "seed_event_results.csv",
        ["event_key", "discipline_key", "placement", "score_text", "notes", "source"],
        [{"event_key": EVENT_KEY, "discipline_key": DISC_KEY, "placement": "1",
          "score_text": "", "notes": "", "source": ""}],
    )
    write_csv(
        seed_dir / "seed_event_result_participants.csv",
        ["event_key", "discipline_key", "placement", "participant_order",
         "display_name", "person_id", "notes"],
        [{"event_key": EVENT_KEY, "discipline_key": DISC_KEY, "placement": "1",
          "participant_order": "1", "display_name": "Player A",
          "person_id": PID_A, "notes": ""},
         {"event_key": EVENT_KEY, "discipline_key": DISC_KEY, "placement": "1",
          "participant_order": "2", "display_name": partner_name,
          "person_id": partner_pid, "notes": ""}],
    )
    write_csv(
        seed_dir / "seed_persons.csv", PERSON_FIELDS,
        [person_row(PID_A, "Player A", CANONICAL),
         person_row(partner_pid, partner_name, partner_scope)],
    )
    return seed_dir


def persons(db: Path) -> dict[str, str | None]:
    conn = sqlite3.connect(db)
    try:
        return {r[0]: r[1] for r in
                conn.execute("SELECT person_id, source_scope FROM historical_persons")}
    finally:
        conn.close()


def first_run(tmp_path: Path, scope: str) -> Path:
    """Load the entry with PID_B as the partner."""
    db = make_db(tmp_path)
    r = load_08(db, build_seed(tmp_path / "seed1", PID_B, "Partner B", scope))
    assert r.returncode == 0, f"first load failed\n{r.stdout}\n{r.stderr}"
    return db


def reference_from_outside_the_loader(db: Path, person_id: str) -> None:
    """A freestyle record pointing at the person, from a table loader 08 does not own."""
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO freestyle_records "
        "(id, record_type, date_precision, source, confidence, created_at, "
        " updated_at, person_id) "
        "VALUES ('rec-1', 'consecutive', 'day', 'test', 'verified', "
        "        '2001-01-01T00:00:00Z', '2001-01-01T00:00:00Z', ?)",
        (person_id,))
    conn.commit()
    conn.close()


# ── A reference from outside the loader stops the load ───────────────────────

def test_a_referenced_canonical_person_leaving_the_seed_aborts(tmp_path):
    """A canonical row is a claimed identity; if it stops appearing while a table
    loader 08 does not own still references it, the load must refuse rather than
    strand the reference."""
    db = first_run(tmp_path, CANONICAL)
    reference_from_outside_the_loader(db, PID_B)

    r = load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))

    assert r.returncode != 0, (
        "loader 08 accepted the disappearance of a referenced canonical person\n"
        f"{r.stdout}")
    assert "08 aborted" in r.stderr
    assert PID_B in persons(db), "the canonical person was deleted despite the abort"


def test_a_referenced_stub_leaving_the_seed_aborts(tmp_path):
    """A placeholder that reached a surface outside the loader was treated as a real
    identity upstream, and quietly deleting the reference would hide that."""
    db = first_run(tmp_path, STUB)
    reference_from_outside_the_loader(db, PID_B)

    r = load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))

    assert r.returncode != 0, (
        f"loader 08 retired a stub that another table references\n{r.stdout}")
    assert "08 aborted" in r.stderr
    assert PID_B in persons(db), "the stub was deleted despite the abort"


# ── A resolved stub retires in the reseed ────────────────────────────────────

def test_an_unreferenced_stub_is_deleted_by_the_reseed_itself(tmp_path):
    """The only reference is loader 08's own participants table, which it clears at
    the start of the reseed, so a resolved stub simply goes."""
    db = first_run(tmp_path, STUB)
    assert PID_B in persons(db)

    r = load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))

    assert r.returncode == 0, f"reseed failed\n{r.stdout}\n{r.stderr}"
    assert PID_B not in persons(db), "an unreferenced stub survived the reseed"
    assert PID_C in persons(db), "the resolved person did not load"


# ── Provenance may not be guessed ────────────────────────────────────────────

def test_a_scopeless_person_row_is_an_error_rather_than_an_assumed_owner(tmp_path):
    """A row whose scope is NULL has no stated owner, and claiming it as canonical
    would be a guess. Ownership is never inferred: an unexplained scope stops the
    load and asks."""
    db = first_run(tmp_path, STUB)
    conn = sqlite3.connect(db)
    conn.execute("UPDATE historical_persons SET source_scope = NULL WHERE person_id = ?",
                 (PID_B,))
    conn.commit()
    conn.close()

    r = load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))
    assert r.returncode != 0, f"a scopeless row was silently given an owner\n{r.stdout}"
    assert "source_scope" in r.stderr
    assert PID_B in persons(db)


def test_the_seed_builder_stamps_its_stubs_rather_than_leaving_them_blank(tmp_path):
    """Ownership is declared where the row is created. The seed builder mints a
    stub for a display name it cannot resolve, and that row must carry the stub
    scope: a blank here is what would let the reseed claim the row as canonical."""
    import importlib.util

    path = (REPO_ROOT / "legacy_data" / "event_results" / "scripts"
            / "07_build_mvfp_seed_full.py")
    spec = importlib.util.spec_from_file_location("seed_builder_07", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    assert mod.STUB_SOURCE_SCOPE == STUB
    row = mod.stub_person_row("Someone Unresolvable")
    assert row["source_scope"] == STUB, (
        f"the seed builder still emits {row['source_scope']!r} for a stub")
    assert row["person_id"] == mod.auto_person_id("Someone Unresolvable")


def test_the_reseed_never_touches_the_provisional_population(tmp_path):
    """The other loader's cohort is not loader 08's to retire."""
    db = first_run(tmp_path, STUB)
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO historical_persons (person_id, person_name, source_scope, source) "
        "VALUES ('dddddddd-4444-4444-4444-444444444444', 'Club Person', "
        "'PROVISIONAL', 'CLUB')")
    conn.commit()
    conn.close()

    r = load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))
    assert r.returncode == 0, f"reseed failed\n{r.stdout}\n{r.stderr}"
    assert "dddddddd-4444-4444-4444-444444444444" in persons(db)
