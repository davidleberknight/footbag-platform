"""The publish-gate verifier's own logic, in scripts/verify_archive_tree.py.

An unconverted media file is normally a defect the gate must catch, but one
file (media/789/Atlv33.rmvb) has no working converter in the crawl toolchain
and was kept unconverted by explicit human decision, not left behind by
omission. Without a way to mark that settled, the gate would report it as an
outstanding failure forever, blocking every future publish for a reason
nobody can act on.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_verify_archive_tree.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = (Path(__file__).resolve().parent.parent
              / 'scripts' / 'verify_archive_tree.py')
spec = importlib.util.spec_from_file_location('verify_tree', str(SCRIPT_PATH))
verify_tree = importlib.util.module_from_spec(spec)
sys.modules['verify_tree'] = verify_tree
spec.loader.exec_module(verify_tree)


def _touch(root: Path, rel: str) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b'x')
    return p


def test_an_unaccepted_unconverted_file_still_fails(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _touch(www, 'gallery/clip.mov')
    report = verify_tree.Report(examples=5)
    verify_tree.check_media(report, www)
    names = {name for name, failures, *_ in report.rows if failures}
    assert 'no unconverted media left behind' in names


def test_the_named_accepted_exception_does_not_fail(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _touch(www, 'media/789/Atlv33.rmvb')
    report = verify_tree.Report(examples=5)
    verify_tree.check_media(report, www)
    row = next(r for r in report.rows if r[0] == 'no unconverted media left behind')
    _name, failures, detail, skipped = row
    assert failures == []
    assert not skipped
    assert '1 accepted exception' in detail


def test_the_exception_does_not_cover_a_second_rmvb_file(tmp_path):
    # The exception is a named path, not a blanket pass for the extension: a
    # second .rmvb the crawl produces some other day is a real gap again.
    www = tmp_path / 'www.footbag.org'
    _touch(www, 'media/999/Other.rmvb')
    report = verify_tree.Report(examples=5)
    verify_tree.check_media(report, www)
    row = next(r for r in report.rows if r[0] == 'no unconverted media left behind')
    _name, failures, _detail, _skipped = row
    assert failures == ['media/999/Other.rmvb']


def test_an_accepted_exception_beside_a_real_failure_still_fails_on_the_real_one(
        tmp_path):
    www = tmp_path / 'www.footbag.org'
    _touch(www, 'media/789/Atlv33.rmvb')
    _touch(www, 'gallery/clip.mov')
    report = verify_tree.Report(examples=5)
    verify_tree.check_media(report, www)
    row = next(r for r in report.rows if r[0] == 'no unconverted media left behind')
    _name, failures, detail, _skipped = row
    assert failures == ['gallery/clip.mov']
    assert '1 accepted exception' in detail


def _page(root, rel_path, body):
    p = root / rel_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(body if isinstance(body, bytes) else body.encode('utf-8'))
    return p


def _row(report, name):
    return next(r for r in report.rows if r[0] == name)


# ---- charset ----

def test_a_page_without_a_charset_fails_the_gate(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'worlds96/index.html', '<html><body>1996</body></html>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_charset_declared(report, verify_tree.pages(www), www)
    assert _row(report, 'every page declares a character set')[1] == \
        ['worlds96/index.html']


def test_a_css_font_property_does_not_count_as_a_declaration(tmp_path):
    # The spreadsheet exports carry 'mso-font-charset' in a CSS block. A bare
    # substring test accepts it while the page declares no encoding at all.
    www = tmp_path / 'www.footbag.org'
    _page(www, 'worlds2002/resultsNet.html',
          '<body><style>@font-face{mso-font-charset:0;}</style>'
          '<table><tr><td>results</td></tr></table></body>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_charset_declared(report, verify_tree.pages(www), www)
    assert _row(report, 'every page declares a character set')[1] == \
        ['worlds2002/resultsNet.html']


def test_a_declaration_beyond_the_window_does_not_count(tmp_path):
    # An encoding the browser reaches only thousands of bytes in is not one it
    # sniffs, so the gate must not accept it.
    www = tmp_path / 'www.footbag.org'
    _page(www, 'late/index.html',
          '<body>' + ('padding ' * 400) + '<meta charset="utf-8"/></body>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_charset_declared(report, verify_tree.pages(www), www)
    assert _row(report, 'every page declares a character set')[1] == \
        ['late/index.html']


def test_a_page_with_a_charset_passes_and_xml_is_left_alone(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'a/index.html', '<meta charset="utf-8"/><p>real</p>')
    _page(www, 'feed/index.html', '<?xml version="1.0"?><rss/>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_charset_declared(report, verify_tree.pages(www), www)
    assert _row(report, 'every page declares a character set')[1] == []


# ---- binary bytes under a page name ----

def test_the_destroyed_image_shape_is_caught(tmp_path):
    # The exact production shape: the charset meta line the wrap pass added,
    # then the decoded remains of a JPEG - replacement characters where the
    # magic bytes were, the ASCII JFIF marker surviving.
    www = tmp_path / 'www.footbag.org'
    _page(www, 'media/1196/pic/index.html',
          b'<meta charset="utf-8"/>\xef\xbf\xbd\xef\xbf\xbd\x00\x10JFIF\x00')
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_binary_under_page_name(
        report, verify_tree.pages(www), www)
    assert _row(report, 'no binary bytes under a page name')[1] == \
        ['media/1196/pic/index.html']


def test_a_raw_image_stored_under_a_page_name_is_caught(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'media/1458/pic/index.html',
          b'\xff\xd8\xff\xe0\x00\x10JFIF\x00' + b'\x00' * 32)
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_binary_under_page_name(
        report, verify_tree.pages(www), www)
    assert _row(report, 'no binary bytes under a page name')[1] == \
        ['media/1458/pic/index.html']


def test_an_ordinary_page_carries_no_binary_bytes(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'rules/index.html',
          '<meta charset="utf-8"/><p>Official Rules of Footbag Sports</p>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_binary_under_page_name(
        report, verify_tree.pages(www), www)
    assert _row(report, 'no binary bytes under a page name')[1] == []


# ---- references still addressing the live hosts ----

def test_a_live_host_reference_with_a_path_fails(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'worlds2011/index.html',
          '<meta charset="utf-8"/><a href='
          '"http://sites.footbag.org/worlds2011/category/uncategorized/">'
          'Uncategorized</a>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_live_host_references(
        report, verify_tree.pages(www), www, tmp_path)
    failures = _row(report, 'no reference still addresses the live hosts')[1]
    assert failures and 'sites.footbag.org' in failures[0]


def test_the_banners_root_link_is_the_one_deliberate_exception(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'index.html',
          '<meta charset="utf-8"/><a href="https://www.footbag.org/">'
          'the live site</a>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_live_host_references(
        report, verify_tree.pages(www), www, tmp_path)
    assert _row(report, 'no reference still addresses the live hosts')[1] == []


def test_a_video_awaiting_the_backfill_is_exempt(tmp_path):
    # Its original address is the only handle the backfill's referrer repair
    # has; the crawler's retired-host pass exempts it for the same reason.
    www = tmp_path / 'www.footbag.org'
    url = 'http://www.footbag.org/media/gone.mov'
    _page(www, 'gallery/show/644/index.html',
          f'<meta charset="utf-8"/><a href="{url}">watch</a>')
    manifest = tmp_path / verify_tree.crawler.SKIPPED_VIDEO_MANIFEST
    norm = verify_tree.crawler.normalize_url(url)
    manifest.write_text(
        '[{"url": "%s", "normalized_url": "%s", "disposition": "skipped_video"}]'
        % (url, norm), encoding='utf-8')
    old_dir = verify_tree.crawler.MIRROR_DIR
    verify_tree.crawler.MIRROR_DIR = str(tmp_path)
    try:
        report = verify_tree.Report(examples=5)
        verify_tree.check_no_live_host_references(
            report, verify_tree.pages(www), www, tmp_path)
    finally:
        verify_tree.crawler.MIRROR_DIR = old_dir
    assert _row(report, 'no reference still addresses the live hosts')[1] == []


# ---- empty husks ----

def test_a_charset_only_husk_fails(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'links/recommend2/index.html', '<meta charset="utf-8"/>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_empty_pages(report, verify_tree.pages(www), www)
    assert _row(report, 'no page is an empty husk')[1] == \
        ['links/recommend2/index.html']


def test_an_image_only_page_and_a_redirect_stub_are_not_husks(tmp_path):
    www = tmp_path / 'www.footbag.org'
    _page(www, 'gallery/set/index.html',
          '<meta charset="utf-8"/><img src="a.jpg">')
    _page(www, 'stub/index.html',
          '<meta charset="utf-8"/><meta http-equiv="refresh" '
          'content="0; url=../a/"><a href="../a/">Redirecting</a>')
    report = verify_tree.Report(examples=5)
    verify_tree.check_no_empty_pages(report, verify_tree.pages(www), www)
    assert _row(report, 'no page is an empty husk')[1] == []
