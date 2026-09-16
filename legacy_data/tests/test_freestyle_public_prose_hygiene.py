"""
test_freestyle_public_prose_hygiene.py
======================================

The dictionary's public prose names no reviewer and carries no internal process
token.

Every field checked here renders on a public trick page. Curator prose is drafted
from working notes, and a sentence that travels unedited from those notes ships an
internal attribution ("per Red", "confirmed by ...") or an internal token ("pt41")
to every reader of the page. The trick-dictionary QC loader already detects this
shape and writes it into a review artifact; an artifact is read when somebody opens
it, so this asserts the same property where it blocks instead.

Deliberately narrow. A bare personal name is NOT matched. Whether a name in prose is
a leak or legitimate content is a judgement call, and a push-blocking regular
expression is the wrong place to take it. What is matched is attribution phrasing
and internal process tokens, neither of which has a legitimate reading in prose
written for a reader learning a trick.

The attribution patterns must stay in sync with the reviewer-name patterns in the
trick-dictionary QC loader, which is where this shape was first catalogued.

Reads the built database; skips when it is absent.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_public_prose_hygiene.py -v
"""
import re
import sqlite3

from built_db import DB_PATH, require_loaded


# Prose fields that reach a public trick page.
PUBLIC_PROSE_FIELDS = (
    "description",
    "short_description",
    "execution_summary",
    "learning_notes",
    "prerequisite_notes",
    "pronunciation",
)

LEAK_PATTERNS = (
    ("reviewer attribution", re.compile(r"\bper\s+red\b", re.IGNORECASE)),
    ("reviewer attribution", re.compile(r"\bby\s+red\b", re.IGNORECASE)),
    ("reviewer name", re.compile(r"\bred\s+husted\b", re.IGNORECASE)),
    ("reviewer name and year", re.compile(r"\bred\s+\d{4}", re.IGNORECASE)),
    ("review attribution", re.compile(r"\bconfirmed\s+by\b", re.IGNORECASE)),
    ("internal ruling reference", re.compile(r"\bred(?:'s)?\s+ruling\b", re.IGNORECASE)),
    ("internal process token", re.compile(r"\bpt\d+\b", re.IGNORECASE)),
)


def _leaks(conn):
    columns = ", ".join(f"COALESCE({f}, '')" for f in PUBLIC_PROSE_FIELDS)
    rows = conn.execute(
        f"SELECT slug, {columns} FROM freestyle_tricks WHERE is_active = 1"
    ).fetchall()
    found = []
    for row in rows:
        slug, values = row[0], row[1:]
        for field, value in zip(PUBLIC_PROSE_FIELDS, values):
            for label, pattern in LEAK_PATTERNS:
                match = pattern.search(value)
                if match:
                    found.append((slug, field, label, match.group(0)))
                    break
    return rows, found


def test_no_active_trick_leaks_internal_attribution_into_public_prose():
    require_loaded("freestyle_tricks")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows, found = _leaks(conn)
    finally:
        conn.close()

    # Floor before the verdict: a corpus whose prose fields are all empty would pass
    # this check having scanned nothing, and that is the state a failed or partial
    # load produces. require_loaded proves the table holds rows, not that they hold
    # prose.
    populated = sum(1 for row in rows if any(v.strip() for v in row[1:]))
    assert populated, (
        f"no active trick carries any public prose ({len(rows)} active row(s) read), so "
        "the hygiene check scanned nothing."
    )

    assert not found, (
        f"{len(found)} public prose field(s) carry internal attribution or process "
        "vocabulary: "
        + "; ".join(
            f"{slug}.{field} ({label}: {text!r})" for slug, field, label, text in sorted(found)
        )
        + ". Rewrite the sentence for a reader learning the trick; the ruling behind it "
        "belongs in the curator ledger, not on the page."
    )
