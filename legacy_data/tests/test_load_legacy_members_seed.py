"""
test_load_legacy_members_seed.py
================================

Contract tests for the mirror-derived dev-seed loader
(legacy_data/scripts/load_legacy_members_seed.py):

  * Phase-2 profile enrichment updates a seeded row in place, bumps `version`,
    and does NOT crash (the loader previously wrote nonexistent updated_at /
    updated_by columns, which raised `no such column: updated_at` the moment a
    member_profiles.csv was present).
  * the production/staging guard refuses before any work when the target smells
    like a deployed environment, and passes through on a plain local target.

Run from repo root:
    python -m pytest legacy_data/tests/test_load_legacy_members_seed.py -v
"""
import csv
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER = REPO_ROOT / "legacy_data" / "scripts" / "load_legacy_members_seed.py"


def make_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> Path:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({h: row.get(h, "") for h in headers})
    return path


def run_loader(db: str, extra: list[str], env_overrides: dict[str, str] | None = None):
    env = dict(os.environ)
    # Neutralize any ambient deployed-env signal from the caller's shell.
    env.update({"NODE_ENV": "", "FOOTBAG_ENV": ""})
    if env_overrides:
        env.update(env_overrides)
    cmd = [sys.executable, str(LOADER), "--db", db, *extra]
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, env=env)


# ── Phase 2 enrichment: the B1 regression ───────────────────────────────────

def test_phase2_enrichment_bumps_version_and_does_not_crash(tmp_path: Path) -> None:
    db = make_db(tmp_path)

    club_members = write_csv(
        tmp_path / "club_members.csv",
        ["legacy_club_key", "mirror_member_id", "display_name", "alias"],
        [{"legacy_club_key": "c1", "mirror_member_id": "m1", "display_name": "Jane Roe"}],
    )
    persons = write_csv(
        tmp_path / "persons.csv",
        ["member_id", "person_name"],
        [],  # no gap-fill needed
    )

    # Phase 1: seed the row (no profiles CSV yet).
    r1 = run_loader(str(db), [
        "--club-members-csv", str(club_members),
        "--persons-csv", str(persons),
        "--profiles-csv", str(tmp_path / "absent-profiles.csv"),
    ])
    assert r1.returncode == 0, r1.stderr
    with sqlite3.connect(db) as con:
        row = con.execute(
            "SELECT version, bio, city, country, ifpa_join_date "
            "FROM legacy_members WHERE legacy_member_id = 'm1'"
        ).fetchone()
    assert row is not None, "Phase-1 row should exist"
    assert row[0] == 1 and row[1] is None  # version=1, bio NULL

    # Phase 2: enrich with a real profiles CSV. Pre-fix this crashed.
    profiles = write_csv(
        tmp_path / "member_profiles.csv",
        ["mirror_member_id", "bio", "city", "country", "ifpa_join_date"],
        [{"mirror_member_id": "m1", "bio": "kicks bags", "city": "Portland",
          "country": "USA", "ifpa_join_date": "1999-01-01"}],
    )
    r2 = run_loader(str(db), [
        "--club-members-csv", str(club_members),
        "--persons-csv", str(persons),
        "--profiles-csv", str(profiles),
    ])
    assert r2.returncode == 0, r2.stderr
    assert "no such column" not in (r2.stderr + r2.stdout)

    with sqlite3.connect(db) as con:
        row = con.execute(
            "SELECT version, bio, city, country, ifpa_join_date "
            "FROM legacy_members WHERE legacy_member_id = 'm1'"
        ).fetchone()
    assert row == (2, "kicks bags", "Portland", "USA", "1999-01-01"), row


# ── Production/staging guard ─────────────────────────────────────────────────

@pytest.mark.parametrize(
    "db, env_overrides",
    [
        ("database/footbag.db", {"NODE_ENV": "production"}),
        ("database/footbag.db", {"FOOTBAG_ENV": "production"}),
        ("database/footbag.db", {"FOOTBAG_ENV": "staging"}),
        ("/srv/footbag/production/footbag.db", {}),
    ],
)
def test_guard_refuses_deployed_target(db: str, env_overrides: dict[str, str], tmp_path: Path) -> None:
    # The guard fires immediately after arg parsing, before any file is opened.
    result = run_loader(db, [
        "--club-members-csv", str(tmp_path / "nope.csv"),
        "--persons-csv", str(tmp_path / "nope.csv"),
    ], env_overrides)
    assert result.returncode != 0
    assert "refusing to seed" in result.stderr


def test_guard_passes_on_plain_local_target(tmp_path: Path) -> None:
    # Without a deployed signal the guard clears; the loader then fails for a
    # benign reason (missing DB), proving the guard discriminates on environment.
    result = run_loader(str(tmp_path / "local.db"), [
        "--club-members-csv", str(tmp_path / "nope.csv"),
        "--persons-csv", str(tmp_path / "nope.csv"),
    ])
    assert "refusing to seed" not in result.stderr
