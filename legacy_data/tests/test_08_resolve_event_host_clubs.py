"""
test_08_resolve_event_host_clubs.py
====================================

Verifies `legacy_data/clubs/scripts/08_resolve_event_host_clubs.py` —
the Phase H step that resolves `events.host_club_id` from canonical
`events.csv` host_club text against the live `clubs` table.

Contract pinned here:

  • Happy path: events whose `host_club` text normalizes to a club name
    in the `clubs` table get `host_club_id` stamped. Events with no
    `host_club` text stay NULL. Events whose `host_club` text doesn't
    match any club (federation hosts NHSA/WFA, or clubs absent from
    `clubs`) also stay NULL.
  • Idempotency: re-running produces the same DB state.
  • Preflight: missing events.csv → ERROR + non-zero exit.
  • Preflight: empty clubs table → ERROR + non-zero exit.

Background: until 2026-05-18 this UPDATE logic lived in the dev-only
`scripts/load_clubs_seed.py:221-265`, which was removed from production
orchestration in commit 3cc3a97. The logic was ported to Phase H so
production retains event→club linkage.

Run from repo root:
    python -m pytest legacy_data/tests/test_08_resolve_event_host_clubs.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
SCRIPT = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "08_resolve_event_host_clubs.py"


@pytest.fixture
def fresh_db(tmp_path: Path) -> Path:
    """Fresh on-disk SQLite DB with the project schema loaded."""
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _seed_clubs(db_path: Path) -> None:
    """Seed two clubs that the test events.csv can match against."""
    conn = sqlite3.connect(db_path)
    ts = "2026-01-01T00:00:00Z"
    # tags rows first (clubs.hashtag_tag_id FK target)
    conn.executemany(
        """
        INSERT INTO tags (
          id, created_at, created_by, updated_at, updated_by, version,
          tag_normalized, tag_display, is_standard, standard_type
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, 1, 'club')
        """,
        [
            ("tag-alpha", ts, ts, "#club_alpha", "#club_alpha"),
            ("tag-beta",  ts, ts, "#club_beta",  "#club_beta"),
        ],
    )
    conn.executemany(
        """
        INSERT INTO clubs (
          id, created_at, created_by, updated_at, updated_by, version,
          name, city, country, status, hashtag_tag_id
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, 'active', ?)
        """,
        [
            ("club-alpha", ts, ts, "Alpha Footbag Club",  "Alpha City", "United States", "tag-alpha"),
            ("club-beta",  ts, ts, "Beta Footbag Crew",   "Beta City",  "Canada",        "tag-beta"),
        ],
    )
    conn.commit()
    conn.close()


def _seed_events(db_path: Path) -> None:
    """Seed three events: one matches club-alpha by host_club text,
    one is a federation host (NHSA, no match), one has no host_club text.
    All start with host_club_id=NULL as the canonical loader leaves them.
    Each event needs its own #event tag row (events.hashtag_tag_id is
    NOT NULL with FK to tags)."""
    conn = sqlite3.connect(db_path)
    ts = "2026-01-01T00:00:00Z"
    conn.executemany(
        """
        INSERT INTO tags (
          id, created_at, created_by, updated_at, updated_by, version,
          tag_normalized, tag_display, is_standard, standard_type
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, 1, 'event')
        """,
        [
            ("tag-evt-alpha", ts, ts, "#event_alpha",       "#event_alpha"),
            ("tag-evt-fed",   ts, ts, "#event_federation",  "#event_federation"),
            ("tag-evt-nohost",ts, ts, "#event_no_host",     "#event_no_host"),
        ],
    )
    conn.executemany(
        """
        INSERT INTO events (
          id, created_at, created_by, updated_at, updated_by, version,
          title, start_date, end_date, city, country, status, hashtag_tag_id
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, '2020-06-01', '2020-06-03', ?, ?, 'completed', ?)
        """,
        [
            ("2020_alpha_open",   ts, ts, "Alpha Open",     "Alpha City", "United States", "tag-evt-alpha"),
            ("1985_federation",   ts, ts, "Federation Cup", "Boulder",    "United States", "tag-evt-fed"),
            ("2020_no_host",      ts, ts, "Hostless Event", "Somewhere",  "Mars",          "tag-evt-nohost"),
        ],
    )
    conn.commit()
    conn.close()


def _write_events_csv(path: Path) -> None:
    """events.csv mirroring the canonical_input shape (subset of columns
    the script actually reads: event_key + host_club)."""
    path.write_text(
        "event_key,host_club\n"
        "2020_alpha_open,Alpha Footbag Club\n"
        "1985_federation,NHSA\n"
        "2020_no_host,\n",
        encoding="utf-8",
    )


def _run(db_path: Path, events_csv: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable, str(SCRIPT),
            "--db", str(db_path),
            "--events-csv", str(events_csv),
        ],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def test_happy_path_matches_only_real_clubs(fresh_db: Path, tmp_path: Path) -> None:
    """events whose host_club text matches a clubs.name get stamped;
    federation host (NHSA) stays NULL; empty host_club stays NULL."""
    _seed_clubs(fresh_db)
    _seed_events(fresh_db)
    events_csv = tmp_path / "events.csv"
    _write_events_csv(events_csv)

    result = _run(fresh_db, events_csv)
    assert result.returncode == 0, (
        f"Script failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    rows = dict(conn.execute(
        "SELECT id, host_club_id FROM events ORDER BY id"
    ).fetchall())
    conn.close()

    assert rows["2020_alpha_open"] == "club-alpha", (
        "Real-club host should be stamped with the matched club id."
    )
    assert rows["1985_federation"] is None, (
        "Federation host NHSA has no clubs row → host_club_id stays NULL."
    )
    assert rows["2020_no_host"] is None, (
        "Empty host_club text → host_club_id stays NULL (silently skipped)."
    )

    # Reporting line on stdout names the matched count and unmatched-distinct count.
    assert "Resolved host_club_id on 1 events" in result.stdout
    assert "1 distinct host_club value(s) unmatched" in result.stdout


def test_idempotent_on_rerun(fresh_db: Path, tmp_path: Path) -> None:
    """Re-running produces the same DB state. No partial writes, no
    UPDATE drift, identical match counts."""
    _seed_clubs(fresh_db)
    _seed_events(fresh_db)
    events_csv = tmp_path / "events.csv"
    _write_events_csv(events_csv)

    first = _run(fresh_db, events_csv)
    assert first.returncode == 0

    conn = sqlite3.connect(fresh_db)
    first_rows = conn.execute(
        "SELECT id, host_club_id FROM events ORDER BY id"
    ).fetchall()
    conn.close()

    second = _run(fresh_db, events_csv)
    assert second.returncode == 0

    conn = sqlite3.connect(fresh_db)
    second_rows = conn.execute(
        "SELECT id, host_club_id FROM events ORDER BY id"
    ).fetchall()
    conn.close()

    assert first_rows == second_rows, (
        f"Idempotency broken: first={first_rows}, second={second_rows}"
    )


def test_missing_events_csv_exits_nonzero(fresh_db: Path, tmp_path: Path) -> None:
    """Preflight: events.csv absent → ERROR + non-zero exit + actionable
    message naming the producer script."""
    _seed_clubs(fresh_db)
    _seed_events(fresh_db)
    missing_csv = tmp_path / "does-not-exist.csv"

    result = _run(fresh_db, missing_csv)
    assert result.returncode != 0
    assert "ERROR: events CSV not found" in result.stderr
    assert "export_canonical_platform.py" in result.stderr


def test_empty_clubs_table_exits_nonzero(fresh_db: Path, tmp_path: Path) -> None:
    """Preflight: clubs table empty → ERROR + non-zero exit + actionable
    message naming Phase H step 06."""
    # No _seed_clubs() here — clubs table stays empty.
    _seed_events(fresh_db)
    events_csv = tmp_path / "events.csv"
    _write_events_csv(events_csv)

    result = _run(fresh_db, events_csv)
    assert result.returncode != 0
    assert "ERROR: clubs table is empty" in result.stderr
    assert "06_cutover_pre_populated_clubs.py" in result.stderr
