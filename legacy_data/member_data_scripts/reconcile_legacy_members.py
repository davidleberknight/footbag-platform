#!/usr/bin/env python3
"""Identity reconciliation for the legacy-site member intake -- STUB + profiler.

STATUS: NOT IMPLEMENTED. This is the single file to pick up the reconciliation
that the member-data load is blocked on. The full specification -- what to build
and the exact decisions to confirm first -- lives in IMPLEMENTATION_PLAN.md,
"Legacy-site dump intake", sub-item (3) Identity reconciliation.

The dump is dirty: many people hold several accounts, and emails are shared
across accounts, so accounts cannot be auto-merged. Nothing here writes to the
database. When the stages below are implemented and the QC gate passes,
`run_legacy_members.sh --load` stops refusing and applies -- it calls
`--qc-gate` here as its pre-apply gate.

Pick-up steps:
  1. Run `--profile` now (no confirmation needed) to see the real duplicate and
     DOB edge-case patterns in the extracted intermediate CSV. Use it to check
     the matching rules against the actual data.
  2. Confirm these decisions before implementing (do not guess -- the IP carries
     the measured counts and the rationale):
       (a) the canonical normalizer (the shared AliasResolver.normalize_name)
           and whether de-duplication runs over member_valid=1 only or all rows;
       (b) Stage A duplicate-account key (name+DOB, primary email, or both) and
           the per-group policy (flag a primary, e.g. latest MemberLastLogin, or
           leave all equal);
       (c) DOB handling (full = month+day+year present; is year-only a usable
           weaker signal; how do no/partial-DOB accounts match);
       (d) Stage B dump->historical_persons linking precedence (id crosswalk ->
           unique name+DOB -> unique name+email; ambiguity to a review CSV,
           never auto-linked; no new persons created);
       (e) the pre-apply QC gate thresholds (zero duplicate
           historical_persons.legacy_member_id, zero ambiguous links applied).
  3. Implement stage_a_duplicate_accounts, stage_b_link_historical_persons, and
     qc_gate below, each emitting a git-ignored review CSV with counted buckets.
     Every stage stays read-until-reviewed: it never auto-merges accounts or
     auto-links persons.
  4. The load un-blocks automatically once qc_gate returns a pass.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_CSV = Path("legacy_data/member_data_scripts/out/legacy_members_final.csv")


def _placeholder_norm(s: str | None) -> str:
    """Placeholder name/email normalization for the profiler ONLY. The real
    reconciliation must use the canonical AliasResolver.normalize_name (decision
    (a)); this lowercase+collapse stand-in is close enough to size the problem,
    not to make links."""
    s = unicodedata.normalize("NFKC", (s or "")).lower().strip()
    return re.sub(r"\s+", " ", s)


def profile(csv_path: Path) -> int:
    """Read-only: print the duplicate-account and DOB edge-case patterns Stage A
    and Stage B must handle. Counts only -- no member data is written or logged.
    """
    if not csv_path.exists():
        print(
            f"error: intermediate CSV not found at {csv_path}.\n"
            "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
            file=sys.stderr,
        )
        return 1

    with csv_path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    valid = [r for r in rows if (r.get("member_valid") or "").strip() == "1"]
    print(f"rows: {len(rows)}   member_valid=1: {len(valid)}")

    names = Counter(_placeholder_norm(r.get("real_name")) for r in valid if _placeholder_norm(r.get("real_name")))
    ndup = {k: v for k, v in names.items() if v > 1}
    print(f"names on >1 account: {len(ndup)}  (accounts: {sum(ndup.values())})")

    email_names: dict[str, set[str]] = defaultdict(set)
    ecnt: Counter[str] = Counter()
    for r in valid:
        e = (r.get("legacy_email") or "").strip().lower()
        if e:
            ecnt[e] += 1
            email_names[e].add(_placeholder_norm(r.get("real_name")))
    edup = {k: v for k, v in ecnt.items() if v > 1}
    ediff = sum(1 for e, ns in email_names.items() if len(ns) > 1)
    print(f"primary emails on >1 account: {len(edup)}  (rows: {sum(edup.values())}; different-name groups: {ediff})")

    def dob(r: dict[str, str]) -> str:
        return (r.get("birth_date") or "").strip()

    full = sum(1 for r in valid if dob(r))
    print(f"birth_date present: {full}   absent: {len(valid) - full}")

    nd: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for r in valid:
        n, d = _placeholder_norm(r.get("real_name")), dob(r)
        if n and d:
            nd[(n, d)].append(r)
    nddup = {k: v for k, v in nd.items() if len(v) > 1}
    nd_diff_email = sum(
        1
        for grp in nddup.values()
        if len({(x.get("legacy_email") or "").strip().lower() for x in grp if (x.get("legacy_email") or "").strip()}) > 1
    )
    print(f"(name+birth_date) groups on >1 account: {len(nddup)}  (accounts: {sum(len(v) for v in nddup.values())}; different-email groups: {nd_diff_email})")
    print("\nThis is a placeholder-normalized profile (see the module docstring); the "
          "authoritative counts and the decisions to confirm are in IMPLEMENTATION_PLAN.md sub-item (3).")
    return 0


def stage_a_duplicate_accounts(*args: object, **kwargs: object) -> object:
    raise NotImplementedError(
        "Stage A (intra-dump duplicate-account review) is not implemented. "
        "See IMPLEMENTATION_PLAN.md sub-item (3); confirm decisions (a)/(b)/(c) first."
    )


def stage_b_link_historical_persons(*args: object, **kwargs: object) -> object:
    raise NotImplementedError(
        "Stage B (dump->historical_persons linking) is not implemented. "
        "See IMPLEMENTATION_PLAN.md sub-item (3); confirm decision (d) first."
    )


def qc_gate(*args: object, **kwargs: object) -> object:
    raise NotImplementedError(
        "The pre-apply QC gate is not implemented. See IMPLEMENTATION_PLAN.md "
        "sub-item (3); confirm decision (e). run_legacy_members.sh --load refuses "
        "to apply until this gate passes."
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Legacy-member identity reconciliation (STUB + profiler); see the module docstring."
    )
    ap.add_argument("--profile", action="store_true",
                    help="print duplicate / DOB edge-case counts from the intermediate CSV (read-only)")
    ap.add_argument("--qc-gate", action="store_true",
                    help="run the pre-apply QC gate (not implemented; called by run_legacy_members.sh)")
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="intermediate CSV to profile")
    ap.add_argument("--db", type=Path, default=None, help="target database (used by the QC gate once implemented)")
    args = ap.parse_args()

    if args.profile:
        sys.exit(profile(args.csv))
    if args.qc_gate:
        try:
            qc_gate(args.csv, args.db)
        except NotImplementedError as exc:
            print(f"reconcile_legacy_members: {exc}", file=sys.stderr)
            sys.exit(1)
        return
    ap.print_help()
    sys.exit(2)


if __name__ == "__main__":
    main()
