#!/usr/bin/env python3
"""
build_freestyle_media_csvs.py

Deterministic generator for the three curated freestyle-media CSVs from
the discovery staging file (video_coverage.csv) + source registry
(known_sources.csv) + freestyle_records lookup (database/footbag.db).

Inputs:
  legacy_data/tools/trick_video_discovery/video_coverage.csv     (reviewed=YES rows)
  legacy_data/tools/trick_video_discovery/known_sources.csv      (source registry)
  database/footbag.db                                            (freestyle_records lookup only)

Outputs:
  legacy_data/inputs/curated/media/media_sources.csv
  legacy_data/inputs/curated/media/media_assets.csv
  legacy_data/inputs/curated/media/media_links.csv

Rules (per the task spec):
  - reviewed=YES rows only
  - Deterministic media IDs (UUID5 from URL, standard URL namespace)
  - One asset per unique URL
  - Trick link created when trick_slug is non-empty
  - Record link ONLY when (display_name = creator) AND (trick_name in
    {canonical_trick_name, matched_alias}) yields exactly one freestyle_records row
  - Never fabricate a record id

Run from repo root or legacy_data/.
"""

from __future__ import annotations

import csv
import sqlite3
import sys
import uuid
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = REPO_ROOT / "database" / "footbag.db"
COVERAGE_CSV = REPO_ROOT / "legacy_data" / "tools" / "trick_video_discovery" / "video_coverage.csv"
SOURCES_CSV = REPO_ROOT / "legacy_data" / "tools" / "trick_video_discovery" / "known_sources.csv"
CANDIDATES_CSV = REPO_ROOT / "legacy_data" / "tools" / "trick_video_discovery" / "snippet_candidates.csv"
OUT_DIR = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "media"

NAMESPACE_URL = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # RFC 4122 standard URL namespace
SOURCE_ID_FOR_PASSBACK = "passback_records"


def parse_timestamp(s: str) -> int | None:
    s = (s or "").strip()
    if not s:
        return None
    parts = s.split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return None
    return None


def media_id_for(url: str) -> str:
    return str(uuid.uuid5(NAMESPACE_URL, url.strip()))


def main() -> int:
    if not DB_PATH.exists():
        print(f"ERROR: {DB_PATH} not found", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # --- Source registry: project known_sources.csv → schema columns ---
    source_rows = []
    with open(SOURCES_CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            source_rows.append({
                "source_id":   r["source_id"],
                "source_name": r["source_name"],
                "source_type": r["source_type"],
                "url":         r.get("url", ""),
                "creator":     r.get("creator", ""),
            })

    # --- Reviewed=YES rows from video_coverage.csv ---
    with open(COVERAGE_CSV, newline="", encoding="utf-8") as f:
        reviewed = [r for r in csv.DictReader(f) if (r.get("reviewed") or "").strip().upper() == "YES"]

    # --- Signed-off rows from snippet_candidates.csv (reviewer != '') ---
    candidates: list[dict] = []
    if CANDIDATES_CSV.exists():
        with open(CANDIDATES_CSV, newline="", encoding="utf-8") as f:
            candidates = [r for r in csv.DictReader(f) if (r.get("reviewer") or "").strip()]

    # --- Asset dedup by URL ---
    # Two inbound lanes:
    #   (a) video_coverage.csv reviewed=YES — record-clip lane (existing 38)
    #   (b) snippet_candidates.csv reviewer != '' — Option-B trick-tutorial lane (new)
    # Both keyed by URL; same URL appearing in both lanes deduplicates to one asset.
    assets: dict[str, dict] = {}
    asset_origin: dict[str, list[dict]] = {}
    candidate_rows_by_url: dict[str, list[dict]] = {}

    # Lane (a): record clips from video_coverage.csv
    for r in reviewed:
        url = (r.get("url") or "").strip()
        if not url:
            continue
        if url not in assets:
            assets[url] = {
                "id":            media_id_for(url),
                "media_type":    "video",
                "url":           url,
                "title":         (r.get("title") or "").strip(),
                "creator":       (r.get("creator") or "").strip(),
                "source_id":     SOURCE_ID_FOR_PASSBACK,
                "review_status": "curated",
                "is_active":     1,
            }
            asset_origin[url] = []
        asset_origin[url].append(r)

    # Lane (b): trick tutorials from snippet_candidates.csv
    for r in candidates:
        url = (r.get("url") or "").strip()
        if not url:
            continue
        confidence = (r.get("confidence") or "").strip().lower()
        is_active = 1 if confidence in ("high", "medium") else 0
        review_status = "curated" if is_active else "pending"
        # Title: "{trick_slug} {clip_type}" or "{trick_slug} {clip_type} by {player}"
        clip_type = (r.get("clip_type") or "").strip() or "clip"
        player_name = (r.get("player_name") or "").strip()
        title_base = f"{r.get('trick_slug', '').strip()} {clip_type}".strip()
        title = f"{title_base} by {player_name}" if player_name else title_base
        if url not in assets:
            assets[url] = {
                "id":            media_id_for(url),
                "media_type":    "video",
                "url":           url,
                "title":         title,
                "creator":       player_name,
                "source_id":     (r.get("source_id") or "").strip(),
                "review_status": review_status,
                "is_active":     is_active,
            }
            asset_origin[url] = []
        candidate_rows_by_url.setdefault(url, []).append(r)
        asset_origin[url].append(r)

    # --- Record-match lookup ---
    con = sqlite3.connect(DB_PATH)
    record_match_buckets: Counter = Counter()
    skipped_no_match: list[tuple[str, str]] = []
    skipped_ambiguous: list[tuple[str, str, int]] = []

    # --- Generate links (two lanes) ---
    links: list[dict] = []

    # Lane (a): record-clip links from video_coverage.csv reviewed=YES rows.
    for r in reviewed:
        url = (r.get("url") or "").strip()
        if not url:
            continue
        asset = assets[url]
        trick_slug = (r.get("trick_slug") or "").strip()
        creator = (r.get("creator") or "").strip()
        canon = (r.get("canonical_trick_name") or "").strip()
        alias = (r.get("matched_alias") or "").strip()
        start = parse_timestamp(r.get("timestamp", ""))

        if trick_slug:
            links.append({
                "media_id":      asset["id"],
                "entity_type":   "trick",
                "entity_id":     trick_slug,
                "start_seconds": "" if start is None else start,
                "end_seconds":   "",
                "is_primary":    1,
            })

        cur = con.execute("""
          SELECT id FROM freestyle_records
          WHERE LOWER(display_name) = LOWER(?)
            AND (LOWER(trick_name) = LOWER(?) OR LOWER(trick_name) = LOWER(?))
        """, (creator, canon, alias))
        record_ids = [row[0] for row in cur.fetchall()]
        n = len(record_ids)
        if n == 1:
            record_match_buckets["exact_one"] += 1
            links.append({
                "media_id":      asset["id"],
                "entity_type":   "record",
                "entity_id":     record_ids[0],
                "start_seconds": "" if start is None else start,
                "end_seconds":   "",
                "is_primary":    1,
            })
        elif n == 0:
            record_match_buckets["zero"] += 1
            skipped_no_match.append((trick_slug, creator))
        else:
            record_match_buckets["ambiguous"] += 1
            skipped_ambiguous.append((trick_slug, creator, n))

    # Lane (b): trick-tutorial links from snippet_candidates.csv signed-off rows.
    # Multiple candidates per URL → multiple trick links (supports Option A reels).
    for r in candidates:
        url = (r.get("url") or "").strip()
        if not url or url not in assets:
            continue
        asset = assets[url]
        trick_slug = (r.get("trick_slug") or "").strip()
        if not trick_slug:
            continue
        s = (r.get("start_seconds") or "").strip()
        e = (r.get("end_seconds") or "").strip()
        links.append({
            "media_id":      asset["id"],
            "entity_type":   "trick",
            "entity_id":     trick_slug,
            "start_seconds": s if s else "",
            "end_seconds":   e if e else "",
            "is_primary":    1,
        })

    # --- Demote duplicate primaries: at most one is_primary=1 per (entity_type, entity_id) ---
    # The schema enforces this via partial unique index. Deterministic rule:
    # for each colliding group, the asset whose linked record has the highest
    # value_numeric wins (best record's clip = trick-primary). Tiebreak: media_id asc.
    record_value: dict[str, float] = {}
    for rid, vnum in con.execute("SELECT id, value_numeric FROM freestyle_records").fetchall():
        record_value[rid] = float(vnum) if vnum is not None else 0.0
    asset_score: dict[str, float] = {}
    for l in links:
        if l["entity_type"] == "record":
            asset_score[l["media_id"]] = max(asset_score.get(l["media_id"], 0.0),
                                             record_value.get(l["entity_id"], 0.0))

    primary_demotions = 0
    from collections import defaultdict as _dd
    for et in ("trick", "record"):
        groups: dict[str, list[dict]] = _dd(list)
        for l in links:
            if l["entity_type"] == et and l["is_primary"] == 1:
                groups[l["entity_id"]].append(l)
        for entity_id, group in groups.items():
            if len(group) <= 1:
                continue
            group.sort(key=lambda l: (-asset_score.get(l["media_id"], 0.0), l["media_id"]))
            for l in group[1:]:
                l["is_primary"] = 0
                primary_demotions += 1

    con.close()

    # --- Sort outputs deterministically ---
    source_rows.sort(key=lambda r: r["source_id"])
    asset_list = sorted(assets.values(), key=lambda r: r["id"])
    links.sort(key=lambda r: (r["media_id"], r["entity_type"], r["entity_id"]))

    # --- Write CSVs (LF line endings) ---
    sources_path = OUT_DIR / "media_sources.csv"
    assets_path  = OUT_DIR / "media_assets.csv"
    links_path   = OUT_DIR / "media_links.csv"

    with open(sources_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["source_id","source_name","source_type","url","creator"], lineterminator="\n")
        w.writeheader(); w.writerows(source_rows)

    with open(assets_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["id","media_type","url","title","creator","source_id","review_status","is_active"], lineterminator="\n")
        w.writeheader(); w.writerows(asset_list)

    with open(links_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["media_id","entity_type","entity_id","start_seconds","end_seconds","is_primary"], lineterminator="\n")
        w.writeheader(); w.writerows(links)

    # --- Report ---
    print("Freestyle media CSV generation report")
    print("=" * 60)
    print(f"Inputs:")
    print(f"  reviewed=YES rows in video_coverage.csv : {len(reviewed)}")
    print(f"  source registry rows                    : {len(source_rows)}")
    print()
    print(f"Outputs:")
    print(f"  {sources_path.relative_to(REPO_ROOT)}                 : {len(source_rows)} rows")
    print(f"  {assets_path.relative_to(REPO_ROOT)}                  : {len(asset_list)} rows")
    print(f"  {links_path.relative_to(REPO_ROOT)}                   : {len(links)} rows")
    print()
    print(f"Link breakdown:")
    print(f"  trick links  : {sum(1 for l in links if l['entity_type']=='trick')}")
    print(f"  record links : {sum(1 for l in links if l['entity_type']=='record')}")
    print()
    print(f"Record-match distribution across {len(reviewed)} reviewed=YES rows:")
    for k, v in sorted(record_match_buckets.items()):
        print(f"  {k:<14} : {v}")
    print()
    if primary_demotions:
        print(f"Primary demotions (multiple assets per entity): {primary_demotions}")
        print()

    if skipped_no_match:
        print(f"Skipped record link — no freestyle_records match ({len(skipped_no_match)}):")
        for slug, creator in skipped_no_match:
            print(f"  trick_slug={slug!r}  creator={creator!r}")
    if skipped_ambiguous:
        print()
        print(f"Skipped record link — ambiguous match ({len(skipped_ambiguous)}):")
        for slug, creator, n in skipped_ambiguous:
            print(f"  trick_slug={slug!r}  creator={creator!r}  matches={n}")
    print()
    print(f"Sample assets (first 3):")
    for a in asset_list[:3]:
        print(f"  id={a['id']}  url={a['url']}  title={a['title']!r}")
    print()
    print(f"Sample links (first 6):")
    for l in links[:6]:
        print(f"  media_id={l['media_id']}  {l['entity_type']:<6}={l['entity_id']:<25}  start={l['start_seconds']!s:<5}  primary={l['is_primary']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
