"""
test_av_pipeline.py: integration tests for the malware-stripping AV pipeline
in create_mirror_footbag_org.py.

Tests are skipped if ffmpeg/ffprobe are not on PATH. Fixtures are synthesized
at runtime so no binary blobs live in the repo.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_av_pipeline.py -v
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


def test_media_conversion_gives_up_rather_than_hanging(tmp_path, monkeypatch):
    # A malformed legacy image can put ffmpeg into a loop that burns a core and
    # writes nothing. Unbounded, that stalls a multi-day crawl forever on a
    # single file. Every conversion is time-bounded and a timeout is handled the
    # same as any other conversion failure: temp output cleaned up, no exception
    # escapes, the crawl moves on.
    src = tmp_path / 'stuck.gif'
    _make_gif(src, frames=2)
    temp_output = tmp_path / 'stuck.reenc.gif'
    temp_output.write_bytes(b'partial')

    calls = {}

    def _hang(cmd, **kwargs):
        calls['timeout'] = kwargs.get('timeout')
        raise subprocess.TimeoutExpired(cmd, kwargs.get('timeout'))

    monkeypatch.setattr(mirror_script.subprocess, 'run', _hang)

    assert mirror_script.convert_gif_to_gif(str(src)) is None
    assert calls['timeout'] is not None, "conversion must pass a timeout to ffmpeg"
    assert not temp_output.exists(), "partial output must not survive a timeout"


def test_every_media_conversion_passes_a_timeout(tmp_path, monkeypatch):
    # The bound applies to stills and to video alike; an unbounded call anywhere
    # reintroduces the stall.
    seen = []

    def _record(cmd, **kwargs):
        seen.append(kwargs.get('timeout'))
        raise subprocess.TimeoutExpired(cmd, kwargs.get('timeout'))

    gif = tmp_path / 'a.gif'
    _make_gif(gif, frames=1)

    jpg = tmp_path / 'a.jpg'
    subprocess.run([FFMPEG, '-loglevel', 'error', '-f', 'lavfi', '-i',
                    'color=c=red:s=16x16:d=1', '-frames:v', '1', '-y', str(jpg)],
                   check=True)

    # Patched only after the fixtures exist: the module under test and this test
    # share the one stdlib subprocess module, so patching earlier would intercept
    # the fixture builders too.
    monkeypatch.setattr(mirror_script.subprocess, 'run', _record)
    mirror_script.convert_gif_to_gif(str(gif))
    mirror_script.convert_image_to_jpg(str(jpg))

    assert len(seen) >= 2, f"expected both conversions to be attempted, got {seen}"
    assert all(t is not None and t > 0 for t in seen), f"unbounded call: {seen}"


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


# A GIF whose URL carried an upper-case extension re-encodes to a lower-case
# name, so the sanitized copy and the untouched original become two different
# files on disk. The original must not survive: nothing links to it, but the
# publish step uploads the whole tree, which would put unsanitized bytes on the
# archive host reachable by anyone who guesses the address. The GIF branch was
# the only conversion branch that never deleted its input, which is why twelve
# such originals accumulated.

def test_upper_case_gif_leaves_no_unsanitized_original(tmp_path, monkeypatch):
    source = tmp_path / 'BANNER.GIF'
    source.write_bytes(b'GIF89a-original-bytes')
    converted = tmp_path / 'BANNER.gif'

    def fake_convert(path):
        converted.write_bytes(b'GIF89a-reencoded')
        return str(converted)

    monkeypatch.setattr(mirror_script, 'convert_gif_to_gif', fake_convert)
    monkeypatch.setattr(mirror_script, 'mirror_state', mirror_script.MirrorState())
    final = mirror_script.convert_and_cleanup(str(source), '.GIF')

    assert final == str(converted)
    assert converted.exists()
    assert not source.exists()


def test_lower_case_gif_keeps_its_only_copy(tmp_path, monkeypatch):
    source = tmp_path / 'banner.gif'
    source.write_bytes(b'GIF89a-original-bytes')

    def fake_convert(path):
        Path(path).write_bytes(b'GIF89a-reencoded')
        return path

    monkeypatch.setattr(mirror_script, 'convert_gif_to_gif', fake_convert)
    monkeypatch.setattr(mirror_script, 'mirror_state', mirror_script.MirrorState())
    final = mirror_script.convert_and_cleanup(str(source), '.gif')

    assert final == str(source)
    assert source.exists()
