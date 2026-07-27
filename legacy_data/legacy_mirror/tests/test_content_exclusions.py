"""Content-exclusion contract for the mirror crawler: an operator-supplied
exclusion list keeps committee-scoped and private-group legacy content out of
the capture, network modes refuse to run without the list, and the
enforcement sweep removes already-captured excluded artifacts from an
existing tree while keeping crawl state consistent.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_content_exclusions.py -v
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script'] = mirror_script
spec.loader.exec_module(mirror_script)


@pytest.fixture
def excl(monkeypatch):
    entries = frozenset({
        'ifpa/groups/euros05/program_draft1.doc',
        'ifpa/groups/efc/IMG_0919.JPG',
        'groups/showfile/208',
        'groups/listfiles/88',
        'groups/list/fools',
    })
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS', entries)
    return entries


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """Isolated mirror tree + progress file + fresh crawl state."""
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'mirror_state',
                        mirror_script.MirrorState())
    www = mirror_dir / 'www.footbag.org'
    www.mkdir(parents=True)
    return www


def _touch(root: Path, rel: str, content: bytes = b'x') -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content)
    return p


# ----- Predicate semantics -----

def test_exact_path_is_excluded(excl):
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc')


def test_descendants_of_an_entry_are_excluded(excl):
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/showfile/208/index.html')


def test_sibling_with_longer_id_is_not_excluded(excl):
    # 'groups/showfile/208' must never swallow 'groups/showfile/2081'.
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/showfile/2081')
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/listfiles/8')


def test_percent_encoded_url_matches_decoded_entry(monkeypatch):
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS',
                        frozenset({'ifpa/groups/woc/WOC Structure & Purpose.doc'}))
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/ifpa/groups/woc/WOC%20Structure%20%26%20Purpose.doc')


def test_query_string_does_not_defeat_exclusion(excl):
    assert mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/list/fools?Mode=popup')


def test_no_list_loaded_excludes_nothing():
    assert mirror_script.CONTENT_EXCLUSIONS == frozenset()
    assert not mirror_script.is_excluded_url(
        'http://www.footbag.org/groups/showfile/208')


# ----- List loading -----

def test_loader_skips_comments_and_normalizes(tmp_path):
    f = tmp_path / 'exclusions.txt'
    f.write_text('# comment\n\n/groups/list/fools/\n'
                 'ifpa/groups/woc/WOC%20Structure%20%26%20Purpose.doc\n')
    entries = mirror_script.load_content_exclusions(str(f))
    assert entries == frozenset({
        'groups/list/fools',
        'ifpa/groups/woc/WOC Structure & Purpose.doc',
    })


def test_loader_rejects_empty_list(tmp_path):
    f = tmp_path / 'exclusions.txt'
    f.write_text('# only a comment\n')
    with pytest.raises(ValueError):
        mirror_script.load_content_exclusions(str(f))


# ----- Crawl gates -----

def test_excluded_url_is_out_of_scope(excl):
    assert not mirror_script.is_in_scope(
        'http://www.footbag.org/groups/showfile/208')
    assert mirror_script.is_in_scope(
        'http://www.footbag.org/groups/showfile/2081')


def test_fetch_refuses_excluded_url_without_network(excl):
    resp, final_url = mirror_script.fetch(
        'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc')
    assert resp is None and final_url is None


# ----- Network modes require the list -----

def test_crawl_without_exclusion_list_refuses_to_start(monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py', 'someone'])
    with pytest.raises(SystemExit) as e:
        mirror_script.main()
    assert '--exclusion-list' in str(e.value)


def test_sweep_mode_requires_the_list_too(monkeypatch):
    monkeypatch.setattr(sys, 'argv',
                        ['create_mirror_footbag_org.py', '--apply-exclusions-only'])
    with pytest.raises(SystemExit) as e:
        mirror_script.main()
    assert '--exclusion-list' in str(e.value)


# ----- Enforcement sweep -----

def _build_populated_tree(www: Path):
    excluded_doc = _touch(www, 'ifpa/groups/euros05/program_draft1.doc')
    converted_img = _touch(www, 'ifpa/groups/efc/IMG_0919.jpg')
    sidecar = _touch(www, 'ifpa/groups/efc/IMG_0919.jpg.sanitized', b'')
    excluded_page = _touch(www, 'groups/showfile/208/index.html')
    kept_page = _touch(www, 'groups/showfile/2081/index.html')
    kept_doc = _touch(www, 'ifpa/groups/efc/EFC-public.doc')
    return excluded_doc, converted_img, sidecar, excluded_page, kept_page, kept_doc


def test_sweep_dry_run_deletes_nothing(excl, tree):
    paths = _build_populated_tree(tree)
    removed = mirror_script.apply_exclusions_sweep(dry_run=True)
    assert removed == 4
    assert all(p.exists() for p in paths)


def test_sweep_removes_artifacts_and_prunes_state(excl, tree):
    (excluded_doc, converted_img, sidecar,
     excluded_page, kept_page, kept_doc) = _build_populated_tree(tree)

    st = mirror_script.mirror_state
    st.visited = {
        'http://www.footbag.org/groups/showfile/208',
        'http://www.footbag.org/groups/showfile/2081',
    }
    st.queue = ['http://www.footbag.org/groups/list/fools',
                'http://www.footbag.org/clubs/']
    st.url_depth = {u: 1 for u in st.queue}
    st.skipped_videos = {
        'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc': {
            'url': 'http://www.footbag.org/ifpa/groups/euros05/program_draft1.doc'},
        'http://www.footbag.org/gallery/clip.mpg': {
            'url': 'http://www.footbag.org/gallery/clip.mpg'},
    }
    st.sitemap = [str(excluded_doc), str(kept_doc)]
    st.content_hashes = {'h1': str(excluded_page), 'h2': str(kept_page)}
    st.save_progress()

    removed = mirror_script.apply_exclusions_sweep()
    assert removed == 4
    assert not excluded_doc.exists()
    assert not converted_img.exists()
    assert not sidecar.exists()
    assert not excluded_page.exists()
    assert not excluded_page.parent.exists()  # emptied directory pruned
    assert kept_page.exists() and kept_doc.exists()

    data = json.loads(Path(mirror_script.PROGRESS_FILE).read_text())
    assert data['visited'] == ['http://www.footbag.org/groups/showfile/2081']
    assert data['queue'] == ['http://www.footbag.org/clubs/']
    assert list(data['skipped_videos']) == ['http://www.footbag.org/gallery/clip.mpg']
    assert data['sitemap'] == [str(kept_doc)]
    assert data['content_hashes'] == {'h2': str(kept_page)}


def test_sweep_is_idempotent(excl, tree):
    _build_populated_tree(tree)
    assert mirror_script.apply_exclusions_sweep() == 4
    assert mirror_script.apply_exclusions_sweep() == 0


def test_sweep_maps_original_media_extension_to_converted_artifacts(excl, tree):
    # The exclusion entry carries the legacy URL's original extension; on disk
    # the crawler stored the converted name plus its sanitization sidecar.
    converted = _touch(tree, 'ifpa/groups/efc/IMG_0919.jpg')
    sidecar = _touch(tree, 'ifpa/groups/efc/IMG_0919.jpg.sanitized', b'')
    assert mirror_script.apply_exclusions_sweep() == 2
    assert not converted.exists() and not sidecar.exists()


def test_sweep_refuses_entries_escaping_the_tree(tree, monkeypatch):
    outside = tree.parent.parent / 'outside.txt'
    outside.write_bytes(b'x')
    monkeypatch.setattr(mirror_script, 'CONTENT_EXCLUSIONS',
                        frozenset({'../../outside.txt'}))
    assert mirror_script.apply_exclusions_sweep() == 0
    assert outside.exists()
