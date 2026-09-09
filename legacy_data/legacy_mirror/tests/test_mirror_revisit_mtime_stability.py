"""Modification times survive a revisit crawl that finds nothing changed.

The archive is published with `aws s3 sync`, which uploads a file whose
modification time is newer than the object in the bucket, whether or not its
bytes differ. A revisit crawl re-fetches every page and writes each one back,
so without care it hands every page a fresh time and the publish that follows
re-uploads a capture that did not change: a hundred thousand objects to move a
delta of nothing. The crawler therefore gives a file its original time back
when the run leaves it byte-identical, and only then is the publish a delta.

The times here are pinned to a fixed past value rather than compared between
two runs, so a filesystem's timestamp granularity cannot decide the outcome.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_revisit_mtime_stability.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_revisit_mtime', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_revisit_mtime'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL

# An arbitrary fixed instant in the past, stamped onto the capture between the
# two runs. Any restored time must come back as exactly this.
PINNED_MTIME = 1_600_000_000


class _FakeResp:
    def __init__(self, html, url=''):
        self.text = html
        self.content = html.encode('utf-8')
        self.headers = {'Content-Type': 'text/html'}
        self.url = url


@pytest.fixture
def state(monkeypatch):
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    return st


@pytest.fixture
def crawl_env(tmp_path, monkeypatch, state):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    monkeypatch.setattr(mirror_script, 'ROBOTS_CACHE_FILE', str(tmp_path / 'robots.json'))
    site, fetched = {}, []

    def fake_fetch(url):
        fetched.append(url)
        html = site.get(url)
        if html is None:
            return None, url
        return _FakeResp(html, url), url

    monkeypatch.setattr(mirror_script, 'fetch', fake_fetch)
    return site, fetched


def _pin(*paths):
    for path in paths:
        os.utime(path, (PINNED_MTIME, PINNED_MTIME))


def _captured(url):
    return Path(mirror_script.url_to_filepath(url))


def test_a_revisit_that_finds_no_change_leaves_every_timestamp_alone(crawl_env):
    site, fetched = crawl_env
    home = BASE + '/faq/show/1'
    leaf = BASE + '/faq/show/2'
    site[home] = f'<html><body><a href="{leaf}">next</a></body></html>'
    site[leaf] = '<html><body>a page that will not change</body></html>'

    mirror_script.crawl([home])
    mirror_script.restore_unchanged_mtimes()   # every run ends with this
    home_file, leaf_file = _captured(home), _captured(leaf)
    before = leaf_file.read_bytes()
    _pin(home_file, leaf_file)

    # A revisit drops the record of what has been seen, so both pages are
    # fetched again and written again with the very same bytes.
    fetched.clear()
    mirror_script.clear_for_revisit()
    mirror_script.crawl([home])
    assert set(fetched) == {home, leaf}
    mirror_script.restore_unchanged_mtimes()

    assert leaf_file.read_bytes() == before
    assert leaf_file.stat().st_mtime_ns == PINNED_MTIME * 1_000_000_000
    assert home_file.stat().st_mtime_ns == PINNED_MTIME * 1_000_000_000


def test_a_page_edited_since_capture_keeps_its_new_content_and_a_new_time(crawl_env):
    site, fetched = crawl_env
    page = BASE + '/faq/show/1'
    site[page] = '<html><body>original capture</body></html>'

    mirror_script.crawl([page])
    mirror_script.restore_unchanged_mtimes()
    captured = _captured(page)
    _pin(captured)

    site[page] = '<html><body>edited on the live site</body></html>'
    mirror_script.clear_for_revisit()
    mirror_script.crawl([page])
    mirror_script.restore_unchanged_mtimes()

    # The time must move, or the publish would leave the stale copy in place.
    assert 'edited on the live site' in captured.read_text(encoding='utf-8')
    assert captured.stat().st_mtime_ns != PINNED_MTIME * 1_000_000_000


def test_a_page_first_seen_in_the_revisit_is_written_with_its_own_time(crawl_env):
    site, fetched = crawl_env
    home = BASE + '/faq/show/1'
    fresh = BASE + '/faq/show/9'
    site[home] = '<html><body>the only page there is</body></html>'

    mirror_script.crawl([home])
    mirror_script.restore_unchanged_mtimes()
    _pin(_captured(home))

    # A page that did not exist when the run began has no earlier time to keep.
    site[home] = f'<html><body><a href="{fresh}">new</a></body></html>'
    site[fresh] = '<html><body>a page that was not there before</body></html>'
    mirror_script.clear_for_revisit()
    mirror_script.crawl([home])
    mirror_script.restore_unchanged_mtimes()

    written = _captured(fresh)
    assert 'a page that was not there before' in written.read_text(encoding='utf-8')
    # Its time is the moment it was captured, never something older invented
    # for it: an invented past would keep the publish from ever sending it.
    assert written.stat().st_mtime_ns > PINNED_MTIME * 1_000_000_000


def test_each_run_measures_against_its_own_starting_state(crawl_env):
    # The record of what a file held is cleared when a run ends. Were it to
    # survive, the second run would compare against the first run's starting
    # point and could hand back a time belonging to content that is now gone.
    site, _ = crawl_env
    page = BASE + '/faq/show/1'
    site[page] = '<html><body>original capture</body></html>'

    mirror_script.crawl([page])
    mirror_script.restore_unchanged_mtimes()
    assert mirror_script._pre_write_state == {}

    site[page] = '<html><body>edited on the live site</body></html>'
    mirror_script.clear_for_revisit()
    mirror_script.crawl([page])
    assert str(_captured(page)) in mirror_script._pre_write_state
    mirror_script.restore_unchanged_mtimes()
    assert mirror_script._pre_write_state == {}


def test_the_restore_runs_on_every_way_out_of_the_program(tmp_path, monkeypatch):
    # The tree-only modes return early and a bad invocation exits, so the
    # restore cannot sit at the end of the crawl path: a mode that rewrote
    # pages and returned would publish as a full re-upload.
    import importlib.util as _il

    monkeypatch.setenv('FOOTBAG_MIRROR_STATE_DIR', str(tmp_path))
    _spec = _il.spec_from_file_location('mirror_revisit_mtime_entry', str(SCRIPT_PATH))
    m = _il.module_from_spec(_spec)
    _spec.loader.exec_module(m)

    calls = []
    monkeypatch.setattr(m, 'restore_unchanged_mtimes', lambda: calls.append(True))
    monkeypatch.setattr(m, 'relink_restored_nav_items', lambda *a, **k: None)

    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py',
                                      '--relink-nav-items-only'])
    m.main()
    assert calls == [True]

    # And on the exit path, where a mode refuses its own arguments.
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py',
                                      '--apply-exclusions-only'])
    with pytest.raises(SystemExit):
        m.main()
    assert calls == [True, True]
