#!/usr/bin/env python3
"""
The Movement Atlas, Volume I: generator.

Exploratory research under freestyle/research/. Not production data, not doctrine, not a
change to the live dictionary. Reads nothing from production code; writes only under
this folder. It does not modify, extend, or re-derive the movement grammar. It uses
Grammar v1 exactly as frozen (the four-generator basis and the 0-and-1-dexterity
surface-fiber lattice established in freestyle/research/trick-universe-matrix/, Phase II-A,
and the grammar-closure study) and enumerates every movement COORDINATE so the atlas
documents can be written from real data.

The atlas is the artifact; this generator only populates it. It emits:
  atlas_catalog.csv : one row per mapped coordinate (machine-readable catalog)
  printed occupancy / symmetry / density tables : copied into the atlas documents

The coordinate system (the atlas's contribution): the movement universe factors as a
SURFACE-FIBER BUNDLE. The base map is the surface lattice (launch surface x landing
surface); over every base point sits the same eight-vertex DEX CUBE
(dex_side x direction x terminal_side). A movement coordinate is a fiber plus a
vertex. Names are a section over this bundle: which vertices the dictionary labels.
"""
import csv
import os
from collections import Counter, defaultdict

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ===========================================================================
# Grammar v1 vocabulary (frozen; carried verbatim from the Phase II-A encoding).
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
DEX_SIDES  = ['SAME', 'OP']
DIRECTIONS = ['IN', 'OUT']
TERM_SIDES = ['SAME', 'OP']
UNCERTAIN_SURFACES = {'peak'}

# The eight-vertex toe cube: the fully-named foundational atoms (the reference cube).
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
NAMED_OFF_TOE_STRUCTURAL = {
    ('self', 'inside',  'SAME', 'IN',  'SAME'): 'inside_around_the_world',
    ('self', 'outside', 'SAME', 'OUT', 'SAME'): 'outside_around_the_world',
}
NAMED_OFF_TOE_FOLK = {
    ('toe',     'inside', 'OP',   'IN',  'SAME'): 'guay',                    # = inside pickup
    ('toe',     'inside', 'SAME', 'IN',  'OP'):   'inspinning_reverse_guay', # = inside pixie
    ('clipper', 'toe',    'OP',   'OUT', 'OP'):   'bubba',                   # = clipper-launched illusion
}
SET_OP_NOTE = {'pixie': 'pixie set', 'fairy': 'fairy set', 'mirage': 'miraging', 'illusion': 'atomic family'}
NAMED_STALLS = {
    'toe': 'toe_stall', 'inside': 'inside_stall', 'outside': 'outside_stall',
    'knee': 'knee_stall', 'neck': 'neck_stall', 'head': 'head_stall',
    'forehead': 'forehead_stall', 'shoulder': 'shoulder_stall', 'clipper': 'clipper_stall',
}
NAMED_KICKS = {'sole': 'sole_kick', 'cloud': 'cloud_kick'}
NAMED_BODY = {'SPIN': 'spin', 'FLYING IN': 'flying inside', 'FLYING OUT': 'flying outside'}


def sym_launch(launch, landing):
    if launch == 'toe':     return 'TOE'
    if launch == 'clipper': return 'CLIP'
    return landing.upper()  # self-fiber launches from the landing surface


def side_tok(x):   return 'S' if x == 'SAME' else 'O'
def dir_tok(x):    return 'IN' if x == 'IN' else 'OUT'


def movement_family(launch, landing):
    L = LANDINGS[landing]
    if L['kind'] == 'plain' and L['lateral'] == 'paired':   base = 'plain-paired cube'
    elif L['kind'] == 'plain' and L['lateral'] == 'midline': base = 'plain-midline square'
    elif L['kind'] == 'xbody':                               base = 'cross-body cube'
    else:                                                    base = 'unusual-surface cube'
    launch_tag = {'toe': 'toe-launch', 'clipper': 'clipper-launch', 'self': 'self-fiber'}[launch]
    return f'{launch_tag} / {base}'


rows = []


def add(**kw):
    rows.append(kw)


# ===========================================================================
# REGION 0-DEX: the ground floor of the map (no dexterity).
# ===========================================================================
# 0a. Held stalls: one per landing surface. ADD = grade.
for surf, L in LANDINGS.items():
    coord = f'set:{surf}/{L["role"].replace(" ", "")}'
    if surf in UNCERTAIN_SURFACES:
        gstat, rstat, name = 'uncertain', 'grammar-uncertain', ''
    else:
        name = NAMED_STALLS.get(surf, '')
        gstat, rstat = 'valid', ('existing' if name else 'unnamed')
    add(region='0-DEX', sub='stall', atlas_coord=coord, launch='(set)', landing=surf,
        landing_grade=L['grade'], landing_lat=L['lateral'], dex_side='', direction='', term_side='',
        movement_family=f'{L["kind"]}-{L["lateral"]} stall', symbolic_formula=f'{surf.upper()} {L["role"]}',
        add=L['grade'], grammar_status=gstat, representation=rstat, name=name,
        notes='held stall; the anchor floor of the map')

# 0b. Bare body steps (single body generator).
for token, disp in [('SPIN', 'spin'), ('DUCK', ''), ('DIVE', ''), ('FLYING IN', 'flying inside'), ('FLYING OUT', 'flying outside')]:
    name = NAMED_BODY.get(token, '')
    add(region='0-DEX', sub='body', atlas_coord=f'set:-/BOD:{disp or token.lower()}', launch='(set)', landing='(none)',
        landing_grade='', landing_lat='', dex_side='', direction='', term_side='',
        movement_family='bare body step', symbolic_formula=f'{token} [BOD]', add=1,
        grammar_status='valid', representation=('existing' if name else 'unnamed'), name=name,
        notes='one body generator, no bag contact')

# 0c. Bare-surface kicks: scored point with no scored generator (open floor).
for surf in ('sole', 'cloud', 'heel', 'toe', 'inside'):
    name = NAMED_KICKS.get(surf, '')
    add(region='0-DEX', sub='kick', atlas_coord=f'set:{surf}/KICK', launch='(set)', landing=surf,
        landing_grade=LANDINGS[surf]['grade'], landing_lat=LANDINGS[surf]['lateral'], dex_side='', direction='', term_side='',
        movement_family='bare surface kick', symbolic_formula=f'{surf.upper()} [KICK]', add='?',
        grammar_status='uncertain', representation='grammar-uncertain', name=name,
        notes='scores 1 in the corpus with no scored generator; open primitive floor (pogo twin)')


# ===========================================================================
# REGION 1-DEX: the surface-fiber bundle. Base = (launch, landing); fiber = the cube.
# ===========================================================================
for launch in LAUNCHES:
    for landing, L in LANDINGS.items():
        if launch == 'self' and landing not in PAIRED_PLAIN:
            continue
        if launch == 'self' and landing == 'toe':
            continue  # the toe self-fiber coincides with the toe-launch reference cube
        for dex_side in DEX_SIDES:
            for direction in DIRECTIONS:
                for term_side in TERM_SIDES:
                    lt = sym_launch(launch, landing)
                    vtx = f'{side_tok(dex_side)}.{dir_tok(direction)}.{side_tok(term_side)}'
                    coord = f'{("SELF:"+landing) if launch=="self" else (lt.lower()+":"+landing)}/{vtx}'
                    tside = term_side if L['lateral'] == 'paired' else ''
                    term = f'{tside} {landing.upper()} {L["role"]}'.strip()
                    formula = f'{lt} > {dex_side} {direction} [DEX] > {term}'
                    addv = 1 + L['grade']
                    fam = movement_family(launch, landing)
                    key3 = (dex_side, direction, term_side)
                    key5 = (launch, landing, dex_side, direction, term_side)

                    # classify grammar status + representation status
                    name = ''
                    if landing in UNCERTAIN_SURFACES:
                        gstat, rstat = 'uncertain', 'grammar-uncertain'
                        note = 'peak surface unresolved (apex vs timing marker)'
                    elif L['lateral'] == 'midline' and term_side != 'SAME':
                        gstat, rstat = 'artifact', 'grammar-artifact'
                        note = 'midline landing has one central target; opposite-side copy is a grammar artifact, not a distinct move'
                    elif launch == 'clipper' and dex_side == 'SAME':
                        gstat, rstat = 'blocked', 'grammar-blocked'
                        note = 'cross-body launch forecloses the SAME dex-side face (bag control)'
                    else:
                        gstat = 'valid'
                        if launch == 'toe' and landing == 'toe' and key3 in TOE_CUBE_NAMES:
                            name = TOE_CUBE_NAMES[key3]
                            rstat = 'existing'
                            note = 'named foundational atom on the reference toe cube'
                            if name in SET_OP_NOTE:
                                note += f'; its dex shape is also the {SET_OP_NOTE[name]} operator'
                        elif key5 in NAMED_OFF_TOE_STRUCTURAL:
                            name = NAMED_OFF_TOE_STRUCTURAL[key5]; rstat = 'existing'
                            note = 'named vertex off the reference fiber (structural name)'
                        elif key5 in NAMED_OFF_TOE_FOLK:
                            name = NAMED_OFF_TOE_FOLK[key5]; rstat = 'existing-another-name'
                            note = 'coordinate realized under an opaque folk name, not its structural description'
                        else:
                            rstat = 'unnamed'
                            note = 'structurally valid, unlabeled coordinate'
                    add(region='1-DEX', sub='cube', atlas_coord=coord,
                        launch=(landing if launch == 'self' else launch), landing=landing,
                        landing_grade=L['grade'], landing_lat=L['lateral'],
                        dex_side=dex_side, direction=direction, term_side=term_side,
                        movement_family=fam, symbolic_formula=formula, add=addv,
                        grammar_status=gstat, representation=rstat, name=name, notes=note)


# ===========================================================================
# Write the machine-readable catalog.
# ===========================================================================
cols = ['region', 'sub', 'atlas_coord', 'launch', 'landing', 'landing_grade', 'landing_lat',
        'dex_side', 'direction', 'term_side', 'movement_family', 'symbolic_formula', 'add',
        'grammar_status', 'representation', 'name', 'notes']
with open(os.path.join(OUT_DIR, 'atlas_catalog.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)

# ===========================================================================
# Occupancy / symmetry / density tables (printed for the atlas documents).
# ===========================================================================
print('=' * 72)
print('ATLAS OF THE FREESTYLE MOVEMENT UNIVERSE, VOLUME I — coordinate census')
print('=' * 72)
print(f'total mapped coordinates: {len(rows)}')

print('\n-- by region --')
for r in ['0-DEX', '1-DEX']:
    print(f'  {r}: {sum(1 for x in rows if x["region"]==r)}')

print('\n-- by representation status --')
for k, v in Counter(x['representation'] for x in rows).most_common():
    print(f'  {v:4}  {k}')

print('\n-- by grammar status --')
for k, v in Counter(x['grammar_status'] for x in rows).most_common():
    print(f'  {v:4}  {k}')

# Distinct movement coordinates = drop grammar artifacts (midline duplicates).
distinct = [x for x in rows if x['grammar_status'] != 'artifact']
print(f'\ndistinct movement coordinates (artifacts removed): {len(distinct)}')

# --- Fiber occupancy map: for each (launch, landing) fiber, the 8 cube vertices ---
print('\n-- fiber occupancy (1-DEX): named / unnamed / blocked / uncertain / artifact per fiber --')
fibers = defaultdict(lambda: Counter())
for x in rows:
    if x['region'] != '1-DEX':
        continue
    key = (x['launch'], x['landing'])
    fibers[key][x['representation']] += 1
hdr = f'  {"fiber (launch:landing)":26} {"named":6}{"folk":5}{"unnamed":8}{"blocked":8}{"uncert":7}{"artifact":9}'
print(hdr)
for (lg, ld), c in sorted(fibers.items()):
    print(f'  {lg+":"+ld:26} {c["existing"]:<6}{c["existing-another-name"]:<5}'
          f'{c["unnamed"]:<8}{c["grammar-blocked"]:<8}{c["grammar-uncertain"]:<7}{c["grammar-artifact"]:<9}')

# --- Named-vertex map: which cube vertices carry names, across all fibers ---
print('\n-- named-vertex census (which cube vertices are ever named) --')
vtx_named = Counter()
vtx_total = Counter()
for x in rows:
    if x['region'] != '1-DEX' or x['grammar_status'] not in ('valid',):
        continue
    v = f'{side_tok(x["dex_side"])}.{dir_tok(x["direction"])}.{side_tok(x["term_side"])}'
    vtx_total[v] += 1
    if x['representation'] in ('existing', 'existing-another-name'):
        vtx_named[v] += 1
for v in sorted(vtx_total):
    print(f'  vertex {v:10} named at {vtx_named[v]:2} / {vtx_total[v]:2} fibers')

# --- Toe-cube symmetry: the Klein-four group (flip side / direction / terminal-side) ---
print('\n-- toe-cube symmetry: direction-flip mirror pairs --')
def flipdir(d): return 'OUT' if d == 'IN' else 'IN'
pairs = sorted({tuple(sorted((nm, TOE_CUBE_NAMES[(s, flipdir(d), t)]))) for (s, d, t), nm in TOE_CUBE_NAMES.items()})
for a, b in pairs:
    print(f'  {a:20} <-> {b}')

# --- Density by movement family ---
print('\n-- density by movement family (named fraction) --')
fam_named = Counter(); fam_total = Counter()
for x in distinct:
    if x['region'] != '1-DEX':
        continue
    fam_total[x['movement_family']] += 1
    if x['representation'] in ('existing', 'existing-another-name'):
        fam_named[x['movement_family']] += 1
for fam in sorted(fam_total, key=lambda k: -fam_total[k]):
    frac = fam_named[fam] / fam_total[fam] * 100
    print(f'  {fam_named[fam]:3}/{fam_total[fam]:<3} ({frac:4.0f}%)  {fam}')

print(f'\ncatalog written: {os.path.join(OUT_DIR, "atlas_catalog.csv")}')
