#!/usr/bin/env python3
"""Identity reconciliation for the legacy-site member intake.

The dump is dirty: many people hold several accounts, and some emails are shared
across accounts, so accounts cannot be auto-merged. Every stage here is
read-until-reviewed -- it groups accounts for a human to adjudicate and writes a
git-ignored review CSV; it never merges accounts, never auto-links persons, and
never writes to the database.

Stages:
  * Stage A -- intra-dump duplicate accounts (implemented). Groups member_valid=1
    accounts by one review signal: same normalized name + full date of birth.
    Shared-email and shared-user-id accounts are not grouped here: every account
    in such a collision group is held out of the reconcilable universe entirely
    (see below) and listed with its name and partners in the excluded-accounts
    CSV, where the adjudicator distinguishes a duplicate account (same name) from
    a shared family mailbox (different names). Each account stays its own row;
    the review CSV is an adjudication aid, not a merge.
  * Stage B -- dump account to historical_persons linking (implemented). Proposes
    a link only when the evidence resolves to exactly one historical person AND
    exactly one dump account: a verified id crosswalk (the person already names a
    valid account), or a unique normalized name borne by a single account that
    carries a full date of birth or an email. historical_persons carry no date of
    birth or email, so when SEVERAL accounts share the matched name there is
    nothing to corroborate against -- a DOB or email on one of them is a
    completeness signal, not identity evidence, and the whole group goes to the
    review CSV. Anything not uniquely resolved goes to the review CSV; no
    historical person is created.
  * QC gate -- the pre-apply check (implemented). Reads the Stage A and Stage B
    artifacts and fails if applying the proposals would break an identity
    invariant: the same historical person proposed for two accounts, the same
    legacy member proposed for two persons (a duplicate
    historical_persons.legacy_member_id), or a proposal that auto-applies a
    candidate Stage B set aside for review. Review inventory is counted, never
    fatal on its own. It reads only; it writes nothing.

run_legacy_members.sh --load runs Stage A, Stage B, and the QC gate here and
re-runs the honors backfill over the proposals, all read-only. run_legacy_members.sh
--load --apply then loads the reconciled members and applies the proposed links,
each write guarded and individually reversible; without --apply the flow stays
read-only.

Name normalization is the canonical AliasResolver.normalize_name (NFKD
accent-fold, lowercase, separators-to-space, in-word punctuation strip) shared by
every identity-resolution stage, so a name that groups here groups the same way
downstream. A full date of birth is month, day, and year all present (the
extractor emits birth_date only in that case).

The account universe both stages may propose from is member_valid=1 minus the
email / user-id collision accounts. A shared email or user id is an ambiguous
identity, so the ENTIRE collision group is held out and routed to the held-out
review CSV -- the same hold-the-whole-group rule the member loader applies, so a
proposal never references an account the load will not import, and the two
universes stay aligned by construction.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
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
DEFAULT_EXCLUDED_ACCOUNTS_CSV = Path(
    "legacy_data/member_data_scripts/out/reconciliation_excluded_accounts.csv"
)

# The email columns the member loader checks for cross-account collisions. In the
# current dump only the primary is populated, but the loader drops on any of the
# three, so the reconciliation must consider all three to stay aligned with it.
EMAIL_COLS = ("legacy_email", "legacy_email2", "legacy_email3")


def _norm_email(s: str | None) -> str:
    return (s or "").strip().lower()


def _full_dob(row: dict[str, str]) -> str:
    return (row.get("birth_date") or "").strip()


def _valid_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return [r for r in rows if (r.get("member_valid") or "").strip() == "1"]


def collision_excluded_accounts(valid_rows: list[dict[str, str]]) -> dict[str, dict[str, object]]:
    """member_valid=1 accounts that share an email or a user id with another such
    account. A shared email or user id is an ambiguous identity, so the ENTIRE
    collision group is held: the member loader excludes the same whole groups from
    legacy_members, and reconciliation must not propose a link for any of them, or
    the link write would reference an account the loader excluded.
    Returns {legacy_member_id: {"reason": str, "partners": [ids]}}."""
    email_ids: dict[str, set[str]] = defaultdict(set)
    uid_ids: dict[str, set[str]] = defaultdict(set)
    for r in valid_rows:
        mid = (r.get("legacy_member_id") or "").strip()
        if not mid:
            continue
        for col in EMAIL_COLS:
            e = _norm_email(r.get(col))
            if e:
                email_ids[e].add(mid)
        uid = (r.get("legacy_user_id") or "").strip()
        if uid:
            uid_ids[uid].add(mid)

    email_excluded: dict[str, set[str]] = defaultdict(set)
    for ids in email_ids.values():
        if len(ids) > 1:
            for mid in ids:
                email_excluded[mid].update(ids - {mid})
    uid_excluded: dict[str, set[str]] = defaultdict(set)
    for ids in uid_ids.values():
        if len(ids) > 1:
            for mid in ids:
                uid_excluded[mid].update(ids - {mid})

    excluded: dict[str, dict[str, object]] = {}
    for mid in set(email_excluded) | set(uid_excluded):
        reasons = []
        partners: set[str] = set()
        if mid in email_excluded:
            reasons.append("email_collision")
            partners |= email_excluded[mid]
        if mid in uid_excluded:
            reasons.append("user_id_collision")
            partners |= uid_excluded[mid]
        excluded[mid] = {"reason": "+".join(reasons), "partners": sorted(partners)}
    return excluded


def reconcilable_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], dict[str, dict[str, object]]]:
    """The account universe Stage A and Stage B may propose from: member_valid=1
    minus the email / user-id collision accounts the member loader excludes.
    Returns (kept_rows, excluded) so a caller can also report what was held out."""
    valid = _valid_rows(rows)
    excluded = collision_excluded_accounts(valid)
    kept = [r for r in valid if (r.get("legacy_member_id") or "").strip() not in excluded]
    return kept, excluded


EXCLUDED_ACCOUNT_FIELDS = [
    "legacy_member_id", "reason", "real_name", "legacy_email", "legacy_user_id", "collision_partners",
]


def write_excluded_accounts_csv(rows: list[dict[str, str]],
                                excluded: dict[str, dict[str, object]], out_path: Path) -> int:
    """Write the accounts reconciliation held out (and why), so the held-out set
    is reviewable rather than silent."""
    by_id = {(r.get("legacy_member_id") or "").strip(): r for r in rows}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=EXCLUDED_ACCOUNT_FIELDS, lineterminator="\n")
        w.writeheader()
        for mid in sorted(excluded):
            r = by_id.get(mid, {})
            w.writerow({
                "legacy_member_id": mid,
                "reason": excluded[mid]["reason"],
                "real_name": r.get("real_name") or "",
                "legacy_email": _norm_email(r.get("legacy_email")),
                "legacy_user_id": r.get("legacy_user_id") or "",
                "collision_partners": " ".join(excluded[mid]["partners"]),  # type: ignore[arg-type]
            })
    return len(excluded)


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
    applied merge: True for a name + full-DOB match.
    """
    signal: str
    match_key: str
    same_person_recommended: bool
    exclusion_reason: str
    accounts: list[dict[str, str]]
    group_id: str = field(default="")


def build_stage_a_groups(rows: list[dict[str, str]]) -> list[DuplicateGroup]:
    """Group reconcilable accounts that share a normalized name + full date of
    birth -- the strongest same-person duplicate-account signal in the dump.

    Runs over the reconcilable universe (member_valid=1 minus the email / user-id
    collision accounts the loader drops); shared-email accounts are held out to
    the collision-excluded review CSV instead. Returns only clusters of more than
    one account, each carrying a stable id. Pure and deterministic: it reads
    nothing, writes nothing, and merges nothing.
    """
    valid, _ = reconcilable_rows(rows)
    groups: list[DuplicateGroup] = []

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


def stage_a_duplicate_accounts(csv_path: Path, out_path: Path,
                               excluded_out: Path | None = None) -> dict[str, object]:
    """Read the intermediate CSV, build the duplicate-account review groups, and
    write the review CSV plus the held-out (collision-excluded) accounts CSV.
    Returns a summary of counts. Writes only review artifacts -- no database
    write, no account merge."""
    with Path(csv_path).open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    groups = build_stage_a_groups(rows)
    review_rows = write_stage_a_review_csv(groups, Path(out_path))
    kept, excluded = reconcilable_rows(rows)
    if excluded_out is not None:
        write_excluded_accounts_csv(rows, excluded, Path(excluded_out))

    name_dob = [g for g in groups if g.signal == "name_dob"]
    return {
        "valid": len(_valid_rows(rows)),
        "reconcilable": len(kept),
        "collision_excluded": len(excluded),
        "name_dob_groups": len(name_dob),
        "name_dob_accounts": sum(len(g.accounts) for g in name_dob),
        "review_rows": review_rows,
        "out_path": str(out_path),
        "excluded_out": str(excluded_out) if excluded_out is not None else "",
    }


def run_stage_a(csv_path: Path, out_path: Path, excluded_out: Path) -> int:
    if not csv_path.exists():
        print(
            f"error: intermediate CSV not found at {csv_path}.\n"
            "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
            file=sys.stderr,
        )
        return 1
    s = stage_a_duplicate_accounts(csv_path, out_path, excluded_out)
    print(f"member_valid=1: {s['valid']}  "
          f"(reconcilable: {s['reconcilable']}, held out on email/user-id collision: {s['collision_excluded']})")
    print(f"name+full-DOB duplicate groups: {s['name_dob_groups']}  "
          f"(accounts: {s['name_dob_accounts']})")
    print(f"review CSV: {out_path}  ({s['review_rows']} rows)  -- review only, no accounts merged")
    print(f"held-out accounts CSV: {excluded_out}  ({s['collision_excluded']} accounts)")
    return 0


# ---------------------------------------------------------------------------
# Stage A auto-merge -- collapse a clean name+full-DOB group to one survivor
# ---------------------------------------------------------------------------
#
# Ruling: at the final production load, accounts sharing an exact normalized name
# and an exact full date of birth are one person and are auto-merged into a single
# claimable record; only the residue where other fields actively contradict goes
# to human review. This runs on the reconcilable universe (member_valid=1 minus
# the shared-email / shared-user-id collision cohort, held out by construction),
# so a collision-cohort account can never enter a merge group.
#
# Survivor: the lowest legacy_member_id in the group (deterministic and stable).
#
# Column-by-column merge policy for the survivor row (every output field is
# specified; nothing is left to accidental survivor-row inheritance):
#   legacy_member_id        survivor's (the lowest id)
#   member_valid            "1" (the whole universe is member_valid=1)
#   legacy_user_id          survivor's handle; a loser's distinct non-empty handle
#                           is dropped only when that loser still has a preserved
#                           email to claim by, otherwise the group goes to review
#   legacy_email/2/3        union of every unique non-empty email across the group,
#                           survivor's first then the rest sorted, into the three
#                           slots; more than three unique emails -> review
#   real_name, display_name,
#   city, region, country,
#   bio, street_address,
#   postal_code             survivor's value (same person; country conflict is
#                           already a review block, and people move, so region and
#                           city keep the survivor's)
#   birth_date              survivor's (identical across the group by construction)
#   ifpa_join_date          earliest non-empty join date in the group
#   is_hof, is_bap,
#   legacy_is_admin,
#   legacy_ever_paid_tier2,
#   legacy_ever_paid_tier1_lifetime,
#   legacy_tier1_annual_active_at_cutover,
#   legacy_was_board_at_cutover   grant-relevant flags, OR-merged (1 if any account
#                                 has it) so no entitlement evidence is lost
#   legacy_board_underlying_paid_tier  first non-empty value among the board
#                                 accounts when was-board resolved to 1, else ""
# There is no member-modification timestamp in the extract, so the "latest
# modification" consolidation has no field to apply to here.
#
# A group is routed to human review (never merged) when any safety block holds:
#   too_many_emails         more than three unique emails to preserve
#   country_conflict        two accounts carry different non-empty countries
#   unpreservable_handle    a loser has a distinct non-empty handle and no email,
#                           so its only claim key would be lost
#   different_person_links  two accounts are already linked to different canonical
#                           persons (merging would fuse two people)
#   claim_state             an account already carries claim state in the database
#   collision_cohort        an account is in the shared-email/user-id cohort
#                           (excluded by construction; asserted defensively)

# Grant-relevant flags OR-merged so a merge never drops entitlement evidence.
_ENTITLEMENT_FLAGS = (
    "is_hof", "is_bap", "legacy_is_admin",
    "legacy_ever_paid_tier2", "legacy_ever_paid_tier1_lifetime",
    "legacy_tier1_annual_active_at_cutover", "legacy_was_board_at_cutover",
)

# Profile / descriptive fields taken verbatim from the survivor account.
_SURVIVOR_VERBATIM_FIELDS = (
    "member_valid", "legacy_user_id", "real_name", "display_name",
    "city", "region", "country", "bio", "birth_date",
    "street_address", "postal_code",
)

MERGE_MAP_FIELDS = [
    "group_id", "match_key", "survivor_legacy_member_id",
    "loser_legacy_member_id", "survivor_email_union",
]


def _flag_on(v: object) -> bool:
    return str(v or "").strip() == "1"


def _account_emails(row: dict[str, str]) -> list[str]:
    """The unique non-empty normalized emails an account carries, in column order."""
    seen: list[str] = []
    for col in EMAIL_COLS:
        e = _norm_email(row.get(col))
        if e and e not in seen:
            seen.append(e)
    return seen


def _survivor_id(accounts: list[dict[str, str]]) -> str:
    """Lowest legacy_member_id in the group. Numeric ids sort numerically; any
    non-numeric id sorts after all numeric ones, then lexically -- deterministic
    either way."""
    def key(r: dict[str, str]) -> tuple[int, int, str]:
        mid = (r.get("legacy_member_id") or "").strip()
        try:
            return (0, int(mid), mid)
        except ValueError:
            return (1, 0, mid)
    return (min(accounts, key=key).get("legacy_member_id") or "").strip()


def _union_emails(accounts: list[dict[str, str]], survivor: dict[str, str]) -> list[str]:
    """Every unique email in the group, the survivor's first, then the rest sorted."""
    ordered: list[str] = list(_account_emails(survivor))
    rest: set[str] = set()
    for a in accounts:
        for e in _account_emails(a):
            if e not in ordered:
                rest.add(e)
    return ordered + sorted(rest)


@dataclass
class MergeDecision:
    group_id: str
    match_key: str
    accounts: list[dict[str, str]]
    survivor_id: str
    action: str              # "merge" or "review"
    reason: str              # "" when merged, else the safety-block reason
    survivor_row: dict[str, str] | None
    loser_ids: list[str]


def evaluate_merge_group(group: DuplicateGroup,
                         links_by_account: dict[str, str] | None = None,
                         claimed_ids: set[str] | None = None,
                         ignore_blocks: frozenset[str] | None = None) -> MergeDecision:
    """Decide whether one name+full-DOB group auto-merges or goes to review, and
    build the survivor row when it merges. Pure and deterministic.

    `ignore_blocks` names safety blocks to skip for this group. It exists solely
    so a validated Stage A adjudication override can let an approved same-person
    group past the specific block it was reviewed for; it defaults to empty, so
    ordinary planning is unchanged."""
    links_by_account = links_by_account or {}
    claimed_ids = claimed_ids or set()
    ignore_blocks = ignore_blocks or frozenset()
    accounts = group.accounts
    survivor_id = _survivor_id(accounts)
    survivor = next(a for a in accounts
                    if (a.get("legacy_member_id") or "").strip() == survivor_id)
    losers = [a for a in accounts
              if (a.get("legacy_member_id") or "").strip() != survivor_id]

    def review(reason: str) -> MergeDecision:
        return MergeDecision(group.group_id, group.match_key, accounts,
                             survivor_id, "review", reason, None, [])

    ids = [(a.get("legacy_member_id") or "").strip() for a in accounts]

    # Safety block: any account already carries claim state in the database.
    if "claim_state" not in ignore_blocks and any(i in claimed_ids for i in ids):
        return review("claim_state")

    # Safety block: two accounts already linked to different canonical persons.
    linked_persons = {links_by_account[i] for i in ids
                      if links_by_account.get(i)}
    if "different_person_links" not in ignore_blocks and len(linked_persons) > 1:
        return review("different_person_links")

    # Safety block: conflicting non-empty countries.
    countries = {(a.get("country") or "").strip()
                 for a in accounts if (a.get("country") or "").strip()}
    if "country_conflict" not in ignore_blocks and len(countries) > 1:
        return review("country_conflict")

    # Safety block: more than three unique emails cannot fit the three columns.
    emails = _union_emails(accounts, survivor)
    if "too_many_emails" not in ignore_blocks and len(emails) > 3:
        return review("too_many_emails")

    # Safety block: a loser whose only claim key is a distinct handle with no
    # email would lose that key on merge.
    survivor_handle = (survivor.get("legacy_user_id") or "").strip()
    if "unpreservable_handle" not in ignore_blocks:
        for l in losers:
            h = (l.get("legacy_user_id") or "").strip()
            if h and h != survivor_handle and not _account_emails(l):
                return review("unpreservable_handle")

    # Clean merge: build the survivor row per the column policy above.
    row = dict(survivor)
    row["legacy_member_id"] = survivor_id
    for f in _SURVIVOR_VERBATIM_FIELDS:
        row[f] = survivor.get(f) or ""
    row["legacy_email"] = emails[0] if len(emails) > 0 else ""
    row["legacy_email2"] = emails[1] if len(emails) > 1 else ""
    row["legacy_email3"] = emails[2] if len(emails) > 2 else ""
    join_dates = sorted(d for d in ((a.get("ifpa_join_date") or "").strip()
                                    for a in accounts) if d)
    row["ifpa_join_date"] = join_dates[0] if join_dates else ""
    for f in _ENTITLEMENT_FLAGS:
        row[f] = "1" if any(_flag_on(a.get(f)) for a in accounts) else (survivor.get(f) or "")
    if _flag_on(row.get("legacy_was_board_at_cutover")):
        board_underlying = next(
            ((a.get("legacy_board_underlying_paid_tier") or "").strip()
             for a in accounts
             if _flag_on(a.get("legacy_was_board_at_cutover"))
             and (a.get("legacy_board_underlying_paid_tier") or "").strip()),
            (survivor.get("legacy_board_underlying_paid_tier") or ""))
        row["legacy_board_underlying_paid_tier"] = board_underlying
    else:
        row["legacy_board_underlying_paid_tier"] = \
            survivor.get("legacy_board_underlying_paid_tier") or ""

    loser_ids = sorted(((l.get("legacy_member_id") or "").strip() for l in losers),
                       key=lambda m: (int(m) if m.isdigit() else 1 << 62, m))
    return MergeDecision(group.group_id, group.match_key, accounts,
                         survivor_id, "merge", "", row, loser_ids)


# Every automated safety block, ignored for an explicit human-adjudicated merge:
# the maintainer has ruled the accounts are one person on the full evidence, so the
# merge is built directly. The fail-closed fingerprint still guards the account set.
_ALL_MERGE_BLOCKS = frozenset({
    "claim_state", "different_person_links", "country_conflict",
    "too_many_emails", "unpreservable_handle",
})


def _account_set_fingerprint_for(by_id: dict[str, dict[str, str]],
                                 ids: "frozenset[str]") -> str:
    """The raw-fact fingerprint of an account set, using the same normalizer the
    matcher uses. Raw birth dates pass through verbatim (empty when absent)."""
    import stage_a_overrides
    entries = [(i, normalize_name(by_id[i].get("real_name") or ""),
                (by_id[i].get("birth_date") or "").strip(),
                (by_id[i].get("country") or "").strip())
               for i in ids]
    return stage_a_overrides.account_set_fingerprint(entries)


def _apply_account_merge_overrides(rows: list[dict[str, str]],
                                   decisions: list,
                                   merge_overrides: list,
                                   links_by_account: dict[str, str] | None,
                                   claimed_ids: set[str] | None) -> list:
    """Turn validated merge_accounts overrides into extra merge decisions over
    accounts Stage A did not group. Read-only and deterministic: it builds the
    survivor row via the ordinary union (no DOB is invented or copied) and fails
    closed on any stale or malformed override before building anything."""
    import stage_a_overrides
    kept, _ = reconcilable_rows(rows)
    by_id = {(r.get("legacy_member_id") or "").strip(): r for r in kept}
    grouped_ids: set[str] = set()
    for d in decisions:
        for a in d.accounts:
            grouped_ids.add((a.get("legacy_member_id") or "").strip())

    validated = stage_a_overrides.validate_merge_account_overrides(
        merge_overrides, present_ids=set(by_id), grouped_ids=grouped_ids,
        fingerprint_of=lambda ids: _account_set_fingerprint_for(by_id, ids))

    extra: list = []
    for n, ids in enumerate(sorted(validated, key=lambda s: sorted(s)), start=1):
        accts = sorted((by_id[i] for i in ids),
                       key=lambda r: r.get("legacy_member_id") or "")
        g = DuplicateGroup(signal="adjudicated_merge",
                           match_key="adjudicated|" + "+".join(sorted(ids)),
                           same_person_recommended=True, exclusion_reason="",
                           accounts=accts, group_id=f"M{n:04d}")
        extra.append(evaluate_merge_group(g, links_by_account, claimed_ids,
                                          ignore_blocks=_ALL_MERGE_BLOCKS))
    return extra


def _privileged_merge_summaries(rows: list[dict[str, str]], merges: list) -> list[dict]:
    """One summary per (merge, privileged entitlement present on its survivor): the
    account set, its fingerprint, the raw value, and which source accounts carried
    it. Empty when no merge carries a privileged entitlement (the common case), so
    the disposition gate is a no-op for ordinary merges. Whether the flag arrived on
    the survivor or on a loser, the survivor's OR-union carries it here, and the
    source-account list records the provenance either way."""
    import entitlement_disposition as _ed
    out: list[dict] = []
    by_id: dict[str, dict[str, str]] | None = None
    for d in merges:
        if d.survivor_row is None:
            continue
        for ent in _ed.PRIVILEGED_ENTITLEMENTS:
            if not _flag_on(d.survivor_row.get(ent)):
                continue
            if by_id is None:
                kept, _ = reconcilable_rows(rows)
                by_id = {(r.get("legacy_member_id") or "").strip(): r for r in kept}
            ids = frozenset([d.survivor_id, *d.loser_ids])
            sources = sorted((a.get("legacy_member_id") or "").strip()
                             for a in d.accounts if _flag_on(a.get(ent)))
            out.append({
                "account_ids": ids,
                "fingerprint": _account_set_fingerprint_for(by_id, ids),
                "entitlement": ent,
                "raw_value": str(d.survivor_row.get(ent)),
                "source_accounts": sources,
            })
    return out


def plan_auto_merges(rows: list[dict[str, str]],
                     links_by_account: dict[str, str] | None = None,
                     claimed_ids: set[str] | None = None,
                     overrides: "list | None" = None,
                     entitlement_dispositions: "list | None" = None) -> dict[str, object]:
    """Evaluate every name+full-DOB group and split into merges and reviews.
    Returns the decisions plus reason counts; writes nothing.

    When `overrides` is supplied (a validated Stage A adjudication list), each
    override is checked against the live baseline and applied via
    stage_a_overrides.apply_overrides, which fails closed on any mismatch. With
    no overrides the output is byte-identical to plain baseline planning.

    Any merge whose survivor carries a production-authority entitlement
    (legacy_is_admin) requires an explicit entitlement disposition; the plan fails
    closed without one. Merges carrying no such entitlement need no disposition and
    are unaffected, so ordinary planning stays byte-identical."""
    groups = build_stage_a_groups(rows)
    decisions = [evaluate_merge_group(g, links_by_account, claimed_ids)
                 for g in groups]
    if overrides:
        import stage_a_overrides
        group_overrides = [o for o in overrides
                           if o.decision in (stage_a_overrides.APPROVE,
                                             stage_a_overrides.DO_NOT_MERGE)]
        merge_overrides = [o for o in overrides
                           if o.decision == stage_a_overrides.MERGE_ACCOUNTS]
        if group_overrides:
            pairs = list(zip(groups, decisions))
            decisions = stage_a_overrides.apply_overrides(
                pairs, group_overrides,
                reevaluate=lambda g, ign: evaluate_merge_group(
                    g, links_by_account, claimed_ids, ignore_blocks=ign),
            )
        if merge_overrides:
            decisions = decisions + _apply_account_merge_overrides(
                rows, decisions, merge_overrides, links_by_account, claimed_ids)
    merges = [d for d in decisions if d.action == "merge"]
    reviews = [d for d in decisions if d.action == "review"]

    # Entitlement-disposition gate: a merge carrying a privileged entitlement must
    # carry an explicit disposition. No privileged merge and no dispositions -> no-op.
    privileged = _privileged_merge_summaries(rows, merges)
    entitlement_audit: list = []
    if privileged or entitlement_dispositions:
        import entitlement_disposition as _ed
        entitlement_audit = _ed.validate_and_audit(privileged, entitlement_dispositions or [])

    return {
        "decisions": decisions,
        "merges": merges,
        "reviews": reviews,
        "reason_counts": Counter(d.reason for d in reviews),
        "loser_count": sum(len(d.loser_ids) for d in merges),
        "entitlement_audit": entitlement_audit,
    }


def load_links_by_account(proposed_links_csv: Path) -> dict[str, str]:
    """account legacy_member_id -> historical_person_id from a Stage B proposal
    CSV, when present; empty when it is not."""
    out: dict[str, str] = {}
    if not proposed_links_csv.exists():
        return out
    with proposed_links_csv.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            mid = (r.get("legacy_member_id") or "").strip()
            hp = (r.get("historical_person_id") or "").strip()
            if mid and hp:
                out[mid] = hp
    return out


def write_merge_map_csv(merges: list[MergeDecision], out_path: Path) -> int:
    """Deterministic loser->survivor mapping artifact (one row per loser)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=MERGE_MAP_FIELDS, lineterminator="\n")
        w.writeheader()
        for d in sorted(merges, key=lambda x: x.group_id):
            union = " ".join(e for e in (
                d.survivor_row.get("legacy_email") if d.survivor_row else "",
                d.survivor_row.get("legacy_email2") if d.survivor_row else "",
                d.survivor_row.get("legacy_email3") if d.survivor_row else "",
            ) if e)
            for loser in d.loser_ids:
                w.writerow({
                    "group_id": d.group_id,
                    "match_key": d.match_key,
                    "survivor_legacy_member_id": d.survivor_id,
                    "loser_legacy_member_id": loser,
                    "survivor_email_union": union,
                })
                n += 1
    return n


# Entitlement flags whose loss would silently drop a grant. The final merge is
# refused when either is unpopulated / unavailable in the source, so a board or
# tier-1 grant on a duplicate account cannot be OR-merged out of existence.
_POPULATION_REQUIRED = ("legacy_tier1_annual_active_at_cutover",
                        "legacy_was_board_at_cutover")


def entitlement_population_status(rows: list[dict[str, str]]) -> dict[str, bool]:
    """Whether each population-required entitlement column carries any value."""
    return {c: any(_flag_on(r.get(c)) for r in rows) for c in _POPULATION_REQUIRED}


def load_stage_a_overrides(overrides_path: Path | None):
    """Load and return the validated-at-apply Stage A adjudication overrides, or
    [] when no path is given. Import is local so the reconciler runs with no
    override input and no new hard dependency."""
    import stage_a_overrides
    return stage_a_overrides.load_overrides(overrides_path)


def load_entitlement_dispositions(dispositions_path: Path | None):
    """Load and return the entitlement dispositions, or [] when no path is given.
    Local import so the reconciler runs with no disposition input."""
    import entitlement_disposition
    return entitlement_disposition.load_dispositions(dispositions_path)


def dry_run_auto_merge(csv_path: Path, proposed_links_csv: Path,
                       overrides_path: Path | None = None) -> int:
    """Read-only: report how the auto-merge would split the current dump into
    merges and reviews, with per-reason counts. Writes nothing, merges nothing."""
    if not csv_path.exists():
        print(f"error: intermediate CSV not found at {csv_path}.\n"
              "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
              file=sys.stderr)
        return 1
    with csv_path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    links = load_links_by_account(proposed_links_csv)
    overrides = load_stage_a_overrides(overrides_path)
    plan = plan_auto_merges(rows, links_by_account=links, overrides=overrides)
    merges, reviews = plan["merges"], plan["reviews"]
    kept, excluded = reconcilable_rows(rows)
    print("auto-merge dry run (read-only; no accounts merged)")
    print(f"  reconcilable universe:     {len(kept)} accounts "
          f"({len(excluded)} held out in the collision cohort)")
    print(f"  name+full-DOB groups:      {len(merges) + len(reviews)}")
    print(f"  would MERGE:               {len(merges)} groups "
          f"({plan['loser_count']} accounts collapsed into their survivor)")
    print(f"  routed to REVIEW:          {len(reviews)} groups")
    for reason, count in sorted(plan["reason_counts"].items()):
        print(f"    {reason}: {count}")
    return 0


DEFAULT_MERGED_CSV = Path(
    "legacy_data/member_data_scripts/out/legacy_members_merged.csv")
DEFAULT_MERGE_MAP_CSV = Path(
    "legacy_data/member_data_scripts/out/stage_a_merged_accounts.csv")


def write_merged_members_csv(csv_path: Path, plan: dict[str, object],
                             out_path: Path) -> dict[str, int]:
    """Write the merged member CSV for the final load: every input row except the
    merged-away losers, with each surviving row replaced by its consolidated
    record. Contradiction (review) groups are left as separate rows for human
    review. The input header is preserved exactly so the loader sees the same
    columns."""
    with Path(csv_path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    loser_ids: set[str] = set()
    survivor_row_by_id: dict[str, dict[str, str]] = {}
    for d in plan["merges"]:  # type: ignore[index]
        loser_ids.update(d.loser_ids)
        survivor_row_by_id[d.survivor_id] = d.survivor_row  # type: ignore[assignment]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in rows:
            mid = (r.get("legacy_member_id") or "").strip()
            if mid in loser_ids:
                continue
            src = survivor_row_by_id.get(mid, r)
            w.writerow({k: src.get(k, r.get(k, "")) for k in fieldnames})
            written += 1
    return {"written": written, "losers_removed": len(loser_ids)}


def _claimed_ids_from_db(db_path: Path | None) -> set[str]:
    """legacy_member_ids already carrying claim state in the destination DB, when
    a DB is available; empty otherwise. A soft planning input -- the loader's
    precheck is the hard, transactional guard."""
    if not db_path or not Path(db_path).exists():
        return set()
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                "SELECT legacy_member_id FROM legacy_members "
                "WHERE claimed_by_member_id IS NOT NULL").fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return set()
    return {(r[0] or "").strip() for r in rows if r[0]}


def run_final_merge(csv_path: Path, links_csv: Path, db_path: Path | None,
                    merged_out: Path, map_out: Path, review_out: Path,
                    overrides_path: Path | None = None) -> int:
    """Produce the final-load merge artifacts: the merged member CSV (survivors),
    the deterministic loser->survivor mapping, and the Stage A review CSV holding
    the contradiction groups. Read-only on the database; writes only out/ CSVs."""
    if not csv_path.exists():
        print(f"error: intermediate CSV not found at {csv_path}.\n"
              "  Produce it first with: run_legacy_members.sh --extract  (needs the dump).",
              file=sys.stderr)
        return 1
    with csv_path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    # Fail closed: refuse the final merge when a grant-bearing entitlement column
    # is unpopulated / unavailable in the source, so an OR-merge cannot silently
    # drop a board or tier-1 grant that the export simply failed to capture.
    pop = entitlement_population_status(rows)
    if not all(pop.values()):
        missing = [c for c, ok in pop.items() if not ok]
        print("error: entitlement-population guard FAILED CLOSED before the final merge.\n"
              f"  Unpopulated / unavailable in the source: {missing}.\n"
              "  A production export must carry these grant flags, or a grant on a duplicate\n"
              "  account could be OR-merged out of existence. Refusing to write merge artifacts.",
              file=sys.stderr)
        return 2

    links = load_links_by_account(links_csv)
    claimed = _claimed_ids_from_db(db_path)
    overrides = load_stage_a_overrides(overrides_path)
    plan = plan_auto_merges(rows, links_by_account=links, claimed_ids=claimed,
                            overrides=overrides)

    ms = write_merged_members_csv(csv_path, plan, merged_out)
    n_map = write_merge_map_csv(plan["merges"], map_out)  # type: ignore[arg-type]
    review_groups = [
        DuplicateGroup(signal="name_dob", match_key=d.match_key,
                       same_person_recommended=False, exclusion_reason=d.reason,
                       accounts=d.accounts, group_id=d.group_id)
        for d in plan["reviews"]  # type: ignore[union-attr]
    ]
    n_review = write_stage_a_review_csv(review_groups, review_out)

    print("final-load auto-merge artifacts written")
    print(f"  merged member CSV:  {merged_out}  "
          f"({ms['written']} rows; {ms['losers_removed']} losers collapsed)")
    print(f"  merge map:          {map_out}  ({n_map} loser rows)")
    print(f"  review CSV:         {review_out}  "
          f"({len(review_groups)} groups, {n_review} rows)")
    for reason, count in sorted(plan["reason_counts"].items()):  # type: ignore[union-attr]
        print(f"    review reason {reason}: {count}")
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
    historical persons, auto-links nothing ambiguous, and writes nothing. The
    account universe excludes the email / user-id collision accounts the member
    loader drops, so a proposal never references an account the load will not
    import.
    """
    valid, _ = reconcilable_rows(accounts)
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
        if len(acct_list) > 1:
            # Several dump accounts share the matched name. A full DOB or an
            # email on one of them is a completeness signal, not identity
            # evidence (there is no reference DOB or email on the person to
            # corroborate against), so nothing here may auto-select: the whole
            # group goes to a human.
            review.extend(_link_review_rows("multiple_accounts_same_name", name, [hp], acct_list))
            continue
        acct = acct_list[0]
        if _full_dob(acct):
            proposed.append(_proposed_link_row(hp, acct, "name_dob"))
            continue
        if _norm_email(acct.get("legacy_email")):
            proposed.append(_proposed_link_row(hp, acct, "name_email"))
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


# ---------------------------------------------------------------------------
# Stage A survivor view -- the reconciled account universe Stage B reads
# ---------------------------------------------------------------------------
#
# Stage B is otherwise computed independently of Stage A, so a duplicate-account
# pair that Stage A already approves for merge still reaches Stage B as two
# same-name accounts and blocks a link. The survivor view collapses ONLY the
# groups whose adjudicated Stage A disposition is "merge": each such group's loser
# accounts are hidden and its survivor is exposed once, carrying the approved field
# union so evidence that lived only on a loser (an email, an entitlement) is not
# discarded. Review, held, blocked, and adjudicated-distinct groups are never
# collapsed, and the view infers no merge of its own -- it mirrors the Stage A plan
# and nothing more.
#
# It fails closed: a stale plan/override or boundary fingerprint, a loser mapping
# to two survivors, a missing survivor, or an unapproved group presented as
# collapsed all raise before any account is hidden.


class StageASurvivorError(Exception):
    """A survivor-view construction that cannot be trusted. The caller must abort."""


@dataclass(frozen=True)
class StageASurvivorView:
    logical_accounts: list          # account rows Stage B reads (survivors + singles)
    loser_to_survivor: dict         # loser legacy_member_id -> survivor legacy_member_id
    provenance: dict                # survivor legacy_member_id -> [survivor, *losers]
    collapsed_group_ids: list       # Stage A groups whose approved merge was collapsed
    boundary_fingerprint: str       # frozen reconcilable-account-id set
    plan_fingerprint: str           # approved-merge shape + override fingerprints


def _boundary_fingerprint(rows: list[dict[str, str]]) -> str:
    """Fingerprint of the frozen Stage B input boundary: the reconcilable
    account-id set. Binds the survivor view to the exact extract it was built on."""
    kept, _ = reconcilable_rows(rows)
    ids = sorted((r.get("legacy_member_id") or "").strip() for r in kept)
    return hashlib.sha256("\x1f".join(ids).encode("utf-8")).hexdigest()


def _stage_a_plan_fingerprint(merges: list, override_fingerprints: list[str]) -> str:
    """Fingerprint of the approved-merge shape plus the override fingerprints, so a
    changed Stage A plan or a changed adjudication input reads as stale."""
    parts = [f"{d.group_id}|{d.survivor_id}|{','.join(sorted(d.loser_ids))}"
             for d in sorted(merges, key=lambda d: d.group_id)]
    parts.append("OVR:" + ",".join(sorted(override_fingerprints)))
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def build_stage_a_survivor_view(
    rows: list[dict[str, str]], *,
    links_by_account: dict[str, str] | None = None,
    claimed_ids: set[str] | None = None,
    overrides: "list | None" = None,
    entitlement_dispositions: "list | None" = None,
    expected_boundary_fingerprint: str | None = None,
    expected_plan_fingerprint: str | None = None,
) -> StageASurvivorView:
    """Build the reconciled account universe Stage B reads by collapsing only the
    Stage A groups approved for merge under the adjudicated plan. Read-only and
    deterministic: it applies no merge, creates no link, and writes nothing.

    Collapses only action=="merge" decisions; every loser is mapped to its
    deterministic survivor and the survivor is exposed once with the approved field
    union (unioned emails, OR-merged entitlements). Fails closed on a stale
    boundary/plan fingerprint, a loser mapped to more than one survivor, a missing
    survivor, or an unapproved group presented as collapsed."""
    plan = plan_auto_merges(rows, links_by_account=links_by_account,
                            claimed_ids=claimed_ids, overrides=overrides,
                            entitlement_dispositions=entitlement_dispositions)
    merges = plan["merges"]
    override_fps = [getattr(o, "fingerprint", "") for o in (overrides or [])]

    boundary_fp = _boundary_fingerprint(rows)
    plan_fp = _stage_a_plan_fingerprint(merges, override_fps)
    if expected_boundary_fingerprint is not None and expected_boundary_fingerprint != boundary_fp:
        raise StageASurvivorError(
            "stale input boundary: the Stage B extract does not match the Stage A plan")
    if expected_plan_fingerprint is not None and expected_plan_fingerprint != plan_fp:
        raise StageASurvivorError("stale Stage A plan or override fingerprint")

    acct_ids = {(r.get("legacy_member_id") or "").strip() for r in rows}
    non_merge_ids: set[str] = set()
    for d in plan["decisions"]:
        if d.action != "merge":
            for a in d.accounts:
                non_merge_ids.add((a.get("legacy_member_id") or "").strip())

    loser_to_survivor: dict[str, str] = {}
    survivor_row_by_id: dict[str, dict[str, str]] = {}
    provenance: dict[str, list[str]] = {}
    collapsed: list[str] = []

    for d in merges:
        surv = d.survivor_id
        if surv not in acct_ids:
            raise StageASurvivorError(f"approved group {d.group_id}: survivor {surv} missing")
        if d.survivor_row is None:
            raise StageASurvivorError(f"approved group {d.group_id}: no survivor field union")
        collapsed.append(d.group_id)
        survivor_row_by_id[surv] = d.survivor_row
        provenance[surv] = [surv, *d.loser_ids]
        for loser in d.loser_ids:
            prior = loser_to_survivor.get(loser)
            if prior is not None and prior != surv:
                raise StageASurvivorError(
                    f"loser {loser} maps to two survivors ({prior} and {surv})")
            if loser in non_merge_ids:
                raise StageASurvivorError(
                    f"loser {loser} also appears in an unapproved (non-merge) group")
            loser_to_survivor[loser] = surv

    # a survivor must never itself be a loser (a merge chain the plan should not emit)
    for surv in survivor_row_by_id:
        if surv in loser_to_survivor:
            raise StageASurvivorError(f"survivor {surv} is also a loser (merge chain)")

    losers = set(loser_to_survivor)
    logical: list[dict[str, str]] = []
    for r in rows:
        lid = (r.get("legacy_member_id") or "").strip()
        if lid in losers:
            continue
        logical.append(survivor_row_by_id.get(lid, r))

    return StageASurvivorView(
        logical_accounts=logical,
        loser_to_survivor=loser_to_survivor,
        provenance=provenance,
        collapsed_group_ids=sorted(collapsed),
        boundary_fingerprint=boundary_fp,
        plan_fingerprint=plan_fp,
    )


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
    csv_path: Path, db_path: Path, proposed_out: Path, review_out: Path,
    survivor_view: "StageASurvivorView | None" = None,
) -> dict[str, object]:
    """Read the intermediate CSV and historical_persons, propose links, and write
    the proposed-link and review CSVs. Read-only on the database; proposes, never
    applies.

    When `survivor_view` is supplied, Stage B reads the reconciled Stage A survivor
    universe instead of the raw accounts, so a duplicate pair Stage A approved for
    merge presents as one logical account. With no survivor view the behavior is
    byte-for-byte identical to the plain Stage B run. Fails closed if the survivor
    view was built on a different frozen input boundary than the CSV read here."""
    with Path(csv_path).open(encoding="utf-8", newline="") as f:
        accounts = list(csv.DictReader(f))
    if survivor_view is not None:
        if survivor_view.boundary_fingerprint != _boundary_fingerprint(accounts):
            raise StageASurvivorError(
                "Stage B input boundary differs from the survivor view's Stage A plan")
        universe = survivor_view.logical_accounts
    else:
        universe = accounts
    hps = read_historical_persons(Path(db_path))
    proposed, review = build_stage_b(universe, hps)
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
        "collapsed_stage_a_merges": len(survivor_view.collapsed_group_ids) if survivor_view else 0,
        "loser_accounts_hidden": len(survivor_view.loser_to_survivor) if survivor_view else 0,
        "proposed_out": str(proposed_out),
        "review_out": str(review_out),
    }


def run_stage_b(csv_path: Path, db_path: Path | None,
                proposed_out: Path, review_out: Path,
                use_survivor_view: bool = False,
                overrides_path: Path | None = None) -> int:
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
    view = None
    if use_survivor_view:
        with Path(csv_path).open(encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        claimed = _claimed_ids_from_db(Path(db_path))
        overrides = load_stage_a_overrides(overrides_path)
        # The survivor-view Stage A plan applies the DB claim-state block and any
        # adjudication overrides. It intentionally does not apply the
        # different-person-links block, which depends on a prior Stage B proposal
        # and would form an A->B->A cycle; the QC gate remains the backstop that
        # rejects any proposal overlapping a held or review account.
        try:
            view = build_stage_a_survivor_view(rows, claimed_ids=claimed, overrides=overrides)
        except StageASurvivorError as e:
            print(f"error: survivor-view construction failed closed: {e}", file=sys.stderr)
            return 2
        print(f"survivor view: collapsed {len(view.collapsed_group_ids)} approved Stage A "
              f"merges; {len(view.loser_to_survivor)} loser accounts hidden; "
              f"plan fp {view.plan_fingerprint[:16]}")
    s = stage_b_link_historical_persons(csv_path, db_path, proposed_out, review_out, view)
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
    ap.add_argument("--stage-b-survivor-view", action="store_true",
                    help="Run Stage B against the Stage A survivor view (collapses "
                         "approved-for-merge groups; applies --overrides). Opt-in; "
                         "omitted = byte-for-byte identical Stage B.")
    ap.add_argument("--stage-b", action="store_true",
                    help="build the Stage B historical-person link proposals + review CSV "
                         "(read-only on the database; proposes, never applies)")
    ap.add_argument("--qc-gate", action="store_true",
                    help="run the pre-apply QC gate over the Stage A + Stage B artifacts "
                         "(read-only; called by run_legacy_members.sh)")
    ap.add_argument("--dry-run-merge", action="store_true",
                    help="report how the final-load auto-merge would split the dump into "
                         "merges and reviews, with per-reason counts (read-only; merges nothing)")
    ap.add_argument("--final-merge", action="store_true",
                    help="write the final-load auto-merge artifacts: the merged member CSV "
                         "(survivors), the loser->survivor map, and the review CSV "
                         "(contradiction groups). Writes only out/ CSVs; the loader applies them.")
    ap.add_argument("--merged-out", type=Path, default=DEFAULT_MERGED_CSV,
                    help="final-merge: merged member CSV output path (git-ignored out/ by default)")
    ap.add_argument("--merge-map-out", type=Path, default=DEFAULT_MERGE_MAP_CSV,
                    help="final-merge: loser->survivor mapping CSV output path (git-ignored out/ by default)")
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="intermediate CSV to read")
    ap.add_argument("--out", type=Path, default=DEFAULT_STAGE_A_REVIEW_CSV,
                    help="Stage A review CSV output path (git-ignored out/ by default)")
    ap.add_argument("--proposed-out", type=Path, default=DEFAULT_STAGE_B_PROPOSED_CSV,
                    help="Stage B proposed-link CSV output path (git-ignored out/ by default)")
    ap.add_argument("--review-out", type=Path, default=DEFAULT_STAGE_B_REVIEW_CSV,
                    help="Stage B link-review CSV output path (git-ignored out/ by default)")
    ap.add_argument("--excluded-out", type=Path, default=DEFAULT_EXCLUDED_ACCOUNTS_CSV,
                    help="Stage A held-out (email/user-id collision) accounts CSV (git-ignored out/ by default)")
    ap.add_argument("--overrides", type=Path, default=None,
                    help="Stage A adjudication-override CSV (private input; fail-closed). "
                         "Applied to --dry-run-merge and --final-merge; omitted = plain baseline.")
    ap.add_argument("--db", type=Path, default=None,
                    help="built database, read-only for Stage B historical_persons and the QC gate")
    args = ap.parse_args()

    if args.profile:
        sys.exit(profile(args.csv))
    if args.stage_a:
        sys.exit(run_stage_a(args.csv, args.out, args.excluded_out))
    if args.stage_b or args.stage_b_survivor_view:
        sys.exit(run_stage_b(args.csv, args.db, args.proposed_out, args.review_out,
                             use_survivor_view=args.stage_b_survivor_view,
                             overrides_path=args.overrides))
    if args.qc_gate:
        sys.exit(run_qc_gate(args.out, args.proposed_out, args.review_out))
    if args.dry_run_merge:
        sys.exit(dry_run_auto_merge(args.csv, args.proposed_out, args.overrides))
    if args.final_merge:
        sys.exit(run_final_merge(args.csv, args.proposed_out, args.db,
                                 args.merged_out, args.merge_map_out, args.out,
                                 args.overrides))
    ap.print_help()
    sys.exit(2)


if __name__ == "__main__":
    main()
