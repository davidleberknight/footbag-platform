#!/usr/bin/env python3
"""Extract club data from legacy mirror into legacy_data/seed/clubs.csv.

Walks all clubs/show/*/index.html pages under the mirror, parses club fields,
and writes a CSV. Idempotent: skips if the output CSV already exists and is
newer than this script.

Output columns:
  legacy_club_key, name, city, region, country, contact_email (always empty
  per SEC-S04; never extract personal emails into a public git repo),
  contact_member_id, external_url, description, created, last_updated
"""

import argparse
import csv
import os
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

MIRROR_ROOT = Path(__file__).parent.parent / "mirror_footbag_org" / "www.footbag.org"
CLUBS_SHOW_DIR = MIRROR_ROOT / "clubs" / "show"
OUTPUT_DIR = Path(__file__).parent.parent / "seed"
OUTPUT_CSV = OUTPUT_DIR / "clubs.csv"

FIELDNAMES = [
    "legacy_club_key",
    "name",
    "city",
    "region",
    "country",
    "contact_email",
    "contact_member_id",
    "external_url",
    "description",
    "created",
    "last_updated",
]


_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# A run of digits with the usual phone separators, kept on one line (a real
# number never spans a line break). Greedy but bounded by letters.
_PHONE_RUN_RE = re.compile(r"\+?\d[\d ().\-]*\d")
# A year range such as "2002 - 2008" is not a phone number.
_YEAR_RANGE_RE = re.compile(r"(?:19|20)\d\d\s*[-–]\s*(?:19|20)\d\d")
_URL_RE = re.compile(r"https?://\S+")


def _scrub_description_pii(text):
    """Remove contact PII (emails, phone numbers) from a club description.

    The ratified design keeps club contact in the leader mechanism, never as
    free text in the description, and this CSV is tracked in a public git
    repository, so a personal email or phone left here re-leaks it upstream of
    every downstream consumer (same reason contact_email is never extracted,
    SEC-S04). Emails are always removed. A digit run is treated as a phone
    number when it carries 7 to 14 digits; year ranges and 15+-digit ids are
    not phone numbers and survive, and digits inside a URL (e.g. a Facebook
    group id in its link) are left intact so the link is never broken.
    """
    if not text:
        return text

    def _strip_phones(segment):
        def _sub(match):
            run = match.group(0)
            if _YEAR_RANGE_RE.fullmatch(run.strip()):
                return run
            digit_count = sum(ch.isdigit() for ch in run)
            return "" if 7 <= digit_count <= 14 else run
        return _PHONE_RUN_RE.sub(_sub, segment)

    without_emails = _EMAIL_RE.sub("", text)
    # Scrub phone numbers only outside URLs, so a numeric URL path segment is
    # never mistaken for a phone number.
    pieces = []
    pos = 0
    for url in _URL_RE.finditer(without_emails):
        pieces.append(_strip_phones(without_emails[pos:url.start()]))
        pieces.append(url.group(0))
        pos = url.end()
    pieces.append(_strip_phones(without_emails[pos:]))
    scrubbed = "".join(pieces)

    if scrubbed == text:
        # No PII present; leave the original spacing untouched so the scrub
        # only ever rewrites descriptions that actually carried contact data.
        return text
    # Tidy the spacing and punctuation orphaned by the removals: parentheses
    # that wrapped a removed number, blank-line runs left by removed contact
    # lines, doubled spaces, and spaces stranded before punctuation.
    scrubbed = re.sub(r"\(\s*\)", "", scrubbed)
    scrubbed = re.sub(r"\(\s*(?=[.\n]|$)", "", scrubbed)
    scrubbed = re.sub(r"\n[ \t]*(?:\n[ \t]*){2,}", "\n\n", scrubbed)
    scrubbed = re.sub(r"[ \t]{2,}", " ", scrubbed)
    scrubbed = re.sub(r" +([.,;:!?])", r"\1", scrubbed)
    return scrubbed.strip()


def parse_location(text):
    """Parse 'city, country' or 'city, region, country' into (city, region, country)."""
    parts = [p.strip() for p in text.split(",")]
    if len(parts) >= 3:
        city = parts[0]
        region = ", ".join(parts[1:-1])
        country = parts[-1]
    elif len(parts) == 2:
        city, country = parts
        region = ""
    else:
        city = text.strip()
        region = ""
        country = ""
    return city, region, country


def extract_club(html_path, legacy_club_key):
    with open(html_path, encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f, "html.parser")

    name_tag = soup.select_one("h1.clubsShowName")
    if not name_tag:
        return None
    name = name_tag.get_text(strip=True)
    if not name:
        return None

    location_tag = soup.select_one("div.clubsLocationHeader")
    location_text = location_tag.get_text(strip=True) if location_tag else ""
    city, region, country = parse_location(location_text) if location_text else ("", "", "")

    if not country:
        return None

    # Known legacy data corrections
    if country == "Basque Country":
        country = "Spain"
    # The legacy source mis-filed these two clubs under Argentina; their cities
    # place them elsewhere (Mglebi is in Georgia; Athens is in Greece), so the
    # correction is pinned here rather than left to be re-broken on re-extraction.
    if legacy_club_key == "1438092592":
        country = "Georgia"
    elif legacy_club_key == "1486385137":
        country = "Greece"

    # Contact member ID from the .clubsContacts block: capture the FIRST
    # profile link's mirror member ID (if multiple contacts exist, the first
    # is the primary contact per the mirror page layout).
    #
    # contact_email is intentionally never populated from the mirror. The
    # legacy site carries personal email addresses in obfuscated form, and
    # this CSV is tracked in a public git repository, so extracting them
    # re-leaks them upstream of every downstream consumer. The column stays
    # in FIELDNAMES so loaders that bind by name (e.g. load_clubs_seed.py)
    # keep working unchanged. SEC-S04.
    contact_email = ""
    contact_member_id = ""
    contacts_div = soup.select_one("div.clubsContacts")
    if contacts_div:
        profile_link = contacts_div.find("a", href=re.compile(r"members/profile/\d+"))
        if profile_link:
            m = re.search(r"members/profile/(\d+)", profile_link.get("href", ""))
            if m:
                contact_member_id = m.group(1)

    # External URL
    external_url = ""
    url_link = soup.select_one("div.clubsURL a[href]")
    if url_link:
        href = url_link.get("href", "").strip()
        # Skip relative/internal links
        if href.startswith("http://") or href.startswith("https://"):
            external_url = href

    # Description
    description = ""
    welcome_div = soup.select_one("div#ClubsWelcome")
    if welcome_div:
        description = _scrub_description_pii(welcome_div.get_text(separator=" ", strip=True))

    # CMS timestamps from div#MainModified
    # Format: "Created Sun Jan 15 10:16:52 2012; last update Sun Jan 15 10:16:52 2012."
    created = ""
    last_updated = ""
    modified_div = soup.select_one("div#MainModified")
    if modified_div:
        text = modified_div.get_text(separator=" ", strip=True)
        m = re.search(r"Created\s+(.+?);\s*last", text)
        if m:
            created = m.group(1).strip()
        m = re.search(r"last\s+update\s+(.+?)\.", text)
        if m:
            last_updated = m.group(1).strip()

    return {
        "legacy_club_key": legacy_club_key,
        "name": name,
        "city": city,
        "region": region,
        "country": country,
        "contact_email": contact_email,
        "contact_member_id": contact_member_id,
        "external_url": external_url,
        "description": description,
        "created": created,
        "last_updated": last_updated,
    }


def _existing_row_count(path):
    """Count the data rows already in the output CSV (0 if absent or empty).

    Parsed with csv, not line counting, because a club description can carry
    embedded newlines that would inflate a naive line count.
    """
    if not path.exists():
        return 0
    with open(path, newline="", encoding="utf-8") as f:
        return max(0, sum(1 for _ in csv.reader(f)) - 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-shrink",
        action="store_true",
        help="Permit overwriting the seed when the extraction yields fewer "
        "clubs than the existing seed (e.g. genuine club removals). Without "
        "this, a smaller extraction is refused as a likely incomplete mirror.",
    )
    args = parser.parse_args()

    if not CLUBS_SHOW_DIR.is_dir():
        print(f"ERROR: mirror not found at {CLUBS_SHOW_DIR}", file=sys.stderr)
        sys.exit(1)

    # Idempotent: skip if CSV is newer than this script
    script_mtime = Path(__file__).stat().st_mtime
    if OUTPUT_CSV.exists() and OUTPUT_CSV.stat().st_mtime > script_mtime:
        print(f"clubs.csv is up to date, skipping. ({OUTPUT_CSV})")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = []
    skipped = 0

    for club_dir in sorted(CLUBS_SHOW_DIR.iterdir()):
        index = club_dir / "index.html"
        if not index.is_file():
            continue
        legacy_club_key = club_dir.name
        row = extract_club(index, legacy_club_key)
        if row is None:
            skipped += 1
        else:
            rows.append(row)

    # Refuse to shrink the seed. A mirror reduced to a fraction of its clubs
    # (e.g. a depleted or partially-synced clubs/show tree) would otherwise
    # silently overwrite a complete seed with a tiny one, stranding every
    # downstream club step on the missing rows. A genuine reduction is opted
    # into with --allow-shrink.
    existing = _existing_row_count(OUTPUT_CSV)
    if len(rows) < existing and not args.allow_shrink:
        print(
            f"ERROR: extracted {len(rows)} clubs but {OUTPUT_CSV} already holds "
            f"{existing}. The mirror at {CLUBS_SHOW_DIR} is almost certainly "
            f"incomplete; refusing to overwrite the larger seed. Restore the "
            f"full clubs/show mirror and re-run, or pass --allow-shrink if the "
            f"reduction is intentional.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} clubs to {OUTPUT_CSV} ({skipped} skipped).")


if __name__ == "__main__":
    main()
