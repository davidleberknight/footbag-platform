"""
W9g — Apply 1 ducking-paradox-torque promotion (blender-torque cohort).

Single-row strict Cat A batch — the blender-torque ecosystem is mostly
exhausted after prior waves. The remaining clean candidate is the
torque extension of the ducking-paradox-X family (ducking-paradox-mirage
and ducking-paradox-illusion already canonical at 4 ADD; adding torque
terminator yields 6 ADD).

  ducking-paradox-torque  6 ADD = ducking(+1) + paradox(+1) + torque(4)

Chassis: ducking-paradox-X chassis from ducking-paradox-mirage
(`CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]`) + swap mirage's
toe terminal for torque's back-spin + cross-body clipper terminal.
Source-attested by PassBack as "Ducking Pdx Torque"; slug normalized
to paradox per SKILL.md §B.3 conventions.

Out of scope for this batch:
  - ducking-paradox-symposium-whirl / spinning-paradox-symposium-whirl
    (Cat C stack_depth=3; doctrine-clean but deferred per user choice
    to keep W9g strict Cat A)
  - Folk-named -torque rows (torquescrew, fyro, pyro, leaning,
    neutron, sonic, twisted, double-torque, reverse-torque)
  - atomic-rotational -torque/-blender (Wave-2 Q3 X-Dex pending)
  - blurry-X rows (pt12-Q1 doctrine [D4])
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9G_ROWS = [
    (
        "ducking-paradox-torque", 6, "torque", "ducking|paradox",
        "Ducking + paradox on torque base. 6 ADD = ducking(+1) + paradox(+1) + torque(4); JOB CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Ducking-paradox chassis (from ducking-paradox-mirage) + torque's back-spin + cross-body clipper terminal. Source-named 'Ducking Pdx Torque' (PassBack); slug normalized to paradox per SKILL.md §B.3.",
        "W9g blender-torque 2026-05-27: ducking-paradox-mirage chassis + torque's back-spin + cross-body clipper terminal. 6 brackets matches 6 ADD.",
    ),
]

W9G_CORRECTIONS = [
    ("ducking-paradox-torque", "notation", "DUCKING PARADOX TORQUE",
     "W9g 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-torque", "operational_notation",
     "CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9g 2026-05-27: ducking-paradox chassis + torque chain. 6 brackets matches 6 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9G_ROWS:
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
        for slug, column, new_val, note in W9G_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
