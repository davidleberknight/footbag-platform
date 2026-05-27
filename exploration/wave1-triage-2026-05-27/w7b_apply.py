"""
W7b — Apply 5 more gyro compound promotions.

Extends gyro chassis to blender / drifter / eggbeater / double-pickup /
flurry bases:

  gyro-blender         5 ADD = gyro(+1) + blender(4)     [double back-spin]
  gyro-drifter         4 ADD = gyro(+1) + drifter(3)
  gyro-eggbeater       4 ADD = gyro(+1) + eggbeater(3)
  gyro-double-pickup   4 ADD = gyro(+1) + double-pickup(3)
  gyro-flurry          5 ADD = gyro(+1) + flurry(4)

Sibling chassis (W7a pattern): gyro spin prefix + flip base's FIRST dex
from OP to SAME (same-side reading). For multi-dex bases (eggbeater,
double-leg-over, double-pickup, flurry), only the first dex flips;
subsequent dexes keep their natural direction. For body-spin bases
(blender), the base's own back-spin is preserved (resulting in double
back-spin construction).

Skipped from this batch: gyro-double-leg-over (already canonical in DB).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W7B_ROWS = [
    (
        "gyro-blender", 5, "blender", "",
        "Gyro modifier on blender base. 5 ADD = gyro(+1) + blender(4); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double back-spin compound (gyro's spin + blender's own back-spin).",
        "W7b gyro 2026-05-27: gyro chassis (SAME IN dex flip) + blender's back-spin + same-clip terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-drifter", 4, "drifter", "",
        "Gyro modifier on drifter base. 4 ADD = gyro(+1) + drifter(3); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL].",
        "W7b gyro 2026-05-27: gyro chassis flips drifter's OP IN dex to SAME IN; preserves same-clip terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "gyro-eggbeater", 4, "eggbeater", "",
        "Gyro modifier on eggbeater base. 4 ADD = gyro(+1) + eggbeater(3); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Only the first dex flips to SAME OUT; second dex keeps OP OUT.",
        "W7b gyro 2026-05-27: gyro flips eggbeater's first OP OUT to SAME OUT; second dex unchanged. 4 brackets matches 4 ADD.",
    ),
    (
        "gyro-double-pickup", 4, "double-pickup", "",
        "Gyro modifier on double-pickup base. 4 ADD = gyro(+1) + double-pickup(3); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL].",
        "W7b gyro 2026-05-27: gyro flips double-pickup's first OP IN to SAME IN; second dex naturally SAME IN preserves. 4 brackets matches 4 ADD.",
    ),
    (
        "gyro-flurry", 5, "flurry", "",
        "Gyro modifier on flurry base. 5 ADD = gyro(+1) + flurry(4); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]. Preserves flurry's no-plant marker (>>) between the SAME IN and OP OUT dexes.",
        "W7b gyro 2026-05-27: gyro flips flurry's first OP IN to SAME IN; preserves flurry's mid-chain no-plant marker. 5 brackets matches 5 ADD.",
    ),
]

W7B_CORRECTIONS = [
    ("gyro-blender", "notation", "GYRO BLENDER",
     "W7b 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-blender", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W7b 2026-05-27: gyro + blender chassis (double back-spin). 5 brackets matches 5 ADD."),

    ("gyro-drifter", "notation", "GYRO DRIFTER",
     "W7b 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-drifter", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]",
     "W7b 2026-05-27: gyro chassis + drifter SAME IN dex + same-clip terminal. 4 brackets matches 4 ADD."),

    ("gyro-eggbeater", "notation", "GYRO EGGBEATER",
     "W7b 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-eggbeater", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W7b 2026-05-27: gyro flips eggbeater's first dex. 4 brackets matches 4 ADD."),

    ("gyro-double-pickup", "notation", "GYRO DOUBLE PICKUP",
     "W7b 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-double-pickup", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]",
     "W7b 2026-05-27: gyro chassis + double-pickup chassis. 4 brackets matches 4 ADD."),

    ("gyro-flurry", "notation", "GYRO FLURRY",
     "W7b 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-flurry", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]",
     "W7b 2026-05-27: gyro chassis + flurry's 3-dex chain with mid-chain no-plant marker. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W7B_ROWS:
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
        for slug, column, new_val, note in W7B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
