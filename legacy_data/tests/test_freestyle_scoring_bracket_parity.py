"""
test_freestyle_scoring_bracket_parity.py
========================================

Corpus-wide guard that the scoring-bracket parity invariant holds across every
active canonical trick, not just on new admin saves.

The invariant: when a trick's ADD is numeric and its operational notation carries
scoring-component brackets, the number of scoring brackets equals the ADD. New
admin saves enforce this at write time (checkAddMatchesScoringBrackets in
src/services/freestyleCurationService.ts, via countScoringBrackets in
src/lib/freestyleNotation.ts). This guard proves the same parity holds for the
whole existing corpus, so a legacy row that predates the write-time check cannot
sit in the dictionary in violation of it.

Rows with no scoring brackets (a blank field, or primitive markers like
`[set] > toe`) are not checked, exactly as the write-time check skips them.

The scoring flags below MUST match SCORING_BRACKET_RE in
src/lib/freestyleNotation.ts. The KICK action marker and non-flag brackets such as
`[set]` are non-scoring and never count.

The check reads the built database. On a checkout with no built database (the
loaders have not run) it skips, so it only enforces where there is real content to
enforce against.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_scoring_bracket_parity.py -v
"""
import re
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "database" / "footbag.db"

# Must stay in sync with SCORING_BRACKET_RE in src/lib/freestyleNotation.ts.
SCORING_BRACKET_RE = re.compile(r"\[(BOD|DEX|XBD|DEL|UNS|PDX|XDEX)\]", re.IGNORECASE)


def _bracket_parity_violations(conn):
    rows = conn.execute(
        "SELECT slug, adds, COALESCE(operational_notation, '') FROM freestyle_tricks "
        "WHERE is_active = 1 AND COALESCE(category, '') <> 'modifier'"
    ).fetchall()
    violations = []
    for slug, adds, notation in rows:
        text = "" if adds is None else str(adds).strip()
        if not re.fullmatch(r"\d+", text):
            continue  # non-numeric ADD is not bracket-checked, as at write time
        count = len(SCORING_BRACKET_RE.findall(notation))
        if count > 0 and count != int(text):
            violations.append((slug, int(text), count))
    return violations


def test_corpus_scoring_bracket_parity_holds():
    if not DB_PATH.exists():
        pytest.skip("built database is absent; run the freestyle loaders first")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        violations = _bracket_parity_violations(conn)
    finally:
        conn.close()
    assert not violations, (
        f"{len(violations)} active canonical trick(s) carry scoring brackets whose "
        f"count does not equal their numeric ADD: "
        + ", ".join(f"{s} (ADD={a}, brackets={n})" for s, a, n in sorted(violations))
        + ". Correct the notation or the ADD so the two agree."
    )
