"""
W7d — Apply 5 more gyro compound promotions.

Closes out the gyro structural promotion frontier with guay /
butterfly-swirl / symposium-swirl / whirling-swirl / eclipse bases:

  gyro-guay              3 ADD = gyro(+1) + guay(2)
  gyro-butterfly-swirl   5 ADD = gyro(+1) + butterfly-swirl(4)
  gyro-symposium-swirl   5 ADD = gyro(+1) + symposium(+1) + swirl(3)
  gyro-whirling-swirl    5 ADD = gyro(+1) + whirling-swirl(4)
  gyro-eclipse           4 ADD = gyro(+1) + eclipse(3)  [jump-class]

gyro-eclipse uses the fairy-eclipse / pixie-eclipse jump-class pattern
(no final dex; double [DEL] for mid-flight inside-stall + landing toe).
gyro adds a back-spin body event before the JUMP body event, yielding
a double-[BOD] front-of-chain construction.

Skipped from this batch: gyro-clipper / gyro-toe (would collapse to
spinning-clipper / spinning-toe-stall mechanics — zero-dex bases don't
differentiate gyro from spinning at the bracket level); gyro-baroque
(baroque not yet canonical); gyro-reverse-guay (reverse-guay not
canonical); spyro-X family (spyro not a registered modifier).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W7D_ROWS = [
    (
        "gyro-guay", 3, "guay", "",
        "Gyro modifier on guay base. 3 ADD = gyro(+1) + guay(2); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL].",
        "W7d gyro 2026-05-27: gyro chassis + guay's inside-stall terminator (with same-side dex flip from gyro). 3 brackets matches 3 ADD.",
    ),
    (
        "gyro-butterfly-swirl", 5, "butterfly-swirl", "",
        "Gyro modifier on butterfly-swirl base. 5 ADD = gyro(+1) + butterfly-swirl(4); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL].",
        "W7d gyro 2026-05-27: gyro chassis (SAME OUT first dex) + butterfly-swirl's back-swirl dex + same-clip terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-symposium-swirl", 5, "swirl", "gyro|symposium",
        "Gyro + symposium on swirl base. 5 ADD = gyro(+1) + symposium(+1) + swirl(3); JOB CLIP > (back) SPIN [BOD] > (no plant while) SAME BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL].",
        "W7d gyro 2026-05-27: gyro-symposium chassis adapted to swirl's back-swirl dex. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-whirling-swirl", 5, "whirling-swirl", "gyro|whirling",
        "Gyro + whirling on swirl base. 5 ADD = gyro(+1) + whirling-swirl(4); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL].",
        "W7d gyro 2026-05-27: gyro chassis flips whirling-swirl's first OP IN dex to SAME IN. 5 brackets matches 5 ADD.",
    ),
    (
        "gyro-eclipse", 4, "eclipse", "",
        "Gyro modifier on eclipse base. 4 ADD = gyro(+1) + eclipse(3); JOB CLIP > (back) SPIN [BOD] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]. Jump-class compound: gyro's back-spin precedes eclipse's jump, then mid-flight inside-stall + landing toe.",
        "W7d gyro 2026-05-27: fairy-eclipse / pixie-eclipse jump-class chassis (double [DEL] for mid-flight + landing), with gyro back-spin replacing the leading set-dex. Double [BOD] front-of-chain. 4 brackets matches 4 ADD.",
    ),
]

W7D_CORRECTIONS = [
    ("gyro-guay", "notation", "GYRO GUAY",
     "W7d 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-guay", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL]",
     "W7d 2026-05-27: gyro chassis + guay's inside-stall terminator. 3 brackets matches 3 ADD."),

    ("gyro-butterfly-swirl", "notation", "GYRO BUTTERFLY SWIRL",
     "W7d 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-butterfly-swirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W7d 2026-05-27: gyro chassis + butterfly-swirl chassis. 5 brackets matches 5 ADD."),

    ("gyro-symposium-swirl", "notation", "GYRO SYMPOSIUM SWIRL",
     "W7d 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-symposium-swirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) SAME BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL]",
     "W7d 2026-05-27: gyro-symposium chassis with swirl's back-swirl dex. 5 brackets matches 5 ADD."),

    ("gyro-whirling-swirl", "notation", "GYRO WHIRLING SWIRL",
     "W7d 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-whirling-swirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W7d 2026-05-27: gyro chassis + whirling-swirl with first-dex flip. 5 brackets matches 5 ADD."),

    ("gyro-eclipse", "notation", "GYRO ECLIPSE",
     "W7d 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-eclipse", "operational_notation",
     "CLIP > (back) SPIN [BOD] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]",
     "W7d 2026-05-27: jump-class chassis with gyro back-spin pre-jump. Double [BOD] front + double [DEL] terminal. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W7D_ROWS:
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
        for slug, column, new_val, note in W7D_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
