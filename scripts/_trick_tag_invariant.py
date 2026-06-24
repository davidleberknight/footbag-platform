#!/usr/bin/env python3
"""Media-tag invariant validator for curator media.

Rules:
  1. Every media item MUST carry at least one semantic tag.
  2. Semantic tag domains:
     - TRICK  — kebab-case body matching a trick freestyle_tricks.slug (active or
                pending). A set/operator/modifier slug must use its role prefix;
                bare tags are reserved for trick-role media (pixie/fairy are
                dual-role and may stay bare).
     - EVENT  — body starting with 'event_'
     - SYSTEM — body starting with 'demo_' or 'fh_'
     - LINKAGE — body starting with 'set_', 'operator_', 'family_', 'player_', or 'club_'
  3. Trick-shaped tags (kebab-case, non-utility, non-domain-prefix) MUST
     resolve to an active or pending slug; alias-only or unknown bodies fail.
  4. Utility tags (freestyle, trick, curated, tricks_of_the_trade) pass
     through but do NOT count toward the semantic-tag requirement.
  5. Items with zero semantic tags fail.
  6. Hard fail (raises MediaTagInvariantError); no auto-fix; no warnings.

Used by:
  - scripts/promote_snippet_candidates.py (pre-write sidecar validation)
  - legacy_data/event_results/scripts/25_qc_media_tag_invariant.py (post-load QC)

Pure: no DB calls in the validator. Convenience loaders provided for both
DB and CSV sources of truth.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from pathlib import Path
from typing import Iterable

_SLUG_SHAPE_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

UTILITY_EXACT: frozenset[str] = frozenset({
    "freestyle", "trick", "curated", "tricks_of_the_trade",
    "passback_records", "footbag_org",
    "shred_global", "anz_trikz", "footbag_finland",
    "passback_tutorials", "passback_advanced", "passback_beginner",
    "passback_how_to", "chinlone",
    # The individual-shred collection: the Big Add Posse roster tag (#bap) and the
    # named-gallery collection tag, both on the individual-shred clips; parallel to
    # the source-collection tags above.
    "bap", "individual_shred_videos",
    # Curator-applied status marker, NOT a source: db.ts filters items tagged
    # #unavailable_embed out of all media surfaces (always-on exclusion).
    "unavailable_embed",
})

SEMANTIC_PREFIXES: tuple[str, ...] = (
    "event_", "demo_", "fh_",
    "player_", "club_", "set_", "by_",
    # Role-typed entity-linkage prefixes: a media item pointing at a set (set_),
    # an operator / modifier (operator_), or a trick family (family_), as opposed
    # to a bare trick slug. The operator / modifier role uses operator_, matching
    # the /freestyle/operators surface and the hashtag role vocabulary.
    "operator_", "family_",
    # concept_ = educational/meta media not about a single trick;
    # discipline_ = non-freestyle discipline media (chinlone, net, sideline).
    "concept_", "discipline_",
)

# Slugs that carry a trick role in addition to their set/operator role, so a bare
# hashtag stays valid for them. Mirrors the dual-role registry in
# src/content/freestyleHashtagRoles.ts; keep the two in lockstep.
DUAL_ROLE_TRICK_SLUGS: frozenset[str] = frozenset({"pixie", "fairy"})

# freestyle_tricks.category values that are not tricks. A bare hashtag whose slug
# has one of these categories is rejected (use the role-prefixed tag) unless the
# slug is dual-role above.
NONTRICK_CATEGORIES: frozenset[str] = frozenset({"set", "modifier", "operator"})


class MediaTagInvariantError(ValueError):
    """Raised when a media item violates the media-tag invariant."""


def is_trick_shaped(tag: str) -> bool:
    """Return True if a tag (with or without leading '#') is a kebab-case
    slug-form tag — neither a utility tag nor a recognized domain prefix.
    """
    if not tag:
        return False
    body = tag.lstrip("#")
    if not body or body != body.lower():
        return False
    if body in UTILITY_EXACT or body.startswith(SEMANTIC_PREFIXES):
        return False
    return bool(_SLUG_SHAPE_RE.match(body))


def validate_media_tags(
    label: str,
    tags: Iterable[str],
    *,
    active_slugs: set[str],
    pending_slugs: set[str],
    alias_slugs: dict[str, str],
    nontrick_slugs: frozenset[str] | set[str] = frozenset(),
) -> None:
    """Validate a media item's tag list. Raise MediaTagInvariantError on the
    first per-tag violation, or after the loop if no semantic tag is found.

    label:          human-readable identifier surfaced in the error message.
    tags:           iterable of tag strings; each MUST start with '#'.
    active_slugs:   freestyle_tricks.slug values where is_active=1.
    pending_slugs:  freestyle_tricks.slug values where is_active=0.
    alias_slugs:    alias_slug -> canonical trick_slug map (for error clarity).
    nontrick_slugs: slugs whose freestyle_tricks.category is set/modifier/operator;
                    a bare hashtag for one of these is rejected unless the slug is
                    a dual-role trick (DUAL_ROLE_TRICK_SLUGS).
    """
    has_semantic = False
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
        if body in UTILITY_EXACT:
            continue
        if body.startswith(SEMANTIC_PREFIXES):
            has_semantic = True
            continue
        if not _SLUG_SHAPE_RE.match(body):
            raise MediaTagInvariantError(
                f"{label}: tag {raw_tag!r} is neither a utility tag, a "
                f"recognized domain prefix ({', '.join(SEMANTIC_PREFIXES)}), "
                f"nor a kebab-case slug"
            )
        if body in active_slugs or body in pending_slugs:
            if body in nontrick_slugs and body not in DUAL_ROLE_TRICK_SLUGS:
                raise MediaTagInvariantError(
                    f"{label}: bare tag {raw_tag!r} names a non-trick concept "
                    f"(a set or operator); the bare-tag namespace is reserved for "
                    f"trick-role media — use its role-prefixed tag "
                    f"(e.g. #set_{body} or #operator_{body})"
                )
            has_semantic = True
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
    if not has_semantic:
        raise MediaTagInvariantError(
            f"{label}: no semantic tag — every media item must carry at "
            f"least one trick or domain-prefix tag "
            f"({', '.join(SEMANTIC_PREFIXES)})"
        )


def load_slug_sets_from_db(
    con: sqlite3.Connection,
) -> tuple[set[str], set[str], dict[str, str], set[str]]:
    """Return (active_slugs, pending_slugs, alias_slugs, nontrick_slugs) from an
    open connection. Caller must ensure the freestyle_tricks +
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
    nontrick = {r[0] for r in con.execute(
        "SELECT slug FROM freestyle_tricks "
        "WHERE category IN ('set', 'modifier', 'operator')"
    )}
    return active, pending, aliases, nontrick


def load_slug_sets_from_csvs(
    repo_root: Path,
) -> tuple[set[str], set[str], dict[str, str], set[str]]:
    """Return (active_slugs, pending_slugs, alias_slugs, nontrick_slugs) read
    directly from the curated CSVs. Useful for tools that run before a DB reset.
    """
    tricks_csv     = repo_root / "freestyle" / "inputs" / "noise"   / "tricks.csv"
    red_additions  = repo_root / "freestyle" / "inputs" / "curated" / "tricks" / "red_additions_2026_04_20.csv"
    aliases_csv    = repo_root / "freestyle" / "inputs" / "noise"   / "trick_aliases.csv"

    def name_to_slug(name: str) -> str:
        return re.sub(r"\s+", "-", name.strip().lower())

    active: set[str] = set()
    pending: set[str] = set()
    aliases: dict[str, str] = {}
    nontrick: set[str] = set()

    with tricks_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = (row.get("trick_canon") or "").strip()
            if name:
                slug = name_to_slug(name)
                active.add(slug)
                if (row.get("category") or "").strip() in NONTRICK_CATEGORIES:
                    nontrick.add(slug)

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
            if (row.get("category") or "").strip() in NONTRICK_CATEGORIES:
                nontrick.add(slug)
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

    return active, pending, aliases, nontrick
