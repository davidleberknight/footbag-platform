"""
W9i — Apply 5 multi-modifier doctrine-clean compound promotions
(Cat C / stack=3-4, chassis derives from W9h additions + canonicals).

Builds on the W9h paradox-symposium-X chassis precedent. All five rows
have direct mechanical derivation; no chassis design speculation.

  spinning-ducking-paradox-whirl              6 ADD = spinning(+1) + ducking(+1) + paradox(+1) + whirl(3)
  spinning-ducking-paradox-drifter            6 ADD = spinning(+1) + ducking(+1) + paradox(+1) + drifter(3)
  spinning-ducking-paradox-blender            7 ADD = spinning(+1) + ducking(+1) + paradox(+1) + blender(4)
  spinning-ducking-paradox-symposium-whirl    7 ADD = spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3)
  pixie-ducking-symposium-mirage              5 ADD = pixie(+1) + ducking(+1) + symposium(+1) + mirage(2)

Chassis derivations:
  - spinning-ducking-paradox-{whirl,drifter,blender}: W9h
    spinning-ducking-paradox-mirage chassis + swap mirage terminal for
    target base's terminator. For blender the base's own (back) SPIN
    [BOD] preserves in mid-chain (no double-spin collision; spin event
    accounting permits stacking).
  - spinning-ducking-paradox-symposium-whirl (stack=4): W9h
    spinning-paradox-symposium-whirl chassis + DUCK [BOD] insertion
    between spinning's back-spin and the symposium no-plant event.
  - pixie-ducking-symposium-mirage: assassin canonical
    (pixie-ducking-mirage at 4 ADD: `TOE > SAME IN [DEX] >> DUCK [BOD]
    >> OP IN [DEX] > OP TOE [DEL]`) + symposium [BOD] no-plant
    injection into the inner-most dex.

Source attestation: all 5 rows in triage corpus (footbagmoves /
passback per source column).

Out of scope:
  - atomic-ducking-double-legover (rotational atomic Wave-2 Q3)
  - gyro-ducking-symposium-torque (gyro+torque combination chassis
    not yet precedented)
  - spinning-ducking-paradox-symposium-mirage (0 triage hits — not
    source-attested; promotion would invent corpus)
  - fairy-spinning combinations (combination unusual; needs curator)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9I_ROWS = [
    (
        "spinning-ducking-paradox-whirl", 6, "whirl", "spinning|ducking|paradox",
        "Spinning + ducking + paradox on whirl base. 6 ADD = spinning(+1) + ducking(+1) + paradox(+1) + whirl(3); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]. Chassis: W9h spinning-ducking-paradox-mirage chassis with whirl's cross-body clipper terminal.",
        "W9i multi-modifier 2026-05-27: spinning-ducking-paradox-mirage chassis (W9h) + whirl cross-body clipper terminal. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-ducking-paradox-drifter", 6, "drifter", "spinning|ducking|paradox",
        "Spinning + ducking + paradox on drifter base. 6 ADD = spinning(+1) + ducking(+1) + paradox(+1) + drifter(3); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]. Chassis: W9h spinning-ducking-paradox-mirage chassis with drifter's same-side cross-body clipper terminal.",
        "W9i multi-modifier 2026-05-27: spinning-ducking-paradox-mirage chassis (W9h) + drifter same-side cross-body clipper terminal. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-ducking-paradox-blender", 7, "blender", "spinning|ducking|paradox",
        "Spinning + ducking + paradox on blender base. 7 ADD = spinning(+1) + ducking(+1) + paradox(+1) + blender(4); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Chassis: W9h spinning-ducking-paradox-mirage chassis + blender's back-spin + same-side cross-body clipper terminal. Triple-[BOD] sequence.",
        "W9i multi-modifier 2026-05-27: spinning-ducking-paradox chassis + blender's back-spin + same-side cross-body clipper. Triple-[BOD] front-of-chain. 7 brackets matches 7 ADD.",
    ),
    (
        "spinning-ducking-paradox-symposium-whirl", 7, "whirl", "spinning|ducking|paradox|symposium",
        "Spinning + ducking + paradox + symposium on whirl base. 7 ADD = spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]. Chassis: W9h spinning-paradox-symposium-whirl chassis + DUCK [BOD] insertion between spinning's back-spin and the symposium no-plant event.",
        "W9i multi-modifier 2026-05-27: spinning-paradox-symposium-whirl chassis (W9h) + ducking insertion. Stack=4. 7 brackets matches 7 ADD.",
    ),
    (
        "pixie-ducking-symposium-mirage", 5, "mirage", "pixie|ducking|symposium",
        "Pixie + ducking + symposium on mirage base. 5 ADD = pixie(+1) + ducking(+1) + symposium(+1) + mirage(2); JOB TOE > SAME IN [DEX] >> DUCK [BOD] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]. Chassis: assassin (pixie-ducking-mirage canonical at 4 ADD) + symposium [BOD] no-plant injection into the inner-most dex.",
        "W9i multi-modifier 2026-05-27: assassin chassis (pixie-ducking-mirage) + symposium [BOD] no-plant injection. 5 brackets matches 5 ADD.",
    ),
]

W9I_CORRECTIONS = [
    ("spinning-ducking-paradox-whirl", "notation", "SPINNING DUCKING PARADOX WHIRL",
     "W9i 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-paradox-whirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]",
     "W9i 2026-05-27: spinning-ducking-paradox-mirage chassis + whirl terminal. 6 brackets matches 6 ADD."),

    ("spinning-ducking-paradox-drifter", "notation", "SPINNING DUCKING PARADOX DRIFTER",
     "W9i 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-paradox-drifter", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]",
     "W9i 2026-05-27: spinning-ducking-paradox-mirage chassis + drifter terminal. 6 brackets matches 6 ADD."),

    ("spinning-ducking-paradox-blender", "notation", "SPINNING DUCKING PARADOX BLENDER",
     "W9i 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-paradox-blender", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W9i 2026-05-27: spinning-ducking-paradox chassis + blender chain. 7 brackets matches 7 ADD."),

    ("spinning-ducking-paradox-symposium-whirl", "notation", "SPINNING DUCKING PARADOX SYMPOSIUM WHIRL",
     "W9i 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-paradox-symposium-whirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W9i 2026-05-27: spinning-paradox-symposium-whirl chassis + ducking insertion. Stack=4. 7 brackets matches 7 ADD."),

    ("pixie-ducking-symposium-mirage", "notation", "PIXIE DUCKING SYMPOSIUM MIRAGE",
     "W9i 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-ducking-symposium-mirage", "operational_notation",
     "TOE > SAME IN [DEX] >> DUCK [BOD] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W9i 2026-05-27: assassin chassis + symposium [BOD] no-plant injection. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9I_ROWS:
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
        for slug, column, new_val, note in W9I_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
