"""
test_reconcile_legacy_members.py
================================

Contract tests for Stage A of the legacy-member identity reconciliation
(legacy_data/member_data_scripts/reconcile_legacy_members.py):

  * accounts sharing a normalized name + full date of birth group as one
    same-person candidate, and the canonical normalizer folds accents so
    spelling variants of one name land together
  * a shared email or user id holds the ENTIRE collision group out of the
    reconcilable universe (mirroring the member loader), listed with partners
    in the excluded-accounts CSV for adjudication
  * Stage B proposes a link only for a single same-named account with a full
    DOB or an email; several same-named accounts always route to review,
    whichever of them carries a DOB or email
  * only member_valid=1 rows are analyzed
  * a partial / absent date of birth is not a name+DOB signal (full only)
  * every account stays its own review row: Stage A recommends, it never merges,
    and it writes only the git-ignored review CSV, never a database

Run from repo root:
    python -m pytest legacy_data/tests/test_reconcile_legacy_members.py -v
"""
import csv
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "legacy_data" / "member_data_scripts"))
import reconcile_legacy_members as rec  # noqa: E402


def row(member_id: str, **overrides: str) -> dict[str, str]:
    r = {
        "member_valid": "1",
        "legacy_member_id": member_id,
        "legacy_user_id": f"user_{member_id}",
        "real_name": f"Person {member_id}",
        "birth_date": "",
        "legacy_email": f"{member_id}@example.com",
        "city": "",
        "region": "",
        "country": "",
    }
    r.update(overrides)
    return r


def groups_by_signal(groups: list[rec.DuplicateGroup], signal: str) -> list[rec.DuplicateGroup]:
    return [g for g in groups if g.signal == signal]


def ids(group: rec.DuplicateGroup) -> list[str]:
    return [a["legacy_member_id"] for a in group.accounts]


def test_name_plus_full_dob_groups_as_one_same_person_candidate() -> None:
    # Accent + separator variants of one name plus one full DOB: the canonical
    # normalizer collapses the spelling, and the different emails do not stop the
    # match.
    groups = rec.build_stage_a_groups([
        row("10", real_name="Bélanger, Jean", birth_date="1990-05-01", legacy_email="a@x.com"),
        row("11", real_name="Belanger Jean", birth_date="1990-05-01", legacy_email="b@x.com"),
    ])
    nd = groups_by_signal(groups, "name_dob")
    assert len(nd) == 1
    assert ids(nd[0]) == ["10", "11"]
    assert nd[0].same_person_recommended is True
    assert nd[0].exclusion_reason == ""


# ---------------------------------------------------------------------------
# Account-universe alignment: reconciliation excludes the same email / user-id
# collision accounts the member loader drops, so it never proposes an account
# the load will not import.
# ---------------------------------------------------------------------------

def test_shared_email_accounts_are_held_out_of_the_reconcilable_universe() -> None:
    # Two accounts sharing an email are ambiguous identities the loader drops as
    # an email conflict; reconciliation holds BOTH out (not just the one the
    # loader drops after the first), and a non-sharing account stays reconcilable.
    rows = [
        row("20", real_name="Anna Smith", legacy_email="fam@x.com"),
        row("21", real_name="Bob Smith", legacy_email="fam@x.com"),
        row("22", real_name="Cy Solo", legacy_email="solo@x.com"),
    ]
    kept, excluded = rec.reconcilable_rows(rows)
    assert {r["legacy_member_id"] for r in kept} == {"22"}
    assert set(excluded) == {"20", "21"}
    assert excluded["20"]["reason"] == "email_collision"
    assert excluded["20"]["partners"] == ["21"]


def test_user_id_collision_accounts_are_held_out() -> None:
    rows = [
        row("30", real_name="Dee One", legacy_email="d1@x.com", legacy_user_id="dupe"),
        row("31", real_name="Ed Two", legacy_email="d2@x.com", legacy_user_id="dupe"),
    ]
    kept, excluded = rec.reconcilable_rows(rows)
    assert kept == []
    assert set(excluded) == {"30", "31"}
    assert "user_id_collision" in excluded["30"]["reason"]


def test_reconciliation_does_not_propose_a_link_to_a_held_out_account() -> None:
    # A held-out (shared-email) account matches a person by name + full DOB, but
    # because it is excluded it is never proposed -- so the link write can never
    # reference an account the loader will not import.
    accounts = [
        row("40", real_name="Held Out", birth_date="1990-01-01", legacy_email="shared@x.com"),
        row("41", real_name="Other Name", birth_date="1991-02-02", legacy_email="shared@x.com"),
        row("42", real_name="Clean Match", birth_date="1980-03-03", legacy_email="clean@x.com"),
    ]
    hps = [
        hp("hp_held", "Held Out"),      # would match account 40 by name -- but 40 is held out
        hp("hp_clean", "Clean Match"),  # matches account 42 (reconcilable)
    ]
    proposed, review = rec.build_stage_b(accounts, hps)
    proposed_ids = {r["legacy_member_id"] for r in proposed}
    assert "40" not in proposed_ids
    assert "41" not in proposed_ids
    assert proposed_ids == {"42"}       # only the non-conflicting account is proposed


def test_non_conflicting_accounts_still_propose_normally() -> None:
    accounts = [
        row("50", real_name="Uno One", birth_date="1970-01-01", legacy_email="u1@x.com"),
        row("51", real_name="Dos Two", birth_date="", legacy_email="u2@x.com"),
    ]
    hps = [hp("hp_uno", "Uno One"), hp("hp_dos", "Dos Two")]
    proposed, _ = rec.build_stage_b(accounts, hps)
    signals_by_hp = {r["historical_person_id"]: r["match_signal"] for r in proposed}
    assert signals_by_hp == {"hp_uno": "name_dob", "hp_dos": "name_email"}


def test_partial_or_absent_dob_is_not_a_name_dob_signal() -> None:
    # Same name, but neither carries a full date of birth, so name+DOB must not
    # fire (year-only / partial DOB never reaches birth_date from the extractor).
    groups = rec.build_stage_a_groups([
        row("40", real_name="Dana Lee", birth_date="", legacy_email="d1@x.com"),
        row("41", real_name="Dana Lee", birth_date="", legacy_email="d2@x.com"),
    ])
    assert groups_by_signal(groups, "name_dob") == []
    # Distinct emails, so no email group either -- nothing recommends a merge.
    assert groups == []


def test_only_member_valid_rows_are_analyzed() -> None:
    # An invalid row that duplicates the valid pair must not join the group or
    # form one of its own. Distinct emails so the pair is not held out as a
    # collision.
    groups = rec.build_stage_a_groups([
        row("50", real_name="Erin Fox", birth_date="1988-03-03", legacy_email="e1@x.com"),
        row("51", real_name="Erin Fox", birth_date="1988-03-03", legacy_email="e2@x.com"),
        row("52", real_name="Erin Fox", birth_date="1988-03-03", legacy_email="e3@x.com", member_valid="0"),
    ])
    nd = groups_by_signal(groups, "name_dob")
    assert len(nd) == 1
    assert ids(nd[0]) == ["50", "51"]  # 52 excluded (member_valid=0)


def test_no_duplicates_yields_no_groups() -> None:
    groups = rec.build_stage_a_groups([
        row("60", real_name="Uno One", birth_date="1970-01-01", legacy_email="u1@x.com"),
        row("61", real_name="Dos Two", birth_date="1971-02-02", legacy_email="u2@x.com"),
    ])
    assert groups == []


def test_stage_a_writes_review_and_held_out_csvs_and_never_merges(tmp_path: Path) -> None:
    # A same-person name+DOB pair plus a shared-mailbox pair: the duplicate pair
    # lands in the review CSV (each its own row, no merge); the shared-email pair
    # is held out to the excluded CSV. No database is touched.
    in_csv = tmp_path / "in.csv"
    fields = ["member_valid", "legacy_member_id", "legacy_user_id", "real_name",
              "birth_date", "legacy_email", "city", "region", "country"]
    with in_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in [
            row("70", real_name="Gwen Ash", birth_date="1992-07-07", legacy_email="g1@x.com"),
            row("71", real_name="Gwen Ash", birth_date="1992-07-07", legacy_email="g2@x.com"),
            row("80", real_name="Hank Ives", legacy_email="fam@x.com"),
            row("81", real_name="Iris Ives", legacy_email="fam@x.com"),
        ]:
            w.writerow({k: r[k] for k in fields})

    out_csv = tmp_path / "out" / "review.csv"
    excluded_csv = tmp_path / "out" / "excluded.csv"
    summary = rec.stage_a_duplicate_accounts(in_csv, out_csv, excluded_csv)

    assert summary["valid"] == 4
    assert summary["reconcilable"] == 2        # 70, 71
    assert summary["collision_excluded"] == 2  # 80, 81 share fam@x.com
    assert summary["name_dob_groups"] == 1
    assert summary["review_rows"] == 2

    with out_csv.open(encoding="utf-8", newline="") as f:
        review = list(csv.DictReader(f))
    assert list(review[0].keys()) == rec.REVIEW_FIELDS
    assert {r["legacy_member_id"] for r in review} == {"70", "71"}
    assert all(r["signal"] == "name_dob" for r in review)
    assert all(r["same_person_recommended"] == "yes" for r in review)

    with excluded_csv.open(encoding="utf-8", newline="") as f:
        held = list(csv.DictReader(f))
    assert list(held[0].keys()) == rec.EXCLUDED_ACCOUNT_FIELDS
    assert {r["legacy_member_id"] for r in held} == {"80", "81"}
    assert all(r["reason"] == "email_collision" for r in held)


# ---------------------------------------------------------------------------
# QC gate -- the pre-apply check over the Stage A + Stage B artifacts
# ---------------------------------------------------------------------------

def prop(hp: str, lid: str, signal: str = "name_dob") -> dict[str, str]:
    return {"historical_person_id": hp, "legacy_member_id": lid, "match_signal": signal}


def brev(hp: str, lid: str, reason: str = "multiple_full_dob_candidates",
         group: str = "B0001") -> dict[str, str]:
    return {"review_group": group, "reason": reason,
            "historical_person_id": hp, "legacy_member_id": lid}


def arev(group: str = "A0001", signal: str = "name_dob") -> dict[str, str]:
    return {"group_id": group, "signal": signal}


def test_qc_passes_with_clean_proposals_and_review_inventory() -> None:
    result = rec.evaluate_qc(
        stage_a_rows=[arev("A0001"), arev("A0001")],
        proposed=[prop("hp1", "1", "verified_id"), prop("hp2", "2", "name_email")],
        stage_b_review=[brev("hpX", "9")],
    )
    assert result["passed"] is True
    assert result["fatal"] == []


def test_qc_fails_on_duplicate_historical_person_proposed_links() -> None:
    result = rec.evaluate_qc(
        stage_a_rows=[],
        proposed=[prop("hp1", "1"), prop("hp1", "2")],
        stage_b_review=[],
    )
    assert result["passed"] is False
    assert any("same historical person" in f for f in result["fatal"])


def test_qc_fails_on_duplicate_legacy_member_proposed_links() -> None:
    result = rec.evaluate_qc(
        stage_a_rows=[],
        proposed=[prop("hp1", "5"), prop("hp2", "5")],
        stage_b_review=[],
    )
    assert result["passed"] is False
    assert any("legacy_member_id" in f for f in result["fatal"])


def test_qc_fails_when_a_review_candidate_appears_in_proposed_links() -> None:
    # The (person, account) Stage B set aside for review is also proposed: the
    # proposal would auto-apply an ambiguous link.
    result = rec.evaluate_qc(
        stage_a_rows=[],
        proposed=[prop("hp1", "8")],
        stage_b_review=[brev("hp1", "8")],
    )
    assert result["passed"] is False
    assert any("set aside for review" in f for f in result["fatal"])


def test_qc_reports_stage_a_and_stage_b_review_counts() -> None:
    result = rec.evaluate_qc(
        stage_a_rows=[arev("A0001"), arev("A0001"), arev("A0002")],
        proposed=[prop("hp1", "1", "verified_id")],
        stage_b_review=[
            brev("hpX", "9", reason="multiple_full_dob_candidates", group="B0001"),
            brev("hpX", "10", reason="multiple_full_dob_candidates", group="B0001"),
            brev("hpY", "11", reason="name_only_no_dob_or_email", group="B0002"),
        ],
    )
    assert result["passed"] is True
    assert result["stage_a_review_groups"] == 2
    assert result["stage_a_review_rows"] == 3
    assert result["proposed_links"] == 1
    assert result["proposed_by_signal"] == {"verified_id": 1}
    assert result["stage_b_review_groups"] == 2
    assert result["stage_b_review_rows"] == 3
    assert result["stage_b_review_by_reason"] == {
        "multiple_full_dob_candidates": 2, "name_only_no_dob_or_email": 1,
    }


def _dump(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def test_qc_gate_is_read_only(tmp_path: Path) -> None:
    a_review = tmp_path / "a_review.csv"
    proposed = tmp_path / "proposed.csv"
    b_review = tmp_path / "b_review.csv"
    _dump(a_review, rec.REVIEW_FIELDS, [])
    _dump(proposed, rec.PROPOSED_LINK_FIELDS, [
        {"historical_person_id": "hp1", "person_name": "P", "legacy_member_id": "1",
         "real_name": "P", "normalized_name": "p", "match_signal": "verified_id",
         "account_birth_date": "", "account_email": ""},
    ])
    _dump(b_review, rec.LINK_REVIEW_FIELDS, [])

    before = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    result = rec.qc_gate(a_review, proposed, b_review)
    after = {p.name: p.read_bytes() for p in tmp_path.iterdir()}

    assert result["passed"] is True
    # The gate wrote nothing: no new files, and the inputs are byte-identical.
    assert before == after


# ---------------------------------------------------------------------------
# Stage B -- dump account -> historical_persons linking
# ---------------------------------------------------------------------------

def hp(person_id: str, person_name: str, legacy_member_id: str = "") -> dict[str, str]:
    return {"person_id": person_id, "person_name": person_name, "legacy_member_id": legacy_member_id}


def signals(proposed: list[dict[str, str]]) -> dict[str, str]:
    """Map historical_person_id -> match_signal for the proposed links."""
    return {r["historical_person_id"]: r["match_signal"] for r in proposed}


def proposed_hp_ids(proposed: list[dict[str, str]]) -> set[str]:
    return {r["historical_person_id"] for r in proposed}


def test_verified_id_crosswalk_wins_over_name_signals() -> None:
    # Account 5 would name-match the unlinked shadow person, but its id is already
    # verified against another person; the verified link wins and consumes the
    # account, so the shadow person gets no proposal.
    accounts = [row("5", real_name="John Smith", birth_date="1990-01-01", legacy_email="js@x.com")]
    hps = [
        hp("hp_verified", "John Smith", legacy_member_id="5"),
        hp("hp_shadow", "John Smith"),
    ]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert signals(proposed) == {"hp_verified": "verified_id"}
    assert "hp_shadow" not in proposed_hp_ids(proposed)
    assert review == []


def test_unique_name_plus_full_dob_links() -> None:
    accounts = [row("6", real_name="Anne Roy", birth_date="1985-02-02", legacy_email="ar@x.com")]
    hps = [hp("hp_roy", "Anne Roy")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert len(proposed) == 1
    assert proposed[0]["historical_person_id"] == "hp_roy"
    assert proposed[0]["legacy_member_id"] == "6"
    assert proposed[0]["match_signal"] == "name_dob"
    assert review == []


def test_unique_name_plus_email_links_when_no_dob() -> None:
    accounts = [row("7", real_name="Bob Lee", birth_date="", legacy_email="bl@x.com")]
    hps = [hp("hp_lee", "Bob Lee")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert len(proposed) == 1
    assert proposed[0]["match_signal"] == "name_email"
    assert proposed[0]["legacy_member_id"] == "7"
    assert review == []


def test_ambiguous_name_dob_candidates_go_to_review_not_proposed() -> None:
    # One person, two same-name accounts each with a full DOB: cannot pick.
    accounts = [
        row("8", real_name="Cara Fox", birth_date="1970-03-03", legacy_email="c1@x.com"),
        row("9", real_name="Cara Fox", birth_date="1971-04-04", legacy_email="c2@x.com"),
    ]
    hps = [hp("hp_fox", "Cara Fox")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert {r["legacy_member_id"] for r in review} == {"8", "9"}
    assert all(r["reason"] == "multiple_accounts_same_name" for r in review)
    assert all(r["historical_person_id"] == "hp_fox" for r in review)


def test_ambiguous_name_email_candidates_go_to_review_not_proposed() -> None:
    # One person, two same-name accounts, neither with a DOB but both with an
    # email: the email cannot disambiguate either.
    accounts = [
        row("10", real_name="Dan Ives", birth_date="", legacy_email="d1@x.com"),
        row("11", real_name="Dan Ives", birth_date="", legacy_email="d2@x.com"),
    ]
    hps = [hp("hp_ives", "Dan Ives")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert {r["legacy_member_id"] for r in review} == {"10", "11"}
    assert all(r["reason"] == "multiple_accounts_same_name" for r in review)


def test_single_dob_among_several_same_named_accounts_goes_to_review() -> None:
    # Two accounts share the matched name and exactly one carries a full DOB.
    # DOB-presence is a completeness signal, not identity evidence (the person
    # record holds no DOB to corroborate against), so nothing auto-selects: the
    # whole group routes to a human.
    accounts = [
        row("14", real_name="Gil Ors", birth_date="1966-07-07", legacy_email="g1@x.com"),
        row("15", real_name="Gil Ors", birth_date="", legacy_email="g2@x.com"),
    ]
    hps = [hp("hp_ors", "Gil Ors")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert {r["legacy_member_id"] for r in review} == {"14", "15"}
    assert all(r["reason"] == "multiple_accounts_same_name" for r in review)


def test_single_email_among_several_same_named_accounts_goes_to_review() -> None:
    # Same principle when the sole distinguishing attribute is an email.
    accounts = [
        row("16", real_name="Hal Ude", birth_date="", legacy_email="h1@x.com"),
        row("17", real_name="Hal Ude", birth_date="", legacy_email=""),
    ]
    hps = [hp("hp_ude", "Hal Ude")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert {r["legacy_member_id"] for r in review} == {"16", "17"}
    assert all(r["reason"] == "multiple_accounts_same_name" for r in review)


def test_multiple_persons_same_name_go_to_review() -> None:
    accounts = [row("12", real_name="Sam Poe", birth_date="1980-05-05", legacy_email="sp@x.com")]
    hps = [hp("hp_poe_a", "Sam Poe"), hp("hp_poe_b", "Sam Poe")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert {r["historical_person_id"] for r in review} == {"hp_poe_a", "hp_poe_b"}
    assert all(r["reason"] == "multiple_persons_same_name" for r in review)


def test_no_new_historical_persons_are_created() -> None:
    # An account whose name matches no person yields no proposal and no review;
    # nothing invents a person for it.
    accounts = [row("20", real_name="Nomatch Person", birth_date="1999-09-09", legacy_email="n@x.com")]
    hps = [hp("hp_other", "Someone Else")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert review == []
    # Every id that appears anywhere is an input person id -- none are minted.
    input_ids = {h["person_id"] for h in hps}
    assert proposed_hp_ids(proposed) <= input_ids
    assert {r["historical_person_id"] for r in review} <= input_ids


def test_only_member_valid_rows_link() -> None:
    accounts = [
        row("30", real_name="Val Id", birth_date="1990-06-06", legacy_email="v@x.com", member_valid="0"),
    ]
    hps = [hp("hp_val", "Val Id")]
    proposed, review = rec.build_stage_b(accounts, hps)
    assert proposed == []
    assert review == []


def test_stage_b_ordering_is_deterministic_regardless_of_input_order() -> None:
    accounts = [
        row("6", real_name="Anne Roy", birth_date="1985-02-02", legacy_email="ar@x.com"),
        row("5", real_name="John Smith", birth_date="1990-01-01", legacy_email="js@x.com"),
        row("8", real_name="Cara Fox", birth_date="1970-03-03", legacy_email="c1@x.com"),
        row("9", real_name="Cara Fox", birth_date="1971-04-04", legacy_email="c2@x.com"),
    ]
    hps = [
        hp("hp_roy", "Anne Roy"),
        hp("hp_verified", "John Smith", legacy_member_id="5"),
        hp("hp_fox", "Cara Fox"),
    ]
    p1, r1 = rec.build_stage_b(accounts, hps)
    p2, r2 = rec.build_stage_b(list(reversed(accounts)), list(reversed(hps)))
    assert p1 == p2
    assert r1 == r2
    # Proposed links are sorted by (historical_person_id, legacy_member_id).
    keys = [(r["historical_person_id"], r["legacy_member_id"]) for r in p1]
    assert keys == sorted(keys)


def test_stage_a_and_stage_b_are_independent() -> None:
    # Stage A grouping still functions with Stage B present in the module.
    a_groups = rec.build_stage_a_groups([
        row("40", real_name="Eve Ash", birth_date="1991-01-01", legacy_email="e1@x.com"),
        row("41", real_name="Eve Ash", birth_date="1991-01-01", legacy_email="e2@x.com"),
    ])
    assert [g.signal for g in a_groups] == ["name_dob"]
    assert a_groups[0].same_person_recommended is True


def test_stage_b_writes_both_csvs_read_only_on_the_database(tmp_path: Path) -> None:
    schema = (REPO_ROOT / "database" / "schema.sql").read_text()
    db = tmp_path / "t.db"
    import sqlite3
    conn = sqlite3.connect(db)
    conn.executescript(schema)
    conn.execute(
        "INSERT INTO legacy_members (legacy_member_id, display_name, display_name_normalized, import_source, imported_at)"
        " VALUES ('5','x','x','mirror','2026-01-01T00:00:00Z')"
    )
    for pid, name, lid in [("hp_v", "John Smith", "5"), ("hp_roy", "Anne Roy", None), ("hp_fox", "Cara Fox", None)]:
        conn.execute("INSERT INTO historical_persons (person_id, person_name, legacy_member_id) VALUES (?,?,?)",
                     (pid, name, lid))
    conn.commit()
    before = conn.total_changes
    conn.close()

    in_csv = tmp_path / "in.csv"
    fields = ["member_valid", "legacy_member_id", "real_name", "birth_date", "legacy_email"]
    with in_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in [
            row("5", real_name="John Smith", birth_date="1990-01-01", legacy_email="js@x.com"),
            row("6", real_name="Anne Roy", birth_date="1985-02-02", legacy_email="ar@x.com"),
            row("8", real_name="Cara Fox", birth_date="1970-03-03", legacy_email="c1@x.com"),
            row("9", real_name="Cara Fox", birth_date="1971-04-04", legacy_email="c2@x.com"),
        ]:
            w.writerow({k: r[k] for k in fields})

    proposed_out = tmp_path / "out" / "proposed.csv"
    review_out = tmp_path / "out" / "review.csv"
    summary = rec.stage_b_link_historical_persons(in_csv, db, proposed_out, review_out)

    assert summary["hp_total"] == 3
    assert summary["verified_id_links"] == 1
    assert summary["name_dob_links"] == 1
    assert summary["proposed_total"] == 2
    assert summary["review_rows"] == 2  # the two Cara Fox candidates

    with proposed_out.open(encoding="utf-8", newline="") as f:
        proposed = list(csv.DictReader(f))
    assert list(proposed[0].keys()) == rec.PROPOSED_LINK_FIELDS
    with review_out.open(encoding="utf-8", newline="") as f:
        review = list(csv.DictReader(f))
    assert list(review[0].keys()) == rec.LINK_REVIEW_FIELDS

    # The database was only read: no rows changed by the stage.
    conn2 = sqlite3.connect(db)
    assert conn2.total_changes == 0
    hp_count = conn2.execute("SELECT COUNT(*) FROM historical_persons").fetchone()[0]
    conn2.close()
    assert hp_count == 3  # no persons created


# ---------------------------------------------------------------------------
# Stage A auto-merge (final-load path): decision engine
# ---------------------------------------------------------------------------

def _one_group(rows: list[dict[str, str]]) -> rec.DuplicateGroup:
    groups = rec.build_stage_a_groups(rows)
    assert len(groups) == 1, f"expected one name+DOB group, got {len(groups)}"
    return groups[0]


def _dupe(member_id: str, **overrides: str) -> dict[str, str]:
    """A member_valid=1 row that shares a name + full DOB with its group."""
    r = row(member_id, real_name="Sam Kim", birth_date="1990-05-05")
    r.update(overrides)
    return r


def test_auto_merge_clean_group_collapses_to_lowest_id_survivor() -> None:
    rows = [_dupe("200", legacy_email="a@x.com"), _dupe("100", legacy_email="b@x.com")]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.action == "merge" and d.reason == ""
    assert d.survivor_id == "100"
    assert d.loser_ids == ["200"]
    assert d.survivor_row["legacy_member_id"] == "100"


def test_auto_merge_survivor_selection_is_order_independent() -> None:
    a = [_dupe("100"), _dupe("55"), _dupe("300")]
    b = list(reversed(a))
    assert rec.evaluate_merge_group(_one_group(a)).survivor_id == "55"
    assert rec.evaluate_merge_group(_one_group(b)).survivor_id == "55"


def test_auto_merge_unions_all_unique_emails_survivor_first() -> None:
    rows = [_dupe("100", legacy_email="s@x.com"), _dupe("200", legacy_email="l@x.com")]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.survivor_row["legacy_email"] == "s@x.com"
    assert d.survivor_row["legacy_email2"] == "l@x.com"
    assert d.survivor_row["legacy_email3"] == ""


def test_auto_merge_preserves_entitlements_by_or() -> None:
    rows = [
        _dupe("100", is_bap="0", legacy_ever_paid_tier2="0",
              legacy_tier1_annual_active_at_cutover="0", ifpa_join_date="2010-06-01"),
        _dupe("200", is_bap="1", legacy_ever_paid_tier2="1",
              legacy_tier1_annual_active_at_cutover="1", ifpa_join_date="2008-01-01"),
    ]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.action == "merge"
    assert d.survivor_row["is_bap"] == "1"
    assert d.survivor_row["legacy_ever_paid_tier2"] == "1"
    assert d.survivor_row["legacy_tier1_annual_active_at_cutover"] == "1"
    assert d.survivor_row["ifpa_join_date"] == "2008-01-01"   # earliest join date


def test_auto_merge_country_conflict_routes_to_review() -> None:
    rows = [_dupe("100", country="United States"), _dupe("200", country="Australia")]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.action == "review" and d.reason == "country_conflict"
    assert d.survivor_row is None and d.loser_ids == []


def test_auto_merge_differing_email_join_year_region_still_merges() -> None:
    rows = [
        _dupe("100", legacy_email="s@x.com", ifpa_join_date="2010-01-01",
              region="Colorado", country="United States"),
        _dupe("200", legacy_email="l@x.com", ifpa_join_date="2012-01-01",
              region="Oregon", country="United States"),
    ]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.action == "merge"   # differing email / join year / region do not block


def test_auto_merge_unpreservable_handle_routes_to_review() -> None:
    # Loser has a distinct handle and no email: its only claim key would be lost.
    rows = [_dupe("100", legacy_email="s@x.com", legacy_user_id="survivor"),
            _dupe("200", legacy_email="", legacy_user_id="ghost")]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.action == "review" and d.reason == "unpreservable_handle"


def test_auto_merge_more_than_three_emails_routes_to_review() -> None:
    rows = [_dupe(str(100 + i), legacy_email=f"e{i}@x.com") for i in range(4)]
    d = rec.evaluate_merge_group(_one_group(rows))
    assert d.action == "review" and d.reason == "too_many_emails"


def test_auto_merge_claim_state_routes_to_review() -> None:
    rows = [_dupe("100"), _dupe("200")]
    d = rec.evaluate_merge_group(_one_group(rows), claimed_ids={"200"})
    assert d.action == "review" and d.reason == "claim_state"


def test_auto_merge_links_to_different_persons_route_to_review() -> None:
    rows = [_dupe("100"), _dupe("200")]
    links = {"100": "person-A", "200": "person-B"}
    d = rec.evaluate_merge_group(_one_group(rows), links_by_account=links)
    assert d.action == "review" and d.reason == "different_person_links"


def test_auto_merge_map_artifact_is_deterministic(tmp_path) -> None:
    rows = [
        _dupe("100", legacy_email="a@x.com"), _dupe("200", legacy_email="b@x.com"),
        row("300", real_name="Ana Diaz", birth_date="1988-02-02", legacy_email="c@x.com"),
        row("400", real_name="Ana Diaz", birth_date="1988-02-02", legacy_email="d@x.com"),
    ]
    plan = rec.plan_auto_merges(rows)
    assert len(plan["merges"]) == 2 and plan["loser_count"] == 2
    out = tmp_path / "merge_map.csv"
    n1 = rec.write_merge_map_csv(plan["merges"], out)
    first = out.read_text(encoding="utf-8")
    n2 = rec.write_merge_map_csv(plan["merges"], out)
    assert n1 == n2 == 2
    assert out.read_text(encoding="utf-8") == first   # byte-identical on rerun
    body = [r for r in csv.DictReader(first.splitlines())]
    assert [r["group_id"] for r in body] == sorted(r["group_id"] for r in body)
    assert {r["loser_legacy_member_id"] for r in body} == {"200", "400"}
