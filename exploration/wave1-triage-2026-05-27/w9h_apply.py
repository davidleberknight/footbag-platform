"""
W9h — Apply 5 paradox-symposium-X multi-modifier promotions
(Cat C doctrine-clean opener).

First Cat C batch of the W9 wave. Triage stack_depth=3 (four modifiers
each), but every chassis derives directly from canonical siblings
already in DB — meeting Class A "safe-mechanical sibling-derivable"
criteria despite the depth. No new chassis design; bracket-counts
verified.

  ducking-paradox-symposium-mirage     5 ADD = ducking(+1) + paradox(+1) + symposium(+1) + mirage(2)
  ducking-paradox-symposium-illusion   5 ADD = ducking(+1) + paradox(+1) + symposium(+1) + illusion(2)
  ducking-paradox-symposium-whirl      6 ADD = ducking(+1) + paradox(+1) + symposium(+1) + whirl(3)
  spinning-paradox-symposium-whirl     6 ADD = spinning(+1) + paradox(+1) + symposium(+1) + whirl(3)
  spinning-ducking-paradox-mirage      5 ADD = spinning(+1) + ducking(+1) + paradox(+1) + mirage(2)

Chassis derivations:
  - ducking-paradox-symposium-whirl = stepping-ducking-paradox-symposium-whirl
    (7 ADD canonical) with stepping prefix stripped → 6 ADD.
  - ducking-paradox-symposium-mirage = same chassis, swap whirl's
    cross-body clipper terminal for mirage's OP TOE terminal.
  - ducking-paradox-symposium-illusion = mirror with OP OUT direction
    (illusion's outward-dex character vs mirage's inward).
  - spinning-paradox-symposium-whirl = ducking-paradox-symposium-whirl
    chassis with ducking's DUCK [BOD] swapped for spinning's (back) SPIN [BOD].
  - spinning-ducking-paradox-mirage = spinning-paradox-mirage (4 ADD
    canonical) with DUCK [BOD] inserted between spin and paradox-dex.

Source attestation: all 5 rows present in triage corpus (footbagmoves).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9H_ROWS = [
    (
        "ducking-paradox-symposium-mirage", 5, "mirage", "ducking|paradox|symposium",
        "Ducking + paradox + symposium on mirage base. 5 ADD = ducking(+1) + paradox(+1) + symposium(+1) + mirage(2); JOB CLIP > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP TOE [DEL]. Chassis: stepping-ducking-paradox-symposium-whirl canonical (strip stepping; swap whirl terminal for mirage's OP TOE).",
        "W9h paradox-symposium 2026-05-27: stepping-ducking-paradox-symposium-whirl chassis (strip stepping) + mirage terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "ducking-paradox-symposium-illusion", 5, "illusion", "ducking|paradox|symposium",
        "Ducking + paradox + symposium on illusion base. 5 ADD = ducking(+1) + paradox(+1) + symposium(+1) + illusion(2); JOB CLIP > DUCK [BOD] > (no plant while) OP OUT [PDX] [BOD] [DEX] > OP TOE [DEL]. Chassis: ducking-paradox-symposium-mirage with OP IN flipped to OP OUT (illusion's outward-dex direction).",
        "W9h paradox-symposium 2026-05-27: ducking-paradox-symposium chassis + illusion's OUT direction + OP TOE terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "ducking-paradox-symposium-whirl", 6, "whirl", "ducking|paradox|symposium",
        "Ducking + paradox + symposium on whirl base. 6 ADD = ducking(+1) + paradox(+1) + symposium(+1) + whirl(3); JOB CLIP > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]. Chassis: stepping-ducking-paradox-symposium-whirl canonical (strip leading stepping [DEX]).",
        "W9h paradox-symposium 2026-05-27: stepping-ducking-paradox-symposium-whirl canonical chassis with stepping prefix stripped. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-paradox-symposium-whirl", 6, "whirl", "spinning|paradox|symposium",
        "Spinning + paradox + symposium on whirl base. 6 ADD = spinning(+1) + paradox(+1) + symposium(+1) + whirl(3); JOB CLIP > (back) SPIN [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]. Chassis: ducking-paradox-symposium-whirl with DUCK [BOD] swapped for (back) SPIN [BOD].",
        "W9h paradox-symposium 2026-05-27: ducking-paradox-symposium-whirl chassis with spinning's back-spin replacing duck. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-ducking-paradox-mirage", 5, "mirage", "spinning|ducking|paradox",
        "Spinning + ducking + paradox on mirage base. 5 ADD = spinning(+1) + ducking(+1) + paradox(+1) + mirage(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]. Chassis: spinning-paradox-mirage canonical (4 ADD) with DUCK [BOD] inserted between spin and paradox-dex.",
        "W9h paradox-symposium 2026-05-27: spinning-paradox-mirage chassis + ducking insertion between back-spin and paradox-dex. 5 brackets matches 5 ADD.",
    ),
]

W9H_CORRECTIONS = [
    ("ducking-paradox-symposium-mirage", "notation", "DUCKING PARADOX SYMPOSIUM MIRAGE",
     "W9h 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-symposium-mirage", "operational_notation",
     "CLIP > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP TOE [DEL]",
     "W9h 2026-05-27: stepping-ducking-paradox-symposium-whirl chassis (strip stepping) + mirage terminal. 5 brackets matches 5 ADD."),

    ("ducking-paradox-symposium-illusion", "notation", "DUCKING PARADOX SYMPOSIUM ILLUSION",
     "W9h 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-symposium-illusion", "operational_notation",
     "CLIP > DUCK [BOD] > (no plant while) OP OUT [PDX] [BOD] [DEX] > OP TOE [DEL]",
     "W9h 2026-05-27: ducking-paradox-symposium chassis with OP OUT direction. 5 brackets matches 5 ADD."),

    ("ducking-paradox-symposium-whirl", "notation", "DUCKING PARADOX SYMPOSIUM WHIRL",
     "W9h 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-symposium-whirl", "operational_notation",
     "CLIP > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W9h 2026-05-27: stepping-ducking-paradox-symposium-whirl with stepping stripped. 6 brackets matches 6 ADD."),

    ("spinning-paradox-symposium-whirl", "notation", "SPINNING PARADOX SYMPOSIUM WHIRL",
     "W9h 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-paradox-symposium-whirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W9h 2026-05-27: spinning swap for ducking in paradox-symposium-whirl chassis. 6 brackets matches 6 ADD."),

    ("spinning-ducking-paradox-mirage", "notation", "SPINNING DUCKING PARADOX MIRAGE",
     "W9h 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-paradox-mirage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]",
     "W9h 2026-05-27: spinning-paradox-mirage + ducking insertion. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9H_ROWS:
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
        for slug, column, new_val, note in W9H_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
