"""
The seed and enrichment loaders lose no row silently.

Each row a loader is handed is either stored, set aside by a deliberate rule and
counted (an exact duplicate of a stored affiliation), or it stops the load before
anything is committed. A row the pipeline produced that cannot be stored is history
that would vanish from the site, so a report of success over it is the defect.

Run from repo root:
    python -m pytest legacy_data/tests/test_loader_no_silent_loss.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
SEED_LOADER = REPO_ROOT / "legacy_data" / "event_results" / "scripts" / "08_load_mvfp_seed_full_to_sqlite.py"
ENRICHMENT_LOADER = REPO_ROOT / "legacy_data" / "event_results" / "scripts" / "09_load_enrichment_to_sqlite.py"

_spec = importlib.util.spec_from_file_location(
    "loader_idempotency_fixtures", Path(__file__).resolve().parent / "test_loader_idempotency.py")
fixtures = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fixtures)


def _db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db


def _count(db: Path, table: str) -> int:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def _write(path: Path, rows: list[dict], fields: list[str]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return path


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], cwd=str(REPO_ROOT), capture_output=True,
                          text=True, check=False, timeout=600)


# ── seed loader ──────────────────────────────────────────────────────────────

def test_a_participant_the_seed_loader_cannot_store_stops_the_load(tmp_path: Path) -> None:
    # Defect caught: a competitor dropped from a result with the load reported done.
    db = _db(tmp_path)
    seed = fixtures.build_mvfp_seed(tmp_path / "seed")
    parts = seed / "seed_event_result_participants.csv"
    rows = list(csv.DictReader(parts.open(encoding="utf-8")))
    fields = list(rows[0].keys())
    rows[0]["display_name"] = ""
    _write(parts, rows, fields)
    r = _run([str(SEED_LOADER), "--db", str(db), "--seed-dir", str(seed), "--no-backup"])
    assert r.returncode != 0
    assert "participant_without_name: 1" in (r.stdout + r.stderr)
    assert _count(db, "events") == 0  # nothing committed


def test_a_complete_seed_still_loads(tmp_path: Path) -> None:
    db = _db(tmp_path)
    seed = fixtures.build_mvfp_seed(tmp_path / "seed")
    r = _run([str(SEED_LOADER), "--db", str(db), "--seed-dir", str(seed), "--no-backup"])
    assert r.returncode == 0, r.stderr
    conn = sqlite3.connect(db)
    try:
        (n,) = conn.execute(
            "SELECT COUNT(*) FROM event_result_entry_participants p JOIN event_result_entries e "
            "ON e.id = p.result_entry_id WHERE e.event_id = '2000_idem_test'").fetchone()
    finally:
        conn.close()
    assert n == 1


# ── enrichment loader ────────────────────────────────────────────────────────

AFF_FIELDS = ["club_key", "mirror_member_id", "matched_person_id", "member_name_norm",
              "display_name", "inferred_role", "affiliation_confidence_score"]
CAND_FIELDS = ["club_key", "name", "category", "region", "description", "external_url"]


def _enrich(tmp_path: Path, candidates: list[dict], affiliations: list[dict]):
    db = _db(tmp_path)
    # The roster's legacy account, which an affiliation's member id must name;
    # the member load writes these before this loader runs.
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO legacy_members (legacy_member_id, imported_at) "
                 "VALUES ('70001', '2026-01-01T00:00:00.000Z')")
    conn.commit()
    conn.close()
    persons = _write(tmp_path / "persons.csv", [], ["master_person_id", "person_name", "person_type"])
    cands = _write(tmp_path / "candidates.csv", candidates, CAND_FIELDS)
    affs = _write(tmp_path / "affiliations.csv", affiliations, AFF_FIELDS)
    r = _run([str(ENRICHMENT_LOADER), "--db", str(db), "--persons-csv", str(persons),
              "--candidates-csv", str(cands), "--affiliations-csv", str(affs)])
    return db, r


CLUB = {"club_key": "tc-club", "name": "Test Club", "category": "dormant", "region": "",
        "description": "", "external_url": ""}


def _aff(club="tc-club", member="70001"):
    return {"club_key": club, "mirror_member_id": member, "matched_person_id": "",
            "member_name_norm": "alpha player", "display_name": "Alpha Player",
            "inferred_role": "member", "affiliation_confidence_score": "0.5"}


def test_a_member_listed_twice_on_one_roster_is_one_counted_affiliation(tmp_path: Path) -> None:
    # Defect caught: the second listing either failing the load or vanishing uncounted.
    db, r = _enrich(tmp_path, [CLUB], [_aff(), _aff()])
    assert r.returncode == 0, r.stdout + r.stderr
    assert _count(db, "legacy_person_club_affiliations") == 1
    assert "Duplicate (same club, person and role): 1" in r.stdout


def test_an_affiliation_to_a_club_with_no_candidate_stops_the_load(tmp_path: Path) -> None:
    # Defect caught: a roster membership dropped with the load reported done.
    db, r = _enrich(tmp_path, [CLUB], [_aff(club="tc-missing")])
    assert r.returncode != 0
    assert "affiliation to a club with no candidate row 1" in (r.stdout + r.stderr)
    assert _count(db, "legacy_club_candidates") == 0  # nothing committed


PERSON_FIELDS = ["master_person_id", "person_name", "person_name_norm", "person_type",
                 "legacy_member_id"]


def _roster_person(pid: str, name: str, account: str = "") -> dict:
    return {"master_person_id": pid, "person_name": name, "person_name_norm": name.lower(),
            "person_type": "PROVISIONAL", "legacy_member_id": account}


def _enrich_persons(tmp_path: Path, people: list[dict]):
    db = _db(tmp_path)
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO legacy_members (legacy_member_id, imported_at) "
                 "VALUES ('70001', '2026-01-01T00:00:00.000Z')")
    conn.commit()
    conn.close()
    persons = _write(tmp_path / "persons.csv", people, PERSON_FIELDS)
    cands = _write(tmp_path / "candidates.csv", [], CAND_FIELDS)
    affs = _write(tmp_path / "affiliations.csv", [], AFF_FIELDS)
    r = _run([str(ENRICHMENT_LOADER), "--db", str(db), "--persons-csv", str(persons),
              "--candidates-csv", str(cands), "--affiliations-csv", str(affs)])
    return db, r


def test_roster_people_with_unusual_but_clean_names_load_as_written(tmp_path: Path) -> None:
    # Defect caught: real club members dropped because their names do not look
    # like a parsed result line (lower case, a suffix, initials, a slash, one name).
    names = ["alpha player", "Beta R. Player, Jr.", "G. H. Player", "Delta J. Ess/Tee", "Epsilon"]
    db, r = _enrich_persons(tmp_path, [_roster_person(f"master_person::t{i}", n)
                                       for i, n in enumerate(names)])
    assert r.returncode == 0, r.stdout + r.stderr
    conn = sqlite3.connect(db)
    try:
        stored = {n for (n,) in conn.execute(
            "SELECT person_name FROM historical_persons WHERE person_id LIKE 'master_person::t%'")}
    finally:
        conn.close()
    assert stored == set(names)


def test_a_damaged_name_with_an_account_link_loads_under_the_placeholder(tmp_path: Path) -> None:
    # Defect caught: the damaged spelling stored as the person's name, the person
    # dropped, or the account link that will carry the repaired name lost.
    damaged = "S tìpán Player"
    db, r = _enrich_persons(tmp_path, [_roster_person("master_person::t1", damaged, "70001")])
    assert r.returncode == 0, r.stdout + r.stderr
    conn = sqlite3.connect(db)
    try:
        row = conn.execute("SELECT person_name, legacy_member_id, notes FROM historical_persons "
                           "WHERE person_id = 'master_person::t1'").fetchone()
    finally:
        conn.close()
    name, account, notes = row
    assert (name, account) == ("Unknown", "70001")
    assert notes.startswith("name pending legacy account repair") and damaged in notes


def test_a_roster_name_damaged_in_encoding_with_no_account_stops_the_load(tmp_path: Path) -> None:
    # Defect caught: a damaged spelling published as the person's name, or the
    # person silently dropped, when no account can supply the repaired name.
    for damaged in ["Alpha Pla?er", "Rafa³ Player", "S tìpán Player"]:
        db, r = _enrich_persons(tmp_path, [_roster_person("master_person::t1", damaged)])
        assert r.returncode != 0, damaged
        assert "damaged in encoding 1" in (r.stdout + r.stderr), damaged
        assert _count(db, "historical_persons") == 0, damaged  # nothing committed
        db.unlink()


def test_a_second_candidate_row_for_one_club_stops_the_load(tmp_path: Path) -> None:
    # Defect caught: one of two rows for a club silently discarded.
    _, r = _enrich(tmp_path, [CLUB, {**CLUB, "name": "Test Club Again"}], [])
    assert r.returncode != 0
    assert "second club candidate row for one key 1" in (r.stdout + r.stderr)
