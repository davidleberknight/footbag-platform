#!/usr/bin/env python3
"""Capture the public Footbag Hall of Fame site: one record per honoree.

The Hall of Fame site is the only source that covers honorees inducted after the
legacy site stopped publishing year pages, and it is the only source for the
biographies and photographs. It states an induction year in some biographies and
in none of its markup, so the year is read out of the prose and every year is
stored beside the verbatim wording it came from: a year with no quotable
sentence behind it is not evidence anyone can check.

Opt-in and read-only against the site. Nothing in the rebuild or the gate chain
runs this. The captured pages and the parsed record are what everything else
reads, so the merge keeps working after the site changes or goes away, and a
refresh is a deliberate act whose diff a maintainer reviews.

Writes the raw pages to legacy_data/out/hof/site_capture/, the full parsed record
to legacy_data/out/hof/hof_site_members.csv, and the small reviewable year
snapshot to legacy_data/inputs/hof_site_year_evidence.csv.
"""
from __future__ import annotations

import argparse
import csv
import html
import importlib.util
import re
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INDEX_URL = "https://www.footbaghalloffame.net/our-members"
SITE_ROOT = "https://www.footbaghalloffame.net"
OUTPUT_DIR = REPO_ROOT / "legacy_data" / "out" / "hof"
CAPTURE_DIR = OUTPUT_DIR / "site_capture"
MEMBERS_CSV = OUTPUT_DIR / "hof_site_members.csv"
YEAR_EVIDENCE_CSV = REPO_ROOT / "legacy_data" / "inputs" / "hof_site_year_evidence.csv"

MEMBER_FIELDNAMES = [
    "slug",
    "url",
    "display_name",
    "induction_year",
    "year_evidence",
    "year_candidates",
    "published_date",
    "author",
    "bio",
    "image_urls",
]

# The committed snapshot carries only what is needed to justify a year, so the
# biographies and photographs stay in the private curation record rather than
# spreading through the public repository.
YEAR_EVIDENCE_FIELDNAMES = ["display_name", "slug", "url", "induction_year", "year_evidence"]

# The roster drift check already solved reading this site's member index and
# normalizing names for comparison; reusing it keeps one definition of both so a
# markup change is fixed in one place.
_DRIFT_CHECK = Path(__file__).resolve().parents[1] / "member_data_scripts" / "diff_live_honor_rosters.py"
_spec = importlib.util.spec_from_file_location("diff_live_honor_rosters", _DRIFT_CHECK)
_drift = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_drift)
fetch = _drift.fetch
clean_text = _drift._clean

_GT = ">"
# The index links each honoree to their own page. The slug is needed as well as
# the name, which is why the drift check's name-only pattern is not reused here.
_INDEX_LINK_RE = re.compile(
    r"href=\"(?:" + re.escape(SITE_ROOT) + r")?/our-members/([a-z0-9-]+)\"", re.I
)
_TITLE_RE = re.compile(r"<h1[^" + _GT + r"]*class=\"[^\"]*entry-title[^\"]*\"[^" + _GT + r"]*" + _GT + r"(.*?)</h1" + _GT, re.S)
_AUTHOR_RE = re.compile(r"class=\"blog-author-name\"[^" + _GT + r"]*" + _GT + r"(.*?)</a" + _GT, re.S)
_DATE_RE = re.compile(r"<time[^" + _GT + r"]*class=\"[^\"]*dt-published[^\"]*\"[^" + _GT + r"]*datetime=\"([^\"]*)\"")
_BODY_RE = re.compile(
    r"class=\"blog-item-content e-content\"[^" + _GT + r"]*" + _GT + r"(.*?)</article" + _GT, re.S
)
_IMAGE_RE = re.compile(r"data-image=\"(https://[^\"?]+)")
_OG_IMAGE_RE = re.compile(r"<meta property=\"og:image\" content=\"([^\"?]+)")

# A year counts only when the prose ties it to this honor. The biographies name
# several other years close by — a Big Add Posse induction, a championship
# result, a caption under the photo that follows the sentence — so the year is
# read from the induction sentence itself and nowhere else.
#
# The honor must be named immediately after the word inducted, which is what
# separates a Hall of Fame sentence from a Big Add Posse one. The year then sits
# either after the honor ("inducted into the Footbag Hall of Fame in 2001", "at
# the World Footbag Championships in 2024") or ahead of the verb ("In 2023, Lon
# Smith was inducted in the Footbag Hall of Fame"). Both spans stop at a sentence
# boundary, because the sentence after an induction sentence is routinely a photo
# caption carrying a competition year.
_INDUCT_RE = re.compile(r"induct\w*", re.I)
_HONOR_RE = re.compile(r"\s*(?:in|into)?\s*(?:the\s+)?(?:prestigious\s+)?Footbag Hall of Fame", re.I)
_YEAR_RE = re.compile(r"\b(19[7-9]\d|20[0-4]\d)\b")
_SENTENCE_END_RE = re.compile(r"[.!?]")
_FORWARD_SPAN = 140
_BACKWARD_SPAN = 60


def parse_index(page_html):
    """Ordered, de-duplicated honoree slugs from the member index."""
    seen = []
    for slug in _INDEX_LINK_RE.findall(page_html):
        lowered = slug.lower()
        if lowered not in seen:
            seen.append(lowered)
    return seen


def _first(pattern, page_html):
    found = pattern.search(page_html)
    return clean_text(found.group(1)) if found else ""


def parse_bio(page_html):
    body = _BODY_RE.search(page_html)
    if not body:
        return ""
    without_scripts = re.sub(r"<(script|style)\b.*?</\1" + _GT, " ", body.group(1), flags=re.S | re.I)
    return clean_text(without_scripts)


def parse_images(page_html):
    urls = []
    for pattern in (_OG_IMAGE_RE, _IMAGE_RE):
        for url in pattern.findall(page_html):
            cleaned = html.unescape(url)
            if cleaned not in urls:
                urls.append(cleaned)
    return urls


def induction_years(bio):
    """Every Hall of Fame induction year the biography states, with its wording.

    Returns a list of (year, evidence) pairs. More than one distinct year means
    the prose is ambiguous, and the caller records all of them rather than
    choosing: an induction year that has to be guessed is not a fact.
    """
    found = []
    for mention in _INDUCT_RE.finditer(bio):
        honor = _HONOR_RE.match(bio, mention.end())
        if not honor:
            continue

        after = bio[honor.end():honor.end() + _FORWARD_SPAN]
        sentence_end = _SENTENCE_END_RE.search(after)
        after = after[:sentence_end.start()] if sentence_end else after
        forward = _YEAR_RE.search(after)

        before = bio[max(0, mention.start() - _BACKWARD_SPAN):mention.start()]
        last_break = None
        for terminator in _SENTENCE_END_RE.finditer(before):
            last_break = terminator.end()
        if last_break is not None:
            before = before[last_break:]
        backward = list(_YEAR_RE.finditer(before))

        if forward:
            year = forward.group(1)
        elif backward:
            year = backward[-1].group(1)
        else:
            continue

        evidence = (before + bio[mention.start():honor.end()] + after).strip()
        if (year, evidence) not in found:
            found.append((year, evidence))
    return found


def parse_member_page(slug, page_html):
    bio = parse_bio(page_html)
    candidates = induction_years(bio)
    distinct = sorted({year for year, _ in candidates})
    return {
        "slug": slug,
        "url": f"{SITE_ROOT}/our-members/{slug}",
        "display_name": _first(_TITLE_RE, page_html),
        "induction_year": distinct[0] if len(distinct) == 1 else "",
        "year_evidence": candidates[0][1] if len(distinct) == 1 and candidates else "",
        "year_candidates": "|".join(distinct),
        "published_date": _first(_DATE_RE, page_html),
        "author": _first(_AUTHOR_RE, page_html),
        "bio": bio,
        "image_urls": "|".join(parse_images(page_html)),
    }


def _write(path, fieldnames, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-url", default=DEFAULT_INDEX_URL)
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds to wait between page fetches, so a full capture stays "
        "gentle on a small volunteer-run site.",
    )
    parser.add_argument(
        "--from-capture",
        action="store_true",
        help="Re-parse the pages already captured instead of fetching. Use this "
        "when changing the parser, so a parser fix costs the site nothing.",
    )
    args = parser.parse_args()

    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

    if args.from_capture:
        captured = sorted(CAPTURE_DIR.glob("*.html"))
        if not captured:
            print(
                f"ERROR: no captured pages in {CAPTURE_DIR}. Run this script without "
                f"--from-capture once to fetch them.",
                file=sys.stderr,
            )
            sys.exit(1)
        pages = [(path.stem, path.read_text(encoding="utf-8")) for path in captured]
    else:
        try:
            index_html = fetch(args.index_url)
        except Exception as error:  # noqa: BLE001 - any fetch failure is reported the same way
            print(f"ERROR: could not fetch the member index at {args.index_url}: {error}", file=sys.stderr)
            sys.exit(1)
        slugs = parse_index(index_html)
        if not slugs:
            print(
                f"ERROR: parsed no honoree links from {args.index_url}. The site's markup "
                f"has changed and the index pattern in this script needs updating.",
                file=sys.stderr,
            )
            sys.exit(1)
        (CAPTURE_DIR / "_index.html.saved").write_text(index_html, encoding="utf-8")
        pages = []
        failures = []
        for position, slug in enumerate(slugs, start=1):
            url = f"{SITE_ROOT}/our-members/{slug}"
            try:
                page = fetch(url)
            except Exception as error:  # noqa: BLE001 - reported, never fatal to the run
                failures.append(f"{slug}: {error}")
                continue
            (CAPTURE_DIR / f"{slug}.html").write_text(page, encoding="utf-8")
            pages.append((slug, page))
            print(f"  [{position}/{len(slugs)}] {slug}")
            time.sleep(args.delay)
        if failures:
            print(f"\n{len(failures)} page(s) could not be fetched:", file=sys.stderr)
            for failure in failures:
                print(f"  ! {failure}", file=sys.stderr)

    parsed = [parse_member_page(slug, page) for slug, page in pages]
    # The index also links items that are not honoree pages, such as a member
    # account's own post. They carry no honoree title, which is what tells them
    # apart, and they are reported rather than dropped silently.
    rows = sorted((row for row in parsed if row["display_name"]), key=lambda row: row["slug"])
    untitled = [row["slug"] for row in parsed if not row["display_name"]]

    _write(MEMBERS_CSV, MEMBER_FIELDNAMES, rows)
    _write(YEAR_EVIDENCE_CSV, YEAR_EVIDENCE_FIELDNAMES, [row for row in rows if row["induction_year"]])

    with_year = sum(1 for row in rows if row["induction_year"])
    ambiguous = [row["slug"] for row in rows if row["year_candidates"] and not row["induction_year"]]
    print(f"\nCaptured {len(rows)} honorees to {MEMBERS_CSV}.")
    print(f"  {with_year} state an induction year; {len(rows) - with_year} do not.")
    if untitled:
        print(f"  {len(untitled)} linked page(s) carry no honoree title and were skipped: {', '.join(untitled)}")
    if ambiguous:
        print(f"  {len(ambiguous)} name more than one year and are left unset: {', '.join(ambiguous)}")
    print(f"Year snapshot written to {YEAR_EVIDENCE_CSV}; review its diff before committing.")


if __name__ == "__main__":
    main()
