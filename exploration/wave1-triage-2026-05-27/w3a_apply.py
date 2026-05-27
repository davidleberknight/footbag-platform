"""
W3a — Apply 5 clean pixie compound promotions.

Pilot batch for "Pixie complete" (W3). The 101 pixie Cat-A triage candidates
include heavy folk-alias overlap (e.g. pixie-butterfly = dimwalk, pixie-mirage
= smear, pixie-dod = pixie-double-over-down — all already canonical under
the folk name). W3a lands the 5 unambiguous new structural compounds where:

  - the slug does NOT already exist canonically (under folk name or otherwise)
  - the base trick is canonical
  - the math closes mechanically
  - notation is sibling-derivable from an established pixie-X chassis

Sibling chassis: pixie-osis / pixie-whirl / pixie-eggbeater pattern, which
all start `TOE > SAME IN [DEX] > ...` and append the base's chain.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W3A_ROWS = [
    (
        "pixie-flail", 4, "flail",
        "Pixie modifier on flail base. 4 ADD = pixie(+1) + flail(3); JOB TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL].",
        "W3a pixie pilot 2026-05-27: pixie set + flail's no-plant body event + OP OUT dex + toe terminator. 4 brackets ([DEX] [BOD] [DEX] [DEL]) matches 4 ADD.",
    ),
    (
        "pixie-torque", 5, "torque",
        "Pixie modifier on torque base. 5 ADD = pixie(+1) + torque(4); JOB TOE > SAME IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL].",
        "W3a pixie pilot 2026-05-27: pixie set + torque's OP IN dex + back-spin + op-clip terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-blender", 5, "blender",
        "Pixie modifier on blender base. 5 ADD = pixie(+1) + blender(4); JOB TOE > SAME IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL].",
        "W3a pixie pilot 2026-05-27: pixie set + blender chassis (same as torque chassis but SAME CLIP terminal vs OP CLIP). 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-barrage", 4, "barrage",
        "Pixie modifier on barrage base. 4 ADD = pixie(+1) + barrage(3); JOB TOE > SAME IN [DEX] > OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]. Three-dex compound — pixie's single SAME IN dex followed by barrage's double-dex (OP IN, SAME IN).",
        "W3a pixie pilot 2026-05-27: pixie set + barrage's OP-IN/SAME-IN double-dex + toe terminator. 4 brackets ([DEX] [DEX] [DEX] [DEL]) matches 4 ADD. Distinct from Terraging (= Double Pixie = TOE > SAME IN [DEX] > SAME IN [DEX] > ...; barrage has OP IN then SAME IN, not SAME IN twice).",
    ),
    (
        "pixie-symposium-whirl", 5, "whirl",
        "Pixie + symposium on whirl base. 5 ADD = pixie(+1) + symposium(+1) + whirl(3); JOB TOE > SAME IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL].",
        "W3a pixie pilot 2026-05-27: pixie set + symposium-whirl chassis (no-plant body event + OP IN dex + cross-body clipper). 5 brackets matches 5 ADD.",
    ),
]

W3A_CORRECTIONS = [
    ("pixie-flail", "notation", "PIXIE FLAIL",
     "W3a 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-flail", "operational_notation",
     "TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W3a 2026-05-27: pixie chassis + flail's no-plant body event + OP OUT dex + toe terminator. 4 brackets matches 4 ADD."),

    ("pixie-torque", "notation", "PIXIE TORQUE",
     "W3a 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-torque", "operational_notation",
     "TOE > SAME IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W3a 2026-05-27: pixie chassis + torque's IN-dex + back-spin + op-clip terminal. 5 brackets matches 5 ADD."),

    ("pixie-blender", "notation", "PIXIE BLENDER",
     "W3a 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-blender", "operational_notation",
     "TOE > SAME IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W3a 2026-05-27: pixie chassis + blender chassis (SAME CLIP terminal vs torque's OP CLIP). 5 brackets matches 5 ADD."),

    ("pixie-barrage", "notation", "PIXIE BARRAGE",
     "W3a 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-barrage", "operational_notation",
     "TOE > SAME IN [DEX] > OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]",
     "W3a 2026-05-27: pixie chassis + barrage's OP-IN/SAME-IN double-dex. 4 brackets matches 4 ADD. Distinct from Terraging (Double Pixie) — barrage's first dex is OP IN, not SAME IN."),

    ("pixie-symposium-whirl", "notation", "PIXIE SYMPOSIUM WHIRL",
     "W3a 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-symposium-whirl", "operational_notation",
     "TOE > SAME IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W3a 2026-05-27: pixie chassis + symposium-whirl's no-plant body event + IN-dex + cross-body clipper terminal. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, desc, note in W3A_ROWS:
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
        for slug, column, new_val, note in W3A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
