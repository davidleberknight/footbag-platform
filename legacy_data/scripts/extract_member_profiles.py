#!/usr/bin/env python3
"""Extract member profile data from legacy mirror HTML.

Walks members/profile/*/index.html under the mirror, parses profile fields,
and writes a CSV. Follows the same pattern as extract_clubs.py.

Output columns:
  mirror_member_id, display_name, bio, city, country, ifpa_join_date
"""

import csv
import os
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

MIRROR_ROOT = Path(__file__).parent.parent / "mirror_footbag_org" / "www.footbag.org"
PROFILES_DIR = MIRROR_ROOT / "members" / "profile"
OUTPUT_DIR = Path(__file__).parent.parent / "seed"
OUTPUT_CSV = OUTPUT_DIR / "member_profiles.csv"

FIELDNAMES = [
    "mirror_member_id",
    "display_name",
    "bio",
    "city",
    "country",
    "ifpa_join_date",
]


def extract_profile(html_path, member_id):
    with open(html_path, encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f, "html.parser")

    # Detect "Member Not Found" error pages: these have membersProfileBody
    # but lack the inner membersProfile div.
    profile_div = soup.select_one("div.membersProfile")
    if not profile_div:
        return None

    # Display name
    name_tag = profile_div.select_one("div.membersProfileName")
    display_name = ""
    if name_tag:
        display_name = " ".join(name_tag.get_text(strip=True).split())

    # Bio from membersProfileComment
    bio = ""
    comment_div = profile_div.select_one("div.membersProfileComment")
    if comment_div:
        bio = comment_div.get_text(separator=" ", strip=True)

    # Location from membersNameplateEnd dl dd elements
    # Structure: <dt>Location:</dt><dd>city</dd><dd>country</dd>
    city = ""
    country = ""
    nameplate_end = profile_div.select_one("div.membersNameplateEnd")
    if nameplate_end:
        dds = nameplate_end.select("dd")
        if len(dds) >= 2:
            city = dds[0].get_text(strip=True)
            country = dds[-1].get_text(strip=True)
        elif len(dds) == 1:
            country = dds[0].get_text(strip=True)

    # IFPA join date from the nameplate
    # Format: <dd>Joined: MM/DD/YY</dd>
    ifpa_join_date = ""
    nameplate = profile_div.select_one("div.membersProfileNameplate")
    if nameplate:
        for dd in nameplate.select("dd"):
            text = dd.get_text(strip=True)
            if text.startswith("Joined:"):
                ifpa_join_date = text.replace("Joined:", "").strip()
                break

    return {
        "mirror_member_id": member_id,
        "display_name": display_name,
        "bio": bio,
        "city": city,
        "country": country,
        "ifpa_join_date": ifpa_join_date,
    }


def main():
    if not PROFILES_DIR.is_dir():
        print(f"ERROR: mirror not found at {PROFILES_DIR}", file=sys.stderr)
        sys.exit(1)

    script_mtime = Path(__file__).stat().st_mtime
    if OUTPUT_CSV.exists() and OUTPUT_CSV.stat().st_mtime > script_mtime:
        print(f"member_profiles.csv is up to date, skipping. ({OUTPUT_CSV})")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = []
    skipped_not_found = 0
    skipped_no_html = 0
    has_bio = 0

    for profile_dir in sorted(PROFILES_DIR.iterdir()):
        index = profile_dir / "index.html"
        if not index.is_file():
            skipped_no_html += 1
            continue
        member_id = profile_dir.name
        row = extract_profile(index, member_id)
        if row is None:
            skipped_not_found += 1
        else:
            rows.append(row)
            if row["bio"]:
                has_bio += 1

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(
        f"Wrote {len(rows)} profiles to {OUTPUT_CSV} "
        f"({has_bio} with bio, "
        f"{skipped_not_found} Member Not Found, "
        f"{skipped_no_html} no HTML)."
    )


if __name__ == "__main__":
    main()
