"""
QC: freestyle media coverage + integrity.

Read-only checks against database/footbag.db that surface:
  1. unknown_trick_slug    — trick links pointing at non-existent freestyle_tricks.slug
  2. unknown_record_id     — record links pointing at non-existent freestyle_records.id
  3. unknown_source_id     — assets.source_id not in freestyle_media_sources
  4. duplicate_primary     — more than one is_primary=1 per (entity_type, entity_id)
  5. orphan_asset          — asset with no media_links row
  6. inactive_with_links   — asset with is_active=0 that has at least one link
  7. invalid_timestamp     — start_seconds >= end_seconds, or negative values
  8. coverage_summary      — counts: tricks-with-video, records-with-curated-video, etc.

This is informational; exit code is always 0. Hard-gate semantics (HARD vs WARN)
are reported in the output for human triage but do not affect exit code.

Run from repo root or legacy_data/ with the venv active:
    python legacy_data/pipeline/qc/check_media_coverage.py [--db <path>]
"""

import argparse
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[2]  # qc/ → pipeline/ → legacy_data/ → repo root
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"

SAMPLE_LIMIT = 5  # how many example violations to print per check


def _samples(rows: list, limit: int = SAMPLE_LIMIT) -> str:
    if not rows:
        return ""
    out = []
    for r in rows[:limit]:
        out.append("  - " + ", ".join(f"{k}={v!r}" for k, v in r.items()))
    if len(rows) > limit:
        out.append(f"  ... (+{len(rows) - limit} more)")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="Freestyle media QC")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to SQLite DB")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        return 1

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    print("Freestyle media QC")
    print("=" * 60)

    hard = 0
    warn = 0

    # 1. unknown_trick_slug — HARD
    rows = [dict(r) for r in con.execute("""
        SELECT l.media_id, l.entity_id AS trick_slug
        FROM freestyle_media_links l
        LEFT JOIN freestyle_tricks t ON t.slug = l.entity_id
        WHERE l.entity_type = 'trick' AND t.slug IS NULL
        ORDER BY l.entity_id, l.media_id
    """)]
    print(f"\n[1] unknown_trick_slug              {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 2. unknown_record_id — HARD
    rows = [dict(r) for r in con.execute("""
        SELECT l.media_id, l.entity_id AS record_id
        FROM freestyle_media_links l
        LEFT JOIN freestyle_records r ON r.id = l.entity_id
        WHERE l.entity_type = 'record' AND r.id IS NULL
        ORDER BY l.entity_id, l.media_id
    """)]
    print(f"\n[2] unknown_record_id               {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 3. unknown_source_id — HARD
    rows = [dict(r) for r in con.execute("""
        SELECT a.id AS asset_id, a.source_id
        FROM freestyle_media_assets a
        LEFT JOIN freestyle_media_sources s ON s.source_id = a.source_id
        WHERE a.source_id IS NOT NULL AND s.source_id IS NULL
        ORDER BY a.source_id, a.id
    """)]
    print(f"\n[3] unknown_source_id               {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 4. duplicate_primary — HARD (also blocked by partial unique index, but assert)
    rows = [dict(r) for r in con.execute("""
        SELECT entity_type, entity_id, COUNT(*) AS n_primary
        FROM freestyle_media_links
        WHERE is_primary = 1
        GROUP BY entity_type, entity_id
        HAVING n_primary > 1
        ORDER BY entity_type, entity_id
    """)]
    print(f"\n[4] duplicate_primary               {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 5. orphan_asset — WARN
    rows = [dict(r) for r in con.execute("""
        SELECT a.id, a.url, a.review_status, a.is_active
        FROM freestyle_media_assets a
        LEFT JOIN freestyle_media_links l ON l.media_id = a.id
        WHERE l.media_id IS NULL
        ORDER BY a.id
    """)]
    print(f"\n[5] orphan_asset                    {len(rows):>4}   {'WARN' if rows else 'OK'}")
    if rows:
        warn += 1
        print(_samples(rows))

    # 6. inactive_with_links — WARN
    rows = [dict(r) for r in con.execute("""
        SELECT DISTINCT a.id, a.url, a.review_status
        FROM freestyle_media_assets a
        JOIN freestyle_media_links l ON l.media_id = a.id
        WHERE a.is_active = 0
        ORDER BY a.id
    """)]
    print(f"\n[6] inactive_with_links             {len(rows):>4}   {'WARN' if rows else 'OK'}")
    if rows:
        warn += 1
        print(_samples(rows))

    # 7. invalid_timestamp — HARD
    rows = [dict(r) for r in con.execute("""
        SELECT media_id, entity_type, entity_id, start_seconds, end_seconds
        FROM freestyle_media_links
        WHERE (start_seconds IS NOT NULL AND start_seconds < 0)
           OR (end_seconds   IS NOT NULL AND end_seconds   < 0)
           OR (start_seconds IS NOT NULL AND end_seconds IS NOT NULL
               AND start_seconds >= end_seconds)
        ORDER BY media_id
    """)]
    print(f"\n[7] invalid_timestamp               {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 8. coverage_summary — INFO
    print(f"\n[8] coverage_summary")
    cov = con.execute("""
        SELECT
          (SELECT COUNT(*) FROM freestyle_media_assets)                       AS total_assets,
          (SELECT COUNT(*) FROM freestyle_media_assets WHERE is_active=1)     AS active_assets,
          (SELECT COUNT(*) FROM freestyle_media_links)                        AS total_links,
          (SELECT COUNT(*) FROM freestyle_media_links WHERE entity_type='trick')   AS trick_links,
          (SELECT COUNT(*) FROM freestyle_media_links WHERE entity_type='record') AS record_links,
          (SELECT COUNT(*) FROM freestyle_media_links WHERE entity_type='person') AS person_links,
          (SELECT COUNT(*) FROM freestyle_media_links WHERE entity_type='event')  AS event_links,
          (SELECT COUNT(DISTINCT entity_id) FROM freestyle_media_links WHERE entity_type='trick')  AS distinct_tricks_with_video,
          (SELECT COUNT(DISTINCT entity_id) FROM freestyle_media_links WHERE entity_type='record') AS distinct_records_with_video,
          (SELECT COUNT(DISTINCT creator) FROM freestyle_media_assets WHERE creator IS NOT NULL)   AS distinct_creators
    """).fetchone()
    for k in cov.keys():
        print(f"      {k:<32} {cov[k]}")

    # Records seeded in freestyle_records that lack any media link
    no_media_records = con.execute("""
        SELECT COUNT(*) FROM freestyle_records r
        WHERE NOT EXISTS (
          SELECT 1 FROM freestyle_media_links l
          WHERE l.entity_type='record' AND l.entity_id = r.id
        )
    """).fetchone()[0]
    print(f"      records_without_media            {no_media_records}")

    print("\n" + "=" * 60)
    print(f"Summary: hard={hard}  warn={warn}")

    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
