#!/usr/bin/env python3
"""Media-tag shape check for curator media, and the trick-slug lookup.

The hashtag standards set the rules, and they are deliberately few:

  1. Every tag starts with '#'.
  2. Tags are matched in lowercase and stored as typed, so a stored tag is
     lowercase.
  3. A trick tag is a tag that exactly matches an active freestyle trick slug.
     Anything else is not a trick tag.
  4. Every other tag is freeform: anyone may invent one, and an upload never
     blocks on its tags.

`validate_media_tags` checks standards 1 and 2 and nothing else: there is no
allow-list, no prefix vocabulary and no required tag, because a tag that is
not a trick slug is a freeform tag rather than an error. `load_active_trick_slugs_*`
answers standard 3 for a tool that needs to know whether a tag names a trick.
A retired (inactive) trick row is not a trick, so it is not among them.

Used by:
  - scripts/promote_snippet_candidates.py and scripts/acquire_footbag_org_demos.py
    (pre-write sidecar validation)
  - freestyle/loaders/25_qc_media_tag_invariant.py (post-load QC)
  - freestyle/loaders/24_qc_freestyle_media_coverage.py (which tags name a trick)

Pure: no DB calls in the validator. Loaders are provided for both the DB and
the committed CSVs.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from pathlib import Path
from typing import Iterable


class MediaTagInvariantError(ValueError):
    """Raised when a media item's tags break the hashtag standards."""


def validate_media_tags(label: str, tags: Iterable[str]) -> None:
    """Raise MediaTagInvariantError on the first tag that does not start with
    '#', has an empty body, or is not lowercase. An empty tag list passes:
    uploads never block on tags.

    label: human-readable identifier surfaced in the error message.
    """
    for raw_tag in tags:
        if not isinstance(raw_tag, str):
            raise MediaTagInvariantError(f"{label}: non-string tag {raw_tag!r}")
        if not raw_tag.startswith("#"):
            raise MediaTagInvariantError(f"{label}: tag {raw_tag!r} must start with '#'")
        body = raw_tag[1:]
        if not body:
            raise MediaTagInvariantError(f"{label}: empty tag body in {raw_tag!r}")
        if body != body.lower():
            raise MediaTagInvariantError(f"{label}: tag {raw_tag!r} must be lowercase")


def load_active_trick_slugs_from_db(con: sqlite3.Connection) -> set[str]:
    """The active freestyle trick slugs, from an open connection."""
    return {r[0] for r in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1")}


def load_active_trick_slugs_from_csvs(repo_root: Path) -> set[str]:
    """The active freestyle trick slugs read from the committed CSVs, for tools
    that run before a database rebuild."""
    tricks_csv    = repo_root / "freestyle" / "inputs" / "base_dictionary" / "tricks.csv"
    red_additions = repo_root / "freestyle" / "inputs" / "curated" / "tricks" / "red_additions_2026_04_20.csv"

    def name_to_slug(name: str) -> str:
        return re.sub(r"\s+", "_", name.strip().lower())

    active: set[str] = set()
    with tricks_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("trick_canon") or "").strip()
            if name:
                active.add(name_to_slug(name))
    with red_additions.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("canonical_name") or "").strip()
            if name and (row.get("is_active") or "1").strip() == "1":
                active.add(name_to_slug(name))
    return active
