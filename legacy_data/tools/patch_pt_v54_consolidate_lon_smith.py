#!/usr/bin/env python3
"""
patch_pt_v54_consolidate_lon_smith.py

Domain-expert identity consolidation: "Lon Smith" and "Skyler Lon Smith"
are the same person. This patch folds the standalone Lon Smith PT row
(60860e34-935d-5bb0-b718-a430fa4a142e) into the canonical Skyler Lon
Smith row (11d216c3-891d-5728-981f-dc20ba381dd9) in a new lock version.

Mechanics:
  1. Read Persons_Truth_Final_v53.csv
  2. Locate the two target rows by effective_person_id
  3. Remove the 60860e34 row
  4. Union its player_ids_seen, player_names_seen, and aliases fields
     into the 11d216c3 row (order-preserving, dedup on normalized form)
  5. Append a note recording the consolidation + date
  6. Emit Persons_Truth_Final_v54.csv with the same sort convention as
     patch_pt_v53_add_unresolved_persons.py (person_canon normalized asc)

aliases_presentable is left unchanged per domain-expert guidance — no new
presentable content is synthesized.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v54_consolidate_lon_smith.py
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # legacy_data/
PT_V53 = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v53.csv"
PT_V54 = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v54.csv"

DOOMED_PID   = "60860e34-935d-5bb0-b718-a430fa4a142e"  # Lon Smith
SURVIVOR_PID = "11d216c3-891d-5728-981f-dc20ba381dd9"  # Skyler Lon Smith

MERGE_NOTE = (
    "consolidated 60860e34-935d-5bb0-b718-a430fa4a142e (Lon Smith) into "
    "11d216c3-891d-5728-981f-dc20ba381dd9 per domain-expert 2026-04-23"
)

_TRANSLITERATE = str.maketrans("łŁøØđĐðÞŋ", "lLoOdDdTn")


def _norm_name(s: str) -> str:
    s = s.replace("�", "").replace("­", "")
    s = s.translate(_TRANSLITERATE)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower().strip())


def _split_pipe(s: str) -> list[str]:
    return [p.strip() for p in re.split(r"\s*\|\s*", s or "") if p.strip()]


def _join_pipe(parts: list[str]) -> str:
    return " | ".join(parts)


def _union_preserving(primary: list[str], additions: list[str]) -> list[str]:
    """Union two pipe-separated token lists, preserving the primary row's
    order first and appending new tokens from additions in their original
    order. Dedup is by normalized form so "Lon Smith" and "lon smith" do
    not both appear.
    """
    seen_norms = set()
    out: list[str] = []
    for tok in primary + additions:
        n = _norm_name(tok)
        if not n or n in seen_norms:
            continue
        seen_norms.add(n)
        out.append(tok)
    return out


def main() -> None:
    if not PT_V53.exists():
        print(f"ERROR: {PT_V53} not found", file=sys.stderr)
        sys.exit(1)

    with open(PT_V53, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None, "PT v53 header missing"
        rows = list(reader)

    doomed_row = next((r for r in rows if r["effective_person_id"] == DOOMED_PID), None)
    survivor_row = next((r for r in rows if r["effective_person_id"] == SURVIVOR_PID), None)

    if doomed_row is None:
        print(f"ERROR: doomed PID {DOOMED_PID} not found in v53", file=sys.stderr)
        sys.exit(2)
    if survivor_row is None:
        print(f"ERROR: survivor PID {SURVIVOR_PID} not found in v53", file=sys.stderr)
        sys.exit(2)

    print(f"v53 input rows: {len(rows)}")
    print(f"  doomed row (60860e34):   person_canon={doomed_row['person_canon']!r}")
    print(f"  survivor row (11d216c3): person_canon={survivor_row['person_canon']!r}")

    # ── Union metadata into the survivor row ──────────────────────────
    primary_ids = _split_pipe(survivor_row.get("player_ids_seen", ""))
    addition_ids = _split_pipe(doomed_row.get("player_ids_seen", ""))
    merged_ids = _union_preserving(primary_ids, addition_ids)

    primary_names = _split_pipe(survivor_row.get("player_names_seen", ""))
    addition_names = _split_pipe(doomed_row.get("player_names_seen", ""))
    merged_names = _union_preserving(primary_names, addition_names)

    primary_aliases = _split_pipe(survivor_row.get("aliases", ""))
    addition_aliases = _split_pipe(doomed_row.get("aliases", ""))
    merged_aliases = _union_preserving(primary_aliases, addition_aliases)

    prior_notes = (survivor_row.get("notes") or "").strip()
    doomed_notes = (doomed_row.get("notes") or "").strip()
    combined_notes = [MERGE_NOTE]
    if doomed_notes:
        combined_notes.append(f"prior-on-doomed-row: {doomed_notes}")
    if prior_notes:
        combined_notes.append(f"prior-on-survivor-row: {prior_notes}")
    merged_notes = " ; ".join(combined_notes)

    # Per scoping: do not touch aliases_presentable, exclusion_reason,
    # person_canon, person_canon_clean, last_token, norm_key, legacyid.
    new_survivor_row = dict(survivor_row)
    new_survivor_row["player_ids_seen"] = _join_pipe(merged_ids)
    new_survivor_row["player_names_seen"] = _join_pipe(merged_names)
    new_survivor_row["aliases"] = _join_pipe(merged_aliases)
    new_survivor_row["notes"] = merged_notes

    # ── Rebuild row set ───────────────────────────────────────────────
    out_rows = []
    for r in rows:
        if r["effective_person_id"] == DOOMED_PID:
            continue  # drop
        if r["effective_person_id"] == SURVIVOR_PID:
            out_rows.append(new_survivor_row)
        else:
            out_rows.append(r)

    assert len(out_rows) == len(rows) - 1, (
        f"unexpected row count: expected {len(rows) - 1}, got {len(out_rows)}"
    )

    # Same sort convention as patch_pt_v53 script
    out_rows.sort(key=lambda r: _norm_name(r.get("person_canon", "")))

    with open(PT_V54, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"\nOutput: {PT_V54}")
    print(f"  v53 rows: {len(rows)}")
    print(f"  v54 rows: {len(out_rows)}  (delta: -1)")
    print(f"\nSurvivor row after merge:")
    for k in ("effective_person_id", "person_canon", "player_ids_seen",
              "player_names_seen", "aliases", "notes"):
        print(f"  {k}: {new_survivor_row.get(k, '')}")


if __name__ == "__main__":
    main()
