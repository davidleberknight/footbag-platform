"""Redaction backstops on the routes that write their own file directly, in
create_mirror_footbag_org.py's crawl().

Six routes (/news/list, /news/list?Year=, /events/past, /events/results,
/registration/register?tid=, /registration/regsummary?tid=) do not fit
save_content's general filepath rule and write their own file instead. Found
in review: they went straight to _atomic_write_text, so save_content's
account-identity and SQL-error redaction backstops never ran over their
bytes, and two of the four that re-fetch a second URL for a fuller listing
never re-checked that second response with is_error_body either - a live
failure on the fuller listing would have been saved as if it were the page.
_apply_content_redaction_backstops is the shared fix, called from
save_content and from all six of these routes; the two re-fetching /news/list
variants now also gate the swap on is_error_body.

registration/regsummary is the sharpest case: an attendee list, the page
family the account-identity backstop's own comment names as the shape most
likely to need it.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_special_route_redaction.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_routeredact', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_routeredact'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
ACCOUNT_ADDRESS = 'mirror-operator@example.org'


# ----- Unit coverage of the extracted helper -----

@pytest.fixture
def account(monkeypatch):
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', ACCOUNT_ADDRESS)
    return ACCOUNT_ADDRESS


def test_the_extracted_helper_still_redacts_the_account_address(account):
    out = mirror_script._apply_content_redaction_backstops(
        BASE + '/registration/regsummary?tid=1',
        f'<html><body>{ACCOUNT_ADDRESS}</body></html>')
    assert ACCOUNT_ADDRESS not in out


def test_the_extracted_helper_still_strips_a_sql_error():
    page = ('<html><body><h1>Spring Classic</h1>'
            '<font face="sans-serif" size="+2">Error</font><br/>'
            '<p>You have an error in your SQL syntax near \'x\' at line 1</p>'
            '</body></html>')
    out = mirror_script._apply_content_redaction_backstops(BASE + '/events/show/1', page)
    assert 'SQL syntax' not in out
    assert 'Spring Classic' in out


def test_the_extracted_helper_leaves_an_ordinary_page_alone():
    page = '<html><body><h1>Spring Classic</h1></body></html>'
    out = mirror_script._apply_content_redaction_backstops(BASE + '/events/show/1', page)
    assert out == page


# ----- Wired into the six special-case save branches inside crawl() -----

class _FakeResp:
    def __init__(self, html, url=''):
        self.text = html
        self.content = html.encode('utf-8')
        self.headers = {'Content-Type': 'text/html'}
        self.url = url


@pytest.fixture
def crawl_env(tmp_path, monkeypatch):
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    monkeypatch.setattr(mirror_script, 'ROBOTS_CACHE_FILE', str(tmp_path / 'robots.json'))
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', ACCOUNT_ADDRESS)
    site = {}

    def fake_fetch(url):
        html = site.get(url)
        if html is None:
            return None, url
        return _FakeResp(html, url), url

    monkeypatch.setattr(mirror_script, 'fetch', fake_fetch)
    return site


def test_regsummary_route_redacts_the_account_address(crawl_env):
    url = BASE + '/registration/regsummary?tid=42'
    crawl_env[url] = (
        '<html><body><h1>Spring Classic entrants</h1>'
        f'<p>{ACCOUNT_ADDRESS}</p>'
        '<p>Real Entrant Name</p></body></html>')

    mirror_script.crawl([url])

    saved = Path(mirror_script.MIRROR_DIR) / 'www.footbag.org' / 'registration' / 'regsummary' / '42' / 'index.html'
    assert saved.is_file()
    body = saved.read_text(encoding='utf-8')
    assert ACCOUNT_ADDRESS not in body
    assert 'Real Entrant Name' in body


def test_register_route_redacts_a_sql_error(crawl_env):
    url = BASE + '/registration/register?tid=7'
    crawl_env[url] = (
        '<html><body><h1>Registration</h1>'
        '<font face="sans-serif" size="+2">Error</font><br/>'
        '<p>You have an error in your SQL syntax near \'x\' at line 1</p>'
        '</body></html>')

    mirror_script.crawl([url])

    saved = Path(mirror_script.MIRROR_DIR) / 'www.footbag.org' / 'registration' / 'register' / '7' / 'index.html'
    assert saved.is_file()
    body = saved.read_text(encoding='utf-8')
    assert 'SQL syntax' not in body
    assert 'Registration' in body


def test_events_past_route_redacts_the_account_address(crawl_env):
    url = BASE + '/events/past'
    crawl_env[url] = f'<html><body><h1>Past events</h1><p>{ACCOUNT_ADDRESS}</p></body></html>'

    mirror_script.crawl([url])

    year = str(mirror_script.datetime.now().year)
    saved = (Path(mirror_script.MIRROR_DIR) / 'www.footbag.org' / 'events'
            / f'past_year_{year}' / 'index.html')
    assert saved.is_file()
    assert ACCOUNT_ADDRESS not in saved.read_text(encoding='utf-8')


def test_a_news_list_refetch_that_errors_falls_back_to_the_original_response(crawl_env):
    # The re-fetched fuller listing fails live; the branch must not save that
    # failure as if it were the page. Falling back to the original response
    # (which is not itself an error page) is what keeps the crawl honest.
    url = BASE + '/news/list'
    year = str(mirror_script.datetime.now().year)
    show_all_url = f'{BASE}/news/list?f=10&from=0&Year={year}'
    crawl_env[url] = '<html><body><h1>News (original)</h1></body></html>'
    crawl_env[show_all_url] = (
        '<html><body>No events found with a event ID of "x".</body></html>')

    mirror_script.crawl([url])

    saved = Path(mirror_script.MIRROR_DIR) / 'www.footbag.org' / 'news' / f'list_{year}' / 'index.html'
    assert saved.is_file()
    body = saved.read_text(encoding='utf-8')
    assert 'News (original)' in body
    assert 'No events found' not in body
