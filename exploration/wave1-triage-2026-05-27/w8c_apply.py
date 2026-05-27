"""
W8c — Apply 5 more ducking compound promotions (doctrine-clean).

Extends ducking into butterfly-swirl / eclipse / multi-modifier torque +
blender / spinning-ducking-clipper:

  ducking-butterfly-swirl     5 ADD = ducking(+1) + butterfly-swirl(4)
  ducking-eclipse             4 ADD = ducking(+1) + eclipse(3)  [jump-class]
  stepping-ducking-torque     6 ADD = stepping(+1) + ducking(+1) + torque(4)
  spinning-ducking-clipper    4 ADD = spinning(+1) + ducking(+1) + clipper-stall(2)
  ducking-paradox-blender     6 ADD = ducking(+1) + paradox(+1) + blender(4)

Sibling chassis:
  - ducking-mirage (TOE > DUCK [BOD] > ...) extended to butterfly-swirl
  - pixie-eclipse / fairy-eclipse jump-class chassis (double [DEL]
    terminal) adapted to ducking-eclipse (DUCK [BOD] replaces set-dex)
  - stepping-ducking-mirage (CLIP > OP IN [DEX] > DUCK [BOD] > ...) +
    torque's IN-dex + back-spin + op-clip terminal
  - spinning-ducking-mirage (W6c) collapsed to clipper terminal for
    spinning-ducking-clipper (no inner dex)
  - ducking-paradox-whirl (W8b) extended with blender's back-spin +
    same-clip terminator
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W8C_ROWS = [
    (
        "ducking-butterfly-swirl", 5, "butterfly-swirl", "",
        "Ducking modifier on butterfly-swirl base. 5 ADD = ducking(+1) + butterfly-swirl(4); JOB TOE > DUCK [BOD] > OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL].",
        "W8c ducking 2026-05-27: ducking chassis + butterfly-swirl chain (OP OUT dex + back-swirl dex + same-clip terminal). 5 brackets matches 5 ADD.",
    ),
    (
        "ducking-eclipse", 4, "eclipse", "",
        "Ducking modifier on eclipse base. 4 ADD = ducking(+1) + eclipse(3); JOB TOE > DUCK [BOD] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]. Jump-class compound: ducking dip precedes eclipse's jump, then mid-flight inside-stall + landing toe.",
        "W8c ducking 2026-05-27: jump-class chassis (double [DEL] terminal per pixie-eclipse / fairy-eclipse precedent) with DUCK [BOD] replacing the leading set-dex. 4 brackets matches 4 ADD.",
    ),
    (
        "stepping-ducking-torque", 6, "torque", "stepping|ducking",
        "Stepping + ducking on torque base. 6 ADD = stepping(+1) + ducking(+1) + torque(4); JOB CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Double-body-event compound.",
        "W8c ducking 2026-05-27: stepping-ducking-mirage chassis + torque's IN-dex + back-spin + op-clip terminal. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-ducking-clipper", 4, "clipper-stall", "spinning|ducking",
        "Spinning + ducking on clipper-stall base. 4 ADD = spinning(+1) + ducking(+1) + clipper-stall(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP CLIP [XBD] [DEL]. Double-body-event compound (spin + duck dip; no inner dex).",
        "W8c ducking 2026-05-27: spinning-ducking-mirage chassis collapsed to clipper terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "ducking-paradox-blender", 6, "blender", "ducking|paradox",
        "Ducking + paradox on blender base. 6 ADD = ducking(+1) + paradox(+1) + blender(4); JOB CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double-body-event compound (duck dip + blender's own back-spin).",
        "W8c ducking 2026-05-27: ducking-paradox-whirl chassis + blender's IN-dex + back-spin + same-clip terminator. 6 brackets matches 6 ADD.",
    ),
]

W8C_CORRECTIONS = [
    ("ducking-butterfly-swirl", "notation", "DUCKING BUTTERFLY SWIRL",
     "W8c 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-butterfly-swirl", "operational_notation",
     "TOE > DUCK [BOD] > OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W8c 2026-05-27: ducking chassis + butterfly-swirl chain. 5 brackets matches 5 ADD."),

    ("ducking-eclipse", "notation", "DUCKING ECLIPSE",
     "W8c 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-eclipse", "operational_notation",
     "TOE > DUCK [BOD] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]",
     "W8c 2026-05-27: jump-class chassis with DUCK [BOD] pre-jump. 4 brackets matches 4 ADD."),

    ("stepping-ducking-torque", "notation", "STEPPING DUCKING TORQUE",
     "W8c 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-ducking-torque", "operational_notation",
     "CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W8c 2026-05-27: stepping-ducking chassis + torque chain. 6 brackets matches 6 ADD."),

    ("spinning-ducking-clipper", "notation", "SPINNING DUCKING CLIPPER",
     "W8c 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-clipper", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP CLIP [XBD] [DEL]",
     "W8c 2026-05-27: spinning-ducking chassis collapsed to clipper terminal. 4 brackets matches 4 ADD."),

    ("ducking-paradox-blender", "notation", "DUCKING PARADOX BLENDER",
     "W8c 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-blender", "operational_notation",
     "CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W8c 2026-05-27: ducking-paradox chassis + blender chain. 6 brackets matches 6 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W8C_ROWS:
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
        for slug, column, new_val, note in W8C_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
