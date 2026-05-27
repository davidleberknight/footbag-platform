"""
W5f — Apply 5 more fairy compound promotions.

Extends into spinning-mirage/illusion/blender, gyro-mirage, and
double-over-down compound families:

  fairy-spinning-mirage     4 ADD = fairy(+1) + spinning(+1) + mirage(2)
  fairy-spinning-illusion   4 ADD = fairy(+1) + spinning(+1) + illusion(2)
  fairy-spinning-blender    6 ADD = fairy(+1) + spinning(+1) + blender(4)
  fairy-gyro-mirage         4 ADD = fairy(+1) + gyro(+1) + mirage(2)
  fairy-double-over-down    5 ADD = fairy(+1) + double-over-down(4)

Sibling chassis:
  - spinning-pickup / spinning-whirl (CLIP > (back) SPIN [BOD] > <base>)
    → fairy-spinning-{mirage,illusion} with fairy TOE+dex prefix
  - blender's own back-spin chassis composes with spinning's back-spin
    → fairy-spinning-blender (double back-spin chain)
  - gyro-mirage (CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL])
    → fairy-gyro-mirage
  - double-over-down (TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL])
    → fairy-double-over-down via fairy TOE+SAME OUT [DEX] prefix
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W5F_ROWS = [
    (
        "fairy-spinning-mirage", 4, "mirage", "fairy|spinning",
        "Fairy + spinning on mirage base. 4 ADD = fairy(+1) + spinning(+1) + mirage(2); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL].",
        "W5f fairy 2026-05-27: spinning-pickup chassis pattern (CLIP > (back) SPIN [BOD] > <base>) substituting mirage's OP IN dex + op-toe terminator. Fairy TOE+SAME OUT [DEX] replaces the CLIP set. 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-spinning-illusion", 4, "illusion", "fairy|spinning",
        "Fairy + spinning on illusion base. 4 ADD = fairy(+1) + spinning(+1) + illusion(2); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL].",
        "W5f fairy 2026-05-27: same chassis as fairy-spinning-mirage with illusion's OP OUT dex (vs mirage's OP IN). 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-spinning-blender", 6, "blender", "fairy|spinning",
        "Fairy + spinning on blender base. 6 ADD = fairy(+1) + spinning(+1) + blender(4); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double back-spin compound (spinning + blender's own back-spin).",
        "W5f fairy 2026-05-27: spinning-paradox-blender chassis pattern adapted (spinning's spin then blender's IN-dex + back-spin + same-clip). 6 brackets matches 6 ADD.",
    ),
    (
        "fairy-gyro-mirage", 4, "mirage", "fairy|gyro",
        "Fairy + gyro on mirage base. 4 ADD = fairy(+1) + gyro(+1) + mirage(2); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL].",
        "W5f fairy 2026-05-27: gyro-mirage chassis (CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL]) with fairy TOE+SAME OUT [DEX] prefix replacing the CLIP set. 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-double-over-down", 5, "double-over-down", "",
        "Fairy modifier on double-over-down base. 5 ADD = fairy(+1) + double-over-down(4); JOB TOE > SAME OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W5f fairy 2026-05-27: fairy TOE+SAME OUT [DEX] prefix on double-over-down's two-OP-OUT-dex chain + cross-body clipper terminal. 5 brackets matches 5 ADD.",
    ),
]

W5F_CORRECTIONS = [
    ("fairy-spinning-mirage", "notation", "FAIRY SPINNING MIRAGE",
     "W5f 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-spinning-mirage", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]",
     "W5f 2026-05-27: spinning chassis + mirage IN-dex + toe terminator. 4 brackets matches 4 ADD."),

    ("fairy-spinning-illusion", "notation", "FAIRY SPINNING ILLUSION",
     "W5f 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-spinning-illusion", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL]",
     "W5f 2026-05-27: spinning chassis + illusion OUT-dex + toe terminator. 4 brackets matches 4 ADD."),

    ("fairy-spinning-blender", "notation", "FAIRY SPINNING BLENDER",
     "W5f 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-spinning-blender", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W5f 2026-05-27: double-back-spin chain (spinning's spin + blender's own spin). 6 brackets matches 6 ADD."),

    ("fairy-gyro-mirage", "notation", "FAIRY GYRO MIRAGE",
     "W5f 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-gyro-mirage", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL]",
     "W5f 2026-05-27: gyro-mirage chassis with fairy prefix. 4 brackets matches 4 ADD."),

    ("fairy-double-over-down", "notation", "FAIRY DOUBLE OVER DOWN",
     "W5f 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-double-over-down", "operational_notation",
     "TOE > SAME OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W5f 2026-05-27: double-over-down chassis with fairy prefix. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W5F_ROWS:
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
        for slug, column, new_val, note in W5F_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
