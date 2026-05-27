"""
W9l — Apply 5 tapping-X compound promotions (open the tapping
modifier ecosystem on common bases).

Two existing tapping-X canonicals (tapping-illusion 3 ADD, tapping-whirl
4 ADD) give the chassis. Pattern: TOE entry + leading `OP OUT [DEX]`
event + base body, with the base's first dex direction preserved when
it doesn't duplicate the tapping prefix's OUT direction (flips to SAME
OUT when needed, per tapping-illusion precedent).

  tapping-mirage     3 ADD = tapping(+1) + mirage(2)
  tapping-osis       4 ADD = tapping(+1) + osis(3)
  tapping-pickup     3 ADD = tapping(+1) + pickup(2)
  tapping-butterfly  4 ADD = tapping(+1) + butterfly(3)
  tapping-clipper    3 ADD = tapping(+1) + clipper-stall(2)

Chassis derivations:
  - tapping-mirage follows tapping-whirl precedent (OP OUT + OP IN
    preserves base's IN direction; no flip).
  - tapping-butterfly follows tapping-illusion precedent (OP OUT →
    SAME OUT to avoid same-direction duplication; butterfly's
    `SAME or OP OUT` ambiguity collapses to SAME OUT).
  - tapping-osis adds OUT-dex prefix to osis's back-spin body.
  - tapping-pickup mirrors tapping-mirage chassis with same-toe terminal.
  - tapping-clipper shortest variant — OUT-dex + cross-body clipper.

Held for W9m+ batch (source-attested, chassis-derivable):
  - tapping-eggbeater (4 ADD)
  - tapping-drifter (4 ADD)
  - tapping-leg-over (3 ADD)
  - tapping-twirl (5 ADD)
  - tapping-mobius (6 ADD)
  - tapping-torque (5 ADD)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9L_ROWS = [
    (
        "tapping-mirage", 3, "mirage", "tapping",
        "Tapping modifier on mirage base. 3 ADD = tapping(+1) + mirage(2); JOB TOE > OP OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]. Chassis: tapping-whirl precedent (TOE entry + leading OP OUT [DEX]); mirage's IN-direction preserved on second dex.",
        "W9l tapping 2026-05-27: tapping-whirl chassis precedent + mirage's IN-dex preservation. 3 brackets matches 3 ADD.",
    ),
    (
        "tapping-osis", 4, "osis", "tapping",
        "Tapping modifier on osis base. 4 ADD = tapping(+1) + osis(3); JOB TOE > OP OUT [DEX] >> (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]. Chassis: tapping leading OUT-dex + osis's back/front-spin + cross-body clipper terminal.",
        "W9l tapping 2026-05-27: tapping chassis + osis chain. 4 brackets matches 4 ADD.",
    ),
    (
        "tapping-pickup", 3, "pickup", "tapping",
        "Tapping modifier on pickup base. 3 ADD = tapping(+1) + pickup(2); JOB TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]. Chassis: tapping leading OUT-dex + pickup's IN-dex + same-toe terminal.",
        "W9l tapping 2026-05-27: tapping chassis + pickup chain. 3 brackets matches 3 ADD.",
    ),
    (
        "tapping-butterfly", 4, "butterfly", "tapping",
        "Tapping modifier on butterfly base. 4 ADD = tapping(+1) + butterfly(3); JOB TOE > OP OUT [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]. Chassis: tapping-illusion direction-flip precedent (OP OUT → SAME OUT on second dex avoids same-direction duplication); butterfly's `SAME or OP OUT` collapses to SAME OUT branch.",
        "W9l tapping 2026-05-27: tapping-illusion direction-flip precedent on butterfly base. 4 brackets matches 4 ADD.",
    ),
    (
        "tapping-clipper", 3, "clipper-stall", "tapping",
        "Tapping modifier on clipper-stall base. 3 ADD = tapping(+1) + clipper-stall(2); JOB TOE > OP OUT [DEX] >> SAME CLIP [XBD] [DEL]. Chassis: tapping leading OUT-dex + cross-body clipper terminal.",
        "W9l tapping 2026-05-27: tapping chassis + clipper-stall terminal. 3 brackets matches 3 ADD.",
    ),
]

W9L_CORRECTIONS = [
    ("tapping-mirage", "notation", "TAPPING MIRAGE",
     "W9l 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-mirage", "operational_notation",
     "TOE > OP OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]",
     "W9l 2026-05-27: tapping-whirl chassis + mirage IN-dex preservation. 3 brackets matches 3 ADD."),

    ("tapping-osis", "notation", "TAPPING OSIS",
     "W9l 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-osis", "operational_notation",
     "TOE > OP OUT [DEX] >> (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]",
     "W9l 2026-05-27: tapping chassis + osis chain. 4 brackets matches 4 ADD."),

    ("tapping-pickup", "notation", "TAPPING PICKUP",
     "W9l 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-pickup", "operational_notation",
     "TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]",
     "W9l 2026-05-27: tapping chassis + pickup chain. 3 brackets matches 3 ADD."),

    ("tapping-butterfly", "notation", "TAPPING BUTTERFLY",
     "W9l 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-butterfly", "operational_notation",
     "TOE > OP OUT [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9l 2026-05-27: tapping-illusion direction-flip precedent on butterfly. 4 brackets matches 4 ADD."),

    ("tapping-clipper", "notation", "TAPPING CLIPPER",
     "W9l 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-clipper", "operational_notation",
     "TOE > OP OUT [DEX] >> SAME CLIP [XBD] [DEL]",
     "W9l 2026-05-27: tapping chassis + clipper-stall terminal. 3 brackets matches 3 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9L_ROWS:
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
        for slug, column, new_val, note in W9L_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
