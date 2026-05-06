#!/usr/bin/env python3
"""
patch_pt_v67_identity_merges.py

Four PT-level identity merges resolving the stub-vs-real splits surfaced by
27_qc_alias_misrouting.py. Each pair was previously bridged by a misrouting
alias row (deleted in the prior cleanup pass); these patches consolidate
the residual two-row PT state into a single canonical row.

Merges:
  1. Steven L. Goldberg     (0cf6c5f6, v53 stub)  -> Steve Goldberg     (0ae92001)
  2. Váška Kouda            (4a9eec48, v53 stub)  -> Vá ka Kouda        (21000f84)
                              (new canonical 'Váška Kouda' — proper Czech form
                               from doomed; corrupted survivor canonical preserved as alias)
  3. Karel Hudeček          (aa8e4d31, v53 stub)  -> Karel Hude ek      (fe0cfa99)
                              (new canonical 'Karel Hudeček' — proper Czech form
                               from doomed; corrupted survivor canonical preserved as alias)
  4. Mark Voightmann        (a26fb161, v53 stub)  -> Mark Voightman     (227572fb)

Skipped (per scope rule "if clearly safe; otherwise report and skip"):
  - Thomas Förster (8bebb3c9, v53 stub) ↔ Thomas Försterson (9f8faea6,
    overrides+data). The surname forms differ (Förster vs Försterson —
    extra '-son' suffix) and could plausibly be distinct individuals.
    The deleted alias asserted typo-equivalence but neither row carries
    enough additional signal to confirm the merge unilaterally. Left as
    two separate PT rows; no QC hard fail since Thomas isn't HOF.

Mirrors patch_pt_v66_hof_merges.py shape: same Merge dataclass, same
assertion-heavy pre/post checks, same conservation invariants.

Expected v66 -> v67 diff:
  - 4 rows deleted (doomed v53 stubs)
  - 4 rows mutated (survivors absorb doomed names + canonical updates on 2)
  - PT row count: 4083 -> 4079
  - Total unique player_ids: unchanged
  - No other PT row mutated

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v67_identity_merges.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v66.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v67.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

DELIM = " | "


def parse_pipe(field_value: str) -> list[str]:
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
    new_canon: str
    extra_aliases: list[str] = field(default_factory=list)


MERGES: list[Merge] = [
    Merge(
        label="Steve Goldberg",
        survivor_pid="0ae92001-5680-502c-95fa-500e6a808f14",
        doomed_pid  ="0cf6c5f6-e7d6-5aed-b187-bdaec78b6e78",
        survivor_canon_pre="Steve Goldberg",
        doomed_canon_pre  ="Steven L. Goldberg",
        new_canon="Steve Goldberg",
    ),
    Merge(
        label="Vá ka Kouda",
        survivor_pid="21000f84-c136-5bf8-bf10-3707872bf5e4",
        doomed_pid  ="4a9eec48-24df-5707-b379-12a9599106fb",
        survivor_canon_pre="Vá ka Kouda",
        doomed_canon_pre  ="Váška Kouda",
        new_canon="Váška Kouda",
        # Preserve the corrupted survivor canonical as a searchable alias.
        extra_aliases=["Vá ka Kouda"],
    ),
    Merge(
        label="Karel Hude ek",
        survivor_pid="fe0cfa99-6870-56de-a6e0-939bdc09370b",
        doomed_pid  ="aa8e4d31-8587-5d00-8097-b7ac8dfabf0f",
        survivor_canon_pre="Karel Hude ek",
        doomed_canon_pre  ="Karel Hudeček",
        new_canon="Karel Hudeček",
        # Preserve the corrupted survivor canonical as a searchable alias.
        extra_aliases=["Karel Hude ek"],
    ),
    Merge(
        label="Mark Voightman",
        survivor_pid="227572fb-db70-57fd-92da-e930ab47ab81",
        doomed_pid  ="a26fb161-f274-5a04-b33b-e9611684baf5",
        survivor_canon_pre="Mark Voightman",
        doomed_canon_pre  ="Mark Voightmann",
        new_canon="Mark Voightman",
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

    print(f"v66 input rows: {len(rows)}")
    rows_before_count = len(rows)

    by_pid: dict[str, dict] = {r["effective_person_id"]: r for r in rows}

    # ─── Pre-conditions per merge ─────────────────────────────────────────
    for m in MERGES:
        s = by_pid.get(m.survivor_pid)
        d = by_pid.get(m.doomed_pid)
        if s is None:
            raise AssertionError(f"{m.label}: survivor pid {m.survivor_pid} not in PT v66")
        if d is None:
            raise AssertionError(f"{m.label}: doomed pid {m.doomed_pid} not in PT v66")
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
                f"{m.label}: player_ids overlap: {set(s_pids) & set(d_pids)}"
            )
        assert_person_likeness(m.new_canon, f"{m.label} new_canon")

    print(f"All {len(MERGES)} pre-condition checks passed.")

    # ─── Conservation snapshot ───────────────────────────────────────────
    def all_pid_set(rows_iter: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows_iter:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s
    all_before = all_pid_set(rows)

    target_pids: set[str] = set()
    for m in MERGES:
        target_pids.add(m.survivor_pid); target_pids.add(m.doomed_pid)
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

        new_alias_set = set(s_alias) | set(m.extra_aliases)
        if m.doomed_canon_pre != m.new_canon:
            new_alias_set.add(m.doomed_canon_pre)
        new_alias_set.discard(m.new_canon)

        s["person_canon"]        = m.new_canon
        s["person_canon_clean"]  = m.new_canon
        s["player_ids_seen"]     = emit_pipe(sorted(set(s_pids) | set(d_pids)))
        s["player_names_seen"]   = emit_pipe(sorted(set(s_names) | set(d_names)))
        s["aliases_presentable"] = emit_pipe(sorted(new_alias_set))

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
            raise AssertionError(f"{m.label}: doomed pid still present")
        s_after = new_by_pid.get(m.survivor_pid)
        if s_after is None:
            raise AssertionError(f"{m.label}: survivor pid vanished")
        if s_after["person_canon"] != m.new_canon:
            raise AssertionError(f"{m.label}: post-mutation canonical mismatch")
        if s_after["person_canon_clean"] != m.new_canon:
            raise AssertionError(f"{m.label}: post-mutation canon_clean mismatch")

    seen: dict[str, str] = {}
    for r in new_rows:
        for pid_token in parse_pipe(r["player_ids_seen"]):
            owner = r["effective_person_id"]
            if pid_token in seen and seen[pid_token] != owner:
                raise AssertionError(
                    f"player_id {pid_token} on both {seen[pid_token]} and {owner}"
                )
            seen[pid_token] = owner

    untouched_after = [
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] not in target_pids
    ]
    if sorted(untouched_after) != sorted(untouched_before):
        raise AssertionError("a non-target PT row was modified during merge")

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
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v67)")
    print(f"  v66 rows: {rows_before_count}  v67 rows: {len(new_rows)}  delta: -{len(MERGES)}")
    print(f"  unique player_ids: {len(all_before)} -> {len(all_after)} (unchanged)")


if __name__ == "__main__":
    main()
