# Vetted Promotion Inventory (promotable-now)

Built from the live frontier (`wave1-triage` non-active) against the current DB, with aggressive
dedup and the full exclusion filter set. Full row table: `PROMOTION_INVENTORY.csv`.

## Honest count: 52 (not 100)

The frontier does **not** contain 100 candidates that pass all filters. After aggressive dedup
the vetted pool is **52**. Exclusion tally (why the rest dropped):

| Reason | Count |
|---|---|
| no settled operator in the name | 659 |
| blocker token (DOD/weaving/pogo/blurry/blazing/spyro/movement-verb/atomic/furious/illusioning/surging/swivel/alpine) | 429 |
| **structural duplicate** (same operator-set + base already active under another/folk name, e.g. paste = pixie-da-da-curve) | 305 |
| base needs folk identification | 141 |
| already active / alias (exact slug) | 68 |
| DOD / DDD (incl. `ddd` abbreviation) | 52 |
| folk-name resolves to an active alias | 9 |
| X-Dex open-doctrine guard (nuclear/quantum/sailing × mirage/illusion/whirl/swirl/torque/drifter) | 4 |

**Survivors: 52** — class A=18, B=24, C=10; risk low=18, medium=34.

## Filters applied (all must pass)
no open doctrine · no Red ruling · no folk-identification · no active alias/equivalent · no
abbreviation variant · no naming-governance (furious≡barraging, spyro, illusioning) · no
atomic-held · no DOD/Weaving/Pogo/Blurry/Blazing/Spyro/movement-verb · **+ structural-identity
dedup** (operator-set + base, not just slug) · **+ X-Dex guard** (trigger×receiver excluded).

## Authoring classes
- **A** single settled operator on settled (atom) base — 18
- **B** multiple settled operators on settled base — 24
- **C** settled operator on resolved (active) folk/compound base — 10
- **D** new chassis required — excluded (no mirror; e.g. terraging has no op_notation exemplar)

## Ranking = promotions-per-hour (class A fastest, then low-risk B/C), risk as tiebreak

### Recommended FIRST BATCH — the 18 low-risk (execute these first)
Every one: common operators, core/active base, exact sibling mirror exemplar, ADD computed.

| # | cls | slug | base | operators | ADD | mirror exemplar |
|---|---|---|---|---|---|---|
| 1 | A | quantum-butterfly-swirl | butterfly-swirl | quantum | 5 | quantum-drifter |
| 2 | A | quantum-double-leg-over | double-leg-over | quantum | 4 | quantum-drifter |
| 3 | A | quantum-flail | flail | quantum | 4 | quantum-drifter |
| 4 | A | miraging-flail | flail | miraging | 4 | miraging-eclipse |
| 5 | A | barraging-double-leg-over | double-leg-over | barraging | 5 | barraging-pickup |
| 6 | B | paradox-symposium-torque | torque | paradox+symposium | 6 | paradox-symposium-eggbeater |
| 7 | B | pixie-ducking-butterfly-swirl | butterfly-swirl | pixie+ducking | 6 | pixie-ducking-osis |
| 8 | B | stepping-ducking-butterfly-swirl | butterfly-swirl | stepping+ducking | 6 | stepping-ducking-smudge |
| 9 | B | stepping-ducking-double-pickup | double-pickup | stepping+ducking | 5 | stepping-ducking-smudge |
| 10 | B | fairy-ducking-drifter | drifter | fairy+ducking | 5 | fairy-ducking-clipper |
| 11 | B | fairy-gyro-barrage | barrage | fairy+gyro | 5 | fairy-gyro-butterfly |
| 12 | B | fairy-gyro-double-leg-over | double-leg-over | fairy+gyro | 5 | fairy-gyro-butterfly |
| 13 | B | pixie-gyro-double-leg-over | double-leg-over | pixie+gyro | 5 | pixie-mirage |
| 14 | B | diving-symposium-whirl | whirl | diving+symposium | 5 | fairy-diving-butterfly |
| 15 | B | pixie-diving-osis | osis | pixie+diving | 5 | pixie-diving-mirage |
| 16 | B | stepping-diving-double-leg-over | double-leg-over | stepping+diving | 5 | stepping-diving-butterfly |
| 17 | B | tapping-diving-mirage | mirage | tapping+diving | 4 | tapping-mobius |
| 18 | B | tapping-whirling-swirl | swirl | tapping+whirling | 5 | tapping-mobius |

### To round to 25 — next-tier (class A but medium risk: thin-chassis +2/+3 composite operators)
pixie-butterfly-swirl, nuclear-osis, shooting-illusion, shooting-legover, shooting-pickup,
sailing-clipper, sailing-pickup. **Hold these** behind the 18 — shooting carries the open ss
residual (C1); sailing/railing/surfing have ≤6 chassis exemplars (more derivation judgement).

## Throughput estimate
- 18 low-risk: ~5 class-A @ ~8/hr + 13 class-B @ ~3.3/hr ≈ **0.6h + 3.9h ≈ 4.5h** to clear all 18.
- Full 52: ≈ 12–14h (the medium tail is slower per item).

## Notes
- Risk = medium when an operator has <10 active chassis exemplars (railing 3 / sailing 6 /
  surfing 1 / shooting 8 / backside 3 / nuclear 13-but-policy_dependent), or ≥3 operators, or a
  reverse-direction base, or a folk (C) base.
- Class-C bases verified active: dragon(2), refraction(3), clipper-symposium-whirl(4),
  symposium-mirage/swirl/torque, paradox-symposium-whirl.
- No tricks authored — inventory only.
