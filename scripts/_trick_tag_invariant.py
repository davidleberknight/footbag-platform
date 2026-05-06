#!/usr/bin/env python3
"""Trick-tag invariant validator for curator media.

Hard invariant: if a media item carries any trick-shaped tag, every
trick-shaped tag must resolve to an active or pending freestyle_tricks.slug.
Alias-only matches fail. Unknown tags fail. Items with no trick-shaped tags
are exempt (non-trick media: FH avatars, demo loops, event photos).

Used by:
  - scripts/promote_snippet_candidates.py (pre-write sidecar validation)
  - legacy_data/event_results/scripts/25_qc_media_tag_invariant.py (post-load QC)

Pure: no DB calls in the validator. Two convenience loaders are provided
(load_slug_sets_from_db, load_slug_sets_from_csvs) so callers can pick the
source of truth appropriate to their context.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from pathlib import Path
from typing import Iterable

_SLUG_SHAPE_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

META_EXACT: frozenset[str] = frozenset({
    "freestyle", "trick", "curated",
    "tricks_of_the_trade", "demo_freestyle", "demo_net",
})

META_PREFIX: tuple[str, ...] = ("event_", "club_", "member_", "fh_")


class MediaTagInvariantError(ValueError):
    """Raised when a media item violates the trick-tag invariant."""


def is_trick_shaped(tag: str) -> bool:
    """Return True if a tag (with or without leading '#') is a kebab-case
    slug-form tag, i.e. neither an exact-match meta tag nor a META_PREFIX tag.
    """
    if not tag:
        return False
    body = tag.lstrip("#")
    if not body or body != body.lower():
        return False
    if body in META_EXACT or body.startswith(META_PREFIX):
        return False
    return bool(_SLUG_SHAPE_RE.match(body))


def validate_media_tags(
    label: str,
    tags: Iterable[str],
    *,
    active_slugs: set[str],
    pending_slugs: set[str],
    alias_slugs: dict[str, str],
) -> None:
    """Validate a media item's tag list. Raise MediaTagInvariantError on the
    first violation. No auto-fix.

    label:         human-readable identifier surfaced in the error message.
    tags:          iterable of tag strings; each MUST start with '#'.
    active_slugs:  freestyle_tricks.slug values where is_active=1.
    pending_slugs: freestyle_tricks.slug values where is_active=0.
    alias_slugs:   alias_slug -> canonical trick_slug map (used for error
                   clarity when an alias is supplied where canonical is
                   required; alias-only tags still fail).
    """
    for raw_tag in tags:
        if not isinstance(raw_tag, str):
            raise MediaTagInvariantError(
                f"{label}: non-string tag {raw_tag!r}"
            )
        if not raw_tag.startswith("#"):
            raise MediaTagInvariantError(
                f"{label}: tag {raw_tag!r} must start with '#'"
            )
        body = raw_tag[1:]
        if not body:
            raise MediaTagInvariantError(
                f"{label}: empty tag body in {raw_tag!r}"
            )
        if body != body.lower():
            raise MediaTagInvariantError(
                f"{label}: tag {raw_tag!r} must be lowercase"
            )
        if body in META_EXACT or body.startswith(META_PREFIX):
            continue
        if not _SLUG_SHAPE_RE.match(body):
            raise MediaTagInvariantError(
                f"{label}: tag {raw_tag!r} is neither a recognized meta tag "
                f"nor a kebab-case slug (must match {_SLUG_SHAPE_RE.pattern})"
            )
        if body in active_slugs or body in pending_slugs:
            continue
        if body in alias_slugs:
            raise MediaTagInvariantError(
                f"{label}: tag {raw_tag!r} is an alias for canonical slug "
                f"'{alias_slugs[body]}' — use the canonical form"
            )
        raise MediaTagInvariantError(
            f"{label}: tag {raw_tag!r} does not resolve to any active or "
            f"pending freestyle_tricks.slug"
        )


def load_slug_sets_from_db(
    con: sqlite3.Connection,
) -> tuple[set[str], set[str], dict[str, str]]:
    """Return (active_slugs, pending_slugs, alias_slugs) from an open
    connection. Caller must ensure the freestyle_tricks +
    freestyle_trick_aliases tables are loaded.
    """
    active = {r[0] for r in con.execute(
        "SELECT slug FROM freestyle_tricks WHERE is_active=1"
    )}
    pending = {r[0] for r in con.execute(
        "SELECT slug FROM freestyle_tricks WHERE is_active=0"
    )}
    aliases = {r[0]: r[1] for r in con.execute(
        "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases"
    )}
    return active, pending, aliases


def load_slug_sets_from_csvs(
    repo_root: Path,
) -> tuple[set[str], set[str], dict[str, str]]:
    """Return (active_slugs, pending_slugs, alias_slugs) read directly from
    the curated CSVs. Useful for tools that run before a DB reset.
    """
    tricks_csv     = repo_root / "legacy_data" / "inputs" / "noise"   / "tricks.csv"
    red_additions  = repo_root / "legacy_data" / "inputs" / "curated" / "tricks" / "red_additions_2026_04_20.csv"
    aliases_csv    = repo_root / "legacy_data" / "inputs" / "noise"   / "trick_aliases.csv"

    def name_to_slug(name: str) -> str:
        return re.sub(r"\s+", "-", name.strip().lower())

    active: set[str] = set()
    pending: set[str] = set()
    aliases: dict[str, str] = {}

    with tricks_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("trick_canon") or "").strip()
            if name:
                active.add(name_to_slug(name))

    with red_additions.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("canonical_name") or "").strip()
            if not name:
                continue
            slug = name_to_slug(name)
            if (row.get("is_active") or "1").strip() == "1":
                active.add(slug)
            else:
                pending.add(slug)
            inline_aliases = (row.get("aliases") or "").strip()
            if inline_aliases:
                for a in inline_aliases.split("|"):
                    a = a.strip()
                    if a:
                        aliases[name_to_slug(a)] = slug

    with aliases_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            alias  = (row.get("alias") or "").strip()
            target = (row.get("trick_canon") or "").strip()
            if alias and target:
                aliases[name_to_slug(alias)] = name_to_slug(target)

    return active, pending, aliases
