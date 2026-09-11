"""Unservable-artifact contract for the mirror crawler: file types a static
archive cannot serve are removed from the capture itself rather than withheld at
publish time, the pattern list is type-based so a later capture cannot restore
what an earlier one cleaned, the sweep is idempotent and dry-runnable, and it
leaves crawl state consistent with what it removed.

The distinction this pins, because the two mechanisms look alike and are not:
the publisher withholds bytes that are worth keeping in the only surviving copy
of the site; this removes bytes nothing can ever serve, so that the dead-link
pass which follows can settle the references that pointed at them.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_unservable_artifacts.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script'] = mirror_script
spec.loader.exec_module(mirror_script)

PATTERNS = frozenset({'*.map'})


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """Isolated mirror tree + progress file + fresh crawl state."""
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'mirror_state', mirror_script.MirrorState())
    www = mirror_dir / 'www.footbag.org'
    www.mkdir(parents=True)
    return www


def _touch(root: Path, rel: str, content: bytes = b'x') -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content)
    return p


# ----- What the sweep removes, and what it must not touch -----

def test_matching_type_is_removed_at_any_depth(tree):
    shallow = _touch(tree, 'sitemap.map')
    deep = _touch(tree, 'worlds95/photos/w95c-3-1.map')

    removed = mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert not shallow.exists()
    assert not deep.exists()
    assert {p.name for p in removed} == {'sitemap.map', 'w95c-3-1.map'}


def test_content_of_other_types_survives(tree):
    page = _touch(tree, 'worlds95/photos/w95c-3-1.html', b'<html></html>')
    photo = _touch(tree, 'worlds95/photos/w95c-3-1.jpg')

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert page.exists()
    assert photo.exists()


def test_a_filename_that_merely_contains_the_type_is_not_removed(tree):
    # '*.map' is a type, not a substring: a page about imagemaps stays.
    keeper = _touch(tree, 'help/imagemap-howto.html')

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert keeper.exists()


def test_sanitization_sidecar_goes_with_its_file(tree):
    # A sidecar left behind names media that is gone, and the publisher's own
    # gate refuses a tree carrying a sidecar with no file beside it.
    media = _touch(tree, 'media/99/clip.map')
    sidecar = _touch(tree, 'media/99/clip.map.sanitized', b'')

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert not media.exists()
    assert not sidecar.exists()


def test_emptied_directories_are_pruned_but_the_root_survives(tree):
    _touch(tree, 'worlds95/photos/only.map')

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert not (tree / 'worlds95' / 'photos').exists()
    assert not (tree / 'worlds95').exists()
    assert tree.is_dir()


# ----- Dry run, idempotency, and an absent or empty list -----

def test_dry_run_reports_without_removing(tree):
    doomed = _touch(tree, 'worlds95/photos/w95c-3-1.map')

    removed = mirror_script.strip_unservable_artifacts(dry_run=True, patterns=PATTERNS)

    assert doomed.exists()
    assert [p.name for p in removed] == ['w95c-3-1.map']


def test_second_run_removes_nothing_and_does_not_fail(tree):
    _touch(tree, 'worlds95/photos/w95c-3-1.map')

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)
    again = mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert again == []


def test_no_patterns_removes_nothing(tree):
    keeper = _touch(tree, 'worlds95/photos/w95c-3-1.map')

    assert mirror_script.strip_unservable_artifacts(patterns=frozenset()) == []
    assert keeper.exists()


def test_absent_list_is_not_an_error_but_an_empty_one_is(tmp_path):
    # A machine without the list still makes a valid capture; a list someone
    # emptied by accident would otherwise read as a decision to strip nothing.
    assert mirror_script.load_unservable_patterns(str(tmp_path / 'absent.txt')) == frozenset()

    emptied = tmp_path / 'emptied.txt'
    emptied.write_text('# every pattern commented out\n')
    with pytest.raises(ValueError):
        mirror_script.load_unservable_patterns(str(emptied))


def test_committed_list_strips_the_server_side_imagemaps():
    # The shipped list is what a crawl actually applies, so its content is part
    # of the contract rather than an example.
    patterns = mirror_script.load_unservable_patterns()
    assert '*.map' in patterns


# ----- Crawl state -----

def test_state_keyed_by_path_loses_the_removed_file(tree, monkeypatch):
    doomed = _touch(tree, 'worlds95/photos/w95c-3-1.map')
    kept = _touch(tree, 'worlds95/photos/w95c-3-1.html', b'<html></html>')
    state = mirror_script.mirror_state
    state.sitemap = [str(doomed), str(kept)]
    state.content_hashes = {'h1': str(doomed), 'h2': str(kept)}
    monkeypatch.setattr(state, 'load_progress', lambda: True)
    monkeypatch.setattr(state, 'save_progress', lambda: None)

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert state.sitemap == [str(kept)]
    assert state.content_hashes == {'h2': str(kept)}


# ----- It happens by default, in every path that settles the tree -----

def _block(source: str, start: str, end: str) -> str:
    at = source.index(start)
    return source[at:source.index(end, at)]


def test_every_settling_path_strips_before_it_settles_links():
    # Read as source rather than driven, because both call sites sit inside passes
    # that need a whole captured tree to run. What is pinned is the property that
    # makes this a default rather than a step to remember: the strip is not only
    # reachable through its own flag, it runs wherever the tree is settled, and it
    # runs BEFORE the dead-link pass, which is what repairs the references to what
    # it removed. Reversed, a reader meets links to files the capture no longer
    # holds, which is the failure the strip exists to avoid rather than cause.
    source = SCRIPT_PATH.read_text(encoding='utf-8')

    crawl_end = _block(source, 'def generate_reachability_pages(', '\ndef ')
    settle_only = _block(source, 'if args.settle_for_publication_only:', '\n    if args.')

    for where, block in (('the crawl end', crawl_end), ('the settle pass', settle_only)):
        assert 'strip_unservable_artifacts()' in block, where
        assert ('neutralize_dead_internal_links()' in block), where
        assert (block.index('strip_unservable_artifacts()')
                < block.index('neutralize_dead_internal_links()')), where


def test_visited_urls_are_left_alone(tree, monkeypatch):
    # A stripped type is not content a ruling withdrew. A resumed crawl may fetch
    # it again and the strip at that crawl's end removes it again; pruning the URL
    # state would tell the crawl it had never seen pages it had.
    doomed = _touch(tree, 'worlds95/photos/w95c-3-1.map')
    url = 'http://www.footbag.org/worlds95/photos/w95c-3-1.map'
    state = mirror_script.mirror_state
    state.visited = {url}
    state.sitemap = [str(doomed)]
    monkeypatch.setattr(state, 'load_progress', lambda: True)
    monkeypatch.setattr(state, 'save_progress', lambda: None)

    mirror_script.strip_unservable_artifacts(patterns=PATTERNS)

    assert state.visited == {url}
