"""
test_load_legacy_members_seed.py
================================

Contract tests for the mirror-derived dev-seed loader
(legacy_data/scripts/load_legacy_members_seed.py):

  * the loader seeds a mirror row (name only, import_source='mirror', version=1)
    from the club-roster and persons sources.
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


# ── Phase-1 mirror seeding ───────────────────────────────────────────────────

def test_seeds_mirror_row_name_only(tmp_path: Path) -> None:
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

    r = run_loader(str(db), [
        "--club-members-csv", str(club_members),
        "--persons-csv", str(persons),
    ])
    assert r.returncode == 0, r.stderr

    with sqlite3.connect(db) as con:
        row = con.execute(
            "SELECT display_name, import_source, version, bio, city, country, ifpa_join_date "
            "FROM legacy_members WHERE legacy_member_id = 'm1'"
        ).fetchone()
    # Name only, tagged as the mirror stand-in; profile fields stay NULL for the
    # real member load to populate authoritatively.
    assert row == ("Jane Roe", "mirror", 1, None, None, None, None), row


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
