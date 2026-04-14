#!/usr/bin/env python3
"""
audit_team_corrections_needed.py

Scans PBP team entries for parsing errors that need team_corrections.csv entries.

Usage (from legacy_data/):
    .venv/bin/python pipeline/audit_team_corrections_needed.py

Outputs to stdout: classified list of issues by event.
"""

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PBP_CSV = ROOT / "out" / "Placements_ByPerson.csv"
EVENTS_CSV = ROOT / "out" / "canonical" / "events.csv"
CORRECTIONS_CSV = ROOT / "inputs" / "team_corrections.csv"

csv.field_size_limit(10 * 1024 * 1024)

# Location fragments that indicate a slash-split error
_LOCATION_WORDS = {
    "usa", "canada", "france", "germany", "japan", "finland", "czech",
    "sweden", "denmark", "norway", "brazil", "colombia", "mexico",
    "australia", "poland", "california", "arizona", "colorado", "oregon",
    "texas", "washington", "illinois", "massachusetts", "nebraska",
    "maryland", "connecticut", "minnesota", "virginia", "georgia",
    "quebec", "ontario", "british columbia",
}
_STATE_ABBREV = {
    "ca", "co", "or", "md", "wa", "mn", "tx", "il", "ny", "nj",
    "fl", "oh", "ga", "az", "ct", "va", "sc", "nc", "pa",
}


def classify_team_issue(tdm: str) -> str | None:
    """Classify a team_display_name issue. Returns category or None if clean."""
    if not tdm or tdm == "__NON_PERSON__":
        return None

    parts = [p.strip() for p in tdm.split(" / ") if p.strip()]

    # Check for location-slash parsing error
    for p in parts:
        p_clean = p.lower().rstrip(")").strip()
        if p_clean in _LOCATION_WORDS or p_clean in _STATE_ABBREV:
            return "SPLIT_PARSING_ERROR"
        if re.match(r"^\w+,\s*(USA|Canada|France|Germany)", p, re.I):
            return "SPLIT_PARSING_ERROR"

    # Unbalanced parentheses = split through a paren annotation
    if ("(" in tdm and ")" not in tdm) or (")" in tdm and "(" not in tdm):
        open_count = tdm.count("(")
        close_count = tdm.count(")")
        if open_count != close_count:
            return "SPLIT_PARSING_ERROR"

    # Single name with no slash = only one person captured
    if " / " not in tdm and "[UNKNOWN PARTNER]" not in tdm:
        words = tdm.split()
        # Filter out pure location annotations
        if len(words) <= 1:
            return "TRUNCATED_NAME"
        # Check if it looks like "Name (Location)" with no partner
        if "(" in tdm:
            return "MISSING_PARTNER"

    return None


def main() -> None:
    if not PBP_CSV.exists():
        print(f"ERROR: {PBP_CSV} not found")
        sys.exit(1)

    # Load event names
    event_names = {}
    if EVENTS_CSV.exists():
        with open(EVENTS_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                event_names[row.get("legacy_event_id", "")] = (
                    row.get("event_key", ""),
                    row.get("event_name", ""),
                    row.get("year", ""),
                )

    # Load existing corrections to exclude already-fixed
    corrected = set()
    if CORRECTIONS_CSV.exists():
        with open(CORRECTIONS_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("active", "") == "1":
                    corrected.add((row["event_key"], row["discipline_key"], row["placement"]))

    # Scan PBP
    issues_by_event: dict[str, list] = defaultdict(list)
    category_counts = defaultdict(int)

    with open(PBP_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("competitor_type") != "team":
                continue
            tdm = (row.get("team_display_name") or "").strip()
            cat = classify_team_issue(tdm)
            if cat is None:
                continue

            eid = row["event_id"]
            ek_info = event_names.get(eid, ("", f"event_{eid}", ""))
            ek, ename, yr = ek_info

            # Skip already corrected
            dk = row.get("division_canon", "")
            pl = row["place"]
            if (ek, dk, pl) in corrected:
                continue

            category_counts[cat] += 1
            issues_by_event[eid].append({
                "event_key": ek,
                "event_name": ename,
                "year": yr,
                "discipline": dk,
                "placement": pl,
                "team_display_name": tdm,
                "category": cat,
            })

    # Report
    sep = "=" * 72
    print(sep)
    print("  TEAM CORRECTIONS AUDIT")
    print(sep)
    print()
    print(f"Total issues found: {sum(category_counts.values())}")
    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")
    print(f"Already corrected: {len(corrected)}")
    print()

    # Sort events by issue count
    sorted_events = sorted(issues_by_event.items(),
                           key=lambda x: -len(x[1]))

    print(f"Events with issues: {len(sorted_events)}")
    print()

    for eid, issues in sorted_events[:20]:
        first = issues[0]
        print(f"--- {first['year']} {first['event_name']} ({first['event_key']}) --- [{len(issues)} issues]")
        for iss in issues:
            print(f"  P{iss['placement']:>2} {iss['discipline']}: "
                  f"\"{iss['team_display_name']}\" [{iss['category']}]")
        print()


if __name__ == "__main__":
    main()
