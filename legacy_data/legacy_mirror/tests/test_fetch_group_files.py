"""The group-file recovery script: its content-level backstop and its run.

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
import csv
import importlib.util
import io
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote

import requests

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


# The recovery run end to end, against a stand-in for the live site. Each case
# owns its tree: an archive, a custody folder with its inventory and exclusion
# list, and the gone-from-live record, all under tmp_path.

class _Response:
    def __init__(self, body, status=200):
        self.content = body
        self.headers = {}
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f'{self.status_code}', response=self)


class _Site:
    """The live site: path -> bytes, or an HTTP status for a missing file.
    A path it does not know is a connection failure. Records every request."""

    def __init__(self, files):
        self.files = files
        self.requested = []
        self.headers = {}

    def get(self, url, timeout=None):
        rel = unquote(url[len(fgf.BASE):])
        self.requested.append(rel)
        answer = self.files.get(rel)
        if answer is None:
            raise requests.ConnectionError(f'{rel}: no route')
        if isinstance(answer, int):
            return _Response(b'', status=answer)
        return _Response(answer)


def _recovery_tree(tmp_path, monkeypatch, rows, site_files, rulings=()):
    custody = tmp_path / 'custody'
    custody.mkdir()
    with (custody / 'PLACEMENT_RULINGS.csv').open('w', newline='', encoding='utf-8') as fh:
        writer = csv.writer(fh, lineterminator='\n')
        writer.writerow(['FileID', 'path', 'placement', 'reason'])
        writer.writerows(rulings)
    monkeypatch.setattr(fgf, 'RULINGS', custody / 'PLACEMENT_RULINGS.csv')
    archive = tmp_path / 'archive'
    archive.mkdir()
    with (custody / 'GROUP_FILES_INVENTORY.csv').open('w', newline='', encoding='utf-8') as fh:
        writer = csv.writer(fh, lineterminator='\n')
        writer.writerow(['FileID', 'FileVisible', 'FileGroupID', 'FileLocation', 'FileScope',
                         'CommitteeName', 'CommitteePublic', 'FileName', 'FileDescription'])
        writer.writerows(rows)
    (custody / 'CRAWL_EXCLUSIONS.txt').write_text('# none\n', encoding='utf-8')
    monkeypatch.setattr(fgf, 'CUSTODY', custody)
    monkeypatch.setattr(fgf, 'ARCHIVE', archive)
    monkeypatch.setattr(fgf, 'PREVIOUS', None)
    monkeypatch.setattr(fgf, 'INVENTORY', custody / 'GROUP_FILES_INVENTORY.csv')
    monkeypatch.setattr(fgf, 'EXCLUSIONS', custody / 'CRAWL_EXCLUSIONS.txt')
    monkeypatch.setattr(fgf, 'GONE_FROM_LIVE', custody / 'GONE_FROM_LIVE.csv')
    monkeypatch.setattr(fgf, 'DELAY', 0)
    site = _Site(site_files)
    monkeypatch.setattr(fgf.requests, 'Session', lambda: site)
    return archive, custody, site


def _run(monkeypatch, *args):
    monkeypatch.setattr(sys, 'argv', ['fetch_group_files.py', *args])
    return fgf.main()


def _public(file_id, rel):
    return [file_id, '1', '14', '/' + rel, '0', 'Marketing Committee', '1', 'A file', '']


def test_a_file_held_nowhere_fails_the_run_and_every_one_is_named(tmp_path, monkeypatch,
                                                                   capsys):
    # An operator told the run passed while files are missing ships an archive
    # without them; a list cut short hides which ones. Twenty-five missing
    # files, more than any shortened listing would show.
    rels = [f'ifpa/groups/marketing/doc{n:02d}.pdf' for n in range(25)]
    _recovery_tree(tmp_path, monkeypatch,
                   [_public(str(100 + n), rel) for n, rel in enumerate(rels)], {})
    assert _run(monkeypatch) == 1
    out = capsys.readouterr().out
    # Only the closing list counts: the per-file failure lines above it name
    # each file too, but an operator reads the verdict at the end.
    closing = out[out.index('STILL HELD NOWHERE: 25'):]
    missing = [rel for rel in rels if rel not in closing]
    assert missing == [], f'not named in the closing check: {missing}'


def test_a_file_the_live_site_no_longer_serves_is_recorded_and_accounted_for(
        tmp_path, monkeypatch):
    # Without the record, a file deleted from the old site fails every run
    # forever and the check stops meaning anything; recorded, it is accounted for.
    rel = 'ifpa/groups/marketing/withdrawn.pdf'
    archive, custody, site = _recovery_tree(
        tmp_path, monkeypatch, [_public('300', rel)], {rel: 404})
    assert _run(monkeypatch) == 0
    with (custody / 'GONE_FROM_LIVE.csv').open(encoding='utf-8', newline='') as fh:
        recorded = list(csv.DictReader(fh))
    assert [(r['path'], r['http_status']) for r in recorded] == [(rel, '404')]
    assert recorded[0]['checked_on']
    assert not (archive / rel).exists()
    # A second run takes the record as the answer and asks the site nothing.
    site.requested.clear()
    assert _run(monkeypatch) == 0
    assert site.requested == []


def test_a_server_error_is_a_failure_not_a_gone_file(tmp_path, monkeypatch):
    # A file the site could not serve just now is not gone; recording it would
    # drop it from the archive for good.
    rel = 'ifpa/groups/marketing/flaky.pdf'
    _, custody, _ = _recovery_tree(tmp_path, monkeypatch, [_public('301', rel)], {rel: 503})
    assert _run(monkeypatch) == 1
    assert not (custody / 'GONE_FROM_LIVE.csv').exists()


def test_a_file_already_held_is_never_requested_again(tmp_path, monkeypatch):
    # A rerun that downloads what it holds repeats the whole recovery against
    # a site being retired, and could replace a kept copy with a changed one.
    rel = 'ifpa/groups/marketing/plan.pdf'
    archive, _, site = _recovery_tree(tmp_path, monkeypatch, [_public('298', rel)],
                                      {rel: b'%PDF-new'})
    (archive / rel).parent.mkdir(parents=True)
    (archive / rel).write_bytes(b'%PDF-kept')
    assert _run(monkeypatch) == 0
    assert site.requested == []
    assert (archive / rel).read_bytes() == b'%PDF-kept'


# A one-shape EPS logo, as a vector logo pack carries.
LOGO_EPS = (b'%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 40 20\n'
            b'newpath 0 0 moveto 40 0 lineto 40 20 lineto closepath fill\nshowpage\n')


def _logo_pack():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as pack:
        pack.writestr('IFPA_logo_vector.eps', LOGO_EPS)
        pack.writestr('IFPA_logo_vector_BW.eps', LOGO_EPS)
        pack.writestr('__MACOSX/._IFPA_logo_vector.eps', b'resource fork')
    return buffer.getvalue()


def test_a_logo_pack_ruled_for_conversion_is_served_as_images_and_held_privately(
        tmp_path, monkeypatch):
    # The pack is the only copy of the logos on a site being retired; the
    # archive serves images, not a zip nothing has looked inside.
    rel = 'ifpa/groups/marketing/IFPA_LOGO_EPS.zip'
    pack = _logo_pack()
    archive, custody, _ = _recovery_tree(
        tmp_path, monkeypatch, [_public('442', rel)], {rel: pack},
        rulings=[('442', '', 'convert-logo', 'logos as images')])
    assert _run(monkeypatch) == 0
    assert (custody / 'www.footbag.org' / rel).read_bytes() == pack
    assert not (archive / rel).exists()
    folder = archive / 'ifpa/groups/marketing'
    images = sorted(p.name for p in folder.iterdir())
    assert images == ['IFPA_LOGO_EPS-IFPA_logo_vector.jpg',
                      'IFPA_LOGO_EPS-IFPA_logo_vector.jpg.sanitized',
                      'IFPA_LOGO_EPS-IFPA_logo_vector_BW.jpg',
                      'IFPA_LOGO_EPS-IFPA_logo_vector_BW.jpg.sanitized']
    assert (folder / 'IFPA_LOGO_EPS-IFPA_logo_vector.jpg').read_bytes()[:3] == b'\xff\xd8\xff'


def test_a_dropped_file_leaves_the_capture_and_is_accounted_for(tmp_path, monkeypatch):
    # A dropped file left in the capture is served after the maintainer ruled it
    # out; one counted as missing fails every run forever.
    rel = 'ifpa/groups/marketing/old-form.pdf'
    stray = 'ifpa/groups/Event Resources/copy.pdf'
    archive, _, site = _recovery_tree(
        tmp_path, monkeypatch, [_public('146', rel)], {},
        rulings=[('146', '', 'drop', 'obsolete'), ('', stray, 'drop', 'stray copy')])
    for path in (rel, stray):
        (archive / path).parent.mkdir(parents=True, exist_ok=True)
        (archive / path).write_bytes(b'%PDF')
    assert _run(monkeypatch) == 0
    assert not (archive / rel).exists() and not (archive / stray).exists()
    assert site.requested == []


def test_a_file_ruled_private_moves_from_the_capture_to_custody(tmp_path, monkeypatch):
    # IFPA's own records were member-visible on the old site; the ruling, not
    # the metadata, decides that they leave the archive.
    rel = 'ifpa/groups/directors/finances.pdf'
    archive, custody, _ = _recovery_tree(
        tmp_path, monkeypatch, [_public('29', rel)], {},
        rulings=[('29', '', 'custody', "IFPA's own records")])
    (archive / rel).parent.mkdir(parents=True)
    (archive / rel).write_bytes(b'%PDF-finances')
    assert _run(monkeypatch) == 0
    assert not (archive / rel).exists()
    assert (custody / 'www.footbag.org' / rel).read_bytes() == b'%PDF-finances'


def test_a_member_visible_file_the_archive_cannot_serve_needs_a_ruling(
        tmp_path, monkeypatch, capsys):
    # Unruled, it would be fetched, stripped and fetched again on every run,
    # and nobody would ever decide where it belongs.
    rel = 'ifpa/groups/marketing/minutes.doc'
    _, _, site = _recovery_tree(tmp_path, monkeypatch, [_public('77', rel)], {rel: b'doc'})
    assert _run(monkeypatch) == 1
    assert 'NEEDS A RULING ' + rel in capsys.readouterr().out
    assert site.requested == []


def test_offline_applies_rulings_fetches_nothing_and_reports_what_is_missing(
        tmp_path, monkeypatch):
    # A settle-only run has no network; it must still apply every ruling, and
    # must not pass a capture that is missing files as complete.
    missing = 'ifpa/groups/marketing/brochure.pdf'
    dropped = 'ifpa/groups/marketing/form.pdf'
    archive, _, site = _recovery_tree(
        tmp_path, monkeypatch, [_public('271', missing), _public('146', dropped)],
        {missing: b'%PDF'}, rulings=[('146', '', 'drop', 'obsolete')])
    (archive / dropped).parent.mkdir(parents=True)
    (archive / dropped).write_bytes(b'%PDF')
    assert _run(monkeypatch, '--offline') == 3
    assert site.requested == []
    assert not (archive / dropped).exists()


def test_a_missing_or_unreadable_rulings_record_refuses(tmp_path, monkeypatch):
    # Run without the rulings, every file ruled private would be filed in the
    # member archive by its metadata alone.
    _recovery_tree(tmp_path, monkeypatch, [], {})
    monkeypatch.setattr(fgf, 'RULINGS', tmp_path / 'absent.csv')
    try:
        _run(monkeypatch)
    except SystemExit as exc:
        assert 'PLACEMENT_RULINGS' in str(exc) or 'absent.csv' in str(exc)
    else:
        raise AssertionError('ran without its rulings')
    bad = tmp_path / 'bad.csv'
    bad.write_text('FileID,path,placement,reason\n7,,publish,typo\n', encoding='utf-8')
    monkeypatch.setattr(fgf, 'RULINGS', bad)
    try:
        _run(monkeypatch)
    except SystemExit as exc:
        assert "'publish'" in str(exc)
    else:
        raise AssertionError('accepted an unknown placement')


def test_a_kept_copy_is_filed_even_after_the_site_was_recorded_as_gone(tmp_path,
                                                                       monkeypatch):
    # The gone record says the site stopped serving the file, not that no copy
    # exists; skipping the earlier capture's copy loses the only one there is.
    rel = 'ifpa/groups/marketing/withdrawn.pdf'
    archive, custody, _ = _recovery_tree(tmp_path, monkeypatch, [_public('300', rel)],
                                         {rel: 404})
    (custody / 'GONE_FROM_LIVE.csv').write_text(
        f'path,http_status,checked_on\n{rel},404,2026-11-01\n', encoding='utf-8')
    previous = tmp_path / 'previous'
    (previous / rel).parent.mkdir(parents=True)
    (previous / rel).write_bytes(b'%PDF-kept')
    assert _run(monkeypatch, '--previous', str(previous)) == 0
    assert (archive / rel).read_bytes() == b'%PDF-kept'


def test_a_file_its_uploader_hid_goes_to_custody_not_the_archive(tmp_path, monkeypatch):
    # The legacy site showed a hidden file only to its owner, the group's owner
    # and administrators; filing it in the member archive shows it to every member.
    rel = 'ifpa/groups/marketing/draft.pdf'
    row = _public('302', rel)
    row[1] = '0'
    archive, custody, _ = _recovery_tree(tmp_path, monkeypatch, [row], {rel: b'%PDF-draft'})
    assert _run(monkeypatch) == 0
    assert not (archive / rel).exists()
    assert (custody / 'www.footbag.org' / rel).read_bytes() == b'%PDF-draft'


def test_member_visible_files_land_in_the_tree_the_crawl_names(tmp_path, monkeypatch):
    # The crawl runs this against its own capture; a file filed into another
    # tree is missing from the capture that gets published.
    rel = 'ifpa/groups/marketing/brochure one.pdf'
    default_archive, _, _ = _recovery_tree(tmp_path, monkeypatch, [_public('271', rel)],
                                           {rel: b'%PDF-brochure'})
    named = tmp_path / 'crawl-tree'
    named.mkdir()
    assert _run(monkeypatch, '--archive', str(named)) == 0
    assert (named / rel).read_bytes() == b'%PDF-brochure'
    assert not (default_archive / rel).exists()


def _held_privately(custody, rel, body):
    path = custody / 'www.footbag.org' / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)


def test_a_scoped_file_ruled_into_the_archive_moves_from_custody_to_the_archive(
        tmp_path, monkeypatch, capsys):
    # The maintainer opened it to members; left in custody it is never served,
    # and a second copy left behind gives the file two homes.
    rel = 'ifpa/groups/directors/rules v10.pdf'
    row = _public('281', rel)
    row[4] = '1'                                    # scoped to its group
    archive, custody, site = _recovery_tree(
        tmp_path, monkeypatch, [row], {}, rulings=[('281', '', 'archive', 'opened')])
    _held_privately(custody, rel, b'%PDF-rules')
    assert _run(monkeypatch, '--offline') == 0
    assert (archive / rel).read_bytes() == b'%PDF-rules'
    assert not (custody / 'www.footbag.org' / rel).exists()
    assert site.requested == []
    out = capsys.readouterr().out
    assert 'released from custody by ruling       : 1' in out
    assert 'custody copies removed by ruling      : 1' in out


def test_a_custody_copy_that_differs_from_the_archive_copy_is_kept(tmp_path, monkeypatch):
    # Removing the only copy of different bytes loses them; the history is the
    # backstop for a removal the run meant, not for one it never checked.
    rel = 'ifpa/groups/directors/plan.pdf'
    row = _public('295', rel)
    row[4] = '1'
    archive, custody, _ = _recovery_tree(
        tmp_path, monkeypatch, [row], {}, rulings=[('295', '', 'archive', 'opened')])
    _held_privately(custody, rel, b'%PDF-custody')
    (archive / rel).parent.mkdir(parents=True)
    (archive / rel).write_bytes(b'%PDF-archive')
    assert _run(monkeypatch, '--offline') == 0
    assert (custody / 'www.footbag.org' / rel).read_bytes() == b'%PDF-custody'


def test_a_dropped_files_custody_copy_is_removed_and_others_are_kept(tmp_path, monkeypatch):
    # A dropped file is held nowhere; its copy left in custody is a private
    # record nobody ruled to keep. An unruled private file beside it stays.
    dropped, kept = 'ifpa/groups/chaos/banner.gif', 'ifpa/groups/chaos/budget.pdf'
    rows = [_public('113', dropped), _public('283', kept)]
    for row in rows:
        row[4] = '1'
    _, custody, _ = _recovery_tree(
        tmp_path, monkeypatch, rows, {}, rulings=[('113', '', 'drop', 'private file')])
    _held_privately(custody, dropped, b'GIF')
    _held_privately(custody, kept, b'%PDF')
    assert _run(monkeypatch, '--offline') == 0
    assert not (custody / 'www.footbag.org' / dropped).exists()
    assert (custody / 'www.footbag.org' / kept).is_file()


def test_an_unruled_scoped_file_in_custody_stays_there(tmp_path, monkeypatch):
    # Without the ruling the metadata decides, and it keeps the file private.
    rel = 'ifpa/groups/directors/minutes.pdf'
    row = _public('41', rel)
    row[4] = '1'
    archive, custody, _ = _recovery_tree(tmp_path, monkeypatch, [row], {})
    _held_privately(custody, rel, b'%PDF-minutes')
    assert _run(monkeypatch, '--offline') == 0
    assert not (archive / rel).exists()


def test_a_file_ruled_into_the_archive_that_reads_as_a_roster_is_held_back(
        tmp_path, monkeypatch, capsys):
    # A ruling made from a name and a description cannot see a phone list
    # inside; publishing it puts members' contact details in front of everyone.
    rel = 'ifpa/groups/SOUF/members.txt'
    row = _public('141', rel)
    row[4] = '1'
    archive, custody, _ = _recovery_tree(
        tmp_path, monkeypatch, [row], {}, rulings=[('141', '', 'archive', 'opened')])
    _held_privately(custody, rel, ROSTER_TXT)
    assert _run(monkeypatch, '--offline') == 1
    assert not (archive / rel).exists()
    assert f'HELD BACK {rel}' in capsys.readouterr().out


def test_a_file_ruled_into_the_archive_of_a_type_it_cannot_serve_is_held_back(
        tmp_path, monkeypatch, capsys):
    # The capture holds only what the archive serves; a Word file copied in is
    # stripped again on the next settle and the ruling never takes effect.
    rel = 'ifpa/groups/directors/plan.doc'
    row = _public('383', rel)
    row[4] = '1'
    archive, custody, _ = _recovery_tree(
        tmp_path, monkeypatch, [row], {}, rulings=[('383', '', 'archive', 'opened')])
    _held_privately(custody, rel, b'doc bytes')
    assert _run(monkeypatch, '--offline') == 1
    assert not (archive / rel).exists()
    assert f'HELD BACK {rel}' in capsys.readouterr().out
