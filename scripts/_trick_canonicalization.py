"""Trick-slug canonicalization helper for curator media migration + seeder.

Single source of truth for trick-alias resolution. Both
`scripts/migrate-freestyle-media-to-curated.py` (one-shot Slice 2 migration)
and `scripts/seed_fh_curator.py` (reads /curated/freestyle_tricks/ sidecars)
import this module. Keeping the lookup in one file prevents drift between
migration-time tag derivation and seed-time tag insertion — without that
guarantee, the same alias could canonicalize differently on each side and
produce silent tag mismatches.

Contract:
  - load_alias_map(con) reads `freestyle_trick_aliases` once (PK lookup
    table; `alias_slug` -> `trick_slug`).
  - canonicalize_slug(raw, map) is pure: same inputs -> same output, no
    mutation of the map. Idempotent: applying it twice yields the same
    result as applying it once.
  - If `raw_slug` is in the map -> return mapped canonical.
  - Otherwise (already canonical, or unknown) -> return `raw_slug` unchanged.
    Callers that need to detect "unknown" must check the result against
    `freestyle_tricks.slug` separately.
"""

from __future__ import annotations

import sqlite3


def load_alias_map(con: sqlite3.Connection) -> dict[str, str]:
    """Return alias_slug -> canonical trick_slug mapping from the DB.

    Empty dict if the table is missing (fresh DB, mid-migration state, etc.).
    """
    try:
        rows = con.execute(
            "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases"
        ).fetchall()
    except sqlite3.OperationalError:
        return {}
    return {alias: canonical for alias, canonical in rows}


def canonicalize_slug(raw_slug: str, alias_map: dict[str, str]) -> str:
    """Map an alias slug to its canonical trick slug.

    Pure + idempotent. Caller does not need to check whether the input is
    already canonical; this returns it unchanged in that case. Caller IS
    responsible for separately validating presence in `freestyle_tricks.slug`
    if the use case requires it (e.g., migration QC).
    """
    return alias_map.get(raw_slug, raw_slug)
