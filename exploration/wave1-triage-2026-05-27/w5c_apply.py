"""
W5c — Apply 5 more fairy compound promotions.

Sibling chassis (fairy direction-flip from pixie counterparts):
  - pixie-eclipse (4 ADD canonical)         → fairy-eclipse
  - pixie-ducking-clipper (W3b)             → fairy-ducking-clipper
  - pixie-ducking-illusion (W3b)            → fairy-ducking-illusion
  - pixie-ducking-osis (W3c)                → fairy-ducking-osis

Plus a non-pixie sibling:
  - swirl (CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL])
    → fairy-swirl via fairy set prefix

fairy-eclipse follows the pixie-eclipse jump-class chassis: double
[DEL] (mid-flight inside-stall + landing toe), not the eclipse-standalone
"(land)" terminator form.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W5C_ROWS = [
    (
        "fairy-swirl", 4, "swirl", "",
        "Fairy modifier on swirl base. 4 ADD = fairy(+1) + swirl(3); JOB TOE > SAME OUT [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL].",
        "W5c fairy 2026-05-27: fairy set + swirl chassis (back-swirl dex + same-clipper terminal). 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-eclipse", 4, "eclipse", "",
        "Fairy modifier on eclipse base. 4 ADD = fairy(+1) + eclipse(3); JOB TOE > SAME OUT [DEX] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]. Jump-class compound with double [DEL] (mid-flight inside-stall + landing toe).",
        "W5c fairy 2026-05-27: fairy direction-flip of pixie-eclipse chassis. 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-ducking-clipper", 4, "clipper-stall", "fairy|ducking",
        "Fairy + ducking on clipper-stall base. 4 ADD = fairy(+1) + ducking(+1) + clipper-stall(2); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP CLIP [XBD] [DEL].",
        "W5c fairy 2026-05-27: fairy direction-flip of pixie-ducking-clipper (W3b). 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-ducking-illusion", 4, "illusion", "fairy|ducking",
        "Fairy + ducking on illusion base. 4 ADD = fairy(+1) + ducking(+1) + illusion(2); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP TOE [DEL].",
        "W5c fairy 2026-05-27: fairy direction-flip of pixie-ducking-illusion (W3b). 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-ducking-osis", 5, "osis", "fairy|ducking",
        "Fairy + ducking on osis base. 5 ADD = fairy(+1) + ducking(+1) + osis(3); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double-body-event compound (ducking + osis spin).",
        "W5c fairy 2026-05-27: fairy direction-flip of pixie-ducking-osis (W3c). Double [BOD] per the stepping-ducking-osis precedent (osis carries its own body-spin). 5 brackets matches 5 ADD.",
    ),
]

W5C_CORRECTIONS = [
    ("fairy-swirl", "notation", "FAIRY SWIRL",
     "W5c 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-swirl", "operational_notation",
     "TOE > SAME OUT [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W5c 2026-05-27: fairy set + swirl chassis. 4 brackets matches 4 ADD."),

    ("fairy-eclipse", "notation", "FAIRY ECLIPSE",
     "W5c 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-eclipse", "operational_notation",
     "TOE > SAME OUT [DEX] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]",
     "W5c 2026-05-27: fairy direction-flip of pixie-eclipse chassis. 4 brackets matches 4 ADD."),

    ("fairy-ducking-clipper", "notation", "FAIRY DUCKING CLIPPER",
     "W5c 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-clipper", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP CLIP [XBD] [DEL]",
     "W5c 2026-05-27: fairy direction-flip of pixie-ducking-clipper chassis. 4 brackets matches 4 ADD."),

    ("fairy-ducking-illusion", "notation", "FAIRY DUCKING ILLUSION",
     "W5c 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-illusion", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP TOE [DEL]",
     "W5c 2026-05-27: fairy direction-flip of pixie-ducking-illusion chassis. 4 brackets matches 4 ADD."),

    ("fairy-ducking-osis", "notation", "FAIRY DUCKING OSIS",
     "W5c 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-osis", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W5c 2026-05-27: fairy direction-flip of pixie-ducking-osis chassis. Double [BOD] per stepping-ducking-osis precedent. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W5C_ROWS:
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
        for slug, column, new_val, note in W5C_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
