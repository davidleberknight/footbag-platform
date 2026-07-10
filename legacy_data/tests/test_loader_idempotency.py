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
    return ["legacy_data/event_results/scripts/13_build_net_teams.py", "--db", str(db)]


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


def test_net_teams_qc_counter_honest_under_ignored_duplicate(tmp_path: Path) -> None:
    """When INSERT OR IGNORE skips a QC row that already exists (resolved), the
    summary reports rows actually inserted, not the in-memory flagged count."""
    import re as _re
    db = _load_canonical_doubles(tmp_path, with_qc=True)
    assert run(_loader13(db)).returncode == 0
    # Resolve the flagged QC row so the teardown (open-only) keeps it.
    conn = sqlite3.connect(db)
    try:
        assert count(db, "net_review_queue") >= 1
        conn.execute("UPDATE net_review_queue SET resolution_status = 'resolved'")
        conn.commit()
    finally:
        conn.close()
    queue_before = count(db, "net_review_queue")
    r2 = run(_loader13(db))
    assert r2.returncode == 0
    # The resolved duplicate is skipped, so nothing new is inserted and the count
    # does not grow.
    assert count(db, "net_review_queue") == queue_before
    m = _re.search(r"QC issues inserted:\s+([\d,]+)\s+\(of\s+([\d,]+)\s+flagged", r2.stdout)
    assert m, f"summary line not found.\nstdout: {r2.stdout}"
    inserted = int(m.group(1).replace(",", ""))
    flagged = int(m.group(2).replace(",", ""))
    assert inserted == 0, f"reported {inserted} inserted but the duplicate was skipped"
    assert flagged >= 1, "expected at least one flagged QC issue"


# ---------------------------------------------------------------------------
# Loader 16 (net noise extraction): honest INSERT OR IGNORE counters
# ---------------------------------------------------------------------------

def _write_noise(path: Path, lines: list[str]) -> Path:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _loader16(db: Path, noise: Path) -> list[str]:
    return [
        "legacy_data/event_results/scripts/16_extract_net_matches_from_noise.py",
        "--db", str(db), "--input", str(noise), "--source-label", "TEST",
    ]


def _summary_int(stdout: str, label: str) -> int:
    import re as _re
    m = _re.search(rf"{_re.escape(label)}\s*:\s*([\d,]+)", stdout)
    assert m, f"summary label {label!r} not found.\nstdout: {stdout}"
    return int(m.group(1).replace(",", ""))


def test_net_noise_first_load(tmp_path: Path) -> None:
    """A parseable match line yields one fragment and one candidate, and the
    summary reports those as inserted."""
    db = make_db(tmp_path)
    noise = _write_noise(tmp_path / "noise.txt", ["John Smith beat Jane Doe 15-10"])
    r = run(_loader16(db, noise))
    assert r.returncode == 0, r.stderr
    assert count(db, "net_raw_fragment") == 1
    assert count(db, "net_candidate_match") == 1
    assert _summary_int(r.stdout, "Fragments inserted") == 1
    assert _summary_int(r.stdout, "Candidates inserted") == 1


def test_net_noise_rerun_counts_honest(tmp_path: Path) -> None:
    """A re-run over the same source inserts nothing (INSERT OR IGNORE skips the
    existing ids); the counters report 0, not the re-attempted total."""
    db = make_db(tmp_path)
    noise = _write_noise(tmp_path / "noise.txt", ["John Smith beat Jane Doe 15-10"])
    assert run(_loader16(db, noise)).returncode == 0
    frag_before = count(db, "net_raw_fragment")
    cand_before = count(db, "net_candidate_match")
    assert frag_before >= 1 and cand_before >= 1
    r2 = run(_loader16(db, noise))
    assert r2.returncode == 0
    assert count(db, "net_raw_fragment") == frag_before   # nothing added (idempotent)
    assert count(db, "net_candidate_match") == cand_before
    assert _summary_int(r2.stdout, "Fragments inserted") == 0   # honest under ignored dupes
    assert _summary_int(r2.stdout, "Candidates inserted") == 0


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
                "contact_email", "contact_member_id", "external_url",
                "description", "created", "last_updated"]
CLUB_MEMBERS_HEADER = ["legacy_club_key", "mirror_member_id", "display_name", "alias"]


def _one_club_row() -> dict:
    return {"legacy_club_key": "idem-club-1", "name": "Idem Club", "city": "Town",
            "region": "State", "country": "United States", "contact_email": "",
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
