"""A withheld blog post's entries in the listings that quote it, in
create_mirror_footbag_org.py.

A championship microsite's home page and author archive carry each post's
title and body inline, as one entry of their post list. Withholding the post's
own page therefore leaves its text on the front page of that site. The settle
pass removes the entry whose permalink is a withheld page, whole and with a
marker, and leaves every other entry. It acts on the withheld list only: a real
post the crawl did not reach still has a real excerpt, and settling its dead
link is the dead-link pass's job.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_withheld_post_entries.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_withheld_posts', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_withheld_posts'] = mirror_script
spec.loader.exec_module(mirror_script)

ADVERT = 'worlds2012/2026/06/16/обзор-инвертора-deye-sun-6kw-особенности-и-преи'
REAL_POST = 'worlds2012/2012/08/09/net-results'
UNREACHED_POST = 'worlds2012/2012/08/08/freestyle-results'


def _entry(post_id, permalink, title, body):
    return (
        f'<div id="post-{post_id}" class="post-{post_id} post type-post hentry">'
        f'<h2 class="entry-title"><a href="{permalink}" rel="bookmark">{title}</a></h2>'
        f'<div class="entry-meta"><a href="{permalink}" rel="bookmark">date</a></div>'
        f'<div class="entry-content"><p>{body}</p></div>'
        '</div>')


def _listing(prefix=''):
    return (
        '<html><body><div id="content">'
        + _entry(833, f'{prefix}{ADVERT}/index.html', 'Advert title', 'advert body')
        + _entry(813, f'{prefix}{REAL_POST}/index.html', 'Net Results', 'net body')
        + _entry(798, f'{prefix}{UNREACHED_POST}/index.html', 'Freestyle', 'fs body')
        + '</div></body></html>')


@pytest.fixture
def www(tmp_path, monkeypatch):
    mirror_dir = tmp_path / 'mirror_footbag_org'
    root = mirror_dir / 'www.footbag.org'
    root.mkdir(parents=True)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'WITHHELD_EXACT_URLS',
                        frozenset({ADVERT, f'sites/{ADVERT}'}))
    real = root / REAL_POST / 'index.html'
    real.parent.mkdir(parents=True)
    real.write_text('<html><body>net</body></html>', encoding='utf-8')
    return root


def _write(path, html):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding='utf-8')
    return path


def test_the_withheld_posts_entry_is_removed_with_a_marker(www):
    # The site's own home page, one level above the posts it links.
    home = _write(www / 'index.html', _listing())
    assert mirror_script.drop_withheld_post_entries() == 1
    out = home.read_text(encoding='utf-8')
    assert 'advert body' not in out
    assert 'Advert title' not in out
    assert 'Mirror: withheld post removed' in out


def test_the_other_entries_on_the_listing_stay(www):
    home = _write(www / 'index.html', _listing())
    mirror_script.drop_withheld_post_entries()
    out = home.read_text(encoding='utf-8')
    assert 'net body' in out
    # Its page is not in the capture, but it is not withheld either.
    assert 'fs body' in out


def test_the_vhost_copy_of_the_listing_is_settled_too(www):
    home = _write(www / 'sites' / 'index.html', _listing())
    assert mirror_script.drop_withheld_post_entries() == 1
    assert 'advert body' not in home.read_text(encoding='utf-8')


def test_a_deeper_listing_reaching_the_post_by_parent_steps_is_settled(www):
    author = _write(www / 'worlds2012' / 'author' / 'someone' / 'index.html',
                    _listing(prefix='../../../'))
    assert mirror_script.drop_withheld_post_entries() == 1
    out = author.read_text(encoding='utf-8')
    assert 'advert body' not in out
    assert 'net body' in out


def test_nothing_is_touched_when_nothing_is_withheld(www, monkeypatch):
    monkeypatch.setattr(mirror_script, 'WITHHELD_EXACT_URLS', frozenset())
    home = _write(www / 'index.html', _listing())
    before = home.read_text(encoding='utf-8')
    assert mirror_script.drop_withheld_post_entries() == 0
    assert home.read_text(encoding='utf-8') == before
