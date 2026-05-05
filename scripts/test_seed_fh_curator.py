#!/usr/bin/env python3
"""Integration test for seed_fh_curator.py.

Asserts that the consolidated FH/curator seed produces:
  - The Footbag Hacky system member row (is_system=1, NULL credentials)
  - Expected curator media_items, media_tags, and on-disk artifacts
  - FH-owned named gallery rows + their criteria-tag sets

Idempotency check: runs the seed twice and asserts row counts stay
constant and the bytes match.

Run directly: `python3 scripts/test_seed_fh_curator.py`.
"""

import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
SEED_FH_CURATOR = REPO_ROOT / "scripts" / "seed_fh_curator.py"
PYTHON = REPO_ROOT / "scripts" / ".venv" / "bin" / "python3"


def run_seeds(db_path: Path, media_dir: Path, source_dir: Path | None = None) -> None:
    """Run seed_fh_curator (FH member + curator media + galleries). If
    source_dir is supplied, pass via --source-dir so the seeder reads from
    that dir instead of the repo's real /curated/ tree.
    """
    cmd = [
        str(PYTHON), str(SEED_FH_CURATOR),
        "--db", str(db_path),
        "--media-dir", str(media_dir),
    ]
    if source_dir is not None:
        cmd += ["--source-dir", str(source_dir)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    assert result.returncode == 0, (
        f"seed_fh_curator.py failed: {result.returncode}\n"
        f"stderr: {result.stderr}"
    )


def test_seed_fh_curator_against_fresh_schema() -> None:
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
        source_dir = tmp_path / "curated"

        # Scope the source-dir to only the legacy CURATOR_ITEMS file-backed
        # entries (avatar + 2 demo loops + Japan Worlds photo). Sidecar-based
        # /curated/freestyle_tricks/ content has its own dedicated test
        # below; including it here would also require seeding the legacy
        # `freestyle_media_sources` table (a CSV-loader artefact) so the
        # sidecar `sourceId` FK on media_sources resolves. Tracked on
        # legacy_data/IMPLEMENTATION_PLAN.md task 8.
        source_dir.mkdir()
        for item_name in (
            "fh-avatar.jpg",
            "demo-freestyle.mp4",
            "demo-freestyle-poster.jpg",
            "demo-net.mp4",
            "demo-net-poster.jpg",
            "japan-worlds-2026.jpg",
        ):
            (source_dir / item_name).symlink_to(REPO_ROOT / "curated" / item_name)

        # Apply current schema.sql to a fresh DB.
        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        # First seed run.
        run_seeds(db_path, media_dir, source_dir)

        con = sqlite3.connect(db_path)
        try:
            # Four curator media items expected: 1 avatar photo + 2 demo videos
            # + 1 curator photo (Japan Worlds 2026).
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
            assert system_owned == 4, (
                f"expected 4 system-owned media_items, got {system_owned}"
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

            # Non-avatar photo files: {media-id}-thumb.jpg + {media-id}-display.jpg
            # under detached/, distinguishable from video posters which carry the
            # -poster- infix. Japan Worlds 2026 contributes one of each.
            photo_thumb_files = [
                p for p in fh_detached.glob("*-thumb.jpg") if "-poster-" not in p.name
            ]
            photo_display_files = [
                p for p in fh_detached.glob("*-display.jpg") if "-poster-" not in p.name
            ]
            assert len(photo_thumb_files) == 1, (
                f"expected 1 non-avatar photo thumb file, got {len(photo_thumb_files)}"
            )
            assert len(photo_display_files) == 1, (
                f"expected 1 non-avatar photo display file, got {len(photo_display_files)}"
            )

            # Japan Worlds 2026 row shape + tag.
            japan_row = con.execute(
                "SELECT id, media_type, is_avatar, caption, s3_key_thumb, s3_key_display "
                "FROM media_items WHERE caption = 'Japan Worlds 2026'"
            ).fetchone()
            assert japan_row is not None, "expected Japan Worlds 2026 photo row"
            j_id, j_mt, j_is_avatar, _, j_thumb, j_display = japan_row
            assert j_mt == "photo" and j_is_avatar == 0, (
                f"Japan row must be photo+non-avatar; got media_type={j_mt!r}, is_avatar={j_is_avatar}"
            )
            assert j_thumb and j_display, (
                "Japan photo must have both s3_key_thumb and s3_key_display"
            )
            (japan_tagged,) = con.execute(
                "SELECT COUNT(*) FROM media_tags mt "
                "JOIN tags t ON t.id = mt.tag_id "
                "WHERE mt.media_id = ? AND t.tag_normalized = '#event_2026_worlds_japan'",
                (j_id,),
            ).fetchone()
            assert japan_tagged == 1, (
                f"Japan photo must carry tag #event_2026_worlds_japan; got count={japan_tagged}"
            )

            # source_filename round-trip: every seeded row carries the manifest
            # source filename. Used by landing-page services to query a slot
            # (filename is the stable identity; tags are gallery membership).
            filename_rows = dict(con.execute(
                "SELECT source_filename, media_type FROM media_items"
            ).fetchall())
            for expected_name in (
                "fh-avatar.jpg",
                "demo-freestyle.mp4",
                "demo-net.mp4",
                "japan-worlds-2026.jpg",
            ):
                assert expected_name in filename_rows, (
                    f"expected source_filename={expected_name!r} in media_items; "
                    f"got {sorted(filename_rows.keys())}"
                )

            # Capture row count + a sample id for idempotency check.
            initial_video_id = con.execute(
                "SELECT video_id FROM media_items WHERE media_type = 'video' LIMIT 1"
            ).fetchone()[0]
        finally:
            con.close()

        # Second seed run: idempotent.
        run_seeds(db_path, media_dir, source_dir)

        con = sqlite3.connect(db_path)
        try:
            (media_count2,) = con.execute(
                "SELECT COUNT(*) FROM media_items"
            ).fetchone()
            assert media_count2 == 4, (
                f"expected 4 media_items after re-seed (idempotent), got {media_count2}"
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


def _seed_with_source_dir(db_path: Path, media_dir: Path, source_dir: Path) -> tuple[int, str]:
    """Run seed_fh_curator.py with an explicit --source-dir. Returns
    (returncode, stderr). Used by the freestyle-tricks-sidecar tests to
    drop fixture sidecars in a temp dir without touching the real
    /curated/ tree.
    """
    curator_result = subprocess.run(
        [
            str(PYTHON), str(SEED_FH_CURATOR),
            "--db", str(db_path),
            "--media-dir", str(media_dir),
            "--source-dir", str(source_dir),
        ],
        capture_output=True,
        text=True,
    )
    return curator_result.returncode, curator_result.stderr


def _write_youtube_sidecar(
    sidecar_dir: Path,
    name: str,
    video_id: str,
    *,
    extra: dict | None = None,
) -> Path:
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    body: dict = {
        "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
        "videoPlatform": "youtube",
        "title": f"Fixture {name}",
        "tags": ["#freestyle", "#trick", f"#{name}"],
    }
    if extra:
        body.update(extra)
    path = sidecar_dir / f"{name}.meta.json"
    import json
    path.write_text(json.dumps(body, indent=2))
    return path


def _write_vimeo_sidecar(
    sidecar_dir: Path,
    name: str,
    video_id: str,
    *,
    extra: dict | None = None,
) -> Path:
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    body: dict = {
        "videoUrl": f"https://vimeo.com/{video_id}",
        "videoPlatform": "vimeo",
        "title": f"Fixture {name}",
        "thumbnailUrl": f"https://i.vimeocdn.com/video/{video_id}_640.jpg",
        "tags": ["#freestyle", "#trick", f"#{name}"],
    }
    if extra:
        body.update(extra)
    path = sidecar_dir / f"{name}.meta.json"
    import json
    path.write_text(json.dumps(body, indent=2))
    return path


def test_freestyle_tricks_seeder_creates_named_gallery_and_criteria_tags() -> None:
    """The seeder must create the FH-owned `gallery_curated_freestyle_tricks`
    member_galleries row AND populate member_gallery_tags with exactly
    {#curated, #freestyle, #trick}. Re-running must not duplicate criteria
    rows (DELETE-then-INSERT pattern).
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        sidecar_dir = source_dir / "freestyle_tricks"

        # Fresh schema.
        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        # Two YouTube sidecars + one Vimeo sidecar (no sourceId — keeps
        # the FK on media_sources unconstrained, consistent with the
        # sidecar schema where sourceId is optional).
        _write_youtube_sidecar(sidecar_dir, "ripwalk", "ytRipwalk1")
        _write_youtube_sidecar(sidecar_dir, "clipper", "ytClipper2")
        _write_vimeo_sidecar(sidecar_dir, "smear", "987654321")

        # Also place the legacy demo-loop source files so the hardcoded
        # CURATOR_ITEMS path can run alongside the sidecars; otherwise
        # the seeder errors on missing demo-freestyle.mp4 etc. We mirror
        # the structure expected by CURATOR_ITEMS by symlinking the real
        # /curated/ bytes for the file-backed items.
        real_curated = REPO_ROOT / "curated"
        for item_name in (
            "fh-avatar.jpg",
            "demo-freestyle.mp4",
            "demo-freestyle-poster.jpg",
            "demo-net.mp4",
            "demo-net-poster.jpg",
            "japan-worlds-2026.jpg",
        ):
            (source_dir / item_name).symlink_to(real_curated / item_name)

        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc == 0, f"seeder failed: {stderr}"

        con = sqlite3.connect(db_path)
        try:
            # FH-owned named gallery row.
            row = con.execute(
                "SELECT g.id, g.name, g.description "
                "FROM member_galleries g "
                "JOIN members m ON m.id = g.owner_member_id "
                "WHERE g.id = 'gallery_curated_freestyle_tricks' AND m.is_system = 1"
            ).fetchone()
            assert row is not None, "expected FH-owned gallery row not found"
            assert row[1] == "Curated Freestyle Tricks"

            # Criteria tags (exactly the three).
            criteria = sorted(
                r[0] for r in con.execute(
                    "SELECT t.tag_display "
                    "FROM member_gallery_tags mgt "
                    "JOIN tags t ON t.id = mgt.tag_id "
                    "WHERE mgt.gallery_id = 'gallery_curated_freestyle_tricks'"
                ).fetchall()
            )
            assert criteria == ["#curated", "#freestyle", "#trick"], (
                f"expected criteria tags {{#curated, #freestyle, #trick}}, got {criteria}"
            )

            # Sidecars themselves stay detached (gallery_id = NULL).
            (detached,) = con.execute(
                "SELECT COUNT(*) FROM media_items "
                "WHERE source_filename IS NULL AND gallery_id IS NOT NULL "
                "  AND moderation_status = 'active'"
            ).fetchone()
            assert detached == 0, (
                f"sidecar media_items must have gallery_id NULL (detached); "
                f"got {detached} attached rows"
            )

            # YouTube sidecars: thumbnail_url stays NULL (service derives at render).
            yt = con.execute(
                "SELECT COUNT(*) FROM media_items "
                "WHERE video_platform = 'youtube' AND thumbnail_url IS NULL"
            ).fetchone()[0]
            assert yt == 2, f"expected 2 YouTube rows with NULL thumbnail_url, got {yt}"

            # Vimeo sidecar: thumbnail_url is the sidecar-supplied https URL.
            vm_thumb = con.execute(
                "SELECT thumbnail_url FROM media_items WHERE video_platform = 'vimeo'"
            ).fetchone()[0]
            assert vm_thumb == "https://i.vimeocdn.com/video/987654321_640.jpg", (
                f"expected Vimeo thumbnail_url from sidecar; got {vm_thumb!r}"
            )
        finally:
            con.close()

        # Re-run: criteria-tag rows must not duplicate.
        rc2, stderr2 = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc2 == 0, f"second seed run failed: {stderr2}"

        con = sqlite3.connect(db_path)
        try:
            (n_criteria,) = con.execute(
                "SELECT COUNT(*) FROM member_gallery_tags "
                "WHERE gallery_id = 'gallery_curated_freestyle_tricks'"
            ).fetchone()
            assert n_criteria == 3, (
                f"criteria rows must stay at 3 after re-run (idempotent); got {n_criteria}"
            )
        finally:
            con.close()


def test_seeder_orphan_cleanup_removes_db_rows_for_deleted_sidecars() -> None:
    """When an admin (or operator) deletes a sidecar from /curated/, the next
    seeder run must DELETE the corresponding media_items row. /curated/ is
    the source of truth; rows persisted from now-missing sidecars are
    orphans and must not survive.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        sidecar_dir = source_dir / "freestyle_tricks"

        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        # Three sidecars on disk for the first run.
        _write_youtube_sidecar(sidecar_dir, "trickone", "ytTrickOne")
        _write_youtube_sidecar(sidecar_dir, "tricktwo", "ytTrickTwo")
        _write_youtube_sidecar(sidecar_dir, "trickthree", "ytTrickThree")

        # Symlink the file-paired source files (CURATOR_ITEMS) so the
        # seeder's hardcoded list does not error out.
        real_curated = REPO_ROOT / "curated"
        for item_name in (
            "fh-avatar.jpg",
            "demo-freestyle.mp4",
            "demo-freestyle-poster.jpg",
            "demo-net.mp4",
            "demo-net-poster.jpg",
            "japan-worlds-2026.jpg",
        ):
            (source_dir / item_name).symlink_to(real_curated / item_name)

        rc1, stderr1 = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc1 == 0, f"first seed run failed: {stderr1}"

        con = sqlite3.connect(db_path)
        try:
            (n_url_ref,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE video_platform IN ('youtube','vimeo')"
            ).fetchone()
            assert n_url_ref == 3, f"expected 3 URL-ref rows after first run; got {n_url_ref}"
        finally:
            con.close()

        # Delete one sidecar from disk (simulates admin delete via UI, or a
        # manual rm + git commit by an operator). The test fixture writes
        # files as `<slug>.meta.json` (no hash suffix); production sidecars
        # use `<slug>_<sha1(url)[:8]>.meta.json` but the orphan-cleanup
        # logic keys on (videoPlatform, videoUrl) parsed from the file
        # contents, not on the filename, so the fixture shape is fine.
        deleted = sidecar_dir / "trickone.meta.json"
        assert deleted.exists(), f"fixture sidecar missing at {deleted}"
        deleted.unlink()

        rc2, stderr2 = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc2 == 0, f"second seed run failed: {stderr2}"

        con = sqlite3.connect(db_path)
        try:
            (n_url_ref_after,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE video_platform IN ('youtube','vimeo')"
            ).fetchone()
            assert n_url_ref_after == 2, (
                f"expected 2 URL-ref rows after sidecar delete; got {n_url_ref_after}"
            )
            # The deleted slug's row is gone specifically.
            (gone,) = con.execute(
                "SELECT COUNT(*) FROM media_items "
                "WHERE video_url LIKE '%ytTrickOne%'"
            ).fetchone()
            assert gone == 0, "row for the deleted sidecar must be removed"
            # The remaining slugs survive.
            (kept,) = con.execute(
                "SELECT COUNT(*) FROM media_items "
                "WHERE video_url LIKE '%ytTrickTwo%' OR video_url LIKE '%ytTrickThree%'"
            ).fetchone()
            assert kept == 2, f"expected the other 2 sidecars' rows to survive; got {kept}"
        finally:
            con.close()

    print("OK: seeder orphan cleanup removes DB rows for deleted sidecars")


def test_seeder_rejects_vimeo_sidecar_without_thumbnail_url() -> None:
    """Per CURATED_MEDIA_PLAN.md and the seeder validation rule: Vimeo
    sidecars must include thumbnailUrl as an https:// URL because Vimeo
    thumbnails are not derivable from the video id.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        sidecar_dir = source_dir / "freestyle_tricks"

        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        sidecar_dir.mkdir(parents=True)
        # Vimeo sidecar WITHOUT thumbnailUrl — must be rejected.
        bad = sidecar_dir / "smear.meta.json"
        import json
        bad.write_text(json.dumps({
            "videoUrl": "https://vimeo.com/123456789",
            "videoPlatform": "vimeo",
            "title": "Bad Vimeo (no thumbnailUrl)",
            "tags": ["#freestyle", "#trick", "#smear"],
        }))

        # Symlink demo bytes so CURATOR_ITEMS doesn't error first.
        for item_name in (
            "fh-avatar.jpg",
            "demo-freestyle.mp4",
            "demo-freestyle-poster.jpg",
            "demo-net.mp4",
            "demo-net-poster.jpg",
            "japan-worlds-2026.jpg",
        ):
            (source_dir / item_name).symlink_to(REPO_ROOT / "curated" / item_name)

        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, f"seeder must reject vimeo sidecar without thumbnailUrl"
        assert "thumbnailUrl" in stderr, (
            f"error must mention thumbnailUrl; got: {stderr}"
        )


def test_seeder_rejects_youtube_sidecar_with_thumbnail_url() -> None:
    """Per the seeder validation rule: YouTube sidecars must NOT carry
    thumbnailUrl because the gallery service derives the YouTube
    thumbnail from the video id at render time.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        sidecar_dir = source_dir / "freestyle_tricks"

        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        sidecar_dir.mkdir(parents=True)
        bad = sidecar_dir / "ripwalk.meta.json"
        import json
        bad.write_text(json.dumps({
            "videoUrl": "https://www.youtube.com/watch?v=ytForbidden",
            "videoPlatform": "youtube",
            "title": "Bad YouTube (forbidden thumbnailUrl)",
            "thumbnailUrl": "https://i.ytimg.com/vi/ytForbidden/hqdefault.jpg",
            "tags": ["#freestyle", "#trick", "#ripwalk"],
        }))

        for item_name in (
            "fh-avatar.jpg",
            "demo-freestyle.mp4",
            "demo-freestyle-poster.jpg",
            "demo-net.mp4",
            "demo-net-poster.jpg",
            "japan-worlds-2026.jpg",
        ):
            (source_dir / item_name).symlink_to(REPO_ROOT / "curated" / item_name)

        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, f"seeder must reject youtube sidecar with thumbnailUrl"
        assert "thumbnailUrl" in stderr, (
            f"error must mention thumbnailUrl; got: {stderr}"
        )


if __name__ == "__main__":
    test_seed_fh_curator_against_fresh_schema()
    print("OK: seed_fh_curator.py produces expected rows + on-disk artifacts; idempotent on re-run")
    test_freestyle_tricks_seeder_creates_named_gallery_and_criteria_tags()
    print("OK: freestyle_tricks seeder creates FH-owned named gallery + tag-AND criteria; idempotent")
    test_seeder_orphan_cleanup_removes_db_rows_for_deleted_sidecars()
    test_seeder_rejects_vimeo_sidecar_without_thumbnail_url()
    print("OK: seeder rejects vimeo sidecar without thumbnailUrl")
    test_seeder_rejects_youtube_sidecar_with_thumbnail_url()
    print("OK: seeder rejects youtube sidecar with thumbnailUrl")
