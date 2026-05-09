"""
test_av_pipeline.py: integration tests for the malware-stripping AV pipeline
in create_mirror_footbag_org.py.

Tests are skipped if ffmpeg/ffprobe are not on PATH. Fixtures are synthesized
at runtime so no binary blobs live in the repo.

Run from repo root:
    python -m pytest legacy_data/tests/test_av_pipeline.py -v
"""
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

FFMPEG = shutil.which('ffmpeg')
FFPROBE = shutil.which('ffprobe')

pytestmark = pytest.mark.skipif(
    not (FFMPEG and FFPROBE),
    reason="ffmpeg and ffprobe must be on PATH for AV pipeline tests"
)

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script'] = mirror_script
spec.loader.exec_module(mirror_script)


# ----- Fixture builders -----

def _make_jpg(path: Path, width=64, height=64):
    subprocess.run([
        FFMPEG, '-y',
        '-f', 'lavfi', '-i', f'color=c=red:s={width}x{height}:d=0.04',
        '-frames:v', '1', str(path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _make_png(path: Path, width=64, height=64):
    subprocess.run([
        FFMPEG, '-y',
        '-f', 'lavfi', '-i', f'color=c=blue:s={width}x{height}:d=0.04',
        '-frames:v', '1', str(path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _make_gif(path: Path, frames=3):
    subprocess.run([
        FFMPEG, '-y',
        '-f', 'lavfi',
        '-i', f'testsrc=duration={frames * 0.04}:size=64x64:rate=25',
        '-frames:v', str(frames), str(path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _make_mp4(path: Path, duration=0.5):
    subprocess.run([
        FFMPEG, '-y',
        '-f', 'lavfi', '-i', f'testsrc=duration={duration}:size=64x64:rate=25',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-metadata', 'title=should-be-stripped',
        str(path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _make_mp4_with_subtitle(path: Path, duration=0.5):
    video = path.with_suffix('.video.mp4')
    sub = path.with_suffix('.srt')
    sub.write_text("1\n00:00:00,000 --> 00:00:00,400\nhello\n")
    _make_mp4(video, duration)
    subprocess.run([
        FFMPEG, '-y',
        '-i', str(video), '-i', str(sub),
        '-c:v', 'copy', '-c:s', 'mov_text',
        '-map', '0:v', '-map', '1:s',
        str(path)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    video.unlink()
    sub.unlink()


def _ffprobe_stream_types(path: Path):
    out = subprocess.check_output([
        FFPROBE, '-loglevel', 'error',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0', str(path)
    ])
    return [x.strip() for x in out.decode().splitlines() if x.strip()]


def _ffprobe_format_tags(path: Path):
    out = subprocess.check_output([
        FFPROBE, '-loglevel', 'error',
        '-show_entries', 'format_tags',
        '-of', 'default', str(path)
    ])
    return out.decode()


# ----- Tests -----

def test_magic_byte_mismatch_rejects(tmp_path):
    fake_jpg = tmp_path / 'fake.jpg'
    real_png = tmp_path / 'real.png'
    _make_png(real_png)
    fake_jpg.write_bytes(real_png.read_bytes())

    before = mirror_script.mirror_state.stats.get('magic_byte_failures', 0)
    result = mirror_script.verify_magic_bytes(str(fake_jpg), '.jpg')
    after = mirror_script.mirror_state.stats.get('magic_byte_failures', 0)

    assert result is False
    assert after == before + 1


def test_jpeg_reencode_is_forced(tmp_path):
    src = tmp_path / 'photo.jpg'
    _make_jpg(src)
    src_bytes = src.read_bytes()

    out = mirror_script.convert_image_to_jpg(str(src))

    assert out is not None
    assert Path(out).exists()
    assert Path(out + '.sanitized').exists()
    assert Path(out).read_bytes() != src_bytes


def test_mp4_reencode_strips_metadata(tmp_path):
    src = tmp_path / 'clip.mp4'
    _make_mp4(src)

    src_tags = _ffprobe_format_tags(src)
    assert 'should-be-stripped' in src_tags, "fixture failed to include metadata"

    out = mirror_script.convert_to_mp4(str(src))

    assert out is not None
    assert Path(out).exists()
    assert Path(out + '.sanitized').exists()
    out_tags = _ffprobe_format_tags(Path(out))
    assert 'should-be-stripped' not in out_tags


def test_stream_stripping_drops_subtitles(tmp_path):
    src = tmp_path / 'with_sub.mp4'
    _make_mp4_with_subtitle(src)

    src_streams = _ffprobe_stream_types(src)
    assert 'subtitle' in src_streams, "fixture failed to include subtitle stream"

    out = mirror_script.convert_to_mp4(str(src))

    assert out is not None
    out_streams = _ffprobe_stream_types(Path(out))
    assert 'subtitle' not in out_streams
    assert 'video' in out_streams


def test_gif_reencode_preserves_animation_as_gif(tmp_path):
    src = tmp_path / 'animated.gif'
    _make_gif(src, frames=3)

    out = mirror_script.convert_gif_to_gif(str(src))

    assert out is not None
    assert out.endswith('.gif'), f"GIF re-encode must produce .gif, got {out}"
    # Sidecar presence proves the re-encode pipeline ran. (Bytes-differ would
    # be wrong here: GIF is a lossless palette-indexed codec, so the same
    # input commonly produces byte-identical output even after a real ffmpeg
    # roundtrip. The sidecar is the trustworthy "ran" signal.)
    assert Path(out + '.sanitized').exists()
    # Animation preserved → multiple frames present.
    packets = subprocess.check_output([
        FFPROBE, '-loglevel', 'error',
        '-count_packets',
        '-show_entries', 'stream=nb_read_packets',
        '-of', 'csv=p=0', out
    ]).decode().strip()
    assert int(packets) >= 2, f"expected multi-frame GIF, got {packets!r} packets"


def test_audio_url_is_not_in_scope():
    assert not mirror_script.is_in_scope('http://www.footbag.org/some/podcast.mp3')
    assert not mirror_script.is_in_scope('http://www.footbag.org/some/clip.ogg')


def test_svg_url_is_not_in_scope():
    assert not mirror_script.is_in_scope('http://www.footbag.org/icons/logo.svg')


def test_sanitized_sidecar_blocks_reencode(tmp_path):
    src = tmp_path / 'photo.jpg'
    _make_jpg(src)

    first_out = mirror_script.convert_image_to_jpg(str(src))
    assert first_out is not None
    assert Path(first_out + '.sanitized').exists()
    first_bytes = Path(first_out).read_bytes()

    second_out = mirror_script.convert_image_to_jpg(str(src))
    assert second_out == first_out
    assert Path(second_out).read_bytes() == first_bytes


def test_pre_existing_output_without_sidecar_is_re_encoded(tmp_path):
    # Simulate a pre-fix mirror dir: a real .jpg on disk, no `.sanitized`
    # sidecar. The conversion function must re-encode (replace bytes) rather
    # than treat the existing file as already sanitized.
    src = tmp_path / 'photo.jpg'
    _make_jpg(src)
    src_bytes = src.read_bytes()
    sidecar = Path(str(src) + '.sanitized')
    assert not sidecar.exists()

    out = mirror_script.convert_image_to_jpg(str(src))

    assert out is not None
    assert sidecar.exists()
    assert Path(out).read_bytes() != src_bytes


def test_skipped_media_label_helper():
    assert mirror_script._skipped_media_label('.mp3') == 'Audio'
    assert mirror_script._skipped_media_label('.OGG') == 'Audio'
    assert mirror_script._skipped_media_label('.svg') == 'SVG image'
    assert mirror_script._skipped_media_label('.mp4') is None
    assert mirror_script._skipped_media_label('') is None
    assert mirror_script._skipped_media_label(None) is None
