"""Restoring a nav-menu link the dead-link pass wrongly neutralized, in
create_mirror_footbag_org.py.

A rulebook feature was wrongly judged dead earlier in this codebase's history
(the live check used a URL form the crawler itself never requests), and the
resulting exclusion caused neutralize_dead_internal_links() to turn the
site-wide RULES menu item into plain text on every page carrying it. That
rewrite is destructive: the original <a> element is gone, not merely hidden,
so restoring the excluded page does not by itself restore the links to it.
relink_restored_nav_items() is the targeted repair, scoped tightly enough to
never touch an unrelated dead link elsewhere on the same page.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_nav_relink.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_navrelink', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_navrelink'] = mirror_script
spec.loader.exec_module(mirror_script)

# The exact shape neutralize_dead_internal_links() leaves behind on a page one
# directory level deep, modeled on a real captured page (faq/index.html).
_NEUTRALIZED_MENU = """<html><body>
<div id="MainMenu">
<ul>
<li><a href="../ifpa/index.html" title="Players' Association home page"><nobr>IFPA</nobr></a>
<li><a href="../groups/index.html" title="IFPA member groups"><nobr>GROUPS</nobr></a>
<li><!--Mirror: link to a page not in the archive-->RULES
<li><a href="../links/list/index.html" title="Links to related websites "><nobr>LINKS </nobr></a>
</ul>
</div>
<div id="feedback"><!--Mirror: link to a page not in the archive-->trouble reporting system</div>
</body></html>"""


@pytest.fixture
def www(tmp_path, monkeypatch):
    root = tmp_path / 'www.footbag.org'
    root.mkdir()
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))
    return root


def _page(www, relative, body):
    path = www / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding='utf-8')
    return path


def _rules_index(www):
    target = www / 'rules' / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('<html><body>real rules content</body></html>', encoding='utf-8')
    return target


def test_a_neutralized_item_is_restored_once_its_target_exists(www):
    page = _page(www, 'faq/index.html', _NEUTRALIZED_MENU)
    _rules_index(www)

    relinked = mirror_script.relink_restored_nav_items()

    assert relinked == 1
    out = page.read_text(encoding='utf-8')
    assert '<a href="../rules/index.html" title="Official Rules of Footbag Sports">' in out
    assert '<nobr>RULES</nobr>' in out
    assert 'Mirror: link to a page not in the archive-->RULES' not in out


def test_the_correct_relative_depth_is_computed_per_page(www):
    page = _page(www, 'sub/deeper/still/index.html', _NEUTRALIZED_MENU)
    _rules_index(www)

    mirror_script.relink_restored_nav_items()

    out = page.read_text(encoding='utf-8')
    assert '<a href="../../../rules/index.html"' in out


def test_a_neutralized_item_whose_target_still_does_not_exist_is_left_alone(www):
    page = _page(www, 'faq/index.html', _NEUTRALIZED_MENU)
    # rules/index.html is deliberately not created.

    relinked = mirror_script.relink_restored_nav_items()

    assert relinked == 0
    out = page.read_text(encoding='utf-8')
    assert 'Mirror: link to a page not in the archive-->RULES' in out


def test_an_unrelated_dead_link_outside_the_menu_is_never_touched(www):
    page = _page(www, 'faq/index.html', _NEUTRALIZED_MENU)
    _rules_index(www)

    mirror_script.relink_restored_nav_items()

    out = page.read_text(encoding='utf-8')
    assert 'trouble reporting system' in out
    assert ('<!--Mirror: link to a page not in the archive-->'
           'trouble reporting system') in out


def test_a_working_nav_link_is_never_touched(www):
    page = _page(www, 'faq/index.html', _NEUTRALIZED_MENU)
    _rules_index(www)

    mirror_script.relink_restored_nav_items()

    out = page.read_text(encoding='utf-8')
    assert '<a href="../ifpa/index.html" title="Players\' Association home page">' in out
    assert '<a href="../links/list/index.html" title="Links to related websites ">' in out


def test_a_page_with_nothing_to_restore_is_left_untouched(www):
    page = _page(www, 'clubs/index.html',
                '<html><body><div id="MainMenu"><ul>'
                '<li><a href="../ifpa/index.html" title="x"><nobr>IFPA</nobr></a>'
                '</ul></div></body></html>')
    before = page.stat().st_mtime_ns
    relinked = mirror_script.relink_restored_nav_items()
    assert relinked == 0
    assert page.stat().st_mtime_ns == before


def test_running_the_pass_twice_is_a_true_no_op_the_second_time(www):
    page = _page(www, 'faq/index.html', _NEUTRALIZED_MENU)
    _rules_index(www)

    first = mirror_script.relink_restored_nav_items()
    after_first = page.read_text(encoding='utf-8')
    second = mirror_script.relink_restored_nav_items()
    after_second = page.read_text(encoding='utf-8')

    assert first == 1
    assert second == 0
    assert after_first == after_second


def test_a_page_with_no_main_menu_at_all_is_skipped_without_error(www):
    _page(www, 'sites/reference/index.html', '<html><body>no menu here</body></html>')
    _rules_index(www)
    assert mirror_script.relink_restored_nav_items() == 0
