#!/usr/bin/env python3
"""One-shot Slice 2 migration: legacy freestyle_media_* CSVs -> /curated/freestyle_tricks/ sidecars.

Reads:
  - legacy_data/inputs/curated/media/media_sources.csv
  - legacy_data/inputs/curated/media/media_assets.csv
  - legacy_data/inputs/curated/media/media_links.csv

Writes:
  - curated/freestyle_tricks/{first-canonical-slug}_{asset-id-short}.meta.json
    (one sidecar per non-skipped asset; admin-uploaded MP4s on S3 are out of
    scope for this batch, all 100 legacy rows are URL-reference YouTube/Vimeo)
  - legacy_data/inputs/curated/media/footbagspot_pending_rehost.csv  (tracked
    skip report; 5 footbagspot rows. Promoted to a tracked artifact instead of
    a gitignored transient so the coverage gap survives Phase E destructive
    cleanup, stays visible in repo history, and acts as a first-class backlog
    item.)

Verifies (built-in; no flag):
  - Per-asset timestamp uniformity across links: assert all start_seconds
    identical AND all end_seconds identical. No silent picks.
  - Round-trip equality: re-parses each sidecar and asserts it matches the
    expected dict computed from the joined CSV view.

Output volumes (current data):
  - 100 input media_assets rows
    -> 95 sidecars (94 youtube + 1 vimeo)
    -> 5 footbagspot skips
  - 13 media_sources rows -> migrated implicitly via sidecar.sourceId
    references (no separate sources file); seeder will reconcile.
  - 141 media_links rows -> tags derived; 0 record-only assets; 25 with
    clip ranges all timestamp-uniform per asset.

Idempotent: re-running rebuilds sidecars + skip report from scratch.

Usage (from repo root):
    scripts/.venv/bin/python3 scripts/migrate-freestyle-media-to-curated.py [--db PATH]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3

# Local helper (sibling file).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _trick_canonicalization import canonicalize_slug, load_alias_map  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO / "database" / "footbag.db"

ASSETS_CSV = REPO / "legacy_data" / "inputs" / "curated" / "media" / "media_assets.csv"
LINKS_CSV  = REPO / "legacy_data" / "inputs" / "curated" / "media" / "media_links.csv"
# media_sources.csv is read into the seeder via a separate path; this migration
# only references source_id strings, which the seeder reconciles against the
# legacy CSV (kept until Phase E destructive cleanup).

OUT_SIDECAR_DIR = REPO / "curated" / "freestyle_tricks"
# Tracked artifact (not gitignored): survives Phase E cleanup, visible in repo
# history, first-class backlog. See module docstring rationale.
OUT_SKIP_REPORT = REPO / "legacy_data" / "inputs" / "curated" / "media" / "footbagspot_pending_rehost.csv"

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
VIMEO_HOSTS   = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}


def detect_platform(url: str) -> str | None:
    """Return 'youtube', 'vimeo', or None if the URL is not an embed-eligible host."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return None
    if host in YOUTUBE_HOSTS:
        return "youtube"
    if host in VIMEO_HOSTS:
        return "vimeo"
    return None


def maybe_int(s: str) -> int | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def short_id(asset_id: str) -> str:
    """First 8 chars of the asset UUID; deterministic + collision-safe at 100-asset scale."""
    return asset_id.split("-")[0][:8]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=str(DEFAULT_DB), help="Path to SQLite DB (for alias + records lookup)")
    args = ap.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        print("Run scripts/reset-local-db.sh first.", file=sys.stderr)
        return 1
    if not ASSETS_CSV.exists() or not LINKS_CSV.exists():
        print(f"ERROR: legacy CSVs not found at {ASSETS_CSV.parent}", file=sys.stderr)
        return 1

    con = sqlite3.connect(str(db_path))
    alias_map = load_alias_map(con)
    valid_slugs = {r[0] for r in con.execute("SELECT slug FROM freestyle_tricks").fetchall()}
    # freestyle_records has trick_name (display, e.g. 'Ripwalk'). Lower+slug it,
    # then canonicalize, to recover the parent-trick slug for record-only fallback.
    record_parent: dict[str, str] = {}
    for rid, trick_name in con.execute("SELECT id, trick_name FROM freestyle_records").fetchall():
        if not trick_name:
            continue
        # Match script 17/19 trick_name_to_slug: lower, [^a-z0-9]+ -> '-', strip '-'.
        # Inline the rule rather than import the loader (avoids legacy_data path coupling).
        slug = "".join(c if c.isalnum() else "-" for c in trick_name.lower())
        slug = "-".join(p for p in slug.split("-") if p)
        record_parent[rid] = canonicalize_slug(slug, alias_map)
    con.close()

    # ── Read CSVs ──────────────────────────────────────────────────────────────
    with ASSETS_CSV.open(newline="", encoding="utf-8") as f:
        assets = list(csv.DictReader(f))
    with LINKS_CSV.open(newline="", encoding="utf-8") as f:
        links = list(csv.DictReader(f))

    # ── Group links by media_id; verify timestamp uniformity per asset ─────────
    by_asset: dict[str, list[dict]] = defaultdict(list)
    for link in links:
        by_asset[link["media_id"]].append(link)

    timestamp_violations: list[tuple[str, list]] = []
    for mid, lks in by_asset.items():
        starts = {(l.get("start_seconds") or "").strip() for l in lks}
        ends   = {(l.get("end_seconds") or "").strip() for l in lks}
        if len(starts) > 1 or len(ends) > 1:
            timestamp_violations.append((mid, lks))
    if timestamp_violations:
        print(f"ERROR: {len(timestamp_violations)} asset(s) have non-uniform timestamps across links.", file=sys.stderr)
        for mid, lks in timestamp_violations[:5]:
            print(f"  asset={mid}: {[(l['entity_type'], l['entity_id'], l['start_seconds'], l['end_seconds']) for l in lks]}", file=sys.stderr)
        print("Aborting; timestamp drift requires manual reconciliation per locked decision.", file=sys.stderr)
        return 2
    print(f"Timestamp uniformity check: OK ({len(by_asset)} assets, 0 violations)")

    # ── Build per-asset expected sidecar dicts ─────────────────────────────────
    sidecars: list[tuple[str, Path, dict]] = []  # (asset_id, sidecar_path, expected_dict)
    skipped: list[dict] = []
    unknown_slug_warnings: list[tuple[str, str]] = []  # (asset_id, raw_slug)

    for asset in assets:
        asset_id = asset["id"]
        url      = asset.get("url", "")
        platform = detect_platform(url)

        # Collect link-derived trick slugs (raw + canonical)
        trick_slugs_canonical: list[str] = []
        record_ids: list[str] = []
        any_trick_link = False
        for link in by_asset.get(asset_id, []):
            et = link["entity_type"]
            eid = link["entity_id"]
            if et == "trick":
                any_trick_link = True
                canon = canonicalize_slug(eid, alias_map)
                trick_slugs_canonical.append(canon)
                if canon not in valid_slugs:
                    unknown_slug_warnings.append((asset_id, eid))
            elif et == "record":
                record_ids.append(eid)
            # other entity_types: 0 in current data; ignore

        # Skip-report path: footbagspot / non-youtube-non-vimeo
        if platform is None:
            tier = (asset.get("tier") or "").strip()
            skipped.append({
                "asset_id": asset_id,
                "url": url,
                "title": asset.get("title", ""),
                "creator": asset.get("creator", ""),
                "source_id": asset.get("source_id", ""),
                "tier": tier,
                "trick_slugs": "|".join(sorted(set(trick_slugs_canonical))),
                "record_ids":  "|".join(sorted(set(record_ids))),
                "reason": "non_youtube_vimeo_url",
            })
            continue

        # Tag derivation per CMP §"Migration of James's existing 47 assets" item 3:
        # - For each trick link: include #freestyle, #trick, #{canonical_slug}.
        # - For each record link IF asset has no trick link: derive parent trick
        #   from freestyle_records.trick_name -> slug -> canonicalize, then add
        #   #freestyle, #trick, #{canonical_slug}. Ensures every asset is
        #   reachable via its trick's gallery. Current data: 0 record-only
        #   assets, so this branch is exercised by safety only.
        # - #curated is NOT added here; the seeder auto-prepends it at write time.
        tag_set: set[str] = set()
        if any_trick_link:
            tag_set.update({"#freestyle", "#trick"})
            for s in trick_slugs_canonical:
                tag_set.add(f"#{s}")
        elif record_ids:
            for rid in record_ids:
                parent = record_parent.get(rid)
                if parent and parent in valid_slugs:
                    tag_set.update({"#freestyle", "#trick", f"#{parent}"})
        # If neither: asset has no entity association; it would be reachable
        # only by direct media_id query. Current data has no such rows.

        sidecar: dict = {
            "videoUrl": url,
            "videoPlatform": platform,
        }
        # CSV fields -> sidecar; omit empty per locked decision (no `"x": null`)
        for csv_key, json_key in (("title", "title"), ("creator", "creator"), ("source_id", "sourceId")):
            v = (asset.get(csv_key) or "").strip()
            if v:
                sidecar[json_key] = v
        # Tier preserved for future filtering (locked decision: include)
        tier = (asset.get("tier") or "").strip()
        if tier:
            sidecar["tier"] = tier
        # Clip range from any one link (already proven uniform across the asset's links)
        first_link = by_asset.get(asset_id, [{}])[0]
        s = maybe_int(first_link.get("start_seconds", ""))
        e = maybe_int(first_link.get("end_seconds", ""))
        if s is not None:
            sidecar["startSeconds"] = s
        if e is not None:
            sidecar["endSeconds"] = e
        # Tags: deterministic sorted list
        sidecar["tags"] = sorted(tag_set)

        # ── Invariant: every migrated sidecar must carry >=1 CANONICAL trick
        # tag — i.e. at least one tag whose slug-part exists in
        # freestyle_tricks.slug. Anchors the gallery contract: every asset is
        # reachable through some trick page. Violation aborts; we don't ship
        # untraceable curator content.
        canonical_trick_tags = [
            t for t in sidecar["tags"]
            if t not in ("#freestyle", "#trick") and t.lstrip("#") in valid_slugs
        ]
        if not canonical_trick_tags:
            print(
                f"ERROR: asset {asset_id} produces no canonical trick tag.\n"
                f"  tags={sidecar['tags']}, raw trick links={trick_slugs_canonical},\n"
                f"  record_ids={record_ids}",
                file=sys.stderr,
            )
            return 5

        # Filename: {first-canonical-trick-slug}_{asset_id_short}.meta.json
        primary = sorted(trick_slugs_canonical)[0] if trick_slugs_canonical else "untriaged"
        sidecar_path = OUT_SIDECAR_DIR / f"{primary}_{short_id(asset_id)}.meta.json"
        sidecars.append((asset_id, sidecar_path, sidecar))

    # ── Write sidecars ────────────────────────────────────────────────────────
    OUT_SIDECAR_DIR.mkdir(parents=True, exist_ok=True)
    # Idempotency: clear existing sidecars before writing (we own this directory)
    for old in OUT_SIDECAR_DIR.glob("*.meta.json"):
        old.unlink()

    # Filename collision check
    seen_paths: set[Path] = set()
    for asset_id, path, sidecar in sidecars:
        if path in seen_paths:
            print(f"ERROR: filename collision: {path}", file=sys.stderr)
            return 3
        seen_paths.add(path)

    for asset_id, path, sidecar in sidecars:
        with path.open("w", encoding="utf-8") as f:
            json.dump(sidecar, f, indent=2, sort_keys=False)
            f.write("\n")
    print(f"Wrote {len(sidecars)} sidecar(s) to {OUT_SIDECAR_DIR.relative_to(REPO)}/")

    # ── Write skip report ─────────────────────────────────────────────────────
    OUT_SKIP_REPORT.parent.mkdir(parents=True, exist_ok=True)
    with OUT_SKIP_REPORT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["asset_id","url","title","creator","source_id","tier","trick_slugs","record_ids","reason"],
        )
        w.writeheader()
        for row in skipped:
            w.writerow(row)
    print(f"Wrote skip report ({len(skipped)} row(s)) to {OUT_SKIP_REPORT.relative_to(REPO)}")

    # ── Round-trip verification ───────────────────────────────────────────────
    print()
    print("Round-trip verification:")
    mismatches = 0
    for asset_id, path, expected in sidecars:
        with path.open(encoding="utf-8") as f:
            actual = json.load(f)
        # Compare
        if set(actual.keys()) != set(expected.keys()):
            print(f"  MISMATCH {asset_id}: keys differ. expected={sorted(expected.keys())} actual={sorted(actual.keys())}")
            mismatches += 1
            continue
        for k in expected:
            ev, av = expected[k], actual[k]
            if k == "tags":
                if sorted(ev) != sorted(av):
                    print(f"  MISMATCH {asset_id}.tags: expected={sorted(ev)} actual={sorted(av)}")
                    mismatches += 1
                    break
            elif ev != av:
                print(f"  MISMATCH {asset_id}.{k}: expected={ev!r} actual={av!r}")
                mismatches += 1
                break
    if mismatches:
        print(f"\nERROR: {mismatches} sidecar(s) failed round-trip.", file=sys.stderr)
        return 4
    print(f"  PASS — {len(sidecars)} sidecar(s) round-trip cleanly.")

    # ── Unknown-slug warning summary ──────────────────────────────────────────
    if unknown_slug_warnings:
        print()
        print(f"WARNING: {len(unknown_slug_warnings)} link(s) reference slugs not in freestyle_tricks.slug:")
        for asset_id, raw in unknown_slug_warnings[:10]:
            print(f"  asset={asset_id[:8]}... raw_slug={raw!r}")
        if len(unknown_slug_warnings) > 10:
            print(f"  ... +{len(unknown_slug_warnings)-10} more")
        print("(These tags still emit raw; QC will surface them.)")

    print()
    print(f"Summary: {len(sidecars)} sidecars, {len(skipped)} skipped, "
          f"{len(unknown_slug_warnings)} unknown-slug warnings, 0 round-trip mismatches.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
