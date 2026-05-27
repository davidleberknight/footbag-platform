"""
W8a — Apply 5 clean ducking compound promotions (pilot batch).

Pilot batch for Wave 8 (Ducking remaining), doctrine-clean only. Of the
74 ducking Cat-A triage rows:
  - 13 already canonical (ducking-pickup, ducking-legover, ducking-mirage,
    ducking-illusion, ducking butterfly/clipper/osis/whirl,
    ducking-paradox-illusion/mirage, plus W3-W6 multi-modifier ducking-X)
  - ~25 done in earlier waves under different ecosystems (pixie-ducking-X
    via W3, fairy-ducking-X via W5, spinning-ducking-X via W6, etc.)
  - ~10 folk-aliased to canonical (phoenix = pixie-ducking-butterfly,
    assassin = pixie-ducking-mirage, guillotine = fairy-ducking-mirage,
    ego = atomic-ducking-whirl)
  - ~10 Cat-B alias variants (Pdx / PS shorthand, "(Rasmus)(Skull Smasher)"
    parentheticals, far-X directionals, etc.)
  - ~5 base-blocked (reverse-guay, superfly, dada-curve-rake folk names)
  - ~10 remaining promotable structural

W8a lands 5 unambiguous ducking + simple-base rows:

  ducking-drifter            4 ADD = ducking(+1) + drifter(3)
  ducking-toe-stall          2 ADD = ducking(+1) + toe-stall(1)
  ducking-guay               3 ADD = ducking(+1) + guay(2)
  ducking-symposium-mirage   4 ADD = ducking(+1) + symposium(+1) + mirage(2)
  ducking-double-leg-over    4 ADD = ducking(+1) + double-leg-over(3)

Sibling chassis: ducking-mirage (TOE > DUCK [BOD] > OP IN [DEX] > OP TOE
[DEL]) extended with base trick's dex+terminal. Ducking is +1 universal
(no rotational/non-rotational doctrine question; per modifier table).

No doctrine contamination per user constraint (no blurry/furious/nuclear/
illusioning/shooting/weaving/rooted/pogo tokens in any W8a slug).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W8A_ROWS = [
    (
        "ducking-drifter", 4, "drifter", "",
        "Ducking modifier on drifter base. 4 ADD = ducking(+1) + drifter(3); JOB TOE > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL].",
        "W8a ducking 2026-05-27: ducking-mirage chassis pattern + drifter's IN-dex + same-clip terminator. 4 brackets matches 4 ADD.",
    ),
    (
        "ducking-toe-stall", 2, "toe-stall", "",
        "Ducking modifier on toe-stall base. 2 ADD = ducking(+1) + toe-stall(1); JOB TOE > DUCK [BOD] > OP TOE [DEL]. Minimal ducking compound.",
        "W8a ducking 2026-05-27: ducking body dip + op-toe terminator (no inner dex; toe-stall has none). 2 brackets matches 2 ADD.",
    ),
    (
        "ducking-guay", 3, "guay", "",
        "Ducking modifier on guay base. 3 ADD = ducking(+1) + guay(2); JOB TOE > DUCK [BOD] > OP IN [DEX] > SAME INSIDE [DEL].",
        "W8a ducking 2026-05-27: ducking chassis + guay's IN-dex + same-side inside-stall terminator. 3 brackets matches 3 ADD.",
    ),
    (
        "ducking-symposium-mirage", 4, "mirage", "ducking|symposium",
        "Ducking + symposium on mirage base. 4 ADD = ducking(+1) + symposium(+1) + mirage(2); JOB TOE > DUCK [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL].",
        "W8a ducking 2026-05-27: ducking-mirage chassis + symposium's (no plant while) body event before the dex. 4 brackets matches 4 ADD.",
    ),
    (
        "ducking-double-leg-over", 4, "double-leg-over", "",
        "Ducking modifier on double-leg-over base. 4 ADD = ducking(+1) + double-leg-over(3); JOB TOE > DUCK [BOD] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W8a ducking 2026-05-27: ducking chassis + double-leg-over's two-dex chain. 4 brackets matches 4 ADD.",
    ),
]

W8A_CORRECTIONS = [
    ("ducking-drifter", "notation", "DUCKING DRIFTER",
     "W8a 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-drifter", "operational_notation",
     "TOE > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]",
     "W8a 2026-05-27: ducking chassis + drifter chain. 4 brackets matches 4 ADD."),

    ("ducking-toe-stall", "notation", "DUCKING TOE STALL",
     "W8a 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-toe-stall", "operational_notation",
     "TOE > DUCK [BOD] > OP TOE [DEL]",
     "W8a 2026-05-27: minimal ducking compound. 2 brackets matches 2 ADD."),

    ("ducking-guay", "notation", "DUCKING GUAY",
     "W8a 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-guay", "operational_notation",
     "TOE > DUCK [BOD] > OP IN [DEX] > SAME INSIDE [DEL]",
     "W8a 2026-05-27: ducking chassis + guay's inside-stall terminator. 3 brackets matches 3 ADD."),

    ("ducking-symposium-mirage", "notation", "DUCKING SYMPOSIUM MIRAGE",
     "W8a 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-symposium-mirage", "operational_notation",
     "TOE > DUCK [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W8a 2026-05-27: ducking + symposium body events before mirage dex. 4 brackets matches 4 ADD."),

    ("ducking-double-leg-over", "notation", "DUCKING DOUBLE LEG OVER",
     "W8a 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-double-leg-over", "operational_notation",
     "TOE > DUCK [BOD] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W8a 2026-05-27: ducking chassis + double-leg-over chain. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W8A_ROWS:
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
        for slug, column, new_val, note in W8A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
