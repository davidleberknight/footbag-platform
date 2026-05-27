"""
W5e — Apply 5 more fairy compound promotions.

Extends into paradon, spinning, gyro, and double-pickup compound families:

  fairy-paradon              5 ADD = fairy(+1) + paradon(4)
  fairy-spinning-butterfly   5 ADD = fairy(+1) + spinning(+1) + butterfly(3)
  fairy-spinning-osis        5 ADD = fairy(+1) + spinning(+1) + osis(3)
  fairy-gyro-whirl           5 ADD = fairy(+1) + gyro(+1) + whirl(3)
  fairy-double-pickup        4 ADD = fairy(+1) + double-pickup(3)

Sibling chassis:
  - paradon (TOE > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL])
    → fairy-paradon via TOE+SAME OUT [DEX] prefix. Avoids the OP BACK
    SWIRL outlier present in pixie-paradon's chassis — fairy-paradon
    follows the regular fairy direction-flip pattern.
  - spinning-butterfly (CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP)
    → fairy-spinning-butterfly with TOE+dex replacing the CLIP set
  - spinning-osis (double back-spin chassis) → fairy-spinning-osis
  - gyro-whirl (CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP)
    → fairy-gyro-whirl
  - double-pickup (CLIP > OP IN [DEX] > SAME IN [DEX] > SAME TOE [DEL])
    → fairy-double-pickup

Skipped from this batch: fairy-gyro-drifter (gyro-drifter is not yet
canonical in DB).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W5E_ROWS = [
    (
        "fairy-paradon", 5, "paradon", "",
        "Fairy modifier on paradon base. 5 ADD = fairy(+1) + paradon(4); JOB TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W5e fairy 2026-05-27: fairy set + paradon chassis (OP OUT dex + SAME OUT dex + cross-body clipper). Avoids the OP BACK SWIRL outlier of pixie-paradon. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-spinning-butterfly", 5, "butterfly", "fairy|spinning",
        "Fairy + spinning on butterfly base. 5 ADD = fairy(+1) + spinning(+1) + butterfly(3); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W5e fairy 2026-05-27: spinning-butterfly chassis (CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP) with fairy TOE+SAME OUT [DEX] prefix replacing the CLIP set. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-spinning-osis", 5, "osis", "fairy|spinning",
        "Fairy + spinning on osis base. 5 ADD = fairy(+1) + spinning(+1) + osis(3); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Double-body-spin compound (spinning + osis's own back-spin).",
        "W5e fairy 2026-05-27: spinning-osis chassis (CLIP > double-back-spin > OP CLIP) with fairy TOE+dex prefix. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-gyro-whirl", 5, "whirl", "fairy|gyro",
        "Fairy + gyro on whirl base. 5 ADD = fairy(+1) + gyro(+1) + whirl(3); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP [XBD] [DEL].",
        "W5e fairy 2026-05-27: gyro-whirl chassis (CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP) with fairy TOE+dex prefix. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-double-pickup", 4, "double-pickup", "",
        "Fairy modifier on double-pickup base. 4 ADD = fairy(+1) + double-pickup(3); JOB TOE > SAME OUT [DEX] > OP IN [DEX] > SAME IN [DEX] > SAME TOE [DEL].",
        "W5e fairy 2026-05-27: double-pickup chassis (CLIP > OP IN [DEX] > SAME IN [DEX] > SAME TOE) with fairy TOE+SAME OUT [DEX] prefix. 4 brackets matches 4 ADD.",
    ),
]

W5E_CORRECTIONS = [
    ("fairy-paradon", "notation", "FAIRY PARADON",
     "W5e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-paradon", "operational_notation",
     "TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W5e 2026-05-27: fairy set + paradon chassis. 5 brackets matches 5 ADD."),

    ("fairy-spinning-butterfly", "notation", "FAIRY SPINNING BUTTERFLY",
     "W5e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-spinning-butterfly", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W5e 2026-05-27: spinning-butterfly chassis with fairy TOE+dex prefix. 5 brackets matches 5 ADD."),

    ("fairy-spinning-osis", "notation", "FAIRY SPINNING OSIS",
     "W5e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-spinning-osis", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W5e 2026-05-27: spinning-osis chassis (double back-spin) with fairy prefix. 5 brackets matches 5 ADD."),

    ("fairy-gyro-whirl", "notation", "FAIRY GYRO WHIRL",
     "W5e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-gyro-whirl", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP [XBD] [DEL]",
     "W5e 2026-05-27: gyro-whirl chassis with fairy prefix. 5 brackets matches 5 ADD."),

    ("fairy-double-pickup", "notation", "FAIRY DOUBLE PICKUP",
     "W5e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-double-pickup", "operational_notation",
     "TOE > SAME OUT [DEX] > OP IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]",
     "W5e 2026-05-27: double-pickup chassis with fairy prefix. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W5E_ROWS:
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
        for slug, column, new_val, note in W5E_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
