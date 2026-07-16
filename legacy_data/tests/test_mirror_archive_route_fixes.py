"""Four repaired archive-crawler behaviors in create_mirror_footbag_org.py.

Forum root: the retired forum's section root ('/forum', '/forum/') resolves to
the flat 'forum-down.html' notice that is present in the mirror, not a
'forum/index.html' directory index; deeper cached forum URLs keep their own
paths; the site-wide nav link on every page therefore rewrites to a real file.

Escaped ampersands: a URL parsed out of an HTML attribute collapses '&amp;' (and
the double-escaped '&amp;amp;' the live gallery emits) back to a literal '&', so
the fetched URL, the on-disk media filename ('Lisa&Andy.mp4'), and the rewritten
link all agree and the rendered link is escaped exactly once; a query parameter
named like a legacy HTML entity ('?copy=1', '?reg=2') is left untouched.

iCalendar exports: the whole-calendar feed ('/events/ical') maps to a stable
'.ics' file instead of an HTML directory index, the per-event export
('/events/vcal/<id>.ics') keeps its own '.ics' file, and the 'webcal://' scheme
the event pages use is canonicalized to 'http://' so those exports are scoped,
enqueued, and rewritten locally.

Destructive event routes: the event edit and remove handlers ('/events/edit',
'/events/rm', and the existing '/events/edit2') are refused, while the public
event-detail page and the read-only calendar exports and listings stay
crawlable.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/tests/test_mirror_archive_route_fixes.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_routes', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_routes'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


def _rel(url):
    """The mirror-relative path url_to_filepath assigns, below www.footbag.org/."""
    p = mirror_script.url_to_filepath(url)
    marker = 'www.footbag.org/'
    return p.split(marker, 1)[1] if marker in p else p


# ── Escaped-ampersand canonicalization (pure) ────────────────────────────────

def test_collapse_amp_single_double_and_query():
    c = mirror_script._collapse_amp_entities
    assert c('Lisa&amp;Andy.mp4') == 'Lisa&Andy.mp4'
    assert c('Lisa&amp;amp;Andy.mp4') == 'Lisa&Andy.mp4'   # double-escaped source
    assert c('x?a=1&amp;b=2') == 'x?a=1&b=2'


def test_collapse_amp_is_idempotent_and_leaves_bare_ampersand():
    c = mirror_script._collapse_amp_entities
    assert c('Lisa&Andy.mp4') == 'Lisa&Andy.mp4'            # already canonical
    assert c(c('Lisa&amp;amp;Andy.mp4')) == 'Lisa&Andy.mp4'


def test_collapse_amp_does_not_touch_entity_named_query_params():
    # A blanket html.unescape would turn '&copy' into '(c)' and '&reg' into '(r)';
    # the scoped '&amp;' collapse must leave such query parameters alone.
    c = mirror_script._collapse_amp_entities
    assert c('x?copy=1&reg=2&trade=3') == 'x?copy=1&reg=2&trade=3'


def test_normalize_url_collapses_ampersand_but_preserves_entity_named_params():
    n = mirror_script.normalize_url
    assert n('http://v.footbag.org/media/Lisa&amp;amp;Andy.mp4') == \
        'http://v.footbag.org/media/Lisa&Andy.mp4'
    assert n('http://www.footbag.org/x?copy=1&reg=2') == \
        'http://www.footbag.org/x?copy=1&reg=2'


def test_escaped_media_url_maps_to_single_ampersand_on_disk():
    # The link, the fetch, and the file all land on the single-'&' name.
    assert _rel('http://v.footbag.org/media/Lisa&amp;amp;Andy.mp4') == \
        'media/Lisa&Andy.mp4'


# ── webcal:// canonicalization (pure) ────────────────────────────────────────

def test_canonicalize_calendar_scheme():
    f = mirror_script._canonicalize_calendar_scheme
    assert f('webcal://www.footbag.org/events/ical') == \
        'http://www.footbag.org/events/ical'
    assert f('WEBCAL://www.footbag.org/events/vcal/9.ics') == \
        'http://www.footbag.org/events/vcal/9.ics'
    assert f('http://www.footbag.org/events/show/9') == \
        'http://www.footbag.org/events/show/9'   # non-webcal untouched


def test_normalize_url_canonicalizes_webcal():
    assert mirror_script.normalize_url('webcal://www.footbag.org/events/ical') == \
        'http://www.footbag.org/events/ical'


# ── iCalendar filepath mapping (pure) ────────────────────────────────────────

def test_ical_feed_gets_stable_ics_file_not_html_index():
    assert _rel(f'{BASE}/events/ical') == 'events/ical/index.ics'
    assert _rel('webcal://www.footbag.org/events/ical') == 'events/ical/index.ics'


def test_per_event_vcal_export_keeps_its_own_ics_file():
    assert _rel(f'{BASE}/events/vcal/1182.ics') == 'events/vcal/1182.ics'
    assert _rel('webcal://www.footbag.org/events/vcal/1182.ics') == \
        'events/vcal/1182.ics'


# ── Forum root maps to the flat file, not a directory (pure) ─────────────────

def test_forum_root_resolves_to_flat_forum_down_file():
    assert _rel(f'{BASE}/forum/') == 'forum-down.html'
    assert _rel(f'{BASE}/forum') == 'forum-down.html'


def test_forum_down_page_itself_is_unchanged():
    assert _rel(f'{BASE}/forum-down.html') == 'forum-down.html'


def test_deep_cached_forum_urls_keep_their_own_paths():
    assert _rel(f'{BASE}/forum/viewforum.php') == 'forum/viewforum.php'


# ── Destructive event routes (pure) ──────────────────────────────────────────

def test_event_edit_and_remove_routes_are_refused():
    for path in ('/events/edit/123', '/events/edit2/123', '/events/rm/123'):
        assert mirror_script.is_unsafe_url(BASE + path) is True, path


def test_public_event_and_readonly_exports_stay_crawlable():
    for path in ('/events/show/123', '/events/ical', '/events/vcal/9.ics',
                 '/events/list', '/events/results', '/events/past', '/events/current'):
        assert mirror_script.is_unsafe_url(BASE + path) is False, path


# ── Link rewriting (offline, via the crawler's own rewrite_links) ────────────

@pytest.fixture()
def mirror_env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    state = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', state)
    return state


class _RaisingSession:
    """Any network request is a test failure; rewrite here must stay offline."""
    def get(self, url, **kwargs):
        raise AssertionError(f'unexpected network request: {url}')


def test_forum_nav_link_rewrites_to_present_flat_file(mirror_env, monkeypatch):
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    page_url = f'{BASE}/events/show/1'
    html = '<html><body><a href="/forum/">Forum</a></body></html>'
    out = mirror_script.rewrite_links(html, page_url)
    # Points at the present flat file, never the invented directory index.
    assert 'forum-down.html' in out
    assert 'forum/index.html' not in out


def test_ical_webcal_links_rewrite_to_local_ics_paths(mirror_env, monkeypatch):
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    page_url = f'{BASE}/events/show/9'
    html = (
        '<html><body>'
        '<a href="webcal://www.footbag.org/events/vcal/9.ics">add this event</a>'
        '<a href="webcal://www.footbag.org/events/ical">subscribe to all</a>'
        '</body></html>'
    )
    out = mirror_script.rewrite_links(html, page_url)
    # Rewritten to relative local paths that resolve to the mapped .ics files.
    assert 'vcal/9.ics' in out
    assert 'ical/index.ics' in out
    assert 'webcal://' not in out            # the scheme is gone from the archive


def test_escaped_media_link_renders_single_escaped_to_canonical_file(mirror_env, monkeypatch):
    # Stub the media download to the crawler's own canonical target path (which
    # collapses the escaped ampersand), then confirm the rewritten <img> is
    # escaped exactly once and resolves to the single-'&' file.
    def stub(url, session, referrer=None, thumbnail_or_poster=False):
        target = mirror_script.url_to_filepath(mirror_script.strip_query(url))
        Path(target).parent.mkdir(parents=True, exist_ok=True)
        Path(target).write_bytes(b'x')
        return target
    monkeypatch.setattr(mirror_script, 'download_and_process_media', stub)
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())

    page_url = f'{BASE}/gallery/show/5'
    html = '<html><body><img src="http://v.footbag.org/media/Lisa&amp;amp;Andy.jpg"></body></html>'
    out = mirror_script.rewrite_links(html, page_url)
    assert 'Lisa&amp;Andy.jpg' in out         # single HTML escape, valid
    assert 'Lisa&amp;amp;Andy' not in out     # never double-escaped


def test_video_media_download_collapses_escaped_ampersand_before_use(monkeypatch, tmp_path):
    # Proves the real download entry canonicalizes the escaped ampersand with no
    # network: in skip-videos mode a video is recorded before any request, and
    # the record key carries the single-'&' name, not '&amp;amp;'.
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', True)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    state = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', state)

    escaped = 'http://v.footbag.org/media/Lisa&amp;amp;Andy.mp4'
    result = mirror_script.download_and_process_media(escaped, _RaisingSession())
    assert result == mirror_script.SKIPPED_VIDEO
    canonical = 'http://v.footbag.org/media/Lisa&Andy.mp4'
    assert mirror_script.normalize_url(canonical) in state.skipped_videos


def test_webcal_ical_links_are_discovered_and_enqueued_as_http(mirror_env):
    # extract_links canonicalizes webcal:// to http:// through normalize_url, so
    # the exports are actually captured, not silently dropped as an odd scheme.
    html = (
        '<a href="webcal://www.footbag.org/events/ical">all</a>'
        '<a href="webcal://www.footbag.org/events/vcal/9.ics">one</a>'
    )
    links = mirror_script.extract_links(html, f'{BASE}/events/show/9')
    assert f'{BASE}/events/ical' in links
    assert f'{BASE}/events/vcal/9.ics' in links
    assert not any(u.startswith('webcal://') for u in links)
