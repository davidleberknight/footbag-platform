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


def test_browse_index_links_only_captured_items(env):
    _seed(env, 'clubs.txt', [BASE + '/clubs/show/1', BASE + '/clubs/show/2',
                             BASE + '/clubs/show/3'])
    _capture(BASE + '/clubs/show/1', 'footbag.org: Club: Alpha Club')
    _capture(BASE + '/clubs/show/3', 'footbag.org: Club: Zeta Club')
    counts = mirror_script.generate_browse_indexes()
    assert counts['clubs'][1] == 2
    index = (_www(env) / 'archive-index' / 'clubs' / 'index.html').read_text()
    assert 'Alpha Club' in index and 'Zeta Club' in index
    assert '/clubs/show/2' not in index          # uncaptured: never linked
    assert '<script' not in index.lower()        # strictly JS-free
    # Labels come from page titles with the site prefix dropped; links are
    # relative and resolve to the real files.
    assert '../../clubs/show/1/index.html' in index


def test_browse_index_paginates_and_navigates(env, monkeypatch):
    monkeypatch.setattr(mirror_script, 'INDEX_PAGE_SIZE', 3)
    urls = [BASE + f'/news/show/{i}' for i in range(1, 8)]
    _seed(env, 'news.txt', urls)
    for u in urls:
        _capture(u, f'footbag.org: News: item {u.rsplit("/", 1)[1]}')
    counts = mirror_script.generate_browse_indexes()
    assert counts['news'][1] == 7
    area = _www(env) / 'archive-index' / 'news'
    assert (area / 'index.html').exists()
    assert (area / 'page2.html').exists() and (area / 'page3.html').exists()
    page2 = (area / 'page2.html').read_text()
    assert '<a href="index.html">1</a>' in page2 and '<b>2</b>' in page2


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
    assert first.index('Complete Archive') < first.index('indexNotices')
    # Idempotent across repeated end-of-crawl runs.
    assert mirror_script.insert_homepage_directory_card() is True
    assert home.read_text().count('Complete Archive') == 1


def test_homepage_card_absent_homepage_degrades_without_error(env):
    assert mirror_script.insert_homepage_directory_card() is False


def test_homepage_about_card_native_js_free_and_inserted_exactly_once(env):
    home = _www(env) / 'index.html'
    home.parent.mkdir(parents=True, exist_ok=True)
    home.write_text('<html><body>\n<div class="indexNews">news</div>\n'
                    '<div class="indexNotices">notices</div>\n</body></html>',
                    encoding='utf-8')
    assert mirror_script.insert_homepage_about_card() is True
    first = home.read_text()
    # Native block classes; states the frozen-snapshot and static-files
    # contract; inserted ahead of the notices block; strictly JS-free.
    assert 'class="indexEvents"' in first
    assert 'About This Archive' in first
    assert 'frozen' in first and 'MP4' in first and 'no JavaScript' in first
    assert first.index('About This Archive') < first.index('indexNotices')
    assert '<script' not in first.lower()
    # Idempotent across repeated end-of-crawl runs.
    assert mirror_script.insert_homepage_about_card() is True
    assert home.read_text().count('About This Archive') == 1


def test_homepage_about_card_absent_homepage_degrades_without_error(env):
    assert mirror_script.insert_homepage_about_card() is False


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
