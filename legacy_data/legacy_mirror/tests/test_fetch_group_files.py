"""The content-level backstop in the group-file recovery script.

A file's recorded scope and its committee's public flag are what fetch_group_
files.py routes on, and this session that missed two real files: a committee
marked public had itself uploaded a raw member-roster export, which carried no
metadata signal at all. This is the narrow catch added afterward: a file whose
extracted text reads as a phone-number-dense export, or carries the legacy
search page's own heading, is routed to private custody regardless of what its
scope and committee say.

Run from repo root:
    legacy_data/footbag_venv/bin/python -m pytest \\
        legacy_data/legacy_mirror/tests/test_fetch_group_files.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = (Path(__file__).resolve().parent.parent / 'scripts' / 'fetch_group_files.py')
spec = importlib.util.spec_from_file_location('fetch_group_files', str(SCRIPT_PATH))
fgf = importlib.util.module_from_spec(spec)
sys.modules['fetch_group_files'] = fgf
spec.loader.exec_module(fgf)

ROSTER_TXT = (
    "Member Search Results\n"
    "Jerry Dean Anderson  ThAFoRsAkEn  York, SC, USA  803-817-2210\n"
    "Timothy Joseph Benifield  Lord_Timmy  Sharon, SC, USA  803-684-2222\n"
    "Adela L. Trudel  Delio  Charleston, SC, USA  843-452-0138\n"
).encode('utf-8')

MINUTES_TXT = (
    "DRAFT 1 - MINUTES - IFPA meeting by phone - Sunday March 7, 2004\n"
    "BOARD OF DIRECTORS MEETING Meeting chairperson: Steve Goldberg\n"
    "Time-keeper and note-taker: Tina Lewis\n"
).encode('utf-8')


def _rtf(body_text):
    return ('{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\f0\\fs20 '
           + body_text + '}').encode('latin-1')


def test_a_roster_export_is_caught_by_its_heading():
    assert fgf.looks_like_member_roster(ROSTER_TXT, 'ifpa/groups/x/roster.txt')


def test_a_roster_export_without_the_heading_is_still_caught_by_phone_density():
    # Below the match floor with the heading removed, so the fixture needs its
    # own rows: the real files this catches carried 23 and 51 phone numbers.
    rows = b''.join(f'Member {n}  alias{n}  Town, SC, USA  803-555-{n:04d}\n'.encode()
                    for n in range(8))
    assert fgf.looks_like_member_roster(rows, 'ifpa/groups/x/roster.txt')


def test_the_same_content_is_caught_wrapped_in_rtf():
    assert fgf.looks_like_member_roster(_rtf(ROSTER_TXT.decode()), 'ifpa/groups/x/roster.rtf')


def test_board_minutes_do_not_false_positive():
    assert not fgf.looks_like_member_roster(MINUTES_TXT, 'ifpa/groups/x/minutes.txt')


def test_a_single_phone_number_is_not_enough_on_its_own():
    body = b'Contact the treasurer at 555-123-4567 with any questions.'
    assert not fgf.looks_like_member_roster(body, 'ifpa/groups/x/note.txt')


def test_a_format_with_no_text_extraction_never_matches():
    # A PDF or spreadsheet is not scanned; it is neither a false catch nor a
    # false clear, since is_private's metadata tests still apply to it
    # unchanged. This only pins that the absence of a reader does not crash.
    assert not fgf.looks_like_member_roster(ROSTER_TXT, 'ifpa/groups/x/roster.pdf')


def test_the_real_recovered_files_from_this_session_still_match():
    custody_root = fgf.CUSTODY / 'www.footbag.org'
    ga = custody_root / 'ifpa' / 'groups' / 'SOUF' / 'ga member.txt'
    sc = custody_root / 'ifpa' / 'groups' / 'SOUF' / 'sc mem.rtf'
    if not (ga.is_file() and sc.is_file()):
        return
    assert fgf.looks_like_member_roster(ga.read_bytes(), str(ga))
    assert fgf.looks_like_member_roster(sc.read_bytes(), str(sc))
