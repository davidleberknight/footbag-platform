"""
Refuse a curated input that asks for the same alias twice.

An alias is stored under a normalised slug, so two spellings that fold together
are one row, not two. A file listing both is asking for one alias under two
names, and only one of them can survive. Which one is then decided by whichever
loader happens to write last, or by whichever collides first with another
producer's row: an answer nobody chose, arrived at differently depending on the
order the pipeline ran in.

Three such pairs sat in the curated inputs unnoticed for months, invisible only
because one loader claimed each slug before another deduplicated. Removing an
unrelated destructive clear was enough to make them collide outright. That is the
failure mode this refuses: not the collision, which is loud, but the years of
quiet before it, where the displayed spelling was an accident.

So the gate is fail-closed and says nothing about which spelling is right. That is
a curator's decision, recorded by correcting the file, and a loader silently
picking the first or the last would take it away from them.
"""
from __future__ import annotations

import re
from collections import defaultdict


class DuplicateAliasSlugError(ValueError):
    """One input asks for the same normalised alias slug more than once."""


def alias_text_to_slug(text: str) -> str:
    """The fold every alias surface uses: alphanumerics, single underscores."""
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def assert_no_duplicate_alias_slugs(aliases, source: str) -> None:
    """Raise if any normalised slug appears twice in `aliases`.

    `aliases` is an iterable of (alias_text, target) pairs, target being whatever
    the input calls the trick; it appears in the message so a curator can see
    whether the two rows even meant the same trick.
    """
    seen: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for text, target in aliases:
        text = (text or "").strip()
        if not text:
            continue
        slug = alias_text_to_slug(text)
        if slug:
            seen[slug].append((text, target))

    duplicates = {slug: rows for slug, rows in seen.items() if len(rows) > 1}
    if not duplicates:
        return

    lines = [f"{source} asks for {len(duplicates)} alias slug(s) more than once. "
             f"Each is one row, so only one spelling can survive:"]
    for slug in sorted(duplicates):
        spellings = ", ".join(f'"{t}" -> {g}' for t, g in duplicates[slug])
        lines.append(f"  {slug}: {spellings}")
    lines.append("Correct the input: keep the spelling that should be recorded and "
                 "remove the other. Nothing here chooses for you, because the choice "
                 "decides what a reader is shown.")
    raise DuplicateAliasSlugError("\n".join(lines))
