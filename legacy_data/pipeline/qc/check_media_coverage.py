"""
QC: curator media coverage + integrity.

Slice 2 retarget: queries the new media_items + media_tags + media_sources
surface owned by the system member (Footbag Hacky). The legacy curator media
tables were removed in Phase E; coverage shifts from the old link-based model
("primary video per entity") to a tag-driven gallery model ("at least one
curator-tagged video per trick"). Primary-video and orphan-with-link concepts
are dropped — both are absorbed by the gallery contract and the new seeder
invariants.

What "curator media" means here:
  media_items rows where uploader_member_id == <system-member-id> AND
  moderation_status='active'. The #curated tag is the seeder-enforced
  semantic marker; check 4 below asserts every such row carries it.

Read-only checks:
  1. unknown_trick_slug              HARD — non-aux trick-shaped tags whose
                                            slug isn't in freestyle_tricks
  2. unknown_source_id               HARD — media_items.source_id not in
                                            media_sources (CHECK + FK should
                                            prevent; defense-in-depth)
  3. invalid_timestamp               HARD — media_items clip range violates
                                            start>=0 / end>=0 / start<end
                                            (CHECK should prevent; assert)
  4. missing_curated_tag             HARD — curator media item lacks #curated
                                            (seeder auto-prepend invariant)
  5. no_canonical_trick_tag          HARD — curator media item with zero
                                            tags whose slug is in
                                            freestyle_tricks.slug; gallery
                                            contract violation
  6. records_without_curator_video   INFO — records whose parent trick has
                                            no curator-tagged video; coverage
                                            gap, not corruption
  7. coverage_summary                INFO — counts and rollups

Exit code is always 0 (informational). HARD vs WARN/INFO is reported in the
output for triage; nothing here gates a build directly.

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
REPO_ROOT = SCRIPT_DIR.parents[2]  # qc/ -> pipeline/ -> legacy_data/ -> repo root
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"

SAMPLE_LIMIT = 5  # how many example violations to print per check

# Tags that aren't trick references; excluded from unknown_trick_slug check.
AUX_TAGS = {"#curated", "#freestyle", "#trick"}


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
    parser = argparse.ArgumentParser(description="Curator media QC")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to SQLite DB")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        return 1

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    fh_row = con.execute("SELECT id FROM members WHERE is_system = 1").fetchone()
    if fh_row is None:
        print("ERROR: no system member row (is_system=1).", file=sys.stderr)
        return 1
    fh_id = fh_row["id"]

    print("Curator media QC")
    print("=" * 60)
    print(f"  system member id: {fh_id}")

    hard = 0
    warn = 0

    # 1. unknown_trick_slug — HARD
    # Scoped to freestyle-gallery items only: a media row in the freestyle
    # gallery is identified by carrying both #freestyle and #trick (the
    # migration's auto-prepend for freestyle reference videos). Any non-aux
    # tag on such a row is assumed to reference a freestyle trick; its slug
    # must exist in freestyle_tricks.slug.
    #
    # Items in other namespaces (demo loops with #demo_*, avatars with
    # no tags, event photos with #event_*) live outside the freestyle
    # gallery and are not subject to this check.
    #
    # Person tags (bare-slug member references) arrive in Slice 4; if
    # those eventually appear inside freestyle-tagged items, this check
    # needs an extension to also accept members.slug values.
    rows = [dict(r) for r in con.execute("""
        SELECT mt.tag_display, mi.id AS media_id, mi.video_url
        FROM media_tags mt
        JOIN media_items mi ON mi.id = mt.media_id
        WHERE mi.uploader_member_id = ?
          AND mi.id IN (
            SELECT media_id FROM media_tags WHERE tag_display = '#freestyle'
            INTERSECT
            SELECT media_id FROM media_tags WHERE tag_display = '#trick'
          )
          AND mt.tag_display NOT IN ('#curated','#freestyle','#trick')
          AND substr(mt.tag_display, 2) NOT IN (SELECT slug FROM freestyle_tricks)
        ORDER BY mt.tag_display, mi.id
    """, (fh_id,))]
    print(f"\n[1] unknown_trick_slug              {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 2. unknown_source_id — HARD
    # FK + populated media_sources should make this impossible; this is a
    # defense-in-depth assertion against schema/loader drift.
    rows = [dict(r) for r in con.execute("""
        SELECT mi.id AS media_id, mi.source_id
        FROM media_items mi
        LEFT JOIN media_sources ms ON ms.source_id = mi.source_id
        WHERE mi.uploader_member_id = ?
          AND mi.source_id IS NOT NULL
          AND ms.source_id IS NULL
        ORDER BY mi.source_id, mi.id
    """, (fh_id,))]
    print(f"\n[2] unknown_source_id               {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 3. invalid_timestamp — HARD
    # Schema CHECK constraints should prevent these; assert anyway.
    rows = [dict(r) for r in con.execute("""
        SELECT id AS media_id, start_seconds, end_seconds, video_url
        FROM media_items
        WHERE uploader_member_id = ?
          AND ((start_seconds IS NOT NULL AND start_seconds < 0)
            OR (end_seconds   IS NOT NULL AND end_seconds   < 0)
            OR (start_seconds IS NOT NULL AND end_seconds IS NOT NULL
                AND start_seconds >= end_seconds))
        ORDER BY id
    """, (fh_id,))]
    print(f"\n[3] invalid_timestamp               {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 4. missing_curated_tag — HARD
    # Seeder invariant: every URL-reference video media_item owned by the
    # system member must carry #curated. Anchors the "curator content" filter
    # used by gallery queries and downstream services.
    rows = [dict(r) for r in con.execute("""
        SELECT mi.id AS media_id, mi.video_url, mi.video_platform
        FROM media_items mi
        WHERE mi.uploader_member_id = ?
          AND mi.media_type = 'video'
          AND mi.video_platform IN ('youtube','vimeo')
          AND NOT EXISTS (
            SELECT 1 FROM media_tags mt
            WHERE mt.media_id = mi.id AND mt.tag_display = '#curated'
          )
        ORDER BY mi.id
    """, (fh_id,))]
    print(f"\n[4] missing_curated_tag             {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 5. no_canonical_trick_tag — HARD
    # Gallery contract: every freestyle-gallery media row must carry at
    # least one tag whose slug (post-#-strip) exists in freestyle_tricks.slug.
    # Otherwise the asset is unreachable from any trick page. Migration-time
    # invariant in scripts/migrate-freestyle-media-to-curated.py; QC asserts
    # it post-load.
    #
    # Scoped to freestyle-gallery items only (must carry both #freestyle AND
    # #trick). Demo loops, avatars, and event photos live in other tag
    # namespaces and are not subject to this contract.
    rows = [dict(r) for r in con.execute("""
        SELECT mi.id AS media_id, mi.video_url
        FROM media_items mi
        WHERE mi.uploader_member_id = ?
          AND mi.id IN (
            SELECT media_id FROM media_tags WHERE tag_display = '#freestyle'
            INTERSECT
            SELECT media_id FROM media_tags WHERE tag_display = '#trick'
          )
          AND NOT EXISTS (
            SELECT 1 FROM media_tags mt
            WHERE mt.media_id = mi.id
              AND mt.tag_display NOT IN ('#curated','#freestyle','#trick')
              AND substr(mt.tag_display, 2) IN (SELECT slug FROM freestyle_tricks)
          )
        ORDER BY mi.id
    """, (fh_id,))]
    print(f"\n[5] no_canonical_trick_tag          {len(rows):>4}   {'HARD' if rows else 'OK'}")
    if rows:
        hard += 1
        print(_samples(rows))

    # 6. records_without_curator_video — INFO
    # Coverage gap, not corruption. A record's parent trick is recovered via
    # the same lower+slugify rule the loader uses (freestyle_records.trick_name
    # has display casing like "Ripwalk"; canonicalize via alias map). A record
    # has coverage iff there's at least one curator-tagged media tagged with
    # the parent trick's canonical slug.
    rows = [dict(r) for r in con.execute("""
        WITH record_parent AS (
          SELECT
            r.id AS record_id,
            r.trick_name,
            -- Map display name -> slug via the alias-aware path:
            -- 1. lowercase + non-alnum->'-' + strip,
            -- 2. resolve via freestyle_trick_aliases if present,
            -- 3. final slug must be in freestyle_tricks.slug for the join below.
            COALESCE(
              (SELECT a.trick_slug FROM freestyle_trick_aliases a
                WHERE a.alias_slug = LOWER(REPLACE(REPLACE(REPLACE(r.trick_name,' ','-'),'''',''),'.',''))),
              LOWER(REPLACE(REPLACE(REPLACE(r.trick_name,' ','-'),'''',''),'.',''))
            ) AS parent_slug
          FROM freestyle_records r
        )
        SELECT rp.record_id, rp.trick_name, rp.parent_slug
        FROM record_parent rp
        WHERE NOT EXISTS (
          SELECT 1 FROM media_items mi
          JOIN media_tags mt ON mt.media_id = mi.id
          WHERE mi.uploader_member_id = ?
            AND mt.tag_display = '#' || rp.parent_slug
        )
        ORDER BY rp.parent_slug, rp.record_id
    """, (fh_id,))]
    print(f"\n[6] records_without_curator_video   {len(rows):>4}   {'INFO' if rows else 'OK'}")
    if rows:
        # INFO; do not bump hard or warn.
        print(_samples(rows))

    # 7. coverage_summary — INFO
    print(f"\n[7] coverage_summary")
    cov = con.execute("""
        SELECT
          (SELECT COUNT(*) FROM media_items
           WHERE uploader_member_id=? AND moderation_status='active')         AS curator_active_total,
          (SELECT COUNT(*) FROM media_items
           WHERE uploader_member_id=? AND moderation_status='active'
             AND media_type='video')                                          AS curator_active_videos,
          (SELECT COUNT(*) FROM media_items
           WHERE uploader_member_id=? AND moderation_status='active'
             AND video_platform IN ('youtube','vimeo'))                       AS url_ref_videos,
          (SELECT COUNT(DISTINCT mi.id) FROM media_items mi
           JOIN media_tags mt ON mt.media_id=mi.id
           WHERE mi.uploader_member_id=? AND mt.tag_display='#curated')       AS curated_tagged,
          (SELECT COUNT(DISTINCT substr(mt.tag_display,2)) FROM media_tags mt
           JOIN media_items mi ON mi.id=mt.media_id
           WHERE mi.uploader_member_id=?
             AND mt.tag_display NOT IN ('#curated','#freestyle','#trick')
             AND substr(mt.tag_display,2) IN (SELECT slug FROM freestyle_tricks)
          )                                                                   AS distinct_tricks_with_video,
          (SELECT COUNT(*) FROM freestyle_tricks WHERE is_active=1)           AS active_tricks_total,
          (SELECT COUNT(*) FROM media_sources)                                AS source_registry_size
    """, (fh_id, fh_id, fh_id, fh_id, fh_id)).fetchone()
    for k in cov.keys():
        print(f"      {k:<32} {cov[k]}")

    # Records-coverage rollup
    cov_records = con.execute("""
        WITH record_parent AS (
          SELECT r.id, r.trick_name,
            COALESCE(
              (SELECT a.trick_slug FROM freestyle_trick_aliases a
                WHERE a.alias_slug = LOWER(REPLACE(REPLACE(REPLACE(r.trick_name,' ','-'),'''',''),'.',''))),
              LOWER(REPLACE(REPLACE(REPLACE(r.trick_name,' ','-'),'''',''),'.',''))
            ) AS parent_slug
          FROM freestyle_records r
        )
        SELECT
          (SELECT COUNT(*) FROM freestyle_records)                            AS records_total,
          (SELECT COUNT(*) FROM record_parent rp
            WHERE EXISTS (SELECT 1 FROM media_items mi
                          JOIN media_tags mt ON mt.media_id=mi.id
                          WHERE mi.uploader_member_id=?
                            AND mt.tag_display = '#' || rp.parent_slug))      AS records_with_video
    """, (fh_id,)).fetchone()
    for k in cov_records.keys():
        print(f"      {k:<32} {cov_records[k]}")

    print("\n" + "=" * 60)
    print(f"Summary: hard={hard}  warn={warn}")

    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
