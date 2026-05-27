"""
W9n — Apply 5 mixed-modifier-tail compound promotions
(tapping + miraging tails, plus a symposium addition).

All chassis derive cleanly from W9k (miraging), W9l/W9m (tapping), W9c
(symposium) precedents + canonical bases. All source-attested.

  tapping-torque                5 ADD = tapping(+1) + torque(4)
  tapping-double-leg-over       4 ADD = tapping(+1) + DLO(3)
  miraging-dyno                 5 ADD = miraging(+1) + dyno(4)
  miraging-symposium-eggbeater  5 ADD = miraging(+1) + symposium(+1) + eggbeater(3)
  symposium-double-over-down    5 ADD = symposium(+1) + DOD(4)

Chassis derivations:
  - tapping-torque: W9l tapping-whirl chassis + torque's back-spin
    terminal.
  - tapping-double-leg-over: W9l tapping chassis through DLO's
    IN→OUT dex sequence.
  - miraging-dyno: W9k miraging chassis + dyno's spin-clipper terminal.
  - miraging-symposium-eggbeater: W9k miraging-symposium-mirage chassis
    + eggbeater's two-OUT-dex terminal.
  - symposium-double-over-down: W9c symposium-mirage chassis on DOD's
    two-OUT-dex chain.

Source attestation (with slug normalization):
  - miraging-symposium-eggbeater ← "Miraging Symp. Eggbeater" (passback).
  - tapping-double-leg-over ← "Tapping DLO" (passback).
  - Others ← footbagmoves direct attestation.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9N_ROWS = [
    (
        "tapping-torque", 5, "torque", "tapping",
        "Tapping modifier on torque base. 5 ADD = tapping(+1) + torque(4); JOB TOE > OP OUT [DEX] >> OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Chassis: tapping-whirl precedent + torque's back-spin + cross-body clipper terminal.",
        "W9n tapping 2026-05-27: tapping-whirl chassis + torque chain. 5 brackets matches 5 ADD.",
    ),
    (
        "tapping-double-leg-over", 4, "double-leg-over", "tapping",
        "Tapping modifier on double-leg-over base. 4 ADD = tapping(+1) + double-leg-over(3); JOB TOE > OP OUT [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Chassis: tapping-whirl precedent + DLO's IN→OUT dex sequence + same-toe terminal. Source-named 'Tapping DLO' (passback); slug normalized to double-leg-over.",
        "W9n tapping 2026-05-27: tapping chassis + DLO chain. 4 brackets matches 4 ADD.",
    ),
    (
        "miraging-dyno", 5, "dyno", "miraging",
        "Miraging modifier on dyno base. 5 ADD = miraging(+1) + dyno(4); JOB SET > OP IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Chassis: W9k miraging prefix (OP IN [DEX]) + dyno's OUT-dex + back-spin + cross-body clipper terminal.",
        "W9n miraging 2026-05-27: miraging prefix chassis (W9k) + dyno chain. 5 brackets matches 5 ADD.",
    ),
    (
        "miraging-symposium-eggbeater", 5, "eggbeater", "miraging|symposium",
        "Miraging + symposium on eggbeater base. 5 ADD = miraging(+1) + symposium(+1) + eggbeater(3); JOB SET > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Chassis: W9k miraging-symposium-mirage chassis + eggbeater's two-OUT-dex terminal (symposium [BOD] injection on first OUT-dex). Source-named 'Miraging Symp. Eggbeater' (passback); slug normalized to symposium.",
        "W9n miraging 2026-05-27: W9k miraging-symposium chassis + eggbeater's two-OUT-dex chain. 5 brackets matches 5 ADD.",
    ),
    (
        "symposium-double-over-down", 5, "double-over-down", "symposium",
        "Symposium modifier on double-over-down base. 5 ADD = symposium(+1) + double-over-down(4); JOB TOE > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]. Chassis: W9c symposium-mirage chassis (no-plant [BOD] injection on first dex) applied to DOD's two-OUT-dex chain.",
        "W9n symposium 2026-05-27: W9c symposium-mirage chassis on DOD base. 5 brackets matches 5 ADD.",
    ),
]

W9N_CORRECTIONS = [
    ("tapping-torque", "notation", "TAPPING TORQUE",
     "W9n 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-torque", "operational_notation",
     "TOE > OP OUT [DEX] >> OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9n 2026-05-27: tapping-whirl chassis + torque chain. 5 brackets matches 5 ADD."),

    ("tapping-double-leg-over", "notation", "TAPPING DOUBLE LEG OVER",
     "W9n 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-double-leg-over", "operational_notation",
     "TOE > OP OUT [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9n 2026-05-27: tapping chassis + DLO chain. 4 brackets matches 4 ADD."),

    ("miraging-dyno", "notation", "MIRAGING DYNO",
     "W9n 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-dyno", "operational_notation",
     "SET > OP IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W9n 2026-05-27: W9k miraging prefix + dyno chain. 5 brackets matches 5 ADD."),

    ("miraging-symposium-eggbeater", "notation", "MIRAGING SYMPOSIUM EGGBEATER",
     "W9n 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-symposium-eggbeater", "operational_notation",
     "SET > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9n 2026-05-27: W9k miraging-symposium chassis + eggbeater chain. 5 brackets matches 5 ADD."),

    ("symposium-double-over-down", "notation", "SYMPOSIUM DOUBLE OVER DOWN",
     "W9n 2026-05-27: JOB per mechanical uppercase rule."),
    ("symposium-double-over-down", "operational_notation",
     "TOE > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9n 2026-05-27: W9c symposium-mirage chassis on DOD base. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9N_ROWS:
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
        for slug, column, new_val, note in W9N_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
