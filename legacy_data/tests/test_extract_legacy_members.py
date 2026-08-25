"""M1 tests for extract_legacy_members.py.

Verifies the legacy members-dump extractor against a synthetic fixture
mysqldump: the column-to-field map, that credential values are never emitted,
three-email handling, Unicode-vs-latin1 name preference, birth-date and
IFPA-join-date assembly, that NO source-validity filtering happens here (the
loader owns that), and the dump-level counts the loader cannot see.

Also covers the paid-tier derivations, which read the two expiration columns
and never the stored tier code, and the quality check that aborts a run whose
derived flags fail to carry the standing the legacy site's own tier
computation returns.
"""
import csv
import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "member_data_scripts" / "extract_legacy_members.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_members", _SCRIPT)
elm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(elm)

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


def test_column_field_map(tmp_path):
    _, _, by_id, _ = _run(tmp_path)
    r = by_id["11983"]
    assert r["member_valid"] == "1"
    assert r["legacy_user_id"] == "sblough"
    assert r["display_name"] == "sblough"
    assert r["real_name"] == "Steve Blough"
    assert r["legacy_email"] == "steve@example.com"
    assert r["city"] == "Boulder"
    assert r["region"] == "Colorado"
    assert r["country"] == "United States"
    assert r["postal_code"] == "80301"
    assert r["street_address"] == "123 Main St, Apt 4"
    assert r["bio"] == "O'Brien fan"          # '' -> ' unescaping
    assert r["is_hof"] == "" and r["is_bap"] == "" and r["legacy_is_admin"] == ""
    assert r["legacy_was_board_at_cutover"] == "0"
    assert r["legacy_board_underlying_paid_tier"] == ""


def test_credentials_never_emitted(tmp_path):
    _, _, _, raw = _run(tmp_path)
    assert "SECRET_HASH_DO_NOT_LEAK" not in raw
    assert "SESSION_TOKEN_DO_NOT_LEAK" not in raw
    assert "pw2" not in raw and "pw3" not in raw
    assert "sess2" not in raw and "sess3" not in raw
    assert "MemberPassword" not in raw and "MemberSession" not in raw


def test_three_email_handling(tmp_path):
    _, _, by_id, _ = _run(tmp_path)
    assert by_id["11983"]["legacy_email2"] == "steve2@example.com"
    assert by_id["11983"]["legacy_email3"] == ""
    assert by_id["12000"]["legacy_email"] == ""
    assert by_id["12000"]["legacy_email3"] == "jose@example.com"


def test_unicode_preference(tmp_path):
    _, _, by_id, _ = _run(tmp_path)
    r = by_id["12000"]
    assert r["real_name"] == "José Núñez"   # Unicode cols preferred
    assert r["city"] == "Düsseldorf"


def test_birth_and_ifpa_dates(tmp_path):
    _, _, by_id, _ = _run(tmp_path)
    assert by_id["11983"]["birth_date"] == "1985-06-15"
    assert by_id["11983"]["ifpa_join_date"].startswith("2010-")   # epoch -> ISO
    assert by_id["12000"]["birth_date"] == ""                     # year 0
    assert by_id["12000"]["ifpa_join_date"] == ""                 # join 0
    assert by_id["99999"]["birth_date"] == ""                     # NULL parts


def test_no_filtering_invalid_row_emitted(tmp_path):
    _, rows, by_id, _ = _run(tmp_path)
    # The extractor does NOT filter; the MemberValid=0 row is emitted verbatim.
    assert len(rows) == 10
    assert by_id["99999"]["member_valid"] == "0"
    assert by_id["99999"]["real_name"] == "Junk User"


# ── final-export freshness gate ─────────────────────────────────────────────
# The gate asserts, at day granularity, that a final production dump was
# captured after the declared write-freeze date: the dump-completion date is
# not before the freeze, and no member was modified after it.

FREEZE_DATE = "2024-06-15"


def _epoch(y, mo, d, h=12):
    from datetime import datetime, timezone
    return int(datetime(y, mo, d, h, tzinfo=timezone.utc).timestamp())


def _freshness_dump(modified_epochs, completed_on):
    """A minimal members dump carrying a MemberModified column and a
    `-- Dump completed on` trailer, for exercising the freshness gate."""
    cols = ["MemberID", "MemberValid", "MemberModified",
            "MemberIFPATier", "MemberIFPAExpiration"]
    create = ("CREATE TABLE `members` (\n"
              + ",\n".join(f"  `{c}` int(11) DEFAULT NULL" for c in cols)
              + "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8;\n")
    tuples = ",".join(f"({1000 + i},1,{mod},0,0)"
                      for i, mod in enumerate(modified_epochs, start=1))
    insert = f"INSERT INTO `members` VALUES {tuples};\n"
    trailer = f"-- Dump completed on {completed_on}\n"
    return create + insert + trailer


def _write_dump(tmp_path, sql):
    dump = tmp_path / "members.sql"
    dump.write_text(sql, encoding="utf-8")
    return dump, tmp_path / "export.csv"


def test_final_export_requires_cutover_date(tmp_path):
    sql = _freshness_dump([_epoch(2024, 6, 14)], "2024-06-16 09:00:00")
    dump, out = _write_dump(tmp_path, sql)
    with pytest.raises(SystemExit) as exc:
        elm.extract(dump, out, cutover_date=None, final_export=True)
    assert "--final-export requires --cutover-date" in str(exc.value)
    assert not out.exists()


def test_final_export_rejects_stale_dump(tmp_path):
    # Dump completed 2024-06-10, before the 2024-06-15 freeze: pre-freeze/stale.
    sql = _freshness_dump([_epoch(2024, 6, 9)], "2024-06-10 09:00:00")
    dump, out = _write_dump(tmp_path, sql)
    with pytest.raises(SystemExit) as exc:
        elm.extract(dump, out, cutover_date=FREEZE_DATE, final_export=True)
    assert "before the declared write-freeze" in str(exc.value)
    assert not out.exists()   # aborts before writing any CSV


def test_final_export_rejects_post_freeze_modification(tmp_path):
    # Dump completed after the freeze, but a member was modified 2024-06-16.
    sql = _freshness_dump(
        [_epoch(2024, 6, 14), _epoch(2024, 6, 16)], "2024-06-17 09:00:00")
    dump, out = _write_dump(tmp_path, sql)
    with pytest.raises(SystemExit) as exc:
        elm.extract(dump, out, cutover_date=FREEZE_DATE, final_export=True)
    assert "after the declared write-freeze" in str(exc.value)
    assert not out.exists()


def test_final_export_passes_fresh_dump(tmp_path):
    # Completed after the freeze; latest modification on the freeze day itself.
    sql = _freshness_dump(
        [_epoch(2024, 6, 14), _epoch(2024, 6, 15, h=23)], "2024-06-16 09:00:00")
    dump, out = _write_dump(tmp_path, sql)
    stats = elm.extract(dump, out, cutover_date=FREEZE_DATE, final_export=True)
    fr = stats["freshness"]
    assert fr is not None
    assert fr["generation_source"] == "dump-completion trailer"
    assert fr["generation_date"] == "2024-06-16"
    assert fr["freeze_date"] == FREEZE_DATE
    assert fr["max_member_modified_iso"].startswith("2024-06-15")
    assert out.exists()   # extraction proceeds after the gate passes


def test_member_modified_carried_through_to_output_raw(tmp_path):
    # The extract transports the raw MemberModified value into the
    # legacy_member_modified output column untouched -- no normalization, no
    # reinterpretation -- so the shared-email resolver parses and validates it
    # centrally downstream.
    e1, e2 = _epoch(2024, 6, 14), _epoch(2024, 6, 15, h=23)
    sql = _freshness_dump([e1, e2], "2024-06-16 09:00:00")
    dump, out = _write_dump(tmp_path, sql)
    elm.extract(dump, out, cutover_date=FREEZE_DATE, final_export=True)
    rows = list(csv.DictReader(out.open(encoding="utf-8")))
    by_id = {r["legacy_member_id"]: r for r in rows}
    assert "legacy_member_modified" in rows[0]          # part of the output contract
    assert by_id["1001"]["legacy_member_modified"] == str(e1)
    assert by_id["1002"]["legacy_member_modified"] == str(e2)


def test_dump_level_counts(tmp_path):
    stats, _, _, _ = _run(tmp_path)
    assert stats["rows_examined"] == 10
    assert stats["distinct_member_id"] == 10
    assert stats["email_population"] == {
        "legacy_email": 9,    # every row but 12000, which carries email3 only
        "legacy_email2": 1,   # 11983
        "legacy_email3": 1,   # 12000
    }

def test_board_columns_are_never_derived_from_legacy_data(tmp_path):
    # Board / Tier 3 standing is an administrator-set flag on the live member
    # row, not something the extractor infers. Every row carries a definite
    # non-board flag and no underlying paid tier, whatever its IFPA tier value.
    # The fixture spans Tier 1, Tier 2 and an absent tier code.
    _, rows, _, _ = _run(tmp_path)
    for r in rows:
        assert r["legacy_was_board_at_cutover"] == "0"
        assert r["legacy_board_underlying_paid_tier"] == ""


def test_derive_ever_paid_tier2():
    # Any non-zero Tier-2 expiration flags: lifetime, unexpired annual, and
    # lapsed annual alike, because the grant reads Tier 2 standing held at
    # cutover expired or not. Only "never held it" carries no flag.
    assert elm.derive_ever_paid_tier2("-1") == "1"           # lifetime
    assert elm.derive_ever_paid_tier2("1893456000") == "1"   # unexpired annual
    assert elm.derive_ever_paid_tier2("1200000000") == "1"   # lapsed annual
    assert elm.derive_ever_paid_tier2(" -1 ") == "1"
    assert elm.derive_ever_paid_tier2("0") == "0"
    assert elm.derive_ever_paid_tier2("") == "0"
    assert elm.derive_ever_paid_tier2(None) == "0"
    assert elm.derive_ever_paid_tier2("not-a-number") == "0"


def test_derive_ever_paid_tier1_lifetime():
    # The -1 lifetime sentinel flags. A real epoch is annual, not lifetime, and
    # 0 is no Tier 1 standing ever.
    assert elm.derive_ever_paid_tier1_lifetime("-1") == "1"
    assert elm.derive_ever_paid_tier1_lifetime(" -1 ") == "1"
    assert elm.derive_ever_paid_tier1_lifetime("1893456000") == "0"
    assert elm.derive_ever_paid_tier1_lifetime("0") == "0"
    assert elm.derive_ever_paid_tier1_lifetime("") == "0"
    assert elm.derive_ever_paid_tier1_lifetime(None) == "0"


def test_derive_tier1_annual_active_at_cutover():
    cutover = elm.parse_cutover_date(CUTOVER_DATE)
    # Unexpired annual flags; lapsed, lifetime (-1), none (0) and non-numeric
    # never flag.
    assert elm.derive_tier1_annual_active_at_cutover("1893456000", cutover) == "1"
    assert elm.derive_tier1_annual_active_at_cutover("1200000000", cutover) == "0"
    assert elm.derive_tier1_annual_active_at_cutover("-1", cutover) == "0"
    assert elm.derive_tier1_annual_active_at_cutover("0", cutover) == "0"
    assert elm.derive_tier1_annual_active_at_cutover("not-a-number", cutover) == "0"
    # Without a cutover date the derivation is inert: nothing is guessed.
    assert elm.derive_tier1_annual_active_at_cutover("1893456000", None) == "0"


def test_legacy_member_tier_ports_the_site_computation():
    now = elm.parse_cutover_date(CUTOVER_DATE)
    past, future = "1200000000", "1893456000"
    # Lifetime Tier 2 wins outright, whatever the Tier 1 column says.
    assert elm.legacy_member_tier("0", "-1", now) == 2
    assert elm.legacy_member_tier("-1", "-1", now) == 2
    assert elm.legacy_member_tier(future, "-1", now) == 2
    # Lifetime Tier 1 with an unexpired Tier 2 annual is Tier 2; once that
    # Tier 2 lapses the member falls back to their lifetime Tier 1.
    assert elm.legacy_member_tier("-1", future, now) == 2
    assert elm.legacy_member_tier("-1", past, now) == 1
    assert elm.legacy_member_tier("-1", "0", now) == 1
    # No lifetime standing: an unexpired Tier 1 annual is Tier 1, a lapsed one
    # is no membership at all.
    assert elm.legacy_member_tier(future, "0", now) == 1
    assert elm.legacy_member_tier(past, "0", now) == 0
    assert elm.legacy_member_tier("0", "0", now) == 0
    # A Tier 2 annual without lifetime Tier 1 does not reach the Tier 2 branch,
    # which is the site's own behaviour and why the check is coverage-only.
    assert elm.legacy_member_tier(future, future, now) == 1


def test_parse_cutover_date():
    import pytest
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
    assert by_id["11983"]["legacy_ever_paid_tier1_lifetime"] == "0"
    assert by_id["12000"]["legacy_ever_paid_tier1_lifetime"] == "1"
    assert by_id["12000"]["legacy_ever_paid_tier2"] == "0"
    assert by_id["99999"]["legacy_ever_paid_tier2"] == "0"
    assert by_id["99999"]["legacy_ever_paid_tier1_lifetime"] == "0"
    for r in rows:
        assert r["legacy_tier1_annual_active_at_cutover"] == "0"
    assert stats["cutover_epoch"] is None
    assert stats["tier_coverage_checked"] is False
    assert stats["tier_flags"] == {
        "legacy_ever_paid_tier2": 4,
        "legacy_ever_paid_tier1_lifetime": 4,
        "legacy_tier1_annual_active_at_cutover": 0,
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
    stats, by_id, _ = _run_with_cutover(tmp_path)
    # The unexpired annual flags; the lapsed annual and the lifetime rows do not.
    assert by_id["12500"]["legacy_tier1_annual_active_at_cutover"] == "1"
    assert by_id["12600"]["legacy_tier1_annual_active_at_cutover"] == "0"
    assert by_id["12000"]["legacy_tier1_annual_active_at_cutover"] == "0"
    # A lapsed Tier 1 annual carries no flag at all: the member claims on
    # honors alone.
    assert by_id["12600"]["legacy_ever_paid_tier2"] == "0"
    assert by_id["12600"]["legacy_ever_paid_tier1_lifetime"] == "0"
    assert stats["tier_coverage_checked"] is True
    assert stats["tier_flags"] == {
        "legacy_ever_paid_tier2": 4,
        "legacy_ever_paid_tier1_lifetime": 4,
        "legacy_tier1_annual_active_at_cutover": 2,
    }


def test_standing_is_read_from_the_expirations_not_the_stored_code(tmp_path):
    # The stored tier code is dead: it was written once, in a one-time
    # conversion, and every member who first paid afterwards still carries the
    # pre-conversion 0. These three rows all carry a stored 0 while holding
    # live standing, and each must be flagged on the expiration columns alone.
    _, by_id, _ = _run_with_cutover(tmp_path)
    assert by_id["12700"]["legacy_ever_paid_tier2"] == "1"              # lifetime Tier 2
    assert by_id["12800"]["legacy_ever_paid_tier1_lifetime"] == "1"     # lifetime Tier 1
    assert by_id["12900"]["legacy_tier1_annual_active_at_cutover"] == "1"


def test_lapsed_tier2_keeps_the_history_flag(tmp_path):
    # Tier 2 standing grants expired or not, so a lapsed Tier 2 expiration
    # still carries the flag even though the member computes as Tier 1 today.
    _, by_id, _ = _run_with_cutover(tmp_path)
    assert by_id["13000"]["legacy_ever_paid_tier2"] == "1"
    assert by_id["13000"]["legacy_ever_paid_tier1_lifetime"] == "1"


def test_a_member_may_carry_several_flags(tmp_path):
    # Lifetime Tier 1 plus an unexpired Tier 2 sets both history flags. The
    # claim-time grant's precedence order resolves which tier is granted; the
    # extractor's job is to report every standing the record carries.
    _, by_id, _ = _run_with_cutover(tmp_path)
    assert by_id["13100"]["legacy_ever_paid_tier2"] == "1"
    assert by_id["13100"]["legacy_ever_paid_tier1_lifetime"] == "1"
    assert by_id["13100"]["legacy_tier1_annual_active_at_cutover"] == "0"


def test_coverage_check_aborts_when_a_standing_is_uncarried(tmp_path):
    # The guard against this class of defect returning: a row that computes as
    # Tier 2 while carrying no Tier 2 flag aborts the run and leaves no CSV
    # behind, because a wrong tier is silent everywhere downstream.
    cols = ["MemberID", "MemberValid", "MemberIFPATier",
            "MemberIFPAExpiration", "MemberIFPAExpiration2"]
    create = ("CREATE TABLE `members` (\n"
              + ",\n".join(f"  `{c}` int(11) DEFAULT NULL" for c in cols)
              + "\n) ENGINE=MyISAM DEFAULT CHARSET=utf8;\n")
    sql = create + "INSERT INTO `members` VALUES (7001,1,0,0,-1);\n"
    dump, out = _write_dump(tmp_path, sql)

    original = elm.derive_ever_paid_tier2
    elm.derive_ever_paid_tier2 = lambda _raw: "0"     # the defect, reintroduced
    try:
        with pytest.raises(SystemExit) as exc:
            elm.extract(dump, out, cutover_date=CUTOVER_DATE)
    finally:
        elm.derive_ever_paid_tier2 = original
    assert "tier-flag quality check failed on 1 row" in str(exc.value)
    assert "MemberID 7001" in str(exc.value)
    assert not out.exists()


def test_coverage_check_passes_on_the_whole_fixture(tmp_path):
    # Every fixture row's computed standing is carried by a flag, across
    # lifetime, annual, lapsed, never-paid and multi-standing records.
    stats, _, out = _run_with_cutover(tmp_path)
    assert stats["tier_coverage_checked"] is True
    assert out.exists()
