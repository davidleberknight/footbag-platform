#!/usr/bin/env python3
"""
patch_pt_v70_repair_character_loss.py

Repair three canonical identities that were split in two because a character
was lost from the name.

The legacy site stored these names in a Central European encoding. Crawled
pages carry three coexisting spellings of the same person: the correct one,
a mojibake form where the accented letter renders as a stray glyph, and a
form where the letter is simply gone. Each lost-letter spelling was minted
as its own canonical person carrying no player ids and no legacy account
link, so the row can never be claimed by the real player and contributes a
single orphaned result. The site itself holds no lost-letter spelling; the
deletion happens downstream of the crawl.

Three merges, doomed row deleted, its spelling kept as a searchable alias on
the survivor:

  Przemysaw Pietrzycki (96b84e1f) -> Przemyslaw Pietrzycki (8a15006e)
  Radosaw Turek        (4ced0cc7) -> Rados Turek           (2002626c)
  Ren Ruhr             (30d9a908) -> Rene Ruehr            (9585ffd8)

Two of the survivors are themselves truncated, because the lost-letter
spelling is the dominant one on the legacy site, so this patch also restores
their true Polish spelling. The pre-restoration form is preserved as an
alias so a lookup that hit the old spelling still resolves. The third
survivor keeps 'Rene Ruehr': that is the standard German transliteration of
the umlaut, not damage.

  8a15006e  person_canon  'Przemyslaw Pietrzycki' -> 'Przemysław Pietrzycki'
  2002626c  person_canon  'Rados Turek'           -> 'Radosław Turek'

None of the three doomed rows appears in the placements lock, so there is no
companion placements remap: each doomed row's single result comes from the
result stream and re-attributes through the alias registry on the next
export. The matching alias rows belong in overrides/person_aliases.csv;
without them the export re-mints the row and the alias-duplicate gate fails.

Expected diff:
  - 3 rows deleted, 0 added; PT row count 4078 -> 4075
  - 3 survivor rows mutated
  - total unique player_ids unchanged (no doomed row carried any)
  - no other PT row mutated

Input deviation from the older patch tools: they read the numbered
predecessor snapshot, but every intermediate snapshot is ignored by version
control, so those files exist on no checkout. This tool reads the
version-free file, which is always a copy of the newest snapshot, and
overwrites it in place. The version-free file is tracked, so a checkout of
that one path is the rollback, and a second run stops on its own
pre-condition checks rather than compounding the edit.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v70_repair_character_loss.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v70.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

DELIM = " | "


def parse_pipe(field_value: str) -> list[str]:
    return [p.strip() for p in (field_value or "").split("|") if p.strip()]


def emit_pipe(items: list[str]) -> str:
    return DELIM.join(items)


@dataclass
class CharacterLossRepair:
    label: str
    survivor_pid: str
    doomed_pid: str
    doomed_canon: str
    survivor_canon_pre: str
    # Equal to survivor_canon_pre when the survivor's own spelling is sound.
    survivor_canon_post: str
    doomed_names_seen: list[str] = field(default_factory=list)


REPAIRS: list[CharacterLossRepair] = [
    CharacterLossRepair(
        label="Przemysław Pietrzycki",
        survivor_pid="8a15006e-bc85-5621-bbe6-66090397b7d2",
        doomed_pid="96b84e1f-af05-57a8-b277-d3d3c86bb884",
        doomed_canon="Przemysaw Pietrzycki",
        survivor_canon_pre="Przemyslaw Pietrzycki",
        survivor_canon_post="Przemysław Pietrzycki",
        doomed_names_seen=["Przemysaw Pietrzycki"],
    ),
    CharacterLossRepair(
        label="Radosław Turek",
        survivor_pid="2002626c-155f-5447-8115-bba010c6a418",
        doomed_pid="4ced0cc7-0502-58bc-9291-19b8f4bfe2eb",
        doomed_canon="Radosaw Turek",
        survivor_canon_pre="Rados Turek",
        survivor_canon_post="Radosław Turek",
        doomed_names_seen=["Radosaw Turek"],
    ),
    CharacterLossRepair(
        label="Rene Ruehr",
        survivor_pid="9585ffd8-cc96-528e-ba4a-4211da8cef00",
        doomed_pid="30d9a908-b245-563b-be3a-6b6969c6b99e",
        doomed_canon="Ren Ruhr",
        survivor_canon_pre="Rene Ruehr",
        survivor_canon_post="Rene Ruehr",
        doomed_names_seen=["Ren Ruhr"],
    ),
]


def assert_person_likeness(name: str, where: str) -> None:
    """Lightweight checks mirroring the person gate in the historical export."""
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
        print(f"ERROR: {PT_IN} not found", file=sys.stderr)
        sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    rows_before = len(rows)
    print(f"input rows: {rows_before}")

    by_pid: dict[str, dict] = {r["effective_person_id"]: r for r in rows}

    # ─── Pre-conditions per repair ───────────────────────────────────────
    for rp in REPAIRS:
        survivor = by_pid.get(rp.survivor_pid)
        doomed = by_pid.get(rp.doomed_pid)
        if survivor is None:
            raise AssertionError(f"{rp.label}: survivor {rp.survivor_pid} not present")
        if doomed is None:
            raise AssertionError(f"{rp.label}: doomed {rp.doomed_pid} not present")
        if survivor["person_canon"] != rp.survivor_canon_pre:
            raise AssertionError(
                f"{rp.label}: survivor person_canon expected {rp.survivor_canon_pre!r}, "
                f"got {survivor['person_canon']!r}"
            )
        if survivor["person_canon_clean"] != rp.survivor_canon_pre:
            raise AssertionError(
                f"{rp.label}: survivor person_canon_clean expected "
                f"{rp.survivor_canon_pre!r}, got {survivor['person_canon_clean']!r}"
            )
        if doomed["person_canon"] != rp.doomed_canon:
            raise AssertionError(
                f"{rp.label}: doomed person_canon expected {rp.doomed_canon!r}, "
                f"got {doomed['person_canon']!r}"
            )
        # The merge is only safe because the doomed row owns nothing: an
        # unclaimable orphan, not a second real person with a result history.
        if parse_pipe(doomed["player_ids_seen"]):
            raise AssertionError(f"{rp.label}: doomed row carries player ids")
        if doomed["legacyid"].strip():
            raise AssertionError(f"{rp.label}: doomed row carries a legacy account link")
        if doomed["exclusion_reason"].strip():
            raise AssertionError(f"{rp.label}: doomed row already carries an exclusion")
        assert_person_likeness(rp.survivor_canon_post, f"{rp.label} survivor_canon_post")

    print(f"All {len(REPAIRS)} pre-condition checks passed.")

    # ─── Conservation snapshot ───────────────────────────────────────────
    def all_pid_set(rows_iter: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows_iter:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s

    all_before = all_pid_set(rows)

    target_pids: set[str] = set()
    for rp in REPAIRS:
        target_pids.add(rp.survivor_pid)
        target_pids.add(rp.doomed_pid)

    untouched_before = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in target_pids
    )

    # ─── Apply each repair ───────────────────────────────────────────────
    for rp in REPAIRS:
        survivor = by_pid[rp.survivor_pid]

        aliases = set(parse_pipe(survivor["aliases_presentable"]))
        aliases.add(rp.doomed_canon)
        aliases.add(rp.survivor_canon_pre)
        aliases.discard(rp.survivor_canon_post)

        names_seen = set(parse_pipe(survivor["player_names_seen"]))
        names_seen.update(rp.doomed_names_seen)

        survivor["person_canon"] = rp.survivor_canon_post
        survivor["person_canon_clean"] = rp.survivor_canon_post
        survivor["aliases_presentable"] = emit_pipe(sorted(aliases))
        survivor["player_names_seen"] = emit_pipe(sorted(names_seen))

    doomed_pids = {rp.doomed_pid for rp in REPAIRS}
    new_rows = [r for r in rows if r["effective_person_id"] not in doomed_pids]

    # ─── Post-conditions ─────────────────────────────────────────────────
    expected = rows_before - len(REPAIRS)
    if len(new_rows) != expected:
        raise AssertionError(f"row delta {rows_before} -> {len(new_rows)}, expected {expected}")

    new_by_pid = {r["effective_person_id"]: r for r in new_rows}
    for rp in REPAIRS:
        if rp.doomed_pid in new_by_pid:
            raise AssertionError(f"{rp.label}: doomed row still present")
        s = new_by_pid.get(rp.survivor_pid)
        if s is None:
            raise AssertionError(f"{rp.label}: survivor vanished")
        if s["person_canon"] != rp.survivor_canon_post:
            raise AssertionError(f"{rp.label}: survivor canonical mismatch after mutation")
        if s["person_canon_clean"] != rp.survivor_canon_post:
            raise AssertionError(f"{rp.label}: survivor canon_clean mismatch after mutation")
        presentable = parse_pipe(s["aliases_presentable"])
        if rp.doomed_canon not in presentable:
            raise AssertionError(
                f"{rp.label}: lost-letter spelling {rp.doomed_canon!r} not preserved as an alias"
            )
        if rp.survivor_canon_pre != rp.survivor_canon_post and rp.survivor_canon_pre not in presentable:
            raise AssertionError(
                f"{rp.label}: pre-restoration spelling {rp.survivor_canon_pre!r} not preserved"
            )

    untouched_after = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] not in target_pids
    )
    if untouched_after != untouched_before:
        raise AssertionError("a non-target PT row was modified")

    seen: dict[str, str] = {}
    for r in new_rows:
        for pid in parse_pipe(r["player_ids_seen"]):
            if seen.get(pid, r["effective_person_id"]) != r["effective_person_id"]:
                raise AssertionError(f"player_id {pid} on two rows")
            seen[pid] = r["effective_person_id"]

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
    print("Character-loss repairs applied:")
    for rp in REPAIRS:
        s = new_by_pid[rp.survivor_pid]
        print(f"  [{rp.label}]")
        print(f"    doomed              : {rp.doomed_pid[:8]}... {rp.doomed_canon!r} DELETED")
        print(f"    survivor            : {rp.survivor_pid[:8]}...")
        print(f"    person_canon        : {rp.survivor_canon_pre!r} -> {rp.survivor_canon_post!r}")
        print(f"    aliases_presentable : {s['aliases_presentable']!r}")
    print()
    print(f"Output: {PT_OUT}")
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v70)")
    print(f"  rows: {rows_before} -> {len(new_rows)} ({len(new_rows) - rows_before})")
    print(f"  unique player_ids: {len(all_before)} -> {len(all_after)} (unchanged)")
    print()
    print("Next steps:")
    print("  1. Add the matching alias rows to overrides/person_aliases.csv.")
    print("  2. Rebuild canonical output and run the quality gate.")


if __name__ == "__main__":
    main()
