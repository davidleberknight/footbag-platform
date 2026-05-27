# ADD Conflict Summary

Audit of `ADD_CONFLICT_MATRIX.csv` (277 rows across IFPA-internal / FM / PassBack). Grouped by conflict type per user spec.

Computed ADD is evidence, not authority. Stated ADD values are preserved unchanged. See `ADD_FORMULA_ASSUMPTIONS.md` for the formula contract.

## Top-line counts

| difference_type | rows | severity floor |
|---|---:|---|
| agree-internal | 119 | low |
| unresolved-tokens | 84 | medium (most are missing-notation, not ontology conflicts) |
| pb-metric-mismatch-structurally-agree | 25 | low |
| agree-pb-structural | 15 | low |
| incomplete | 11 | low |
| pb-metric-mismatch-structural-disagree | 11 | medium |
| fm-stated-vs-its-formula | 5 | medium |
| internal-stated-vs-computed | 3 | high |
| agree-fm | 2 | low |
| fm-vs-ifpa-stated | 2 | medium |

87 rows flagged `red_needed=yes`. Most of the 84 unresolved-tokens rows are parser-coverage artifacts (empty `notation` field in DB) -- not genuine Red items.

## Bucket 1 -- source typo / arithmetic error

**0 rows** confirmed in this audit.

The FM corpus has 5 rows where FM's own stated ADD diverges from what FM's decomposition produces (Hurl, Barfry, Godzilla, Bladerunner, Merlin). These read as internal FM data inconsistencies, but in every case the FM_MATH_DIVERGENCES matrix already documents them as `federation_math_divergence` (intentional FM-convention difference, not an FM arithmetic typo). Treat as Bucket 4 (naming/equivalence) not Bucket 1.

PassBack has no arithmetic-error rows in this audit -- its `passback_dex_count` is a different metric than ADD, so direct numeric disagreement is expected.

## Bucket 2 -- operator-value disagreement

**3 rows.** These are the IFPA-internal pt12-open items:

| trick | stated | computed | formula | status |
|---|---:|---:|---|---|
| blurry-whirl | 5 | 4 | blurry(+1) + whirl(3) = 4 | pt12 OPEN |
| blurry-torque | 6 | 5 | blurry(+1) + torque(4) = 5 | pt12 OPEN |
| barraging-osis | 5 | 4 | barraging(+1) + osis(3) = 4 | pt12 OPEN |

All three show the +1 pattern: stated is one higher than the flat-additive formula predicts. The question is whether `blurry` carries a rotational bonus (pt11 ruled flat +1, but rotational-base behavior was deferred) and whether `barraging` carries a similar rotational bonus on rotational bases.

These three are the heart of the Red packet (`RED_ADD_QUESTION_PACKET.md`).

## Bucket 3 -- decomposition disagreement

**Not surfaced as a distinct category in this pass**, but two latent classes exist:

**3a. Focus-target tricks parsed as self-atom in DB.** Atomsmasher, Fury, Royale, Witchdoctor, Omelette, Terrage, Bullwhip, Eclipse, Mobius, Superfly, and ~30 other compound tricks have `computed_add_formula` of the form `<slug>(N) = N` (self-atom). The DB parser is treating these as primitives because their `notation` field is empty.

Examples (DB rows):
```
atom-smasher : notation=''      ; formula='atom-smasher(4) [self-atom] = 4'
fury         : notation=''      ; formula='fury(5) = 5'
witchdoctor  : notation=''      ; formula='witchdoctor(4) = 4'
royale       : notation=''      ; formula='royale(4) = 4'
omelette     : notation=''      ; formula='omelette(3) = 3'
terrage      : notation=''      ; formula='terrage(4) = 4'
matador      : notation='NUCLEAR BUTTERFLY' ; formula='matador(5) = 5'  (wrong shape; should be nuclear(+2)+butterfly(3)=5)
blur         : notation='STEPPING PARADOX MIRAGE' ; formula='blur(4) = 4'  (same; computes via decomp but stored as self-atom)
```

These rows ALL agree (stated == computed) only because the DB parser is not actually decomposing. The real question -- does the formula on the canonical decomposition agree with stated? -- is unaddressed.

This is the parser-coverage gap, not an ontology conflict. See `ADD_POLICY_REFINEMENT.md` for the structural fix.

**3b. PassBack notation suggests a different decomposition than IFPA.** 11 rows: Atomsmasher, Blur, Dada Curve, Drifter, Flurry, Food Processor, Fury, Gauntlet, Montage, Spender, Sumo. In each case PB's technical_name produces a formula that gives N-1 vs IFPA stated.

| Trick | IFPA stated | PB technical_name | Formula on PB notation |
|---|---:|---|---:|
| atom-smasher | 4 | Atomic far Mirage | 3 |
| blur | 4 | Stepping far Mirage | 3 |
| drifter | 3 | Miraging far Clipper | 2 |
| dada-curve | 4 | Miraging far Symp. Butterfly | 5 (over) |
| fury | 5 | Barraging far Mirage | 3 |
| food-processor | 6 | Stepping far Blender | 5 |
| montage | 7 | Spinning Ducking far Symp. Whirl | 6 |
| sumo | 5 | Nuclear far Mirage | 4 |

Most cases: PB's decomposition gives stated-1. Reading: either PB's decomposition is INCOMPLETE (missing an implicit operator that IFPA encodes elsewhere) OR IFPA's stated value bakes in an additional +1 that the literal decomposition doesn't justify. The pattern recurrence (10 of 11 are -1 direction) suggests the latter -- an `atomic-set-as-modifier` polysemy or rotational-bonus claim that's not encoded in `ADD_FORMULA_ASSUMPTIONS.md`.

Cross-reference: Bladerunner (FM): `atomic + eggbeater` = 4 (IFPA) vs 5 (FM); same +1 direction. FM and IFPA agree on the IFPA-additive formula here; FM is the outlier. PassBack's case is the opposite -- PB derives N-1, IFPA stated is N.

The systemic pattern across PB rows suggests **atomic-as-set-modifier may carry +2 on more bases than just rotational** OR **PB's `far` positional may be carrying an implicit ADD that the IFPA reading captures elsewhere**. Either way, the formula table needs review.

## Bucket 4 -- naming/equivalence disagreement (FM federation)

**7 rows** under `fm-stated-vs-its-formula` (5) + `fm-vs-ifpa-stated` (2). All are FM_MATH_DIVERGENCES rows we already track.

| FM term | FM stated | IFPA stated | IFPA formula | matrix disposition |
|---|---:|---:|---|---|
| Hurl | 4 | 5 | nuclear(+2) + ss(+0) + whirl(3) = 5 | federation_math_divergence (SS=+0) |
| Barfry | 4 | 5 | nuclear(+2) + ss(+0) + butterfly(3) = 5 | federation_math_divergence (SS=+0) |
| Godzilla | 5 | 6 | nuclear(+2) + ss(+0) + dyno(4) = 6 | federation_math_divergence (SS=+0) |
| Nuclear Mirage (same side) | 4 | 5 | (pt9 X-Dex sumo) | unresolved_other_reason (pt9, not SS) |
| Bladerunner | 5 | 4 | atomic(+1) + eggbeater(3) = 4 | federation_math_divergence (FM-over) |
| Merlin | 5 | 4 | miraging(+1) + symposium(+1) + mirage(2) = 4 | federation_math_divergence (FM-over) |
| Enterrage | 4 | 6 (matrix claim) | terraging(+3) + legover(2) = 5 (my formula) | federation_math_divergence (-2) |

**Sub-finding (Enterrage)**: the existing FM_MATH_DIVERGENCES matrix asserts IFPA=6, but my formula on `terraging + legover` (with legover=2 per DB) gives 5. The matrix's IFPA=6 implies legover=3 was used, which contradicts the DB core-atom value. This is an internal disagreement in the IFPA-side reference data, surfaced for the first time by this audit.

All other FM rows are pre-classified as accept-as-folk-evidence; no action needed beyond preserving the existing matrix.

## Bucket 5 -- missing operator definition (Q4 + unresolved tokens)

**84 IFPA-internal `unresolved-tokens` rows.** Two sub-classes:

**5a. Tricks with empty `notation`** (most common). The parser has no decomposition to evaluate. Examples: atomic, barfly, eclipse, mobius, sumo, vortex, ripstein, sidewalk, spyro, toe-stall, heel-stall, hop-over, walk-over.

These are NOT Red questions -- they're notation-data gaps. The grammar parser needs notation strings to operate. Some are sui generis tricks (toe-stall, hop-over) that may not have a meaningful decomposition; others (Eclipse, Mobius, Sumo, Vortex) probably DO have decompositions that just aren't recorded.

**5b. Tricks whose decomposition includes a Q4-blocked operator.** The Q4 packet (fairy, gyro, blazing, surging, railing, flailing, splicing, surfing, etc.) is the existing batch question. Any trick whose canonical decomposition includes one of these has `computed_add = unresolved`.

This bucket has zero IFPA-internal rows where the decomposition explicitly uses a Q4 operator (because IFPA doesn't currently encode FM-vocab modifiers in `notation` strings). The unresolved tokens flagged here are mostly trick-base-names that the parser doesn't recognize as bases (e.g., 'barfly', 'mobius') AND trick-stalls (toe-stall = stall on toe; no decomposition).

## Bucket 6 -- true Red-needed conflicts

**3 rows** from Bucket 2 (blurry-whirl, blurry-torque, barraging-osis). These are the irreducible structural questions that only a Red ruling can resolve.

Beyond these, the focus-target list contains potential Red items that this audit cannot definitively flag because the DB parser is self-atom-ing them (Bucket 3a). After notation backfill, these may surface as additional Red items:

- **Atomsmasher** (Atomic Mirage): +1 gap suspected from PB cross-evidence; needs verification.
- **Fury** (per pt6: furious+paradox+mirage=5): formula is already settled, but the self-atom shortcut hides whether the codified formula matches stated. Likely no Red needed.
- **Witchdoctor** (Atomic Symposium Mirage): pt12 question per recon agent (math gives 5 from atomic+symposium+mirage with atomic=+2 rotational, asserted 4). This is the high-priority focus item.
- **Quantum** (toe + miraging? quantum-set+quantum-modifier polysemy?): underspecified.
- **Royale** (no decomposition recorded; canonical=4, base=reverse-drifter): underspecified.
- **double-fairy / double-blender / double-spinning-osis**: depend on Double policy + Q4 (fairy).
- **Spyro-gyro**: Q4-blocked; depends on Q4 packet resolution.

## Bucket 7 -- already resolved by Red

**Implicitly all 119 `agree-internal` rows** plus the FM federation_math_divergence rows where the resolution is documented in FM_MATH_DIVERGENCES.csv. No action.

Special: SS=+0 (Red pt12 ruling) closes all Nuclear-ss cases. Blur (pt11) closes the stepping+paradox+mirage formula. Whirling = Whirl + Osis (pt11) closes Blender. Miraging = Mirage + base (pt11) closes Drifter, Torque, Atomsmasher decompositions (when applied).

## What the audit confirms

- 119 of 161 IFPA tricks have computed = stated. The formula contract holds where notation is populated.
- 25 PB rows give matching ADD when their notation is run through IFPA's formula, despite PB's `passback_dex_count` being a different metric.
- All 7 FM federation rows already have dispositions in FM_MATH_DIVERGENCES.csv; this audit corroborates them.

## What the audit surfaces as new

1. **The 3 pt12 internal disagreements** (blurry-whirl, blurry-torque, barraging-osis) are unambiguously high-severity and Red-needed.
2. **The DB parser's self-atom shortcut** is hiding decomposition questions on ~30 named compound tricks. Notation backfill is the structural fix.
3. **A systemic +1 pattern in PB structural disagreements** suggests `ADD_FORMULA_ASSUMPTIONS.md` may need to widen `atomic-as-modifier` rotational classification or recognize that PB's `far` positional carries implicit +1 weight.
4. **The Enterrage matrix-vs-formula disagreement** is an internal inconsistency in FM_MATH_DIVERGENCES.csv (claims IFPA=6, formula gives 5 with legover=2).
5. **Witchdoctor** is a high-priority focus target whose DB self-atom shortcut is hiding the pt12 question.

See `RED_ADD_QUESTION_PACKET.md` for the irreducible Red items and `ADD_POLICY_REFINEMENT.md` for the formula-table recommendations.
