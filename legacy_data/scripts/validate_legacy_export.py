#!/usr/bin/env python3
"""Read-only gate report on the canonical members export CSV (gates G2/G4/G5).

Checks the export the loader will consume, BEFORE loading:
  G2  legacy_user_id is unique where non-empty
  G4  profile shape: real_name populated on >=95% of rows, country on >=50%
  G5  legacy_member_id is integer-format, present and unique on every row, and
      every historical_persons.legacy_member_id reconciles into the export
      (no linked person's account is missing) when a --db is given

G1 (cross-column email collision) is enforced post-load by
`validate-legacy-import-gates.sh` and at load by `load_legacy_export.py`; it is
not duplicated here. Reads the CSV and DB read-only; exits non-zero if any gate
fails so a cutover pre-checklist stops.
"""
from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

REAL_NAME_MIN = 0.95
COUNTRY_MIN = 0.50


def validate(csv_path: Path, db_path: Path | None) -> list[tuple[str, bool, str]]:
    with csv_path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    n = len(rows) or 1
    results: list[tuple[str, bool, str]] = []

    # G2 — legacy_user_id unique where non-empty
    uids = [r["legacy_user_id"].strip() for r in rows if r["legacy_user_id"].strip()]
    dup_uid = [u for u, c in Counter(uids).items() if c > 1]
    results.append((
        "G2 legacy_user_id unique where non-empty",
        not dup_uid,
        f"{len(uids)} non-empty; {len(dup_uid)} duplicated"
        + (f" (e.g. {dup_uid[:5]})" if dup_uid else ""),
    ))

    # G4 — profile shape
    rn = sum(1 for r in rows if r["real_name"].strip()) / n
    co = sum(1 for r in rows if r["country"].strip()) / n
    results.append((
        "G4 real_name populated >=95%", rn >= REAL_NAME_MIN, f"{rn:.1%}"))
    results.append((
        "G4 country populated >=50%", co >= COUNTRY_MIN, f"{co:.1%}"))

    # G5 — legacy_member_id quality
    ids = [r["legacy_member_id"].strip() for r in rows]
    non_int = [i for i in ids if not re.fullmatch(r"\d+", i)]
    dup_id = [i for i, c in Counter(ids).items() if c > 1]
    results.append((
        "G5 legacy_member_id integer-format + present",
        not non_int,
        f"{len(non_int)} non-integer/empty" + (f" (e.g. {non_int[:5]})" if non_int else "")))
    results.append((
        "G5 legacy_member_id unique",
        not dup_id,
        f"{len(dup_id)} duplicated" + (f" (e.g. {dup_id[:5]})" if dup_id else "")))

    # G5 — overlap reconciliation against historical_persons (linked accounts)
    if db_path:
        con = sqlite3.connect(str(db_path))
        linked = {str(r[0]) for r in con.execute(
            "SELECT legacy_member_id FROM historical_persons "
            "WHERE legacy_member_id IS NOT NULL")}
        con.close()
        # Stub / non-integer linked ids are never real accounts and can never
        # appear in the integer-only export; reconcile real ids, note stubs.
        linked_real = {i for i in linked if re.fullmatch(r"\d+", i)}
        stubs = sorted(linked - linked_real)
        missing = sorted(linked_real - set(ids))
        results.append((
            "G5 historical_persons.legacy_member_id reconciles into export",
            not missing,
            f"{len(linked_real)} real linked; {len(missing)} missing"
            + (f" (e.g. {missing[:5]})" if missing else "")))
        if stubs:
            results.append((
                "G5 note: non-integer linked ids in historical_persons (stubs, never real accounts)",
                True,
                f"{len(stubs)}: {stubs[:5]}"))
    else:
        results.append((
            "G5 historical_persons overlap", True,
            "skipped (no --db; pass --db to reconcile linked accounts)"))

    return results


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", required=True, type=Path, help="the members export CSV")
    ap.add_argument("--db", type=Path, default=None,
                    help="platform DB for the historical_persons G5 reconciliation")
    args = ap.parse_args()
    if not args.csv.is_file():
        raise SystemExit(f"error: export CSV not found: {args.csv}")

    results = validate(args.csv, args.db)
    print(f"validate_legacy_export: {args.csv}")
    failed = 0
    for name, ok, detail in results:
        flag = "PASS" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"  [{flag}] {name} -- {detail}")
    print(f"\n{'all gates pass' if not failed else f'{failed} gate(s) FAILED'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
