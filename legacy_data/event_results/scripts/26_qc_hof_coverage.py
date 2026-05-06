#!/usr/bin/env python3
"""Script 26: QC the Hall of Fame coverage. READ-ONLY hard fail.

Invariant: every row in `legacy_data/inputs/hof.csv` whose person_id is
populated MUST exist in `historical_persons` with hof_member=1, and must
not have an obvious split-identity twin (a non-HOF row with the same
surname and a matching first-name).

Hard failures (exit 1):
  - missing_pid     — HOF row's person_id is absent from historical_persons
  - hof_flag_off    — HOF row's person_id is present but hof_member=0
  - split_identity  — conservative match: HOF pid coexists with a non-HOF
                      pid that has the same surname AND first-name equal-or-
                      strict-prefix relationship (e.g., Tim/Timothy) AND at
                      least one of the two has event_count ≤ 1 (stub-vs-real
                      gate; rules out two-real-personas false positives such
                      as the Vu brothers).

Warnings (informational; do not fail the run):
  - empty_pid       — HOF row has no person_id in hof.csv
  - name_mismatch   — CSV name differs from DB person_name for same pid
  - unloaded_note   — hof.csv `notes` column has variant intel not loaded
  - hyphen_nickname — display-formatting issue (e.g., "Scott-Mag Hughes")

Read-only. No identity merges, no schema changes, no data writes.

Usage:
  python legacy_data/event_results/scripts/26_qc_hof_coverage.py
  python legacy_data/event_results/scripts/26_qc_hof_coverage.py --db /path/to/footbag.db

Exit 0 iff no hard failures (warnings allowed); exit 1 on any hard failure;
exit 2 on missing DB or missing source CSV.
"""
from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[2]

DEFAULT_DB  = REPO_ROOT / "database" / "footbag.db"
DEFAULT_HOF = REPO_ROOT / "legacy_data" / "inputs" / "hof.csv"

# "Firstname-Nick Lastname" — captures Scott-Mag Hughes today; targets the
# small subset of HOF entries where the curator stored a quoted nickname as
# a hyphen instead of the FBHOF-canonical 'X "Nick" Y' form.
HYPHEN_NICK_RE = re.compile(r"^([A-Z][a-z]+)-([A-Z][a-zA-Z]+) ([A-Z].*)$")


def first_name_token(full_name: str) -> str:
    """Lowercased first-name portion. If the first whitespace-separated
    token contains a hyphen (e.g. 'Scott-Mag'), take the part before the
    hyphen — that's the actual given name; the post-hyphen part is a
    curator-stored nickname.
    """
    head = full_name.strip().split(maxsplit=1)[0] if full_name.strip() else ""
    if "-" in head:
        head = head.split("-", 1)[0]
    return head.lower()


def surname_token(full_name: str) -> str:
    """Lowercased final whitespace-separated token of a full name."""
    parts = full_name.strip().split()
    return parts[-1].lower() if parts else ""


def first_name_match(a: str, b: str) -> bool:
    """Conservative match: equal, OR one is a strict prefix of the other
    (both ≥ 2 chars). Examples: Tim/Timothy → True, Al/Allan → True,
    Jane/Bill → False, A/Allan → False (1-char prefix too loose).
    """
    if not a or not b or len(a) < 2 or len(b) < 2:
        return False
    if a == b:
        return True
    return a.startswith(b) or b.startswith(a)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--db",
        default=str(DEFAULT_DB),
        help="Path to SQLite DB (default: repo-root database/footbag.db)",
    )
    ap.add_argument(
        "--hof-csv",
        default=str(DEFAULT_HOF),
        help="Path to hof.csv (default: legacy_data/inputs/hof.csv)",
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: DB not found: {db_path}", file=sys.stderr)
        return 2
    hof_path = Path(args.hof_csv)
    if not hof_path.exists():
        print(f"ERROR: hof.csv not found: {hof_path}", file=sys.stderr)
        return 2

    with hof_path.open(newline="", encoding="utf-8") as f:
        hof_rows = list(csv.DictReader(f))

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        hps = {r["person_id"]: dict(r) for r in con.execute(
            "SELECT person_id, person_name, aliases, hof_member, "
            "hof_induction_year, event_count "
            "FROM historical_persons"
        )}
    finally:
        con.close()

    by_surname: dict[str, list[dict]] = defaultdict(list)
    for r in hps.values():
        s = surname_token(r["person_name"])
        if s:
            by_surname[s].append(r)

    hard: dict[str, list[str]] = defaultdict(list)
    warn: dict[str, list[str]] = defaultdict(list)

    for row in hof_rows:
        full_name = row["full_name"].strip()
        pid       = row["person_id"].strip()
        notes     = row["notes"].strip()

        # DB-dependent checks only run when the CSV has a pid that resolves.
        db = hps.get(pid) if pid else None

        if not pid:
            warn["empty_pid"].append(
                f"'{full_name}' has no person_id in hof.csv"
            )
        elif db is None:
            hard["missing_pid"].append(
                f"'{full_name}' (pid={pid[:8]}) not in historical_persons"
            )
        else:
            db_name = db["person_name"]

            if not db["hof_member"]:
                hard["hof_flag_off"].append(
                    f"'{full_name}' (pid={pid[:8]}) present as '{db_name}' but hof_member=0"
                )

            f_csv = first_name_token(full_name)
            s_csv = surname_token(full_name)
            ev_hof = db.get("event_count") or 0
            if f_csv and s_csv:
                for other in by_surname.get(s_csv, []):
                    if other["person_id"] == pid:
                        continue
                    if other["hof_member"]:
                        continue
                    if not first_name_match(f_csv, first_name_token(other["person_name"])):
                        continue
                    ev_other = other.get("event_count") or 0
                    # Stub-vs-real gate: at least one of the two must look
                    # stub-like (≤1 event). Two real personas with
                    # substantial event counts are intentionally separate
                    # identities (e.g., Vu brothers — Tu and Tuan are
                    # different people).
                    if min(ev_hof, ev_other) > 1:
                        continue
                    hard["split_identity"].append(
                        f"HOF '{full_name}' (pid={pid[:8]}, events={ev_hof}) likely == "
                        f"non-HOF '{other['person_name']}' "
                        f"(pid={other['person_id'][:8]}, events={ev_other})"
                    )

            if full_name != db_name:
                warn["name_mismatch"].append(
                    f"'{full_name}' (csv) vs '{db_name}' (db) for pid={pid[:8]}"
                )

        # Format-only warnings — independent of DB resolution.
        if notes:
            snippet = notes[:120] + ("..." if len(notes) > 120 else "")
            warn["unloaded_note"].append(f"'{full_name}': {snippet}")

        if HYPHEN_NICK_RE.match(full_name):
            warn["hyphen_nickname"].append(
                f"'{full_name}' uses 'X-Nick Y' form; FBHOF canonical is 'X \"Nick\" Y'"
            )

    total = len(hof_rows)
    n_hard = sum(len(v) for v in hard.values())
    n_warn = sum(len(v) for v in warn.values())

    print("=" * 72)
    print(f"HOF coverage QC — {total} hof.csv rows | {len(hps)} historical_persons")
    print("=" * 72)

    print(f"\nHARD FAILURES: {n_hard}")
    if n_hard:
        for code in ("missing_pid", "hof_flag_off", "split_identity"):
            items = hard.get(code, [])
            if items:
                print(f"  {code} ({len(items)}):", file=sys.stderr)
                for m in items:
                    print(f"    - {m}", file=sys.stderr)

    print(f"\nWARNINGS: {n_warn}")
    if n_warn:
        for code in ("empty_pid", "name_mismatch", "unloaded_note", "hyphen_nickname"):
            items = warn.get(code, [])
            if items:
                print(f"  {code} ({len(items)}):")
                for m in items:
                    print(f"    - {m}")

    print()
    if n_hard:
        print(
            f"FAIL: {n_hard} hard failure(s); {n_warn} warning(s).",
            file=sys.stderr,
        )
        return 1
    print(f"PASS: 0 hard failures; {n_warn} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
