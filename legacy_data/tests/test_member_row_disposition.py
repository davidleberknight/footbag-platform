"""Contract for the fail-closed disposition on an uncovered legacy_members row.

A row the export does not cover is not automatically a defect: the curated
pipeline is primary and the dump is dirty data, so a curated row the dump misses
is a normal state. What is not acceptable is being unable to tell a row somebody
deliberately kept from a row nobody reviewed, and that is what these fix.

Each disposition binds to why the row is uncovered rather than to the row alone,
so a ruling made under one set of evidence cannot be carried into another. The
coupling that matters most is the dependent person: clearing a row that a
historical person still points at strands that person, so it is refused here
rather than left to a later card to notice.

All data is synthetic; no real member data appears here.
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


mrd = _load("member_row_disposition")

BOUNDARY = "b" * 64


def _uncovered(mid="100", rule="member_valid", pulled=False, deps=(),
               source="system_fixture", boundary=BOUNDARY):
    return {
        "legacy_member_id": mid,
        "import_source": source,
        "exclusion_rule": rule,
        "pulled_back": pulled,
        "dependent_person_ids": list(deps),
        "fingerprint": mrd.uncovered_boundary_fingerprint(
            mid, source, rule, pulled, deps, boundary),
    }


def _disposition(mid, decision, reason, fingerprint, note="synthetic"):
    return mrd.MemberRowDisposition(decision, mid, reason, fingerprint, note)


def _keep(u):
    return _disposition(u["legacy_member_id"], mrd.KEEP,
                        mrd.CURATED_IDENTITY_VOUCHES, u["fingerprint"])


# --- recording a decision ---------------------------------------------------

def test_a_keep_decision_is_recorded_and_clears_nothing():
    u = _uncovered(deps=["P1"])
    audit = mrd.apply_dispositions([u], [_keep(u)])
    assert len(audit) == 1
    assert audit[0]["decision"] == mrd.KEEP
    assert audit[0]["dependent_person_ids"] == ["P1"]
    assert audit[0]["row_cleared"] is False


def test_the_audit_carries_the_rule_that_dropped_the_row():
    # Attribution is the point of persisting exclusion provenance; a disposition
    # that could not name the rule would be a decision about nothing.
    u = _uncovered(rule="test_placeholder")
    audit = mrd.apply_dispositions([u], [_keep(u)])
    assert audit[0]["exclusion_rule"] == "test_placeholder"


def test_defer_is_distinguishable_from_keep():
    # "Not decided" must be sayable. Without it a deferral would have to be
    # recorded as a keep and would stop looking like an open question.
    u = _uncovered()
    audit = mrd.apply_dispositions(
        [u], [_disposition(u["legacy_member_id"], mrd.DEFER,
                           mrd.UNDECIDED_PENDING_REVIEW, u["fingerprint"])])
    assert audit[0]["decision"] == mrd.DEFER


# --- the dependent-person coupling ------------------------------------------

def test_clearing_a_row_a_person_depends_on_is_refused():
    u = _uncovered(deps=["P1", "P2"])
    d = _disposition(u["legacy_member_id"], mrd.CLEAR,
                     mrd.SUPERSEDED_BY_CLEARED_LINK, u["fingerprint"])
    with pytest.raises(mrd.MemberRowDispositionError, match="still depend on this row"):
        mrd.apply_dispositions([u], [d])


def test_clearing_a_row_nothing_depends_on_is_allowed():
    u = _uncovered(deps=())
    d = _disposition(u["legacy_member_id"], mrd.CLEAR,
                     mrd.SUPERSEDED_BY_CLEARED_LINK, u["fingerprint"])
    audit = mrd.apply_dispositions([u], [d])
    assert audit[0]["decision"] == mrd.CLEAR
    # Recording the decision is not performing it.
    assert audit[0]["row_cleared"] is False


def test_a_ruling_goes_stale_when_a_dependant_appears():
    # A keep justified while nothing pointed at the row is a different ruling from
    # one made while a person did, so the evidence change forces a re-decision.
    before = _uncovered(deps=())
    after = _uncovered(deps=["P1"])
    with pytest.raises(mrd.MemberRowDispositionError, match="stale decision boundary"):
        mrd.apply_dispositions([after], [_keep(before)])


def test_a_ruling_goes_stale_when_the_exclusion_rule_changes():
    before = _uncovered(rule="member_valid")
    after = _uncovered(rule="duplicate")
    with pytest.raises(mrd.MemberRowDispositionError, match="stale decision boundary"):
        mrd.apply_dispositions([after], [_keep(before)])


def test_a_ruling_goes_stale_when_the_row_was_pulled_back():
    before = _uncovered(pulled=False)
    after = _uncovered(pulled=True)
    with pytest.raises(mrd.MemberRowDispositionError, match="stale decision boundary"):
        mrd.apply_dispositions([after], [_keep(before)])


def test_a_disposition_for_a_row_now_covered_is_refused():
    u = _uncovered()
    with pytest.raises(mrd.MemberRowDispositionError, match="not uncovered"):
        mrd.apply_dispositions([], [_keep(u)])


def test_a_repeated_disposition_is_refused():
    u = _uncovered()
    with pytest.raises(mrd.MemberRowDispositionError, match="duplicate disposition"):
        mrd.apply_dispositions([u], [_keep(u), _keep(u)])


# --- the completeness gate --------------------------------------------------

def test_an_uncovered_row_with_no_decision_is_refused():
    u = _uncovered()
    with pytest.raises(mrd.MemberRowDispositionError, match="no recorded disposition"):
        mrd.assert_every_uncovered_row_dispositioned([u], [])


def test_the_gate_passes_once_every_row_is_decided():
    u = _uncovered()
    mrd.assert_every_uncovered_row_dispositioned([u], [_keep(u)])


def test_no_uncovered_rows_is_vacuously_complete():
    mrd.assert_every_uncovered_row_dispositioned([], [])


# --- loader guards ----------------------------------------------------------

def _write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(mrd.DISPOSITION_FIELDS)
        w.writerows(rows)


def test_load_rejects_an_unknown_decision(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [["retire", "100", mrd.CURATED_IDENTITY_VOUCHES, "a" * 64, "n"]])
    with pytest.raises(mrd.MemberRowDispositionError, match="unknown decision"):
        mrd.load_dispositions(p)


def test_load_rejects_a_reason_belonging_to_another_decision(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [[mrd.KEEP, "100", mrd.SUPERSEDED_BY_CLEARED_LINK, "a" * 64, "n"]])
    with pytest.raises(mrd.MemberRowDispositionError, match="not valid for decision"):
        mrd.load_dispositions(p)


def test_load_rejects_a_malformed_fingerprint(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [[mrd.KEEP, "100", mrd.CURATED_IDENTITY_VOUCHES, "nope", "n"]])
    with pytest.raises(mrd.MemberRowDispositionError, match="malformed fingerprint"):
        mrd.load_dispositions(p)


def test_load_rejects_a_disposition_with_no_note(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [[mrd.KEEP, "100", mrd.CURATED_IDENTITY_VOUCHES, "a" * 64, ""]])
    with pytest.raises(mrd.MemberRowDispositionError, match="carries a note"):
        mrd.load_dispositions(p)


def test_load_rejects_an_empty_member_id(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [[mrd.KEEP, "", mrd.CURATED_IDENTITY_VOUCHES, "a" * 64, "n"]])
    with pytest.raises(mrd.MemberRowDispositionError, match="legacy_member_id is empty"):
        mrd.load_dispositions(p)


def test_no_disposition_file_is_an_ordinary_run(tmp_path):
    assert mrd.load_dispositions(None) == []
    assert mrd.load_dispositions(tmp_path / "absent.csv") == []


def test_reason_vocabularies_do_not_overlap():
    for decision, reasons in mrd.REASONS_BY_DECISION.items():
        for other, others in mrd.REASONS_BY_DECISION.items():
            if other != decision:
                assert not (reasons & others), (decision, other)
