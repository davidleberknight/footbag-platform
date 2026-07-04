"""
test_load_clubs_seed.py
=======================

Behavioral tests for the dev-convenience clubs seed loader
(legacy_data/scripts/load_clubs_seed.py):

  * CLUBS_SEED=no skips the load entirely (zero clubs/tags written), leaving
    Phase H as the sole live-club creator at cutover; unset/yes loads normally.
  * the production/staging guard refuses before any work on a deployed target,
    and passes through on a plain local target.

(The complementary static guard that keeps this loader out of the production
pipeline lives in test_clubs_seed_load_not_in_production.py.)

Run from repo root:
    python -m pytest legacy_data/tests/test_load_clubs_seed.py -v
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
LOADER = REPO_ROOT / "legacy_data" / "scripts" / "load_clubs_seed.py"

CLUB_HEADERS = [
    "legacy_club_key", "name", "country", "city", "description", "region", "external_url",
]


def make_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def write_clubs_csv(tmp_path: Path) -> Path:
    path = tmp_path / "clubs.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CLUB_HEADERS)
        writer.writeheader()
        writer.writerow({
            "legacy_club_key": "c1", "name": "Portland Footbag",
            "country": "USA", "city": "Portland", "description": "",
            "region": "", "external_url": "",
        })
    return path


def run_loader(db: str, extra: list[str], env_overrides: dict[str, str] | None = None):
    env = dict(os.environ)
    env.update({"NODE_ENV": "", "FOOTBAG_ENV": ""})
    if env_overrides:
        env.update(env_overrides)
    cmd = [sys.executable, str(LOADER), "--db", db, *extra]
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, env=env)


def club_count(db: Path) -> int:
    with sqlite3.connect(db) as con:
        return con.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]


# ── CLUBS_SEED gate ──────────────────────────────────────────────────────────

def test_clubs_seed_no_skips_all_writes(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    clubs = write_clubs_csv(tmp_path)
    result = run_loader(
        str(db),
        ["--clubs-csv", str(clubs), "--verdicts-csv", str(tmp_path / "no-verdicts.csv")],
        {"CLUBS_SEED": "no"},
    )
    assert result.returncode == 0, result.stderr
    assert "Skipping clubs seed (CLUBS_SEED=no)" in result.stdout
    assert club_count(db) == 0


def test_clubs_seed_unset_loads_normally(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    clubs = write_clubs_csv(tmp_path)
    result = run_loader(
        str(db),
        ["--clubs-csv", str(clubs), "--verdicts-csv", str(tmp_path / "no-verdicts.csv")],
    )
    assert result.returncode == 0, result.stderr
    assert club_count(db) == 1


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
    result = run_loader(db, ["--clubs-csv", str(tmp_path / "nope.csv")], env_overrides)
    assert result.returncode != 0
    assert "refusing to seed" in result.stderr


def test_guard_passes_on_plain_local_target(tmp_path: Path) -> None:
    result = run_loader(str(tmp_path / "local.db"), ["--clubs-csv", str(tmp_path / "nope.csv")])
    assert "refusing to seed" not in result.stderr
