"""Reseed ownership contract for the two kinds of person row loader 08 removes.

Loader 08 rebuilds the results-derived person population on every run and deletes
the rows its incoming seed no longer carries. Two very different things can cause
a row to stop appearing, and they need opposite outcomes:

A canonical person vanishing means a claimed identity disappeared. If anything
outside loader 08 still points at it, deleting it would strand that reference, so
the whole load must fail closed. That is the behaviour these tests pin first,
because the rest of this file exists to narrow that guard and the narrowing must
not reach it.

An unresolved stub vanishing means the opposite: the pipeline improved. A stub is
not an assertion that a person exists, it is a placeholder minted from a display
name nothing could resolve, and its id is a hash of that name. When the name is
later corrected or matched to a real person the stub should simply retire, and
the references built on it belong to the loader that built them. Aborting there
deadlocks every future reseed, because the only loader able to clear those
references runs after the one refusing to proceed.

So a referenced stub survives loader 08 only when its remaining references belong
to a stage that runs later in the same orchestrated run and rebuilds them. Once
those stages have run, the sweep deletes stub-scoped rows nothing references any
more. Nothing is ever deleted while referenced, so the database is
foreign-key-valid at every instant.
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
LOADER_13 = "legacy_data/event_results/scripts/13_build_net_teams.py"
SWEEP = "legacy_data/event_results/scripts/14_retire_resolved_stub_persons.py"

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


def load_13(db: Path) -> subprocess.CompletedProcess:
    # --qc-out keeps the findings artifact beside the temp database; without it
    # loader 13 writes into the real legacy_data/out tree, which no test may touch.
    return run([LOADER_13, "--db", str(db), "--qc-out", str(db.parent)])


def sweep(db: Path) -> subprocess.CompletedProcess:
    return run([SWEEP, "--db", str(db)])


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


def net_partners(db: Path) -> set[str]:
    """Every person id loader 13's team tables currently point at."""
    conn = sqlite3.connect(db)
    try:
        ids = set()
        for a, b in conn.execute("SELECT person_id_a, person_id_b FROM net_team"):
            ids.update((a, b))
        ids.update(r[0] for r in conn.execute("SELECT person_id FROM net_team_member"))
        return ids
    finally:
        conn.close()


def first_run(tmp_path: Path, scope: str) -> Path:
    """Load the entry with PID_B as the partner, then build net teams on it, so a
    net_team reference to PID_B exists before the reseed under test."""
    db = make_db(tmp_path)
    seed = build_seed(tmp_path / "seed1", PID_B, "Partner B", scope)
    r = load_08(db, seed)
    assert r.returncode == 0, f"first load failed\n{r.stdout}\n{r.stderr}"
    r = load_13(db)
    assert r.returncode == 0, f"loader 13 failed\n{r.stdout}\n{r.stderr}"
    assert PID_B in net_partners(db), "setup did not create the net reference"
    return db


# ── The guard that must not move ─────────────────────────────────────────────

def test_a_referenced_canonical_person_leaving_the_seed_still_aborts(tmp_path):
    """The fail-closed case, pinned before anything narrows it. A canonical row is
    a claimed identity; if it stops appearing while a table loader 08 does not own
    still references it, the load must refuse rather than strand the reference."""
    db = first_run(tmp_path, CANONICAL)

    reseed = build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL)
    r = load_08(db, reseed)

    assert r.returncode != 0, (
        "loader 08 accepted the disappearance of a referenced canonical person\n"
        f"{r.stdout}")
    assert "08 aborted" in r.stderr
    assert PID_B in persons(db), "the canonical person was deleted despite the abort"
    assert PID_B in net_partners(db), "its net reference was stranded"


def test_a_referenced_canonical_person_aborts_even_with_the_sweep_available(tmp_path):
    """The sweep is not a way around the canonical guard: it only ever considers
    stub-scoped rows, so a canonical row it could reach is still refused."""
    db = first_run(tmp_path, CANONICAL)
    load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))

    r = sweep(db)
    assert r.returncode == 0, f"sweep failed\n{r.stderr}"
    assert PID_B in persons(db), "the sweep deleted a canonical person"


# ── The deadlock this card exists to break ───────────────────────────────────

def test_a_resolved_stub_does_not_block_the_reseed(tmp_path):
    """The exact deadlock: a stub gains a net_team reference, then resolves onto a
    real person. Loader 08 must proceed. Before this contract existed it aborted,
    and because only loader 13 can clear that reference and loader 13 runs later,
    no ordinary run could ever get past it again."""
    db = first_run(tmp_path, STUB)

    reseed = build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL)
    r = load_08(db, reseed)

    assert r.returncode == 0, (
        "loader 08 still refuses a resolved stub; the reseed deadlock is back\n"
        f"{r.stdout}\n{r.stderr}")
    # It survives this run rather than being deleted under a live reference.
    assert PID_B in persons(db), "the stub was deleted while still referenced"
    assert PID_C in persons(db), "the resolved person did not load"
    # Surviving is a decision, not an oversight. The loader must say it recognised
    # the row as its own and deferred it, or this assertion passes just as well
    # when the row is ignored entirely and never retires at all.
    assert "pending retirement" in r.stdout, (
        "loader 08 did not report deferring the stub, so it is being ignored "
        f"rather than owned\n{r.stdout}")


def test_the_stub_retires_once_its_owning_loader_has_rebuilt(tmp_path):
    """End to end in the orchestrated order: reseed, then the downstream owner
    rebuilds its references, then the sweep retires what nothing points at."""
    db = first_run(tmp_path, STUB)
    assert load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C",
                                  CANONICAL)).returncode == 0

    r = load_13(db)
    assert r.returncode == 0, f"loader 13 failed\n{r.stderr}"
    assert PID_B not in net_partners(db), "loader 13 kept the stale reference"
    assert PID_C in net_partners(db), "the rebuilt team did not use the real person"

    r = sweep(db)
    assert r.returncode == 0, f"sweep failed\n{r.stdout}\n{r.stderr}"
    assert PID_B not in persons(db), "the retired stub was not swept"
    assert PID_A in persons(db) and PID_C in persons(db), "the sweep took too much"


def test_the_sweep_leaves_a_stub_that_is_still_referenced(tmp_path):
    """Ordering safety. Run the sweep before the downstream rebuild and it must do
    nothing, so a sweep placed too early degrades to a no-op instead of stranding
    loader 13's rows."""
    db = first_run(tmp_path, STUB)
    assert load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C",
                                  CANONICAL)).returncode == 0

    r = sweep(db)
    assert r.returncode == 0, f"sweep failed\n{r.stderr}"
    assert PID_B in persons(db), "the sweep deleted a stub loader 13 still referenced"


def test_a_stub_reaching_a_surface_no_later_stage_rebuilds_still_aborts(tmp_path):
    """Deferral is not blanket permission. It rests entirely on the referencing
    table being rebuilt later in the same run, so a stub that has reached a
    surface outliving the pipeline gets the fail-closed treatment: something
    upstream treated a placeholder as a real identity, and quietly deleting the
    reference would hide that."""
    db = first_run(tmp_path, STUB)
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO freestyle_records "
        "(id, record_type, date_precision, source, confidence, created_at, "
        " updated_at, person_id) "
        "VALUES ('rec-1', 'consecutive', 'day', 'test', 'verified', "
        "        '2001-01-01T00:00:00Z', '2001-01-01T00:00:00Z', ?)",
        (PID_B,))
    conn.commit()
    conn.close()

    r = load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))

    assert r.returncode != 0, (
        "loader 08 deferred a stub referenced by a table nothing rebuilds\n"
        f"{r.stdout}")
    assert "08 aborted" in r.stderr
    assert PID_B in persons(db), "the stub was deleted despite the abort"


def test_the_sweep_is_idempotent(tmp_path):
    db = first_run(tmp_path, STUB)
    load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C", CANONICAL))
    load_13(db)
    assert sweep(db).returncode == 0
    after_first = persons(db)
    assert sweep(db).returncode == 0
    assert persons(db) == after_first


def test_an_unreferenced_stub_is_deleted_by_the_reseed_itself(tmp_path):
    """No deferral when nothing points at the stub: loader 08 removes it inline,
    so deferred retirement is the exception rather than the normal path."""
    db = make_db(tmp_path)
    seed = build_seed(tmp_path / "seed1", PID_B, "Partner B", STUB)
    assert load_08(db, seed).returncode == 0
    assert PID_B in persons(db)
    # No loader 13 run here, so the only reference is loader 08's own participants
    # table, which it clears at the start of the reseed.
    assert load_08(db, build_seed(tmp_path / "seed2", PID_C, "Partner C",
                                  CANONICAL)).returncode == 0
    assert PID_B not in persons(db), "an unreferenced stub survived the reseed"


# ── Provenance may not be guessed ────────────────────────────────────────────

def test_a_scopeless_person_row_is_an_error_rather_than_an_assumed_owner(tmp_path):
    """The ambiguity this card was filed over. A row whose scope is NULL has no
    stated owner, and the old code silently claimed it as canonical. Ownership is
    never inferred: an unexplained scope stops the load and asks."""
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
    scope: a blank here is what let the reseed claim the row as canonical."""
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


def test_the_sweep_never_touches_the_provisional_population(tmp_path):
    """The other loader's cohort is not the sweep's to retire, referenced or not."""
    db = first_run(tmp_path, STUB)
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO historical_persons (person_id, person_name, source_scope, source) "
        "VALUES ('dddddddd-4444-4444-4444-444444444444', 'Club Person', "
        "'PROVISIONAL', 'CLUB')")
    conn.commit()
    conn.close()

    assert sweep(db).returncode == 0
    assert "dddddddd-4444-4444-4444-444444444444" in persons(db)
