"""Resources pages load from other websites, in create_mirror_footbag_org.py.

The archive is static and members-only. A player embedded from another site
runs script, a picture hotlinked from another site never went through the
re-encode every archived image gets, and each such request tells another server
who is reading. Pictures that still load are captured and re-encoded like any
other image; everything else from another site is removed, keeping its address
as text the way an outbound link does. Avatar images are never kept in any form,
because their addresses are hashes of commenters' e-mail addresses.

All fixtures are local; no network. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_offsite_resources.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest
import requests

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_offsite', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_offsite'] = mirror_script
spec.loader.exec_module(mirror_script)

JPEG = b'\xff\xd8\xff\xe0' + b'jpeg-body' * 4
PNG = b'\x89PNG\r\n\x1a\n' + b'png-body' * 4


class _Response:
    def __init__(self, status=200, body=b''):
        self.status_code = status
        self._body = body

    def iter_content(self, chunk_size=8192):
        for i in range(0, len(self._body), chunk_size):
            yield self._body[i:i + chunk_size]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _Web:
    """Stands in for other websites: url -> response, or an exception to raise."""

    def __init__(self, routes):
        self.routes = routes
        self.requested = []

    def get(self, url, **kwargs):
        self.requested.append(url)
        answer = self.routes.get(url, _Response(404))
        if isinstance(answer, Exception):
            raise answer
        return answer


class _NoNetwork:
    def get(self, url, **kwargs):
        raise AssertionError(f'unexpected network request: {url}')


def _fake_reencode(path, ext):
    # The real re-encode runs ffmpeg; what the pass depends on is its contract:
    # a .jpg (or .gif) beside a sidecar, the source removed when renamed.
    out = str(Path(path).with_suffix('.gif' if ext == '.gif' else '.jpg'))
    if out != path:
        os.replace(path, out)
    Path(out + '.sanitized').touch()
    return out


@pytest.fixture
def www(tmp_path, monkeypatch):
    root = tmp_path / 'www.footbag.org'
    root.mkdir()
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))
    monkeypatch.setattr(mirror_script, 'mirror_state', mirror_script.MirrorState())
    monkeypatch.setattr(mirror_script, 'polite_wait', lambda url: None)
    monkeypatch.setattr(mirror_script, 'OFFSITE_CONNECT_RETRY_PAUSE_SECONDS', 0)
    monkeypatch.setattr(mirror_script, 'convert_and_cleanup', _fake_reencode)
    monkeypatch.setattr(mirror_script, 'public_session', _NoNetwork())
    monkeypatch.setattr(mirror_script, 'session', _NoNetwork())
    return root


def _web(monkeypatch, routes):
    web = _Web(routes)
    monkeypatch.setattr(mirror_script, 'public_session', web)
    return web


def _page(www, relative, body):
    path = www / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<html><body>{body}</body></html>', encoding='utf-8')
    return path


def _soup(path):
    return mirror_script.BeautifulSoup(path.read_text(encoding='utf-8'), 'html.parser')


def _resolves(page, src):
    return (page.parent / src).resolve().is_file()


# ---- capture ----

def test_a_picture_that_still_loads_is_captured_reencoded_and_linked(www, monkeypatch):
    url = 'http://bigaddposse.com/img/ken-shults.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG)})
    page = _page(www, 'sites/reference/freestyle/big-add-posse/index.html',
                 f'<img src="{url}" alt="Ken Shults"/>')
    mirror_script.settle_offsite_resources(capture=True)
    img = _soup(page).find('img')
    src = img['src']
    assert img['alt'] == 'Ken Shults'
    assert src.startswith('../../../../_offsite/bigaddposse.com/')
    assert _resolves(page, src)
    assert Path(str((page.parent / src).resolve()) + '.sanitized').is_file()


def test_a_picture_whose_reencode_fails_is_never_linked_raw(www, monkeypatch):
    # A failed re-encode hands back the raw bytes. Linked, they are unscanned
    # bytes the publisher refuses; the picture must go instead.
    url = 'http://bigaddposse.com/img/broken.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG)})
    monkeypatch.setattr(mirror_script, 'convert_and_cleanup', lambda path, ext: path)
    page = _page(www, 'freestyle/index.html', f'<img src="{url}" alt="Broken"/>')
    mirror_script.settle_offsite_resources(capture=True)
    assert _soup(page).find('img') is None
    assert not list((www / '_offsite').rglob('*.jpg'))


def test_a_foreign_path_named_like_an_excluded_legacy_section_is_still_captured(www, monkeypatch):
    # The legacy site's exclusion and admin-route rules match path segments;
    # applied to another host they would throw away a perfectly good picture.
    url = 'http://example.org/ranking/admin/photo.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG)})
    page = _page(www, 'news/index.html', f'<img src="{url}"/>')
    mirror_script.settle_offsite_resources(capture=True)
    assert '_offsite/example.org/' in _soup(page).find('img')['src']


def test_two_pictures_differing_only_in_extension_get_their_own_files(www, monkeypatch):
    png_url = 'http://example.org/pics/team.png'
    jpg_url = 'http://example.org/pics/team.jpg'
    _web(monkeypatch, {png_url: _Response(body=PNG), jpg_url: _Response(body=JPEG + b'x')})
    page = _page(www, 'news/index.html', f'<img src="{png_url}"/><img src="{jpg_url}"/>')
    mirror_script.settle_offsite_resources(capture=True)
    first, second = [img['src'] for img in _soup(page).find_all('img')]
    assert first != second
    assert _resolves(page, first) and _resolves(page, second)


def test_a_name_holding_a_hash_and_a_space_still_gives_a_working_link(www, monkeypatch):
    url = 'http://example.org/pics/Worlds%2005%20%231.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG)})
    page = _page(www, 'news/index.html', f'<img src="{url}"/>')
    mirror_script.settle_offsite_resources(capture=True)
    src = _soup(page).find('img')['src']
    assert '#' not in src and ' ' not in src and '%' not in src
    assert _resolves(page, src)


def test_a_body_over_the_size_cap_leaves_nothing_behind(www, monkeypatch):
    monkeypatch.setattr(mirror_script, 'OFFSITE_IMAGE_MAX_BYTES', 64)
    url = 'http://example.org/pics/huge.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG + b'0' * 200)})
    page = _page(www, 'news/index.html', f'<img src="{url}"/>')
    mirror_script.settle_offsite_resources(capture=True)
    assert _soup(page).find('img') is None
    offsite = www / '_offsite'
    assert not offsite.exists() or not [p for p in offsite.rglob('*') if p.is_file()]


def test_one_stock_image_behind_many_addresses_is_treated_as_gone(www, monkeypatch):
    # Image hosts answer a removed picture with one "unavailable" image.
    # Archived, it would stand in for the photographs it replaced.
    urls = [f'http://i44.photobucket.com/albums/x/{n}.jpg' for n in range(3)]
    _web(monkeypatch, {u: _Response(body=JPEG) for u in urls})
    page = _page(www, 'gallery/show/1/index.html',
                 ''.join(f'<img src="{u}" alt="photo {n}"/>' for n, u in enumerate(urls)))
    mirror_script.settle_offsite_resources(capture=True)
    assert _soup(page).find('img') is None


def test_one_real_picture_used_under_two_addresses_is_kept(www, monkeypatch):
    urls = [f'http://example.org/pics/{n}.jpg' for n in range(2)]
    _web(monkeypatch, {u: _Response(body=JPEG) for u in urls})
    page = _page(www, 'news/index.html', ''.join(f'<img src="{u}"/>' for u in urls))
    mirror_script.settle_offsite_resources(capture=True)
    assert len(_soup(page).find_all('img')) == 2


# ---- avatars ----

def test_an_avatar_leaves_no_trace_of_its_address(www, monkeypatch):
    # The address is a hash of the commenter's e-mail; neither the picture,
    # its address as text, nor a file named after it may survive.
    web = _web(monkeypatch, {})
    page = _page(www, 'sites/worlds2014/2014/08/01/393/index.html',
                 '<img alt="" src="http://1.gravatar.com/avatar/49fd22?s=34&amp;d=mm" '
                 'srcset="http://1.gravatar.com/avatar/49fd22?s=68&amp;d=mm 2x"/>'
                 '<p>Comment text</p>')
    mirror_script.settle_offsite_resources(capture=True)
    out = page.read_text(encoding='utf-8')
    assert 'gravatar' not in out and '49fd22' not in out
    assert 'Comment text' in out
    assert web.requested == []


# ---- what no longer loads ----

def test_a_dead_picture_keeps_its_caption_and_address_as_text(www, monkeypatch):
    url = 'http://www.kapsi.fi/~jfk/kuvat/worlds05_81.JPG'
    _web(monkeypatch, {url: _Response(404)})
    page = _page(www, 'gallery/show/5207/index.html', f'<img src="{url}" alt="Worlds 2005"/>')
    mirror_script.settle_offsite_resources(capture=True)
    out = _soup(page)
    assert out.find('img') is None
    assert f'Worlds 2005 ({url})' in out.get_text()


def test_a_host_that_no_longer_resolves_is_not_asked_twice(www, monkeypatch):
    dns = requests.exceptions.ConnectionError('Failed to resolve footbagdenmark.dk')
    urls = ['http://footbagdenmark.dk/a.gif', 'http://footbagdenmark.dk/b.gif']
    web = _web(monkeypatch, {u: dns for u in urls})
    page = _page(www, 'news/index.html', ''.join(f'<img src="{u}"/>' for u in urls))
    mirror_script.settle_offsite_resources(capture=True)
    assert _soup(page).find('img') is None
    assert len(web.requested) == 1


def test_a_page_answered_instead_of_a_picture_is_not_kept(www, monkeypatch):
    url = 'https://www.instagram.com/p/BHtXHtZBjFl/'
    _web(monkeypatch, {url: _Response(body=b'<!doctype html><html>login</html>')})
    page = _page(www, 'gallery/show/18376/index.html', f'<img src="{url}"/>')
    mirror_script.settle_offsite_resources(capture=True)
    assert _soup(page).find('img') is None
    offsite = www / '_offsite'
    assert not offsite.exists() or not [p for p in offsite.rglob('*') if p.is_file()]


class _Sequence(_Web):
    """Answers one address differently on each request."""

    def __init__(self, answers):
        super().__init__({})
        self.answers = list(answers)

    def get(self, url, **kwargs):
        self.requested.append(url)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def test_a_host_that_never_accepts_a_connection_is_settled_not_retried_forever(www, monkeypatch):
    # Long-gone hosts time out on connect every time. Left as "try later" the
    # tree could never be published; one retry is all they get.
    never = requests.exceptions.ConnectTimeout('Connection timed out')
    web = _Sequence([never, never])
    monkeypatch.setattr(mirror_script, 'public_session', web)
    url = 'http://www.footbag.hu/img/maps/2camp01.jpg'
    page = _page(www, 'events/show/1153758494/index.html', f'<img src="{url}" alt="Camp map"/>')
    counts = mirror_script.settle_offsite_resources(capture=True)
    assert _soup(page).find('img') is None
    assert f'Camp map ({url})' in _soup(page).get_text()
    assert len(web.requested) == 2 and counts['transient'] == 0


def test_a_connection_that_fails_once_is_retried_and_captured(www, monkeypatch):
    # A blip on this end must not cost a picture that is still there.
    web = _Sequence([requests.exceptions.ConnectionError('reset'), _Response(body=JPEG)])
    monkeypatch.setattr(mirror_script, 'public_session', web)
    url = 'http://bigaddposse.com/img/ken-shults.jpg'
    page = _page(www, 'news/index.html', f'<img src="{url}"/>')
    mirror_script.settle_offsite_resources(capture=True)
    assert '_offsite/bigaddposse.com/' in _soup(page).find('img')['src']


def test_a_temporary_failure_leaves_the_page_exactly_as_it_was(www, monkeypatch):
    # Removing a picture over a timeout would lose one that a re-run captures.
    url = 'http://example.org/pics/slow.jpg'
    _web(monkeypatch, {url: requests.exceptions.ReadTimeout('slow')})
    page = _page(www, 'news/index.html', f'<img src="{url}"/>')
    before = page.read_bytes()
    counts = mirror_script.settle_offsite_resources(capture=True)
    assert page.read_bytes() == before
    assert counts['transient'] == 1


def test_an_address_wrapped_across_lines_is_read_whole(www, monkeypatch):
    url = 'http://example.org/pics/wrapped.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG)})
    page = _page(www, 'news/index.html', '<img src="http://example.org/pics/\nwrapped.jpg"/>')
    mirror_script.settle_offsite_resources(capture=True)
    assert '_offsite/example.org/' in _soup(page).find('img')['src']


# ---- embeds ----

def test_an_embedded_player_is_replaced_by_its_address(www, monkeypatch):
    url = 'https://www.youtube.com/embed/CnqES24g2tE?feature=oembed'
    _web(monkeypatch, {})
    page = _page(www, 'worlds2017/2017/05/index.html',
                 f'<p>Finals</p><iframe src="{url}" width="640"></iframe>')
    mirror_script.settle_offsite_resources(capture=True)
    out = _soup(page)
    assert out.find('iframe') is None
    assert f'({url})' in out.get_text()


def test_a_flash_object_goes_as_one_piece(www, monkeypatch):
    movie = 'http://vimeo.com/moogaloop.swf?clip_id=1'
    page = _page(www, 'events/show/1/index.html',
                 f'<object width="400"><param name="movie" value="{movie}"/>'
                 f'<param name="allowfullscreen" value="true"/>'
                 f'<embed src="{movie}" type="application/x-shockwave-flash"/></object>'
                 '<p>Report</p>')
    mirror_script.settle_offsite_resources(capture=False)
    out = _soup(page)
    assert out.find('object') is None and out.find('embed') is None and out.find('param') is None
    assert out.get_text().count(movie) == 1
    assert 'Report' in out.get_text()


def test_a_video_whose_only_source_is_another_site_becomes_its_address(www, monkeypatch):
    # Removing the source alone would leave an empty player and, on a page
    # holding nothing else, an empty page.
    url = 'http://www.youtube.com/watch?v=JTBff1h5JCk'
    page = _page(www, 'gallery/showalt/68/index.html',
                 f'<video controls=""><source src="{url}" type="video/mp4"/></video>')
    mirror_script.settle_offsite_resources(capture=False)
    out = _soup(page)
    assert out.find('video') is None
    assert url in out.get_text()


def test_a_local_source_beside_a_foreign_one_keeps_the_video(www, monkeypatch):
    page = _page(www, 'gallery/show/9/index.html',
                 '<video controls=""><source src="../../../media/9/clip.mp4"/>'
                 '<source src="http://open2006.footbagnet0.free.fr/clip.avi"/></video>')
    mirror_script.settle_offsite_resources(capture=False)
    video = _soup(page).find('video')
    assert video is not None
    assert [s['src'] for s in video.find_all('source')] == ['../../../media/9/clip.mp4']


# ---- the pass itself ----

def test_without_capture_nothing_is_fetched_and_pictures_wait(www, monkeypatch):
    # The settling mode promises no network. A picture not yet captured must be
    # left for the capture run, not destroyed; embeds still go.
    url = 'http://bigaddposse.com/img/ken-shults.jpg'
    page = _page(www, 'news/index.html',
                 f'<img src="{url}"/><iframe src="https://player.vimeo.com/video/1"></iframe>')
    counts = mirror_script.settle_offsite_resources(capture=False)
    out = _soup(page)
    assert out.find('img')['src'] == url
    assert out.find('iframe') is None
    assert counts['pending'] == 1


def test_a_second_run_changes_nothing(www, monkeypatch):
    url = 'http://bigaddposse.com/img/ken-shults.jpg'
    _web(monkeypatch, {url: _Response(body=JPEG)})
    page = _page(www, 'news/index.html',
                 f'<img src="{url}"/><iframe src="https://www.youtube.com/embed/x"></iframe>')
    mirror_script.settle_offsite_resources(capture=True)
    after_first = page.read_bytes()
    monkeypatch.setattr(mirror_script, 'public_session', _NoNetwork())
    mirror_script.settle_offsite_resources(capture=True)
    assert page.read_bytes() == after_first


def test_xml_filed_under_a_page_name_is_left_alone(www, monkeypatch):
    path = www / 'news' / 'feed.html'
    path.parent.mkdir(parents=True)
    body = (b'<?xml version="1.0"?><rss><item><description>'
            b'<iframe src="https://www.youtube.com/embed/x"></iframe>'
            b'</description></item></rss>')
    path.write_bytes(body)
    mirror_script.settle_offsite_resources(capture=False)
    assert path.read_bytes() == body


def test_a_protocol_relative_reference_is_not_judged_a_missing_local_file(www, monkeypatch):
    # Read as a root path, '//host/x.jpg' was reported missing and deleted by
    # the dead-link pass, losing the address before anything could capture it.
    page = _page(www, 'news/index.html', '<img src="//example.org/pics/a.jpg"/>')
    assert mirror_script._dangling_refs(page, www) == []
    mirror_script.neutralize_dead_internal_links()
    assert _soup(page).find('img')['src'] == '//example.org/pics/a.jpg'


def test_the_capture_prefix_can_never_be_claimed_by_a_legacy_page():
    assert not mirror_script.is_in_scope('http://www.footbag.org/_offsite/example.org/a.jpg')


def test_every_settling_path_handles_other_sites_before_judging_dead_links():
    # Reversed, the dead-link pass runs before a picture is captured or an
    # embed removed, and settles a tree the next pass then changes.
    source = SCRIPT_PATH.read_text(encoding='utf-8')

    def block(start, end):
        at = source.index(start)
        return source[at:source.index(end, at)]

    for where, text, call in (
            ('the crawl end', block('def generate_reachability_pages(', '\ndef '),
             'settle_offsite_resources(capture=True)'),
            ('the settle pass', block('if args.settle_for_publication_only:', '\n    if args.'),
             'settle_offsite_resources(capture=False)'),
            ('the capture mode', block('if args.capture_offsite_images_only:', '\n    if args.'),
             'settle_offsite_resources(capture=True)')):
        assert call in text, where
        assert text.index(call) < text.index('neutralize_dead_internal_links()'), where
