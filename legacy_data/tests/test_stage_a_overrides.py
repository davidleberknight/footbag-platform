"""
test_stage_a_overrides.py
=========================

Fail-closed contract for the Stage A adjudication-override input. A maintainer
override records one decision about a duplicate-account group -- approve it as the
same person, or hold it as distinct -- keyed by the group's stable account ids plus
a privacy-safe fingerprint of its facts. An override applies only when the live
group membership, the baseline planner disposition, and the recomputed fingerprint
all match exactly, and the decision still changes the baseline result; every other
case fails closed and aborts the run.

All data here is synthetic. The real adjudication values live in the controlled
private input layer and never reach this repository.
"""
import csv
import importlib.util
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "member_data_scripts"


def _load(name):
    import sys
    # Reuse an already-loaded instance so every test file shares ONE module object
    # (and therefore one OverrideError class); re-execing would make pytest.raises
    # match a different class instance.
    if name in sys.modules:
        return sys.modules[name]
    # The reconciler imports stage_a_overrides by bare name; make the dir importable.
    if str(_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, _SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    # Register before exec so dataclasses can resolve the module for string
    # annotations (from __future__ import annotations).
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


ov = _load("stage_a_overrides")
rec = _load("reconcile_legacy_members")


# --- synthetic account rows -------------------------------------------------

def _acct(mid, name, dob, *, country="", email=None, handle=None):
    """A minimal member_valid=1 account row with distinct email + handle so it
    never lands in the email / user-id collision cohort."""
    return {
        "member_valid": "1",
        "legacy_member_id": mid,
        "real_name": name,
        "birth_date": dob,
        "country": country,
        "legacy_email": email if email is not None else f"user{mid}@example.test",
        "legacy_user_id": handle if handle is not None else f"handle_{mid}",
    }


def _group_pair(rows):
    """(group, baseline_decision) for the single expected Stage A group in rows."""
    groups = rec.build_stage_a_groups(rows)
    assert len(groups) == 1, f"expected exactly one group, got {len(groups)}"
    g = groups[0]
    return g, rec.evaluate_merge_group(g)


def _fingerprint_for(g, decision):
    countries = {(a.get("country") or "").strip()
                 for a in g.accounts if (a.get("country") or "").strip()}
    ids = [(a.get("legacy_member_id") or "").strip() for a in g.accounts]
    return ov.group_fingerprint(ids, g.match_key, decision.action, decision.reason, countries)


def _override(decision_word, g, base, fingerprint=None, expected=None):
    ids = frozenset((a.get("legacy_member_id") or "").strip() for a in g.accounts)
    return ov.Override(
        decision=decision_word,
        account_ids=ids,
        expected_disposition=expected if expected is not None
        else ov.disposition(base.action, base.reason),
        fingerprint=fingerprint if fingerprint is not None else _fingerprint_for(g, base),
        note="synthetic",
    )


def _country_conflict_rows():
    # Same normalized name + full DOB, two different non-empty countries -> held.
    return [
        _acct("100", "Sam Rivera", "1990-04-01", country="SCG"),
        _acct("200", "Sam Rivera", "1990-04-01", country="Serbia"),
    ]


def _clean_merge_rows():
    # Same name + DOB, no conflicting field -> clean auto-merge.
    return [
        _acct("300", "Dana Cole", "1988-02-02", country="USA"),
        _acct("400", "Dana Cole", "1988-02-02", country="USA"),
    ]


# --- baseline invariance ----------------------------------------------------

def test_no_override_input_is_plain_baseline():
    rows = _country_conflict_rows()
    base = rec.plan_auto_merges(rows)
    empty = rec.plan_auto_merges(rows, overrides=[])
    none = rec.plan_auto_merges(rows, overrides=None)
    for plan in (base, empty, none):
        assert len(plan["merges"]) == 0
        assert len(plan["reviews"]) == 1
        assert plan["reviews"][0].reason == "country_conflict"


def test_country_conflict_group_is_held_by_default():
    g, base = _group_pair(_country_conflict_rows())
    assert base.action == "review"
    assert base.reason == "country_conflict"


# --- approve_same_person ----------------------------------------------------

def test_approve_flips_held_group_to_merge():
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    plan = rec.plan_auto_merges(rows, overrides=[_override(ov.APPROVE, g, base)])
    assert len(plan["merges"]) == 1
    assert len(plan["reviews"]) == 0
    merged = plan["merges"][0]
    assert merged.survivor_id == "100"          # lowest legacy_member_id survives
    assert merged.loser_ids == ["200"]


def test_approve_preserves_original_country_values():
    # The override lets the merge happen; it must not rewrite either country.
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    plan = rec.plan_auto_merges(rows, overrides=[_override(ov.APPROVE, g, base)])
    countries = {(a.get("country") or "").strip() for a in plan["merges"][0].accounts}
    assert countries == {"SCG", "Serbia"}


def test_approve_on_already_merging_group_fails_closed():
    # An approve that does not change the baseline result is refused.
    rows = _clean_merge_rows()
    g, base = _group_pair(rows)
    assert base.action == "merge"
    with pytest.raises(ov.OverrideError, match="does not change"):
        rec.plan_auto_merges(rows, overrides=[_override(ov.APPROVE, g, base)])


def test_approve_fails_when_another_block_still_holds():
    # country_conflict AND unpreservable_handle: approving the reviewed block
    # (country) still leaves the handle block, so no merge is produced.
    rows = [
        _acct("500", "Lee Park", "1991-05-05", country="USA",
              email="survivor@example.test", handle="only_handle_a"),
        _acct("600", "Lee Park", "1991-05-05", country="Canada",
              email="", handle="only_handle_b"),
    ]
    g, base = _group_pair(rows)
    assert base.reason == "country_conflict"
    with pytest.raises(ov.OverrideError, match="another safety block still holds"):
        rec.plan_auto_merges(rows, overrides=[_override(ov.APPROVE, g, base)])


# --- do_not_merge -----------------------------------------------------------

def test_do_not_merge_holds_a_clean_group_as_distinct():
    rows = _clean_merge_rows()
    g, base = _group_pair(rows)
    assert base.action == "merge"
    plan = rec.plan_auto_merges(rows, overrides=[_override(ov.DO_NOT_MERGE, g, base)])
    assert len(plan["merges"]) == 0
    assert len(plan["reviews"]) == 1
    assert plan["reviews"][0].reason == ov.DO_NOT_MERGE_REASON


def test_do_not_merge_restamps_a_held_group_reason():
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    plan = rec.plan_auto_merges(rows, overrides=[_override(ov.DO_NOT_MERGE, g, base)])
    assert len(plan["merges"]) == 0
    assert plan["reviews"][0].reason == ov.DO_NOT_MERGE_REASON


# --- fail-closed guards -----------------------------------------------------

def test_missing_account_set_fails_closed():
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    ghost = ov.Override(ov.APPROVE, frozenset({"100", "999"}),
                        ov.disposition(base.action, base.reason),
                        _fingerprint_for(g, base), "synthetic")
    with pytest.raises(ov.OverrideError, match="missing account or changed membership"):
        rec.plan_auto_merges(rows, overrides=[ghost])


def test_changed_membership_fails_closed():
    # A third account joins the live group, so the recorded 2-id set no longer
    # matches any live group.
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    recorded = _override(ov.APPROVE, g, base)
    rows.append(_acct("150", "Sam Rivera", "1990-04-01", country="SCG"))
    with pytest.raises(ov.OverrideError, match="missing account or changed membership"):
        rec.plan_auto_merges(rows, overrides=[recorded])


def test_duplicate_decision_for_same_account_set_fails_closed():
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    o = _override(ov.APPROVE, g, base)
    with pytest.raises(ov.OverrideError, match="duplicate override"):
        rec.plan_auto_merges(rows, overrides=[o, o])


def test_stale_fingerprint_fails_closed():
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    bad = _override(ov.APPROVE, g, base, fingerprint="a" * 64)
    with pytest.raises(ov.OverrideError, match="stale fingerprint"):
        rec.plan_auto_merges(rows, overrides=[bad])


def test_stale_disposition_fails_closed():
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    bad = _override(ov.APPROVE, g, base, expected="review:too_many_emails")
    with pytest.raises(ov.OverrideError, match="stale disposition"):
        rec.plan_auto_merges(rows, overrides=[bad])


def test_country_change_invalidates_fingerprint():
    # A fingerprint recorded against SCG/Serbia must not apply once a country
    # changes, even though the account ids and disposition are unchanged.
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    recorded = _override(ov.APPROVE, g, base)
    for r in rows:
        if r["legacy_member_id"] == "200":
            r["country"] = "Croatia"
    with pytest.raises(ov.OverrideError, match="stale fingerprint"):
        rec.plan_auto_merges(rows, overrides=[recorded])


# --- CSV loader guards ------------------------------------------------------

def _write_csv(path, header, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def test_load_missing_path_returns_empty(tmp_path):
    assert ov.load_overrides(None) == []
    assert ov.load_overrides(tmp_path / "absent.csv") == []


def test_load_rejects_bad_header(tmp_path):
    p = tmp_path / "bad_header.csv"
    _write_csv(p, ["decision", "account_ids", "fingerprint"], [])
    with pytest.raises(ov.OverrideError, match="header must contain"):
        ov.load_overrides(p)


def test_load_rejects_unknown_decision(tmp_path):
    p = tmp_path / "unknown.csv"
    _write_csv(p, list(ov.OVERRIDE_FIELDS),
               [["frobnicate", "100|200", "review:country_conflict", "a" * 64, "n"]])
    with pytest.raises(ov.OverrideError, match="unknown decision"):
        ov.load_overrides(p)


def test_load_rejects_malformed_fingerprint(tmp_path):
    p = tmp_path / "malformed_fp.csv"
    _write_csv(p, list(ov.OVERRIDE_FIELDS),
               [[ov.APPROVE, "100|200", "review:country_conflict", "not-hex", "n"]])
    with pytest.raises(ov.OverrideError, match="malformed fingerprint"):
        ov.load_overrides(p)


def test_load_rejects_single_account(tmp_path):
    p = tmp_path / "one_id.csv"
    _write_csv(p, list(ov.OVERRIDE_FIELDS),
               [[ov.APPROVE, "100", "review:country_conflict", "a" * 64, "n"]])
    with pytest.raises(ov.OverrideError, match="at least two accounts"):
        ov.load_overrides(p)


def test_load_reads_a_well_formed_row_round_trip(tmp_path):
    rows = _country_conflict_rows()
    g, base = _group_pair(rows)
    fp = _fingerprint_for(g, base)
    p = tmp_path / "ok.csv"
    _write_csv(p, list(ov.OVERRIDE_FIELDS),
               [[ov.APPROVE, "100|200", "review:country_conflict", fp, "synthetic"]])
    loaded = ov.load_overrides(p)
    assert len(loaded) == 1
    plan = rec.plan_auto_merges(rows, overrides=loaded)
    assert len(plan["merges"]) == 1


# --- fingerprint properties -------------------------------------------------

def test_fingerprint_is_deterministic_and_privacy_safe():
    a = ov.group_fingerprint(["100", "200"], "sam rivera|1990-04-01",
                             "review", "country_conflict", {"SCG", "Serbia"})
    b = ov.group_fingerprint(["200", "100"], "sam rivera|1990-04-01",
                             "review", "country_conflict", {"Serbia", "SCG"})
    assert a == b                                   # order-independent
    assert len(a) == 64 and all(c in "0123456789abcdef" for c in a)
    assert "rivera" not in a and "1990" not in a    # one-way; no PII leaks


def test_fingerprint_changes_with_any_fact():
    base = ov.group_fingerprint(["100", "200"], "sam rivera|1990-04-01",
                                "review", "country_conflict", {"SCG", "Serbia"})
    variants = [
        ov.group_fingerprint(["100", "300"], "sam rivera|1990-04-01",
                             "review", "country_conflict", {"SCG", "Serbia"}),
        ov.group_fingerprint(["100", "200"], "sam rivera|1990-04-02",
                             "review", "country_conflict", {"SCG", "Serbia"}),
        ov.group_fingerprint(["100", "200"], "sam rivera|1990-04-01",
                             "merge", "", {"SCG", "Serbia"}),
        ov.group_fingerprint(["100", "200"], "sam rivera|1990-04-01",
                             "review", "country_conflict", {"SCG", "Croatia"}),
    ]
    assert all(v != base for v in variants)


# --- entitlement-population guard -------------------------------------------

def test_entitlement_population_status_reports_unpopulated():
    rows = _clean_merge_rows()          # no entitlement columns set
    status = rec.entitlement_population_status(rows)
    assert set(status.keys()) == set(rec._POPULATION_REQUIRED)
    assert not any(status.values())


def test_entitlement_population_status_reports_populated():
    rows = _clean_merge_rows()
    rows[0]["legacy_tier1_annual_active_at_cutover"] = "1"
    rows[1]["legacy_was_board_at_cutover"] = "1"
    status = rec.entitlement_population_status(rows)
    assert all(status.values())


# --- merge_accounts override (explicit human merge of ungrouped accounts) ----

def _merge_override(rows, ids, *, fingerprint=None, expected=None):
    kept, _ = rec.reconcilable_rows(rows)
    by_id = {(r.get("legacy_member_id") or "").strip(): r for r in kept}
    present = frozenset(ids) & set(by_id)
    fp = (fingerprint if fingerprint is not None
          else rec._account_set_fingerprint_for(by_id, frozenset(present)))
    return ov.Override(ov.MERGE_ACCOUNTS, frozenset(ids),
                       expected if expected is not None else ov.MERGE_ACCOUNTS_EXPECTED,
                       fp, "synthetic")


def _ungrouped_pair():
    # same name, but account 200 has no DOB -> Stage A never groups them
    return [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "")]


def test_merge_accounts_merges_an_ungrouped_pair():
    rows = _ungrouped_pair()
    assert len(rec.plan_auto_merges(rows)["merges"]) == 0        # not a Stage A group
    plan = rec.plan_auto_merges(rows, overrides=[_merge_override(rows, {"100", "200"})])
    assert len(plan["merges"]) == 1
    d = plan["merges"][0]
    assert d.survivor_id == "100" and d.loser_ids == ["200"]


def test_merge_accounts_preserves_raw_dobs_and_invents_none():
    rows = _ungrouped_pair()
    plan = rec.plan_auto_merges(rows, overrides=[_merge_override(rows, {"100", "200"})])
    surv = plan["merges"][0].survivor_row
    assert surv["birth_date"] == "1990-04-01"       # survivor keeps its own DOB
    # the loser's raw row is untouched; no DOB was copied into it
    assert rows[1]["birth_date"] == ""


def test_merge_accounts_unions_loser_only_email():
    rows = [_acct("100", "Sam Rivera", "1990-04-01", email=""),
            _acct("200", "Sam Rivera", "", email="loser@example.test")]
    plan = rec.plan_auto_merges(rows, overrides=[_merge_override(rows, {"100", "200"})])
    surv = plan["merges"][0].survivor_row
    emails = {surv.get("legacy_email"), surv.get("legacy_email2"), surv.get("legacy_email3")}
    assert "loser@example.test" in emails


def test_merge_accounts_missing_account_fails_closed():
    rows = _ungrouped_pair()
    o = ov.Override(ov.MERGE_ACCOUNTS, frozenset({"100", "999"}),
                    ov.MERGE_ACCOUNTS_EXPECTED, "a" * 64, "synthetic")
    with pytest.raises(ov.OverrideError, match="missing or"):
        rec.plan_auto_merges(rows, overrides=[o])


def test_merge_accounts_stale_fingerprint_fails_closed():
    rows = _ungrouped_pair()
    with pytest.raises(ov.OverrideError, match="stale fingerprint"):
        rec.plan_auto_merges(rows, overrides=[_merge_override(rows, {"100", "200"},
                                                              fingerprint="b" * 64)])


def test_merge_accounts_already_grouped_fails_closed():
    # both share a full DOB -> a real Stage A group; merge_accounts must refuse it
    rows = [_acct("100", "Sam Rivera", "1990-04-01"),
            _acct("200", "Sam Rivera", "1990-04-01")]
    with pytest.raises(ov.OverrideError, match="already in a Stage A"):
        rec.plan_auto_merges(rows, overrides=[_merge_override(rows, {"100", "200"})])


def test_merge_accounts_stale_disposition_fails_closed():
    rows = _ungrouped_pair()
    with pytest.raises(ov.OverrideError, match="stale disposition"):
        rec.plan_auto_merges(rows, overrides=[_merge_override(rows, {"100", "200"},
                                                              expected="review:country_conflict")])


def test_merge_accounts_dob_change_invalidates_fingerprint():
    rows = _ungrouped_pair()
    o = _merge_override(rows, {"100", "200"})       # recorded against 200-with-no-DOB
    # A DOB filled in with a value that does NOT match 100 keeps them ungrouped,
    # so only the fingerprint (which binds the raw DOB) catches the change.
    rows[1]["birth_date"] = "1985-01-01"
    with pytest.raises(ov.OverrideError, match="stale fingerprint"):
        rec.plan_auto_merges(rows, overrides=[o])


def test_merge_accounts_deterministic():
    rows = _ungrouped_pair()
    o = _merge_override(rows, {"100", "200"})
    p1 = rec.plan_auto_merges(rows, overrides=[o])
    p2 = rec.plan_auto_merges(rows, overrides=[o])
    assert p1["merges"][0].survivor_id == p2["merges"][0].survivor_id
    assert p1["merges"][0].loser_ids == p2["merges"][0].loser_ids


def test_merge_accounts_csv_round_trip(tmp_path):
    rows = _ungrouped_pair()
    kept, _ = rec.reconcilable_rows(rows)
    by_id = {(r.get("legacy_member_id") or "").strip(): r for r in kept}
    fp = rec._account_set_fingerprint_for(by_id, frozenset({"100", "200"}))
    p = tmp_path / "m.csv"
    _write_csv(p, list(ov.OVERRIDE_FIELDS),
               [[ov.MERGE_ACCOUNTS, "100|200", ov.MERGE_ACCOUNTS_EXPECTED, fp, "synthetic"]])
    loaded = ov.load_overrides(p)
    assert len(loaded) == 1 and loaded[0].decision == ov.MERGE_ACCOUNTS
    plan = rec.plan_auto_merges(rows, overrides=loaded)
    assert len(plan["merges"]) == 1
