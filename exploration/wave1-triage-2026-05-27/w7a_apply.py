"""
W7a — Apply 5 clean gyro compound promotions (pilot batch).

Pilot batch for Wave 7 (Gyro/Spyro). Of the 63 gyro Cat-A triage rows:
  - 4 already canonical (gyro-butterfly, gyro-illusion, gyro-mirage, gyro-whirl)
  - 1 folk-aliased (gyro-torque = mobius, 5 ADD canonical)
  - ~15 SS / directional / parenthetical Cat-B alias variants
  - ~10 multi-modifier 3+ stack (Cat-C territory)
  - ~10 folk-named with unverified canonical (Spyro Symple Drifter / Janiwalker / etc.)
  - ~25 genuinely promotable structural compounds

W7a lands 5 unambiguous gyro + canonical-base rows:

  gyro-osis      4 ADD = gyro(+1) + osis(3)   [double back-spin]
  gyro-pickup    3 ADD = gyro(+1) + pickup(2)
  gyro-legover   3 ADD = gyro(+1) + legover(2)
  gyro-flail     4 ADD = gyro(+1) + flail(3)
  gyro-barfly    5 ADD = gyro(+1) + barfly(4)

Sibling chassis: gyro-butterfly / gyro-illusion / gyro-mirage / gyro-whirl
pattern (CLIP > (back) SPIN [BOD] > <base's first dex flipped to SAME-
direction> > <base's tail>). The gyro chassis differs from spinning's
by using SAME-side dex direction (gyro = half-spin, same-side reading)
vs spinning's OP-side dex direction (spinning = full-spin, opposite-
side reading). Where the base has no dex (clipper-stall) or its own
body-spin (osis), gyro just adds a back-spin prefix.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W7A_ROWS = [
    (
        "gyro-osis", 4, "osis", "",
        "Gyro modifier on osis base. 4 ADD = gyro(+1) + osis(3); JOB CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double-body-spin compound (gyro's spin + osis's own back-spin).",
        "W7a gyro pilot 2026-05-27: gyro spin prefix + osis chassis (osis carries its own body-spin). Terminal SAME CLIP follows gyro's same-side convention. 4 brackets matches 4 ADD.",
    ),
    (
        "gyro-pickup", 3, "pickup", "",
        "Gyro modifier on pickup base. 3 ADD = gyro(+1) + pickup(2); JOB CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME TOE [DEL].",
        "W7a gyro pilot 2026-05-27: gyro chassis flips pickup's OP IN dex to SAME IN (same-side variant). 3 brackets matches 3 ADD.",
    ),
    (
        "gyro-legover", 3, "legover", "",
        "Gyro modifier on legover base. 3 ADD = gyro(+1) + legover(2); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > SAME TOE [DEL].",
        "W7a gyro pilot 2026-05-27: gyro chassis flips legover's OP OUT dex to SAME OUT (same-side variant). 3 brackets matches 3 ADD.",
    ),
    (
        "gyro-flail", 4, "flail", "",
        "Gyro modifier on flail base. 4 ADD = gyro(+1) + flail(3); JOB CLIP > (back) SPIN [BOD] > (no plant while) SAME OUT [BOD] [DEX] > OP TOE [DEL].",
        "W7a gyro pilot 2026-05-27: gyro chassis flips flail's no-plant body+dex to SAME OUT direction. 4 brackets matches 4 ADD.",
    ),
    (
        "gyro-barfly", 5, "barfly", "",
        "Gyro modifier on barfly base. 5 ADD = gyro(+1) + barfly(4); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]. Preserves barfly's natural SAME OUT dexes (no flip needed; barfly is already same-side) and unusual [DEL] [XBD] terminal order.",
        "W7a gyro pilot 2026-05-27: gyro spin prefix + barfly's two-SAME-OUT-dex chain + barfly-style terminal. 5 brackets matches 5 ADD.",
    ),
]

W7A_CORRECTIONS = [
    ("gyro-osis", "notation", "GYRO OSIS",
     "W7a 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-osis", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W7a 2026-05-27: gyro spin + osis chassis (double back-spin). 4 brackets matches 4 ADD."),

    ("gyro-pickup", "notation", "GYRO PICKUP",
     "W7a 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-pickup", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME TOE [DEL]",
     "W7a 2026-05-27: gyro chassis + pickup SAME IN dex + same-toe terminator. 3 brackets matches 3 ADD."),

    ("gyro-legover", "notation", "GYRO LEGOVER",
     "W7a 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-legover", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > SAME TOE [DEL]",
     "W7a 2026-05-27: gyro chassis + legover SAME OUT dex + same-toe terminator. 3 brackets matches 3 ADD."),

    ("gyro-flail", "notation", "GYRO FLAIL",
     "W7a 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-flail", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) SAME OUT [BOD] [DEX] > OP TOE [DEL]",
     "W7a 2026-05-27: gyro chassis + flail's no-plant body+dex flipped to SAME OUT. 4 brackets matches 4 ADD."),

    ("gyro-barfly", "notation", "GYRO BARFLY",
     "W7a 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-barfly", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]",
     "W7a 2026-05-27: gyro spin + barfly's two-SAME-OUT-dex chain. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W7A_ROWS:
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
        for slug, column, new_val, note in W7A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
