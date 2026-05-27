"""
W5d — Apply 5 more fairy compound promotions.

Continues the fairy direction-flip pattern from pixie counterparts and
extends into the gyro modifier:

  fairy-ducking-whirl            5 ADD = fairy(+1) + ducking(+1) + whirl(3)
  fairy-ducking-blender          6 ADD = fairy(+1) + ducking(+1) + blender(4)
  fairy-ducking-double-leg-over  5 ADD = fairy(+1) + ducking(+1) + double-leg-over(3)
  fairy-ducking-torque           6 ADD = fairy(+1) + ducking(+1) + torque(4)
  fairy-gyro-butterfly           5 ADD = fairy(+1) + gyro(+1) + butterfly(3)

Sibling chassis:
  - pixie-ducking-whirl (W3c) → fairy-ducking-whirl
  - phoenix/assassin chassis extended for ducking-blender / ducking-dlo /
    ducking-torque (preserves DUCK [BOD] insertion between fairy dex
    and base trick chain)
  - gyro-butterfly (4 ADD canonical; CLIP > (back) SPIN [BOD] > ...)
    → fairy-gyro-butterfly via TOE replacement of the CLIP set

Source "Fairy Ducking DLO" (Stanford) → slug fairy-ducking-double-leg-over
per the double-leg-over full-form convention used in W5b
(fairy-double-leg-over) + W3b (pixie-double-leg-over).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W5D_ROWS = [
    (
        "fairy-ducking-whirl", 5, "whirl", "fairy|ducking",
        "Fairy + ducking on whirl base. 5 ADD = fairy(+1) + ducking(+1) + whirl(3); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL].",
        "W5d fairy 2026-05-27: fairy direction-flip of pixie-ducking-whirl (W3c). 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-ducking-blender", 6, "blender", "fairy|ducking",
        "Fairy + ducking on blender base. 6 ADD = fairy(+1) + ducking(+1) + blender(4); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double-body-event compound (ducking + blender's back-spin).",
        "W5d fairy 2026-05-27: phoenix chassis extended with blender's IN-dex + back-spin + same-clip terminator. 6 brackets matches 6 ADD.",
    ),
    (
        "fairy-ducking-double-leg-over", 5, "double-leg-over", "fairy|ducking",
        "Fairy + ducking on double-leg-over base. 5 ADD = fairy(+1) + ducking(+1) + double-leg-over(3); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Stanford source 'Fairy Ducking DLO'; slug uses full-form per double-leg-over DB convention.",
        "W5d fairy 2026-05-27: phoenix chassis + double-leg-over's IN-dex / OUT-dex / same-toe terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-ducking-torque", 6, "torque", "fairy|ducking",
        "Fairy + ducking on torque base. 6 ADD = fairy(+1) + ducking(+1) + torque(4); JOB TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL].",
        "W5d fairy 2026-05-27: phoenix chassis + torque chassis (IN-dex + back-spin + op-clip terminator). Note OP CLIP vs blender's SAME CLIP. 6 brackets matches 6 ADD.",
    ),
    (
        "fairy-gyro-butterfly", 5, "butterfly", "fairy|gyro",
        "Fairy + gyro on butterfly base. 5 ADD = fairy(+1) + gyro(+1) + butterfly(3); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W5d fairy 2026-05-27: gyro-butterfly chassis (CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]) with fairy TOE+dex prefix replacing the CLIP set. 5 brackets matches 5 ADD.",
    ),
]

W5D_CORRECTIONS = [
    ("fairy-ducking-whirl", "notation", "FAIRY DUCKING WHIRL",
     "W5d 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-whirl", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL]",
     "W5d 2026-05-27: fairy direction-flip of pixie-ducking-whirl chassis. 5 brackets matches 5 ADD."),

    ("fairy-ducking-blender", "notation", "FAIRY DUCKING BLENDER",
     "W5d 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-blender", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W5d 2026-05-27: phoenix chassis + blender's back-spin + same-clip terminal. 6 brackets matches 6 ADD."),

    ("fairy-ducking-double-leg-over", "notation", "FAIRY DUCKING DOUBLE LEG OVER",
     "W5d 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-double-leg-over", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W5d 2026-05-27: phoenix chassis + double-leg-over dexes + same-toe terminal. 5 brackets matches 5 ADD."),

    ("fairy-ducking-torque", "notation", "FAIRY DUCKING TORQUE",
     "W5d 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-ducking-torque", "operational_notation",
     "TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W5d 2026-05-27: phoenix chassis + torque chassis (op-clip terminal). 6 brackets matches 6 ADD."),

    ("fairy-gyro-butterfly", "notation", "FAIRY GYRO BUTTERFLY",
     "W5d 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-gyro-butterfly", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W5d 2026-05-27: gyro-butterfly chassis with fairy TOE+dex prefix. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W5D_ROWS:
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
        for slug, column, new_val, note in W5D_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
