"""
W5a — Apply 5 clean fairy compound promotions.

Pilot batch for Wave 5 (Fairy). Of the 84 fairy Cat-A triage rows:
  - 6 already canonical (fairy-eggbeater / fairy-legover / fairy-pickup
    / fairy-ducking-butterfly / fairy-ducking-legover / fairy-ducking-pickup)
  - ~25 SS / directional / parenthetical Cat-B alias variants
  - ~20 folk-named (juggernaut / orangutan / fear / flow / ferocious /
    cower / janiwalker / shutdown / mobius / ripstein / twirl / etc. —
    some canonical, most not yet)
  - ~10 base-blocked (fairy-X where X is not canonical OR has open doctrine)
  - ~20 promotable structural compounds

W5a lands 5 unambiguous single-modifier compounds where:
  - the bare fairy-X slug does not overlap with an existing folk-name
    canonical row
  - the base is canonical
  - notation derives mechanically from the fairy set chassis
    (TOE > SAME OUT [DEX] > <base dex+terminal>)

  fairy-mirage     3 ADD = fairy(+1) + mirage(2)
  fairy-osis       4 ADD = fairy(+1) + osis(3)
  fairy-blender    5 ADD = fairy(+1) + blender(4)
  fairy-flail      4 ADD = fairy(+1) + flail(3)
  fairy-barrage    4 ADD = fairy(+1) + barrage(3)

Folk-name overlaps confirmed-deferred:
  - fairy-torque         = forque (5 ADD canonical)
  - fairy-ducking-mirage = guillotine (4 ADD canonical)

fairy is +1 universal (rotational and non-rotational; per modifier table).
Bracket counts match asserted ADD on every row.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W5A_ROWS = [
    (
        "fairy-mirage", 3, "mirage",
        "Fairy modifier on mirage base. 3 ADD = fairy(+1) + mirage(2); JOB TOE > SAME OUT [DEX] > OP IN [DEX] > OP TOE [DEL].",
        "W5a fairy pilot 2026-05-27: fairy set (TOE > SAME OUT [DEX]) + mirage's OP IN dex + toe terminator. 3 brackets ([DEX] [DEX] [DEL]) matches 3 ADD. Stanford lists folk-alts (Fear / Fairy Smasher) which are not yet canonical.",
    ),
    (
        "fairy-osis", 4, "osis",
        "Fairy modifier on osis base. 4 ADD = fairy(+1) + osis(3); JOB TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL].",
        "W5a fairy pilot 2026-05-27: fairy set + osis's body-spin + same-clip terminal. Note: NOT to be confused with twirl (= Reverse Swirling Osis, 4 ADD canonical under a different decomposition). 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-blender", 5, "blender",
        "Fairy modifier on blender base. 5 ADD = fairy(+1) + blender(4); JOB TOE > SAME OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL].",
        "W5a fairy pilot 2026-05-27: fairy set + blender's IN-dex + back-spin + same-clip terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-flail", 4, "flail",
        "Fairy modifier on flail base. 4 ADD = fairy(+1) + flail(3); JOB TOE > SAME OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL].",
        "W5a fairy pilot 2026-05-27: fairy set + flail's no-plant body+dex pair + toe terminator. 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-barrage", 4, "barrage",
        "Fairy modifier on barrage base. 4 ADD = fairy(+1) + barrage(3); JOB TOE > SAME OUT [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL].",
        "W5a fairy pilot 2026-05-27: fairy set + barrage's SAME IN double-dex chain + toe terminator. 4 brackets ([DEX] [DEX] [DEX] [DEL]) matches 4 ADD.",
    ),
]

W5A_CORRECTIONS = [
    ("fairy-mirage", "notation", "FAIRY MIRAGE",
     "W5a 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-mirage", "operational_notation",
     "TOE > SAME OUT [DEX] > OP IN [DEX] > OP TOE [DEL]",
     "W5a 2026-05-27: fairy set + mirage chassis. 3 brackets matches 3 ADD."),

    ("fairy-osis", "notation", "FAIRY OSIS",
     "W5a 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-osis", "operational_notation",
     "TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W5a 2026-05-27: fairy set + osis chassis (body-spin + same-clip terminal). 4 brackets matches 4 ADD."),

    ("fairy-blender", "notation", "FAIRY BLENDER",
     "W5a 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-blender", "operational_notation",
     "TOE > SAME OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W5a 2026-05-27: fairy set + blender chassis. 5 brackets matches 5 ADD."),

    ("fairy-flail", "notation", "FAIRY FLAIL",
     "W5a 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-flail", "operational_notation",
     "TOE > SAME OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W5a 2026-05-27: fairy set + flail chassis. 4 brackets matches 4 ADD."),

    ("fairy-barrage", "notation", "FAIRY BARRAGE",
     "W5a 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-barrage", "operational_notation",
     "TOE > SAME OUT [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]",
     "W5a 2026-05-27: fairy set + barrage's SAME IN double-dex chain. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, desc, note in W5A_ROWS:
            if name_exists_in_additions(canonical):
                add_skipped += 1
                continue
            w.writerow([
                canonical, adds, base, "compound", "", "",
                desc, "expert_reviewed", "1", note,
            ])
            add_appended += 1

    cor_skipped = 0
    cor_appended = 0
    with COR_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for slug, column, new_val, note in W5A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
