"""
Idempotency smoke test for pipeline-regenerated loaders.

Each loader, run twice against the same temp DB and identical inputs, must not
raise and must leave its target table at an identical row count. This pins the
DELETE+INSERT / INSERT-OR-IGNORE re-run-safety contract so a future
non-idempotent change (a raw INSERT, an append-counter, a missing scoped DELETE)
is caught instead of silently double-loading on the next pipeline run.

Covered: the enrichment candidate loader, the freestyle-records loader, the
name-variants seed loader, the club cutover, the MVFP seed loader (08), the
trick-dictionary loader (17), and the red-additions loader (19). All inputs are
synthetic and written to a temp dir; the cutover reads the committed seed CSV
read-only and is seeded with a candidate keyed to a real seed row.

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
        "legacy_data/event_results/scripts/10_load_freestyle_records_to_sqlite.py",
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
        "legacy_data/event_results/scripts/17_load_trick_dictionary.py",
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
        "legacy_data/event_results/scripts/17_load_trick_dictionary.py",
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
        "legacy_data/event_results/scripts/19_load_red_additions.py",
        "--db", str(db),
        "--additions-csv", str(additions),
        "--corrections-csv", str(corrections),
    ]
    n = assert_idempotent(db, loader, "freestyle_tricks")
    assert n == base + 1
