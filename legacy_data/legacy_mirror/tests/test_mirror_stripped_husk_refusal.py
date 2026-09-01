"""Pages emptied by save-time stripping are refused, in create_mirror_footbag_org.py.

Stripping scripts, dead forms and server diagnostics can leave nothing: a page
whose whole body WAS the failure. Five such 23-byte husks (a charset meta line
and nothing else) reached the capture and passed every later check precisely
because the evidence was removed before is_error_body could see the stored
bytes. save_content now refuses a page that strips to nothing, unless its
markup still offers something renderable - an image-only gallery page has no
text at all and is real content.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_stripped_husk_refusal.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_husk', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_husk'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


@pytest.fixture
def tree(tmp_path, monkeypatch):
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'mirror_state',
                        mirror_script.MirrorState())
    (mirror_dir / 'www.footbag.org').mkdir(parents=True)
    return mirror_dir


def _saved_file(url):
    return mirror_script.url_to_filepath(mirror_script.normalize_url(url))


def test_a_charset_only_husk_is_refused_and_recorded(tree):
    # The exact 23-byte shape found in production (links/recommend2 and the
    # three Open de France gallery pages).
    url = BASE + '/links/recommend2'
    mirror_script.save_content(url, '<meta charset="utf-8"/>', is_html=True)
    assert not os.path.exists(_saved_file(url))
    assert (mirror_script.normalize_url(url), 'stripped-to-empty') \
        in mirror_script.mirror_state.refused_pages


def test_an_image_only_page_is_real_content_and_saved(tree):
    url = BASE + '/gallery/showset/photos-only'
    mirror_script.save_content(
        url, '<html><body><img src="a.jpg"><img src="b.jpg"></body></html>',
        is_html=True)
    assert os.path.exists(_saved_file(url))


def test_an_ordinary_text_page_is_saved(tree):
    url = BASE + '/reference/history'
    mirror_script.save_content(
        url, '<html><body><p>Footbag began in 1972.</p></body></html>',
        is_html=True)
    assert os.path.exists(_saved_file(url))


def test_non_html_content_is_untouched_by_the_husk_rule(tree):
    url = BASE + '/worlds94/results/ifg.results'
    mirror_script.save_content(url, b'   \n', is_html=False)
    assert os.path.exists(_saved_file(url))
