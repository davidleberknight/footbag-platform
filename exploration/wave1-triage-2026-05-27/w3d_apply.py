"""
W3d — Apply 3 more pixie compound promotions.

Smaller batch because the remaining pixie Cat-A pool is dominated by:
  - Cat-B alias situations (SS / directional variants, folk-name aliases
    of canonical-under-folk-name rows)
  - Doctrine-deferred (reverse-X where base reverse-X isn't canonical
    under that slug-form; pixie-mobius where mobius's chassis is too
    complex to derive cleanly)
  - Source-unverified folk names (Merlin, Dolomite, Massacre, Wonton,
    Zulu-X, Blacula, Grifter, Guay, Inspinning [set-system question])

W3d sweeps the 3 clean remaining structural compounds:

  pixie-dyno                      5 ADD = pixie(+1) + dyno(4)
  pixie-dada-curve                5 ADD = pixie(+1) + dada-curve(4)
  pixie-diving-symposium-mirage   5 ADD = pixie(+1) + diving(+1) +
                                          symposium(+1) + mirage(2)

Slug `pixie-dada-curve` uses the DB-convention dada-curve slug form
(not Stanford's `pixie-da-da-curve`). The Stanford form can be added
as a state-2 alias in a future curator pass.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W3D_ROWS = [
    (
        "pixie-dyno", 5, "dyno",
        "Pixie modifier on dyno base. 5 ADD = pixie(+1) + dyno(4); JOB TOE > SAME IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL].",
        "W3d pixie pilot 2026-05-27: pixie set + dyno chassis (OP OUT dex + back-spin + same-clip terminal). 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-dada-curve", 5, "dada-curve",
        "Pixie modifier on dada-curve base. 5 ADD = pixie(+1) + dada-curve(4); JOB TOE > SAME IN [DEX] >> OP IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]. Source-named 'Pixie Da Da Curve' (Stanford) — slug normalized to dada-curve form per existing DB convention.",
        "W3d pixie pilot 2026-05-27: pixie set + dada-curve's no-plant double-dex + op-clip terminator chassis. 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-diving-symposium-mirage", 5, "mirage",
        "Pixie + diving + symposium on mirage base. 5 ADD = pixie(+1) + diving(+1) + symposium(+1) + mirage(2); JOB TOE > SAME IN [DEX] >> DIVE [BOD] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL].",
        "W3d pixie pilot 2026-05-27: pixie set + diving body event + symposium-mirage's (no plant while) body+dex pair + toe terminator. 5 brackets ([DEX] [BOD] [BOD] [DEX] [DEL]) matches 5 ADD.",
    ),
]

W3D_CORRECTIONS = [
    ("pixie-dyno", "notation", "PIXIE DYNO",
     "W3d 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-dyno", "operational_notation",
     "TOE > SAME IN [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W3d 2026-05-27: pixie set + dyno chassis. 5 brackets matches 5 ADD."),

    ("pixie-dada-curve", "notation", "PIXIE DADA CURVE",
     "W3d 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-dada-curve", "operational_notation",
     "TOE > SAME IN [DEX] >> OP IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W3d 2026-05-27: pixie set + dada-curve chassis (no-plant double-dex + op-clip terminator). 5 brackets matches 5 ADD."),

    ("pixie-diving-symposium-mirage", "notation", "PIXIE DIVING SYMPOSIUM MIRAGE",
     "W3d 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-diving-symposium-mirage", "operational_notation",
     "TOE > SAME IN [DEX] >> DIVE [BOD] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W3d 2026-05-27: pixie set + DIVE body event + symposium-mirage no-plant body+dex + toe terminator. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, desc, note in W3D_ROWS:
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
        for slug, column, new_val, note in W3D_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
