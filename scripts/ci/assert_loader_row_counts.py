#!/usr/bin/env python3
"""Assert post-load row counts for the loader regression CI gate.

Runs after `bash scripts/reset-local-db.sh` against the tiny fixture set.
For every table any loader writes to, asserts:

  1. The table exists in the DB (catches schema drift).
  2. Row count >= MIN_ROWS threshold (catches silent INSERT OR IGNORE skips
     of the kind that produced the 311-row legacy_club_candidates incident
     on 2026-04-28; see legacy_data/IMPLEMENTATION_PLAN.md active item 2).

Exits 1 on any failure. Prints a summary table either way.

Thresholds are hand-tuned against the fixture in
legacy_data/tests/fixtures/. They are floors, not exact counts: extra rows
from the synthetic fixture in 08_load_mvfp_seed_full_to_sqlite.py or from
real curated inputs (records, tricks, media, name_variants) are expected
and welcomed. Tighten a threshold only when you've confirmed the new
expected count is stable across the fixture's intended domain.
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
    Expectation("freestyle_tricks", 30, "from committed inputs/noise/tricks.csv + script 19"),
    Expectation("freestyle_trick_modifiers", 5, "from committed inputs/noise/trick_modifiers.csv"),
    Expectation("freestyle_trick_sources", 1, "scripts 17/19/20 register source rows"),
    Expectation("freestyle_trick_source_links", 5, "per-trick provenance from 17/19; 20 layers more"),
    Expectation("freestyle_trick_aliases", 5, "from committed inputs/noise/trick_aliases.csv"),
    # Step 7: 19_load_red_additions.py
    Expectation("freestyle_trick_modifier_links", 1, "Red expert-review modifier links"),
    # Step 9-11: 21/22/23 freestyle media loaders
    Expectation("freestyle_media_sources", 1, "from committed inputs/curated/media/media_sources.csv"),
    Expectation("freestyle_media_assets", 1, "from committed inputs/curated/media/media_assets.csv"),
    Expectation("freestyle_media_links", 1, "from committed inputs/curated/media/media_links.csv"),
    # Step 12: load_name_variants_seed.py
    Expectation("name_variants", 50, "from committed inputs/name_variants.csv (HIGH-confidence)"),
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
    # Step 20: seed_members.py
    Expectation("members", 1, "exactly 1 seeded account: Footbag Hacky"),
]


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    )
    return cur.fetchone() is not None


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

    conn.close()

    name_w = max(len(r[1]) for r in rows)
    print()
    print(f"  {'res':<4}  {'table':<{name_w}}  {'rows':>8}  {'min':>6}  note")
    print(f"  {'-'*4}  {'-'*name_w}  {'-'*8}  {'-'*6}  ----")
    for res, table, count, min_rows, note in rows:
        print(f"  {res:<4}  {table:<{name_w}}  {count:>8}  {min_rows:>6}  {note}")
    print()

    if failures:
        print(f"FAILED: {len(failures)} of {len(EXPECTATIONS)} table assertions:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1

    print(f"PASSED: all {len(EXPECTATIONS)} table assertions met thresholds.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
