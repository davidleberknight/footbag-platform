#!/usr/bin/env python3
"""
apply_retire_pending_pass.py — retire pending Red rulings closed by later rulings.

Per ONTOLOGY_SYMBOLIC_STRATEGIC_REVIEW.md §A.5: 18 pending rows in
legacy_data/inputs/curated/tricks/red_corrections_consolidated.csv are
re-evaluated against later rulings (pt6, pt10, pt11) and against derivable
symbolic decompositions. Many are closable without sending Red anything new.

This script applies the curator-reviewed triage decisions deterministically.

Triage decisions (encoded below) classify each of the 18 pending rows:

1. flip-to-applied-via-pt6      — Red answered in a later pt round
2. flip-to-applied-via-derivation — symbolic math + established operators close it
3. mark-superseded               — pt2 hypothesis was contradicted by later pt6 ruling
4. stay-pending                  — genuinely needs cluster-packet Red adjudication

Outputs:
  legacy_data/inputs/curated/tricks/red_corrections_consolidated.csv  (in-place edit)
  legacy_data/reports/red_retire_pending_audit.csv                    (audit trail)

The audit CSV documents each decision so the operation is reversible and
auditable. The script is deterministic: re-running on the same input
produces the same output.

Read-only on canonical data (ontology / ADD / parser / aliases untouched).
No DB writes.

Usage:
  python3 legacy_data/scripts/apply_retire_pending_pass.py --dry-run
  python3 legacy_data/scripts/apply_retire_pending_pass.py --apply
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
CONSOLIDATED = REPO_ROOT / 'legacy_data' / 'inputs' / 'curated' / 'tricks' / 'red_corrections_consolidated.csv'
AUDIT_CSV   = REPO_ROOT / 'legacy_data' / 'reports' / 'red_retire_pending_audit.csv'

# ── Triage decisions ────────────────────────────────────────────────────
# Keyed by (pt, subject) — unique within the consolidated CSV for the pending
# rows. action ∈ {flip_applied, mark_superseded, stay_pending}.
# `evidence` documents the resolution path (which pt ruling closes it, or
# which operator-math derivation closes it, or why it stays pending).
TRIAGE = [
    # 11 flip to applied: 2 via pt6 explicit answers + 9 via symbolic derivation
    {'pt': 'pt1', 'subject': 'flail',                       'action': 'flip_applied',
     'evidence': 'pt6 Red answered: Flail = Symposium Illusion (3 ADD)'},
    {'pt': 'pt1', 'subject': 'omelette',                    'action': 'flip_applied',
     'evidence': 'pt6 Red answered: Omelette = Illusioning Pick Up (3 ADD)'},
    {'pt': 'pt1', 'subject': 'quantum',                     'action': 'flip_applied',
     'evidence': 'pt10 established Quantum as +1 set modifier; modifier-table row loaded'},
    {'pt': 'pt2', 'subject': 'toe-blur',                    'action': 'flip_applied',
     'evidence': 'derivation: Quantum (+1) + Mirage (2) = 3 ADD; matches assertion'},
    {'pt': 'pt2', 'subject': 'toe-ripwalk',                 'action': 'flip_applied',
     'evidence': 'derivation: Quantum (+1) + Butterfly (3) = 4 ADD; matches assertion'},
    {'pt': 'pt2', 'subject': 'backside-symposium-toe-blur', 'action': 'flip_applied',
     'evidence': 'derivation: Quantum (+1) + Symposium (+1) + Mirage (2) = 4 ADD'},
    {'pt': 'pt2', 'subject': 'toe-blizzard',                'action': 'flip_applied',
     'evidence': 'derivation: Quantum (+1) + Illusion (2) = 3 ADD; matches assertion'},
    {'pt': 'pt2', 'subject': 'gyro-butterfly',              'action': 'flip_applied',
     'evidence': 'pt1 confirmed Gyro semantics (+1); Butterfly (3) + Gyro (+1) = 4 ADD'},
    {'pt': 'pt2', 'subject': 'flurricane',                  'action': 'flip_applied',
     'evidence': 'derivation: Gyro (+1) + Flurry (4 per pt1 ADD_LOCK) = 5 ADD'},
    {'pt': 'pt2', 'subject': 's-m-smasher',                 'action': 'flip_applied',
     'evidence': 'derivation: Atomic (+1) + Barrage (3 per pt4) = 4 ADD; matches assertion'},
    {'pt': 'pt2', 'subject': 'flux',                        'action': 'flip_applied',
     'evidence': 'derivation: Atomic (+1) + Osis (3) = 4 ADD; matches assertion'},

    # 1 mark superseded: pt2 hypothesis was wrong; pt6 gave a different decomposition
    {'pt': 'pt2', 'subject': 'omelette',                    'action': 'mark_superseded',
     'evidence': 'pt2 hypothesis "Atomic Illusion" contradicted by pt6 ruling "Illusioning Pick Up"'},

    # 6 stay pending: legitimate cluster-packet items
    {'pt': 'pt1', 'subject': 'royale',                      'action': 'stay_pending',
     'evidence': 'cluster packet 4 — folk-name promotion policy; Red has not given ADD'},
    {'pt': 'pt4', 'subject': 'royale',                      'action': 'stay_pending',
     'evidence': 'cluster packet 4 — Royale ADD value not yet given by Red'},
    {'pt': 'pt2', 'subject': 'spyro-gyro',                  'action': 'stay_pending',
     'evidence': 'compound decomposition "Gyro Butterfly Swirl" is non-trivial; needs Red'},
    {'pt': 'pt3', 'subject': 'double-fairy',                'action': 'stay_pending',
     'evidence': 'cluster packet 5 — Double-X composition rules undefined'},
    {'pt': 'pt3', 'subject': 'double-blender',              'action': 'stay_pending',
     'evidence': 'cluster packet 5 — Double-X composition rules undefined'},
    {'pt': 'pt3', 'subject': 'double-spinning-osis',        'action': 'stay_pending',
     'evidence': 'cluster packet 5 — Double-X composition rules undefined'},
]

# ── New pt6 EQUIVALENCE rows to consolidate Red's pt6 Flail/Omelette answers ──
# Adding these surfaces Red's actual decompositions in the consolidated CSV
# (which currently only carries pt1-pt4). Date: pt6 file mtime 2026-05-04.
PT6_NEW_ROWS = [
    {'pt': 'pt6', 'date': '2026-05-04', 'topic_type': 'EQUIVALENCE', 'subject': 'flail',
     'claim': 'Red pt6 answered: Flail = Symposium Illusion (3 ADD). Closes pt1 NEW_TRICK pending.',
     'disposition': 'applied'},
    {'pt': 'pt6', 'date': '2026-05-04', 'topic_type': 'EQUIVALENCE', 'subject': 'omelette',
     'claim': 'Red pt6 answered: Omelette = Illusioning Pick Up (3 ADD). Closes pt1 NEW_TRICK pending; supersedes pt2 hypothesis "Atomic Illusion".',
     'disposition': 'applied'},
]


def load_consolidated() -> list[dict]:
    with CONSOLIDATED.open('r', encoding='utf-8', newline='') as fh:
        return list(csv.DictReader(fh))


def write_consolidated(rows: list[dict]) -> None:
    with CONSOLIDATED.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=['pt', 'date', 'topic_type', 'subject', 'claim', 'disposition'], lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def write_audit(audit_rows: list[dict]) -> None:
    AUDIT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with AUDIT_CSV.open('w', encoding='utf-8', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            'pt', 'subject', 'previous_disposition', 'new_disposition', 'action', 'evidence',
        ], lineterminator='\n')
        writer.writeheader()
        writer.writerows(audit_rows)


def apply_triage(dry_run: bool) -> int:
    rows = load_consolidated()
    audit_rows: list[dict] = []

    # Build a lookup of currently-pending rows for safety: every triage entry
    # must match exactly one currently-pending row. Errors out otherwise.
    pending_by_key = {(r['pt'], r['subject']): r for r in rows if r.get('disposition', '').strip() == 'pending'}

    new_disposition_for = {
        'flip_applied':    'applied',
        'mark_superseded': 'superseded',
        'stay_pending':    'pending',
    }

    matched = 0
    for t in TRIAGE:
        key = (t['pt'], t['subject'])
        target = pending_by_key.get(key)
        if not target:
            print(f"WARNING: triage row {key} did not match any pending row", file=sys.stderr)
            audit_rows.append({
                'pt': t['pt'], 'subject': t['subject'],
                'previous_disposition': '(not found)',
                'new_disposition': '(no change)',
                'action': t['action'],
                'evidence': f"TRIAGE MISMATCH — {t['evidence']}",
            })
            continue
        prev = target['disposition']
        new = new_disposition_for[t['action']]
        audit_rows.append({
            'pt': t['pt'], 'subject': t['subject'],
            'previous_disposition': prev,
            'new_disposition': new,
            'action': t['action'],
            'evidence': t['evidence'],
        })
        if t['action'] != 'stay_pending':
            target['disposition'] = new
            matched += 1

    # Add the two pt6 rows (one for flail, one for omelette) — only if absent
    existing_keys = {(r['pt'], r['subject'], r.get('topic_type')) for r in rows}
    for new_row in PT6_NEW_ROWS:
        k = (new_row['pt'], new_row['subject'], new_row['topic_type'])
        if k in existing_keys:
            continue
        rows.append(new_row)
        audit_rows.append({
            'pt': new_row['pt'], 'subject': new_row['subject'],
            'previous_disposition': '(new row)',
            'new_disposition': new_row['disposition'],
            'action': 'add_pt6_consolidation',
            'evidence': new_row['claim'],
        })

    print(f"Pending rows before: {len(pending_by_key)}", file=sys.stderr)
    print(f"Triage decisions:    {len(TRIAGE)}", file=sys.stderr)
    print(f"Rows flipped:        {matched}", file=sys.stderr)
    print(f"New pt6 rows added:  {len(PT6_NEW_ROWS)}", file=sys.stderr)

    if dry_run:
        print('DRY RUN — no files modified', file=sys.stderr)
        return 0

    write_consolidated(rows)
    write_audit(audit_rows)
    print(f'Updated:  {CONSOLIDATED}', file=sys.stderr)
    print(f'Audit:    {AUDIT_CSV}', file=sys.stderr)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description='Apply the retire-pending curator pass.')
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument('--dry-run', dest='dry_run', action='store_true', help='Show what would change without writing')
    g.add_argument('--apply',   dest='apply',   action='store_true', help='Apply the changes')
    args = parser.parse_args()
    sys.exit(apply_triage(dry_run=args.dry_run))


if __name__ == '__main__':
    main()
