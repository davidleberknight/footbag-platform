"""
W6a — Apply 5 clean spinning compound promotions (pilot batch).

Pilot batch for Wave 6 (Spinning). Of the 83 spinning Cat-A triage rows
(excluding inspinning ecosystem overlap):
  - 4 already canonical (spinning-paradox-{blender,illusion,mirage,whirl})
  - ~10 SS / directional / parenthetical Cat-B alias variants
  - ~12 multi-modifier 3+ stack (Cat-C territory)
  - ~5 folk-named (Lotus / Void / Surging / Tomahawk / Superfly / Motion)
  - ~30 genuinely promotable structural compounds

W6a lands 5 unambiguous single-modifier spinning compounds:

  spinning-mirage     3 ADD = spinning(+1) + mirage(2)
  spinning-illusion   3 ADD = spinning(+1) + illusion(2)
  spinning-legover    3 ADD = spinning(+1) + legover(2)
  spinning-blender    5 ADD = spinning(+1) + blender(4)
  spinning-swirl      4 ADD = spinning(+1) + swirl(3)

Sibling chassis: spinning-pickup (CLIP > (back) SPIN [BOD] > OP IN [DEX] >
SAME TOE [DEL]) + spinning-whirl (CLIP > (back) SPIN [BOD] > OP IN [DEX] >
OP CLIP [XBD] [DEL]). Pattern: CLIP > (back) SPIN [BOD] > <base trick's
dex+terminal>. spinning-blender includes a SECOND (back) SPIN [BOD] from
blender's own body-spin chassis.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W6A_ROWS = [
    (
        "spinning-mirage", 3, "mirage", "",
        "Spinning modifier on mirage base. 3 ADD = spinning(+1) + mirage(2); JOB CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL].",
        "W6a spinning pilot 2026-05-27: spinning-pickup chassis (CLIP > (back) SPIN [BOD] > <base>) substituting mirage's OP IN dex + op-toe terminator. 3 brackets matches 3 ADD.",
    ),
    (
        "spinning-illusion", 3, "illusion", "",
        "Spinning modifier on illusion base. 3 ADD = spinning(+1) + illusion(2); JOB CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL].",
        "W6a spinning pilot 2026-05-27: spinning chassis with illusion's OP OUT dex direction (vs mirage's OP IN). 3 brackets matches 3 ADD.",
    ),
    (
        "spinning-legover", 3, "legover", "",
        "Spinning modifier on legover base. 3 ADD = spinning(+1) + legover(2); JOB CLIP > (back) SPIN [BOD] > OP OUT [DEX] > SAME TOE [DEL].",
        "W6a spinning pilot 2026-05-27: spinning chassis with legover's OP OUT dex + same-toe terminator (vs illusion's op-toe). 3 brackets matches 3 ADD.",
    ),
    (
        "spinning-blender", 5, "blender", "",
        "Spinning modifier on blender base. 5 ADD = spinning(+1) + blender(4); JOB CLIP > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double back-spin compound (spinning's spin + blender's own back-spin).",
        "W6a spinning pilot 2026-05-27: spinning-paradox-blender chassis pattern adapted (spin then IN-dex then base back-spin + same-clip terminal). 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-swirl", 4, "swirl", "",
        "Spinning modifier on swirl base. 4 ADD = spinning(+1) + swirl(3); JOB CLIP > (back) SPIN [BOD] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL].",
        "W6a spinning pilot 2026-05-27: spinning chassis with swirl's back-swirl dex + same-clip terminator. 4 brackets matches 4 ADD.",
    ),
]

W6A_CORRECTIONS = [
    ("spinning-mirage", "notation", "SPINNING MIRAGE",
     "W6a 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-mirage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]",
     "W6a 2026-05-27: spinning chassis + mirage IN-dex + toe terminator. 3 brackets matches 3 ADD."),

    ("spinning-illusion", "notation", "SPINNING ILLUSION",
     "W6a 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-illusion", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL]",
     "W6a 2026-05-27: spinning chassis + illusion OUT-dex + toe terminator. 3 brackets matches 3 ADD."),

    ("spinning-legover", "notation", "SPINNING LEGOVER",
     "W6a 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-legover", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP OUT [DEX] > SAME TOE [DEL]",
     "W6a 2026-05-27: spinning chassis + legover's OUT-dex + same-toe terminator. 3 brackets matches 3 ADD."),

    ("spinning-blender", "notation", "SPINNING BLENDER",
     "W6a 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-blender", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W6a 2026-05-27: double back-spin chain. 5 brackets matches 5 ADD."),

    ("spinning-swirl", "notation", "SPINNING SWIRL",
     "W6a 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-swirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W6a 2026-05-27: spinning chassis + swirl's back-swirl dex + same-clip terminator. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W6A_ROWS:
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
        for slug, column, new_val, note in W6A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
