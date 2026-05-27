"""
W1b — Apply 4 inspinning compound promotions (advanced batch).

W1b scope (vs. W1a's 5 simplest inspinning compounds): adds inspinning rows
where the base is itself a body-event compound (flail / symposium-mirage)
OR where there's a multi-modifier stack (atomic + inspinning).

DEFERRED from the original 10-row W1b candidate list:
  - inspinning-same-side-{butterfly,illusion,mirage}  (3 rows)
    → reclassified as Cat B aliases of inspinning-X (SS=+0 directional
       qualifier per pt12; not separate canonical tricks)
  - inspinning-guay  (1 row)
    → guay = 2 ADD in DB; reconciliation source_adds not yet verified;
       defer until source claim confirmed
  - inspinning-reverse-guay  (1 row)
    → reverse-guay not yet canonical in DB; can't compose
  - pixie-inspinning  (1 row)
    → Holden treats as set-system (open terminator); bare-name-trick
       convention application unclear; defer to curator

W1b lands the 4 unambiguous additions.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W1B_ROWS = [
    (
        "inspinning-toe-stall", 2, "toe-stall",
        "Inspinning modifier on toe-stall base. 2 ADD = inspinning(+1) + toe-stall(1); JOB TOE > (front) SPIN [BOD] > OP TOE [DEL].",
        "W1b inspinning advanced 2026-05-27: minimal inspinning compound (single body-spin to opposite toe). Sibling-derived from inspinning-butterfly pattern collapsed to a stall terminator.",
    ),
    (
        "inspinning-flail", 4, "flail",
        "Inspinning modifier on flail base. 4 ADD = inspinning(+1) + flail(3); JOB TOE > (front) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL].",
        "W1b inspinning advanced 2026-05-27: inspinning prefix on flail (symposium-reverse-miraging). Flail's no-plant body event is preserved between the inspinning spin and the terminal toe stall.",
    ),
    (
        "inspinning-symposium-mirage", 4, "mirage",
        "Inspinning modifier on symposium-mirage base. 4 ADD = inspinning(+1) + symposium-mirage(3); JOB TOE > (front) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL].",
        "W1b inspinning advanced 2026-05-27: inspinning + symposium on mirage base. Symposium-mirage's no-plant body event preserved; inspinning spin injected before it. modifier_links empty per inspinning convention (matches inspinning-butterfly + inspinning-paradox-* rows).",
    ),
    (
        "atomic-inspinning-butterfly", 5, "butterfly",
        "Atomic + inspinning on butterfly base. 5 ADD = atomic(+1) + inspinning(+1) + butterfly(3); JOB TOE > OP OUT [DEX] > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W1b inspinning advanced 2026-05-27: stacks atomic dex + inspinning spin on butterfly chassis. Atomic-butterfly base (TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]) extended by injecting inspinning (front) SPIN [BOD] between the two dexes. modifier_links=atomic per atomic convention (atomic IS registered as a freestyle_trick_modifiers row); inspinning remains unwired.",
    ),
]

W1B_CORRECTIONS = [
    ("inspinning-toe-stall", "notation", "INSPINNING TOE STALL",
     "W1b 2026-05-27: JOB per mechanical uppercase rule."),
    ("inspinning-toe-stall", "operational_notation",
     "TOE > (front) SPIN [BOD] > OP TOE [DEL]",
     "W1b 2026-05-27: minimal inspinning compound (spin + toe stall). 2 brackets ([BOD] [DEL]) matches asserted 2 ADD."),

    ("inspinning-flail", "notation", "INSPINNING FLAIL",
     "W1b 2026-05-27: JOB per mechanical uppercase rule."),
    ("inspinning-flail", "operational_notation",
     "TOE > (front) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W1b 2026-05-27: inspinning spin then flail's no-plant body event. 4 brackets ([BOD] [BOD] [DEX] [DEL]) matches asserted 4 ADD."),

    ("inspinning-symposium-mirage", "notation", "INSPINNING SYMPOSIUM MIRAGE",
     "W1b 2026-05-27: JOB per mechanical uppercase rule."),
    ("inspinning-symposium-mirage", "operational_notation",
     "TOE > (front) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W1b 2026-05-27: inspinning spin then symposium-mirage's no-plant body event + OP IN dex. 4 brackets ([BOD] [BOD] [DEX] [DEL]) matches asserted 4 ADD."),

    ("atomic-inspinning-butterfly", "notation", "ATOMIC INSPINNING BUTTERFLY",
     "W1b 2026-05-27: JOB per mechanical uppercase rule."),
    ("atomic-inspinning-butterfly", "operational_notation",
     "TOE > OP OUT [DEX] > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W1b 2026-05-27: atomic-butterfly chassis with inspinning spin injected between dexes. 5 brackets ([DEX] [BOD] [DEX] [XBD] [DEL]) matches asserted 5 ADD."),
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
        for canonical, adds, base, desc, note in W1B_ROWS:
            if name_exists_in_additions(canonical):
                add_skipped += 1
                continue
            # atomic-inspinning-butterfly: modifier_links=atomic (atomic is registered)
            modifier_links = "atomic" if canonical == "atomic-inspinning-butterfly" else ""
            w.writerow([
                canonical, adds, base, "compound", "", modifier_links,
                desc, "expert_reviewed", "1", note,
            ])
            add_appended += 1

    cor_skipped = 0
    cor_appended = 0
    with COR_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for slug, column, new_val, note in W1B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()
