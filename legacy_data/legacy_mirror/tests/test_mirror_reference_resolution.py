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


def test_a_live_reference_survives_the_pass(monkeypatch, www):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(www.parent))
    (www / 'css').mkdir()
    (www / 'css' / 'site.css').write_text('body{}', encoding='utf-8')
    _page(www, 'index.html', '<link rel="stylesheet" href="css/site.css">')
    mirror_script.neutralize_dead_internal_links()
    out = (www / 'index.html').read_text(encoding='utf-8')
    assert 'css/site.css' in out
