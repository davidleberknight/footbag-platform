#!/usr/bin/env python3
"""Cross-source freestyle vocabulary reconciliation audit.

Read-only. Reconciles every documented trick name across the master
spreadsheet (which already integrates footbagmoves / footbag.org /
PassBack) and the live freestyle_tricks table, classifying each unique
name into one of nine governance states.

Sources of record:
- exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
- database/footbag.db  (freestyle_tricks)

Output:
- exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv
  (one row per unique name)
- prints an aggregate stats block for the audit report.

State derivation is HEURISTIC (priority-ordered, first match) and
curator-refinable — the script documents each rule. No mutation, no
promotion.
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MASTER = REPO / 'exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv'
DB = REPO / 'database/footbag.db'
OUTDIR = REPO / 'exploration/vocabulary-reconciliation-audit-2026-05-21'


def norm(s: str) -> str:
    s = re.sub(r'\([^)]*\)', '', s or '')
    return re.sub(r'\s+', ' ', s.strip().lower()
                  .replace('*', '').replace("'", '').replace('.', '')).strip()


DOCTRINE_RE = re.compile(r'\b(doctrine|policy|wave[- ]?2|red |pt\d|adjudicat|divergen)', re.I)
AMBIG_RE = re.compile(r'\b(ambig|conflict|which reading|byte-identical|polysemy|unresolved q)', re.I)
PARSER_RE = re.compile(r'\b(parser|decompos|symbolic|notation not|self-atom|self_atom)', re.I)


def derive_state(c: dict) -> tuple[str, str]:
    """Return (governance_state, issue_type) for a unified name cluster."""
    blob = ' '.join([c['parser_notes'], c['unresolved_questions'],
                     c['provenance_notes']]).lower()
    # 1 — Published Canonical
    if c['in_db']:
        return ('1 Published Canonical', '')
    # 2 — Covered via alias / equivalence
    if c['equivalent_to'] and c['equiv_in_db']:
        return ('2 Covered via alias/equivalence', 'synonym drift / lexical-only variation')
    # 3 — Policy-dependent
    if c['doctrine_status'] == 'hedged' and DOCTRINE_RE.search(blob):
        return ('5 Policy-dependent', 'unresolved doctrine')
    # 4 — Structurally ambiguous
    if AMBIG_RE.search(blob):
        return ('7 Structurally ambiguous', 'ontology limitation / source conflict')
    # 5 — Pending symbolic resolution
    if c['doctrine_status'] in ('hedged', 'pending') or c['parse_confidence'] in ('none', 'low'):
        if c['doctrine_status'] in ('hedged', 'pending') or PARSER_RE.search(blob):
            return ('4 Pending symbolic resolution', 'parser limitation / ontology limitation')
    # 6 — Historical / obsolete naming
    if 'obsolete' in blob or 'deprecated' in blob or 'superseded' in blob:
        return ('6 Historical/obsolete naming', 'historical naming drift')
    # 7 — Insufficiently sourced
    if c['n_sources'] == 1 and c['add_confidence'] == 'low':
        return ('8 Insufficiently sourced', 'weak sourcing')
    # 8 — Observationally represented (residual)
    if c['publication_status'] == 'first_class_ready':
        return ('3 Observationally represented', 'accidental omission (publication-ready, not yet promoted)')
    return ('3 Observationally represented', 'accidental omission / awaiting curator review')


def main() -> None:
    OUTDIR.mkdir(exist_ok=True)

    # ── live DB ────────────────────────────────────────────────
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    dbrows = list(db.execute("SELECT slug,canonical_name,aliases_json FROM freestyle_tricks"))
    db.close()
    db_slugs = {r['slug'] for r in dbrows}
    db_names = {norm(r['canonical_name']) for r in dbrows}
    db_alias = set()
    for r in dbrows:
        try:
            for a in json.loads(r['aliases_json'] or '[]'):
                db_alias.add(norm(a))
        except Exception:
            pass
    db_all = db_slugs | db_names | db_alias

    # ── master, grouped into unique-name clusters ──────────────
    with MASTER.open(newline='') as f:
        master = list(csv.DictReader(f))
    clusters: dict[str, list[dict]] = defaultdict(list)
    for r in master:
        clusters[norm(r['move_name'])].append(r)

    def pick(rows, col, prefer):
        """Return the most-resolved value of col across cluster rows."""
        vals = [r[col].strip() for r in rows if r[col].strip()]
        for p in prefer:
            if p in vals:
                return p
        return vals[0] if vals else ''

    recon = []
    for key, rows in clusters.items():
        slug = pick(rows, 'canonical_slug', []) or key.replace(' ', '-')
        name = pick(rows, 'display_name', []) or rows[0]['move_name']
        equiv = pick(rows, 'equivalent_to', [])
        equiv_head = equiv.split('(')[0].strip().rstrip(';,').strip() if equiv else ''
        c = {
            'name': name,
            'slug': slug,
            'sources': ','.join(sorted({r['source'] for r in rows})),
            'n_sources': len({r['source'] for r in rows}),
            'source_adds': ','.join(sorted({r['source_adds'] for r in rows if r['source_adds']})),
            'in_db': (slug in db_slugs) or (key in db_all),
            'equivalent_to': equiv,
            'equiv_in_db': bool(equiv_head) and (equiv_head in db_all or norm(equiv_head) in db_all),
            'doctrine_status': pick(rows, 'doctrine_status', ['settled', 'hedged', 'pending']),
            'publication_status': pick(rows, 'publication_status',
                                       ['first_class_ready', 'candidate', 'observational', 'intake']),
            'parse_confidence': pick(rows, 'parse_confidence', ['high', 'medium', 'low', 'none']),
            'add_confidence': pick(rows, 'add_confidence', ['high', 'medium', 'low']),
            'family': pick(rows, 'derived_symbolic_family', []),
            'primary_operator': pick(rows, 'primary_operator', []),
            'add_formula': pick(rows, 'add_formula', []),
            'parser_notes': pick(rows, 'parser_notes', []),
            'unresolved_questions': pick(rows, 'unresolved_questions', []),
            'provenance_notes': ' | '.join({r['provenance_notes'] for r in rows if r['provenance_notes'].strip()}),
        }
        state, issue = derive_state(c)
        c['governance_state'] = state
        c['issue_type'] = issue
        recon.append(c)

    # ── DB-only names (canonical but not in the observational master) ──
    master_keys = set(clusters)
    for r in dbrows:
        if r['slug'] in {c['slug'] for c in recon}:
            continue
        if norm(r['canonical_name']) in master_keys:
            continue
        recon.append({
            'name': r['canonical_name'], 'slug': r['slug'],
            'sources': 'ifpa-canonical', 'n_sources': 1, 'source_adds': '',
            'in_db': True, 'equivalent_to': '', 'equiv_in_db': False,
            'doctrine_status': '', 'publication_status': '', 'parse_confidence': '',
            'add_confidence': '', 'family': '', 'primary_operator': '', 'add_formula': '',
            'parser_notes': 'Live canonical row; not present in the observational master corpus.',
            'unresolved_questions': '', 'provenance_notes': '',
            'governance_state': '1 Published Canonical', 'issue_type': '',
        })

    # ── write the unified reconciliation CSV ───────────────────
    cols = ['name', 'slug', 'governance_state', 'issue_type', 'sources', 'n_sources',
            'source_adds', 'in_db', 'equivalent_to', 'doctrine_status',
            'publication_status', 'parse_confidence', 'add_confidence', 'family',
            'primary_operator', 'add_formula', 'parser_notes', 'unresolved_questions',
            'provenance_notes']
    recon.sort(key=lambda c: (c['governance_state'], c['name'].lower()))
    with (OUTDIR / 'RECONCILIATION.csv').open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL, extrasaction='ignore')
        w.writeheader()
        w.writerows(recon)

    # ── aggregate stats for the report ─────────────────────────
    print(f"Unique names reconciled: {len(recon)}")
    print(f"  (from {len(master)} master rows + {len(dbrows)} DB rows)\n")
    print("Governance-state distribution:")
    for st, n in sorted(Counter(c['governance_state'] for c in recon).items()):
        print(f"  {st}: {n}")
    print("\nIssue-type distribution (non-canonical entries):")
    for it, n in Counter(c['issue_type'] for c in recon if c['issue_type']).most_common():
        print(f"  {n:4d}  {it}")
    print("\nCross-source presence:")
    print(f"  in 2+ sources: {sum(1 for c in recon if c['n_sources'] >= 2)}")
    print(f"  DB-only (canonical, not in observational master): "
          f"{sum(1 for c in recon if c['sources'] == 'ifpa-canonical')}")
    fc_ready_unpub = [c for c in recon if c['publication_status'] == 'first_class_ready'
                      and not c['in_db']]
    print(f"\nHigh-ROI publication candidates (first_class_ready, not in DB): {len(fc_ready_unpub)}")
    print(f"\nWrote: {OUTDIR.name}/RECONCILIATION.csv")


if __name__ == '__main__':
    main()
