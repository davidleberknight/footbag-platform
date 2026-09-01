"""Passes that settle what the archive cannot deliver, before it is published.

A supplementary-site page whose owner never wrote it carries a heading, the site
furniture and nothing else, and is captured faithfully because the live site
serves exactly that. An archive that offers a link and delivers a bare title is
offering nothing, so the link keeps its words and loses the anchor, and a page
nothing links to is dropped.

These pin how much of its own content a page is measured to carry, which link
survives, and which page is dropped.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_publication_passes.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_publication', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_publication'] = mirror_script
spec.loader.exec_module(mirror_script)

# Repeated on every page, the way a site's navigation and footer are, so the
# measurement has furniture to discount and the tests exercise the real path.
CHROME = ('<ul><li>Home</li><li>Usage Information</li></ul>'
          '<p>Copyright 1994-2026, International Footbag Players Association</p>')


@pytest.fixture
def www(tmp_path, monkeypatch):
    root = tmp_path / 'www.footbag.org'
    root.mkdir()
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))
    return root


def _page(www, relative, body):
    path = www / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<html><body>{CHROME}{body}</body></html>', encoding='utf-8')
    return path


class TestSupplementarySitePagesNobodyEverWrote:

    def test_a_link_to_a_bare_page_keeps_its_words_and_loses_the_anchor(self, www):
        _page(www, 'sites/reference/faq/index.html', '<h2>FAQ</h2>')
        index = _page(www, 'sites/reference/index.html',
                      '<h2>Footbag Reference</h2><p>Curated by the community, at '
                      'length, with a great deal of real text on the page so that '
                      'it is measured as carrying content of its own.</p>'
                      '<a href="faq/">FAQ</a>')
        mirror_script.settle_vhost_placeholder_pages()
        out = index.read_text(encoding='utf-8')
        assert 'href="faq/"' not in out
        assert 'FAQ' in out

    def test_a_bare_page_something_links_to_survives(self, www):
        faq = _page(www, 'sites/reference/faq/index.html', '<h2>FAQ</h2>')
        _page(www, 'sites/reference/index.html',
              '<h2>Footbag Reference</h2><p>Curated by the community, at length, '
              'with a great deal of real text on the page so that it is measured '
              'as carrying content of its own.</p><a href="faq/">FAQ</a>')
        mirror_script.settle_vhost_placeholder_pages()
        assert faq.exists()

    def test_a_bare_page_nothing_links_to_is_dropped(self, www):
        orphan = _page(www, 'sites/worlds2018/players/index.html', '<h2>Players</h2>')
        _page(www, 'sites/worlds2018/index.html',
              '<h2>2018 World Championships</h2><p>A long page of real content '
              'about the championships, carrying enough words to be measured as '
              'a page with something on it.</p>')
        mirror_script.settle_vhost_placeholder_pages()
        assert not orphan.exists()

    def test_running_the_pass_again_does_not_delete_what_it_kept(self, www):
        # The first run removes the links to a bare page. Left to itself the
        # second run would read that page as linked from nowhere and delete
        # exactly the pages the first run decided to keep.
        faq = _page(www, 'sites/reference/faq/index.html', '<h2>FAQ</h2>')
        _page(www, 'sites/reference/index.html',
              '<h2>Footbag Reference</h2><p>Curated by the community, at length, '
              'with a great deal of real text on the page so that it is measured '
              'as carrying content of its own.</p><a href="faq/">FAQ</a>')
        mirror_script.settle_vhost_placeholder_pages()
        mirror_script.settle_vhost_placeholder_pages()
        mirror_script.settle_vhost_placeholder_pages()
        assert faq.exists()

    def test_a_page_is_kept_when_its_site_was_not_read_completely(self, www, monkeypatch):
        # Nothing linking to a page is only evidence where the crawl read the
        # site. If a page on the same site failed to fetch, the page that linked
        # this one may be exactly the one that failed.
        state = mirror_script.MirrorState()
        state.failed_urls = {'http://sites.footbag.org/worlds2018/schedule/'}
        monkeypatch.setattr(mirror_script, 'mirror_state', state)
        orphan = _page(www, 'sites/worlds2018/players/index.html', '<h2>Players</h2>')
        _page(www, 'sites/worlds2018/index.html',
              '<h2>2018 World Championships</h2><p>A long page of real content '
              'about the championships, carrying enough words to be measured as '
              'a page with something on it.</p>')
        mirror_script.settle_vhost_placeholder_pages()
        assert orphan.exists()

    def test_a_failure_on_another_site_does_not_protect_this_one(self, www, monkeypatch):
        state = mirror_script.MirrorState()
        state.failed_urls = {'http://sites.footbag.org/worlds2011/some/page/'}
        monkeypatch.setattr(mirror_script, 'mirror_state', state)
        orphan = _page(www, 'sites/worlds2018/players/index.html', '<h2>Players</h2>')
        _page(www, 'sites/worlds2018/index.html',
              '<h2>2018 World Championships</h2><p>A long page of real content '
              'about the championships, carrying enough words to count.</p>')
        mirror_script.settle_vhost_placeholder_pages()
        assert not orphan.exists()

    def test_a_thin_front_door_is_never_dropped(self, www):
        # It is the only way into everything filed beneath it, however little it
        # says for itself.
        door = _page(www, 'sites/worlds2016/index.html', '<h2>2016 Worlds</h2>')
        _page(www, 'sites/worlds2016/schedule/index.html',
              '<h2>Schedule</h2><p>Play starts at nine each morning and the finals '
              'run through Saturday afternoon on the centre court.</p>')
        mirror_script.settle_vhost_placeholder_pages()
        assert door.exists()

    def test_a_page_with_content_is_left_alone_and_stays_linked(self, www):
        real = _page(www, 'sites/reference/net/footbag-net-rules/index.html',
                     '<h2>Footbag Net Rules</h2><p>Competition is governed by the '
                     'Rules of Footbag Sports, and this page sets out how the '
                     'court, the service and the scoring work in detail.</p>')
        index = _page(www, 'sites/reference/index.html',
                      '<h2>Footbag Reference</h2><p>Curated by the community, at '
                      'length, with a great deal of real text on the page.</p>'
                      '<a href="net/footbag-net-rules/">Net rules</a>')
        mirror_script.settle_vhost_placeholder_pages()
        assert real.exists()
        assert 'href="net/footbag-net-rules/"' in index.read_text(encoding='utf-8')

    def test_the_main_site_is_not_touched_by_this_pass(self, www):
        bare = _page(www, 'newmoves/show/1/index.html', '<h2>Drifter</h2>')
        _page(www, 'sites/reference/index.html', '<h2>Footbag Reference</h2>')
        mirror_script.settle_vhost_placeholder_pages()
        assert bare.exists()
