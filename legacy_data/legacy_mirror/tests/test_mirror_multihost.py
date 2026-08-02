"""Host-aware mapping and scope in create_mirror_footbag_org.py.

The archive serves as one host, so the www.footbag.org capture stays at the tree
root and the WordPress vhost (sites.footbag.org) maps under a single reserved,
hostname-free prefix inside that tree (www.footbag.org/sites/<slug>/...). These
tests pin: the vhost mapping, that no vhost path is misfiled into a www section
tree (a vhost slug colliding with a www section name), that only the two crawl
hosts are in scope, the reserved-prefix collision guard in both directions,
cross-boundary relative-link correctness, the path-traversal guard on a vhost
URL, and that the www gallery-id rebuild never re-homes a non-www URL.

All pure; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_multihost.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_multihost', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_multihost'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


def _rel(url):
    """Mirror path url_to_filepath assigns, below the www.footbag.org/ root."""
    p = mirror_script.url_to_filepath(url)
    marker = 'www.footbag.org/'
    return p.split(marker, 1)[1] if marker in p else p


# ── Vhost mapping under the reserved /sites/ prefix ───────────────────────────

def test_vhost_page_maps_under_sites_prefix():
    assert _rel('http://sites.footbag.org/worlds2018/') == 'sites/worlds2018/index.html'
    assert _rel('http://sites.footbag.org/worlds2018/players/') == 'sites/worlds2018/players/index.html'


def test_vhost_media_keeps_its_path_under_the_prefix():
    got = _rel('http://sites.footbag.org/worlds2018/wp-content/uploads/img.jpg')
    assert got == 'sites/worlds2018/wp-content/uploads/img.jpg'


def test_vhost_slug_colliding_with_a_www_section_is_not_misfiled():
    # A vhost site whose slug equals a www section name (faq, clubs, news, events)
    # must NOT hit the www special-cases: it stays under its /sites/ prefix.
    assert _rel('http://sites.footbag.org/faq/show/foo') == 'sites/faq/show/foo/index.html'
    assert _rel('http://sites.footbag.org/clubs/list') == 'sites/clubs/list/index.html'
    assert _rel('http://sites.footbag.org/news/list') == 'sites/news/list/index.html'


def test_www_mapping_is_unchanged_by_host_awareness():
    # The www root tree is untouched: a plain page and a section special-case
    # both resolve exactly as before.
    assert _rel(BASE + '/reference2/Hall_of_Fame/') == 'reference2/Hall_of_Fame/index.html'
    assert _rel(BASE + '/clubs/showmembers?ClubID=12') == 'clubs/ClubID_12/showmembers/index.html'


# ── Scope: only the two crawl hosts ───────────────────────────────────────────

def test_scope_admits_only_www_and_the_vhost(monkeypatch):
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    assert mirror_script.is_in_scope(BASE + '/gallery/show/5') is True
    assert mirror_script.is_in_scope('http://sites.footbag.org/worlds2018/') is True
    # Aliases, dead media hosts, and internal hosts are all out of scope.
    for url in ('http://v.footbag.org/media/x.mp4',
                'http://photo.footbag.org/worlds96/001.jpg',
                'http://worlds.footbag.org/foo',
                'http://forg.footbag.org/api/geoip'):
        assert mirror_script.is_in_scope(url) is False, url


def test_reserved_prefix_collision_refused_both_directions(monkeypatch):
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    # A real www path that starts with the reserved prefix would overwrite vhost
    # captures; a vhost slug literally named 'sites' would nest ambiguously.
    assert mirror_script.is_in_scope(BASE + '/sites/anything') is False
    assert mirror_script.is_in_scope('http://sites.footbag.org/sites/x') is False


# ── Cross-boundary relative links + safety ───────────────────────────────────

def test_relative_links_across_the_sites_boundary_resolve():
    calc = mirror_script.calculate_relative_path
    sites_page = mirror_script.url_to_filepath('http://sites.footbag.org/worlds2018/')
    www_page = mirror_script.url_to_filepath(BASE + '/gallery/show/5')
    # A link from the vhost page to a www page, and back, resolves to the real file.
    rel_out = calc(sites_page, www_page)
    rel_back = calc(www_page, sites_page)
    assert os.path.normpath(os.path.join(os.path.dirname(sites_page), rel_out)) == os.path.normpath(www_page)
    assert os.path.normpath(os.path.join(os.path.dirname(www_page), rel_back)) == os.path.normpath(sites_page)
    assert not rel_out.startswith('/')  # relative, not absolute


def test_traversal_guard_holds_for_a_vhost_url():
    # A vhost path trying to climb out of the mirror is stripped, never escapes.
    got = _rel('http://sites.footbag.org/worlds2018/../../../etc/passwd')
    assert got.startswith('sites/')
    assert '..' not in got


def test_gallery_id_rebuild_never_rehomes_a_non_www_url():
    # The negative-id gallery normalization rebuilds onto www ONLY for www URLs.
    assert mirror_script.normalize_url(BASE + '/gallery/show/-5') == BASE + '/gallery/show/5'
    other = mirror_script.normalize_url('http://sites.footbag.org/gallery/show/-5')
    assert other.startswith('http://sites.footbag.org/')


# ── Cookie isolation: the member session can only ever travel to www ─────────

def _cookie_header_for(jar, url):
    """The Cookie header the jar would attach to a request for url, or None."""
    import urllib.request
    req = urllib.request.Request(url)
    jar.add_cookie_header(req)
    return req.get_header('Cookie')


def test_superdomain_cookie_is_pinned_to_www_and_never_sent_elsewhere():
    jar = mirror_script.WwwPinnedCookieJar()
    # The legacy app may scope its session cookie to the whole domain; the jar
    # must pin it to www so no other *.footbag.org host ever receives it.
    jar.set('MemberSession', 'secret', domain='.footbag.org', path='/')
    assert _cookie_header_for(jar, 'http://www.footbag.org/members/home') is not None
    for url in ('http://sites.footbag.org/worlds2018/',
                'http://footbag.org/',
                'http://v.footbag.org/media/x.mp4'):
        assert _cookie_header_for(jar, url) is None, url


def test_cookie_from_a_foreign_origin_is_dropped():
    jar = mirror_script.WwwPinnedCookieJar()
    jar.set('tracker', 'x', domain='.evil.example', path='/')
    assert len(jar) == 0


def test_session_for_selects_member_session_only_for_www():
    s = mirror_script.session_for('http://www.footbag.org/members/home')
    assert s is mirror_script.session
    # Case-varied www host still selects the member session (the cookie jar
    # stays pinned regardless, so this is availability, not exposure).
    assert mirror_script.session_for('http://WWW.footbag.org/x.jpg') is mirror_script.session
    s = mirror_script.session_for('http://sites.footbag.org/worlds2018/')
    assert s is mirror_script.public_session
    # A caller holding an explicit (or test-double) session keeps it for www
    # targets, and still gets the public session for any other host.
    marker = object()
    assert mirror_script.session_for(BASE + '/x.jpg', www_session=marker) is marker
    assert mirror_script.session_for('http://sites.footbag.org/a.jpg', www_session=marker) \
        is mirror_script.public_session


def test_public_session_never_stores_cookies():
    jar = mirror_script.public_session.cookies
    jar.set('anything', 'x', domain='sites.footbag.org', path='/')
    assert len(jar) == 0


# ── Alias folding, WordPress traps, cross-published dedup ───────────────────

def test_alias_hosts_fold_onto_www():
    n = mirror_script.normalize_url
    assert n('http://footbag.org/clubs/show/1') == BASE + '/clubs/show/1'
    assert n('http://worlds.footbag.org/x') == BASE + '/x'
    assert n('http://v.footbag.org/media/a.mp4') == BASE + '/media/a.mp4'


def test_vhost_ui_params_stripped_only_on_the_vhost():
    n = mirror_script.normalize_url
    # transposh ?lang= and comment-reply ids multiply vhost URLs; stripped there.
    assert n('http://sites.footbag.org/worlds2018/?lang=fr') == \
        'http://sites.footbag.org/worlds2018'
    assert n('http://sites.footbag.org/reference/page/?replytocom=7') == \
        'http://sites.footbag.org/reference/page'
    # The www app never used these names; a www query param is not touched.
    assert 'lang=fr' in n(BASE + '/somepage?lang=fr')


def test_wordpress_traps_out_of_scope_but_permalinks_in(monkeypatch):
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    s = mirror_script.is_in_scope
    # Date-archive INDEX pages multiply URLs; a dated permalink still passes.
    assert s('http://sites.footbag.org/worlds2018/2018/05/') is False
    assert s('http://sites.footbag.org/worlds2018/2018/') is False
    assert s('http://sites.footbag.org/worlds2018/2018/05/sofia-post/') is True
    # API/feed endpoints are not archive pages; ?p= ids duplicate permalinks.
    assert s('http://sites.footbag.org/worlds2018/wp-json/wp/v2/pages') is False
    assert s('http://sites.footbag.org/worlds2018/feed/') is False
    assert s('http://sites.footbag.org/worlds2018/?p=42') is False
    # Plain vhost pages and uploads stay in scope.
    assert s('http://sites.footbag.org/worlds2018/players/') is True
    # The date rule is vhost-only: www year-keyed archive dirs still pass.
    assert s(BASE + '/worlds2008/') is True


def test_cross_published_site_dedups_to_www_only_on_allowlist(monkeypatch):
    c = mirror_script.canonicalize_cross_published
    url = 'http://sites.footbag.org/worlds2011/schedule/'
    # Not on the allowlist: double-store under the reserved prefix (no rewrite).
    assert c(url) == url
    monkeypatch.setattr(mirror_script, 'CROSS_PUBLISHED_SITES', frozenset({'worlds2011'}))
    assert c(url) == BASE + '/worlds2011/schedule/'
    # Other sites stay put; www URLs are never touched.
    assert c('http://sites.footbag.org/worlds2018/x') == 'http://sites.footbag.org/worlds2018/x'
    assert c(BASE + '/worlds2011/schedule/') == BASE + '/worlds2011/schedule/'
    # And the filepath guard files the verified twin in the www tree.
    assert _rel(url) == 'worlds2011/schedule/index.html'


# ── Links to hosts the crawler never contacts (offline resolution) ──────────

@pytest.fixture
def mirror_env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    state = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', state)
    return state


def test_dead_host_link_keeps_relative_link_when_capture_exists(mirror_env):
    # A past crawl folded photo.-host media into the www tree; the link must
    # keep working as a relative path, with no request and no hostname.
    captured = Path(mirror_script.url_to_filepath('http://photo.footbag.org/worlds96/001.jpg'))
    captured.parent.mkdir(parents=True, exist_ok=True)
    captured.write_bytes(b'x')
    html = '<html><body><a href="http://photo.footbag.org/worlds96/001.jpg">pic</a></body></html>'
    out = mirror_script.rewrite_links(html, mirror_script.BASE_URL + '/gallery/show/1')
    assert 'photo.footbag.org' not in out
    assert 'worlds96/001.jpg' in out


def test_dead_host_link_without_capture_is_unwrapped_to_text(mirror_env):
    html = '<html><body><a href="http://list.footbag.org/archive/1994">old list</a></body></html>'
    out = mirror_script.rewrite_links(html, mirror_script.BASE_URL + '/gallery/show/1')
    assert 'list.footbag.org' not in out          # no legacy hostname survives
    assert 'old list' in out                      # the anchor text is kept
    assert 'unarchived legacy host' in out        # the removal is marked


# ── Footbag-domain predicate: apex + subdomains only, never a lookalike ───────

def test_footbag_domain_predicate_rejects_lookalikes():
    # The apex and any subdomain classify as footbag-internal.
    assert mirror_script.is_footbag_domain('http://footbag.org/x')
    assert mirror_script.is_footbag_domain('http://www.footbag.org/x')
    assert mirror_script.is_footbag_domain('http://sites.footbag.org/reference/')
    assert mirror_script.is_footbag_domain('http://photo.footbag.org/a.jpg')
    assert mirror_script.is_footbag_domain('http://WWW.Footbag.ORG/x')   # case-insensitive
    assert mirror_script.is_footbag_domain('http://www.footbag.org:80/x') # port ignored
    # A lookalike that merely ends with the same text is NOT footbag-internal.
    assert not mirror_script.is_footbag_domain('http://evilfootbag.org/x')
    assert not mirror_script.is_footbag_domain('http://notfootbag.org/x')
    assert not mirror_script.is_footbag_domain('http://footbag.org.evil.com/x')
    assert not mirror_script.is_footbag_domain('http://example.com/x')


def test_footbag_domain_tightening_does_not_broaden_fetch_scope():
    # The exact-host fetch allowlist is unchanged: only the two crawl hosts are
    # fetched. A real footbag subdomain that is not a crawl host, and a lookalike,
    # both stay out of scope.
    assert mirror_script.is_in_scope('http://www.footbag.org/news/show/1')
    assert mirror_script.is_in_scope('http://sites.footbag.org/reference/')
    assert not mirror_script.is_in_scope('http://photo.footbag.org/a.jpg')   # footbag, not a crawl host
    assert not mirror_script.is_in_scope('http://evilfootbag.org/x')          # lookalike


def test_external_link_becomes_text_carrying_its_destination(mirror_env):
    # No link to somebody else's website stays clickable in the archive. The
    # capture is taken once and never refreshed, so a destination that is fine
    # on capture day can be an abandoned domain in someone else's hands years
    # later, and a live link would be the archive vouching for wherever it then
    # leads. The address is still shown, so a reader can follow it deliberately,
    # and it is never relativized into a false local path.
    html = ('<html><body>'
            '<a href="http://example.com/some/page">external</a>'
            '</body></html>')
    out = mirror_script.rewrite_links(html, mirror_script.BASE_URL + '/news/show/1')
    assert 'http://example.com/some/page' in out   # destination still readable
    assert '<a ' not in out                         # nothing left to click
    assert 'external' in out                        # the link's own words survive


def test_outbound_link_that_was_never_a_url_is_deleted(mirror_env):
    # Legacy forms accepted anything in a website field, so the capture carries
    # strings that were never addresses. Showing those as text would be noise;
    # they go entirely, while the surrounding sentence stays.
    html = ('<html><body><p>Club site: '
            '<a href="http://Coming">Coming soon</a> and more text</p></body></html>')
    out = mirror_script.rewrite_links(html, mirror_script.BASE_URL + '/clubs/show/1')
    assert 'Coming soon' not in out
    assert 'http://Coming' not in out
    assert 'and more text' in out


def test_links_inside_the_archive_stay_clickable(mirror_env):
    # Browsing is the only way legacy content is reachable, so internal
    # navigation is untouched by the outbound rule.
    html = ('<html><body>'
            f'<a href="{mirror_script.BASE_URL}/clubs/index">clubs</a>'
            '</body></html>')
    out = mirror_script.rewrite_links(html, mirror_script.BASE_URL + '/news/show/1')
    assert '<a ' in out
    assert 'clubs' in out


# ── Per-host politeness ──────────────────────────────────────────────────────

def test_polite_wait_paces_per_host_independently(monkeypatch):
    clock = {'now': 1000.0}
    sleeps = []
    monkeypatch.setattr(mirror_script.time, 'time', lambda: clock['now'])
    monkeypatch.setattr(mirror_script.time, 'sleep',
                        lambda s: (sleeps.append(s), clock.__setitem__('now', clock['now'] + s)))
    monkeypatch.setattr(mirror_script, '_last_request_at', {})

    mirror_script.polite_wait(BASE + '/a')
    assert sleeps == []                       # first www request: no wait
    mirror_script.polite_wait('http://sites.footbag.org/b')
    assert sleeps == []                       # first vhost request: unaffected by www
    mirror_script.polite_wait(BASE + '/c')    # immediate second www request: waits
    assert len(sleeps) == 1 and sleeps[0] == pytest.approx(mirror_script.DELAY_SECONDS)
    clock['now'] += mirror_script.DELAY_SECONDS * 2
    mirror_script.polite_wait(BASE + '/d')    # enough time elapsed: no wait
    assert len(sleeps) == 1


# WordPress traps apply by path, not by host. The championship microsites and
# the reference wiki are served under www as well as under the vhost, so a
# host-scoped rule let the same API endpoints through under www: nearly two
# thousand of them were captured that way, and because a URL's query is dropped
# when it becomes a filename, they all overwrote one file each.
#
# None of it is content. An oembed response carries a post's title and an embed
# snippet, never the post; a feed is a subscription endpoint; and ?p= addresses a
# post its own permalink already stores.

def test_wordpress_api_endpoints_are_refused_under_www(monkeypatch):
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    for url in (
        'http://www.footbag.org/reference2/wp-json/oembed/1.0/embed?url=x',
        'http://www.footbag.org/worlds2012/feed/',
        'http://www.footbag.org/worlds2013/comments/feed/',
        'http://www.footbag.org/worlds2012/2012/04/01/welcome/trackback/',
    ):
        assert not mirror_script.is_in_scope(url), url


def test_wordpress_id_style_urls_are_refused_under_www(monkeypatch):
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    for url in (
        'http://www.footbag.org/reference2/?p=13',
        'http://www.footbag.org/worlds2016/?p=272',
        'http://www.footbag.org/worlds2011/?page_id=7',
    ):
        assert not mirror_script.is_in_scope(url), url


def test_the_pages_that_hold_the_content_stay_in_scope(monkeypatch):
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    for url in (
        'http://www.footbag.org/reference2/footbag-hall-of-fame/',
        'http://www.footbag.org/worlds2012/sponsors/',
        'http://www.footbag.org/worlds2017/2017/07/24/players-booklet/',
        'http://sites.footbag.org/reference/freestyle/',
    ):
        assert mirror_script.is_in_scope(url), url


def test_a_media_directory_is_not_mistaken_for_a_date_archive(monkeypatch):
    # The date-archive rule matches /<segment>/<four digits>/, which on www also
    # describes a media directory. It stays scoped to the vhost for that reason.
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    assert mirror_script.is_in_scope('http://www.footbag.org/media/1338/')
    assert not mirror_script.is_in_scope('http://sites.footbag.org/worlds2012/2012/')


def test_an_id_style_query_deeper_than_a_site_root_is_legacy_pagination(monkeypatch):
    # 'p' and 'm' name a WordPress post id at a site root and an ordinary
    # pagination or mode parameter anywhere else. Depth is what tells them apart,
    # so a legacy page keeps its query rather than being mistaken for a trap.
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    assert mirror_script.is_in_scope(
        'http://www.footbag.org/events/show/1741024635?p=2')
    assert mirror_script.is_in_scope(
        'http://www.footbag.org/gallery/showset/58?m=list')
    assert not mirror_script.is_in_scope('http://www.footbag.org/reference2/?p=13')
