"""
W9c — Apply 5 symposium-X compound promotions (Cat A pilot).

Pivots from stepping (essentially exhausted after W9a + W9b) to the
symposium ecosystem. All five base tricks are canonical in DB; no
folk-name collision; no doctrine block.

  symposium-illusion         3 ADD = symposium(+1) + illusion(2)
  symposium-butterfly        4 ADD = symposium(+1) + butterfly(3)
  symposium-double-leg-over  4 ADD = symposium(+1) + double-leg-over(3)
  symposium-barfly           5 ADD = symposium(+1) + barfly(4)
  symposium-twirl            5 ADD = symposium(+1) + twirl(4)

Sibling chassis: symposium "no plant while [BOD]" pattern (SKILL.md §B.3,
symposium no-plant + [BOD] rule). Symposium injects `(no plant while)`
+ `[BOD]` into the base's first dex, combining body and dex into a
single no-plant event. Matches symposium-mirage / symposium-eggbeater /
symposium-whirl / symposium-torque chassis convention.

Held for W9d (clean candidate, intentionally deferred): symposium-paradon
(5 ADD = symposium(+1) + paradon(4)).

Skipped from this batch:
  - symposium-bubba / symposium-baroque / symposium-marius /
    symposium-mobius (folk-named; need curator structure decision)
  - backside-symposium-* / directional symp-X variants (Cat B alias)
  - Multi-modifier 3+ stack rows (flailing- / miraging- / blazing- /
    sailing- / diving- / wonton- / slaying- / snapping- / zulu-
    symposium-X — most have non-canonical or doctrine-blocked outer
    modifiers; deferred until base modifiers ratified)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9C_ROWS = [
    (
        "symposium-illusion", 3, "illusion", "symposium",
        "Symposium modifier on illusion base. 3 ADD = symposium(+1) + illusion(2); JOB SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]. Symposium no-plant chassis: [BOD] injected into illusion's OUT-dex.",
        "W9c symposium 2026-05-27: symposium no-plant [BOD] chassis + illusion's OUT-dex + op-toe terminal. 3 brackets matches 3 ADD.",
    ),
    (
        "symposium-butterfly", 4, "butterfly", "symposium",
        "Symposium modifier on butterfly base. 4 ADD = symposium(+1) + butterfly(3); JOB SET > (no plant while) SAME or OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]. Symposium no-plant chassis: [BOD] injected into butterfly's OUT-dex.",
        "W9c symposium 2026-05-27: symposium no-plant [BOD] chassis + butterfly's OUT-dex + cross-body clipper terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "symposium-double-leg-over", 4, "double-leg-over", "symposium",
        "Symposium modifier on double-leg-over base. 4 ADD = symposium(+1) + double-leg-over(3); JOB SET > (no plant while) OP IN [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Symposium no-plant chassis: [BOD] injected into DLO's first IN-dex; second OUT-dex preserved.",
        "W9c symposium 2026-05-27: symposium no-plant [BOD] chassis + double-leg-over's two-dex chain + same-toe terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "symposium-barfly", 5, "barfly", "symposium",
        "Symposium modifier on barfly base. 5 ADD = symposium(+1) + barfly(4); JOB CLIP >> (no plant while) SAME OUT [BOD] [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]. Symposium no-plant chassis: [BOD] injected into barfly's first OUT-dex; second OUT-dex preserved.",
        "W9c symposium 2026-05-27: symposium no-plant [BOD] chassis + barfly's no-plant two-OUT-dex chain + cross-body clipper terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "symposium-twirl", 5, "twirl", "symposium",
        "Symposium modifier on twirl base. 5 ADD = symposium(+1) + twirl(4); JOB CLIP >> (no plant while) SAME FRONT SWIRL [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Symposium no-plant chassis: [BOD] injected into twirl's front-swirl dex; back-spin preserved.",
        "W9c symposium 2026-05-27: symposium no-plant [BOD] chassis + twirl's front-swirl + back-spin + cross-body clipper terminal. 5 brackets matches 5 ADD.",
    ),
]

W9C_CORRECTIONS = [
    ("symposium-illusion", "notation", "SYMPOSIUM ILLUSION",
     "W9c 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-illusion", "operational_notation",
     "SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W9c 2026-05-27: symposium no-plant [BOD] chassis + illusion chain. 3 brackets matches 3 ADD."),

    ("symposium-butterfly", "notation", "SYMPOSIUM BUTTERFLY",
     "W9c 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-butterfly", "operational_notation",
     "SET > (no plant while) SAME or OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W9c 2026-05-27: symposium no-plant [BOD] chassis + butterfly chain. 4 brackets matches 4 ADD."),

    ("symposium-double-leg-over", "notation", "SYMPOSIUM DOUBLE LEG OVER",
     "W9c 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-double-leg-over", "operational_notation",
     "SET > (no plant while) OP IN [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9c 2026-05-27: symposium no-plant [BOD] chassis + double-leg-over chain. 4 brackets matches 4 ADD."),

    ("symposium-barfly", "notation", "SYMPOSIUM BARFLY",
     "W9c 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-barfly", "operational_notation",
     "CLIP >> (no plant while) SAME OUT [BOD] [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]",
     "W9c 2026-05-27: symposium no-plant [BOD] chassis + barfly chain. 5 brackets matches 5 ADD."),

    ("symposium-twirl", "notation", "SYMPOSIUM TWIRL",
     "W9c 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-twirl", "operational_notation",
     "CLIP >> (no plant while) SAME FRONT SWIRL [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9c 2026-05-27: symposium no-plant [BOD] chassis + twirl chain. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9C_ROWS:
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
        for slug, column, new_val, note in W9C_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
