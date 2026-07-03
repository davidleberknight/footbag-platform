#!/usr/bin/env python3
"""Fill `legacy_is_admin` on the members export CSV from the legacy admins dump.

Reads the canonical members CSV (emitted by `extract_legacy_members.py`) and the
legacy `admins` table mysqldump, and rewrites the CSV with `legacy_is_admin` set
to 1 for every account whose admin row has `AdminValid = 1` (keyed
`AdminID = MemberID`). `AdminRealm` is audit metadata only and never promotes a
live platform role here. Uses the shared mysqldump parser. Reads the dump
read-only; writes only the output CSV.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _dump_parser import parse_create_columns, parse_value_tuples  # noqa: E402


def parse_admins_columns(sql: str) -> list[str]:
    return parse_create_columns(sql, "admins")


def valid_admin_ids(admins_sql: Path) -> set[str]:
    """MemberIDs whose admins row has AdminValid = 1."""
    sql = admins_sql.read_text(encoding="utf-8", errors="replace")
    cols = parse_admins_columns(sql)
    ids: set[str] = set()
    for m in re.finditer(r"INSERT INTO `admins` VALUES ", sql):
        for values in parse_value_tuples(sql[m.end():]):
            rec = dict(zip(cols, values))
            if str(rec.get("AdminValid") or "").strip() == "1":
                aid = str(rec.get("AdminID") or "").strip()
                if aid:
                    ids.add(aid)
    return ids


def apply_admin_flag(members_csv: Path, admins_sql: Path, out_csv: Path) -> dict:
    admin_ids = valid_admin_ids(admins_sql)
    with members_csv.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = list(reader.fieldnames or [])
        if "legacy_is_admin" not in fields:
            raise SystemExit("error: members CSV has no legacy_is_admin column")
        rows = list(reader)

    matched = 0
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in rows:
            is_admin = r["legacy_member_id"].strip() in admin_ids
            r["legacy_is_admin"] = "1" if is_admin else "0"
            if is_admin:
                matched += 1
            w.writerow(r)

    return {
        "valid_admins_in_dump": len(admin_ids),
        "members_flagged_admin": matched,
        "members_total": len(rows),
        "admin_ids_without_member_row": len(admin_ids) - matched,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-csv", required=True, type=Path,
                    help="canonical members CSV from extract_legacy_members.py")
    ap.add_argument("--admins-sql", required=True, type=Path,
                    help="path to the admins mysqldump (members/admin/backups/latest.sql)")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    for p in (args.members_csv, args.admins_sql):
        if not p.is_file():
            raise SystemExit(f"error: not found: {p}")

    stats = apply_admin_flag(args.members_csv, args.admins_sql, args.out)
    print(f"extract_legacy_admins -> {args.out}")
    print(f"  valid admins in dump:        {stats['valid_admins_in_dump']}")
    print(f"  members flagged admin:       {stats['members_flagged_admin']}")
    print(f"  admin ids w/o member row:    {stats['admin_ids_without_member_row']}")


if __name__ == "__main__":
    main()
