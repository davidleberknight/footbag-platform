"""Contract tests for the shared-email collision resolver
(legacy_data/member_data_scripts/shared_email_resolution.py).

The resolver is the single authority the member loader and the reconciler both
call to decide which account in a shared-email collision group keeps the shared
address. Every valid account imports in either disposition; the address is kept
by at most one account, and only when every group member carries a valid
record-modification timestamp and exactly one is strictly latest. Missing,
invalid, or tied timestamps fail the group closed to adjudication with no account
keeping the address. No account id or ordering is ever used to break a tie.

Run from repo root:
    python -m pytest legacy_data/tests/test_shared_email_resolution.py -v
"""
import itertools
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "legacy_data" / "member_data_scripts"))
import shared_email_resolution as ser  # noqa: E402


def acct(member_id: str, email: str, modified: str, **extra: str) -> dict:
    r = {
        "legacy_member_id": member_id,
        "legacy_email": email,
        "legacy_email2": "",
        "legacy_email3": "",
        "legacy_member_modified": modified,
    }
    r.update(extra)
    return r


def test_two_accounts_distinct_timestamps_unique_latest_keeps_email() -> None:
    (res,) = ser.resolve_shared_email(
        [acct("10", "fam@x.com", "100"), acct("11", "fam@x.com", "200")])
    assert res.disposition == ser.UNIQUE_LATEST
    assert res.reason == ser.REASON_UNIQUE_LATEST
    assert res.winner_id == "11"
    assert res.email_retaining_ids == ("11",)
    assert res.email_cleared_ids == ("10",)
    assert set(res.account_ids) == {"10", "11"}  # both import


def test_pair_tied_at_latest_needs_adjudication_no_email_kept() -> None:
    (res,) = ser.resolve_shared_email(
        [acct("20", "fam@x.com", "500"), acct("21", "fam@x.com", "500")])
    assert res.disposition == ser.NEEDS_ADJUDICATION
    assert res.reason == ser.REASON_TIED
    assert res.winner_id is None
    assert res.email_retaining_ids == ()
    assert set(res.email_cleared_ids) == {"20", "21"}  # both import, neither keeps it


def test_all_timestamps_absent_adjudication() -> None:
    (res,) = ser.resolve_shared_email(
        [acct("30", "fam@x.com", ""), acct("31", "fam@x.com", "")])
    assert res.disposition == ser.NEEDS_ADJUDICATION
    assert res.reason == ser.REASON_MISSING
    assert res.email_retaining_ids == ()
    assert set(res.email_cleared_ids) == {"30", "31"}


def test_one_valid_one_missing_yields_no_automatic_winner() -> None:
    (res,) = ser.resolve_shared_email(
        [acct("40", "fam@x.com", "900"), acct("41", "fam@x.com", "")])
    assert res.disposition == ser.NEEDS_ADJUDICATION
    assert res.reason == ser.REASON_MISSING
    assert res.winner_id is None
    assert set(res.email_cleared_ids) == {"40", "41"}


def test_unparseable_timestamp_fails_closed_to_adjudication() -> None:
    (res,) = ser.resolve_shared_email(
        [acct("50", "fam@x.com", "not-a-number"), acct("51", "fam@x.com", "300")])
    assert res.disposition == ser.NEEDS_ADJUDICATION
    assert res.reason == ser.REASON_INVALID
    assert res.email_retaining_ids == ()


def test_nonpositive_timestamp_is_invalid_not_a_winner() -> None:
    (res,) = ser.resolve_shared_email(
        [acct("52", "fam@x.com", "0"), acct("53", "fam@x.com", "300")])
    assert res.disposition == ser.NEEDS_ADJUDICATION
    assert res.reason == ser.REASON_INVALID


def test_triple_group_with_one_unique_latest() -> None:
    (res,) = ser.resolve_shared_email([
        acct("60", "fam@x.com", "100"),
        acct("61", "fam@x.com", "300"),
        acct("62", "fam@x.com", "200"),
    ])
    assert res.disposition == ser.UNIQUE_LATEST
    assert res.winner_id == "61"
    assert set(res.email_cleared_ids) == {"60", "62"}
    assert len(res.account_ids) == 3


def test_quad_group_with_one_unique_latest() -> None:
    (res,) = ser.resolve_shared_email(
        [acct(str(70 + i), "fam@x.com", str(100 + i)) for i in range(4)])
    assert res.disposition == ser.UNIQUE_LATEST
    assert res.winner_id == "73"  # highest epoch 103
    assert len(res.account_ids) == 4
    assert set(res.email_cleared_ids) == {"70", "71", "72"}


def test_result_is_independent_of_input_order() -> None:
    accounts = [
        acct("80", "fam@x.com", "100"),
        acct("81", "fam@x.com", "200"),
        acct("82", "fam@x.com", "300"),
    ]
    outcomes = set()
    for perm in itertools.permutations(accounts):
        (res,) = ser.resolve_shared_email(list(perm))
        outcomes.add((res.disposition, res.winner_id, res.email_cleared_ids,
                      res.account_ids))
    assert len(outcomes) == 1
    disposition, winner, _, _ = outcomes.pop()
    assert disposition == ser.UNIQUE_LATEST and winner == "82"


def test_transitive_sharing_forms_one_connected_component() -> None:
    # 90 shares e1 with 91; 91 shares e2 with 92 -> one triple. 93 is alone.
    a = acct("90", "e1@x.com", "100")
    b = {"legacy_member_id": "91", "legacy_email": "e1@x.com",
         "legacy_email2": "e2@x.com", "legacy_email3": "", "legacy_member_modified": "200"}
    c = acct("92", "e2@x.com", "300")
    solo = acct("93", "solo@x.com", "400")
    groups = ser.find_shared_email_groups([a, b, c, solo])
    assert len(groups) == 1
    assert [r["legacy_member_id"] for r in groups[0]] == ["90", "91", "92"]


def test_single_owner_address_forms_no_group() -> None:
    assert ser.find_shared_email_groups([acct("94", "only@x.com", "100")]) == []


def test_summarize_counts_across_dispositions() -> None:
    res = ser.resolve_shared_email([
        acct("a1", "s@x.com", "100"), acct("a2", "s@x.com", "200"),   # unique winner
        acct("b1", "t@x.com", "5"), acct("b2", "t@x.com", "5"),       # tied
    ])
    s = ser.summarize(res)
    assert s["groups"] == 2
    assert s["unique_winner_groups"] == 1
    assert s["needs_adjudication_groups"] == 1
    assert s["tied_groups"] == 1
    assert s["accounts_in_collisions"] == 4
    assert s["accounts_retaining_email"] == 1
    assert s["accounts_email_cleared"] == 3


def test_report_row_carries_the_full_group_decision() -> None:
    rows = ser.report_rows(ser.resolve_shared_email(
        [acct("c1", "s@x.com", "100"), acct("c2", "s@x.com", "200")]))
    assert len(rows) == 1
    row = rows[0]
    assert set(ser.REPORT_FIELDS) == set(row.keys())
    assert row["winner_id"] == "c2"
    assert row["disposition"] == ser.UNIQUE_LATEST
    assert "c1" in row["email_cleared_ids"]
    assert "s@x.com" in row["shared_emails"]
