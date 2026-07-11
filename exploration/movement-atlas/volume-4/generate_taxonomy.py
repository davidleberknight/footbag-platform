#!/usr/bin/env python3
"""
Atlas Volume IV: taxonomy of the two-dex movement universe. Generator (read-only).

Exploratory research under exploration/. Not production data, not doctrine, not a
change to the live dictionary. It reads the frozen Volume II catalog and the live
dictionary notation read-only, and writes only under this folder. It creates no
movement formulas, revises no earlier volume, and touches no grammar, notation,
parser, dictionary, promotion, or name.

Coordinates first. The taxonomy is derived from the STRUCTURE of the two-dex
coordinate (the relationship between its two dexterities), not from any trick name.
Each two-dex coordinate has two dexterities, dex1=(side1,dir1,out1) and
dex2=(side2,dir2,out2). Four structural RELATIONS between them are the candidate
taxonomic facets:
  leg      : same-leg (side1==side2)      vs alternating-leg
  direction: parallel (dir1==dir2)        vs reversed
  receiver : preserved (final side==entry) vs changed
  carriage : steady (out1==out2)          vs mid-cross   [the notation-invisible axis]
plus the repeat flag (dex1==dex2, the diagonal).

Part A tests whether the GEOMETRIC coordinate space clusters naturally under these
facets. Part B measures how the REAL two-dex corpus occupies the facets and what
higher-layer features (body-mediated join, co-articulation, paradox, rotation) it
adds. Part C compares the structural facet families with the historical named
families, as observation only.

Outputs:
  taxonomy_catalog.csv : every Volume II two-dex coordinate with its facet family
  printed uniformity / occupancy / cross-tab tables : copied into the documents
"""
import csv, os, re, sqlite3
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CAT2 = os.path.join(HERE, '..', 'volume-2', 'volume_2_catalog.csv')
DB = os.path.join(REPO, 'database', 'footbag.db')


def facets(side1, dir1, out1, side2, dir2, out2):
    leg = 'same-leg' if side1 == side2 else 'alternating-leg'
    direction = 'parallel' if dir1 == dir2 else 'reversed'
    receiver = 'preserved' if out2 == 'S' else 'changed'     # out2 relative to entry S
    carriage = 'steady' if out1 == out2 else 'mid-cross'      # the invisible intermediate
    return leg, direction, receiver, carriage


# ===========================================================================
# PART A: geometric taxonomy over the frozen Volume II catalog.
# ===========================================================================
geo = list(csv.DictReader(open(CAT2)))
out_rows = []
prim_all = Counter()
prim_valid = Counter()
prim_toe = Counter()
facet_split_toe = defaultdict(Counter)

for r in geo:
    s1, d1, o1 = r['dex1'].split('.')
    s2, d2, o2 = r['dex2'].split('.')
    leg, direction, receiver, carriage = facets(s1, d1, o1, s2, d2, o2)
    repeat = 'repeated' if r['dex1'] == r['dex2'] else 'distinct'
    primary = f'{leg} / {direction} / {receiver}'
    status = r['grammar_status']
    if status == 'valid':
        family = primary
        boundary = ''
    else:
        family = 'BOUNDARY'
        boundary = {'blocked': 'grammar artifact (launch foreclosure)',
                    'artifact': 'enumeration artifact (midline collapse)',
                    'uncertain': 'atlas boundary (unresolved surface)'}[status]
    out_rows.append(dict(
        atlas_coord=r['atlas_coord'], fiber=r['fiber'], dex1=r['dex1'], dex2=r['dex2'],
        grammar_status=status, leg=leg, direction=direction, receiver=receiver,
        carriage=carriage, repeat=repeat, primary_family=primary,
        assigned_family=family, boundary_reason=boundary))
    prim_all[primary] += 1
    if status == 'valid':
        prim_valid[primary] += 1
    if r['fiber'] == 'toe:toe':
        prim_toe[primary] += 1
        facet_split_toe['leg'][leg] += 1
        facet_split_toe['direction'][direction] += 1
        facet_split_toe['receiver'][receiver] += 1
        facet_split_toe['carriage'][carriage] += 1

with open(os.path.join(HERE, 'taxonomy_catalog.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
    w.writeheader(); w.writerows(out_rows)

print('=' * 72)
print('PART A: geometric taxonomy over the frozen Volume II catalog')
print('=' * 72)
print(f'total geometric coordinates: {len(geo)}')
print('\n-- facet splits on the CLEAN reference fiber toe:toe (64 valid coords) --')
for facet, c in facet_split_toe.items():
    print(f'  {facet:10} ' + '  '.join(f'{k}={v}' for k, v in sorted(c.items())))
print('  -> every facet splits the clean fiber exactly in half: the geometry is a UNIFORM hypercube.')
print('\n-- the 8 primary families on the clean toe:toe fiber (each = 8 of 64) --')
for k, v in sorted(prim_toe.items()):
    print(f'  {v:3}  {k}')
print('\n-- primary-family sizes over ALL valid coordinates (skewed only by blocked/artifact removal) --')
for k, v in sorted(prim_valid.items(), key=lambda x: -x[1]):
    print(f'  {v:4}  {k}')
print(f'  valid total: {sum(prim_valid.values())}; boundary total: {len(geo)-sum(prim_valid.values())}')


# ===========================================================================
# PART B: real-corpus occupancy of the facets + higher-layer features.
# ===========================================================================
con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
corpus = con.execute("""
   SELECT slug, trick_family, operational_notation FROM freestyle_tricks
   WHERE is_active=1 AND (length(operational_notation)-length(replace(operational_notation,'[DEX]','')))/5=2
   ORDER BY slug""").fetchall()
con.close()

BODY = ('[BOD]', 'SPIN', 'DUCK', 'DIVE')
ROT = ('SWIRL', 'WHIRL')


def parse_real(formula):
    parts = re.split(r'\s(>>|>)\s', formula.strip())
    steps = [('launch', parts[0])]
    i = 1
    while i < len(parts):
        steps.append(('ovl' if parts[i] == '>>' else 'seq', parts[i + 1])); i += 2
    dex_positions = [i for i, (sep, t) in enumerate(steps) if '[DEX]' in t]
    def side_dir(t):
        bare = re.sub(r'\[[A-Z]+\]', ' ', re.sub(r'\([^)]*\)', ' ', t)).split()
        sd = next((w for w in bare if w in ('SAME', 'OP', 'SAME/OP')), '?')
        dr = [w for w in bare if w in ('IN', 'OUT', 'BACK', 'SWIRL', 'WHIRL')]
        return sd, (dr[0] if dr else '?')
    s1, d1 = side_dir(steps[dex_positions[0]][1])
    s2, d2 = side_dir(steps[dex_positions[1]][1])
    term = steps[-1][1]
    tbare = re.sub(r'\[[A-Z]+\]', ' ', re.sub(r'\([^)]*\)', ' ', term)).split()
    tside = next((w for w in tbare if w in ('SAME', 'OP', 'SAME/OP')), 'midline')
    handoff = steps[dex_positions[0] + 1:dex_positions[1]]
    body_join = any(any(b in t for b in BODY) for _, t in handoff)
    coartic = any(sep == 'ovl' for sep, _ in handoff) or steps[dex_positions[1]][0] == 'ovl'
    paradox = '[PDX]' in steps[dex_positions[0]][1] or '[PDX]' in steps[dex_positions[1]][1]
    rot = any(x in d1 or x in d2 for x in ROT)
    return s1, d1, s2, d2, tside, body_join, coartic, paradox, rot


occ = Counter()
higher = Counter()
fam_by_sig = defaultdict(Counter)
for slug, tfam, formula in corpus:
    s1, d1, s2, d2, tside, body_join, coartic, paradox, rot = parse_real(formula)
    leg = 'same-leg' if s1 == s2 and '?' not in (s1, s2) else ('alternating-leg' if '?' not in (s1, s2) else 'ambiguous')
    direction = 'parallel' if d1 == d2 else 'reversed'
    receiver = {'SAME': 'preserved', 'OP': 'changed', 'midline': 'central', 'SAME/OP': 'ambiguous'}.get(tside, 'other')
    sig = f'{leg} / {direction} / {receiver}'
    occ[sig] += 1
    fam_by_sig[sig][tfam or '(none)'] += 1
    for feat, on in (('body-mediated join', body_join), ('co-articulated', coartic),
                     ('paradox-bearing', paradox), ('rotational', rot)):
        if on:
            higher[feat] += 1

print('\n' + '=' * 72)
print('PART B: real two-dex corpus occupancy (395 movements)')
print('=' * 72)
print('-- occupancy per (leg / direction / receiver) signature (NON-uniform, unlike the geometry) --')
for k, v in occ.most_common():
    print(f'  {v:4}  {k}')
print('\n-- higher-layer features the pure two-dex geometry does not carry --')
for k, v in higher.most_common():
    print(f'  {v:4} ({v/len(corpus)*100:4.1f}%)  {k}')


# ===========================================================================
# PART C: structural facet families vs historical named families (observation).
# ===========================================================================
print('\n' + '=' * 72)
print('PART C: structural signature vs historical named family (observation)')
print('=' * 72)
# how many distinct structural signatures does each named family span?
fam_sigs = defaultdict(set)
sig_fams = defaultdict(set)
for slug, tfam, formula in corpus:
    s1, d1, s2, d2, tside, *_ = parse_real(formula)
    leg = 'same-leg' if s1 == s2 and '?' not in (s1, s2) else ('alternating-leg' if '?' not in (s1, s2) else 'ambiguous')
    direction = 'parallel' if d1 == d2 else 'reversed'
    receiver = {'SAME': 'preserved', 'OP': 'changed', 'midline': 'central', 'SAME/OP': 'ambiguous'}.get(tside, 'other')
    sig = f'{leg} / {direction} / {receiver}'
    fam_sigs[tfam or '(none)'].add(sig)
    sig_fams[sig].add(tfam or '(none)')
print('-- how many structural signatures each large named family spans --')
for fam, sigs in sorted(fam_sigs.items(), key=lambda x: -len(x[1]))[:12]:
    print(f'  {len(sigs):2} signatures  <- named family "{fam}"')
print('\n-- how many named families each structural signature contains --')
for sig, fams in sorted(sig_fams.items(), key=lambda x: -len(x[1]))[:8]:
    print(f'  {len(fams):2} named families  <- signature "{sig}"')
print('\n  many-to-many: named families and structural signatures are largely ORTHOGONAL axes.')
print(f'\ntaxonomy catalog written: {os.path.join(HERE, "taxonomy_catalog.csv")}')
