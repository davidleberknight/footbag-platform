"""
test_mirror_robots_and_dedup.py: the two repaired crawler behaviors in
create_mirror_footbag_org.py.

Robots: directives are grouped under the applicable User-agent (longest
specific token wins, '*' only as fallback), Allow is honored with
longest-match precedence over a broader Disallow, the fetch uses the crawl's
scheme and the crawler's own User-Agent, an unavailable or malformed robots
file falls back to allow (documented: an authorized archival crawl of the
operator's own site), and decisions are stable across a resume from the
persisted cache without a refetch.

Dedup: two distinct URLs with identical rendered bytes each keep a resolvable
file at their own path — HTML duplicates write their own (already
link-rewritten) content; identical binaries hard-link to the canonical copy —
and both URLs appear in the sitemap, across crawl phases and resumes.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_robots_and_dedup.py -v
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_robots', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_robots'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
UA = mirror_script.USER_AGENT


# ── Robots: parsing and decision semantics ───────────────────────────────────

ROBOTS_MULTI_GROUP = """
# archival policy
User-agent: Googlebot
Disallow: /

User-agent: FootbagMirror
Disallow: /members/private/
Allow: /members/private/gallery/

User-agent: *
Disallow: /search
"""


def _rules(text, ua=UA):
    return mirror_script._select_robots_group(mirror_script._parse_robots_groups(text), ua)


def test_specific_group_wins_over_wildcard_and_irrelevant_groups_do_not_apply():
    rules = _rules(ROBOTS_MULTI_GROUP)
    # Our group's Disallow applies...
    assert mirror_script._robots_decision(rules, '/members/private/list') is False
    # ...the Googlebot blanket Disallow does NOT apply to us...
    assert mirror_script._robots_decision(rules, '/events/show/1') is True
    # ...and the wildcard group's /search rule does not leak into our group.
    assert mirror_script._robots_decision(rules, '/search') is True


def test_wildcard_group_applies_when_no_specific_group_matches():
    rules = _rules(ROBOTS_MULTI_GROUP, ua='SomeOtherBot/2.0')
    assert mirror_script._robots_decision(rules, '/search') is False
    assert mirror_script._robots_decision(rules, '/events/show/1') is True


def test_allow_overrides_broader_disallow_by_longest_match():
    rules = _rules(ROBOTS_MULTI_GROUP)
    assert mirror_script._robots_decision(rules, '/members/private/gallery/42') is True
    assert mirror_script._robots_decision(rules, '/members/private/other') is False


def test_path_wildcards_and_anchors():
    rules = _rules("User-agent: *\nDisallow: /*.php$\nDisallow: /tmp*\n", ua=UA)
    assert mirror_script._robots_decision(rules, '/index.php') is False
    assert mirror_script._robots_decision(rules, '/index.php/view') is True   # $-anchored
    assert mirror_script._robots_decision(rules, '/tmp/file') is False


def test_empty_disallow_and_malformed_lines_allow():
    rules = _rules("User-agent: *\nDisallow:\nNonsense line without colon\nDisallow /broken\n", ua=UA)
    assert mirror_script._robots_decision(rules, '/anything') is True


@pytest.fixture()
def checker(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'ROBOTS_CACHE_FILE', str(tmp_path / 'robots_cache.json'))
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', True)
    return mirror_script.RobotChecker()


def test_fetch_uses_crawl_scheme_and_crawler_user_agent(checker, monkeypatch):
    seen = {}

    class Resp:
        status_code = 200
        text = ROBOTS_MULTI_GROUP

    def fake_get(url, timeout=None, headers=None):
        seen['url'] = url
        seen['headers'] = headers or {}
        return Resp()

    monkeypatch.setattr(mirror_script.requests, 'get', fake_get)
    host = mirror_script.urlparse(BASE).netloc
    assert checker.can_fetch(f'{BASE}/events/show/1') is True
    scheme = mirror_script.urlparse(BASE).scheme
    assert seen['url'] == f'{scheme}://{host}/robots.txt'      # crawl scheme, not hard-coded https
    assert seen['headers'].get('User-Agent') == UA             # crawler UA, not requests default


def test_unavailable_robots_allows_and_is_cached(checker, monkeypatch):
    def fake_get(url, timeout=None, headers=None):
        raise mirror_script.requests.exceptions.ConnectionError('no route')

    monkeypatch.setattr(mirror_script.requests, 'get', fake_get)
    assert checker.can_fetch(f'{BASE}/anything') is True
    host = mirror_script.urlparse(BASE).netloc
    assert checker.robots_cache[host]['status'] == 'unavailable'


def test_error_status_robots_allows(checker, monkeypatch):
    class Resp:
        status_code = 404
        text = ''

    monkeypatch.setattr(mirror_script.requests, 'get', lambda *a, **k: Resp())
    assert checker.can_fetch(f'{BASE}/members/private/list') is True


def test_decisions_stable_after_resume_without_refetch(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'ROBOTS_CACHE_FILE', str(tmp_path / 'robots_cache.json'))
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', True)

    class Resp:
        status_code = 200
        text = ROBOTS_MULTI_GROUP

    calls = []

    def fake_get(url, timeout=None, headers=None):
        calls.append(url)
        return Resp()

    monkeypatch.setattr(mirror_script.requests, 'get', fake_get)
    first = mirror_script.RobotChecker()
    assert first.can_fetch(f'{BASE}/members/private/list') is False
    first.save_cache()
    assert len(calls) == 1

    # A resumed process loads the cached text and reaches the same decisions
    # with zero further robots fetches.
    monkeypatch.setattr(mirror_script.requests, 'get',
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError('robots refetched on resume')))
    resumed = mirror_script.RobotChecker()
    assert resumed.can_fetch(f'{BASE}/members/private/list') is False
    assert resumed.can_fetch(f'{BASE}/members/private/gallery/42') is True


# ── Dedup: distinct URLs with identical content ──────────────────────────────

@pytest.fixture()
def state(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    return st


IDENTICAL_HTML = '<html><body><a href="shared.css">Identical page</a></body></html>'


def test_two_html_urls_with_identical_content_both_remain_reachable(state):
    url_a = f'{BASE}/faq/show/alpha'
    url_b = f'{BASE}/faq/show/beta'
    mirror_script.save_content(url_a, IDENTICAL_HTML, is_html=True)
    mirror_script.save_content(url_b, IDENTICAL_HTML, is_html=True)

    path_a = mirror_script.url_to_filepath(mirror_script.normalize_url(url_a))
    path_b = mirror_script.url_to_filepath(mirror_script.normalize_url(url_b))
    assert Path(path_a).exists() and Path(path_b).exists()
    # Identical bytes at both locations: relative links work from each.
    assert Path(path_a).read_text() == Path(path_b).read_text() == IDENTICAL_HTML
    # Both appear in the sitemap, deterministically once each.
    assert state.sitemap.count(path_a) == 1
    assert state.sitemap.count(path_b) == 1
    assert state.stats['duplicate_content_preserved'] == 1


def test_duplicate_discovered_after_resume_is_still_preserved(state, tmp_path):
    url_a = f'{BASE}/faq/show/first-phase'
    mirror_script.save_content(url_a, IDENTICAL_HTML, is_html=True)
    state.save_progress()

    resumed = mirror_script.MirrorState()
    assert resumed.load_progress() is True
    mirror_script.mirror_state = resumed
    url_b = f'{BASE}/faq/show/second-phase'
    mirror_script.save_content(url_b, IDENTICAL_HTML, is_html=True)

    path_b = mirror_script.url_to_filepath(mirror_script.normalize_url(url_b))
    assert Path(path_b).exists()
    assert Path(path_b).read_text() == IDENTICAL_HTML
    assert path_b in resumed.sitemap


def test_identical_binary_assets_share_storage_via_hard_link(state):
    payload = b'\x00\x01BINARY-PAYLOAD' * 100
    url_a = f'{BASE}/docs/results-a.pdf'
    url_b = f'{BASE}/docs/results-b.pdf'
    mirror_script.save_content(url_a, payload, is_html=False)
    mirror_script.save_content(url_b, payload, is_html=False)

    path_a = Path(mirror_script.url_to_filepath(mirror_script.normalize_url(url_a)))
    path_b = Path(mirror_script.url_to_filepath(mirror_script.normalize_url(url_b)))
    assert path_a.exists() and path_b.exists()
    assert path_a.read_bytes() == path_b.read_bytes() == payload
    # Shared storage where the filesystem allows (same inode on POSIX tmp).
    assert os.stat(path_a).st_ino == os.stat(path_b).st_ino
    assert str(path_b) in state.sitemap


def test_ordinary_unique_pages_are_unaffected(state):
    url_a = f'{BASE}/news/show/1'
    url_b = f'{BASE}/news/show/2'
    mirror_script.save_content(url_a, '<html>one</html>', is_html=True)
    mirror_script.save_content(url_b, '<html>two</html>', is_html=True)
    path_a = Path(mirror_script.url_to_filepath(mirror_script.normalize_url(url_a)))
    path_b = Path(mirror_script.url_to_filepath(mirror_script.normalize_url(url_b)))
    assert path_a.read_text() == '<html>one</html>'
    assert path_b.read_text() == '<html>two</html>'
    assert state.stats.get('duplicate_content_preserved', 0) == 0
    assert state.stats['successful_downloads'] == 2
