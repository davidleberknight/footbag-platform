#!/usr/bin/env python3
"""
07a_load_bootstrap_leader_signals.py

Loads `club_bootstrap_leader_signals` from the CSV produced by
clubs/scripts/04a_compute_bootstrap_leader_signals.py.

Reads:  legacy_data/clubs/out/club_bootstrap_leader_signals.csv
Writes: club_bootstrap_leader_signals DB table.

FK chain: signals.bootstrap_leader_id → club_bootstrap_leaders.id.
The parent row's id is derived deterministically as
  stable_id("cbl", club_key, mirror_member_id, normalize_role(role))
mirroring 07_load_bootstrap_leaders.py:175. Must run AFTER 07 so the
parent rows exist.

Idempotency: the parent table's DELETE in 07 cascades through this
table via the FK's ON DELETE CASCADE clause. We additionally issue a
local DELETE so this loader is also idempotent when run standalone
(e.g. after a compute-only refresh that did not touch the leaders
table). Both paths leave the DB in the same state.

Pattern: DELETE + INSERT, cur.rowcount-accurate counters, single
transaction, soft-skip on missing CSV. Mirrors 07_load_bootstrap_leaders.py.

Usage (from legacy_data/ or repo root):
    python clubs/scripts/07a_load_bootstrap_leader_signals.py [--db path/to/footbag.db]
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
SIGNALS_CSV = LEGACY_DATA_ROOT / "clubs" / "out" / "club_bootstrap_leader_signals.csv"


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
    """CSV 'co_leader' → DB CHECK 'co-leader'. Mirrors 07's helper so the
    derived parent-row id (stable_id of "cbl"+...+role) matches what
    07_load_bootstrap_leaders.py inserted."""
    return role.strip().replace("_", "-")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"),
    )
    ap.add_argument(
        "--signals-csv",
        type=Path,
        default=SIGNALS_CSV,
        help="Path to club_bootstrap_leader_signals.csv (default: legacy_data/clubs/out/)",
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1
    if not args.signals_csv.exists():
        # Soft-skip: a missing CSV is the expected state on fresh clones
        # and any environment where 04a_compute_bootstrap_leader_signals.py
        # has not produced its output yet. Returning 0 lets the orchestrator
        # proceed without a hard-coded existence guard at the call site.
        print(
            f"NOTE: signals CSV not found at {args.signals_csv} — skipping load "
            "(no rows inserted). This is expected before "
            "04a_compute_bootstrap_leader_signals.py has produced its output."
        )
        return 0

    with open(args.signals_csv, newline="", encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))

    ts = now_iso()
    con = sqlite3.connect(str(db_path))
    con.execute("PRAGMA foreign_keys = ON")

    # Preload set of existing leader ids so we can detect FK gaps before
    # the INSERT raises an IntegrityError, and report which parents are
    # missing with operator-actionable context.
    known_leader_ids: set[str] = {
        r[0] for r in con.execute("SELECT id FROM club_bootstrap_leaders")
    }

    total = len(csv_rows)
    inserted = 0
    missing_leader = 0
    duplicates = 0
    bad_rows = 0
    sample_inserts: list[dict] = []

    with con:
        cur = con.cursor()
        # Defensive idempotency: parent DELETE in 07 cascades through this
        # table, but a standalone re-run (no leaders DELETE) would hit
        # UNIQUE(bootstrap_leader_id, signal_type). Local DELETE keeps both
        # paths equivalent.
        cleared = cur.execute("DELETE FROM club_bootstrap_leader_signals").rowcount

        for row in csv_rows:
            club_key   = (row.get("club_key") or "").strip()
            legacy_mid = (row.get("mirror_member_id") or "").strip()
            role_raw   = (row.get("role") or "").strip()
            signal_type   = (row.get("signal_type") or "").strip()
            is_present_s = (row.get("is_present") or "").strip()
            payload_json = (row.get("signal_payload_json") or "").strip()
            source       = (row.get("source") or "").strip() or "pipeline_04a"

            if (not club_key or not legacy_mid or not role_raw
                    or not signal_type or is_present_s not in ("0", "1")
                    or not payload_json):
                bad_rows += 1
                print(
                    f"  WARN: bad row — club_key={club_key!r} "
                    f"legacy_mid={legacy_mid!r} role={role_raw!r} "
                    f"signal={signal_type!r} is_present={is_present_s!r}"
                )
                continue

            role = normalize_role(role_raw)
            leader_id = stable_id("cbl", club_key, legacy_mid, role)

            if leader_id not in known_leader_ids:
                missing_leader += 1
                print(
                    f"  WARN: no parent leader for club_key={club_key!r} "
                    f"legacy_mid={legacy_mid!r} role={role!r} "
                    f"(leader_id={leader_id!r}) — was 07 run?"
                )
                continue

            signal_id = stable_id("cbls", leader_id, signal_type)
            is_present = int(is_present_s)

            try:
                ins = cur.execute(
                    """
                    INSERT INTO club_bootstrap_leader_signals (
                      id, created_at, created_by, updated_at, updated_by, version,
                      bootstrap_leader_id, signal_type, signal_payload_json,
                      is_present, source
                    ) VALUES (?, ?, 'loader_07a', ?, 'loader_07a', 1,
                             ?, ?, ?, ?, ?)
                    """,
                    (
                        signal_id, ts, ts,
                        leader_id, signal_type, payload_json, is_present, source,
                    ),
                )
                if ins.rowcount:
                    inserted += 1
                    if len(sample_inserts) < 5:
                        sample_inserts.append({
                            "club_key":  club_key,
                            "leader_id": leader_id,
                            "signal":    signal_type,
                            "is_present": is_present,
                        })
            except sqlite3.IntegrityError as e:
                # UNIQUE(bootstrap_leader_id, signal_type) or CHECK violation.
                duplicates += 1
                print(
                    f"  WARN: integrity error — leader_id={leader_id!r} "
                    f"signal={signal_type!r}: {e}"
                )

    con.close()

    print("\nBootstrap leader signals load complete:")
    print(f"  CSV total rows:           {total}")
    print(f"  Pre-DELETE cleared:       {cleared}")
    print(f"  Inserted:                 {inserted}")
    print(f"  Missing parent leader:    {missing_leader}")
    print(f"  Duplicate / CHECK error:  {duplicates}")
    print(f"  Bad rows (empty fields):  {bad_rows}")

    accounted = inserted + missing_leader + duplicates + bad_rows
    if accounted != total:
        print(
            f"  WARN: counter mismatch — {accounted} accounted, {total} total"
        )

    if sample_inserts:
        print("\n  Sample inserted rows:")
        for s in sample_inserts:
            print(
                f"    club_key={s['club_key']}  leader_id={s['leader_id']}  "
                f"signal={s['signal']}  is_present={s['is_present']}"
            )

    return 0 if missing_leader == 0 and duplicates == 0 and bad_rows == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
