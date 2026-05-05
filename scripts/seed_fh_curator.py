#!/usr/bin/env python3
"""Seed Footbag Hacky (FH) and all FH/admin-curated content.

This is the single home for everything FH owns or the admin curates. One
script, one place to look. It does, in order:

  1. Inserts the FH system member row (DD §2.8): is_system=1, NULL
     credentials, anchored at /members/footbag_hacky. Idempotent.
  2. Links FH to its historical_persons row (FK-based redirect under
     Phase 4+ read paths). Tolerant of cold-start: emits a notice when
     the matching historical row is not yet loaded.
  3. Inserts each entry from CURATOR_ITEMS (FH-owned media): demo loops,
     the FH avatar, event-pinned curator photos. Re-encodes video through
     ffmpeg + PIL with metadata stripping (DD §6.8). INSERT OR REPLACE on
     media_items so re-runs rebuild the same DB state.
  4. Seeds the /curated/freestyle_tricks/ corpus of URL-reference video
     sidecars into media_items + media_tags + media_sources.
  5. Ensures every FH-owned named gallery (member_galleries +
     member_gallery_tags) exists with its canonical metadata and
     criteria-tag set.

Idempotent: every step is INSERT OR REPLACE / DELETE-then-INSERT, so
re-running this script restores the canonical FH state without manual
cleanup.

Usage:
  python scripts/seed_fh_curator.py [--db PATH] [--media-dir PATH] [--source-dir PATH]
"""

import argparse
import hashlib
import io
import json
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
from urllib.parse import parse_qs, urlparse

from PIL import Image

# Slice 2: shared trick-slug canonicalization helper. Same import path used
# by scripts/migrate-freestyle-media-to-curated.py (one-shot migration);
# single source of truth for alias resolution prevents migration-time and
# seed-time canonicalization drift.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trick_canonicalization import canonicalize_slug, load_alias_map  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = "./database/footbag.db"
DEFAULT_MEDIA_DIR = "./data/media"
DEFAULT_SOURCE_DIR = REPO_ROOT / "curated"

# Slice 2: URL-reference freestyle media — embed-eligible hosts only.
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
VIMEO_HOSTS   = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}

# Public named galleries owned by the FH system member. Each entry below
# becomes one row in member_galleries plus N rows in member_gallery_tags
# (one per criteria tag). The gallery_id is the URL slug under /media/,
# matching the gallery_<descriptive_slug> pattern (parallel to
# event_{year}_{slug} for events). Membership is computed at query time
# against media_tags as a tag-AND match; an item appears in the gallery
# only if it carries every criteria tag.
#
# sort_order controls /media/{id} item ordering: 'upload_desc' (default),
# 'upload_asc', or 'caption_asc'. Use 'caption_asc' for ordered series
# whose captions encode the position with a zero-padded prefix
# (e.g. "01 - Title", "02 - Title").
FH_NAMED_GALLERIES = [
    {
        "id":             "gallery_curated_freestyle_tricks",
        "name":           "Curated Freestyle Tricks",
        "description":    "Reference videos for freestyle footbag tricks, curated by the IFPA.",
        "sort_order":     "upload_desc",
        "criteria_tags":  ("#curated", "#freestyle", "#trick"),
        # TT lessons live in their own dedicated gallery; suppress the
        # duplicate listing here.
        "exclude_tags":   ("#tricks_of_the_trade",),
    },
    {
        "id":             "gallery_tricks_of_the_trade",
        "name":           "Tricks of the Trade",
        "description":    (
            "Kenny Shults' 42-lesson WorldFootbag video series. "
            "Each video teaches one freestyle footbag trick."
        ),
        "sort_order":     "caption_asc",
        # `#curated` narrows membership to FH/admin-uploaded TT content,
        # so a hypothetical member upload tagged `#tricks_of_the_trade`
        # would not surface in this gallery.
        "criteria_tags":  ("#curated", "#tricks_of_the_trade"),
        "exclude_tags":   (),
    },
]

# Hardcoded manifest of curator items seeded for go-live. Append entries here
# to extend the seed (e.g. event-pinned photos, /net cartoons, tutorials,
# historical content). Each entry maps to one media_items row. video items
# have a poster companion; photo items have variants generated from the
# source image; avatar items also update members.avatar_media_id on the
# system member row.
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
    {
        "id_seed": "japan_worlds_2026",
        "media_type": "photo",
        "photo_source": "japan-worlds-2026.jpg",
        "caption": "Japan Worlds 2026",
        "tags": ["#event_2026_worlds_japan"],
    },
    {
        "id_seed": "beaver_open_2025",
        "media_type": "photo",
        "photo_source": "beaver-open-2025.jpg",
        "caption": "Beaver Open 2025",
        "tags": ["#event_2025_beaver_open"],
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


def ensure_fh_member(con: sqlite3.Connection, ts: str) -> str:
    """Insert the FH (Footbag Hacky) system member row if missing, then link
    to the matching historical_persons row. Returns the FH members.id.

    Idempotent: re-runs are no-ops on the row insert (INSERT OR IGNORE) and
    the historical-person link is guarded by IS NULL conditions. The link
    is best-effort: if no matching historical_persons row exists yet (cold
    start), we skip with a notice and let later loaders pick it up.
    """
    member_id = stable_id("member", "footbag-hacky")
    slug = "footbag_hacky"

    con.execute(
        """
        INSERT OR IGNORE INTO members (
            id, slug,
            login_email, login_email_normalized, email_verified_at,
            password_hash, password_changed_at,
            real_name, display_name, display_name_normalized,
            city, region, country, first_competition_year,
            searchable, is_admin, is_system, is_hof, hof_inducted_year,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (
            :id, :slug,
            NULL, NULL, NULL,
            NULL, NULL,
            :real_name, :display_name, :display_name_norm,
            :city, :region, :country, :first_comp_year,
            1, 0, 1, 1, 2025,
            :ts, 'seed', :ts, 'seed', 1
        )
        """,
        {
            "id": member_id,
            "slug": slug,
            "ts": ts,
            "real_name": "Footbag Hacky",
            "display_name": "Footbag Hacky",
            "display_name_norm": "footbag hacky",
            "city": "Oregon City",
            "region": "OR",
            "country": "USA",
            "first_comp_year": 1972,
        },
    )
    print("  → Ensured system member account: Footbag Hacky (is_system=1, NULL credentials)")

    # Identity-link Footbag Hacky to its historical_persons row. Under the
    # three-table identity model (DD §2.4), the canonical member↔HP link is
    # members.historical_person_id (direct FK). legacy_member_id on both
    # tables is still set for legacy_account-claim traceability, but slug
    # resolution uses the FK.
    hacky_legacy_id = "STUB_FOOTBAG_HACKY"
    con.execute(
        """INSERT OR IGNORE INTO legacy_members
             (legacy_member_id, real_name, display_name, display_name_normalized,
              country, is_hof, is_bap, imported_at, version)
           VALUES
             (:lid, 'Footbag Hacky', 'Footbag Hacky', 'footbag hacky',
              'USA', 1, 0, :ts, 1)""",
        {"lid": hacky_legacy_id, "ts": ts},
    )
    con.execute(
        "UPDATE members SET legacy_member_id = :lid WHERE id = :mid AND legacy_member_id IS NULL",
        {"lid": hacky_legacy_id, "mid": member_id},
    )
    cur = con.execute(
        """UPDATE historical_persons SET legacy_member_id = :lid
           WHERE person_name = 'Footbag Hacky' AND legacy_member_id IS NULL""",
        {"lid": hacky_legacy_id},
    )
    linked_hp = cur.rowcount
    con.execute(
        """UPDATE members
           SET historical_person_id = (
             SELECT person_id FROM historical_persons
             WHERE person_name = 'Footbag Hacky'
             LIMIT 1
           )
           WHERE id = :mid AND historical_person_id IS NULL""",
        {"mid": member_id},
    )
    if linked_hp:
        print(f"  → Linked Footbag Hacky member to historical person (legacy_member_id={hacky_legacy_id}, historical_person_id FK set)")
    else:
        print("  → No matching historical person found for Footbag Hacky (will link when results are loaded)")

    return member_id


def fh_member_id(con: sqlite3.Connection) -> str:
    row = con.execute("SELECT id FROM members WHERE is_system = 1").fetchone()
    if row is None:
        raise RuntimeError(
            "No system member row found (is_system=1). "
            "ensure_fh_member() should have been called first."
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
            moderation_status, source_filename,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, NULL, 'video', 0, ?, ?, 's3', ?, NULL, ?, ?, ?, 'active', ?, ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id,
            item["caption"], ts,
            rel_video, thumbnail_url,
            width_px, height_px,
            item["video_source"],
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
            moderation_status, source_filename,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, NULL, 'photo', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id, 1 if is_avatar else 0,
            item.get("caption"), ts,
            rel_thumb, rel_display,
            width_px, height_px,
            item["photo_source"],
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
    # Skip entries whose source bytes are not yet in /curated/. Lets the
    # manifest carry a row before its asset arrives (e.g. a freshly
    # registered event-pinned photo). Subsequent runs pick it up
    # automatically once the file lands.
    if item["media_type"] == "video":
        required = [source_dir / item["video_source"], source_dir / item["poster_source"]]
    elif item["media_type"] == "photo":
        required = [source_dir / item["photo_source"]]
    else:
        raise NotImplementedError(
            f"unsupported media_type {item['media_type']!r} for {item['id_seed']!r}"
        )
    missing = [p for p in required if not p.exists()]
    if missing:
        print(
            f"  → Skipping {item['id_seed']}: source asset(s) not yet in /curated/ "
            f"({', '.join(str(p.relative_to(source_dir)) for p in missing)})"
        )
        return

    # Compute content-aware media_id so a changed source file produces a new
    # id (and hence a new render URL, busting browser cache naturally).
    if item["media_type"] == "video":
        media_id = media_id_for_item(
            item["id_seed"],
            source_dir / item["video_source"],
            source_dir / item["poster_source"],
        )
    else:
        media_id = media_id_for_item(
            item["id_seed"], source_dir / item["photo_source"]
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


# ── Slice 2: URL-reference freestyle trick reference media ─────────────────
# The hardcoded CURATOR_ITEMS pipeline above handles file-backed binary
# (member-uploaded MP4/photos transcoded into the local-FS adapter). The
# helpers below handle URL-reference YouTube/Vimeo embeds owned by the
# system member account, sourced from /curated/freestyle_tricks/*.meta.json
# sidecars produced by scripts/migrate-freestyle-media-to-curated.py.
#
# Two pipelines coexist during the Slice 2 cutover. Phase E removes the
# legacy freestyle_media_* tables + loaders; this branch then becomes the
# only path for curator reference videos.

def _detect_platform(url: str) -> str | None:
    """Return 'youtube' / 'vimeo' / None for non-embed-eligible hosts."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return None
    if host in YOUTUBE_HOSTS:
        return "youtube"
    if host in VIMEO_HOSTS:
        return "vimeo"
    return None


def _parse_video_id(url: str, platform: str) -> str | None:
    """Extract the platform's native video id from the URL.

    YouTube: /watch?v=ID  OR  youtu.be/ID  (preserve ID; ignore ?t=N suffix).
    Vimeo:   vimeo.com/ID OR player.vimeo.com/video/ID (last numeric path segment).
    """
    parsed = urlparse(url)
    if platform == "youtube":
        if parsed.hostname == "youtu.be":
            return parsed.path.lstrip("/").split("/")[0] or None
        qs = parse_qs(parsed.query)
        if "v" in qs and qs["v"]:
            return qs["v"][0]
        return None
    if platform == "vimeo":
        for part in reversed([p for p in parsed.path.strip("/").split("/") if p]):
            if part.isdigit():
                return part
        return None
    return None


def _url_ref_media_id(url: str, platform: str) -> str:
    """Stable media_id keyed on (platform, url). Re-runs against unchanged
    sidecars produce identical ids → INSERT OR REPLACE is a no-op write."""
    raw = f"{platform}|{url}"
    return f"media_{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:24]}"


def _bootstrap_media_sources(con: sqlite3.Connection) -> int:
    """Copy freestyle_media_sources -> media_sources (FK target for sidecar
    sourceId references). INSERT OR IGNORE so re-runs are idempotent.

    Phase E will remove freestyle_media_sources; that change replaces this
    bootstrap with a sidecar-driven (or admin-UI-driven) population path.
    For Phase C parallel-run, this is the simplest atomic copy.
    """
    cur = con.execute(
        "INSERT OR IGNORE INTO media_sources (source_id, source_name, source_type, url, creator) "
        "SELECT source_id, source_name, source_type, url, creator FROM freestyle_media_sources"
    )
    return cur.rowcount


def _seed_one_sidecar(
    con: sqlite3.Connection,
    sidecar_path: Path,
    fh_id: str,
    ts: str,
    alias_map: dict[str, str],
) -> tuple[str, list[str], str, str]:
    """Read one sidecar, INSERT OR REPLACE its media_items row + media_tags.
    Returns (media_id, final_tags_list_with_curated_prepended, platform, url).
    The (platform, url) pair is the seeder's stable identity for the row;
    the outer orphan-cleanup pass uses it to delete DB rows whose sidecar
    is no longer on disk."""
    with sidecar_path.open(encoding="utf-8") as f:
        sidecar = json.load(f)

    url = sidecar["videoUrl"]
    platform = sidecar["videoPlatform"]
    if platform not in ("youtube", "vimeo"):
        raise ValueError(
            f"{sidecar_path.name}: unsupported videoPlatform={platform!r} "
            "(URL-ref curator content must be youtube or vimeo)"
        )
    video_id = _parse_video_id(url, platform)
    if not video_id:
        raise ValueError(
            f"{sidecar_path.name}: cannot parse video_id from URL={url!r}"
        )

    # Platform-conditional thumbnailUrl rule.
    #
    # YouTube thumbnails are derivable from the video id at render time
    # (https://i.ytimg.com/vi/{id}/hqdefault.jpg), so the gallery service
    # constructs them rather than reading thumbnail_url from the DB. We
    # reject any thumbnailUrl in a YouTube sidecar to keep that derivation
    # single-sourced; otherwise an out-of-sync sidecar value would silently
    # win at render time.
    #
    # Vimeo thumbnails are NOT derivable from the video id (the CDN id is
    # separate), so the sidecar must supply the public thumbnail URL. The
    # seeder stays offline-deterministic — no Vimeo oEmbed call at seed.
    sidecar_thumb = sidecar.get("thumbnailUrl")
    if platform == "youtube":
        if sidecar_thumb is not None:
            raise ValueError(
                f"{sidecar_path.name}: thumbnailUrl must NOT appear in a "
                "youtube sidecar; the gallery service derives the thumbnail "
                "from the video id at render time"
            )
        thumbnail_url = None
    else:  # vimeo
        if not isinstance(sidecar_thumb, str) or not sidecar_thumb.startswith("https://"):
            raise ValueError(
                f"{sidecar_path.name}: vimeo sidecars must include "
                "thumbnailUrl as an https:// URL (Vimeo thumbnails are not "
                "derivable from the video id)"
            )
        thumbnail_url = sidecar_thumb

    media_id = _url_ref_media_id(url, platform)
    # Per CMP §"Migration of James's existing 47 assets" item 3: title is
    # the closest existing column for the legacy media_assets.title field.
    # Sidecar.creator is preserved on disk for future re-import but is not
    # written here (no equivalent column; per-asset creator info for record
    # clips is currently dropped at seed time per CMP §"Column equivalences").
    caption = sidecar.get("title") or None
    source_id = sidecar.get("sourceId") or None
    start_seconds = sidecar.get("startSeconds")
    end_seconds   = sidecar.get("endSeconds")

    # ── #curated auto-prepend at write time (CMP enforcement) ─────────────
    raw_tags: list[str] = list(sidecar.get("tags", []))
    if any(t.lower() == "#curated" for t in raw_tags):
        raise ValueError(
            f"{sidecar_path.name}: '#curated' must NOT appear in sidecar tags; "
            "the seeder auto-prepends it at write time"
        )
    # Defense-in-depth: re-canonicalize each trick-slug tag through the
    # shared helper. Migration already canonicalized, but if a sidecar is
    # hand-written or imported from elsewhere this guarantees the same
    # canonical-only-tags invariant the gallery query relies on.
    canon_tags: list[str] = []
    for t in raw_tags:
        if not t.startswith("#"):
            raise ValueError(f"{sidecar_path.name}: tag {t!r} missing '#' prefix")
        slug = t[1:]
        canon_tags.append("#" + canonicalize_slug(slug, alias_map))
    final_tags = sorted({"#curated", *canon_tags})

    # INSERT OR REPLACE: ON DELETE CASCADE on media_tags.media_id wipes
    # prior tag rows for this media_id; we re-insert below.
    # Curator URL-ref content is uploaded as DETACHED per USER_STORIES.md
    # §A_Upload_Curated_Media (gallery_id = NULL). The named gallery
    # row at gallery_curated_freestyle_tricks is a URL bookmark; the
    # content that appears on that page is computed dynamically by
    # hashtag-AND match (per DATA_MODEL.md §"hashtag-driven coupling"
    # and USER_STORIES.md §V_View_Gallery), not by direct gallery_id FK.
    con.execute(
        """
        INSERT OR REPLACE INTO media_items (
            id, uploader_member_id, gallery_id,
            media_type, is_avatar, caption, uploaded_at,
            video_platform, video_id, video_url, thumbnail_url,
            source_id, start_seconds, end_seconds,
            moderation_status, source_filename,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, NULL, 'video', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id,
            caption, ts,
            platform, video_id, url, thumbnail_url,
            source_id, start_seconds, end_seconds,
            ts, ts,
        ),
    )

    for tag_display in final_tags:
        tid = tag_id_for(con, tag_display, ts)
        media_tag_id = stable_id("media_tag", media_id, tag_display)
        con.execute(
            """
            INSERT INTO media_tags (id, media_id, tag_id, tag_display, created_at, created_by, updated_at, updated_by, version)
            VALUES (?, ?, ?, ?, ?, 'seed', ?, 'seed', 1)
            """,
            (media_tag_id, media_id, tid, tag_display, ts, ts),
        )

    return media_id, final_tags, platform, url


def ensure_named_gallery(
    con: sqlite3.Connection,
    fh_id: str,
    ts: str,
    *,
    gallery_id: str,
    name: str,
    description: str,
    sort_order: str,
    criteria_tags: tuple,
    exclude_tags: tuple = (),
) -> None:
    """Ensure an FH-owned named gallery row exists in member_galleries with
    the given metadata, AND its criteria-tag and exclude-tag sets match
    `criteria_tags` / `exclude_tags` exactly. An item appears in the
    gallery iff it carries every criteria tag AND no exclude tag.

    INSERT OR REPLACE on the parent so re-runs pick up metadata tweaks;
    DELETE-then-INSERT on the tag rows so set changes in this file
    propagate cleanly without leaving orphan rows.
    """
    con.execute(
        """
        INSERT OR REPLACE INTO member_galleries (
            id, owner_member_id, name, description, is_default, sort_order,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, ?, ?, 0, ?, ?, 'seed', ?, 'seed', 1)
        """,
        (gallery_id, fh_id, name, description, sort_order, ts, ts),
    )

    con.execute(
        "DELETE FROM member_gallery_tags WHERE gallery_id = ?",
        (gallery_id,),
    )
    for tag_display in criteria_tags:
        tid = tag_id_for(con, tag_display, ts)
        con.execute(
            """
            INSERT INTO member_gallery_tags (
                gallery_id, tag_id, created_at, created_by
            ) VALUES (?, ?, ?, 'seed')
            """,
            (gallery_id, tid, ts),
        )

    con.execute(
        "DELETE FROM member_gallery_exclude_tags WHERE gallery_id = ?",
        (gallery_id,),
    )
    for tag_display in exclude_tags:
        tid = tag_id_for(con, tag_display, ts)
        con.execute(
            """
            INSERT INTO member_gallery_exclude_tags (
                gallery_id, tag_id, created_at, created_by
            ) VALUES (?, ?, ?, 'seed')
            """,
            (gallery_id, tid, ts),
        )


def ensure_fh_named_galleries(
    con: sqlite3.Connection, fh_id: str, ts: str
) -> None:
    """Ensure every gallery declared in FH_NAMED_GALLERIES exists. One call
    per declared gallery; helper handles the parent + criteria-tag rows
    + exclude-tag rows.
    """
    for g in FH_NAMED_GALLERIES:
        ensure_named_gallery(
            con, fh_id, ts,
            gallery_id=g["id"],
            name=g["name"],
            description=g["description"],
            sort_order=g["sort_order"],
            criteria_tags=g["criteria_tags"],
            exclude_tags=g.get("exclude_tags", ()),
        )
    print(f"  → Ensured {len(FH_NAMED_GALLERIES)} FH-owned named gallery row(s).")


def seed_freestyle_tricks_sidecars(
    con: sqlite3.Connection, fh_id: str, source_dir: Path, ts: str
) -> int:
    """Seed every /curated/freestyle_tricks/*.meta.json sidecar into
    media_items + media_tags + media_sources. Returns count of sidecars seeded.
    """
    sidecar_dir = source_dir / "freestyle_tricks"
    if not sidecar_dir.is_dir():
        return 0
    files = sorted(sidecar_dir.glob("*.meta.json"))
    if not files:
        return 0

    sources_added = _bootstrap_media_sources(con)
    if sources_added:
        print(f"  → Bootstrapped media_sources: {sources_added} row(s) copied from freestyle_media_sources")

    alias_map = load_alias_map(con)

    seen_pairs: set[tuple[str, str]] = set()
    n = 0
    for path in files:
        _, _, platform, url = _seed_one_sidecar(con, path, fh_id, ts, alias_map)
        seen_pairs.add((platform, url))
        n += 1
    print(f"  → Seeded {n} freestyle reference video(s) from /curated/freestyle_tricks/")

    # Orphan cleanup: delete URL-ref rows whose sidecar is no longer on
    # disk. /curated/ is the source of truth; this is what makes admin
    # deletes (which unlink the sidecar) survive the next seeder run.
    # SQLite has no tuple-IN; concat (platform || '|' || url) is the
    # standard workaround. Identity matches _url_ref_media_id().
    placeholders = ",".join(["?"] * len(seen_pairs)) if seen_pairs else "''"
    seen_keys = [f"{p}|{u}" for (p, u) in seen_pairs]
    cur = con.execute(
        f"""
        DELETE FROM media_items
        WHERE video_platform IN ('youtube','vimeo')
          AND (video_platform || '|' || video_url) NOT IN ({placeholders})
        """,
        seen_keys,
    )
    if cur.rowcount:
        print(f"  → Removed {cur.rowcount} orphaned URL-ref row(s) (sidecar deleted from /curated/)")

    return n


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
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA foreign_keys = ON")
    try:
        fh_id = ensure_fh_member(con, ts)
        for item in CURATOR_ITEMS:
            seed_item(con, item, fh_id, source_dir, media_dir, ts)
        n_sidecars = seed_freestyle_tricks_sidecars(con, fh_id, source_dir, ts)
        ensure_fh_named_galleries(con, fh_id, ts)
        con.commit()
        print(
            f"  → FH curator seed complete: FH member, {len(CURATOR_ITEMS)} curator items, "
            f"{n_sidecars} reference videos, {len(FH_NAMED_GALLERIES)} named galleries."
        )
    finally:
        con.close()


if __name__ == "__main__":
    main()
