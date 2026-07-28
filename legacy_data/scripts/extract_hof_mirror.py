#!/usr/bin/env python3
"""Extract both Hall of Fame surfaces the legacy mirror preserves.

The legacy site recorded the Hall of Fame twice, and the two records carry
different fields, so both are extracted rather than picking a winner here:

  Reference year pages (one page per induction year) carry the induction
  sequence number, the name as the site published it, the honoree's legacy
  profile username, the four interview answers, and the photo names.

  The Hall of Fame group roster page carries the whole membership in one list
  with each member's country and induction year, including honorees whose year
  page never went up.

Writes legacy_data/out/hof/hof_year_pages.csv and hof_group_roster.csv. Both are
faithful transcriptions of what the mirror says: no name is corrected, no year is
reconciled, and nothing is dropped for disagreeing with another source. Deciding
between the two is the merge step's job, which needs to see both spellings to do
it. Idempotent: skips when the outputs are newer than this script.
"""

import argparse
import csv
import html
import re
import sys
from pathlib import Path

MIRROR_ROOT = Path(__file__).parent.parent.parent / "footbag_legacy_mirror" / "www.footbag.org"
YEAR_PAGES_DIR = MIRROR_ROOT / "reference2" / "footbag-hall-of-fame"
GROUP_ROSTER_PAGE = MIRROR_ROOT / "groups" / "list" / "hof" / "index.html"
OUTPUT_DIR = Path(__file__).parent.parent / "out" / "hof"
YEAR_PAGES_CSV = OUTPUT_DIR / "hof_year_pages.csv"
GROUP_ROSTER_CSV = OUTPUT_DIR / "hof_group_roster.csv"

YEAR_PAGE_FIELDNAMES = [
    "induction_number",
    "induction_year",
    "published_name",
    "legacy_username",
    "first_footbag",
    "personal_notes",
    "achievements",
    "sport_future",
    "image_names",
    "source_page",
]

GROUP_ROSTER_FIELDNAMES = [
    "roster_position",
    "published_name",
    "country",
    "induction_year",
    "source_page",
]

# The four questions every year-page entry answers, mapped to their column. The
# site's wording varies only in punctuation, so the match is on the leading
# words.
INTERVIEW_FIELDS = [
    (re.compile(r"when did you see your first footbag", re.I), "first_footbag"),
    (re.compile(r"your own personal comments", re.I), "personal_notes"),
    (re.compile(r"major achievements", re.I), "achievements"),
    (re.compile(r"the sports? future", re.I), "sport_future"),
]

_GT = ">"
_TAG_RE = re.compile(r"<[^" + _GT + r"]+" + _GT)
_SCRIPT_RE = re.compile(r"<(script|style)\b.*?</\1" + _GT, re.S | re.I)
# Entry headings are "35. Yves Archambault" or "65 Randy Nelson" — the period is
# missing on at least one, so it cannot be required or that honoree vanishes.
_ENTRY_HEADING_RE = re.compile(r"<h2[^" + _GT + r"]*" + _GT + r"(.*?)</h2" + _GT, re.S)
_ENTRY_NUMBER_RE = re.compile(r"^(\d+)\.?\s+(.+)$", re.S)
# The honoree's legacy profile link. The trailing slash is required because the
# earliest honorees have no account and their heading links the bare profile
# directory, which would otherwise be read as a username.
_PROFILE_USERNAME_RE = re.compile(r"/members/profile/([^/\"']+)/")
_IMAGE_NAME_RE = re.compile(r"Image:([A-Za-z0-9_.\-]+\.(?:jpg|jpeg|png|gif))", re.I)
# Roster entries read "Ted Huff (USA) 1997" in one long run of text.
_ROSTER_ENTRY_RE = re.compile(r"([^()\d][^()]{1,60}?)\s*\(([^)]{2,40})\)\s*(\d{4})")


def _repair_word(word):
    if not any(ch in word for ch in "ÂÃâ"):
        return word
    try:
        return word.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return word


def repair_mojibake(text):
    """Undo UTF-8 bytes that the legacy site already stored as Windows-1252.

    Several pages went through that round trip before they were saved, so an
    apostrophe arrives as three characters and an accented name is unreadable.
    The repair runs word by word and only where it round-trips cleanly: one
    unrelated character the old encoding cannot represent would otherwise defeat
    the repair for a whole paragraph, and text that was always correct must come
    through untouched.
    """
    if not text:
        return text
    return " ".join(_repair_word(word) for word in text.split(" "))


def clean_text(fragment):
    """Plain text from an HTML fragment, entities resolved and runs collapsed."""
    text = html.unescape(_TAG_RE.sub(" ", _SCRIPT_RE.sub(" ", fragment or "")))
    return repair_mojibake(re.sub(r"\s+", " ", text).strip())


def _entry_bodies(page_html):
    """Yield (heading_html, body_html) for each numbered entry on a year page.

    The body is everything between one entry heading and the next, which is
    where the interview answers and the photo references live.
    """
    matches = list(_ENTRY_HEADING_RE.finditer(page_html))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(page_html)
        yield match.group(1), page_html[match.end():end]


def _interview_answers(body_html):
    """Map each interview question on a year-page entry to its answer text.

    The questions appear in a fixed order in the entry's prose, each followed by
    its answer, so the answer to one question is the text running up to the next
    question. Reading it from the flattened text rather than the list markup
    survives the several nesting shapes the pages use for the same content. The
    photo references are dropped first because they sit both before the first
    question and after the last one, and a question left unanswered yields an
    empty string so a blank stays visible as a blank.
    """
    answers = {column: "" for _, column in INTERVIEW_FIELDS}
    text = clean_text(body_html)
    text = re.sub(r"\s+", " ", _IMAGE_NAME_RE.sub(" ", text)).strip()

    found = []
    for pattern, column in INTERVIEW_FIELDS:
        located = pattern.search(text)
        if located:
            found.append((located.start(), located.end(), column))
    found.sort()

    for index, (_, question_start, column) in enumerate(found):
        question_mark = text.find("?", question_start)
        answer_start = question_mark + 1 if question_mark >= 0 else question_start
        answer_end = found[index + 1][0] if index + 1 < len(found) else len(text)
        answers[column] = text[answer_start:answer_end].strip()
    return answers


def parse_year_page(page_html, induction_year, source_page):
    """Rows for one Hall of Fame reference year page."""
    rows = []
    for heading_html, body_html in _entry_bodies(page_html):
        heading = clean_text(heading_html)
        numbered = _ENTRY_NUMBER_RE.match(heading)
        if not numbered:
            continue
        username = _PROFILE_USERNAME_RE.search(heading_html)
        images = sorted(set(_IMAGE_NAME_RE.findall(body_html)))
        row = {
            "induction_number": numbered.group(1),
            "induction_year": induction_year,
            "published_name": numbered.group(2).strip(),
            "legacy_username": username.group(1) if username else "",
            "image_names": "|".join(images),
            "source_page": source_page,
        }
        row.update(_interview_answers(body_html))
        rows.append(row)
    return rows


def parse_group_roster(page_html, source_page):
    """Rows for the Hall of Fame group roster page.

    The roster is one continuous run of "Name (Country) Year", bounded by the
    group description above it and the file listing below it, so the run is
    isolated before entries are read out of it.
    """
    text = clean_text(page_html)
    start = text.find("Group Members")
    if start < 0:
        return []
    segment = text[start + len("Group Members"):]
    end = segment.find("Available Files")
    if end >= 0:
        segment = segment[:end]
    rows = []
    for position, match in enumerate(_ROSTER_ENTRY_RE.finditer(segment), start=1):
        rows.append(
            {
                "roster_position": position,
                "published_name": match.group(1).strip(),
                "country": match.group(2).strip(),
                "induction_year": match.group(3),
                "source_page": source_page,
            }
        )
    return rows


def _read_page(path):
    """Read a mirrored page.

    None of these pages declares a character set, and the crawl spans a site old
    enough to have served both encodings, so a page that is not UTF-8 is read as
    Windows-1252 rather than failing the whole extraction. Some accented names
    on the roster arrive as replacement characters whatever the read does,
    because the legacy site itself served them already broken; that loss belongs
    to the source and is transcribed as found rather than guessed at.
    """
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


def _relative_to_mirror(path):
    return str(path.relative_to(MIRROR_ROOT.parent))


def collect_year_pages():
    rows = []
    for page_dir in sorted(YEAR_PAGES_DIR.iterdir()):
        year_match = re.fullmatch(r"(\d{4})-2", page_dir.name)
        index = page_dir / "index.html"
        if not year_match or not index.is_file():
            continue
        rows.extend(
            parse_year_page(_read_page(index), year_match.group(1), _relative_to_mirror(index))
        )
    rows.sort(key=lambda row: (int(row["induction_number"]), row["published_name"]))
    return rows


def collect_group_roster():
    if not GROUP_ROSTER_PAGE.is_file():
        return []
    return parse_group_roster(
        _read_page(GROUP_ROSTER_PAGE), _relative_to_mirror(GROUP_ROSTER_PAGE)
    )


def _existing_row_count(path):
    if not path.exists():
        return 0
    with path.open(encoding="utf-8", newline="") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def _write(path, fieldnames, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-shrink",
        action="store_true",
        help="Permit overwriting an extract with fewer rows than it already "
        "holds. Without this a smaller extraction is refused as a likely "
        "incomplete mirror.",
    )
    args = parser.parse_args()

    if not YEAR_PAGES_DIR.is_dir():
        print(
            f"ERROR: the Hall of Fame reference pages are not in the mirror at "
            f"{YEAR_PAGES_DIR}. The mirror is a local-only input reached through the "
            f"footbag_legacy_mirror symlink; restore or refresh it and re-run.",
            file=sys.stderr,
        )
        sys.exit(1)

    script_mtime = Path(__file__).stat().st_mtime
    outputs_current = all(
        path.exists() and path.stat().st_mtime > script_mtime
        for path in (YEAR_PAGES_CSV, GROUP_ROSTER_CSV)
    )
    if outputs_current:
        print(f"Hall of Fame mirror extracts are up to date, skipping. ({OUTPUT_DIR})")
        return

    year_rows = collect_year_pages()
    roster_rows = collect_group_roster()

    # Refuse to shrink. A partially-synced mirror would otherwise replace a full
    # extract with a fragment, and every later merge would read the gap as the
    # site having lost honorees.
    for path, rows, label in (
        (YEAR_PAGES_CSV, year_rows, "year-page entries"),
        (GROUP_ROSTER_CSV, roster_rows, "roster entries"),
    ):
        existing = _existing_row_count(path)
        if len(rows) < existing and not args.allow_shrink:
            print(
                f"ERROR: extracted {len(rows)} {label} but {path} already holds "
                f"{existing}. The mirror is almost certainly incomplete; refusing to "
                f"overwrite the larger extract. Refresh the mirror and re-run, or pass "
                f"--allow-shrink if the reduction is real.",
                file=sys.stderr,
            )
            sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    _write(YEAR_PAGES_CSV, YEAR_PAGE_FIELDNAMES, year_rows)
    _write(GROUP_ROSTER_CSV, GROUP_ROSTER_FIELDNAMES, roster_rows)

    if not roster_rows:
        print(
            "WARNING: the Hall of Fame group roster page is missing from the mirror, "
            "so the country column and any honoree without a year page will be absent "
            "from the merge.",
            file=sys.stderr,
        )
    print(f"Wrote {len(year_rows)} year-page entries to {YEAR_PAGES_CSV}.")
    print(f"Wrote {len(roster_rows)} roster entries to {GROUP_ROSTER_CSV}.")


if __name__ == "__main__":
    main()
