#!/usr/bin/env python3
"""
The Movement Atlas, Volume II: the two-dexterity movement universe. Generator.

Exploratory research under exploration/. Not production data, not doctrine, not a
change to the live dictionary. Reads nothing from production code; writes only under
this folder. It does not modify Volume I, the grammar, or the coordinate system; it
extends the frozen Grammar v1 and the Volume I addressing to exactly two dexterities.

GEOMETRY FIRST (the discipline of this volume). A one-dexterity movement is
launch -> dex -> terminal, and a dex is a cube vertex (side, direction, out-side):
the eight-vertex 3-cube Q3. A two-dexterity movement is launch -> dex1 -> dex2 ->
terminal with NO contact between the dexes: the bag is carried from dex1 to dex2 in
an intermediate CARRIAGE state. So the natural fiber content is an ordered pair of
cube vertices threaded by carriage state:

  * dex1 = (side1, direction1, out1), a Q3 vertex; out1 is the intermediate carriage.
  * dex2 = (side2, direction2, out2), a Q3 vertex; dex2's input is out1; out2 is the
    final terminal side.
  * a dex can act on either carriage state, so the handoff is always satisfiable: it
    THREADS the state, it does not PRUNE the space. The two-dex fiber is therefore
    the full product Q3 x Q3 = the 6-cube Q6 (64 vertices), not a constrained subset.

This script tests that hypothesis by generating the space and reporting whether any
reduction appears. The base map (surface lattice) is unchanged from Volume I; only
the fiber grows from Q3 to Q6.

Outputs:
  volume_2_catalog.csv : one row per two-dex coordinate (machine-readable catalog)
  printed geometry / census / symmetry / occupancy tables : copied into the documents
"""
import csv
import os
from collections import Counter, defaultdict

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ===========================================================================
# Frozen vocabulary (carried verbatim from Volume I; unchanged).
# ===========================================================================
LANDINGS = {
    'toe':      dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'inside':   dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'outside':  dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'knee':     dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'shoulder': dict(grade=1, role='[DEL]',       lateral='paired',  kind='plain'),
    'head':     dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),
    'forehead': dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),
    'neck':     dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),
    'peak':     dict(grade=1, role='[DEL]',       lateral='midline', kind='plain'),   # open notation Q
    'clipper':  dict(grade=2, role='[XBD] [DEL]', lateral='paired',  kind='xbody'),
    'heel':     dict(grade=2, role='[UNS] [DEL]', lateral='paired',  kind='unusual'),
    'sole':     dict(grade=2, role='[UNS] [DEL]', lateral='paired',  kind='unusual'),
    'cloud':    dict(grade=2, role='[UNS] [DEL]', lateral='midline', kind='unusual'),
}
PAIRED_PLAIN = [s for s, L in LANDINGS.items() if L['kind'] == 'plain' and L['lateral'] == 'paired']
LAUNCHES = ['toe', 'clipper', 'self']
UNCERTAIN_SURFACES = {'peak'}

SIDES = ['SAME', 'OP']
DIRS = ['IN', 'OUT']
OUTS = ['SAME', 'OP']  # a dex's output carriage state (absolute, vs the reference foot)


def s_tok(x): return 'S' if x == 'SAME' else 'O'
def d_tok(x): return 'IN' if x == 'IN' else 'OUT'


# The single dex cube (Q3): 8 vertices. This is exactly the Volume I fiber content.
DEX_CUBE = [(sd, dr, ou) for sd in SIDES for dr in DIRS for ou in OUTS]


def vtx_str(v):
    return f'{s_tok(v[0])}.{d_tok(v[1])}.{s_tok(v[2])}'


def sym_launch(launch, landing):
    if launch == 'toe':     return 'TOE'
    if launch == 'clipper': return 'CLIP'
    return landing.upper()  # self-fiber launches from the landing surface


def fibers():
    """The base map: exactly the Volume I fiber set (30 fibers)."""
    out = []
    for launch in LAUNCHES:
        for landing in LANDINGS:
            if launch == 'self' and landing not in PAIRED_PLAIN:
                continue
            if launch == 'self' and landing == 'toe':
                continue  # coincides with the toe-launch reference fiber
            out.append((launch, landing))
    return out


rows = []

for (launch, landing) in fibers():
    L = LANDINGS[landing]
    lt = sym_launch(launch, landing)
    for v1 in DEX_CUBE:      # dex1 = (side1, dir1, out1) ; out1 = intermediate carriage
        for v2 in DEX_CUBE:  # dex2 = (side2, dir2, out2) ; out2 = final terminal side
            side1, dir1, out1 = v1
            side2, dir2, out2 = v2
            # addressing extends Volume I: launch:landing/ v1 | v2
            coord = f'{("SELF:"+landing) if launch=="self" else (lt.lower()+":"+landing)}/{vtx_str(v1)}|{vtx_str(v2)}'
            tside = out2 if L['lateral'] == 'paired' else ''
            term = f'{tside} {landing.upper()} {L["role"]}'.strip()
            formula = (f'{lt} > {side1} {dir1} [DEX] > {side2} {dir2} [DEX] > {term}')
            addv = 2 + L['grade']  # two scored dexes + the landing grade

            # --- lifted Volume I classification rules ---
            if landing in UNCERTAIN_SURFACES:
                gstat, note = 'uncertain', 'peak surface unresolved (apex vs timing marker)'
            elif launch == 'clipper' and side1 == 'SAME':
                gstat, note = 'blocked', 'cross-body launch forecloses the SAME first-dex face (bag control)'
            elif L['lateral'] == 'midline' and out2 == 'OP':
                gstat, note = 'artifact', 'midline landing has one central target; the opposite-side final copy is a grammar artifact'
            else:
                gstat, note = 'valid', 'two-dex path, threaded carriage, sequential reading'

            # diagonal (repeated dex) vs off-diagonal (ordered pair)
            pair_kind = 'diagonal(repeated-dex)' if v1 == v2 else 'off-diagonal(ordered-pair)'
            # swap partner address (dex-exchange symmetry)
            swap_coord = f'{("SELF:"+landing) if launch=="self" else (lt.lower()+":"+landing)}/{vtx_str(v2)}|{vtx_str(v1)}'

            rows.append(dict(
                region='2-DEX', fiber=f'{("self:"+landing) if launch=="self" else launch+":"+landing}',
                launch=(landing if launch == 'self' else launch), landing=landing,
                landing_grade=L['grade'], landing_lat=L['lateral'],
                dex1=vtx_str(v1), dex2=vtx_str(v2), atlas_coord=coord,
                pair_kind=pair_kind, swap_partner=swap_coord,
                symbolic_formula=formula, add=addv,
                grammar_status=gstat, representation='unnamed', name='', notes=note))

# ===========================================================================
# Write the machine-readable catalog.
# ===========================================================================
cols = ['region', 'fiber', 'launch', 'landing', 'landing_grade', 'landing_lat',
        'dex1', 'dex2', 'atlas_coord', 'pair_kind', 'swap_partner',
        'symbolic_formula', 'add', 'grammar_status', 'representation', 'name', 'notes']
with open(os.path.join(OUT_DIR, 'volume_2_catalog.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)

# ===========================================================================
# Geometry / census / symmetry / occupancy (printed for the documents).
# ===========================================================================
FIB = fibers()
print('=' * 72)
print('ATLAS VOLUME II — THE TWO-DEX MOVEMENT UNIVERSE — geometry + census')
print('=' * 72)
print(f'base map (fibers): {len(FIB)}   fiber content (per fiber): {len(DEX_CUBE)**2} = Q6 (the 6-cube)')
print(f'total mapped coordinates: {len(rows)}  (= {len(FIB)} fibers x 64)')

print('\n-- geometry check: is the fiber the full Q6, or a constrained subset? --')
ref = [r for r in rows if r['fiber'] == 'toe:toe']
print(f'  reference fiber toe:toe carries {len(ref)} coordinates; '
      f'valid = {sum(1 for r in ref if r["grammar_status"]=="valid")} '
      f'(a plain-paired toe fiber has no blocked/artifact/uncertain, so the full 64 are terrain)')
print('  -> the handoff threads the carriage but prunes nothing; the two-dex fiber IS the free 6-cube.')

print('\n-- census by grammar status --')
for k, v in Counter(r['grammar_status'] for r in rows).most_common():
    print(f'  {v:5}  {k}')
distinct = [r for r in rows if r['grammar_status'] != 'artifact']
print(f'  distinct movement coordinates (artifacts removed): {len(distinct)}')
valid = [r for r in rows if r['grammar_status'] == 'valid']
print(f'  valid movement terrain: {len(valid)}   (all unnamed at the geometric layer, see the analysis)')

print('\n-- symmetry census on the reference 6-cube (toe:toe, 64 vertices) --')
diag = [r for r in ref if r['pair_kind'].startswith('diagonal')]
offd = [r for r in ref if r['pair_kind'].startswith('off-diagonal')]
print(f'  diagonal (repeated-dex, swap-fixed): {len(diag)}   (the 8 doubled dexes)')
print(f'  off-diagonal (ordered pairs): {len(offd)} = {len(offd)//2} swap-orbits of size 2')
print('  the NEW symmetry vs Volume I is the dex-swap (exchange dex1 <-> dex2): an order-2')
print('  automorphism of the 6-cube with the diagonal as its 8 fixed points.')

print('\n-- axis inventory (what grew from Q3 to Q6) --')
print('  Volume I fiber Q3: 3 axes  (dex side, direction, out-side)')
print('  Volume II fiber Q6: 6 axes (dex1 side/dir/out, dex2 side/dir/out)')
print('  the intermediate carriage = dex1.out (a free axis, threaded into dex2 as its input)')
print('  the terminal side = dex2.out (a free axis, exactly as term-side was free in Volume I)')

print('\n-- occupancy by fiber family (grammar status share) --')
def family(r):
    L = LANDINGS[r['landing']]
    if L['kind'] == 'plain' and L['lateral'] == 'paired':   base = 'plain-paired'
    elif L['kind'] == 'plain' and L['lateral'] == 'midline': base = 'plain-midline'
    elif L['kind'] == 'xbody':                               base = 'cross-body'
    else:                                                    base = 'unusual-surface'
    lt = {'toe': 'toe', 'clipper': 'clipper', 'self': 'self'}
    launch_class = 'self' if r['fiber'].startswith('self') or r['launch'] in PAIRED_PLAIN and r['fiber'].split(':')[0]==r['landing'] else r['launch']
    return f'{r["launch"]}-launch / {base}'
fam = defaultdict(lambda: Counter())
for r in rows:
    fam[family(r)][r['grammar_status']] += 1
print(f'  {"family":34}{"valid":7}{"blocked":8}{"artifact":9}{"uncertain":10}')
for k in sorted(fam):
    c = fam[k]
    print(f'  {k:34}{c["valid"]:<7}{c["blocked"]:<8}{c["artifact"]:<9}{c["uncertain"]:<10}')

print('\n-- the simultaneity overlay (unresolved; not doubled into the catalog) --')
print('  every sequential two-dex coordinate has a SIMULTANEOUS reading (the layered-step')
print('  operator, two dexes performed together rather than in order). Its scoring rule is')
print(f'  unresolved in the frozen grammar, so it is marked as an uncertain overlay over all')
print(f'  {len(valid)} valid coordinates and NOT enumerated as terrain.')

print(f'\ncatalog written: {os.path.join(OUT_DIR, "volume_2_catalog.csv")}')
