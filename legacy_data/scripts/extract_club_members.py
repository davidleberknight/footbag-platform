#!/usr/bin/env python3
"""Extract club member data from legacy mirror into legacy_data/seed/club_members.csv.

Walks all clubs/show/*/showmembers/index.html pages under the mirror, parses
member rows, and writes a CSV. Idempotent: skips if the output CSV is newer
than this script, which --force overrides. --out-dir sends the CSV somewhere
other than the committed seed directory, which is what a run comparing fresh
output against the committed copy needs.

The legacy_club_key used here is the directory name under clubs/show/ (numeric
or slug), matching the key produced by extract_clubs.py so the two CSVs join
correctly in load_club_members_seed.py.

Output columns:
  legacy_club_key, mirror_member_id, display_name, alias
"""

import argparse
import csv
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

# Resolve the sibling helper whether this file is run as a script or imported.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extractor_output import (  # noqa: E402
    EXIT_INVALID_OUTPUT,
    OutputDestinationError,
    add_output_arguments,
    decide_regeneration,
    prepare_output_target,
    resolve_output_dir,
    skip_exit_code,
)

MIRROR_ROOT = Path(__file__).parent.parent.parent / "footbag_legacy_mirror" / "www.footbag.org"
CLUBS_SHOW_DIR = MIRROR_ROOT / "clubs" / "show"
CLUBS_CLUBID_DIR = MIRROR_ROOT / "clubs"
OUTPUT_DIR = Path(__file__).parent.parent / "seed"
OUTPUT_FILENAME = "club_members.csv"
OUTPUT_CSV = OUTPUT_DIR / OUTPUT_FILENAME
DEFAULT_CLUBS_CSV = OUTPUT_DIR / "clubs.csv"

FIELDNAMES = ["legacy_club_key", "mirror_member_id", "display_name", "alias"]

PROFILE_RE = re.compile(r"/members/profile/(\d+)/")


def approved_club_keys(clubs_csv: Path) -> set[str]:
    """The club universe this seed is allowed to name.

    The club seed is reconciled against the dump's approved ClubID set by
    overlay_clubs_from_dump.py, which drops any key the dump no longer approves.
    This walk of the mirror has no such reconciliation of its own: the capture
    still holds a showmembers page for a club that was unapproved afterwards, and
    without this the roster would be written for a club the seed does not
    contain. Reading the reconciled seed rather than the dump keeps one producer
    deciding the universe, so the two cannot drift into disagreeing about which
    clubs exist.

    Refuses an absent or empty file rather than treating it as an empty universe.
    Filtering against nothing would silently write an empty member seed, and a
    seed emptied by a missing input is worse than a run that stops.
    """
    if not clubs_csv.is_file():
        raise SystemExit(
            f"ERROR: club seed not found at {clubs_csv}. It is the approved club "
            f"universe this extractor filters against, produced by "
            f"scripts/extract_clubs.py and reconciled by "
            f"scripts/overlay_clubs_from_dump.py, both of which run before this "
            f"step in ./run_pipeline.sh. Run those first, or name another copy "
            f"with --clubs-csv.")
    with clubs_csv.open(newline="", encoding="utf-8") as handle:
        keys = {(row.get("legacy_club_key") or "").strip()
                for row in csv.DictReader(handle)}
    keys.discard("")
    if not keys:
        raise SystemExit(
            f"ERROR: {clubs_csv} names no club keys, so every member row would be "
            f"filtered out and the seed written empty. Regenerate the club seed "
            f"before this step rather than letting an empty universe through.")
    return keys


def parse_showmembers(html_path: Path, legacy_club_key: str) -> list[dict]:
    with open(html_path, encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f, "html.parser")

    rows = []
    table = soup.find("table", class_="membersSearchResultsTable")
    if not table:
        return rows

    for tr in table.find_all("tr"):
        name_td = tr.find("td", class_="memberName")
        alias_td = tr.find("td", class_="memberAlias")
        if not name_td or not alias_td:
            continue

        display_name = name_td.get_text(separator=" ", strip=True)
        # Collapse multiple spaces (names stored as "First  Last")
        display_name = " ".join(display_name.split())
        if not display_name:
            continue

        alias = ""
        mirror_member_id = ""
        alias_link = alias_td.find("a", href=True)
        if alias_link:
            href = alias_link.get("href", "")
            m = PROFILE_RE.search(href)
            if m:
                mirror_member_id = m.group(1)
            alias = alias_link.get_text(strip=True)

        rows.append({
            "legacy_club_key": legacy_club_key,
            "mirror_member_id": mirror_member_id,
            "display_name": display_name,
            "alias": alias,
        })

    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_output_arguments(parser)
    parser.add_argument(
        "--clubs-csv", type=Path, default=DEFAULT_CLUBS_CSV,
        help="the reconciled club seed whose keys bound this output (default: "
             "the committed seed/clubs.csv). A run comparing fresh output "
             "against the committed copy points this at the clubs.csv from the "
             "same comparison run, so both sides describe one universe.")
    args = parser.parse_args()

    if not CLUBS_SHOW_DIR.is_dir():
        print(f"ERROR: mirror not found at {CLUBS_SHOW_DIR}", file=sys.stderr)
        sys.exit(1)

    output_dir, redirected = resolve_output_dir(args.out_dir, OUTPUT_DIR)
    try:
        output_csv = prepare_output_target(output_dir, OUTPUT_FILENAME)
    except OutputDestinationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(EXIT_INVALID_OUTPUT)

    if redirected:
        print(f"Output redirected to {output_csv}")

    generate, reason = decide_regeneration(output_csv, __file__, args.force)
    if not generate:
        print(f"SKIPPED, generated nothing: {reason}. ({output_csv})")
        if redirected:
            print(
                "ERROR: a redirected run that skips writes no file at the "
                "requested location, so its result cannot stand in for a "
                "regenerated one. Pass --force.",
                file=sys.stderr,
            )
        sys.exit(skip_exit_code(redirected))

    approved = approved_club_keys(args.clubs_csv)

    all_rows = []
    clubs_processed = 0
    clubs_skipped = 0
    unapproved_rows = 0
    unapproved_clubs = []

    for club_dir in sorted(CLUBS_SHOW_DIR.iterdir()):
        legacy_club_key = club_dir.name
        showmembers_html = CLUBS_CLUBID_DIR / f"ClubID_{legacy_club_key}" / "showmembers" / "index.html"
        if not showmembers_html.is_file():
            clubs_skipped += 1
            continue

        rows = parse_showmembers(showmembers_html, legacy_club_key)
        if legacy_club_key not in approved:
            # The capture still serves this club's roster; the approved universe
            # no longer contains the club. Named rather than dropped quietly,
            # because a roster disappearing from the seed is a fact about the
            # club's standing and someone should be able to read it in the log.
            unapproved_rows += len(rows)
            unapproved_clubs.append(legacy_club_key)
            continue

        all_rows.extend(rows)
        clubs_processed += 1

    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, lineterminator="\n")
        writer.writeheader()
        writer.writerows(all_rows)

    print(
        f"GENERATED ({reason}): wrote {len(all_rows)} member rows from "
        f"{clubs_processed} clubs to {output_csv} "
        f"({clubs_skipped} club dirs had no showmembers page)."
    )
    if unapproved_clubs:
        print(
            f"  {unapproved_rows} row(s) across {len(unapproved_clubs)} club(s) "
            f"were left out: the capture holds a roster, {args.clubs_csv.name} "
            f"does not hold the club. "
            f"{', '.join(sorted(unapproved_clubs))}"
        )


if __name__ == "__main__":
    main()
