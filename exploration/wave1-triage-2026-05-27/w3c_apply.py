"""
W3c — Apply 5 more pixie compound promotions (ducking-osis/whirl + diving family).

Sibling chassis:
  - pixie-ducking-pickup  (TOE > SAME IN [DEX] >> DUCK [BOD] >> <base dex+terminal>)
    → pixie-ducking-osis + pixie-ducking-whirl
  - darkwalk              (TOE > SAME IN [DEX] >> DIVE [BOD] >> <base dex+terminal>)
    → pixie-diving-mirage + pixie-diving-pickup + pixie-diving-whirl

For pixie-ducking-osis, osis carries its own body-spin so the chassis
expands to TWO [BOD] events: pixie dex + DUCK [BOD] + osis (back) SPIN [BOD]
+ same-clipper terminal = 5 brackets.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W3C_ROWS = [
    (
        "pixie-ducking-osis", 5, "osis",
        "Pixie + ducking on osis base. 5 ADD = pixie(+1) + ducking(+1) + osis(3); JOB TOE > SAME IN [DEX] >> DUCK [BOD] >> (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double-body-event compound: pixie dex + ducking BOD + osis spin.",
        "W3c pixie pilot 2026-05-27: phoenix/assassin chassis with osis's body-spin replacing the inner-dex slot. 5 brackets ([DEX] [BOD] [BOD] [XBD] [DEL]) matches 5 ADD per stepping-ducking-osis double-[BOD] precedent.",
    ),
    (
        "pixie-ducking-whirl", 5, "whirl",
        "Pixie + ducking on whirl base. 5 ADD = pixie(+1) + ducking(+1) + whirl(3); JOB TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL].",
        "W3c pixie pilot 2026-05-27: phoenix/assassin chassis with whirl's IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-diving-mirage", 4, "mirage",
        "Pixie + diving on mirage base. 4 ADD = pixie(+1) + diving(+1) + mirage(2); JOB TOE > SAME IN [DEX] >> DIVE [BOD] >> OP IN [DEX] > OP TOE [DEL].",
        "W3c pixie pilot 2026-05-27: darkwalk chassis (TOE > SAME IN [DEX] >> DIVE [BOD] >> <base>) substituting mirage's OP IN dex + op-toe terminator. 4 brackets matches 4 ADD.",
    ),
    (
        "pixie-diving-pickup", 4, "pickup",
        "Pixie + diving on pickup base. 4 ADD = pixie(+1) + diving(+1) + pickup(2); JOB TOE > SAME IN [DEX] >> DIVE [BOD] >> OP IN [DEX] > SAME TOE [DEL].",
        "W3c pixie pilot 2026-05-27: darkwalk chassis with pickup's same-toe terminator (vs mirage's op-toe). 4 brackets matches 4 ADD.",
    ),
    (
        "pixie-diving-whirl", 5, "whirl",
        "Pixie + diving on whirl base. 5 ADD = pixie(+1) + diving(+1) + whirl(3); JOB TOE > SAME IN [DEX] >> DIVE [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL].",
        "W3c pixie pilot 2026-05-27: darkwalk chassis with whirl's IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD.",
    ),
]

W3C_CORRECTIONS = [
    ("pixie-ducking-osis", "notation", "PIXIE DUCKING OSIS",
     "W3c 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-ducking-osis", "operational_notation",
     "TOE > SAME IN [DEX] >> DUCK [BOD] >> (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W3c 2026-05-27: phoenix/assassin chassis with osis's body-spin in the inner-dex slot. Double [BOD] per stepping-ducking-osis precedent. 5 brackets matches 5 ADD."),

    ("pixie-ducking-whirl", "notation", "PIXIE DUCKING WHIRL",
     "W3c 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-ducking-whirl", "operational_notation",
     "TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL]",
     "W3c 2026-05-27: phoenix/assassin chassis with whirl's IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD."),

    ("pixie-diving-mirage", "notation", "PIXIE DIVING MIRAGE",
     "W3c 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-diving-mirage", "operational_notation",
     "TOE > SAME IN [DEX] >> DIVE [BOD] >> OP IN [DEX] > OP TOE [DEL]",
     "W3c 2026-05-27: darkwalk chassis with mirage's OP IN dex + op-toe terminator. 4 brackets matches 4 ADD."),

    ("pixie-diving-pickup", "notation", "PIXIE DIVING PICKUP",
     "W3c 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-diving-pickup", "operational_notation",
     "TOE > SAME IN [DEX] >> DIVE [BOD] >> OP IN [DEX] > SAME TOE [DEL]",
     "W3c 2026-05-27: darkwalk chassis with pickup's same-toe terminator. 4 brackets matches 4 ADD."),

    ("pixie-diving-whirl", "notation", "PIXIE DIVING WHIRL",
     "W3c 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-diving-whirl", "operational_notation",
     "TOE > SAME IN [DEX] >> DIVE [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL]",
     "W3c 2026-05-27: darkwalk chassis with whirl's IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, desc, note in W3C_ROWS:
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
        for slug, column, new_val, note in W3C_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
