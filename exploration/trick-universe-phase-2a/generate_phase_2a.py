#!/usr/bin/env python3
"""
Trick Universe Research, Phase II-A: grammar enumeration of the 0-and-1-dexterity
movement universe.

Exploratory research under exploration/. Not production data, not doctrine, not a
change to the live dictionary. Reads nothing from production code and writes only
under this folder. It enumerates every structurally valid movement FORMULA (never
a name) within an aggressive limit, using only the established grammar documented
in freestyle/research/trick-universe-matrix/ (Slices 0-7): the 5-D surface lattice
launch x dex_side x direction x terminal_side x landing, the eight-vertex dex
cube, and the three preservation rules (grade / laterality / launch-symmetry).

Scope limit (Phase II-A):
  - zero or one dexterity
  - established surfaces, notation, roles only (the closed code vocabulary)
  - no undefined operators, no doctrine-blocked constructs, no parser extensions,
    no hypothetical notation
  - body-operator DECORATION (each +1 body operator that adds a [BOD]/[PDX] event
    without a new dex) is a documented composition layer, counted but NOT expanded
    here; expanding its power set is the combinatorial step this phase brackets.

Output:
  - phase_2a_movement_formulas.csv : one row per generated formula
  - printed classification summary (also copied into the paper)
"""
import csv
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# 1. Established vocabulary (grounded in Slice 0/1 and the fiber lattice).
# ---------------------------------------------------------------------------

# Landing surfaces: grade (plain=1 / hard=2) and laterality (paired / midline).
# Cross-body clipper is grade-2 via [XBD][DEL]; unusual heel/sole/cloud via [UNS][DEL].
LANDINGS = {
    # plain paired (Phase I fibers, cube-preserving)
    'toe':      dict(grade=1, role='[DEL]',        lateral='paired',  kind='plain'),
    'inside':   dict(grade=1, role='[DEL]',        lateral='paired',  kind='plain'),
    'outside':  dict(grade=1, role='[DEL]',        lateral='paired',  kind='plain'),
    'knee':     dict(grade=1, role='[DEL]',        lateral='paired',  kind='plain'),
    'shoulder': dict(grade=1, role='[DEL]',        lateral='paired',  kind='plain'),
    # plain midline (Phase II fibers, cube-halving)
    'head':     dict(grade=1, role='[DEL]',        lateral='midline', kind='plain'),
    'forehead': dict(grade=1, role='[DEL]',        lateral='midline', kind='plain'),
    'neck':     dict(grade=1, role='[DEL]',        lateral='midline', kind='plain'),
    'peak':     dict(grade=1, role='[DEL]',        lateral='midline', kind='plain'),   # open-Q surface
    # hard (Phase III fibers, cube-lifting)
    'clipper':  dict(grade=2, role='[XBD] [DEL]',  lateral='paired',  kind='xbody'),
    'heel':     dict(grade=2, role='[UNS] [DEL]',  lateral='paired',  kind='unusual'),
    'sole':     dict(grade=2, role='[UNS] [DEL]',  lateral='paired',  kind='unusual'),
    'cloud':    dict(grade=2, role='[UNS] [DEL]',  lateral='midline', kind='unusual'),
}

# Launch types with symmetry. toe = central symmetric; clipper = cross-body
# (forecloses the SAME dex-side face); self = self-lateral symmetric (X launches
# and lands on the same paired plain surface). The generic 'SET' launch is an
# abstraction, so it is not enumerated as a concrete formula here.
LAUNCHES = ['toe', 'clipper', 'self']

# The eight-vertex dex cube: dex_side x direction x terminal_side.
DEX_SIDES  = ['SAME', 'OP']
DIRECTIONS = ['IN', 'OUT']
TERM_SIDES = ['SAME', 'OP']

# 'peak' is an unresolved surface (Slice 2B open question: apex vs timing marker).
UNCERTAIN_SURFACES = {'peak'}

# ---------------------------------------------------------------------------
# 2. Named coordinates (annotations, drawn from Slices 2/2B; names are labels).
#    key = (launch, landing, dex_side, direction, terminal_side) -> label kind.
# ---------------------------------------------------------------------------
# Toe fiber: the fully-named eight-vertex cube (the foundational atoms).
TOE_CUBE_NAMES = {
    ('SAME', 'IN',  'SAME'): 'around_the_world',
    ('SAME', 'OUT', 'SAME'): 'orbit',
    ('SAME', 'IN',  'OP'):   'pixie',
    ('SAME', 'OUT', 'OP'):   'fairy',
    ('OP',   'IN',  'OP'):   'mirage',
    ('OP',   'OUT', 'OP'):   'illusion',
    ('OP',   'IN',  'SAME'): 'pickup',
    ('OP',   'OUT', 'SAME'): 'legover',
}
# Named vertices off the toe fiber (from two_add_surface_fibers.csv). Split by
# whether the public name is the structural description (existing) or an opaque
# folk name for the same coordinate (existing-under-another-name).
NAMED_OFF_TOE_STRUCTURAL = {
    ('self','inside', 'SAME', 'IN',  'SAME'): 'inside_around_the_world',
    ('self','outside','SAME', 'OUT', 'SAME'): 'outside_around_the_world',
}
NAMED_OFF_TOE_FOLK = {
    ('toe', 'inside', 'OP',   'IN',  'SAME'): 'guay',                     # = inside pickup
    ('toe', 'inside', 'SAME', 'IN',  'OP'):   'inspinning_reverse_guay',  # = inside pixie
    ('clipper','toe', 'OP',   'OUT', 'OP'):   'bubba',                    # = clipper-launched illusion
}
# Toe-cube vertices whose dex shape also carries a set-operator name (a note,
# not a separate class): pixie/fairy are set operators; mirage <-> miraging;
# illusion <-> atomic uptime family.
SET_OP_NOTE = {'pixie': 'pixie', 'fairy': 'fairy', 'mirage': 'miraging', 'illusion': 'atomic-family'}
# Named 0-dex stalls (plain surfaces) and the two hard stalls, from Slice 1.
NAMED_STALLS = {
    'toe': 'toe_stall', 'inside': 'inside_stall', 'outside': 'outside_stall',
    'knee': 'knee_stall', 'neck': 'neck_stall', 'head': 'head_stall',
    'forehead': 'forehead_stall', 'shoulder': 'shoulder_stall', 'peak': 'peak_stall',
    'clipper': 'clipper_stall',
}
# Named 0-dex kicks (Slice 1); scoring of a BARE surface kick is an open question.
NAMED_KICKS = {'sole': 'sole_kick', 'cloud': 'cloud_kick'}
# Named 0-dex body steps.
NAMED_BODY = {'spin': 'spin', 'flying-in': 'flying inside', 'flying-out': 'flying outside'}


def sym_launch(launch, landing):
    """Symbolic launch token for the formula string."""
    if launch == 'toe':     return 'TOE'
    if launch == 'clipper': return 'CLIP'
    return landing.upper()  # self-fiber launches from the landing surface


def classify_1dex(launch, landing, dex_side, direction, term_side):
    """Return (class, name_or_None, reason). Applies the three preservation rules."""
    L = LANDINGS[landing]
    # Rule guards produce grammar-blocked / uncertain first.
    if landing in UNCERTAIN_SURFACES:
        return ('grammar-uncertain', None, 'peak surface unresolved (apex vs timing marker)')
    if L['lateral'] == 'midline' and term_side != 'SAME':
        # Midline kills the terminal-side axis; only one central target exists.
        # Represent the single target as term_side=='SAME' canonical; the OP copy
        # is the forbidden duplicate.
        return ('grammar-blocked', None, 'midline landing: terminal-side axis dead (duplicate vertex)')
    if launch == 'clipper' and dex_side == 'SAME':
        return ('grammar-blocked', None, 'cross-body launch forecloses the SAME dex-side face (bag control)')
    # Surviving vertex: look up a name.
    key3 = (dex_side, direction, term_side)
    key5 = (launch, landing, dex_side, direction, term_side)
    if launch == 'toe' and landing == 'toe' and key3 in TOE_CUBE_NAMES:
        nm = TOE_CUBE_NAMES[key3]
        note = 'named foundational atom on the toe fiber'
        if nm in SET_OP_NOTE:
            note += f'; dex shape also named as set operator {SET_OP_NOTE[nm]}'
        return ('existing', nm, note)
    if key5 in NAMED_OFF_TOE_STRUCTURAL:
        return ('existing', NAMED_OFF_TOE_STRUCTURAL[key5], 'named vertex off the toe fiber (structural name)')
    if key5 in NAMED_OFF_TOE_FOLK:
        return ('existing-another-name', NAMED_OFF_TOE_FOLK[key5],
                'coordinate realized under an opaque folk name, not its structural description')
    return ('grammar-valid-unnamed', None, 'structurally valid, unlabeled coordinate')


def structural_family(launch, landing):
    """Group unnamed formulas by the fiber's structural family."""
    L = LANDINGS[landing]
    if L['kind'] == 'plain' and L['lateral'] == 'paired':
        base = 'plain-paired cube'
    elif L['kind'] == 'plain' and L['lateral'] == 'midline':
        base = 'plain-midline square'
    elif L['kind'] == 'xbody':
        base = 'cross-body lifted cube (grade 3)'
    else:
        base = 'unusual-surface lifted cube (grade 3)'
    launch_tag = {'toe': 'toe-launch', 'clipper': 'clipper-launch', 'self': 'self-fiber'}[launch]
    return f'{launch_tag} / {base}'


rows = []

# ---------------------------------------------------------------------------
# 3. Zero-dexterity layer.
# ---------------------------------------------------------------------------
# 3a. Held stalls: one per landing surface. ADD = grade.
for surf, L in LANDINGS.items():
    add = L['grade']
    formula = f'{surf.upper()} {L["role"]}'
    if surf in UNCERTAIN_SURFACES:
        cls, name, reason = 'grammar-uncertain', None, 'peak surface unresolved'
    else:
        name = NAMED_STALLS.get(surf)
        cls = 'existing' if name else 'grammar-valid-unnamed'
        reason = 'named stall' if name else 'structurally valid unlabeled stall'
    rows.append(dict(
        layer='0-dex stall', launch_surface='(set)', dex='none',
        movement_steps='hold', scored_events=L['role'].replace(' ', ''),
        terminal_surface=surf, add=add, symbolic_formula=formula,
        structural_family=f'{L["kind"]}-{L["lateral"]} stall',
        classification=cls, name=name or '', notes=reason))

# 3b. Bare body steps (single [BOD], 0 dex). spin / duck / dive / flying.
for body, disp in [('SPIN', 'spin'), ('DUCK', 'duck'), ('DIVE', 'dive'),
                   ('FLYING IN', 'flying inside'), ('FLYING OUT', 'flying outside')]:
    named = disp in {'spin', 'flying inside', 'flying outside'}
    rows.append(dict(
        layer='0-dex body', launch_surface='(set)', dex='none',
        movement_steps=body, scored_events='[BOD]', terminal_surface='(none)',
        add=1, symbolic_formula=f'{body} [BOD]',
        structural_family='bare body step',
        classification='existing' if named else 'grammar-valid-unnamed',
        name=disp if named else '',
        notes='named bare body action' if named else 'body operator with no bare-trick name (duck/dive)'))

# 3c. Bare surface kicks (0 dex): scoring of a bare surface kick is unresolved.
for surf in ('sole', 'cloud', 'heel', 'toe', 'inside'):
    name = NAMED_KICKS.get(surf)
    rows.append(dict(
        layer='0-dex kick', launch_surface='(set)', dex='none',
        movement_steps='kick', scored_events='[KICK]', terminal_surface=surf,
        add='?', symbolic_formula=f'{surf.upper()} [KICK]',
        structural_family='bare surface kick',
        classification='grammar-uncertain', name=name or '',
        notes='bare surface kick scores 1 in data but carries no scoring bracket (Slice 1 open gap)'))

# ---------------------------------------------------------------------------
# 4. One-dexterity layer: the cube over every (launch, landing) fiber.
# ---------------------------------------------------------------------------
for launch in LAUNCHES:
    for landing, L in LANDINGS.items():
        # Self-fibers only make sense for paired plain surfaces (launch==land).
        # 'toe' is excluded because the toe self-fiber IS the toe-launch reference
        # cube already generated above, so it would double-count.
        if launch == 'self' and not (L['kind'] == 'plain' and L['lateral'] == 'paired'):
            continue
        if launch == 'self' and landing == 'toe':
            continue
        for dex_side in DEX_SIDES:
            for direction in DIRECTIONS:
                for term_side in TERM_SIDES:
                    cls, name, reason = classify_1dex(launch, landing, dex_side, direction, term_side)
                    add = 1 + L['grade']
                    lt = sym_launch(launch, landing)
                    # terminal-side token only meaningful for paired landings.
                    tside = term_side if L['lateral'] == 'paired' else ''
                    term = f'{tside} {landing.upper()} {L["role"]}'.strip()
                    formula = f'{lt} > {dex_side} {direction} [DEX] > {term}'
                    rows.append(dict(
                        layer='1-dex', launch_surface=launch, dex=f'{dex_side} {direction}',
                        movement_steps=f'{dex_side} {direction} [DEX]',
                        scored_events='[DEX] + ' + L['role'].replace(' ', ''),
                        terminal_surface=(f'{tside} {landing}').strip(),
                        add=add, symbolic_formula=formula,
                        structural_family=structural_family(launch, landing),
                        classification=cls, name=name or '', notes=reason))

# ---------------------------------------------------------------------------
# 5. Write CSV + summary.
# ---------------------------------------------------------------------------
cols = ['layer', 'launch_surface', 'dex', 'movement_steps', 'scored_events',
        'terminal_surface', 'add', 'symbolic_formula', 'structural_family',
        'classification', 'name', 'notes']
csv_path = os.path.join(OUT_DIR, 'phase_2a_movement_formulas.csv')
with open(csv_path, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)

from collections import Counter
by_class = Counter(r['classification'] for r in rows)
by_layer = Counter(r['layer'] for r in rows)
print(f'total generated formulas: {len(rows)}')
print('\nby classification:')
for k in ['existing', 'existing-another-name', 'grammar-valid-unnamed',
          'grammar-blocked', 'grammar-uncertain']:
    print(f'  {k:24} {by_class.get(k,0)}')
print('\nby layer:')
for k, v in sorted(by_layer.items()):
    print(f'  {k:16} {v}')
print(f'\nCSV written: {csv_path}')

# Unnamed catalog grouped by structural family (for the catalog deliverable).
fam = Counter(r['structural_family'] for r in rows if r['classification'] == 'grammar-valid-unnamed')
print('\nunnamed formulas by structural family:')
for k, v in sorted(fam.items(), key=lambda x: -x[1]):
    print(f'  {v:4}  {k}')

# Write the grouped unnamed catalog (generated data artifact, like the CSV).
from collections import defaultdict
groups = defaultdict(list)
for r in rows:
    if r['classification'] == 'grammar-valid-unnamed':
        groups[r['structural_family']].append(r)
cat_path = os.path.join(OUT_DIR, 'UNNAMED_CATALOG.md')
with open(cat_path, 'w') as f:
    f.write('# Phase II-A: Catalog of Grammar-Valid-but-Unnamed Movement Formulas\n\n')
    f.write('Status: exploratory research under `exploration/`. Generated by '
            '`generate_phase_2a.py`; do not hand-edit. Formulas only, never names, never '
            'proposals to author anything. Each formula is a grammar-valid coordinate of '
            'the 0-and-1-dexterity movement space that the live dictionary does not label.\n\n')
    f.write(f'Total unnamed formulas: {sum(len(v) for v in groups.values())}, '
            f'in {len(groups)} structural families.\n\n')
    for family in sorted(groups, key=lambda k: -len(groups[k])):
        items = groups[family]
        adds = ', '.join(sorted(set(str(r['add']) for r in items)))
        f.write(f'## {family}  ({len(items)} formulas, ADD {adds})\n\n')
        f.write('| symbolic formula | launch | dex | terminal | ADD |\n')
        f.write('|---|---|---|---|---|\n')
        for r in items:
            f.write(f'| `{r["symbolic_formula"]}` | {r["launch_surface"]} | '
                    f'{r["dex"]} | {r["terminal_surface"]} | {r["add"]} |\n')
        f.write('\n')
print(f'catalog written: {cat_path}')
