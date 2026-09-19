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

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cutover_write_contract import (  # noqa: E402
    CutoverWrite, add_contract_args, report_artifacts, sql_literal,
)


SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_DATA_ROOT = SCRIPT_DIR.parent.parent
LEADERS_CSV = LEGACY_DATA_ROOT / "clubs" / "out" / "club_bootstrap_leaders.csv"

# The whole row, because this loader clears the table and rebuilds it: the
# rollback has to restore every column of every row that was there, and a
# rollback that restores a subset is the kind that looks like safety.
LEADER_COLUMNS = (
    "id", "created_at", "created_by", "updated_at", "updated_by", "version",
    "club_id", "imported_member_id", "claimed_member_id", "legacy_member_id",
    "role", "confidence_score", "status", "claim_confirmed_at", "notes",
)

AUDIT_FIELDS = [
    "action", "club_key", "club_id", "legacy_member_id", "role",
    "person_id", "person_name", "confidence_score", "status", "reason",
]

INSERT_SQL = f"""
    INSERT INTO club_bootstrap_leaders ({', '.join(LEADER_COLUMNS)})
    VALUES ({', '.join('?' * len(LEADER_COLUMNS))})
"""

VALID_ROLES = ("leader", "co-leader")
VALID_STATUSES = ("provisional", "claimed", "superseded", "rejected")


def snapshot_leaders(conn):
    """Every row this loader is about to clear, in full."""
    return conn.execute(
        f"SELECT {', '.join(LEADER_COLUMNS)} FROM club_bootstrap_leaders"
    ).fetchall()


def rollback_statements(existing) -> list[str]:
    """Restore the table to exactly the rows read from the database just now."""
    columns = ", ".join(LEADER_COLUMNS)
    lines = ["DELETE FROM club_bootstrap_leaders;"]
    for row in existing:
        values = ", ".join(sql_literal(value) for value in row)
        lines.append(f"INSERT INTO club_bootstrap_leaders ({columns}) VALUES ({values});")
    return lines


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
    add_contract_args(ap, audit_default="bootstrap_leaders_audit.csv",
                      rollback_default="bootstrap_leaders_rollback.sql")
    args = ap.parse_args()

    assert_maintainer_db_target(args.db, "07_load_bootstrap_leaders.py")

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1
    if not LEADERS_CSV.exists():
        # Soft-skip: a missing CSV is the expected state on fresh clones,
        # CI runners that haven't run the classifier, and any environment
        # where clubs/scripts/04_build_club_bootstrap_leaders.py hasn't
        # produced its output yet. Returning 0 lets reset-local-db.sh and
        # run_pipeline.sh proceed without a hard-coded existence guard at
        # the call site. To populate the table, run the full pipeline
        # (or 04_build_club_bootstrap_leaders.py directly) and re-run
        # this loader.
        print(
            f"NOTE: leaders CSV not found at {LEADERS_CSV} — skipping load "
            "(no rows inserted). This is expected before "
            "04_build_club_bootstrap_leaders.py has produced its output."
        )
        return 0

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

    known_club_ids: set[str] = {r[0] for r in con.execute("SELECT id FROM clubs")}

    total = len(csv_rows)
    missing_club = 0
    missing_person = 0
    duplicates = 0
    bad_rows = 0
    planned: list[tuple] = []
    planned_keys: set[tuple[str, str, str]] = set()
    insert_audit: list[dict] = []
    skip_audit: list[dict] = []
    sample_inserts: list[dict] = []

    # Everything below decides what to write without writing any of it. The
    # constraints the database would have enforced on an attempted insert are
    # checked here instead, because a plan that discovers its own rejections by
    # provoking them cannot be written down before the transaction opens, and
    # writing it down first is the point.
    for row in csv_rows:
        club_key   = (row.get("club_key") or "").strip()
        pid        = (row.get("person_id") or "").strip()
        legacy_mid = (row.get("mirror_member_id") or "").strip()
        role_raw   = (row.get("role") or "").strip()
        status     = (row.get("status") or "provisional").strip()
        notes      = (row.get("selection_reason") or "").strip() or None
        person_name = row.get("person_name", "")

        def skipped(reason: str, *, club_id: str = "", role: str = "") -> None:
            skip_audit.append({
                "action": "skip", "club_key": club_key, "club_id": club_id,
                "legacy_member_id": legacy_mid, "role": role or role_raw,
                "person_id": pid, "person_name": person_name,
                "confidence_score": row.get("affiliation_confidence_score", ""),
                "status": status, "reason": reason,
            })

        if not club_key or not legacy_mid or not role_raw:
            bad_rows += 1
            skipped("required field empty")
            print(
                f"  WARN: bad row — club_key={club_key!r} "
                f"legacy_mid={legacy_mid!r} role={role_raw!r}"
            )
            continue

        club_id = club_map.get(club_key)
        if not club_id:
            missing_club += 1
            skipped("no mapped_club_id for this club key")
            print(f"  WARN: no mapped_club_id for club_key={club_key!r}")
            continue

        if not pid or pid not in known_pids:
            missing_person += 1
            skipped("person_id not in historical_persons", club_id=club_id)
            print(
                f"  WARN: person_id {pid!r} not in historical_persons "
                f"(club_key={club_key!r} legacy_mid={legacy_mid!r})"
            )
            continue

        role = normalize_role(role_raw)
        leader_id = stable_id("cbl", club_key, legacy_mid, role)
        conf_val = _opt_float(row.get("affiliation_confidence_score", ""))
        key = (club_id, legacy_mid, role)

        rejection = None
        if key in planned_keys:
            rejection = "duplicate: this club, member and role are already planned"
        elif club_id not in known_club_ids:
            rejection = f"mapped_club_id {club_id} is not a row in clubs"
        elif role not in VALID_ROLES:
            rejection = f"role {role!r} is outside {VALID_ROLES}"
        elif status not in VALID_STATUSES:
            rejection = f"status {status!r} is outside {VALID_STATUSES}"

        if rejection:
            duplicates += 1
            skipped(rejection, club_id=club_id, role=role)
            print(
                f"  WARN: rejected — club_key={club_key!r} "
                f"legacy_mid={legacy_mid!r} role={role!r}: {rejection}"
            )
            continue

        planned_keys.add(key)
        planned.append((
            leader_id, ts, "loader_07", ts, "loader_07", 1,
            club_id, None, None, legacy_mid, role, conf_val, status, None, notes,
        ))
        insert_audit.append({
            "action": "insert", "club_key": club_key, "club_id": club_id,
            "legacy_member_id": legacy_mid, "role": role, "person_id": pid,
            "person_name": person_name, "confidence_score": conf_val,
            "status": status, "reason": "",
        })
        if len(sample_inserts) < 5:
            sample_inserts.append({
                "club_key":         club_key,
                "club_id":          club_id,
                "legacy_member_id": legacy_mid,
                "role":             role,
                "confidence":       conf_val,
                "person_name":      person_name,
            })

    existing = snapshot_leaders(con)
    cleared = len(existing)
    delete_audit = [{
        "action": "delete", "club_key": "", "club_id": row[6],
        "legacy_member_id": row[9], "role": row[10], "person_id": "",
        "person_name": "", "confidence_score": row[11], "status": row[12],
        "reason": "cleared before the rebuild",
    } for row in existing]

    contract = CutoverWrite("07_load_bootstrap_leaders.py", args,
                            audit_fields=AUDIT_FIELDS)
    contract.plan(
        con,
        snapshot=snapshot_leaders,
        audit_rows=delete_audit + insert_audit + skip_audit,
        rollback_sql=rollback_statements(existing),
        rollback_note=("Restores club_bootstrap_leaders to the rows it held before "
                       "this run: the table is cleared and rebuilt, so the prior "
                       "rows are the only thing that can restore it."),
    )
    report_artifacts(contract, len(planned))

    def write(cur) -> None:
        cur.execute("DELETE FROM club_bootstrap_leaders")
        cur.executemany(INSERT_SQL, planned)

    written = contract.apply(con, write)
    inserted = len(planned) if written else 0

    con.close()

    print("\nBootstrap leaders load complete:")
    print(f"  CSV total rows:           {total}")
    print(f"  Pre-DELETE cleared:       {cleared}")
    print(f"  Planned inserts:          {len(planned)}")
    print(f"  Inserted:                 {inserted}")
    print(f"  Missing club mapping:     {missing_club}")
    print(f"  Missing person in HP:     {missing_person}")
    print(f"  Rejected (dup/FK/CHECK):  {duplicates}")
    print(f"  Bad rows (empty fields):  {bad_rows}")

    accounted = len(planned) + missing_club + missing_person + duplicates + bad_rows
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
