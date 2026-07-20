"""Signed-in member chrome never survives into the static archive.

The crawler authenticates to capture member-visible content, so fetched pages
can carry the homepage member chrome: the "You are signed in as ..." card,
its account links, and a member-search form. None of that works on a static
host, and a personal signed-in banner does not belong in the archive. Two
layers enforce this: link rewriting drops the block from every newly fetched
page, and an end-of-crawl pass scrubs a homepage already on disk while
leaving every other byte of the page untouched.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_member_chrome.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_chrome', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_chrome'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL

MEMBER_CHROME = (
    '<div class="indexReaderPreview">\n'
    '<div id="IndexMember">\n'
    '<div style="background-color: #eee;">You are signed in as Dave Leberknight.</div>\n'
    '<div class="tiny">\n'
    '<a href="members/home/index.html">home page</a>\n'
    '<form action="members/list/index.html" method="post">\n'
    '<nobr>Member Search:</nobr><input name="SearchText" type="text"/>\n'
    '</form>\n'
    '</div>\n'
    '</div> <!-- IndexMember -->\n'
    '<!-- </div> stray commented-out closing div, present on the real homepage -->\n'
    '</div>\n'
)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    return tmp_path


class _RaisingSession:
    """Any network request is a test failure; rewrite here must stay offline."""
    def get(self, url, **kwargs):
        raise AssertionError(f'unexpected network request: {url}')


def _homepage(env):
    path = env / 'mirror' / 'www.footbag.org' / 'index.html'
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def test_rewrite_drops_member_chrome_from_fetched_page(env, monkeypatch):
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    html = ('<html><body>\n' + MEMBER_CHROME +
            '<div class="indexNotices">notices</div>\n</body></html>')
    out = mirror_script.rewrite_links(html, BASE + '/index.html')
    assert 'You are signed in as' not in out
    assert 'Member Search' not in out
    assert 'IndexMember' not in out
    assert 'indexNotices' in out


def test_scrub_removes_chrome_and_only_the_chrome(env):
    home = _homepage(env)
    before_prefix = '<html><body>\n<div class="indexNews">news</div>\n'
    before_suffix = '<div class="indexNotices">notices</div>\n</body></html>'
    home.write_text(before_prefix + MEMBER_CHROME + before_suffix, encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    after = home.read_text(encoding='utf-8')
    assert 'You are signed in as' not in after
    assert 'Member Search' not in after
    assert 'IndexMember' not in after
    # The stray commented-out closing div after the block must not derail the
    # tag balancing, and every byte outside the block survives unchanged.
    assert 'stray commented-out closing div' in after
    assert after.startswith(before_prefix)
    assert after.endswith(before_suffix)


def test_scrub_is_idempotent_across_repeated_runs(env):
    home = _homepage(env)
    home.write_text('<html><body>\n' + MEMBER_CHROME + '</body></html>',
                    encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    first = home.read_text(encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    assert home.read_text(encoding='utf-8') == first


def test_scrub_leaves_chrome_free_homepage_byte_identical(env):
    home = _homepage(env)
    clean = '<html><body><div class="indexNews">news</div></body></html>'
    home.write_text(clean, encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    assert home.read_text(encoding='utf-8') == clean


def test_scrub_degrades_without_error_when_homepage_absent(env):
    assert mirror_script.scrub_homepage_member_chrome() is False
