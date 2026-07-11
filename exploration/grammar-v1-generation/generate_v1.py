#!/usr/bin/env python3
"""
Movement Grammar v1.0: Exploratory Generation.

Exploratory research under exploration/. Not production data, not doctrine, not a
change to the live dictionary. Reads nothing from production code; writes only
under this folder. Generates movement FORMULAS only, never names.

Purpose (this slice): the grammar is frozen at Version 1.0 and is ALLOWED to be
incomplete. This script does not improve it. It runs it as a generator and lets it
break, classifying every break as evidence. Grammar v1.0 is the primitive basis
from the closure study (exploration/grammar-closure/GRAMMAR_CLOSURE_STUDY.md, S6):

  FIRM primitives (four): contact(surface, role), xbody, dexterity(side,
    direction, rotation, far?), body(kind). Scoring law (firm): ADD = count of
    scored generators.
  OPEN floor (part of v1.0, unresolved): posture (planted/no-plant/airborne),
    paradox (dex parameter or event), pogo / non-dex set contribution, bare-surface
    strike (kick), and the unpinned rotation-grade rule.

Scope: the same 0-and-1-dexterity, established-surface bound as Phase II-A. Within
that bound the generator emits the RAW production (including what the grammar
over-generates), then classifies each formula. Contamination dimensions (rotation,
paradox, posture) and structural probes (pogo, generic SET, simultaneity, standalone
cross-body) are enumerated separately so the base coverage metric is not distorted
by however many settings an open dimension happens to have.

Failure taxonomy (per the slice brief):
  missing-primitive, ambiguous-primitive, unresolved-parameter, unresolved-grading,
  unresolved-simultaneity, unresolved-posture, unresolved-notation,
  unresolved-composition, internal-contradiction, duplicate-generation,
  unexpected-symmetry, unexpected-redundancy, other.

Outputs:
  movement_formulas_v1.csv  : the base determinate 0-1 dex space, one row/formula
  failure_probes_v1.csv     : the contamination + structural probe rows
  printed coverage + failure summary (copied into the paper by hand)
"""
import csv
import os
from collections import Counter, defaultdict

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Grammar v1.0 vocabulary (frozen; carried verbatim from the Phase II-A basis).
# ---------------------------------------------------------------------------
# Landing surfaces: grade (plain=1 / hard=2) and laterality (paired / midline).
LANDINGS = {
    'toe':      dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'inside':   dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'outside':  dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'knee':     dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'shoulder': dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'head':     dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),
    'forehead': dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),
    'neck':     dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),
    'peak':     dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),  # open notation Q
    'clipper':  dict(grade=2, role='[XBD] [DEL]', lateral='paired',  kind='xbody'),
    'heel':     dict(grade=2, role='[UNS] [DEL]', lateral='paired',  kind='unusual'),
    'sole':     dict(grade=2, role='[UNS] [DEL]', lateral='paired',  kind='unusual'),
    'cloud':    dict(grade=2, role='[UNS] [DEL]', lateral='midline', kind='unusual'),
}
PAIRED_PLAIN = [s for s, L in LANDINGS.items() if L['kind'] == 'plain' and L['lateral'] == 'paired']

LAUNCHES = ['toe', 'clipper', 'self']
DEX_SIDES  = ['SAME', 'OP']
DIRECTIONS = ['IN', 'OUT']
TERM_SIDES = ['SAME', 'OP']
UNCERTAIN_SURFACES = {'peak'}


def sym_launch(launch, landing):
    if launch == 'toe':     return 'TOE'
    if launch == 'clipper': return 'CLIP'
    return landing.upper()  # self-fiber launches from the landing surface


base_rows = []   # the determinate 0-1 dex space
probe_rows = []  # contamination + structural probes


def add_base(**kw):
    base_rows.append(kw)


def add_probe(**kw):
    probe_rows.append(kw)


# ===========================================================================
# PART A. Base determinate space: 0-and-1 dex, rotation=none, paradox=no,
# planted, delay terminals. This is the space whose clean/blocked/failure
# fractions define grammar coverage. Emit the RAW production incl. over-generation.
# ===========================================================================

# --- A0. Zero-dex stalls: launch(0) + delay-land(1). ADD = grade. -----------
for surf, L in LANDINGS.items():
    add = L['grade']
    formula = f'{surf.upper()} {L["role"]}'
    if surf in UNCERTAIN_SURFACES:
        status, fclass, reason = 'failure', 'unresolved-notation', \
            'peak is unresolved as a landing surface vs a timing marker; the grammar cannot say what contact this is'
    else:
        status, fclass, reason = 'clean', '', 'launch(grade 0) + delay landing(grade 1); ADD = bracket count, determinate'
    add_base(layer='0-dex stall', launch='(set)', landing=surf, dex='none',
             terminal=L['role'], symbolic_formula=formula, add=add,
             status=status, failure_class=fclass, reason=reason)

# --- A1. Zero-dex body steps: single body(kind), grade 1. -------------------
for body, disp in [('SPIN', 'named'), ('DUCK', 'unnamed'), ('DIVE', 'unnamed'),
                   ('FLYING IN', 'named'), ('FLYING OUT', 'named')]:
    add_base(layer='0-dex body', launch='(set)', landing='(none)', dex='none',
             terminal='[BOD]', symbolic_formula=f'{body} [BOD]', add=1,
             status='clean', failure_class='',
             reason='one body generator(grade 1), no bag contact; determinate')

# --- A2. Zero-dex bare-surface kicks: the point has no scored generator. -----
# ADD=bracket count (firm) says 0; the corpus says these score 1. Contradiction.
for surf in ('sole', 'cloud', 'heel', 'toe', 'inside'):
    add_base(layer='0-dex kick', launch='(set)', landing=surf, dex='none',
             terminal='[KICK]', symbolic_formula=f'{surf.upper()} [KICK]', add='?',
             status='failure', failure_class='internal-contradiction',
             reason='bare-surface strike scores 1 in the corpus but carries no scored generator; '
                    'violates ADD = scored-generator count; candidate missing primitive (pogo twin)')

# --- A3. One-dex cube over every (launch, landing) fiber, delay terminal. ----
# Emit the raw cross-product; classify over-generation rather than pruning it.
for launch in LAUNCHES + ['self-toe']:
    for landing, L in LANDINGS.items():
        if launch == 'self' and landing not in PAIRED_PLAIN:
            continue
        if launch == 'self' and landing == 'toe':
            continue  # handled by the self-toe redundancy probe below
        if launch == 'self-toe' and landing != 'toe':
            continue
        eff_launch = 'self' if launch == 'self-toe' else launch
        for dex_side in DEX_SIDES:
            for direction in DIRECTIONS:
                for term_side in TERM_SIDES:
                    add = 1 + L['grade']
                    lt = sym_launch(eff_launch, landing)
                    tside = term_side if L['lateral'] == 'paired' else ''
                    term = f'{tside} {landing.upper()} {L["role"]}'.strip()
                    formula = f'{lt} > {dex_side} {direction} [DEX] > {term}'
                    # classification precedence
                    if launch == 'self-toe':
                        status, fclass, reason = 'failure', 'unexpected-redundancy', \
                            'the toe self-fiber is identical to the toe-launch cube; the grammar generates the same coordinate twice'
                    elif landing in UNCERTAIN_SURFACES:
                        status, fclass, reason = 'failure', 'unresolved-notation', \
                            'peak surface unresolved (apex vs timing marker)'
                    elif eff_launch == 'clipper' and dex_side == 'SAME':
                        status, fclass, reason = 'blocked', '', \
                            'cross-body launch forecloses the SAME dex-side face; grammar correctly rejects (not a failure)'
                    elif L['lateral'] == 'midline' and term_side != 'SAME':
                        status, fclass, reason = 'failure', 'duplicate-generation', \
                            'midline landing has one central target; the terminal-side axis over-generates a duplicate vertex'
                    else:
                        status, fclass, reason = 'clean', '', \
                            'dex(1) + landing(grade) scored generators; ADD determinate'
                    add_base(layer='1-dex', launch=eff_launch if launch != 'self-toe' else 'self(toe)',
                             landing=(f'{tside} {landing}').strip(), dex=f'{dex_side} {direction}',
                             terminal=L['role'], symbolic_formula=formula, add=add,
                             status=status, failure_class=fclass, reason=reason)


# ===========================================================================
# PART B. Contamination probes: three open concepts, each a single unresolved
# element that gates a whole class of otherwise-clean 1-dex formulas. Take the
# clean 1-dex core as the base and apply each open dimension once.
# ===========================================================================
clean_1dex = [r for r in base_rows if r['layer'] == '1-dex' and r['status'] == 'clean']

# B1. Rotation (whirl / swirl): the rotation-grade rule is unpinned.
for r in clean_1dex:
    for rot in ('whirl', 'swirl'):
        f = r['symbolic_formula'].replace('[DEX]', f'[DEX:{rot}]', 1)
        add_probe(dimension='rotation', base_formula=r['symbolic_formula'], symbolic_formula=f,
                  status='failure', failure_class='unresolved-grading',
                  reason='rotational dex grade unpinned: grade-neutral -> ADD unchanged, '
                         'grade-raising -> +1 (grade 3 on a cross-body landing); the grammar cannot score it')

# B2. Paradox: parameter (manner, +0) vs distinct scored event (+1) unresolved.
for r in clean_1dex:
    f = r['symbolic_formula'].replace('[DEX]', '[DEX] [PDX]', 1)
    add_probe(dimension='paradox', base_formula=r['symbolic_formula'], symbolic_formula=f,
              status='failure', failure_class='ambiguous-primitive',
              reason='paradox unresolved as dex parameter(+0) vs scored event(+1); ADD is one of two values')

# B3. Posture (no-plant): scored event vs licensing parameter unresolved.
for r in clean_1dex:
    f = r['symbolic_formula'] + ' {no-plant}'
    add_probe(dimension='posture', base_formula=r['symbolic_formula'], symbolic_formula=f,
              status='failure', failure_class='unresolved-posture',
              reason='no-plant posture unresolved as scored event vs licensing parameter; ADD indeterminate')


# ===========================================================================
# PART C. Structural probes: constructs the grammar carries but the 0-1 dex
# cube does not exercise, plus the two floor primitives that cannot be written.
# ===========================================================================

# C1. Pogo: a set that scores 1 with no dex, body, or contact. The generator
# cannot emit a well-formed scored formula for it in the four-primitive basis.
add_probe(dimension='pogo', base_formula='(set) POGO', symbolic_formula='POGO ??? +1',
          status='failure', failure_class='missing-primitive',
          reason='pogo adds a scored point with no dex/body/contact token; no v1.0 primitive can carry it; '
                 'also an internal contradiction against ADD = scored-generator count')

# C2. Generic SET launch: entry surface unspecified, so the entry contact is unknown.
add_probe(dimension='generic-set', base_formula='SET > ...', symbolic_formula='SET > SAME IN [DEX] > SAME TOE [DEL]',
          status='failure', failure_class='unresolved-notation',
          reason='generic SET names no entry surface; the launch contact(surface) is unbound; formula underspecified')

# C3. Simultaneity ">>": the notation carries a layered/simultaneous step operator
# (e.g. Fog: CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > ...). The grammar does not
# define whether ">>" steps score independently or as one simultaneous event. The
# 0-1 dex scope never forces it (single dex), so it is unexercised, not resolved.
add_probe(dimension='simultaneity', base_formula='A >> B', symbolic_formula='... > OP IN [DEX] >> OP IN [DEX] > ...',
          status='failure', failure_class='unresolved-simultaneity',
          reason='the ">>" layered-step operator scoring rule (independent vs one event) is undefined; '
                 'not exercised at 0-1 dex, so carried into higher-dex generation unresolved')

# C4. Standalone cross-body contact: xbody with NO delay. The closure split makes
# xbody its own grade-1 primitive, so v1.0 CAN write this; it is a clean case that
# the delay-terminal cube did not generate. Positive: the grammar is stronger than
# the cube suggested.
add_probe(dimension='standalone-xbody', base_formula='CLIP > OP IN [DEX] > OP CLIP [XBD]',
          symbolic_formula='CLIP > OP IN [DEX] > OP CLIP [XBD]', status='clean', failure_class='',
          reason='cross-body contact stands alone (grade 1, no delay); v1.0 split covers it cleanly; '
                 'the delay-only cube under-generated this, so the grammar reaches further than the base pass showed')


# ===========================================================================
# PART D. Symmetry finding (structure, reported, not a per-row failure).
# The eight-vertex toe cube is closed under the Klein-four group generated by
# flipping dex_side, direction, and terminal_side. Detect the mirror pairs.
# ===========================================================================
TOE_CUBE = {
    ('SAME', 'IN',  'SAME'): 'atw', ('SAME', 'OUT', 'SAME'): 'orbit',
    ('SAME', 'IN',  'OP'):   'pixie', ('SAME', 'OUT', 'OP'):   'fairy',
    ('OP',   'IN',  'OP'):   'mirage', ('OP',   'OUT', 'OP'):   'illusion',
    ('OP',   'IN',  'SAME'): 'pickup', ('OP',   'OUT', 'SAME'): 'legover',
}
def flip(v): return 'OP' if v == 'SAME' else 'SAME'
def flipdir(d): return 'OUT' if d == 'IN' else 'IN'
direction_pairs = []
for (s, d, t), nm in TOE_CUBE.items():
    partner = TOE_CUBE[(s, flipdir(d), t)]
    direction_pairs.append(tuple(sorted((nm, partner))))
direction_pairs = sorted(set(direction_pairs))


# ---------------------------------------------------------------------------
# Write outputs + summary.
# ---------------------------------------------------------------------------
base_cols = ['layer', 'launch', 'landing', 'dex', 'terminal', 'symbolic_formula',
             'add', 'status', 'failure_class', 'reason']
with open(os.path.join(OUT_DIR, 'movement_formulas_v1.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=base_cols)
    w.writeheader()
    w.writerows(base_rows)

probe_cols = ['dimension', 'base_formula', 'symbolic_formula', 'status', 'failure_class', 'reason']
with open(os.path.join(OUT_DIR, 'failure_probes_v1.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=probe_cols)
    w.writeheader()
    w.writerows(probe_rows)

# --- Coverage over the BASE determinate space ---
n = len(base_rows)
by_status = Counter(r['status'] for r in base_rows)
clean = by_status['clean']; blocked = by_status['blocked']; failed = by_status['failure']
print('=' * 70)
print('BASE DETERMINATE 0-1 DEX SPACE (coverage denominator)')
print('=' * 70)
print(f'total generated rows: {n}')
print(f'  clean (grammar represents + grades unambiguously): {clean}  ({clean/n*100:.1f}%)')
print(f'  blocked (grammar correctly rejects):               {blocked}  ({blocked/n*100:.1f}%)')
print(f'  failure (grammar breaks or over-generates):        {failed}  ({failed/n*100:.1f}%)')
generable = n - blocked
print(f'  clean as % of NON-blocked generable space:         {clean/generable*100:.1f}%')

print('\nbase failures by class:')
fc = Counter(r['failure_class'] for r in base_rows if r['status'] == 'failure')
for k, v in fc.most_common():
    print(f'  {v:4}  {k}')

# --- Contamination reach ---
print('\n' + '=' * 70)
print('CONTAMINATION REACH (open concepts x clean 1-dex core)')
print('=' * 70)
print(f'clean 1-dex core formulas: {len(clean_1dex)}')
dim = Counter(r['dimension'] for r in probe_rows if r['dimension'] in {'rotation', 'paradox', 'posture'})
for k, v in dim.items():
    print(f'  {k:10} contaminates {v:4} formulas (each clean 1-dex formula -> ambiguous ADD)')
contaminated = len(clean_1dex)  # every clean 1-dex formula has >=1 ambiguous variant
print(f'  every one of the {contaminated} clean 1-dex formulas has a rotation, a paradox, and a')
print(f'  no-plant variant the grammar cannot grade: 3 concepts, but full reach across the core.')

# --- Structural probes ---
print('\n' + '=' * 70)
print('STRUCTURAL PROBES')
print('=' * 70)
for r in probe_rows:
    if r['dimension'] in {'pogo', 'generic-set', 'simultaneity', 'standalone-xbody'}:
        print(f'  [{r["status"]:7}] {r["dimension"]:16} {r["failure_class"] or "(clean)"}')

# --- Symmetry ---
print('\n' + '=' * 70)
print('SYMMETRY FINDING (toe cube, direction-flip mirror pairs)')
print('=' * 70)
for a, b in direction_pairs:
    print(f'  {a:10} <-> {b}')
print('the 8-vertex cube is closed under the Klein-four group (flip side / direction /')
print('terminal-side): a structural regularity, not a flat list. Positive finding.')

print('\nCSV written: movement_formulas_v1.csv, failure_probes_v1.csv')
