"""One pinned year per crawl session, in create_mirror_footbag_org.py.

url_to_filepath's /events/past, /events/results and /news/list fallback
branches, and the matching redirector functions, each need "the current
year" when a URL carries no year of its own. Reading datetime.now().year
independently at nine call sites meant a session whose activity straddled a
real year boundary could resolve one page's link against one year and
another page's against the next - a link to a directory the crawl never
created. CRAWL_SESSION_YEAR, pinned once in main() before a real crawl
starts, is what keeps every call site agreeing for the whole run;
_current_year() falls back to the true current year when it is unset,
which is every context outside a real crawl, existing tests included.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_crawl_session_year.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_sessionyear', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_sessionyear'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


def test_unset_falls_back_to_the_real_current_year(monkeypatch):
    monkeypatch.setattr(mirror_script, 'CRAWL_SESSION_YEAR', None)
    assert mirror_script._current_year() == str(mirror_script.datetime.now().year)


def test_a_pinned_year_wins_over_the_wall_clock(monkeypatch):
    monkeypatch.setattr(mirror_script, 'CRAWL_SESSION_YEAR', '2031')
    assert mirror_script._current_year() == '2031'


@pytest.mark.parametrize('path', ['/events/past', '/events/results'])
def test_a_yearless_events_url_resolves_against_the_pinned_year(monkeypatch, path):
    monkeypatch.setattr(mirror_script, 'CRAWL_SESSION_YEAR', '2031')
    target = mirror_script.url_to_filepath(BASE + path)
    assert '2031' in target
    assert str(mirror_script.datetime.now().year) not in Path(target).name


def test_a_yearless_news_list_url_resolves_against_the_pinned_year(monkeypatch):
    monkeypatch.setattr(mirror_script, 'CRAWL_SESSION_YEAR', '2031')
    target = mirror_script.url_to_filepath(BASE + '/news/list')
    assert 'list_2031' in target


def test_the_redirectors_use_the_pinned_year_too(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))
    monkeypatch.setattr(mirror_script, 'CRAWL_SESSION_YEAR', '2031')
    mirror_script.create_events_past_redirector()
    target = Path(tmp_path) / 'www.footbag.org' / 'events' / 'past' / 'index.html'
    assert 'past_year_2031' in target.read_text(encoding='utf-8')
