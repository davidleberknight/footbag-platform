"""
test_refit_rulings.py
=====================

Contract tests for refit_rulings.py, on synthetic data. A Stage B ruling's
fingerprint covers its own facts and the delivery's whole account boundary, so a
delivery that only adds unrelated accounts stales every ruling. The tool must:

  * restamp a ruling whose own facts still hold, with exactly the fingerprint the
    load then accepts;
  * never restamp a ruling whose facts changed, or whose proposal, person or review
    group is gone, and leave its row in the file;
  * change nothing but the fingerprint when it restamps.

Run from repo root:
    python -m pytest legacy_data/tests/test_refit_rulings.py -v
"""
import csv
import importlib.util
import sqlite3
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
rr = _load("review_resolution")
refit = _load("refit_rulings")


def _acct(mid, name, dob="", email=None):
    return {"member_valid": "1", "legacy_member_id": mid, "legacy_user_id": f"user_{mid}",
            "real_name": name, "birth_date": dob,
            "legacy_email": email or f"{mid}@example.com", "legacy_member_modified": "",
            "city": "", "region": "", "country": ""}


# Anne Roy (6) is proposed for hp_roy and a hold withholds that link; the two Cara
# Fox accounts (8, 9) form a review group a resolution rules on; Gus Ghost is a
# membership-only person with no account, ruled to hold none.
DELIVERY = [_acct("6", "Anne Roy", "1985-02-02"),
            _acct("8", "Cara Fox", "1970-03-03"), _acct("9", "Cara Fox", "1971-04-04")]
PERSONS = [
    {"person_id": "hp_roy", "person_name": "Anne Roy", "legacy_member_id": "",
     "source": "", "source_scope": ""},
    {"person_id": "hp_fox", "person_name": "Cara Fox", "legacy_member_id": "",
     "source": "", "source_scope": ""},
    {"person_id": "hp_ghost", "person_name": "Gus Ghost", "legacy_member_id": "",
     "source": "MEMBERSHIP", "source_scope": "PROVISIONAL"},
]
UNRELATED = _acct("10", "Zed Quill", "1999-09-09")


def _rulings_fitted_to(accounts):
    """The three rulings, fingerprinted the way the load computes them for
    `accounts`, as a human would have recorded them for that delivery."""
    proposed, review = rlm.build_stage_b(accounts, PERSONS)
    link = next(d for d in rlm._build_link_hold_descriptors(proposed, accounts, PERSONS, {})
                if d["candidate_person_id"] == "hp_roy")
    hold = plh.PersonLinkHold(plh.HOLD_LINK, link["survivor_account_ids"], "hp_roy",
                              plh.UNRESOLVED_PENDING_EXTERNAL_CORROBORATION,
                              link["fingerprint"], "synthetic")
    kept = [p for p in proposed if p["historical_person_id"] != "hp_roy"]
    ghost = next(d for d in rlm._build_person_disposition_descriptors(
        kept, review, accounts, PERSONS,
        cohort_person_ids=rlm.membership_provisional_person_ids(PERSONS))
        if d["candidate_person_id"] == "hp_ghost")
    no_account = plh.PersonLinkHold(plh.NO_ACCOUNT, frozenset(), "hp_ghost",
                                    plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
                                    ghost["fingerprint_for"](""), "synthetic")
    group = next(d for d in rlm._build_review_resolution_descriptors(review, kept, accounts, None)
                 if d["account_ids"] == frozenset({"8", "9"}))
    resolution = rr.ReviewResolution(rr.AFFIRM_DISTINCT_PEOPLE, group["account_ids"],
                                     "synthetic", "synthetic evidence",
                                     group["fingerprint"], "synthetic")
    return [hold, no_account], [resolution]


def _statuses(items):
    return {it.ruling.split(" ")[0]: it.status for it in items}


def test_rulings_on_the_delivery_they_were_fitted_to_are_current():
    # A tool that reported these stale would send a person to re-rule settled facts.
    holds, resolutions = _rulings_fitted_to(DELIVERY)
    items, _ = refit.fit_stage_b(DELIVERY, PERSONS, None, holds, resolutions,
                                 rlm._boundary_fingerprint(DELIVERY))
    assert set(_statuses(items).values()) == {refit.CURRENT}
    assert len(items) == 3


def test_an_unrelated_new_account_restamps_every_ruling_with_the_fingerprint_the_load_accepts(
        tmp_path):
    # The case that stopped the real load: 108 unrelated accounts staled every
    # ruling. Restamped rulings must then pass the load's own Stage B unchanged.
    holds, resolutions = _rulings_fitted_to(DELIVERY)
    today = DELIVERY + [UNRELATED]
    items, _ = refit.fit_stage_b(today, PERSONS, None, holds, resolutions,
                                 rlm._boundary_fingerprint(DELIVERY))
    assert _statuses(items) == {"hold_link": refit.RESTAMP, "no_account": refit.RESTAMP,
                                rr.AFFIRM_DISTINCT_PEOPLE: refit.RESTAMP}

    fitted = {it.stored: it.fitted for it in items}
    db, members = _built(tmp_path, today)
    refitted_holds = [plh.PersonLinkHold(h.decision, h.survivor_account_ids,
                                         h.candidate_person_id, h.reason,
                                         fitted[h.fingerprint], h.note) for h in holds]
    refitted_res = [rr.ReviewResolution(r.outcome, r.account_ids, r.reason, r.evidence_basis,
                                        fitted[r.fingerprint], r.note) for r in resolutions]
    summary = rlm.stage_b_link_historical_persons(
        members, db, tmp_path / "p.csv", tmp_path / "r.csv",
        person_link_holds=refitted_holds, review_resolutions=refitted_res)
    assert summary["person_links_held"] == 1 and summary["review_groups_resolved"] == 1
    assert summary["person_dispositions"] == 1
    with pytest.raises(plh.PersonLinkHoldError, match="stale"):
        rlm.stage_b_link_historical_persons(
            members, db, tmp_path / "p.csv", tmp_path / "r.csv",
            person_link_holds=holds, review_resolutions=resolutions)


def test_a_ruling_whose_own_facts_changed_is_left_for_a_person():
    # Restamping it would carry a ruling past the evidence it was made on: here the
    # held account's email changed, which is part of the link's match facts.
    holds, resolutions = _rulings_fitted_to(DELIVERY)
    today = [_acct("6", "Anne Roy", "1985-02-02", email="new@example.com")] + DELIVERY[1:]
    items, _ = refit.fit_stage_b(today, PERSONS, None, holds, resolutions,
                                 rlm._boundary_fingerprint(DELIVERY))
    assert _statuses(items)["hold_link"] == refit.CHANGED


def test_a_vanished_review_group_and_a_person_who_gained_an_account_need_a_person():
    # A ruling about a group that no longer exists, or a no-account ruling once an
    # account bearing the name arrives, must reach a person, not be restamped.
    holds, resolutions = _rulings_fitted_to(DELIVERY)
    today = [DELIVERY[0], DELIVERY[1], _acct("11", "Gus Ghost", "1960-01-01")]
    items, _ = refit.fit_stage_b(today, PERSONS, None, holds, resolutions,
                                 rlm._boundary_fingerprint(DELIVERY))
    statuses = _statuses(items)
    assert statuses[rr.AFFIRM_DISTINCT_PEOPLE] == refit.GONE
    assert statuses["no_account"] in refit.NEEDS_PERSON
    assert statuses["hold_link"] == refit.RESTAMP


def test_without_a_fitted_boundary_a_stale_ruling_is_never_restamped():
    # With no record of the delivery a ruling was fitted to, a digest cannot show
    # that only the boundary moved, so the tool must not guess.
    holds, resolutions = _rulings_fitted_to(DELIVERY)
    items, _ = refit.fit_stage_b(DELIVERY + [UNRELATED], PERSONS, None, holds, resolutions,
                                 None)
    assert refit.RESTAMP not in set(_statuses(items).values())


def test_restamping_changes_only_the_fingerprint_and_keeps_every_row(tmp_path):
    # Hand-kept ruling files carry notes, CRLF line ends and rows the tool must not
    # touch; a rewrite through a CSV writer would reflow them.
    old_a, old_b, new_a = "a" * 64, "b" * 64, "c" * 64
    path = tmp_path / "review_resolutions.csv"
    original = (f"outcome,account_ids,reason,evidence_basis,fingerprint,note\r\n"
                f"affirm_distinct_people,1|2,r,\"e, quoted\",{old_a},keep me\r\n"
                f"affirm_distinct_people,3|4,r,e,{old_b},gone group\r\n").encode()
    path.write_bytes(original)
    refit.restamp(path, [refit.Item("review_resolutions.csv", "x", refit.RESTAMP, old_a, new_a)])
    assert path.read_bytes() == original.replace(old_a.encode(), new_a.encode())


def test_restamping_refuses_a_fingerprint_that_is_not_unique(tmp_path):
    # Two rows sharing one value would both be rewritten for one ruling's restamp.
    path = tmp_path / "person_link_holds.csv"
    path.write_bytes(f"x,{'a' * 64}\ny,{'a' * 64}\n".encode())
    before = path.read_bytes()
    with pytest.raises(SystemExit, match="not unique"):
        refit.restamp(path, [refit.Item("person_link_holds.csv", "x", refit.RESTAMP,
                                        "a" * 64, "c" * 64)])
    assert path.read_bytes() == before


def test_the_load_refuses_a_holder_ruling_that_names_an_account_which_never_imports(tmp_path):
    # An invalid account never reaches legacy_members, so a ruling naming it would
    # record the person as holding an account nobody can claim.
    invalid = dict(_acct("12", "Gus Ghost", "1960-01-01"), member_valid="0")
    accounts = DELIVERY + [invalid]
    proposed, review = rlm.build_stage_b(accounts, PERSONS)
    ghost = next(d for d in rlm._build_person_disposition_descriptors(
        proposed, review, accounts, PERSONS,
        cohort_person_ids=rlm.membership_provisional_person_ids(PERSONS))
        if d["candidate_person_id"] == "hp_ghost")
    holder = plh.PersonLinkHold(plh.ACCOUNT_HOLDER, frozenset({"12"}), "hp_ghost",
                                plh.HOLDS_NAME_VARIANT_ACCOUNT,
                                ghost["fingerprint_for"]("account:12"), "synthetic")
    db, members = _built(tmp_path, accounts)
    with pytest.raises(plh.PersonLinkHoldError, match="not a valid account"):
        rlm.stage_b_link_historical_persons(
            members, db, tmp_path / "p.csv", tmp_path / "r.csv", person_link_holds=[holder])


def _built(tmp_path, accounts):
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    conn.executescript((REPO_ROOT / "database" / "schema.sql").read_text())
    for p in PERSONS:
        conn.execute("INSERT INTO historical_persons (person_id, person_name, source, "
                     "source_scope) VALUES (?,?,?,?)",
                     (p["person_id"], p["person_name"], p["source"] or None,
                      p["source_scope"] or None))
    conn.commit()
    conn.close()
    members = tmp_path / "members.csv"
    with members.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(accounts[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(accounts)
    return db, members
