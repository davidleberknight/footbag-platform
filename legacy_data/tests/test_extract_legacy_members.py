"""Tests for extract_legacy_members.py, the retired dump-reading member extractor,
kept while the script is kept.

The member record transforms are pinned on export rows by
test_publish_member_transforms.py, since the publish step owns them. What stays
here is only what reading a dump adds: credential values never emitted, the
dump-level counts, the run statistics, the coverage refusal removing the CSV it
began, the board-roster checks and the command line.
"""
import csv
import importlib.util
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "member_data_scripts" / "extract_legacy_members.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_members", _SCRIPT)
elm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(elm)
# The transforms the extractor applies, as it imported them.
transforms = sys.modules["publish_legacy_repo_data"]

# Synthetic 28-column members dump. Column order in CREATE TABLE == value order
# in the positional INSERT. Credential columns carry obvious sentinel values
# that must never reach the output.
FIXTURE_SQL = """\
CREATE TABLE `members` (
  `MemberID` int(11) NOT NULL AUTO_INCREMENT,
  `MemberValid` int(11) NOT NULL DEFAULT '0',
  `MemberPassword` varchar(80) DEFAULT NULL,
  `MemberFirstName` varchar(80) DEFAULT NULL,
  `MemberFirstNameUnicode` varchar(255) NOT NULL DEFAULT '',
  `MemberLastName` varchar(80) DEFAULT NULL,
  `MemberLastNameUnicode` varchar(255) NOT NULL DEFAULT '',
  `MemberMiddleName` varchar(80) DEFAULT NULL,
  `MemberMiddleNameUnicode` varchar(255) NOT NULL DEFAULT '',
  `MemberEmail` varchar(80) DEFAULT NULL,
  `MemberEmail2` varchar(80) DEFAULT NULL,
  `MemberEmail3` varchar(80) DEFAULT NULL,
  `MemberCity` varchar(80) DEFAULT NULL,
  `MemberCityUnicode` varchar(255) NOT NULL DEFAULT '',
  `MemberState` varchar(80) DEFAULT NULL,
  `MemberStateUnicode` varchar(255) NOT NULL DEFAULT '',
  `MemberZIP` varchar(80) DEFAULT NULL,
  `MemberCountry` varchar(80) DEFAULT NULL,
  `MemberCountryUnicode` varchar(255) NOT NULL DEFAULT '',
  `MemberAddress1` varchar(80) DEFAULT NULL,
  `MemberAddress2` varchar(80) DEFAULT NULL,
  `MemberBirthMonth` int(11) DEFAULT NULL,
  `MemberBirthDay` int(11) DEFAULT NULL,
  `MemberBirthYear` int(11) DEFAULT NULL,
  `MemberComment` text,
  `MemberAlias` varchar(80) NOT NULL DEFAULT '',
  `MemberSession` text,
  `MemberIFPAJoined` int(11) NOT NULL DEFAULT '0',
  `MemberIFPATier` varchar(20) DEFAULT NULL,
  `MemberIFPAExpiration` int(11) NOT NULL DEFAULT '0',
  `MemberIFPAExpiration2` int(11) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
INSERT INTO `members` VALUES """ + ",".join([
    # 1: ASCII member, both emails, full address, birth date, IFPA join epoch;
    #    Tier-2 lifetime (tier 2, expiration2 -1)
    "(11983,1,'SECRET_HASH_DO_NOT_LEAK','Steve','','Blough','','','',"
    "'steve@example.com','steve2@example.com','','Boulder','','Colorado','',"
    "'80301','United States','','123 Main St','Apt 4',6,15,1985,"
    "'O''Brien fan','sblough','SESSION_TOKEN_DO_NOT_LEAK',1268000000,'2',0,-1)",
    # 2: Unicode name + city, only email3, no birth date, no IFPA join;
    #    Tier-1 lifetime (tier 1, expiration -1)
    "(12000,1,'pw2','','José','','Núñez','','','','',"
    "'jose@example.com','','Düsseldorf','','','','','','','',0,0,0,"
    "'','jose','sess2',0,'1',-1,0)",
    # 3: invalid (MemberValid=0) with NULL birth parts — must still be emitted
    "(99999,0,'pw3','Junk','','User','','','','junk@example.com','','',"
    "'','','','','','','','','',NULL,NULL,NULL,'','junkuser','sess3',0,NULL,NULL,NULL)",
    # 4: Tier-1 annual with an unexpired expiration (epoch 2030-01-01)
    "(12500,1,'pw4','Anna','','Nual','','','','annual@example.com','','',"
    "'','','','','','','','','',0,0,0,'','annual_user','sess4',0,'1',1893456000,0)",
    # 5: Tier-1 annual lapsed (epoch 2008-01-10) — no flag; claims on honors alone
    "(12600,1,'pw5','Lars','','Lapsed','','','','lapsed@example.com','','',"
    "'','','','','','','','','',0,0,0,'','lapsed_user','sess5',0,'1',1200000000,0)",
    # 6: stored code 0, lifetime Tier 2 — the member who first paid Tier 2 after
    #    the stored code was abandoned. Standing lives in the expiration alone.
    "(12700,1,'pw6','Pat','','Postconv','','','','post@example.com','','',"
    "'','','','','','','','','',0,0,0,'','post_user','sess6',0,'0',0,-1)",
    # 7: stored code 0, lifetime Tier 1
    "(12800,1,'pw7','Lee','','Lifer','','','','lifer@example.com','','',"
    "'','','','','','','','','',0,0,0,'','lifer_user','sess7',0,'0',-1,0)",
    # 8: stored code 0, unexpired Tier-1 annual (epoch 2030-01-01) — the cohort
    #    that no stored code ever marked, so the annual flag could never fire.
    "(12900,1,'pw8','Ada','','Active','','','','active@example.com','','',"
    "'','','','','','','','','',0,0,0,'','active_user','sess8',0,'0',1893456000,0)",
    # 9: Tier 2 held and lapsed (epoch 2008-01-10) — the history flag stands,
    #    because the grant reads Tier 2 standing expired or not.
    "(13000,1,'pw9','Ola','','Lapsedtwo','','','','lapsed2@example.com','','',"
    "'','','','','','','','','',0,0,0,'','lapsed2_user','sess9',0,'2',-1,1200000000)",
    # 10: lifetime Tier 1 plus unexpired Tier 2 (epoch 2030-01-01) — both flags,
    #     and the site computes Tier 2, which the grant's precedence gives them.
    "(13100,1,'pw10','Kim','','Both','','','','both@example.com','','',"
    "'','','','','','','','','',0,0,0,'','both_user','sess10',0,'1',-1,1893456000)",
]) + ";\n"

# The go-live write-freeze moment the annual-expiration comparison uses; fixture
# row 4 expires after it, row 5 before it.
CUTOVER_DATE = "2026-08-01"


def _run(tmp_path):
    dump = tmp_path / "members.sql"
    dump.write_text(FIXTURE_SQL, encoding="utf-8")
    out = tmp_path / "export.csv"
    stats = elm.extract(dump, out)
    rows = list(csv.DictReader(out.open(encoding="utf-8")))
    by_id = {r["legacy_member_id"]: r for r in rows}
    return stats, rows, by_id, out.read_text(encoding="utf-8")


def _write_dump(tmp_path, sql):
    dump = tmp_path / "members.sql"
    dump.write_text(sql, encoding="utf-8")
    return dump, tmp_path / "export.csv"


def test_credentials_never_emitted(tmp_path):
    _, _, _, raw = _run(tmp_path)
    assert "SECRET_HASH_DO_NOT_LEAK" not in raw
    assert "SESSION_TOKEN_DO_NOT_LEAK" not in raw
    assert "pw2" not in raw and "pw3" not in raw
    assert "sess2" not in raw and "sess3" not in raw
    assert "MemberPassword" not in raw and "MemberSession" not in raw


def test_dump_level_counts(tmp_path):
    stats, _, _, _ = _run(tmp_path)
    assert stats["rows_examined"] == 10
    assert stats["distinct_member_id"] == 10
    assert stats["email_population"] == {
        "legacy_email": 9,    # every row but 12000, which carries email3 only
        "legacy_email2": 1,   # 11983
        "legacy_email3": 1,   # 12000
    }


def test_the_retired_mode_flag_is_refused_by_name(monkeypatch, tmp_path):
    # A script or a note that still passes it must be told what replaced it.
    # Left to argparse the answer is "unrecognized arguments", which says the
    # flag is unknown and nothing about the inputs that took over its job.
    monkeypatch.setattr(
        "sys.argv",
        ["extract_legacy_members.py", "--final-export",
         "--members-sql", str(tmp_path / "members.sql"),
         "--out", str(tmp_path / "out.csv")],
    )
    with pytest.raises(SystemExit) as excinfo:
        elm.main()
    message = str(excinfo.value)
    assert "--final-export no longer exists" in message
    assert "--cutover-date" in message
    assert "--board-roster" in message


def test_parse_cutover_date():
    assert elm.parse_cutover_date(None) is None
    assert elm.parse_cutover_date("") is None
    # 2026-08-01T00:00:00Z
    assert elm.parse_cutover_date("2026-08-01") == 1785542400
    with pytest.raises(SystemExit):
        elm.parse_cutover_date("08/01/2026")


def test_tier_flags_without_cutover_date(tmp_path):
    # The two history flags populate with no cutover date; the annual-active
    # flag stays inert on every row, and the coverage check does not run
    # because there is no moment to compute standing at.
    stats, rows, by_id, _ = _run(tmp_path)
    assert by_id["11983"]["legacy_ever_paid_tier2"] == "1"
    assert by_id["12000"]["legacy_ever_paid_tier1_lifetime"] == "1"
    for r in rows:
        assert r["legacy_tier1_annual_active_at_cutover"] == "0"
    assert stats["cutover_epoch"] is None
    assert stats["tier_coverage_checked"] is False
    assert stats["tier_flags"] == {
        "legacy_ever_paid_tier2": 4,
        "legacy_ever_paid_tier1_lifetime": 4,
        "legacy_tier1_annual_active_at_cutover": 0,
        "legacy_was_board_at_cutover": 0,
    }


def _run_with_cutover(tmp_path, sql=FIXTURE_SQL):
    dump = tmp_path / "members.sql"
    dump.write_text(sql, encoding="utf-8")
    out = tmp_path / "export.csv"
    stats = elm.extract(dump, out, cutover_date=CUTOVER_DATE)
    by_id = {r["legacy_member_id"]: r
             for r in csv.DictReader(out.open(encoding="utf-8"))}
    return stats, by_id, out


def test_tier_flags_with_cutover_date(tmp_path):
    stats, by_id, out = _run_with_cutover(tmp_path)
    assert by_id["12500"]["legacy_tier1_annual_active_at_cutover"] == "1"
    assert stats["tier_coverage_checked"] is True
    assert out.exists()
    assert stats["tier_flags"]["legacy_tier1_annual_active_at_cutover"] == 2


def test_coverage_check_aborts_when_a_standing_is_uncarried(tmp_path, monkeypatch):
    # A row that computes as Tier 2 while carrying no Tier 2 flag aborts the run
    # and leaves no CSV behind, because a wrong tier is silent downstream.
    cols = ["MemberID", "MemberValid", "MemberIFPATier",
            "MemberIFPAExpiration", "MemberIFPAExpiration2"]
    create = ("CREATE TABLE `members` (\n"
              + ",\n".join(f"  `{c}` int(11) DEFAULT NULL" for c in cols)
              + "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8;\n")
    sql = create + "INSERT INTO `members` VALUES (7001,1,0,0,-1);\n"
    dump, out = _write_dump(tmp_path, sql)

    monkeypatch.setattr(transforms, "derive_ever_paid_tier2", lambda _raw: "0")
    with pytest.raises(SystemExit) as exc:
        elm.extract(dump, out, cutover_date=CUTOVER_DATE)
    assert "tier-flag quality check failed on 1 row" in str(exc.value)
    assert "MemberID 7001" in str(exc.value)
    assert not out.exists()


def _board_roster(tmp_path, dump, out, tiers, fingerprint=None, name="board.csv"):
    """A roster for the given ids, fingerprinted against this dump's own facts.

    The fingerprint binds the roster to the account facts it was adjudicated
    against, so building one means reading those facts back off an extract —
    which is how an operator writes a real roster too. `fingerprint` overrides
    the computed value, for the case where a roster has gone stale.
    """
    import stage_a_overrides  # the extractor puts its own directory on sys.path

    elm.extract(dump, out, cutover_date=CUTOVER_DATE)
    by_id = {r["legacy_member_id"]: r
             for r in csv.DictReader(out.open(encoding="utf-8"))}
    if fingerprint is None:
        fingerprint = stage_a_overrides.board_roster_fingerprint(
            (i, by_id[i]["real_name"], by_id[i]["birth_date"], by_id[i]["country"])
            for i in tiers if i in by_id)
    roster = tmp_path / name
    lines = ["legacy_member_id,underlying_paid_tier,name,note,fingerprint"]
    lines += [f"{i},{t},Listed Member,board at cutover,{fingerprint}"
              for i, t in tiers.items()]
    roster.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return roster


def test_board_roster_flags_listed_accounts_and_carries_underlying_tier(tmp_path):
    # The dump carries no board information at all, so board standing arrives as
    # a curated roster keyed on the legacy account id. Both columns are
    # grant-bearing: the final merge refuses to run while no row carries the
    # flag, and the underlying tier is what a governance standing reverts to.
    dump = tmp_path / "members.sql"
    dump.write_text(FIXTURE_SQL, encoding="utf-8")
    out = tmp_path / "export.csv"
    roster = _board_roster(tmp_path, dump, out, {"12500": "tier2"})
    stats = elm.extract(dump, out, cutover_date=CUTOVER_DATE, board_roster=roster)
    by_id = {r["legacy_member_id"]: r
             for r in csv.DictReader(out.open(encoding="utf-8"))}

    assert by_id["12500"]["legacy_was_board_at_cutover"] == "1"
    assert by_id["12500"]["legacy_board_underlying_paid_tier"] == "tier2"
    assert by_id["12600"]["legacy_was_board_at_cutover"] == "0"
    assert by_id["12600"]["legacy_board_underlying_paid_tier"] == ""
    assert stats["tier_flags"]["legacy_was_board_at_cutover"] == 1
    assert stats["board_roster_rows"] == 1


def test_absent_board_roster_invents_no_standing(tmp_path):
    # An absent roster leaves the flag unpopulated rather than guessing, which
    # is what keeps the final merge's fail-closed refusal in force.
    stats, by_id, _ = _run_with_cutover(tmp_path)
    assert all(r["legacy_was_board_at_cutover"] == "0" for r in by_id.values())
    assert stats["board_roster_rows"] == 0


# A supplied roster is checked against the dump it is being applied to. Each of
# the three ways it can be wrong grants, or fails to grant, board standing on
# facts nobody re-checked, and none of them raises an error of its own: the
# resulting database looks entirely normal and is wrong about the people most
# visible in it. Every one removes the CSV, matching the tier-flag check, so no
# later step loads output that was never validated.

def test_a_roster_naming_an_absent_account_is_refused(tmp_path):
    dump = tmp_path / "members.sql"
    dump.write_text(FIXTURE_SQL, encoding="utf-8")
    out = tmp_path / "export.csv"
    roster = _board_roster(tmp_path, dump, out, {"12500": "tier2"})
    # 88888 is in no fixture row, so the roster names somebody this dump has
    # never heard of; the absence is what must be reported, ahead of anything
    # the fingerprint would say about it.
    roster.write_text(
        roster.read_text(encoding="utf-8").replace("12500,", "88888,"),
        encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        elm.extract(dump, out, cutover_date=CUTOVER_DATE, board_roster=roster)
    message = str(excinfo.value)
    assert "does not carry" in message
    assert "88888" in message
    assert not out.exists()


def test_a_roster_with_an_unrecognised_underlying_tier_is_refused(tmp_path):
    dump = tmp_path / "members.sql"
    dump.write_text(FIXTURE_SQL, encoding="utf-8")
    out = tmp_path / "export.csv"
    # tier3 is the governance standing itself, not something underneath it.
    roster = _board_roster(tmp_path, dump, out, {"12500": "tier3"})

    with pytest.raises(SystemExit) as excinfo:
        elm.extract(dump, out, cutover_date=CUTOVER_DATE, board_roster=roster)
    message = str(excinfo.value)
    assert "unrecognised underlying tier" in message
    assert "tier1" in message and "tier2" in message
    assert not out.exists()


def test_a_roster_adjudicated_against_other_facts_is_refused(tmp_path):
    dump = tmp_path / "members.sql"
    dump.write_text(FIXTURE_SQL, encoding="utf-8")
    out = tmp_path / "export.csv"
    roster = _board_roster(tmp_path, dump, out, {"12500": "tier2"},
                           fingerprint="0" * 64)

    with pytest.raises(SystemExit) as excinfo:
        elm.extract(dump, out, cutover_date=CUTOVER_DATE, board_roster=roster)
    message = str(excinfo.value)
    assert "fingerprint does not match" in message
    # The computed value is printed, so recording it costs one refused run
    # rather than a hunt for where the digest comes from.
    assert "computed:" in message
    assert not out.exists()


def test_a_roster_with_no_fingerprint_at_all_is_refused(tmp_path):
    # The roster predates this contract, or somebody wrote one by hand. Either
    # way it has not been adjudicated against this dump.
    dump = tmp_path / "members.sql"
    dump.write_text(FIXTURE_SQL, encoding="utf-8")
    out = tmp_path / "export.csv"
    roster = tmp_path / "board.csv"
    roster.write_text(
        "legacy_member_id,underlying_paid_tier,name,note\n"
        "12500,tier2,Listed Member,board at cutover\n",
        encoding="utf-8")

    with pytest.raises(SystemExit) as excinfo:
        elm.extract(dump, out, cutover_date=CUTOVER_DATE, board_roster=roster)
    assert "(none recorded)" in str(excinfo.value)
    assert not out.exists()


def test_the_board_roster_path_has_no_environment_fallback(monkeypatch, tmp_path):
    # The runner resolves this path, reports on every run whether it had one,
    # and refuses a production extract without it. An environment fallback here
    # would let a direct invocation pick up a roster nobody reported, or miss
    # one because of a typo nothing reads back.
    monkeypatch.setenv("FOOTBAG_BOARD_ROSTER", str(tmp_path / "unread.csv"))
    monkeypatch.setattr(
        "sys.argv",
        ["extract_legacy_members.py",
         "--members-sql", str(tmp_path / "absent.sql"),
         "--out", str(tmp_path / "out.csv"),
         "--cutover-date", "2026-01-01"],
    )
    with pytest.raises(SystemExit) as excinfo:
        elm.main()
    # It gets as far as the missing dump, which means it never resolved a roster
    # from the environment on the way there.
    assert "members dump not found" in str(excinfo.value)


def test_the_cutover_date_is_required_and_never_read_from_the_environment(monkeypatch, tmp_path):
    # Without a date the annual-active derivation flags no row and the extract
    # still looks complete, so a missing date must stop the run rather than be
    # filled in from a variable nobody sees set.
    monkeypatch.setenv("FOOTBAG_CUTOVER_DATE", "2026-01-01")
    monkeypatch.setattr(
        "sys.argv",
        ["extract_legacy_members.py",
         "--members-sql", str(tmp_path / "absent.sql"),
         "--out", str(tmp_path / "out.csv")],
    )
    with pytest.raises(SystemExit) as excinfo:
        elm.main()
    assert excinfo.value.code == 2
