"""Fail-closed dispositions for legacy_members rows the export does not cover.

A row still carrying a non-authoritative provenance after the final export load is
one the export did not cover. That is not automatically a defect: the curated
mirror-to-CSV pipeline is primary and the dump is dirty data, so a curated row the
dump misses is a normal state. But it must be reported and it must carry a
decision, because otherwise a row somebody deliberately kept and a row nobody
looked at are the same row.

Three decisions:

  keep     the row stands. This is the default, and for a gap-fill row it is the
           only safe answer: the curated canonical name is the only name on it and
           a historical person points at it, so clearing it produces exactly the
           dangling link the companion card tracks.
  clear    the row goes, and the historical-person link that depends on it goes in
           the same step. Never recorded alone.
  defer    reported, decided later, and explicitly not treated as settled. It
           exists so "we have not decided" is sayable without looking like keep.

Each disposition binds to why the row is uncovered: the exclusion rule that
dropped it, whether the loader pulled it back, and whether a historical person
still depends on it. If any of those change, the ruling is stale and has to be
made again rather than carried forward over new evidence. That is the same
discipline the person-scoped adjudications use, applied to the account entity;
the two are deliberately separate files because they key on different things and a
load has to be able to prove each complete on its own terms.

The disposition DATA lives in the controlled private input layer; this module, its
schema, and its tests carry only synthetic values.
"""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

FINGERPRINT_VERSION = "v1"

KEEP = "keep"
CLEAR = "clear"
DEFER = "defer"
VALID_DECISIONS = frozenset({KEEP, CLEAR, DEFER})

CURATED_IDENTITY_VOUCHES = "curated_identity_vouches_for_the_id"
CLUB_ROSTER_ONLY = "club_roster_membership_only"
EXPORT_DEFECT_SUSPECTED = "export_defect_suspected_recheck_next_delivery"
SUPERSEDED_BY_CLEARED_LINK = "superseded_the_dependent_person_link_is_cleared_too"
UNDECIDED_PENDING_REVIEW = "undecided_pending_review"

REASONS_BY_DECISION: dict[str, frozenset[str]] = {
    KEEP: frozenset({CURATED_IDENTITY_VOUCHES, CLUB_ROSTER_ONLY,
                     EXPORT_DEFECT_SUSPECTED}),
    CLEAR: frozenset({SUPERSEDED_BY_CLEARED_LINK}),
    DEFER: frozenset({UNDECIDED_PENDING_REVIEW}),
}
VALID_REASONS = frozenset().union(*REASONS_BY_DECISION.values())

DISPOSITION_FIELDS = ("decision", "legacy_member_id", "reason", "fingerprint", "note")


class MemberRowDispositionError(Exception):
    """Any disposition validation failure. The caller must abort."""


@dataclass(frozen=True)
class MemberRowDisposition:
    decision: str
    legacy_member_id: str
    reason: str
    fingerprint: str
    note: str


def uncovered_boundary_fingerprint(legacy_member_id: str, import_source: str,
                                   exclusion_rule: str, pulled_back: bool,
                                   dependent_person_ids: Iterable[str],
                                   boundary_fingerprint: str) -> str:
    """One-way fingerprint of why this row is uncovered.

    The dependent person ids are in the boundary because a keep ruling is largely
    justified by them: a row nothing points at any more is a different question
    from one a historical person still depends on, and a ruling made under the
    first reading must not survive into the second.
    """
    canonical = "\x1f".join((
        FINGERPRINT_VERSION, "UNCOVERED_MEMBER_ROW",
        legacy_member_id,
        import_source,
        exclusion_rule,
        "1" if pulled_back else "0",
        ",".join(sorted(dependent_person_ids)),
        boundary_fingerprint,
    ))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_dispositions(path: Path | None) -> list[MemberRowDisposition]:
    """Read the disposition CSV. Returns [] when no path is supplied or the file is
    absent, so a run with no disposition input is an ordinary run. Malformed rows
    fail closed."""
    if path is None or not Path(path).exists():
        return []
    out: list[MemberRowDisposition] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(DISPOSITION_FIELDS) - set(reader.fieldnames):
            raise MemberRowDispositionError(
                f"disposition header must contain {DISPOSITION_FIELDS}; "
                f"got {reader.fieldnames!r}")
        for i, row in enumerate(reader, start=2):
            decision = (row.get("decision") or "").strip()
            if decision not in VALID_DECISIONS:
                raise MemberRowDispositionError(
                    f"line {i}: unknown decision {decision!r}; expected one of "
                    f"{sorted(VALID_DECISIONS)}")
            reason = (row.get("reason") or "").strip()
            allowed = REASONS_BY_DECISION[decision]
            if reason not in allowed:
                raise MemberRowDispositionError(
                    f"line {i}: reason {reason!r} is not valid for decision "
                    f"{decision!r}; expected one of {sorted(allowed)}")
            member_id = (row.get("legacy_member_id") or "").strip()
            if not member_id:
                raise MemberRowDispositionError(f"line {i}: legacy_member_id is empty")
            fp = (row.get("fingerprint") or "").strip()
            if len(fp) != 64 or any(c not in "0123456789abcdef" for c in fp):
                raise MemberRowDispositionError(f"line {i}: malformed fingerprint {fp!r}")
            note = (row.get("note") or "").strip()
            if not note:
                raise MemberRowDispositionError(
                    f"line {i}: every disposition carries a note saying why")
            out.append(MemberRowDisposition(decision=decision, legacy_member_id=member_id,
                                            reason=reason, fingerprint=fp, note=note))
    return out


def apply_dispositions(uncovered: list[dict],
                       dispositions: list[MemberRowDisposition]) -> list[dict]:
    """Validate every disposition against current state and return the audit.

    `uncovered` is one dict per uncovered row: {legacy_member_id, import_source,
    exclusion_rule, pulled_back, dependent_person_ids, fingerprint}. Nothing is
    written and no row is cleared: recording a clear decision is not performing it.
    """
    by_id = {u["legacy_member_id"]: u for u in uncovered}
    seen: set[str] = set()
    audit: list[dict] = []
    for d in dispositions:
        if d.legacy_member_id in seen:
            raise MemberRowDispositionError(
                f"duplicate disposition for {d.legacy_member_id}")
        seen.add(d.legacy_member_id)
        u = by_id.get(d.legacy_member_id)
        if u is None:
            raise MemberRowDispositionError(
                f"{d.decision} for {d.legacy_member_id}: that row is not uncovered "
                "(the export now covers it, or it is no longer present)")
        if d.fingerprint != u["fingerprint"]:
            raise MemberRowDispositionError(
                f"stale decision boundary for {d.decision} on {d.legacy_member_id}: "
                "the exclusion rule, the pull-back, or what depends on this row has "
                "changed since the ruling was made; re-adjudicate")
        if d.decision == CLEAR and u["dependent_person_ids"]:
            raise MemberRowDispositionError(
                f"clear for {d.legacy_member_id}: {len(u['dependent_person_ids'])} "
                "historical person(s) still depend on this row. Clearing it here "
                "would strand them; the dependent link is cleared in the same step "
                "or the decision is keep")
        audit.append({
            "legacy_member_id": d.legacy_member_id,
            "decision": d.decision,
            "reason": d.reason,
            "exclusion_rule": u["exclusion_rule"],
            "dependent_person_ids": sorted(u["dependent_person_ids"]),
            "row_cleared": False,
        })
    return audit


def assert_every_uncovered_row_dispositioned(uncovered: list[dict],
                                             dispositions: list[MemberRowDisposition]) -> None:
    """Refuse when an uncovered row carries no decision.

    Reporting without this is a number somebody reads. The ruling is that an
    uncovered row does not halt the cutover load, and it does not: this runs in the
    pre-cutover checks, not in the loader.
    """
    have = {d.legacy_member_id for d in dispositions}
    missing = sorted(u["legacy_member_id"] for u in uncovered
                     if u["legacy_member_id"] not in have)
    if missing:
        raise MemberRowDispositionError(
            f"{len(missing)} uncovered legacy_members row(s) carry no recorded "
            f"disposition; a row somebody kept and a row nobody reviewed are "
            f"indistinguishable without one. First few: {missing[:5]}")
