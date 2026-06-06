#!/usr/bin/env python3
"""Generate src/content/freestyleTrackedNames.ts from the reconciliation audit.

Emits the list of documented freestyle trick names that are NOT
canonically published, grouped by documenting source, for the
/freestyle/observational page. Where the reconciliation master already
records a symbolic / operational notation for a name, that notation is
carried verbatim alongside the name.

Sources:
  - exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv
      the unpublished name set + primary documenting source
  - exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
      the `symbolic_notation_raw` operational notation, verbatim

Notation rules (deliberate constraints):
  - Notation is taken verbatim from the master's `symbolic_notation_raw`.
    No formula is invented, derived, or normalised here.
  - `add_formula` is NOT used: it carries ADD totals, and this surface
    makes no ADD claims. `symbolic_notation_raw` is a pure operational
    decomposition with no difficulty number.
  - Names are grouped by SOURCE, not ADD: the /freestyle/observational
    page contract forbids grouping by external ADD claim.

Output: src/content/freestyleTrackedNames.ts
Re-runnable; regenerate when the audit or master refreshes.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RECON = REPO / 'exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv'
MASTER = REPO / 'exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv'
OUT = REPO / 'src/content/freestyleTrackedNames.ts'
# Live platform DB. The authoritative canonical/alias gate: a slug active in
# freestyle_tricks, or registered in freestyle_trick_aliases, must never appear
# on the tracked surface. The static CSVs above drift; the DB does not.
DB = REPO / 'database/footbag.db'

# Canonical CSVs read by loader 17. Slugs present in any of these are
# canonical-published, regardless of the reconciliation CSV's recorded
# governance_state. Filtering against these as a second gate prevents
# stale rows from leaking onto the observational page when the
# reconciliation audit is out of sync with the canonical CSVs.
TRICKS_CSV = REPO / 'legacy_data/inputs/noise/tricks.csv'
RED_ADD_CSV = REPO / 'legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv'

SOURCE_PRIORITY = ['footbagmoves', 'fborg', 'passback', 'curator']
SOURCE_LABEL = {
    'footbagmoves': 'FootbagMoves',
    'fborg':        'footbag.org',
    'passback':     'PassBack',
    'curator':      'Curator-recorded',
}
CONF_RANK = {'high': 3, 'medium': 2, 'low': 1, 'none': 0, '': 0}


def norm(s: str) -> str:
    s = re.sub(r'\([^)]*\)', '', s or '')
    return re.sub(r'\s+', ' ', s.strip().lower()
                  .replace('*', '').replace("'", '').replace('.', '')).strip()


def primary_source(sources: str) -> str:
    present = {s.strip() for s in (sources or '').split(',') if s.strip()}
    for s in SOURCE_PRIORITY:
        if s in present:
            return s
    return next(iter(present), 'other')


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'")


def main() -> None:
    # ── master: best symbolic_notation_raw per normalised name ──────
    notation: dict[str, tuple[str, str, str]] = {}  # norm -> (raw, provenance, conf)
    with MASTER.open(newline='') as f:
        for r in csv.DictReader(f):
            raw = (r.get('symbolic_notation_raw') or '').strip()
            if not raw:
                continue
            conf = (r.get('parse_confidence') or '').strip().lower()
            prov = SOURCE_LABEL.get(r.get('source', ''), r.get('source', ''))
            cand = (raw, prov, conf)
            for key in {norm(r.get('move_name', '')), norm(r.get('display_name', ''))}:
                if not key:
                    continue
                if key not in notation or CONF_RANK.get(conf, 0) > CONF_RANK.get(notation[key][2], 0):
                    notation[key] = cand

    # ── canonical-CSV gate: collect slugs already canonical-published ──
    # Loader 17 reads tricks.csv (column trick_canon) + red_additions
    # (column canonical_name). Any slug in either CSV is canonical and
    # must not appear on the observational tracked-names list,
    # regardless of the reconciliation CSV's recorded governance_state.
    canonical_slugs: set[str] = set()
    if TRICKS_CSV.exists():
        with TRICKS_CSV.open(newline='') as f:
            for r in csv.DictReader(f):
                slug = (r.get('trick_canon') or '').strip()
                if slug:
                    canonical_slugs.add(slug)
    if RED_ADD_CSV.exists():
        with RED_ADD_CSV.open(newline='') as f:
            for r in csv.DictReader(f):
                slug = (r.get('canonical_name') or '').strip()
                if slug:
                    canonical_slugs.add(slug)

    # ── live-DB gate (authoritative) ── exclude every slug that is an active
    # canonical trick or a registered alias. Read-only; closes the drift the
    # static CSVs leave open.
    if DB.exists():
        con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
        try:
            for (s,) in con.execute('SELECT slug FROM freestyle_tricks WHERE is_active = 1'):
                if s:
                    canonical_slugs.add(s.strip())
            for (s,) in con.execute('SELECT alias_slug FROM freestyle_trick_aliases'):
                if s:
                    canonical_slugs.add(s.strip())
        finally:
            con.close()

    # ── reconciliation audit: the unpublished name set ──────────────
    with RECON.open(newline='') as f:
        recon = list(csv.DictReader(f))
    # Two-gate filter:
    #   1. governance_state must not be "1 Published Canonical"
    #   2. slug must not appear in any canonical CSV
    # The second gate is a safety net for drift between the reconciliation
    # audit and the canonical CSVs (e.g. when a W-wave promotes a row to
    # red_additions but the reconciliation audit governance_state isn't
    # updated in the same change).
    unpublished = [
        r for r in recon
        if not r['governance_state'].startswith('1')
        and r['slug'].strip() not in canonical_slugs
    ]

    by_source: dict[str, list[dict]] = defaultdict(list)
    seen: set[str] = set()
    with_formula = 0
    for r in unpublished:
        name = r['name'].strip()
        if not name:
            continue
        key = norm(name)
        if key in seen:
            continue
        seen.add(key)
        entry: dict[str, str] = {'displayName': name, 'slug': r['slug'].strip()}
        if key in notation:
            raw, prov, conf = notation[key]
            entry['operationalNotation'] = raw
            entry['formulaProvenance'] = prov
            if conf and conf != 'none':
                entry['formulaConfidence'] = conf
            with_formula += 1
        by_source[primary_source(r['sources'])].append(entry)

    order = sorted(by_source, key=lambda s: -len(by_source[s]))
    total = sum(len(by_source[s]) for s in order)

    # ── emit the TypeScript content module ──────────────────────────
    lines = [
        '// freestyleTrackedNames.ts',
        '// ============================',
        '// GENERATED FILE — do not hand-edit.',
        '// Regenerate: python3 legacy_data/scripts/build_tracked_names_content.py',
        '//',
        '// Documented freestyle trick names tracked in the project vocabulary',
        '// corpus that are NOT yet canonically published, grouped by',
        '// documenting source. Where the reconciliation master already records',
        '// a symbolic / operational notation, it is carried verbatim — no',
        '// formula is invented or derived, and no ADD claim is made.',
        '//',
        '// Grouped by SOURCE, not ADD: the /freestyle/observational page',
        '// contract forbids grouping by external ADD claim.',
        '//',
        '// Source: the 2026-05-21 cross-source vocabulary reconciliation audit',
        '// + SYMBOLIC_GRAMMAR_MASTER.csv (symbolic_notation_raw).',
        '// Reversible content module per [[feedback_reversible_content_governance]].',
        '',
        'export interface TrackedName {',
        '  /** Trick name as documented by the source. */',
        '  readonly displayName: string;',
        '  /** Stable slug — the tag-like identity, shown as a #slug tracked tag. */',
        '  readonly slug: string;',
        '  /** Symbolic / operational notation, verbatim from the reconciliation',
        '   *  master where one is already recorded. Absent when none exists. */',
        '  readonly operationalNotation?: string;',
        '  /** Corpus the notation was recorded in. */',
        '  readonly formulaProvenance?: string;',
        '  /** Parser confidence in the notation, where recorded. */',
        '  readonly formulaConfidence?: string;',
        '}',
        '',
        'export interface TrackedNameGroup {',
        '  /** Documenting-source display label, e.g. "FootbagMoves". */',
        '  readonly sourceLabel: string;',
        '  /** Trick names primarily documented by this source, alphabetical. */',
        '  readonly names: readonly TrackedName[];',
        '}',
        '',
        '/** Total tracked-but-unpublished names across all sources. */',
        f'export const TRACKED_UNPUBLISHED_TOTAL = {total};',
        '',
        'export const TRACKED_UNPUBLISHED_NAMES: readonly TrackedNameGroup[] = [',
    ]
    for s in order:
        names = sorted(by_source[s], key=lambda e: e['displayName'].lower())
        lines.append(f"  {{ sourceLabel: '{esc(SOURCE_LABEL.get(s, s))}', names: [")
        for e in names:
            parts = [f"displayName: '{esc(e['displayName'])}'", f"slug: '{esc(e['slug'])}'"]
            if 'operationalNotation' in e:
                parts.append(f"operationalNotation: '{esc(e['operationalNotation'])}'")
                parts.append(f"formulaProvenance: '{esc(e['formulaProvenance'])}'")
                if 'formulaConfidence' in e:
                    parts.append(f"formulaConfidence: '{esc(e['formulaConfidence'])}'")
            lines.append('    { ' + ', '.join(parts) + ' },')
        lines.append('  ] },')
    lines.append('];')
    lines.append('')

    OUT.write_text('\n'.join(lines))
    without = total - with_formula
    print(f"Wrote {OUT.relative_to(REPO)}: {total} names across {len(order)} sources")
    print(f"  with operational notation:    {with_formula}")
    print(f"  without operational notation: {without}")
    for s in order:
        grp = by_source[s]
        wf = sum(1 for e in grp if 'operationalNotation' in e)
        print(f"  {SOURCE_LABEL.get(s, s):18s}: {len(grp):4d}  ({wf} with notation)")


if __name__ == '__main__':
    main()
