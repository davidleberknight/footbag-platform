#!/usr/bin/env python3
"""
Atlas application: the toe-to-toe triple-dex variation matrix. Generator (read-only).

Exploratory research under exploration/. Not production data, not doctrine, not a
change to the live dictionary. Reads the dictionary notation read-only (mode=ro) and
writes only under this folder. It modifies no production code, no dictionary row, no
alias, no status, no notation, and no Atlas volume. It authors no trick, invents no
name, recommends no promotion, and makes no physical-realizability claim.

Narrow bounded question: for movements that begin from a toe stall, contain exactly
three dexterity events using established dex structures only, and end on a toe stall,
what structurally distinct formulas exist, and which SAME / OP / NEAR / FAR positional
readings are genuine distinctions versus redundant wording?

Two positional axes, kept separate (the whole point):
  * LEG-SIDE axis (axis 1): each dex's leg relationship, SAME or OP. A leg-side
    difference is a DIFFERENT structural base, so it is enumerated as a base, never as
    a positional reading. (pixie double pickup vs its same-side variant differ on this
    axis: dex2 SAME vs OP -> two different bases.)
  * TERMINAL-RECEIVER axis (axis 2): which foot the final toe delay lands on. This is
    the positional reading under test. The four submitted labels map onto the two
    representable terminals: SAME and NEAR both denote the near/same-foot terminal
    ("SAME TOE [DEL]"); OP and FAR both denote the far/opposite-foot terminal
    ("OP TOE [DEL]"). The receiver-DISTANCE nuance of NEAR/FAR beyond that same/op
    token is not separately written in the notation (Atlas Volume III), so a pure
    near/far distance reading is representation-ambiguous.

Bounded grammar (per the slice): TOE launch, exactly three dex events, each dex a
(side in {SAME,OP}) x (direction in {IN,OUT}) token, TOE terminal. Excluded and never
generated: body operators, spins/ducks/dives, symposium, paradox, x-dex, pogo,
unusual surfaces, kicks, non-toe endings, and any direction beyond IN/OUT (a corpus
trick carrying backside/BS or a SET launch is reported as outside this IN/OUT model,
never forced in).

Stages: (1) build 64 leg-side bases; (2) expand the 4 terminal-receiver readings;
(3) normalize equivalences (4 labels -> 2 representable terminals; co-articulation
folded into formula identity); (4) compare each distinct formula against the corpus by
formula identity, not literal name.
"""
import csv, os, re, sqlite3
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
DB = os.path.join(REPO, 'database', 'footbag.db')

SIDES = ['SAME', 'OP']
DIRS = ['IN', 'OUT']
# axis-2 label -> representable terminal side; and whether it adds a distance nuance
TERMINAL_LABELS = {
    'SAME': ('SAME', False),  # near/same foot, plain leg-side token
    'NEAR': ('SAME', True),   # near foot, receiver-distance wording over the same token
    'OP':   ('OP',   False),  # far/opposite foot, plain leg-side token
    'FAR':  ('OP',   True),   # far foot, receiver-distance wording over the op token
}


def base_id(chain):
    return '-'.join(f'{s_tok(s)}{d}' for s, d in chain)


def s_tok(x):
    return 'S' if x == 'SAME' else 'O'


def formula_str(chain, term_side):
    body = ' > '.join(f'{s} {d} [DEX]' for s, d in chain)
    return f'TOE > {body} > {term_side} TOE [DEL]'


def formula_identity(chain, term_side):
    # separator-blind, name-blind: the tuple that defines the movement formula
    return (tuple(chain), term_side)


# ---------------------------------------------------------------------------
# Corpus: pure triple-dex toe->toe formulas, read-only, by formula identity.
# ---------------------------------------------------------------------------
def load_corpus():
    con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    rows = con.execute("""
        SELECT slug, operational_notation FROM freestyle_tricks
        WHERE is_active=1
          AND (length(operational_notation)-length(replace(operational_notation,'[DEX]','')))/5 = 3
          AND operational_notation LIKE '%TOE [DEL]'
          AND operational_notation NOT LIKE '%[BOD]%'
          AND operational_notation NOT LIKE '%[PDX]%'
          AND operational_notation NOT LIKE '%[XDEX]%'
          AND operational_notation NOT LIKE '%[XBD]%'
          AND operational_notation NOT LIKE '%SPIN%'
          AND operational_notation NOT LIKE '%DUCK%'
          AND operational_notation NOT LIKE '%DIVE%'
          AND operational_notation NOT LIKE '%no plant%'
    """).fetchall()
    # aliases for the matched-object reporting (formula-identity match still keys the class)
    con.close()
    by_identity = defaultdict(list)   # identity -> list of (slug, coarticulated?, launch)
    outside = []                       # corpus rows outside the IN/OUT toe-launch model
    for slug, notation in rows:
        parsed = parse_notation(notation)
        if parsed is None:
            outside.append((slug, notation))
            continue
        chain, term_side, coartic, launch_toe = parsed
        if not launch_toe:
            outside.append((slug, notation))
            continue
        by_identity[formula_identity(chain, term_side)].append((slug, coartic))
    return by_identity, outside


def parse_notation(notation):
    """Return (chain, term_side, coarticulated, launch_is_toe) or None if outside the
    IN/OUT toe-launch model (backside/BS, SET launch, or any non-IN/OUT direction)."""
    launch_is_toe = notation.strip().startswith('TOE ')
    steps = re.split(r'\s(?:>>|>)\s', notation.strip())
    coartic = '>>' in notation
    dex_steps = [s for s in steps if '[DEX]' in s]
    if len(dex_steps) != 3:
        return None
    chain = []
    for st in dex_steps:
        bare = re.sub(r'\[[A-Z]+\]', ' ', re.sub(r'\([^)]*\)', ' ', st)).split()
        side = next((w for w in bare if w in ('SAME', 'OP')), None)
        direction = next((w for w in bare if w in ('IN', 'OUT')), None)
        # any direction token that is not IN/OUT (BS, BACK, SWIRL...) -> outside model
        exotic = any(w in ('BS', 'BACK', 'SWIRL', 'WHIRL') for w in bare)
        if side is None or direction is None or exotic:
            return None
        chain.append((side, direction))
    term = steps[-1]
    tbare = re.sub(r'\[[A-Z]+\]', ' ', term).split()
    term_side = next((w for w in tbare if w in ('SAME', 'OP')), None)
    if term_side is None:
        return None
    return chain, term_side, coartic, launch_is_toe


CORPUS, CORPUS_OUTSIDE = load_corpus()

# The two named test cases, by formula identity (grounded from the DB this run).
TEST_CASES = {
    'pixie_eggbeater':        formula_identity([('SAME', 'IN'), ('OP', 'OUT'), ('OP', 'OUT')], 'SAME'),
    'pixie_double_leg_over':  formula_identity([('SAME', 'IN'), ('OP', 'IN'), ('OP', 'OUT')], 'SAME'),
}

# ---------------------------------------------------------------------------
# Stages 1-3: enumerate bases, expand positional readings, normalize.
# ---------------------------------------------------------------------------
reading_rows = []      # one row per generated positional reading (the matrix CSV)
eqgroups = {}          # formula identity -> equivalence-group id
distinct = {}          # formula identity -> representative dict

bases = [[(s1, d1), (s2, d2), (s3, d3)]
         for s1 in SIDES for d1 in DIRS
         for s2 in SIDES for d2 in DIRS
         for s3 in SIDES for d3 in DIRS]

def eqid_for(identity):
    if identity not in eqgroups:
        eqgroups[identity] = f'EQ{len(eqgroups)+1:03d}'
    return eqgroups[identity]

for chain in bases:
    bid = base_id(chain)
    for label, (term_side, distance_nuance) in TERMINAL_LABELS.items():
        identity = formula_identity(chain, term_side)
        eqid = eqid_for(identity)
        formula = formula_str(chain, term_side)
        matches = CORPUS.get(identity, [])
        matched_slugs = [m[0] for m in matches]
        coartic_in_corpus = any(m[1] for m in matches)

        # classification.
        # SAME / OP are the two representable terminals: classify by what the formula
        # resolves to. NEAR / FAR are the receiver-distance WORDINGS that map onto the
        # same/op terminal; the notation writes only same/op, so a near/far label adds
        # no representable distinction (collapse, C) and any distance nuance beyond the
        # same/op token is not preserved (representation-ambiguous, noted as E).
        if not distance_nuance:
            if len(matched_slugs) >= 2:
                klass = 'B'   # formula represented, carried by 2+ names
                reason = f'formula identity carried by {len(matched_slugs)} active names'
            elif matched_slugs:
                klass = 'A'
                reason = 'formula identity matches one active canonical trick'
            else:
                klass = 'D'
                reason = 'distinct, representable formula; no active object at this identity'
        else:
            klass = 'C'
            reason = (f'{label} is receiver-distance wording for the {term_side} terminal; '
                      f'collapses onto the {term_side} reading, adding no representable '
                      f'distinction; any near/far distance beyond same/op is '
                      f'representation-ambiguous (E)')

        collapses = (label in ('NEAR', 'FAR'))

        reading_rows.append(dict(
            base_id=bid,
            symbolic_formula=formula,
            dex1=f'{chain[0][0]} {chain[0][1]}',
            dex2=f'{chain[1][0]} {chain[1][1]}',
            dex3=f'{chain[2][0]} {chain[2][1]}',
            launch_surface='toe',
            terminal_surface='toe',
            positional_reading=label,
            normalized_terminal=term_side,
            normalized_formula=formula_str(chain, term_side),
            equivalence_group=eqid,
            existing_matched_object='|'.join(matched_slugs),
            coarticulated_in_corpus='yes' if coartic_in_corpus else '',
            classification=klass,
            same_wording_collapses='yes' if collapses else '',
            representation_confidence=('low' if klass == 'C' else 'high'),
            notes=reason,
        ))
        # record distinct representable formulas (the same/op terminals; not the
        # distance-nuance duplicates)
        if not distance_nuance:
            cls = 'B' if len(matched_slugs) >= 2 else ('A' if matched_slugs else 'D')
            distinct[identity] = dict(
                equivalence_group=eqid, base_id=bid, normalized_formula=formula,
                matched=matched_slugs, classification=cls)

# ---------------------------------------------------------------------------
# Stage 4 outputs.
# ---------------------------------------------------------------------------
# 1. matrix CSV
mcols = ['base_id', 'symbolic_formula', 'dex1', 'dex2', 'dex3', 'launch_surface',
         'terminal_surface', 'positional_reading', 'normalized_terminal',
         'normalized_formula', 'equivalence_group', 'existing_matched_object',
         'coarticulated_in_corpus', 'classification', 'same_wording_collapses',
         'representation_confidence', 'notes']
with open(os.path.join(HERE, 'triple_dex_matrix.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=mcols); w.writeheader(); w.writerows(reading_rows)

# 2. distinct-formula catalog
dcols = ['equivalence_group', 'base_id', 'normalized_formula', 'classification', 'existing_matched_object']
with open(os.path.join(HERE, 'distinct_formula_catalog.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=dcols); w.writeheader()
    for identity, d in sorted(distinct.items(), key=lambda kv: kv[1]['equivalence_group']):
        w.writerow(dict(equivalence_group=d['equivalence_group'], base_id=d['base_id'],
                        normalized_formula=d['normalized_formula'],
                        classification=d['classification'],
                        existing_matched_object='|'.join(d['matched'])))

# ---------------------------------------------------------------------------
# Printed summaries.
# ---------------------------------------------------------------------------
from collections import Counter
print('=' * 70)
print('TOE-TO-TOE TRIPLE-DEX VARIATION MATRIX')
print('=' * 70)
print(f'structural bases (leg-side chains): {len(bases)}')
print(f'generated positional readings: {len(reading_rows)}  (= {len(bases)} x 4 labels)')
print(f'distinct representable formulas (after normalization): {len(distinct)}')
print(f'corpus pure-3dex-toe-toe formulas matched by identity: '
      f'{sum(1 for d in distinct.values() if d["matched"])}')
print(f'corpus rows OUTSIDE the IN/OUT toe-launch model (reported, not forced in): {len(CORPUS_OUTSIDE)}')
for slug, notation in sorted(CORPUS_OUTSIDE):
    print(f'    {slug}: {notation}')

print('\n-- reading rows by classification --')
for k, v in sorted(Counter(r['classification'] for r in reading_rows).items()):
    print(f'  {k}: {v}')
print('\n-- distinct formulas by classification --')
for k, v in sorted(Counter(d['classification'] for d in distinct.values()).items()):
    print(f'  {k}: {v}')

# occupancy
canonA = sum(1 for d in distinct.values() if d['classification'] == 'A')
canonB = sum(1 for d in distinct.values() if d['classification'] == 'B')
unnamed = sum(1 for d in distinct.values() if d['classification'] == 'D')
collapses = sum(1 for r in reading_rows if r['same_wording_collapses'] == 'yes')
print('\n-- occupancy summary --')
print(f'  total generated readings              : {len(reading_rows)}')
print(f'  distinct formulas (normalized)        : {len(distinct)}')
print(f'  existing canonical, single name (A)   : {canonA}')
print(f'  existing formula, 2+ names (B)        : {canonB}')
print(f'  NEAR/FAR wording collapses (C)        : {collapses}')
print(f'  distinct unnamed coordinates (D)      : {unnamed}')
print(f'  representation-ambiguous distance (E) : the near/far nuance on all {collapses} C rows')
print(f'  corpus formulas outside bounded grammar (F, reported not generated): {len(CORPUS_OUTSIDE)}')

# the two explicit test cases + their FAR counterparts
print('\n-- the two named test cases + their FAR (op-terminal) counterparts --')
for name, identity in TEST_CASES.items():
    chain, term = identity
    near = distinct.get(formula_identity(list(chain), 'SAME'))
    far = distinct.get(formula_identity(list(chain), 'OP'))
    print(f'  {name}:')
    print(f'      near (SAME TOE): {near["normalized_formula"]}  -> {near["classification"]} '
          f'({"/".join(near["matched"]) or "unnamed"})')
    print(f'      FAR  (OP  TOE ): {far["normalized_formula"]}  -> {far["classification"]} '
          f'({"/".join(far["matched"]) or "unnamed"})')

print(f'\nwrote: triple_dex_matrix.csv ({len(reading_rows)} rows), '
      f'distinct_formula_catalog.csv ({len(distinct)} rows)')
