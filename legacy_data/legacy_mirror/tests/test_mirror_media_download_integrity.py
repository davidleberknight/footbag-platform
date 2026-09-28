"""What a media download leaves on disk, in create_mirror_footbag_org.py.

Three promises the publish step relies on. A stream cut off mid-body leaves no
partial file behind, since nothing later owns the name and the publish refuses
the type. Bytes that just arrived are never vouched for by a sanitization
sidecar some earlier file left at the same path, because that sidecar is what
lets the re-encode be skipped as already done. And a video whose re-encode
takes the source's own path (an .mp4 re-encoded to .mp4, which is the malware
strip, not a no-op) is kept when its sidecar proves the re-encode happened, and
treated as failed when it does not.

All fixtures are local; no live-site access, no ffmpeg (conversion is stubbed).
Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_media_download_integrity.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest
import requests

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_download', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_download'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
VIDEO_URL = BASE + '/media/431/My Great Movie.mp4'
MP4_HEAD = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 64


@pytest.fixture
def tree(tmp_path, monkeypatch):
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'mirror_state', mirror_script.MirrorState())
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', False)
    monkeypatch.setattr(mirror_script, 'polite_wait', lambda url: None)
    (mirror_dir / 'www.footbag.org').mkdir(parents=True)
    return Path(mirror_script.url_to_filepath(VIDEO_URL))


class _Response:
    status_code = 200
    headers = {'Content-Type': 'video/mp4'}

    def __init__(self, chunks):
        self._chunks = chunks

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=8192):
        for chunk in self._chunks:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk

    def close(self):
        return None


def _serve(monkeypatch, chunks=None, refuse=None):
    class _Session:
        def get(self, url, **kwargs):
            if refuse:
                raise refuse
            return _Response(chunks if chunks is not None else [MP4_HEAD])
    monkeypatch.setattr(mirror_script, 'session_for',
                        lambda url, www_session=None: _Session())


# ----- Partial downloads -----

def test_a_stream_cut_off_mid_body_leaves_no_partial_file(tree, monkeypatch):
    _serve(monkeypatch, chunks=[
        MP4_HEAD, requests.exceptions.ConnectionError('Read timed out.')])
    assert mirror_script.download_and_process_media(VIDEO_URL, session=None) is None
    assert not Path(str(tree) + '.tmp').exists()
    assert not tree.exists()


def test_a_partial_file_an_earlier_run_left_is_cleared_even_if_this_fetch_fails(
        tree, monkeypatch):
    tree.parent.mkdir(parents=True, exist_ok=True)
    leftover = Path(str(tree) + '.tmp')
    leftover.write_bytes(b'half a video')
    _serve(monkeypatch, refuse=requests.exceptions.ConnectTimeout('timed out'))
    assert mirror_script.download_and_process_media(VIDEO_URL, session=None) is None
    assert not leftover.exists()


# ----- A sidecar never vouches for bytes that just arrived -----

def test_a_stale_sidecar_is_gone_before_the_new_bytes_are_converted(tree, monkeypatch):
    # The shape a deleted re-encode leaves: its sidecar, with no file beside it.
    tree.parent.mkdir(parents=True, exist_ok=True)
    marker = Path(mirror_script._sanitized_marker_path(str(tree)))
    marker.touch()
    seen = {}

    def fake_convert(path, ext):
        seen['marker_at_conversion'] = marker.exists()
        seen['bytes'] = Path(path).read_bytes()
        marker.touch()
        return path

    monkeypatch.setattr(mirror_script, 'convert_and_cleanup', fake_convert)
    _serve(monkeypatch)
    result = mirror_script.download_and_process_media(VIDEO_URL, session=None)
    assert result == str(tree)
    assert seen == {'marker_at_conversion': False, 'bytes': MP4_HEAD}


# ----- A video on disk outranks a remembered failure -----

def _remember_failure(url):
    mirror_script.mirror_state.failed_conversion_videos.add(
        mirror_script.media_fail_key(url))


def test_a_remembered_failure_does_not_answer_for_a_held_video(tree, monkeypatch):
    # A refresh crawl in the default skip mode: the video is on disk,
    # re-encoded, so the page must be able to link it rather than be told the
    # video failed and replace its player with "not available".
    tree.parent.mkdir(parents=True, exist_ok=True)
    tree.write_bytes(b're-encoded')
    Path(mirror_script._sanitized_marker_path(str(tree))).touch()
    _remember_failure(VIDEO_URL)
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', True)
    result = mirror_script.download_and_process_media(VIDEO_URL, session=None)
    assert result == mirror_script.SKIPPED_VIDEO


def test_a_remembered_failure_still_stands_when_nothing_is_held(tree, monkeypatch):
    _remember_failure(VIDEO_URL)
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', True)
    assert mirror_script.download_and_process_media(VIDEO_URL, session=None) is None


def test_an_unsanitized_file_does_not_count_as_held(tree, monkeypatch):
    tree.parent.mkdir(parents=True, exist_ok=True)
    tree.write_bytes(MP4_HEAD)
    _remember_failure(VIDEO_URL)
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', True)
    assert mirror_script.download_and_process_media(VIDEO_URL, session=None) is None


# ----- A same-path re-encode is judged by its sidecar -----

def _stub_same_path_encode(monkeypatch, writes_marker):
    def fake_convert_to_mp4(path):
        Path(path).write_bytes(b're-encoded')
        if writes_marker:
            Path(mirror_script._sanitized_marker_path(path)).touch()
        return path
    monkeypatch.setattr(mirror_script, 'convert_to_mp4', fake_convert_to_mp4)


def test_a_lower_case_mp4_that_re_encoded_keeps_its_only_copy(tree, monkeypatch):
    tree.parent.mkdir(parents=True, exist_ok=True)
    tree.write_bytes(MP4_HEAD)
    _stub_same_path_encode(monkeypatch, writes_marker=True)
    assert mirror_script.convert_and_cleanup(str(tree), '.mp4') == str(tree)
    assert tree.read_bytes() == b're-encoded'


def test_a_same_path_result_without_its_sidecar_is_not_a_success(tree, monkeypatch):
    # Nothing proves the bytes at the path are the re-encode rather than the
    # download, so they must not be kept as if they were.
    tree.parent.mkdir(parents=True, exist_ok=True)
    tree.write_bytes(MP4_HEAD)
    _stub_same_path_encode(monkeypatch, writes_marker=False)
    assert mirror_script.convert_and_cleanup(str(tree), '.mp4') is None
    assert not tree.exists()


def test_an_upper_case_mp4_still_converts_to_its_lower_case_name(tree, monkeypatch):
    source = tree.with_name('My Great Movie.MP4')
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(MP4_HEAD)

    def fake_convert_to_mp4(path):
        out = Path(path).with_suffix('.mp4')
        out.write_bytes(b're-encoded')
        Path(mirror_script._sanitized_marker_path(str(out))).touch()
        return str(out)

    monkeypatch.setattr(mirror_script, 'convert_to_mp4', fake_convert_to_mp4)
    final = mirror_script.convert_and_cleanup(str(source), '.MP4')
    assert final == str(source.with_suffix('.mp4'))
    assert Path(final).read_bytes() == b're-encoded'
    assert not source.exists()
