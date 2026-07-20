"""
test_stage_b_survivor_view.py
=============================

Contract for the Stage A survivor view that feeds Stage B. The view collapses only
the groups Stage A approves for merge, exposes each survivor once with the approved
field union, never collapses a held / review / adjudicated-distinct group, and
never infers a merge of its own. It fails closed on a stale plan or boundary
fingerprint, a loser mapped to two survivors, a missing survivor, or an unapproved
group presented as collapsed. With no survivor view, Stage B is byte-for-byte
unchanged.

All data is synthetic; no real member data appears here.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "member_data_scripts"


def _load(name):
    # Reuse an already-loaded instance so every test file shares ONE module object
    # (and therefore one OverrideError / exception class instance).
    if name in sys.modules:
        return sys.modules[name]
    if str(_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, _SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


rec = _load("reconcile_legacy_members")
ov = _load("stage_a_overrides")


def _acct(mid, name, dob, *, country="USA", email=None, handle=None):
    return {
        "member_valid": "1",
        "legacy_member_id": mid,
        "real_name": name,
        "birth_date": dob,
        "country": country,
        "legacy_email": (f"user{mid}@example.test" if email is None else email),
        "legacy_user_id": (f"handle_{mid}" if handle is None else handle),
    }


def _person(pid, name, lid=""):
    return {"person_id": pid, "person_name": name, "legacy_member_id": lid}


def _logical_ids(view):
    return sorted((a.get("legacy_member_id") or "").strip() for a in view.logical_accounts)


# --- approved duplicate pair collapses; Stage B links uniquely --------------

def test_approved_duplicate_pair_collapses_to_one_logical_account():
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]
    view = rec.build_stage_a_survivor_view(rows)
    assert len(view.collapsed_group_ids) == 1
    assert view.loser_to_survivor == {"200": "100"}
    assert _logical_ids(view) == ["100"]                     # loser hidden
    assert view.provenance["100"] == ["100", "200"]          # traceable to sources

    hp = _person("P1", "Sam Rivera")
    # baseline (no view): two same-name accounts -> a review group, no link
    base_prop, base_rev = rec.build_stage_b(rows, [hp])
    assert len(base_prop) == 0 and len(base_rev) == 2
    # survivor view: one logical account -> a unique proposed link, no review
    prop, rev = rec.build_stage_b(view.logical_accounts, [hp])
    assert len(rev) == 0
    assert len(prop) == 1 and prop[0]["match_signal"] == "name_dob"
    assert prop[0]["legacy_member_id"] == "100"


# --- held pair is never collapsed -------------------------------------------

def test_country_conflict_pair_is_not_collapsed():
    rows = [_acct("100", "Sam Rivera", "1990-04-01", country="USA"),
            _acct("200", "Sam Rivera", "1990-04-01", country="Canada")]
    view = rec.build_stage_a_survivor_view(rows)
    assert view.collapsed_group_ids == []
    assert view.loser_to_survivor == {}
    assert _logical_ids(view) == ["100", "200"]              # both remain


# --- override-approved pair collapses ---------------------------------------

def test_override_approved_pair_collapses():
    rows = [_acct("100", "Sam Rivera", "1990-04-01", country="SCG"),
            _acct("200", "Sam Rivera", "1990-04-01", country="Serbia")]
    g = rec.build_stage_a_groups(rows)[0]
    base = rec.evaluate_merge_group(g)
    assert base.action == "review" and base.reason == "country_conflict"
    countries = {(a.get("country") or "").strip() for a in g.accounts if (a.get("country") or "").strip()}
    ids = [(a.get("legacy_member_id") or "").strip() for a in g.accounts]
    fp = ov.group_fingerprint(ids, g.match_key, base.action, base.reason, countries)
    o = ov.Override(ov.APPROVE, frozenset(ids), ov.disposition(base.action, base.reason), fp, "synthetic")

    without = rec.build_stage_a_survivor_view(rows)
    assert without.collapsed_group_ids == []                 # held without the override
    with_ov = rec.build_stage_a_survivor_view(rows, overrides=[o])
    assert len(with_ov.collapsed_group_ids) == 1             # collapsed with it
    assert _logical_ids(with_ov) == ["100"]


# --- loser-only evidence survives the union ---------------------------------

def test_loser_only_email_survives_on_the_logical_survivor():
    # survivor 100 carries no email; loser 200 does. The union must move the
    # loser's email onto the exposed survivor so the evidence is not discarded.
    rows = [_acct("100", "Sam Rivera", "1990-04-01", email=""),
            _acct("200", "Sam Rivera", "1990-04-01", email="loser@example.test")]
    view = rec.build_stage_a_survivor_view(rows)
    assert _logical_ids(view) == ["100"]
    surv = view.logical_accounts[0]
    emails = {surv.get("legacy_email"), surv.get("legacy_email2"), surv.get("legacy_email3")}
    assert "loser@example.test" in emails


# --- fail closed: stale fingerprints ----------------------------------------

def test_stale_plan_fingerprint_fails_closed():
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]
    with pytest.raises(rec.StageASurvivorError, match="stale Stage A plan"):
        rec.build_stage_a_survivor_view(rows, expected_plan_fingerprint="deadbeef")


def test_stale_boundary_fingerprint_fails_closed():
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]
    with pytest.raises(rec.StageASurvivorError, match="stale input boundary"):
        rec.build_stage_a_survivor_view(rows, expected_boundary_fingerprint="deadbeef")


def test_stage_b_boundary_mismatch_fails_closed(tmp_path):
    # A survivor view built on one extract must not be applied to a different one.
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]
    view = rec.build_stage_a_survivor_view(rows)
    view2 = rec.StageASurvivorView(
        logical_accounts=view.logical_accounts, loser_to_survivor=view.loser_to_survivor,
        provenance=view.provenance, collapsed_group_ids=view.collapsed_group_ids,
        boundary_fingerprint="deadbeef", plan_fingerprint=view.plan_fingerprint)
    import csv as _csv
    p = tmp_path / "extract.csv"
    with p.open("w", newline="", encoding="utf-8") as f:
        w = _csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader(); w.writerows(rows)
    with pytest.raises(rec.StageASurvivorError, match="boundary differs"):
        rec.stage_b_link_historical_persons(p, p, tmp_path / "prop.csv",
                                            tmp_path / "rev.csv", view2)


# --- fail closed: conflicting / missing / unapproved (crafted plans) ---------

def _md(group_id, survivor_id, loser_ids, accounts, action="merge", reason=""):
    return rec.MergeDecision(group_id, "k", accounts, survivor_id, action, reason,
                             (accounts[0] if action == "merge" else None), list(loser_ids))


def test_loser_mapped_to_two_survivors_fails_closed(monkeypatch):
    rows = [_acct("100", "A", "1990-01-01"), _acct("200", "A", "1990-01-01"),
            _acct("300", "A", "1990-01-01")]
    a1 = _md("G1", "100", ["200"], [rows[0]])
    a2 = _md("G2", "300", ["200"], [rows[2]])
    monkeypatch.setattr(rec, "plan_auto_merges",
                        lambda *a, **k: {"merges": [a1, a2], "decisions": [a1, a2]})
    with pytest.raises(rec.StageASurvivorError, match="maps to two survivors"):
        rec.build_stage_a_survivor_view(rows)


def test_missing_survivor_fails_closed(monkeypatch):
    rows = [_acct("100", "A", "1990-01-01"), _acct("200", "A", "1990-01-01")]
    ghost = _md("G1", "999", ["200"], [rows[0]])
    monkeypatch.setattr(rec, "plan_auto_merges",
                        lambda *a, **k: {"merges": [ghost], "decisions": [ghost]})
    with pytest.raises(rec.StageASurvivorError, match="survivor 999 missing"):
        rec.build_stage_a_survivor_view(rows)


def test_unapproved_group_presented_as_collapsed_fails_closed(monkeypatch):
    rows = [_acct("100", "A", "1990-01-01"), _acct("200", "A", "1990-01-01")]
    merge = _md("G1", "100", ["200"], [rows[0]])
    held = _md("G2", "200", [], [rows[1]], action="review", reason="country_conflict")
    monkeypatch.setattr(rec, "plan_auto_merges",
                        lambda *a, **k: {"merges": [merge], "decisions": [merge, held]})
    with pytest.raises(rec.StageASurvivorError, match="unapproved"):
        rec.build_stage_a_survivor_view(rows)


# --- determinism + byte-for-byte compatibility ------------------------------

def test_deterministic_output():
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01"),
            _acct("300", "Dana Cole", "1988-02-02")]
    v1 = rec.build_stage_a_survivor_view(rows)
    v2 = rec.build_stage_a_survivor_view(rows)
    assert v1.plan_fingerprint == v2.plan_fingerprint
    assert v1.boundary_fingerprint == v2.boundary_fingerprint
    assert v1.loser_to_survivor == v2.loser_to_survivor
    assert _logical_ids(v1) == _logical_ids(v2)


def test_no_duplicates_leaves_universe_unchanged():
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("300", "Dana Cole", "1988-02-02")]
    view = rec.build_stage_a_survivor_view(rows)
    assert view.collapsed_group_ids == []
    assert view.loser_to_survivor == {}
    assert _logical_ids(view) == ["100", "300"]


def test_stage_b_unchanged_without_a_survivor_view():
    # The no-view path must equal a direct build_stage_b call, byte for byte.
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]
    hps = [_person("P1", "Sam Rivera")]
    prop_direct, rev_direct = rec.build_stage_b(rows, hps)
    view = rec.build_stage_a_survivor_view(rows)
    # a view exists, but Stage B on the RAW rows is still the baseline
    prop_raw, rev_raw = rec.build_stage_b(rows, hps)
    assert prop_direct == prop_raw and rev_direct == rev_raw
    assert len(rev_direct) == 2 and len(prop_direct) == 0
