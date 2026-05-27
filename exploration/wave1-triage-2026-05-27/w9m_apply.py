"""
W9m — Apply 5 tapping-X compound promotions (tapping family tail).

Continues the tapping ecosystem opened in W9l. Same chassis: TOE entry
+ leading `OP OUT [DEX]` event + base body, with base's first dex
direction preserved or flipped per tapping-whirl / tapping-illusion
precedent.

  tapping-leg-over   3 ADD = tapping(+1) + legover(2)
  tapping-eggbeater  4 ADD = tapping(+1) + eggbeater(3)
  tapping-drifter    4 ADD = tapping(+1) + drifter(3)
  tapping-twirl      5 ADD = tapping(+1) + twirl(4)
  tapping-mobius     6 ADD = tapping(+1) + mobius(5)

Chassis notes:
  - tapping-leg-over follows tapping-illusion direction-flip precedent
    (OP OUT → SAME OUT on second dex to avoid same-direction
    duplication; legover's OUT first dex would otherwise duplicate
    tapping's OUT prefix).
  - tapping-eggbeater preserves eggbeater's `TOE >>` double-up entry
    character; three consecutive OUT-dexes match eggbeater's natural
    chain (eggbeater terminates on two OUT-dexes; tapping's OUT prefix
    naturally extends it).
  - tapping-drifter / tapping-twirl / tapping-mobius follow tapping-
    whirl precedent (preserve base's IN direction on the post-tapping
    dex; no flip needed).

Held for W9n: tapping-torque (5 ADD; clean derivation).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9M_ROWS = [
    (
        "tapping-leg-over", 3, "legover", "tapping",
        "Tapping modifier on legover base. 3 ADD = tapping(+1) + legover(2); JOB TOE > OP OUT [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]. Chassis: tapping-illusion direction-flip precedent (OP OUT → SAME OUT on second dex avoids duplicating tapping's OUT prefix); same-toe terminal preserved from legover.",
        "W9m tapping 2026-05-27: tapping-illusion direction-flip precedent on legover. 3 brackets matches 3 ADD.",
    ),
    (
        "tapping-eggbeater", 4, "eggbeater", "tapping",
        "Tapping modifier on eggbeater base. 4 ADD = tapping(+1) + eggbeater(3); JOB TOE > OP OUT [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Chassis: tapping prefix + eggbeater's two-OUT-dex chain + same-toe terminal. Eggbeater's `TOE >>` double-up entry character preserved.",
        "W9m tapping 2026-05-27: tapping prefix + eggbeater's two-OUT-dex chain. 4 brackets matches 4 ADD.",
    ),
    (
        "tapping-drifter", 4, "drifter", "tapping",
        "Tapping modifier on drifter base. 4 ADD = tapping(+1) + drifter(3); JOB TOE > OP OUT [DEX] >> OP IN [DEX] > SAME CLIP [XBD] [DEL]. Chassis: tapping-whirl precedent (preserve base's IN direction on post-tapping dex) + drifter's same-side cross-body clipper terminal.",
        "W9m tapping 2026-05-27: tapping-whirl precedent + drifter terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "tapping-twirl", 5, "twirl", "tapping",
        "Tapping modifier on twirl base. 5 ADD = tapping(+1) + twirl(4); JOB TOE > OP OUT [DEX] >> SAME FRONT SWIRL [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Chassis: tapping prefix + twirl's front-swirl + back-spin + cross-body clipper terminal.",
        "W9m tapping 2026-05-27: tapping prefix + twirl chain. 5 brackets matches 5 ADD.",
    ),
    (
        "tapping-mobius", 6, "mobius", "tapping",
        "Tapping modifier on mobius base. 6 ADD = tapping(+1) + mobius(5); JOB TOE > OP OUT [DEX] >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]. Chassis: tapping prefix + mobius's gyro-torque chain (back-spin + IN-dex + front-spin + cross-body clipper terminal).",
        "W9m tapping 2026-05-27: tapping prefix + mobius chain. 6 brackets matches 6 ADD.",
    ),
]

W9M_CORRECTIONS = [
    ("tapping-leg-over", "notation", "TAPPING LEG OVER",
     "W9m 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-leg-over", "operational_notation",
     "TOE > OP OUT [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]",
     "W9m 2026-05-27: tapping-illusion direction-flip precedent on legover. 3 brackets matches 3 ADD."),

    ("tapping-eggbeater", "notation", "TAPPING EGGBEATER",
     "W9m 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-eggbeater", "operational_notation",
     "TOE > OP OUT [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9m 2026-05-27: tapping prefix + eggbeater chain. 4 brackets matches 4 ADD."),

    ("tapping-drifter", "notation", "TAPPING DRIFTER",
     "W9m 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-drifter", "operational_notation",
     "TOE > OP OUT [DEX] >> OP IN [DEX] > SAME CLIP [XBD] [DEL]",
     "W9m 2026-05-27: tapping-whirl precedent + drifter terminal. 4 brackets matches 4 ADD."),

    ("tapping-twirl", "notation", "TAPPING TWIRL",
     "W9m 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-twirl", "operational_notation",
     "TOE > OP OUT [DEX] >> SAME FRONT SWIRL [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9m 2026-05-27: tapping prefix + twirl chain. 5 brackets matches 5 ADD."),

    ("tapping-mobius", "notation", "TAPPING MOBIUS",
     "W9m 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-mobius", "operational_notation",
     "TOE > OP OUT [DEX] >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9m 2026-05-27: tapping prefix + mobius chain. 6 brackets matches 6 ADD."),
]


def name_exists_in_additions(canonical_name: str) -> bool:
    with ADD_CSV.open(encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            if row["canonical_name"] == canonical_name:
                return True
    return False


def correction_exists(slug: str, column: str) -> bool:
    with COR_CSV.open(encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) >= 2 and row[0] == slug and row[1] == column:
                return True
    return False


def main() -> None:
    add_skipped = 0
    add_appended = 0
    with ADD_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for canonical, adds, base, modifier_links, desc, note in W9M_ROWS:
            if name_exists_in_additions(canonical):
                add_skipped += 1
                continue
            w.writerow([
                canonical, adds, base, "compound", "", modifier_links,
                desc, "expert_reviewed", "1", note,
            ])
            add_appended += 1

    cor_skipped = 0
    cor_appended = 0
    with COR_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for slug, column, new_val, note in W9M_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
