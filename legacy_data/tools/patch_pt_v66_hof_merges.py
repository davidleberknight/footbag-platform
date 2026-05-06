#!/usr/bin/env python3
"""
patch_pt_v66_hof_merges.py

Six identity merges resolving HOF QC hard-failure cases per
26_qc_hof_coverage.py findings:

  1. Scott-Mag Hughes        (ca63a7da, HOF stub) -> Scott Hughes        (4cbf790d)
  2. Al Petersen             (d94ff77c, v53 stub) -> Allan Petersen      (64472889)
  3. Jeffrey Johnson         (ee770dd7, v53 stub) -> Jeff Johnson        (76c8b933)
  4. Timothy Vozar           (72cc232f, v53 stub) -> Tim Vozar           (aea29c23)
  5. Walter R. Houston       (e68be9dc, placements_registry) -> Walt Houston (c6704eb0)
  6. Christopher M. Siebert  (c0408f85, 3 events) -> Chris Seibert       (bd1ac97c, 83 events; canonical retyped to 'Chris Siebert')

Each merge follows the patch_pt_v65_merge_husted.py pattern:
  - survivor row absorbs doomed's player_ids_seen + player_names_seen + canonical (as alias)
  - canonical name updated when the survivor's pre-merge canonical is wrong
    (Scott: -> 'Scott-Mag Hughes' per FBHOF; Chris: typo 'Seibert' -> 'Siebert')
  - doomed row deleted
  - assertion-heavy: every mutation re-checked, no other PT row touched

Constraints:
  - person_canon must satisfy person-likeness (no embedded quotes, no commas).
  - sorted-union semantics for multi-value fields (player_ids_seen, names, aliases).
  - conservation: total unique player_ids unchanged across all rows.

Expected v65 -> v66 diff:
  - 6 rows deleted (doomed pids)
  - 6 rows mutated (survivors)
  - PT row count: 4089 -> 4083
  - Total unique player_ids across all rows: unchanged

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v66_hof_merges.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v65.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v66.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

DELIM = " | "


def parse_pipe(field_value: str) -> list[str]:
    """Split a pipe-separated field into clean tokens. Tolerates ' | ' and '|'."""
    return [p.strip() for p in (field_value or "").split("|") if p.strip()]


def emit_pipe(items: list[str]) -> str:
    return DELIM.join(items)


@dataclass
class Merge:
    label: str
    survivor_pid: str
    doomed_pid: str
    survivor_canon_pre: str
    doomed_canon_pre: str
    new_canon: str                   # equals survivor_canon_pre when canonical is unchanged
    extra_aliases: list[str] = field(default_factory=list)  # added to aliases_presentable beyond doomed_canon


MERGES: list[Merge] = [
    Merge(
        label="Scott Hughes",
        survivor_pid="4cbf790d-c542-5318-9337-ee3dfd539ff1",
        doomed_pid  ="ca63a7da-a00a-5a83-ae43-2e17b5758fc8",
        survivor_canon_pre="Scott Hughes",
        doomed_canon_pre  ="Scott-Mag Hughes",
        new_canon="Scott-Mag Hughes",
        # doomed canonical equals new canonical -> not added as alias separately;
        # but the previous survivor canonical is preserved as alias.
        extra_aliases=["Scott Hughes"],
    ),
    Merge(
        label="Allan Petersen",
        survivor_pid="64472889-80b6-5457-a226-8aa66fa810fd",
        doomed_pid  ="d94ff77c-52ab-5ddd-b5e7-3b4963d7c20c",
        survivor_canon_pre="Allan Petersen",
        doomed_canon_pre  ="Al Petersen",
        new_canon="Allan Petersen",
    ),
    Merge(
        label="Jeff Johnson",
        survivor_pid="76c8b933-3ec9-53e9-b2a7-a862b32704db",
        doomed_pid  ="ee770dd7-31d9-5209-9329-35edf9b93349",
        survivor_canon_pre="Jeff Johnson",
        doomed_canon_pre  ="Jeffrey Johnson",
        new_canon="Jeff Johnson",
    ),
    Merge(
        label="Tim Vozar",
        survivor_pid="aea29c23-9cfe-5025-8ff4-ad3341304468",
        doomed_pid  ="72cc232f-cce0-554a-af55-0c033187bc69",
        survivor_canon_pre="Tim Vozar",
        doomed_canon_pre  ="Timothy Vozar",
        new_canon="Tim Vozar",
    ),
    Merge(
        label="Walt Houston",
        survivor_pid="c6704eb0-91e0-538b-8806-9a43b16e91cb",
        doomed_pid  ="e68be9dc-81fb-5b02-8211-3aa3e14437d7",
        survivor_canon_pre="Walt Houston",
        doomed_canon_pre  ="Walter R. Houston",
        new_canon="Walt Houston",
    ),
    Merge(
        label="Chris Siebert",
        survivor_pid="bd1ac97c-6c20-5bcd-9fbd-f5279f4c22bf",
        doomed_pid  ="c0408f85-c347-5937-a0f1-bf768164ab09",
        survivor_canon_pre="Chris Seibert",                      # typo
        doomed_canon_pre  ="Christopher Michael Siebert",
        new_canon="Chris Siebert",                                # typo fix
        # previous survivor canonical (the typo) preserved as alias for searchability
        extra_aliases=["Chris Seibert"],
    ),
]


def assert_person_likeness(name: str, where: str) -> None:
    """Lightweight checks mirroring export_historical_csvs.py:1308-1318."""
    if "," in name:
        raise AssertionError(f"{where}: person_canon contains comma: {name!r}")
    if '"' in name:
        raise AssertionError(f"{where}: person_canon contains quote: {name!r}")
    if " " not in name and "." not in name:
        raise AssertionError(f"{where}: person_canon is single-word: {name!r}")
    if name and name[0].islower():
        raise AssertionError(f"{where}: person_canon starts lowercase: {name!r}")


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    print(f"v65 input rows: {len(rows)}")
    rows_before_count = len(rows)

    by_pid: dict[str, dict] = {r["effective_person_id"]: r for r in rows}

    # ─── Pre-conditions per merge ─────────────────────────────────────────
    for m in MERGES:
        s = by_pid.get(m.survivor_pid)
        d = by_pid.get(m.doomed_pid)
        if s is None:
            raise AssertionError(f"{m.label}: survivor pid {m.survivor_pid} not in PT v65")
        if d is None:
            raise AssertionError(f"{m.label}: doomed pid {m.doomed_pid} not in PT v65")
        if s["person_canon"] != m.survivor_canon_pre:
            raise AssertionError(
                f"{m.label}: survivor person_canon expected "
                f"{m.survivor_canon_pre!r}, got {s['person_canon']!r}"
            )
        if d["person_canon"] != m.doomed_canon_pre:
            raise AssertionError(
                f"{m.label}: doomed person_canon expected "
                f"{m.doomed_canon_pre!r}, got {d['person_canon']!r}"
            )
        s_pids = parse_pipe(s["player_ids_seen"])
        d_pids = parse_pipe(d["player_ids_seen"])
        if set(s_pids) & set(d_pids):
            raise AssertionError(
                f"{m.label}: player_ids overlap between survivor and doomed: "
                f"{set(s_pids) & set(d_pids)}"
            )
        assert_person_likeness(m.new_canon, f"{m.label} new_canon")

    print(f"All {len(MERGES)} pre-condition checks passed.")

    # ─── Conservation snapshot: total unique player_ids ──────────────────
    def all_pid_set(rows_iter: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows_iter:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s
    all_before = all_pid_set(rows)

    # Snapshot of OTHER rows for tamper check
    target_pids: set[str] = set()
    for m in MERGES:
        target_pids.add(m.survivor_pid)
        target_pids.add(m.doomed_pid)
    untouched_before = [
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in target_pids
    ]

    # ─── Apply each merge ────────────────────────────────────────────────
    for m in MERGES:
        s = by_pid[m.survivor_pid]
        d = by_pid[m.doomed_pid]

        s_pids   = parse_pipe(s["player_ids_seen"])
        d_pids   = parse_pipe(d["player_ids_seen"])
        s_names  = parse_pipe(s["player_names_seen"])
        d_names  = parse_pipe(d["player_names_seen"])
        s_alias  = parse_pipe(s.get("aliases_presentable", ""))

        # aliases_presentable absorbs:
        #   - existing survivor aliases
        #   - doomed's canonical name (unless equal to new canonical)
        #   - explicit extra aliases (e.g., previous survivor canonical when canonical changes)
        new_alias_set = set(s_alias) | set(m.extra_aliases)
        if m.doomed_canon_pre != m.new_canon:
            new_alias_set.add(m.doomed_canon_pre)
        # Never alias to the row's own new canonical
        new_alias_set.discard(m.new_canon)

        s["person_canon"]        = m.new_canon
        s["person_canon_clean"]  = m.new_canon
        s["player_ids_seen"]     = emit_pipe(sorted(set(s_pids) | set(d_pids)))
        s["player_names_seen"]   = emit_pipe(sorted(set(s_names) | set(d_names)))
        s["aliases_presentable"] = emit_pipe(sorted(new_alias_set))

    # Delete doomed rows
    doomed_set = {m.doomed_pid for m in MERGES}
    new_rows = [r for r in rows if r["effective_person_id"] not in doomed_set]

    # ─── Post-conditions ─────────────────────────────────────────────────
    expected_count = rows_before_count - len(MERGES)
    if len(new_rows) != expected_count:
        raise AssertionError(
            f"row count delta: {rows_before_count} -> {len(new_rows)} "
            f"(expected -{len(MERGES)})"
        )

    new_by_pid = {r["effective_person_id"]: r for r in new_rows}
    for m in MERGES:
        if m.doomed_pid in new_by_pid:
            raise AssertionError(f"{m.label}: doomed pid {m.doomed_pid} still present")
        s_after = new_by_pid.get(m.survivor_pid)
        if s_after is None:
            raise AssertionError(f"{m.label}: survivor pid vanished")
        if s_after["person_canon"] != m.new_canon:
            raise AssertionError(
                f"{m.label}: post-mutation canonical mismatch: {s_after['person_canon']!r}"
            )
        if s_after["person_canon_clean"] != m.new_canon:
            raise AssertionError(
                f"{m.label}: post-mutation canon_clean mismatch: {s_after['person_canon_clean']!r}"
            )

    # No player_id collision across rows
    seen: dict[str, str] = {}
    for r in new_rows:
        for pid_token in parse_pipe(r["player_ids_seen"]):
            owner = r["effective_person_id"]
            if pid_token in seen and seen[pid_token] != owner:
                raise AssertionError(
                    f"player_id {pid_token} on both {seen[pid_token]} and {owner}"
                )
            seen[pid_token] = owner

    # No non-target row mutated
    untouched_after = [
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] not in target_pids
    ]
    if sorted(untouched_after) != sorted(untouched_before):
        raise AssertionError("a non-target PT row was modified during merge")

    # Conservation: total unique player_ids unchanged
    all_after = all_pid_set(new_rows)
    if all_after != all_before:
        raise AssertionError(
            f"player_id set drift: gained={sorted(all_after - all_before)} "
            f"lost={sorted(all_before - all_after)}"
        )

    # ─── Write outputs ───────────────────────────────────────────────────
    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(new_rows)
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print()
    print("Merges applied:")
    for m in MERGES:
        s_after = new_by_pid[m.survivor_pid]
        canon_change = "" if m.survivor_canon_pre == m.new_canon else f"  canonical: {m.survivor_canon_pre!r} -> {m.new_canon!r}"
        print(f"  [{m.label}]")
        print(f"    survivor pid : {m.survivor_pid[:8]}...{canon_change}")
        print(f"    doomed pid   : {m.doomed_pid[:8]}... (DELETED)")
        print(f"    aliases_presentable: {s_after['aliases_presentable']!r}")
    print()
    print(f"Output: {PT_OUT}")
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v66)")
    print(f"  v65 rows: {rows_before_count}  v66 rows: {len(new_rows)}  delta: -{len(MERGES)}")
    print(f"  unique player_ids: {len(all_before)} -> {len(all_after)} (unchanged)")


if __name__ == "__main__":
    main()
