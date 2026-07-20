"""Bounded-run isolation for the mirror crawler.

A bounded run (e.g. a smoke test) must not read or write the real mirror or its
progress file, and must be genuinely small. These tests prove that
FOOTBAG_MIRROR_STATE_DIR relocates every crawl-state path (mirror tree, progress,
log, robots cache) into a throwaway directory, and that FOOTBAG_MIRROR_MAX_URLS /
FOOTBAG_MIRROR_MAX_DEPTH cap the crawl. With no env set, the production defaults
are unchanged.

The overrides are read at import, so each case loads a fresh module instance.

Run from repo root:
    python -m pytest legacy_data/tests/test_mirror_isolation.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'


def _load(name):
    spec = importlib.util.spec_from_file_location(name, str(SCRIPT_PATH))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_state_dir_override_relocates_all_crawl_state(tmp_path, monkeypatch):
    monkeypatch.setenv('FOOTBAG_MIRROR_STATE_DIR', str(tmp_path))
    m = _load('mirror_iso_relocated')
    assert m.MIRROR_DIR == str(tmp_path / 'mirror_footbag_org')
    assert m.PROGRESS_FILE == str(tmp_path / 'mirror_progress.json')
    assert m.LOG_FILE == str(tmp_path / 'mirror.log')
    assert m.ROBOTS_CACHE_FILE == str(tmp_path / 'robots_cache.json')
    # None of them point back at the real script-dir mirror.
    assert 'legacy_data/mirror_footbag_org' not in m.MIRROR_DIR


def test_bounds_are_capped_by_env(tmp_path, monkeypatch):
    monkeypatch.setenv('FOOTBAG_MIRROR_STATE_DIR', str(tmp_path))
    monkeypatch.setenv('FOOTBAG_MIRROR_MAX_URLS', '25')
    monkeypatch.setenv('FOOTBAG_MIRROR_MAX_DEPTH', '1')
    m = _load('mirror_iso_bounded')
    assert m.MAX_URLS == 25
    assert m.MAX_DEPTH == 1


def test_defaults_unchanged_without_env(monkeypatch):
    monkeypatch.delenv('FOOTBAG_MIRROR_STATE_DIR', raising=False)
    monkeypatch.delenv('FOOTBAG_MIRROR_MAX_URLS', raising=False)
    monkeypatch.delenv('FOOTBAG_MIRROR_MAX_DEPTH', raising=False)
    m = _load('mirror_iso_default')
    assert m.MIRROR_DIR.endswith('legacy_data/mirror_footbag_org')
    assert m.MAX_URLS == 1000000
    assert m.MAX_DEPTH == 50


def test_main_creates_relocated_state_dir_before_opening_log(tmp_path, monkeypatch):
    # A relocated state dir that does not exist yet must be created before the
    # -log file handler or a progress save opens a file under it. Regression for
    # the FileNotFoundError a bounded smoke run hit. main() is stopped at
    # load_progress (right after the state-dir + log setup, before any network).
    target = tmp_path / 'fresh-state'          # deliberately absent
    monkeypatch.setenv('FOOTBAG_MIRROR_STATE_DIR', str(target))
    monkeypatch.setenv('FOOTBAG_MIRROR_PASSWORD', 'unused-fixture')  # skip getpass
    monkeypatch.setenv('FOOTBAG_MIRROR_MAX_URLS', '1')
    m = _load('mirror_iso_main')
    assert not target.exists()                 # nothing created at import

    class _Stop(RuntimeError):
        pass

    def _boom():
        raise _Stop('stop before network')

    monkeypatch.setattr(m.mirror_state, 'load_progress', _boom)
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py', 'someuser', '-log'])
    try:
        m.main()
    except _Stop:
        pass
    # main() reached load_progress, which means the state dir + log handler were
    # set up first without error.
    assert target.exists()
    assert Path(m.LOG_FILE).exists()
    assert Path(m.MIRROR_DIR).is_dir()
