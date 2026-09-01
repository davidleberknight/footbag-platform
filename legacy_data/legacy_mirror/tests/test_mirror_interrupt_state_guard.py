"""Interrupt safety for the crawler's saved crawl state.

The crawler installs its SIGINT/SIGTERM handler at import, but reads the progress
file much later, inside main(), after argument parsing, exclusion-list loading,
the password prompt and the log setup. An interrupt anywhere in that window must
leave the files on disk alone: an empty in-memory state means "not loaded yet",
never "nothing captured", and writing it out would destroy a multi-day capture's
resume state — the visited set, the queue, the content hashes and the
skipped-video manifest that a top-up crawl depends on.

Once a run has loaded that state, or established there is none to load, the
handler must save as it always did.

The state paths are read at import, so each case loads a fresh module instance
against an isolated FOOTBAG_MIRROR_STATE_DIR.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_interrupt_state_guard.py -v
"""
import importlib.util
import json
import signal
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'

# A progress file standing in for a finished capture: a non-empty visited set, a
# queue, and skipped-video records. Any of these coming back empty is the loss
# this guard exists to prevent.
CAPTURED_PROGRESS = {
    'visited': ['http://www.footbag.org/', 'http://www.footbag.org/news/'],
    'failed_urls': [],
    'failed_conversion_videos': [],
    'skipped_videos': {
        'http://www.footbag.org/media/clip.mp4': {
            'url': 'http://www.footbag.org/media/clip.mp4',
            'reason': 'content-type',
        },
    },
    'sitemap': ['http://www.footbag.org/'],
    'queue': ['http://www.footbag.org/clubs/'],
    'url_depth': {'http://www.footbag.org/': 0},
    'content_hashes': {'deadbeef': 'http://www.footbag.org/'},
    'stats': {'total_urls': 2, 'successful_downloads': 2},
    'refused_pages': [],
    'regsummary_map': {},
    'timestamp': '2026-08-09T02:46:08.882000',
}


def _load(name, state_dir, monkeypatch):
    monkeypatch.setenv('FOOTBAG_MIRROR_STATE_DIR', str(state_dir))
    spec = importlib.util.spec_from_file_location(name, str(SCRIPT_PATH))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seed_capture(state_dir):
    """Write a finished capture's state files into an isolated state dir."""
    state_dir.mkdir(parents=True, exist_ok=True)
    progress = state_dir / 'mirror_progress.json'
    progress.write_text(json.dumps(CAPTURED_PROGRESS, indent=2))
    mirror_dir = state_dir / 'mirror_footbag_org'
    mirror_dir.mkdir(exist_ok=True)
    manifest = mirror_dir / 'skipped_videos.json'
    manifest.write_text(json.dumps(CAPTURED_PROGRESS['skipped_videos'], indent=2))
    return progress, manifest


def test_interrupt_before_state_is_loaded_writes_nothing(tmp_path, monkeypatch):
    progress, manifest = _seed_capture(tmp_path)
    before_progress = progress.read_bytes()
    before_manifest = manifest.read_bytes()

    m = _load('mirror_interrupt_unloaded', tmp_path, monkeypatch)
    # Nothing has loaded progress: this is the window between module import and
    # main() reaching its resume decision.
    with pytest.raises(SystemExit) as exit_info:
        m.signal_handler(signal.SIGINT, None)

    assert exit_info.value.code == 0
    assert progress.read_bytes() == before_progress
    assert manifest.read_bytes() == before_manifest


def test_interrupt_after_state_is_loaded_saves(tmp_path, monkeypatch):
    progress, _manifest = _seed_capture(tmp_path)

    m = _load('mirror_interrupt_loaded', tmp_path, monkeypatch)
    assert m.mirror_state.load_progress() is True
    m.mark_crawl_state_authoritative()
    m.mirror_state.visited.add('http://www.footbag.org/events/')

    with pytest.raises(SystemExit) as exit_info:
        m.signal_handler(signal.SIGINT, None)

    assert exit_info.value.code == 0
    saved = json.loads(progress.read_text())
    assert 'http://www.footbag.org/events/' in saved['visited']
    assert len(saved['visited']) == 3


def test_main_marks_state_authoritative_at_the_resume_decision(tmp_path, monkeypatch):
    # The guard must lift exactly once main() has made its resume decision, so
    # a crawl interrupted mid-run still saves. Login now runs FIRST (before the
    # -fresh wipe, so bad credentials cannot destroy a capture) and is stubbed
    # out; main() is stopped at the seed load, the first step after the resume
    # decision.
    _seed_capture(tmp_path)
    monkeypatch.setenv('FOOTBAG_MIRROR_PASSWORD', 'unused-fixture')  # skip getpass
    m = _load('mirror_interrupt_main', tmp_path, monkeypatch)
    assert m._crawl_state_is_authoritative is False

    class _Stop(RuntimeError):
        pass

    def _boom(*args, **kwargs):
        raise _Stop('stop after the resume decision')

    monkeypatch.setattr(m, 'login', lambda: None)
    monkeypatch.setattr(m, 'verify_authenticated_session', lambda: True)
    monkeypatch.setattr(m, 'load_seed_urls', _boom)
    exclusions = tmp_path / 'exclusions.txt'   # network modes require the list
    exclusions.write_text('groups/showfile/208\n')
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py', 'someuser',
                                      '--exclusion-list', str(exclusions)])
    try:
        m.main()
    except _Stop:
        pass

    assert m._crawl_state_is_authoritative is True


def test_exclusion_sweep_marks_state_authoritative(tmp_path, monkeypatch):
    # The network-free sweep loads progress of its own and then writes it back,
    # so an interrupt during it must save rather than be refused.
    _seed_capture(tmp_path)
    m = _load('mirror_interrupt_sweep', tmp_path, monkeypatch)
    assert m._crawl_state_is_authoritative is False

    m.CONTENT_EXCLUSIONS = frozenset({'groups/showfile/208'})
    m.apply_exclusions_sweep(dry_run=True)

    assert m._crawl_state_is_authoritative is True
