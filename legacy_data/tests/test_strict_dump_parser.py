"""
test_strict_dump_parser.py
==========================

Pins the strict legacy dump reader's contract: a delivery is read exactly or
refused with the file, the line and the reason, and a refusal never quotes row
content. Every fixture is a small synthetic dump written by the test; nothing
here reads the real dump.

Run from repo root:
    python -m pytest legacy_data/tests/test_strict_dump_parser.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import strict_dump_parser as sp  # noqa: E402

HEADER = """-- MySQL dump 10.16  Distrib 10.1.48-MariaDB, for debian-linux-gnu (i686)
--
-- Server version	10.1.48-MariaDB-0+deb9u2
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
DROP TABLE IF EXISTS `members`;
CREATE TABLE `members` (
  `MemberID` int(11) NOT NULL,
  `MemberName` varchar(80) DEFAULT NULL,
  `MemberPassword` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`MemberID`),
  KEY `idx_name` (`MemberName`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
LOCK TABLES `members` WRITE;
/*!40000 ALTER TABLE `members` DISABLE KEYS */;
"""
FOOTER = """/*!40000 ALTER TABLE `members` ENABLE KEYS */;
UNLOCK TABLES;
-- Dump completed on 2026-05-29 15:46:52
"""
ROW_A = "(1,'Ann O\\'Neil','pw-secret-a')"
ROW_B = "(2,NULL,'pw-secret-b')"


def dump(body: str, *, header: str = HEADER, footer: str = FOOTER) -> bytes:
    return (header + body + footer).encode("utf-8")


def parse(raw: bytes, dialect: sp.Dialect = sp.MARIADB) -> sp.Dump:
    return sp.parse(raw, dialect, "members.sql")


def test_rows_pair_with_declared_columns_and_unescape_exactly():
    # Two inserts for one table, as the dump tool splits a large table. A
    # reader that kept only one statement, mis-unescaped a quote or turned NULL
    # into text would hand the member load wrong names and phantom values.
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A},{ROW_B};\n"
               "INSERT INTO `members` VALUES (-3,'It''s \\\"x\\\"\\nnext','');\n")
    result = parse(raw)
    table = result.tables["members"]
    assert table.columns == ["MemberID", "MemberName", "MemberPassword"]
    assert table.rows == [
        ["1", "Ann O'Neil", "pw-secret-a"],
        ["2", None, "pw-secret-b"],
        ["-3", 'It\'s "x"\nnext', ""],
    ]
    assert result.footer_dates == ["2026-05-29 15:46:52"]
    assert result.server_versions == ["10.1.48-MariaDB-0+deb9u2"]


@pytest.mark.parametrize("body, reason", [
    # A row one value short: pairing by position would shift every field.
    ("INSERT INTO `members` VALUES (1,'pw-secret-a');\n", "a row has 2 values against 3 columns"),
    # The column-list form reads as zero rows under a positional reader.
    ("INSERT INTO `members` (`MemberID`) VALUES (1);\n", "column-list insert"),
    ("INSERT IGNORE INTO `members` VALUES (1,'a','pw-secret-a');\n", "INSERT IGNORE"),
    ("REPLACE INTO `members` VALUES (1,'a','pw-secret-a');\n", "REPLACE"),
    ("UPDATE `members` SET MemberName='pw-secret-a';\n", "UPDATE"),
    ("GRANT ALL ON *.* TO 'pw-secret-a';\n", "GRANT"),
    # A binary or hex literal is a dump format change, not text.
    ("INSERT INTO `members` VALUES (1,_binary 'pw-secret-a','x');\n", "value form outside the allowlist"),
    ("INSERT INTO `members` VALUES (1,0x70772d736563726574,'x');\n", "unexpected character between values"),
    # A trigger or definer hides in a conditional comment.
    ("/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER t */;\n",
     "conditional comment outside the allowlist"),
    # An insert that does not start its line is the injected-row shape.
    ("  INSERT INTO `members` VALUES (1,'a','pw-secret-a');\n", "insert statement does not start its line"),
    ("INSERT INTO `members` VALUES (1,'a','pw-secret-a'); INSERT INTO `members` VALUES (2,'b','c');\n",
     "text follows the insert on its line"),
    ("INSERT INTO `others` VALUES (1);\n", "which no definition precedes"),
    ("INSERT INTO `members` VALUES (1,'a\\qb','pw-secret-a');\n", "escape sequence outside"),
])
def test_statement_and_value_forms_outside_the_allowlist_are_refused(body, reason):
    with pytest.raises(sp.DumpRefused) as err:
        parse(dump(body))
    assert reason in str(err.value)
    assert "members.sql: line " in str(err.value)
    # A refusal is printed to the operator's terminal and logs: it never quotes
    # a row's content, which in this table includes a stored password.
    assert "pw-secret" not in str(err.value)


def test_refusal_names_the_line_of_the_offending_statement():
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n"
               "INSERT INTO `members` VALUES (2,'b');\n")
    with pytest.raises(sp.DumpRefused) as err:
        parse(raw)
    assert err.value.line == HEADER.count("\n") + 2
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n\nGRANT ALL ON x TO y;\n")
    with pytest.raises(sp.DumpRefused) as err:
        parse(raw)
    assert err.value.line == HEADER.count("\n") + 3


def test_every_dump_tool_escape_unescapes_to_its_character():
    # A wrong backslash escape moves a string's end: the next value would be
    # read as part of this one, or a quote inside text would end it early.
    raw = dump("INSERT INTO `members` VALUES "
               "(1,'a\\\\b\\0c\\td\\re\\bf\\Zg\\\\','next');\n")
    assert parse(raw).tables["members"].rows == [["1", "a\\b\0c\td\re\bf\x1ag\\", "next"]]


@pytest.mark.parametrize("value", ["insert into members values (9)",
                                   "INSERT  INTO members VALUES (9)",
                                   "Insert\tInto x"])
def test_insert_text_is_recorded_whatever_its_case_or_spacing(value):
    raw = dump(f"INSERT INTO `members` VALUES (1,'{value}','x');\n")
    assert parse(raw).tables["members"].rows_with_insert_text == [0]


def test_a_row_with_an_extra_value_is_refused():
    with pytest.raises(sp.DumpRefused, match="a row has 4 values against 3 columns"):
        parse(dump("INSERT INTO `members` VALUES (1,'a','b','pw-secret-a');\n"))


@pytest.mark.parametrize("line", ["# a hash comment", "CREATE INDEX idx ON members (MemberID);"])
def test_msql_only_forms_are_refused_in_other_dialects(line):
    with pytest.raises(sp.DumpRefused, match="outside the allowlist"):
        parse(dump(line + "\n"))


@pytest.mark.parametrize("line", [
    "DROP TABLE IF EXISTS `members`; DELETE FROM `members`;",
    "LOCK TABLES `members` WRITE; UPDATE `members` SET x=1;",
    "/*!40101 SET NAMES utf8 */; GRANT ALL ON x TO y;",
    "UNLOCK TABLES; DELETE FROM `members`;",
])
def test_an_allowed_statement_carrying_a_trailing_payload_is_refused(line):
    with pytest.raises(sp.DumpRefused):
        parse(dump(line + "\n"))


def test_a_create_header_carrying_a_trailing_payload_is_refused():
    raw = dump("", header=HEADER.replace("CREATE TABLE `members` (",
                                         "CREATE TABLE `members` ( DROP DATABASE x;"))
    with pytest.raises(sp.DumpRefused):
        parse(raw)


def test_a_comment_after_the_last_footer_is_refused():
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n") + b"-- appended note\n"
    with pytest.raises(sp.DumpRefused, match="content follows an end-of-dump footer"):
        parse(raw)


@pytest.mark.parametrize("definition, reason", [
    ("CREATE TABLE `t` (\n  `a` int(11)\n) ENGINE=MyISAM\n", "does not end with its terminator"),
    ("CREATE TABLE `t` (\n  KEY `k` (`a`)\n) ENGINE=MyISAM;\n", "declares no columns"),
    ("CREATE TABLE `t` (\n  `a` int(11),\n  PRIMARY KEY (`b`)\n) ENGINE=MyISAM;\n",
     "a key names an undeclared column"),
    ("CREATE TABLE `t` (\n  `a` int(11)\n) ENGINE=MyISAM; GRANT ALL ON x TO y;\n",
     "terminator and table options alone"),
    ("CREATE TABLE `t` (\n  `a` int(11),\n  `a` int(11)\n) ENGINE=MyISAM;\n",
     "declares column a twice"),
    ("CREATE TABLE `t` (\n  `Secret Password` varchar(40)\n) ENGINE=MyISAM;\n",
     "neither a column nor a key"),
    ("CREATE TABLE `t` (\n  `a` int(11),\n  )garbage\n) ENGINE=MyISAM;\n", "neither a column nor a key"),
    ("CREATE TABLE `t` (\n  `a` int(11)\n", "definition runs to the end of the file"),
])
def test_a_malformed_table_definition_is_refused(definition, reason):
    raw = (HEADER + definition).encode()
    with pytest.raises(sp.DumpRefused, match=reason):
        parse(raw)


def test_a_row_cut_off_after_a_value_is_refused():
    raw = (HEADER + "INSERT INTO `members` VALUES (1,'a'").encode()
    with pytest.raises(sp.DumpRefused, match="row is unterminated"):
        parse(raw)


def test_unterminated_string_at_end_of_file_is_refused():
    # A truncated delivery must not read as a shorter, valid table.
    raw = (HEADER + "INSERT INTO `members` VALUES (1,'cut off here").encode()
    with pytest.raises(sp.DumpRefused) as err:
        parse(raw)
    assert "unterminated" in str(err.value)


def test_raw_line_break_inside_a_string_is_refused():
    raw = dump("INSERT INTO `members` VALUES (1,'two\nlines','x');\n")
    with pytest.raises(sp.DumpRefused, match="raw line break inside a string"):
        parse(raw)


def test_missing_footer_is_refused_where_the_dialect_writes_one():
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n", footer="UNLOCK TABLES;\n")
    with pytest.raises(sp.DumpRefused, match="footer is missing"):
        parse(raw)
    # The older dialect never wrote a footer, so the same file reads there.
    assert parse(raw, sp.MYSQL4_UTF8).tables["members"].rows[0][0] == "1"


def test_content_after_the_last_footer_is_refused():
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n") + \
        b"INSERT INTO `members` VALUES (9,'appended','x');\n"
    with pytest.raises(sp.DumpRefused, match="content follows an end-of-dump footer"):
        parse(raw)


def test_concatenated_dumps_each_with_a_footer_are_read():
    second = HEADER.replace("`members`", "`clubs`") + \
        "INSERT INTO `clubs` VALUES (5,'c','d');\n" + FOOTER.replace("`members`", "`clubs`")
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n") + second.encode()
    result = parse(raw)
    assert [len(t.rows) for t in result.tables.values()] == [1, 1]
    assert len(result.footer_dates) == 2


def test_a_table_defined_twice_is_refused():
    # A second definition would silently reset the table's columns mid-file.
    again = "CREATE TABLE `members` (\n  `MemberID` int(11) NOT NULL\n) ENGINE=MyISAM;\n"
    with pytest.raises(sp.DumpRefused, match="defined twice"):
        parse(dump(again))


def latin1_value_dump(footer: str = FOOTER) -> bytes:
    """A dump whose one name value is the single latin-1 byte for e-acute,
    which is not valid UTF-8."""
    return dump("INSERT INTO `members` VALUES (1,'cafX','x');\n",
                footer=footer).replace(b"cafX", b"caf\xe9")


def test_invalid_utf8_is_refused_beyond_the_declared_tolerance():
    raw = latin1_value_dump()
    with pytest.raises(sp.DumpRefused, match=r"1 line\(s\) are not valid UTF-8"):
        parse(raw)
    assert parse(raw, sp.tolerating(sp.MARIADB, 1)).invalid_utf8_lines == 1


def test_latin1_dialect_reads_bytes_as_latin1():
    raw = latin1_value_dump(footer="")
    assert parse(raw, sp.MYSQL4_LATIN1).tables["members"].rows[0][1] == "café"


def test_mysql_latin1_reads_the_windows_range_as_the_server_does():
    # The server's latin1 is Windows-1252: 0x93 and 0x94 are curly quotes, not
    # control codes. 0x81 is undefined there and stays the control of that value.
    raw = latin1_value_dump(footer="").replace(b"caf\xe9", b"\x93caf\x94\x81")
    assert parse(raw, sp.MYSQL4_LATIN1).tables["members"].rows[0][1] == "“caf”\x81"


def test_insert_text_inside_a_value_is_recorded_not_refused():
    # A value quoting SQL cannot become a row under this reader; the refresh
    # judges whether a delivery added or changed such a row.
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A},"
               "(2,'quoted\\nINSERT INTO news (NewsID) VALUES (1)','x');\n")
    table = parse(raw).tables["members"]
    assert len(table.rows) == 2
    assert table.rows_with_insert_text == [1]


def test_msql_dialect_reads_backslash_g_statements():
    raw = b"""drop table clubcontacts\\g
#
# mSQL Dump  (requires mSQL 2.0 Beta 5 or newer)
#
CREATE TABLE clubcontacts (
  ContactValid INT NOT NULL,
  ContactClubID CHAR(40) NOT NULL
) \\g

CREATE   INDEX idx_clubcontacts ON clubcontacts (
\tContactClubID
) \\g

INSERT INTO clubcontacts  VALUES (1,'1027288301')\\g
INSERT INTO clubcontacts  VALUES (0,'1026142927')\\g
"""
    table = sp.parse(raw, sp.MSQL, "clubcontacts.mysql").tables["clubcontacts"]
    assert table.columns == ["ContactValid", "ContactClubID"]
    assert table.rows == [["1", "1027288301"], ["0", "1026142927"]]


def test_a_comment_of_a_form_the_dump_tool_never_writes_is_refused():
    # A looser reader that scans the whole file for insert text would pick up
    # a row planted in a comment; only the tool's own banner lines are allowed.
    raw = dump("-- INSERT INTO `members` VALUES (9,'hidden','pw-secret-h');\n")
    with pytest.raises(sp.DumpRefused, match="comment line of a form the dump tool does not write"):
        parse(raw)


def test_values_on_a_line_of_their_own_is_refused():
    # The dump tool writes each insert on one line; a split insert is a format
    # change and would also throw every later line number off.
    raw = dump("INSERT INTO `members` VALUES\n(1,'a','pw-secret-a');\n")
    with pytest.raises(sp.DumpRefused, match="expected a row"):
        parse(raw)


def test_a_trigger_hidden_inside_a_session_setting_comment_is_refused():
    raw = dump("/*!40101 SET @a=1 */ /*!50003 TRIGGER t BEFORE INSERT ON members */;\n")
    with pytest.raises(sp.DumpRefused, match="conditional comment outside the allowlist"):
        parse(raw)


def test_two_rows_sharing_a_primary_key_value_are_refused():
    # The server enforces the key, so an honest dump never repeats one; which
    # copy a downstream loader keeps would otherwise be an accident.
    raw = dump("INSERT INTO `members` VALUES (1,'Ann','pw-a'),(1,'Mallory','pw-m');\n")
    with pytest.raises(sp.DumpRefused, match="two rows share one value of the key"):
        parse(raw)


def test_a_unique_key_allows_repeated_nulls_and_is_read_when_no_primary_key_exists():
    header = HEADER.replace("  PRIMARY KEY (`MemberID`),\n", "  UNIQUE KEY `u` (`MemberName`),\n")
    raw = dump("INSERT INTO `members` VALUES (1,NULL,'a'),(2,NULL,'b');\n", header=header)
    table = parse(raw).tables["members"]
    assert table.key_columns == ["MemberName"]
    assert len(table.rows) == 2


def test_raw_carriage_return_nul_and_ctrl_z_in_values_are_counted():
    # The dump tool always escapes these three, so raw ones are a format
    # fingerprint the refresh compares across deliveries.
    raw = dump("INSERT INTO `members` VALUES (1,'a\rb\0c\x1ad','x');\n")
    assert parse(raw).raw_control_chars == 3


def test_a_crlf_encoded_dump_is_refused():
    raw = dump(f"INSERT INTO `members` VALUES {ROW_A};\n").replace(b"\n", b"\r\n")
    with pytest.raises(sp.DumpRefused):
        parse(raw)


def test_unquoted_columns_named_like_key_words_are_read_as_columns():
    # MySQL 4 names are unquoted; a column called Index or Key must not be
    # mistaken for a key line, or every row would be refused one value long.
    raw = (b"CREATE TABLE potd (\n  Index int(11) NOT NULL,\n  Key int(11),\n"
           b"  UNIQUE KEY idx_potd (Index)\n) TYPE=MyISAM;\n"
           b"INSERT INTO potd VALUES (1,2),(3,4);\n")
    table = sp.parse(raw, sp.MYSQL4_UTF8, "index2.sql").tables["potd"]
    assert table.columns == ["Index", "Key"]
    assert table.key_columns == ["Index"]
    assert table.rows == [["1", "2"], ["3", "4"]]
