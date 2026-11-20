"""Group files in the archive: the members-only refusal, the rebuilt group file
lists, and the crawl's group-file recovery phase, in create_mirror_footbag_org.py.

The crawl account is not an active IFPA member, so the legacy site answered
every page that lists or describes a group file with its members-only page.
The crawl must never keep that page as content, must remove any copy an earlier
run kept, must recover every inventoried file through the recovery program and
fail when one is held nowhere, and must rebuild each public group's file list
from the inventory without ever naming a file members could not open.

All fixtures are local; no live-site access. Run from repo root:
    legacy_data/footbag_venv/bin/python -m pytest \\
        legacy_data/legacy_mirror/tests/test_mirror_group_capture.py -v
"""
import csv
import importlib.util
import os
import re
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_groups', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_groups'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
REPO_ROOT = Path(__file__).resolve().parents[3]

# The legacy site's members-only page, as the crawl account received it: the
# headline and the refusal sentence, broken across lines as the site sent them.
REFUSAL = ('<html><body><h2>IFPA Membership Required</h2>'
           '<p><b>IFPA Members Only!!</b></p>\n<p>Sorry, but the function you '
           'requested is only available to active\nIFPA members.</p>'
           '<a href="/members/upgrade">upgrade</a></body></html>')


@pytest.fixture
def state(tmp_path, monkeypatch):
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    # Every pass that prunes crawl state reads and writes this; never the real one.
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS', set())
    # No maintainer rulings unless a case writes its own; never the real record.
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_RULINGS', tmp_path / 'no-rulings.csv')
    return st


def _www():
    return Path(mirror_script._www_root())


def _page(rel, html):
    path = _www() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding='utf-8')
    return path


# --- the members-only refusal ---------------------------------------------

def test_the_refusal_matcher_needs_both_the_headline_and_the_sentence():
    # A page quoting the headline (a news item about members-only content) is
    # real content and must survive; the refusal itself must not.
    assert mirror_script._is_ifpa_refusal(REFUSAL)
    assert not mirror_script._is_ifpa_refusal(
        '<p>New: IFPA Members Only discounts at the store.</p>')
    assert not mirror_script._is_ifpa_refusal(
        '<p>This video is only available to active players.</p>')


class _Resp:
    def __init__(self, html, url):
        self.text = html
        self.content = html.encode('utf-8')
        self.headers = {'Content-Type': 'text/html'}
        self.url = url


def test_the_crawl_never_saves_the_refusal_or_follows_its_links(state, tmp_path,
                                                                monkeypatch):
    # A saved refusal publishes the site's sign-up nag where a group file's
    # page should be, and its upgrade link drags member chrome into the crawl.
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    gated = BASE + '/groups/showfile/271'
    ordinary = BASE + '/faq/show/1'
    site = {gated: REFUSAL, ordinary: '<html><body>An answer</body></html>'}
    fetched = []

    def fake_fetch(url):
        fetched.append(url)
        html = site.get(url)
        return (_Resp(html, url), url) if html is not None else (None, url)

    monkeypatch.setattr(mirror_script, 'fetch', fake_fetch)
    mirror_script.crawl([gated, ordinary])

    assert not Path(mirror_script.url_to_filepath(gated)).exists()
    assert Path(mirror_script.url_to_filepath(ordinary)).exists()
    assert state.stats['ifpa_refusal_pages_refused'] == 1
    assert (gated, 'ifpa-members-only') in state.refused_pages
    assert all('upgrade' not in url for url in fetched)


def test_a_held_re_encoded_image_is_never_requested_again(state, tmp_path, monkeypatch):
    # A refresh of the whole archive re-reads every page and queues every
    # picture again; requesting a picture already held and re-encoded downloads
    # its bytes only to throw them away, thousands of times over.
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    held = BASE + '/gallery/pics/a.jpg'
    held_gif = BASE + '/img/spacer.gif'
    raw_only = BASE + '/gallery/pics/b.jpg'   # on disk, but never re-encoded
    for url, suffix in ((held, '.jpg'), (held_gif, '.gif'), (raw_only, '.jpg')):
        path = Path(mirror_script.url_to_filepath(url)).with_suffix(suffix)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'x')
    for url in (held, held_gif):
        Path(str(Path(mirror_script.url_to_filepath(url))) + '.sanitized').write_bytes(b'')
    fetched = []
    monkeypatch.setattr(mirror_script, 'fetch',
                        lambda url: (fetched.append(url), (None, url))[1])
    mirror_script.crawl([held, held_gif, raw_only])
    assert fetched == [raw_only]


def test_the_sweep_removes_saved_refusals_and_nothing_else(state):
    # A resumed crawl never refetches a page it visited, so a refusal an earlier
    # run saved stays published unless the sweep removes it.
    refusal = _page('groups/showfile/271/index.html', REFUSAL)
    sets = _page('gallery/sets/index.html', REFUSAL)
    kept = _page('groups/list/14/index.html', '<html><body>Committee</body></html>')

    removed = mirror_script.sweep_saved_refusal_pages()

    assert sorted(removed) == sorted([refusal, sets])
    assert not refusal.exists() and not sets.exists()
    assert not refusal.parent.exists()          # the emptied detail folder too
    assert kept.exists()
    assert state.stats_run['refusal_pages_swept'] == 2


# --- the rebuilt group file lists ------------------------------------------

INVENTORY_FIELDS = ['FileID', 'FileVisible', 'FileGroupID', 'FileLocation', 'FileScope',
                    'CommitteeName', 'CommitteePublic', 'FileName', 'FileDescription',
                    'CommitteeKeyword']


def _inventory(tmp_path, rows):
    path = tmp_path / 'GROUP_FILES_INVENTORY.csv'
    with path.open('w', newline='', encoding='utf-8') as fh:
        writer = csv.writer(fh, lineterminator='\n')
        writer.writerow(INVENTORY_FIELDS)
        writer.writerows(rows)
    return path


def _held(rel, body=b'%PDF'):
    path = _www() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)


GROUP_ROWS = [
    # Marketing (14): two member-visible files held, one withheld by type,
    # one scoped, one hidden by its uploader, one not captured.
    ['271', '1', '14', '/ifpa/groups/marketing/IFPA Brochure-4.pdf', '0',
     'IFPA Marketing Committee', '1', 'IFPA Brochure', 'Tri-fold <b>brochure</b>',
     'marketing'],
    ['298', '1', '14', '/ifpa/groups/marketing/IFPA 5 year plan, 2006.pdf', '0',
     'IFPA Marketing Committee', '1', '5 year plan', '', 'marketing'],
    ['442', '1', '14', '/ifpa/groups/marketing/IFPA_LOGO_EPS.zip', '0',
     'IFPA Marketing Committee', '1', 'Logo pack', 'vector logos', 'marketing'],
    ['300', '1', '14', '/ifpa/groups/marketing/budget-SCOPED.pdf', '3',
     'IFPA Marketing Committee', '1', 'Budget-SCOPED', '', 'marketing'],
    ['302', '0', '14', '/ifpa/groups/marketing/draft-HIDDEN.pdf', '0',
     'IFPA Marketing Committee', '1', 'Draft-HIDDEN', '', 'marketing'],
    ['301', '1', '14', '/ifpa/groups/marketing/never-captured.pdf', '0',
     'IFPA Marketing Committee', '1', 'Not captured', '', 'marketing'],
    # Board (1): its captured page lists files, so it shows no empty-list line.
    ['445', '1', '1', '/ifpa/groups/directors/Future of Footbag.pdf', '0',
     'Board of Directors', '1', 'Future of Footbag', '', 'directors'],
    # A private committee's unscoped file, held on disk by mistake.
    ['500', '1', '99', '/ifpa/groups/fools/roster-PRIVATE.pdf', '0',
     'Private Group', '0', 'Roster-PRIVATE', '', 'fools'],
]

def _group_page(file_rows):
    # A captured group page as the site laid it out (groups/list/14 on the real
    # capture): a breadcrumb above, the group's own content cell holding its
    # roster and its file block, and the site menu in the cell beside it. The
    # file block is the heading row, the column headings, then either the
    # empty-list line or the rows of files it listed.
    return (
        '<html><head><title>IFPA Member Groups: Committee</title></head><body>'
        '<table><tr><td><a href="../../../index.html">FOOTBAG WORLDWIDE</a> : '
        '<a href="../index.html">Public Working Groups</a></td></tr></table>'
        '<table><tr><td bgcolor="#FFFFFF" valign="TOP" width="90%">'
        '<p>ROSTER-OF-MEMBERS</p>'
        '<table bgcolor="#e0e0e0"><tr><td colspan="3"><table><tr><td>'
        '<font color="#ffffff">Available Files:</font></td></tr></table></td></tr>'
        '<tr><td><font size="-1"><b>Name:</b></font></td><td>Owner:</td><td>Status:</td></tr>'
        + file_rows +
        '</table></td>'
        '<td bgcolor="#FFFFFF" valign="TOP" width="10%">'
        '<a href="../../../faq/index.html">FAQ</a></td></tr></table></body></html>')


def _file_row(name, href=None):
    # One listed file as the dead-link pass leaves it (no link) or as captured.
    shown = f'<a href="{href}">{name}</a>' if href else \
        f'<!--Mirror: link to a page not in the archive-->{name}'
    return (f'<tr><td><font size="-1">{shown}</font></td>'
            '<td><font size="-1">Owner</font></td><td>public</td></tr>')


EMPTY_LIST_PAGE = _group_page(
    '<tr><td><font size="-1"><i>no files in working area</i></font></td></tr>')
LISTED_FILES_PAGE = _group_page(_file_row('Minutes', '../../showfile/294/index.html'))


@pytest.fixture
def groups(state, tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, '_pre_write_state', {})
    for rel in ('ifpa/groups/marketing/IFPA Brochure-4.pdf',
                'ifpa/groups/marketing/IFPA 5 year plan, 2006.pdf',
                'ifpa/groups/marketing/IFPA_LOGO_EPS.zip',
                'ifpa/groups/marketing/budget-SCOPED.pdf',
                'ifpa/groups/marketing/draft-HIDDEN.pdf',
                'ifpa/groups/directors/Future of Footbag.pdf',
                'ifpa/groups/fools/roster-PRIVATE.pdf'):
        _held(rel)
    _page('groups/list/14/index.html', EMPTY_LIST_PAGE)
    _page('groups/list/marketing/index.html', EMPTY_LIST_PAGE)
    _page('groups/list/1/index.html', LISTED_FILES_PAGE)
    return _inventory(tmp_path, GROUP_ROWS)


def _hrefs(text):
    return re.findall(r'href="([^"]+)"', text)


def test_a_public_group_gets_a_page_listing_the_files_it_holds(groups):
    # A member reaching the group's page must find every file the archive kept
    # for it, each link leading to the file itself.
    written = mirror_script.generate_group_file_pages(groups)
    page = _www() / 'groups/home/14/index.html'
    assert written == [_www() / 'groups/home/1/index.html', page]
    text = page.read_text(encoding='utf-8')
    file_links = [h for h in _hrefs(text) if 'ifpa/groups/' in h]
    assert file_links == [
        '../../../ifpa/groups/marketing/IFPA%205%20year%20plan%2C%202006.pdf',
        '../../../ifpa/groups/marketing/IFPA%20Brochure-4.pdf',
    ]
    for href in file_links:
        target = mirror_script._resolve_local_ref(href, page.parent, _www())
        assert target is not None and Path(target).is_file(), href


def test_a_logo_pack_with_nothing_converted_offers_nothing(groups):
    # The pack itself is never served; listing it would offer members a file
    # the archive does not carry.
    mirror_script.generate_group_file_pages(groups)
    text = (_www() / 'groups/home/14/index.html').read_text(encoding='utf-8')
    assert 'Logo pack' not in text
    assert not any('IFPA_LOGO_EPS' in h for h in _hrefs(text))


def test_no_scoped_private_or_uncaptured_file_is_ever_named(groups):
    # A scoped file's name on a member page widens the audience its group
    # chose; a private group gets no page at all; an uncaptured file is a
    # promise the archive cannot keep.
    mirror_script.generate_group_file_pages(groups)
    every_page = ''.join(p.read_text(encoding='utf-8', errors='replace')
                         for p in (_www() / 'groups').rglob('*.html'))
    for name in ('SCOPED', 'PRIVATE', 'HIDDEN', 'Not captured', 'never-captured'):
        assert name not in every_page, name
    assert not (_www() / 'groups/home/99').exists()


def test_descriptions_are_escaped_not_rendered(groups):
    # Legacy descriptions carry stray markup; rendered, it breaks the page or
    # injects whatever the uploader typed.
    mirror_script.generate_group_file_pages(groups)
    text = (_www() / 'groups/home/14/index.html').read_text(encoding='utf-8')
    assert '&lt;b&gt;brochure&lt;/b&gt;' in text
    assert '<b>brochure</b>' not in text


def _cell_holding(text, needle):
    # The table cell a piece of the page sits in: a link outside the cell is
    # pushed above the whole table by the browser.
    start = text.rindex('<td', 0, text.index(needle))
    return text[start:text.index('</td>', start)]


@pytest.mark.parametrize('list_rel, group_id', [
    ('groups/list/14/index.html', '14'),
    ('groups/list/marketing/index.html', '14'),    # the same page at its keyword
    ('groups/list/1/index.html', '1'),             # a page that listed files
])
def test_each_copy_of_a_groups_page_links_its_file_list_once_in_place(
        groups, list_rel, group_id, state):
    # Other pages link a group by number and by keyword, so a copy without the
    # link leaves its readers no way to the files; a link outside the file
    # block reads as unrelated; twice, the page offers it twice after a rerun.
    list_page = _www() / list_rel
    href = f'../../home/{group_id}/index.html'
    mirror_script.generate_group_file_pages(groups)
    mirror_script.generate_group_file_pages(groups)
    text = list_page.read_text(encoding='utf-8')
    assert _hrefs(text).count(href) == 1
    anchor = 'no files in working area' if 'no files' in text else '<b>Name:</b>'
    assert href in _cell_holding(text, anchor)
    assert Path(mirror_script._resolve_local_ref(href, list_page.parent, _www())).is_file()
    assert state.run_warnings == []


def test_a_group_that_stops_qualifying_loses_its_page_and_the_links_to_it(
        groups, tmp_path, state):
    # A page left from an earlier run goes on naming files after they were
    # filed into custody or the committee was made private.
    mirror_script.generate_group_file_pages(groups)
    narrowed = [row for row in GROUP_ROWS if row[2] != '14']
    mirror_script.generate_group_file_pages(_inventory(tmp_path, narrowed))
    assert not (_www() / 'groups/home/14').exists()
    for rel in ('groups/list/14/index.html', 'groups/list/marketing/index.html'):
        text = (_www() / rel).read_text(encoding='utf-8')
        assert mirror_script.GROUP_FILES_LINK_MARKER not in text, rel
        assert 'no files in working area' in text, rel
    assert (_www() / 'groups/home/1/index.html').is_file()
    assert state.stats_run['group_pages_withdrawn'] == 1


def test_a_captured_page_at_a_group_address_is_never_withdrawn(groups, tmp_path):
    # Only pages this pass wrote are its to withdraw; a captured page there is
    # archive content.
    captured = _page('groups/home/77/index.html', '<html><body>Captured</body></html>')
    mirror_script.generate_group_file_pages(groups)
    assert captured.is_file()


def test_an_unreadable_publish_exclusion_list_links_nothing_and_fails(
        groups, tmp_path, monkeypatch, state):
    # Without the list nothing says which files the publish withholds; linking
    # by type alone would offer files the published archive does not carry.
    monkeypatch.setattr(mirror_script, 'ARCHIVE_PUBLISH_EXCLUSIONS', tmp_path / 'absent.txt')
    mirror_script.generate_group_file_pages(groups)
    text = (_www() / 'groups/home/14/index.html').read_text(encoding='utf-8')
    assert not any('ifpa/groups/' in h for h in _hrefs(text))
    assert 'IFPA Brochure' in text
    assert len(state.run_errors) == 1


def test_a_missing_inventory_is_a_warning_not_a_crash(state, tmp_path):
    # A machine without the private checkout still settles its capture, and
    # the report says the group pages were not rebuilt.
    assert mirror_script.generate_group_file_pages(tmp_path / 'absent.csv') == []
    assert any('publish_legacy_repo_data.py' in w for w in state.run_warnings)


def test_a_file_list_wears_its_groups_own_page_with_the_note_above_the_files(groups):
    # A rebuilt list in a bare stylesheet reads as a page from another site; one
    # whose breadcrumb still points where the group page's did leads nowhere;
    # one keeping the captured roster shows it twice; one without the note
    # passes itself off as a page the old site showed.
    mirror_script.generate_group_file_pages(groups)
    page = _www() / 'groups/home/14/index.html'
    text = page.read_text(encoding='utf-8')
    hrefs = _hrefs(text)
    for href, target in (('../../list/index.html', 'groups/list/index.html'),
                         ('../../../faq/index.html', 'faq/index.html'),
                         ('../../../index.html', 'index.html')):
        assert href in hrefs, href
        assert Path(os.path.normpath(page.parent / href)) == _www() / target
    note = f'id="{mirror_script.GROUP_FILES_NOTE_ID}"'
    files = f'id="{mirror_script.GROUP_FILES_PAGE_MARKER}"'
    content = _cell_holding(text, files)
    assert note in content and files in content
    assert content.index(note) < content.index(files)
    assert 'ROSTER-OF-MEMBERS' not in text
    assert '<title>IFPA Member Groups: Committee</title>' in text


def test_a_file_list_with_no_captured_group_page_is_a_plain_page_and_says_so(
        groups, state):
    # With no captured page to dress it in, the list must still reach members,
    # and the report must say it does not match the site's look.
    (_www() / 'groups/list/14/index.html').unlink()
    mirror_script.generate_group_file_pages(groups)
    text = (_www() / 'groups/home/14/index.html').read_text(encoding='utf-8')
    assert '../../../global2/html/global.css' in _hrefs(text)
    assert f'id="{mirror_script.GROUP_FILES_NOTE_ID}"' in text
    assert [w for w in state.run_warnings if 'groups/home/14' in w] != []
    assert not any('groups/home/1:' in w for w in state.run_warnings)


# --- the names of privately held files ---------------------------------------

PRIVATE_ROWS = [
    # Board (1): minutes ruled into custody, a budget the recovery filed there,
    # and a public paper the archive serves.
    ['41', '1', '1', '/ifpa/groups/directors/minutes 2003.doc', '0',
     'Board of Directors', '1', 'Minutes 2003', '', 'directors'],
    ['31', '1', '1', '/ifpa/groups/directors/2004budget.xls', '0',
     'Board of Directors', '1', '2004budget.xls', '', 'directors'],
    ['445', '1', '1', '/ifpa/groups/directors/Future of Footbag.pdf', '0',
     'Board of Directors', '1', 'Future of Footbag', '', 'directors'],
]


@pytest.fixture
def private_files(state, tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, '_pre_write_state', {})
    rulings = tmp_path / 'PLACEMENT_RULINGS.csv'
    rulings.write_text('FileID,path,placement,reason\n41,,custody,minutes\n'
                       '445,,archive,public paper\n', encoding='utf-8')
    custody = tmp_path / 'custody'
    held = custody / 'ifpa/groups/directors/2004budget.xls'
    held.parent.mkdir(parents=True)
    held.write_bytes(b'x')
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_RULINGS', rulings)
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_CUSTODY_TREE', custody)
    rows = (_file_row('Minutes 2003') + _file_row('2004budget.xls')
            + _file_row('Future of Footbag', '../../../ifpa/groups/directors/x.pdf'))
    for rel in ('groups/list/1/index.html', 'groups/list/directors/index.html'):
        _page(rel, _group_page(rows))
    return _inventory(tmp_path, PRIVATE_ROWS)


def test_a_privately_held_files_name_leaves_every_copy_of_its_groups_page(
        private_files, state):
    # The minutes and finances are held privately; their names on a members'
    # page still tell every member what the board kept private, on the page
    # reached by number and on the one reached by keyword alike.
    assert mirror_script.drop_custody_file_rows(private_files) == 4
    for rel in ('groups/list/1/index.html', 'groups/list/directors/index.html'):
        text = (_www() / rel).read_text(encoding='utf-8')
        assert 'Minutes 2003' not in text, rel
        assert '2004budget.xls' not in text, rel
        assert 'Future of Footbag' in text, rel
        assert 'Available Files:' in text and 'ROSTER-OF-MEMBERS' in text, rel
    assert state.stats_run['custody_rows_removed'] == 4
    assert mirror_script.drop_custody_file_rows(private_files) == 0


@pytest.mark.parametrize('missing', ['GROUP_FILES_RULINGS', 'GROUP_FILES_CUSTODY_TREE'])
def test_without_the_rulings_or_custody_tree_no_page_changes_and_the_run_fails(
        private_files, state, tmp_path, monkeypatch, missing):
    # Without them nothing says which names are private: guessing either way
    # either keeps a private name or deletes a public file's row.
    monkeypatch.setattr(mirror_script, missing, tmp_path / 'absent')
    before = (_www() / 'groups/list/1/index.html').read_text(encoding='utf-8')
    assert mirror_script.drop_custody_file_rows(private_files) == 0
    assert (_www() / 'groups/list/1/index.html').read_text(encoding='utf-8') == before
    assert len(state.run_errors) == 1


def _rulings(tmp_path, monkeypatch, *rows):
    path = tmp_path / 'PLACEMENT_RULINGS.csv'
    path.write_text('FileID,path,placement,reason\n'
                    + ''.join(f'{fid},,{placement},ruled\n' for fid, placement in rows),
                    encoding='utf-8')
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_RULINGS', path)


def test_a_scoped_file_ruled_into_the_archive_is_listed_for_members(
        groups, tmp_path, monkeypatch):
    # The maintainer opened it to members; a list that still hides it leaves
    # the released file in the archive with nothing pointing at it.
    _rulings(tmp_path, monkeypatch, ('300', 'archive'))
    mirror_script.generate_group_file_pages(groups)
    text = (_www() / 'groups/home/14/index.html').read_text(encoding='utf-8')
    assert '../../../ifpa/groups/marketing/budget-SCOPED.pdf' in _hrefs(text)
    # Only the ruled file opens: the hidden one beside it stays unnamed.
    assert 'HIDDEN' not in text


def test_a_private_groups_file_ruled_into_the_archive_gets_a_page_in_the_directory_frame(
        groups, tmp_path, monkeypatch, state):
    # The old site never listed the private group, so it has no captured page
    # to dress the list in; a plain page would look like another site.
    _rulings(tmp_path, monkeypatch, ('500', 'archive'))
    directory = _page('groups/list/index.html', DIRECTORY_PAGE)
    mirror_script.generate_group_file_pages(groups)
    page = _www() / 'groups/home/99/index.html'
    text = page.read_text(encoding='utf-8')
    assert '../../../ifpa/groups/fools/roster-PRIVATE.pdf' in _hrefs(text)
    assert '<title>IFPA Member Groups: Private Group</title>' in text
    assert Path(os.path.normpath(page.parent / '../../list/index.html')) == directory
    assert not any('groups/home/99' in w for w in state.run_warnings)


DIRECTORY_PAGE = _group_page('').replace(
    '<p>ROSTER-OF-MEMBERS</p>',
    '<p><li><a href="1/index.html">Board of Directors</a>\n'
    '<p><li><a href="14/index.html">Marketing Committee</a>\n')


def test_a_group_the_old_site_never_listed_joins_the_directory_once_and_leaves_with_its_page(
        groups, tmp_path, monkeypatch):
    # With no captured page linking it, the released files are unreachable;
    # listed twice after a rerun, the directory shows the group twice; left
    # behind after the page is withdrawn, it links a missing page.
    _rulings(tmp_path, monkeypatch, ('500', 'archive'))
    directory = _page('groups/list/index.html', DIRECTORY_PAGE)
    mirror_script.generate_group_file_pages(groups)
    mirror_script.generate_group_file_pages(groups)
    text = directory.read_text(encoding='utf-8')
    hrefs = _hrefs(text)
    assert hrefs.count('../home/99/index.html') == 1
    assert hrefs.index('14/index.html') < hrefs.index('../home/99/index.html')
    assert Path(os.path.normpath(directory.parent / '../home/99/index.html')) \
        == _www() / 'groups/home/99/index.html'
    # A group with a captured page is reached from it, not added again.
    assert '../home/14/index.html' not in hrefs
    _rulings(tmp_path, monkeypatch)
    mirror_script.generate_group_file_pages(groups)
    assert not (_www() / 'groups/home/99').exists()
    assert directory.read_text(encoding='utf-8') == DIRECTORY_PAGE


def test_a_file_ruled_into_the_archive_keeps_its_name_on_its_groups_page(
        private_files, tmp_path, monkeypatch):
    # The custody copy stays after release; reading that copy as "private"
    # would strip the name of a file members can now open.
    rulings = mirror_script.GROUP_FILES_RULINGS
    rulings.write_text(rulings.read_text(encoding='utf-8') + '31,,archive,opened\n',
                       encoding='utf-8')
    assert mirror_script.drop_custody_file_rows(private_files) == 2
    text = (_www() / 'groups/list/1/index.html').read_text(encoding='utf-8')
    assert '2004budget.xls' in text and 'Minutes 2003' not in text


def test_the_group_files_page_lists_every_group_page_and_nothing_private(groups):
    # Members browsing the groups need one place to find every file the
    # archive kept; a link left pointing three folders up from two folders
    # down leads nowhere, and a private file named here undoes the custody.
    _page('groups/list/index.html', DIRECTORY_PAGE)
    mirror_script.generate_group_file_pages(groups)
    assert mirror_script.generate_group_files_index() == 2
    page = _www() / mirror_script.GROUP_FILES_INDEX_REL
    text = page.read_text(encoding='utf-8')
    hrefs = _hrefs(text)
    for href in ('../home/1/index.html', '../home/14/index.html',
                 '../../ifpa/groups/marketing/IFPA%20Brochure-4.pdf',
                 '../../ifpa/groups/directors/Future%20of%20Footbag.pdf'):
        assert href in hrefs, href
        target = mirror_script._resolve_local_ref(href, page.parent, _www())
        assert target is not None and Path(target).is_file(), href
    for name in ('SCOPED', 'PRIVATE', 'HIDDEN', 'Not captured'):
        assert name not in text, name
    assert f'id="{mirror_script.GROUP_FILES_NOTE_ID}"' in text
    assert '<title>IFPA Member Groups: Archived Group Files</title>' in text
    assert 'ROSTER-OF-MEMBERS' not in text and '../../../faq/index.html' in hrefs


def test_the_groups_directory_gets_the_button_once_above_the_list(groups):
    # Without the button the page is unreachable; twice after a rerun, the
    # directory shows it twice; below the list it lands among the entries
    # the directory's own additions are placed after.
    directory = _page('groups/list/index.html', DIRECTORY_PAGE.replace(
        '<p><li><a href="1/', '<b><font size="+2">All IFPA Working Groups:</font></b>'
        '<br/>\n<p><li><a href="1/', 1))
    mirror_script.generate_group_file_pages(groups)
    mirror_script.generate_group_files_index()
    mirror_script.generate_group_files_index()
    text = directory.read_text(encoding='utf-8')
    assert _hrefs(text).count('../files/index.html') == 1
    assert text.index('../files/index.html') < text.index('All IFPA Working Groups')
    assert Path(os.path.normpath(directory.parent / '../files/index.html')) \
        == _www() / mirror_script.GROUP_FILES_INDEX_REL


def test_an_earlier_unclickable_looking_link_is_replaced_by_a_plain_link(groups):
    # The first version drew the link as an orange box with no underline,
    # which readers did not take for a link; a directory carrying it must be
    # brought up to date, not left as it was because a link is already there.
    marker = mirror_script.GROUP_FILES_INDEX_LINK_MARKER
    old = (f'<p id="{marker}"><a href="../files/index.html" style="background:#FF9900;'
           'text-decoration:none">Archived Group Files</a></p>\n')
    directory = _page('groups/list/index.html', DIRECTORY_PAGE.replace(
        '<p><li><a href="1/', old + '<b><font size="+2">All IFPA Working Groups:</font></b>'
        '<br/>\n<p><li><a href="1/', 1))
    mirror_script.generate_group_file_pages(groups)
    mirror_script.generate_group_files_index()
    text = directory.read_text(encoding='utf-8')
    block = re.search(f'<p id="{marker}">.*?</p>', text, re.S).group(0)
    assert 'style=' not in block and 'text-decoration' not in block
    assert _hrefs(text).count('../files/index.html') == 1


def test_with_no_group_file_page_the_files_page_and_button_go(groups, tmp_path):
    # A page and button left behind after every group lost its files would
    # offer members an empty list, or a list naming files since made private.
    directory = _page('groups/list/index.html', DIRECTORY_PAGE.replace(
        '<p><li><a href="1/', '<b><font size="+2">All IFPA Working Groups:</font></b>'
        '<br/>\n<p><li><a href="1/', 1))
    original = directory.read_text(encoding='utf-8')
    mirror_script.generate_group_file_pages(groups)
    mirror_script.generate_group_files_index()
    mirror_script.generate_group_file_pages(_inventory(tmp_path, []))
    assert mirror_script.generate_group_files_index() == 0
    assert not (_www() / mirror_script.GROUP_FILES_INDEX_REL).exists()
    assert directory.read_text(encoding='utf-8') == original


def test_the_files_page_is_built_after_the_group_pages_everywhere_it_runs():
    # Built before them, it lists the previous run's pages; left out of a
    # sequence or the mode, that run publishes a stale or missing page.
    source = SCRIPT_PATH.read_text(encoding='utf-8')
    blocks = [source[source.index(s):source.index('\ndef ', source.index(s) + 1)]
              for s in ('def generate_reachability_pages(', 'def settle_for_publication(')]
    mode = source[source.index('if args.group_files_index_only:'):]
    blocks.append(mode[:mode.index('return')])
    for text in blocks:
        assert text.index('generate_group_file_pages()') \
            < text.index('generate_group_files_index()') \
            < text.index('insert_archive_banner()')


def test_private_names_go_before_the_lists_are_built_in_both_settle_sequences():
    # Reversed, a rebuilt list copies a group page still naming private files,
    # and the GROUPS menu on it is still dead.
    source = SCRIPT_PATH.read_text(encoding='utf-8')
    for start in ('def generate_reachability_pages(', 'def settle_for_publication('):
        at = source.index(start)
        text = source[at:source.index('\ndef ', at + 1)]
        assert text.index('relink_restored_nav_items()') \
            < text.index('drop_custody_file_rows()') \
            < text.index('generate_group_file_pages()') \
            < text.index('neutralize_dead_internal_links()'), start


def test_the_page_links_only_types_the_publisher_serves():
    # The served set here and the publisher's own are separate declarations; if
    # they drift, group pages link files the publish refuses or hides files it
    # serves.
    publisher = (REPO_ROOT / 'scripts' / 'publish-archive.sh').read_text(encoding='utf-8')
    block = publisher[publisher.index('find "$WWW_ROOT" -type f'):]
    block = block[:block.index('> "${KNOWN_LIST}.all"')]
    declared = {s.lower() for s in re.findall(r"! -iname '\*(\.[a-z0-9]+)'", block)}
    assert declared - {'.sanitized'} == set(mirror_script.ARCHIVE_SERVED_SUFFIXES)


# --- the recovery phase ----------------------------------------------------

def _stand_in(tmp_path, exit_status):
    script = tmp_path / 'fetch_stand_in.py'
    script.write_text(
        'import sys\n'
        'print("args:", " ".join(sys.argv[1:]))\n'
        'print("in the archive: 76, in custody: 275, gone from live: 0, held nowhere: 0")\n'
        f'sys.exit({exit_status})\n', encoding='utf-8')
    return script


@pytest.mark.parametrize('exit_status, errors', [(0, 0), (1, 1)])
def test_the_recovery_verdict_decides_the_crawl_verdict(state, tmp_path, monkeypatch,
                                                         caplog, exit_status, errors):
    # A crawl that reports success while a group file is held nowhere publishes
    # an archive missing it, and nobody looks again before the old site goes.
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_INVENTORY',
                        _inventory(tmp_path, GROUP_ROWS))
    monkeypatch.setattr(mirror_script, 'FETCH_GROUP_FILES', _stand_in(tmp_path, exit_status))
    caplog.set_level('INFO')
    assert mirror_script.run_group_file_fetch() == exit_status
    assert len(state.run_errors) == errors
    # The recovery files into this crawl's own tree, not a default one.
    assert f'--archive {mirror_script._www_root()}' in caplog.text
    assert 'held nowhere: 0' in state.stats_run['group_fetch']


def test_a_missing_inventory_fails_the_crawl(state, tmp_path, monkeypatch):
    # Without the inventory nothing is recovered, so the run cannot claim the
    # group files are complete.
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_INVENTORY', tmp_path / 'absent.csv')
    assert mirror_script.run_group_file_fetch() is None
    assert len(state.run_errors) == 1


def test_a_smoke_capped_crawl_skips_recovery(state, tmp_path, monkeypatch):
    # A short smoke crawl that downloads every group file is no longer short.
    monkeypatch.setattr(mirror_script, 'MAX_URLS', 50)
    monkeypatch.setattr(mirror_script, 'FETCH_GROUP_FILES', tmp_path / 'never-run.py')
    assert mirror_script.run_group_file_fetch() is None
    assert state.run_errors == []


def test_a_video_backfill_ends_by_settling_the_tree_for_publication(
        state, tmp_path, monkeypatch):
    # The backfill rewrites every page that refers to a video after the crawl
    # settled it; unless it settles again, those pages can publish without
    # their bands and nobody is reminded to run the settle by hand.
    order = []
    monkeypatch.setattr(mirror_script, 'resolve_password', lambda _p: 'x')
    monkeypatch.setattr(mirror_script, 'login', lambda: None)
    monkeypatch.setattr(mirror_script, 'verify_authenticated_session', lambda: True)
    monkeypatch.setattr(mirror_script, 'run_video_backfill',
                        lambda **kw: order.append('backfill'))
    monkeypatch.setattr(mirror_script, 'settle_for_publication',
                        lambda **kw: order.append(('settle', kw)))
    monkeypatch.setattr(mirror_script, 'print_stats', lambda: None)
    monkeypatch.setattr(mirror_script.robot_checker, 'save_cache', lambda: None)
    exclusions = tmp_path / 'exclusions.txt'
    exclusions.write_text('groups/showfile/208\n')
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py', 'someuser',
                                      '--video-backfill', '--exclusion-list', str(exclusions)])
    mirror_script.main()
    assert order == ['backfill', ('settle', {'load_manifest': False})]


def test_a_settle_only_run_applies_rulings_offline_and_warns_of_unfetched_files(
        state, tmp_path, monkeypatch, caplog):
    # A settle-only run has no network: it must still place every file by its
    # ruling, and say, without failing, that some files await a network crawl.
    monkeypatch.setattr(mirror_script, 'GROUP_FILES_INVENTORY',
                        _inventory(tmp_path, GROUP_ROWS))
    monkeypatch.setattr(mirror_script, 'FETCH_GROUP_FILES', _stand_in(tmp_path, 3))
    caplog.set_level('INFO')
    assert mirror_script.run_group_file_fetch(offline=True) == 3
    assert ' --offline' in caplog.text
    assert state.run_errors == []
    assert len(state.run_warnings) == 1


# --- the capture holds exactly what the archive serves -----------------------

def test_the_strip_removes_every_file_the_publish_would_not_upload(state):
    # A file the archive does not serve, left in the capture, is the "captured
    # but not served" state the maintainer ruled out.
    for rel in ('ifpa/groups/x/minutes.doc', 'media/458/Templates.psd', 'events/list.rss',
                'ifpa/groups/x/plan.pdf', 'gallery/a.jpg', 'gallery/a.jpg.sanitized',
                'faq/index.html'):
        _held(rel)
    removed = mirror_script.strip_unservable_artifacts()
    assert sorted(p.relative_to(_www().resolve()).as_posix() for p in removed) == [
        'events/list.rss', 'ifpa/groups/x/minutes.doc', 'media/458/Templates.psd']
    for kept in ('ifpa/groups/x/plan.pdf', 'gallery/a.jpg', 'gallery/a.jpg.sanitized',
                 'faq/index.html'):
        assert (_www() / kept).is_file(), kept


def test_a_group_page_lists_the_logos_converted_from_a_pack(state, tmp_path, monkeypatch):
    # The pack itself is held privately; without the converted images listed,
    # the Marketing page would offer members nothing for the logos.
    monkeypatch.setattr(mirror_script, '_pre_write_state', {})
    _held('ifpa/groups/marketing/IFPA_LOGO_EPS-IFPA_logo_vector.jpg', b'\xff\xd8\xff')
    _held('ifpa/groups/marketing/IFPA_LOGO_EPS-IFPA_logo_vector.jpg.sanitized', b'')
    rows = [['442', '1', '14', '/ifpa/groups/marketing/IFPA_LOGO_EPS.zip', '0',
             'IFPA Marketing Committee', '1', 'IFPA logo pack', '', 'marketing']]
    mirror_script.generate_group_file_pages(_inventory(tmp_path, rows))
    text = (_www() / 'groups/home/14/index.html').read_text(encoding='utf-8')
    assert [h for h in _hrefs(text) if 'ifpa/groups/' in h] == [
        '../../../ifpa/groups/marketing/IFPA_LOGO_EPS-IFPA_logo_vector.jpg']
    assert 'IFPA_LOGO_EPS.zip' not in text


def test_a_keyword_page_saved_in_other_case_still_gets_the_link(state, tmp_path, monkeypatch):
    # The export says SAFC, the capture saved safc: matched by exact case, the
    # copy other pages link would never point at the group's files.
    monkeypatch.setattr(mirror_script, '_pre_write_state', {})
    _held('ifpa/groups/SAFC/plan.pdf')
    _page('groups/list/safc/index.html', EMPTY_LIST_PAGE)
    rows = [['356', '1', '114', '/ifpa/groups/SAFC/plan.pdf', '0',
             'South American Footbag Committee', '1', 'Plan', '', 'SAFC']]
    mirror_script.generate_group_file_pages(_inventory(tmp_path, rows))
    text = (_www() / 'groups/list/safc/index.html').read_text(encoding='utf-8')
    assert _hrefs(text).count('../../home/114/index.html') == 1


# --- frame sites --------------------------------------------------------------

FRAMESET = (b'<html><head><meta charset="utf-8"><title>Worlds 2000</title></head>'
            b'<frameset cols="110,*"><frame name="menu" scrolling="no" src="menubar.html">'
            b'<frame name="main" src="mainwin.html"><noframes>old</noframes>'
            b'</frameset></html>')


def test_a_frame_site_becomes_an_ordinary_banded_page_with_its_panes(state, monkeypatch):
    # A frameset cannot carry the archive's bands, so the frame sites looked
    # unlike every other page; converted, they carry both and keep their panes.
    monkeypatch.setattr(mirror_script, '_pre_write_state', {})
    site = _www() / 'worlds2000/index.html'
    site.parent.mkdir(parents=True, exist_ok=True)
    site.write_bytes(FRAMESET)
    menu = _page('worlds2000/menubar.html', '<html><body>menu</body></html>')
    main = _page('worlds2000/mainwin.html', '<html><body>main</body></html>')
    pane_bytes = (menu.read_bytes(), main.read_bytes())

    assert mirror_script.convert_framesets() == [site]
    mirror_script.insert_archive_banner()

    raw = site.read_bytes()
    assert b'<frameset' not in raw.lower()
    assert raw.startswith(b'<html><head><meta charset="utf-8"><title>Worlds 2000</title>')
    assert len(mirror_script._HEADER_BAND_RE.findall(raw)) == 1
    assert len(mirror_script._FOOTER_BAND_RE.findall(raw)) == 1
    panes = re.findall(rb'<iframe [^>]*>', raw)
    assert [re.search(rb'name="([^"]*)"', p).group(1) for p in panes] == [b'menu', b'main']
    assert [re.search(rb'src="([^"]*)"', p).group(1) for p in panes] == [
        b'menubar.html', b'mainwin.html']
    assert b'flex:0 0 110px' in raw and b'flex:1 1 0' in raw
    # The pages shown inside the panes carry no band of their own.
    assert (menu.read_bytes(), main.read_bytes()) == pane_bytes
    # Converted once; a second pass finds nothing to do.
    assert mirror_script.convert_framesets() == []


def test_a_frame_layout_keeps_percentage_and_nested_pane_sizes(state):
    # The Worlds 98 site splits its window by rows, then by columns inside the
    # second row; lose a size and its title strip or menu takes half the screen.
    site = _www() / 'worlds98/index.html'
    site.parent.mkdir(parents=True, exist_ok=True)
    site.write_bytes(b'<html><head><title>W98</title></head>'
                     b'<frameset rows="20%,*"><frame name="head" src="head.html">'
                     b'<frameset cols="190,100%"><frame name="menu" src="menu.html">'
                     b'<frame name="content" src="content.html"></frameset></frameset></html>')
    mirror_script.convert_framesets()
    raw = site.read_bytes()
    # Outer column of two rows: 20% then the rest; inner row: 190px then the rest.
    assert re.findall(rb'flex(?:-direction)?:[^;"]+', raw) == [
        b'flex-direction:column', b'flex:0 0 20%', b'flex:1 1 0',
        b'flex-direction:row', b'flex:0 0 190px', b'flex:1 1 0']
