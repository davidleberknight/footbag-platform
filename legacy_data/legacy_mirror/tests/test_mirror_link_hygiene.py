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
