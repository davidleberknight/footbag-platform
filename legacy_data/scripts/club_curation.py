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

# The C1 range, U+0080 to U+009F. These code points are unassigned controls in
# Unicode and in Latin-1, and printable punctuation in CP1252: curly quotes, en
# and em dashes, the ellipsis. Legacy text reaching us with one in it was written
# as a CP1252 byte and read back by a decoder that did not know that codepage, so
# the byte survived as a control with no glyph. No club field has any use for a
# control character, which is what makes their presence a reliable damage signal
# rather than a guess about content.
#
# Written as a numeric range rather than a character class so the bounds stay
# legible in source: the characters themselves are invisible, and a literal one
# is the kind of thing an editor silently eats.
_C1_FIRST, _C1_LAST = 0x80, 0x9F

# Five of those byte values are genuinely undefined in CP1252, so there is no
# character to restore them to. They are left as they are rather than mapped to
# something plausible.
_CP1252_FROM_C1: dict[str, str] = {}
for _cp in range(_C1_FIRST, _C1_LAST + 1):
    try:
        _CP1252_FROM_C1[chr(_cp)] = bytes([_cp]).decode("cp1252")
    except UnicodeDecodeError:
        pass

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


def has_c1_controls(text: str | None) -> bool:
    """True when the text carries a C1 control, which no club field ever should."""
    if not text:
        return False
    return any(_C1_FIRST <= ord(c) <= _C1_LAST for c in str(text))


def repair_cp1252_controls(text: str | None) -> str:
    """Restore CP1252 punctuation that survived as a C1 control.

    The narrower repair the overlay applies reverses whole-string mojibake, where
    UTF-8 bytes were stored after being read as a single-byte codepage. It detects
    that by round-tripping the text and re-decoding, which only succeeds for text
    that really carries that damage. A lone CP1252 byte inside otherwise-correct
    text fails that round trip and passes through untouched, which is how a
    working em dash became U+0097 the moment a club's description started coming
    from the dump instead of the mirror.

    This repair is per character and needs no round trip, so the two compose: the
    whole-string reversal handles its case, and whatever it leaves behind in the
    C1 range is restored here.
    """
    if not text:
        return ""
    s = str(text)
    if not has_c1_controls(s):
        return s
    return "".join(_CP1252_FROM_C1.get(c, c) for c in s)


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
    """Trim, restore numerically-escaped characters, repair CP1252 punctuation that
    arrived as a control, and settle line endings to LF.

    Decoding happens at this boundary so every consumer sees real characters,
    including the description scrubber, which could not recognise an address or a
    phone number still hidden behind escapes. The CP1252 repair belongs at the same
    boundary and for the same reason: a control character is not a real character,
    and leaving it for each consumer to notice is how one reached the published
    club seed. Line endings are settled here too: the legacy dump escapes
    multi-line text with carriage returns and the seed dialect is LF, so a value
    carrying CRLF would otherwise make the written bytes depend on how a checkout
    normalises them.

    Numeric references are decoded first, because a reference can itself denote a
    C1 code point and would otherwise become a control this function has already
    walked past.

    Shared, because a curated correction has to be decoded identically by both seed
    producers; cleaning it in only one of them would make the repair depend on
    which producer ran last.
    """
    if text is None:
        return ""
    cleaned = repair_cp1252_controls(decode_numeric_entities(str(text).strip()))
    return cleaned.replace("\r\n", "\n").replace("\r", "\n")


def blank_location_placeholder(text: str | None) -> str:
    """Drop a legacy empty marker from a location field, keeping every real value.

    The legacy club form stored an unset region as the word "none" rather than as
    nothing, so the marker is data-shaped: it survives every decode intact and
    reads as a place name to everything downstream, which is how it reached the
    published location line as "Itabashi-ku, Tokyo, none, Japan". A blank region is
    what the site already renders correctly, so the marker becomes blank here.

    Only a value that is the whole field is dropped, because "none" inside a longer
    string is ordinary text. Shared, because both seed producers set these fields
    and a marker cleared in only one of them returns whenever the other runs.
    """
    cleaned = clean_club_text(text)
    return "" if cleaned.strip().lower() == "none" else cleaned


def repair_doubled_url_scheme(url: str | None) -> str:
    """Strip a redundant scheme the legacy form prepended to an already-absolute URL.

    A club contact who typed a full web address into the legacy club form got it
    stored with another "http://" in front, producing "http://https://example.org".
    The legacy database is read-only, so the damage cannot be corrected at source,
    and the mirror faithfully reproduces it because the page's link really does say
    that. Left alone the value is not a working address at all: it names a host of
    "https", so the link is dead wherever it is published.

    Only a scheme immediately followed by another scheme is removed, and the inner
    one is kept, because it is what the person actually typed. A URL with one
    scheme, or with the word "http" anywhere else in it, is returned untouched.

    Shared, because both seed producers emit this column and a repair applied in
    only one of them comes back the moment the other runs.
    """
    cleaned = clean_club_text(url)
    if not cleaned:
        return ""
    return re.sub(r"^\s*https?://(?=https?://)", "", cleaned, count=1).strip()


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
