"""Fail-closed Stage B person-link adjudications (public; carries no PII).

The single home for a maintainer's rulings about how a historical person relates
to the delivered member population. Three decisions, each binding to a different
thing and each fingerprinted so a ruling cannot outlive the evidence it was made
against:

  * hold_link      -- withhold one proposed link. Binds to the proposal.
  * no_account     -- this person holds no account in the member population.
                      Binds to the person and to the accounts bearing their name,
                      which is empty when the ruling is made and stops being empty
                      the moment a delivery introduces one.
  * duplicate_person -- this row is the same human as another person row, so it
                      must never take a link or be claimed independently. Names
                      the row it duplicates.

The last two exist because a person with no proposed link and a person nobody has
looked at are indistinguishable otherwise, and the final load has to be able to
tell an accepted absence from an unreviewed one.

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

# Suppresses one mechanically-proposed link. Binds to the proposal.
HOLD_LINK = "hold_link"
# Records that a person has no link to propose, and why. Binds to the person and
# to the account population that made the ruling true, so a later delivery that
# introduces a matching account cannot leave the old ruling standing.
NO_ACCOUNT = "no_account"
# Records that a person row is the same human as another person row, so it must
# never take a link or be claimed independently. Carries the row it duplicates.
DUPLICATE_PERSON = "duplicate_person"

VALID_DECISIONS = frozenset({HOLD_LINK, NO_ACCOUNT, DUPLICATE_PERSON})
# Dispositions about a person rather than about one proposed link. These carry no
# account set and are checked against the person population, not the proposals.
PERSON_SCOPED_DECISIONS = frozenset({NO_ACCOUNT, DUPLICATE_PERSON})

UNRESOLVED_PENDING_EXTERNAL_CORROBORATION = "unresolved_pending_external_corroboration"
UNRESOLVED_PENDING_CORRECTED_SOURCE = "unresolved_pending_corrected_source_or_identity_evidence"
NO_VALID_ACCOUNT_IN_MEMBER_POPULATION = "no_valid_account_in_member_population"
DUPLICATE_SPELLING_VARIANT = "duplicate_of_canonical_person_spelling_variant"
DUPLICATE_STROKE_LETTER_VARIANT = "duplicate_of_canonical_person_stroke_letter_variant"

# A reason has to belong to its decision. Sharing one flat vocabulary would let a
# no-account ruling wear a hold_link reason and read as adjudicated when it is not.
REASONS_BY_DECISION: dict[str, frozenset[str]] = {
    HOLD_LINK: frozenset({UNRESOLVED_PENDING_EXTERNAL_CORROBORATION,
                          UNRESOLVED_PENDING_CORRECTED_SOURCE}),
    NO_ACCOUNT: frozenset({NO_VALID_ACCOUNT_IN_MEMBER_POPULATION}),
    DUPLICATE_PERSON: frozenset({DUPLICATE_SPELLING_VARIANT,
                                 DUPLICATE_STROKE_LETTER_VARIANT}),
}
VALID_REASONS = frozenset().union(*REASONS_BY_DECISION.values())

HOLD_FIELDS = ("decision", "survivor_account_ids", "candidate_person_id",
               "reason", "fingerprint", "note")
# Required only on a duplicate_person row, so a file written before this decision
# existed still loads and a duplicate ruling without a target still fails closed.
DUPLICATE_TARGET_FIELD = "duplicate_of_person_id"


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
    duplicate_of_person_id: str = ""

    @property
    def is_person_scoped(self) -> bool:
        return self.decision in PERSON_SCOPED_DECISIONS


def person_boundary_fingerprint(candidate_person_id: str, normalized_name: str,
                                account_ids_bearing_name: Iterable[str],
                                duplicate_of_person_id: str,
                                boundary_fingerprint: str) -> str:
    """One-way fingerprint of a person-scoped disposition's decision boundary.

    The account set bearing the person's name is part of the boundary even when it
    is empty, which is the point: a no-account ruling is only true of the member
    population it was made against, so a delivery that introduces an account by
    that name makes the fingerprint stale and forces the ruling to be re-made.
    """
    canonical = "\x1f".join((
        FINGERPRINT_VERSION, "PERSON_DISPOSITION",
        candidate_person_id,
        normalized_name,
        ",".join(sorted(account_ids_bearing_name)),
        duplicate_of_person_id,
        boundary_fingerprint,
    ))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


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
                raise PersonLinkHoldError(
                    f"line {i}: unknown decision {decision!r}; expected one of "
                    f"{sorted(VALID_DECISIONS)}")
            reason = (row.get("reason") or "").strip()
            allowed = REASONS_BY_DECISION[decision]
            if reason not in allowed:
                raise PersonLinkHoldError(
                    f"line {i}: reason {reason!r} is not valid for decision "
                    f"{decision!r}; expected one of {sorted(allowed)}")
            fp = (row.get("fingerprint") or "").strip()
            if len(fp) != 64 or any(c not in "0123456789abcdef" for c in fp):
                raise PersonLinkHoldError(f"line {i}: malformed fingerprint {fp!r}")
            person = (row.get("candidate_person_id") or "").strip()
            if not person:
                raise PersonLinkHoldError(f"line {i}: candidate_person_id is empty")
            duplicate_of = (row.get(DUPLICATE_TARGET_FIELD) or "").strip()
            if decision == DUPLICATE_PERSON and not duplicate_of:
                raise PersonLinkHoldError(
                    f"line {i}: a {DUPLICATE_PERSON} decision must name the row it "
                    f"duplicates in {DUPLICATE_TARGET_FIELD}")
            if decision != DUPLICATE_PERSON and duplicate_of:
                raise PersonLinkHoldError(
                    f"line {i}: {DUPLICATE_TARGET_FIELD} is only meaningful on a "
                    f"{DUPLICATE_PERSON} decision, not {decision!r}")
            if duplicate_of == person:
                raise PersonLinkHoldError(
                    f"line {i}: a person cannot duplicate itself ({person!r})")
            # A person-scoped disposition is about a person with no proposal, so
            # there is no survivor account set to bind to and naming one would be
            # a claim the ruling does not make.
            if decision in PERSON_SCOPED_DECISIONS:
                if (row.get("survivor_account_ids") or "").strip():
                    raise PersonLinkHoldError(
                        f"line {i}: {decision!r} is about a person, so "
                        "survivor_account_ids must be empty")
                accounts: frozenset[str] = frozenset()
            else:
                accounts = parse_account_ids(row.get("survivor_account_ids") or "")
            note = (row.get("note") or "").strip()
            if not note:
                raise PersonLinkHoldError(
                    f"line {i}: every adjudication carries a note saying why")
            out.append(PersonLinkHold(
                decision=decision,
                survivor_account_ids=accounts,
                candidate_person_id=person,
                reason=reason,
                fingerprint=fp,
                note=note,
                duplicate_of_person_id=duplicate_of,
            ))
    return out


def apply_holds(descriptors: list[dict], holds: list[PersonLinkHold]) -> tuple[list[dict], list[dict]]:
    """Return (kept_proposals, audit). `descriptors` is one dict per current Stage B
    proposed link: {survivor_account_ids: frozenset, candidate_person_id, match_signal,
    normalized_name, candidate_set: [ids], fingerprint, proposal: dict}. Every hold
    must match exactly one descriptor and fingerprint; each match suppresses that one
    proposal and records it in the audit. Fails closed on any mismatch; suppresses
    nothing until all holds validate."""
    # Person-scoped dispositions live in the same file but say nothing about a
    # proposal, so they never reach this path.
    holds = [h for h in holds if h.decision == HOLD_LINK]
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


def apply_person_dispositions(person_descriptors: list[dict],
                              holds: list[PersonLinkHold],
                              known_person_ids: Iterable[str]) -> list[dict]:
    """Validate every person-scoped disposition against current state, and return
    the audit. `person_descriptors` is one dict per person eligible for a
    disposition: {candidate_person_id, normalized_name, account_ids_bearing_name,
    fingerprint_for}. `known_person_ids` is the whole person population, which a
    duplicate ruling's target must be found in. Nothing is written and no link is
    created; a disposition only records a decision already taken.

    Fails closed, and on the same grounds a link hold does: an unknown person, a
    duplicate ruling naming a row that does not exist, a repeated decision, or a
    fingerprint that no longer matches the population the ruling was made against.
    The last is what stops a no-account ruling outliving the delivery that made it
    true.
    """
    by_id = {d["candidate_person_id"]: d for d in person_descriptors}
    known = set(known_person_ids)

    seen: set[str] = set()
    audit: list[dict] = []
    for h in holds:
        if not h.is_person_scoped:
            continue
        if h.candidate_person_id in seen:
            raise PersonLinkHoldError(
                f"duplicate disposition for person {h.candidate_person_id}")
        seen.add(h.candidate_person_id)
        d = by_id.get(h.candidate_person_id)
        if d is None:
            raise PersonLinkHoldError(
                f"{h.decision} for {h.candidate_person_id}: no such person awaiting a "
                "disposition (already linked, no longer present, or now uniquely proposed)")
        if h.decision == DUPLICATE_PERSON and h.duplicate_of_person_id not in known:
            raise PersonLinkHoldError(
                f"{h.decision} for {h.candidate_person_id}: the row it duplicates "
                f"({h.duplicate_of_person_id}) is not in the person population")
        expected = d["fingerprint_for"](h.duplicate_of_person_id)
        if h.fingerprint != expected:
            raise PersonLinkHoldError(
                f"stale decision boundary for {h.decision} on {h.candidate_person_id}: "
                "the person population or the accounts bearing this name have changed "
                "since the ruling was made; re-adjudicate")
        audit.append({
            "candidate_person_id": h.candidate_person_id,
            "decision": h.decision,
            "reason": h.reason,
            "duplicate_of_person_id": h.duplicate_of_person_id,
            "normalized_name": d["normalized_name"],
            "account_ids_bearing_name": sorted(d["account_ids_bearing_name"]),
            "link_created": False,
        })
    return audit


def assert_every_person_dispositioned(person_descriptors: list[dict],
                                      holds: list[PersonLinkHold]) -> None:
    """Refuse when a person eligible for a disposition has none recorded.

    The final load runs this so an unadjudicated person cannot pass as an
    accepted absence. Without it a row that nobody ruled on and a row somebody
    deliberately left unlinked look identical, which is the gap this whole
    mechanism exists to close.
    """
    have = {h.candidate_person_id for h in holds if h.is_person_scoped}
    missing = sorted(d["candidate_person_id"] for d in person_descriptors
                     if d["candidate_person_id"] not in have)
    if missing:
        raise PersonLinkHoldError(
            f"{len(missing)} person row(s) have neither a proposed link nor a recorded "
            f"disposition; the load cannot tell an accepted absence from an unreviewed "
            f"one. First few: {missing[:5]}")
