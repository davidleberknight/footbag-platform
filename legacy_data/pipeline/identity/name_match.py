"""
The claim step's name rule, for the pipeline stages that must agree with it.

The application decides whether two names are the same person's in its claim
step: a name is its first given name plus its possible surnames, which are every
later word, so a middle name never blocks a match and, because a middle name is
often a maiden name, it can make one. Two names agree when their first given
names agree, exactly or as a curated nickname pair, and they share a possible
surname that is not a particle such as "de" or "van".

The duplicate-account merge and the record-to-account linking run before any
member claims anything. If they folded or compared names differently from the
claim step, the pipeline would link a record the claim step then refuses, or
leave unlinked one it accepts. So this module ports the application's fold and
comparison exactly, and its tests run the application's own unit cases against
it.

This is a comparison rule, not a normaliser: it never produces a key that is
stored. normalize_name in alias_resolver stays the stored-key normaliser, and the
fingerprints recorded rulings carry are built from it.

Public API:
    fold_name_words(name)                 -> list[str]
    name_match_parts(name)                -> NameParts(first, later)
    load_nicknames(path)                  -> {folded first name: {alternates}}
    first_names_agree(a, b, nicknames)    -> bool
    names_agree(a, b, nicknames)          -> bool
    is_placeholder_birth_date(iso, today) -> bool
"""

from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

DEFAULT_GIVEN_NAME_VARIANTS = (
    Path(__file__).resolve().parents[2] / "inputs" / "curated" / "given_name_variants.csv"
)

# The suffixes the fold drops from the end of a name.
_NAME_SUFFIXES = frozenset({"jr", "sr", "ii", "iii", "iv"})

# Letters that carry no combining mark to strip, so the accent fold leaves them
# standing and two spellings of one name would never meet.
_LETTER_FOLDS = (
    ("ø", "o"), ("ł", "l"), ("ß", "ss"), ("æ", "ae"), ("œ", "oe"), ("đ", "d"), ("þ", "th"),
)

# A double-quoted nickname inside a name, in straight or curly quotes.
_QUOTED_NICKNAME_RE = re.compile("[\"“”][^\"“”]*[\"“”]")
# Hyphen, the Unicode hyphens, and the en and em dashes all separate words.
_WORD_SEPARATOR_RE = re.compile("[-‐‑–—]")
# Apostrophes, the backtick, commas and full stops are removed inside words.
_REMOVED_PUNCT_RE = re.compile("['‘’`,.]")
_COMBINING_MARK_RE = re.compile("[̀-ͯ]")

# Particles never count as a surname on their own: "de" or "van" is shared by
# unrelated families, so "Maria de Souza" must not reach "Maria de Silva".
SURNAME_PARTICLES = frozenset({
    "de", "da", "das", "do", "dos", "du", "del", "della", "der", "den", "di", "la", "le",
    "van", "von", "ter", "ten", "st", "y", "e", "al", "el", "bin", "ben", "mac",
})


@dataclass(frozen=True)
class NameParts:
    first: str
    later: tuple[str, ...]


def _strip_accents(s: str) -> str:
    return _COMBINING_MARK_RE.sub("", unicodedata.normalize("NFD", s))


def fold_name_words(name: str | None) -> list[str]:
    """A name folded into the words the claim step compares.

    A double-quoted nickname is removed, accents and the letters above are
    folded, hyphens become spaces, apostrophes, commas and full stops go,
    whitespace collapses, and a trailing Jr, Sr, II, III or IV is dropped.
    """
    if not name:
        return []
    s = unicodedata.normalize("NFKC", name).lower()
    s = _QUOTED_NICKNAME_RE.sub(" ", s)
    for source, target in _LETTER_FOLDS:
        s = s.replace(source, target)
    s = _strip_accents(s)
    s = _REMOVED_PUNCT_RE.sub("", _WORD_SEPARATOR_RE.sub(" ", s))
    words = s.split()
    while len(words) > 1 and words[-1] in _NAME_SUFFIXES:
        words.pop()
    return words


def name_match_parts(name: str | None) -> NameParts:
    """The first given name and the possible surnames, initials dropped.

    A name that is mostly initials ("J Smith") keeps them, or dropping the
    initial would leave a first name and no surname at all.
    """
    every = fold_name_words(name)
    without_initials = [w for w in every if len(w) > 1]
    words = without_initials if len(without_initials) >= 2 else every
    return NameParts(first=words[0] if words else "", later=tuple(words[1:]))


def load_nicknames(path: Path | None = None) -> dict[str, frozenset[str]]:
    """The curated nickname pairs, folded, each name mapped to its alternates.

    A pair applies in both directions and only directly: two short forms of one
    long form are not a pair with each other.
    """
    path = Path(path) if path is not None else DEFAULT_GIVEN_NAME_VARIANTS
    pairs: dict[str, set[str]] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            short = fold_name_words(row.get("short_form"))
            long = fold_name_words(row.get("long_form"))
            if len(short) != 1 or len(long) != 1 or short == long:
                continue
            pairs.setdefault(short[0], set()).add(long[0])
            pairs.setdefault(long[0], set()).add(short[0])
    return {name: frozenset(alternates) for name, alternates in pairs.items()}


def first_names_agree(a: str, b: str, nicknames: dict[str, frozenset[str]]) -> bool:
    """Two folded first names agree when equal or a curated nickname pair."""
    if not a or not b:
        return False
    return a == b or b in nicknames.get(a, frozenset())


def names_agree(a: str | None, b: str | None, nicknames: dict[str, frozenset[str]]) -> bool:
    """Whether two names are the same person's under the claim step's rule."""
    pa, pb = name_match_parts(a), name_match_parts(b)
    if not pa.later or not pb.later:
        return False
    if not first_names_agree(pa.first, pb.first, nicknames):
        return False
    shared = set(pa.later) & set(pb.later)
    return any(word not in SURNAME_PARTICLES for word in shared)


def _years_before(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year - years)
    except ValueError:  # 29 February in a year that has none rolls to 1 March
        return date(day.year - years, 3, 1)


def is_placeholder_birth_date(iso: str | None, today: date | None = None) -> bool:
    """A date the legacy data uses as a placeholder: not a full date, before 1930,
    within the last five years, or the first of January of any year. It
    corroborates nothing."""
    value = (iso or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return True
    if int(value[:4]) < 1930:
        return True
    if value[5:] == "01-01":
        return True
    today = today or date.today()
    return value >= _years_before(today, 5).isoformat()
