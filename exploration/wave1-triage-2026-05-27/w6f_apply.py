"""
W6f — Apply 5 more spinning compound promotions (W6 closeout).

Final clean structural compounds in the W6 spinning pool:

  double-spinning-butterfly   5 ADD = double-spinning(+2) + butterfly(3)
  double-spinning-mirage      4 ADD = double-spinning(+2) + mirage(2)
  spinning-paradox-torque     6 ADD = spinning(+1) + paradox(+1) + torque(4)
  spinning-symposium-swirl    5 ADD = spinning(+1) + symposium(+1) + swirl(3)
  spinning-butterfly-swirl    5 ADD = spinning(+1) + butterfly-swirl(4)

Sibling chassis:
  - spinning-butterfly + extra (back) SPIN [BOD] → double-spinning-butterfly
  - spinning-pickup + extra spin → double-spinning-mirage
  - spinning-paradox-whirl + torque's (back) SPIN [BOD] → spinning-paradox-torque
  - spinning-symposium-whirl chassis with swirl's back-swirl dex →
    spinning-symposium-swirl
  - spinning chassis + butterfly-swirl base → spinning-butterfly-swirl

Deferred from this batch: double-spinning-rake (rake has empty
operational_notation in DB; no standard chassis for rake contact).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W6F_ROWS = [
    (
        "double-spinning-butterfly", 5, "butterfly", "",
        "Double-spinning compound on butterfly base. 5 ADD = double-spinning(+2) + butterfly(3); JOB CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W6f spinning 2026-05-27: spinning-butterfly chassis + extra (back) SPIN [BOD]. 5 brackets matches 5 ADD.",
    ),
    (
        "double-spinning-mirage", 4, "mirage", "",
        "Double-spinning compound on mirage base. 4 ADD = double-spinning(+2) + mirage(2); JOB CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL].",
        "W6f spinning 2026-05-27: spinning-mirage chassis + extra (back) SPIN [BOD]. 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-paradox-torque", 6, "torque", "spinning|paradox",
        "Spinning + paradox on torque base. 6 ADD = spinning(+1) + paradox(+1) + torque(4); JOB CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Double-body-spin compound (spinning's spin + torque's own back-spin).",
        "W6f spinning 2026-05-27: spinning-paradox-whirl chassis (CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > <terminal>) + torque's back-spin + op-clip terminator. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-symposium-swirl", 5, "swirl", "spinning|symposium",
        "Spinning + symposium on swirl base. 5 ADD = spinning(+1) + symposium(+1) + swirl(3); JOB CLIP > (back) SPIN [BOD] > (no plant while) SAME BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL].",
        "W6f spinning 2026-05-27: spinning-symposium-whirl chassis adapted with swirl's back-swirl dex (the [BOD] [DEX] simultaneous pair under 'no plant while'). 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-butterfly-swirl", 5, "butterfly-swirl", "",
        "Spinning modifier on butterfly-swirl base. 5 ADD = spinning(+1) + butterfly-swirl(4); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL].",
        "W6f spinning 2026-05-27: spinning chassis + butterfly-swirl chassis (SAME OUT dex + OP BACK SWIRL dex + same-clipper terminal). 5 brackets matches 5 ADD.",
    ),
]

W6F_CORRECTIONS = [
    ("double-spinning-butterfly", "notation", "DOUBLE SPINNING BUTTERFLY",
     "W6f 2026-05-27: JOB per mechanical uppercase rule."),
    ("double-spinning-butterfly", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W6f 2026-05-27: double back-spin + butterfly's OP OUT dex + cross-body clipper. 5 brackets matches 5 ADD."),

    ("double-spinning-mirage", "notation", "DOUBLE SPINNING MIRAGE",
     "W6f 2026-05-27: JOB per mechanical uppercase rule."),
    ("double-spinning-mirage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]",
     "W6f 2026-05-27: double back-spin + mirage's OP IN dex + toe terminator. 4 brackets matches 4 ADD."),

    ("spinning-paradox-torque", "notation", "SPINNING PARADOX TORQUE",
     "W6f 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-paradox-torque", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W6f 2026-05-27: spinning-paradox-whirl chassis + torque's back-spin + op-clip terminator. 6 brackets matches 6 ADD."),

    ("spinning-symposium-swirl", "notation", "SPINNING SYMPOSIUM SWIRL",
     "W6f 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-symposium-swirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) SAME BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL]",
     "W6f 2026-05-27: spinning-symposium chassis adapted to swirl's back-swirl dex. 5 brackets matches 5 ADD."),

    ("spinning-butterfly-swirl", "notation", "SPINNING BUTTERFLY SWIRL",
     "W6f 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-butterfly-swirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W6f 2026-05-27: spinning chassis + butterfly-swirl compound base. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W6F_ROWS:
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
        for slug, column, new_val, note in W6F_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
