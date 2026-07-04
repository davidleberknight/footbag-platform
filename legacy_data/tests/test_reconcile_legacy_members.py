"""
test_reconcile_legacy_members.py
================================

Contract tests for Stage A of the legacy-member identity reconciliation
(legacy_data/member_data_scripts/reconcile_legacy_members.py):

  * accounts sharing a normalized name + full date of birth group as one
    same-person candidate, and the canonical normalizer folds accents so
    spelling variants of one name land together
  * a shared primary email under one name is a same-person candidate; under
    different names it is a shared / family mailbox, surfaced but never
    recommended as one person
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
    # The distinct emails must not have formed a shared-email group.
    assert groups_by_signal(groups, "shared_email") == []


def test_shared_email_under_different_names_is_excluded() -> None:
    groups = rec.build_stage_a_groups([
        row("20", real_name="Anna Smith", legacy_email="fam@x.com"),
        row("21", real_name="Bob Smith", legacy_email="fam@x.com"),
    ])
    se = groups_by_signal(groups, "shared_email")
    assert len(se) == 1
    assert ids(se[0]) == ["20", "21"]
    assert se[0].same_person_recommended is False
    assert se[0].exclusion_reason == "different_name_shared_email"


def test_shared_email_under_one_name_is_a_same_person_candidate() -> None:
    # No date of birth on either account: the shared email + single name is how a
    # no-DOB duplicate is caught.
    groups = rec.build_stage_a_groups([
        row("30", real_name="Carl Jones", birth_date="", legacy_email="cj@x.com"),
        row("31", real_name="Carl Jones", birth_date="", legacy_email="CJ@x.com"),
    ])
    se = groups_by_signal(groups, "shared_email")
    assert len(se) == 1
    assert ids(se[0]) == ["30", "31"]
    assert se[0].same_person_recommended is True
    assert se[0].exclusion_reason == ""
    # No full DOB, so no name+DOB group.
    assert groups_by_signal(groups, "name_dob") == []


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
    # form one of its own.
    groups = rec.build_stage_a_groups([
        row("50", real_name="Erin Fox", birth_date="1988-03-03", legacy_email="e@x.com"),
        row("51", real_name="Erin Fox", birth_date="1988-03-03", legacy_email="e@x.com"),
        row("52", real_name="Erin Fox", birth_date="1988-03-03", legacy_email="e@x.com", member_valid="0"),
    ])
    nd = groups_by_signal(groups, "name_dob")
    assert len(nd) == 1
    assert ids(nd[0]) == ["50", "51"]  # 52 excluded
    se = groups_by_signal(groups, "shared_email")
    assert ids(se[0]) == ["50", "51"]  # 52 excluded


def test_no_duplicates_yields_no_groups() -> None:
    groups = rec.build_stage_a_groups([
        row("60", real_name="Uno One", birth_date="1970-01-01", legacy_email="u1@x.com"),
        row("61", real_name="Dos Two", birth_date="1971-02-02", legacy_email="u2@x.com"),
    ])
    assert groups == []


def test_stage_a_writes_review_only_and_never_merges(tmp_path: Path) -> None:
    # Two same-person accounts plus a shared-mailbox pair: Stage A must emit each
    # account as its own review row (no merge), and take no database.
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
    summary = rec.stage_a_duplicate_accounts(in_csv, out_csv)

    assert summary["valid"] == 4
    assert summary["name_dob_groups"] == 1
    assert summary["shared_email_groups"] == 1
    assert summary["shared_email_same_person"] == 0
    assert summary["shared_email_excluded_different_name"] == 1
    # Two review rows per group (no accounts collapsed).
    assert summary["review_rows"] == 4

    with out_csv.open(encoding="utf-8", newline="") as f:
        review = list(csv.DictReader(f))
    assert [c for c in review[0].keys()] == rec.REVIEW_FIELDS

    # Every input account survives as its own row with its own id -- recommended,
    # not merged.
    assert {r["legacy_member_id"] for r in review} == {"70", "71", "80", "81"}
    name_dob = [r for r in review if r["signal"] == "name_dob"]
    assert {r["legacy_member_id"] for r in name_dob} == {"70", "71"}
    assert all(r["same_person_recommended"] == "yes" for r in name_dob)
    shared = [r for r in review if r["signal"] == "shared_email"]
    assert all(r["same_person_recommended"] == "no" for r in shared)
    assert all(r["exclusion_reason"] == "different_name_shared_email" for r in shared)


def test_stage_b_and_qc_gate_remain_unimplemented() -> None:
    # Slice boundary: only Stage A is built; the later stages still refuse.
    with pytest.raises(NotImplementedError):
        rec.stage_b_link_historical_persons()
    with pytest.raises(NotImplementedError):
        rec.qc_gate()
