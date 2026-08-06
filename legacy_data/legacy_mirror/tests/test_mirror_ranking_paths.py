"""Ranking report file paths in create_mirror_footbag_org.py.

Every published IFPA ranking report is a different set of results behind one
path, told apart only by its query. url_to_filepath maps query-bearing routes to
distinct directories precisely so a page is not stored on top of its sibling;
without a mapping for this route all fourteen reports resolve to one file and
thirteen are overwritten in turn, leaving the archive holding whichever was
fetched last while an index still offers fourteen links to it.

All pure; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_ranking_paths.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_ranking', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_ranking'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


def _rel(url):
    p = mirror_script.url_to_filepath(url)
    marker = 'www.footbag.org/'
    return p.split(marker, 1)[1] if marker in p else p


def test_each_ranking_set_gets_its_own_file():
    assert _rel(BASE + '/ranking/showranks?set=1&method=1') == \
        'ranking/showranks/set_1_method_1/index.html'
    assert _rel(BASE + '/ranking/showranks?set=14&method=1') == \
        'ranking/showranks/set_14_method_1/index.html'


def test_no_two_published_reports_share_a_path():
    seeds = [f'{BASE}/ranking/showranks?set={n}&method=1' for n in range(1, 15)]
    assert len({_rel(u) for u in seeds}) == len(seeds)


def test_a_second_method_cannot_collide_with_its_twin():
    assert _rel(BASE + '/ranking/showranks?set=3&method=1') != \
        _rel(BASE + '/ranking/showranks?set=3&method=2')


def test_the_bare_route_keeps_its_own_index():
    assert _rel(BASE + '/ranking/showranks') == 'ranking/showranks/index.html'


def test_a_gallery_slug_that_reads_as_a_filename_still_gets_a_page_directory():
    # A set name ending in something that reads as an extension would otherwise
    # be stored as a flat file: the page survives but is served as an unknown
    # type, and the publish step refuses it. This name is a member's own choice
    # and not an address, so it is kept as it stands.
    assert _rel(BASE + '/gallery/showset/todex.04') == \
        'gallery/showset/todex.04/index.html'


def test_a_set_named_after_an_address_is_filed_under_a_stand_in():
    # Members used their own e-mail address and their club's web address as set
    # names. Keeping either as the path publishes a member's address, or a club
    # domain that may since have lapsed into someone else's hands. The set keeps
    # its page; only the name it never really had is replaced. The addresses
    # here are invented; the real ones belong to members and stay out of a
    # committed file.
    email_path = _rel(BASE + '/gallery/showset/someone@example.com')
    assert email_path.startswith('gallery/showset/set-')
    assert email_path.endswith('/index.html')
    assert 'someone' not in email_path and 'example' not in email_path

    web_path = _rel(BASE + '/gallery/show/www.example.sk')
    assert web_path.startswith('gallery/show/set-')
    assert 'example' not in web_path


def test_an_ordinary_gallery_slug_is_unaffected():
    assert _rel(BASE + '/gallery/showset/117') == 'gallery/showset/117/index.html'


def test_a_real_asset_deeper_in_the_gallery_tree_keeps_its_filename():
    assert _rel(BASE + '/gallery/showset/117/thumb.jpg').endswith('thumb.jpg')


def test_an_image_directly_under_a_gallery_route_keeps_its_filename():
    # The rule above turns a gallery route's last segment into a directory, and
    # a segment naming a real file must not be caught by it: filing an image as
    # a directory breaks every reference pointing at it.
    assert _rel(BASE + '/gallery/photo/poster.jpg').endswith('poster.jpg')
    assert not _rel(BASE + '/gallery/photo/poster.jpg').endswith('index.html')
    assert _rel(BASE + '/gallery/video/clip.mp4').endswith('clip.mp4')


def test_a_hostile_set_value_cannot_escape_the_tree():
    # Traversal is defeated by the value becoming one directory NAME, so dots
    # may survive inside it; what must not survive is a '..' path SEGMENT.
    path = mirror_script.url_to_filepath(
        BASE + '/ranking/showranks?set=../../etc&method=1')
    assert '..' not in Path(path).parts
    assert 'ranking/showranks/' in path
    assert path.startswith(str(Path(mirror_script.MIRROR_DIR).resolve()))
