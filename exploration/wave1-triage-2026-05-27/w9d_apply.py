"""
W9d — Apply 4 mixed-ecosystem Cat A compound promotions.

Closes the symposium ecosystem (the held-back symposium-paradon row from
W9c) and opens the paradox ecosystem with 3 clean derivable rows. After
filtering folk-aliased / non-corpus-attested / chassis-speculative
candidates, the Cat A surface is 4 rows. Per SKILL.md "ship Class A
only" doctrine, a 4-row batch ships rather than padding with uncertain
rows.

  symposium-paradon  5 ADD = symposium(+1) + paradon(4)
  paradox-eggbeater  4 ADD = paradox(+1) + eggbeater(3)
  paradox-flail      4 ADD = paradox(+1) + flail(3)
  paradox-flurry     5 ADD = paradox(+1) + flurry(4)

Chassis:
  - symposium-paradon: symposium no-plant [BOD] chassis (SKILL.md §B.3) —
    [BOD] injected into paradon's first OUT-dex.
  - paradox-X: paradox direction-flip convention (OP→SAME on first dex
    per paradox-illusion / barrage / DLO / blizzard / whirl / ripwalk
    pattern); SET→CLIP entry shift where applicable. For paradox-eggbeater
    the TOE >> entry is preserved (trick-specific entry; changing it
    changes the trick). Paradox [PDX] bracket added to first dex.

Skipped from this batch:
  - paradox-grifter (grifter base not in DB)
  - surging-paradox-mirage (surging modifier not registered)
  - splicing-paradox-mirage / zulu-paradox-* / bubba-paradox-flail
    (outer modifiers not registered)
  - paradox-merlin / paradox-toxic / paradox-delusion / paradox-dragster /
    paradox-swifter (folk-named; curator-pending)
  - whirling-osis (folk-aliased to existing canonical `blender`)
  - tapping-torque / blazing-torque (insufficient sibling chassis)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9D_ROWS = [
    (
        "symposium-paradon", 5, "paradon", "symposium",
        "Symposium modifier on paradon base. 5 ADD = symposium(+1) + paradon(4); JOB TOE > (no plant while) OP OUT [BOD] [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]. Symposium no-plant chassis: [BOD] injected into paradon's first OUT-dex; second OUT-dex + cross-body clipper terminal preserved.",
        "W9d symposium 2026-05-27: symposium no-plant [BOD] chassis + paradon's two-OUT-dex chain + cross-body clipper terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "paradox-eggbeater", 4, "eggbeater", "paradox",
        "Paradox modifier on eggbeater base. 4 ADD = paradox(+1) + eggbeater(3); JOB TOE >> SAME OUT [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Paradox chassis: [PDX] added to first dex; OP→SAME direction flip on first dex; eggbeater's TOE >> entry preserved (trick-specific).",
        "W9d paradox 2026-05-27: paradox direction-flip chassis on eggbeater. TOE >> entry preserved per eggbeater convention. 4 brackets matches 4 ADD.",
    ),
    (
        "paradox-flail", 4, "flail", "paradox",
        "Paradox modifier on flail base. 4 ADD = paradox(+1) + flail(3); JOB CLIP > (no plant while) SAME OUT [PDX] [BOD] [DEX] > OP TOE [DEL]. Paradox chassis: [PDX] added to flail's no-plant body-dex; OP→SAME flip; SET→CLIP entry shift. Bracket order [PDX] [BOD] [DEX] mirrors paradox-symposium-mirage convention.",
        "W9d paradox 2026-05-27: paradox direction-flip + entry-flip chassis on flail. [PDX] [BOD] [DEX] ordering per paradox-symposium-mirage. 4 brackets matches 4 ADD.",
    ),
    (
        "paradox-flurry", 5, "flurry", "paradox",
        "Paradox modifier on flurry base. 5 ADD = paradox(+1) + flurry(4); JOB CLIP > SAME IN [PDX] [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]. Paradox chassis: [PDX] added to flurry's first dex; OP→SAME flip on first dex; flurry's second IN-dex and no-plant OUT-dex preserved.",
        "W9d paradox 2026-05-27: paradox direction-flip chassis on flurry's three-dex chain + same-toe terminal. 5 brackets matches 5 ADD.",
    ),
]

W9D_CORRECTIONS = [
    ("symposium-paradon", "notation", "SYMPOSIUM PARADON",
     "W9d 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-paradon", "operational_notation",
     "TOE > (no plant while) OP OUT [BOD] [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9d 2026-05-27: symposium no-plant [BOD] chassis + paradon chain. 5 brackets matches 5 ADD."),

    ("paradox-eggbeater", "notation", "PARADOX EGGBEATER",
     "W9d 2026-05-27: JOB per mechanical uppercase rule."),
    ("paradox-eggbeater", "operational_notation",
     "TOE >> SAME OUT [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9d 2026-05-27: paradox direction-flip chassis on eggbeater. 4 brackets matches 4 ADD."),

    ("paradox-flail", "notation", "PARADOX FLAIL",
     "W9d 2026-05-27: JOB per mechanical uppercase rule."),
    ("paradox-flail", "operational_notation",
     "CLIP > (no plant while) SAME OUT [PDX] [BOD] [DEX] > OP TOE [DEL]",
     "W9d 2026-05-27: paradox direction-flip + entry-flip chassis on flail. 4 brackets matches 4 ADD."),

    ("paradox-flurry", "notation", "PARADOX FLURRY",
     "W9d 2026-05-27: JOB per mechanical uppercase rule."),
    ("paradox-flurry", "operational_notation",
     "CLIP > SAME IN [PDX] [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]",
     "W9d 2026-05-27: paradox direction-flip chassis on flurry chain. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9D_ROWS:
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
        for slug, column, new_val, note in W9D_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
