#!/usr/bin/env python3
"""Seed curator-owned media into the platform SQLite database + media dir.

Curator items (DD §2.8) live as `media_items` rows owned by the system
member (Footbag Hacky), with bytes stored in the media adapter's local-FS
or S3 backend. This script handles the local-FS path; a separate
`aws s3 sync` step (operational, in deploy scripts) uploads the directory
to S3 for staging/prod.

For each item in MANIFEST:
  - Re-encode the video through ffmpeg with the canonical malware-stripping
    options (DD §6.8 Curator Media Processing).
  - Re-encode the poster through PIL with explicit metadata stripping.
  - Write outputs to FOOTBAG_MEDIA_DIR under the path-structure keys.
  - INSERT OR REPLACE the media_items row with uploader_member_id = FH.
  - DELETE existing media_tags + INSERT fresh tags.

Idempotent: re-running rebuilds the same DB state and overwrites the
same files. Stable IDs derived from the manifest entry name.

Usage:
  python legacy_data/scripts/seed_curator_media.py [--db PATH] [--media-dir PATH] [--source-dir PATH]
"""

import argparse
import hashlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = "./database/footbag.db"
DEFAULT_MEDIA_DIR = "./data/media"
DEFAULT_SOURCE_DIR = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "media"

# Hardcoded manifest of curator items seeded for go-live. Append entries here
# to extend the seed (e.g., Japan Worlds 2026 photo, /net cartoons,
# /footbag-heroes cartoons, tutorials, historical content). Each entry maps
# to one media_items row. video items have a poster companion; photo items
# have variants generated from the source image; avatar items also update
# members.avatar_media_id on the system member row.
CURATOR_ITEMS = [
    {
        "id_seed": "fh_avatar",
        "media_type": "photo",
        "is_avatar": True,
        "photo_source": "fh-avatar.jpg",
        "caption": None,
        "tags": [],
    },
    {
        "id_seed": "demo_freestyle",
        "media_type": "video",
        "video_source": "demo-freestyle.mp4",
        "poster_source": "demo-freestyle-poster.jpg",
        "caption": "Demonstration of freestyle footbag",
        "tags": ["#demo_freestyle"],
    },
    {
        "id_seed": "demo_net",
        "media_type": "video",
        "video_source": "demo-net.mp4",
        "poster_source": "demo-net-poster.jpg",
        "caption": "Demonstration of footbag net",
        "tags": ["#demo_net"],
    },
]

# ── ffmpeg options: canonical malware-stripping pipeline (DD §6.8) ────────
FFMPEG_OPTS = [
    "-map", "0:v",
    "-map", "0:a?",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-c:v", "libx264",
    "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y",
]

# ── PIL JPEG settings: parallel to Sharp pipeline (DD §6.8) ───────────────
JPEG_QUALITY = 85
THUMB_SIZE = 300
DISPLAY_WIDTH = 800


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def media_id_for_item(id_seed: str, *content_paths: Path) -> str:
    """Derive a content-aware stable media_id.

    Same id_seed + same source bytes → same id (idempotent).
    Different source bytes → new id → new render URL → browser refetches.
    """
    sha = hashlib.sha1()
    sha.update(id_seed.encode("utf-8"))
    for path in content_paths:
        if path is None:
            continue
        sha.update(b"||")
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                sha.update(chunk)
    return f"media_{sha.hexdigest()[:24]}"


def transcode_video(input_path: Path, output_path: Path) -> None:
    """Re-encode video through ffmpeg with malware-stripping options."""
    cmd = ["ffmpeg", "-i", str(input_path), *FFMPEG_OPTS, str(output_path)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed for {input_path}: exit {result.returncode}\n"
            f"stderr: {result.stderr[-2000:]}"
        )


def process_poster(input_path: Path, output_path: Path, max_width: int) -> tuple[int, int]:
    """Re-encode JPEG through PIL with explicit metadata stripping. Returns (width, height)."""
    with Image.open(input_path) as img:
        rgb = img.convert("RGB")
        w, h = rgb.size
        if w > max_width:
            new_h = round(h * (max_width / w))
            rgb = rgb.resize((max_width, new_h))
            w, h = max_width, new_h
        # No `exif=`, no `icc_profile=`: PIL drops both by default. XMP also
        # not preserved unless explicitly passed. The result is malware-stripped.
        rgb.save(output_path, "JPEG", quality=JPEG_QUALITY)
        return w, h


def process_thumb(input_path: Path, output_path: Path, size: int) -> None:
    """Re-encode JPEG to a square thumbnail through PIL."""
    with Image.open(input_path) as img:
        rgb = img.convert("RGB")
        # Cover-crop to square then resize, parallel to sharp's `fit: 'cover'`.
        side = min(rgb.size)
        left = (rgb.size[0] - side) // 2
        top = (rgb.size[1] - side) // 2
        cropped = rgb.crop((left, top, left + side, top + side))
        thumbnail = cropped.resize((size, size))
        thumbnail.save(output_path, "JPEG", quality=JPEG_QUALITY)


def fh_member_id(con: sqlite3.Connection) -> str:
    row = con.execute("SELECT id FROM members WHERE is_system = 1").fetchone()
    if row is None:
        raise RuntimeError(
            "No system member row found (is_system=1). Run "
            "`python legacy_data/scripts/seed_members.py` first."
        )
    return row[0]


def tag_id_for(con: sqlite3.Connection, tag_display: str, ts: str) -> str:
    """Look up or create a tag row, returning its id."""
    if not tag_display.startswith("#"):
        raise ValueError(f"tag_display must start with '#': {tag_display!r}")
    norm = tag_display.lower()  # Schema CHECK requires leading '#' on tag_normalized.
    existing = con.execute(
        "SELECT id FROM tags WHERE tag_normalized = ?", (norm,)
    ).fetchone()
    if existing:
        return existing[0]
    new_id = stable_id("tag", norm)
    con.execute(
        """
        INSERT INTO tags (id, tag_normalized, tag_display, created_at, created_by, updated_at, updated_by, version)
        VALUES (?, ?, ?, ?, 'seed', ?, 'seed', 1)
        """,
        (new_id, norm, tag_display, ts, ts),
    )
    return new_id


def seed_video_item(
    con: sqlite3.Connection,
    item: dict,
    media_id: str,
    fh_id: str,
    source_dir: Path,
    media_dir: Path,
    ts: str,
) -> None:
    # Path structure (DD §6.8): {member-id}/detached/{media-id}-video.mp4
    # and {media-id}-poster-{variant}.jpg
    rel_video = f"{fh_id}/detached/{media_id}-video.mp4"
    rel_poster_display = f"{fh_id}/detached/{media_id}-poster-display.jpg"
    rel_poster_thumb = f"{fh_id}/detached/{media_id}-poster-thumb.jpg"

    abs_video = media_dir / rel_video
    abs_poster_display = media_dir / rel_poster_display
    abs_poster_thumb = media_dir / rel_poster_thumb

    abs_video.parent.mkdir(parents=True, exist_ok=True)

    # Re-encode video.
    print(f"  → Transcoding video for {item['id_seed']}...")
    transcode_video(source_dir / item["video_source"], abs_video)

    # Re-encode poster (display + thumb variants).
    print(f"  → Processing poster for {item['id_seed']}...")
    width_px, height_px = process_poster(
        source_dir / item["poster_source"], abs_poster_display, DISPLAY_WIDTH
    )
    process_thumb(source_dir / item["poster_source"], abs_poster_thumb, THUMB_SIZE)

    # video_id stores the S3 key (render code constructs `/media/{video_id}`
    # via the adapter). video_url stays NULL per the s3 branch of the video
    # CHECK introduced for system-account video bytes (DD §1.5 / §6.8).
    thumbnail_url = f"/media/{rel_poster_display}"

    con.execute(
        """
        INSERT OR REPLACE INTO media_items (
            id, uploader_member_id, gallery_id,
            media_type, is_avatar, caption, uploaded_at,
            video_platform, video_id, video_url, thumbnail_url,
            width_px, height_px,
            moderation_status,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, NULL, 'video', 0, ?, ?, 's3', ?, NULL, ?, ?, ?, 'active', ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id,
            item["caption"], ts,
            rel_video, thumbnail_url,
            width_px, height_px,
            ts, ts,
        ),
    )


def seed_photo_item(
    con: sqlite3.Connection,
    item: dict,
    media_id: str,
    fh_id: str,
    source_dir: Path,
    media_dir: Path,
    ts: str,
) -> None:
    is_avatar = bool(item.get("is_avatar"))

    # Path structure (DD §6.8): avatars use {member-id}/avatars/{variant}.jpg;
    # detached non-avatar photos use {member-id}/detached/{media-id}-{variant}.jpg.
    if is_avatar:
        rel_thumb = f"{fh_id}/avatars/thumb.jpg"
        rel_display = f"{fh_id}/avatars/display.jpg"
    else:
        rel_thumb = f"{fh_id}/detached/{media_id}-thumb.jpg"
        rel_display = f"{fh_id}/detached/{media_id}-display.jpg"

    abs_thumb = media_dir / rel_thumb
    abs_display = media_dir / rel_display
    abs_thumb.parent.mkdir(parents=True, exist_ok=True)

    print(f"  → Processing photo for {item['id_seed']} (avatar={is_avatar})...")
    width_px, height_px = process_poster(
        source_dir / item["photo_source"], abs_display, DISPLAY_WIDTH
    )
    process_thumb(source_dir / item["photo_source"], abs_thumb, THUMB_SIZE)

    con.execute(
        """
        INSERT OR REPLACE INTO media_items (
            id, uploader_member_id, gallery_id,
            media_type, is_avatar, caption, uploaded_at,
            s3_key_thumb, s3_key_display,
            width_px, height_px,
            moderation_status,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, NULL, 'photo', ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id, 1 if is_avatar else 0,
            item.get("caption"), ts,
            rel_thumb, rel_display,
            width_px, height_px,
            ts, ts,
        ),
    )

    if is_avatar:
        # Point the system member's avatar pointer at the new row. INSERT OR
        # REPLACE above can fire ON DELETE SET NULL if the old row existed;
        # this UPDATE re-sets the pointer so re-runs are idempotent.
        con.execute(
            "UPDATE members SET avatar_media_id = ? WHERE id = ? AND is_system = 1",
            (media_id, fh_id),
        )


def cleanup_prior_for_item(
    con: sqlite3.Connection, item: dict, fh_id: str
) -> None:
    """Delete any existing FH-owned row that represents this slot.

    Avatar items: delete the prior FH avatar (any). The members.avatar_media_id
    FK auto-nulls via ON DELETE SET NULL; we re-set it after the new INSERT.

    Tagged items (e.g. demo loops): delete prior FH-owned media tagged with
    the item's first tag. Disk artifacts under the prior media_id are left
    in place (harmless orphans in dev).
    """
    if item.get("is_avatar"):
        con.execute(
            "DELETE FROM media_items WHERE uploader_member_id = ? AND is_avatar = 1",
            (fh_id,),
        )
    elif item.get("tags"):
        slot_tag = item["tags"][0].lower()
        con.execute(
            """
            DELETE FROM media_items
            WHERE id IN (
                SELECT mi.id
                FROM media_items mi
                JOIN media_tags mt ON mt.media_id = mi.id
                JOIN tags t ON t.id = mt.tag_id
                WHERE mi.uploader_member_id = ? AND t.tag_normalized = ?
            )
            """,
            (fh_id, slot_tag),
        )


def seed_item(
    con: sqlite3.Connection,
    item: dict,
    fh_id: str,
    source_dir: Path,
    media_dir: Path,
    ts: str,
) -> None:
    # Compute content-aware media_id so a changed source file produces a new
    # id (and hence a new render URL, busting browser cache naturally).
    if item["media_type"] == "video":
        media_id = media_id_for_item(
            item["id_seed"],
            source_dir / item["video_source"],
            source_dir / item["poster_source"],
        )
    elif item["media_type"] == "photo":
        media_id = media_id_for_item(
            item["id_seed"], source_dir / item["photo_source"]
        )
    else:
        raise NotImplementedError(
            f"unsupported media_type {item['media_type']!r} for {item['id_seed']!r}"
        )

    cleanup_prior_for_item(con, item, fh_id)

    if item["media_type"] == "video":
        seed_video_item(con, item, media_id, fh_id, source_dir, media_dir, ts)
    else:
        seed_photo_item(con, item, media_id, fh_id, source_dir, media_dir, ts)

    # cleanup_prior_for_item deleted any prior media_tags rows via ON DELETE
    # CASCADE on media_tags.media_id, so we can simply INSERT for the new id.
    for tag_display in item["tags"]:
        tid = tag_id_for(con, tag_display, ts)
        media_tag_id = stable_id("media_tag", media_id, tag_display)
        con.execute(
            """
            INSERT INTO media_tags (id, media_id, tag_id, tag_display, created_at, created_by, updated_at, updated_by, version)
            VALUES (?, ?, ?, ?, ?, 'seed', ?, 'seed', 1)
            """,
            (media_tag_id, media_id, tid, tag_display, ts, ts),
        )

    print(f"  → Seeded {item['id_seed']} (media_id={media_id}, tags={item['tags']})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=None, help="Path to SQLite database")
    parser.add_argument("--media-dir", default=None, help="Path to media output directory")
    parser.add_argument("--source-dir", default=None, help="Path to curator source assets directory")
    args = parser.parse_args()

    db_path = args.db or os.environ.get("FOOTBAG_DB_PATH", DEFAULT_DB)
    media_dir = Path(args.media_dir or os.environ.get("FOOTBAG_MEDIA_DIR", DEFAULT_MEDIA_DIR))
    source_dir = Path(args.source_dir or DEFAULT_SOURCE_DIR)
    ts = now_iso()

    if not source_dir.is_dir():
        sys.exit(f"ERROR: source-dir {source_dir} does not exist")

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")
    try:
        fh_id = fh_member_id(con)
        for item in CURATOR_ITEMS:
            seed_item(con, item, fh_id, source_dir, media_dir, ts)
        con.commit()
        print(f"  → Curator media seed complete: {len(CURATOR_ITEMS)} items.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
