#!/usr/bin/env python3
"""
patch_pt_v68_restore_polish_encoding.py

Single PT-level encoding restoration for one overrides_only row whose Polish
canonical name lost its UTF-8 'ł' (U+0142) as a space at upstream ingest.

Surfaced by Adrian Dick's 2026-05-26 QC pass against /freestyle/partnerships:
the row currently renders as 'Ma gorzata Nycz' in the All Partnerships table.

Restoration:
  effective_person_id e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83
    person_canon        : 'Ma gorzata Nycz' -> 'Małgorzata Nycz'
    person_canon_clean  : 'Ma gorzata Nycz' -> 'Małgorzata Nycz'
    aliases_presentable : preserve historical 'Ma?gorzata Nycz' AND add
                          the corrupted 'Ma gorzata Nycz' as a searchable
                          alias (mirrors v67 Váška Kouda / Karel Hudeček
                          pattern for canonical-corrupt → canonical-clean).

Deliberately out of scope (deferred to T5 identity-governance):
  - 2bc5d866 'Ma gorzata Ol dzka'  (collides with ASCII row 21e3e2db
    'Malgorzata Oledzka' and partial-Polish row 2430dadf 'Magorzata Olędzka'
    — needs curator identity-merge decision, not a unilateral encoding fix).
  - e43a4a28 'Ma gorzata Szpulecka' (collides with ASCII row 7c2e8452
    'Malgorzata Szpulecka' — same merge call).
  - The Adrian-observed 'Gosia Nycz' (07f95465) ≡ 'Małgorzata Nycz'
    identity-overlap question; restoration alone does not consolidate the
    partnership counts. T5 queue item.

Display-pipeline handoff:
  This patch updates only the identity-lock CSV. The change does not appear
  on /freestyle/partnerships until:
    1. The downstream legacy_data pipeline regenerates persons-layer outputs
       that feed `inputs/Persons_Truth.csv`.
    2. `scripts/reset-local-db.sh` rebuilds the platform DB
       (Dave-owned; not run from this slice).
  Operator: James or Dave runs both steps before the fix lands.

Expected v67 -> v68 diff:
  - 0 rows added / 0 rows deleted
  - 1 row mutated (e6f5c3f9 — three fields)
  - PT row count: unchanged
  - Total unique player_ids: unchanged (row had no player_ids_seen)
  - No other PT row mutated

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v68_restore_polish_encoding.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v67.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v68.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

DELIM = " | "


def parse_pipe(field_value: str) -> list[str]:
    return [p.strip() for p in (field_value or "").split("|") if p.strip()]


def emit_pipe(items: list[str]) -> str:
    return DELIM.join(items)


@dataclass
class EncodingFix:
    label: str
    pid: str
    canon_pre: str
    canon_post: str
    extra_aliases: list[str] = field(default_factory=list)


FIXES: list[EncodingFix] = [
    EncodingFix(
        label="Małgorzata Nycz",
        pid="e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83",
        canon_pre="Ma gorzata Nycz",
        canon_post="Małgorzata Nycz",
        # Preserve the corrupted survivor canonical as a searchable alias so
        # any downstream lookup that hit the broken form before regeneration
        # still resolves.
        extra_aliases=["Ma gorzata Nycz"],
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

    print(f"v67 input rows: {len(rows)}")
    rows_before_count = len(rows)

    by_pid: dict[str, dict] = {r["effective_person_id"]: r for r in rows}

    # ─── Pre-conditions per fix ──────────────────────────────────────────
    for fx in FIXES:
        r = by_pid.get(fx.pid)
        if r is None:
            raise AssertionError(f"{fx.label}: pid {fx.pid} not in PT v67")
        if r["person_canon"] != fx.canon_pre:
            raise AssertionError(
                f"{fx.label}: person_canon expected {fx.canon_pre!r}, "
                f"got {r['person_canon']!r}"
            )
        if r["person_canon_clean"] != fx.canon_pre:
            raise AssertionError(
                f"{fx.label}: person_canon_clean expected {fx.canon_pre!r}, "
                f"got {r['person_canon_clean']!r}"
            )
        assert_person_likeness(fx.canon_post, f"{fx.label} canon_post")

    print(f"All {len(FIXES)} pre-condition checks passed.")

    # ─── Conservation snapshot ───────────────────────────────────────────
    def all_pid_set(rows_iter: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows_iter:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s
    all_before = all_pid_set(rows)

    target_pids: set[str] = {fx.pid for fx in FIXES}
    untouched_before = [
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in target_pids
    ]

    # ─── Apply each fix ──────────────────────────────────────────────────
    for fx in FIXES:
        r = by_pid[fx.pid]
        existing_aliases = parse_pipe(r.get("aliases_presentable", ""))
        new_alias_set = set(existing_aliases) | set(fx.extra_aliases)
        new_alias_set.discard(fx.canon_post)

        r["person_canon"]        = fx.canon_post
        r["person_canon_clean"]  = fx.canon_post
        r["aliases_presentable"] = emit_pipe(sorted(new_alias_set))

    new_rows = rows  # no deletions

    # ─── Post-conditions ─────────────────────────────────────────────────
    if len(new_rows) != rows_before_count:
        raise AssertionError(
            f"row count drift: {rows_before_count} -> {len(new_rows)} (expected 0)"
        )

    new_by_pid = {r["effective_person_id"]: r for r in new_rows}
    for fx in FIXES:
        r_after = new_by_pid.get(fx.pid)
        if r_after is None:
            raise AssertionError(f"{fx.label}: pid vanished")
        if r_after["person_canon"] != fx.canon_post:
            raise AssertionError(f"{fx.label}: post-mutation canonical mismatch")
        if r_after["person_canon_clean"] != fx.canon_post:
            raise AssertionError(f"{fx.label}: post-mutation canon_clean mismatch")
        # Corrupted form must round-trip into aliases for searchability.
        if fx.canon_pre not in parse_pipe(r_after["aliases_presentable"]):
            raise AssertionError(
                f"{fx.label}: corrupted form {fx.canon_pre!r} not preserved in aliases"
            )

    untouched_after = [
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] not in target_pids
    ]
    if sorted(untouched_after) != sorted(untouched_before):
        raise AssertionError("a non-target PT row was modified during encoding fix")

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
    print("Encoding fixes applied:")
    for fx in FIXES:
        r_after = new_by_pid[fx.pid]
        print(f"  [{fx.label}]")
        print(f"    pid                 : {fx.pid[:8]}...")
        print(f"    person_canon        : {fx.canon_pre!r} -> {fx.canon_post!r}")
        print(f"    person_canon_clean  : {fx.canon_pre!r} -> {fx.canon_post!r}")
        print(f"    aliases_presentable : {r_after['aliases_presentable']!r}")
    print()
    print(f"Output: {PT_OUT}")
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v68)")
    print(f"  v67 rows: {rows_before_count}  v68 rows: {len(new_rows)}  delta: 0")
    print(f"  unique player_ids: {len(all_before)} -> {len(all_after)} (unchanged)")
    print()
    print("Display propagation handoff:")
    print("  1. Regenerate legacy_data persons-layer outputs (inputs/Persons_Truth.csv).")
    print("  2. Run scripts/reset-local-db.sh to rebuild historical_persons table.")
    print("  /freestyle/partnerships will show 'Małgorzata Nycz' after both steps.")


if __name__ == "__main__":
    main()
