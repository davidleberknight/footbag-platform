"""Curated legacy footbag.org move-ID -> canonical trick-slug overrides.

Every footbag.org loader resolves a scraped move to a canonical trick by name,
which cannot work in two situations: the legacy `moves` table gives different
moves the same bare Name, and a move whose published name is not the name our
dictionary gives the same movement. Both are settled here, keyed on the legacy
move ID, which is stable and authoritative for the source page.

All three footbag.org consumers read this map before name resolution, so an
overridden move lands on one canonical trick everywhere: its provenance link,
its community tips, and the pending-review queue that decides whether a scraped
move still needs curating. Splitting that decision across loaders is what
produces a duplicate inactive row shadowing a trick already curated.

Targets are asserted present and active before any write, so a stale entry
aborts the load instead of silently falling back to name resolution.
"""

from __future__ import annotations

import sqlite3
from typing import Iterable


# Move 18 is the delay, which is the modern clipper_stall (the modern bare
# "clipper" is the 1-ADD kick, its own move 2 "Clipper Kick"); move 209's Name
# is a bare "Clipper" though the move is Spinning Clipper (its tips page heading
# reads "Tips for Spinning Clipper"). Without these, name mapping collides both
# onto the kick. footbag.org publishes move 12 as "Peak Delay", while the
# dictionary's canonical name for the cap-brim catch is peak stall, so the
# published name matches no trick and no alias.
LEGACY_MOVE_ID_SLUG_OVERRIDES: dict[int, str] = {
    12:  "peak_stall",
    18:  "clipper_stall",
    209: "spinning_clipper",
}


def _parse_move_id(showmove_id: object) -> int | None:
    """The raw CSV field as an int; None when it is blank or not a number."""
    try:
        return int(str(showmove_id).strip())
    except (TypeError, ValueError):
        return None


def override_slug_for_move(showmove_id: object) -> str | None:
    """Canonical slug for a legacy move ID, or None when it is not overridden."""
    move_id = _parse_move_id(showmove_id)
    if move_id is None:
        return None
    return LEGACY_MOVE_ID_SLUG_OVERRIDES.get(move_id)


def assert_override_targets_present_and_active(
    conn: sqlite3.Connection, loader_label: str, showmove_ids: Iterable[object]
) -> None:
    """Fail closed before any write: every override the data actually reaches
    must target an existing, active trick. Falling back to name resolution would
    route the move onto the very trick the override exists to correct, or spawn a
    duplicate pending row.

    Only the overrides the given moves reach are checked, so a loader fed a
    subset of the corpus is not blocked by an override it never consults.
    """
    used = {
        move_id
        for move_id in (_parse_move_id(x) for x in showmove_ids)
        if move_id in LEGACY_MOVE_ID_SLUG_OVERRIDES
    }
    for move_id in sorted(used):
        slug = LEGACY_MOVE_ID_SLUG_OVERRIDES[move_id]
        row = conn.execute(
            "SELECT is_active FROM freestyle_tricks WHERE slug = ?", (slug,)
        ).fetchone()
        problem = "missing" if row is None else ("inactive" if row[0] != 1 else None)
        if problem is None:
            continue
        raise SystemExit(
            f"ERROR ({loader_label}): curated override for legacy move {move_id} "
            f"targets canonical slug '{slug}', which is {problem} in "
            f"freestyle_tricks.\n"
            f"  Aborting before any write so move {move_id} is never silently "
            f"re-routed by its published name.\n"
            f"  Fix: run freestyle/run_freestyle.sh so the trick dictionary "
            f"builds '{slug}' with is_active=1 before this loader, or update "
            f"LEGACY_MOVE_ID_SLUG_OVERRIDES when the canonical target changes."
        )
