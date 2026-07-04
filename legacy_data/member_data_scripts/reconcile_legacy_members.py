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
  * Stage B -- dump account to historical_persons linking (implemented). Proposes
    a link for each account whose evidence resolves to exactly one historical
    person, by precedence: a verified id crosswalk (the person already names a
    valid account), then a unique normalized name + full date of birth, then a
    unique normalized name + email. historical_persons carry no date of birth or
    email, so the match is on the normalized name and the account's DOB or email
    is the corroborating attribute that picks a single account. Anything not
    uniquely resolved goes to the review CSV; no historical person is created.
  * QC gate -- the pre-apply check (implemented). Reads the Stage A and Stage B
    artifacts and fails if applying the proposals would break an identity
    invariant: the same historical person proposed for two accounts, the same
    legacy member proposed for two persons (a duplicate
    historical_persons.legacy_member_id), or a proposal that auto-applies a
    candidate Stage B set aside for review. Review inventory is counted, never
    fatal on its own. It reads only; it writes nothing.

The load stays blocked until the apply path is wired: run_legacy_members.sh
--load calls the QC gate here, but nothing yet produces the Stage A / Stage B
artifacts ahead of it or applies the proposed links, so --apply stays refused.

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
import sqlite3
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
DEFAULT_STAGE_B_PROPOSED_CSV = Path(
    "legacy_data/member_data_scripts/out/stage_b_proposed_links.csv"
)
DEFAULT_STAGE_B_REVIEW_CSV = Path(
    "legacy_data/member_data_scripts/out/stage_b_link_review.csv"
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
# Stage B -- dump account -> historical_persons linking
# ---------------------------------------------------------------------------
#
# historical_persons carry a name and, on the rows already attributed to an
# account, a legacy_member_id -- but no date of birth and no email. So the match
# is on the normalized name on both sides, and the account's full date of birth
# or email is the corroborating attribute that picks a single account when a name
# is shared. Precedence, highest first:
#
#   1. verified id crosswalk -- an historical person already carries a
#      legacy_member_id that resolves to a member_valid=1 account.
#   2. unique normalized name + full DOB -- for an as-yet-unlinked person whose
#      name matches exactly one full-DOB account.
#   3. unique normalized name + email -- same, corroborated by a present email
#      when no full DOB is available.
#
# Anything that is not a single unambiguous candidate goes to the review CSV and
# is never proposed. No historical person is ever created, and nothing is written
# to the database.

PROPOSED_LINK_FIELDS = [
    "historical_person_id", "person_name", "legacy_member_id", "real_name",
    "normalized_name", "match_signal", "account_birth_date", "account_email",
]
LINK_REVIEW_FIELDS = [
    "review_group", "reason", "normalized_name", "hp_count", "candidate_count",
    "historical_person_id", "person_name", "legacy_member_id", "real_name",
    "account_birth_date", "account_email",
]


def _proposed_link_row(hp: dict[str, str], acct: dict[str, str], signal: str) -> dict[str, str]:
    return {
        "historical_person_id": hp.get("person_id") or "",
        "person_name": hp.get("person_name") or "",
        "legacy_member_id": acct.get("legacy_member_id") or "",
        "real_name": acct.get("real_name") or "",
        "normalized_name": normalize_name(acct.get("real_name") or ""),
        "match_signal": signal,
        "account_birth_date": _full_dob(acct),
        "account_email": _norm_email(acct.get("legacy_email")),
    }


def _link_review_rows(reason: str, name: str, hps: list[dict[str, str]],
                      accts: list[dict[str, str]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for hp in hps:
        for a in accts:
            rows.append({
                "review_group": "",
                "reason": reason,
                "normalized_name": name,
                "hp_count": str(len(hps)),
                "candidate_count": str(len(accts)),
                "historical_person_id": hp.get("person_id") or "",
                "person_name": hp.get("person_name") or "",
                "legacy_member_id": a.get("legacy_member_id") or "",
                "real_name": a.get("real_name") or "",
                "account_birth_date": _full_dob(a),
                "account_email": _norm_email(a.get("legacy_email")),
            })
    return rows


def build_stage_b(
    accounts: list[dict[str, str]], hps: list[dict[str, str]]
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Propose dump-account -> historical_person links by the approved precedence.

    Returns (proposed_links, review_rows). Pure and deterministic: it creates no
    historical persons, auto-links nothing ambiguous, and writes nothing.
    """
    valid = _valid_rows(accounts)
    acct_by_id: dict[str, dict[str, str]] = {}
    for a in valid:
        lid = (a.get("legacy_member_id") or "").strip()
        if lid and lid not in acct_by_id:
            acct_by_id[lid] = a  # duplicate account ids are Stage A's concern

    proposed: list[dict[str, str]] = []
    consumed_ids: set[str] = set()

    # Tier 1: verified id crosswalk -- the person already names a valid account.
    for hp in hps:
        lid = (hp.get("legacy_member_id") or "").strip()
        if lid and lid in acct_by_id:
            proposed.append(_proposed_link_row(hp, acct_by_id[lid], "verified_id"))
            consumed_ids.add(lid)

    # Name matching runs only over persons with no asserted link, and accounts a
    # verified link did not already consume.
    unlinked_hps = [hp for hp in hps if not (hp.get("legacy_member_id") or "").strip()]
    by_name_hp: dict[str, list[dict[str, str]]] = defaultdict(list)
    for hp in unlinked_hps:
        by_name_hp[normalize_name(hp.get("person_name") or "")].append(hp)
    by_name_acct: dict[str, list[dict[str, str]]] = defaultdict(list)
    for a in valid:
        if (a.get("legacy_member_id") or "").strip() in consumed_ids:
            continue
        by_name_acct[normalize_name(a.get("real_name") or "")].append(a)

    review: list[dict[str, str]] = []
    for name in sorted(by_name_hp):
        if not name:
            continue  # a nameless person cannot be name-matched
        hp_list = sorted(by_name_hp[name], key=lambda h: h.get("person_id") or "")
        acct_list = sorted(by_name_acct.get(name, []), key=lambda a: a.get("legacy_member_id") or "")
        if not acct_list:
            continue  # no dump account by this name; the person stays unlinked
        if len(hp_list) > 1:
            # Several people share the name: which one is ambiguous -> review.
            review.extend(_link_review_rows("multiple_persons_same_name", name, hp_list, acct_list))
            continue
        hp = hp_list[0]
        dob_accts = [a for a in acct_list if _full_dob(a)]
        if len(dob_accts) == 1:
            proposed.append(_proposed_link_row(hp, dob_accts[0], "name_dob"))
            continue
        if len(dob_accts) > 1:
            review.extend(_link_review_rows("multiple_full_dob_candidates", name, [hp], dob_accts))
            continue
        email_accts = [a for a in acct_list if _norm_email(a.get("legacy_email"))]
        if len(email_accts) == 1:
            proposed.append(_proposed_link_row(hp, email_accts[0], "name_email"))
            continue
        if len(email_accts) > 1:
            review.extend(_link_review_rows("multiple_email_candidates", name, [hp], email_accts))
            continue
        # A name match with neither a full DOB nor an email is too weak to
        # propose: leave it for a human.
        review.extend(_link_review_rows("name_only_no_dob_or_email", name, [hp], acct_list))

    proposed.sort(key=lambda r: (r["historical_person_id"], r["legacy_member_id"]))
    review.sort(key=lambda r: (r["normalized_name"], r["reason"],
                               r["historical_person_id"], r["legacy_member_id"]))
    prev: tuple[str, str] | None = None
    gid = 0
    for r in review:
        key = (r["normalized_name"], r["reason"])
        if key != prev:
            gid += 1
            prev = key
        r["review_group"] = f"B{gid:04d}"
    return proposed, review


def read_historical_persons(db_path: Path) -> list[dict[str, str]]:
    """Read-only: the name and any asserted account link per historical person."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT person_id, person_name, legacy_member_id FROM historical_persons"
        ).fetchall()
    finally:
        conn.close()
    return [{k: ("" if r[k] is None else str(r[k])) for k in r.keys()} for r in rows]


def _write_rows(rows: list[dict[str, str]], fields: list[str], out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def stage_b_link_historical_persons(
    csv_path: Path, db_path: Path, proposed_out: Path, review_out: Path
) -> dict[str, object]:
    """Read the intermediate CSV and historical_persons, propose links, and write
    the proposed-link and review CSVs. Read-only on the database; proposes, never
    applies."""
    with Path(csv_path).open(encoding="utf-8", newline="") as f:
        accounts = list(csv.DictReader(f))
    hps = read_historical_persons(Path(db_path))
    proposed, review = build_stage_b(accounts, hps)
    _write_rows(proposed, PROPOSED_LINK_FIELDS, Path(proposed_out))
    _write_rows(review, LINK_REVIEW_FIELDS, Path(review_out))

    valid_ids = {(a.get("legacy_member_id") or "").strip()
                 for a in _valid_rows(accounts) if (a.get("legacy_member_id") or "").strip()}
    orphans = sum(1 for hp in hps
                  if (hp.get("legacy_member_id") or "").strip()
                  and (hp.get("legacy_member_id") or "").strip() not in valid_ids)
    return {
        "hp_total": len(hps),
        "proposed_total": len(proposed),
        "verified_id_links": sum(1 for r in proposed if r["match_signal"] == "verified_id"),
        "name_dob_links": sum(1 for r in proposed if r["match_signal"] == "name_dob"),
        "name_email_links": sum(1 for r in proposed if r["match_signal"] == "name_email"),
        "review_rows": len(review),
        "review_groups": len({r["review_group"] for r in review}),
        "hp_linked_to_missing_account": orphans,
        "proposed_out": str(proposed_out),
        "review_out": str(review_out),
    }


def run_stage_b(csv_path: Path, db_path: Path | None,
                proposed_out: Path, review_out: Path) -> int:
    if not csv_path.exists():
        print(
            f"error: intermediate CSV not found at {csv_path}.\n"
            "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
            file=sys.stderr,
        )
        return 1
    if db_path is None or not Path(db_path).exists():
        print(
            f"error: Stage B needs a built database with historical_persons (--db {db_path}).\n"
            "  Build it first with: scripts/reset-local-db.sh.",
            file=sys.stderr,
        )
        return 1
    s = stage_b_link_historical_persons(csv_path, db_path, proposed_out, review_out)
    print(f"historical_persons: {s['hp_total']}")
    print(f"proposed links: {s['proposed_total']}  "
          f"(verified id: {s['verified_id_links']}, name+DOB: {s['name_dob_links']}, "
          f"name+email: {s['name_email_links']})")
    print(f"review rows: {s['review_rows']}  (groups: {s['review_groups']})")
    print(f"historical persons linked to a missing account: {s['hp_linked_to_missing_account']}")
    print(f"proposed CSV: {proposed_out}")
    print(f"review CSV:   {review_out}   -- review only, nothing linked or written to the database")
    return 0


# ---------------------------------------------------------------------------
# QC gate -- the pre-apply check that un-blocks the write
# ---------------------------------------------------------------------------
#
# The gate consumes the review and proposal artifacts the earlier stages wrote
# and decides whether the proposed links are safe to apply. It reads only; it
# never writes. It aborts (a fatal finding) when applying the proposals would
# break an identity invariant:
#
#   * the same historical person is proposed for more than one account;
#   * the same legacy member is proposed for more than one historical person
#     (which would put a duplicate value in historical_persons.legacy_member_id);
#   * a proposal auto-applies a candidate Stage B set aside for review.
#
# Stage A duplicate-account groups and Stage B review rows are review inventory:
# they are counted and reported, never fatal on their own -- only a review
# candidate that also appears among the proposals is fatal.


def evaluate_qc(
    stage_a_rows: list[dict[str, str]],
    proposed: list[dict[str, str]],
    stage_b_review: list[dict[str, str]],
) -> dict[str, object]:
    """Decide pass/fail from the three artifacts. Pure; reads and writes nothing.

    Returns a result with `passed`, the human-readable `fatal` findings, and the
    review-inventory counts.
    """
    fatal: list[str] = []

    hp_counts = Counter(r.get("historical_person_id", "") for r in proposed)
    dup_hp = sorted(k for k, v in hp_counts.items() if k and v > 1)
    if dup_hp:
        fatal.append(
            "proposed links assign the same historical person to more than one "
            f"account: {dup_hp}"
        )

    lid_counts = Counter(r.get("legacy_member_id", "") for r in proposed)
    dup_lid = sorted(k for k, v in lid_counts.items() if k and v > 1)
    if dup_lid:
        fatal.append(
            "proposed links assign the same legacy member to more than one "
            "historical person, which would duplicate "
            f"historical_persons.legacy_member_id: {dup_lid}"
        )

    review_lids = {r.get("legacy_member_id", "") for r in stage_b_review if r.get("legacy_member_id")}
    review_hps = {r.get("historical_person_id", "") for r in stage_b_review if r.get("historical_person_id")}
    proposed_lids = {r.get("legacy_member_id", "") for r in proposed if r.get("legacy_member_id")}
    proposed_hps = {r.get("historical_person_id", "") for r in proposed if r.get("historical_person_id")}
    amb_lids = sorted(proposed_lids & review_lids)
    amb_hps = sorted(proposed_hps & review_hps)
    if amb_lids:
        fatal.append(
            "proposed links would auto-apply legacy members Stage B set aside for "
            f"review: {amb_lids}"
        )
    if amb_hps:
        fatal.append(
            "proposed links would auto-apply historical persons Stage B set aside "
            f"for review: {amb_hps}"
        )

    return {
        "passed": not fatal,
        "fatal": fatal,
        "stage_a_review_groups": len({r.get("group_id", "") for r in stage_a_rows if r.get("group_id")}),
        "stage_a_review_rows": len(stage_a_rows),
        "proposed_links": len(proposed),
        "proposed_by_signal": dict(sorted(Counter(r.get("match_signal", "") for r in proposed).items())),
        "stage_b_review_groups": len({r.get("review_group", "") for r in stage_b_review if r.get("review_group")}),
        "stage_b_review_rows": len(stage_b_review),
        "stage_b_review_by_reason": dict(sorted(Counter(r.get("reason", "") for r in stage_b_review).items())),
    }


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    with Path(path).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def qc_gate(
    stage_a_review: Path, proposed_links: Path, stage_b_review: Path
) -> dict[str, object]:
    """Read the three artifacts and evaluate the gate. Read-only."""
    return evaluate_qc(
        _read_csv_rows(stage_a_review),
        _read_csv_rows(proposed_links),
        _read_csv_rows(stage_b_review),
    )


def run_qc_gate(stage_a_review: Path, proposed_links: Path, stage_b_review: Path) -> int:
    missing = [p for p in (stage_a_review, proposed_links, stage_b_review) if not Path(p).exists()]
    if missing:
        print(
            "error: QC gate needs the Stage A and Stage B artifacts; missing "
            f"{[str(p) for p in missing]}.\n"
            "  Produce them first with: reconcile_legacy_members.py --stage-a  and  --stage-b.",
            file=sys.stderr,
        )
        return 1
    result = qc_gate(stage_a_review, proposed_links, stage_b_review)
    print(f"Stage A duplicate-account review: {result['stage_a_review_groups']} groups, "
          f"{result['stage_a_review_rows']} rows")
    print(f"Stage B proposed links: {result['proposed_links']}  {result['proposed_by_signal']}")
    print(f"Stage B link review: {result['stage_b_review_groups']} groups, "
          f"{result['stage_b_review_rows']} rows  {result['stage_b_review_by_reason']}")
    if result["passed"]:
        print("QC gate: PASS -- proposed links are unambiguous and non-duplicating.")
        return 0
    print("QC gate: FAIL -- apply is blocked:", file=sys.stderr)
    for f in result["fatal"]:
        print(f"  - {f}", file=sys.stderr)
    return 1


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Legacy-member identity reconciliation; see the module docstring."
    )
    ap.add_argument("--profile", action="store_true",
                    help="print duplicate / DOB edge-case counts from the intermediate CSV (read-only)")
    ap.add_argument("--stage-a", action="store_true",
                    help="build the Stage A duplicate-account review CSV (review only; merges nothing)")
    ap.add_argument("--stage-b", action="store_true",
                    help="build the Stage B historical-person link proposals + review CSV "
                         "(read-only on the database; proposes, never applies)")
    ap.add_argument("--qc-gate", action="store_true",
                    help="run the pre-apply QC gate over the Stage A + Stage B artifacts "
                         "(read-only; called by run_legacy_members.sh)")
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="intermediate CSV to read")
    ap.add_argument("--out", type=Path, default=DEFAULT_STAGE_A_REVIEW_CSV,
                    help="Stage A review CSV output path (git-ignored out/ by default)")
    ap.add_argument("--proposed-out", type=Path, default=DEFAULT_STAGE_B_PROPOSED_CSV,
                    help="Stage B proposed-link CSV output path (git-ignored out/ by default)")
    ap.add_argument("--review-out", type=Path, default=DEFAULT_STAGE_B_REVIEW_CSV,
                    help="Stage B link-review CSV output path (git-ignored out/ by default)")
    ap.add_argument("--db", type=Path, default=None,
                    help="built database, read-only for Stage B historical_persons and the QC gate")
    args = ap.parse_args()

    if args.profile:
        sys.exit(profile(args.csv))
    if args.stage_a:
        sys.exit(run_stage_a(args.csv, args.out))
    if args.stage_b:
        sys.exit(run_stage_b(args.csv, args.db, args.proposed_out, args.review_out))
    if args.qc_gate:
        sys.exit(run_qc_gate(args.out, args.proposed_out, args.review_out))
    ap.print_help()
    sys.exit(2)


if __name__ == "__main__":
    main()
