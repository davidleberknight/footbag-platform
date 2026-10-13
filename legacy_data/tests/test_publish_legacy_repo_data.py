"""
test_publish_legacy_repo_data.py
================================

Pins the legacy publish step: from the vetted export CSVs alone it writes the
finished member CSV, the crawl seed lists, the approved event ids and the
crawler's exclusion list, and it refuses with nothing written when an input is
missing or unsafe, when the cutover date is not given, or when a member's tier
standing is not covered by a derived flag.

Each test builds a throwaway private checkout holding a small synthetic export
and points the script at it and at a throwaway mirror directory. Nothing here
reads the real export, the real private repository, the curated name-encoding
record or the network.

Run from repo root:
    python -m pytest legacy_data/tests/test_publish_legacy_repo_data.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import io
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "publish_legacy_repo_data.py"
spec = importlib.util.spec_from_file_location("publish_legacy_repo_data", str(SCRIPT))
pub = importlib.util.module_from_spec(spec)
sys.modules["publish_legacy_repo_data"] = pub
spec.loader.exec_module(pub)

CRAWLER = REPO_ROOT / "legacy_data" / "legacy_mirror" / "create_mirror_footbag_org.py"
crawler_spec = importlib.util.spec_from_file_location("mirror_script_publishcheck", str(CRAWLER))
crawler = importlib.util.module_from_spec(crawler_spec)
sys.modules["mirror_script_publishcheck"] = crawler
crawler_spec.loader.exec_module(crawler)

BASE = pub.BASE_URL
CUTOVER = "2020-01-01"
CUTOVER_EPOCH = 1577836800
MEMBER_COLUMNS = ["MemberID", "MemberValid", "MemberFirstName", "MemberFirstNameUnicode",
                  "MemberLastName", "MemberLastNameUnicode", "MemberAlias",
                  "MemberIFPAExpiration", "MemberIFPAExpiration2"]


def _csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


def _member(mid, valid="1", exp1="0", exp2="0"):
    return [mid, valid, "Ann", "Ann", "Lee", "Lee", f"a{mid}", exp1, exp2]


ISSUE_COLUMNS = (["IssueID", "IssueElectionID", "IssueQuestion"]
                 + [f"IssueAnswer{i}" for i in range(1, 11)]
                 + [f"IssueTally{i}" for i in range(1, 11)])
# A ballot's member id, distinctive enough that finding it in any output means
# a ballot-level row escaped.
BALLOT_MEMBER = "88231"


def _issue(issue_id, election, question, answers):
    """One ifpa_issues row; `answers` maps an answer index to (text, stored tally)."""
    return ([issue_id, election, question]
            + [answers.get(i, ("", ""))[0] for i in range(1, 11)]
            + [answers.get(i, ("", "0"))[1] for i in range(1, 11)])


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """A private checkout with a complete small export, and an empty mirror."""
    private, mirror = tmp_path / "private", tmp_path / "mirror"
    ex = private / "legacy-export"
    _csv(ex / "members/members.csv", MEMBER_COLUMNS, [
        _member("11985"), _member("20", exp1="-1"),
        _member("30", exp1=str(CUTOVER_EPOCH + 86400)),   # annual, still valid at cutover
        _member("40", exp1=str(CUTOVER_EPOCH - 86400)),   # annual, lapsed before cutover
        _member("50", valid="0")])
    _csv(ex / "members-admin/admins.csv", ["AdminID", "AdminValid"],
         [["20", "1"], ["30", "0"], ["", "1"]])
    _csv(ex / "groups/ifpa_committee_members.csv", ["CommitteeID", "CommitteeMemberID"],
         [["1", "11985"], ["1", "20"], ["7", "30"]])
    _csv(ex / "groups/ifpa_committees.csv",
         ["CommitteeID", "CommitteePublic", "CommitteeKeyword", "CommitteeName"],
         [["1", "1", "board", "Board"], ["5", "0", "secret", "Secret Group"],
          ["9", "0", "", "Nameless"], ["12", "1", "open", "Open Group"]])
    _csv(ex / "groups/ifpa_group_files.csv",
         ["FileID", "FileVisible", "FileGroupID", "FileLocation", "FileScope"],
         [["10", "1", "12", "/ifpa/groups/open/scoped.pdf", "2"],  # scoped in a public group
          ["3", "1", "5", "/ifpa/groups/secret/a.txt", "0"],       # any file of a private committee
          ["4", "0", "12", "/ifpa/groups/open/public.pdf", "0"],   # public: not excluded
          ["6", "1", "44", "/ifpa/groups/gone/b.txt", "0"]])       # its committee is not in the export
    _csv(ex / "clubs/clubs.csv", ["Approved", "ClubID"],
         [["1", "9"], ["0", "10"], ["1", "abc"], ["1", "9"]])
    _csv(ex / "gallery/sets.csv", ["RealSetID", "SetVisible"],
         [["-12", "0"], ["3", "0"], ["7", "1"]])
    _csv(ex / "rules/rulebook3.csv", ["SectionBase"], [["10"], ["2"], ["10"]])
    _csv(ex / "moves2/moves.csv", ["MoveID"], [["100"], ["20"]])
    _csv(ex / "faq/faq.csv", ["FaqQuestionID"], [["941"], ["12"]])
    _csv(ex / "faq/faqsections.csv", ["FaqSectionID"], [["500"]])
    _csv(ex / "events/calendar.csv", ["Approved", "Deleted", "EventID"],
         [["1", "0", "857"], ["0", "0", "420"], ["1", "1", "999"], ["2", "0", "77"]])
    _csv(ex / "ifpa/ifpa_issues.csv", ISSUE_COLUMNS, [
        _issue("2", "E1", "Q2", {1: ("Yes", "2"), 2: ("No", "1")}),
        _issue("3", "E1", "Q3", {1: ("Maybe", "1")}),
        _issue("10", "E2", "Q10", {1: ("A", "1"), 2: ("B", "0"), 3: ("C", "4")})])
    _csv(ex / "ifpa/ifpa_issue_votes.csv", ["VoteIssueID", "VoteMemberID", "VoteIndex"],
         [["2", BALLOT_MEMBER, "1"], ["2", "77001", "1"], ["2", "77002", "2"],
          ["3", "77003", "1"],
          ["10", "77004", "1"], ["10", "77005", "1"], ["10", "77006", "1"],
          ["10", "77007", "2"], ["10", "77008", "0"], ["10", "77009", "0"]])
    _csv(private / "private_data/vote_result_options.csv",
         ["vote_id", "position", "option", "count"],
         [["E1", "Q2", "Yes", "2"], ["E1", "Q3", "Maybe", "4"]])
    (ex / "REFRESH_MANIFEST.tsv").write_text(
        "original_head\tx\nlive_head\tx\n"
        "source\tsha256\tbytes\tdialect\tdump_completed\n"
        "members/backups/latest.sql\th\t1\tmariadb\t2026-05-29 15:46:52\n", encoding="utf-8")
    monkeypatch.setattr(pub, "load_member_name_encodings", lambda: {})
    monkeypatch.setattr(pub, "PRIVATE", private)
    monkeypatch.setattr(pub, "MIRROR", mirror)
    return private, mirror


def _members(private_files, private):
    text = private_files[private / "legacy-publish" / "legacy_members.csv"]
    return {r["legacy_member_id"]: r for r in csv.DictReader(io.StringIO(text))}


def _all_files(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes()
            for p in sorted(root.rglob("*")) if p.is_file()}


def test_seed_lists_keep_each_class_form_filter_and_order(tree):
    # A wrong form or filter silently seeds the crawl with dead or missing pages.
    private, mirror = tree
    _, public = pub.build(private, mirror, CUTOVER)
    seeds = {p.name: text.splitlines()
             for p, text in public.items() if p.parent.name == "mirror_seeds"}
    assert seeds["clubs.txt"] == [f"{BASE}/clubs/show/10", f"{BASE}/clubs/show/9",
                                  f"{BASE}/clubs/show/abc"]   # whole URL sorted as text
    assert seeds["gallery.txt"] == [f"{BASE}/gallery/showset/3", f"{BASE}/gallery/showset/12"]
    assert seeds["rules.txt"] == [f"{BASE}/rules/chapter/2", f"{BASE}/rules/chapter/10"]
    assert seeds["moves.txt"] == [f"{BASE}/newmoves/show/20", f"{BASE}/newmoves/show/100"]
    assert seeds["faq.txt"] == [f"{BASE}/faq/show/12", f"{BASE}/faq/show/941",
                                f"{BASE}/faq/list?sid=500"]
    assert seeds["events.txt"] == [f"{BASE}/events/show/77", f"{BASE}/events/show/420",
                                   f"{BASE}/events/show/857"]   # unapproved still captured
    assert seeds["members.txt"] == [f"{BASE}/members/profile/20", f"{BASE}/members/profile/30",
                                    f"{BASE}/members/profile/40",
                                    f"{BASE}/members/profile/11985"]


def test_approved_event_ids_drop_what_the_calendar_withheld(tree):
    # An unapproved or deleted event named in the reader-facing index undoes the
    # calendar's decision for every archive reader.
    private, mirror = tree
    _, public = pub.build(private, mirror, CUTOVER)
    assert public[mirror / "approved_event_ids.txt"] == "77\n857\n"


def test_every_archive_area_seed_is_a_published_seed_list(tree):
    # A seed file the crawler expects but publish never writes drops that area
    # from the archive's browse indexes with only a log line.
    private, mirror = tree
    _, public = pub.build(private, mirror, CUTOVER)
    published = {p.name for p in public if p.parent.name == "mirror_seeds"}
    for _slug, _heading, seed_name, _sort in crawler.ARCHIVE_AREAS:
        assert seed_name in published, f"ARCHIVE_AREAS names {seed_name}, publish writes none"


def test_publish_writes_exactly_the_seeded_classes(tree):
    # News permalinks would add some eighteen thousand live requests for text
    # the year-list pages already hold, and polls and ranking are broken or
    # superseded legacy features ruled out of the archive; a seed list for any
    # of them, or a missing one, changes what the crawl captures.
    private, mirror = tree
    _, public = pub.build(private, mirror, CUTOVER)
    assert sorted(p.name for p in public if p.parent.name == "mirror_seeds") == [
        "clubs.txt", "events.txt", "faq.txt", "gallery.txt", "members.txt", "moves.txt",
        "rules.txt"]


def test_crawl_exclusions_cover_scoped_and_private_committee_content(tree):
    # A committee-scoped file missing from the list is crawled into the
    # member-visible archive against the IFPA ruling.
    private, mirror = tree
    priv, _ = pub.build(private, mirror, CUTOVER)
    text = priv[private / pub.EXCLUSIONS_REL]
    entries = [x for x in text.splitlines() if not x.startswith("#")]
    assert entries == [
        "ifpa/groups/secret/a.txt", "groups/showfile/3",
        "ifpa/groups/open/scoped.pdf", "groups/showfile/10",
        "groups/listfiles/5", "groups/list/secret", "groups/home/secret",
        "groups/listfiles/9",                    # private, but no keyword to address it by
        "groups/listfiles/12",
    ]
    assert text.startswith(pub.EXCLUSIONS_HEADER)


def test_group_file_inventory_carries_each_file_with_its_committee_visibility(tree):
    # The group-file recovery routes on these columns; a lost committee flag
    # would send a private committee's document to the member-visible archive.
    private, mirror = tree
    priv, _ = pub.build(private, mirror, CUTOVER)
    rows = list(csv.DictReader(io.StringIO(priv[private / pub.INVENTORY_REL])))
    assert [(r["FileID"], r["FileVisible"], r["FileGroupID"], r["FileLocation"],
             r["FileScope"], r["CommitteeName"], r["CommitteePublic"]) for r in rows] == [
        ("10", "1", "12", "/ifpa/groups/open/scoped.pdf", "2", "Open Group", "1"),
        ("3", "1", "5", "/ifpa/groups/secret/a.txt", "0", "Secret Group", "0"),
        ("4", "0", "12", "/ifpa/groups/open/public.pdf", "0", "Open Group", "1"),
        ("6", "1", "44", "/ifpa/groups/gone/b.txt", "0", "", ""),
    ]


def test_member_tier_flags_are_measured_at_the_given_cutover_date(tree):
    # Measured at the run day instead, the lapsed member would be granted and the
    # valid one dropped, silently, at claim.
    private, mirror = tree
    priv, _ = pub.build(private, mirror, CUTOVER)
    rows = _members(priv, private)
    assert rows["30"]["legacy_tier1_annual_active_at_cutover"] == "1"
    assert rows["40"]["legacy_tier1_annual_active_at_cutover"] == "0"
    assert rows["20"]["legacy_ever_paid_tier1_lifetime"] == "1"


@pytest.mark.parametrize("date", [None, "", "2026-13-01"])
def test_a_missing_or_malformed_cutover_date_refuses(tree, date):
    # A defaulted date makes the published standing depend on the day it ran.
    private, mirror = tree
    with pytest.raises(pub.Refused, match="cutover-date"):
        pub.build(private, mirror, date)


def test_admin_flag_is_set_from_valid_admin_rows(tree):
    # A wrong admin flag hands or withholds legacy admin standing on the import.
    private, mirror = tree
    rows = _members(pub.build(private, mirror, CUTOVER)[0], private)
    assert {m: r["legacy_is_admin"] for m, r in rows.items()} == {
        "11985": "0", "20": "1", "30": "0", "40": "0", "50": "0"}


def test_admin_flag_is_unknown_when_the_export_holds_no_admin_table(tree):
    # "0" here would assert nobody was an admin when the table simply did not arrive.
    private, mirror = tree
    (private / "legacy-export/members-admin/admins.csv").unlink()
    rows = _members(pub.build(private, mirror, CUTOVER)[0], private)
    assert {r["legacy_is_admin"] for r in rows.values()} == {""}


def test_board_flag_follows_a_roster_carrying_the_cto_record(tree):
    # A current roster's directors must inherit board standing at claim; the
    # tier they revert to is decided at claim, so nothing is carried for it.
    private, mirror = tree
    rows = _members(pub.build(private, mirror, CUTOVER)[0], private)
    assert {m for m, r in rows.items() if r["legacy_was_board_at_cutover"] == "1"} == {
        "11985", "20"}
    assert {r["legacy_board_underlying_paid_tier"] for r in rows.values()} == {""}


def test_board_flag_is_withheld_when_the_roster_lacks_the_cto_record(tree):
    # A stale roster would grant Tier 3 to former directors.
    private, mirror = tree
    _csv(private / "legacy-export/groups/ifpa_committee_members.csv",
         ["CommitteeID", "CommitteeMemberID"], [["1", "20"], ["1", "30"]])
    priv, _ = pub.build(private, mirror, CUTOVER)
    rows = _members(priv, private)
    assert {r["legacy_was_board_at_cutover"] for r in rows.values()} == {"0"}
    assert "FAIL" in priv[private / "legacy-publish" / "PUBLISH_REPORT.md"]


def test_report_states_the_cutover_date_and_the_dump_date(tree):
    # A publish whose report names the wrong dump or date cannot be audited later.
    private, mirror = tree
    report = pub.build(private, mirror, CUTOVER)[0][private / "legacy-publish/PUBLISH_REPORT.md"]
    assert f"Cutover date (annual memberships measured at): {CUTOVER}" in report
    assert "Members dump taken: 2026-05-29 15:46:52" in report


def _tally_rows(private_files, private, name):
    text = private_files[private / "legacy-publish" / "vote-tallies" / name]
    return list(csv.DictReader(io.StringIO(text)))


def test_vote_tallies_count_the_ballots_per_answer_in_issue_order(tree):
    # A miscount, a dropped no-answer ballot or a text sort that puts issue 10
    # before issue 2 would each misstate the IFPA voting record.
    private, mirror = tree
    rows = _tally_rows(pub.build(private, mirror, CUTOVER)[0], private,
                       "ifpa_issue_vote_tallies.csv")
    assert [(r["issue_id"], r["answer_index"], r["answer_text"], r["derived_votes"])
            for r in rows] == [
        ("2", "1", "Yes", "2"), ("2", "2", "No", "1"),
        ("3", "1", "Maybe", "1"),
        ("10", "0", pub.NO_ANSWER, "2"), ("10", "1", "A", "3"), ("10", "2", "B", "1"),
        ("10", "3", "C", "0"),       # a stored tally with no ballot behind it still shows
    ]
    assert {r["election_id"] for r in rows if r["issue_id"] == "10"} == {"E2"}


def test_vote_reconciliation_names_every_disagreement(tree):
    # Resolving a disagreement silently would hide which record of a vote is wrong.
    private, mirror = tree
    rows = _tally_rows(pub.build(private, mirror, CUTOVER)[0], private,
                       "tally_reconciliation.csv")
    assert [(r["issue_id"], r["answer_index"], r["stored_tally"], r["capture_count"],
             r["status"]) for r in rows] == [
        ("2", "1", "2", "2", "all three agree"),
        ("2", "2", "1", "", "agrees with stored; not matched in capture"),
        ("3", "1", "1", "4", "agrees with stored; capture says 4"),
        ("10", "0", "", "", "no numbered answer; no stored tally exists for these"),
        ("10", "1", "1", "", "disagree: ballots 3, stored 1"),
        ("10", "2", "0", "", "disagree: ballots 1, stored 0"),
        ("10", "3", "4", "", "disagree: ballots 0, stored 4"),
    ]


def test_no_ballot_level_row_reaches_any_published_file(tree):
    # How a named member voted must never leave the ballots.
    private, mirror = tree
    priv, public = pub.build(private, mirror, CUTOVER)
    leaked = [p.name for p, text in {**priv, **public}.items() if BALLOT_MEMBER in text]
    assert leaked == []


def test_a_missing_vote_capture_refuses(tree):
    # Without the capture every cell would read as uncovered by it, rewriting the
    # reconciliation as if the third record did not exist.
    private, mirror = tree
    (private / pub.VOTE_CAPTURE_REL).unlink()
    with pytest.raises(pub.Refused, match="vote_result_options.csv"):
        pub.build(private, mirror, CUTOVER)


def test_a_credential_column_in_the_export_refuses(tree):
    # A stored password reaching a published file is the one thing that can
    # never be taken back out of git history.
    private, mirror = tree
    path = private / "legacy-export/members/members.csv"
    _csv(path, MEMBER_COLUMNS + ["MemberPassword"], [_member("1") + ["pw"]])
    with pytest.raises(pub.Refused, match="MemberPassword"):
        pub.build(private, mirror, CUTOVER)


def test_a_missing_export_table_refuses_naming_the_refresh(tree):
    # Publishing around a missing table would write an empty seed list or index
    # that reads as "the legacy site had none".
    private, mirror = tree
    (private / "legacy-export/events/calendar.csv").unlink()
    with pytest.raises(pub.Refused, match="refresh_legacy_repo_data.py"):
        pub.build(private, mirror, CUTOVER)


def test_uncovered_tier_standing_refuses_and_writes_nothing(tree, monkeypatch, capsys):
    # A member arriving at the wrong tier is silent downstream, so no file may be
    # left behind for a later step to load.
    private, mirror = tree
    monkeypatch.setattr(pub, "tier_coverage_violation",
                        lambda rec, mapped, epoch: "uncovered" if rec["MemberID"] == "30" else None)
    before = _all_files(private)
    assert pub.main(["--cutover-date", CUTOVER]) == 1
    assert "tier-flag coverage failed on 1 member(s)" in capsys.readouterr().err
    assert _all_files(private) == before
    assert not mirror.exists()


def test_a_missing_private_checkout_refuses_naming_the_setup_script(tree, monkeypatch, capsys):
    # A developer without the private checkout must be told how to wire it, not
    # handed a stack trace or an empty publish.
    private, mirror = tree
    monkeypatch.setattr(pub, "PRIVATE", private.parent / "absent")
    assert pub.main(["--cutover-date", CUTOVER]) == 1
    assert "scripts/setup_private_repo.sh" in capsys.readouterr().err
    assert not mirror.exists()


def test_a_run_writes_private_files_owner_only_and_reruns_identically(tree):
    # Member data readable by another account, or output that changes between
    # identical runs, would each show up as a spurious or unsafe diff to commit.
    private, mirror = tree
    # The exclusion list already exists in a real checkout, and rewriting a file
    # keeps its old mode whatever the umask says.
    existing = private / pub.EXCLUSIONS_REL
    existing.parent.mkdir(parents=True)
    existing.write_text("old\n")
    existing.chmod(0o644)
    assert pub.main(["--cutover-date", CUTOVER]) == 0
    for name in ("legacy_members.csv", "legacy_members_encoding_problems.csv",
                 "vote-tallies/ifpa_issue_vote_tallies.csv",
                 "vote-tallies/tally_reconciliation.csv",
                 "PUBLISH_REPORT.md", "README.md"):
        assert (private / "legacy-publish" / name).stat().st_mode & 0o077 == 0, name
    assert (private / pub.EXCLUSIONS_REL).stat().st_mode & 0o077 == 0
    assert (private / pub.INVENTORY_REL).stat().st_mode & 0o077 == 0
    first = _all_files(private), _all_files(mirror)
    assert pub.main(["--cutover-date", CUTOVER]) == 0
    assert (_all_files(private), _all_files(mirror)) == first
