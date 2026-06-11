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

import json
import os
import shutil
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

        # File-paired curator items live under category subdirs in /curated/
        # (avatars/, events/, landing/ for this test). The seeder's walker
        # treats avatars/ as the avatar marker (no sidecar needed); other
        # categories require <stem>.meta.json sidecars. Sidecar-based
        # /curated/freestyle_tricks/ content has its own dedicated test
        # below; including it here would also require seeding the legacy
        # `freestyle_media_sources` table (a CSV-loader artefact) so the
        # sidecar `sourceId` FK on media_sources resolves.
        source_dir.mkdir()
        for subdir in ("avatars", "events", "galleries"):
            (source_dir / subdir).symlink_to(REPO_ROOT / "curated" / subdir)
        # Controlled landing fixture: copy only the two demo loops so the seeder
        # sees exactly two videos, independent of how many demo/mosaic loops the
        # real curated/landing/ accumulates over time. Keeps the seeded input
        # deterministic and avoids transcoding the full mosaic set every run.
        landing = source_dir / "landing"
        landing.mkdir()
        real_landing = REPO_ROOT / "curated" / "landing"
        for stem in ("demo-freestyle", "demo-net"):
            for suffix in (".meta.json", ".mp4", ".poster.jpg"):
                shutil.copy2(real_landing / f"{stem}{suffix}", landing / f"{stem}{suffix}")

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

            # Demo tags mirror the curated sidecars: each demo loop carries
            # its own discipline-scoped demo tag, and the freestyle demo
            # additionally carries the shared #freestyle tag.
            for tag, expected in (("#demo_freestyle", 1), ("#demo_net", 1), ("#freestyle", 1)):
                (tagged,) = con.execute(
                    "SELECT COUNT(*) FROM media_tags WHERE tag_display = ?",
                    (tag,),
                ).fetchone()
                assert tagged == expected, f"expected {expected} row(s) for tag {tag!r}, got {tagged}"

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
        # galleries/ subdir is required by the named-gallery loader.
        source_dir.mkdir()
        (source_dir / "galleries").symlink_to(REPO_ROOT / "curated" / "galleries")

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

        # No file-paired binaries are needed: this test exercises the
        # URL-ref pipeline. The CURATOR_ITEMS placeholder (beaver_open_2025)
        # has no source binary on disk and is silently skipped by seed_item.

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
        # galleries/ subdir is required by the named-gallery loader.
        source_dir.mkdir()
        (source_dir / "galleries").symlink_to(REPO_ROOT / "curated" / "galleries")

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

        # No file-paired binaries needed; this test exercises only the
        # URL-ref orphan-cleanup path.

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


def test_seeder_orphan_cleanup_spares_member_owned_url_ref() -> None:
    """The URL-ref orphan cleanup is owner-scoped: it deletes only FH-owned
    (system member) youtube/vimeo rows whose sidecar is gone. A member-
    submitted youtube/vimeo video (uploader != FH) is never FH-owned and must
    survive a curator seed run, even though it has no /curated/ sidecar. An
    FH-owned row with no sidecar is the control: it must still be deleted.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        sidecar_dir = source_dir / "freestyle_tricks"
        source_dir.mkdir()
        (source_dir / "galleries").symlink_to(REPO_ROOT / "curated" / "galleries")

        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        # Two FH curated sidecars become FH-owned url-ref rows (kept).
        _write_youtube_sidecar(sidecar_dir, "trickone", "ytTrickOne")
        _write_youtube_sidecar(sidecar_dir, "tricktwo", "ytTrickTwo")

        rc1, stderr1 = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc1 == 0, f"first seed run failed: {stderr1}"

        con = sqlite3.connect(db_path)
        con.execute("PRAGMA foreign_keys = ON")
        try:
            (fh_id,) = con.execute(
                "SELECT id FROM members WHERE is_system = 1"
            ).fetchone()

            ts = "2026-01-01T00:00:00.000Z"
            # A live non-system member (credential CHECK branch 1 requires a
            # full credential set), with a submitted youtube video and NO
            # sidecar.
            con.execute(
                """INSERT INTO members
                     (id, slug, login_email, login_email_normalized, password_hash,
                      password_changed_at, real_name, display_name, display_name_normalized,
                      created_at, created_by, updated_at, updated_by, version)
                   VALUES ('member_test_owner', 'test_owner', 'owner@test.example',
                      'owner@test.example', 'x', ?, 'Test Owner', 'Test Owner', 'test owner',
                      ?, 'test', ?, 'test', 1)""",
                (ts, ts, ts),
            )
            member_url = "https://www.youtube.com/watch?v=memberOwnedVid"
            con.execute(
                """INSERT INTO media_items
                     (id, created_at, created_by, updated_at, updated_by, version,
                      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
                      video_platform, video_id, video_url, moderation_status)
                   VALUES ('media_member_owned_1', ?, 'member', ?, 'member', 1,
                      'member_test_owner', 'video', 0, 'Member clip', ?,
                      'youtube', 'memberOwnedVid', ?, 'active')""",
                (ts, ts, ts, member_url),
            )

            # Control: an FH-owned youtube row with no sidecar must still be
            # deleted as a genuine orphan.
            fh_orphan_url = "https://www.youtube.com/watch?v=fhOrphanVid"
            con.execute(
                """INSERT INTO media_items
                     (id, created_at, created_by, updated_at, updated_by, version,
                      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
                      video_platform, video_id, video_url, moderation_status)
                   VALUES ('media_fh_orphan_1', ?, 'seed', ?, 'seed', 1,
                      ?, 'video', 0, 'FH orphan', ?,
                      'youtube', 'fhOrphanVid', ?, 'active')""",
                (ts, ts, fh_id, ts, fh_orphan_url),
            )
            con.commit()
        finally:
            con.close()

        rc2, stderr2 = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc2 == 0, f"second seed run failed: {stderr2}"

        con = sqlite3.connect(db_path)
        try:
            (member_kept,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE id = 'media_member_owned_1'"
            ).fetchone()
            assert member_kept == 1, (
                "member-submitted youtube row must survive the owner-scoped "
                f"curator seed cleanup; got {member_kept}"
            )
            (fh_orphan_gone,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE id = 'media_fh_orphan_1'"
            ).fetchone()
            assert fh_orphan_gone == 0, (
                "FH-owned url-ref row with no sidecar must still be deleted; "
                f"got {fh_orphan_gone}"
            )
            (kept_sidecars,) = con.execute(
                "SELECT COUNT(*) FROM media_items "
                "WHERE video_url LIKE '%ytTrickOne%' OR video_url LIKE '%ytTrickTwo%'"
            ).fetchone()
            assert kept_sidecars == 2, (
                f"FH sidecar-backed rows must survive; got {kept_sidecars}"
            )
        finally:
            con.close()

    print("OK: url-ref orphan cleanup is owner-scoped (member videos survive; FH orphans deleted)")


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
        # galleries/ subdir is required by the named-gallery loader.
        source_dir.mkdir()
        (source_dir / "galleries").symlink_to(REPO_ROOT / "curated" / "galleries")

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

        # No file-paired binaries needed; CURATOR_ITEMS placeholder has
        # no binary and is silently skipped.

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
        # galleries/ subdir is required by the named-gallery loader.
        source_dir.mkdir()
        (source_dir / "galleries").symlink_to(REPO_ROOT / "curated" / "galleries")

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

        # No file-paired binaries needed; CURATOR_ITEMS placeholder has
        # no binary and is silently skipped.

        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, f"seeder must reject youtube sidecar with thumbnailUrl"
        assert "thumbnailUrl" in stderr, (
            f"error must mention thumbnailUrl; got: {stderr}"
        )


# ── Regression tests for the file-paired pipeline (3b–3g) ────────────────


def _setup_minimal_source_dir(tmp_path: Path) -> Path:
    """Create a temp source_dir with the minimum subdirs the seeder
    needs to run end-to-end. galleries/ is required by the named-gallery
    loader and is symlinked from the real repo. Tests can add their own
    subdirs / sidecars on top.
    """
    source_dir = tmp_path / "curated"
    source_dir.mkdir()
    (source_dir / "galleries").symlink_to(REPO_ROOT / "curated" / "galleries")
    return source_dir


def _apply_schema(db_path: Path) -> None:
    subprocess.run(
        ["sqlite3", str(db_path)],
        input=SCHEMA.read_text(),
        text=True,
        check=True,
    )


def test_chilone_external_url_persists_after_seed() -> None:
    """Regression for the source_filename basename mismatch (fix 3c):
    chilone's `externalUrl` from misc/chilone.meta.json must end up in
    media_items.external_url. Before the fix, the INSERT wrote
    source_filename='misc/chilone.mp4' (relative) and the sibling UPDATE
    keyed on basename 'chilone.mp4', so the two never matched and
    external_url stayed NULL.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        # Symlink only misc/; isolate to chilone behavior.
        (source_dir / "misc").symlink_to(REPO_ROOT / "curated" / "misc")
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc == 0, f"seeder failed: {stderr}"
        con = sqlite3.connect(db_path)
        try:
            row = con.execute(
                "SELECT external_url, external_url_validated_at "
                "FROM media_items WHERE source_filename = 'chilone.mp4'"
            ).fetchone()
            assert row is not None, "expected chilone media_items row"
            assert row[0] == "https://en.wikipedia.org/wiki/Chinlone", (
                f"chilone external_url must be persisted from sidecar; got {row[0]!r}"
            )
            assert row[1] is not None, (
                "external_url_validated_at must be stamped when external_url is set"
            )
        finally:
            con.close()


def test_avatars_subdir_implies_is_avatar_without_sidecar() -> None:
    """Regression for fix 3d: a binary in /curated/avatars/ is seeded as
    an avatar without any sidecar. The avatars/ subdir is the avatar
    declaration; the seeder forces is_avatar=1, applies the
    `#by_<owner_slug>` tag, and updates members.avatar_media_id.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        (source_dir / "avatars").symlink_to(REPO_ROOT / "curated" / "avatars")
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc == 0, f"seeder failed: {stderr}"
        con = sqlite3.connect(db_path)
        try:
            (fh_id, fh_avatar_id) = con.execute(
                "SELECT id, avatar_media_id FROM members WHERE is_system = 1"
            ).fetchone()
            assert fh_avatar_id is not None, (
                "FH avatar_media_id must point at the seeded avatar row"
            )
            row = con.execute(
                "SELECT media_type, is_avatar, source_filename "
                "FROM media_items WHERE id = ?",
                (fh_avatar_id,),
            ).fetchone()
            assert row is not None, "FH avatar_media_id references a missing row"
            assert row == ("photo", 1, "fh-avatar.jpg"), (
                f"avatar row must be (photo, 1, 'fh-avatar.jpg'); got {row!r}"
            )
            (by_count,) = con.execute(
                "SELECT COUNT(*) FROM media_tags mt "
                "JOIN tags t ON t.id = mt.tag_id "
                "WHERE mt.media_id = ? AND t.tag_normalized = '#by_footbag_hacky'",
                (fh_avatar_id,),
            ).fetchone()
            assert by_count == 1, (
                f"avatar must carry #by_footbag_hacky; got count={by_count}"
            )
            # Avatar must NOT carry #curated (avatar branch uses owner marker only).
            (curated_count,) = con.execute(
                "SELECT COUNT(*) FROM media_tags mt "
                "JOIN tags t ON t.id = mt.tag_id "
                "WHERE mt.media_id = ? AND t.tag_normalized = '#curated'",
                (fh_avatar_id,),
            ).fetchone()
            assert curated_count == 0, (
                f"avatar must NOT carry #curated; got count={curated_count}"
            )
        finally:
            con.close()


def test_avatars_subdir_rejects_sidecar() -> None:
    """A .meta.json file in /curated/avatars/ is a misconfiguration: the
    avatars/ subdir is the avatar declaration, no sidecar fields are
    consumed. The seeder must fail-fast with a clear error.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        avatars = source_dir / "avatars"
        avatars.mkdir()
        # Copy a real avatar binary into the temp dir (can't symlink the
        # subdir because we want to add an extra file).
        shutil.copy(REPO_ROOT / "curated" / "avatars" / "fh-avatar.jpg",
                    avatars / "fh-avatar.jpg")
        (avatars / "fh-avatar.meta.json").write_text("{}")
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, "seeder must reject sidecar in avatars/"
        assert "avatars/" in stderr or "sidecar" in stderr.lower(), (
            f"error must mention avatars/ rule; got: {stderr}"
        )


def test_avatars_subdir_rejects_video_binary() -> None:
    """A video binary in /curated/avatars/ is invalid (avatars are photos).
    Seeder must fail-fast.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        avatars = source_dir / "avatars"
        avatars.mkdir()
        # Drop in a video binary; bytes don't matter, ext does.
        (avatars / "bogus.mp4").write_bytes(b"not a real video")
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, "seeder must reject video in avatars/"
        assert "avatars" in stderr and ("photo" in stderr.lower() or "video" in stderr.lower()), (
            f"error must mention avatars/photo rule; got: {stderr}"
        )


def test_isAvatar_in_non_avatars_subdir_rejected() -> None:
    """A sidecar in any non-avatars/ subdir that sets isAvatar=true is a
    misconfiguration: avatar declaration belongs to the directory, not
    a per-file flag. Seeder must fail-fast and tell the operator to move
    the binary into avatars/.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        misc = source_dir / "misc"
        misc.mkdir()
        shutil.copy(REPO_ROOT / "curated" / "avatars" / "fh-avatar.jpg",
                    misc / "rogue-avatar.jpg")
        (misc / "rogue-avatar.meta.json").write_text(
            json.dumps({"isAvatar": True, "tags": ["#whatever"]})
        )
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, "seeder must reject isAvatar:true outside avatars/"
        assert "isAvatar" in stderr and "avatars/" in stderr, (
            f"error must mention isAvatar/avatars/ rule; got: {stderr}"
        )


def test_file_paired_orphan_cleanup() -> None:
    """Regression for fix 3e: when a file-paired binary+sidecar disappears
    from /curated/, the next seed run removes the corresponding
    media_items row. Mirrors the URL-ref orphan cleanup contract.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        misc = source_dir / "misc"
        misc.mkdir()
        # Drop two file-paired entries.
        (misc / "alpha.jpg").write_bytes(
            (REPO_ROOT / "curated" / "events" / "japan-worlds-2026.jpg").read_bytes()
        )
        (misc / "alpha.meta.json").write_text(
            json.dumps({"caption": "alpha", "tags": ["#alpha"]})
        )
        (misc / "beta.jpg").write_bytes(
            (REPO_ROOT / "curated" / "events" / "japan-worlds-2026.jpg").read_bytes()
        )
        (misc / "beta.meta.json").write_text(
            json.dumps({"caption": "beta", "tags": ["#beta"]})
        )
        _apply_schema(db_path)
        rc, _ = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc == 0
        con = sqlite3.connect(db_path)
        try:
            (n_first,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE source_filename IN ('alpha.jpg','beta.jpg')"
            ).fetchone()
            assert n_first == 2, f"expected both rows after first seed; got {n_first}"
        finally:
            con.close()
        # Delete beta from disk and re-seed.
        (misc / "beta.jpg").unlink()
        (misc / "beta.meta.json").unlink()
        rc2, _ = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc2 == 0
        con = sqlite3.connect(db_path)
        try:
            (alpha_kept,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE source_filename = 'alpha.jpg'"
            ).fetchone()
            assert alpha_kept == 1, f"alpha must survive; got {alpha_kept}"
            (beta_gone,) = con.execute(
                "SELECT COUNT(*) FROM media_items WHERE source_filename = 'beta.jpg'"
            ).fetchone()
            assert beta_gone == 0, f"beta must be removed by orphan cleanup; got {beta_gone}"
        finally:
            con.close()


def test_file_paired_malformed_sidecar_fails_fast() -> None:
    """Regression for fix 3f: malformed JSON in a file-paired sidecar
    must exit non-zero with a clear error. Previously printed "Skipping"
    and silently dropped the item.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        misc = source_dir / "misc"
        misc.mkdir()
        (misc / "bad.jpg").write_bytes(b"\xff\xd8\xff\xe0")  # JPEG magic; fine
        (misc / "bad.meta.json").write_text("{not: valid json}")
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, "seeder must fail on malformed sidecar JSON"
        assert "malformed" in stderr.lower() or "json" in stderr.lower(), (
            f"error must mention malformed/json; got: {stderr}"
        )


def test_file_paired_tag_shape_validation() -> None:
    """Regression for fix 3g: file-paired sidecar tags must be
    '#'-prefixed and lowercase. Mirrors _seed_one_sidecar's shape rules.
    """
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    # Case 1: missing # prefix.
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        misc = source_dir / "misc"
        misc.mkdir()
        shutil.copy(REPO_ROOT / "curated" / "misc" / "chilone.poster.jpg",
                    misc / "thing.jpg")
        (misc / "thing.meta.json").write_text(
            json.dumps({"caption": "x", "tags": ["nohash"]})
        )
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, "seeder must reject tag without # prefix"
        assert "#" in stderr or "prefix" in stderr.lower(), (
            f"error must mention # prefix rule; got: {stderr}"
        )
    # Case 2: uppercase tag.
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = _setup_minimal_source_dir(tmp_path)
        misc = source_dir / "misc"
        misc.mkdir()
        shutil.copy(REPO_ROOT / "curated" / "misc" / "chilone.poster.jpg",
                    misc / "thing.jpg")
        (misc / "thing.meta.json").write_text(
            json.dumps({"caption": "x", "tags": ["#NotLower"]})
        )
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc != 0, "seeder must reject uppercase tag"
        assert "lowercase" in stderr.lower(), (
            f"error must mention lowercase rule; got: {stderr}"
        )


def test_fh_historical_person_link_converges_across_hp_reloads() -> None:
    """The FH member's historical_person_id self-heals on every seed run:
    linked while a matching historical person exists, cleared to NULL when a
    historical_persons reload removed that row (loaders run with foreign keys
    off, so a stale value would otherwise dangle), and re-linked when the row
    returns."""
    if not PYTHON.exists():
        raise RuntimeError(
            f"venv python missing at {PYTHON}; run `bash scripts/reset-local-db.sh` "
            f"once or `python3 -m venv scripts/.venv && scripts/.venv/bin/pip install "
            f"-r scripts/requirements.txt` to bootstrap."
        )

    def insert_hacky_hp(db_path: Path, person_id: str) -> None:
        con = sqlite3.connect(db_path)
        try:
            con.execute(
                """INSERT INTO historical_persons
                     (person_id, person_name, country, event_count, placement_count,
                      bap_member, hof_member, hof_induction_year)
                   VALUES (?, 'Footbag Hacky', 'USA', 1, 1, 0, 1, 2025)""",
                (person_id,),
            )
            con.commit()
        finally:
            con.close()

    def fh_link(db_path: Path) -> str | None:
        con = sqlite3.connect(db_path)
        try:
            row = con.execute(
                "SELECT historical_person_id FROM members WHERE slug = 'footbag_hacky'"
            ).fetchone()
            assert row is not None, "FH member row missing"
            return row[0]
        finally:
            con.close()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        source_dir.mkdir()
        for subdir in ("avatars", "events", "galleries"):
            (source_dir / subdir).symlink_to(REPO_ROOT / "curated" / subdir)
        # Controlled landing fixture: copy only the two demo loops so the seeder
        # sees exactly two videos, independent of how many demo/mosaic loops the
        # real curated/landing/ accumulates over time. Keeps the seeded input
        # deterministic and avoids transcoding the full mosaic set every run.
        landing = source_dir / "landing"
        landing.mkdir()
        real_landing = REPO_ROOT / "curated" / "landing"
        for stem in ("demo-freestyle", "demo-net"):
            for suffix in (".meta.json", ".mp4", ".poster.jpg"):
                shutil.copy2(real_landing / f"{stem}{suffix}", landing / f"{stem}{suffix}")
        subprocess.run(
            ["sqlite3", str(db_path)],
            input=SCHEMA.read_text(),
            text=True,
            check=True,
        )

        # HP present at seed time -> linked.
        insert_hacky_hp(db_path, "person-hacky-test")
        run_seeds(db_path, media_dir, source_dir)
        assert fh_link(db_path) == "person-hacky-test", (
            f"expected FK linked to person-hacky-test, got {fh_link(db_path)!r}"
        )

        # A historical_persons reload removed the row -> re-run clears to NULL.
        con = sqlite3.connect(db_path)
        try:
            con.execute("DELETE FROM historical_persons WHERE person_id = 'person-hacky-test'")
            con.commit()
        finally:
            con.close()
        run_seeds(db_path, media_dir, source_dir)
        assert fh_link(db_path) is None, (
            f"expected NULL after HP removal, got {fh_link(db_path)!r}"
        )

        # The HP returns (fresh id, as a rebuild would mint) -> re-linked.
        insert_hacky_hp(db_path, "person-hacky-test-2")
        run_seeds(db_path, media_dir, source_dir)
        assert fh_link(db_path) == "person-hacky-test-2", (
            f"expected FK re-linked to person-hacky-test-2, got {fh_link(db_path)!r}"
        )


def test_gallery_external_link_verdicts_stamped() -> None:
    """Gallery external links are stamped from the committed url_verdicts.json
    companion at seed time (read-only, no callout): a verified URL gets
    validated_at, a flagged URL gets quarantine_reason, and a URL with no verdict
    loads unverified (both NULL) so the public read hides it until verified."""
    if not PYTHON.exists():
        raise RuntimeError(f"venv python missing at {PYTHON}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "test.db"
        media_dir = tmp_path / "media"
        source_dir = tmp_path / "curated"
        galleries_dir = source_dir / "galleries"
        galleries_dir.mkdir(parents=True)
        (galleries_dir / "vis_test.json").write_text(json.dumps({
            "id": "gallery_vis_test",
            "name": "Vis Test",
            "description": "",
            "sortOrder": "upload_desc",
            "criteriaTags": ["#curated"],
            "excludeTags": [],
            "externalLinks": [
                {"label": "Verified", "url": "https://ok.example/", "sortOrder": 0},
                {"label": "Flagged", "url": "https://bad.example/", "sortOrder": 1},
                {"label": "Unverified", "url": "https://new.example/", "sortOrder": 2},
            ],
        }, indent=2))
        (galleries_dir / "url_verdicts.json").write_text(json.dumps({
            "gallery_vis_test": {
                "https://ok.example/": {"validated_at": "2026-06-11T00:00:00Z", "quarantine_reason": None},
                "https://bad.example/": {"validated_at": None, "quarantine_reason": "This URL is not allowed."},
            },
        }, indent=2))
        _apply_schema(db_path)
        rc, stderr = _seed_with_source_dir(db_path, media_dir, source_dir)
        assert rc == 0, f"seeder failed: {stderr}"
        con = sqlite3.connect(db_path)
        try:
            rows = {
                url: (validated_at, quarantine)
                for url, validated_at, quarantine in con.execute(
                    "SELECT url, validated_at, quarantine_reason "
                    "FROM gallery_external_links WHERE gallery_id = 'gallery_vis_test'"
                )
            }
        finally:
            con.close()
        assert rows["https://ok.example/"] == ("2026-06-11T00:00:00Z", None)
        assert rows["https://bad.example/"] == (None, "This URL is not allowed.")
        assert rows["https://new.example/"] == (None, None)


if __name__ == "__main__":
    test_seed_fh_curator_against_fresh_schema()
    print("OK: seed_fh_curator.py produces expected rows + on-disk artifacts; idempotent on re-run")
    test_freestyle_tricks_seeder_creates_named_gallery_and_criteria_tags()
    print("OK: freestyle_tricks seeder creates FH-owned named gallery + tag-AND criteria; idempotent")
    test_gallery_external_link_verdicts_stamped()
    print("OK: gallery external-link verdicts stamped from url_verdicts.json companion")
    test_seeder_orphan_cleanup_removes_db_rows_for_deleted_sidecars()
    test_seeder_orphan_cleanup_spares_member_owned_url_ref()
    test_seeder_rejects_vimeo_sidecar_without_thumbnail_url()
    print("OK: seeder rejects vimeo sidecar without thumbnailUrl")
    test_seeder_rejects_youtube_sidecar_with_thumbnail_url()
    print("OK: seeder rejects youtube sidecar with thumbnailUrl")
    test_chilone_external_url_persists_after_seed()
    print("OK: chilone external_url persists from sidecar (3c regression)")
    test_avatars_subdir_implies_is_avatar_without_sidecar()
    print("OK: avatars/ subdir implies is_avatar without sidecar (3d positive)")
    test_avatars_subdir_rejects_sidecar()
    print("OK: avatars/ rejects sidecar (3d negative)")
    test_avatars_subdir_rejects_video_binary()
    print("OK: avatars/ rejects video binary (3d negative)")
    test_isAvatar_in_non_avatars_subdir_rejected()
    print("OK: isAvatar:true outside avatars/ rejected (3d negative)")
    test_file_paired_orphan_cleanup()
    print("OK: file-paired orphan cleanup removes rows for deleted sidecars (3e)")
    test_file_paired_malformed_sidecar_fails_fast()
    print("OK: file-paired malformed sidecar fails fast (3f)")
    test_file_paired_tag_shape_validation()
    print("OK: file-paired tag shape validation (3g)")
    test_fh_historical_person_link_converges_across_hp_reloads()
    print("OK: FH historical-person link converges across historical_persons reloads")
