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


# Curated golf and overall results carry a meaningful trailing number too: golf
# strokes (lower is better) and overall-standings points. Their units are written
# into the score text, because a bare number in those disciplines says nothing
# about what was counted. Mirror results keep the consecutive-only rule above,
# since a trailing number on a crawled page is not known to be either.
GOLF_DISCIPLINE_RE = re.compile(r"golf", re.I)
# The designation the curated adapter writes for a record-setting result.
WORLD_RECORD_RE = re.compile(r"\[world record\]", re.I)
OVERALL_DISCIPLINE_RE = re.compile(r"overall|team_points", re.I)
# A distance one-pass result is a count of kicks, like a consecutive one.
DISTANCE_ONE_PASS_RE = re.compile(r"distance_one_pass", re.I)


def curated_score_text(discipline_key: str, entry_raw: str) -> str:
    """Score text for a curated-source result: a consecutive count bare (kicks),
    a golf total as "<n> strokes", an overall total as "<n> points"; empty when the
    discipline carries no recognised score or the entry has no trailing number."""
    n = extract_consecutive_count(entry_raw)
    if not n:
        return ""
    if CONSECUTIVE_DISCIPLINE_RE.search(discipline_key) or DISTANCE_ONE_PASS_RE.search(discipline_key):
        return n
    if GOLF_DISCIPLINE_RE.search(discipline_key):
        return f"{n} strokes"
    if OVERALL_DISCIPLINE_RE.search(discipline_key):
        return f"{n} points"
    return ""


# Participant note marking a team member beyond the two players stage 2 keeps. The
# remediation and QC steps read it to accept a three-person team as one result.
ADDITIONAL_TEAM_MEMBER_NOTE = "additional_team_member"

# Participant note marking a club's standing: the club's name is shown as written
# and never resolved to, or minted as, a person.
CLUB_STANDING_NOTE = "club_standing"


def _name_key(s: str) -> str:
    return " ".join(re.sub(r"[^a-z ]+", " ", (s or "").lower()).split())


def curated_extra_team_members(entry_raw: str, p1: str, p2: str) -> list[str]:
    """Team members after the second in a curated "A / B / C [/ D]" entry, when its
    first two members are the two players stage 2 kept and every member is a full
    name; otherwise none. The entry's bracketed designation and trailing score are
    ignored."""
    core = re.sub(r"\[[^\]]*\]", "", entry_raw or "")
    core = re.sub(r"\s+-\s+[\d,]+\s*$", "", core).strip()
    members = [m.strip() for m in core.split(" / ") if m.strip()]
    if len(members) < 3 or any(len(m.split()) < 2 or "," in m for m in members):
        return []
    if [_name_key(m) for m in members[:2]] != [_name_key(p1), _name_key(p2)]:
        return []
    return members[2:]


def extract_consecutive_count(entry_raw: str) -> str | None:
    """Return the kick-count integer trailing a consecutive-discipline placement
    line (e.g. "Michael Marczyk (256)" -> "256", "Jeff Wells 532" -> "532"), or
    None when the raw entry carries no trailing count."""
    if not entry_raw:
        return None
    m = _CONSECUTIVE_COUNT_RE.search(entry_raw.strip())
    return m.group(1) if m else None
