"""The footbag panel patterns, and the modern rendering the archive adds.

The legacy site published its sewing patterns as PostScript and told the reader
to prefer them over the pictures beside them, because only the PostScript
carries the geometry and prints at any size. Almost nothing opens PostScript
today, so the archive renders each one to a PDF, files it beside the original and
links it from the same row. The PostScript is kept either way.

These pin that the link is added once and only where the rendering exists, that
a second run changes nothing, and that a capture without Ghostscript still
publishes rather than failing. The rendering test itself is skipped where
Ghostscript is absent.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_postscript_patterns.py -v
"""
import importlib.util
import shutil
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_patterns', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_patterns'] = mirror_script
spec.loader.exec_module(mirror_script)

GHOSTSCRIPT = shutil.which('gs')

POSTSCRIPT = """%!
/Helvetica findfont 12 scalefont setfont
72 72 moveto (penta) show
showpage
"""

ROW = ('<a href="ps/penta.ps"><img alt="PostScript" src="img/postscript.gif"/></a>\n'
       '<a href="img/penta.gif">penta.gif</a>\n'
       '<b>Dodecahedron (12 panels. All pentagons)</b>')


@pytest.fixture
def patterns(tmp_path, monkeypatch):
    root = tmp_path / 'www.footbag.org'
    (root / 'footbags' / 'patterns' / 'ps').mkdir(parents=True)
    (root / 'footbags' / 'patterns' / 'ps' / 'penta.ps').write_text(POSTSCRIPT, encoding='utf-8')
    page = root / 'footbags' / 'patterns' / 'index.html'
    page.write_text(f'<html><body>{ROW}</body></html>', encoding='utf-8')
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))
    return root, page


@pytest.mark.skipif(not GHOSTSCRIPT, reason='Ghostscript must be installed to render a pattern')
class TestRenderingThePatterns:

    def test_a_pdf_is_written_beside_the_postscript(self, patterns):
        root, _ = patterns
        mirror_script.render_postscript_patterns()
        rendered = root / 'footbags' / 'patterns' / 'pdf' / 'penta.pdf'
        assert rendered.is_file()
        assert rendered.read_bytes().startswith(b'%PDF')

    def test_the_page_links_the_rendering_from_the_pattern_row(self, patterns):
        _, page = patterns
        mirror_script.render_postscript_patterns()
        out = page.read_text(encoding='utf-8')
        assert 'href="pdf/penta.pdf"' in out
        # The PostScript stays: the rendering is a way in, not a replacement.
        assert 'href="ps/penta.ps"' in out

    def test_running_again_adds_nothing_and_re_renders_nothing(self, patterns):
        root, page = patterns
        mirror_script.render_postscript_patterns()
        first = (root / 'footbags' / 'patterns' / 'pdf' / 'penta.pdf').stat().st_mtime_ns
        mirror_script.render_postscript_patterns()
        out = page.read_text(encoding='utf-8')
        assert out.count('href="pdf/penta.pdf"') == 1
        assert (root / 'footbags' / 'patterns' / 'pdf' / 'penta.pdf').stat().st_mtime_ns == first

    def test_an_edited_pattern_is_rendered_again(self, patterns):
        root, _ = patterns
        mirror_script.render_postscript_patterns()
        rendered = root / 'footbags' / 'patterns' / 'pdf' / 'penta.pdf'
        before = rendered.stat().st_mtime_ns
        source = root / 'footbags' / 'patterns' / 'ps' / 'penta.ps'
        source.write_text(POSTSCRIPT.replace('penta', 'penta v2'), encoding='utf-8')
        mirror_script.render_postscript_patterns()
        assert rendered.stat().st_mtime_ns != before


def test_no_link_is_added_where_the_rendering_does_not_exist(patterns, monkeypatch):
    # A page must never offer a file the capture does not hold, so the link is
    # written from what is on disk rather than from what should be there.
    _, page = patterns
    monkeypatch.setattr(mirror_script.shutil, 'which', lambda name: None)
    mirror_script.render_postscript_patterns()
    assert 'pdf/penta.pdf' not in page.read_text(encoding='utf-8')


def test_a_capture_without_ghostscript_keeps_its_postscript(patterns, monkeypatch):
    root, page = patterns
    monkeypatch.setattr(mirror_script.shutil, 'which', lambda name: None)
    assert mirror_script.render_postscript_patterns() == 0
    assert (root / 'footbags' / 'patterns' / 'ps' / 'penta.ps').is_file()
    assert 'href="ps/penta.ps"' in page.read_text(encoding='utf-8')
