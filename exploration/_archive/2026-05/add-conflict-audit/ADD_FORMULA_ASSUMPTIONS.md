# ADD Formula Assumptions

The operator weights and base values the conflict-audit analyzer uses to compute ADD from a technical_name string. Every assumption traces to a specific Red ruling, the NF-2A operator reference, the `freestyle_tricks` DB column, or an explicit by-analogy claim.

This document is foundational: the analyzer reads it as policy. A mismatch between this document and any analyzer output is a bug in the analyzer or a stale assumption (whichever the audit surfaces).

## The formula

```
computed_add(trick) = base_add(base_trick) + Σ modifier_weight(modifier_i)
                                              for each modifier_i in decomposition
```

Positional and directional operators (ss, far, near, op, os, reverse, temporals, rooted) carry zero weight and are summed in but contribute nothing. Quantifiers (double, triple) are zero-weight wrappers; per-compound Red rulings supersede the generalization.

When any modifier in the decomposition has `unknown` weight (Q4-blocked, no IFPA add_bonus row), computed_add is `unresolved` and no comparison can be drawn.

## Base ADDs (canonical primitives)

Source: `freestyle_tricks WHERE is_core=1` from DB (13 rows). Per memory `project_freestyle_core_atoms`, fairy was added to the curator's atom registry; toe-stall and clipper-stall are captured by `clipper` (1-ADD) and the dex-stall convention rather than as explicit core rows.

| Base | ADD | Notes |
|---|---:|---|
| around-the-world | 2 | per DB; aliases: atw |
| butterfly | 3 | per DB |
| clipper | 1 | per DB; 1-ADD stall baseline |
| fairy | 2 | per DB; despite Q4-blocked-as-modifier, fairy IS a canonical base trick |
| guay | 2 | per DB |
| illusion | 2 | per DB |
| legover | 2 | per DB |
| mirage | 2 | per DB |
| osis | 3 | per DB |
| pickup | 2 | per DB |
| pixie | 2 | per DB; pixie-as-base AND pixie-as-set-modifier (+1) |
| swirl | 3 | per DB |
| whirl | 3 | per DB |

### Non-core canonical bases (additional bases used in compositions)

| Base | ADD | Source |
|---|---:|---|
| eggbeater | 3 | per pt4 (eggbeater = atomic-legover); FM_MATH_DIVERGENCES row 'Bladerunner' |
| drifter | 3 | per DB (`drifter.adds=3`) + Catacomb row of FM_MATH_DIVERGENCES |
| torque | 4 | per DB; computed via pt11 as miraging + osis = 4 |
| blender | 4 | per DB; per pt11 = whirling + osis |
| dyno | 4 | per Godzilla row of FM_MATH_DIVERGENCES |
| reverse-drifter | 4 | per DB |
| down | 1-ish | sui generis; appears in compound names (Double Down, Double Over Down); decomposition unclear |

Bases not in the above list that appear in technical_name strings (Refraction, Whip, Flux, Flapper, ...) are treated as `unknown_base` and the row is flagged `unresolved`.

## Tier-1 body modifiers (locked +1)

Source: NF-2A operator reference (curator-confirmed locked entries) + Red ruling pt11.

| Modifier | ADD | Source |
|---|---:|---|
| ducking | +1 | NF-2A locked |
| paradox | +1 | NF-2A locked |
| spinning | +1 | NF-2A locked; pt11 Red |
| stepping | +1 | NF-2A locked; pt11 Red |
| symposium | +1 | NF-2A locked; orthographic variants: symp, symp., symple |
| tapping | +1 | NF-2A locked |
| diving | +1 | NF-2A locked |

All Tier-1 body modifiers are additive on any base. No rotational/non-rotational split is encoded for Tier-1.

## Tier-1 set modifiers (locked +1, except atomic policy-dependent)

| Modifier | ADD | Source / caveat |
|---|---:|---|
| pixie | +1 | as modifier; pixie-as-base is +2 |
| quantum | +1 | as modifier; quantum-as-base is +2 |
| atomic | +1 non-rotational / +2 rotational | Red pt10; POLICY-DEPENDENT |
| nuclear | +2 | Red pt10 (= paradox + atomic) |
| blurry | +1 flat | Red pt11; pt12 OPEN for rotational bases (Blurry Whirl, Blurry Torque) |

`atomic` is the load-bearing exception to the flat-additive rule. When base is rotational (whirl, torque, swirl, drifter), atomic contributes +2; otherwise +1. Witchdoctor (Atomic Symposium Mirage) sits exactly on this boundary -- Mirage is non-rotational in IFPA's convention; pt12 has an open question on what to do about the asserted=4 vs +2-derived=5.

## Compound-set / compositional modifiers

| Modifier | ADD as modifier | Decomposition | Source |
|---|---:|---|---|
| miraging | +1 | mirage + base | Red pt11 |
| whirling | +1 | whirl + osis (per pt11 ruling: Blender = Whirling Osis) | Red pt11 |
| illusioning | +1? | illusion + base (by analogy) | not formally adjudicated |
| furious | +2 rotational | per pt6 fury = furious + paradox + mirage = 5 requires furious=+2 on rotational mirage | Red pt6; non-rotational case TBD |
| terraging | +3 | per pt6 ruling | Red pt6 |
| barraging | +1 | per IFPA modifier table; FM_MATH_DIVERGENCES corrects earlier 'Q4-blocked' claim | IFPA modifier table |

Note: `furious` non-rotational ADD is not explicitly ruled. The pt6 ruling derives +2 from the rotational case. The analyzer treats non-rotational furious as `unresolved` until ruled.

## Positional and directional operators (all +0)

| Operator | ADD | Source |
|---|---:|---|
| ss | +0 | Red 2026-05-11 |
| far | +0 | by analogy to ss; not formally adjudicated |
| near | +0 | by analogy |
| op | +0 | by analogy |
| os | +0 | by analogy |
| set | +0 | positional; pure surface marker |
| reverse | +0 | by analogy; consistent across Whirl/Torque/Blender/Drifter reverse-direction pairs |
| inspinning | +0 | direction marker for Spinning; alternate semantic |

The by-analogy claims are documented in OPERATOR_INVENTORY.csv as "ADD weight not formally adjudicated". The analyzer uses +0 but flags any conflict resolution that hinges on a by-analogy operator as `policy_dependent`.

## Temporal / pre-state operators (all +0)

| Operator | ADD | Source |
|---|---:|---|
| (uptime) | +0 | by analogy |
| (downtime) | +0 | by analogy |
| (midtime) | +0 | by analogy |
| (rooted) | +0 | Red pt8 |
| (no plant while) | +0 | operational-notation flag; not in semantic decomposition |

## Quantifiers (zero-weight wrappers; per-compound supersedes)

| Quantifier | Default ADD | Override convention |
|---|---:|---|
| double | +0 wrapper | Per-compound Red ruling supersedes. Double-Mirage, Double-Down, Double-Legover etc. carry their own ADD via canonical name. |
| triple | +0 wrapper | Same. |
| full | +0 wrapper | Used in "Full Symp" type modifiers; structural marker only. |

The double policy is the most likely source of formula noise. Many tricks have folk names that include "Double" but resolve via per-trick canonical rulings, not via additive double-the-modifier semantics.

## Q4-blocked operators (computed_add = unresolved)

These operators recur in FM corpus but have no IFPA add_bonus row and no curator decomposition. Any trick whose decomposition includes one of these has `computed_add = unresolved`.

- fairy
- gyro
- blazing
- surging
- railing
- flailing
- splicing
- surfing
- twinspinning
- jolimont
- smiling
- spyro
- bubba
- neutron
- dragon (also polysemous; see ONTOLOGY_CONFLICTS.md)
- sailing (pending FM Sets-tab acceptance ruling)
- slaying, frantic, phasing, leaning, hyper, pogo, quasi, riffing, slicing -- the recursive-set cohort; pending NF-2A scoring

When the analyzer encounters any of these as a modifier token, it sets `difference_type = missing-operator-definition` and recommends Red.

## Policy-dependent cases (analyzer flags but does not auto-resolve)

| Case | What's policy-dependent | Resolution path |
|---|---|---|
| atomic on rotational vs non-rotational base | +1 vs +2 | per pt10; base-rotational status is the input |
| blurry on rotational base | +1 flat (pt11) vs +2-style rotational reading (pt12 open) | pt12 packet; queue items 1 + 2 (Blurry Whirl, Blurry Torque) |
| Double-X compositions | per-compound Red ruling | Double Fairy, Double Blender, Double Spinning Osis, Double Pixie all have separate readings |
| furious on non-rotational base | TBD | needs Red |
| reverse / far / near / op / os ADD weight | presumed +0 | by analogy; formal ruling deferred |
| nuclear-ss cohort | FM=ifpa-1 (federation_math_divergence per SS=+0) | already resolved; analyzer marks `accept-divergence` |

## Rotational vs non-rotational base classification

Atomic and (open) blurry-rotational require base-class input. Rotational bases include:

- whirl, swirl, torque (canonical rotational primitives)
- drifter, blender (rotational compounds per pt11)
- dyno (rotational per FM convention)

Non-rotational bases: mirage, butterfly, osis, illusion, legover, pickup, eggbeater.

This classification is used ONLY for atomic-modifier weight resolution. No other operator uses it.

## What the analyzer does NOT compute

- ADD from operational notation (`operational_notation` column). The analyzer reads `semantic_notation` and `technical_name` strings.
- ADD for any trick whose decomposition includes a token not in this assumption set. Such rows are flagged `unresolved-tokens` and excluded from `agree`/`disagree` classification.
- ADD overrides. Stated ADD values in `freestyle_tricks.adds` are preserved as-is; computed ADD is diagnostic only.

## Reader caveat

These assumptions are the working contract for the analyzer. They reflect the union of Red rulings as of 2026-05-14. A future Red packet (or the pt12 resolution) may invalidate specific entries; when that happens, this document changes BEFORE the analyzer is re-run.

Computed ADD is evidence, not authority. A mismatch between stated and computed is a review row, never an automatic correction. See `feedback_frequency_not_authority.md` for the governing principle.
