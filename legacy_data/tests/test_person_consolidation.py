"""Contract for curated identity consolidation.

A person who exists twice is consolidated by a curated rule, applied at whichever
producer owns the retired identity. The two producers are asymmetric: a canonical
row has a stable id and is retired by id, while a provisional stub's id is
rewritten downstream and so is retired by the pre-rewrite name the suppression
actually sees. These pin that asymmetry, the fail-closed guards around it, and the
accounting that proves every rule was carried out exactly once.

The member binding is derived rather than curated. A curator says which identity
survives; the binding follows it. That is deliberate: a hand-entered account id
would be a fact nobody validated, and getting it wrong attaches somebody's account
to the wrong person.

All data is synthetic; no real member or person data appears here.
"""
import csv
import importlib.util
import sys
from pathlib import Path

import pytest

_LEGACY = Path(__file__).resolve().parents[1]


def _load(name, relative):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _LEGACY / relative)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


pc = _load("person_consolidation_under_test",
           "pipeline/identity/person_consolidation.py")

SURVIVOR = "surv-0000-0000"
RETIRED = "reti-0000-0000"


def _write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=pc.RULE_FIELDS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in pc.RULE_FIELDS})


def _canonical_row(**kw):
    row = {"retired_scope": "canonical", "retired_person_id": RETIRED,
           "retired_name": "Retired Name", "survivor_person_id": SURVIVOR,
           "reason": "duplicate", "note": "synthetic"}
    row.update(kw)
    return row


def _provisional_row(**kw):
    row = {"retired_scope": "provisional", "retired_name": "Retired Stub",
           "survivor_person_id": SURVIVOR, "reason": "duplicate", "note": "synthetic"}
    row.update(kw)
    return row


def _persons(survivor_member="", retired_member=""):
    return [
        {"person_id": SURVIVOR, "person_name": "Survivor Name", "country": "Poland",
         "member_id": survivor_member},
        {"person_id": RETIRED, "person_name": "Retired Name", "country": "Czechia",
         "member_id": retired_member},
    ]


# --- schema guards ----------------------------------------------------------

def test_canonical_rule_without_a_retired_id_is_refused(tmp_path):
    p = tmp_path / "m.csv"
    _write(p, [_canonical_row(retired_person_id="")])
    with pytest.raises(pc.PersonConsolidationError, match="retired_person_id is required"):
        pc.load_rules(p)


def test_provisional_rule_without_a_retired_name_is_refused(tmp_path):
    p = tmp_path / "m.csv"
    _write(p, [_provisional_row(retired_name="")])
    with pytest.raises(pc.PersonConsolidationError, match="retired_name is required"):
        pc.load_rules(p)


def test_provisional_rule_carrying_a_retired_id_is_refused(tmp_path):
    # The id would look authoritative and bind to nothing, because a provisional
    # id is rewritten between the producer and the database.
    p = tmp_path / "m.csv"
    _write(p, [_provisional_row(retired_person_id="prov_person::abc")])
    with pytest.raises(pc.PersonConsolidationError, match="must be empty on a provisional"):
        pc.load_rules(p)


def test_a_rule_retiring_an_identity_into_itself_is_refused(tmp_path):
    p = tmp_path / "m.csv"
    _write(p, [_canonical_row(retired_person_id=SURVIVOR)])
    with pytest.raises(pc.PersonConsolidationError, match="cannot retire into itself"):
        pc.load_rules(p)


def test_two_rules_retiring_the_same_identity_are_refused(tmp_path):
    p = tmp_path / "m.csv"
    _write(p, [_canonical_row(), _canonical_row(reason="again")])
    with pytest.raises(pc.PersonConsolidationError, match="two rules retire the same"):
        pc.load_rules(p)


def test_a_rule_without_a_note_is_refused(tmp_path):
    p = tmp_path / "m.csv"
    _write(p, [_canonical_row(note="")])
    with pytest.raises(pc.PersonConsolidationError, match="note explaining the ruling"):
        pc.load_rules(p)


def test_no_artifact_leaves_the_build_unchanged(tmp_path):
    assert pc.load_rules(None) == []
    assert pc.load_rules(tmp_path / "absent.csv") == []


# --- canonical application --------------------------------------------------

def _rule(**kw):
    row = _canonical_row(**kw)
    return pc.ConsolidationRule(
        row["retired_scope"], row["retired_person_id"], row["retired_name"],
        row["survivor_person_id"], row.get("surviving_name", ""),
        row.get("surviving_country", ""), row["reason"], row["note"])


def test_a_missing_survivor_is_refused():
    rows = [r for r in _persons() if r["person_id"] != SURVIVOR]
    with pytest.raises(pc.PersonConsolidationError, match="survivor .* is not in the canonical"):
        pc.apply_canonical(rows, [_rule()])


def test_a_missing_retired_row_is_refused():
    rows = [r for r in _persons() if r["person_id"] != RETIRED]
    with pytest.raises(pc.PersonConsolidationError, match="retired person .* is not in"):
        pc.apply_canonical(rows, [_rule()])


def test_conflicting_member_ids_are_refused():
    # One account cannot belong to two people, so this is a contradiction a
    # curator has to resolve rather than a transfer to guess at.
    rows = _persons(survivor_member="111", retired_member="222")
    with pytest.raises(pc.PersonConsolidationError, match="both identities carry a member"):
        pc.apply_canonical(rows, [_rule()])


def test_the_member_binding_follows_the_identity():
    rows = _persons(retired_member="14652")
    kept, audit = pc.apply_canonical(rows, [_rule()])
    survivor = next(r for r in kept if r["person_id"] == SURVIVOR)
    assert survivor["member_id"] == "14652"
    assert audit[0]["member_id_transferred"] == "14652"
    assert all(r["person_id"] != RETIRED for r in kept)


def test_the_member_binding_is_derived_and_not_a_curated_column():
    # The artifact has no member-id field to enter one in. If that ever changes,
    # a curator could attach an account to a person with nothing validating it.
    assert not any("member" in f for f in pc.RULE_FIELDS)


def test_a_matching_binding_on_both_sides_is_not_a_conflict():
    rows = _persons(survivor_member="999", retired_member="999")
    kept, audit = pc.apply_canonical(rows, [_rule()])
    assert next(r for r in kept if r["person_id"] == SURVIVOR)["member_id"] == "999"
    assert audit[0]["member_id_transferred"] == ""      # nothing had to move


def test_survivor_name_and_country_corrections_apply():
    rows = _persons()
    kept, _ = pc.apply_canonical(
        rows, [_rule(surviving_name="Corrected Name", surviving_country="Hungary")])
    survivor = next(r for r in kept if r["person_id"] == SURVIVOR)
    assert survivor["person_name"] == "Corrected Name"
    assert survivor["country"] == "Hungary"


def test_a_provisional_rule_corrects_the_survivor_without_being_consumed_here():
    # The survivor is always canonical, so only this producer can correct its
    # name. The rule still belongs to the provisional producer, so it must not
    # appear in this audit or the accounting would see it consumed twice.
    rows = _persons()
    prov = pc.ConsolidationRule("provisional", "", "Retired Stub", SURVIVOR,
                                "Promoted Spelling", "", "duplicate", "synthetic")
    kept, audit = pc.apply_canonical(rows, [prov])
    assert next(r for r in kept if r["person_id"] == SURVIVOR)["person_name"] \
        == "Promoted Spelling"
    assert audit == []
    # And it retired nothing here: retirement is the provisional producer's half.
    assert RETIRED in {r["person_id"] for r in kept}


# --- provisional verification -----------------------------------------------

def _prov_rule(name="Retired Stub", survivor=SURVIVOR):
    return pc.ConsolidationRule("provisional", "", name, survivor, "", "",
                                "duplicate", "synthetic")


def test_a_provisional_rule_verifies_when_the_alias_resolves_and_the_stub_is_gone():
    audit = pc.verify_provisional(
        [_prov_rule()], lambda n: SURVIVOR if n == "Retired Stub" else None,
        emitted_names=[])
    assert audit[0]["retired"] == "Retired Stub"
    assert audit[0]["suppressed_by"] == "alias registry"


def test_an_unresolvable_alias_is_refused():
    # Nothing would suppress the stub, so the duplicate would simply reappear.
    with pytest.raises(pc.PersonConsolidationError, match="does not resolve"):
        pc.verify_provisional([_prov_rule()], lambda _n: None, emitted_names=[])


def test_an_alias_resolving_to_the_wrong_survivor_is_refused():
    with pytest.raises(pc.PersonConsolidationError, match="disagree about who this is"):
        pc.verify_provisional([_prov_rule()], lambda _n: "somebody-else",
                              emitted_names=[])


def test_a_stub_emitted_anyway_is_refused():
    with pytest.raises(pc.PersonConsolidationError, match="emitted a stub for it anyway"):
        pc.verify_provisional([_prov_rule()], lambda _n: SURVIVOR,
                              emitted_names=["Retired Stub"])


# --- accounting -------------------------------------------------------------

def test_a_rule_no_producer_consumed_is_refused():
    with pytest.raises(pc.PersonConsolidationError, match="no producer consumed it"):
        pc.assert_every_rule_accounted([_rule()], [[], []])


def test_a_rule_consumed_twice_is_refused():
    entry = {"retired_scope": "canonical", "retired": RETIRED}
    with pytest.raises(pc.PersonConsolidationError, match="consumed 2 times"):
        pc.assert_every_rule_accounted([_rule()], [[entry], [entry]])


def test_an_audit_entry_with_no_rule_behind_it_is_refused():
    entry = {"retired_scope": "canonical", "retired": "nobody-asked-for-this"}
    with pytest.raises(pc.PersonConsolidationError, match="no such rule"):
        pc.assert_every_rule_accounted([], [[entry]])


def test_each_producer_accounts_for_its_own_scope():
    canon = _rule()
    prov = _prov_rule()
    pc.assert_every_rule_accounted(
        [canon, prov],
        [[{"retired_scope": "canonical", "retired": RETIRED}],
         [{"retired_scope": "provisional", "retired": "Retired Stub"}]])


def test_a_rule_consumed_by_the_wrong_scope_is_refused():
    # A provisional rule audited as canonical leaves the real rule unconsumed and
    # invents an entry nothing asked for; both halves are reported.
    with pytest.raises(pc.PersonConsolidationError, match="no producer consumed it"):
        pc.assert_every_rule_accounted(
            [_prov_rule()], [[{"retired_scope": "canonical", "retired": "Retired Stub"}]])
