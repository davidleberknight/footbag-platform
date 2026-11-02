"""
The curator seeder strips a video exactly as the image worker strips an upload.

The seeder encodes curated video on the operator's machine and the deploy ships
the result as served media, so an argument set of its own would let seeded and
uploaded video differ in what is stripped and how they are bounded. The seeder
therefore runs the application's transcode. This pins that: ffmpeg is a
stand-in on the front of PATH recording what it was asked to run, and the
expected arguments come from the application's own builder.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_fh_curator_transcode.py -v
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import seed_fh_curator  # noqa: E402

TSX = REPO_ROOT / "node_modules" / ".bin" / "tsx"

pytestmark = pytest.mark.skipif(
    not TSX.exists(), reason="node_modules is not installed; npm ci provides tsx"
)

# The leading bytes of the curated clips: a QuickTime file of the kind written
# before the ftyp atom existed, an atom size and then the movie header atom.
MOV_HEADER = bytes([0, 0, 0x04, 0xD9]) + b"moovlmvhd" + bytes(16)


def application_args(input_path: Path, output_path: Path) -> list[str]:
    code = (
        "import { buildFfmpegArgs } from './src/lib/videoProcessing';"
        f"process.stdout.write(JSON.stringify(buildFfmpegArgs({json.dumps(str(input_path))},"
        f" {json.dumps(str(output_path))})));"
    )
    out = subprocess.run(
        [str(TSX), "-e", code], cwd=REPO_ROOT, capture_output=True, text=True,
        check=True, timeout=120,
    )
    return json.loads(out.stdout)


@pytest.fixture
def stub_ffmpeg(tmp_path, monkeypatch):
    log = tmp_path / "ffmpeg.args"
    stub = tmp_path / "bin" / "ffmpeg"
    stub.parent.mkdir()
    stub.write_text(
        "#!/usr/bin/env bash\n"
        f"printf '%s\\n' \"$@\" > {json.dumps(str(log))}\n"
        "exit \"${STUB_EXIT:-0}\"\n"
    )
    stub.chmod(0o755)
    monkeypatch.setenv("PATH", f"{stub.parent}:{os.environ['PATH']}")
    monkeypatch.delenv("FFMPEG_TIMEOUT_SECONDS", raising=False)
    return log


def test_seeder_runs_the_application_transcode_arguments(tmp_path, stub_ffmpeg):
    source = tmp_path / "clip.mov"
    source.write_bytes(MOV_HEADER)
    target = tmp_path / "out-video.mp4"

    seed_fh_curator.transcode_video(source, target)

    recorded = stub_ffmpeg.read_text().rstrip("\n").split("\n")
    assert recorded == application_args(source, target)


def test_seeder_fails_the_item_when_the_encoder_fails(tmp_path, stub_ffmpeg, monkeypatch):
    source = tmp_path / "clip.mov"
    source.write_bytes(MOV_HEADER)
    monkeypatch.setenv("STUB_EXIT", "1")

    with pytest.raises(RuntimeError, match="video transcode failed"):
        seed_fh_curator.transcode_video(source, tmp_path / "out-video.mp4")
    assert stub_ffmpeg.exists()
