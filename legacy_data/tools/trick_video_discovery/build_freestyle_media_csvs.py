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

    # --- Asset dedup by URL ---
    assets: dict[str, dict] = {}  # url → asset row
    asset_origin: dict[str, list[dict]] = {}  # url → list of source CSV rows that contributed
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

    # --- Record-match lookup ---
    con = sqlite3.connect(DB_PATH)
    record_match_buckets: Counter = Counter()
    skipped_no_match: list[tuple[str, str]] = []
    skipped_ambiguous: list[tuple[str, str, int]] = []

    # --- Generate links ---
    links: list[dict] = []
    for url, asset in assets.items():
        # one source CSV row per asset (dedup means we pick the first; all share creator+trick)
        src = asset_origin[url][0]
        trick_slug = (src.get("trick_slug") or "").strip()
        creator = (src.get("creator") or "").strip()
        canon = (src.get("canonical_trick_name") or "").strip()
        alias = (src.get("matched_alias") or "").strip()
        start = parse_timestamp(src.get("timestamp", ""))

        # Trick link (created when trick_slug is non-empty)
        if trick_slug:
            links.append({
                "media_id":      asset["id"],
                "entity_type":   "trick",
                "entity_id":     trick_slug,
                "start_seconds": "" if start is None else start,
                "end_seconds":   "",
                "is_primary":    1,
            })

        # Record link (created only on exactly-one match)
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
            record_match_buckets[f"ambiguous"] += 1
            skipped_ambiguous.append((trick_slug, creator, n))

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
