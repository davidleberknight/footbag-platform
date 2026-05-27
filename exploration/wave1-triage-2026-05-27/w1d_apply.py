"""
W1d — Apply 8 quantum core compound promotions.

Sibling chassis: quantum-mirage / quantum-illusion / quantum-whirl / quantum-drifter.
Pattern: TOE > OP IN [DEX] > <base-trick's dex(es)+terminal>

The quantum modifier is registered as a +1 set modifier in
freestyle_trick_modifiers (unlike inspinning which is unregistered),
so modifier-link wiring would in principle work — but existing quantum-X
canonical rows leave modifier_links blank by convention. Matching that.

DEFERRED from the original W1d candidate list:
  - quantum-eclipse  (eclipse=3 ADD in DB; quantum-eclipse = 4 ADD;
    eclipse's mid-air structure makes notation derivation non-trivial)
  - quantum-guay  (guay=2 ADD; quantum-guay = 3 ADD; source-adds unverified)
  - quantum-reverse-guay  (reverse-guay not yet canonical)
  - quantum-X (same side) variants — folk-name qualifier, treated as
    aliases by classifier B but promoted with bare slug for now
    (e.g. "Quantum Pickup (same side)" -> slug quantum-pickup)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W1D_ROWS = [
    (
        "quantum-osis", 4, "osis",
        "Quantum modifier on osis base. 4 ADD = quantum(+1) + osis(3); JOB TOE > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL].",
        "W1d quantum core 2026-05-27: sibling-derived from quantum-mirage / quantum-whirl + osis base (which carries its own body-spin). 4 brackets ([DEX] [BOD] [XBD] [DEL]) matches asserted 4 ADD.",
    ),
    (
        "quantum-pickup", 3, "pickup",
        "Quantum modifier on pickup base. 3 ADD = quantum(+1) + pickup(2); JOB TOE > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]. Source-named 'Quantum Pickup (same side)'; SS qualifier indicates pickup's natural OP IN dex direction.",
        "W1d quantum core 2026-05-27: sibling-derived from quantum-mirage pattern + pickup terminal (SAME TOE vs mirage's OP TOE).",
    ),
    (
        "quantum-legover", 3, "legover",
        "Quantum modifier on legover base. 3 ADD = quantum(+1) + legover(2); JOB TOE > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W1d quantum core 2026-05-27: sibling-derived from quantum-illusion pattern (OP OUT dex) + legover terminal (SAME TOE vs illusion's OP TOE).",
    ),
    (
        "quantum-butterfly", 4, "butterfly",
        "Quantum modifier on butterfly base. 4 ADD = quantum(+1) + butterfly(3); JOB TOE > OP IN [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]. Source-named 'Quantum Butterfly (same side)'; SS qualifier resolves butterfly's SAME-or-OP ambiguity to SAME OUT.",
        "W1d quantum core 2026-05-27: sibling-derived from quantum-whirl pattern with butterfly's SAME OUT dex direction. 4 brackets matches asserted 4 ADD.",
    ),
    (
        "quantum-eggbeater", 4, "eggbeater",
        "Quantum modifier on eggbeater base. 4 ADD = quantum(+1) + eggbeater(3); JOB TOE > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W1d quantum core 2026-05-27: quantum dex prefixed to eggbeater's two-OUT-dex chassis. 4 brackets ([DEX] [DEX] [DEX] [DEL]) matches asserted 4 ADD.",
    ),
    (
        "quantum-blender", 5, "blender",
        "Quantum modifier on blender base. 5 ADD = quantum(+1) + blender(4); JOB TOE > OP IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL].",
        "W1d quantum core 2026-05-27: quantum dex prefixed to blender's IN-dex + back-spin + same-clip chassis. 5 brackets matches asserted 5 ADD.",
    ),
    (
        "quantum-torque", 5, "torque",
        "Quantum modifier on torque base. 5 ADD = quantum(+1) + torque(4); JOB TOE > OP IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL].",
        "W1d quantum core 2026-05-27: quantum dex prefixed to torque chassis (same dex+spin as blender but OP CLIP terminal instead of SAME CLIP). 5 brackets matches asserted 5 ADD.",
    ),
    (
        "quantum-double-over-down", 5, "double-over-down",
        "Quantum modifier on double-over-down base. 5 ADD = quantum(+1) + double-over-down(4); JOB TOE > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W1d quantum core 2026-05-27: quantum dex prefixed to double-over-down's two-OUT-dex + cross-body-clipper chassis. 5 brackets matches asserted 5 ADD.",
    ),
]

W1D_CORRECTIONS = [
    ("quantum-osis", "notation", "QUANTUM OSIS",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-osis", "operational_notation",
     "TOE > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W1d 2026-05-27: sibling-derived from quantum-whirl pattern + osis body-spin. 4 brackets matches 4 ADD."),

    ("quantum-pickup", "notation", "QUANTUM PICKUP",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-pickup", "operational_notation",
     "TOE > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]",
     "W1d 2026-05-27: sibling-derived from quantum-mirage pattern + pickup terminal. 3 brackets matches 3 ADD."),

    ("quantum-legover", "notation", "QUANTUM LEGOVER",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-legover", "operational_notation",
     "TOE > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W1d 2026-05-27: sibling-derived from quantum-illusion + legover terminal. 3 brackets matches 3 ADD."),

    ("quantum-butterfly", "notation", "QUANTUM BUTTERFLY",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-butterfly", "operational_notation",
     "TOE > OP IN [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W1d 2026-05-27: sibling-derived from quantum-whirl + butterfly's SAME OUT direction. 4 brackets matches 4 ADD."),

    ("quantum-eggbeater", "notation", "QUANTUM EGGBEATER",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-eggbeater", "operational_notation",
     "TOE > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W1d 2026-05-27: quantum dex prefixed to eggbeater's two-OUT-dex chassis. 4 brackets matches 4 ADD."),

    ("quantum-blender", "notation", "QUANTUM BLENDER",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-blender", "operational_notation",
     "TOE > OP IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W1d 2026-05-27: quantum dex prefixed to blender chassis (same-clip terminal). 5 brackets matches 5 ADD."),

    ("quantum-torque", "notation", "QUANTUM TORQUE",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-torque", "operational_notation",
     "TOE > OP IN [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W1d 2026-05-27: quantum dex prefixed to torque chassis (op-clip terminal). 5 brackets matches 5 ADD."),

    ("quantum-double-over-down", "notation", "QUANTUM DOUBLE OVER DOWN",
     "W1d 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-double-over-down", "operational_notation",
     "TOE > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W1d 2026-05-27: quantum dex prefixed to double-over-down chassis. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, desc, note in W1D_ROWS:
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
        for slug, column, new_val, note in W1D_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
