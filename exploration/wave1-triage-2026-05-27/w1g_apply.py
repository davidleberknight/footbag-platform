"""
W1g — Apply 4 quantum multi-modifier compound promotions.

Multi-modifier stacks where quantum pairs with another canonical modifier:

  quantum-symposium-whirl   = quantum(+1) + symposium(+1) + whirl(3) = 5 ADD
  quantum-ducking-whirl     = quantum(+1) + ducking(+1) + whirl(3)   = 5 ADD
  quantum-gyro-mirage       = quantum(+1) + gyro(+1) + mirage(2)     = 4 ADD
  pixie-quantum-butterfly   = pixie(+1) + quantum(+1) + butterfly(3) = 5 ADD

Sibling chassis: quantum-symposium-mirage (already canonical at 4 ADD) for
the symposium-stacking pattern; quantum-whirl + ducking-whirl for ducking-
stacking; quantum-mirage + gyro-mirage for gyro-stacking; dimwalk (pixie-
butterfly) for the pixie-set chassis.

modifier_links left blank per quantum-symposium-mirage convention.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W1G_ROWS = [
    (
        "quantum-symposium-whirl", 5, "whirl",
        "Quantum + symposium on whirl base. 5 ADD = quantum(+1) + symposium(+1) + whirl(3); JOB TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL].",
        "W1g quantum multi-modifier 2026-05-27: sibling-derived from quantum-symposium-mirage chassis (TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]) with whirl's OP CLIP [XBD] [DEL] terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "quantum-ducking-whirl", 5, "whirl",
        "Quantum + ducking on whirl base. 5 ADD = quantum(+1) + ducking(+1) + whirl(3); JOB TOE > OP IN [DEX] > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL].",
        "W1g quantum multi-modifier 2026-05-27: sibling-derived from quantum-whirl (TOE > OP IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]) + ducking-whirl's DUCK [BOD] insertion between the two dexes. 5 brackets matches 5 ADD.",
    ),
    (
        "quantum-gyro-mirage", 4, "mirage",
        "Quantum + gyro on mirage base. 4 ADD = quantum(+1) + gyro(+1) + mirage(2); JOB TOE > OP IN [DEX] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL].",
        "W1g quantum multi-modifier 2026-05-27: sibling-derived from quantum-mirage chassis + gyro-mirage's (back) SPIN [BOD] insertion between the quantum dex and the mirage dex. 4 brackets matches 4 ADD.",
    ),
    (
        "pixie-quantum-butterfly", 5, "butterfly",
        "Pixie + quantum on butterfly base. 5 ADD = pixie(+1) + quantum(+1) + butterfly(3); JOB TOE > SAME IN [DEX] > OP IN [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W1g quantum multi-modifier 2026-05-27: pixie set (TOE > SAME IN [DEX]) + quantum dex (OP IN [DEX]) + butterfly chassis (SAME OUT [DEX] > OP CLIP [XBD] [DEL]). Holden treats 'pixie-quantum' as the Frantic set system; this trick is its butterfly-terminator instance. 5 brackets matches 5 ADD.",
    ),
]

W1G_CORRECTIONS = [
    ("quantum-symposium-whirl", "notation", "QUANTUM SYMPOSIUM WHIRL",
     "W1g 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-symposium-whirl", "operational_notation",
     "TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W1g 2026-05-27: quantum-symposium-mirage chassis + whirl's OP CLIP terminator. 5 brackets matches 5 ADD."),

    ("quantum-ducking-whirl", "notation", "QUANTUM DUCKING WHIRL",
     "W1g 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-ducking-whirl", "operational_notation",
     "TOE > OP IN [DEX] > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]",
     "W1g 2026-05-27: quantum-whirl chassis with ducking DUCK [BOD] inserted between the two dexes. 5 brackets matches 5 ADD."),

    ("quantum-gyro-mirage", "notation", "QUANTUM GYRO MIRAGE",
     "W1g 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-gyro-mirage", "operational_notation",
     "TOE > OP IN [DEX] > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]",
     "W1g 2026-05-27: quantum-mirage chassis with gyro (back) SPIN [BOD] inserted between dexes. 4 brackets matches 4 ADD."),

    ("pixie-quantum-butterfly", "notation", "PIXIE QUANTUM BUTTERFLY",
     "W1g 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-quantum-butterfly", "operational_notation",
     "TOE > SAME IN [DEX] > OP IN [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W1g 2026-05-27: pixie set leading + quantum dex + butterfly terminal. Holden 'Frantic (pixie-quantum)' set system underlies the chassis. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, desc, note in W1G_ROWS:
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
        for slug, column, new_val, note in W1G_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
