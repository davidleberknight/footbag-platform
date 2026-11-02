"""
test_propose_person_dispositions.py
===================================

Contract tests for propose_person_dispositions.py, on synthetic data only:

  * a roster person whose only matching account adds a middle name or initial, held
    by another person row, is drafted as that row's duplicate, never as "no account";
  * an ambiguous case (two agreeing accounts, or the person holding it themselves)
    is not drafted as a duplicate;
  * --rulings writes a maintainer's decisions with exactly the fingerprint the load
    expects, and refuses a person not awaiting a disposition or a reason that does
    not belong to its decision.

Run from repo root:
    python -m pytest legacy_data/tests/test_propose_person_dispositions.py -v
"""
import csv
import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MDS = REPO_ROOT / "legacy_data" / "member_data_scripts"
if str(MDS) not in sys.path:
    sys.path.insert(0, str(MDS))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, MDS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


rlm = _load("reconcile_legacy_members")
plh = _load("person_link_hold")
ppd = _load("propose_person_dispositions")
NICKNAMES = rlm.name_match.load_nicknames()


def _acct(mid, name, valid="1"):
    return {"member_valid": valid, "legacy_member_id": mid, "legacy_user_id": f"u{mid}",
            "real_name": name, "birth_date": "", "legacy_email": f"{mid}@example.invalid",
            "legacy_member_modified": "", "city": "", "region": "", "country": ""}


CLUB_HOLDER = {"person_id": "club_sam", "person_name": "Sam T. Rivera",
               "legacy_member_id": "700"}


def test_a_middle_name_account_held_by_another_row_is_drafted_as_its_duplicate():
    # Drafted as "no account", this person would be recorded as holding nothing
    # while the club row holding the same human's account stood beside it.
    holder = ppd.middle_name_holder("Sam Rivera", "roster_sam",
                                    [_acct("700", "Sam T. Rivera")],
                                    {"700": CLUB_HOLDER}, NICKNAMES)
    assert holder is CLUB_HOLDER


def test_an_account_with_a_different_middle_initial_is_not_a_middle_name_duplicate():
    # The account must add a middle part to this name, not swap one: "Sam T." and
    # "Sam Q." are conflicting evidence, and drafting them as one human would merge
    # two people on a surname.
    holder = {"person_id": "club_samq", "person_name": "Sam Q. Rivera",
              "legacy_member_id": "702"}
    assert ppd.middle_name_holder("Sam T. Rivera", "roster_samt",
                                  [_acct("702", "Sam Q. Rivera")],
                                  {"702": holder}, NICKNAMES) is None


def test_two_agreeing_accounts_are_not_drafted_as_a_duplicate():
    # Picking one of two would be identity resolution that auto-selects.
    accounts = [_acct("700", "Sam T. Rivera"), _acct("701", "Sam Q. Rivera")]
    assert ppd.middle_name_holder("Sam Rivera", "roster_sam", accounts,
                                  {"700": CLUB_HOLDER}, NICKNAMES) is None


def test_an_invalid_twin_does_not_make_the_case_ambiguous():
    # Invalid accounts never import, so they are not candidates.
    accounts = [_acct("700", "Sam T. Rivera"), _acct("701", "Sam Q. Rivera", "0")]
    assert ppd.middle_name_holder("Sam Rivera", "roster_sam", accounts,
                                  {"700": CLUB_HOLDER}, NICKNAMES) is CLUB_HOLDER


def test_an_unheld_account_or_one_the_person_holds_is_not_a_duplicate():
    # With no other holder there is no other row to be a duplicate of.
    accounts = [_acct("700", "Sam T. Rivera")]
    assert ppd.middle_name_holder("Sam Rivera", "roster_sam", accounts, {},
                                  NICKNAMES) is None
    me = {"person_id": "roster_sam", "person_name": "Sam Rivera", "legacy_member_id": "700"}
    assert ppd.middle_name_holder("Sam Rivera", "roster_sam", accounts,
                                  {"700": me}, NICKNAMES) is None


def _descriptor(pid):
    def fingerprint_for(target=""):
        return plh.person_boundary_fingerprint(pid, "x", (), target, "b" * 64)
    return {"candidate_person_id": pid, "normalized_name": "x",
            "account_ids_bearing_name": set(), "fingerprint_for": fingerprint_for}


def _rulings(tmp_path, rows):
    path = tmp_path / "rulings.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(ppd.RULING_FIELDS)
        w.writerows(rows)
    return path


def test_rulings_are_written_with_the_fingerprint_the_load_expects(tmp_path):
    # A hand-computed hash is how a ruling ends up stale on its first load.
    d1, d2 = _descriptor("P1"), _descriptor("P2")
    rows = ppd.rows_from_rulings(_rulings(tmp_path, [
        ["P1", plh.DUPLICATE_PERSON, "P9", plh.DUPLICATE_SPELLING_VARIANT, "same human"],
        ["P2", plh.ACCOUNT_HOLDER, "700", plh.HOLDS_NAME_VARIANT_ACCOUNT, "holds it"],
    ]), [d1, d2])
    dup, holder = rows
    assert dup["fingerprint"] == d1["fingerprint_for"]("P9")
    assert dup[plh.DUPLICATE_TARGET_FIELD] == "P9" and dup["survivor_account_ids"] == ""
    assert holder["fingerprint"] == d2["fingerprint_for"]("account:700")
    assert holder["survivor_account_ids"] == "700" and holder[plh.DUPLICATE_TARGET_FIELD] == ""
    audit = plh.apply_person_dispositions(
        [d1, d2],
        [plh.PersonLinkHold(r["decision"],
                            frozenset({r["survivor_account_ids"]}) if r["survivor_account_ids"]
                            else frozenset(), r["candidate_person_id"], r["reason"],
                            r["fingerprint"], r["note"], r[plh.DUPLICATE_TARGET_FIELD])
         for r in rows],
        known_person_ids={"P1", "P2", "P9"}, known_account_ids={"700"})
    assert len(audit) == 2


def test_a_ruling_for_a_person_not_awaiting_one_or_with_a_foreign_reason_refuses(tmp_path):
    # Either would record a decision the load could never match, or one that reads
    # as adjudicated under the wrong decision.
    with pytest.raises(SystemExit, match="not awaiting"):
        ppd.rows_from_rulings(_rulings(tmp_path, [
            ["P7", plh.DUPLICATE_PERSON, "P9", plh.DUPLICATE_SPELLING_VARIANT, "n"]]),
            [_descriptor("P1")])
    with pytest.raises(SystemExit, match="does not belong"):
        ppd.rows_from_rulings(_rulings(tmp_path, [
            ["P1", plh.ACCOUNT_HOLDER, "700", plh.DUPLICATE_SPELLING_VARIANT, "n"]]),
            [_descriptor("P1")])


# --- duplicate-account (Stage A) rulings -------------------------------------

def _account(mid, name, dob, country):
    return {**_acct(mid, name), "birth_date": dob, "country": country}


# The same name and full birth date under two different raw country spellings:
# a group the build sends to review, which a maintainer may approve as one human.
CONFLICT = [_account("100", "Sam Rivera", "1990-04-01", "SCG"),
            _account("200", "Sam Rivera", "1990-04-01", "Serbia ")]
CLEAN = [_account("300", "Dana Cole", "1988-02-02", "USA"),
         _account("400", "Dana Cole", "1988-02-02", "USA")]


def _stage_a_rulings(tmp_path, rows, name="stage_a_rulings.csv"):
    path = tmp_path / name
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(ppd.STAGE_A_RULING_FIELDS)
        w.writerows(rows)
    return path


def _adjudication_file(tmp_path, rows):
    path = tmp_path / "stage_a_adjudication.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ppd.sao.OVERRIDE_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return path


def test_a_duplicate_account_ruling_carries_the_fingerprint_the_build_applies(tmp_path):
    # A fingerprint taken from the review file's normalised countries rather than
    # the raw account values is refused by the build, so the two accounts the
    # maintainer approved as one human would stay apart at the load.
    rows = ppd.stage_a_rows_from_rulings(
        _stage_a_rulings(tmp_path, [[ppd.sao.APPROVE, "200|100", "one human"]]),
        CONFLICT, {}, [], [])
    assert [r["account_ids"] for r in rows] == ["100|200"]
    recorded = ppd.sao.load_overrides(_adjudication_file(tmp_path, rows))
    plan = rlm.plan_auto_merges(CONFLICT, overrides=recorded)
    assert plan["rulings_applied"] == 1
    assert [sorted([m.survivor_id, *m.loser_ids]) for m in plan["merges"]] == [["100", "200"]]


def test_a_ruling_naming_no_live_group_is_refused(tmp_path):
    # Written anyway, it would stop the load on a ruling nobody can apply.
    with pytest.raises(SystemExit, match="no duplicate-account group"):
        ppd.stage_a_rows_from_rulings(
            _stage_a_rulings(tmp_path, [[ppd.sao.APPROVE, "100|999", "n"]]),
            CONFLICT, {}, [], [])


def test_a_ruling_that_changes_nothing_or_repeats_a_recorded_one_is_refused(tmp_path):
    # Approving a group the build already merges, or ruling twice on one group,
    # is refused by the build; the tool must refuse it before it is recorded.
    with pytest.raises(SystemExit, match="would not apply"):
        ppd.stage_a_rows_from_rulings(
            _stage_a_rulings(tmp_path, [[ppd.sao.APPROVE, "300|400", "n"]]),
            CLEAN, {}, [], [])
    first = ppd.stage_a_rows_from_rulings(
        _stage_a_rulings(tmp_path, [[ppd.sao.APPROVE, "100|200", "n"]]),
        CONFLICT, {}, [], [])
    recorded = ppd.sao.load_overrides(_adjudication_file(tmp_path, first))
    with pytest.raises(SystemExit, match="would not apply"):
        ppd.stage_a_rows_from_rulings(
            _stage_a_rulings(tmp_path, [[ppd.sao.APPROVE, "100|200", "n"]], "again.csv"),
            CONFLICT, {}, recorded, [])


def test_a_ruling_with_an_unknown_decision_is_refused(tmp_path):
    with pytest.raises(SystemExit, match="is not"):
        ppd.stage_a_rows_from_rulings(
            _stage_a_rulings(tmp_path, [[ppd.sao.MERGE_ACCOUNTS, "100|200", "n"]]),
            CONFLICT, {}, [], [])
