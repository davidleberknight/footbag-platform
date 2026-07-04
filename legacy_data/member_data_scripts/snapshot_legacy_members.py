#!/usr/bin/env python3
"""Snapshot legacy_members before the reconciled member load, for rollback.

Read-only. Given the reconciled member CSV that load_legacy_export.py --apply is
about to load, this captures the current state of every legacy_members row that
load could touch and writes:

  * an audit CSV  -- one row per affected legacy_member_id, marked will_update
    (a row exists now and the load will overwrite it) or will_insert (no row yet;
    the load will add it);
  * rollback SQL  -- restores each existing row's prior values and deletes each
    row the load inserts, so the load can be fully reverted.

The rollback restores exactly the columns the loader's UPDATE writes and no
others, so it never touches the claim columns (claimed_by_member_id, claimed_at):
the claim-state guarantee the loader keeps is preserved on rollback too.

The affected set is every legacy_member_id in the CSV -- a superset of what the
loader actually writes (the loader also drops invalid / duplicate / conflicting
rows). Restoring or deleting a row the loader left alone is a harmless no-op, so
the snapshot does not need to reproduce the loader's row filtering.

Writes no database rows. Refuses production / staging / /srv/footbag targets, so
the whole apply path uniformly declines a deployed database.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from pathlib import Path

DEFAULT_AUDIT_CSV = Path("legacy_data/member_data_scripts/out/apply_members_audit.csv")
DEFAULT_ROLLBACK_SQL = Path("legacy_data/member_data_scripts/out/apply_members_rollback.sql")

# Exactly the columns load_legacy_export.py's UPDATE writes -- restoring these
# reverts the load. The claim columns and the paid-history columns are not in
# this set, so the rollback leaves them untouched.
RESTORE_COLUMNS = [
    "legacy_user_id", "legacy_email", "legacy_email2", "legacy_email3",
    "real_name", "display_name", "display_name_normalized",
    "city", "region", "country", "bio", "birth_date", "street_address",
    "postal_code", "ifpa_join_date", "first_competition_year",
    "is_hof", "is_bap", "legacy_is_admin", "import_source", "imported_at", "version",
]

AUDIT_FIELDS = ["legacy_member_id", "action"]


def refuse_if_deployed_target(db_path: str) -> None:
    node_env = os.environ.get("NODE_ENV", "")
    footbag_env = os.environ.get("FOOTBAG_ENV", "")
    if (node_env == "production" or footbag_env in ("production", "staging")
            or os.path.abspath(db_path).startswith("/srv/footbag/")):
        print(
            "refusing to snapshot: the apply path is maintainer-machine only and "
            "never runs against production or staging. Guard tripped by "
            f"NODE_ENV={node_env!r} / FOOTBAG_ENV={footbag_env!r} / --db={db_path!r}.",
            file=sys.stderr,
        )
        sys.exit(1)


def _sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def csv_member_ids(members_csv: Path) -> list[str]:
    with Path(members_csv).open(encoding="utf-8", newline="") as f:
        ids = [(r.get("legacy_member_id") or "").strip() for r in csv.DictReader(f)]
    # Deterministic, de-duplicated.
    return sorted({i for i in ids if i})


def plan_snapshot(conn, member_ids: list[str]):
    """Return (updates, inserts): updates is [(id, {col: value})] for rows that
    exist now, inserts is [id] for ids the load will add. Reads only."""
    cur = conn.cursor()
    col_list = ", ".join(RESTORE_COLUMNS)
    updates = []
    inserts = []
    for mid in member_ids:
        row = cur.execute(
            f"SELECT {col_list} FROM legacy_members WHERE legacy_member_id = ?", (mid,)
        ).fetchone()
        if row is None:
            inserts.append(mid)
        else:
            updates.append((mid, dict(zip(RESTORE_COLUMNS, row))))
    return updates, inserts


def write_audit_csv(updates, inserts, out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=AUDIT_FIELDS, lineterminator="\n")
        w.writeheader()
        for mid, _vals in updates:
            w.writerow({"legacy_member_id": mid, "action": "will_update"})
        for mid in inserts:
            w.writerow({"legacy_member_id": mid, "action": "will_insert"})
    return len(updates) + len(inserts)


def write_rollback_sql(updates, inserts, out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        f.write("-- Rollback for the reconciled legacy_members load: restores the "
                "prior row for each\n-- overwritten account and deletes each newly "
                "inserted account. Claim columns\n-- (claimed_by_member_id, "
                "claimed_at) are not restored, so claim state is preserved.\n")
        f.write("BEGIN;\n")
        for mid, vals in updates:
            assignments = ", ".join(f"{c} = {_sql_literal(vals[c])}" for c in RESTORE_COLUMNS)
            f.write(f"UPDATE legacy_members SET {assignments} "
                    f"WHERE legacy_member_id = {_sql_literal(mid)};\n")
        for mid in inserts:
            f.write(f"DELETE FROM legacy_members WHERE legacy_member_id = {_sql_literal(mid)};\n")
        f.write("COMMIT;\n")
    return len(updates) + len(inserts)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Snapshot legacy_members for rollback before the reconciled member load (read-only).")
    ap.add_argument("--members-csv", required=True, type=Path,
                    help="the reconciled member CSV the load will apply")
    ap.add_argument("--db", type=Path, default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"))
    ap.add_argument("--audit-out", type=Path, default=DEFAULT_AUDIT_CSV)
    ap.add_argument("--rollback-out", type=Path, default=DEFAULT_ROLLBACK_SQL)
    args = ap.parse_args()

    refuse_if_deployed_target(str(args.db))
    for p in (args.members_csv, args.db):
        if not Path(p).exists():
            print(f"error: not found: {p}", file=sys.stderr)
            sys.exit(1)

    member_ids = csv_member_ids(args.members_csv)
    conn = sqlite3.connect(str(args.db))
    try:
        updates, inserts = plan_snapshot(conn, member_ids)
    finally:
        conn.close()
    write_audit_csv(updates, inserts, Path(args.audit_out))
    write_rollback_sql(updates, inserts, Path(args.rollback_out))

    print("snapshot_legacy_members (read-only)")
    print(f"  affected accounts:   {len(member_ids)}")
    print(f"  existing (restore):  {len(updates)}")
    print(f"  new (delete on rollback): {len(inserts)}")
    print(f"  audit CSV:    {args.audit_out}")
    print(f"  rollback SQL: {args.rollback_out}")


if __name__ == "__main__":
    main()
