"""Image bytes served under a page-shaped URL, in create_mirror_footbag_org.py.

The legacy server answers a handful of extensionless /media/ URLs with image
bytes labelled text/html. Trusting the header decoded the bytes as text and
destroyed the picture permanently: two gallery images shipped as pages of
replacement characters, wrapped in the charset meta line that then hid them
from the publisher's only detector. The body's own magic bytes outrank the
Content-Type wherever the URL's extension says nothing.

All fixtures are local; no live-site access, no ffmpeg (conversion is stubbed).
Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_media_byte_sniff.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_sniff', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_sniff'] = mirror_script
spec.loader.exec_module(mirror_script)

JPEG_HEAD = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00'
BASE = mirror_script.BASE_URL


@pytest.fixture
def tree(tmp_path, monkeypatch):
    """Isolated mirror tree + fresh crawl state."""
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'mirror_state',
                        mirror_script.MirrorState())
    www = mirror_dir / 'www.footbag.org'
    www.mkdir(parents=True)
    return www


# ----- The sniff itself -----

def test_jpeg_png_and_gif_heads_are_recognized():
    assert mirror_script.sniff_image_ext(JPEG_HEAD) == '.jpg'
    assert mirror_script.sniff_image_ext(b'\x89PNG\r\n\x1a\n' + b'\x00' * 8) == '.png'
    assert mirror_script.sniff_image_ext(b'GIF89a' + b'\x00' * 10) == '.gif'


def test_page_bytes_are_not_an_image():
    assert mirror_script.sniff_image_ext(b'<!DOCTYPE html><html><head>') is None
    assert mirror_script.sniff_image_ext(b'<meta charset="utf-8"/><p>x</p>') is None


def test_the_already_destroyed_shape_is_not_mistaken_for_an_image():
    # Once the charset pass has wrapped a decoded image, the magic bytes are
    # replacement characters and the file is a page, however it started life.
    # The sniff must judge the RESPONSE bytes, before any wrapping; this is
    # why. (The verifier's binary-under-page check catches the wrapped shape.)
    corrupted = b'<meta charset="utf-8"/>\xef\xbf\xbd\xef\xbf\xbd\x00\x10JFIF'
    assert mirror_script.sniff_image_ext(corrupted) is None


# ----- download_and_process_media: the existing-file half -----

def test_an_extensionless_capture_with_image_bytes_joins_the_convert_path(tree, monkeypatch):
    url = BASE + '/media/1196/photo'
    filepath = Path(mirror_script.url_to_filepath(url))
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(JPEG_HEAD + b'\x00' * 64)

    calls = {}

    def fake_convert(path, ext):
        calls['path'], calls['ext'] = path, ext
        converted = str(Path(path).with_suffix('.jpg'))
        Path(converted).write_bytes(b'converted')
        return converted

    monkeypatch.setattr(mirror_script, 'convert_and_cleanup', fake_convert)
    result = mirror_script.download_and_process_media(url, session=None)

    assert calls['ext'] == '.jpg'
    assert result.endswith('index.jpg')


def test_an_extensionless_capture_with_page_bytes_is_left_to_the_page_pipeline(tree, monkeypatch):
    # A real captured page reached through an img src must never be treated as
    # media: the media path would store or convert bytes the page pipeline
    # owns. Nothing may touch the file.
    url = BASE + '/media/1196/lookup'
    filepath = Path(mirror_script.url_to_filepath(url))
    filepath.parent.mkdir(parents=True, exist_ok=True)
    original = b'<meta charset="utf-8"/><p>a real page</p>'
    filepath.write_bytes(original)

    def explode(*args, **kwargs):
        raise AssertionError('conversion must not run on page bytes')

    monkeypatch.setattr(mirror_script, 'convert_and_cleanup', explode)
    result = mirror_script.download_and_process_media(url, session=None)

    assert result is None
    assert filepath.read_bytes() == original


def test_a_real_extension_keeps_its_raw_download_contract(tree, monkeypatch):
    # The sniff is scoped to URLs whose extension says NOTHING. A .pdf on disk
    # is stored raw, exactly as before.
    url = BASE + '/media/500/program.pdf'
    filepath = Path(mirror_script.url_to_filepath(url))
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(b'%PDF-1.4 fixture')

    result = mirror_script.download_and_process_media(url, session=None)
    assert result == str(filepath)


# ----- rewrite_links: the referrer half -----

def test_an_extensionless_img_src_takes_the_media_path(tree, monkeypatch):
    url = BASE + '/media/1196/photo'
    converted = Path(mirror_script.url_to_filepath(url)).with_suffix('.jpg')

    monkeypatch.setattr(mirror_script, 'download_and_process_media',
                        lambda *a, **k: str(converted))
    out = mirror_script.rewrite_links(
        f'<img src="{url}">', BASE + '/gallery/show/10109')

    assert 'index.jpg' in out
    assert 'index.html' not in out


def test_a_page_behind_an_extensionless_img_src_falls_back_to_the_page_rewrite(tree, monkeypatch):
    # The media path returned nothing (the bytes were not a picture), so the
    # reference is rewritten as an ordinary page link and the URL is queued
    # for the page pipeline to capture with all its protections.
    url = BASE + '/media/1196/lookup'
    monkeypatch.setattr(mirror_script, 'download_and_process_media',
                        lambda *a, **k: None)
    out = mirror_script.rewrite_links(
        f'<img src="{url}">', BASE + '/gallery/show/10109')

    assert 'lookup/index.html' in out
    assert mirror_script.normalize_url(url) in mirror_script.mirror_state.queue


# ----- Repair over the tree that already holds the corruption -----
#
# The two production casualties are still on disk as pages of replacement
# characters. A fix that only works on a fresh capture would leave them
# published, so the repair path gets its own coverage: the caller has proved
# the RESPONSE is an image, and that has to outrank the destroyed file.


class _StubResponse:
    def __init__(self, content):
        self.content = content
        self.status_code = 200
        self.headers = {'Content-Type': 'text/html',
                        'Content-Length': str(len(content))}

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=8192):
        yield self.content

    def close(self):
        return None


class _StubSession:
    """Stands in for the authenticated www session; never touches a network."""

    def __init__(self, content):
        self._content = content

    def get(self, url, **kwargs):
        return _StubResponse(self._content)


def _stub_convert(monkeypatch):
    # Simulate ffmpeg: write the .jpg beside the source and drop the source,
    # which is what convert_and_cleanup does on a real run.
    def fake(path, ext):
        out = str(Path(path).with_suffix('.jpg'))
        Path(out).write_bytes(b'reencoded')
        if os.path.exists(path) and path != out:
            os.remove(path)
        return out
    monkeypatch.setattr(mirror_script, 'convert_and_cleanup', fake)


def test_a_corrupted_capture_is_replaced_rather_than_standing_in(tree, monkeypatch):
    url = BASE + '/media/1196/photo'
    corrupted = Path(mirror_script.url_to_filepath(url))
    corrupted.parent.mkdir(parents=True, exist_ok=True)
    corrupted.write_bytes(
        b'<meta charset="utf-8"/>\xef\xbf\xbd\xef\xbf\xbd\x00\x10JFIF')

    monkeypatch.setattr(mirror_script, 'polite_wait', lambda u: None)
    _stub_convert(monkeypatch)
    result = mirror_script.download_and_process_media(
        url, session=_StubSession(JPEG_HEAD + b'\x00' * 64),
        known_image_ext='.jpg')

    assert result.endswith('index.jpg')
    assert Path(result).is_file()
    assert not corrupted.exists()


def test_the_repair_does_not_record_a_permanent_conversion_failure(tree, monkeypatch):
    # Without the stale-file removal the magic-byte check reads the corrupted
    # bytes, fails, and writes the URL into failed_urls, which would make every
    # later attempt skip the picture for good.
    url = BASE + '/media/1196/photo'
    corrupted = Path(mirror_script.url_to_filepath(url))
    corrupted.parent.mkdir(parents=True, exist_ok=True)
    corrupted.write_bytes(b'<meta charset="utf-8"/>\xef\xbf\xbd\xef\xbf\xbd')

    monkeypatch.setattr(mirror_script, 'polite_wait', lambda u: None)
    _stub_convert(monkeypatch)
    mirror_script.download_and_process_media(
        url, session=_StubSession(JPEG_HEAD + b'\x00' * 64),
        known_image_ext='.jpg')

    assert mirror_script.media_fail_key(url) \
        not in mirror_script.mirror_state.failed_urls


def test_a_url_the_media_path_claims_is_left_to_it(tree):
    # A genuine media URL keeps its normal route: that path runs its own
    # magic-byte verification, and sniffing here would divert it.
    assert mirror_script.is_media_file(BASE + '/media/1/photo.jpg')


def test_a_filename_whose_dot_is_not_an_extension_is_not_media(tree):
    # The real shape: "U.S. Open 2006 - ...final" has dots, so the extension
    # check finds nothing it recognizes and the bytes were written raw under a
    # page name. The byte sniff is what has to catch this, not the URL.
    url = BASE + "/media/1458/U.S. Open 2006 - Beca smashes in back final"
    assert not mirror_script.is_media_file(url)
    assert mirror_script.sniff_image_ext(JPEG_HEAD) == '.jpg'


def test_without_the_callers_proof_a_real_page_is_still_left_alone(tree, monkeypatch):
    # No known_image_ext, so the existing-file sniff still governs and a real
    # captured page at that path is untouched.
    url = BASE + '/media/1196/lookup'
    page = Path(mirror_script.url_to_filepath(url))
    page.parent.mkdir(parents=True, exist_ok=True)
    original = b'<meta charset="utf-8"/><p>a real page</p>'
    page.write_bytes(original)

    monkeypatch.setattr(mirror_script, 'polite_wait', lambda u: None)
    assert mirror_script.download_and_process_media(url, session=None) is None
    assert page.read_bytes() == original
