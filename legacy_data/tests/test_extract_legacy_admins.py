"""Tests for extract_legacy_admins.py.

Verifies legacy_is_admin is set from the admins dump (AdminValid=1 only),
that AdminRealm does not promote, that a second table in the same dump
(`bounces`) is ignored, and that admin ids without a member row are counted
but never invent a member.
"""
import csv
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "extract_legacy_admins.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_admins", _SCRIPT)
ela = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ela)

ADMINS_SQL = """\
CREATE TABLE `admins` (
  `AdminID` int(11) NOT NULL,
  `AdminValid` int(11) NOT NULL DEFAULT '0',
  `AdminRealm` char(80) DEFAULT NULL,
  `AdminGetsEmail` int(11) DEFAULT NULL,
  `AdminCreated` int(11) DEFAULT NULL,
  `AdminModified` int(11) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
INSERT INTO `admins` VALUES (11983,1,'webmaster',1,100,200),(12000,0,'editor',0,100,200),(55555,1,'ghost',1,100,200);
CREATE TABLE `bounces` (
  `AdminID` int(11) NOT NULL,
  `AdminValid` int(11) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
INSERT INTO `bounces` VALUES (99999,1);
"""

MEMBERS_CSV = (
    "legacy_member_id,legacy_user_id,legacy_is_admin\n"
    "11983,danceman,\n"
    "12000,jose,\n"
    "99999,junkuser,\n"
)


def _run(tmp_path):
    admins = tmp_path / "admins.sql"
    admins.write_text(ADMINS_SQL, encoding="utf-8")
    members = tmp_path / "members.csv"
    members.write_text(MEMBERS_CSV, encoding="utf-8")
    out = tmp_path / "out.csv"
    stats = ela.apply_admin_flag(members, admins, out)
    rows = {r["legacy_member_id"]: r for r in csv.DictReader(out.open(encoding="utf-8"))}
    return stats, rows


def test_valid_admin_flagged(tmp_path):
    _, rows = _run(tmp_path)
    assert rows["11983"]["legacy_is_admin"] == "1"


def test_invalid_admin_not_flagged(tmp_path):
    _, rows = _run(tmp_path)
    # AdminValid=0 must not flag.
    assert rows["12000"]["legacy_is_admin"] == "0"


def test_non_admin_member_is_zero(tmp_path):
    _, rows = _run(tmp_path)
    assert rows["99999"]["legacy_is_admin"] == "0"


def test_bounces_table_ignored_and_counts(tmp_path):
    stats, _ = _run(tmp_path)
    # admins with AdminValid=1: 11983 and 55555 (ghost); 99999 is in `bounces`,
    # a different table, and must not be counted as an admin.
    assert stats["valid_admins_in_dump"] == 2
    assert stats["members_flagged_admin"] == 1            # only 11983 has a member row
    assert stats["admin_ids_without_member_row"] == 1     # 55555 (ghost)
