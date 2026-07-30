#!/usr/bin/env python3
"""Curator-authoritative club inputs, parsed in one place.

Two curated files govern club data, and both are read by several scripts across
two directories. Each reader lives here once, because a second copy of one is how
a ruling goes stale: a duplicate pair the curator recorded was honoured by the
candidate classifier and the cutover while a loader carried its own hardcoded
list, so a club the curator had retired stayed published as a second live club.

Callers keep their own function names and return shapes over these readers, since
one wants the retired keys and another wants the retired-to-kept mapping; what
they must not keep is their own parsing.

The seed column list lives here too, for the same reason: both seed producers need
it, and the corrections reader has to reject a field that is not a seed column.
"""
from __future__ import annotations

import csv
import html
import re
from pathlib import Path

# A numeric character reference, decimal or hexadecimal.
_NUMERIC_ENTITY_RE = re.compile(r"&#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6});")

LEGACY_DATA_ROOT = Path(__file__).resolve().parent.parent

# The committed club seed's columns, in order. Both producers write this shape.
SEED_FIELDNAMES = [
    "legacy_club_key",
    "name",
    "city",
    "region",
    "country",
    "contact_member_id",
    "external_url",
    "description",
    "created",
    "last_updated",
]

CLUB_DUPLICATES_CSV = LEGACY_DATA_ROOT / "overrides" / "club_duplicates.csv"
CLUB_TEXT_CORRECTIONS_CSV = LEGACY_DATA_ROOT / "overrides" / "club_text_corrections.csv"


def decode_numeric_entities(text: str) -> str:
    """Turn HTML numeric character references back into the characters they stand
    for. Several legacy club records store non-Latin text this way, which would
    otherwise reach members as a literal `&#261;` run.

    Only numeric references are decoded, never named ones: a numeric reference
    always denotes a single character, whereas the named set is where markup would
    be reconstituted from escaped text.
    """
    if not text or "&#" not in text:
        return text
    return _NUMERIC_ENTITY_RE.sub(lambda m: html.unescape(m.group(0)), text)


def clean_club_text(text: str | None) -> str:
    """Trim, restore numerically-escaped characters, and settle line endings to LF.

    Decoding happens at this boundary so every consumer sees real characters,
    including the description scrubber, which could not recognise an address or a
    phone number still hidden behind escapes. Line endings are settled here too:
    the legacy dump escapes multi-line text with carriage returns and the seed
    dialect is LF, so a value carrying CRLF would otherwise make the written bytes
    depend on how a checkout normalises them.

    Shared, because a curated correction has to be decoded identically by both seed
    producers; cleaning it in only one of them would make the repair depend on
    which producer ran last.
    """
    if text is None:
        return ""
    cleaned = decode_numeric_entities(str(text).strip())
    return cleaned.replace("\r\n", "\n").replace("\r", "\n")


def load_club_duplicate_pairs(path: Path = CLUB_DUPLICATES_CSV) -> dict[str, str]:
    """Confirmed duplicate clubs as retired key -> kept key.

    Schema: ``keep_legacy_key,drop_legacy_key,reason``. The reason column documents
    the WHY for audit and drives nothing. A row missing either key adjudicates
    nothing and is skipped rather than retiring a club on incomplete input.

    A missing file means no adjudication has been recorded, so nothing is
    suppressed anywhere; that is the same answer every reader gave before the file
    existed, and it keeps a fresh checkout working.
    """
    if not path.exists():
        return {}
    pairs: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            drop = (row.get("drop_legacy_key") or "").strip()
            keep = (row.get("keep_legacy_key") or "").strip()
            if drop and keep:
                pairs[drop] = keep
    return pairs


def load_club_text_corrections(
    path: Path = CLUB_TEXT_CORRECTIONS_CSV,
) -> dict[tuple[str, str], str]:
    """Curator-authoritative per-row text corrections, as {(club_key, field):
    corrected_value}.

    Covers text the legacy database mangled beyond what a decoder recovers, and a
    source spelling normalised to the canonical name of what it names, such as a
    region recorded as a postal abbreviation or misspelled. An empty corrected
    value clears the field, which is how a website column holding prose rather
    than an address is emptied.

    Both seed producers apply these, so a correction holds whether or not the
    machine-local legacy dump is present. Applying them in only one producer left
    the repair depending on an optional input, which meant a re-extract from the
    mirror silently restored the damage.

    A field outside the seed columns is a mistake in the curated file rather than
    something to ignore, so it aborts loudly.
    """
    if not path.exists():
        return {}
    out: dict[tuple[str, str], str] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            key = clean_club_text(row.get("club_key"))
            field = clean_club_text(row.get("field"))
            if not key or field not in SEED_FIELDNAMES:
                raise SystemExit(
                    "club_text_corrections.csv row has a blank club_key or a field "
                    f"outside the seed columns: {row!r}"
                )
            out[(key, field)] = clean_club_text(row.get("corrected_value"))
    return out


def apply_club_text_corrections(
    row: dict, club_key: str, corrections: dict[tuple[str, str], str],
) -> dict:
    """Return ``row`` with every recorded correction for ``club_key`` applied.

    Shared so both producers apply corrections identically; an empty corrected
    value is a real correction and is applied, which is why the test is against
    None rather than falsiness.
    """
    for field in SEED_FIELDNAMES:
        corrected = corrections.get((club_key, field))
        if corrected is not None:
            row[field] = corrected
    return row
