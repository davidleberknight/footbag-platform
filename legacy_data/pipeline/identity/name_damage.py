"""Whether a roster or account name is damaged in encoding.

One test for both loaders that meet such names. The enrichment loader keeps a
damaged roster spelling off a provisional person and marks the person to wait for
its legacy account's repaired name; the member load copies that name across and
refuses an account name that is no better. Judging the two differently would let
the member load replace one damaged spelling with another.
"""
from __future__ import annotations

import re

# The name a provisional person carries while its source spelling, damaged in
# encoding, waits for its legacy account's repaired name; the site shows it as an
# unknown name. The notes marker is what the member load finds to replace it.
UNKNOWN_NAME = "Unknown"
NAME_PENDING_ACCOUNT_REPAIR = "name pending legacy account repair"

_MOJIBAKE = re.compile(r"[¶¦±¼¿¸¹º³]")
_EMBEDDED_Q = re.compile(r"\w\?|\?\w")
_STANDALONE_Q = re.compile(r"(?:^|\s)\?{1,5}(?:\s|$)")

# A lone capital, a space, then a lower-case word: a letter whose accent markup the
# roster extractor turned into a space ("S<caron>tepan" read as "S tepan").
_SPLIT_ACCENTED_LETTER = re.compile(r"(?:^|\s)[A-Z]\s[a-zà-ÿ]")

# The legacy system's accent markup, left undecoded ("S<caron>").
_ACCENT_MARKUP = re.compile(r"<[a-z]+>")


def roster_name_damage(name: str) -> str:
    """Why a roster, membership or account name is damaged in encoding, or ""
    when it is not: a codepage-mismatch character, a question mark standing for a
    lost letter, a letter split from its accent, or accent markup left in the name.
    Nothing else about a name blocks it."""
    if _MOJIBAKE.search(name):
        return "codepage-mismatch character"
    if _EMBEDDED_Q.search(name) or _STANDALONE_Q.search(name):
        return "question mark for a lost letter"
    if _SPLIT_ACCENTED_LETTER.search(name):
        return "letter split from its accent"
    if _ACCENT_MARKUP.search(name):
        return "accent markup left in the name"
    return ""
