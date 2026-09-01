"""How a captured page's references are read, in create_mirror_footbag_org.py.

One resolver answers two questions the archive depends on: which pages are
reachable by browsing, and which references point at nothing. Three shapes make
a naive byte scan answer both wrongly. Markup the legacy site commented out and
left in place is not a reference at all, and one commented search block in the
site-wide template outweighs every genuine broken link in the capture. A name
holding an ampersand reaches disk decoded, so comparing the encoded form reports
a photo that is present as missing, and stops the dead-link pass from ever
matching a genuinely dead one against the parsed page. And a reference beginning
'/' is site-root-relative, so discarding it leaves it neither repaired nor
neutralized.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_reference_resolution.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_refs', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_refs'] = mirror_script
spec.loader.exec_module(mirror_script)


@pytest.fixture
def www(tmp_path):
    root = tmp_path / 'www.footbag.org'
    root.mkdir()
    return root


def _page(www, relative, body):
    path = www / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<html><body>{body}</body></html>', encoding='utf-8')
    return path


def test_markup_inside_a_comment_is_not_a_reference(www):
    page = _page(www, 'freestyle/index.html',
                 '<!-- <IMG SRC="/img/gallery/buttons/b-search.gif"> -->')
    assert mirror_script._dangling_refs(page, www) == []


def test_markup_a_page_displays_as_words_is_not_a_reference(www):
    # A page showing its own template source has the angle brackets escaped, so
    # nothing is a tag and a browser requests nothing, but the attribute inside
    # still sits in plain quotes.
    page = _page(www, 'gallery/showset/1749/index.html',
                 '&lt;IMG SRC="/img/gallery/buttons/b-search.gif" WIDTH="110"&gt;')
    assert mirror_script._dangling_refs(page, www) == []


def test_escaped_markup_does_not_hide_a_real_reference_beside_it(www):
    page = _page(www, 'gallery/showset/1749/index.html',
                 '&lt;IMG SRC="/img/gallery/buttons/b-search.gif"&gt;'
                 '<img src="/img/gallery/buttons/b-clubs.gif">')
    refs = [ref for ref, _fix in mirror_script._dangling_refs(page, www)]
    assert refs == ['/img/gallery/buttons/b-clubs.gif']


def test_a_comment_does_not_make_a_page_look_reachable(www):
    # Reachability read from commented markup would hide a page that in truth
    # nothing links, which is exactly what the listing exists to surface.
    _page(www, 'clubs/index.html', '<!-- <a href="show/1/index.html">Alpha</a> -->')
    target = _page(www, 'clubs/show/1/index.html', 'Alpha')
    assert str(target.resolve()) not in mirror_script._linked_targets(www, exclude=[])


def test_a_name_holding_an_ampersand_resolves_to_the_file_on_disk(www):
    (www / 'media').mkdir()
    (www / 'media' / 'Greg&Arthur.jpg').write_text('x', encoding='utf-8')
    page = _page(www, 'events/show/1/index.html',
                 '<img src="../../../media/Greg&amp;Arthur.jpg">')
    assert mirror_script._dangling_refs(page, www) == []


def test_a_missing_name_holding_an_ampersand_is_still_reported(www):
    page = _page(www, 'gallery/member/1/index.html',
                 '<img src="../../../media/Ners &amp; Rozo.jpg">')
    refs = [ref for ref, _fix in mirror_script._dangling_refs(page, www)]
    # Reported in the decoded form, which is what a parsed attribute carries and
    # therefore the only form the dead-link pass can act on.
    assert refs == ['../../../media/Ners & Rozo.jpg']


def test_a_site_root_relative_reference_resolves_against_the_tree_root(www):
    (www / 'img').mkdir()
    (www / 'img' / 'logo.gif').write_text('x', encoding='utf-8')
    page = _page(www, 'events/show/1/index.html', '<img src="/img/logo.gif">')
    assert mirror_script._dangling_refs(page, www) == []


def test_a_missing_site_root_relative_reference_is_reported(www):
    page = _page(www, 'footbags/sipa.html', '<a href="/players/brat.html">brat</a>')
    refs = [ref for ref, _fix in mirror_script._dangling_refs(page, www)]
    assert refs == ['/players/brat.html']


def test_a_reference_leaving_the_capture_is_left_alone(www):
    page = _page(www, 'events/show/1/index.html',
                 '<a href="../../../../outside.html">up and out</a>')
    assert mirror_script._dangling_refs(page, www) == []


def test_an_svg_sprite_reference_is_seen(www):
    # The Worlds microsites reach their icons through <use xlink:href>, which a
    # scan for href and src alone never sees.
    page = _page(www, 'sites/worlds2016/index.html',
                 '<svg><use xlink:href="/worlds2016/img/icons.svg#icon-logo"></use></svg>')
    refs = [ref for ref, _fix in mirror_script._dangling_refs(page, www)]
    assert refs == ['/worlds2016/img/icons.svg#icon-logo']


def test_one_extra_parent_step_is_offered_as_a_repair(www):
    (www / 'rules').mkdir()
    (www / 'rules' / 'chapter.html').write_text('x', encoding='utf-8')
    page = _page(www, 'rules/index.html', '<a href="../chapter.html">ch</a>')
    assert mirror_script._dangling_refs(page, www) == [('../chapter.html', 'chapter.html')]


def test_a_dead_head_link_is_cleared_not_only_a_dead_anchor(monkeypatch, www):
    # The Worlds microsites carry feed and API links in the head that point at
    # files no crawl captured. Walking only anchors and images leaves thousands
    # of them in the published archive.
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
    _page(www, 'worlds2012/index.html',
          '<link rel="alternate" href="../wp-json/index.html">'
          '<a href="../gone.html">gone</a>')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'worlds2012' / 'index.html').read_text(encoding='utf-8')
    assert 'wp-json' not in out
    assert 'gone.html' not in out


def test_a_dead_sprite_reference_is_cleared(monkeypatch, www):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
    _page(www, 'sites/worlds2016/index.html',
          '<svg><use xlink:href="/worlds2016/img/icons.svg#icon-logo"></use></svg>')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'sites' / 'worlds2016' / 'index.html').read_text(encoding='utf-8')
    assert 'icons.svg' not in out


class TestReferencesStillNamingTheRetiredHost:
    """An absolute address on the crawled hosts is a reference the capture did
    not bring home. It worked while the legacy site answered; once that name
    belongs to the new site every one of them is a not-found page, so they are
    settled before publication rather than left for a reader to find.
    """

    @pytest.fixture(autouse=True)
    def _state(self, monkeypatch, www):
        monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
        state = mirror_script.MirrorState()
        monkeypatch.setattr(mirror_script, 'mirror_state', state)
        return state

    def test_a_reference_whose_file_is_on_disk_is_pointed_at_it(self, www):
        (www / 'media').mkdir()
        (www / 'media' / 'clip.mp4').write_text('x', encoding='utf-8')
        page = _page(www, 'gallery/show/1/index.html',
                     '<img src="http://www.footbag.org/media/clip.mp4"/>')
        mirror_script.neutralize_retired_host_links()
        out = page.read_text(encoding='utf-8')
        assert 'http://www.footbag.org' not in out
        assert 'clip.mp4' in out

    def test_a_link_to_nothing_keeps_its_words_and_loses_the_anchor(self, www):
        page = _page(www, 'news/list_2006/index.html',
                     '<a href="http://www.footbag.org/worlds2006/">Worlds 2006</a>')
        mirror_script.neutralize_retired_host_links()
        out = page.read_text(encoding='utf-8')
        assert 'worlds2006' not in out
        assert 'Worlds 2006' in out

    def test_the_banner_link_to_the_live_site_survives(self, www):
        page = _page(www, 'index.html',
                     '<a href="https://www.footbag.org">Live site: www.footbag.org</a>')
        mirror_script.neutralize_retired_host_links()
        assert 'https://www.footbag.org' in page.read_text(encoding='utf-8')

    def test_a_video_still_waiting_for_the_backfill_is_left_alone(self, www, _state):
        url = 'http://www.footbag.org/media/pending.mov'
        _state.skipped_videos = {
            mirror_script.normalize_url(url): {'url': url, 'disposition': 'skipped_video'}}
        page = _page(www, 'gallery/show/2/index.html', f'<a href="{url}">watch</a>')
        mirror_script.neutralize_retired_host_links()
        assert url in page.read_text(encoding='utf-8')

    def test_a_video_the_backfill_failed_is_left_for_the_backfill_to_settle(self, www, _state):
        # The backfill retries a failure below the attempt cap, and even past
        # the cap its gave-up branch still repairs the referring pages itself
        # (the not-available wording). The original address is the only handle
        # that repair has for finding the element, so neutralizing it here
        # would ship a later-recovered video with no page linking it.
        url = 'http://www.footbag.org/media/gone.mov'
        _state.skipped_videos = {
            mirror_script.normalize_url(url): {'url': url, 'disposition': 'backfill_failed'}}
        page = _page(www, 'gallery/showset/1/index.html', f'<img src="{url}"/>')
        mirror_script.neutralize_retired_host_links()
        assert 'footbag.org/media/gone.mov' in page.read_text(encoding='utf-8')

    def test_a_video_the_backfill_refused_is_not_left_standing(self, www, _state):
        # A refused record is the one disposition the backfill never repairs
        # referrers for, so its address has no repair waiting on it and keeping
        # it publishes a link to a host that is going away.
        url = 'http://www.footbag.org/media/withheld.mov'
        _state.skipped_videos = {
            mirror_script.normalize_url(url): {
                'url': url, 'disposition': 'backfill_refused_excluded'}}
        page = _page(www, 'gallery/showset/3/index.html', f'<img src="{url}"/>')
        mirror_script.neutralize_retired_host_links()
        assert 'footbag.org/media/withheld.mov' not in page.read_text(encoding='utf-8')

    def test_a_non_standard_attribute_is_dropped_and_the_real_one_kept(self, www):
        (www / 'media').mkdir()
        (www / 'media' / 'logo.jpg').write_text('x', encoding='utf-8')
        page = _page(www, 'news/list_2012/index.html',
                     '<img altsrc="http://www.footbag.org/media/absent.png"'
                     ' src="../media/logo.jpg"/>')
        mirror_script.neutralize_retired_host_links()
        out = page.read_text(encoding='utf-8')
        assert 'altsrc' not in out
        assert 'media/logo.jpg' in out


class TestRedirectStubsThatLeadNowhere:
    """A stub stands in for an address the live site answered with a redirect.

    Where the page it points at was refused or never captured, the refresh still
    fires and the reader lands on nothing. The stub is the artifact a reader
    reaches, so it has to say what happened rather than send them onward.
    """

    @staticmethod
    def _stub(www, relative, target, reversed_attributes=False):
        meta = (f'<meta content="0; url={target}" http-equiv="refresh"/>'
                if reversed_attributes else
                f'<meta http-equiv="refresh" content="0; url={target}">')
        path = www / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f'<html><head>{meta}<title>Redirecting</title></head>'
            f'<body><p>Redirecting to <a href="{target}">{target}</a></p></body></html>',
            encoding='utf-8')
        return path

    def test_a_stub_whose_target_is_captured_is_left_alone(self, monkeypatch, www):
        monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
        _page(www, 'clubs/show/alpha/index.html', 'Alpha Footbag Club')
        stub = self._stub(www, 'clublist/alpha/index.html',
                          '../../clubs/show/alpha/index.html')
        mirror_script.convert_dead_redirect_stubs()
        assert 'clubs/show/alpha' in stub.read_text(encoding='utf-8')

    def test_a_stub_whose_target_is_missing_says_so(self, monkeypatch, www):
        monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
        stub = self._stub(www, 'clublist/aufo/index.html',
                          '../../clubs/show/aufo/index.html')
        mirror_script.convert_dead_redirect_stubs()
        out = stub.read_text(encoding='utf-8')
        assert 'refresh' not in out
        assert 'not part of the footbag.org archive' in out

    def test_the_attribute_order_a_reparse_produces_is_recognised(self, monkeypatch, www):
        monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
        stub = self._stub(www, 'clublist/bafl/index.html',
                          '../../clubs/show/bafl/index.html',
                          reversed_attributes=True)
        mirror_script.convert_dead_redirect_stubs()
        assert 'not part of the footbag.org archive' in stub.read_text(encoding='utf-8')

    def test_a_stub_built_from_an_off_site_address_is_converted(self, monkeypatch, www):
        monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
        stub = self._stub(www, 'wfa/index.html', 'https://worldfootbag.com')
        mirror_script.convert_dead_redirect_stubs()
        assert 'not part of the footbag.org archive' in stub.read_text(encoding='utf-8')


def test_a_live_reference_survives_the_pass(monkeypatch, www):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
    (www / 'css').mkdir()
    (www / 'css' / 'site.css').write_text('body{}', encoding='utf-8')
    _page(www, 'index.html', '<link rel="stylesheet" href="css/site.css">')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'index.html').read_text(encoding='utf-8')
    assert 'css/site.css' in out


# ---- Both quote styles, without letting a match leave its own attribute ----
#
# The legacy site single-quotes a minority of attributes, so a pattern reading
# only double quotes leaves those invisible to the dead-link pass. Widening it
# with a lazy dot instead of a negated class is the trap: on this site's
# unclosed and malformed markup the dot walks through the closing quote and
# the newline into the next tag, and the whole run of garbage is reported as
# one dangling reference. Measured on the real capture, that shape turned ~700
# perfectly good links into candidates the dead-link pass would have replaced
# with plain text.

def test_a_single_quoted_reference_is_seen(www):
    (www / 'a.html').write_text('x', encoding='utf-8')
    refs = list(mirror_script._page_local_refs(b"<a href='a.html'>go</a>"))
    assert refs == ['a.html']


def test_a_double_quoted_reference_is_still_seen(www):
    refs = list(mirror_script._page_local_refs(b'<a href="a.html">go</a>'))
    assert refs == ['a.html']


def test_an_apostrophe_inside_a_double_quoted_name_survives(www):
    refs = list(mirror_script._page_local_refs(b'<img src="O\'Brien.jpg">'))
    assert refs == ["O'Brien.jpg"]


# The real bytes from gallery/show/1/index.html. An EMPTY href is what breaks
# a pattern whose value part requires at least one character: it cannot match
# the empty value, so it consumes the closing quote as content and runs on to
# the next quote anywhere later in the page, swallowing the markup between.
# 700 pages of the capture carry this shape.
_EMPTY_HREF_BLOB = (b'<td align="center"><a href=""></a></center><br/>\n'
                    b'<tr>\n<td align="right"><a href="real.html">go</a>')


def test_an_empty_href_does_not_swallow_the_markup_after_it(www):
    refs = list(mirror_script._page_local_refs(_EMPTY_HREF_BLOB))
    assert refs == ['real.html']
    assert not any('<' in ref or '\n' in ref for ref in refs)


def test_a_page_full_of_empty_hrefs_reports_no_phantom_dangling_reference(www):
    # The consequence if it did: neutralize_dead_internal_links consumes
    # _dangling_refs, so every phantom becomes a good link turned to plain
    # text. On the real capture that was ~700 of them.
    (www / 'real.html').write_text('x', encoding='utf-8')
    (www / 'index.html').write_bytes(_EMPTY_HREF_BLOB)
    dangling = list(mirror_script._dangling_refs(www / 'index.html', www))
    assert dangling == []
