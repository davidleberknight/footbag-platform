"""
test_club_cutover_eligibility.py
================================

Pins which club candidates the cutover loader turns into live clubs: exactly the
ones marked bootstrap-eligible. A pre_populate candidate left out is a club whose
members find no club at go-live; an onboarding_visible, dormant or junk candidate
promoted is a club nobody confirmed appearing on the public club list, before the
onboarding wizard has asked a member about it.

Runs the loader in-process against a scratch database and scratch seed and
verdict files, so nothing touches the real legacy_data tree.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_cutover_eligibility.py -v
"""
import importlib.util
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
CUTOVER_PATH = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "06_cutover_pre_populated_clubs.py"

CLUBS_HEADER = (
    "legacy_club_key,name,city,region,country,"
    "contact_member_id,external_url,description,created,last_updated"
)

# (legacy_club_key, classification, bootstrap_eligible)
CANDIDATES = [
    ("k-pre-0", "pre_populate", 1),
    ("k-pre-1", "pre_populate", 1),
    ("k-pre-2", "pre_populate", 1),
    ("k-onb", "onboarding_visible", 0),
    ("k-dorm", "dormant", 0),
    ("k-junk", "junk", 0),
]
ELIGIBLE = {key for key, _cls, eligible in CANDIDATES if eligible}


def _load_cutover():
    spec = importlib.util.spec_from_file_location("cutover_eligibility_under_test", CUTOVER_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_only_bootstrap_eligible_candidates_become_live_clubs(tmp_path, monkeypatch):
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    ts = "2026-01-01T00:00:00Z"
    conn.executemany(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, city, country,
          classification, bootstrap_eligible
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, 'Town', 'Country', ?, ?)
        """,
        [(f"lcc-{key}", ts, ts, key, f"Club {key}", cls, eligible)
         for key, cls, eligible in CANDIDATES],
    )
    conn.commit()
    conn.close()

    # Every candidate has a seed row, so a non-eligible club staying out is the
    # eligibility decision and never a missing seed row.
    clubs_csv = tmp_path / "clubs.csv"
    clubs_csv.write_text(
        CLUBS_HEADER + "\n"
        + "".join(f"{key},Club {key},Town,,Country,,,d,,\n" for key, _c, _e in CANDIDATES),
        encoding="utf-8",
    )
    verdicts_csv = tmp_path / "clubs_url_verdicts.csv"
    verdicts_csv.write_text(
        "legacy_club_key,external_url,validated_at,quarantine_reason\n", encoding="utf-8")

    mod = _load_cutover()
    monkeypatch.setattr(mod, "SEED_CSV", clubs_csv)
    monkeypatch.setattr(mod, "VERDICTS_CSV", verdicts_csv)
    # --apply because the loader plans and stops without it, and the artifacts go
    # beside the test database rather than into the repository directory their
    # defaults name.
    monkeypatch.setattr(sys, "argv", [
        "06_cutover.py", "--db", str(db_path), "--apply",
        "--audit-out", str(tmp_path / "cutover_audit.csv"),
        "--rollback-out", str(tmp_path / "cutover_rollback.sql"),
    ])
    assert mod.main() == 0

    conn = sqlite3.connect(db_path)
    live = {row[0] for row in conn.execute("SELECT name FROM clubs")}
    mapped = {row[0] for row in conn.execute(
        "SELECT legacy_club_key FROM legacy_club_candidates WHERE mapped_club_id IS NOT NULL")}
    conn.close()

    assert live == {f"Club {key}" for key in ELIGIBLE}, (
        f"live clubs {sorted(live)}; expected exactly the bootstrap-eligible candidates")
    assert mapped == ELIGIBLE, (
        f"candidates linked to a club {sorted(mapped)}; expected exactly the eligible ones")
