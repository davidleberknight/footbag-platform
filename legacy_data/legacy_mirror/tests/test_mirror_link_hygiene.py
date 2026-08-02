"""Link-extraction hygiene in create_mirror_footbag_org.py.

extract_links turns page hrefs into crawl targets. A real URL never carries a
stray angle bracket or a control byte, and a scheme-less 'www.example.com/x'
that a page mis-authored must not be resolved under the www tree as though it
were a local path. These pin that such values are dropped before enqueue, while
ordinary relative links, dotted local filenames, and move permalinks are kept.

All pure; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_link_hygiene.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_link_hygiene', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_link_hygiene'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
PAGE = f'{BASE}/events/show/1741024635'


@pytest.fixture(autouse=True)
def _offline_robots(monkeypatch):
    # is_in_scope consults robots; keep the unit offline by allowing every URL.
    monkeypatch.setattr(mirror_script.robot_checker, 'can_fetch', lambda url: True)


def _links(html):
    return mirror_script.extract_links(html, PAGE)


def test_broken_markup_href_is_dropped():
    # '&lt;a href=' decodes to a value containing '<', which no real URL carries.
    assert _links('<a href="&lt;a href=">x</a>') == set()


def test_schemeless_bare_host_is_not_resolved_under_the_tree():
    html = (
        '<a href="www.facebook.com/events/837762289699326">fb</a>'
        '<a href="www.footbag.fr">host only</a>'
        '<a href="www.zoska.com.pl/x">host cc</a>'
    )
    links = _links(html)
    assert not any('facebook.com' in u or 'footbag.fr' in u or 'zoska' in u for u in links)


def test_ordinary_relative_and_move_links_are_kept():
    html = (
        '<a href="/faq/show/5">faq</a>'
        '<a href="chapter.html">dotted local file</a>'
        '<a href="/newmoves/show/5">move</a>'
    )
    links = _links(html)
    assert any(u.endswith('/faq/show/5') for u in links)
    assert any(u.endswith('/events/show/chapter.html') for u in links)
    assert any(u.endswith('/newmoves/show/5') for u in links)


# Outbound-link neutralization. A link to somebody else's website never stays
# clickable: the archive is captured once and never refreshed, so a destination
# verified today can be an abandoned domain re-registered by someone else years
# later, and a live link would be the archive vouching for wherever it now
# leads. What the link was SHOWING is archived content and survives, whether
# that is words or a sponsor's logo; only the clickability goes, and the
# destination is added in plain text so a reader can still go there
# deliberately. Links inside the archive stay clickable, because browsing is how
# legacy content is meant to be reached.

from bs4 import BeautifulSoup


def _neutralized(html):
    soup = BeautifulSoup(html, 'html.parser')
    counts = mirror_script.neutralize_outbound_links(soup, PAGE)
    return soup, counts


def test_outbound_text_link_becomes_its_words_and_its_destination():
    soup, (deleted, flattened, _actions) = _neutralized(
        '<p><a href="http://example.com/x">Example Site</a></p>')
    assert (deleted, flattened) == (0, 1)
    assert soup.find('a') is None
    assert 'Example Site (http://example.com/x)' in soup.get_text()


def test_outbound_link_around_a_picture_keeps_the_picture():
    soup, (_deleted, flattened, _actions) = _neutralized(
        '<p><a href="http://sponsor.example/"><img src="/logos/sponsor.gif"/></a></p>')
    assert flattened == 1
    assert soup.find('a') is None
    img = soup.find('img')
    assert img is not None and img['src'] == '/logos/sponsor.gif'
    assert 'http://sponsor.example/' in soup.get_text()


def test_outbound_link_around_words_and_a_picture_keeps_both():
    soup, _counts = _neutralized(
        '<p><a href="http://sponsor.example/">'
        '<img src="/logos/sponsor.gif"/>Our sponsor</a></p>')
    assert soup.find('a') is None
    assert soup.find('img') is not None
    text = soup.get_text()
    assert 'Our sponsor' in text and 'http://sponsor.example/' in text


def test_malformed_outbound_link_is_deleted_outright():
    soup, (deleted, flattened, _actions) = _neutralized(
        '<p><a href="http://not a host/x">junk</a></p>')
    assert (deleted, flattened) == (1, 0)
    assert soup.find('a') is None
    assert 'junk' not in soup.get_text()


def test_links_inside_the_archive_stay_clickable():
    soup, (deleted, flattened, _actions) = _neutralized(
        f'<p><a href="{BASE}/events/list">Events</a></p>')
    assert (deleted, flattened) == (0, 0)
    assert soup.find('a') is not None


def test_offsite_form_action_is_stripped():
    soup, (_deleted, _flattened, actions) = _neutralized(
        '<form action="http://www.google.com/custom"><input name="q"/></form>')
    assert actions == 1
    assert not soup.find('form').has_attr('action')


# Dead internal links. Once the crawl has drained, a link whose target is not on
# disk will never resolve: on a static host nothing fixes it later. Some targets
# are pages an exclusion ruling removed, some the crawl never reached, some the
# legacy site had already lost. The reader meets the same broken link either way.
#
# A link that is only mis-spelled is a different case and must be repaired, not
# removed: the rulebook index reaches its chapters through a path carrying one
# '../' too many, and neutralizing those would delete working navigation.

import os as _os
from pathlib import Path as _Path


def _tree(tmp_path, monkeypatch):
    root = tmp_path / 'mirror_footbag_org'
    (root / 'www.footbag.org').mkdir(parents=True)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(root))
    return root / 'www.footbag.org'


def test_dead_link_becomes_text_and_keeps_its_label(tmp_path, monkeypatch):
    www = _tree(tmp_path, monkeypatch)
    (www / 'index.html').write_text(
        '<html><body><p>To report a problem, please use our '
        '<a href="feedback/problem/index.html">trouble reporting system</a>.</p>'
        '</body></html>', encoding='utf-8')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'index.html').read_text(encoding='utf-8')
    assert '<a href="feedback/problem' not in out
    assert 'trouble reporting system' in out       # the sentence still reads


def test_live_link_is_untouched(tmp_path, monkeypatch):
    www = _tree(tmp_path, monkeypatch)
    (www / 'faq').mkdir()
    (www / 'faq/index.html').write_text('<html><body>faq</body></html>', encoding='utf-8')
    (www / 'index.html').write_text(
        '<html><body><a href="faq/index.html">FAQ</a></body></html>', encoding='utf-8')
    mirror_script.neutralize_dead_internal_links()
    assert '<a href="faq/index.html">' in (www / 'index.html').read_text(encoding='utf-8')


def test_link_with_one_too_many_parent_steps_is_repaired(tmp_path, monkeypatch):
    www = _tree(tmp_path, monkeypatch)
    (www / 'rules/chapter/20').mkdir(parents=True)
    (www / 'rules/chapter/20/index.html').write_text('ch', encoding='utf-8')
    (www / 'rules/index.html').write_text(
        '<html><body><a href="../chapter/20/index.html">Chapter 20</a></body></html>',
        encoding='utf-8')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'rules/index.html').read_text(encoding='utf-8')
    assert 'href="chapter/20/index.html"' in out    # repaired, not removed
    assert 'Chapter 20' in out


def test_uncaptured_image_reference_is_removed(tmp_path, monkeypatch):
    www = _tree(tmp_path, monkeypatch)
    (www / 'index.html').write_text(
        '<html><body><p>Sponsors</p><img src="logos/gone.gif"/></body></html>',
        encoding='utf-8')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'index.html').read_text(encoding='utf-8')
    assert '<img' not in out
    assert 'Sponsors' in out


def test_outbound_links_are_not_this_pass_concern(tmp_path, monkeypatch):
    www = _tree(tmp_path, monkeypatch)
    (www / 'index.html').write_text(
        '<html><body><a href="https://example.com/x">Example</a></body></html>',
        encoding='utf-8')
    mirror_script.neutralize_dead_internal_links()
    assert 'https://example.com/x' in (www / 'index.html').read_text(encoding='utf-8')


# A static archive has no backend, so every captured form is a control that
# cannot work. The whole form goes rather than just its action: removing only the
# action leaves a submit button that silently reloads the page.

def test_a_form_is_removed_whole():
    soup = BeautifulSoup(
        '<html><body><h1>Move list</h1>'
        '<form method="GET"><input name="q"/><input type="submit" value="Search"/></form>'
        '<p>Kept</p></body></html>', 'html.parser')
    removed = mirror_script.strip_dead_forms(soup)
    assert removed == 1
    assert soup.find('form') is None
    assert soup.find('input') is None
    text = soup.get_text(' ', strip=True)
    assert 'Move list' in text and 'Kept' in text


def test_removing_the_form_takes_its_offsite_link_with_it():
    # The site-search box wraps the Google logo. Order matters: forms are removed
    # before outbound links are flattened, or the destination is printed as text
    # inside a form that is then deleted, leaving a bare URL on the page.
    page = ('<html><body><form method="GET">'
            '<a href="http://www.google.com/"><img src="/logo.gif"/></a>'
            '<input name="q"/></form><p>Content</p></body></html>')
    soup = BeautifulSoup(page, 'html.parser')
    mirror_script.strip_dead_forms(soup)
    mirror_script.neutralize_outbound_links(soup, PAGE)
    text = soup.get_text(' ', strip=True)
    assert 'google.com' not in text
    assert 'Content' in text


def test_a_page_with_no_form_is_untouched():
    soup = BeautifulSoup('<html><body><p>Ordinary</p></body></html>', 'html.parser')
    assert mirror_script.strip_dead_forms(soup) == 0
    assert 'Ordinary' in soup.get_text()


def test_every_form_on_a_page_goes():
    soup = BeautifulSoup(
        '<html><body><form id="a"><input/></form><p>Between</p>'
        '<form id="b"><select><option>x</option></select></form></body></html>',
        'html.parser')
    assert mirror_script.strip_dead_forms(soup) == 2
    assert soup.find('form') is None
    assert 'Between' in soup.get_text()


# The link rewriter removes elements while it walks them. When it then reads a
# second attribute off one it has just removed, the read raises, the rewrite is
# abandoned for the whole page, and the page is written exactly as the legacy
# site served it: forms, scripts and off-site links all intact, and none of the
# sanitization the archive depends on applied. The page looks captured and is
# not sanitized, which is the worst shape a failure can take here, because
# nothing downstream can tell the difference.

def test_a_page_whose_rewrite_hits_a_removed_element_is_still_sanitized():
    # The shape that produced it: a gallery page embedding a video hosted on
    # the media subdomain. A <source> is read for both src and srcset, and
    # handling src removes the whole video element, so reading srcset lands on
    # what is already gone.
    html = (
        '<html><body>'
        '<video autoplay="" controls="" preload="auto" width="640" height="480">'
        '<source src="http://video.footbag.org/freestyle/spinning-osis-eric.mov" '
        'type="video/mov"/>'
        '</video>'
        '<form action="/cgi-bin/search"><input name="q"/></form>'
        '<script src="/global/global.js"></script>'
        '<p>Gallery entry</p>'
        '</body></html>')

    out = mirror_script.rewrite_links(html, 'http://www.footbag.org/gallery/show/638')

    assert out != html, 'the rewrite was abandoned and the raw page kept'
    sanitized = BeautifulSoup(out, 'html.parser')
    assert sanitized.find('form') is None
    assert sanitized.find('script') is None
    assert 'Gallery entry' in sanitized.get_text()


def test_reading_an_attribute_off_a_removed_element_is_skipped_not_fatal():
    soup = BeautifulSoup('<video src="a.mp4" poster="b.jpg"></video>', 'html.parser')
    element = soup.find('video')
    element.decompose()
    # The guard has to recognize a removed element. Asking whether it still
    # answers to .get does not: a removed tag does, and then answers with a
    # failure that costs the page its whole rewrite.
    assert hasattr(element, 'get')
    assert mirror_script._already_removed(element)
