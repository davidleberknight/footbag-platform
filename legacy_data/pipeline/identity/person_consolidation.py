"""Curated identity consolidation: one contract, two producers, one vocabulary.

Some people exist twice in the person population. A consolidation rule says which
identity survives and which retires, and the producer that owns the retired row
carries it out. The two producers are asymmetric and the artifact says so rather
than hiding it behind one overloaded column:

  retired_scope=canonical
      The retired row is a canonical person, emitted by the platform export.
      Canonical ids are stable end to end, so the rule binds by id and the
      consumer retires the row before persons.csv is written.

  retired_scope=provisional
      The retired row is a provisional stub built from a membership or club name.
      Its id is NOT stable: the provisional builder emits prov_person::<hash of
      name> and the persons master then rewrites it to master_person::<hash of
      name_norm + source_types>, so an id recorded here would bind to nothing at
      the producer. The rule therefore binds by the pre-rewrite name, which is
      what the suppression actually matches on.

Provisional suppression is not implemented here. The provisional builder already
refuses to emit a stub whose name resolves to a canonical person through the
shared alias registry, and duplicating that would give two mechanisms that can
disagree. What this module does instead is prove the registry implements every
provisional rule: the retired name must resolve to exactly the declared survivor,
and the generated output must not contain it.

Nothing here writes to a database. A consolidation is a correction to a generated
artifact, applied at the producer, so a full rebuild reproduces it rather than
reverting it.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

CANONICAL = "canonical"
PROVISIONAL = "provisional"
VALID_SCOPES = frozenset({CANONICAL, PROVISIONAL})

RULE_FIELDS = ("retired_scope", "retired_person_id", "retired_name",
               "survivor_person_id", "surviving_name", "surviving_country",
               "reason", "note")


class PersonConsolidationError(Exception):
    """Any consolidation failure. The caller must abort."""


@dataclass(frozen=True)
class ConsolidationRule:
    retired_scope: str
    retired_person_id: str
    retired_name: str
    survivor_person_id: str
    surviving_name: str
    surviving_country: str
    reason: str
    note: str

    @property
    def key(self) -> str:
        """What this rule binds to at its owning producer."""
        return self.retired_person_id if self.retired_scope == CANONICAL else self.retired_name


def load_rules(path: Path | None) -> list[ConsolidationRule]:
    """Read the consolidation CSV. Returns [] when absent, so a tree without one
    builds exactly as before. Malformed rows fail closed."""
    if path is None or not Path(path).exists():
        return []
    out: list[ConsolidationRule] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(RULE_FIELDS) - set(reader.fieldnames):
            raise PersonConsolidationError(
                f"consolidation header must contain {RULE_FIELDS}; got {reader.fieldnames!r}")
        for i, row in enumerate(reader, start=2):
            scope = (row.get("retired_scope") or "").strip()
            if scope not in VALID_SCOPES:
                raise PersonConsolidationError(
                    f"line {i}: unknown retired_scope {scope!r}; expected one of "
                    f"{sorted(VALID_SCOPES)}")
            pid = (row.get("retired_person_id") or "").strip()
            name = (row.get("retired_name") or "").strip()
            survivor = (row.get("survivor_person_id") or "").strip()
            if not survivor:
                raise PersonConsolidationError(f"line {i}: survivor_person_id is empty")
            if scope == CANONICAL and not pid:
                raise PersonConsolidationError(
                    f"line {i}: a canonical rule binds by id, so retired_person_id "
                    "is required")
            if scope == PROVISIONAL:
                if not name:
                    raise PersonConsolidationError(
                        f"line {i}: a provisional rule binds by name, so retired_name "
                        "is required")
                if pid:
                    raise PersonConsolidationError(
                        f"line {i}: retired_person_id must be empty on a provisional "
                        "rule, because a provisional id is rewritten downstream and "
                        "would bind to nothing at the producer")
            if pid and pid == survivor:
                raise PersonConsolidationError(
                    f"line {i}: a person cannot retire into itself ({pid!r})")
            if not (row.get("reason") or "").strip():
                raise PersonConsolidationError(f"line {i}: reason is empty")
            if not (row.get("note") or "").strip():
                raise PersonConsolidationError(
                    f"line {i}: every consolidation carries a note explaining the ruling")
            out.append(ConsolidationRule(
                retired_scope=scope, retired_person_id=pid, retired_name=name,
                survivor_person_id=survivor,
                surviving_name=(row.get("surviving_name") or "").strip(),
                surviving_country=(row.get("surviving_country") or "").strip(),
                reason=(row.get("reason") or "").strip(),
                note=(row.get("note") or "").strip()))
    seen: set[tuple[str, str]] = set()
    for r in out:
        k = (r.retired_scope, r.key)
        if k in seen:
            raise PersonConsolidationError(
                f"two rules retire the same identity: {r.retired_scope}/{r.key}")
        seen.add(k)
    return out


def apply_canonical(rows: list[dict], rules: list[ConsolidationRule]) -> tuple[list[dict], list[dict]]:
    """Retire the canonical rows named by canonical rules, before persons.csv is
    written. Returns (surviving rows, audit).

    The member binding is derived, never hand-entered: when exactly one side of a
    consolidation carries one, it follows the identity to the survivor. Two
    different bindings is a contradiction the curator has to resolve, so it fails.

    Survivor-level corrections apply here whatever the retired row's scope,
    because a survivor is always a canonical person: a provisional rule that
    promotes a better spelling is still correcting a canonical row, and this is
    the only producer that can do it. Only canonical rules retire a row, and only
    they are audited here, so each producer still accounts for its own.
    """
    by_id = {(r.get("person_id") or "").strip(): r for r in rows}
    audit: list[dict] = []
    retired: set[str] = set()

    for rule in rules:
        if not (rule.surviving_name or rule.surviving_country):
            continue
        survivor = by_id.get(rule.survivor_person_id)
        if survivor is None:
            raise PersonConsolidationError(
                f"{rule.retired_scope} rule for {rule.key!r}: the survivor "
                f"{rule.survivor_person_id} is not in the canonical population, so its "
                "name or country cannot be corrected")
        if rule.surviving_name:
            survivor["person_name"] = rule.surviving_name
        if rule.surviving_country:
            survivor["country"] = rule.surviving_country

    for rule in [r for r in rules if r.retired_scope == CANONICAL]:
        retired_row = by_id.get(rule.retired_person_id)
        survivor = by_id.get(rule.survivor_person_id)
        if retired_row is None:
            raise PersonConsolidationError(
                f"canonical rule: retired person {rule.retired_person_id} is not in the "
                "canonical population; it may already be consolidated, or the rule "
                "names the wrong producer")
        if survivor is None:
            raise PersonConsolidationError(
                f"canonical rule: survivor {rule.survivor_person_id} is not in the "
                "canonical population")

        retired_member = (retired_row.get("member_id") or "").strip()
        survivor_member = (survivor.get("member_id") or "").strip()
        if retired_member and survivor_member and retired_member != survivor_member:
            raise PersonConsolidationError(
                f"canonical rule for {rule.retired_person_id}: both identities carry a "
                f"member binding and they differ ({survivor_member} vs {retired_member}). "
                "One account cannot belong to two people; resolve which binding is "
                "correct before consolidating")
        transferred = ""
        if retired_member and not survivor_member:
            survivor["member_id"] = retired_member
            transferred = retired_member

        retired.add(rule.retired_person_id)
        audit.append({
            "retired_scope": CANONICAL,
            "retired": rule.retired_person_id,
            "survivor": rule.survivor_person_id,
            "member_id_transferred": transferred,
            "surviving_name": survivor.get("person_name") or "",
            "surviving_country": survivor.get("country") or "",
            "reason": rule.reason,
        })

    return [r for r in rows if (r.get("person_id") or "").strip() not in retired], audit


def verify_provisional(rules: list[ConsolidationRule], resolve, emitted_names) -> list[dict]:
    """Prove the alias registry implements every provisional rule, and that the
    builder acted on it.

    `resolve` is the shared alias resolver's name lookup; `emitted_names` is what
    the provisional builder actually produced. Suppression itself lives in the
    builder's existing alias guard: this checks that the guard had what it needed
    and that the stub really is gone, rather than adding a second mechanism that
    could disagree with the first.
    """
    emitted = {n.strip() for n in emitted_names}
    audit: list[dict] = []
    for rule in [r for r in rules if r.retired_scope == PROVISIONAL]:
        resolved = resolve(rule.retired_name)
        if not resolved:
            raise PersonConsolidationError(
                f"provisional rule for {rule.retired_name!r}: the name does not resolve "
                "through the alias registry, so nothing suppresses the duplicate stub. "
                "Add the alias pair that maps it to the survivor")
        if resolved != rule.survivor_person_id:
            raise PersonConsolidationError(
                f"provisional rule for {rule.retired_name!r}: the alias registry resolves "
                f"it to {resolved}, but the rule declares the survivor is "
                f"{rule.survivor_person_id}. The two disagree about who this is")
        if rule.retired_name in emitted:
            raise PersonConsolidationError(
                f"provisional rule for {rule.retired_name!r}: the builder emitted a stub "
                "for it anyway, so the consolidation did not take effect")
        audit.append({
            "retired_scope": PROVISIONAL,
            "retired": rule.retired_name,
            "survivor": rule.survivor_person_id,
            "suppressed_by": "alias registry",
            "reason": rule.reason,
        })
    return audit


def assert_every_rule_accounted(rules: list[ConsolidationRule],
                                audits: list[list[dict]]) -> None:
    """Every rule consumed exactly once, by the producer that owns its retired row.

    A rule nobody consumed is a correction that silently did not happen, and a
    rule two producers consumed is a correction applied twice.
    """
    counts: dict[tuple[str, str], int] = {}
    for audit in audits:
        for entry in audit:
            k = (entry["retired_scope"], entry["retired"])
            counts[k] = counts.get(k, 0) + 1
    problems: list[str] = []
    for rule in rules:
        n = counts.get((rule.retired_scope, rule.key), 0)
        if n == 0:
            problems.append(f"{rule.retired_scope}/{rule.key}: no producer consumed it")
        elif n > 1:
            problems.append(f"{rule.retired_scope}/{rule.key}: consumed {n} times")
    expected = {(r.retired_scope, r.key) for r in rules}
    for k in counts:
        if k not in expected:
            problems.append(f"{k[0]}/{k[1]}: consumed but no such rule")
    if problems:
        raise PersonConsolidationError(
            "consolidation accounting failed:\n  " + "\n  ".join(problems))
