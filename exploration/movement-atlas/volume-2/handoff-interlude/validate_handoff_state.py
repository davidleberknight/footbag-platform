#!/usr/bin/env python3
"""
Two-dex handoff-state validation. Read-only.

Exploratory research under exploration/. Not production data, not doctrine, not a
change to the live dictionary. It READS the live dictionary's operational notation
read-only and writes only under this folder. It modifies nothing: not the dictionary,
not the parser, not Grammar v1, not Volume I, not frozen Volume II. It uses no video
and no expert judgment; it reasons only from the notation already recorded.

Purpose: falsify or validate the proposed four-part internal handoff state
  ( carriage_side , reference_foot_identity , support_free_leg_parity , stance_mode )
against every canonical trick whose operational notation contains exactly two
dexterity events. For each row it parses the event sequence, attempts to reconstruct
the handoff after the first dexterity, and classifies whether the four components
suffice to make the second dexterity intelligible. Scoring is recorded but never used
to infer handoff structure.

Outputs:
  handoff_validation_rows.csv : one row per two-dex movement (the row-level CSV)
  printed scorecard, class distribution, and counterexample summary
"""
import csv
import os
import re
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
DB = os.path.join(REPO, 'database', 'footbag.db')

BODY_EVENTS = ('[BOD]', 'SPIN', 'DUCK', 'DIVE', 'WEAVE', 'ZULU')
ROT_DIR = ('SWIRL', 'WHIRL', 'BACK')  # directions beyond the binary IN/OUT


def load_corpus():
    con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    cur = con.execute("""
        SELECT slug, adds, computed_adds, operational_notation
        FROM freestyle_tricks
        WHERE is_active=1
          AND operational_notation IS NOT NULL AND operational_notation<>''
          AND (length(operational_notation)-length(replace(operational_notation,'[DEX]','')))/5 = 2
        ORDER BY slug
    """)
    rows = cur.fetchall()
    con.close()
    return rows


def split_steps(formula):
    """Split into (separator, step_text). separator is 'launch', 'seq' (>), or 'ovl' (>>)."""
    # normalize spacing around separators
    parts = re.split(r'\s(>>|>)\s', formula.strip())
    steps = [('launch', parts[0].strip())]
    i = 1
    while i < len(parts):
        sep = 'ovl' if parts[i] == '>>' else 'seq'
        steps.append((sep, parts[i + 1].strip()))
        i += 2
    return steps


def step_info(text):
    posture = re.findall(r'\(([^)]*)\)', text)
    tokens = re.findall(r'\[([A-Z]+)\]', text)
    # strip posture and tokens to read the bare side/direction words
    bare = re.sub(r'\([^)]*\)', ' ', text)
    bare = re.sub(r'\[[A-Z]+\]', ' ', bare)
    words = bare.split()
    return dict(posture=posture, tokens=tokens, words=words, raw=text)


def dex_coords(info):
    side = 'unset'
    for w in info['words']:
        if w in ('SAME', 'OP', 'SAME/OP'):
            side = w
            break
    dirs = [w for w in info['words'] if w in ('IN', 'OUT', 'BACK', 'SWIRL', 'WHIRL')]
    return side, '+'.join(dirs) if dirs else 'unset'


rows = load_corpus()
out = []
from collections import Counter
cls = Counter()
comp_evidence = {c: Counter() for c in ('carriage_side', 'reference_foot', 'leg_parity', 'stance_mode', 'body_join')}
missing = Counter()
diag_kinds = Counter()

for slug, adds, cadds, formula in rows:
    steps = split_steps(formula)
    infos = [(sep, step_info(t)) for sep, t in steps]
    dex_idx = [i for i, (sep, inf) in enumerate(infos) if 'DEX' in inf['tokens']]
    launch = infos[0][1]
    entry_contact = launch['words'][0] if launch['words'] else launch['raw']
    d1 = infos[dex_idx[0]][1]
    d2 = infos[dex_idx[1]][1]
    d2_sep = infos[dex_idx[1]][0]
    handoff = infos[dex_idx[0] + 1:dex_idx[1]]  # steps strictly between the two dexes

    d1_side, d1_dir = dex_coords(d1)
    d2_side, d2_dir = dex_coords(d2)

    # --- reconstruct the four components + the corpus-forced fifth ---
    # carriage after dex1: never an explicit token; inferable only under a transition rule
    carriage_ev = 'inferred'   # requires a transition rule the notation does not supply
    # reference foot for dex2: never named in notation
    reffoot_ev = 'absent'
    # support/free leg parity: never named in notation
    legparity_ev = 'absent'
    # stance mode: explicit when a posture marker is present on the handoff or on dex2
    stance_posture = d1['posture'] + [p for _, inf in handoff for p in inf['posture']] + d2['posture']
    stance_ev = 'explicit' if stance_posture else 'default'
    # body-join (the corpus-forced candidate fifth): a body event between the two dexes
    handoff_body = any(any(b in inf['raw'] for b in BODY_EVENTS) for _, inf in handoff) \
        or 'BOD' in d1['tokens'] or 'BOD' in d2['tokens']
    body_join_ev = 'explicit' if handoff_body else 'none'

    for c, ev in (('carriage_side', carriage_ev), ('reference_foot', reffoot_ev),
                  ('leg_parity', legparity_ev), ('stance_mode', stance_ev), ('body_join', body_join_ev)):
        comp_evidence[c][ev] += 1

    # --- classification (priority order) ---
    has_overlap_handoff = any(sep == 'ovl' for sep, _ in handoff) or d2_sep == 'ovl'
    uses_rot = any(x in d1_dir or x in d2_dir for x in ROT_DIR)
    has_pdx = 'PDX' in d1['tokens'] or 'PDX' in d2['tokens']
    ambiguous_side = 'SAME/OP' in (d1_side, d2_side)

    missing_var = ''
    if handoff_body:
        klass = 'missing-variable: intervening body/orientation event'
        missing_var = 'body-join (body event between the two dexes; no slot in the four-part model)'
    elif uses_rot:
        klass = 'missing-variable: rotational/back direction'
        missing_var = 'direction beyond binary IN/OUT (SWIRL/WHIRL/BACK)'
    elif has_pdx:
        klass = 'missing-variable: paradox modifier on a dex'
        missing_var = 'per-dex paradox modifier'
    elif ambiguous_side:
        klass = 'ambiguous: dex side under-specified (SAME/OP)'
        missing_var = 'side disambiguation'
    elif has_overlap_handoff:
        klass = 'reconstructed with co-articulation; invisible ref-foot + leg-parity'
    else:
        klass = 'reconstructed only by choosing invisible ref-foot + leg-parity'
    cls[klass] += 1
    if missing_var:
        missing[missing_var.split('(')[0].strip()] += 1

    # diagonal (repeated dexterity): the two dex steps identical in side+direction
    if (d1_side, d1_dir) == (d2_side, d2_dir) and d1_side != 'unset':
        kind = 'repeated-dex, co-articulated (>>)' if has_overlap_handoff else 'repeated-dex, sequential (>)'
        diag_kinds[kind] += 1
        is_diag = kind
    else:
        is_diag = ''

    recon = (f'carriage=inferred; ref_foot=absent; leg_parity=absent; '
             f'stance={"explicit("+";".join(stance_posture)+")" if stance_posture else "default"}; '
             f'body_join={"yes" if handoff_body else "no"}')
    out.append(dict(
        slug=slug, operational_formula=formula, dex_count=2,
        dex1=f'{d1_side} {d1_dir}', dex2=f'{d2_side} {d2_dir}',
        entry_contact=entry_contact, handoff_separator_to_dex2=('overlap' if d2_sep == 'ovl' else 'sequence'),
        reconstructed_handoff=recon,
        ev_carriage=carriage_ev, ev_reference_foot=reffoot_ev, ev_leg_parity=legparity_ev,
        ev_stance=stance_ev, ev_body_join=body_join_ev,
        classification=klass, missing_variable=missing_var, diagonal=is_diag,
        adds=adds, computed_adds=cadds))

# write row-level CSV
cols = ['slug', 'operational_formula', 'dex_count', 'dex1', 'dex2', 'entry_contact',
        'handoff_separator_to_dex2', 'reconstructed_handoff', 'ev_carriage',
        'ev_reference_foot', 'ev_leg_parity', 'ev_stance', 'ev_body_join',
        'classification', 'missing_variable', 'diagonal', 'adds', 'computed_adds']
with open(os.path.join(HERE, 'handoff_validation_rows.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(out)

# ---- printed summaries ----
N = len(out)
print('=' * 72)
print(f'TWO-DEX HANDOFF-STATE VALIDATION — corpus of {N} two-dexterity movements')
print('=' * 72)

print('\n-- reconstruction class distribution --')
for k, v in cls.most_common():
    print(f'  {v:4} ({v/N*100:4.1f}%)  {k}')

print('\n-- state-model scorecard: evidence status per proposed component --')
for c in ('carriage_side', 'reference_foot', 'leg_parity', 'stance_mode', 'body_join'):
    line = '  '.join(f'{ev}={n}' for ev, n in comp_evidence[c].most_common())
    print(f'  {c:16} {line}')

print('\n-- missing-variable tally (what the four-part model could not represent) --')
for k, v in missing.most_common():
    print(f'  {v:4}  {k}')

print('\n-- repeated-dexterity diagonal (identical dex side+direction) --')
tot_diag = sum(diag_kinds.values())
print(f'  {tot_diag} repeated-dex rows found among the {N}:')
for k, v in diag_kinds.most_common():
    print(f'    {v:4}  {k}')

# rows that fully reconstruct from encoded state alone (none should, given ref/leg absent)
full = [r for r in out if r['ev_reference_foot'] == 'explicit' and r['ev_leg_parity'] == 'explicit']
print(f'\n-- rows fully reconstructable from ENCODED state alone (ref-foot + leg-parity both explicit): {len(full)} --')
print('   (zero is expected: the notation never names the reference foot or the circling leg)')

print(f'\nrow-level CSV written: {os.path.join(HERE, "handoff_validation_rows.csv")}')
