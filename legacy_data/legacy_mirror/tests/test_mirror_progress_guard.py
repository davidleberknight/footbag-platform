"""The save guard on the capture record, in create_mirror_footbag_org.py.

mirror_progress.json is the record of what a crawl has read. It is days of
crawling, it cannot be rebuilt from the pages on disk, and save_progress used to
replace it with whatever was in memory without looking. An empty or partial
state written over a finished capture destroys the record silently, and the next
run then reads the site as uncaptured and re-crawls it from nothing.

The visited set shrinks in exactly three places, each of which knows what it is
dropping and why: a targeted revisit forgetting the addresses it was handed, a
whole-capture revisit forgetting everything on purpose, and the exclusion sweep
pruning addresses that must not be captured at all. Everything else is growth.
So the floor for a save is arithmetic, not a percentage: what this run loaded,
minus what it deliberately gave up. A run that never loaded the record may not
shrink it at all.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_progress_guard.py -v
"""
import importlib.util
import json
import logging
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_guard', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_guard'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


def urls(count, start=0):
    return [mirror_script.normalize_url(f'{BASE}/rules/chapter/{n}')
            for n in range(start, start + count)]


@pytest.fixture
def state(tmp_path, monkeypatch):
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    (mirror_dir / 'www.footbag.org').mkdir(parents=True)
    return st


@pytest.fixture
def progress_path():
    return lambda: Path(mirror_script.PROGRESS_FILE)


def seed_record(count):
    """Write a finished-looking capture record straight to disk."""
    seeded = mirror_script.MirrorState()
    seeded.visited = set(urls(count))
    seeded.sitemap = [f'/page/{n}' for n in range(count)]
    assert seeded.save_progress() is True
    return seeded


def on_disk_visited():
    return len(json.loads(Path(mirror_script.PROGRESS_FILE).read_text())['visited'])


# --- the ordinary cases, which must not be disturbed ----------------------


def test_a_first_save_with_no_existing_file_succeeds(state):
    state.visited = set(urls(5))
    assert state.save_progress() is True
    assert on_disk_visited() == 5


def test_a_larger_save_succeeds(state):
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(50, start=100))
    assert state.save_progress() is True
    assert on_disk_visited() == 150


def test_an_equal_save_succeeds(state):
    seed_record(100)
    state.load_progress()
    assert state.save_progress() is True
    assert on_disk_visited() == 100


def test_a_small_incremental_change_succeeds(state):
    # The shape of an ordinary crawl: the periodic save every 50 URLs.
    seed_record(1000)
    state.load_progress()
    state.visited.add(mirror_script.normalize_url(f'{BASE}/news/list_2024'))
    assert state.save_progress() is True
    assert on_disk_visited() == 1001


# --- the accident this exists to stop -------------------------------------


def test_an_unloaded_run_may_not_shrink_the_record(state):
    # A process that never read the file has no basis for replacing it with
    # something smaller. This is the exact shape of the loss it prevents.
    seed_record(88800)
    state.visited = set()

    assert state.save_progress() is False
    assert on_disk_visited() == 88800


def test_the_refusal_names_both_counts_and_the_reason(state, caplog):
    seed_record(88800)
    state.visited = set(urls(12))
    with caplog.at_level(logging.ERROR):
        assert state.save_progress() is False
    assert '88,800' in caplog.text
    assert '12' in caplog.text
    assert 'never loaded' in caplog.text
    assert '-fresh' in caplog.text


def test_a_loaded_run_may_not_shrink_beyond_what_it_gave_up(state):
    seed_record(500)
    state.load_progress()
    # Nothing authorized this: the set was emptied by something other than the
    # three accounted-for paths.
    state.visited = set(urls(10))

    assert state.save_progress() is False
    assert on_disk_visited() == 500


def test_a_refusal_leaves_no_rolling_copy_behind(state):
    seed_record(88800)
    state.visited = set()

    assert state.save_progress() is False
    assert not Path(mirror_script.PROGRESS_FILE + '.prev').exists()


def test_a_refusal_does_not_replace_an_existing_rolling_copy(state):
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(20, start=100))
    assert state.save_progress() is True          # creates .prev at 100
    prev = Path(mirror_script.PROGRESS_FILE + '.prev')
    before = prev.read_bytes()

    stray = mirror_script.MirrorState()
    stray.visited = set()
    assert stray.save_progress() is False
    assert prev.read_bytes() == before


# --- the legitimate shrinks ----------------------------------------------


def test_a_whole_capture_revisit_may_write_an_empty_record(state):
    seed_record(88800)
    state.load_progress()
    mirror_script.clear_for_revisit()

    assert state.save_progress() is True
    assert on_disk_visited() == 0


def test_an_explicit_fresh_wipe_may_write_a_much_smaller_record(state):
    seed_record(88800)
    state.load_progress()
    mirror_script.wipe_previous_mirror_state()
    state.visited = set(urls(3))

    assert state.save_progress() is True
    assert on_disk_visited() == 3


def test_a_targeted_revisit_is_not_a_false_refusal(state):
    # The everyday repair: forget a handful of addresses, save before any of
    # them has been re-read. The record is smaller by exactly what was handed in.
    seed_record(88800)
    state.load_progress()
    listed = urls(4)
    mirror_script.clear_for_revisit(listed)

    assert len(state.visited) == 88796
    assert state.save_progress() is True
    assert on_disk_visited() == 88796


def test_a_large_targeted_revisit_is_not_a_false_refusal(state):
    # A revisit list may be long. Being long does not make it an accident: the
    # floor moves with what was actually handed in, so this stays allowed.
    seed_record(1000)
    state.load_progress()
    mirror_script.clear_for_revisit(urls(900))

    assert len(state.visited) == 100
    assert state.save_progress() is True
    assert on_disk_visited() == 100


def test_the_exclusion_sweep_prune_is_accounted_for(state):
    seed_record(100)
    state.load_progress()
    # The sweep drops addresses that must not be captured, and says so.
    dropped = set(urls(30))
    state.visited -= dropped
    state.authorized_visited_removals += len(dropped)

    assert state.save_progress() is True
    assert on_disk_visited() == 70


# --- the rolling copy and the atomic write --------------------------------


def test_the_rolling_copy_holds_the_exact_prior_file(state):
    seed_record(100)
    original = Path(mirror_script.PROGRESS_FILE).read_bytes()
    state.load_progress()
    state.visited.update(urls(10, start=100))
    assert state.save_progress() is True

    assert Path(mirror_script.PROGRESS_FILE + '.prev').read_bytes() == original
    assert on_disk_visited() == 110


def test_the_rolling_copy_keeps_only_one_generation(state):
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(10, start=100))
    assert state.save_progress() is True
    first_prev = Path(mirror_script.PROGRESS_FILE + '.prev').read_bytes()
    state.visited.update(urls(10, start=200))
    assert state.save_progress() is True

    prev = Path(mirror_script.PROGRESS_FILE + '.prev').read_bytes()
    assert prev != first_prev
    assert json.loads(prev)['visited'].__len__() == 110


def test_a_failed_write_leaves_the_live_record_intact(state, monkeypatch):
    seed_record(100)
    original = Path(mirror_script.PROGRESS_FILE).read_bytes()
    state.load_progress()
    state.visited.update(urls(10, start=100))

    def explode(*args, **kwargs):
        raise OSError('disk full')

    monkeypatch.setattr(mirror_script.json, 'dump', explode)
    with pytest.raises(OSError):
        state.save_progress()

    assert Path(mirror_script.PROGRESS_FILE).read_bytes() == original
    assert not Path(mirror_script.PROGRESS_FILE + '.tmp').exists()


def test_a_failed_rename_leaves_the_live_record_intact(state, monkeypatch):
    seed_record(100)
    original = Path(mirror_script.PROGRESS_FILE).read_bytes()
    state.load_progress()
    state.visited.update(urls(10, start=100))

    def explode(*args, **kwargs):
        raise OSError('rename failed')

    monkeypatch.setattr(mirror_script.os, 'replace', explode)
    with pytest.raises(OSError):
        state.save_progress()

    assert Path(mirror_script.PROGRESS_FILE).read_bytes() == original


def test_a_failed_save_leaves_an_existing_prev_untouched(state, monkeypatch):
    # The commit point is the rename of the live file. A save that never
    # reaches it must cost the operator neither the record nor the spare copy,
    # so the copy is staged under its own name and only promoted afterwards.
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(10, start=100))
    assert state.save_progress() is True           # .prev now holds the 100
    prev = Path(mirror_script.PROGRESS_FILE + '.prev')
    prev_before = prev.read_bytes()
    live_before = Path(mirror_script.PROGRESS_FILE).read_bytes()

    def explode(*args, **kwargs):
        raise OSError('rename failed')

    state.visited.update(urls(10, start=300))
    monkeypatch.setattr(mirror_script.os, 'replace', explode)
    with pytest.raises(OSError):
        state.save_progress()

    assert Path(mirror_script.PROGRESS_FILE).read_bytes() == live_before
    assert prev.read_bytes() == prev_before
    assert json.loads(prev_before)['visited'].__len__() == 100


def test_a_failed_save_leaves_no_staging_files_behind(state, monkeypatch):
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(10, start=100))

    def explode(*args, **kwargs):
        raise OSError('rename failed')

    monkeypatch.setattr(mirror_script.os, 'replace', explode)
    with pytest.raises(OSError):
        state.save_progress()

    assert not Path(mirror_script.PROGRESS_FILE + '.tmp').exists()
    assert not Path(mirror_script.PROGRESS_FILE + '.prev.tmp').exists()


def test_prev_holds_the_state_that_was_live_not_the_one_being_written(state):
    # The distinction that matters when recovering: .prev is the record as it
    # stood before this save, never a copy of what this save wrote.
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(10, start=100))
    assert state.save_progress() is True

    live = json.loads(Path(mirror_script.PROGRESS_FILE).read_text())
    prev = json.loads(Path(mirror_script.PROGRESS_FILE + '.prev').read_text())
    assert len(live['visited']) == 110
    assert len(prev['visited']) == 100


def test_a_successful_save_leaves_no_staging_files_behind(state):
    seed_record(100)
    state.load_progress()
    state.visited.update(urls(10, start=100))
    assert state.save_progress() is True

    assert not Path(mirror_script.PROGRESS_FILE + '.tmp').exists()
    assert not Path(mirror_script.PROGRESS_FILE + '.prev.tmp').exists()


# --- older progress files -------------------------------------------------


def test_an_older_schema_file_loads_and_saves_safely(state):
    # A file written before the newer keys existed must load, must not be read
    # as a shrink, and must round-trip with the new keys filled in.
    path = Path(mirror_script.PROGRESS_FILE)
    path.write_text(json.dumps({
        'visited': urls(40),
        'failed_urls': [],
        'sitemap': [],
        'queue': [],
        'url_depth': {},
        'content_hashes': {},
        'stats': {},
        'refused_pages': [],
        'transient_failures': [],
        'timestamp': '2026-01-01T00:00:00',
    }))

    assert state.load_progress() is True
    assert len(state.visited) == 40
    assert state.transient_http_faults == set()
    assert state.save_progress() is True

    written = json.loads(path.read_text())
    assert len(written['visited']) == 40
    assert written['transient_http_faults'] == []


def test_an_unreadable_existing_file_does_not_block_the_save(state, caplog):
    # Nothing to compare against, so the check cannot run. The old bytes are
    # still preserved in the rolling copy, which is the most that can be done.
    path = Path(mirror_script.PROGRESS_FILE)
    path.write_text('{ this is not json')
    state.visited = set(urls(5))

    with caplog.at_level(logging.WARNING):
        assert state.save_progress() is True
    assert 'Could not read the existing progress file' in caplog.text
    assert Path(mirror_script.PROGRESS_FILE + '.prev').read_text() == '{ this is not json'


def test_a_file_with_no_visited_key_is_not_read_as_a_shrink(state):
    path = Path(mirror_script.PROGRESS_FILE)
    path.write_text(json.dumps({'timestamp': '2026-01-01T00:00:00'}))
    state.visited = set(urls(5))

    assert state.save_progress() is True
    assert on_disk_visited() == 5
