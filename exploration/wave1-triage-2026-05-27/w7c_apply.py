"""
W7c — Apply 5 more gyro compound promotions.

Extends gyro chassis to symposium-X / dada-curve / double-over-down /
barrage bases:

  gyro-symposium-torque       6 ADD = gyro(+1) + symposium(+1) + torque(4)   [triple BOD]
  gyro-symposium-whirl        5 ADD = gyro(+1) + symposium(+1) + whirl(3)
  gyro-dada-curve             5 ADD = gyro(+1) + dada-curve(4)
  gyro-double-over-down       5 ADD = gyro(+1) + double-over-down(4)
  gyro-barrage                4 ADD = gyro(+1) + barrage(3)

Sibling chassis: spinning-symposium-whirl pattern adapted with gyro's
SAME-direction dex flip. gyro-symposium-torque uses triple [BOD]
(gyro's spin + symposium's no-plant body + torque's own back-spin),
parallel to W6f spinning-paradox-torque's structure but with the gyro
direction-flip rule.

gyro-barrage requires no dex flip because barrage's natural dexes are
already SAME IN (matches gyro's same-side convention).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W7C_ROWS = [
    (
        "gyro-symposium-torque", 6, "torque", "gyro|symposium",
        "Gyro + symposium on torque base. 6 ADD = gyro(+1) + symposium(+1) + torque(4); JOB CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Triple-body-event compound.",
        "W7c gyro 2026-05-27: gyro-symposium chassis (SAME IN flip on the no-plant dex) + torque's back-spin + op-clip terminal. 6 brackets matches 6 ADD.",
    ),
    (
        "gyro-symposium-whirl", 5, "whirl", "gyro|symposium",
        "Gyro + symposium on whirl base. 5 ADD = gyro(+1) + symposium(+1) + whirl(3); JOB CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > OP CLIP [XBD] [DEL].",
        "W7c gyro 2026-05-27: spinning-symposium-whirl chassis adapted with gyro SAME IN flip. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-dada-curve", 5, "dada-curve", "",
        "Gyro modifier on dada-curve base. 5 ADD = gyro(+1) + dada-curve(4); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W7c gyro 2026-05-27: gyro chassis (SAME IN flip on first dex) + dada-curve's no-plant double-dex + op-clip terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-double-over-down", 5, "double-over-down", "",
        "Gyro modifier on double-over-down base. 5 ADD = gyro(+1) + double-over-down(4); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W7c gyro 2026-05-27: gyro flips double-over-down's first OP OUT to SAME OUT; second dex unchanged. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-barrage", 4, "barrage", "",
        "Gyro modifier on barrage base. 4 ADD = gyro(+1) + barrage(3); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]. Barrage's natural SAME IN dexes already match gyro's same-side convention; no flip needed.",
        "W7c gyro 2026-05-27: gyro spin prefix + barrage's two-SAME-IN-dex chain (no direction flip; already aligned). 4 brackets matches 4 ADD.",
    ),
]

W7C_CORRECTIONS = [
    ("gyro-symposium-torque", "notation", "GYRO SYMPOSIUM TORQUE",
     "W7c 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-symposium-torque", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W7c 2026-05-27: gyro-symposium chassis + torque's back-spin. Triple [BOD]. 6 brackets matches 6 ADD."),

    ("gyro-symposium-whirl", "notation", "GYRO SYMPOSIUM WHIRL",
     "W7c 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-symposium-whirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W7c 2026-05-27: spinning-symposium-whirl chassis + gyro SAME IN flip. 5 brackets matches 5 ADD."),

    ("gyro-dada-curve", "notation", "GYRO DADA CURVE",
     "W7c 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-dada-curve", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W7c 2026-05-27: gyro chassis + dada-curve chassis with first-dex flip. 5 brackets matches 5 ADD."),

    ("gyro-double-over-down", "notation", "GYRO DOUBLE OVER DOWN",
     "W7c 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-double-over-down", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W7c 2026-05-27: gyro chassis + double-over-down with first-dex flip. 5 brackets matches 5 ADD."),

    ("gyro-barrage", "notation", "GYRO BARRAGE",
     "W7c 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-barrage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]",
     "W7c 2026-05-27: gyro spin prefix + barrage chassis (already SAME IN). 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W7C_ROWS:
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
        for slug, column, new_val, note in W7C_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
