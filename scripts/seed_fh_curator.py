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
  5. Loads each gallery JSON sidecar from /curated/galleries/ and
     ensures FH-owned named gallery rows (member_galleries +
     member_gallery_tags + member_gallery_exclude_tags) match.
     Galleries on disk are the source of truth: FH-owned rows whose
     sidecar was deleted are removed at this step. Member-owned
     gallery rows (owner_member_id != FH) are never touched here.

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
import re
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

# Public named galleries owned by the FH system member are defined as
# JSON sidecars under /curated/galleries/<slug>.json (one file per
# gallery). The seeder reads them via _load_named_gallery_sidecars()
# during the gallery-seed step. /curated/galleries/ is the source of
# truth: an FH gallery row whose sidecar is deleted is removed from
# the DB on the next seed (see ensure_fh_named_galleries).
#
# Sidecar schema (camelCase, matching /curated/freestyle_tricks/*.meta.json):
#   id            "gallery_<descriptive_slug>" — public URL under /media/
#   name          1..150 chars
#   description   0..1000 chars
#   sortOrder     'upload_desc' | 'upload_asc' | 'caption_asc'
#                 ('caption_asc' for ordered series whose captions encode
#                  the position with a zero-padded prefix)
#   criteriaTags  non-empty list of '#'-prefixed lowercase tag strings
#                 (an item appears in the gallery iff it carries every
#                  criteria tag)
#   excludeTags   list of '#'-prefixed lowercase tag strings, disjoint
#                 from criteriaTags (an item carrying any of these is
#                  filtered out)
#   externalLinks list of {label, url, sortOrder} objects rendered
#                 alongside the gallery on its public view. May be
#                 empty. Cross-language parity with the TypeScript
#                 GallerySidecarData interface in
#                 src/lib/curatorGallerySidecar.ts.
#
# Filename rule: <slug>.json where <slug> = id with the 'gallery_'
# prefix stripped. So id 'gallery_curated_freestyle_tricks' lives in
# /curated/galleries/curated_freestyle_tricks.json.
GALLERY_ID_RE = re.compile(r"^gallery_[a-z0-9_]+$")
GALLERY_SORT_ORDERS = ("upload_desc", "upload_asc", "caption_asc")
GALLERY_NAME_MAX = 150
GALLERY_DESCRIPTION_MAX = 1000
GALLERY_LINK_LABEL_MAX = 80
GALLERY_LINK_URL_MAX = 2048

# All FH curator items are file-paired sidecars under
# /curated/{category}/<stem>.meta.json (read by seed_file_paired_sidecars).
# The avatar lives at /curated/avatars/<stem>.<ext> with no sidecar
# (the avatars/ subdir is the avatar marker); demo loops live in
# /curated/landing/, event photos in /curated/events/. This list is
# kept as an extension hook for future items that intentionally have
# no source binary on disk (e.g. a placeholder slot wiring up a
# surface ahead of asset delivery), but has none today.
CURATOR_ITEMS: list[dict] = []

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

    # uploaded_at reflects the source binary's mtime so the admin list's
    # date sort survives a --reset rebuild — items added recently to
    # /curated/ stay newest-first instead of all collapsing to the seeder
    # run's `ts`. ts continues to drive created_at / updated_at (those are
    # row-bookkeeping fields about the DB write itself).
    source_video_path = source_dir / item["video_source"]
    uploaded_at = datetime.fromtimestamp(
        source_video_path.stat().st_mtime, tz=timezone.utc,
    ).isoformat()

    # Re-encode video.
    print(f"  → Transcoding video for {item['id_seed']}...")
    transcode_video(source_dir / item["video_source"], abs_video)

    # Re-encode poster (display + thumb variants).
    print(f"  → Processing poster for {item['id_seed']}...")
    width_px, height_px = process_poster(
        source_dir / item["poster_source"], abs_poster_display, DISPLAY_WIDTH
    )
    process_thumb(source_dir / item["poster_source"], abs_poster_thumb, THUMB_SIZE)

    # video_id stores the storage key. The adapter (`MediaStorageAdapter`)
    # owns URL construction; `constructURL(key)` returns `/media-store/{key}`
    # which matches the static-file route mounted at `/media-store/*` in
    # `app.ts` (and the prod CloudFront cache behavior). video_url stays
    # NULL per the s3 branch of the video CHECK for system-account video
    # bytes (DD §1.5 / §6.8).
    thumbnail_url = f"/media-store/{rel_poster_display}"

    con.execute(
        """
        INSERT OR REPLACE INTO media_items (
            id, uploader_member_id,
            media_type, is_avatar, caption, uploaded_at,
            video_platform, video_id, video_url, thumbnail_url,
            width_px, height_px,
            moderation_status, source_filename,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, 'video', 0, ?, ?, 's3', ?, NULL, ?, ?, ?, 'active', ?, ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id,
            item["caption"], uploaded_at,
            rel_video, thumbnail_url,
            width_px, height_px,
            # Basename only: source_filename is the slot identity used by
            # cleanup_prior_for_item and runtime callers like
            # loadCuratorDemoVideo('demo-freestyle.mp4'); the subdir prefix
            # is implementation detail of the on-disk layout.
            Path(item["video_source"]).name,
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

    # See seed_video_item for the rationale on uploaded_at vs ts.
    source_photo_path = source_dir / item["photo_source"]
    uploaded_at = datetime.fromtimestamp(
        source_photo_path.stat().st_mtime, tz=timezone.utc,
    ).isoformat()

    con.execute(
        """
        INSERT OR REPLACE INTO media_items (
            id, uploader_member_id,
            media_type, is_avatar, caption, uploaded_at,
            s3_key_thumb, s3_key_display,
            width_px, height_px,
            moderation_status, source_filename,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, 'photo', ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 'seed', ?, 'seed', 1)
        """,
        (
            media_id, fh_id, 1 if is_avatar else 0,
            item.get("caption"), uploaded_at,
            rel_thumb, rel_display,
            width_px, height_px,
            # Basename only — see seed_video_item for rationale.
            Path(item["photo_source"]).name,
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

    Non-avatar items: delete prior FH-owned row(s) with the same
    source_filename basename. Slot identity is the binary's filename, not
    a tag — tags are atomic and shared across items (e.g. #demo applies
    to multiple demo videos), so they cannot uniquely identify a slot.
    Disk artifacts under the prior media_id are left in place (harmless
    orphans in dev).
    """
    if item.get("is_avatar"):
        con.execute(
            "DELETE FROM media_items WHERE uploader_member_id = ? AND is_avatar = 1",
            (fh_id,),
        )
        return
    source = item.get("video_source") or item.get("photo_source")
    if not source:
        return
    slot_basename = Path(source).name
    con.execute(
        "DELETE FROM media_items WHERE uploader_member_id = ? AND source_filename = ?",
        (fh_id, slot_basename),
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
    # Avatars carry exactly one tag, the `#by_<owner_slug>` uploader
    # marker (FH avatar → `#by_footbag_hacky`). Mirrors the avatarService
    # rule on the TS side; the marker exists so the avatar surfaces in
    # the owner's personal gallery via the same tag-AND match every other
    # member upload uses.
    # Non-avatar curator items auto-include `#curated` (the FH/admin
    # uploader marker per SC CuratorMediaService entry). Mirrors the rule
    # in _seed_one_sidecar and seed_file_paired_sidecars, plus
    # applyTagsForCurator on the TS service. Idempotent: a hand-curated
    # entry that already includes `#curated` collapses to one occurrence
    # via the set.
    if item.get("is_avatar"):
        # FH is the only avatar in CURATOR_ITEMS; hardcoded slug matches
        # the value ensure_fh_member sets on the members row.
        insert_tags: list[str] = ["#by_footbag_hacky"]
    else:
        insert_tags = sorted({"#curated", *item["tags"]})
    for tag_display in insert_tags:
        tid = tag_id_for(con, tag_display, ts)
        media_tag_id = stable_id("media_tag", media_id, tag_display)
        con.execute(
            """
            INSERT INTO media_tags (id, media_id, tag_id, tag_display, created_at, created_by, updated_at, updated_by, version)
            VALUES (?, ?, ?, ?, ?, 'seed', ?, 'seed', 1)
            """,
            (media_tag_id, media_id, tid, tag_display, ts, ts),
        )

    print(f"  → Seeded {item['id_seed']} (media_id={media_id}, tags={insert_tags})")


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
    """Populate media_sources (FK target for freestyle_tricks sidecar
    sourceId references). Reads the canonical CSV at
    legacy_data/inputs/curated/media/media_sources.csv directly so the
    seeder is self-sufficient on a fresh schema (does not require the
    legacy data load to run first). INSERT OR IGNORE so re-runs and
    coexistence with the legacy loader (script 21) are idempotent.

    Cross-tree dependency on legacy_data/ is acceptable as a temporary
    measure: Phase E removes freestyle_media_sources entirely and
    replaces this bootstrap with a sidecar-driven (or admin-UI-driven)
    population path under /curated/.

    Falls back to the legacy table if the CSV is missing (e.g. an
    operator running against a checkout without the legacy_data
    subtree populated).
    """
    csv_path = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "media" / "media_sources.csv"
    if csv_path.exists():
        import csv as _csv
        rows: list[dict] = []
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = _csv.DictReader(f)
            for row in reader:
                rows.append({
                    "source_id":   row["source_id"].strip(),
                    "source_name": row["source_name"].strip(),
                    "source_type": row["source_type"].strip(),
                    "url":         (row.get("url") or "").strip() or None,
                    "creator":     (row.get("creator") or "").strip() or None,
                })
        cur = con.executemany(
            "INSERT OR IGNORE INTO media_sources "
            "(source_id, source_name, source_type, url, creator) "
            "VALUES (:source_id, :source_name, :source_type, :url, :creator)",
            rows,
        )
        return cur.rowcount
    # Legacy fallback: copy from freestyle_media_sources (which itself was
    # loaded from the same CSV by legacy_data script 21).
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
    # Curator URL-ref content surfaces in the named gallery at
    # gallery_curated_freestyle_tricks purely via hashtag-AND match
    # against the gallery's criteria-tag set (per DATA_MODEL.md
    # §"hashtag-driven coupling" and USER_STORIES.md §V_View_Gallery).
    con.execute(
        """
        INSERT OR REPLACE INTO media_items (
            id, uploader_member_id,
            media_type, is_avatar, caption, uploaded_at,
            video_platform, video_id, video_url, thumbnail_url,
            source_id, start_seconds, end_seconds,
            moderation_status, source_filename,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, 'video', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, 'seed', ?, 'seed', 1)
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


def _load_named_gallery_sidecars(source_dir: Path) -> list[dict]:
    """Load every gallery JSON sidecar from /curated/galleries/, validate
    each, and return a list of dicts in the shape ensure_named_gallery
    expects (gallery_id, name, description, sort_order, criteria_tags,
    exclude_tags). Sidecars are read in lexical filename order so the
    seed log is stable.

    Validation mirrors the rules enforced by curatorMediaService.updateGallery
    on the TS side; a sidecar accepted here is loadable end-to-end and a
    sidecar accepted there is loadable here. Cross-language drift in this
    contract would silently corrupt the gallery seed.
    """
    galleries_dir = source_dir / "galleries"
    if not galleries_dir.is_dir():
        sys.exit(
            f"ERROR: {galleries_dir} does not exist. "
            "FH gallery definitions live there as JSON sidecars."
        )

    files = sorted(galleries_dir.glob("*.json"))
    loaded: list[dict] = []

    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as err:
            sys.exit(f"ERROR: {path}: malformed JSON: {err}")
        if not isinstance(data, dict):
            sys.exit(f"ERROR: {path}: top-level value must be a JSON object")

        gallery_id = data.get("id")
        if not isinstance(gallery_id, str) or not GALLERY_ID_RE.match(gallery_id):
            sys.exit(
                f"ERROR: {path}: id must match {GALLERY_ID_RE.pattern}; "
                f"got {gallery_id!r}"
            )
        expected_stem = gallery_id[len("gallery_"):]
        if path.stem != expected_stem:
            sys.exit(
                f"ERROR: {path}: filename stem {path.stem!r} must match "
                f"id-with-'gallery_'-stripped ({expected_stem!r})"
            )

        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            sys.exit(f"ERROR: {path}: name is required and must be non-empty")
        if len(name) > GALLERY_NAME_MAX:
            sys.exit(
                f"ERROR: {path}: name must be {GALLERY_NAME_MAX} characters or fewer"
            )

        description = data.get("description", "")
        if not isinstance(description, str):
            sys.exit(f"ERROR: {path}: description must be a string")
        if len(description) > GALLERY_DESCRIPTION_MAX:
            sys.exit(
                f"ERROR: {path}: description must be "
                f"{GALLERY_DESCRIPTION_MAX} characters or fewer"
            )

        sort_order = data.get("sortOrder")
        if sort_order not in GALLERY_SORT_ORDERS:
            sys.exit(
                f"ERROR: {path}: sortOrder must be one of "
                f"{list(GALLERY_SORT_ORDERS)}; got {sort_order!r}"
            )

        criteria_tags = data.get("criteriaTags")
        if not isinstance(criteria_tags, list) or not criteria_tags:
            sys.exit(f"ERROR: {path}: criteriaTags must be a non-empty list")
        exclude_tags = data.get("excludeTags", [])
        if not isinstance(exclude_tags, list):
            sys.exit(f"ERROR: {path}: excludeTags must be a list")

        for label, tags in (("criteriaTags", criteria_tags), ("excludeTags", exclude_tags)):
            seen: set[str] = set()
            for tag in tags:
                if not isinstance(tag, str) or not tag.startswith("#"):
                    sys.exit(
                        f"ERROR: {path}: every {label} entry must be a "
                        f"'#'-prefixed string; got {tag!r}"
                    )
                if tag != tag.lower():
                    sys.exit(
                        f"ERROR: {path}: tag {tag!r} in {label} must be lowercase"
                    )
                if tag in seen:
                    sys.exit(f"ERROR: {path}: duplicate {label} entry {tag!r}")
                seen.add(tag)
        overlap = set(criteria_tags) & set(exclude_tags)
        if overlap:
            sys.exit(
                f"ERROR: {path}: tag(s) appear in both criteriaTags and "
                f"excludeTags: {sorted(overlap)}"
            )

        external_links = data.get("externalLinks", [])
        if not isinstance(external_links, list):
            sys.exit(f"ERROR: {path}: externalLinks must be a list")
        validated_links: list[dict] = []
        for i, link in enumerate(external_links):
            if not isinstance(link, dict):
                sys.exit(f"ERROR: {path}: externalLinks[{i}] must be an object")
            label = link.get("label")
            if not isinstance(label, str) or not label.strip():
                sys.exit(
                    f"ERROR: {path}: externalLinks[{i}].label is required and must be non-empty"
                )
            if len(label) > GALLERY_LINK_LABEL_MAX:
                sys.exit(
                    f"ERROR: {path}: externalLinks[{i}].label must be "
                    f"{GALLERY_LINK_LABEL_MAX} characters or fewer"
                )
            url = link.get("url")
            if not isinstance(url, str) or not url.strip():
                sys.exit(
                    f"ERROR: {path}: externalLinks[{i}].url is required and must be non-empty"
                )
            if len(url) > GALLERY_LINK_URL_MAX:
                sys.exit(
                    f"ERROR: {path}: externalLinks[{i}].url must be "
                    f"{GALLERY_LINK_URL_MAX} characters or fewer"
                )
            sort_order_link = link.get("sortOrder")
            if not isinstance(sort_order_link, int) or isinstance(sort_order_link, bool):
                sys.exit(
                    f"ERROR: {path}: externalLinks[{i}].sortOrder must be an integer"
                )
            validated_links.append({
                "label": label,
                "url": url,
                "sort_order": sort_order_link,
            })

        # FH-owned named galleries auto-include `#curated` so the criteria
        # query scopes to FH-uploaded items only (every FH upload carries
        # the `#curated` tag via applyTagsForCurator). Mirrors the
        # auto-prepend in curatorMediaService.createGallery / updateGallery
        # for the FH-owned branch. Idempotent: if the sidecar already lists
        # `#curated` (existing convention), the seed leaves it in place.
        if "#curated" not in criteria_tags:
            criteria_tags = ["#curated", *criteria_tags]

        loaded.append({
            "id": gallery_id,
            "name": name,
            "description": description,
            "sort_order": sort_order,
            "criteria_tags": tuple(criteria_tags),
            "exclude_tags": tuple(exclude_tags),
            "external_links": tuple(
                (lk["label"], lk["url"], lk["sort_order"]) for lk in validated_links
            ),
        })

    return loaded


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
    external_links: tuple = (),
) -> None:
    """Ensure an FH-owned named gallery row exists in member_galleries with
    the given metadata, AND its criteria-tag and exclude-tag sets match
    `criteria_tags` / `exclude_tags` exactly. An item appears in the
    gallery iff it carries every criteria tag AND no exclude tag.
    External links are reconciled by DELETE-then-INSERT against
    gallery_external_links.

    INSERT OR REPLACE on the parent so re-runs pick up metadata tweaks;
    DELETE-then-INSERT on the tag and link rows so set changes in this
    file propagate cleanly without leaving orphan rows.
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

    con.execute(
        "DELETE FROM gallery_external_links WHERE gallery_id = ?",
        (gallery_id,),
    )
    for label, url, link_sort in external_links:
        link_id = f"glink_{gallery_id}_{link_sort}"
        con.execute(
            """
            INSERT INTO gallery_external_links (
                id, created_at, created_by, updated_at, updated_by, version,
                gallery_id, label, url, validated_at, sort_order
            ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, ?, NULL, ?)
            """,
            (link_id, ts, ts, gallery_id, label, url, link_sort),
        )


def ensure_fh_named_galleries(
    con: sqlite3.Connection,
    fh_id: str,
    ts: str,
    galleries: list[dict],
) -> None:
    """Ensure every gallery loaded from /curated/galleries/*.json exists.
    FH-owned gallery rows whose sidecar is no longer on disk are removed
    (orphan cleanup, scoped to owner_member_id = fh_id so member-owned
    galleries are not touched). Tag rows cascade via ON DELETE CASCADE.
    """
    for g in galleries:
        ensure_named_gallery(
            con, fh_id, ts,
            gallery_id=g["id"],
            name=g["name"],
            description=g["description"],
            sort_order=g["sort_order"],
            criteria_tags=g["criteria_tags"],
            exclude_tags=g["exclude_tags"],
            external_links=g.get("external_links", ()),
        )

    kept_ids = [g["id"] for g in galleries]
    if kept_ids:
        placeholders = ",".join(["?"] * len(kept_ids))
        cur = con.execute(
            f"""
            DELETE FROM member_galleries
            WHERE owner_member_id = ?
              AND id NOT IN ({placeholders})
            """,
            (fh_id, *kept_ids),
        )
    else:
        cur = con.execute(
            "DELETE FROM member_galleries WHERE owner_member_id = ?",
            (fh_id,),
        )
    if cur.rowcount:
        print(
            f"  → Removed {cur.rowcount} orphaned FH gallery row(s) "
            "(sidecar deleted from /curated/galleries/)"
        )

    print(f"  → Ensured {len(galleries)} FH-owned named gallery row(s).")


URL_REF_SIDECAR_SUBDIRS = ("freestyle_tricks", "freestyle_tutorials")


def seed_freestyle_tricks_sidecars(
    con: sqlite3.Connection, fh_id: str, source_dir: Path, ts: str
) -> int:
    """Seed every URL-only sidecar from the curated subdirs in
    URL_REF_SIDECAR_SUBDIRS into media_items + media_tags + media_sources.
    Returns count of sidecars seeded.

    Two subdirs share this URL-only loader path:
      - freestyle_tricks/  — trick reference videos (the original home;
                             tagged with trick slugs).
      - freestyle_tutorials/ — tutorial videos (methodology, set anatomy,
                               etc.; tagged with source slugs like
                               #passback_tutorials). Same schema; the
                               directory split is a semantic distinction
                               between trick-reference and tutorial media.

    Both subdirs are added to FILE_PAIRED_SUBDIR_BLOCKLIST so the generic
    file-paired walker does not silently skip these URL-only sidecars
    (which carry no companion binary).
    """
    files: list[Path] = []
    for subdir_name in URL_REF_SIDECAR_SUBDIRS:
        subdir = source_dir / subdir_name
        if subdir.is_dir():
            files.extend(sorted(subdir.glob("*.meta.json")))
    files = sorted(files)
    if not files:
        return 0

    sources_added = _bootstrap_media_sources(con)
    if sources_added:
        print(f"  → Bootstrapped media_sources: {sources_added} row(s) loaded")

    alias_map = load_alias_map(con)

    seen_pairs: set[tuple[str, str]] = set()
    n = 0
    for path in files:
        _, _, platform, url = _seed_one_sidecar(con, path, fh_id, ts, alias_map)
        seen_pairs.add((platform, url))
        n += 1
    subdir_label = " + ".join(f"/curated/{d}/" for d in URL_REF_SIDECAR_SUBDIRS)
    print(f"  → Seeded {n} URL-ref video sidecar(s) from {subdir_label}")

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


# Subdirectories that have their own bespoke seed pipelines and must NOT
# be walked by the generic file-paired sidecar pass below.
# freestyle_tricks + freestyle_tutorials carry url-reference sidecars
# (different schema; handled by seed_freestyle_tricks_sidecars via
# URL_REF_SIDECAR_SUBDIRS). galleries carries named-gallery sidecars
# (handled by _load_named_gallery_sidecars). Add new bespoke subdirs here
# when they appear; everything else is treated as admin-uploaded
# file-paired content matching the CuratorSidecar shape (caption, tags,
# optional poster, optional externalUrl) — the same shape the admin
# upload form writes when local-adapter mode supplies a category.
FILE_PAIRED_SUBDIR_BLOCKLIST = {*URL_REF_SIDECAR_SUBDIRS, "galleries"}

# Binary extensions recognized as file-paired primaries. Mirrors the
# enumerator in src/services/curatorSeedService.ts:enumerateMediaSources.
PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}


def seed_file_paired_sidecars(
    con: sqlite3.Connection,
    fh_id: str,
    source_dir: Path,
    media_dir: Path,
    ts: str,
) -> int:
    """Walk /curated/{category}/ subdirs and seed file-paired curator items.

    Two flavors of category:

    - `avatars/` is the avatar marker. Binaries here are seeded as is_avatar
      photos with no sidecar required; tags are forced to `#by_<owner_slug>`
      by seed_item. A sidecar in avatars/ is rejected (the directory is the
      avatar declaration; no metadata field needed).
    - Every other category requires a sibling `<stem>.meta.json` sidecar
      (caption, tags, optional poster for videos, optional externalUrl).
      Each (binary, sidecar) pair becomes one media_items row owned by FH.

    Subdirs in FILE_PAIRED_SUBDIR_BLOCKLIST are skipped (they have their
    own bespoke pipelines). Files matching `*.poster.*` are skipped as
    primaries (they are attached to their parent video via the sidecar's
    `poster` field). Malformed sidecars or invalid tag shapes fail-fast.

    After the walk, runs an orphan-cleanup pass: any FH-owned non-URL-ref
    media_items row whose `source_filename` no longer corresponds to a
    sidecar/binary on disk (and is not in the CURATOR_ITEMS placeholder
    list) is deleted. /curated/ is the source of truth.

    Returns count of items seeded.
    """
    seen_basenames: set[str] = set()
    count = 0

    for category_dir in sorted(p for p in source_dir.iterdir() if p.is_dir()):
        category = category_dir.name
        if category in FILE_PAIRED_SUBDIR_BLOCKLIST:
            continue
        is_avatar_category = (category == "avatars")
        for binary_path in sorted(category_dir.iterdir()):
            if not binary_path.is_file():
                continue
            ext = binary_path.suffix.lower()
            if ext not in PHOTO_EXTENSIONS and ext not in VIDEO_EXTENSIONS:
                continue
            # Skip companion posters; they're attached via the parent's
            # sidecar `poster` field.
            if binary_path.stem.endswith(".poster"):
                continue

            is_video = ext in VIDEO_EXTENSIONS
            sidecar_path = binary_path.with_suffix(".meta.json")

            if is_avatar_category:
                # avatars/ is the avatar marker; binaries here need no
                # sidecar. A sidecar present here is a misconfiguration.
                if is_video:
                    sys.exit(
                        f"ERROR: {binary_path}: avatars/ contains a video binary; "
                        "avatars must be photos."
                    )
                if sidecar_path.exists():
                    sys.exit(
                        f"ERROR: {sidecar_path}: avatars/ binaries do not take a "
                        "sidecar (the avatars/ subdir is the avatar declaration)."
                    )
                raw_tags: list[str] = []
                caption = None
                poster_filename = None
                external_url = None
                is_avatar = True
            else:
                if not sidecar_path.exists():
                    # Allows operators to stage a binary before its sidecar
                    # arrives; subsequent runs pick it up once the sidecar
                    # lands.
                    continue
                try:
                    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError) as exc:
                    sys.exit(f"ERROR: {sidecar_path}: malformed sidecar ({exc})")
                if not isinstance(sidecar, dict):
                    sys.exit(
                        f"ERROR: {sidecar_path}: top-level value must be a JSON object"
                    )
                if sidecar.get("isAvatar"):
                    sys.exit(
                        f"ERROR: {sidecar_path}: 'isAvatar' is implied by the "
                        f"avatars/ subdir; this binary is in {category}/, not "
                        "avatars/. Move the binary into avatars/ and drop the "
                        "sidecar (avatar binaries don't need one)."
                    )
                raw_tags = list(sidecar.get("tags") or [])
                caption = sidecar.get("caption")
                poster_filename = sidecar.get("poster")
                external_url = sidecar.get("externalUrl")
                is_avatar = False

                # Tag shape validation (parity with _seed_one_sidecar).
                for tag in raw_tags:
                    if not isinstance(tag, str) or not tag.startswith("#"):
                        sys.exit(
                            f"ERROR: {sidecar_path}: tag {tag!r} must be a "
                            "'#'-prefixed string"
                        )
                    if tag != tag.lower():
                        sys.exit(
                            f"ERROR: {sidecar_path}: tag {tag!r} must be lowercase"
                        )
                # `#curated` is auto-prepended by seed_item; sidecars must not
                # carry it. Mirrors the rule in _seed_one_sidecar (line ~743)
                # and applyTagsForCurator on the TS service.
                if any(t.lower() == "#curated" for t in raw_tags):
                    sys.exit(
                        f"ERROR: {sidecar_path}: '#curated' must NOT appear in "
                        "sidecar tags; the seeder auto-prepends it"
                    )

            # Build the dict shape expected by seed_item. id_seed must be
            # stable per (category, binary) so re-runs land on the same
            # media_id (content-addressed inside seed_item).
            id_seed = f"file_paired__{category}__{binary_path.stem}"
            item: dict = {
                "id_seed": id_seed,
                "media_type": "video" if is_video else "photo",
                "caption": caption,
                # Pass raw_tags (without #curated). seed_item auto-prepends
                # #curated for non-avatars and forces #by_<owner_slug> for
                # avatars. cleanup_prior_for_item keys on source_filename
                # basename (not tags[0]), so atomic shared tags like
                # #demo work without colliding.
                "tags": raw_tags,
            }
            if is_avatar:
                item["is_avatar"] = True
            if is_video:
                if not poster_filename:
                    sys.exit(
                        f"ERROR: {sidecar_path}: video sidecar missing required "
                        "'poster' field"
                    )
                item["video_source"] = str(binary_path.relative_to(source_dir))
                item["poster_source"] = str(
                    (category_dir / poster_filename).relative_to(source_dir)
                )
            else:
                item["photo_source"] = str(binary_path.relative_to(source_dir))

            seed_item(con, item, fh_id, source_dir, media_dir, ts)
            seen_basenames.add(binary_path.name)

            # Apply external_url after seed_item's INSERT OR REPLACE.
            # Resolved by source_filename basename (set by seed_video_item /
            # seed_photo_item). validated_at stamps acceptance time.
            if external_url:
                con.execute(
                    """UPDATE media_items
                          SET external_url = ?, external_url_validated_at = ?
                        WHERE uploader_member_id = ?
                          AND source_filename = ?""",
                    (external_url, ts, fh_id, binary_path.name),
                )

            count += 1

    # Orphan cleanup. /curated/ is the source of truth: a file-paired row
    # whose binary is no longer on disk gets removed. Scope:
    #   - FH-owned only (uploader_member_id = fh_id)
    #   - Non-URL-ref (video_platform NULL or 's3'); the freestyle_tricks
    #     pipeline manages 'youtube'/'vimeo' rows separately.
    #   - source_filename not seen this run AND not a CURATOR_ITEMS
    #     placeholder basename (CURATOR_ITEMS rows live alongside
    #     file-paired rows in the same table; preserve them here).
    curator_basenames = {
        item.get("photo_source") or item.get("video_source")
        for item in CURATOR_ITEMS
        if item.get("photo_source") or item.get("video_source")
    }
    keep = seen_basenames | curator_basenames
    if keep:
        keep_placeholders = ",".join(["?"] * len(keep))
        cur = con.execute(
            f"""
            DELETE FROM media_items
            WHERE uploader_member_id = ?
              AND (video_platform IS NULL OR video_platform = 's3')
              AND source_filename IS NOT NULL
              AND source_filename NOT IN ({keep_placeholders})
            """,
            (fh_id, *sorted(keep)),
        )
    else:
        cur = con.execute(
            """
            DELETE FROM media_items
            WHERE uploader_member_id = ?
              AND (video_platform IS NULL OR video_platform = 's3')
              AND source_filename IS NOT NULL
            """,
            (fh_id,),
        )
    if cur.rowcount:
        print(
            f"  → Removed {cur.rowcount} orphaned file-paired row(s) "
            "(binary or sidecar removed from /curated/)"
        )

    return count


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
        n_file_paired = seed_file_paired_sidecars(con, fh_id, source_dir, media_dir, ts)
        n_sidecars = seed_freestyle_tricks_sidecars(con, fh_id, source_dir, ts)
        named_galleries = _load_named_gallery_sidecars(source_dir)
        ensure_fh_named_galleries(con, fh_id, ts, named_galleries)
        con.commit()
        print(
            f"  → FH curator seed complete: FH member, {len(CURATOR_ITEMS)} curator items, "
            f"{n_file_paired} file-paired sidecars, "
            f"{n_sidecars} reference videos, {len(named_galleries)} named galleries."
        )
    finally:
        con.close()


if __name__ == "__main__":
    main()
