"""Broken-link remediation scanner over an existing mirror tree.

scan_mirror_broken_links: finds pages whose relative links resolve to missing
files (the symptom of past crawls mis-relativizing other-host links into the
www tree) and emits (a) a report and (b) a re-crawl seed list of those pages'
URLs for the crawler's --seeds mode; pages at query-derived special paths are
reported as not URL-invertible rather than silently skipped.

(There is deliberately no admin-capture audit script: the guarantee that a
fresh crawl captures no admin/editor page lives in the crawler's own refusal
gate, verified in test_mirror_archive_route_fixes.py, not in a post-hoc tree
sweep.)

All fixtures are local temp trees. Run from repo root:
    python -m pytest legacy_data/tests/test_mirror_remediation_scripts.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / 'scripts'


def _load(name):
    spec = importlib.util.spec_from_file_location(name, str(SCRIPTS / f'{name}.py'))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


scan = _load('scan_mirror_broken_links')


def _page(root, rel, html='<html><body>x</body></html>'):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding='utf-8')
    return path


@pytest.fixture
def mirror(tmp_path):
    www = tmp_path / 'www.footbag.org'
    www.mkdir(parents=True)
    return tmp_path


def test_scan_reports_dangling_links_and_emits_recrawl_seeds(mirror, monkeypatch, capsys):
    www = mirror / 'www.footbag.org'
    _page(www, 'gallery/show/1/index.html',
          '<html><body><a href="../../worlds2018/index.html">w18</a>'
          '<img src="ok.jpg"></body></html>')
    _page(www, 'gallery/show/1/ok.jpg')                 # existing target: fine
    _page(www, 'news/show/5/index.html',
          '<html><body><a href="#top">anchor</a>'
          '<a href="http://example.com/x">offsite</a></body></html>')
    monkeypatch.setattr(sys, 'argv', ['scan', '--mirror', str(mirror)])
    assert scan.main() == 0
    report = (mirror / scan.REPORT_NAME).read_text()
    assert 'pages with dangling relative links: 1' in report
    seeds = (mirror / scan.SEEDS_NAME).read_text().splitlines()
    assert seeds == ['http://www.footbag.org/gallery/show/1/']


def test_scan_inverts_vhost_captures_back_to_the_vhost_host(mirror, monkeypatch):
    # A dangling link on a /sites/<slug>/ capture must yield a re-crawlable
    # sites.footbag.org seed, not a www /sites/ URL the crawler would refuse.
    www = mirror / 'www.footbag.org'
    _page(www, 'sites/worlds2018/players/index.html',
          '<html><body><a href="gone.html">x</a></body></html>')
    monkeypatch.setattr(sys, 'argv', ['scan', '--mirror', str(mirror)])
    assert scan.main() == 0
    seeds = (mirror / scan.SEEDS_NAME).read_text().splitlines()
    assert seeds == ['http://sites.footbag.org/worlds2018/players/']


def test_scan_marks_query_derived_paths_not_invertible(mirror, monkeypatch):
    www = mirror / 'www.footbag.org'
    _page(www, 'news/list_2003/index.html',
          '<html><body><a href="missing.html">gone</a></body></html>')
    monkeypatch.setattr(sys, 'argv', ['scan', '--mirror', str(mirror)])
    assert scan.main() == 0
    report = (mirror / scan.REPORT_NAME).read_text()
    assert 'not URL-invertible' in report
    assert 'news/list_2003' in report
    assert (mirror / scan.SEEDS_NAME).read_text().strip() == ''
