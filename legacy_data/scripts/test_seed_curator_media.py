#!/usr/bin/env python3
"""Integration test for seed_curator_media.py.

Asserts that the curator media seed produces the expected media_items,
media_tags, and on-disk artifacts against a fresh schema, with the system
member account (Footbag Hacky) seeded as the uploader.

Idempotency check: runs the seed twice and asserts the row count stays
constant and the bytes match.

Run directly: `python3 legacy_data/scripts/test_seed_curator_media.py`.
"""

import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
SEED_MEMBERS = REPO_ROOT / "legacy_data" / "scripts" / "seed_members.py"
SEED_CURATOR = REPO_ROOT / "legacy_data" / "scripts" / "seed_curator_media.py"
PYTHON = REPO_ROOT / "scripts" / ".venv" / "bin" / "python3"


def run_seeds(db_path: Path, media_dir: Path) -> None:
    members_result = subprocess.run(
        [str(PYTHON), str(SEED_MEMBERS), "--db", str(db_path)],
        capture_output=True,
        text=True,
    )
    assert members_result.returncode == 0, (
        f"seed_members.py failed: {members_result.returncode}\n"
        f"stderr: {members_result.stderr}"
    )
    curator_result = subprocess.run(
        [
            str(PYTHON), str(SEED_CURATOR),
            "--db", str(db_path),
            "--media-dir", str(media_dir),
        ],
        capture_output=True,
        text=True,
    )
    assert curator_result.returncode == 0, (
        f"seed_curator_media.py failed: {curator_result.returncode}\n"
        f"stderr: {curator_result.stderr}"
    )


def test_seed_curator_media_against_fresh_schema() -> None:
    if not PYTHON.exists():
        raise RuntimeError(
            f"venv python missing at {PYTHON}; run `bash scripts/reset-local-db.sh` "
            f"once or `python3 -m venv scripts/.venv && scripts/.venv/bin/pip install "
            f"-r scripts/requirements.txt` to bootstrap."
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"

        # Apply current schema.sql to a fresh DB.
        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        # First seed run.
        run_seeds(db_path, media_dir)

        con = sqlite3.connect(db_path)
        try:
            # Three curator media items expected: 1 avatar photo + 2 demo videos.
            (video_count,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE media_type = 'video'"
            ).fetchone()
            assert video_count == 2, f"expected 2 video media_items rows, got {video_count}"

            (avatar_count,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE media_type = 'photo' AND is_avatar = 1"
            ).fetchone()
            assert avatar_count == 1, f"expected 1 avatar photo row, got {avatar_count}"

            # All seeded media owned by the system member.
            (system_owned,) = con.execute(
                "SELECT COUNT(*) FROM media_items mi "
                "JOIN members m ON m.id = mi.uploader_member_id "
                "WHERE m.is_system = 1"
            ).fetchone()
            assert system_owned == 3, (
                f"expected 3 system-owned media_items, got {system_owned}"
            )

            # video_platform must be 's3' for curator video.
            (s3_count,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE video_platform = 's3'"
            ).fetchone()
            assert s3_count == 2, f"expected 2 s3-platform rows, got {s3_count}"

            # Both demo loops must carry their slot tags.
            for tag in ("#demo_freestyle", "#demo_net"):
                (tagged,) = con.execute(
                    "SELECT COUNT(*) FROM media_tags WHERE tag_display = ?",
                    (tag,),
                ).fetchone()
                assert tagged == 1, f"expected 1 row for tag {tag!r}, got {tagged}"

            # FH avatar pointer must be set to the avatar media row.
            (fh_id, fh_avatar_id) = con.execute(
                "SELECT id, avatar_media_id FROM members WHERE is_system = 1"
            ).fetchone()
            assert fh_avatar_id is not None, "FH avatar_media_id must point at the seeded avatar row"
            avatar_row = con.execute(
                "SELECT media_type, is_avatar, s3_key_thumb, s3_key_display "
                "FROM media_items WHERE id = ?",
                (fh_avatar_id,),
            ).fetchone()
            assert avatar_row is not None, "FH avatar_media_id references a missing row"
            mt, is_avatar, key_thumb, key_display = avatar_row
            assert mt == "photo" and is_avatar == 1, (
                f"FH avatar row must be photo+is_avatar; got media_type={mt!r}, is_avatar={is_avatar}"
            )
            assert key_thumb and key_display, (
                f"FH avatar must have both s3_key_thumb and s3_key_display"
            )

            # Media bytes must exist on disk under the FH member's prefix.
            fh_detached = media_dir / fh_id / "detached"
            fh_avatars = media_dir / fh_id / "avatars"
            video_files = list(fh_detached.glob("*-video.mp4"))
            poster_files = list(fh_detached.glob("*-poster-*.jpg"))
            avatar_files = list(fh_avatars.glob("*.jpg"))
            assert len(video_files) == 2, f"expected 2 video files, got {len(video_files)}"
            assert len(poster_files) == 4, (
                f"expected 4 poster files (display+thumb x 2 items), got {len(poster_files)}"
            )
            assert len(avatar_files) == 2, (
                f"expected 2 avatar files (thumb + display), got {len(avatar_files)}"
            )

            # Capture row count + a sample id for idempotency check.
            initial_video_id = con.execute(
                "SELECT video_id FROM media_items WHERE media_type = 'video' LIMIT 1"
            ).fetchone()[0]
        finally:
            con.close()

        # Second seed run: idempotent.
        run_seeds(db_path, media_dir)

        con = sqlite3.connect(db_path)
        try:
            (media_count2,) = con.execute(
                "SELECT COUNT(*) FROM media_items"
            ).fetchone()
            assert media_count2 == 3, (
                f"expected 3 media_items after re-seed (idempotent), got {media_count2}"
            )

            # video_id (S3 key) must be stable across runs.
            after_video_id = con.execute(
                "SELECT video_id FROM media_items WHERE media_type = 'video' LIMIT 1"
            ).fetchone()[0]
            assert after_video_id == initial_video_id, (
                f"video_id changed across runs (expected stable): "
                f"{initial_video_id!r} → {after_video_id!r}"
            )

            # FH avatar pointer must remain set after re-seed.
            (fh_avatar_id_after,) = con.execute(
                "SELECT avatar_media_id FROM members WHERE is_system = 1"
            ).fetchone()
            assert fh_avatar_id_after is not None, (
                "FH avatar_media_id must still point at the avatar row after re-seed"
            )
        finally:
            con.close()


if __name__ == "__main__":
    test_seed_curator_media_against_fresh_schema()
    print("OK: seed_curator_media.py produces expected rows + on-disk artifacts; idempotent on re-run")
