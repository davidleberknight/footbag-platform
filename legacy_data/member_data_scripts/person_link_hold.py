"""Fail-closed Stage B person-link holds (public; carries no PII).

A hold_link decision withholds a single mechanically-proposed Stage B person link
that a maintainer has adjudicated should not be applied, even when the ordinary
matcher considers the candidate unique. It suppresses only the exact matching
proposal, keeps the suppressed proposal and its evidence in the audit, creates no
alternative link, and does NOT assert the account and person are different humans.

Each hold is keyed by the logical survivor's underlying account set plus the
candidate person id, and bound by a one-way fingerprint of the full decision
boundary: the survivor account set, the candidate person id, the candidate set (all
unlinked persons proposed for that normalized name), the proposal method, the
normalized match facts, and the frozen input boundary. Any drift -- a missing
survivor or candidate, changed account membership, a changed candidate set or
proposal method, a stale fingerprint, a duplicate decision, an unknown decision or
reason code, a proposal no longer produced, or a candidate no longer uniquely
proposed -- fails closed.

The hold DATA lives in the controlled private input layer; this module, its schema,
and its tests carry only synthetic values.
"""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

FINGERPRINT_VERSION = "v1"
HOLD_LINK = "hold_link"
VALID_DECISIONS = frozenset({HOLD_LINK})

UNRESOLVED_PENDING_EXTERNAL_CORROBORATION = "unresolved_pending_external_corroboration"
UNRESOLVED_PENDING_CORRECTED_SOURCE = "unresolved_pending_corrected_source_or_identity_evidence"
VALID_REASONS = frozenset({UNRESOLVED_PENDING_EXTERNAL_CORROBORATION,
                           UNRESOLVED_PENDING_CORRECTED_SOURCE})

HOLD_FIELDS = ("decision", "survivor_account_ids", "candidate_person_id",
               "reason", "fingerprint", "note")


class PersonLinkHoldError(Exception):
    """Any person-link-hold validation failure. The caller must abort."""


@dataclass(frozen=True)
class PersonLinkHold:
    decision: str
    survivor_account_ids: frozenset[str]
    candidate_person_id: str
    reason: str
    fingerprint: str
    note: str


def link_boundary_fingerprint(survivor_account_ids: Iterable[str], candidate_person_id: str,
                              candidate_set: Iterable[str], match_signal: str,
                              match_facts: str, boundary_fingerprint: str) -> str:
    """One-way fingerprint of a proposed link's complete decision boundary."""
    canonical = "\x1f".join((
        FINGERPRINT_VERSION, "LINK_HOLD",
        "|".join(sorted(survivor_account_ids)),
        candidate_person_id,
        ",".join(sorted(candidate_set)),
        match_signal,
        match_facts,
        boundary_fingerprint,
    ))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def parse_account_ids(raw: str) -> frozenset[str]:
    ids = frozenset(p.strip() for p in raw.split("|") if p.strip())
    if not ids:
        raise PersonLinkHoldError(f"hold survivor_account_ids is empty: {raw!r}")
    return ids


def load_holds(path: Path | None) -> list[PersonLinkHold]:
    """Read the person-link-hold CSV. Returns [] when no path is supplied or the
    file is absent, so a run with no hold input is a plain Stage B run. Malformed
    rows fail closed."""
    if path is None or not Path(path).exists():
        return []
    out: list[PersonLinkHold] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(HOLD_FIELDS) - set(reader.fieldnames):
            raise PersonLinkHoldError(
                f"hold header must contain {HOLD_FIELDS}; got {reader.fieldnames!r}")
        for i, row in enumerate(reader, start=2):
            decision = (row.get("decision") or "").strip()
            if decision not in VALID_DECISIONS:
                raise PersonLinkHoldError(f"line {i}: unknown decision {decision!r}")
            reason = (row.get("reason") or "").strip()
            if reason not in VALID_REASONS:
                raise PersonLinkHoldError(f"line {i}: unknown reason code {reason!r}")
            fp = (row.get("fingerprint") or "").strip()
            if len(fp) != 64 or any(c not in "0123456789abcdef" for c in fp):
                raise PersonLinkHoldError(f"line {i}: malformed fingerprint {fp!r}")
            out.append(PersonLinkHold(
                decision=decision,
                survivor_account_ids=parse_account_ids(row.get("survivor_account_ids") or ""),
                candidate_person_id=(row.get("candidate_person_id") or "").strip(),
                reason=reason,
                fingerprint=fp,
                note=(row.get("note") or "").strip(),
            ))
    return out


def apply_holds(descriptors: list[dict], holds: list[PersonLinkHold]) -> tuple[list[dict], list[dict]]:
    """Return (kept_proposals, audit). `descriptors` is one dict per current Stage B
    proposed link: {survivor_account_ids: frozenset, candidate_person_id, match_signal,
    normalized_name, candidate_set: [ids], fingerprint, proposal: dict}. Every hold
    must match exactly one descriptor and fingerprint; each match suppresses that one
    proposal and records it in the audit. Fails closed on any mismatch; suppresses
    nothing until all holds validate."""
    by_key: dict[tuple[frozenset[str], str], dict] = {}
    for d in descriptors:
        by_key[(d["survivor_account_ids"], d["candidate_person_id"])] = d

    seen: set[tuple[frozenset[str], str]] = set()
    suppressed: set[tuple[frozenset[str], str]] = set()
    audit: list[dict] = []
    for h in holds:
        key = (h.survivor_account_ids, h.candidate_person_id)
        if key in seen:
            raise PersonLinkHoldError(
                f"duplicate hold for {sorted(h.survivor_account_ids)} -> {h.candidate_person_id}")
        seen.add(key)
        d = by_key.get(key)
        if d is None:
            raise PersonLinkHoldError(
                f"hold for {sorted(h.survivor_account_ids)} -> {h.candidate_person_id}: no such "
                "uniquely-proposed link (missing survivor or candidate, changed membership, "
                "candidate no longer uniquely proposed, or proposal no longer produced)")
        if h.fingerprint != d["fingerprint"]:
            raise PersonLinkHoldError(
                f"stale decision/boundary fingerprint for hold "
                f"{sorted(h.survivor_account_ids)} -> {h.candidate_person_id}")
        suppressed.add(key)
        audit.append({
            "survivor_account_ids": sorted(h.survivor_account_ids),
            "candidate_person_id": h.candidate_person_id,
            "match_signal": d["match_signal"],
            "normalized_name": d["normalized_name"],
            "candidate_set": sorted(d["candidate_set"]),
            "reason": h.reason,
            "suppressed_proposal": dict(d["proposal"]),   # preserved evidence
            "link_created": False,                        # no alternative link
        })

    kept = [d["proposal"] for d in descriptors
            if (d["survivor_account_ids"], d["candidate_person_id"]) not in suppressed]
    return kept, audit
