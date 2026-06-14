"""Score-text extraction helpers for the canonical event-results export.

Kept as a standalone, side-effect-free module so the extraction logic can be unit
tested without importing export_historical_csvs.py, which runs the full pipeline
at import time.

In a consecutive (timed-kicks) discipline the number trailing a player's raw
placement line is their kick count, the meaningful score for that result. The
same trailing number on a routine or net result is a generic point total, so
callers gate extraction on the discipline being a consecutive one via
CONSECUTIVE_DISCIPLINE_RE.
"""
import re

# Matches a consecutive discipline by key or name ("open_singles_consecutive",
# "Novice 3 Minute Consecutives", "open_timed_consecutives").
CONSECUTIVE_DISCIPLINE_RE = re.compile(r"consecutiv", re.I)

# Trailing kick count, either parenthesised ("Marczyk (256)") or bare, optionally
# after a dash ("Govender - 412", "Wells 532"). Two-plus digits avoids matching a
# stray single digit or place number.
_CONSECUTIVE_COUNT_RE = re.compile(r"(?:\(|\b)(\d{2,6})\)?\s*$")


def extract_consecutive_count(entry_raw: str) -> str | None:
    """Return the kick-count integer trailing a consecutive-discipline placement
    line (e.g. "Michael Marczyk (256)" -> "256", "Jeff Wells 532" -> "532"), or
    None when the raw entry carries no trailing count."""
    if not entry_raw:
        return None
    m = _CONSECUTIVE_COUNT_RE.search(entry_raw.strip())
    return m.group(1) if m else None
