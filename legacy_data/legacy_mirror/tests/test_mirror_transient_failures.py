"""The transient-failure record, in create_mirror_footbag_org.py.

A URL is marked visited before its fetch, and a fetch exhausted on a TRANSIENT
failure (503, timeout, DNS) deliberately records no failed_urls entry so the
dead-link pass never acts on a hiccup. Together those made a run that silently
never read N pages end looking identical to one that read everything - the
freeze-window revisit could not be proved complete. The residue is now held in
mirror_state.transient_failures, survives the progress file, clears on a later
successful fetch or a revisit, and is written out as transient_failures.txt at
the end of every crawl: the completeness proof is that file saying nothing is
owed.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_transient_failures.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_transient', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_transient'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
URL_A = mirror_script.normalize_url(BASE + '/rules/chapter/30')
URL_B = mirror_script.normalize_url(BASE + '/news/list_2024')


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


def test_the_record_survives_the_progress_file(state):
    state.transient_failures = {URL_A, URL_B}
    state.save_progress()
    reloaded = mirror_script.MirrorState()
    assert reloaded.load_progress()
    assert reloaded.transient_failures == {URL_A, URL_B}


def test_a_full_revisit_wipes_the_slate(state):
    # --revisit-all clears the visited record so every page is read again; the
    # owed list starts over with it, and the final run's residue is the truth.
    state.visited.add(URL_A)
    state.transient_failures.add(URL_A)
    mirror_script.clear_for_revisit()
    assert state.transient_failures == set()


def test_a_targeted_revisit_clears_only_the_listed_urls(state):
    state.visited.update({URL_A, URL_B})
    state.transient_failures.update({URL_A, URL_B})
    mirror_script.clear_for_revisit([URL_A])
    assert state.transient_failures == {URL_B}


def test_the_manifest_names_every_owed_url(state):
    state.transient_failures = {URL_B, URL_A}
    path = Path(mirror_script.save_transient_failures())
    body = path.read_text(encoding='utf-8')
    assert 'Total: 2' in body
    assert URL_A in body and URL_B in body


def test_an_empty_manifest_is_still_written(state):
    # An absent file and a run that owed nothing must not look the same: the
    # empty manifest IS the completeness proof.
    path = Path(mirror_script.save_transient_failures())
    assert path.is_file()
    assert 'Total: 0' in path.read_text(encoding='utf-8')
