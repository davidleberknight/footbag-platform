#!/usr/bin/env python3
"""Identity reconciliation for the legacy-site member intake.

The dump is dirty: many people hold several accounts, and some emails are shared
across accounts, so accounts cannot be auto-merged. Every stage here is
read-until-reviewed -- it groups accounts for a human to adjudicate and writes a
git-ignored review CSV; it never merges accounts, never auto-links persons, and
never writes to the database.

Stages:
  * Stage A -- intra-dump duplicate accounts (implemented). Groups member_valid=1
    accounts by two review signals: same normalized name + full date of birth,
    and shared primary email. Same email under a single name is a same-person
    candidate; same email under different names is a shared / family mailbox and
    is never recommended as the same person. Each account stays its own row; the
    review CSV is an adjudication aid, not a merge.
  * Stage B -- dump to historical_persons linking (not implemented).
  * QC gate -- the pre-apply gate that un-blocks the write (not implemented).

The load stays blocked until Stage B and the QC gate land: run_legacy_members.sh
--load calls the QC gate here and refuses to apply while it is unimplemented.

Name normalization is the canonical AliasResolver.normalize_name (NFKD
accent-fold, lowercase, separators-to-space, in-word punctuation strip) shared by
every identity-resolution stage, so a name that groups here groups the same way
downstream. De-duplication considers only member_valid=1 rows; a full date of
birth is month, day, and year all present (the extractor emits birth_date only in
that case).
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

# The canonical identity normalizer lives in the shared identity package; make it
# importable when this script is run directly or loaded by path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402

DEFAULT_CSV = Path("legacy_data/member_data_scripts/out/legacy_members_final.csv")
DEFAULT_STAGE_A_REVIEW_CSV = Path(
    "legacy_data/member_data_scripts/out/stage_a_duplicate_accounts_review.csv"
)


def _norm_email(s: str | None) -> str:
    return (s or "").strip().lower()


def _full_dob(row: dict[str, str]) -> str:
    return (row.get("birth_date") or "").strip()


def _valid_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return [r for r in rows if (r.get("member_valid") or "").strip() == "1"]


# ---------------------------------------------------------------------------
# Stage A -- intra-dump duplicate-account review
# ---------------------------------------------------------------------------

# One (group, account) pair per review row so a reviewer sees each candidate
# cluster's accounts together with the evidence to adjudicate it.
REVIEW_FIELDS = [
    "group_id", "signal", "match_key",
    "same_person_recommended", "exclusion_reason", "group_size",
    "legacy_member_id", "real_name", "normalized_name", "birth_date",
    "legacy_email", "legacy_user_id", "city", "region", "country",
]


@dataclass
class DuplicateGroup:
    """A candidate cluster of accounts that one review signal put together.

    same_person_recommended is a recommendation for the reviewer, never an
    applied merge: True for a name + full-DOB match and for a shared email under
    a single name; False (with exclusion_reason 'different_name_shared_email')
    for a shared email spanning different names, which is a shared / family
    mailbox that must not be merged.
    """
    signal: str
    match_key: str
    same_person_recommended: bool
    exclusion_reason: str
    accounts: list[dict[str, str]]
    group_id: str = field(default="")


def build_stage_a_groups(rows: list[dict[str, str]]) -> list[DuplicateGroup]:
    """Group member_valid=1 accounts by the two approved duplicate signals.

    Returns only clusters of more than one account, each carrying a stable id.
    Pure and deterministic: it reads nothing, writes nothing, and merges nothing.
    """
    valid = _valid_rows(rows)
    groups: list[DuplicateGroup] = []

    # Signal 1: same normalized name + full date of birth. A shared birth date
    # under one name across several accounts is the strongest same-person signal
    # available in the dump.
    by_name_dob: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for r in valid:
        nm = normalize_name(r.get("real_name") or "")
        dob = _full_dob(r)
        if nm and dob:
            by_name_dob[(nm, dob)].append(r)
    for (nm, dob), accts in sorted(by_name_dob.items()):
        if len(accts) > 1:
            groups.append(DuplicateGroup(
                signal="name_dob",
                match_key=f"{nm}|{dob}",
                same_person_recommended=True,
                exclusion_reason="",
                accounts=sorted(accts, key=lambda r: r.get("legacy_member_id") or ""),
            ))

    # Signal 2: shared primary email. One name behind the address is a
    # same-person candidate; several names behind it is a shared / family
    # mailbox -- surfaced for review but never recommended as one person.
    by_email: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in valid:
        e = _norm_email(r.get("legacy_email"))
        if e:
            by_email[e].append(r)
    for e, accts in sorted(by_email.items()):
        if len(accts) > 1:
            names = {normalize_name(r.get("real_name") or "") for r in accts}
            single_name = len(names) == 1
            groups.append(DuplicateGroup(
                signal="shared_email",
                match_key=e,
                same_person_recommended=single_name,
                exclusion_reason="" if single_name else "different_name_shared_email",
                accounts=sorted(accts, key=lambda r: r.get("legacy_member_id") or ""),
            ))

    for i, g in enumerate(groups, start=1):
        g.group_id = f"A{i:04d}"
    return groups


def write_stage_a_review_csv(groups: list[DuplicateGroup], out_path: Path) -> int:
    """Write one review row per (group, account). Returns the row count."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=REVIEW_FIELDS, lineterminator="\n")
        w.writeheader()
        for g in groups:
            for a in g.accounts:
                w.writerow({
                    "group_id": g.group_id,
                    "signal": g.signal,
                    "match_key": g.match_key,
                    "same_person_recommended": "yes" if g.same_person_recommended else "no",
                    "exclusion_reason": g.exclusion_reason,
                    "group_size": str(len(g.accounts)),
                    "legacy_member_id": a.get("legacy_member_id") or "",
                    "real_name": a.get("real_name") or "",
                    "normalized_name": normalize_name(a.get("real_name") or ""),
                    "birth_date": _full_dob(a),
                    "legacy_email": _norm_email(a.get("legacy_email")),
                    "legacy_user_id": a.get("legacy_user_id") or "",
                    "city": a.get("city") or "",
                    "region": a.get("region") or "",
                    "country": a.get("country") or "",
                })
                n += 1
    return n


def stage_a_duplicate_accounts(csv_path: Path, out_path: Path) -> dict[str, object]:
    """Read the intermediate CSV, build the duplicate-account review groups, and
    write the review CSV. Returns a summary of counts. Writes only the review
    artifact -- no database write, no account merge."""
    with Path(csv_path).open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    groups = build_stage_a_groups(rows)
    review_rows = write_stage_a_review_csv(groups, Path(out_path))

    name_dob = [g for g in groups if g.signal == "name_dob"]
    email = [g for g in groups if g.signal == "shared_email"]
    email_same = [g for g in email if g.same_person_recommended]
    email_excluded = [g for g in email if not g.same_person_recommended]
    return {
        "valid": len(_valid_rows(rows)),
        "name_dob_groups": len(name_dob),
        "name_dob_accounts": sum(len(g.accounts) for g in name_dob),
        "shared_email_groups": len(email),
        "shared_email_same_person": len(email_same),
        "shared_email_excluded_different_name": len(email_excluded),
        "review_rows": review_rows,
        "out_path": str(out_path),
    }


def run_stage_a(csv_path: Path, out_path: Path) -> int:
    if not csv_path.exists():
        print(
            f"error: intermediate CSV not found at {csv_path}.\n"
            "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
            file=sys.stderr,
        )
        return 1
    s = stage_a_duplicate_accounts(csv_path, out_path)
    print(f"member_valid=1: {s['valid']}")
    print(f"name+full-DOB duplicate groups: {s['name_dob_groups']}  "
          f"(accounts: {s['name_dob_accounts']})")
    print(f"shared-email groups: {s['shared_email_groups']}  "
          f"(same-person candidates: {s['shared_email_same_person']}, "
          f"different-name excluded: {s['shared_email_excluded_different_name']})")
    print(f"review CSV: {out_path}  ({s['review_rows']} rows)  -- review only, no accounts merged")
    return 0


# ---------------------------------------------------------------------------
# Profiler -- read-only sizing of the duplicate / DOB edge-case patterns
# ---------------------------------------------------------------------------

def profile(csv_path: Path) -> int:
    """Read-only: print the duplicate-account and DOB edge-case patterns Stage A
    and Stage B must handle, using the canonical normalizer so the counts match
    the reconciliation. Counts only -- no member data is written or logged."""
    if not csv_path.exists():
        print(
            f"error: intermediate CSV not found at {csv_path}.\n"
            "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
            file=sys.stderr,
        )
        return 1

    with csv_path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    valid = _valid_rows(rows)
    print(f"rows: {len(rows)}   member_valid=1: {len(valid)}")

    names = Counter(normalize_name(r.get("real_name") or "") for r in valid if normalize_name(r.get("real_name") or ""))
    ndup = {k: v for k, v in names.items() if v > 1}
    print(f"names on >1 account: {len(ndup)}  (accounts: {sum(ndup.values())})")

    email_names: dict[str, set[str]] = defaultdict(set)
    ecnt: Counter[str] = Counter()
    for r in valid:
        e = _norm_email(r.get("legacy_email"))
        if e:
            ecnt[e] += 1
            email_names[e].add(normalize_name(r.get("real_name") or ""))
    edup = {k: v for k, v in ecnt.items() if v > 1}
    ediff = sum(1 for e, ns in email_names.items() if len(ns) > 1)
    print(f"primary emails on >1 account: {len(edup)}  (rows: {sum(edup.values())}; different-name groups: {ediff})")

    full = sum(1 for r in valid if _full_dob(r))
    print(f"full date of birth present: {full}   absent/partial: {len(valid) - full}")

    nd: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for r in valid:
        n, d = normalize_name(r.get("real_name") or ""), _full_dob(r)
        if n and d:
            nd[(n, d)].append(r)
    nddup = {k: v for k, v in nd.items() if len(v) > 1}
    nd_diff_email = sum(
        1
        for grp in nddup.values()
        if len({_norm_email(x.get("legacy_email")) for x in grp if _norm_email(x.get("legacy_email"))}) > 1
    )
    print(f"(name+full-DOB) groups on >1 account: {len(nddup)}  "
          f"(accounts: {sum(len(v) for v in nddup.values())}; different-email groups: {nd_diff_email})")
    return 0


# ---------------------------------------------------------------------------
# Stage B and the QC gate -- not implemented
# ---------------------------------------------------------------------------

def stage_b_link_historical_persons(*args: object, **kwargs: object) -> object:
    raise NotImplementedError(
        "Stage B (dump->historical_persons linking) is not implemented: the "
        "id-crosswalk / unique-name+DOB / unique-name+email precedence and its "
        "review CSV are still to build."
    )


def qc_gate(*args: object, **kwargs: object) -> object:
    raise NotImplementedError(
        "The pre-apply QC gate is not implemented (zero duplicate "
        "historical_persons.legacy_member_id, zero ambiguous links applied). "
        "run_legacy_members.sh --load refuses to apply until this gate passes."
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Legacy-member identity reconciliation; see the module docstring."
    )
    ap.add_argument("--profile", action="store_true",
                    help="print duplicate / DOB edge-case counts from the intermediate CSV (read-only)")
    ap.add_argument("--stage-a", action="store_true",
                    help="build the Stage A duplicate-account review CSV (review only; merges nothing)")
    ap.add_argument("--qc-gate", action="store_true",
                    help="run the pre-apply QC gate (not implemented; called by run_legacy_members.sh)")
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="intermediate CSV to read")
    ap.add_argument("--out", type=Path, default=DEFAULT_STAGE_A_REVIEW_CSV,
                    help="Stage A review CSV output path (git-ignored out/ by default)")
    ap.add_argument("--db", type=Path, default=None, help="target database (used by the QC gate once implemented)")
    args = ap.parse_args()

    if args.profile:
        sys.exit(profile(args.csv))
    if args.stage_a:
        sys.exit(run_stage_a(args.csv, args.out))
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
