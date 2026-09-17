#!/usr/bin/env python3
"""
QC: committed seed CSVs carry readable text, not encoding damage.

A seed CSV is an input the production load consumes, so damage that reaches one
reaches members. This check reads the committed seed files directly and fails on
text that is provably mangled rather than merely unusual.

## What counts as damage

Three signatures, each decidable without guessing at intent:

1. Double encoding. UTF-8 bytes that were read through a single-byte codepage and
   then stored produce text that can be encoded back to single bytes and decoded
   as UTF-8. A value that is genuinely correct either cannot make that round trip
   or comes back unchanged, so the round trip itself is the test. This is what a
   wrong dump decode leaves behind.

2. Escaped characters left as text. An HTML numeric character reference in a seed
   value means the escape was never decoded, so a member would read a literal
   `&#261;` where a letter belongs.

3. Codepage mismatch at the source. Text typed through a codepage the legacy
   database did not record survives every decode intact and still reads as
   nonsense, so neither signature above sees it. The tell is that every letter in
   the value sits in the Latin-1 supplement with not one ASCII letter among them:
   real Latin-script text mixes the two, so a value made only of accented forms is
   another script wearing Latin bytes. Recovery needs the originating codepage,
   which is why these are corrected per row rather than by a rule.

4. HTML markup left in a text value. The legacy site let members write HTML into
   a description and rendered it; this platform escapes description text instead,
   so a tag that survives into the seed is shown to every visitor as literal
   markup. Three club descriptions reached the database that way, one of them an
   entire Google Groups subscribe widget, table and form and all.

   Decided on a whitelist of real HTML element names rather than on angle
   brackets, because angle brackets alone are not damage: one club writes its
   own name as `<<<<<<<<LeGo FoOtBaG Club>>>>>>>>`, and an address or an
   inequality can carry them too. A whitelisted element name inside a tag is
   decidable in the way the three signatures above are.

Deliberately NOT flagged: ordinary non-ASCII text. Accented, Cyrillic, and CJK
values are correct data and the point of the check is to protect them. Signature 3
is written to leave them alone — a genuinely accented Latin name keeps its ASCII
letters, and real Cyrillic is outside the Latin-1 supplement entirely.

Existing mojibake detectors elsewhere in the pipeline match a different corruption
class (single-byte codepage artifacts in person names) and would not catch either
signature above, which is why this is its own check rather than a reuse.

## Exit codes

    0  PASS — every scanned seed file is clean
    0  SKIP — no seed file present to scan
    1  FAIL — damaged values found; each is listed with file, key, and field
    2  ERROR — a seed file exists but could not be read
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_ROOT = SCRIPT_DIR.parents[1]

# Seed files scanned, with the column that identifies a row in the failure
# report. Text-bearing seeds are listed here as they gain committed text.
SCANNED_SEEDS: tuple[tuple[str, str], ...] = (
    ("seed/clubs.csv", "legacy_club_key"),
)

_NUMERIC_ENTITY_RE = re.compile(r"&#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6});")

# The element names a legacy description plausibly carries. A trailing word
# boundary makes each one exact, so `<big>` can never be reported as `<b>` and
# the order of the alternation does not matter.
_HTML_ELEMENTS = "|".join((
    "blockquote", "figcaption", "colgroup", "fieldset", "textarea", "marquee",
    "section", "caption", "article", "strong", "strike", "button", "center",
    "iframe", "legend", "object", "option", "script", "select", "source",
    "footer", "header", "figure", "canvas", "aside", "embed", "param", "small",
    "style", "table", "tbody", "tfoot", "thead", "title", "video", "audio",
    "label", "input", "big", "div", "font", "form", "head", "html", "link",
    "meta", "span", "sub", "sup", "nav", "map", "area", "body", "code", "pre",
    "col", "dd", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
    "br", "img", "li", "ol", "td", "th", "tr", "ul", "a", "b", "i", "p", "s",
    "u",
))
_HTML_TAG_RE = re.compile(rf"</?\s*(?:{_HTML_ELEMENTS})\b[^>]*>", re.IGNORECASE)


def double_encoded_repair(text: str) -> str | None:
    """The value this text should have been, when it carries double-encoding
    damage; None when it is clean."""
    if not text:
        return None
    try:
        repaired = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None
    return repaired if repaired != text else None


def looks_like_codepage_mismatch(text: str) -> bool:
    """True when every letter in the value sits in the Latin-1 supplement and none
    is ASCII, which means another script was stored through a codepage nobody
    recorded. A Latin-script value keeps ASCII letters alongside its accented
    ones, and text in a genuinely non-Latin script falls outside this range."""
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 2:
        return False
    return all("À" <= c <= "ÿ" for c in letters)


def scan_seed(path: Path, key_field: str) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            row_key = (row.get(key_field) or "").strip() or "(no key)"
            for field, value in row.items():
                if field == key_field or not value:
                    continue
                repaired = double_encoded_repair(value)
                if repaired is not None:
                    findings.append({
                        "key": row_key, "field": field, "kind": "double-encoded",
                        "value": value, "detail": f"should read {repaired!r}",
                    })
                    continue
                match = _NUMERIC_ENTITY_RE.search(value)
                if match:
                    findings.append({
                        "key": row_key, "field": field, "kind": "undecoded escape",
                        "value": value, "detail": f"contains {match.group(0)!r}",
                    })
                    continue
                tag = _HTML_TAG_RE.search(value)
                if tag:
                    findings.append({
                        "key": row_key, "field": field, "kind": "html markup",
                        "value": value,
                        "detail": f"contains {tag.group(0)!r}; the platform escapes this "
                                  "text rather than rendering it, so the tag is shown to "
                                  "the reader as literal markup",
                    })
                    continue
                if looks_like_codepage_mismatch(value):
                    findings.append({
                        "key": row_key, "field": field, "kind": "codepage mismatch",
                        "value": value,
                        "detail": "every letter is an accented Latin-1 form with no ASCII "
                                  "letter, so another script was stored through an "
                                  "unrecorded codepage",
                    })
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--seed-dir", type=Path, default=LEGACY_ROOT,
                        help="Root the scanned seed paths are resolved against.")
    args = parser.parse_args()

    print("=== seed text hygiene ===")
    print("Invariant: a committed seed value is readable text, never double-encoded,")
    print("never a literal HTML numeric character reference, and never HTML markup.")

    total_findings: list[tuple[str, dict[str, str]]] = []
    scanned = 0
    for rel, key_field in SCANNED_SEEDS:
        path = (args.seed_dir / rel).resolve()
        if not path.exists():
            print(f"\nskip: {rel} not present.")
            continue
        try:
            findings = scan_seed(path, key_field)
        except Exception as exc:
            print(f"\nERROR: failed to read {path}: {exc}", file=sys.stderr)
            return 2
        scanned += 1
        print(f"\n{rel}: scanned, {len(findings)} damaged value(s).")
        total_findings.extend((rel, f) for f in findings)

    if scanned == 0:
        print("\nSKIP: no seed file available to scan.")
        return 0

    if not total_findings:
        print("\nSTATUS: PASS")
        return 0

    print(f"\nSTATUS: FAIL — {len(total_findings)} damaged value(s):")
    for rel, f in total_findings:
        print(f"  {rel}  {f['key']}  {f['field']}  [{f['kind']}]  {f['value']!r}  {f['detail']}")
    print()
    print("Fix at the producer, never by hand-editing the seed. For the club seed")
    print("that is scripts/overlay_clubs_from_dump.py; a row whose damage no general")
    print("rule can repair gets an entry in overrides/club_text_corrections.csv with")
    print("its reason. Clear the affected rows before re-running the producer, since")
    print("it preserves rows already present in the seed verbatim.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
