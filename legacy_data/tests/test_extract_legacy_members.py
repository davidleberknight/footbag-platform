"""M1 tests for extract_legacy_members.py.

Verifies the legacy members-dump extractor against a synthetic fixture
mysqldump: the column-to-field map, that credential values are never emitted,
three-email handling, Unicode-vs-latin1 name preference, birth-date and
IFPA-join-date assembly, that NO source-validity filtering happens here (the
loader owns that), and the dump-level counts the loader cannot see.
"""
import csv
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "extract_legacy_members.py"
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
  `MemberIFPAJoined` int(11) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
INSERT INTO `members` VALUES """ + ",".join([
    # 1: ASCII member, both emails, full address, birth date, IFPA join epoch
    "(11983,1,'SECRET_HASH_DO_NOT_LEAK','Steve','','Blough','','','',"
    "'steve@example.com','steve2@example.com','','Boulder','','Colorado','',"
    "'80301','United States','','123 Main St','Apt 4',6,15,1985,"
    "'O''Brien fan','sblough','SESSION_TOKEN_DO_NOT_LEAK',1268000000)",
    # 2: Unicode name + city, only email3, no birth date, no IFPA join
    "(12000,1,'pw2','','José','','Núñez','','','','',"
    "'jose@example.com','','Düsseldorf','','','','','','','',0,0,0,"
    "'','jose','sess2',0)",
    # 3: invalid (MemberValid=0) with NULL birth parts — must still be emitted
    "(99999,0,'pw3','Junk','','User','','','','junk@example.com','','',"
    "'','','','','','','','','',NULL,NULL,NULL,'','junkuser','sess3',0)",
]) + ";\n"


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
    assert len(rows) == 3
    assert by_id["99999"]["member_valid"] == "0"
    assert by_id["99999"]["real_name"] == "Junk User"


def test_dump_level_counts(tmp_path):
    stats, _, _, _ = _run(tmp_path)
    assert stats["rows_examined"] == 3
    assert stats["distinct_member_id"] == 3
    assert stats["email_population"] == {
        "legacy_email": 2,    # 11983 + 99999
        "legacy_email2": 1,   # 11983
        "legacy_email3": 1,   # 12000
    }
