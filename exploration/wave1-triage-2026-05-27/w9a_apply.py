"""
W9a — Apply 5 single-modifier stepping compound promotions (Cat A pilot).

Opens the stepping ecosystem (the last untouched bucket from the
2026-05-27 W1-W8 comprehensive-coverage wave). Pilot scope: clean
single-modifier stepping-X compounds with computable bracket math,
no folk-name overlap, no doctrine block.

  stepping-barfly   5 ADD = stepping(+1) + barfly(4)
  stepping-pickup   3 ADD = stepping(+1) + pickup(2)
  stepping-swirl    4 ADD = stepping(+1) + swirl(3)
  stepping-flail    4 ADD = stepping(+1) + flail(3)
  stepping-dyno     5 ADD = stepping(+1) + dyno(4)

Sibling chassis: stepping leading-[DEX] pattern (per SKILL.md §B.3) —
prefix base's body with `CLIP > OP IN [DEX] >`, dropping the base's
leading set entry (SET) and preserving its bracket chain.

Deliberately deferred from this batch (separate W9b+ batches or other
waves):
  - stepping-torque (= grave-digger folk canonical; already in DB)
  - stepping-double-leg-over (= haze folk canonical; already in DB)
  - stepping-paradox-torque, stepping-paradox-* (pt12-Q1 blurry-X
    doctrine question; [D4] in handoff)
  - stepping-(same-side)/(far)/(near)/(op) directional variants
    (Cat B alias-resolution wave per memory)
  - stepping-grifter, stepping-baroque, stepping-massacre,
    stepping-guay (need further sibling-chassis verification;
    guay op_notation in DB is pre-canonical shorthand form)
  - stepping-superfly, stepping-symposium-mirage, stepping-butterfly-swirl
    (multi-modifier or 5+ ADD; W9b candidates)
  - All folk-name parenthetical readings (blizzard / blur / fog /
    gauntlet / haze / ripwalk / sidewalk / spike-hammer / tombstone)
    — most already canonical from 2026-05-25 promotion wave; the
    rest are a separate W9-Cat-B batch
  - All doctrine-blocked rows (blurry/shooting/weaving)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9A_ROWS = [
    (
        "stepping-barfly", 5, "barfly", "stepping",
        "Stepping modifier on barfly base. 5 ADD = stepping(+1) + barfly(4); JOB CLIP > OP IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]. Stepping leading-[DEX] chassis prefixed to barfly's no-plant out-dex chain.",
        "W9a stepping 2026-05-27: stepping leading-[DEX] chassis + barfly's two-dex no-plant chain. 5 brackets matches 5 ADD.",
    ),
    (
        "stepping-pickup", 3, "pickup", "stepping",
        "Stepping modifier on pickup base. 3 ADD = stepping(+1) + pickup(2); JOB CLIP > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]. Stepping leading-[DEX] chassis prefixed to pickup's dex + toe terminal.",
        "W9a stepping 2026-05-27: stepping leading-[DEX] chassis + pickup's IN-dex + same-toe terminal. 3 brackets matches 3 ADD.",
    ),
    (
        "stepping-swirl", 4, "swirl", "stepping",
        "Stepping modifier on swirl base. 4 ADD = stepping(+1) + swirl(3); JOB CLIP > OP IN [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]. Stepping leading-[DEX] chassis prefixed to swirl's back-swirl dex + same-clip terminal.",
        "W9a stepping 2026-05-27: stepping leading-[DEX] chassis + swirl's back-swirl dex + same-clip terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "stepping-flail", 4, "flail", "stepping",
        "Stepping modifier on flail base. 4 ADD = stepping(+1) + flail(3); JOB CLIP > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]. Stepping leading-[DEX] chassis prefixed to flail's no-plant out-dex chain.",
        "W9a stepping 2026-05-27: stepping leading-[DEX] chassis + flail's no-plant out-dex + op-toe terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "stepping-dyno", 5, "dyno", "stepping",
        "Stepping modifier on dyno base. 5 ADD = stepping(+1) + dyno(4); JOB CLIP > OP IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Stepping leading-[DEX] chassis prefixed to dyno's out-dex + back-spin + same-clip terminal.",
        "W9a stepping 2026-05-27: stepping leading-[DEX] chassis + dyno's out-dex + back-spin + same-clip terminal. 5 brackets matches 5 ADD.",
    ),
]

W9A_CORRECTIONS = [
    ("stepping-barfly", "notation", "STEPPING BARFLY",
     "W9a 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-barfly", "operational_notation",
     "CLIP > OP IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]",
     "W9a 2026-05-27: stepping leading-[DEX] + barfly's no-plant out-dex chain. 5 brackets matches 5 ADD."),

    ("stepping-pickup", "notation", "STEPPING PICKUP",
     "W9a 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-pickup", "operational_notation",
     "CLIP > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]",
     "W9a 2026-05-27: stepping leading-[DEX] + pickup's IN-dex + same-toe terminal. 3 brackets matches 3 ADD."),

    ("stepping-swirl", "notation", "STEPPING SWIRL",
     "W9a 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-swirl", "operational_notation",
     "CLIP > OP IN [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W9a 2026-05-27: stepping leading-[DEX] + swirl's back-swirl dex + same-clip terminal. 4 brackets matches 4 ADD."),

    ("stepping-flail", "notation", "STEPPING FLAIL",
     "W9a 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-flail", "operational_notation",
     "CLIP > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W9a 2026-05-27: stepping leading-[DEX] + flail's no-plant out-dex + op-toe terminal. 4 brackets matches 4 ADD."),

    ("stepping-dyno", "notation", "STEPPING DYNO",
     "W9a 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-dyno", "operational_notation",
     "CLIP > OP IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W9a 2026-05-27: stepping leading-[DEX] + dyno's out-dex + back-spin + same-clip terminal. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9A_ROWS:
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
        for slug, column, new_val, note in W9A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
