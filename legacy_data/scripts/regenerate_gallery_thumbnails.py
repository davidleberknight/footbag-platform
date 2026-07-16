#!/usr/bin/env python3
"""Regenerate missing gallery thumbnails in the footbag.org archive mirror.

The legacy gallery stored, per image, a full-size file and a matching thumbnail
(the `images.ImageLocalFile` / `images.ImageLocalThumbnail` pair in the gallery
database). Some thumbnails never downloaded during the crawl even though their
full-size source did. This tool regenerates only those missing thumbnails from
the present full-size source, reproducing the legacy sizing so the archive reads
the same as the live gallery did.

Authoritative model, read from the gallery database dump and the gallery source
(`gallery/fixthumbnails.php`):
  - Pairing: one `images` row per photo; a local row (`ImageIsLocal=1`) carries a
    full-size `ImageLocalFile` URL and a thumbnail `ImageLocalThumbnail` URL. Both
    resolve into the mirror under `www.footbag.org/<path>`; the thumbnail path is
    the full-size path with `.thumb/` inserted after `media/`.
  - Sizing: the legacy `convert ... -scale 100x150` fits the image within a
    100x150 box preserving aspect ratio (enlarging a smaller source, as the legacy
    did), so the result dimensions vary per image and are recomputed here rather
    than trusted from the possibly-stale database columns.
  - Orientation: EXIF orientation is applied (upright display) before resizing,
    then all EXIF and ICC metadata is stripped from the output. This is a
    deliberate, documented improvement over the legacy command, which stripped
    metadata without auto-orienting and could emit sideways thumbnails.
  - Output: deterministic JPEG bytes, written under the exact legacy destination
    filename and extension even when that extension is not `.jpg` (the legacy
    gallery did the same: JPEG bytes under the source's original name).

Safety contract:
  - Dry-run by default; writes only with --apply.
  - Never overwrites an existing thumbnail.
  - Never writes, moves, or re-encodes a full-size source (sources are opened
    read-only).
  - Rejects an ambiguous destination (two rows targeting one thumbnail path)
    instead of choosing a row.
  - A repeated run is a no-op: once a thumbnail exists it is classified existing.
  - Emits a machine-readable JSON report of every disposition.

Pillow is required and is checked explicitly (it is an approved project
dependency, listed in scripts/requirements.txt, but is not installed in every
virtualenv). This script imports nothing from the pipeline.

Usage:
    python legacy_data/scripts/regenerate_gallery_thumbnails.py \
        --dump   legacy_data/../footbag_legacy_repo/gallery/backups/latest.sql \
        --mirror legacy_data/mirror_footbag_org \
        --report thumb_audit.json                 # dry-run: reports, writes nothing
    ... --apply                                    # actually generate thumbnails
"""
import argparse
import json
import os
import re
import sys
from urllib.parse import urlparse, unquote

BOX = (100, 150)                 # legacy `-scale 100x150` bounding box
JPEG_SAVE = dict(format="JPEG", quality=100, optimize=False,
                 progressive=False, subsampling=0)   # deterministic output


def require_pillow():
    """Import Pillow or exit with an actionable message. Never a silent import."""
    try:
        from PIL import Image, ImageOps  # noqa: F401
        return Image, ImageOps
    except ImportError:
        sys.stderr.write(
            "ERROR: Pillow is required and is not importable in this interpreter.\n"
            "Pillow is an approved project dependency (scripts/requirements.txt) but\n"
            "is not installed in the pipeline virtualenv. Run this tool with an\n"
            "interpreter that has Pillow, e.g. the scripts virtualenv, or\n"
            "  python -m pip install Pillow\n")
        raise SystemExit(2)


# ── Gallery database parsing (read-only over the committed dump) ──────────────

def _split_tuples(seg):
    rows, depth, cur, inq, i = [], 0, "", False, 0
    while i < len(seg):
        ch = seg[i]
        if inq:
            cur += ch
            if ch == "\\":
                cur += seg[i + 1]
                i += 2
                continue
            if ch == "'":
                inq = False
        else:
            if ch == "'":
                inq = True
                cur += ch
            elif ch == "(":
                depth += 1
                if depth == 1:
                    cur = ""
                else:
                    cur += ch
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    rows.append(cur)
                else:
                    cur += ch
            elif depth > 0:
                cur += ch
        i += 1
    return rows


def _split_cols(row):
    out, cur, inq, i = [], "", False, 0
    while i < len(row):
        ch = row[i]
        if inq:
            if ch == "\\":
                cur += row[i + 1]
                i += 2
                continue
            if ch == "'":
                inq = False
            else:
                cur += ch
        else:
            if ch == "'":
                inq = True
            elif ch == ",":
                out.append(cur)
                cur = ""
            else:
                cur += ch
        i += 1
    out.append(cur)
    return out


# Column order of the `images` table (from the CREATE TABLE in the dump).
_C = dict(real_image_id=0, is_local=4, local_file=5, local_thumbnail=6,
          thumb_w=7, thumb_h=8, subtype=12)


def parse_images_table(dump_text):
    """Yield one dict per `images` row from a gallery SQL dump."""
    m = re.search(r"INSERT INTO `images` VALUES (.*?);\n", dump_text, re.S)
    if not m:
        return []
    rows = []
    for raw in _split_tuples(m.group(1)):
        cols = _split_cols(raw)
        if len(cols) <= _C["subtype"]:
            continue
        rows.append({
            "real_image_id": cols[_C["real_image_id"]].strip(),
            "is_local": cols[_C["is_local"]].strip(),
            "local_file": cols[_C["local_file"]].strip(),
            "local_thumbnail": cols[_C["local_thumbnail"]].strip(),
            "thumb_w": cols[_C["thumb_w"]].strip(),
            "thumb_h": cols[_C["thumb_h"]].strip(),
            "subtype": cols[_C["subtype"]].strip(),
        })
    return rows


def mirror_path(mirror_root, url_or_path):
    """Map a gallery URL (or path) to its local file under www.footbag.org/."""
    if not url_or_path:
        return None
    path = urlparse(url_or_path).path or url_or_path
    return os.path.join(mirror_root, "www.footbag.org", unquote(path).lstrip("/"))


def _db_dims(row):
    tw, th = row["thumb_w"], row["thumb_h"]
    if tw.isdigit() and th.isdigit() and int(tw) > 0 and int(th) > 0:
        return int(tw), int(th)
    return None


def compute_fit(w, h, box=BOX):
    """Legacy `-scale WxH`: fit within the box preserving aspect (may enlarge)."""
    if w <= 0 or h <= 0:
        raise ValueError(f"non-positive source dimensions: {w}x{h}")
    scale = min(box[0] / w, box[1] / h)
    return max(1, round(w * scale)), max(1, round(h * scale))


# ── Thumbnail rendering ──────────────────────────────────────────────────────

def render_thumbnail(src_path, dst_path, apply=False, box=BOX):
    """Decode the source, orient, resize, and (optionally) write the thumbnail.

    Returns (result_w, result_h). Writes nothing unless apply is True. The source
    is opened read-only and never modified. Raises on an undecodable source.
    """
    Image, ImageOps = require_pillow()
    with Image.open(src_path) as im:
        im.load()
        im = ImageOps.exif_transpose(im)          # EXIF orientation, then dropped
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        nw, nh = compute_fit(im.width, im.height, box)
        im = im.resize((nw, nh), Image.LANCZOS)
        if apply:
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            # exif/icc are omitted by construction, stripping all metadata.
            im.save(dst_path, **JPEG_SAVE)
        return nw, nh


# ── Orchestration ────────────────────────────────────────────────────────────

def run(dump_path, mirror_root, apply=False):
    """Classify every local gallery image and (optionally) generate thumbnails."""
    require_pillow()
    with open(dump_path, encoding="latin-1") as fh:
        rows = parse_images_table(fh.read())

    report = {
        "dump": dump_path, "mirror": mirror_root, "apply": bool(apply),
        "box": list(BOX),
        "generated": [], "existing": [], "missing_source": [],
        "ambiguous": [], "invalid_metadata": [], "undecodable": [], "failed": [],
        "counts": {},
    }
    remote_skipped = 0

    # Group by destination to detect ambiguous duplicate targets up front.
    by_dst = {}
    for row in rows:
        if row["is_local"] != "1" or not row["local_file"]:
            remote_skipped += 1
            continue
        dst = mirror_path(mirror_root, row["local_thumbnail"])
        if not dst:
            remote_skipped += 1
            continue
        by_dst.setdefault(dst, []).append(row)

    for dst in sorted(by_dst):
        group = by_dst[dst]
        if len(group) > 1:
            report["ambiguous"].append({
                "dst": dst,
                "sources": sorted(mirror_path(mirror_root, r["local_file"]) for r in group),
            })
            continue
        row = group[0]
        src = mirror_path(mirror_root, row["local_file"])

        if os.path.isfile(dst) and os.path.getsize(dst) > 0:
            report["existing"].append(dst)          # never overwrite
            continue
        if not (src and os.path.isfile(src) and os.path.getsize(src) > 0):
            report["missing_source"].append({"src": src, "dst": dst})
            continue

        try:
            rw, rh = render_thumbnail(src, dst, apply=apply)
        except SystemExit:
            raise
        except Exception as exc:                     # undecodable / unreadable source
            report["undecodable"].append({"src": src, "dst": dst, "error": str(exc)})
            continue

        db = _db_dims(row)
        db_status = "ok"
        if db is None:
            db_status = "absent"
        elif db != (rw, rh):
            db_status = "mismatch"
        if db_status != "ok":
            report["invalid_metadata"].append({
                "dst": dst, "db_dims": list(db) if db else None,
                "recomputed_dims": [rw, rh], "status": db_status,
            })
        report["generated"].append({
            "src": src, "dst": dst, "result_dims": [rw, rh],
            "db_dims": list(db) if db else None, "db_dims_status": db_status,
            "written": bool(apply),
        })

    report["counts"] = {
        "total_image_rows": len(rows),
        "remote_skipped": remote_skipped,
        "generated": len(report["generated"]),
        "existing": len(report["existing"]),
        "missing_source": len(report["missing_source"]),
        "ambiguous": len(report["ambiguous"]),
        "invalid_metadata": len(report["invalid_metadata"]),
        "undecodable": len(report["undecodable"]),
        "failed": len(report["failed"]),
    }
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description="Regenerate missing gallery thumbnails.")
    ap.add_argument("--dump", required=True, help="gallery latest.sql dump")
    ap.add_argument("--mirror", required=True, help="mirror root directory")
    ap.add_argument("--report", help="write the JSON report here (default: stdout)")
    ap.add_argument("--apply", action="store_true",
                    help="actually write thumbnails (default: dry-run, writes nothing)")
    args = ap.parse_args(argv)

    report = run(args.dump, args.mirror, apply=args.apply)
    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            fh.write(payload + "\n")
    else:
        print(payload)
    c = report["counts"]
    mode = "APPLY" if args.apply else "DRY-RUN"
    sys.stderr.write(
        f"[{mode}] proposed writes: {c['generated']}  existing: {c['existing']}  "
        f"missing-source: {c['missing_source']}  ambiguous: {c['ambiguous']}  "
        f"invalid-metadata: {c['invalid_metadata']}  undecodable: {c['undecodable']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
