"""
W1a — Apply 5 inspinning compound promotions.

Appends to:
  legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv
  legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv

Per W1a verification table (2026-05-27): 5 inspinning rows, single +1 modifier,
single-base, sibling-derived op_notation per inspinning-butterfly pattern.

Idempotent: re-running skips rows whose canonical_name is already present in
red_additions.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

# Each row: (canonical_name, adds, base_trick, description, w1a_note)
# Note: modifier_links left blank to match existing inspinning+quantum
# compound rows in red_additions (inspinning-butterfly + quantum-* all have
# empty modifier_links — the inspinning modifier is not registered in
# freestyle_trick_modifiers; existing quantum compounds also leave the
# join-table field blank by convention).
W1A_ROWS = [
    (
        "inspinning-mirage", 3, "mirage",
        "Inspinning modifier on mirage base. 3 ADD = inspinning(+1) + mirage(2); JOB TOE > (front) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL].",
        "W1a inspinning+quantum coverage 2026-05-27: sibling-derived from inspinning-butterfly + mirage(2) base. Inspinning direction-flip rule applies (spin=front).",
    ),
    (
        "inspinning-illusion", 3, "illusion",
        "Inspinning modifier on illusion base. 3 ADD = inspinning(+1) + illusion(2); JOB TOE > (front) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL].",
        "W1a inspinning+quantum coverage 2026-05-27: sibling-derived from inspinning-butterfly + illusion(2) base. Inspinning direction-flip rule applies (spin=front).",
    ),
    (
        "inspinning-legover", 3, "legover",
        "Inspinning modifier on legover base. 3 ADD = inspinning(+1) + legover(2); JOB TOE > (front) SPIN [BOD] > OP OUT [DEX] > SAME TOE [DEL].",
        "W1a inspinning+quantum coverage 2026-05-27: sibling-derived from inspinning-butterfly + legover(2) base. Inspinning direction-flip rule applies (spin=front).",
    ),
    (
        "inspinning-clipper", 3, "clipper-stall",
        "Inspinning modifier on clipper-stall base. 3 ADD = inspinning(+1) + clipper-stall(2); JOB TOE > (front) SPIN [BOD] > OP CLIP [XBD] [DEL].",
        "W1a inspinning+quantum coverage 2026-05-27: sibling-derived from inspinning-butterfly + clipper-stall(2) base. Inspinning direction-flip rule applies (spin=front); XBD terminal preserved from clipper-family convention.",
    ),
    (
        "inspinning-osis", 4, "osis",
        "Inspinning modifier on osis base. 4 ADD = inspinning(+1) + osis(3); JOB TOE > (front) SPIN [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Double-body-spin trick: inspinning front-spin then osis back-spin.",
        "W1a inspinning+quantum coverage 2026-05-27: sibling-derived from inspinning-butterfly pattern with osis base (which carries its own body-spin). Double [BOD] bracket count = 4 matches asserted 4 ADD per peeking/sonic double-spin precedent in Holden sets.",
    ),
]

# JOB + op_notation corrections per slug.
# Sibling reference: inspinning-butterfly = CLIP > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]
W1A_CORRECTIONS = [
    # (slug, column, new_value, note)
    (
        "inspinning-mirage", "notation", "INSPINNING MIRAGE",
        "W1a 2026-05-27: JOB per mechanical uppercase rule (canonical_name uppercased, hyphens to spaces).",
    ),
    (
        "inspinning-mirage", "operational_notation",
        "TOE > (front) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]",
        "W1a 2026-05-27: sibling-derived from inspinning-butterfly pattern + mirage base; inspinning prefix injects (front) SPIN [BOD] after TOE set. 3 brackets ([BOD] [DEX] [DEL]) matches asserted 3 ADD.",
    ),
    (
        "inspinning-illusion", "notation", "INSPINNING ILLUSION",
        "W1a 2026-05-27: JOB per mechanical uppercase rule.",
    ),
    (
        "inspinning-illusion", "operational_notation",
        "TOE > (front) SPIN [BOD] > OP OUT [DEX] > OP TOE [DEL]",
        "W1a 2026-05-27: sibling-derived from inspinning-butterfly + illusion base. Illusion dex is OP OUT (vs mirage's OP IN). 3 brackets matches asserted 3 ADD.",
    ),
    (
        "inspinning-legover", "notation", "INSPINNING LEGOVER",
        "W1a 2026-05-27: JOB per mechanical uppercase rule.",
    ),
    (
        "inspinning-legover", "operational_notation",
        "TOE > (front) SPIN [BOD] > OP OUT [DEX] > SAME TOE [DEL]",
        "W1a 2026-05-27: sibling-derived from inspinning-butterfly + legover base. Legover terminal is SAME TOE (vs illusion's OP TOE). 3 brackets matches asserted 3 ADD.",
    ),
    (
        "inspinning-clipper", "notation", "INSPINNING CLIPPER",
        "W1a 2026-05-27: JOB per mechanical uppercase rule.",
    ),
    (
        "inspinning-clipper", "operational_notation",
        "TOE > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]",
        "W1a 2026-05-27: sibling-derived from inspinning-butterfly with clipper terminal (no dex stage between spin and clip). 3 brackets ([BOD] [XBD] [DEL]) matches asserted 3 ADD.",
    ),
    (
        "inspinning-osis", "notation", "INSPINNING OSIS",
        "W1a 2026-05-27: JOB per mechanical uppercase rule.",
    ),
    (
        "inspinning-osis", "operational_notation",
        "TOE > (front) SPIN [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
        "W1a 2026-05-27: double-body-spin construction. Osis base carries its own body-spin; inspinning prefix adds a second (front) spin before it. Double [BOD] precedent per peeking/sonic in Holden sets (CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >). 4 brackets ([BOD] [BOD] [XBD] [DEL]) matches asserted 4 ADD.",
    ),
]


def name_exists_in_additions(canonical_name: str) -> bool:
    with ADD_CSV.open(encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            if row["canonical_name"] == canonical_name:
                return True
    return False


def correction_exists(slug: str, column: str) -> bool:
    with COR_CSV.open(encoding="utf-8", errors="replace") as f:
        # red_corrections columns: slug, column_name, old_value, new_value, review_note
        reader = csv.reader(f)
        next(reader, None)  # header
        for row in reader:
            if len(row) >= 2 and row[0] == slug and row[1] == column:
                return True
    return False


def main() -> None:
    # ── Append red_additions rows ──
    add_skipped = 0
    add_appended = 0
    with ADD_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for canonical, adds, base, desc, note in W1A_ROWS:
            if name_exists_in_additions(canonical):
                add_skipped += 1
                continue
            w.writerow([
                canonical, adds, base, "compound", "", "",
                desc, "expert_reviewed", "1", note,
            ])
            add_appended += 1

    # ── Append red_corrections rows ──
    cor_skipped = 0
    cor_appended = 0
    with COR_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for slug, column, new_val, note in W1A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
