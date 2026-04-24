#!/usr/bin/env python3
"""
07_load_bootstrap_leaders.py

IP Item 3b — load club_bootstrap_leaders from the classifier CSV.

Reads:  legacy_data/clubs/out/club_bootstrap_leaders.csv (produced by
        clubs/scripts/04_build_club_bootstrap_leaders.py).
Writes: club_bootstrap_leaders DB table.

Resolution chain:
  * Club: `legacy_club_key` → `legacy_club_candidates.mapped_club_id` → `clubs.id`.
          Requires IP Item 3a cutover (Phase H `06_cutover_pre_populated_clubs.py`)
          to have run and populated `mapped_club_id` for bootstrap-eligible rows.
  * Person: CSV `person_id` must exist in `historical_persons`. Rows that
          fail this check are reported as "missing person in HP" and skipped;
          we never create persons here.

Pattern: DELETE + INSERT, cur.rowcount-accurate counters. Mirrors the
post-audit fixes applied to 09_load_enrichment_to_sqlite.py.

Outputs (stderr):
  - total CSV rows
  - inserted
  - missing club mappings
  - missing person mappings
  - duplicate (UNIQUE violation)
  - bad rows (empty required fields)
  - 5 sample inserted rows for spot-check

Usage (from legacy_data/ or repo root):
    python clubs/scripts/07_load_bootstrap_leaders.py [--db path/to/footbag.db]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_DATA_ROOT = SCRIPT_DIR.parent.parent
LEADERS_CSV = LEGACY_DATA_ROOT / "clubs" / "out" / "club_bootstrap_leaders.csv"


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def normalize_role(role: str) -> str:
    """CSV 'co_leader' → DB CHECK 'co-leader'. Mirrors 09's helper."""
    return role.strip().replace("_", "-")


def _opt_float(v: str | None) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"),
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1
    if not LEADERS_CSV.exists():
        print(f"ERROR: leaders CSV not found at {LEADERS_CSV}", file=sys.stderr)
        return 1

    with open(LEADERS_CSV, newline="", encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))

    ts = now_iso()
    con = sqlite3.connect(str(db_path))
    con.execute("PRAGMA foreign_keys = ON")

    # Preload lookup maps.
    club_map: dict[str, str] = {
        r[0]: r[1]
        for r in con.execute(
            "SELECT legacy_club_key, mapped_club_id "
            "FROM legacy_club_candidates "
            "WHERE mapped_club_id IS NOT NULL"
        )
    }
    known_pids: set[str] = {
        r[0] for r in con.execute("SELECT person_id FROM historical_persons")
    }

    total = len(csv_rows)
    inserted = 0
    missing_club = 0
    missing_person = 0
    duplicates = 0
    bad_rows = 0
    sample_inserts: list[dict] = []

    with con:
        cur = con.cursor()
        cleared = cur.execute("DELETE FROM club_bootstrap_leaders").rowcount

        for row in csv_rows:
            club_key   = (row.get("club_key") or "").strip()
            pid        = (row.get("person_id") or "").strip()
            legacy_mid = (row.get("mirror_member_id") or "").strip()
            role_raw   = (row.get("role") or "").strip()
            status     = (row.get("status") or "provisional").strip()
            notes      = (row.get("selection_reason") or "").strip() or None

            if not club_key or not legacy_mid or not role_raw:
                bad_rows += 1
                print(
                    f"  WARN: bad row — club_key={club_key!r} "
                    f"legacy_mid={legacy_mid!r} role={role_raw!r}"
                )
                continue

            club_id = club_map.get(club_key)
            if not club_id:
                missing_club += 1
                print(f"  WARN: no mapped_club_id for club_key={club_key!r}")
                continue

            if not pid or pid not in known_pids:
                missing_person += 1
                print(
                    f"  WARN: person_id {pid!r} not in historical_persons "
                    f"(club_key={club_key!r} legacy_mid={legacy_mid!r})"
                )
                continue

            role = normalize_role(role_raw)
            leader_id = stable_id("cbl", club_key, legacy_mid, role)
            conf_val = _opt_float(row.get("affiliation_confidence_score", ""))

            try:
                ins = cur.execute(
                    """
                    INSERT INTO club_bootstrap_leaders (
                      id, created_at, created_by, updated_at, updated_by, version,
                      club_id, imported_member_id, claimed_member_id,
                      legacy_member_id, role, confidence_score, status,
                      claim_confirmed_at, notes
                    ) VALUES (?, ?, 'loader_07', ?, 'loader_07', 1,
                             ?, NULL, NULL, ?, ?, ?, ?, NULL, ?)
                    """,
                    (
                        leader_id, ts, ts,
                        club_id, legacy_mid, role, conf_val, status, notes,
                    ),
                )
                if ins.rowcount:
                    inserted += 1
                    if len(sample_inserts) < 5:
                        sample_inserts.append({
                            "club_key":         club_key,
                            "club_id":          club_id,
                            "legacy_member_id": legacy_mid,
                            "role":             role,
                            "confidence":       conf_val,
                            "person_name":      row.get("person_name", ""),
                        })
            except sqlite3.IntegrityError as e:
                # UNIQUE(club_id, legacy_member_id, role) or FK violation.
                duplicates += 1
                print(
                    f"  WARN: duplicate/FK — club_key={club_key!r} "
                    f"legacy_mid={legacy_mid!r} role={role!r}: {e}"
                )

    con.close()

    print("\nBootstrap leaders load complete:")
    print(f"  CSV total rows:           {total}")
    print(f"  Pre-DELETE cleared:       {cleared}")
    print(f"  Inserted:                 {inserted}")
    print(f"  Missing club mapping:     {missing_club}")
    print(f"  Missing person in HP:     {missing_person}")
    print(f"  Duplicate / FK violation: {duplicates}")
    print(f"  Bad rows (empty fields):  {bad_rows}")

    accounted = inserted + missing_club + missing_person + duplicates + bad_rows
    if accounted != total:
        print(
            f"  WARN: counter mismatch — {accounted} accounted, {total} total"
        )

    if sample_inserts:
        print("\n  Sample inserted rows:")
        for s in sample_inserts:
            print(
                f"    club_id={s['club_id']}  legacy_mid={s['legacy_member_id']}  "
                f"role={s['role']}  conf={s['confidence']}  "
                f"person={s['person_name']!r}  (key={s['club_key']})"
            )

    return 0 if missing_club == 0 and missing_person == 0 and duplicates == 0 and bad_rows == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
