#!/usr/bin/env python3
"""Extract club data from legacy mirror into legacy_data/seed/clubs.csv.

Walks all clubs/show/*/index.html pages under the mirror, parses club fields,
and writes a CSV. Idempotent: skips if the output CSV already exists and is
newer than this script, which --force overrides. --out-dir sends the CSV
somewhere other than the committed seed directory, which is what a run
comparing fresh output against the committed copy needs.

Output columns:
  legacy_club_key, name, city, region, country, contact_member_id,
  external_url, description, created, last_updated

A personal contact email is never extracted into this public-repo CSV; club
contact is leader-supplied at onboarding instead (SEC-S04).
"""

import argparse
import csv
import os
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

# Resolve the sibling helper whether this file is run as a script or imported.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from club_curation import (  # noqa: E402
    SEED_FIELDNAMES,
    apply_club_text_corrections,
    blank_location_placeholder,
    repair_doubled_url_scheme,
    load_club_text_corrections,
)
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
OUTPUT_DIR = Path(__file__).parent.parent / "seed"
OUTPUT_FILENAME = "clubs.csv"
OUTPUT_CSV = OUTPUT_DIR / OUTPUT_FILENAME

FIELDNAMES = SEED_FIELDNAMES


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
    every downstream consumer (the same public-repo safety reason no contact
    email is extracted, SEC-S04). Emails are always removed. A digit run is treated as a phone
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
    city = blank_location_placeholder(city)
    region = blank_location_placeholder(region)

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
    # A personal contact email is never extracted from the mirror: the legacy
    # site carries obfuscated addresses, and this CSV is tracked in a public
    # git repository, so pulling them in would re-leak them upstream of every
    # downstream consumer. Club contact is leader-supplied at onboarding
    # instead. SEC-S04.
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
            external_url = repair_doubled_url_scheme(href)

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
        "contact_member_id": contact_member_id,
        "external_url": external_url,
        "description": description,
        "created": created,
        "last_updated": last_updated,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_output_arguments(parser)
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

    rows = []
    skipped = 0

    # The mirror preserves what the legacy application stored, damage included: a
    # region typed through the wrong codepage, a postal abbreviation where the
    # region's name belongs, and a website field holding prose that the legacy form
    # turned into a link. This extractor copies faithfully, so the curator's
    # corrections are applied here, on the way out. Applying them only in the
    # dump-reconciliation step left the repair depending on a machine-local input
    # that is optional by design, so a re-extract on a checkout without the dump
    # silently restored every one of those values.
    corrections = load_club_text_corrections()
    corrected_rows = 0

    for club_dir in sorted(CLUBS_SHOW_DIR.iterdir()):
        index = club_dir / "index.html"
        if not index.is_file():
            continue
        legacy_club_key = club_dir.name
        row = extract_club(index, legacy_club_key)
        if row is None:
            skipped += 1
        else:
            before = dict(row)
            apply_club_text_corrections(row, legacy_club_key, corrections)
            if row != before:
                corrected_rows += 1
            rows.append(row)

    # The don't-shrink-the-seed invariant is enforced across the whole of the
    # mirror-extraction phase, not here. This extractor can only see the clubs
    # the legacy site still serves as active; every club whose contact stopped
    # checking in renders as a defunct-listing page that carries no record to
    # extract, and an id that was never valid renders as a not-found page. The
    # dump overlay that runs immediately after restores the approved clubs the
    # mirror no longer serves, and only its output is comparable to the
    # committed seed. Comparing this intermediate count against that seed
    # rejected every healthy run, because a mirror alone has never reproduced a
    # dump-enriched seed and is not supposed to.
    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(
        f"GENERATED ({reason}): wrote {len(rows)} clubs to {output_csv} "
        f"({skipped} skipped, {corrected_rows} repaired from curated corrections)."
    )


if __name__ == "__main__":
    main()
