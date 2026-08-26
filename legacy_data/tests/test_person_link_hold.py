"""
test_person_link_hold.py
========================

Contract for the fail-closed Stage B person-link adjudications.

A hold_link decision suppresses exactly one mechanically-proposed link, preserves
the suppressed proposal in the audit, creates no alternative link, and fails closed
on any drift of the decision boundary (survivor account set, candidate person,
candidate set, proposal method, match facts, or frozen input boundary). With no
hold input the proposals are unchanged.

The two person-scoped decisions record why a person has no link at all: no_account
when the member population holds none, and duplicate_person when the row is the
same human as another person row. Both bind to the evidence that made them true,
so a ruling cannot outlive it, and a completeness gate refuses a load in which any
eligible person carries neither a proposal nor a decision.

All data is synthetic; no real member or person data appears here.
"""
import csv
import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "member_data_scripts"


def _load(name):
    if name in sys.modules:
        return sys.modules[name]
    if str(_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, _SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


plh = _load("person_link_hold")

BOUNDARY = "b" * 64
FACTS = "sam rivera|1990-01-01|"


def _proposal(mid="100", pid="P1"):
    return {"legacy_member_id": mid, "historical_person_id": pid,
            "normalized_name": "sam rivera", "match_signal": "name_dob",
            "account_birth_date": "1990-01-01", "account_email": ""}


def _descriptor(survivor_ids, cand, cset, *, signal="name_dob", facts=FACTS,
                boundary=BOUNDARY, proposal=None):
    fp = plh.link_boundary_fingerprint(survivor_ids, cand, cset, signal, facts, boundary)
    return {"survivor_account_ids": frozenset(survivor_ids), "candidate_person_id": cand,
            "match_signal": signal, "normalized_name": facts.split("|")[0],
            "candidate_set": list(cset), "fingerprint": fp,
            "proposal": proposal if proposal is not None else _proposal()}


def _hold(survivor_ids, cand, fingerprint, reason=None):
    return plh.PersonLinkHold(plh.HOLD_LINK, frozenset(survivor_ids), cand,
                              reason or plh.UNRESOLVED_PENDING_EXTERNAL_CORROBORATION,
                              fingerprint, "synthetic")


# --- unique proposal held + audit preservation ------------------------------

def test_unique_proposal_is_held_and_no_fallback_selected():
    d = _descriptor({"701", "702"}, "P1", ["P1"])
    kept, audit = plh.apply_holds([d], [_hold({"701", "702"}, "P1", d["fingerprint"])])
    assert kept == []                                   # the only proposal suppressed
    assert not any(p["legacy_member_id"] == "701" for p in kept)  # no fallback candidate
    assert len(audit) == 1 and audit[0]["candidate_person_id"] == "P1"


def test_suppressed_proposal_and_evidence_preserved_in_audit():
    prop = _proposal()
    d = _descriptor({"701", "702"}, "P1", ["P1"], proposal=prop)
    _, audit = plh.apply_holds([d], [_hold({"701", "702"}, "P1", d["fingerprint"])])
    a = audit[0]
    assert a["suppressed_proposal"] == prop            # full proposal preserved
    assert a["link_created"] is False                  # no alternative link
    assert a["reason"] == plh.UNRESOLVED_PENDING_EXTERNAL_CORROBORATION
    assert a["match_signal"] == "name_dob" and a["candidate_set"] == ["P1"]


def test_only_the_matching_proposal_is_suppressed():
    # a second, unrelated proposal must survive untouched
    d1 = _descriptor({"701", "702"}, "P1", ["P1"], proposal=_proposal("701", "P1"))
    d2 = _descriptor({"500"}, "P9", ["P9"], facts="other name|1985-02-02|",
                     proposal=_proposal("500", "P9"))
    kept, audit = plh.apply_holds([d1, d2], [_hold({"701", "702"}, "P1", d1["fingerprint"])])
    assert [p["legacy_member_id"] for p in kept] == ["500"]
    assert len(audit) == 1


# --- fail-closed drift ------------------------------------------------------

def test_changed_candidate_set_fails_closed():
    # hold recorded against candidate_set ["P1"]; the live set grew to ["P1","P2"]
    old_fp = plh.link_boundary_fingerprint({"701", "702"}, "P1", ["P1"],
                                           "name_dob", FACTS, BOUNDARY)
    d = _descriptor({"701", "702"}, "P1", ["P1", "P2"])
    with pytest.raises(plh.PersonLinkHoldError, match="stale"):
        plh.apply_holds([d], [_hold({"701", "702"}, "P1", old_fp)])


def test_changed_survivor_membership_fails_closed():
    d = _descriptor({"701", "703"}, "P1", ["P1"])   # live survivor set differs
    fp_for_recorded = plh.link_boundary_fingerprint({"701", "702"}, "P1", ["P1"],
                                                    "name_dob", FACTS, BOUNDARY)
    with pytest.raises(plh.PersonLinkHoldError, match="no such uniquely-proposed link"):
        plh.apply_holds([d], [_hold({"701", "702"}, "P1", fp_for_recorded)])


def test_stale_boundary_fingerprint_fails_closed():
    old_fp = plh.link_boundary_fingerprint({"701", "702"}, "P1", ["P1"],
                                           "name_dob", FACTS, "a" * 64)     # old boundary
    d = _descriptor({"701", "702"}, "P1", ["P1"], boundary="c" * 64)   # new boundary
    with pytest.raises(plh.PersonLinkHoldError, match="stale"):
        plh.apply_holds([d], [_hold({"701", "702"}, "P1", old_fp)])


def test_stale_decision_fingerprint_fails_closed():
    d = _descriptor({"701", "702"}, "P1", ["P1"])
    with pytest.raises(plh.PersonLinkHoldError, match="stale"):
        plh.apply_holds([d], [_hold({"701", "702"}, "P1", "0" * 64)])


def test_changed_proposal_method_fails_closed():
    old_fp = plh.link_boundary_fingerprint({"701", "702"}, "P1", ["P1"],
                                           "name_dob", FACTS, BOUNDARY)
    d = _descriptor({"701", "702"}, "P1", ["P1"], signal="name_email")  # method changed
    with pytest.raises(plh.PersonLinkHoldError, match="stale"):
        plh.apply_holds([d], [_hold({"701", "702"}, "P1", old_fp)])


def test_missing_candidate_fails_closed():
    d = _descriptor({"701", "702"}, "P1", ["P1"])   # proposal is for P1
    fp = plh.link_boundary_fingerprint({"701", "702"}, "P2", ["P1"],
                                       "name_dob", FACTS, BOUNDARY)
    with pytest.raises(plh.PersonLinkHoldError, match="no such uniquely-proposed link"):
        plh.apply_holds([d], [_hold({"701", "702"}, "P2", fp)])   # hold names P2


def test_no_longer_produced_proposal_fails_closed():
    # the proposal was expected but is no longer produced (no descriptors)
    fp = plh.link_boundary_fingerprint({"701", "702"}, "P1", ["P1"],
                                       "name_dob", FACTS, BOUNDARY)
    with pytest.raises(plh.PersonLinkHoldError, match="no such uniquely-proposed link"):
        plh.apply_holds([], [_hold({"701", "702"}, "P1", fp)])


def test_duplicate_hold_fails_closed():
    d = _descriptor({"701", "702"}, "P1", ["P1"])
    h = _hold({"701", "702"}, "P1", d["fingerprint"])
    with pytest.raises(plh.PersonLinkHoldError, match="duplicate hold"):
        plh.apply_holds([d], [h, h])


# --- ordinary behavior unchanged --------------------------------------------

def test_no_holds_keeps_all_proposals():
    d = _descriptor({"701", "702"}, "P1", ["P1"])
    kept, audit = plh.apply_holds([d], [])
    assert kept == [d["proposal"]] and audit == []


# --- loader guards ----------------------------------------------------------

def _write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(plh.HOLD_FIELDS)
        w.writerows(rows)


def test_load_missing_path_returns_empty(tmp_path):
    assert plh.load_holds(None) == []
    assert plh.load_holds(tmp_path / "absent.csv") == []


def test_load_rejects_unknown_decision(tmp_path):
    p = tmp_path / "h.csv"
    _write(p, [["drop_link", "100|200", "P1", plh.UNRESOLVED_PENDING_EXTERNAL_CORROBORATION, "a" * 64, "n"]])
    with pytest.raises(plh.PersonLinkHoldError, match="unknown decision"):
        plh.load_holds(p)


def test_load_rejects_unknown_reason(tmp_path):
    p = tmp_path / "h.csv"
    _write(p, [[plh.HOLD_LINK, "100|200", "P1", "because", "a" * 64, "n"]])
    with pytest.raises(plh.PersonLinkHoldError, match="not valid for decision"):
        plh.load_holds(p)


def test_load_rejects_a_reason_belonging_to_a_different_decision(tmp_path):
    # Each decision owns its reason codes. A shared vocabulary would let a
    # no-account ruling wear a hold_link reason and read as adjudicated.
    p = tmp_path / "h.csv"
    _write(p, [[plh.HOLD_LINK, "100|200", "P1",
                plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION, "a" * 64, "n"]])
    with pytest.raises(plh.PersonLinkHoldError, match="not valid for decision"):
        plh.load_holds(p)


def test_load_rejects_malformed_fingerprint(tmp_path):
    p = tmp_path / "h.csv"
    _write(p, [[plh.HOLD_LINK, "100|200", "P1", plh.UNRESOLVED_PENDING_EXTERNAL_CORROBORATION, "nothex", "n"]])
    with pytest.raises(plh.PersonLinkHoldError, match="malformed fingerprint"):
        plh.load_holds(p)


def test_load_round_trip(tmp_path):
    d = _descriptor({"701", "702"}, "P1", ["P1"])
    p = tmp_path / "h.csv"
    _write(p, [[plh.HOLD_LINK, "701|702", "P1",
                plh.UNRESOLVED_PENDING_EXTERNAL_CORROBORATION, d["fingerprint"], "synthetic"]])
    holds = plh.load_holds(p)
    assert len(holds) == 1
    kept, audit = plh.apply_holds([d], holds)
    assert kept == [] and len(audit) == 1


# --- person-scoped dispositions --------------------------------------------
#
# A person with no proposed link and a person nobody has looked at are the same
# row until somebody records a decision. These fix what that record has to prove.

def _person(pid="P9", name="sam rivera", accounts=(), boundary=BOUNDARY):
    def fingerprint_for(duplicate_of=""):
        return plh.person_boundary_fingerprint(pid, name, accounts, duplicate_of, boundary)
    return {"candidate_person_id": pid, "normalized_name": name,
            "account_ids_bearing_name": set(accounts),
            "fingerprint_for": fingerprint_for}


def _disposition(pid, decision, reason, fingerprint, duplicate_of=""):
    return plh.PersonLinkHold(decision, frozenset(), pid, reason, fingerprint,
                              "synthetic", duplicate_of)


def test_no_account_disposition_records_the_decision_and_creates_no_link():
    d = _person()
    audit = plh.apply_person_dispositions(
        [d], [_disposition("P9", plh.NO_ACCOUNT,
                           plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
                           d["fingerprint_for"](""))],
        known_person_ids={"P9"})
    assert len(audit) == 1
    assert audit[0]["decision"] == plh.NO_ACCOUNT
    assert audit[0]["link_created"] is False


def test_no_account_disposition_goes_stale_when_an_account_appears():
    # The ruling was true of a population with no account by this name. A delivery
    # that introduces one must force the ruling to be made again rather than let
    # the old one stand over new evidence.
    made_against = _person(accounts=())
    fingerprint = made_against["fingerprint_for"]("")
    now = _person(accounts=("4242",))
    with pytest.raises(plh.PersonLinkHoldError, match="stale decision boundary"):
        plh.apply_person_dispositions(
            [now], [_disposition("P9", plh.NO_ACCOUNT,
                                 plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION, fingerprint)],
            known_person_ids={"P9"})


def test_duplicate_person_disposition_carries_the_row_it_duplicates():
    d = _person()
    audit = plh.apply_person_dispositions(
        [d], [_disposition("P9", plh.DUPLICATE_PERSON,
                           plh.DUPLICATE_STROKE_LETTER_VARIANT,
                           d["fingerprint_for"]("P1"), duplicate_of="P1")],
        known_person_ids={"P9", "P1"})
    assert audit[0]["duplicate_of_person_id"] == "P1"
    assert audit[0]["link_created"] is False


def test_duplicate_person_disposition_rejects_an_unknown_target():
    d = _person()
    with pytest.raises(plh.PersonLinkHoldError, match="not in the person population"):
        plh.apply_person_dispositions(
            [d], [_disposition("P9", plh.DUPLICATE_PERSON,
                               plh.DUPLICATE_SPELLING_VARIANT,
                               d["fingerprint_for"]("P404"), duplicate_of="P404")],
            known_person_ids={"P9"})


def test_disposition_for_a_person_no_longer_awaiting_one_is_refused():
    d = _person()
    with pytest.raises(plh.PersonLinkHoldError, match="no such person awaiting"):
        plh.apply_person_dispositions(
            [], [_disposition("P9", plh.NO_ACCOUNT,
                              plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
                              d["fingerprint_for"](""))],
            known_person_ids={"P9"})


def test_repeated_disposition_for_one_person_is_refused():
    d = _person()
    one = _disposition("P9", plh.NO_ACCOUNT,
                       plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
                       d["fingerprint_for"](""))
    with pytest.raises(plh.PersonLinkHoldError, match="duplicate disposition"):
        plh.apply_person_dispositions([d], [one, one], known_person_ids={"P9"})


def test_every_person_must_carry_a_disposition():
    # The gate the final load runs: an unreviewed person must not pass as an
    # accepted absence.
    with pytest.raises(plh.PersonLinkHoldError, match="neither a proposed link nor"):
        plh.assert_every_person_dispositioned([_person(pid="P9")], [])


def test_the_completeness_gate_passes_once_each_person_is_ruled_on():
    d = _person(pid="P9")
    plh.assert_every_person_dispositioned(
        [d], [_disposition("P9", plh.NO_ACCOUNT,
                           plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
                           d["fingerprint_for"](""))])


def test_person_scoped_rows_never_reach_the_proposal_path():
    # The two kinds of decision share a file. A disposition says nothing about a
    # proposal, so it must not suppress one or be treated as an unmatched hold.
    d = _descriptor({"701"}, "P1", ["P1"])
    kept, audit = plh.apply_holds(
        [d], [_disposition("P9", plh.NO_ACCOUNT,
                           plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION, "c" * 64)])
    assert kept == [d["proposal"]]
    assert audit == []


def test_load_rejects_a_person_scoped_row_carrying_accounts(tmp_path):
    p = tmp_path / "h.csv"
    _write(p, [[plh.NO_ACCOUNT, "100|200", "P9",
                plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION, "a" * 64, "n"]])
    with pytest.raises(plh.PersonLinkHoldError, match="survivor_account_ids must be empty"):
        plh.load_holds(p)


def test_load_rejects_a_duplicate_decision_with_no_target(tmp_path):
    p = tmp_path / "h.csv"
    _write(p, [[plh.DUPLICATE_PERSON, "", "P9",
                plh.DUPLICATE_SPELLING_VARIANT, "a" * 64, "n"]])
    with pytest.raises(plh.PersonLinkHoldError, match="must name the row it duplicates"):
        plh.load_holds(p)


def test_load_rejects_an_adjudication_with_no_note(tmp_path):
    p = tmp_path / "h.csv"
    _write(p, [[plh.NO_ACCOUNT, "", "P9",
                plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION, "a" * 64, ""]])
    with pytest.raises(plh.PersonLinkHoldError, match="carries a note"):
        plh.load_holds(p)


def test_a_cohort_review_row_is_unresolved_not_spoken_for():
    # Inside an adjudicated cohort a review row is the unresolved case, so it must
    # still demand a ruling. Outside one it is an ordinary queue somebody works.
    import reconcile_legacy_members as rlm
    accounts = [{"legacy_member_id": "1", "member_valid": "1", "real_name": "sam rivera",
                 "birth_date": "1990-01-01", "legacy_email": ""}]
    hps = [{"person_id": "P1", "person_name": "sam rivera", "legacy_member_id": "",
            "source": "MEMBERSHIP", "source_scope": "PROVISIONAL"}]
    review = [{"historical_person_id": "P1"}]

    inside = rlm._build_person_disposition_descriptors(
        [], review, accounts, hps, cohort_person_ids={"P1"})
    assert [d["candidate_person_id"] for d in inside] == ["P1"]

    outside = rlm._build_person_disposition_descriptors([], review, accounts, hps)
    assert outside == []
