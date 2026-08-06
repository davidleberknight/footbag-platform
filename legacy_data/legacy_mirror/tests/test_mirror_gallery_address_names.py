"""An address typed into a gallery's set-name field never becomes a path.

Members named sets with their own e-mail address, and with their club's web
address, and the site built the URL from whatever they typed. Publishing that
name turns a member's address into a permanent archive path, and a club domain
that has since lapsed can be re-registered by anyone, so a path pointing at it
is a liability rather than a preserved fact. The set keeps its photos under a
stand-in name, and the address is replaced in the stored bytes too, because the
site prints the set name in the page title as well as in the URL.

All pure; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_gallery_address_names.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_addr', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_addr'] = mirror_script
spec.loader.exec_module(mirror_script)


def test_an_email_address_is_recognised_as_a_name_to_replace():
    assert mirror_script._address_shaped('someone@example.com')


def test_a_club_web_address_is_recognised():
    assert mirror_script._address_shaped('www.exampleclub.org')
    assert mirror_script._address_shaped('exampleclub.ru')


def test_an_ordinary_set_name_is_left_alone():
    # The names members actually chose for sets, which must keep working.
    assert not mirror_script._address_shaped('worlds-2009')
    assert not mirror_script._address_shaped('Shred_Session')
    assert not mirror_script._address_shaped('sick3')


def test_the_stand_in_name_carries_nothing_of_the_address():
    stand_in = mirror_script._neutral_set_name('someone@example.com')
    assert 'someone' not in stand_in
    assert 'example' not in stand_in
    assert '@' not in stand_in


def test_the_stand_in_name_is_stable_across_runs():
    # A re-crawl must file the set where the last one did, or every link
    # rewritten in one pass stops resolving in the next.
    first = mirror_script._neutral_set_name('someone@example.com')
    second = mirror_script._neutral_set_name('someone@example.com')
    assert first == second


def test_two_addresses_do_not_collide():
    assert (mirror_script._neutral_set_name('a@example.com')
            != mirror_script._neutral_set_name('b@example.com'))


def test_the_set_name_is_read_back_from_a_gallery_url():
    assert mirror_script._gallery_set_name_from_url(
        'https://www.footbag.org/gallery/showset/someone@example.com'
    ) == 'someone@example.com'


def test_a_real_asset_under_a_gallery_route_is_not_treated_as_a_name():
    # Filing an image as a directory would break every reference to it.
    assert mirror_script._gallery_set_name_from_url(
        'https://www.footbag.org/gallery/show/photo.jpg') is None


def test_a_path_outside_the_gallery_routes_has_no_set_name():
    assert mirror_script._gallery_set_name_from_url(
        'https://www.footbag.org/events/show/12345/') is None
