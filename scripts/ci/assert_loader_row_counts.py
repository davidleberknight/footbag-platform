#!/usr/bin/env python3
"""Assert post-load row counts for the loader regression CI gate.

Runs after `bash scripts/reset-local-db.sh` against the committed canonical dataset.
For every table any loader writes to, asserts:

  1. The table exists in the DB (catches schema drift).
  2. Row count >= MIN_ROWS threshold (catches silent INSERT OR IGNORE skips
     that leave a table drastically undercounted while the load still
     exits zero).

Exits 1 on any failure. Prints a summary table either way.

Thresholds are floors, not exact counts: the committed canonical dataset and
the committed curated inputs (records, tricks, media, name_variants) sit well
above them, so extra rows are expected and welcomed. Tighten a threshold only
when you've confirmed the new expected count is stable.
"""

import argparse
import os
import sqlite3
import sys
from typing import NamedTuple


class Expectation(NamedTuple):
    table: str
    min_rows: int
    note: str


# Ordered roughly by load step. The note explains why the threshold is what
# it is and which loader is the primary writer.
EXPECTATIONS: list[Expectation] = [
    # Step 1: load_legacy_members_seed.py
    Expectation("legacy_members", 5, "5 mids from showmembers fixture; 3 also present in persons.csv"),
    # Step 3: 08_load_mvfp_seed_full_to_sqlite.py
    Expectation("tags", 3, "08 hashtag tags + load_clubs_seed country tags + 08 synthetic"),
    Expectation("events", 5, "5 fixture events + 1 synthetic from 08"),
    Expectation("event_disciplines", 8, "12 fixture rows; 07 may filter sparse; +1 synthetic"),
    Expectation("event_result_entries", 10, "16 fixture results +1 synthetic"),
    Expectation("event_result_entry_participants", 15, "23 fixture rows +1 synthetic"),
    Expectation("historical_persons", 5, "8 fixture persons +1 synthetic Footbag Hacky"),
    # Step 4: 10_load_freestyle_records_to_sqlite.py
    Expectation("freestyle_records", 50, "from committed records_master.csv; floor reflects real data"),
    # Step 5: 11_load_consecutive_records_to_sqlite.py
    Expectation("consecutive_kicks_records", 10, "from committed consecutives_records.csv"),
    # Step 6: 17_load_trick_dictionary.py
    Expectation("freestyle_tricks", 30, "from committed inputs/base_dictionary/tricks.csv + script 19"),
    Expectation("freestyle_trick_modifiers", 5, "from committed inputs/base_dictionary/trick_modifiers.csv"),
    Expectation("freestyle_trick_sources", 1, "scripts 17/19/20 register source rows"),
    Expectation("freestyle_trick_source_links", 5, "per-trick provenance from 17/19; 20 layers more"),
    Expectation("freestyle_trick_aliases", 5, "from committed inputs/base_dictionary/trick_aliases.csv"),
    # Step 7: 19_load_red_additions.py
    Expectation("freestyle_trick_modifier_links", 1, "Red expert-review modifier links"),
    # Step 12: load_name_variants_seed.py
    Expectation("name_variants", 50, "from committed inputs/name_variants.csv (HIGH-confidence)"),
    # Step 12b: load_given_name_variants_to_sqlite.py
    Expectation("given_name_variants", 10, "from committed inputs/curated/given_name_variants.csv"),
    # Step 13: 12_build_net_discipline_groups.py
    Expectation("net_discipline_group", 1, "fixture has net disciplines so groups must build"),
    Expectation("net_stat_policy", 4, "exactly 4 registry rows by design"),
    # Step 14: 13_build_net_teams.py
    Expectation("net_team", 2, "4 doubles_net result pairs in fixture form distinct teams"),
    Expectation("net_team_member", 4, "2 members per team"),
    Expectation("net_team_appearance", 2, "1 appearance per team-event"),
    Expectation("net_review_queue", 1, "stage2_qc_issues stub + script 13 QC findings"),
    # Step 17: load_clubs_seed.py
    Expectation("clubs", 3, "3 clubs from mirror fixture"),
    # Step 19: load_club_members_seed.py — THE REGRESSION-PRECEDENT TABLE
    Expectation("legacy_club_candidates", 3, "5 unique mirror_member_ids in showmembers fixture; floor at 3 to catch IGNORE skips"),
    Expectation("legacy_person_club_affiliations", 3, "5 club_members rows in fixture; floor at 3"),
    # Step 20: seed_fh_curator.py (FH member creation)
    Expectation("members", 1, "exactly 1 seeded account: Footbag Hacky"),
]


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    )
    return cur.fetchone() is not None


def find_fixture_clubs(conn: sqlite3.Connection) -> list:
    """Return any club that looks like a test fixture.

    Test factories write real `clubs` rows, and the production leak was these
    runtime-created rows, identified in the wild by their 'club_test_' slug/id.
    A deployable DB must carry none of them, so this rejects three independent
    fixture signals, most authoritative first:
      - the 'club-test-' internal id prefix that every factory club carries
        (both the reserved-tag default and the publicly-visible opt-out), which
        is the strongest signal that a row was test-created;
      - the reserved '#club_test_' public tag namespace the public directory
        excludes;
      - the 'Testville' factory default city, a secondary diagnostic.
    Each returned row is (id, name, city, tag_normalized).
    """
    return conn.execute(
        r"""
        SELECT c.id, c.name, c.city, t.tag_normalized
          FROM clubs c
          JOIN tags t ON t.id = c.hashtag_tag_id
         WHERE t.is_standard = 1 AND t.standard_type = 'club'
           AND (c.id LIKE 'club-test-%'
                OR t.tag_normalized LIKE '#club\_test\_%' ESCAPE '\'
                OR c.city = 'Testville')
        """
    ).fetchall()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "./database/footbag.db"),
        help="Path to SQLite database (default: $FOOTBAG_DB_PATH or ./database/footbag.db)",
    )
    args = ap.parse_args()

    if not os.path.isfile(args.db):
        print(f"ERROR: DB not found at {args.db}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)

    failures: list[str] = []
    rows: list[tuple[str, str, int, int, str]] = []

    for exp in EXPECTATIONS:
        if not table_exists(conn, exp.table):
            failures.append(f"MISSING TABLE: {exp.table}")
            rows.append(("MISS", exp.table, 0, exp.min_rows, exp.note))
            continue

        try:
            (count,) = conn.execute(f"SELECT COUNT(*) FROM {exp.table}").fetchone()
        except sqlite3.Error as e:
            failures.append(f"QUERY FAILED on {exp.table}: {e}")
            rows.append(("ERR ", exp.table, 0, exp.min_rows, exp.note))
            continue

        if count < exp.min_rows:
            failures.append(f"BELOW THRESHOLD: {exp.table} has {count} rows, need >= {exp.min_rows}")
            rows.append(("FAIL", exp.table, count, exp.min_rows, exp.note))
        else:
            rows.append((" OK ", exp.table, count, exp.min_rows, exp.note))

    # Curator-tag invariant. Every active non-avatar media_items row
    # owned by a is_system=1 member must carry a `#curated` media_tags
    # entry. If the seeder forgets to auto-prepend `#curated` for any
    # code path (CURATOR_ITEMS, file-paired sidecars, url-reference
    # sidecars), FH-owned named galleries that filter by `#curated`
    # silently render zero items. Avatars (is_avatar=1) are a separate
    # category and carry no tags by design. Member-owned rows are
    # excluded entirely.
    try:
        leaks = conn.execute(
            """
            SELECT mi.id, mi.source_filename, mi.video_url
              FROM media_items mi
              JOIN members m ON m.id = mi.uploader_member_id
             WHERE m.is_system = 1
               AND mi.moderation_status = 'active'
               AND mi.is_avatar = 0
               AND NOT EXISTS (
                 SELECT 1
                   FROM media_tags mt
                   JOIN tags t ON t.id = mt.tag_id
                  WHERE mt.media_id = mi.id
                    AND t.tag_normalized = '#curated'
               )
            """
        ).fetchall()
        if leaks:
            failures.append(
                f"#curated tag missing on {len(leaks)} system-owned active media row(s); "
                f"first: id={leaks[0][0]} source_filename={leaks[0][1]!r} video_url={leaks[0][2]!r}"
            )
    except sqlite3.Error as e:
        failures.append(f"QUERY FAILED on #curated invariant: {e}")

    # Avatar tag invariant. Avatars carry exactly one tag: the
    # `#by_<owner_slug>` uploader marker. Catches regressions in either
    # direction (no tag, multiple tags, wrong tag). Without the marker,
    # the avatar fails the personal-gallery query that every other
    # member-uploaded item passes.
    try:
        avatar_leaks = conn.execute(
            """
            SELECT mi.id, m.slug,
                   (SELECT COUNT(*) FROM media_tags mt WHERE mt.media_id = mi.id) AS tag_count,
                   (SELECT GROUP_CONCAT(t.tag_normalized) FROM media_tags mt
                       JOIN tags t ON t.id = mt.tag_id
                      WHERE mt.media_id = mi.id) AS tags
              FROM media_items mi
              JOIN members m ON m.id = mi.uploader_member_id
             WHERE mi.is_avatar = 1
               AND mi.moderation_status = 'active'
            """
        ).fetchall()
        for media_id, slug, tag_count, tags in avatar_leaks:
            expected = f"#by_{slug.lower()}"
            if tag_count != 1 or tags != expected:
                failures.append(
                    f"avatar tag invariant violated on id={media_id} slug={slug!r}: "
                    f"expected exactly [{expected!r}], got {tag_count} tag(s) {tags!r}"
                )
    except sqlite3.Error as e:
        failures.append(f"QUERY FAILED on avatar invariant: {e}")

    # Fixture-club invariant. No deployable DB may carry a test-fixture club in
    # the public standard-club-tag namespace; the public directory read excludes
    # them, and this is the build-time backstop that fails loudly on any
    # persona/dev-seeder contamination.
    try:
        fixture_clubs = find_fixture_clubs(conn)
        if fixture_clubs:
            failures.append(
                f"{len(fixture_clubs)} test-fixture club(s) present in a deployable DB; "
                f"first: id={fixture_clubs[0][0]} name={fixture_clubs[0][1]!r} "
                f"city={fixture_clubs[0][2]!r} tag={fixture_clubs[0][3]!r}"
            )
    except sqlite3.Error as e:
        failures.append(f"QUERY FAILED on fixture-club invariant: {e}")

    conn.close()

    name_w = max(len(r[1]) for r in rows)
    print()
    print(f"  {'res':<4}  {'table':<{name_w}}  {'rows':>8}  {'min':>6}  note")
    print(f"  {'-'*4}  {'-'*name_w}  {'-'*8}  {'-'*6}  ----")
    for res, table, count, min_rows, note in rows:
        print(f"  {res:<4}  {table:<{name_w}}  {count:>8}  {min_rows:>6}  {note}")
    print()

    if failures:
        print(f"FAILED: {len(failures)} assertion(s):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1

    print(f"PASSED: all {len(EXPECTATIONS)} table assertions + #curated, avatar, and fixture-club invariants met.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
