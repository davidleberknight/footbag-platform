"""Content-exclusion contract for the mirror crawler: an operator-supplied
exclusion list keeps committee-scoped and private-group legacy content out of
the capture, network modes refuse to run without the list, and the
enforcement sweep removes already-captured excluded artifacts from an
existing tree while keeping crawl state consistent.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_content_exclusions.py -v
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script'] = mirror_script
spec.loader.exec_module(mirror_script)


@pytest.fixture
def excl(monkeypatch):
    entries = frozenset({
        'ifpa/groups/euros05/program_draft1.doc',
        'ifpa/groups/efc/IMG_0919.JPG',
        'groups/showfile/208',
        'groups/listfiles/88',
        'groups/list/fools',
    })
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS', entries)
    return entries


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """Isolated mirror tree + progress file + fresh crawl state."""
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'mirror_state',
                        mirror_script.MirrorState())
    www = mirror_dir / 'www.footbag.org'
    www.mkdir(parents=True)
    return www


def _touch(root: Path, rel: str, content: bytes = b'x') -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content)
    return p


# ----- Predicate semantics -----

def test_exact_path_is_excluded(excl):
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc')


def test_descendants_of_an_entry_are_excluded(excl):
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/showfile/208/index.html')


def test_sibling_with_longer_id_is_not_excluded(excl):
    # 'groups/showfile/208' must never swallow 'groups/showfile/2081'.
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/showfile/2081')
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/listfiles/8')


def test_percent_encoded_url_matches_decoded_entry(monkeypatch):
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS',
                        frozenset({'ifpa/groups/woc/WOC Structure & Purpose.doc'}))
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/ifpa/groups/woc/WOC%20Structure%20%26%20Purpose.doc')


def test_query_string_does_not_defeat_exclusion(excl):
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/list/fools?Mode=popup')


def test_no_list_loaded_excludes_nothing():
    assert mirror_script.CONTENT_EXCLUSIONS == frozenset()
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/showfile/208')


# ----- List loading -----

def test_loader_skips_comments_and_normalizes(tmp_path):
    f = tmp_path / 'exclusions.txt'
    f.write_text('# comment\n\n/groups/list/fools/\n'
                 'ifpa/groups/woc/WOC%20Structure%20%26%20Purpose.doc\n')
    entries = mirror_script.load_content_exclusions(str(f))
    assert entries == frozenset({
        'groups/list/fools',
        'ifpa/groups/woc/WOC Structure & Purpose.doc',
    })


def test_loader_rejects_empty_list(tmp_path):
    f = tmp_path / 'exclusions.txt'
    f.write_text('# only a comment\n')
    with pytest.raises(ValueError):
        mirror_script.load_content_exclusions(str(f))


# ----- Crawl gates -----

def test_excluded_url_is_out_of_scope(excl):
    assert not mirror_script.is_in_scope(
        'http://www.footbag.org/groups/showfile/208')
    assert mirror_script.is_in_scope(
        'http://www.footbag.org/groups/showfile/2081')


def test_fetch_refuses_excluded_url_without_network(excl):
    resp, final_url = mirror_script.fetch(
        'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc')
    assert resp is None and final_url is None


# ----- Network modes require the list -----

def test_crawl_without_exclusion_list_refuses_to_start(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py', 'someone'])
    with pytest.raises(SystemExit) as e:
        mirror_script.main()
    assert '--exclusion-list' in str(e.value)


def test_sweep_mode_requires_the_list_too(monkeypatch):
    monkeypatch.setattr(sys, 'argv',
                        ['create_mirror_footbag_org.py', '--apply-exclusions-only'])
    with pytest.raises(SystemExit) as e:
        mirror_script.main()
    assert '--exclusion-list' in str(e.value)


# ----- Enforcement sweep -----

def _build_populated_tree(www: Path):
    excluded_doc = _touch(www, 'ifpa/groups/euros05/program_draft1.doc')
    converted_img = _touch(www, 'ifpa/groups/efc/IMG_0919.jpg')
    sidecar = _touch(www, 'ifpa/groups/efc/IMG_0919.jpg.sanitized', b'')
    excluded_page = _touch(www, 'groups/showfile/208/index.html')
    kept_page = _touch(www, 'groups/showfile/2081/index.html')
    kept_doc = _touch(www, 'ifpa/groups/efc/EFC-public.doc')
    return excluded_doc, converted_img, sidecar, excluded_page, kept_page, kept_doc


def test_sweep_dry_run_deletes_nothing(excl, tree):
    paths = _build_populated_tree(tree)
    removed = mirror_script.apply_exclusions_sweep(dry_run=True)
    assert removed == 4
    assert all(p.exists() for p in paths)


def test_sweep_removes_artifacts_and_prunes_state(excl, tree):
    (excluded_doc, converted_img, sidecar,
     excluded_page, kept_page, kept_doc) = _build_populated_tree(tree)

    st = mirror_script.mirror_state
    st.visited = {
        'http://www.footbag.org/groups/showfile/208',
        'http://www.footbag.org/groups/showfile/2081',
    }
    st.queue = ['http://www.footbag.org/groups/list/fools',
                'http://www.footbag.org/clubs/']
    st.url_depth = {u: 1 for u in st.queue}
    st.skipped_videos = {
        'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc': {
            'url': 'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc'},
        'http://www.footbag.org/gallery/clip.mpg': {
            'url': 'http://www.footbag.org/gallery/clip.mpg'},
    }
    st.sitemap = [str(excluded_doc), str(kept_doc)]
    st.content_hashes = {'h1': str(excluded_page), 'h2': str(kept_page)}
    st.save_progress()

    removed = mirror_script.apply_exclusions_sweep()
    assert removed == 4
    assert not excluded_doc.exists()
    assert not converted_img.exists()
    assert not sidecar.exists()
    assert not excluded_page.exists()
    assert not excluded_page.parent.exists()  # emptied directory pruned
    assert kept_page.exists() and kept_doc.exists()

    data = json.loads(Path(mirror_script.PROGRESS_FILE).read_text())
    assert data['visited'] == ['http://www.footbag.org/groups/showfile/2081']
    assert data['queue'] == ['http://www.footbag.org/clubs/']
    assert list(data['skipped_videos']) == ['http://www.footbag.org/gallery/clip.mpg']
    assert data['sitemap'] == [str(kept_doc)]
    assert data['content_hashes'] == {'h2': str(kept_page)}


def test_sweep_is_idempotent(excl, tree):
    _build_populated_tree(tree)
    assert mirror_script.apply_exclusions_sweep() == 4
    assert mirror_script.apply_exclusions_sweep() == 0


def test_sweep_maps_original_media_extension_to_converted_artifacts(excl, tree):
    # The exclusion entry carries the legacy URL's original extension; on disk
    # the crawler stored the converted name plus its sanitization sidecar.
    converted = _touch(tree, 'ifpa/groups/efc/IMG_0919.jpg')
    sidecar = _touch(tree, 'ifpa/groups/efc/IMG_0919.jpg.sanitized', b'')
    assert mirror_script.apply_exclusions_sweep() == 2
    assert not converted.exists() and not sidecar.exists()


def test_sweep_refuses_entries_escaping_the_tree(tree, monkeypatch):
    outside = tree.parent.parent / 'outside.txt'
    outside.write_bytes(b'x')
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS',
                        frozenset({'../../outside.txt'}))
    assert mirror_script.apply_exclusions_sweep() == 0
    assert outside.exists()


# The committed member-account exclusion list is hand-maintained, and two
# classes of entry would do silent damage if anyone ever added them. An entry
# matches everything beneath it, so a bare section name reaches the member
# profile pages, which are the part of the member section the archive exists to
# preserve. And the member-area landing pages have their body replaced by the
# static notice rather than being deleted, so listing them would make the sweep
# delete that notice every time it runs.

MEMBER_AREA_LIST = (
    Path(__file__).resolve().parent.parent / 'member_area_exclusions.txt'
)


def test_member_area_list_loads_and_is_not_empty():
    entries = mirror_script.load_content_exclusions(str(MEMBER_AREA_LIST))
    assert entries


def test_member_area_list_never_excludes_profiles_or_stylesheets():
    entries = mirror_script.load_content_exclusions(str(MEMBER_AREA_LIST))
    forbidden = {
        'members', 'members2',
        'members/profile', 'members2/profile',
        'members/html', 'members2/html',
    }
    assert not (entries & forbidden)


def test_member_area_list_never_excludes_a_page_the_notice_replaces():
    entries = mirror_script.load_content_exclusions(str(MEMBER_AREA_LIST))
    for rel_path in mirror_script.MEMBER_AREA_NOTICE_PAGES:
        page_path = Path(rel_path).as_posix()
        directory = str(Path(rel_path).parent.as_posix()).strip('/')
        assert page_path not in entries
        assert directory not in entries


def test_member_area_list_excludes_the_account_owned_forms():
    # The problem-report form and the event registration forms are pre-filled
    # with the signed-in member's contact details, so a crawl signed in as the
    # mirroring account captures that account's own e-mail and postal address.
    entries = mirror_script.load_content_exclusions(str(MEMBER_AREA_LIST))
    assert 'feedback/problem' in entries
    assert 'registration/register' in entries


def test_member_area_list_keeps_the_registration_summaries(monkeypatch):
    # The summaries are the archival record of who competed and carry no
    # account-owned contact data, so excluding the registration forms must not
    # reach them.
    entries = mirror_script.load_content_exclusions(str(MEMBER_AREA_LIST))
    assert 'registration' not in entries
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS', entries)
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/registration/regsummary/1146789209')
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/registration/register/1146789209')
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/feedback/problem/')


def test_member_area_list_leaves_a_profile_url_capturable(monkeypatch):
    entries = mirror_script.load_content_exclusions(str(MEMBER_AREA_LIST))
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS', entries)
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/members/profile/80697')
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/members2/profile/65052')
    assert mirror_script.is_excluded_url('http://www.footbag.org/members/list')
    # A sibling whose name merely starts with an excluded entry's name is not
    # caught: the match walks a URL's own path segments, never a text prefix.
    assert mirror_script.is_excluded_url('http://www.footbag.org/members/findme')
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/members/findings')


# A crawl runs signed in, so pages the legacy site pre-fills with the crawling
# account's own contact details arrive carrying that account's e-mail and
# postal address. A committed path list cannot be the whole guarantee: it can
# only name surfaces someone thought of, and the same profile is served under
# both a member alias and a numeric member id. The address the operator supplies
# at runtime is therefore also matched against captured bytes, refusing the page
# at save time and removing it from a tree an earlier crawl already populated.

ACCOUNT_ADDRESS = 'mirror-operator@example.org'


@pytest.fixture
def account(monkeypatch):
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', ACCOUNT_ADDRESS)
    return ACCOUNT_ADDRESS


def test_account_address_is_matched_whatever_the_case(account):
    assert mirror_script.page_carries_account_identity(
        b'<p>Mirror-Operator@Example.ORG</p>')


def test_account_address_is_matched_in_text_as_well_as_bytes(account):
    assert mirror_script.page_carries_account_identity(
        f'<p>{ACCOUNT_ADDRESS}</p>')


def test_an_ordinary_page_does_not_match(account):
    assert not mirror_script.page_carries_account_identity(
        b'<p>Results from the 1998 championships</p>')


def test_matching_is_inert_when_no_address_was_supplied(monkeypatch):
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', None)
    assert not mirror_script.page_carries_account_identity(
        f'<p>{ACCOUNT_ADDRESS}</p>'.encode())


def test_save_redacts_the_account_address_and_keeps_the_page(account, tree):
    # Refusing the page would throw away an entrant list to remove one address,
    # which is the wrong trade: the page is ordinary archive content.
    url = 'http://www.footbag.org/registration/listevent'
    mirror_script.save_content(
        url,
        f'<html><body><h1>Intermediate Singles</h1><p>{ACCOUNT_ADDRESS}</p></body></html>',
        is_html=True)
    saved = tree / 'registration/listevent/index.html'
    assert saved.exists()
    body = saved.read_text(encoding='utf-8')
    assert ACCOUNT_ADDRESS not in body
    assert 'Intermediate Singles' in body


def test_save_keeps_a_page_that_carries_no_account_address(account, tree):
    url = 'http://www.footbag.org/events/show/857852604'
    mirror_script.save_content(
        url, '<html><body>Spring Classic</body></html>', is_html=True)
    assert (tree / 'events/show/857852604/index.html').exists()


def test_sweep_removes_a_page_carrying_the_account_address(account, tree):
    carrier = _touch(tree, 'members/profile/4242/index.html',
                     f'<html><body>{ACCOUNT_ADDRESS}</body></html>'.encode())
    kept = _touch(tree, 'members/profile/4243/index.html',
                  b'<html><body>Another member</body></html>')
    removed = mirror_script.apply_exclusions_sweep()
    assert removed == 1
    assert not carrier.exists()
    assert kept.exists()


def test_sweep_dry_run_leaves_the_account_page_in_place(account, tree):
    carrier = _touch(tree, 'members/profile/4242/index.html',
                     f'<html><body>{ACCOUNT_ADDRESS}</body></html>'.encode())
    assert mirror_script.apply_exclusions_sweep(dry_run=True) == 1
    assert carrier.exists()


def test_sweep_without_an_address_cannot_remove_account_pages(monkeypatch, tree):
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', None)
    carrier = _touch(tree, 'members/profile/4242/index.html',
                     f'<html><body>{ACCOUNT_ADDRESS}</body></html>'.encode())
    assert mirror_script.apply_exclusions_sweep() == 0
    assert carrier.exists()


def test_crawl_run_enforces_the_exclusions_before_generating_pages(
        monkeypatch, tmp_path, account, tree):
    # The scrub is part of a normal crawl, not a separate command an operator
    # has to remember: fetch-time refusal only governs what the current run
    # captured, so a tree carried forward from an earlier crawl is swept once
    # the queue drains. It runs before the generated pages are built, so those
    # never link something the sweep removed, and before the tree is published.
    order = []

    listfile = tmp_path / 'exclusions.txt'
    listfile.write_text('registration/register\n')

    monkeypatch.setattr(sys, 'argv', [
        'create_mirror_footbag_org.py', 'operator@example.org',
        '--exclusion-list', str(listfile),
    ])
    monkeypatch.setattr(mirror_script, 'resolve_password', lambda _p: 'x')
    monkeypatch.setattr(mirror_script, 'login', lambda: None)
    monkeypatch.setattr(mirror_script, 'verify_authenticated_session', lambda: True)
    monkeypatch.setattr(mirror_script, 'load_seed_urls', lambda _p: [])
    monkeypatch.setattr(mirror_script, 'enqueue_seed_urls', lambda _u: 0)
    monkeypatch.setattr(mirror_script, 'crawl',
                        lambda _s: order.append('crawl'))
    monkeypatch.setattr(mirror_script, 'apply_exclusions_sweep',
                        lambda *a, **k: order.append('sweep'))
    monkeypatch.setattr(mirror_script, 'generate_reachability_pages',
                        lambda *a, **k: order.append('generate'))
    monkeypatch.setattr(mirror_script, 'create_root_index', lambda: None)
    monkeypatch.setattr(mirror_script, 'save_sitemap', lambda: None)
    monkeypatch.setattr(mirror_script, 'save_redirect_map', lambda: None)
    monkeypatch.setattr(mirror_script, 'print_stats', lambda: None)
    monkeypatch.setattr(mirror_script.robot_checker, 'save_cache', lambda: None)

    mirror_script.main()

    assert order == ['crawl', 'sweep', 'generate']


# The member-account exclusions apply to every run, named or not. A crawl runs
# signed in, so those surfaces render the crawling account's own e-mail and
# postal address into pages every member of the archive can read; a command that
# names only the committee-scoped list must not silently drop them.

def _run_main_and_capture_exclusions(monkeypatch, argv):
    loaded = {}
    real_crawl = mirror_script.crawl

    def stop_after_setup(_start_urls):
        loaded['entries'] = mirror_script.CONTENT_EXCLUSIONS
        raise SystemExit('captured')

    monkeypatch.setattr(sys, 'argv', argv)
    monkeypatch.setattr(mirror_script, 'resolve_password', lambda _p: 'x')
    monkeypatch.setattr(mirror_script, 'login', lambda: None)
    monkeypatch.setattr(mirror_script, 'verify_authenticated_session', lambda: True)
    monkeypatch.setattr(mirror_script, 'load_seed_urls', lambda _p: [])
    monkeypatch.setattr(mirror_script, 'enqueue_seed_urls', lambda _u: 0)
    monkeypatch.setattr(mirror_script, 'crawl', stop_after_setup)
    try:
        with pytest.raises(SystemExit):
            mirror_script.main()
    finally:
        monkeypatch.setattr(mirror_script, 'crawl', real_crawl)
    return loaded['entries']


def test_member_account_exclusions_apply_without_being_named(
        monkeypatch, tmp_path, tree):
    other = tmp_path / 'committee.txt'
    other.write_text('groups/showfile/208\n')
    entries = _run_main_and_capture_exclusions(monkeypatch, [
        'create_mirror_footbag_org.py', 'operator@example.org',
        '--exclusion-list', str(other),
    ])
    assert 'groups/showfile/208' in entries
    assert 'members/account' in entries
    assert 'registration/register' in entries


def test_naming_the_member_account_list_as_well_changes_nothing(
        monkeypatch, tmp_path, tree):
    other = tmp_path / 'committee.txt'
    other.write_text('groups/showfile/208\n')
    once = _run_main_and_capture_exclusions(monkeypatch, [
        'create_mirror_footbag_org.py', 'operator@example.org',
        '--exclusion-list', str(other),
    ])
    twice = _run_main_and_capture_exclusions(monkeypatch, [
        'create_mirror_footbag_org.py', 'operator@example.org',
        '--exclusion-list', str(other),
        '--exclusion-list', str(MEMBER_AREA_LIST),
    ])
    assert once == twice


# The legacy registration pages open with the signed-in member's own contact
# block: name, postal address, e-mail, member id and gender, in a small table of
# its own above the content the page exists for. A crawl runs signed in, so that
# is the crawling account's data on every such page. The block goes and the page
# stays, because an event's entrant list is ordinary archive content.

from bs4 import BeautifulSoup as _Soup

CONTACT_BLOCK = (
    '<html><body>'
    '<h1>Intermediate Singles Freestyle</h1>'
    '<table><tr><td>Name:</td><td><b>A Member</b></td><td></td>'
    '<td>Address:</td><td><b>17 Somewhere, New Zealand mirror-operator@example.org</b>'
    '<br/><a href="/members/editprofile?u=11985">update your contact info...</a></td></tr>'
    '<tr><td>Member ID:</td><td>11985</td></tr>'
    '<tr><td>Gender:</td><td>Male</td></tr></table>'
    '<table><tr><td>Entrant</td><td>Placing</td></tr>'
    '<tr><td>Somebody Else</td><td>1</td></tr></table>'
    '</body></html>')


def test_contact_block_is_removed_and_the_page_survives():
    soup = _Soup(CONTACT_BLOCK, 'html.parser')
    removed = mirror_script.scrub_account_contact_block(soup)
    text = soup.get_text(' ', strip=True)
    assert removed == 1
    assert 'mirror-operator@example.org' not in text
    assert '17 Somewhere' not in text
    assert 'Intermediate Singles Freestyle' in text
    assert 'Somebody Else' in text          # the entrant list is why the page exists


def test_a_profile_link_outside_a_contact_block_costs_only_the_link():
    # A page that merely links to profile editing from inside a content table
    # must keep that table; only the block carrying the labels is the block.
    page = ('<html><body><table><tr><td>Results</td></tr>'
            '<tr><td><a href="/members/editprofile">update your contact info...</a>'
            '</td></tr><tr><td>Winner Name</td></tr></table></body></html>')
    soup = _Soup(page, 'html.parser')
    removed = mirror_script.scrub_account_contact_block(soup)
    text = soup.get_text(' ', strip=True)
    assert removed == 1
    assert 'update your contact info' not in text
    assert 'Results' in text and 'Winner Name' in text


def test_scrub_is_a_no_op_on_a_page_without_the_block():
    soup = _Soup('<html><body><p>Ordinary page</p></body></html>', 'html.parser')
    assert mirror_script.scrub_account_contact_block(soup) == 0


def test_redaction_leaves_the_rest_of_the_bytes_alone(account):
    out = mirror_script.redact_account_identity(
        f'<p>before {ACCOUNT_ADDRESS.upper()} after</p>')
    assert ACCOUNT_ADDRESS.lower() not in out.lower()
    assert 'before' in out and 'after' in out
