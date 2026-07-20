"""
test_person_link_hold.py
========================

Contract for the fail-closed Stage B person-link hold. A hold_link decision
suppresses exactly one mechanically-proposed link, preserves the suppressed
proposal in the audit, creates no alternative link, and fails closed on any drift of
the decision boundary (survivor account set, candidate person, candidate set,
proposal method, match facts, or frozen input boundary). With no hold input the
proposals are unchanged.

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
    with pytest.raises(plh.PersonLinkHoldError, match="unknown reason"):
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
