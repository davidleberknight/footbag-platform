"""
test_load_legacy_export.py
==========================

Contract tests for the legacy-site export loader
(legacy_data/scripts/load_legacy_export.py):

  * credential-bearing export columns abort BEFORE any write (poisoned fixture)
  * missing required headers abort with the header list
  * source-validity filter excludes per rule with honest counts
  * linkage exception pull-back imports excluded rows referenced by
    historical_persons
  * mirror pre-seeded rows are updated in place and import_source flips to
    'legacy_site_data'; claim-state columns survive a re-import untouched
  * unseen accounts insert as new rows
  * re-running the loader is idempotent (no duplicates, stable values)
  * the default invocation is a dry run that writes nothing

Run from repo root:
    python -m pytest legacy_data/tests/test_load_legacy_export.py -v
"""
import csv
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER = REPO_ROOT / "legacy_data" / "scripts" / "load_legacy_export.py"

TS = "2026-01-01T00:00:00Z"

EXPORT_HEADERS = [
    "MemberID", "MemberValid", "UserName", "Email", "RealName", "DisplayName",
    "City", "State", "Country", "Bio", "BirthDate", "Address", "Zip",
    "JoinDate", "HoF", "BAP", "Admin",
]


def make_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def write_export(tmp_path: Path, rows: list[dict[str, str]], headers: list[str] | None = None) -> Path:
    path = tmp_path / "legacy-export.csv"
    cols = headers or EXPORT_HEADERS
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        for row in rows:
            writer.writerow({c: row.get(c, "") for c in cols})
    return path


def run_loader(db: Path, export: Path, apply: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, str(LOADER), "--export", str(export), "--db", str(db)]
    if apply:
        cmd.append("--apply")
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)


def export_row(member_id: str, **overrides: str) -> dict[str, str]:
    row = {
        "MemberID": member_id,
        "MemberValid": "1",
        "UserName": f"user_{member_id}",
        "Email": f"{member_id}@legacy.example.com",
        "RealName": f"Real {member_id}",
        "DisplayName": f"Display {member_id}",
        "City": "Boulder",
        "State": "CO",
        "Country": "US",
        "Bio": "played footbag",
        "HoF": "0",
        "BAP": "0",
        "Admin": "0",
    }
    row.update(overrides)
    return row


def query(db: Path, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def seed_mirror_row(db: Path, legacy_member_id: str, display_name: str = "Mirror Name") -> None:
    conn = sqlite3.connect(db)
    conn.execute(
        """INSERT INTO legacy_members
           (legacy_member_id, display_name, display_name_normalized, import_source, imported_at)
           VALUES (?, ?, ?, 'mirror', ?)""",
        (legacy_member_id, display_name, display_name.lower(), TS),
    )
    conn.commit()
    conn.close()


def seed_historical_person(db: Path, person_id: str, legacy_member_id: str, first_year: int) -> None:
    conn = sqlite3.connect(db)
    conn.execute(
        """INSERT INTO legacy_members
           (legacy_member_id, display_name, display_name_normalized, import_source, imported_at)
           VALUES (?, 'FK Target', 'fk target', 'mirror', ?)
           ON CONFLICT(legacy_member_id) DO NOTHING""",
        (legacy_member_id, TS),
    )
    conn.execute(
        """INSERT INTO historical_persons
           (person_id, person_name, legacy_member_id, first_year)
           VALUES (?, 'Linked Person', ?, ?)""",
        (person_id, legacy_member_id, first_year),
    )
    conn.commit()
    conn.close()


def test_credential_column_aborts_before_any_write(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    export = write_export(
        tmp_path,
        [export_row("100")],
        headers=EXPORT_HEADERS + ["PasswordHash"],
    )
    result = run_loader(db, export)
    assert result.returncode != 0
    assert "credential-bearing" in result.stderr
    assert "PasswordHash" in result.stderr
    rows = query(db, "SELECT COUNT(*) AS n FROM legacy_members")
    assert rows[0]["n"] == 0


def test_missing_required_header_aborts_with_header_list(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    headers = [h for h in EXPORT_HEADERS if h != "MemberValid"]
    export = write_export(tmp_path, [export_row("100")], headers=headers)
    result = run_loader(db, export)
    assert result.returncode != 0
    assert "member_valid" in result.stderr
    assert "FIELD_ALIASES" in result.stderr


def test_validity_filter_counts_each_exclusion_rule(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    dup = export_row("204")
    export = write_export(tmp_path, [
        export_row("200"),                                          # imports
        export_row("201", MemberValid="0"),                         # member_valid
        export_row("202", UserName="", Email="", RealName="", DisplayName=""),  # no_identity
        export_row("", MemberValid="1"),                            # malformed (no PK)
        export_row("203", RealName="test", DisplayName="", Email="", UserName="u203"),  # test_placeholder
        dup, dict(dup),                                             # duplicate (exact)
    ])
    result = run_loader(db, export)
    assert result.returncode == 0, result.stderr
    out = result.stdout
    assert "excluded[member_valid]:" in out and " 1" in out
    assert "excluded[no_identity]:" in out
    assert "excluded[malformed]:" in out
    assert "excluded[duplicate]:" in out
    assert "excluded[test_placeholder]:" in out

    ids = {r["legacy_member_id"] for r in query(db, "SELECT legacy_member_id FROM legacy_members")}
    assert ids == {"200", "204"}


def test_linkage_exception_pulls_back_excluded_rows(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_historical_person(db, "HP-1", "301", first_year=1995)
    export = write_export(tmp_path, [
        export_row("301", MemberValid="0"),  # excluded by validity, but linked
        export_row("302", MemberValid="0"),  # excluded, unlinked
    ])
    result = run_loader(db, export)
    assert result.returncode == 0, result.stderr
    assert "exceptions pulled back:   1" in result.stdout

    rows = query(db, "SELECT * FROM legacy_members WHERE legacy_member_id = '301'")
    assert len(rows) == 1
    assert rows[0]["import_source"] == "legacy_site_data"
    # first_competition_year fills from the linked historical person.
    assert rows[0]["first_competition_year"] == 1995
    assert query(db, "SELECT * FROM legacy_members WHERE legacy_member_id = '302'") == []


def test_mirror_preseed_updates_in_place_and_claim_state_survives(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_mirror_row(db, "400", display_name="Old Mirror Name")

    # Claim the pre-seeded row so the import must preserve the claim state.
    conn = sqlite3.connect(db)
    conn.execute(
        """INSERT INTO members (id, created_at, created_by, updated_at, updated_by,
             real_name, display_name, display_name_normalized, slug,
             login_email, login_email_normalized,
             password_hash, password_changed_at, email_verified_at)
           VALUES ('mem-claimer', ?, 'test', ?, 'test',
             'Claimer', 'Claimer', 'claimer', 'claimer',
             'claimer@example.com', 'claimer@example.com',
             'x', ?, ?)""",
        (TS, TS, TS, TS),
    )
    conn.execute(
        "UPDATE legacy_members SET claimed_by_member_id = 'mem-claimer', claimed_at = ? WHERE legacy_member_id = '400'",
        (TS,),
    )
    conn.commit()
    conn.close()

    export = write_export(tmp_path, [export_row("400", DisplayName="Fresh Export Name")])
    result = run_loader(db, export)
    assert result.returncode == 0, result.stderr
    assert "updated from mirror:    1" in result.stdout

    rows = query(db, "SELECT * FROM legacy_members WHERE legacy_member_id = '400'")
    assert len(rows) == 1
    assert rows[0]["import_source"] == "legacy_site_data"
    assert rows[0]["display_name"] == "Fresh Export Name"
    assert rows[0]["claimed_by_member_id"] == "mem-claimer"
    assert rows[0]["claimed_at"] == TS


def test_rerun_is_idempotent(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_mirror_row(db, "500")
    export = write_export(tmp_path, [export_row("500"), export_row("501")])

    first = run_loader(db, export)
    assert first.returncode == 0, first.stderr
    assert "updated from mirror:    1" in first.stdout
    assert "inserted new:           1" in first.stdout

    second = run_loader(db, export)
    assert second.returncode == 0, second.stderr
    assert "re-applied (export):    2" in second.stdout
    assert "inserted new:           0" in second.stdout

    rows = query(db, "SELECT COUNT(*) AS n FROM legacy_members")
    assert rows[0]["n"] == 2


def test_default_invocation_is_a_dry_run(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    export = write_export(tmp_path, [export_row("600")])
    result = run_loader(db, export, apply=False)
    assert result.returncode == 0, result.stderr
    assert "DRY-RUN" in result.stdout
    assert "inserted new:           1" in result.stdout
    rows = query(db, "SELECT COUNT(*) AS n FROM legacy_members")
    assert rows[0]["n"] == 0


def test_intra_export_email_collision_is_excluded_and_reported(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    export = write_export(tmp_path, [
        export_row("700", Email="same@legacy.example.com"),
        export_row("701", Email="same@legacy.example.com"),
    ])
    result = run_loader(db, export)
    assert result.returncode == 0, result.stderr
    assert "excluded[email_conflict]:" in result.stdout
    ids = {r["legacy_member_id"] for r in query(db, "SELECT legacy_member_id FROM legacy_members")}
    assert ids == {"700"}
