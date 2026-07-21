"""
test_review_resolution.py
=========================

Contract for the fail-closed Stage B review-group resolution. A resolution moves an
exactly-matched review group out of the active undecided-review output into a
held/audit output, without creating a merge, link, fallback, DOB, or source
correction, and keeps still-pending groups visible. It fails closed on any drift of
the group's decision boundary, a duplicate/contradictory decision, a group not in
review, an unknown outcome, or an affirm-distinct decision with no evidence basis.

All data is synthetic.
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


rr = _load("review_resolution")

BOUNDARY = "b" * 64


def _fp(account_ids, *, cand=("P1",), survivor_map=None, dob=None, country=None,
        loc=None, reason="multiple_accounts_same_name", proposed=False, boundary=BOUNDARY):
    acct = frozenset(account_ids)
    survivor_map = survivor_map or {a: a for a in acct}
    dob = dob or {a: "" for a in acct}
    country = country or {a: "USA" for a in acct}
    loc = loc or {a: "City|ST" for a in acct}
    return rr.review_group_fingerprint(
        account_ids=acct, candidate_person_ids=set(cand), survivor_map=survivor_map,
        dob_by_account=dob, country_by_account=country, location_by_account=loc,
        review_reason=reason, match_methods={reason}, proposed_link=proposed,
        boundary_fingerprint=boundary)


def _descriptor(account_ids, **kw):
    acct = frozenset(account_ids)
    group = kw.pop("group", None) or [{"review_group": "B1", "legacy_member_id": a,
                                       "reason": "multiple_accounts_same_name"} for a in sorted(acct)]
    return {"account_ids": acct, "normalized_name": kw.get("name", "sam rivera"),
            "reason": kw.get("reason", "multiple_accounts_same_name"),
            "candidate_person_ids": frozenset(kw.get("cand", ("P1",))),
            "proposed_link": kw.get("proposed", False),
            "fingerprint": _fp(acct, **{k: v for k, v in kw.items() if k != "name"}),
            "group": group}


def _res(account_ids, outcome, fp, *, reason="r", evidence=""):
    return rr.ReviewResolution(outcome, frozenset(account_ids), reason, evidence, fp, "note")


# --- every outcome resolves + audit preservation ----------------------------

def test_every_outcome_resolves():
    for outcome in rr.VALID_OUTCOMES:
        d = _descriptor({"100", "200"})
        ev = "distinct DOBs + different states" if outcome == rr.AFFIRM_DISTINCT_PEOPLE else ""
        kept, audit = rr.apply_resolutions([d], [_res({"100", "200"}, outcome, d["fingerprint"], evidence=ev)])
        assert kept == []                                   # removed from active review
        assert len(audit) == 1 and audit[0]["outcome"] == outcome


def test_audit_preserves_full_group_and_evidence():
    group = [{"review_group": "B1", "legacy_member_id": "100", "reason": "multiple_accounts_same_name"},
             {"review_group": "B1", "legacy_member_id": "200", "reason": "multiple_accounts_same_name"}]
    d = _descriptor({"100", "200"}, group=group)
    _, audit = rr.apply_resolutions([d], [_res({"100", "200"}, rr.AFFIRM_DISTINCT_PEOPLE,
                                               d["fingerprint"], evidence="distinct DOBs + states")])
    a = audit[0]
    assert a["group"] == group                              # full group preserved
    assert a["evidence_basis"] == "distinct DOBs + states"
    assert a["pending"] is False


def test_pending_outcomes_flagged_for_the_held_report():
    for outcome in rr.PENDING_OUTCOMES:
        d = _descriptor({"100", "200"})
        _, audit = rr.apply_resolutions([d], [_res({"100", "200"}, outcome, d["fingerprint"])])
        assert audit[0]["pending"] is True
    for outcome in (rr.AFFIRM_DISTINCT_PEOPLE, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE):
        d = _descriptor({"100", "200"})
        ev = "x" if outcome == rr.AFFIRM_DISTINCT_PEOPLE else ""
        _, audit = rr.apply_resolutions([d], [_res({"100", "200"}, outcome, d["fingerprint"], evidence=ev)])
        assert audit[0]["pending"] is False


# --- fail-closed drift ------------------------------------------------------

def test_changed_dob_fails_closed():
    recorded = _fp({"100", "200"}, dob={"100": "1990-01-01", "200": "1985-01-01"})
    d = _descriptor({"100", "200"}, dob={"100": "1990-01-01", "200": "1999-09-09"})
    with pytest.raises(rr.ReviewResolutionError, match="stale fingerprint"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_changed_dob_missingness_fails_closed():
    recorded = _fp({"100", "200"}, dob={"100": "1990-01-01", "200": ""})      # 200 missing
    d = _descriptor({"100", "200"}, dob={"100": "1990-01-01", "200": "1990-01-01"})  # now present
    with pytest.raises(rr.ReviewResolutionError, match="stale fingerprint"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_changed_candidate_set_fails_closed():
    recorded = _fp({"100", "200"}, cand=("P1",))
    d = _descriptor({"100", "200"}, cand=("P1", "P2"))
    with pytest.raises(rr.ReviewResolutionError, match="stale fingerprint"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_changed_survivor_mapping_fails_closed():
    recorded = _fp({"100", "200"}, survivor_map={"100": "100", "200": "200"})
    d = _descriptor({"100", "200"}, survivor_map={"100": "100", "200": "100"})   # now merged
    with pytest.raises(rr.ReviewResolutionError, match="stale fingerprint"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_changed_account_membership_no_matching_group():
    d = _descriptor({"100", "300"})                       # live group has different members
    recorded = _fp({"100", "200"})
    with pytest.raises(rr.ReviewResolutionError, match="no matching in-review group"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_unexpected_proposed_link_fails_closed():
    recorded = _fp({"100", "200"}, proposed=False)
    d = _descriptor({"100", "200"}, proposed=True)        # a link now appears
    with pytest.raises(rr.ReviewResolutionError, match="stale fingerprint"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_stale_boundary_fails_closed():
    recorded = _fp({"100", "200"}, boundary="a" * 64)
    d = _descriptor({"100", "200"}, boundary="c" * 64)
    with pytest.raises(rr.ReviewResolutionError, match="stale fingerprint"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, recorded)])


def test_duplicate_or_contradictory_resolution_fails_closed():
    d = _descriptor({"100", "200"})
    r1 = _res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, d["fingerprint"])
    r2 = _res({"100", "200"}, rr.AFFIRM_DISTINCT_PEOPLE, d["fingerprint"], evidence="x")
    with pytest.raises(rr.ReviewResolutionError, match="duplicate/contradictory"):
        rr.apply_resolutions([d], [r1, r2])


def test_resolution_for_group_not_in_review_fails_closed():
    d = _descriptor({"100", "200"})
    with pytest.raises(rr.ReviewResolutionError, match="no matching in-review group"):
        rr.apply_resolutions([d], [_res({"900", "901"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, _fp({"900", "901"}))])


def test_affirm_distinct_without_evidence_basis_fails_closed():
    d = _descriptor({"100", "200"})
    with pytest.raises(rr.ReviewResolutionError, match="evidence basis"):
        rr.apply_resolutions([d], [_res({"100", "200"}, rr.AFFIRM_DISTINCT_PEOPLE, d["fingerprint"])])


# --- no fallback + ordinary behavior ----------------------------------------

def test_only_resolved_group_removed_no_fallback_or_link_added():
    d1 = _descriptor({"100", "200"})
    d2 = _descriptor({"500", "600"}, name="other")
    kept, audit = rr.apply_resolutions([d1, d2],
                                       [_res({"100", "200"}, rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, d1["fingerprint"])])
    kept_accts = {r["legacy_member_id"] for r in kept}
    assert kept_accts == {"500", "600"}                    # only the unresolved group remains
    assert len(kept) == len(d2["group"])                   # no rows added, none invented


def test_no_resolutions_keeps_all_review_unchanged():
    d = _descriptor({"100", "200"})
    kept, audit = rr.apply_resolutions([d], [])
    assert kept == d["group"] and audit == []


# --- loader guards ----------------------------------------------------------

def _write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(rr.RESOLUTION_FIELDS)
        w.writerows(rows)


def test_load_rejects_unknown_outcome(tmp_path):
    p = tmp_path / "r.csv"
    _write(p, [["merge_them", "100|200", "r", "", "a" * 64, "n"]])
    with pytest.raises(rr.ReviewResolutionError, match="unknown outcome"):
        rr.load_resolutions(p)


def test_load_rejects_empty_reason(tmp_path):
    p = tmp_path / "r.csv"
    _write(p, [[rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, "100|200", "", "", "a" * 64, "n"]])
    with pytest.raises(rr.ReviewResolutionError, match="empty reason"):
        rr.load_resolutions(p)


def test_load_rejects_affirm_without_evidence(tmp_path):
    p = tmp_path / "r.csv"
    _write(p, [[rr.AFFIRM_DISTINCT_PEOPLE, "100|200", "r", "", "a" * 64, "n"]])
    with pytest.raises(rr.ReviewResolutionError, match="evidence_basis"):
        rr.load_resolutions(p)


def test_load_rejects_malformed_fingerprint(tmp_path):
    p = tmp_path / "r.csv"
    _write(p, [[rr.KEEP_DISTINCT_INSUFFICIENT_EVIDENCE, "100|200", "r", "", "nothex", "n"]])
    with pytest.raises(rr.ReviewResolutionError, match="malformed fingerprint"):
        rr.load_resolutions(p)


def test_load_missing_path_returns_empty(tmp_path):
    assert rr.load_resolutions(None) == []
    assert rr.load_resolutions(tmp_path / "absent.csv") == []
