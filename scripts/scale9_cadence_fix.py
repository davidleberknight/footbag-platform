#!/usr/bin/env python3
"""SCALE-9 cadence-fix: apply 7 targeted rewrites to address audit findings.

Audit findings (cadence pattern violations on initial load):
- barfly.execution_summary opened with 'From a toe set' (banned per SCALE-1)
- 9 rows contained '(The|A) common miss is' (cap is <=3); 7 rewrites bring it to 3

Captures pre-fix state to scale9_cadence_audit_pre.csv + scale9_cadence_rollback.sql.
The earlier scale9_load_rollback.sql remains authoritative for unwinding the whole batch back to NULL.
"""
import csv
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "database" / "footbag.db"
REPORTS = ROOT / "legacy_data" / "reports" / "scale9"
AUDIT_PRE = REPORTS / "scale9_cadence_audit_pre.csv"
ROLLBACK_SQL = REPORTS / "scale9_cadence_rollback.sql"


REWRITES: list[tuple[str, str, str]] = [
    # (slug, field, new value)
    ("barfly", "execution_summary",
     "On the opening set, the kicking foot traces an arc that crosses the bag's rising path, then continues into the matching reverse arc to complete a single infinity loop. Before the bag drops, the foot initiates the second loop along the mirror trajectory, the body shifting weight to support the second arc.\n\n"
     "The two loops compose into a continuous figure -- the bag's path crossing the supporting leg twice, the foot completing both arcs in one motion sequence. Recovery lands on the opposite-toe delay with the body re-centered."),
    ("superfly", "learning_notes",
     "The symposium frame fights barfly's natural body shift between loops. Barfly alone allows a small re-center between the two arcs; symposium removes that allowance. When the body closes toward neutral between the loops and re-opens for the second, the symposium degrades from a single sustained frame to a held-then-released gesture.\n\n"
     "Set the symposium posture deliberately before the set, not as a correction during the trick."),
    ("nemesis", "learning_notes",
     "The error is to apply furious's +1 non-rotational commitment instead of its +2 rotational intensity. The execution sits closer to fury than to any single-modifier furious compound; the body commits as if running the full furious + paradox + mirage line, but anchored on barfly's double-loop instead of mirage's single rotation.\n\n"
     "Sumo (this batch) carries the same shape -- a named compound where standard modifier-math produces one number and the asserted reading carries a different one. Nemesis and sumo are paired teaching cases for named-exception accounting."),
    ("sumo", "learning_notes",
     "The X-Dex moment is the load-bearing element. Without it, the trick stops at 4 ADD and is a different compound entirely. Execute a clean nuclear mirage with the body-line intensity correct but the dex flick at standard sharpness, and the trick stops at 4 ADD; the 5-ADD reading requires the dex to escalate specifically at the contact moment.\n\n"
     "Nemesis (this batch) carries the same named-exception shape: a compound where the standard modifier-math gives one number and the asserted reading delivers another. Both rows are exceptions in the dictionary's catalog rather than examples of a general rule."),
    ("tapping-whirl", "learning_notes",
     "Tap timing is the load-bearing skill. The tapping pattern must distribute across the rotation -- the taps complete during the body's turn, not bunched at the start or the recovery. Watch for taps rushing at the rotation's opening beat, leaving the back half of whirl's turn empty of contact.\n\n"
     "Spinal-tap (tap with a backward body line) and tap (the standalone tap-family base) are the cross-references -- both establish the tap cadence on simpler bases. Tapping-whirl applies the same cadence to a rotational base where the contacts must distribute across the rotation rather than land in one window."),
    ("illusion", "learning_notes",
     "Illusion's dex direction fights the natural body shift on a toe set. The set drives the body forward, and the natural dex direction follows the body's forward motion -- that's mirage. Illusion requires the foot to reach back across the body line, working against the forward shift.\n\n"
     "What goes wrong: the foot reaches across without completing the out-to-in arc -- the dex starts outside but resolves on the same outside contact rather than crossing back to the inside. The full dex must complete on the opposite side."),
    ("double-leg-over", "learning_notes",
     "The defining constraint is airtime. Both leg-passes happen within the bag's single rise; the second pass cannot wait for a second set. The wrong move is letting the second leg-pass arrive after the bag has begun descending -- the trick then reads as a legover followed by a separate recovery contact rather than a true double-crossing.\n\n"
     "DLO is one of the dictionary's community-stabilized \"double-X\" compounds. Most \"double-X\" naming patterns produce non-canonical readings (a \"double-mirage\" is not a recognized compound, for instance); DLO, double-around-the-world, and double-spin are the named exceptions where the doubling has settled into independent compound identity."),
]


def main() -> int:
    apply = "--apply" in sys.argv
    REPORTS.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    try:
        cur = conn.cursor()
        # Pre-fix audit: capture current (post-load, pre-fix) values
        with AUDIT_PRE.open("w", newline="") as f:
            w = csv.writer(f, quoting=csv.QUOTE_ALL)
            w.writerow(["slug", "field", "value_pre_fix"])
            pre_values: list[tuple[str, str, str | None]] = []
            for slug, field, _ in REWRITES:
                row = cur.execute(
                    f"SELECT {field} FROM freestyle_tricks WHERE slug=?", (slug,)
                ).fetchone()
                if row is None:
                    raise RuntimeError(f"slug not found: {slug}")
                pre_values.append((slug, field, row[0]))
                w.writerow([slug, field, "" if row[0] is None else row[0]])
        print(f"wrote {AUDIT_PRE}")

        # Rollback SQL restores pre-fix values
        lines = ["-- Rollback SCALE-9 cadence fix (7 targeted rewrites)", "BEGIN TRANSACTION;"]
        for slug, field, val in pre_values:
            if val is None:
                lines.append(f"UPDATE freestyle_tricks SET {field}=NULL WHERE slug='{slug}';")
            else:
                esc = val.replace("'", "''")
                lines.append(f"UPDATE freestyle_tricks SET {field}='{esc}' WHERE slug='{slug}';")
        lines.append("COMMIT;")
        ROLLBACK_SQL.write_text("\n".join(lines) + "\n")
        print(f"wrote {ROLLBACK_SQL}")

        if not apply:
            print("\nDry-run only (pass --apply to execute rewrites).")
            return 0

        # Apply rewrites in transaction
        cur.execute("BEGIN")
        for slug, field, new_value in REWRITES:
            result = cur.execute(
                f"UPDATE freestyle_tricks SET {field} = ? WHERE slug = ?",
                (new_value, slug),
            )
            if result.rowcount != 1:
                conn.rollback()
                raise RuntimeError(f"UPDATE for {slug}.{field} affected {result.rowcount} rows")
        conn.commit()
        print(f"\nApplied {len(REWRITES)} rewrites in single transaction.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
