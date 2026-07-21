"""Fail-closed Stage B review-group resolutions (public; carries no PII).

Moves an exactly-matched, human-adjudicated Stage B review group out of the active
undecided-review queue WITHOUT creating an account merge, a person link, a fallback
candidate, a DOB value, or a source correction. It records the maintainer's outcome
in a held/audit output and keeps still-pending groups visible in a dedicated
pending report.

Outcomes:
  affirm_distinct_people                    -- evidence affirmatively establishes
                                               different humans (requires a recorded
                                               independent evidence basis).
  keep_distinct_insufficient_evidence       -- import separately without asserting
                                               they are different people.
  probable_same_person_pending_verification -- strong same-human evidence, a required
                                               source fact still unresolved.
  unresolved_pending_source_fact            -- cannot adjudicate until a specified
                                               missing/corrected fact is obtained.
  unresolved_pending_identity_evidence      -- no safe link without additional
                                               independent identity evidence.

Each resolution is keyed by the group's complete account set plus a one-way
fingerprint of its full decision boundary: the account set, the candidate-person
set, the Stage A survivor mapping and account membership, the normalized names and
all DOB values including missingness, country and location facts, the current review
reason and match methods, whether any link is presently proposed, and the frozen
input boundary. Any drift, a vanished or duplicated group, an unexpectedly
appearing/disappearing link, a resolution for a group no longer in review, an
unknown or contradictory decision, or an affirm-distinct decision with no recorded
evidence basis -- all fail closed.

The resolution DATA lives in the controlled private input layer; this module, its
schema, and its tests carry only synthetic values.
"""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

FINGERPRINT_VERSION = "v1"

AFFIRM_DISTINCT_PEOPLE = "affirm_distinct_people"
KEEP_DISTINCT_INSUFFICIENT_EVIDENCE = "keep_distinct_insufficient_evidence"
PROBABLE_SAME_PERSON_PENDING_VERIFICATION = "probable_same_person_pending_verification"
UNRESOLVED_PENDING_SOURCE_FACT = "unresolved_pending_source_fact"
UNRESOLVED_PENDING_IDENTITY_EVIDENCE = "unresolved_pending_identity_evidence"

VALID_OUTCOMES = frozenset({
    AFFIRM_DISTINCT_PEOPLE, KEEP_DISTINCT_INSUFFICIENT_EVIDENCE,
    PROBABLE_SAME_PERSON_PENDING_VERIFICATION, UNRESOLVED_PENDING_SOURCE_FACT,
    UNRESOLVED_PENDING_IDENTITY_EVIDENCE,
})
# outcomes that keep the group visible in a dedicated held/pending report: the
# adjudication is recorded, but the case is not finally settled.
PENDING_OUTCOMES = frozenset({
    PROBABLE_SAME_PERSON_PENDING_VERIFICATION, UNRESOLVED_PENDING_SOURCE_FACT,
    UNRESOLVED_PENDING_IDENTITY_EVIDENCE,
})

RESOLUTION_FIELDS = ("outcome", "account_ids", "reason", "evidence_basis",
                     "fingerprint", "note")


class ReviewResolutionError(Exception):
    """Any review-resolution validation failure. The caller must abort."""


@dataclass(frozen=True)
class ReviewResolution:
    outcome: str
    account_ids: frozenset[str]
    reason: str
    evidence_basis: str
    fingerprint: str
    note: str


def _kv(prefix: str, mapping: dict) -> str:
    return ";".join(f"{k}={mapping.get(k, '')}" for k in sorted(mapping))


def review_group_fingerprint(*, account_ids: Iterable[str],
                             candidate_person_ids: Iterable[str],
                             survivor_map: dict, dob_by_account: dict,
                             country_by_account: dict, location_by_account: dict,
                             review_reason: str, match_methods: Iterable[str],
                             proposed_link: bool, boundary_fingerprint: str) -> str:
    """One-way fingerprint of a review group's complete decision boundary. DOB
    missingness is captured because a missing DOB is stored as the empty string."""
    canonical = "\x1f".join((
        FINGERPRINT_VERSION, "REVIEW_RESOLUTION",
        "|".join(sorted(account_ids)),
        "|".join(sorted(candidate_person_ids)),
        ";".join(f"{a}>{survivor_map.get(a, a)}" for a in sorted(survivor_map)),
        _kv("dob", dob_by_account),
        _kv("country", country_by_account),
        _kv("loc", location_by_account),
        review_reason,
        ",".join(sorted(match_methods)),
        "1" if proposed_link else "0",
        boundary_fingerprint,
    ))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def parse_account_ids(raw: str) -> frozenset[str]:
    ids = frozenset(p.strip() for p in raw.split("|") if p.strip())
    if not ids:
        raise ReviewResolutionError(f"resolution account_ids is empty: {raw!r}")
    return ids


def load_resolutions(path: Path | None) -> list[ReviewResolution]:
    """Read the review-resolution CSV. Returns [] when no path is supplied or the
    file is absent, so a run with no resolution input is a plain Stage B run. A
    malformed row, an unknown outcome, or an affirm-distinct row with no evidence
    basis fails closed."""
    if path is None or not Path(path).exists():
        return []
    out: list[ReviewResolution] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(RESOLUTION_FIELDS) - set(reader.fieldnames):
            raise ReviewResolutionError(
                f"resolution header must contain {RESOLUTION_FIELDS}; got {reader.fieldnames!r}")
        for i, row in enumerate(reader, start=2):
            outcome = (row.get("outcome") or "").strip()
            if outcome not in VALID_OUTCOMES:
                raise ReviewResolutionError(f"line {i}: unknown outcome {outcome!r}")
            reason = (row.get("reason") or "").strip()
            if not reason:
                raise ReviewResolutionError(f"line {i}: empty reason")
            evidence = (row.get("evidence_basis") or "").strip()
            if outcome == AFFIRM_DISTINCT_PEOPLE and not evidence:
                raise ReviewResolutionError(
                    f"line {i}: affirm_distinct_people requires a recorded evidence_basis")
            fp = (row.get("fingerprint") or "").strip()
            if len(fp) != 64 or any(c not in "0123456789abcdef" for c in fp):
                raise ReviewResolutionError(f"line {i}: malformed fingerprint {fp!r}")
            out.append(ReviewResolution(
                outcome=outcome,
                account_ids=parse_account_ids(row.get("account_ids") or ""),
                reason=reason, evidence_basis=evidence, fingerprint=fp,
                note=(row.get("note") or "").strip(),
            ))
    return out


def apply_resolutions(descriptors: list[dict], resolutions: list[ReviewResolution]
                      ) -> tuple[list[dict], list[dict]]:
    """Return (kept_review_rows, audit). `descriptors` is one dict per current
    review group: {account_ids: frozenset, normalized_name, reason,
    candidate_person_ids, proposed_link, fingerprint, group: [review rows]}. Each
    resolution must match exactly one descriptor by account set and fingerprint;
    each match removes that group from the active review output and records it in the
    audit (marked pending when the outcome is not final). Fails closed on any
    mismatch; removes nothing until all resolutions validate."""
    by_ids: dict[frozenset[str], dict] = {d["account_ids"]: d for d in descriptors}

    seen: set[frozenset[str]] = set()
    resolved: set[frozenset[str]] = set()
    audit: list[dict] = []
    for r in resolutions:
        if r.account_ids in seen:
            raise ReviewResolutionError(
                f"duplicate/contradictory resolution for {sorted(r.account_ids)}")
        seen.add(r.account_ids)
        d = by_ids.get(r.account_ids)
        if d is None:
            raise ReviewResolutionError(
                f"resolution for {sorted(r.account_ids)}: no matching in-review group "
                "(group gone, changed, duplicated, or no longer in review)")
        if r.fingerprint != d["fingerprint"]:
            raise ReviewResolutionError(
                f"stale fingerprint for resolution {sorted(r.account_ids)} "
                "(account set, candidate set, survivor mapping, facts, review reason, "
                "proposed-link state, or boundary changed)")
        if r.outcome == AFFIRM_DISTINCT_PEOPLE and not r.evidence_basis:
            raise ReviewResolutionError(
                f"affirm_distinct_people for {sorted(r.account_ids)} lacks an evidence basis")
        resolved.add(r.account_ids)
        audit.append({
            "account_ids": sorted(r.account_ids),
            "normalized_name": d["normalized_name"],
            "review_reason": d["reason"],
            "candidate_person_ids": sorted(d["candidate_person_ids"]),
            "outcome": r.outcome,
            "reason": r.reason,
            "evidence_basis": r.evidence_basis,
            "pending": r.outcome in PENDING_OUTCOMES,
            "group": [dict(row) for row in d["group"]],   # full group + evidence preserved
        })

    kept = [row for d in descriptors if d["account_ids"] not in resolved
            for row in d["group"]]
    return kept, audit
