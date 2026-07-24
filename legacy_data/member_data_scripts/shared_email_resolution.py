"""Pure shared-email collision resolution for the legacy member intake.

One legacy account may carry up to three email addresses. An address that
appears on more than one account is an ambiguous identity: the claim flow's
email-equality fast path would hand that account's identity to whoever controls
the mailbox. This module decides, per collision group, which single account (if
any) may keep the shared address, so the loader and the reconciler apply one
identical rule instead of implementing it twice.

Policy: within a shared-email collision group, the account with the strictly
latest valid record-modification timestamp keeps its email; every other account
imports with its email cleared and claims through the name-anchored path. A group
is decidable only when every member carries a valid timestamp and exactly one is
strictly latest. Any missing, invalid, or tied timestamp fails the group closed
to adjudication, where no account keeps the shared email and every account still
imports. The timestamp is the raw source record-modification value
(`legacy_member_modified`, carried through from the dump's `MemberModified`); it
is a write timestamp, an accepted proxy for most-recent account activity, not
proof the address itself was used. Account id, source order, row order, and any
other non-evidentiary signal are never used to break a tie.

Records are read by canonical key, so each caller passes plain dicts carrying
`legacy_member_id`, the three email columns, and `legacy_member_modified`; the
loader projects its alias-resolved rows into that shape, the reconciler's rows
already carry it. This module holds no PII; its tests use synthetic values.
"""
from __future__ import annotations

from dataclasses import dataclass

EMAIL_COLS = ("legacy_email", "legacy_email2", "legacy_email3")
MODIFIED_COL = "legacy_member_modified"
ID_COL = "legacy_member_id"

UNIQUE_LATEST = "unique_latest"
NEEDS_ADJUDICATION = "needs_adjudication"

REASON_UNIQUE_LATEST = "unique_latest_modified"
REASON_MISSING = "missing_timestamp"
REASON_INVALID = "invalid_timestamp"
REASON_TIED = "tied_latest_timestamp"


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def _account_id(record: dict) -> str:
    return (record.get(ID_COL) or "").strip()


def parse_modified(raw: str | None) -> tuple[int | None, str]:
    """Parse a raw `legacy_member_modified` value. Returns (epoch, status) with
    status one of 'valid' / 'missing' / 'invalid'. Mirrors the extract's
    freshness parse: a positive integer epoch is valid, an empty value is
    missing, anything else present is invalid. Missing and invalid are kept
    distinct so the group reason names which one blocked the decision."""
    s = (raw or "").strip()
    if not s:
        return None, "missing"
    try:
        v = int(s)
    except (TypeError, ValueError):
        return None, "invalid"
    if v <= 0:
        return None, "invalid"
    return v, "valid"


@dataclass(frozen=True)
class GroupResolution:
    """The decision for one shared-email collision group. `email_retaining_ids`
    is the winner alone or empty; `email_cleared_ids` is everyone else, or every
    account when the group needs adjudication. Every account in `account_ids`
    imports regardless of disposition; only the email is withheld."""
    disposition: str
    reason: str
    account_ids: tuple[str, ...]
    shared_emails: tuple[str, ...]
    winner_id: str | None
    email_retaining_ids: tuple[str, ...]
    email_cleared_ids: tuple[str, ...]
    modified_raw: dict[str, str]
    modified_parsed: dict[str, int | None]


def _shared_emails(records: list[dict]) -> tuple[str, ...]:
    """The normalized addresses that appear on more than one account in the
    group -- the addresses whose ownership the tie-break is deciding."""
    owners: dict[str, set[str]] = {}
    for r in records:
        aid = _account_id(r)
        for e in {normalize_email(r.get(c)) for c in EMAIL_COLS if normalize_email(r.get(c))}:
            owners.setdefault(e, set()).add(aid)
    return tuple(sorted(e for e, ids in owners.items() if len(ids) > 1))


def resolve_shared_email_group(records: list[dict]) -> GroupResolution:
    """Resolve one collision group. Pure: reads only the passed records, writes
    nothing, and never consults an account id or ordering to break a tie."""
    ids = tuple(sorted(_account_id(r) for r in records))
    shared = _shared_emails(records)
    modified_raw: dict[str, str] = {}
    modified_parsed: dict[str, int | None] = {}
    statuses: dict[str, str] = {}
    for r in records:
        aid = _account_id(r)
        v, status = parse_modified(r.get(MODIFIED_COL))
        modified_raw[aid] = (r.get(MODIFIED_COL) or "").strip()
        modified_parsed[aid] = v
        statuses[aid] = status

    def adjudicate(reason: str) -> GroupResolution:
        return GroupResolution(
            disposition=NEEDS_ADJUDICATION, reason=reason, account_ids=ids,
            shared_emails=shared, winner_id=None, email_retaining_ids=(),
            email_cleared_ids=ids, modified_raw=modified_raw,
            modified_parsed=modified_parsed,
        )

    if any(s == "missing" for s in statuses.values()):
        return adjudicate(REASON_MISSING)
    if any(s == "invalid" for s in statuses.values()):
        return adjudicate(REASON_INVALID)

    latest = max(modified_parsed.values())  # all valid here
    winners = [aid for aid, v in modified_parsed.items() if v == latest]
    if len(winners) != 1:
        return adjudicate(REASON_TIED)

    winner = winners[0]
    cleared = tuple(a for a in ids if a != winner)
    return GroupResolution(
        disposition=UNIQUE_LATEST, reason=REASON_UNIQUE_LATEST, account_ids=ids,
        shared_emails=shared, winner_id=winner, email_retaining_ids=(winner,),
        email_cleared_ids=cleared, modified_raw=modified_raw,
        modified_parsed=modified_parsed,
    )


def find_shared_email_groups(accounts: list[dict]) -> list[list[dict]]:
    """Partition accounts into the connected components linked by any shared
    normalized email address, returning only components of more than one account.
    An address held by a single account links nothing. Deterministic and
    order-independent: components and their members come back in id order."""
    recs_by_id: dict[str, dict] = {}
    addr_owners: dict[str, set[str]] = {}
    for r in accounts:
        aid = _account_id(r)
        if not aid:
            continue
        recs_by_id[aid] = r
        for e in {normalize_email(r.get(c)) for c in EMAIL_COLS if normalize_email(r.get(c))}:
            addr_owners.setdefault(e, set()).add(aid)

    parent: dict[str, str] = {aid: aid for aid in recs_by_id}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for owners in addr_owners.values():
        members = sorted(owners)
        for other in members[1:]:
            union(members[0], other)

    comps: dict[str, list[str]] = {}
    for aid in recs_by_id:
        comps.setdefault(find(aid), []).append(aid)

    groups = [
        [recs_by_id[a] for a in sorted(members)]
        for members in comps.values() if len(members) > 1
    ]
    groups.sort(key=lambda g: _account_id(g[0]))
    return groups


def resolve_shared_email(accounts: list[dict]) -> list[GroupResolution]:
    """Find the shared-email collision groups across `accounts` and resolve each.
    The single entry point both the loader and the reconciler call."""
    return [resolve_shared_email_group(g) for g in find_shared_email_groups(accounts)]


def email_cleared_ids(resolutions: list[GroupResolution]) -> set[str]:
    """Every account whose email must be cleared on import, across all groups."""
    out: set[str] = set()
    for r in resolutions:
        out.update(r.email_cleared_ids)
    return out


def summarize(resolutions: list[GroupResolution]) -> dict[str, int]:
    """Aggregate counts for the verification report. Carries no PII."""
    unique = [r for r in resolutions if r.disposition == UNIQUE_LATEST]
    adjud = [r for r in resolutions if r.disposition == NEEDS_ADJUDICATION]
    return {
        "groups": len(resolutions),
        "unique_winner_groups": len(unique),
        "needs_adjudication_groups": len(adjud),
        "tied_groups": sum(1 for r in adjud if r.reason == REASON_TIED),
        "missing_timestamp_groups": sum(1 for r in adjud if r.reason == REASON_MISSING),
        "invalid_timestamp_groups": sum(1 for r in adjud if r.reason == REASON_INVALID),
        "accounts_in_collisions": sum(len(r.account_ids) for r in resolutions),
        "accounts_retaining_email": sum(len(r.email_retaining_ids) for r in resolutions),
        "accounts_email_cleared": sum(len(r.email_cleared_ids) for r in resolutions),
    }


REPORT_FIELDS = (
    "group_id", "group_size", "shared_emails", "account_ids",
    "modified_raw", "modified_parsed", "winner_id", "disposition", "reason",
    "email_retaining_ids", "email_cleared_ids",
)


def report_rows(resolutions: list[GroupResolution]) -> list[dict[str, str]]:
    """One report row per collision group. Emitted only to the controlled,
    git-ignored reconciliation output, which already carries member emails; the
    normalized shared address is the group's evidentiary key there."""
    rows: list[dict[str, str]] = []
    ordered = sorted(resolutions, key=lambda r: r.account_ids)
    for i, r in enumerate(ordered, start=1):
        rows.append({
            "group_id": f"E{i:04d}",
            "group_size": str(len(r.account_ids)),
            "shared_emails": " ".join(r.shared_emails),
            "account_ids": " ".join(r.account_ids),
            "modified_raw": " ".join(f"{a}={r.modified_raw.get(a, '')}" for a in r.account_ids),
            "modified_parsed": " ".join(
                f"{a}={'' if r.modified_parsed.get(a) is None else r.modified_parsed[a]}"
                for a in r.account_ids),
            "winner_id": r.winner_id or "",
            "disposition": r.disposition,
            "reason": r.reason,
            "email_retaining_ids": " ".join(r.email_retaining_ids),
            "email_cleared_ids": " ".join(r.email_cleared_ids),
        })
    return rows
