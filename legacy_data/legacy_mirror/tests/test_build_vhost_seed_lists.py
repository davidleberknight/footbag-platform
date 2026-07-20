"""WordPress-REST seed enumeration in scripts/build_vhost_seed_lists.py.

The vhost's WordPress content is enumerated through the REST API, paginated via
the X-WP-TotalPages response header. These tests pin the pagination loop, the
JSON/regex body extraction, host canonicalization (keep only the two footbag web
hosts, force plain HTTP), and that a site always seeds its own root. All offline:
requests.get and time.sleep are stubbed, and no seed file is written (only the
internal builders are exercised, never main()).

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_build_vhost_seed_lists.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = (Path(__file__).resolve().parent.parent
               / 'scripts' / 'build_vhost_seed_lists.py')
spec = importlib.util.spec_from_file_location('build_vhost_seed_lists', str(SCRIPT_PATH))
vh = importlib.util.module_from_spec(spec)
sys.modules['build_vhost_seed_lists'] = vh
spec.loader.exec_module(vh)


class _FakeResp:
    def __init__(self, text, total_pages):
        self.text = text
        self.headers = {'X-WP-TotalPages': str(total_pages)}

    def raise_for_status(self):
        return None


def _install_paged_get(monkeypatch, pages_by_kind):
    """Stub requests.get to serve a fixed list of page bodies per REST kind
    ('pages'/'posts'), driven by the ?page= query param, advertising the real
    total via X-WP-TotalPages. Records every requested URL."""
    calls = []

    def fake_get(url, timeout=None, headers=None):
        calls.append(url)
        kind = 'posts' if '/posts' in url else 'pages'
        bodies = pages_by_kind.get(kind, ['[]'])
        # ?page=N (1-based); default 1.
        page = 1
        for part in url.split('?', 1)[-1].split('&'):
            if part.startswith('page='):
                page = int(part.split('=', 1)[1])
        body = bodies[page - 1]
        return _FakeResp(body, total_pages=len(bodies))

    monkeypatch.setattr(vh.requests, 'get', fake_get)
    monkeypatch.setattr(vh.time, 'sleep', lambda _s: None)
    return calls


def _body(*links):
    items = ', '.join('{"link": "%s"}' % l for l in links)
    return '[' + items + ']'


def test_fetch_links_paginates_via_total_pages_header(monkeypatch):
    # Three pages advertised via X-WP-TotalPages; every page's links are gathered
    # and exactly three GETs are issued (page=1,2,3).
    pages = [
        _body('http://sites.footbag.org/reference/a/'),
        _body('http://sites.footbag.org/reference/b/'),
        _body('http://sites.footbag.org/reference/c/'),
    ]
    calls = _install_paged_get(monkeypatch, {'pages': pages, 'posts': ['[]']})
    links = vh._fetch_links('reference', 'pages')
    assert links == [
        'http://sites.footbag.org/reference/a/',
        'http://sites.footbag.org/reference/b/',
        'http://sites.footbag.org/reference/c/',
    ]
    page_calls = [c for c in calls if '/pages' in c]
    assert len(page_calls) == 3
    assert 'page=1' in page_calls[0] and 'page=2' in page_calls[1] and 'page=3' in page_calls[2]


def test_fetch_links_single_page_when_total_is_one(monkeypatch):
    calls = _install_paged_get(
        monkeypatch, {'pages': [_body('http://sites.footbag.org/reference/only/')]})
    links = vh._fetch_links('reference', 'pages')
    assert links == ['http://sites.footbag.org/reference/only/']
    assert len([c for c in calls if '/pages' in c]) == 1  # no over-fetch past total


def test_build_site_dedups_across_pages_and_posts_and_always_seeds_root(monkeypatch):
    # A URL repeated across pages and across pages/posts collapses to one; the
    # site root is always present even if enumeration returned nothing new.
    dup = 'http://sites.footbag.org/worlds2018/players/'
    _install_paged_get(monkeypatch, {
        'pages': [_body(dup, 'http://sites.footbag.org/worlds2018/media/'),
                  _body(dup)],
        'posts': [_body('http://sites.footbag.org/worlds2018/2018/03/28/hello/')],
    })
    urls, by_host = vh.build_site('worlds2018')
    assert urls == sorted(set(urls))                        # sorted, de-duped
    assert urls.count(dup) == 1
    assert 'http://sites.footbag.org/worlds2018/' in urls   # root always seeded
    assert by_host['sites.footbag.org'] >= 2


def test_canonicalize_keeps_two_footbag_hosts_forces_http_drops_query():
    # A cross-published REST link on www is kept (store-once ruling); the vhost
    # host is kept; foreign hosts are dropped; scheme forced to http; query and
    # fragment stripped.
    assert vh._canonicalize('https://www.footbag.org/news/show/1?x=1#frag') \
        == 'http://www.footbag.org/news/show/1'
    assert vh._canonicalize('http://sites.footbag.org/reference/a/') \
        == 'http://sites.footbag.org/reference/a/'
    assert vh._canonicalize('http://example.com/x') is None
    assert vh._canonicalize('http://worlds2018.footbag.org/x') is None  # not a crawl host


def test_links_from_body_uses_regex_fallback_on_broken_json():
    # Valid JSON is parsed directly.
    assert vh._links_from_body('[{"link": "http://sites.footbag.org/a/"}]') \
        == ['http://sites.footbag.org/a/']
    # Aged WordPress can emit body that breaks strict JSON; the clean link values
    # are still recovered by the regex fallback (escaped slashes unescaped).
    broken = '[{"link": "http:\\/\\/sites.footbag.org\\/b\\/", "content": <bad>}]'
    assert vh._links_from_body(broken) == ['http://sites.footbag.org/b/']
