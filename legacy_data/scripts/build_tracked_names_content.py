#!/usr/bin/env python3
"""Generate src/content/freestyleTrackedNames.ts from the reconciliation audit.

Reads the cross-source vocabulary reconciliation audit and emits the
list of documented freestyle trick names that are NOT canonically
published — grouped by documenting source — as a TypeScript content
module for the /freestyle/observational page.

Grouping is by SOURCE (FootbagMoves / footbag.org / PassBack), not by
ADD: the observational page's contract forbids grouping by external
ADD claim (a claimed ADD is often a relative modifier delta, not a
canonical difficulty class). A name documented in more than one source
is listed once, under its primary documenting source.

Source:  exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv
Output:  src/content/freestyleTrackedNames.ts

Re-runnable; regenerate when the audit refreshes.
"""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RECON = REPO / 'exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv'
OUT = REPO / 'src/content/freestyleTrackedNames.ts'

# Primary-source priority + display labels.
SOURCE_PRIORITY = ['footbagmoves', 'fborg', 'passback', 'curator']
SOURCE_LABEL = {
    'footbagmoves': 'FootbagMoves',
    'fborg':        'footbag.org',
    'passback':     'PassBack',
    'curator':      'Curator-recorded',
}


def primary_source(sources: str) -> str:
    present = {s.strip() for s in (sources or '').split(',') if s.strip()}
    for s in SOURCE_PRIORITY:
        if s in present:
            return s
    return next(iter(present), 'other')


def main() -> None:
    with RECON.open(newline='') as f:
        rows = list(csv.DictReader(f))

    # Unpublished = every name NOT in governance state "1 Published Canonical".
    unpublished = [r for r in rows if not r['governance_state'].startswith('1')]

    by_source: dict[str, set[str]] = defaultdict(set)
    for r in unpublished:
        name = r['name'].strip()
        if name:
            by_source[primary_source(r['sources'])].add(name)

    # Order groups largest-first.
    order = sorted(by_source, key=lambda s: -len(by_source[s]))
    total = sum(len(by_source[s]) for s in order)

    def esc(s: str) -> str:
        return s.replace('\\', '\\\\').replace("'", "\\'")

    lines = [
        '// freestyleTrackedNames.ts',
        '// ============================',
        '// GENERATED FILE — do not hand-edit.',
        '// Regenerate: python3 legacy_data/scripts/build_tracked_names_content.py',
        '//',
        '// Documented freestyle trick names tracked in the project vocabulary',
        '// corpus that are NOT yet canonically published, grouped by',
        '// documenting source. A name documented in more than one source is',
        '// listed once, under its primary source.',
        '//',
        '// Grouped by SOURCE, not ADD: the /freestyle/observational page',
        '// contract forbids grouping by external ADD claim (a claimed ADD is',
        '// often a relative modifier delta, not a canonical difficulty class).',
        '//',
        '// Source: the 2026-05-21 cross-source vocabulary reconciliation audit',
        '// (exploration/vocabulary-reconciliation-audit-2026-05-21/).',
        '// Reversible content module per [[feedback_reversible_content_governance]].',
        '',
        'export interface TrackedNameGroup {',
        '  /** Documenting-source display label, e.g. "FootbagMoves". */',
        '  readonly sourceLabel: string;',
        '  /** Trick names primarily documented by this source, alphabetical. */',
        '  readonly names: readonly string[];',
        '}',
        '',
        '/** Total tracked-but-unpublished names across all sources. */',
        f'export const TRACKED_UNPUBLISHED_TOTAL = {total};',
        '',
        'export const TRACKED_UNPUBLISHED_NAMES: readonly TrackedNameGroup[] = [',
    ]
    for s in order:
        names = sorted(by_source[s], key=str.lower)
        lines.append(f"  {{ sourceLabel: '{esc(SOURCE_LABEL.get(s, s))}', names: [")
        row: list[str] = []
        for nm in names:
            row.append(f"'{esc(nm)}'")
            if len(row) == 4:
                lines.append('    ' + ', '.join(row) + ',')
                row = []
        if row:
            lines.append('    ' + ', '.join(row) + ',')
        lines.append('  ] },')
    lines.append('];')
    lines.append('')

    OUT.write_text('\n'.join(lines))
    print(f"Wrote {OUT.relative_to(REPO)}: {total} names across {len(order)} sources")
    for s in order:
        print(f"  {SOURCE_LABEL.get(s, s):18s}: {len(by_source[s])}")


if __name__ == '__main__':
    main()
