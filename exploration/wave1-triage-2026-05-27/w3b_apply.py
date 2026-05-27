"""
W3b — Apply 5 more pixie compound promotions.

Sibling chassis:
  - pixie-symposium-mirage      (TOE > SAME IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL])
    → pixie-symposium-eggbeater + pixie-symposium-illusion
  - pixie-ducking-pickup/legover (TOE > SAME IN [DEX] >> DUCK [BOD] >> <base dex+term>)
    → pixie-ducking-clipper + pixie-ducking-illusion
  - direct stack on double-leg-over base
    → pixie-double-leg-over

Deferred from this batch (folk-name overlaps with existing canonical):
  - pixie-ducking-butterfly  = phoenix (5 ADD canonical; SE-chain reading)
  - pixie-ducking-mirage     = assassin (4 ADD canonical; SE-chain reading)
  - pixie-diving-butterfly   ≈ darkwalk (5 ADD canonical; Stanford
                                "Darkwalk: Pixie Diving near Butterfly")
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W3B_ROWS = [
    (
        "pixie-symposium-eggbeater", 5, "eggbeater",
        "Pixie + symposium on eggbeater base. 5 ADD = pixie(+1) + symposium(+1) + eggbeater(3); JOB TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W3b pixie pilot 2026-05-27: pixie-symposium-mirage chassis with eggbeater's two-OP-OUT-dex chain + same-toe terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-symposium-illusion", 4, "illusion",
        "Pixie + symposium on illusion base. 4 ADD = pixie(+1) + symposium(+1) + illusion(2); JOB TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL].",
        "W3b pixie pilot 2026-05-27: pixie-symposium-mirage chassis with illusion's OP OUT dex direction + op-toe terminator (vs mirage's OP IN). 4 brackets matches 4 ADD.",
    ),
    (
        "pixie-double-leg-over", 4, "double-leg-over",
        "Pixie modifier on double-leg-over base. 4 ADD = pixie(+1) + double-leg-over(3); JOB TOE > SAME IN [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W3b pixie pilot 2026-05-27: pixie set + double-leg-over chassis (OP IN dex + OP OUT dex + same-toe terminator). 4 brackets ([DEX] [DEX] [DEX] [DEL]) matches 4 ADD.",
    ),
    (
        "pixie-ducking-clipper", 4, "clipper-stall",
        "Pixie + ducking on clipper-stall base. 4 ADD = pixie(+1) + ducking(+1) + clipper-stall(2); JOB TOE > SAME IN [DEX] >> DUCK [BOD] >> OP CLIP [XBD] [DEL].",
        "W3b pixie pilot 2026-05-27: phoenix/assassin chassis with clipper-stall terminal (no inner dex; ducking goes directly to cross-body clipper). 4 brackets ([DEX] [BOD] [XBD] [DEL]) matches 4 ADD.",
    ),
    (
        "pixie-ducking-illusion", 4, "illusion",
        "Pixie + ducking on illusion base. 4 ADD = pixie(+1) + ducking(+1) + illusion(2); JOB TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP TOE [DEL].",
        "W3b pixie pilot 2026-05-27: phoenix/assassin chassis substituting illusion's OP OUT dex + op-toe terminator. 4 brackets matches 4 ADD.",
    ),
]

W3B_CORRECTIONS = [
    ("pixie-symposium-eggbeater", "notation", "PIXIE SYMPOSIUM EGGBEATER",
     "W3b 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-symposium-eggbeater", "operational_notation",
     "TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W3b 2026-05-27: pixie-symposium-mirage chassis + eggbeater's two-OP-OUT-dex chain. 5 brackets matches 5 ADD."),

    ("pixie-symposium-illusion", "notation", "PIXIE SYMPOSIUM ILLUSION",
     "W3b 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-symposium-illusion", "operational_notation",
     "TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W3b 2026-05-27: pixie-symposium-mirage chassis with illusion's OP OUT dex + op-toe terminator. 4 brackets matches 4 ADD."),

    ("pixie-double-leg-over", "notation", "PIXIE DOUBLE LEG OVER",
     "W3b 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-double-leg-over", "operational_notation",
     "TOE > SAME IN [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W3b 2026-05-27: pixie set + double-leg-over chassis. 4 brackets matches 4 ADD."),

    ("pixie-ducking-clipper", "notation", "PIXIE DUCKING CLIPPER",
     "W3b 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-ducking-clipper", "operational_notation",
     "TOE > SAME IN [DEX] >> DUCK [BOD] >> OP CLIP [XBD] [DEL]",
     "W3b 2026-05-27: phoenix/assassin chassis with clipper-stall terminal. 4 brackets matches 4 ADD."),

    ("pixie-ducking-illusion", "notation", "PIXIE DUCKING ILLUSION",
     "W3b 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-ducking-illusion", "operational_notation",
     "TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP TOE [DEL]",
     "W3b 2026-05-27: phoenix/assassin chassis with illusion's OP OUT dex + op-toe terminator. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, desc, note in W3B_ROWS:
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
        for slug, column, new_val, note in W3B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
