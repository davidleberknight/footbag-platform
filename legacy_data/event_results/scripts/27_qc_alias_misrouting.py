#!/usr/bin/env python3
"""Script 27: QC alias-misrouting collisions. READ-ONLY hard fail.

Detects the alias-misrouting bug pattern: an alias row maps `alias_text` to
target pid_A, but `alias_text` (normalized) is itself the `person_canon` of
a *different* PT row at pid_B. This was the root cause of the 2026-05-05
Heather Cook / Jay Moldenhauer HOF coverage gap.

Many such collisions are INTENTIONAL — last-first format swaps, typo merges,
mid-flight identity consolidations — so this QC does not hard-fail on every
collision. It targets two narrow actionable signals:

Hard failures (exit 1):
  - alias_target_is_stub
      target pid_A's source matches a stub pattern (patch_v53,
      hof_only_stub, v60), and a different PT pid_B has the matching
      canonical with a real source. Same shape as the Jay Moldenhauer →
      Jay Moldenhauser typo-stub bug.

  - alias_target_notes_marked_removed
      target pid_A's notes mention alias_text together with a removal
      keyword (removed, wrong person, separated, split, incorrect).
      Same shape as the Heather Cook → Heather Thomas bug, where the
      alias post-dated the explicit identity split documented in the
      target row's notes.

Warnings:
  - alias_canonical_collision
      alias_text matches a PT canonical at a different pid, but no
      strong stale-alias signal. Backlog of intentional in-flight merges
      lives here. Token-order swaps (e.g., 'Acosta Iván' ↔ 'Iván Acosta')
      are filtered out before this category and not emitted.

Sources scanned:
  - legacy_data/overrides/person_aliases.csv
  - legacy_data/inputs/identity_lock/Person_Display_Names_v1.csv

Read-only. No data writes.

Usage:
  python legacy_data/event_results/scripts/27_qc_alias_misrouting.py
  python legacy_data/event_results/scripts/27_qc_alias_misrouting.py --pt /path/to/PT.csv
  python legacy_data/event_results/scripts/27_qc_alias_misrouting.py --max-warn 50

Exit 0 iff no hard failures; 1 on hard failures; 2 on missing inputs.
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[2]

DEFAULT_PT  = REPO_ROOT / "legacy_data" / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
DEFAULT_PA  = REPO_ROOT / "legacy_data" / "overrides" / "person_aliases.csv"
DEFAULT_PDN = REPO_ROOT / "legacy_data" / "inputs" / "identity_lock" / "Person_Display_Names_v1.csv"

ALIAS_SOURCES: list[dict] = [
    {"path": DEFAULT_PA,  "alias_col": "alias",        "pid_col": "person_id",          "label": "person_aliases.csv"},
    {"path": DEFAULT_PDN, "alias_col": "display_name", "pid_col": "effective_person_id", "label": "Person_Display_Names_v1.csv"},
]

STUB_SOURCE_MARKERS = ("patch_v53", "patch_v60", "hof_only_stub")
REMOVAL_KEYWORDS    = ("removed", "wrong person", "separated", "split", "incorrect")


def norm(s: str) -> str:
    return " ".join((s or "").lower().split())


def is_token_order_swap(a: str, b: str) -> bool:
    """True if `a` and `b` are the same set of tokens in different order
    (last-first swap; e.g., 'Acosta Iván' vs 'Iván Acosta')."""
    ta = norm(a).split()
    tb = norm(b).split()
    return len(ta) >= 2 and ta != tb and sorted(ta) == sorted(tb)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--pt", default=str(DEFAULT_PT))
    ap.add_argument("--max-warn", type=int, default=20,
                    help="Max warnings to print per category (default: 20)")
    args = ap.parse_args()

    pt_path = Path(args.pt)
    if not pt_path.exists():
        print(f"ERROR: PT not found: {pt_path}", file=sys.stderr)
        return 2

    pt_canon: dict[str, str]   = {}
    pt_source: dict[str, str]  = {}
    pt_notes: dict[str, str]   = {}
    canon_to_pids: dict[str, list[str]] = defaultdict(list)

    with pt_path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pid    = r["effective_person_id"].strip()
            canon  = r.get("person_canon", "").strip()
            source = r.get("source", "").strip()
            notes  = r.get("notes", "").strip()
            if not pid:
                continue
            pt_canon[pid]  = canon
            pt_source[pid] = source
            pt_notes[pid]  = notes
            if canon:
                canon_to_pids[norm(canon)].append(pid)

    print(f"Loaded {len(pt_canon)} PT rows, {len(canon_to_pids)} unique normalized canonicals.")

    hard_stub: list[str]   = []
    hard_marked: list[str] = []
    warn_other: list[str]  = []
    n_rows = 0
    n_self_alias = 0
    n_token_swap = 0
    n_files_scanned = 0

    for src in ALIAS_SOURCES:
        path = src["path"]
        if not path.exists():
            print(f"  SKIP {src['label']} (not found)")
            continue
        n_files_scanned += 1
        n_in_file = 0
        with path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                n_rows += 1
                n_in_file += 1
                alias_text = (r.get(src["alias_col"]) or "").strip()
                target_pid = (r.get(src["pid_col"])  or "").strip()
                if not alias_text or not target_pid:
                    continue

                alias_norm   = norm(alias_text)
                target_canon = pt_canon.get(target_pid, "")

                # Self-alias — fine.
                if alias_norm == norm(target_canon):
                    n_self_alias += 1
                    continue

                # Token-order swap (intentional last-first variant) — skip.
                if is_token_order_swap(alias_text, target_canon):
                    n_token_swap += 1
                    continue

                # Does alias_text match a PT canonical at a different pid?
                other_pids = [
                    p for p in canon_to_pids.get(alias_norm, []) if p != target_pid
                ]
                if not other_pids:
                    continue

                target_source = pt_source.get(target_pid, "")
                target_notes  = pt_notes.get(target_pid, "")
                for other_pid in other_pids:
                    other_source = pt_source.get(other_pid, "")
                    detail = (
                        f"[{src['label']}] alias {alias_text!r} -> {target_pid[:8]} "
                        f"(target canon={target_canon!r}, source={target_source!r}); "
                        f"alias_text matches PT canonical at pid {other_pid[:8]} "
                        f"(canon={pt_canon.get(other_pid, '')!r}, source={other_source!r})"
                    )

                    # HARD: target is a stub-pattern source AND other is not.
                    target_is_stub = any(m in target_source for m in STUB_SOURCE_MARKERS)
                    other_is_stub  = any(m in other_source  for m in STUB_SOURCE_MARKERS)
                    if target_is_stub and not other_is_stub:
                        hard_stub.append(detail)
                        continue

                    # HARD: target's notes explicitly mark alias_text as removed/wrong/separated.
                    notes_low = target_notes.lower()
                    if alias_norm in notes_low and any(k in notes_low for k in REMOVAL_KEYWORDS):
                        hard_marked.append(detail + f"  notes={target_notes!r}")
                        continue

                    # Otherwise: a canonical-name collision without strong stale-alias signal.
                    warn_other.append(detail)
        print(f"  scanned {src['label']}: {n_in_file} rows")

    if n_files_scanned == 0:
        print("ERROR: no alias source files found", file=sys.stderr)
        return 2

    n_hard = len(hard_stub) + len(hard_marked)
    n_warn = len(warn_other)

    print()
    print("=" * 72)
    print(f"Alias-misrouting QC — {n_rows} alias rows across "
          f"{n_files_scanned} source(s)")
    print("=" * 72)

    print(f"\nHARD FAILURES: {n_hard}")
    if hard_stub:
        print(f"  alias_target_is_stub ({len(hard_stub)}):", file=sys.stderr)
        for m in hard_stub:
            print(f"    - {m}", file=sys.stderr)
    if hard_marked:
        print(f"  alias_target_notes_marked_removed ({len(hard_marked)}):", file=sys.stderr)
        for m in hard_marked:
            print(f"    - {m}", file=sys.stderr)

    print(f"\nWARNINGS: {n_warn}")
    if warn_other:
        print(f"  alias_canonical_collision ({len(warn_other)}):")
        cap = max(0, args.max_warn)
        for m in warn_other[:cap]:
            print(f"    - {m}")
        if len(warn_other) > cap:
            print(f"    ... ({len(warn_other) - cap} more; rerun with --max-warn N to see more)")

    print()
    print(f"  self-alias rows skipped: {n_self_alias}")
    print(f"  token-order swap rows skipped: {n_token_swap}")
    print()
    if n_hard:
        print(f"FAIL: {n_hard} hard failure(s); {n_warn} warning(s).", file=sys.stderr)
        return 1
    print(f"PASS: 0 hard failures; {n_warn} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
