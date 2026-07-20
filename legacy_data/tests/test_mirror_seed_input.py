"""Seed-list input mode of create_mirror_footbag_org.py.

Seed lists carry content classes the live site's own filtered indexes never
link, so link-following alone misses them. The crawler loads every .txt in the
seeds directory by default (the archival crawl wants all content); --seeds
narrows to specific files. Seeds enter the queue at depth 0, deduplicated
against visited and queued URLs, and pass through the same unsafe/scope
refusals as discovered links; start URLs stay present on a seeded fresh crawl.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/tests/test_mirror_seed_input.py -v
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


def test_unsafe_and_out_of_scope_seeds_are_refused(state):
    added = mirror_script.enqueue_seed_urls([
        BASE + '/gallery/delete/9',                 # editor view: refused
        'http://photo.footbag.org/worlds96/1.jpg',  # dead host: out of scope
        BASE + '/members/profile/456',              # legitimate: enqueued
    ])
    assert added == 1
    assert state.queue == [BASE + '/members/profile/456']


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
