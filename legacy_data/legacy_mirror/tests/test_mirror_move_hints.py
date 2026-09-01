"""Move-hint popups become plain captured pages, in create_mirror_footbag_org.py.

The freestyle moves section reaches its member-written hints only through
javascript:openHintWindow('/newmoves/showhint/N') anchors, which the crawler's
link extraction never follows, so 431 hint pages existed only on the live
site while the archive shipped teasers ending in "more" over dead controls.
The rewrite gives each anchor a real relative address (same treatment as the
popupprofile handler beside it) and enqueues the hint page, which is a
complete, standalone, script-free HTML document. The hint page's own
"update" link is an editor surface and is refused like every other one.

Anchor markup below is the real captured shape from newmoves/listhints pages.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_move_hints.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_hints', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_hints'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL

# Real captured shape (newmoves/listhints/74): unquoted attributes normalized
# by the parser, teaser text with the trailing "more" affordance.
LISTHINTS_ANCHOR = (
    '<td><font face="sans-serif">'
    '<a href="javascript:openHintWindow(\'/newmoves/showhint/439\')" '
    'target="_blank">I agree with Richard. Learn Doub... '
    '<font size="-1">more</font></a></font></td>')


@pytest.fixture
def tree(tmp_path, monkeypatch):
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'mirror_state',
                        mirror_script.MirrorState())
    (mirror_dir / 'www.footbag.org').mkdir(parents=True)
    return mirror_dir


def test_the_hint_anchor_gains_a_real_relative_address(tree):
    # The handler writes the absolute site form and the generic attribute
    # loop relativizes it exactly once, so the link lands at
    # newmoves/showhint/439 - not one directory too high, which is where a
    # handler-written relative path ends up after the loop re-resolves it
    # against the served URL's slashless app-route form.
    out = mirror_script.rewrite_links(
        LISTHINTS_ANCHOR, BASE + '/newmoves/listhints/74')
    assert 'javascript:' not in out
    assert 'href="../../showhint/439/index.html"' in out


def test_the_teaser_text_survives_and_the_popup_target_is_normalized(tree):
    # target="_blank" is stripped from every INTERNAL link by the same pass
    # that governs the rest of the archive, so the popup affordance goes the
    # way all internal popups do: an ordinary same-window link.
    out = mirror_script.rewrite_links(
        LISTHINTS_ANCHOR, BASE + '/newmoves/listhints/74')
    assert 'I agree with Richard. Learn Doub...' in out
    assert 'target=' not in out


def test_the_hint_page_is_enqueued_for_capture(tree):
    mirror_script.rewrite_links(
        LISTHINTS_ANCHOR, BASE + '/newmoves/listhints/74')
    hint = mirror_script.normalize_url(BASE + '/newmoves/showhint/439')
    assert hint in mirror_script.mirror_state.queue


def test_an_already_captured_hint_is_not_enqueued_again(tree):
    hint = mirror_script.normalize_url(BASE + '/newmoves/showhint/439')
    mirror_script.mirror_state.visited.add(hint)
    mirror_script.rewrite_links(
        LISTHINTS_ANCHOR, BASE + '/newmoves/listhints/74')
    assert hint not in mirror_script.mirror_state.queue


def test_rewriting_twice_is_stable(tree):
    once = mirror_script.rewrite_links(
        LISTHINTS_ANCHOR, BASE + '/newmoves/listhints/74')
    twice = mirror_script.rewrite_links(
        once, BASE + '/newmoves/listhints/74')
    assert '../../showhint/439/index.html' in twice
    assert 'javascript:' not in twice


def test_the_hint_route_itself_is_ordinary_capturable_content():
    url = BASE + '/newmoves/showhint/439'
    assert not mirror_script.is_unsafe_url(url)
    assert mirror_script.url_to_filepath(url).endswith(
        'newmoves/showhint/439/index.html')


def test_the_hint_editor_surfaces_are_refused():
    # Every captured hint page links its own '/newmoves/edithint/N' update
    # form; without this refusal the hint harvest drags 431 editor forms in.
    assert mirror_script.is_unsafe_url(BASE + '/newmoves/edithint/439')
    assert mirror_script.is_unsafe_url(BASE + '/newmoves/addhint/74')
    assert mirror_script.is_unsafe_url(BASE + '/newmoves/addhint2/74')
