"""
test_entitlement_disposition.py
==============================

Contract for the fail-closed entitlement-disposition mechanism. A merge whose
survivor carries a production-authority entitlement (legacy_is_admin) requires an
explicit disposition keyed to the merge's account set + fingerprint. A
preserve_provenance_only disposition keeps the raw value and its source-account
provenance visible while producing no active admin grant. The gate fails closed on
a missing disposition, a stale fingerprint, an unapproved merge, unknown values, or
a duplicate; merges with no privileged entitlement are unaffected.

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


ed = _load("entitlement_disposition")
rec = _load("reconcile_legacy_members")


def _acct(mid, name, dob, *, admin="0"):
    return {"member_valid": "1", "legacy_member_id": mid, "real_name": name,
            "birth_date": dob, "country": "USA",
            "legacy_email": f"u{mid}@example.test", "legacy_user_id": f"h{mid}",
            "legacy_is_admin": admin}


def _privileged_pair(admin_on="100"):
    # same name + full DOB -> a clean Stage A auto-merge; one account is admin
    return [_acct("100", "Sam Rivera", "1990-04-01", admin="1" if admin_on == "100" else "0"),
            _acct("200", "Sam Rivera", "1990-04-01", admin="1" if admin_on == "200" else "0")]


def _fp(rows, ids):
    kept, _ = rec.reconcilable_rows(rows)
    by_id = {(r.get("legacy_member_id") or "").strip(): r for r in kept}
    return rec._account_set_fingerprint_for(by_id, frozenset(ids))


def _disp(rows, ids, *, fingerprint=None, disposition=None):
    return ed.EntitlementDisposition(
        frozenset(ids), "legacy_is_admin",
        disposition or ed.PRESERVE_PROVENANCE_ONLY,
        fingerprint if fingerprint is not None else _fp(rows, ids), "synthetic")


# --- admin on survivor / on loser -------------------------------------------

def test_admin_on_survivor_requires_and_gets_disposition():
    rows = _privileged_pair(admin_on="100")     # survivor (lowest id) carries it
    plan = rec.plan_auto_merges(rows, entitlement_dispositions=[_disp(rows, {"100", "200"})])
    a = plan["entitlement_audit"]
    assert len(a) == 1
    assert a[0]["source_accounts"] == ["100"]
    assert a[0]["raw_value"] == "1"
    assert a[0]["effective_admin_authorization"] is False


def test_admin_on_loser_carries_to_survivor_with_provenance():
    rows = _privileged_pair(admin_on="200")     # loser carries it; OR-union moves it
    plan = rec.plan_auto_merges(rows, entitlement_dispositions=[_disp(rows, {"100", "200"})])
    a = plan["entitlement_audit"][0]
    assert a["source_accounts"] == ["200"]       # provenance = the loser
    assert plan["merges"][0].survivor_row["legacy_is_admin"] == "1"
    assert a["effective_admin_authorization"] is False


# --- provenance-only disposition + provenance-visible-while-effective-false --

def test_provenance_only_keeps_raw_and_makes_effective_admin_false():
    rows = _privileged_pair(admin_on="100")
    plan = rec.plan_auto_merges(rows, entitlement_dispositions=[_disp(rows, {"100", "200"})])
    surv = plan["merges"][0].survivor_row
    a = plan["entitlement_audit"][0]
    assert surv["legacy_is_admin"] == "1"                       # raw preserved / visible
    assert a["disposition"] == ed.PRESERVE_PROVENANCE_ONLY
    assert a["effective_admin_authorization"] is False          # no active grant


# --- fail-closed paths ------------------------------------------------------

def test_missing_disposition_fails_closed():
    rows = _privileged_pair()
    with pytest.raises(ed.EntitlementDispositionError, match="without an explicit entitlement disposition"):
        rec.plan_auto_merges(rows)


def test_stale_fingerprint_fails_closed():
    rows = _privileged_pair()
    with pytest.raises(ed.EntitlementDispositionError, match="stale fingerprint"):
        rec.plan_auto_merges(rows, entitlement_dispositions=[_disp(rows, {"100", "200"},
                                                                   fingerprint="a" * 64)])


def test_disposition_for_unapproved_merge_or_changed_membership_fails_closed():
    rows = _privileged_pair()
    bad = ed.EntitlementDisposition(frozenset({"100", "999"}), "legacy_is_admin",
                                    ed.PRESERVE_PROVENANCE_ONLY, "a" * 64, "x")
    with pytest.raises(ed.EntitlementDispositionError, match="no approved privileged merge"):
        rec.plan_auto_merges(rows, entitlement_dispositions=[bad])


def test_duplicate_disposition_fails_closed():
    rows = _privileged_pair()
    d = _disp(rows, {"100", "200"})
    with pytest.raises(ed.EntitlementDispositionError, match="duplicate disposition"):
        rec.plan_auto_merges(rows, entitlement_dispositions=[d, d])


# --- non-privileged merge is unaffected -------------------------------------

def test_non_privileged_merge_needs_no_disposition():
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]   # neither admin
    plan = rec.plan_auto_merges(rows)
    assert len(plan["merges"]) == 1
    assert plan["entitlement_audit"] == []


# --- loader fail-closed -----------------------------------------------------

def _write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(ed.DISPOSITION_FIELDS)
        w.writerows(rows)


def test_load_rejects_unknown_entitlement(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [["100|200", "legacy_ever_paid_tier2", ed.PRESERVE_PROVENANCE_ONLY, "a" * 64, "n"]])
    with pytest.raises(ed.EntitlementDispositionError, match="unknown entitlement"):
        ed.load_dispositions(p)


def test_load_rejects_unknown_disposition(tmp_path):
    p = tmp_path / "d.csv"
    _write(p, [["100|200", "legacy_is_admin", "grant_admin", "a" * 64, "n"]])
    with pytest.raises(ed.EntitlementDispositionError, match="unknown disposition"):
        ed.load_dispositions(p)


def test_load_rejects_bad_header(tmp_path):
    p = tmp_path / "d.csv"
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["account_ids", "disposition"])
    with pytest.raises(ed.EntitlementDispositionError, match="header must contain"):
        ed.load_dispositions(p)


def test_load_missing_path_returns_empty(tmp_path):
    assert ed.load_dispositions(None) == []
    assert ed.load_dispositions(tmp_path / "absent.csv") == []


def test_load_round_trip_applies(tmp_path):
    rows = _privileged_pair(admin_on="100")
    fp = _fp(rows, {"100", "200"})
    p = tmp_path / "d.csv"
    _write(p, [["100|200", "legacy_is_admin", ed.PRESERVE_PROVENANCE_ONLY, fp, "synthetic"]])
    disp = ed.load_dispositions(p)
    plan = rec.plan_auto_merges(rows, entitlement_dispositions=disp)
    assert plan["entitlement_audit"][0]["effective_admin_authorization"] is False
