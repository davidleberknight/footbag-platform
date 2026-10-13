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


def test_an_earlier_capture_is_consulted_only_when_one_is_named(tmp_path, monkeypatch):
    # Without a named capture the lookup must fall through to fetching from the
    # site, not consult a path that exists only on one maintainer's machine; with
    # one, a file it holds is found there.
    monkeypatch.setattr(fgf, 'ARCHIVE', tmp_path / 'archive')
    monkeypatch.setattr(fgf, 'CUSTODY', tmp_path / 'custody')
    rel = 'ifpa/groups/x/minutes.txt'
    previous = tmp_path / 'previous'
    (previous / rel).parent.mkdir(parents=True)
    (previous / rel).write_bytes(MINUTES_TXT)
    monkeypatch.setattr(fgf, 'PREVIOUS', None)
    assert fgf.held(rel) is None
    monkeypatch.setattr(fgf, 'PREVIOUS', previous)
    assert fgf.held(rel) == 'previous capture'


INVENTORY_HEADER = ('FileID,FileVisible,FileGroupID,FileLocation,FileScope,'
                    'CommitteeName,CommitteePublic\n')


def test_routing_follows_scope_committee_visibility_and_the_exclusion_list(tmp_path,
                                                                          monkeypatch):
    # Any of the three tests marking a file private must send it to custody; a
    # public committee's unscoped file, or one whose committee is unknown, is
    # member-visible. A row with no location cannot be fetched and is skipped.
    inventory = tmp_path / 'GROUP_FILES_INVENTORY.csv'
    inventory.write_text(
        INVENTORY_HEADER
        + '1,1,12,/ifpa/groups/open/scoped.pdf,2,Open Group,1\n'
        + '2,1,5,/ifpa/groups/secret/a.txt,0,Secret Group,0\n'
        + '3,1,12,/ifpa/groups/open/public.pdf,0,Open Group,1\n'
        + '4,1,44,/ifpa/groups/gone/b.txt,0,,\n'
        + '5,1,12,/ifpa/groups/open/listed.pdf,0,Open Group,1\n'
        + '6,1,12,,0,Open Group,1\n', encoding='utf-8')
    monkeypatch.setattr(fgf, 'INVENTORY', inventory)
    rows = fgf.inventory()
    groups = fgf.committees(rows)
    exclusions = {'ifpa/groups/open/listed.pdf'}
    verdicts = {r['FileID']: fgf.is_private(r['FileLocation'].lstrip('/'), r, groups, exclusions)
                for r in rows}
    assert verdicts == {'1': True, '2': True, '3': False, '4': False, '5': True}
    assert '[Secret Group]' in fgf.note_for(rows[1], groups)
    assert '[unknown committee]' in fgf.note_for(rows[3], groups)


def test_a_missing_inventory_names_the_publish_step(tmp_path, monkeypatch):
    # Without the inventory there is nothing to route on; the operator must be
    # told which script writes it rather than handed a stack trace.
    monkeypatch.setattr(fgf, 'INVENTORY', tmp_path / 'absent.csv')
    try:
        fgf.inventory()
    except SystemExit as exc:
        assert 'publish_legacy_repo_data.py' in str(exc)
    else:
        raise AssertionError('a missing inventory was read as empty')


def test_the_real_recovered_files_from_this_session_still_match():
    custody_root = fgf.CUSTODY / 'www.footbag.org'
    ga = custody_root / 'ifpa' / 'groups' / 'SOUF' / 'ga member.txt'
    sc = custody_root / 'ifpa' / 'groups' / 'SOUF' / 'sc mem.rtf'
    if not (ga.is_file() and sc.is_file()):
        return
    assert fgf.looks_like_member_roster(ga.read_bytes(), str(ga))
    assert fgf.looks_like_member_roster(sc.read_bytes(), str(sc))
