"""Seed-list input mode of create_mirror_footbag_org.py.

Seed lists carry content classes the live site's own filtered indexes never
link, so link-following alone misses them. The crawler loads every .txt in the
seeds directory by default (the archival crawl wants all content); --seeds
narrows to specific files. Seeds enter the queue at depth 0, deduplicated
against visited and queued URLs, and pass through the same unsafe/scope
refusals as discovered links; start URLs stay present on a seeded fresh crawl.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_seed_input.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_seeds', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_seeds'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


@pytest.fixture
def state(monkeypatch):
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    monkeypatch.setattr(mirror_script, 'RESPECT_ROBOTS_TXT', False)
    return st


def _write_seeds(tmp_path, name, urls):
    f = tmp_path / name
    f.write_text('\n'.join(urls) + '\n', encoding='utf-8')
    return f


def test_load_reads_files_and_directories_and_tolerates_blanks(tmp_path):
    _write_seeds(tmp_path, 'a.txt', [BASE + '/news/show/1', '', '# note', BASE + '/news/show/2'])
    _write_seeds(tmp_path, 'b.txt', [BASE + '/clubs/show/3'])
    (tmp_path / 'ignored.csv').write_text('not,a,seed\n')
    by_dir = mirror_script.load_seed_urls([str(tmp_path)])
    assert by_dir == [BASE + '/news/show/1', BASE + '/news/show/2', BASE + '/clubs/show/3']
    by_file = mirror_script.load_seed_urls([str(tmp_path / 'b.txt')])
    assert by_file == [BASE + '/clubs/show/3']


def test_load_missing_path_warns_and_continues(tmp_path, caplog):
    got = mirror_script.load_seed_urls([str(tmp_path / 'absent')])
    assert got == []
    assert 'build_archive_seed_lists.py' in caplog.text


def test_seeds_enqueue_at_depth_zero_with_dedup(state):
    state.visited.add(BASE + '/news/show/1')
    state.queue.append(BASE + '/news/show/2')
    added = mirror_script.enqueue_seed_urls([
        BASE + '/news/show/1',      # already visited
        BASE + '/news/show/2',      # already queued
        BASE + '/news/show/3',      # new
        BASE + '/news/show/3',      # duplicate within the seed list itself
    ])
    assert added == 1
    assert state.queue == [BASE + '/news/show/2', BASE + '/news/show/3']
    assert state.url_depth[BASE + '/news/show/3'] == 0


def test_unsafe_and_out_of_scope_seeds_are_refused(state, caplog):
    caplog.set_level('INFO')
    added = mirror_script.enqueue_seed_urls([
        BASE + '/gallery/delete/9',                 # editor view: refused
        'http://photo.footbag.org/worlds96/1.jpg',  # dead host: out of scope
        BASE + '/members/profile/456',              # legitimate: enqueued
    ])
    assert added == 1
    assert state.queue == [BASE + '/members/profile/456']
    # A refused seed is a URL an operator deliberately supplied, so both the
    # per-URL line and the run summary warn; a quietly dropped seed file would
    # otherwise read as full coverage.
    refusals = [r for r in caplog.records if r.message.startswith('Seed refused')]
    assert len(refusals) == 2
    assert {r.levelname for r in refusals} == {'WARNING'}
    summary = [r for r in caplog.records if r.message.startswith('Seeds enqueued')]
    assert [r.levelname for r in summary] == ['WARNING']


def test_seed_summary_stays_informational_when_nothing_is_refused(state, caplog):
    caplog.set_level('INFO')
    mirror_script.enqueue_seed_urls([BASE + '/members/profile/456'])
    summary = [r for r in caplog.records if r.message.startswith('Seeds enqueued')]
    assert [r.levelname for r in summary] == ['INFO']


def test_start_urls_stay_present_when_seeds_prefill_the_queue(state):
    mirror_script.enqueue_seed_urls([BASE + '/news/show/3'])
    mirror_script._ensure_start_urls([BASE + '/', BASE + '/members/home/'])
    # Start URLs are prepended ahead of the seed backlog; a visited one is not
    # re-added on resume.
    assert state.queue[0] == BASE + '/'
    assert state.queue[-1] == BASE + '/news/show/3'
    state.visited.add(mirror_script.normalize_url(BASE + '/members/home/'))
    before = list(state.queue)
    mirror_script._ensure_start_urls([BASE + '/members/home/'])
    assert state.queue == before


# The crawler has no incremental mode; what it has is checkpointed resume. A
# second run without -fresh loads the checkpoint and skips every URL already
# visited: it captures never-seen URLs (new seed entries, newly discovered
# links) and drains an interrupted queue, but a page whose live content changed
# after capture keeps its stale capture. The cutover sequencing relies on this
# being additive-only, so the two-run behavior is pinned end to end here
# against a local fixture site.

class _FakeResp:
    # `url` carries the address the server answered at, after any redirect,
    # exactly as a real response does. The crawler resolves each page's relative
    # references against it, so a stub without it would not exercise the path
    # the real one takes.
    def __init__(self, html, url=''):
        self.text = html
        self.content = html.encode('utf-8')
        self.headers = {'Content-Type': 'text/html'}
        self.url = url


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


def test_rerun_without_fresh_adds_new_urls_but_never_refetches(crawl_env, monkeypatch):
    site, fetched = crawl_env
    a = BASE + '/faq/show/1'
    b = BASE + '/faq/show/2'
    c = BASE + '/faq/show/3'
    site[a] = f'<html><body><a href="{b}">next</a></body></html>'
    site[b] = '<html><body>original capture</body></html>'

    # First run: completes with the queue drained; the linked page was
    # discovered, fetched, and captured.
    mirror_script.crawl([a])
    assert set(fetched) == {a, b}
    b_file = Path(mirror_script.url_to_filepath(b))
    assert 'original capture' in b_file.read_text(encoding='utf-8')
    mirror_script.mirror_state.save_progress()

    # Between runs the live site changes a captured page and gains a new one.
    site[b] = '<html><body>changed after capture</body></html>'
    site[c] = '<html><body>new page</body></html>'

    # Second run without -fresh: the checkpoint reloads, the full seed list is
    # re-offered (as the archival crawl does on every start).
    resumed = mirror_script.MirrorState()
    assert resumed.load_progress() is True
    monkeypatch.setattr(mirror_script, 'mirror_state', resumed)
    fetched.clear()
    mirror_script.enqueue_seed_urls([a, b, c])
    mirror_script.crawl([a])

    # Only the never-seen URL is fetched; the changed page is not re-requested
    # and keeps its stale capture.
    assert fetched == [c]
    assert 'original capture' in b_file.read_text(encoding='utf-8')
    assert 'new page' in Path(
        mirror_script.url_to_filepath(c)).read_text(encoding='utf-8')


def test_a_directory_page_discovers_its_links_below_itself_not_at_the_site_root(
        crawl_env, monkeypatch):
    # The site answers a directory address by redirecting to its trailing-slash
    # form, and normalization strips that slash back off for storage. The page is
    # therefore stored under the slash-less address while the correct base for
    # its relative references is the slash form. Resolving against the stored one
    # asks for every reference a level too high, at the site root, so the whole
    # of a directory's content goes undiscovered.
    site, fetched = crawl_env
    stored = BASE + '/worlds2000'
    site[stored] = '<html><body><a href="events.html">events</a></body></html>'

    def redirecting_fetch(url):
        fetched.append(url)
        html = site.get(url)
        if html is None:
            return None, url
        # Served with the slash, stored without it: the shape the live site has.
        return _FakeResp(html, url + '/'), url

    monkeypatch.setattr(mirror_script, 'fetch', redirecting_fetch)
    mirror_script.crawl([stored])

    assert BASE + '/worlds2000/events.html' in fetched
    assert BASE + '/events.html' not in fetched


# Revisiting. A finished capture makes an ordinary re-run a no-op: every seed is
# already visited, so the crawl skips all of them, extracts no links and stops.
# Forgetting what has been seen is the only way to read a page again or to reach
# anything published since.

def test_a_page_edited_since_capture_is_reread_only_after_a_revisit(
        crawl_env, monkeypatch):
    site, fetched = crawl_env
    page = BASE + '/members/profile/11985'
    site[page] = '<html><body>as first captured</body></html>'
    mirror_script.crawl([page])
    on_disk = Path(mirror_script.url_to_filepath(page))
    assert 'as first captured' in on_disk.read_text(encoding='utf-8')

    # The live page changes.
    site[page] = '<html><body>edited since the capture</body></html>'
    fetched.clear()

    # A plain re-run does not notice: the page has been seen.
    mirror_script.crawl([page])
    assert fetched == []
    assert 'as first captured' in on_disk.read_text(encoding='utf-8')

    # After forgetting it, the same run picks the edit up.
    mirror_script.clear_for_revisit()
    mirror_script.crawl([page])
    assert fetched == [page]
    assert 'edited since the capture' in on_disk.read_text(encoding='utf-8')


def test_a_revisit_list_clears_only_the_pages_it_names(state):
    kept = BASE + '/faq/show/1'
    named = BASE + '/faq/show/2'
    state.visited.update({kept, named})
    state.failed_urls.add(named)

    assert mirror_script.clear_for_revisit([named]) == 1
    assert kept in state.visited
    assert named not in state.visited
    # A URL that failed months ago may answer now, and links neutralized on that
    # evidence deserve reconsidering, so the failure record goes too.
    assert named not in state.failed_urls


def test_revisiting_keeps_the_capture_and_the_recorded_video_outcomes(state):
    # Only the record of what has been seen is dropped. Throwing away the
    # content hashes, the sitemap or the video manifest would mean re-fetching
    # media already held and losing which videos are already downloaded.
    state.visited.add(BASE + '/faq/show/1')
    state.content_hashes['hash'] = '/captured/file'
    state.skipped_videos['key'] = {'disposition': 'backfilled'}
    state.sitemap.append('/captured/file')

    mirror_script.clear_for_revisit()

    assert state.visited == set()
    assert state.content_hashes == {'hash': '/captured/file'}
    assert state.skipped_videos == {'key': {'disposition': 'backfilled'}}
    assert state.sitemap == ['/captured/file']
