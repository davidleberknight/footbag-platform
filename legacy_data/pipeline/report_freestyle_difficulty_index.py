#!/usr/bin/env python3
"""
report_freestyle_difficulty_index.py

Freestyle Difficulty Index (records-based proxy).  Provisional first-pass
per-player metric computed from existing freestyle_records data.  This is
NOT a combo metric and NOT a streak metric — it summarizes the ADD value
(Difficulty Index) of each consecutive trick record attributed to a
player, treating each record as one observation.

Metric definition (per player):
  - n_records       : count of trick_consecutive* records with a usable ADD
  - avg_add         : mean ADD across that player's records
  - max_add         : highest single-record ADD
  - high_add_ratio  : share of records with ADD >= 5  (THRESHOLD PROVISIONAL)

Stability filter:
  HAVING COUNT(*) >= 3.  Smaller samples produce volatile averages and
  ratios; the floor is set so the leaderboard reflects players with at
  least a small sustained body of records.

Forward-compatibility:
  Each record is LEFT JOINed to freestyle_tricks on canonical_name; when
  populated, freestyle_tricks.adds takes precedence over the per-record
  freestyle_records.adds_count.  freestyle_tricks is currently empty in
  the dev DB so the COALESCE always falls through to adds_count.

Status — DO NOT SHIP PUBLICLY YET:
  - The >=5 ADD threshold is a provisional cut chosen to flag the top
    ~30% of records (distribution: 2(9), 3(62), 4(70), 5(43), 6(16),
    7(1)).  Confirm with the freestyle community before publishing.
  - freestyle_tricks.adds is empty; the curated half of the COALESCE is
    inert.  Do not expose this metric on a public route until the tricks
    table is loaded.
  - This is a records-based proxy, not a sequence/combo analysis.
    Real combo metrics require sequence-level data we do not have yet.

Usage (from repo root or legacy_data/):
    .venv/bin/python legacy_data/pipeline/report_freestyle_difficulty_index.py
    .venv/bin/python pipeline/report_freestyle_difficulty_index.py

Inputs:
    database/footbag.db  (freestyle_records, freestyle_tricks, historical_persons)

Outputs:
    stdout — formatted leaderboard
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = REPO_ROOT / "database" / "footbag.db"

MIN_RECORDS_FOR_STABILITY = 3
HIGH_ADD_THRESHOLD = 5  # provisional — see module docstring

QUERY = """
WITH record_adds AS (
  SELECT
    r.person_id,
    COALESCE(hp.person_name, r.display_name) AS player,
    COALESCE(
      CAST(NULLIF(t.adds, 'modifier') AS INTEGER),
      r.adds_count
    ) AS effective_add
  FROM freestyle_records r
  LEFT JOIN freestyle_tricks t
    ON LOWER(t.canonical_name) = LOWER(r.trick_name)
  LEFT JOIN historical_persons hp
    ON hp.person_id = r.person_id
  WHERE r.person_id IS NOT NULL
    AND r.record_type LIKE 'trick_consecutive%'
    AND r.superseded_by IS NULL
)
SELECT
  player,
  COUNT(*)                                                            AS n_records,
  ROUND(AVG(effective_add), 2)                                        AS avg_add,
  MAX(effective_add)                                                  AS max_add,
  ROUND(1.0 * SUM(CASE WHEN effective_add >= ? THEN 1 ELSE 0 END)
        / COUNT(*), 3)                                                AS high_add_ratio
FROM record_adds
WHERE effective_add IS NOT NULL
GROUP BY person_id, player
HAVING COUNT(*) >= ?
ORDER BY avg_add DESC, n_records DESC, max_add DESC
"""


def main() -> int:
    if not DB_PATH.exists():
        print(f"ERROR: database not found: {DB_PATH}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(QUERY, (HIGH_ADD_THRESHOLD, MIN_RECORDS_FOR_STABILITY)).fetchall()
    finally:
        conn.close()

    print("Freestyle Difficulty Index (records-based proxy) — provisional, NOT for public UI")
    print(f"  threshold:    high_add_ratio counts records with ADD >= {HIGH_ADD_THRESHOLD} (provisional)")
    print(f"  stability:    HAVING n_records >= {MIN_RECORDS_FOR_STABILITY}")
    print(f"  source:       freestyle_records ⋈ freestyle_tricks (currently empty) ⋈ historical_persons")
    print()

    if not rows:
        print("(no players meet the stability threshold)")
        return 0

    print(f"{'player':<28}  {'n_records':>9}  {'avg_add':>7}  {'max_add':>7}  {'high_add_ratio':>14}")
    print("-" * 74)
    for player, n_records, avg_add, max_add, high_ratio in rows:
        print(f"{(player or '')[:28]:<28}  {n_records:>9}  {avg_add:>7.2f}  {max_add:>7}  {high_ratio:>14.3f}")

    print()
    print(f"Players above stability threshold: {len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
