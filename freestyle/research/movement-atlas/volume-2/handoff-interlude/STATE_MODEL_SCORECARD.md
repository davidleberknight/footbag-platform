# State-Model Scorecard

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. Per-component report for the proposed four-part handoff state, measured against the 395-movement two-dexterity corpus (`handoff_validation_rows.csv`). Percentages are of 395.

## The four proposed components

| Component | Explicit | Inferable | Absent | Survives as necessary? | Recoverable from notation? |
|---|---|---|---|---|---|
| carriage side | 0 (0%) | 395 (100%, under a transition rule) | 0 | Yes: every dexterity needs to know where the bag is | Only by inference; never a token |
| reference-foot identity | 0 (0%) | 0 | 395 (100%) | Yes: a side is meaningless without a frame | No: never encoded, in any row |
| support-and-free-leg parity | 0 (0%) | 0 | 395 (100%) | Yes: a dexterity needs a free circling leg and a support leg | No: never encoded, in any row |
| stance mode | 120 (30%) | (rest default) | 0 | Yes: it gates leg availability and the receiver | Partly: explicit in 30%, default otherwise |

## The component the corpus forced

| Component | Explicit | Absent / not applicable | Survives as necessary? | Recoverable from notation? |
|---|---|---|---|---|
| intervening body / orientation event | 152 (38.5%) | 243 (61.5% have no body event in the join) | Yes: in a plurality of rows the join is mediated by a body event with an orientation | Yes: tokenized (body events, back/front facing, spin) |

## Reading the scorecard

- **Two components are notation-invisible.** The reference-foot identity and the leg parity are absent in every one of the 395 rows. They survive as structurally necessary (the interlude's argument), but the notation cannot confirm, refute, or value them. They are the boundary of what this notation-only lane can reach.
- **One component is inference-only.** The carriage side is never written but is inferable in every row, conditional on a transition rule this slice proposes and cannot verify from notation.
- **One component is partially recoverable.** The stance mode is explicit in 30% of rows and defaulted in the rest; it is the healthiest of the four.
- **The corpus adds a fifth.** The intervening body or orientation event is present and explicit in 38.5% of rows and mediates the join in a plurality of them. It is notation-visible, so unlike the two invisible components it can be added to the model and re-validated from the notation.

## Survival summary

Of the four proposed components, all four survive as necessary, but only one (stance) is meaningfully recoverable from notation, one (carriage) is inference-only, and two (reference foot, leg parity) are notation-invisible. The model is therefore a correct but under-specified skeleton: nothing in it is refuted, but it is neither complete (it lacks the body-or-orientation join event) nor sufficient on its own to reconstruct a single row from encoded state. The single highest-value change the scorecard points to is adding the body-or-orientation join event, because it is both the most frequent missing piece and the one the notation already carries.
