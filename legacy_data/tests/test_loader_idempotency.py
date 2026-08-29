"""
Idempotency smoke test for pipeline-regenerated loaders.

Each loader, run twice against the same temp DB and identical inputs, must not
raise and must leave its target table at an identical row count. This pins the
DELETE+INSERT / INSERT-OR-IGNORE re-run-safety contract so a future
non-idempotent change (a raw INSERT, an append-counter, a missing scoped DELETE)
is caught instead of silently double-loading on the next pipeline run.

Covered: the enrichment candidate loader, the freestyle-records loader, the
name-variants seed loader, the club cutover, the MVFP seed loader (08), the
trick-dictionary loader (17), the red-additions loader (19), the consecutive-
records loader (11), and the three club/legacy seed loaders (clubs, club
members, legacy members). All inputs are synthetic and written to a temp dir,
fed through each loader's input-path flags; the cutover reads the committed seed
CSV read-only and is seeded with a candidate keyed to a real seed row.

Run from repo root:
    python -m pytest legacy_data/tests/test_loader_idempotency.py -v
"""
import csv
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
TS = "2026-01-01T00:00:00Z"

# A real legacy_club_key from seed/clubs.csv: the cutover reads the seed for its
# full-row fallback, so the seeded candidate must reference an actual seed row.
REAL_SEED_KEY = "1005960946"


def make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db


def count(db: Path, table: str) -> int:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    return path


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, *args], cwd=str(REPO_ROOT), capture_output=True, text=True
    )


def assert_idempotent(db: Path, loader_args: list[str], target_table: str) -> int:
    """Run the loader twice; assert both succeed and the target count is stable.
    Returns the (stable) row count so the caller can assert it loaded > 0."""
    r1 = run(loader_args)
    assert r1.returncode == 0, f"run 1 failed.\nstdout: {r1.stdout}\nstderr: {r1.stderr}"
    first = count(db, target_table)
    r2 = run(loader_args)
    assert r2.returncode == 0, f"run 2 failed.\nstdout: {r2.stdout}\nstderr: {r2.stderr}"
    second = count(db, target_table)
    assert first == second, (
        f"{target_table} not idempotent: run1={first}, run2={second} "
        f"(a second load changed the row count).\nrun2 stdout: {r2.stdout}"
    )
    return first


def test_enrichment_candidate_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    persons = write_csv(tmp_path / "persons.csv", ["master_person_id", "person_name", "person_type"], [])
    affs = write_csv(tmp_path / "affs.csv", ["club_key", "master_person_id"], [])
    cands = write_csv(
        tmp_path / "cands.csv",
        ["club_key", "name", "category"],
        [
            {"club_key": "idem-1", "name": "Club One", "category": "pre_populate"},
            {"club_key": "idem-2", "name": "Club Two", "category": "dormant"},
        ],
    )
    loader = [
        "legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py",
        "--db", str(db),
        "--persons-csv", str(persons),
        "--candidates-csv", str(cands),
        "--affiliations-csv", str(affs),
    ]
    n = assert_idempotent(db, loader, "legacy_club_candidates")
    assert n == 2


def test_freestyle_records_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    records = write_csv(
        tmp_path / "records.csv",
        ["record_id", "unit", "confidence", "player", "record_value",
         "trick_name", "sort_name", "adds", "date_normalized", "approx_date", "video"],
        [{
            "record_id": "idem-rec-1", "unit": "consecutive_completions",
            "confidence": "high", "player": "Idem Player", "record_value": "100",
            "trick_name": "clipper", "sort_name": "clipper", "adds": "3",
            "date_normalized": "2010-01-01", "approx_date": "no", "video": "",
        }],
    )
    loader = [
        "freestyle/loaders/10_load_freestyle_records_to_sqlite.py",
        "--db", str(db),
        "--records-csv", str(records),
    ]
    n = assert_idempotent(db, loader, "freestyle_records")
    assert n >= 1


def test_freestyle_records_loader_warns_on_edited_but_skipped_row(tmp_path: Path) -> None:
    """The records loader is additive (INSERT OR IGNORE, no DELETE), so editing an
    existing record row and re-running does not apply the edit. The loader must not
    drop that edit silently: it detects the edited-but-skipped row, keeps the stored
    row unchanged, and prints a loud warning, so a curator's correction is never lost
    without notice. A genuine re-run duplicate must not trigger that warning."""
    db = make_db(tmp_path)
    fields = ["record_id", "unit", "confidence", "player", "record_value",
              "trick_name", "sort_name", "adds", "date_normalized", "approx_date", "video"]
    base_row = {
        "record_id": "edit-rec-1", "unit": "consecutive_completions",
        "confidence": "high", "player": "Edit Player", "record_value": "100",
        "trick_name": "clipper", "sort_name": "clipper", "adds": "3",
        "date_normalized": "2010-01-01", "approx_date": "no", "video": "",
    }

    def stored_value() -> float:
        conn = sqlite3.connect(db)
        try:
            return conn.execute(
                "SELECT value_numeric FROM freestyle_records WHERE id = 'edit-rec-1'"
            ).fetchone()[0]
        finally:
            conn.close()

    def load(rows: list[dict], name: str) -> subprocess.CompletedProcess:
        csv_path = write_csv(tmp_path / name, fields, rows)
        r = run([
            "freestyle/loaders/10_load_freestyle_records_to_sqlite.py",
            "--db", str(db), "--records-csv", str(csv_path),
        ])
        assert r.returncode == 0, f"{name} load failed.\nstderr: {r.stderr}"
        return r

    # First load stores the original value.
    load([base_row], "records1.csv")
    assert stored_value() == 100.0

    # A genuine re-run of the identical CSV is a true duplicate: no edited-row warning.
    r_dup = load([base_row], "records2.csv")
    assert "edited in the CSV but NOT applied" not in r_dup.stdout, (
        f"an unchanged re-run must not report an edited-but-skipped row.\nstdout: {r_dup.stdout}"
    )

    # A curator edits the record value and re-runs. The additive loader does not apply
    # the edit, but it must report it loudly rather than counting it as a plain duplicate.
    r_edit = load([dict(base_row, record_value="250")], "records3.csv")
    assert stored_value() == 100.0, "an additive re-run must not mutate the stored record"
    assert "1 record row(s) were edited in the CSV but NOT applied" in r_edit.stdout, (
        f"the loader should print the loud edited-but-skipped warning.\nstdout: {r_edit.stdout}"
    )
    assert "edit-rec-1" in r_edit.stdout, "the warning should name the edited record id"
    assert count(db, "freestyle_records") == 1, "an edited re-run must not add a row"


def test_name_variants_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    inp = write_csv(
        tmp_path / "name_variants.csv",
        ["variant_name", "canonical_name", "confidence", "source"],
        [{"variant_name": "Bob Smith", "canonical_name": "Robert Smith",
          "confidence": "high", "source": "alias"}],
    )
    loader = [
        "legacy_data/scripts/load_name_variants_seed.py",
        "--input", str(inp),
        # Redirect both artifacts to the temp dir; the defaults point at
        # legacy_data/out/ (a real-data tree) which tests must never write.
        "--production-artifact", str(tmp_path / "prod.csv"),
        "--deferred-artifact", str(tmp_path / "deferred.csv"),
        "--db", str(db),
        "--apply",
        "--created-at", TS,
    ]
    n = assert_idempotent(db, loader, "name_variants")
    assert n >= 1


def test_cutover_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    # Seed one pre_populate candidate keyed to a real seed row so the cutover's
    # full-row fallback succeeds and it creates a live club.
    conn = sqlite3.connect(db)
    conn.execute(
        """INSERT INTO legacy_club_candidates (
             id, created_at, created_by, updated_at, updated_by, version,
             legacy_club_key, display_name, city, country,
             classification, bootstrap_eligible
           ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, ?, ?)""",
        ("lcc-idem", TS, TS, REAL_SEED_KEY, "Idem Club", "Town", "Country", "pre_populate", 1),
    )
    conn.commit()
    conn.close()
    loader = [
        "legacy_data/clubs/scripts/06_cutover_pre_populated_clubs.py",
        "--db", str(db),
    ]
    n = assert_idempotent(db, loader, "clubs")
    assert n == 1


# A synthetic person id shared by the participant row and the persons row so the
# participant resolves to a real person. member_id is left empty so the loader
# does not bind historical_persons.legacy_member_id -> legacy_members (that FK
# is not seeded here, and the loader runs with enforcement off anyway).
SEED_PID = "11111111-1111-1111-1111-111111111111"


def build_mvfp_seed(seed_dir: Path) -> Path:
    """One coherent event -> discipline -> result -> participant -> person chain,
    the minimum the MVFP seed loader needs to insert a non-empty event graph."""
    seed_dir.mkdir(parents=True, exist_ok=True)
    write_csv(
        seed_dir / "seed_events.csv",
        ["event_key", "legacy_event_id", "year", "event_name", "event_slug",
         "start_date", "end_date", "city", "region", "country", "host_club",
         "status", "notes", "source"],
        [{"event_key": "2000_idem_test", "legacy_event_id": "2000_idem_test",
          "year": "2000", "event_name": "Idem Test Open",
          "event_slug": "idem_test_open_2000", "start_date": "", "end_date": "",
          "city": "Town", "region": "State", "country": "United States",
          "host_club": "", "status": "completed", "notes": "", "source": "mirror"}],
    )
    write_csv(
        seed_dir / "seed_event_disciplines.csv",
        ["event_key", "discipline_key", "discipline_name", "discipline_category",
         "team_type", "sort_order", "coverage_flag", "notes"],
        [{"event_key": "2000_idem_test", "discipline_key": "open_singles_net",
          "discipline_name": "Open Singles Net", "discipline_category": "net",
          "team_type": "singles", "sort_order": "1", "coverage_flag": "partial",
          "notes": ""}],
    )
    write_csv(
        seed_dir / "seed_event_results.csv",
        ["event_key", "discipline_key", "placement", "score_text", "notes", "source"],
        [{"event_key": "2000_idem_test", "discipline_key": "open_singles_net",
          "placement": "1", "score_text": "", "notes": "", "source": ""}],
    )
    write_csv(
        seed_dir / "seed_event_result_participants.csv",
        ["event_key", "discipline_key", "placement", "participant_order",
         "display_name", "person_id", "notes"],
        [{"event_key": "2000_idem_test", "discipline_key": "open_singles_net",
          "placement": "1", "participant_order": "1", "display_name": "Idem Player",
          "person_id": SEED_PID, "notes": ""}],
    )
    write_csv(
        seed_dir / "seed_persons.csv",
        ["person_id", "person_name", "member_id", "country", "first_year",
         "last_year", "event_count", "placement_count", "bap_member",
         "bap_nickname", "bap_induction_year", "hof_member", "hof_induction_year",
         "freestyle_sequences", "freestyle_max_add", "freestyle_unique_tricks",
         "freestyle_diversity_ratio", "signature_trick_1", "signature_trick_2",
         "signature_trick_3", "source_scope"],
        [{"person_id": SEED_PID, "person_name": "Idem Player", "member_id": "",
          "country": "United States", "first_year": "", "last_year": "",
          "event_count": "1", "placement_count": "1", "bap_member": "0",
          "bap_nickname": "", "bap_induction_year": "", "hof_member": "0",
          "hof_induction_year": "", "freestyle_sequences": "",
          "freestyle_max_add": "", "freestyle_unique_tricks": "",
          "freestyle_diversity_ratio": "", "signature_trick_1": "",
          "signature_trick_2": "", "signature_trick_3": "",
          "source_scope": "CANONICAL"}],
    )
    return seed_dir


def test_mvfp_seed_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = [
        "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py",
        "--db", str(db),
        "--seed-dir", str(seed_dir),
        "--no-backup",
    ]
    n = assert_idempotent(db, loader, "events")
    assert n >= 1


def _mvfp_loader_args(db: Path, seed_dir: Path) -> list[str]:
    return [
        "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py",
        "--db", str(db), "--seed-dir", str(seed_dir), "--no-backup",
    ]


def _seed_app_data(db: Path) -> dict:
    """Insert app-managed rows the loader must never touch: an app-created event
    (created_by != 'seed_loader') plus its registration, co-organizer, and
    results upload, and the member and tag those need. Returns ids for later
    assertions. Inserted FK-safe with enforcement on."""
    ts = "2024-01-01T00:00:00.000Z"
    member, event, tag = "app_member_0001", "event_app_0001", "tag_app_0001"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute(
            "INSERT INTO tags (id, created_at, created_by, updated_at, updated_by, "
            "tag_normalized, tag_display, is_standard, standard_type) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'event')",
            (tag, ts, member, ts, member, "#app_event", "#app_event"),
        )
        conn.execute(
            "INSERT INTO members (id, created_at, created_by, updated_at, updated_by, "
            "real_name, display_name, display_name_normalized, is_system) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (member, ts, member, ts, member, "App Member", "App Member", "app member"),
        )
        conn.execute(
            "INSERT INTO events (id, created_at, created_by, updated_at, updated_by, "
            "title, start_date, end_date, city, country, hashtag_tag_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (event, ts, member, ts, member, "App Event", "2024-06-01", "2024-06-02",
             "City", "Country", tag),
        )
        conn.execute(
            "INSERT INTO registrations (id, created_at, created_by, updated_at, "
            "updated_by, event_id, member_id, registered_at, registration_type) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'competitor')",
            ("reg_app_1", ts, member, ts, member, event, member, ts),
        )
        conn.execute(
            "INSERT INTO event_organizers (id, created_at, created_by, updated_at, "
            "updated_by, event_id, member_id, added_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("org_app_1", ts, member, ts, member, event, member, ts),
        )
        conn.execute(
            "INSERT INTO event_results_uploads (id, created_at, created_by, updated_at, "
            "updated_by, event_id, uploaded_by_member_id, uploaded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("upl_app_1", ts, member, ts, member, event, member, ts),
        )
        conn.commit()
    finally:
        conn.close()
    return {"event_id": event, "member_id": member}


def test_mvfp_loader_preserves_app_rows_on_rerun(tmp_path: Path) -> None:
    """A re-run leaves app-created events and their registrations, co-organizers
    and results-uploads intact while reseeding only the loader's canonical rows."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    ids = _seed_app_data(db)
    events_before = count(db, "events")  # canonical events + the one app event
    r2 = run(loader)
    assert r2.returncode == 0, f"re-run refused/failed.\n{r2.stderr}"
    assert count(db, "registrations") == 1
    assert count(db, "event_organizers") == 1
    assert count(db, "event_results_uploads") == 1
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT 1 FROM events WHERE id = ?", (ids["event_id"],)
        ).fetchone() is not None, "app-created event was deleted by the loader"
    finally:
        conn.close()
    assert count(db, "events") == events_before  # nothing added or removed


def test_mvfp_loader_rerun_counts_are_stable(tmp_path: Path) -> None:
    """Honest counters: every canonical table the loader reseeds has the same
    non-zero row count after a re-run (no duplication, no drift)."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    tables = ["events", "event_disciplines", "event_result_entries",
              "event_result_entry_participants", "historical_persons", "tags"]
    assert run(loader).returncode == 0
    first = {t: count(db, t) for t in tables}
    assert run(loader).returncode == 0
    second = {t: count(db, t) for t in tables}
    assert first == second, f"canonical counts changed on re-run: {first} -> {second}"
    assert all(v > 0 for v in first.values()), f"a canonical table loaded empty: {first}"


def test_mvfp_loader_aborts_on_app_row_on_canonical_event(tmp_path: Path) -> None:
    """Ownership guard: an app-managed row attached to a canonical (seed_loader)
    event makes the loader fail fast with a clear error instead of deleting it."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    ts = "2024-01-01T00:00:00.000Z"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        canon_event = conn.execute(
            "SELECT id FROM events WHERE created_by = 'seed_loader' LIMIT 1"
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO members (id, created_at, created_by, updated_at, updated_by, "
            "real_name, display_name, display_name_normalized, is_system) "
            "VALUES ('m_guard', ?, 'm_guard', ?, 'm_guard', 'M', 'M', 'm', 1)", (ts, ts),
        )
        conn.execute(
            "INSERT INTO registrations (id, created_at, created_by, updated_at, "
            "updated_by, event_id, member_id, registered_at, registration_type) "
            "VALUES ('reg_guard', ?, 'm_guard', ?, 'm_guard', ?, 'm_guard', ?, 'competitor')",
            (ts, ts, canon_event, ts),
        )
        conn.commit()
    finally:
        conn.close()
    r = run(loader)
    assert r.returncode != 0, "loader should abort on an app row on a canonical event"
    assert "app-managed registrations row references canonical event" in (r.stdout + r.stderr), \
        f"missing clear guard error.\nstdout: {r.stdout}\nstderr: {r.stderr}"
    assert count(db, "registrations") == 1  # nothing deleted; abort before any delete


# ---------------------------------------------------------------------------
# Loader 08 net_discipline_group child: scoped teardown, ownership guard, FK safety
# ---------------------------------------------------------------------------
# net_discipline_group carries a foreign key to event_disciplines and is rebuilt by
# the net pipeline, not this loader. A re-run against a database that already holds
# those group rows must clear the ones referencing its canonical disciplines before
# it deletes the disciplines, or the strict foreign key aborts the whole reseed.


def _canonical_discipline_id(db: Path) -> str:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            "SELECT id FROM event_disciplines WHERE event_id IN "
            "(SELECT id FROM events WHERE created_by = 'seed_loader') LIMIT 1"
        ).fetchone()[0]
    finally:
        conn.close()


def _insert_net_discipline_group(db: Path, discipline_id: str) -> None:
    """Insert the net-pipeline group row that references a discipline, as script 12
    would after the net teardown."""
    ts = "2024-01-01T00:00:00.000Z"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute(
            "INSERT INTO net_discipline_group (discipline_id, canonical_group, "
            "match_method, review_needed, conflict_flag, mapped_at, mapped_by) "
            "VALUES (?, 'open_singles', 'exact', 0, 0, ?, 'net_pipeline')",
            (discipline_id, ts),
        )
        conn.commit()
    finally:
        conn.close()


def _fk_violations(db: Path) -> list:
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        return conn.execute("PRAGMA foreign_key_check").fetchall()
    finally:
        conn.close()


def test_mvfp_loader_rerun_clears_net_discipline_group_before_disciplines(tmp_path: Path) -> None:
    """A populated re-run: a net_discipline_group row references a canonical
    discipline. The loader must clear it before deleting the discipline (no FK
    failure), and its deletion accounting names the row it removed. The net
    pipeline rebuilds the group rows downstream, so a scoped clear here is safe."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    disc = _canonical_discipline_id(db)
    _insert_net_discipline_group(db, disc)
    assert count(db, "net_discipline_group") == 1

    r2 = run(loader)
    assert r2.returncode == 0, (
        f"re-run FK-failed on net_discipline_group.\nstdout: {r2.stdout}\nstderr: {r2.stderr}"
    )
    # The scoped delete cleared the canonical group row; the parent disciplines reseeded.
    assert count(db, "net_discipline_group") == 0
    assert count(db, "event_disciplines") >= 1
    assert _fk_violations(db) == [], "foreign-key check must be clean after the reseed"
    # Honest deletion accounting: the reported count matches the one row removed.
    assert "net_discipline_group: 1" in r2.stdout, (
        f"scoped-delete count for net_discipline_group missing/wrong.\nstdout: {r2.stdout}"
    )


def test_mvfp_loader_rerun_is_fk_safe_on_repeated_group_reseed(tmp_path: Path) -> None:
    """Idempotency under the derived-child clear: inserting the group row before
    each of two runs, both runs complete with a clean foreign-key check and the
    canonical disciplines reseeded (no drift, no orphaned group row)."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    for label in ("first", "second"):
        _insert_net_discipline_group(db, _canonical_discipline_id(db))
        r = run(loader)
        assert r.returncode == 0, f"{label} re-run failed.\nstdout: {r.stdout}\nstderr: {r.stderr}"
        assert _fk_violations(db) == [], f"foreign-key check dirty after {label} re-run"
        assert count(db, "event_disciplines") >= 1
        assert count(db, "net_discipline_group") == 0, (
            f"the scoped clear must remove the canonical group row ({label} run)"
        )


def test_mvfp_loader_rerun_preserves_noncanonical_net_discipline_group(tmp_path: Path) -> None:
    """Scope isolation: a net_discipline_group row whose discipline belongs to an
    app-owned event is outside the loader's ownership and survives the reseed."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    ids = _seed_app_data(db)
    ts = "2024-01-01T00:00:00.000Z"
    app_disc = "disc_app_0001"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute(
            "INSERT INTO event_disciplines (id, created_at, created_by, updated_at, "
            "updated_by, event_id, name, discipline_category) "
            "VALUES (?, ?, ?, ?, ?, ?, 'App Discipline', 'net')",
            (app_disc, ts, ids["member_id"], ts, ids["member_id"], ids["event_id"]),
        )
        conn.execute(
            "INSERT INTO net_discipline_group (discipline_id, canonical_group, "
            "match_method, review_needed, conflict_flag, mapped_at, mapped_by) "
            "VALUES (?, 'open_singles', 'exact', 0, 0, ?, 'net_pipeline')",
            (app_disc, ts),
        )
        conn.commit()
    finally:
        conn.close()

    r2 = run(loader)
    assert r2.returncode == 0, f"re-run failed.\nstdout: {r2.stdout}\nstderr: {r2.stderr}"
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT 1 FROM net_discipline_group WHERE discipline_id = ?", (app_disc,)
        ).fetchone() is not None, "app-owned net_discipline_group row was wrongly deleted"
    finally:
        conn.close()


def test_mvfp_loader_aborts_on_app_selection_referencing_canonical_discipline(tmp_path: Path) -> None:
    """Ownership guard: an app-managed registration_discipline_selections row that
    references a canonical discipline makes the loader abort before any delete, with
    an actionable message, rather than FK-failing or destroying the app selection.
    Nothing is mutated: the selection and the canonical disciplines are intact."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    ids = _seed_app_data(db)  # inserts app event + registration 'reg_app_1'
    disc = _canonical_discipline_id(db)
    disciplines_before = count(db, "event_disciplines")
    ts = "2024-01-01T00:00:00.000Z"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute(
            "INSERT INTO registration_discipline_selections (id, created_at, "
            "created_by, updated_at, updated_by, registration_id, discipline_id) "
            "VALUES ('sel_guard', ?, ?, ?, ?, 'reg_app_1', ?)",
            (ts, ids["member_id"], ts, ids["member_id"], disc),
        )
        conn.commit()
    finally:
        conn.close()

    r = run(loader)
    assert r.returncode != 0, (
        "loader should abort on an app selection referencing a canonical discipline"
    )
    assert (
        "app-managed registration_discipline_selections row references canonical discipline"
        in (r.stdout + r.stderr)
    ), f"missing clear guard error.\nstdout: {r.stdout}\nstderr: {r.stderr}"
    assert count(db, "registration_discipline_selections") == 1  # nothing deleted
    assert count(db, "event_disciplines") == disciplines_before  # abort before any delete
    assert _fk_violations(db) == [], "database left clean after the guarded abort"


# ---------------------------------------------------------------------------
# Loader 13 (net teams): scoped teardown + honest counters
# ---------------------------------------------------------------------------

DBL_PID_A = "aaaaaaaa-1111-1111-1111-111111111111"
DBL_PID_B = "bbbbbbbb-2222-2222-2222-222222222222"


def _person_row(pid: str, name: str) -> dict:
    return {
        "person_id": pid, "person_name": name, "member_id": "",
        "country": "United States", "first_year": "", "last_year": "",
        "event_count": "1", "placement_count": "1", "bap_member": "0",
        "bap_nickname": "", "bap_induction_year": "", "hof_member": "0",
        "hof_induction_year": "", "freestyle_sequences": "", "freestyle_max_add": "",
        "freestyle_unique_tricks": "", "freestyle_diversity_ratio": "",
        "signature_trick_1": "", "signature_trick_2": "", "signature_trick_3": "",
        "source_scope": "CANONICAL",
    }


def build_doubles_seed(seed_dir: Path, with_qc: bool = False) -> Path:
    """A canonical doubles-net entry (two linked participants -> one team). With
    with_qc, also a malformed entry (one participant) that loader 13 flags as a
    wrong_participant_count QC issue without building a team."""
    seed_dir.mkdir(parents=True, exist_ok=True)
    ek, dk = "2001_dbl_test", "open_doubles_net"
    write_csv(
        seed_dir / "seed_events.csv",
        ["event_key", "legacy_event_id", "year", "event_name", "event_slug",
         "start_date", "end_date", "city", "region", "country", "host_club",
         "status", "notes", "source"],
        [{"event_key": ek, "legacy_event_id": ek, "year": "2001",
          "event_name": "Doubles Test Open", "event_slug": "doubles_test_2001",
          "start_date": "2001-01-01", "end_date": "2001-01-02", "city": "Town",
          "region": "State", "country": "United States", "host_club": "",
          "status": "completed", "notes": "", "source": "mirror"}],
    )
    write_csv(
        seed_dir / "seed_event_disciplines.csv",
        ["event_key", "discipline_key", "discipline_name", "discipline_category",
         "team_type", "sort_order", "coverage_flag", "notes"],
        [{"event_key": ek, "discipline_key": dk, "discipline_name": "Open Doubles Net",
          "discipline_category": "net", "team_type": "doubles", "sort_order": "1",
          "coverage_flag": "partial", "notes": ""}],
    )
    results = [{"event_key": ek, "discipline_key": dk, "placement": "1",
                "score_text": "", "notes": "", "source": ""}]
    participants = [
        {"event_key": ek, "discipline_key": dk, "placement": "1",
         "participant_order": "1", "display_name": "Player A",
         "person_id": DBL_PID_A, "notes": ""},
        {"event_key": ek, "discipline_key": dk, "placement": "1",
         "participant_order": "2", "display_name": "Player B",
         "person_id": DBL_PID_B, "notes": ""},
    ]
    if with_qc:
        results.append({"event_key": ek, "discipline_key": dk, "placement": "2",
                        "score_text": "", "notes": "", "source": ""})
        participants.append(
            {"event_key": ek, "discipline_key": dk, "placement": "2",
             "participant_order": "1", "display_name": "Lone Player",
             "person_id": DBL_PID_A, "notes": ""})
    write_csv(
        seed_dir / "seed_event_results.csv",
        ["event_key", "discipline_key", "placement", "score_text", "notes", "source"],
        results,
    )
    write_csv(
        seed_dir / "seed_event_result_participants.csv",
        ["event_key", "discipline_key", "placement", "participant_order",
         "display_name", "person_id", "notes"],
        participants,
    )
    write_csv(
        seed_dir / "seed_persons.csv",
        list(_person_row("", "").keys()),
        [_person_row(DBL_PID_A, "Player A"), _person_row(DBL_PID_B, "Player B")],
    )
    return seed_dir


def _load_canonical_doubles(tmp_path: Path, with_qc: bool = False) -> Path:
    """Build the schema, load the doubles seed via loader 08, return the db path."""
    db = make_db(tmp_path)
    seed_dir = build_doubles_seed(tmp_path / "seed", with_qc=with_qc)
    r = run([
        "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py",
        "--db", str(db), "--seed-dir", str(seed_dir), "--no-backup",
    ])
    assert r.returncode == 0, f"loader 08 setup failed.\n{r.stderr}"
    return db


def _loader13(db: Path) -> list[str]:
    # --qc-out keeps the QC findings artifact beside the temp database. Without
    # it the loader writes into the real legacy_data/out tree, which no test may
    # touch.
    return ["legacy_data/event_results/scripts/13_build_net_teams.py",
            "--db", str(db), "--qc-out", str(db.parent)]


def _qc_findings(db: Path) -> str:
    return (db.parent / "net_team_qc_issues.jsonl").read_text(encoding="utf-8")


def test_net_teams_first_load(tmp_path: Path) -> None:
    """Loader 13 builds one team, two members and one canonical appearance from a
    doubles-net entry."""
    db = _load_canonical_doubles(tmp_path)
    assert run(_loader13(db)).returncode == 0
    assert count(db, "net_team") == 1
    assert count(db, "net_team_member") == 2
    assert count(db, "net_team_appearance") == 1


def test_net_teams_rerun_idempotent(tmp_path: Path) -> None:
    """A re-run leaves the team / member / appearance counts unchanged."""
    db = _load_canonical_doubles(tmp_path)
    assert run(_loader13(db)).returncode == 0
    first = {t: count(db, t) for t in ("net_team", "net_team_member", "net_team_appearance")}
    assert run(_loader13(db)).returncode == 0
    second = {t: count(db, t) for t in ("net_team", "net_team_member", "net_team_appearance")}
    assert first == second, f"counts changed on re-run: {first} -> {second}"
    assert first["net_team"] == 1


def test_net_teams_rerun_preserves_curated_appearance(tmp_path: Path) -> None:
    """A curated appearance (and the team/members it references) survives a
    re-run; the teardown no longer blocks on the foreign key it holds."""
    db = _load_canonical_doubles(tmp_path)
    assert run(_loader13(db)).returncode == 0
    ts = "2024-01-01T00:00:00.000Z"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        re_id, ev_id, disc_id = conn.execute(
            "SELECT id, event_id, discipline_id FROM event_result_entries LIMIT 1"
        ).fetchone()
        for pid, name in (("cccccccc-3333-3333-3333-333333333333", "Player C"),
                          ("dddddddd-4444-4444-4444-444444444444", "Player D")):
            conn.execute(
                "INSERT INTO historical_persons (person_id, person_name, country, "
                "source_scope, event_count, placement_count, bap_member, hof_member, "
                "hof_induction_year) VALUES (?, ?, 'US', 'CANONICAL', 1, 1, 0, 0, NULL)",
                (pid, name),
            )
        t2 = "team_curated_0001"
        conn.execute(
            "INSERT INTO net_team (team_id, person_id_a, person_id_b, appearance_count, "
            "created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
            (t2, "cccccccc-3333-3333-3333-333333333333",
             "dddddddd-4444-4444-4444-444444444444", ts, ts),
        )
        conn.execute("INSERT INTO net_team_member (id, team_id, person_id, position) "
                     "VALUES ('m_c_a', ?, 'cccccccc-3333-3333-3333-333333333333', 'a')", (t2,))
        conn.execute("INSERT INTO net_team_member (id, team_id, person_id, position) "
                     "VALUES ('m_c_b', ?, 'dddddddd-4444-4444-4444-444444444444', 'b')", (t2,))
        conn.execute(
            "INSERT INTO net_team_appearance (id, team_id, event_id, discipline_id, "
            "result_entry_id, placement, score_text, event_year, evidence_class, "
            "extracted_at) VALUES ('app_curated_1', ?, ?, ?, ?, 1, '', 2001, "
            "'curated_enrichment', ?)",
            (t2, ev_id, disc_id, re_id, ts),
        )
        conn.commit()
    finally:
        conn.close()
    r2 = run(_loader13(db))
    assert r2.returncode == 0, f"re-run blocked on curated data.\n{r2.stderr}"
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT 1 FROM net_team_appearance WHERE id = 'app_curated_1'"
        ).fetchone() is not None, "curated appearance was deleted"
        assert conn.execute(
            "SELECT 1 FROM net_team WHERE team_id = 'team_curated_0001'"
        ).fetchone() is not None, "curated team was deleted"
        assert conn.execute(
            "SELECT COUNT(*) FROM net_team_member WHERE team_id = 'team_curated_0001'"
        ).fetchone()[0] == 2, "curated team members were deleted"
        # The canonical team was still reseeded.
        assert conn.execute(
            "SELECT COUNT(*) FROM net_team_appearance WHERE evidence_class = 'canonical_only'"
        ).fetchone()[0] == 1
    finally:
        conn.close()


def test_net_teams_qc_findings_reported_to_artifact_not_database(tmp_path: Path) -> None:
    """A malformed entry is reported as a QC finding in the artifact, and the
    loader writes no review table to hold it."""
    import json as _json
    db = _load_canonical_doubles(tmp_path, with_qc=True)
    r = run(_loader13(db))
    assert r.returncode == 0
    findings = [_json.loads(line) for line in _qc_findings(db).splitlines() if line.strip()]
    assert any(f["check_id"] == "wrong_participant_count" for f in findings), findings
    # Every finding carries what a reviewer needs to act without the database.
    for f in findings:
        assert f["priority"] and f["severity"] and f["message"]
    # The review table the findings used to land in is retired, so the schema
    # this database was built from must not carry it.
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'net_review_queue'"
        ).fetchone() is None
    finally:
        conn.close()


def test_net_teams_qc_artifact_is_byte_identical_on_rerun(tmp_path: Path) -> None:
    """Rerunning over unchanged data reproduces the artifact exactly, so a diff
    means the data moved rather than that the loader ran again."""
    import json as _json
    import time as _time
    db = _load_canonical_doubles(tmp_path, with_qc=True)
    assert run(_loader13(db)).returncode == 0
    first = _qc_findings(db)
    assert first.strip(), "expected at least one finding to compare"
    # No finding may carry a value taken from the run rather than from the data.
    # A wall-clock field would make two runs in the same second agree and two
    # runs either side of a tick disagree, which is a comparison that passes by
    # luck. Sleeping past a tick is what turns that into a real check.
    for finding in (_json.loads(line) for line in first.splitlines() if line.strip()):
        assert not [k for k in finding if k.endswith("_at")], finding
    _time.sleep(1.1)
    assert run(_loader13(db)).returncode == 0
    assert _qc_findings(db) == first


# ---------------------------------------------------------------------------
# Loader 17 (trick dictionary)
# ---------------------------------------------------------------------------

def _write_trick_dictionary_inputs(tmp_path: Path) -> list[str]:
    """The 17-loader inputs: one base trick, one modifier, one alias pointing at
    the base trick. Returns the loader arg flags for the three CSVs."""
    tricks = write_csv(
        tmp_path / "tricks.csv",
        ["trick_canon", "adds", "base_trick", "category", "aliases", "notes"],
        [{"trick_canon": "clipper", "adds": "1", "base_trick": "clipper",
          "category": "body", "aliases": "", "notes": "Body kick into clipper."}],
    )
    mods = write_csv(
        tmp_path / "trick_modifiers.csv",
        ["modifier", "add_bonus", "add_bonus_rotational", "modifier_type", "notes"],
        [{"modifier": "paradox", "add_bonus": "1", "add_bonus_rotational": "1",
          "modifier_type": "body", "notes": ""}],
    )
    aliases = write_csv(
        tmp_path / "trick_aliases.csv",
        ["alias", "trick_canon"],
        [{"alias": "clip", "trick_canon": "clipper"}],
    )
    return ["--tricks-csv", str(tricks), "--modifiers-csv", str(mods),
            "--aliases-csv", str(aliases)]


def test_trick_dictionary_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    loader = [
        "freestyle/loaders/17_load_trick_dictionary.py",
        "--db", str(db),
        *_write_trick_dictionary_inputs(tmp_path),
    ]
    n = assert_idempotent(db, loader, "freestyle_tricks")
    assert n >= 1


def test_red_additions_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    # The red-additions loader upserts onto the dictionary the 17-loader builds,
    # so seed the base dictionary first (same order as the real pipeline).
    setup = run([
        "freestyle/loaders/17_load_trick_dictionary.py",
        "--db", str(db),
        *_write_trick_dictionary_inputs(tmp_path),
    ])
    assert setup.returncode == 0, f"17 setup failed.\nstderr: {setup.stderr}"
    base = count(db, "freestyle_tricks")

    additions = write_csv(
        tmp_path / "red_additions.csv",
        ["canonical_name", "adds", "base_trick", "category", "aliases",
         "modifier_links", "description", "review_status", "is_active", "review_note"],
        [{"canonical_name": "idem-paradox-clipper", "adds": "2",
          "base_trick": "clipper", "category": "body", "aliases": "",
          "modifier_links": "", "description": "Paradox into clipper.",
          "review_status": "approved", "is_active": "1", "review_note": ""}],
    )
    corrections = write_csv(
        tmp_path / "red_corrections.csv",
        ["slug", "field", "old_value", "new_value", "source_note"], [],
    )
    loader = [
        "freestyle/loaders/19_load_red_additions.py",
        "--db", str(db),
        "--additions-csv", str(additions),
        "--corrections-csv", str(corrections),
    ]
    n = assert_idempotent(db, loader, "freestyle_tricks")
    assert n == base + 1


def test_red_additions_loader_scoped_delete_preserves_other_source_aliases(tmp_path: Path) -> None:
    """Loader 19's alias DELETE is scoped to source_id='red-husted-2026-04-20', so
    aliases owned by another source (loader 17's 'curated-v1') survive a
    red-additions run and re-run rather than being wiped."""
    db = make_db(tmp_path)
    # Loader 17 builds the base dictionary, including the 'clip' -> 'clipper' alias
    # scoped to source_id='curated-v1'.
    setup = run([
        "freestyle/loaders/17_load_trick_dictionary.py",
        "--db", str(db),
        *_write_trick_dictionary_inputs(tmp_path),
    ])
    assert setup.returncode == 0, f"17 setup failed.\nstderr: {setup.stderr}"

    def alias_count(source_id: str) -> int:
        conn = sqlite3.connect(db)
        try:
            return conn.execute(
                "SELECT COUNT(*) FROM freestyle_trick_aliases WHERE source_id = ?",
                (source_id,),
            ).fetchone()[0]
        finally:
            conn.close()

    curated_before = alias_count("curated-v1")
    assert curated_before >= 1, "expected loader 17 to seed a curated-v1 alias"

    # A red-additions row carrying its own alias, so loader 19 exercises its scoped
    # alias DELETE + INSERT (source_id='red-husted-2026-04-20').
    additions = write_csv(
        tmp_path / "red_additions.csv",
        ["canonical_name", "adds", "base_trick", "category", "aliases",
         "modifier_links", "description", "review_status", "is_active", "review_note"],
        [{"canonical_name": "scoped-red-trick", "adds": "2",
          "base_trick": "clipper", "category": "body", "aliases": "srt",
          "modifier_links": "", "description": "A red trick with an alias.",
          "review_status": "approved", "is_active": "1", "review_note": ""}],
    )
    corrections = write_csv(
        tmp_path / "red_corrections.csv",
        ["slug", "field", "old_value", "new_value", "source_note"], [],
    )
    loader = [
        "freestyle/loaders/19_load_red_additions.py",
        "--db", str(db),
        "--additions-csv", str(additions),
        "--corrections-csv", str(corrections),
    ]

    # Run twice: the second run's scoped DELETE actually removes and re-inserts
    # Red's own aliases, proving the delete fires while the curated-v1 alias is
    # never in its scope.
    for label in ("first", "second"):
        r = run(loader)
        assert r.returncode == 0, f"19 {label} run failed.\nstderr: {r.stderr}"
        assert alias_count("curated-v1") == curated_before, (
            f"the curated-v1 alias must survive the red-scoped delete ({label} run)"
        )
        assert alias_count("red-husted-2026-04-20") >= 1, (
            f"loader 19's own scoped alias insert must land ({label} run)"
        )


# Synthetic-fixture cases for the seed loaders that previously hardcoded their
# input paths; each now takes an input-path override flag (default unchanged), so
# the loader reads a tmp_path fixture here and never a real-data tree.

CLUBS_HEADER = ["legacy_club_key", "name", "city", "region", "country",
                "contact_member_id", "external_url",
                "description", "created", "last_updated"]
CLUB_MEMBERS_HEADER = ["legacy_club_key", "mirror_member_id", "display_name", "alias"]


def _one_club_row() -> dict:
    return {"legacy_club_key": "idem-club-1", "name": "Idem Club", "city": "Town",
            "region": "State", "country": "United States",
            "contact_member_id": "", "external_url": "", "description": "A club.",
            "created": "", "last_updated": ""}


def test_consecutive_records_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    src = write_csv(
        tmp_path / "consecutives.csv",
        ["section", "subsection", "sort_order", "category", "division", "year",
         "rank", "person_or_team", "partner", "score", "note", "event_date",
         "event_name", "location"],
        [{"section": "Singles", "subsection": "Open", "sort_order": "1",
          "category": "consecutive", "division": "open", "year": "2010",
          "rank": "1", "person_or_team": "Idem Player", "partner": "",
          "score": "100", "note": "", "event_date": "2010-01-01",
          "event_name": "Idem Open", "location": "Town"}],
    )
    loader = [
        "freestyle/loaders/11_load_consecutive_records_to_sqlite.py",
        "--db", str(db),
        "--source-csv", str(src),
    ]
    n = assert_idempotent(db, loader, "consecutive_kicks_records")
    assert n >= 1

    # Durable-identity shape: every row carries a stable surrogate id and
    # created/updated timestamps, with sort_order retained as a unique display
    # position rather than the identity. (The id is regenerated on each load, so
    # idempotency is asserted on row count and shape, not on id equality.)
    conn = sqlite3.connect(db)
    try:
        rows = conn.execute(
            "SELECT id, sort_order, created_at, updated_at FROM consecutive_kicks_records"
        ).fetchall()
    finally:
        conn.close()
    assert len(rows) == n
    for rid, sort_order, created, updated in rows:
        assert isinstance(rid, str) and rid, "each row needs a non-empty surrogate id"
        assert sort_order is not None
        assert created and updated, "created_at and updated_at must be stamped"
    sort_orders = [r[1] for r in rows]
    assert len(sort_orders) == len(set(sort_orders)), "sort_order must stay unique"


def test_clubs_seed_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    clubs = write_csv(tmp_path / "clubs.csv", CLUBS_HEADER, [_one_club_row()])
    # Empty verdicts file: no URL verdict for the club, which the loader handles.
    verdicts = write_csv(
        tmp_path / "verdicts.csv",
        ["legacy_club_key", "external_url", "validated_at", "quarantine_reason"], [],
    )
    loader = [
        "legacy_data/scripts/load_clubs_seed.py",
        "--db", str(db),
        "--clubs-csv", str(clubs),
        "--verdicts-csv", str(verdicts),
    ]
    n = assert_idempotent(db, loader, "clubs")
    assert n >= 1


def test_club_members_seed_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    clubs = write_csv(tmp_path / "cm_clubs.csv", CLUBS_HEADER, [_one_club_row()])
    verdicts = write_csv(
        tmp_path / "cm_verdicts.csv",
        ["legacy_club_key", "external_url", "validated_at", "quarantine_reason"], [],
    )
    members = write_csv(
        tmp_path / "club_members.csv", CLUB_MEMBERS_HEADER,
        [{"legacy_club_key": "idem-club-1", "mirror_member_id": "m-1",
          "display_name": "Idem Player", "alias": ""}],
    )
    no_persons = write_csv(tmp_path / "cm_persons.csv",
                           ["person_id", "person_name", "member_id"], [])
    # Same order as the real pipeline: the candidate loader skips any club absent
    # from the clubs table (and keys club_id off the same stable_id the clubs
    # loader writes), and the unmatched-affiliation insert references
    # legacy_members by mirror_member_id, so both must be seeded first.
    for setup_args in (
        ["legacy_data/scripts/load_clubs_seed.py", "--db", str(db),
         "--clubs-csv", str(clubs), "--verdicts-csv", str(verdicts)],
        ["legacy_data/scripts/load_legacy_members_seed.py", "--db", str(db),
         "--club-members-csv", str(members), "--persons-csv", str(no_persons)],
    ):
        setup = run(setup_args)
        assert setup.returncode == 0, f"setup failed: {setup_args[0]}\nstderr: {setup.stderr}"

    loader = [
        "legacy_data/scripts/load_club_members_seed.py",
        "--db", str(db),
        "--clubs-csv", str(clubs),
        "--members-csv", str(members),
    ]
    n = assert_idempotent(db, loader, "legacy_club_candidates")
    assert n >= 1


def test_legacy_members_seed_loader_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    members = write_csv(
        tmp_path / "lm_club_members.csv", CLUB_MEMBERS_HEADER,
        [{"legacy_club_key": "idem-club-1", "mirror_member_id": "m-1",
          "display_name": "Idem Player", "alias": ""}],
    )
    # Header-only persons file: the club_members rows alone yield legacy_members,
    # so no person gap-fill is needed to get a non-empty target.
    persons = write_csv(
        tmp_path / "lm_persons.csv",
        ["person_id", "person_name", "member_id"], [],
    )
    loader = [
        "legacy_data/scripts/load_legacy_members_seed.py",
        "--db", str(db),
        "--club-members-csv", str(members),
        "--persons-csv", str(persons),
    ]
    n = assert_idempotent(db, loader, "legacy_members")
    assert n >= 1


# ---------------------------------------------------------------------------
# Loader 08 historical_persons: stable-id upsert with guarded removal
# ---------------------------------------------------------------------------
# Canonical persons carry a stable person_id that app claims, enrichment
# affiliations, freestyle records and net teams reference. Loader 08 reconciles
# them by upsert (never delete-and-recreate), refreshing only loader-owned
# columns, deleting a dropped person only when nothing references it, and
# aborting on a dropped-but-referenced person. Net-team teardown stays with the
# net-team loader.

TS08 = "2024-01-01T00:00:00.000Z"


def _canonical_person_ids(db: Path) -> set:
    conn = sqlite3.connect(db)
    try:
        return {
            r[0] for r in conn.execute(
                "SELECT person_id FROM historical_persons "
                "WHERE source_scope = 'CANONICAL' OR source_scope IS NULL"
            )
        }
    finally:
        conn.close()


def _person_field(db: Path, pid: str, col: str):
    conn = sqlite3.connect(db)
    try:
        row = conn.execute(
            f"SELECT {col} FROM historical_persons WHERE person_id = ?", (pid,)
        ).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def _set_seed_person_country(seed_dir: Path, pid: str, country: str) -> None:
    """Rewrite one seed person's country (a loader-owned column) so a re-run can
    prove the upsert refreshes owned fields in place."""
    path = seed_dir / "seed_persons.csv"
    with path.open(newline="") as f:
        rows = list(csv.DictReader(f))
    fields = list(rows[0].keys())
    for r in rows:
        if r["person_id"] == pid:
            r["country"] = country
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def _add_member_claim(conn, pid: str, member_id: str) -> None:
    # A system member with its credential columns left NULL satisfies the members
    # CHECK; this mirrors the real system-account -> historical_person link.
    conn.execute(
        "INSERT INTO members (id, created_at, created_by, updated_at, updated_by, "
        "real_name, display_name, display_name_normalized, is_system, historical_person_id) "
        "VALUES (?, ?, ?, ?, ?, 'Claim Member', 'Claim Member', 'claim member', 1, ?)",
        (member_id, TS08, member_id, TS08, member_id, pid),
    )


def _add_affiliation(conn, pid: str, suffix: str) -> None:
    cand = f"cand_{suffix}"
    conn.execute(
        "INSERT INTO legacy_club_candidates (id, created_at, created_by, updated_at, "
        "updated_by, legacy_club_key, display_name, classification) "
        "VALUES (?, ?, 'seed', ?, 'seed', ?, 'Club', 'dormant')",
        (cand, TS08, TS08, f"key_{suffix}"),
    )
    conn.execute(
        "INSERT INTO legacy_person_club_affiliations (id, created_at, created_by, "
        "updated_at, updated_by, historical_person_id, legacy_club_candidate_id, "
        "inferred_role) VALUES (?, ?, 'seed', ?, 'seed', ?, ?, 'member')",
        (f"aff_{suffix}", TS08, TS08, pid, cand),
    )


def _add_freestyle_record(conn, pid: str, suffix: str) -> None:
    conn.execute(
        "INSERT INTO freestyle_records (id, record_type, person_id, source, confidence, "
        "created_at, updated_at) VALUES (?, 'consecutive', ?, 'test', 'verified', ?, ?)",
        (f"fsr_{suffix}", pid, TS08, TS08),
    )


def _add_net_team(conn, pid_a: str, pid_b: str, suffix: str) -> str:
    a, b = sorted([pid_a, pid_b])
    team = f"team_{suffix}"
    conn.execute(
        "INSERT INTO net_team (team_id, person_id_a, person_id_b, appearance_count, "
        "created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
        (team, a, b, TS08, TS08),
    )
    conn.execute("INSERT INTO net_team_member (id, team_id, person_id, position) "
                 "VALUES (?, ?, ?, 'a')", (f"{team}_ma", team, a))
    conn.execute("INSERT INTO net_team_member (id, team_id, person_id, position) "
                 "VALUES (?, ?, ?, 'b')", (f"{team}_mb", team, b))
    return team


def test_mvfp_loader_upsert_preserves_referenced_person(tmp_path: Path) -> None:
    """A canonical person referenced by a member claim, a club affiliation, a
    freestyle record and a net team survives a reseed: the loader upserts it in
    place, its owned columns refresh from the seed, its non-owned columns (aliases,
    notes, source, is_deceased) are preserved, and every reference stays valid."""
    db = make_db(tmp_path)
    seed_dir = build_doubles_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    assert run(_loader13(db)).returncode == 0  # real net_team(A, B)
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        _add_member_claim(conn, DBL_PID_A, "mem_persist")
        _add_affiliation(conn, DBL_PID_A, "persist")
        _add_freestyle_record(conn, DBL_PID_A, "persist")
        conn.execute(
            "UPDATE historical_persons SET aliases='KEEP_ALIAS', notes='KEEP_NOTES', "
            "source='KEEP_SRC', is_deceased=1 WHERE person_id=?", (DBL_PID_A,)
        )
        conn.commit()
    finally:
        conn.close()

    _set_seed_person_country(seed_dir, DBL_PID_A, "Canada")
    r = run(loader)
    assert r.returncode == 0, (
        f"reseed failed with a referenced persisting person.\n{r.stdout}\n{r.stderr}"
    )
    assert count(db, "net_team") == 1
    assert count(db, "net_team_member") == 2
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT 1 FROM members WHERE historical_person_id=?", (DBL_PID_A,)
        ).fetchone(), "member claim lost"
        assert conn.execute(
            "SELECT 1 FROM legacy_person_club_affiliations WHERE historical_person_id=?",
            (DBL_PID_A,)
        ).fetchone(), "affiliation lost"
        assert conn.execute(
            "SELECT 1 FROM freestyle_records WHERE person_id=?", (DBL_PID_A,)
        ).fetchone(), "freestyle record lost"
    finally:
        conn.close()
    assert _person_field(db, DBL_PID_A, "country") == "Canada", "owned column did not refresh"
    assert _person_field(db, DBL_PID_A, "aliases") == "KEEP_ALIAS"
    assert _person_field(db, DBL_PID_A, "notes") == "KEEP_NOTES"
    assert _person_field(db, DBL_PID_A, "source") == "KEEP_SRC"
    assert _person_field(db, DBL_PID_A, "is_deceased") == 1
    assert _fk_violations(db) == []


def test_mvfp_loader_upsert_inserts_new_person(tmp_path: Path) -> None:
    """A seed person id absent from the database inserts normally."""
    db = make_db(tmp_path)
    seed_dir = build_mvfp_seed(tmp_path / "seed")
    assert SEED_PID not in _canonical_person_ids(db)
    assert run(_mvfp_loader_args(db, seed_dir)).returncode == 0
    assert SEED_PID in _canonical_person_ids(db)


def test_mvfp_loader_deletes_removed_unreferenced_person(tmp_path: Path) -> None:
    """A canonical person that drops out of the seed and is referenced nowhere is
    deleted by the reseed."""
    db = make_db(tmp_path)
    v1 = build_doubles_seed(tmp_path / "seed_v1")
    assert run(_mvfp_loader_args(db, v1)).returncode == 0
    assert {DBL_PID_A, DBL_PID_B} <= _canonical_person_ids(db)

    v2 = build_mvfp_seed(tmp_path / "seed_v2")  # a different single person
    r = run(_mvfp_loader_args(db, v2))
    assert r.returncode == 0, f"{r.stdout}\n{r.stderr}"
    remaining = _canonical_person_ids(db)
    assert DBL_PID_A not in remaining and DBL_PID_B not in remaining
    assert SEED_PID in remaining
    assert _fk_violations(db) == []


def test_mvfp_loader_aborts_on_removed_referenced_person(tmp_path: Path) -> None:
    """A canonical person that drops out of the seed but is still referenced by an
    app claim and a net team makes the loader abort before any mutation, naming
    both referencers, and leaves every fingerprint unchanged."""
    db = make_db(tmp_path)
    v1 = build_doubles_seed(tmp_path / "seed_v1")
    assert run(_mvfp_loader_args(db, v1)).returncode == 0
    assert run(_loader13(db)).returncode == 0  # net_team(A, B): derived-loader ref
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        _add_member_claim(conn, DBL_PID_A, "mem_removed")  # app-owned ref
        conn.commit()
    finally:
        conn.close()

    watched = ("historical_persons", "net_team", "net_team_member", "members")
    before = {t: count(db, t) for t in watched}
    v2 = build_mvfp_seed(tmp_path / "seed_v2")  # drops A and B
    r = run(_mvfp_loader_args(db, v2))
    assert r.returncode != 0, "loader must abort on a removed-but-referenced person"
    out = r.stdout + r.stderr
    assert "absent from the seed are still referenced" in out, f"missing guard message.\n{out}"
    assert "net_team" in out and "members" in out, "abort must name derived + app referencers"
    after = {t: count(db, t) for t in watched}
    assert before == after, f"aborted reseed mutated state: {before} -> {after}"
    assert _fk_violations(db) == []


def _set_hand_set_person_values(db: Path, assignments: dict) -> None:
    """Write the columns no seed file carries and the canonical loader never
    writes, standing in for an administrator setting them by hand."""
    conn = sqlite3.connect(db)
    try:
        for pid, columns in assignments.items():
            for column, value in columns.items():
                conn.execute(
                    f"UPDATE historical_persons SET {column} = ? WHERE person_id = ?",
                    (value, pid),
                )
        conn.commit()
    finally:
        conn.close()


def test_mvfp_loader_aborts_on_removed_person_with_hand_set_values(tmp_path: Path) -> None:
    """A canonical person that drops out of the seed and is referenced nowhere, but
    carries a value no seed file holds, makes the loader abort before any mutation,
    naming each person and the value it would otherwise have dropped, and leaves
    every fingerprint unchanged. The deceased flag is the case that reaches members:
    it is what closes a historical record to self-claiming."""
    db = make_db(tmp_path)
    v1 = build_doubles_seed(tmp_path / "seed_v1")
    assert run(_mvfp_loader_args(db, v1)).returncode == 0
    _set_hand_set_person_values(db, {
        DBL_PID_A: {"is_deceased": 1},
        DBL_PID_B: {"notes": "memorial handling requested"},
    })

    watched = ("historical_persons", "events", "event_result_entry_participants")
    before = {t: count(db, t) for t in watched}
    v2 = build_mvfp_seed(tmp_path / "seed_v2")  # drops A and B
    r = run(_mvfp_loader_args(db, v2))
    assert r.returncode != 0, "loader must abort on a removed person carrying hand-set values"
    out = r.stdout + r.stderr
    assert "carry hand-set values" in out, f"missing guard message.\n{out}"
    assert DBL_PID_A in out and "is_deceased" in out, "abort must name the deceased record"
    assert DBL_PID_B in out and "notes" in out, "abort must name the annotated record"
    after = {t: count(db, t) for t in watched}
    assert before == after, f"aborted reseed mutated state: {before} -> {after}"
    assert _person_field(db, DBL_PID_A, "is_deceased") == 1
    assert _fk_violations(db) == []


def test_mvfp_loader_deceased_flag_survives_seed_drop_and_return(tmp_path: Path) -> None:
    """The durability contract end to end: a hand-set deceased flag survives the
    person leaving the seed and coming back. The reseed that would have deleted the
    person refuses, and once the person is back in the seed the reseed succeeds with
    the flag still set."""
    db = make_db(tmp_path)
    v1 = build_doubles_seed(tmp_path / "seed_v1")
    loader_v1 = _mvfp_loader_args(db, v1)
    assert run(loader_v1).returncode == 0
    _set_hand_set_person_values(db, {DBL_PID_A: {"is_deceased": 1}})

    v2 = build_mvfp_seed(tmp_path / "seed_v2")  # drops A
    assert run(_mvfp_loader_args(db, v2)).returncode != 0
    assert DBL_PID_A in _canonical_person_ids(db), "aborted reseed must leave the person in place"

    r = run(loader_v1)  # the person is back in the seed
    assert r.returncode == 0, f"reseed failed with the person restored.\n{r.stdout}\n{r.stderr}"
    assert DBL_PID_A in _canonical_person_ids(db)
    assert _person_field(db, DBL_PID_A, "is_deceased") == 1, (
        "deceased flag lost across a seed drop-and-return"
    )
    assert _fk_violations(db) == []


def test_mvfp_loader_deletes_removed_person_with_blank_hand_set_columns(tmp_path: Path) -> None:
    """Blank is not a hand-set value. A removed person whose administrator columns
    hold the default flag, an empty note and whitespace-only aliases is still
    deleted, so the guard cannot freeze ordinary reconciliation."""
    db = make_db(tmp_path)
    v1 = build_doubles_seed(tmp_path / "seed_v1")
    assert run(_mvfp_loader_args(db, v1)).returncode == 0
    _set_hand_set_person_values(db, {
        DBL_PID_A: {"is_deceased": 0, "notes": "", "aliases": "   "},
        DBL_PID_B: {"source": ""},
    })

    v2 = build_mvfp_seed(tmp_path / "seed_v2")  # drops A and B
    r = run(_mvfp_loader_args(db, v2))
    assert r.returncode == 0, f"{r.stdout}\n{r.stderr}"
    remaining = _canonical_person_ids(db)
    assert DBL_PID_A not in remaining and DBL_PID_B not in remaining
    assert _fk_violations(db) == []


def test_mvfp_loader_upsert_preserves_curated_team(tmp_path: Path) -> None:
    """The essential #200 case: a curated net team whose two members are canonical
    persons survives a normal reseed while those persons remain in the seed. The
    curated appearance rides an app-owned result entry the loader never touches."""
    db = make_db(tmp_path)
    seed_dir = build_doubles_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0  # A, B become canonical persons
    ids = _seed_app_data(db)
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        disc, entry = "disc_curated_app", "entry_curated_app"
        conn.execute(
            "INSERT INTO event_disciplines (id, created_at, created_by, updated_at, "
            "updated_by, event_id, name, discipline_category) "
            "VALUES (?, ?, ?, ?, ?, ?, 'Curated Net', 'net')",
            (disc, TS08, ids["member_id"], TS08, ids["member_id"], ids["event_id"]),
        )
        conn.execute(
            "INSERT INTO event_result_entries (id, created_at, created_by, updated_at, "
            "updated_by, event_id, discipline_id, placement) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            (entry, TS08, ids["member_id"], TS08, ids["member_id"], ids["event_id"], disc),
        )
        team = _add_net_team(conn, DBL_PID_A, DBL_PID_B, "curated")
        conn.execute(
            "INSERT INTO net_team_appearance (id, team_id, event_id, discipline_id, "
            "result_entry_id, placement, event_year, evidence_class, extracted_at) "
            "VALUES (?, ?, ?, ?, ?, 1, 2001, 'curated_enrichment', ?)",
            (f"app_{team}", team, ids["event_id"], disc, entry, TS08),
        )
        conn.commit()
    finally:
        conn.close()

    r = run(loader)  # A, B remain in the seed
    assert r.returncode == 0, f"reseed failed with a curated team present.\n{r.stdout}\n{r.stderr}"
    conn = sqlite3.connect(db)
    try:
        assert conn.execute(
            "SELECT 1 FROM net_team WHERE team_id='team_curated'"
        ).fetchone(), "curated team was deleted"
        assert conn.execute(
            "SELECT 1 FROM net_team_appearance WHERE evidence_class='curated_enrichment'"
        ).fetchone(), "curated appearance was deleted"
    finally:
        conn.close()
    assert {DBL_PID_A, DBL_PID_B} <= _canonical_person_ids(db)
    assert _fk_violations(db) == []


EV_LEDGER_COLUMNS = [
    "submitted_name", "normalized_name", "proposed_formula", "matched_existing_object",
    "match_type", "ev_state", "hold_kind", "failure_class", "final_disposition",
    "blocker_subtype", "residual_home", "confidence", "source", "note",
    "object_type", "evidence_state", "blocker_id", "owner",
]


def _ev_ledger_row(name: str, normalized: str, **over) -> dict:
    row = {c: "" for c in EV_LEDGER_COLUMNS}
    row.update({
        "submitted_name": name, "normalized_name": normalized,
        "ev_state": "doctrine", "final_disposition": "C",
        "evidence_state": "compositional-name-only", "object_type": "complete-trick",
        "owner": "james+red", "confidence": "high", "source": "SG",
    })
    row.update(over)
    return row


def test_ev_adjudication_loader_idempotent_and_deterministic(tmp_path: Path) -> None:
    """A reseed of the Emerging Vocabulary rulings reproduces the table exactly.

    Row count alone is too weak for this loader: the equivalence gate compares a
    rebuilt database against committed generated content, so the surrogate ids and
    the recorded order have to come back the same as well, not merely the same
    number of rows.
    """
    db = make_db(tmp_path)
    ledger = write_csv(
        tmp_path / "ev_ledger.csv",
        EV_LEDGER_COLUMNS,
        [_ev_ledger_row("Idem Blurry Whirl", "idemblurrywhirl"),
         _ev_ledger_row("Idem Spinning Osis", "idemspinningosis")],
    )
    loader = [
        "freestyle/loaders/28_load_ev_adjudications.py",
        "--db", str(db),
        "--ledger-csv", str(ledger),
    ]

    def snapshot() -> list:
        conn = sqlite3.connect(db)
        try:
            return conn.execute(
                "SELECT candidate_id, sequence_no, normalized_name, published_trick_slug "
                "FROM freestyle_ev_adjudications ORDER BY sequence_no"
            ).fetchall()
        finally:
            conn.close()

    n = assert_idempotent(db, loader, "freestyle_ev_adjudications")
    assert n == 2
    first = snapshot()
    assert run(loader).returncode == 0
    assert snapshot() == first, "a reseed changed the ids or the recorded order"


def test_ev_adjudication_loader_refuses_a_link_to_a_trick_that_does_not_exist(
    tmp_path: Path,
) -> None:
    """A ruling naming a missing trick row aborts the seed instead of dropping the link.

    Losing the link silently is the failure this refusal exists to prevent: it is
    the durable statement that a ruling and a trick row are about the same name.
    """
    db = make_db(tmp_path)
    ledger = write_csv(
        tmp_path / "ev_ledger.csv",
        EV_LEDGER_COLUMNS,
        [_ev_ledger_row("Idem Linked Name", "idemlinkedname",
                        note="external-db-row slug=no_such_trick_row")],
    )
    result = run([
        "freestyle/loaders/28_load_ev_adjudications.py",
        "--db", str(db),
        "--ledger-csv", str(ledger),
    ])
    assert result.returncode != 0
    assert "no_such_trick_row" in result.stderr
    assert count(db, "freestyle_ev_adjudications") == 0


def test_ev_adjudication_loader_refuses_a_ledger_it_cannot_seed_faithfully(
    tmp_path: Path,
) -> None:
    """Two rulings for one name, a ruling missing a field it cannot be read
    without, and a ledger missing a column are all refusals before any write.

    Each would otherwise land a record that is quietly not the ledger: one ruling
    silently winning over another, an unreadable adjudication, or a column of
    empty strings where the curator's decisions were.
    """
    good = _ev_ledger_row("Idem Good Name", "idemgoodname")

    duplicate = write_csv(
        tmp_path / "duplicate.csv", EV_LEDGER_COLUMNS,
        [good, _ev_ledger_row("Idem Good Name (again)", "idemgoodname")],
    )
    empty_field = write_csv(
        tmp_path / "empty_field.csv", EV_LEDGER_COLUMNS,
        [_ev_ledger_row("Idem Ownerless", "idemownerless", owner="")],
    )
    missing_column = write_csv(
        tmp_path / "missing_column.csv",
        [c for c in EV_LEDGER_COLUMNS if c != "residual_home"],
        [{k: v for k, v in good.items() if k != "residual_home"}],
    )

    for ledger, expected in ((duplicate, "idemgoodname"),
                             (empty_field, "owner"),
                             (missing_column, "residual_home")):
        db_dir = tmp_path / f"db-{ledger.stem}"
        db_dir.mkdir()
        db = make_db(db_dir)
        result = run([
            "freestyle/loaders/28_load_ev_adjudications.py",
            "--db", str(db),
            "--ledger-csv", str(ledger),
        ])
        assert result.returncode != 0, f"{ledger.name} was accepted"
        assert expected in result.stderr, f"{ledger.name}: {result.stderr}"
        # An operator has to be told what is wrong with the ledger, so the
        # refusal is a message naming it rather than a stack trace.
        assert result.stderr.startswith("ERROR:"), f"{ledger.name}: {result.stderr}"
        assert "Traceback" not in result.stderr, f"{ledger.name}: {result.stderr}"
        assert count(db, "freestyle_ev_adjudications") == 0


def test_mvfp_loader_upsert_idempotent_with_references(tmp_path: Path) -> None:
    """Two reseeds against a fixture holding a net team and an app claim leave the
    canonical-person and reference counts identical, with a clean FK check."""
    db = make_db(tmp_path)
    seed_dir = build_doubles_seed(tmp_path / "seed")
    loader = _mvfp_loader_args(db, seed_dir)
    assert run(loader).returncode == 0
    assert run(_loader13(db)).returncode == 0
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        _add_member_claim(conn, DBL_PID_A, "mem_idem")
        conn.commit()
    finally:
        conn.close()

    watched = ("historical_persons", "net_team", "net_team_member", "members")
    assert run(loader).returncode == 0
    first = {t: count(db, t) for t in watched}
    assert run(loader).returncode == 0
    second = {t: count(db, t) for t in watched}
    assert first == second, f"reseed not idempotent: {first} -> {second}"
    assert _fk_violations(db) == []
