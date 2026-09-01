"""Carrying a settled video outcome forward into a fresh manifest write, in
create_mirror_footbag_org.py (MirrorState._carry_forward_backfill_outcomes).

The backfill records each video's outcome straight into the on-disk manifest.
A crawl rebuilds that same file from its own in-memory record, which a
resumed run restored from a progress file that can predate the backfill
entirely. Found in production: 215+ videos that a backfill run genuinely
downloaded, converted and correctly relinked were reported as
'backfill_failed' in the manifest anyway, because a later resumed crawl's
stale in-memory copy (loaded from an old progress snapshot, never actually
re-attempted) was trusted over the manifest's real, more recent outcome. The
next backfill run would then have treated all of them as fresh candidates and
re-attempted them against a site about to be retired.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_video_manifest_carryforward.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_carryforward', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_carryforward'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
VIDEO_URL = BASE + '/media/1100/routine.mov'
NORM_URL = mirror_script.normalize_url(VIDEO_URL)


@pytest.fixture
def state(tmp_path):
    st = mirror_script.MirrorState()
    return st, tmp_path / 'skipped_videos.json'


def _write_manifest(path, records):
    import json
    path.write_text(json.dumps(records), encoding='utf-8')


def test_a_stale_resumed_pending_record_takes_the_manifests_real_outcome(state):
    # The exact production bug: a crawl resumed from an old progress snapshot
    # holds the video as still-pending (no attempts ever recorded in this
    # session), while the on-disk manifest already has the backfill's real,
    # later result. The manifest's outcome must win.
    st, manifest_path = state
    st.skipped_videos[NORM_URL] = {
        'normalized_url': NORM_URL, 'url': VIDEO_URL, 'disposition': 'skipped_video',
    }
    _write_manifest(manifest_path, [{
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfilled', 'attempts': 1,
        'local_file': 'media/1100/routine.mp4',
    }])

    st._carry_forward_backfill_outcomes(str(manifest_path))

    assert st.skipped_videos[NORM_URL]['disposition'] == 'backfilled'
    assert st.skipped_videos[NORM_URL]['attempts'] == 1
    assert st.skipped_videos[NORM_URL]['local_file'] == 'media/1100/routine.mp4'


def test_a_stale_resumed_failed_disposition_with_no_attempts_is_overridden(state):
    # This is the specific shape production data showed: disposition already
    # 'backfill_failed' in memory, but with no attempts at all - meaning it
    # was never actually retried this session, only inherited from an old
    # progress file. The manifest's real, later 'backfilled' outcome must
    # still win; the stale disposition being non-None must not block it.
    st, manifest_path = state
    st.skipped_videos[NORM_URL] = {
        'normalized_url': NORM_URL, 'url': VIDEO_URL, 'disposition': 'backfill_failed',
    }
    _write_manifest(manifest_path, [{
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfilled', 'attempts': 1,
        'local_file': 'media/1100/routine.mp4',
    }])

    st._carry_forward_backfill_outcomes(str(manifest_path))

    assert st.skipped_videos[NORM_URL]['disposition'] == 'backfilled'


def test_a_genuinely_fresh_outcome_this_run_produced_is_not_overwritten(state):
    # The legitimate case the guard exists for: this run's own backfill pass
    # just set a real outcome, marking it in settled_this_run exactly as
    # run_video_backfill does, and the on-disk manifest is the OLDER file
    # about to be rewritten. The fresh in-memory value must win here, not the
    # stale on-disk one.
    st, manifest_path = state
    st.skipped_videos[NORM_URL] = {
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfilled', 'attempts': 1,
        'local_file': 'media/1100/routine.mp4',
    }
    st.settled_this_run = {NORM_URL}
    _write_manifest(manifest_path, [{
        'normalized_url': NORM_URL, 'url': VIDEO_URL, 'disposition': 'skipped_video',
    }])

    st._carry_forward_backfill_outcomes(str(manifest_path))

    assert st.skipped_videos[NORM_URL]['disposition'] == 'backfilled'
    assert st.skipped_videos[NORM_URL]['local_file'] == 'media/1100/routine.mp4'


def test_a_genuine_repeat_failure_settled_this_run_is_not_reopened(state):
    # A video this run really retried and really saw fail again is settled by
    # this process itself - the manifest's older outcome for the same video
    # must not silently reopen or change it.
    st, manifest_path = state
    st.skipped_videos[NORM_URL] = {
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfill_failed', 'attempts': 2,
    }
    st.settled_this_run = {NORM_URL}
    _write_manifest(manifest_path, [{
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfill_failed', 'attempts': 1,
    }])

    st._carry_forward_backfill_outcomes(str(manifest_path))

    assert st.skipped_videos[NORM_URL]['attempts'] == 2


def test_a_stale_snapshot_carrying_attempts_still_loses_to_the_manifest(state):
    # The blind spot the attempts-presence heuristic had: a crawl that ran
    # after an earlier backfill persisted carried-forward attempts into its
    # progress file, so a later resume presents 'settled disposition plus
    # attempts' from a snapshot that still predates the manifest's newest
    # write. Only the process's own in-run mark may defend an in-memory
    # outcome; an unmarked record takes the manifest's later word, attempts
    # included, however complete the snapshot looks.
    st, manifest_path = state
    st.skipped_videos[NORM_URL] = {
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfill_failed', 'attempts': 2,
    }
    _write_manifest(manifest_path, [{
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfilled', 'attempts': 3,
        'local_file': 'media/1100/routine.mp4',
    }])

    st._carry_forward_backfill_outcomes(str(manifest_path))

    assert st.skipped_videos[NORM_URL]['disposition'] == 'backfilled'
    assert st.skipped_videos[NORM_URL]['attempts'] == 3
    assert st.skipped_videos[NORM_URL]['local_file'] == 'media/1100/routine.mp4'


def test_a_video_the_crawl_never_saw_this_run_is_not_resurrected(state):
    # An exclusion ruling can drop a record the crawl no longer holds at all;
    # the manifest must not bring it back from a stale on-disk copy.
    st, manifest_path = state
    _write_manifest(manifest_path, [{
        'normalized_url': NORM_URL, 'url': VIDEO_URL,
        'disposition': 'backfilled', 'attempts': 1,
    }])

    st._carry_forward_backfill_outcomes(str(manifest_path))

    assert NORM_URL not in st.skipped_videos
