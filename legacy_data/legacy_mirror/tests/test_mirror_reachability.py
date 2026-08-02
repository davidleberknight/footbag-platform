"""Reachability generation in create_mirror_footbag_org.py.

The archive serves statically, so a captured page not on a link-chain from the
landing page is unreachable. At the end of every crawl the crawler generates,
from what is actually on disk: complete per-area browse indexes (seed list
intersected with captured files, paginated), one topic-grouped Archive
Directory page (content areas, World Championships across both trees
interleaved chronologically, microsites), and a native-looking card on the
homepage pointing at the Directory. No generated link may point at a missing
file, everything is JavaScript-free, and the homepage card is inserted exactly
once across repeated runs.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_reachability.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_reach', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_reach'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'SEEDS_DIR', str(tmp_path / 'seeds'))
    (tmp_path / 'seeds').mkdir()
    return tmp_path


def _capture(url, title):
    """Write a minimal captured page for url and return its path."""
    path = Path(mirror_script.url_to_filepath(url))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<html><head><title>{title}</title></head>'
                    f'<body>x</body></html>', encoding='utf-8')
    return path


def _seed(env, name, urls):
    (env / 'seeds' / name).write_text('\n'.join(urls) + '\n', encoding='utf-8')


def _www(env):
    return env / 'mirror' / 'www.footbag.org'


def test_listing_holds_only_pages_nothing_else_links(env):
    # The page exists to surface what browsing cannot reach. A captured page that
    # some other page links is reachable already and does not belong on it.
    _seed(env, 'clubs.txt', [BASE + '/clubs/show/1', BASE + '/clubs/show/2',
                             BASE + '/clubs/show/3'])
    _capture(BASE + '/clubs/show/1', 'footbag.org: Club: Alpha Club')
    _capture(BASE + '/clubs/show/3', 'footbag.org: Club: Zeta Club')
    # Something in the archive links Alpha, so Alpha is reachable by browsing.
    hub = _www(env) / 'clubs' / 'index.html'
    hub.parent.mkdir(parents=True, exist_ok=True)
    hub.write_text('<html><body><a href="show/1/index.html">Alpha</a></body></html>',
                   encoding='utf-8')

    mirror_script.generate_archive_directory()
    listing = (_www(env) / 'archive-directory.html').read_text()

    assert 'Zeta Club' in listing               # nothing links it
    assert 'Alpha Club' not in listing          # the clubs hub links it
    assert '/clubs/show/2' not in listing       # never captured
    assert '<script' not in listing.lower()     # strictly JS-free
    assert 'complete' not in listing.lower()    # claims only what it holds


def test_listing_does_not_erase_itself_on_a_second_run(env):
    # The listing links every page it lists. Counting its own links as evidence
    # of reachability would empty it the next time it is generated.
    _seed(env, 'clubs.txt', [BASE + '/clubs/show/9'])
    _capture(BASE + '/clubs/show/9', 'footbag.org: Club: Lonely Club')

    mirror_script.generate_archive_directory()
    first = (_www(env) / 'archive-directory.html').read_text()
    mirror_script.generate_archive_directory()
    second = (_www(env) / 'archive-directory.html').read_text()

    assert 'Lonely Club' in first
    assert 'Lonely Club' in second
    assert first == second


def test_an_area_with_nothing_unlinked_is_omitted_rather_than_empty(env):
    _seed(env, 'clubs.txt', [BASE + '/clubs/show/1'])
    _capture(BASE + '/clubs/show/1', 'footbag.org: Club: Alpha Club')
    hub = _www(env) / 'clubs' / 'index.html'
    hub.parent.mkdir(parents=True, exist_ok=True)
    hub.write_text('<html><body><a href="show/1/index.html">Alpha</a></body></html>',
                   encoding='utf-8')
    mirror_script.generate_archive_directory()
    listing = (_www(env) / 'archive-directory.html').read_text()
    assert 'Clubs' not in listing


def test_directory_groups_worlds_across_both_trees_chronologically(env):
    _capture(BASE + '/worlds97/', 'Worlds 97')
    _capture(BASE + '/worlds2017/', 'Worlds 2017')
    _capture('http://sites.footbag.org/worlds2018/', 'Worlds 2018')
    _capture('http://sites.footbag.org/reference/', 'Reference site')
    _capture(BASE + '/reference2/', 'Old wiki')
    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()
    # Chronological interleave regardless of which tree holds the year.
    assert page.index('World Championships 1997') \
        < page.index('World Championships 2017') \
        < page.index('World Championships 2018')
    assert 'sites/worlds2018/index.html' in page
    # Non-worlds vhost site listed as a microsite; both wikis distinct.
    assert 'sites/reference/index.html' in page
    assert 'reference2/index.html' in page
    assert '<script' not in page.lower()


def test_homepage_card_is_native_and_inserted_exactly_once(env):
    home = _www(env) / 'index.html'
    home.parent.mkdir(parents=True, exist_ok=True)
    home.write_text('<html><body>\n<div class="indexNews">news</div>\n'
                    '<div class="indexNotices">notices</div>\n</body></html>',
                    encoding='utf-8')
    assert mirror_script.insert_homepage_directory_card() is True
    first = home.read_text()
    # Native block classes from the homepage's own stylesheet; linked to the
    # Directory; inserted ahead of the notices block.
    assert 'class="indexEvents"' in first
    assert 'archive-directory.html' in first
    assert first.index('More Archived Pages') < first.index('indexNotices')
    # The card claims only what the page behind it holds: pages nothing else
    # links, not the whole archive, and never "complete".
    assert 'complete' not in first.lower()
    # Idempotent across repeated end-of-crawl runs.
    assert mirror_script.insert_homepage_directory_card() is True
    assert home.read_text().count('More Archived Pages') == 1


def test_homepage_card_absent_homepage_degrades_without_error(env):
    assert mirror_script.insert_homepage_directory_card() is False


def test_what_the_archive_is_is_stated_by_the_banner_not_a_second_card(env):
    # The homepage once carried a second card explaining that the archive is a
    # frozen snapshot. The banner says that at every front door, so repeating it
    # in a card on one page is duplication; the homepage keeps one card, and it
    # points at the listing of pages nothing links.
    home = _www(env) / 'index.html'
    home.parent.mkdir(parents=True, exist_ok=True)
    home.write_text('<html><body>\n<div class="indexNews">news</div>\n'
                    '<div class="indexNotices">notices</div>\n</body></html>',
                    encoding='utf-8')
    assert mirror_script.insert_homepage_directory_card() is True
    mirror_script.insert_archive_banner()
    text = home.read_text()
    assert text.count('class="indexEvents"') == 1
    assert 'About This Archive' not in text
    assert 'static, read-only snapshot' in text          # said once, by the banner
    assert text.count(mirror_script.ARCHIVE_BANNER_MARKER) == 1


def test_directory_dedups_a_year_captured_in_both_trees(env):
    # A cross-published championship stored in BOTH trees (www copy + vhost
    # copy) must appear as a single World Championships row, the www one.
    _capture(BASE + '/worlds2015/', 'Worlds 2015')
    _capture('http://sites.footbag.org/worlds2015/', 'Worlds 2015 vhost')
    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()
    assert page.count('World Championships 2015') == 1
    assert 'worlds2015/index.html' in page
    assert 'sites/worlds2015/index.html' not in page   # www copy preferred


# The archive banner. What the archive is, said once at every door a reader can
# come in by: the homepage, everything its own navigation links, each microsite
# and championship root, and the generated listing page. Deep pages get nothing —
# a reader on an event page has already come through one of these.

def _www(env):
    return Path(mirror_script._www_root())


def _make(env, rel, body):
    p = Path(mirror_script._www_root()) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f'<html><body>{body}</body></html>', encoding='utf-8')
    return p


def test_banner_lands_on_the_homepage_and_what_its_nav_links(env):
    _make(env, 'index.html',
          '<div id="MainMenu"><ul><li><a href="faq/index.html">FAQ</a></li>'
          '<li><a href="clubs/index.html">CLUBS</a></li></ul></div><p>Home</p>')
    faq = _make(env, 'faq/index.html', '<p>FAQ</p>')
    clubs = _make(env, 'clubs/index.html', '<p>Clubs</p>')
    deep = _make(env, 'events/show/1/index.html', '<p>An event</p>')

    mirror_script.insert_archive_banner()

    for p in (Path(mirror_script._www_root()) / 'index.html', faq, clubs):
        assert mirror_script.ARCHIVE_BANNER_MARKER in p.read_text(encoding='utf-8')
    assert mirror_script.ARCHIVE_BANNER_MARKER not in deep.read_text(encoding='utf-8')


def test_banner_carries_the_live_site_link(env):
    _make(env, 'index.html', '<p>Home</p>')
    mirror_script.insert_archive_banner()
    text = (Path(mirror_script._www_root()) / 'index.html').read_text(encoding='utf-8')
    assert mirror_script.LIVE_SITE_URL in text
    assert 'static, read-only snapshot' in text


def test_banner_is_not_stacked_by_a_second_run(env):
    home = _make(env, 'index.html', '<p>Home</p>')
    mirror_script.insert_archive_banner()
    first = home.read_text(encoding='utf-8')
    mirror_script.insert_archive_banner()
    assert home.read_text(encoding='utf-8') == first
    assert first.count(mirror_script.ARCHIVE_BANNER_MARKER) == 1


def test_banner_reaches_a_microsite_root_the_homepage_never_links(env):
    _make(env, 'index.html', '<p>Home</p>')
    worlds = _make(env, 'worlds2012/index.html', '<p>Worlds 2012</p>')
    mirror_script.insert_archive_banner()
    assert mirror_script.ARCHIVE_BANNER_MARKER in worlds.read_text(encoding='utf-8')


def test_xml_stored_under_an_html_name_is_left_alone(env):
    _make(env, 'index.html', '<p>Home</p>')
    feed = Path(mirror_script._www_root()) / 'worlds2012/index.html'
    feed.parent.mkdir(parents=True, exist_ok=True)
    feed.write_text('<?xml version="1.0"?><rss><channel/></rss>', encoding='utf-8')
    mirror_script.insert_archive_banner()
    assert feed.read_text(encoding='utf-8').startswith('<?xml')
