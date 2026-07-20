"""Fail-closed Stage A adjudication overrides (public code; carries no PII).

A Stage A override records one maintainer decision about a single duplicate-account
group: either approve the group as the same person (letting a held group merge) or
mark it do-not-merge (holding it as distinct regardless of what the planner would
otherwise do). Each override is keyed by the group's stable account ids plus a
privacy-safe fingerprint of the group's facts, never by name, DOB, email, or row
position.

An override is applied only when ALL of these match the live baseline:
  - the current group membership is exactly the recorded account-id set;
  - the baseline planner disposition equals the recorded one;
  - the recomputed fingerprint equals the recorded one.
Any mismatch -- missing accounts, changed membership, duplicate decisions, a stale
fingerprint, a stale baseline, an unknown decision, or an override that no longer
changes the baseline result -- raises OverrideError and stops the run. Fail closed.

The adjudication DATA (the specific groups and their fingerprints) lives in the
controlled private input layer, never in this repository. This module, its schema,
its fixtures, and its tests carry only synthetic values.
"""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

FINGERPRINT_VERSION = "v1"
APPROVE = "approve_same_person"
DO_NOT_MERGE = "do_not_merge"
# An explicit same-human merge of accounts Stage A did NOT group (one or both lack a
# full DOB, so no name+full-DOB group exists). Human-adjudicated; keyed by the
# account set and a fingerprint of its raw facts. It never invents or copies a
# missing DOB -- the survivor keeps its own raw values and unions the losers'.
MERGE_ACCOUNTS = "merge_accounts"
VALID_DECISIONS = frozenset({APPROVE, DO_NOT_MERGE, MERGE_ACCOUNTS})
# The review reason an authoritative do-not-merge decision stamps on a group,
# distinct from any planner-derived safety-block reason.
DO_NOT_MERGE_REASON = "adjudicated_distinct_person"
# The expected_disposition a merge_accounts override records: it asserts the
# accounts are NOT already a Stage A group (else the standard approve path applies).
MERGE_ACCOUNTS_EXPECTED = "ungrouped:no_stage_a_group"

OVERRIDE_FIELDS = ("decision", "account_ids", "expected_disposition", "fingerprint", "note")


class OverrideError(Exception):
    """Any adjudication-override validation failure. The caller must abort."""


@dataclass(frozen=True)
class Override:
    decision: str
    account_ids: frozenset[str]
    expected_disposition: str
    fingerprint: str
    note: str


def disposition(action: str, reason: str) -> str:
    """The canonical 'action:reason' disposition string a fingerprint binds to."""
    return f"{action}:{reason}"


def group_fingerprint(account_ids: Iterable[str], match_key: str,
                      action: str, reason: str, countries: Iterable[str]) -> str:
    """A one-way, privacy-safe fingerprint of a group's decision-relevant facts.

    Binds the account-id set, the (hashed) name+DOB match key, the baseline
    disposition, and the country set. Deterministic; reveals no PII (the output
    is a SHA-256 hex digest). A change to membership, the underlying identity,
    the planner disposition, or the country data changes the digest, so a stale
    override no longer matches and fails closed.
    """
    canonical = "\x1f".join((
        FINGERPRINT_VERSION,
        "|".join(sorted(account_ids)),
        match_key,
        disposition(action, reason),
        ",".join(sorted(c for c in countries if c)),
    ))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def account_set_fingerprint(entries: Iterable[tuple[str, str, str, str]]) -> str:
    """One-way fingerprint of an explicit-merge account set's raw decision facts.

    `entries` is (legacy_member_id, normalized_name, raw_birth_date, country) per
    account; the raw birth date is included verbatim (empty when absent), so filling
    or changing a DOB, or adding/removing an account, changes the digest and a stale
    override fails closed. Distinct from group_fingerprint by a separate tag so the
    two fingerprint spaces cannot collide.
    """
    parts = [FINGERPRINT_VERSION, "MERGE_ACCOUNTS"]
    for mid, name, dob, country in sorted(entries):
        parts.append("|".join((mid, name, dob, (country or "").strip().lower())))
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def validate_merge_account_overrides(
    overrides: list[Override], *,
    present_ids: set[str],
    grouped_ids: set[str],
    fingerprint_of: Callable[[frozenset[str]], str],
) -> list[frozenset[str]]:
    """Validate merge_accounts overrides fail-closed; return the validated account
    sets in stable order. Raises OverrideError (the caller aborts) on: a duplicate
    override, an account missing or held out of the reconcilable set, an account
    already in a Stage A name+DOB group, a stale expected disposition, or a stale
    fingerprint. Builds nothing and mutates nothing."""
    merge_overrides = [o for o in overrides if o.decision == MERGE_ACCOUNTS]
    seen: set[frozenset[str]] = set()
    validated: list[frozenset[str]] = []
    for o in merge_overrides:
        if o.account_ids in seen:
            raise OverrideError(
                f"duplicate merge_accounts override for {sorted(o.account_ids)}")
        seen.add(o.account_ids)
        missing = sorted(i for i in o.account_ids if i not in present_ids)
        if missing:
            raise OverrideError(
                f"merge_accounts {sorted(o.account_ids)}: accounts missing or "
                f"collision-excluded: {missing}")
        already = sorted(i for i in o.account_ids if i in grouped_ids)
        if already:
            raise OverrideError(
                f"merge_accounts {sorted(o.account_ids)}: already in a Stage A "
                f"name+DOB group: {already} (use approve_same_person instead)")
        if o.expected_disposition != MERGE_ACCOUNTS_EXPECTED:
            raise OverrideError(
                f"merge_accounts {sorted(o.account_ids)}: stale disposition "
                f"{o.expected_disposition!r} (expected {MERGE_ACCOUNTS_EXPECTED!r})")
        if fingerprint_of(o.account_ids) != o.fingerprint:
            raise OverrideError(
                f"merge_accounts {sorted(o.account_ids)}: stale fingerprint")
        validated.append(o.account_ids)
    return validated


def parse_account_ids(raw: str) -> frozenset[str]:
    ids = frozenset(p.strip() for p in raw.split("|") if p.strip())
    if len(ids) < 2:
        raise OverrideError(f"override account_ids must name at least two accounts: {raw!r}")
    return ids


def load_overrides(path: Path | None) -> list[Override]:
    """Read the adjudication-override CSV. Returns [] when no path is supplied or
    the file is absent, so a run with no override input is a plain baseline run.
    Malformed rows fail closed."""
    if path is None or not Path(path).exists():
        return []
    out: list[Override] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(OVERRIDE_FIELDS) - set(reader.fieldnames):
            raise OverrideError(
                f"override header must contain {OVERRIDE_FIELDS}; got {reader.fieldnames!r}")
        for i, row in enumerate(reader, start=2):
            decision = (row.get("decision") or "").strip()
            if decision not in VALID_DECISIONS:
                raise OverrideError(f"line {i}: unknown decision {decision!r}")
            fp = (row.get("fingerprint") or "").strip()
            if len(fp) != 64 or any(c not in "0123456789abcdef" for c in fp):
                raise OverrideError(f"line {i}: malformed fingerprint {fp!r}")
            out.append(Override(
                decision=decision,
                account_ids=parse_account_ids(row.get("account_ids") or ""),
                expected_disposition=(row.get("expected_disposition") or "").strip(),
                fingerprint=fp,
                note=(row.get("note") or "").strip(),
            ))
    return out


def apply_overrides(pairs: list[tuple[object, object]],
                    overrides: list[Override],
                    reevaluate: Callable[[object, frozenset[str]], object],
                    match_key_of: Callable[[object], str] = lambda g: getattr(g, "match_key"),
                    countries_of: Callable[[object], set[str]] | None = None
                    ) -> list[object]:
    """Return the baseline decisions with validated overrides applied.

    `pairs` is [(group, baseline_decision), ...] in output order. `reevaluate` is
    a closure that re-runs the planner on one group while ignoring named safety
    blocks (used to build the survivor row for an approved group). Every failure
    mode raises OverrideError before any decision is changed (validate-all first).
    """
    if not overrides:
        return [d for _, d in pairs]

    if countries_of is None:
        def countries_of(g):
            return {(a.get("country") or "").strip()
                    for a in getattr(g, "accounts") if (a.get("country") or "").strip()}

    # index the live groups by their exact account-id set
    by_ids: dict[frozenset[str], tuple[object, object]] = {}
    for g, d in pairs:
        ids = frozenset((a.get("legacy_member_id") or "").strip() for a in getattr(g, "accounts"))
        by_ids[ids] = (g, d)

    # duplicate-decision guard (two overrides for the same account set)
    seen: set[frozenset[str]] = set()
    for o in overrides:
        if o.account_ids in seen:
            raise OverrideError(f"duplicate override for account set {sorted(o.account_ids)}")
        seen.add(o.account_ids)

    # validate every override before applying any
    planned: list[tuple[frozenset[str], object]] = []
    for o in overrides:
        if o.account_ids not in by_ids:
            raise OverrideError(
                f"no live group has exactly accounts {sorted(o.account_ids)} "
                "(missing account or changed membership)")
        g, base = by_ids[o.account_ids]
        base_disp = disposition(getattr(base, "action"), getattr(base, "reason"))
        if base_disp != o.expected_disposition:
            raise OverrideError(
                f"stale disposition for {sorted(o.account_ids)}: recorded "
                f"{o.expected_disposition!r}, live {base_disp!r}")
        want_fp = group_fingerprint(
            [(a.get("legacy_member_id") or "").strip() for a in getattr(g, "accounts")],
            match_key_of(g), getattr(base, "action"), getattr(base, "reason"), countries_of(g))
        if want_fp != o.fingerprint:
            raise OverrideError(f"stale fingerprint for {sorted(o.account_ids)}")

        if o.decision == APPROVE:
            if getattr(base, "action") != "review":
                raise OverrideError(
                    f"approve override for {sorted(o.account_ids)} does not change the "
                    f"result: baseline already {getattr(base, 'action')!r}")
            new = reevaluate(g, frozenset({getattr(base, "reason")}))
            if getattr(new, "action") != "merge":
                raise OverrideError(
                    f"approve override for {sorted(o.account_ids)} did not produce a merge "
                    f"(another safety block still holds: {getattr(new, 'reason')!r})")
        else:  # DO_NOT_MERGE
            new = _as_review(base, DO_NOT_MERGE_REASON)
            if disposition(getattr(new, "action"), getattr(new, "reason")) == base_disp:
                raise OverrideError(
                    f"do-not-merge override for {sorted(o.account_ids)} does not change the "
                    "result")
        planned.append((o.account_ids, new))

    replacement = dict(planned)
    result: list[object] = []
    for g, d in pairs:
        ids = frozenset((a.get("legacy_member_id") or "").strip() for a in getattr(g, "accounts"))
        result.append(replacement.get(ids, d))
    return result


def _as_review(decision: object, reason: str) -> object:
    """A copy of `decision` forced to review with `reason` and no survivor row."""
    import dataclasses
    return dataclasses.replace(decision, action="review", reason=reason,
                               survivor_row=None, loser_ids=[])
