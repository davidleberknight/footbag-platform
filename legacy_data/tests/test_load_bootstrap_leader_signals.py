"""
test_load_bootstrap_leader_signals.py
=====================================

Pins the loader contract for
`clubs/scripts/07a_load_bootstrap_leader_signals.py`.

Loader contract under test:
  • DELETE + INSERT pattern (idempotent; running twice produces the same
    row count + content).
  • Soft-skip when the input CSV is missing (returns 0; no DB writes).
  • Bootstrap_leader_id derived via stable_id("cbl", club_key,
    mirror_member_id, normalize_role(role)) — must match 07's parent-row
    id derivation exactly, or every insert hits FK violation.
  • Cascades correctly: deleting a club_bootstrap_leaders row removes its
    signals (ON DELETE CASCADE on the FK).
  • Reports a non-zero exit when any required parent is missing, so the
    operator sees the FK gap immediately.

Run from repo root:
    python -m pytest legacy_data/tests/test_load_bootstrap_leader_signals.py -v
"""
from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER_SCRIPT = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "07a_load_bootstrap_leader_signals.py"


# Helpers that mirror the loader's id formulas so the test asserts
# against the same arithmetic the loader uses.

def _stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def _leader_id(club_key: str, mirror_mid: str, role_csv: str) -> str:
    return _stable_id("cbl", club_key, mirror_mid, role_csv.replace("_", "-"))


TS = "2026-01-01T00:00:00Z"

CLUB_A_KEY = "club-a"
CLUB_B_KEY = "club-b"
CLUB_A_ID = "club_id_a"
CLUB_B_ID = "club_id_b"

# Two leaders' worth of signals (2 × 7 = 14 rows). Mirrors the end-to-end
# fixture in test_bootstrap_leader_signals.py.
SIGNAL_TYPES = [
    "listed_contact", "affiliation", "hosting", "roster",
    "mirror_text", "recent_activity", "geographic_alignment",
]


@pytest.fixture
def fresh_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _seed_clubs_and_leaders(db_path: Path) -> None:
    """Insert two live clubs and one leader per club. Bypasses Phase H
    entirely — the loader under test depends only on parent rows
    existing in club_bootstrap_leaders, not on how they got there."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executemany(
        """
        INSERT INTO tags (
          id, created_at, created_by, updated_at, updated_by, version,
          tag_normalized, tag_display, is_standard, standard_type
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, 1, 'club')
        """,
        [
            ("tag_club_a", TS, TS, "#club-a", "Club A"),
            ("tag_club_b", TS, TS, "#club-b", "Club B"),
        ],
    )
    conn.executemany(
        """
        INSERT INTO clubs (
          id, created_at, created_by, updated_at, updated_by, version,
          name, description, city, country, hashtag_tag_id
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, '', ?, ?, ?)
        """,
        [
            (CLUB_A_ID, TS, TS, "Club A", "Toronto", "Canada", "tag_club_a"),
            (CLUB_B_ID, TS, TS, "Club B", "Paris", "France", "tag_club_b"),
        ],
    )
    conn.executemany(
        """
        INSERT INTO club_bootstrap_leaders (
          id, created_at, created_by, updated_at, updated_by, version,
          club_id, legacy_member_id, role, status
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, 'provisional')
        """,
        [
            (_leader_id(CLUB_A_KEY, "100", "leader"), TS, TS, CLUB_A_ID, "100", "leader"),
            (_leader_id(CLUB_B_KEY, "200", "leader"), TS, TS, CLUB_B_ID, "200", "leader"),
        ],
    )
    conn.commit()
    conn.close()


def _write_signals_csv(path: Path, rows: list[dict]) -> None:
    cols = [
        "club_key", "mirror_member_id", "role", "signal_type",
        "is_present", "signal_payload_json", "source",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def _build_signal_rows(
    club_key: str, mirror_mid: str, role: str, presence_by_signal: dict[str, int]
) -> list[dict]:
    return [
        {
            "club_key": club_key,
            "mirror_member_id": mirror_mid,
            "role": role,
            "signal_type": st,
            "is_present": str(presence_by_signal.get(st, 0)),
            "signal_payload_json": json.dumps({"signal": st}, sort_keys=True, separators=(",", ":")),
            "source": "pipeline_04a",
        }
        for st in SIGNAL_TYPES
    ]


def _run_loader(db_path: Path, signals_csv: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            sys.executable, str(LOADER_SCRIPT),
            "--db", str(db_path),
            "--signals-csv", str(signals_csv),
        ],
        cwd=str(REPO_ROOT),
        capture_output=True, text=True, check=False,
    )


# ─── happy path ────────────────────────────────────────────────────────────


def test_loader_inserts_all_signals(fresh_db: Path, tmp_path: Path):
    _seed_clubs_and_leaders(fresh_db)
    signals_csv = tmp_path / "signals.csv"
    rows = (
        _build_signal_rows(CLUB_A_KEY, "100", "leader",
                           {s: 1 for s in SIGNAL_TYPES})
        + _build_signal_rows(CLUB_B_KEY, "200", "leader",
                             {s: 0 for s in SIGNAL_TYPES})
    )
    _write_signals_csv(signals_csv, rows)

    result = _run_loader(fresh_db, signals_csv)
    assert result.returncode == 0, (
        f"loader failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    count = conn.execute(
        "SELECT COUNT(*) FROM club_bootstrap_leader_signals"
    ).fetchone()[0]
    conn.close()
    assert count == 14, f"expected 14 rows (2 leaders × 7 signals), got {count}"


def test_loader_preserves_signal_payload_json(fresh_db: Path, tmp_path: Path):
    _seed_clubs_and_leaders(fresh_db)
    payload = {"hello": "world", "n": 42}
    rows = [{
        "club_key": CLUB_A_KEY, "mirror_member_id": "100", "role": "leader",
        "signal_type": "listed_contact", "is_present": "1",
        "signal_payload_json": json.dumps(payload, sort_keys=True, separators=(",", ":")),
        "source": "pipeline_04a",
    }]
    signals_csv = tmp_path / "signals.csv"
    _write_signals_csv(signals_csv, rows)

    assert _run_loader(fresh_db, signals_csv).returncode == 0

    conn = sqlite3.connect(fresh_db)
    stored = conn.execute(
        "SELECT signal_payload_json FROM club_bootstrap_leader_signals"
    ).fetchone()[0]
    conn.close()
    assert json.loads(stored) == payload


def test_loader_correctly_resolves_co_leader_role(fresh_db: Path, tmp_path: Path):
    """CSV writes role 'co_leader' (underscore); DB CHECK requires 'co-leader'.
    The loader's normalize_role + stable_id math must reconstruct the
    parent's id correctly."""
    _seed_clubs_and_leaders(fresh_db)
    co_leader_id = _leader_id(CLUB_A_KEY, "101", "co_leader")
    conn = sqlite3.connect(fresh_db)
    conn.execute(
        """
        INSERT INTO club_bootstrap_leaders (
          id, created_at, created_by, updated_at, updated_by, version,
          club_id, legacy_member_id, role, status
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, '101', 'co-leader', 'provisional')
        """,
        (co_leader_id, TS, TS, CLUB_A_ID),
    )
    conn.commit()
    conn.close()

    rows = _build_signal_rows(CLUB_A_KEY, "101", "co_leader", {s: 1 for s in SIGNAL_TYPES})
    signals_csv = tmp_path / "signals.csv"
    _write_signals_csv(signals_csv, rows)

    result = _run_loader(fresh_db, signals_csv)
    assert result.returncode == 0, (
        f"loader failed on co_leader row.\nstderr: {result.stderr}"
    )

    conn = sqlite3.connect(fresh_db)
    count = conn.execute(
        "SELECT COUNT(*) FROM club_bootstrap_leader_signals WHERE bootstrap_leader_id = ?",
        (co_leader_id,),
    ).fetchone()[0]
    conn.close()
    assert count == 7


# ─── idempotency ──────────────────────────────────────────────────────────


def test_loader_idempotent_on_rerun(fresh_db: Path, tmp_path: Path):
    _seed_clubs_and_leaders(fresh_db)
    rows = _build_signal_rows(CLUB_A_KEY, "100", "leader", {s: 1 for s in SIGNAL_TYPES})
    signals_csv = tmp_path / "signals.csv"
    _write_signals_csv(signals_csv, rows)

    assert _run_loader(fresh_db, signals_csv).returncode == 0
    conn = sqlite3.connect(fresh_db)
    first = conn.execute("SELECT COUNT(*) FROM club_bootstrap_leader_signals").fetchone()[0]
    conn.close()

    assert _run_loader(fresh_db, signals_csv).returncode == 0
    conn = sqlite3.connect(fresh_db)
    second = conn.execute("SELECT COUNT(*) FROM club_bootstrap_leader_signals").fetchone()[0]
    conn.close()

    assert first == second == 7, (
        f"idempotency broken: first={first}, second={second}"
    )


# ─── cascade ──────────────────────────────────────────────────────────────


def test_signals_cascade_on_parent_delete(fresh_db: Path, tmp_path: Path):
    """ON DELETE CASCADE on the bootstrap_leader_id FK must remove signals
    when a parent leader is deleted. This is the upstream pattern that
    07_load_bootstrap_leaders.py relies on for re-run idempotency."""
    _seed_clubs_and_leaders(fresh_db)
    rows = _build_signal_rows(CLUB_A_KEY, "100", "leader", {s: 1 for s in SIGNAL_TYPES})
    signals_csv = tmp_path / "signals.csv"
    _write_signals_csv(signals_csv, rows)
    assert _run_loader(fresh_db, signals_csv).returncode == 0

    conn = sqlite3.connect(fresh_db)
    conn.execute("PRAGMA foreign_keys = ON")
    pre = conn.execute("SELECT COUNT(*) FROM club_bootstrap_leader_signals").fetchone()[0]
    assert pre == 7

    conn.execute(
        "DELETE FROM club_bootstrap_leaders WHERE id = ?",
        (_leader_id(CLUB_A_KEY, "100", "leader"),),
    )
    conn.commit()

    post = conn.execute("SELECT COUNT(*) FROM club_bootstrap_leader_signals").fetchone()[0]
    conn.close()
    assert post == 0, f"cascade broken: {post} orphan signals after parent delete"


# ─── fail-fast / soft-skip / FK gap ───────────────────────────────────────


def test_loader_soft_skip_when_csv_missing(fresh_db: Path, tmp_path: Path):
    _seed_clubs_and_leaders(fresh_db)
    missing_csv = tmp_path / "does_not_exist.csv"
    result = _run_loader(fresh_db, missing_csv)
    assert result.returncode == 0
    assert "NOTE:" in result.stdout
    assert "does_not_exist.csv" in result.stdout

    conn = sqlite3.connect(fresh_db)
    count = conn.execute(
        "SELECT COUNT(*) FROM club_bootstrap_leader_signals"
    ).fetchone()[0]
    conn.close()
    assert count == 0


def test_loader_exits_nonzero_on_missing_db(tmp_path: Path):
    signals_csv = tmp_path / "signals.csv"
    _write_signals_csv(signals_csv, _build_signal_rows(
        CLUB_A_KEY, "100", "leader", {s: 0 for s in SIGNAL_TYPES},
    ))
    result = _run_loader(tmp_path / "no_such.db", signals_csv)
    assert result.returncode != 0
    assert "ERROR" in result.stderr or "ERROR" in result.stdout


def test_loader_reports_missing_parent_leader(fresh_db: Path, tmp_path: Path):
    """No parent row → row counted as missing_leader, returncode non-zero,
    operator-actionable stdout naming the offending leader."""
    # Note: no _seed_clubs_and_leaders call → no parent rows.
    rows = _build_signal_rows(CLUB_A_KEY, "100", "leader",
                              {s: 1 for s in SIGNAL_TYPES})
    signals_csv = tmp_path / "signals.csv"
    _write_signals_csv(signals_csv, rows)

    result = _run_loader(fresh_db, signals_csv)
    assert result.returncode != 0
    assert "no parent leader" in result.stdout.lower() or \
           "no parent leader" in result.stderr.lower()
    # The error must name the offending club_key so the operator knows
    # which upstream gap to chase.
    assert CLUB_A_KEY in result.stdout or CLUB_A_KEY in result.stderr


def test_loader_skips_bad_rows(fresh_db: Path, tmp_path: Path):
    _seed_clubs_and_leaders(fresh_db)
    signals_csv = tmp_path / "signals.csv"
    # One good row plus one row missing signal_type.
    rows = _build_signal_rows(CLUB_A_KEY, "100", "leader",
                              {s: 1 for s in SIGNAL_TYPES})[:1]
    rows.append({
        "club_key": CLUB_A_KEY, "mirror_member_id": "100", "role": "leader",
        "signal_type": "",  # bad — empty
        "is_present": "1",
        "signal_payload_json": "{}",
        "source": "pipeline_04a",
    })
    _write_signals_csv(signals_csv, rows)

    result = _run_loader(fresh_db, signals_csv)
    assert result.returncode != 0  # bad row → non-zero exit per loader contract
    conn = sqlite3.connect(fresh_db)
    count = conn.execute(
        "SELECT COUNT(*) FROM club_bootstrap_leader_signals"
    ).fetchone()[0]
    conn.close()
    assert count == 1  # the one good row landed; the bad row was skipped
