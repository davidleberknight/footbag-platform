"""
W9k — Apply 5 miraging-X compound promotions (open the miraging
modifier ecosystem).

miraging IS in the modifier registry, but only one canonical sibling
exists in DB (miraging-eclipse, 4 ADD). All 5 candidates are source-
attested (footbagmoves / passback). Chassis is mechanically uniform:
miraging adds `OP IN [DEX]` at front of base body (+1 ADD).

  miraging-osis                4 ADD = miraging(+1) + osis(3)
  miraging-pickup              3 ADD = miraging(+1) + pickup(2)
  miraging-clipper             3 ADD = miraging(+1) + clipper-stall(2)
  miraging-symposium-mirage    4 ADD = miraging(+1) + symposium(+1) + mirage(2)
  miraging-symposium-illusion  4 ADD = miraging(+1) + symposium(+1) + illusion(2)

Chassis caveat: miraging-eclipse is the only existing canonical sibling,
and eclipse is jump-class (special chassis: `(land)` → scored
`OP TOE [DEL]`). The "+1 OP IN [DEX] prefix" rule is mechanically
consistent with mirage's IN-direction character ("miraging" =
mirage-style movement) and yields correct bracket counts for all 5
candidates. If curator later refines, these can be corrected via
red_corrections.

Skipped from this batch:
  - miraging (modifier-only, not a canonical trick row)
  - miraging-kilo (kilo not in DB)
  - miraging-dragon (dragon-rake exotic ecosystem)
  - miraging-symple-butterfly (symple not registered modifier)
  - miraging-symposium-eggbeater (5 ADD; held for later batch)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9K_ROWS = [
    (
        "miraging-osis", 4, "osis", "miraging",
        "Miraging modifier on osis base. 4 ADD = miraging(+1) + osis(3); JOB SET > OP IN [DEX] > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]. Chassis: miraging-eclipse precedent (OP IN [DEX] prefix per mirage's IN-direction character) + osis's back/front-spin + cross-body clipper terminal.",
        "W9k miraging 2026-05-27: miraging-eclipse precedent chassis on non-jump base. 4 brackets matches 4 ADD.",
    ),
    (
        "miraging-pickup", 3, "pickup", "miraging",
        "Miraging modifier on pickup base. 3 ADD = miraging(+1) + pickup(2); JOB SET > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]. Chassis: miraging OP IN [DEX] prefix + pickup's IN-dex + same-toe terminal.",
        "W9k miraging 2026-05-27: miraging prefix chassis + pickup chain. 3 brackets matches 3 ADD.",
    ),
    (
        "miraging-clipper", 3, "clipper-stall", "miraging",
        "Miraging modifier on clipper-stall base. 3 ADD = miraging(+1) + clipper-stall(2); JOB SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]. Chassis: miraging OP IN [DEX] prefix + cross-body clipper terminal.",
        "W9k miraging 2026-05-27: miraging prefix chassis + clipper-stall terminal. 3 brackets matches 3 ADD.",
    ),
    (
        "miraging-symposium-mirage", 4, "mirage", "miraging|symposium",
        "Miraging + symposium on mirage base. 4 ADD = miraging(+1) + symposium(+1) + mirage(2); JOB SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]. Chassis: miraging OP IN [DEX] prefix + symposium-mirage's no-plant body+dex chain.",
        "W9k miraging 2026-05-27: miraging prefix chassis + symposium-mirage chain. 4 brackets matches 4 ADD.",
    ),
    (
        "miraging-symposium-illusion", 4, "illusion", "miraging|symposium",
        "Miraging + symposium on illusion base. 4 ADD = miraging(+1) + symposium(+1) + illusion(2); JOB SET > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]. Chassis: miraging OP IN [DEX] prefix + symposium-illusion's no-plant OUT-direction chain (W9c).",
        "W9k miraging 2026-05-27: miraging prefix chassis + symposium-illusion chain (W9c). 4 brackets matches 4 ADD.",
    ),
]

W9K_CORRECTIONS = [
    ("miraging-osis", "notation", "MIRAGING OSIS",
     "W9k 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-osis", "operational_notation",
     "SET > OP IN [DEX] > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]",
     "W9k 2026-05-27: miraging prefix + osis chain. 4 brackets matches 4 ADD."),

    ("miraging-pickup", "notation", "MIRAGING PICKUP",
     "W9k 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-pickup", "operational_notation",
     "SET > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]",
     "W9k 2026-05-27: miraging prefix + pickup chain. 3 brackets matches 3 ADD."),

    ("miraging-clipper", "notation", "MIRAGING CLIPPER",
     "W9k 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-clipper", "operational_notation",
     "SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]",
     "W9k 2026-05-27: miraging prefix + clipper-stall terminal. 3 brackets matches 3 ADD."),

    ("miraging-symposium-mirage", "notation", "MIRAGING SYMPOSIUM MIRAGE",
     "W9k 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-symposium-mirage", "operational_notation",
     "SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W9k 2026-05-27: miraging prefix + symposium-mirage chain. 4 brackets matches 4 ADD."),

    ("miraging-symposium-illusion", "notation", "MIRAGING SYMPOSIUM ILLUSION",
     "W9k 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-symposium-illusion", "operational_notation",
     "SET > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W9k 2026-05-27: miraging prefix + symposium-illusion chain. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9K_ROWS:
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
        for slug, column, new_val, note in W9K_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
