"""Controls that ran a script, in create_mirror_footbag_org.py.

The archive serves no scripts, so a 'javascript:' reference is a control that
cannot act. Two classes survive the save-time rewrites by construction: the
profile popup carrying '-1', the id the legacy list printed when it had no
member to point at (the rewrite that localizes a real popupprofile(id)
correctly declines it), and the embedded map's own 'void(0)' buttons, whose
behaviour lived entirely in the script that is gone. Both keep their words and
lose the control.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_script_controls.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_controls', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_controls'] = mirror_script
spec.loader.exec_module(mirror_script)


@pytest.fixture
def www(tmp_path, monkeypatch):
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    root = mirror_dir / 'www.footbag.org'
    root.mkdir(parents=True)
    return root


def _page(root, relative, body):
    p = root / relative
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f'<html><body>{body}</body></html>', encoding='utf-8')
    return p


def test_a_profile_popup_with_no_member_keeps_its_words(www):
    # The real leftover: every one of these in the capture is exactly '-1'.
    page = _page(www, 'events/show/1/index.html',
                 '<a href="javascript:popupprofile(\'-1\')">Jane Competitor</a>')
    mirror_script.neutralize_dead_script_controls()
    out = page.read_text(encoding='utf-8')
    assert 'javascript:' not in out
    assert 'Jane Competitor' in out
    assert '<a ' not in out


def test_a_map_placeholder_button_keeps_its_words(www):
    page = _page(www, 'clubs/show/9/index.html',
                 '<a class="kd-button" href="javascript:void(0)" title="By car">By car</a>')
    mirror_script.neutralize_dead_script_controls()
    out = page.read_text(encoding='utf-8')
    assert 'javascript:' not in out
    assert 'By car' in out


def test_a_script_attribute_that_is_not_a_link_is_dropped(www):
    page = _page(www, 'a/index.html',
                 '<img src="javascript:void(0)" alt="spacer"/>')
    mirror_script.neutralize_dead_script_controls()
    out = page.read_text(encoding='utf-8')
    assert 'javascript:' not in out


def test_a_real_local_link_is_never_touched(www):
    page = _page(www, 'b/index.html',
                 '<a href="../members/profile/11985/index.html">Real Member</a>')
    mirror_script.neutralize_dead_script_controls()
    out = page.read_text(encoding='utf-8')
    assert 'members/profile/11985/index.html' in out
    assert '<a ' in out


def test_a_page_with_no_script_control_is_left_untouched(www):
    page = _page(www, 'c/index.html', '<p>Ordinary archive content.</p>')
    before = page.read_text(encoding='utf-8')
    mirror_script.neutralize_dead_script_controls()
    assert page.read_text(encoding='utf-8') == before


def test_running_the_pass_twice_is_a_true_no_op_the_second_time(www):
    page = _page(www, 'd/index.html',
                 '<a href="javascript:popupprofile(\'-1\')">Someone</a>')
    mirror_script.neutralize_dead_script_controls()
    once = page.read_text(encoding='utf-8')
    mirror_script.neutralize_dead_script_controls()
    assert page.read_text(encoding='utf-8') == once
