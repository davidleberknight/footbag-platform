# Semantic-Macro Proposals

A "semantic macro" is a named compositional shorthand that expands to a multi-operator decomposition under the existing grammar. Examples in current canon: `Blurry` (= Stepping + Paradox, per pt11 reading) and `Whirling` (= Whirl + Osis, per pt11 reading). Both were promoted to first-class operator status because they (a) recur, (b) have stable decompositions, and (c) the compressed form is pedagogically meaningful in its own right.

This document proposes candidate macros surfaced by the PassBack + FM analysis. Each candidate is evaluated against the same three criteria, NOT against frequency alone.

## Criteria

A semantic-macro proposal is a non-trivial structural claim. To clear the bar a candidate must:

1. **Recur structurally** -- the same decomposition shape appears multiple times in the observed corpus (NOT just the same surface name).
2. **Decompose stably** -- the expansion under existing operators is deterministic; no polysemy, no Sets-tab disagreement.
3. **Be pedagogically meaningful in its own right** -- the macro form teaches something the expanded form does not. If the macro is just an abbreviation, it belongs in the alias layer, not the operator layer.

Frequency is descriptive evidence, not a fourth criterion.

## Proposal M1 -- `Front-Spin` (Inspinning)

- **Expansion**: Spinning + (direction = front)
- **Recurrence**: Inspinning observed 3 times (1 FM, 2 PB). Spinning observed 47 times.
- **Decomposition**: stable (FM Sets-tab: Inspinning = Front Spin)
- **Pedagogical value**: high. The Spinning-defaults-to-Backspin convention is documented in the PassBack glossary but is currently invisible at the operator level. Promoting Inspinning as the direction-variant of Spinning surfaces this invariant.
- **Risk axes**: low decomposition risk; low community-drift risk (PB independently uses Inspinning); zero parser-artifact risk.
- **Disposition**: candidate. Pair with Spinning as a direction-variant pair, analogous to Drifter / Reverse-Drifter and Whirl / Reverse-Whirl ([[project_freestyle_state]]).

## Proposal M2 -- `Pixie-set Atomic-set` (Sailing)

- **Expansion**: Pixie + Atomic (two locked set-modifiers stacked)
- **Recurrence**: Sailing observed 7 times (6 FM, 1 PB). The expanded form (Pixie + Atomic stack) observed in 5 additional rows under different folk names.
- **Decomposition**: stable per FM Sets-tab + extract.
- **Pedagogical value**: medium. Pixie + Atomic is a meaningful stack (behind-the-leg + illusioning entry), and the compressed form is shorter to write. But the expanded form is fully decomposable, so the compression is mostly orthographic.
- **Risk axes**: low decomposition risk; medium pedagogical risk (does naming this composition obscure the constituent meaning?); low parser-artifact risk.
- **Disposition**: defer. Candidate for educational-layer surfacing (glossary cross-reference), NOT operator-table promotion. The Pixie-then-Atomic shape recurs but does not warrant a new operator class.

## Proposal M3 -- `Pixie-set Quantum-set` (Frantic)

- **Expansion**: Pixie + Quantum
- **Recurrence**: Frantic observed 2 times (FM). Pixie + Quantum shape observed once independently.
- **Decomposition**: stable.
- **Pedagogical value**: low. Two-modifier stacks of this shape are common; naming one specific stack as `Frantic` does not teach a new concept.
- **Disposition**: defer. Educational glossary cross-reference at most. The same reasoning as M2 but with weaker recurrence support.

## Proposal M4 -- `Rooted-Pixie` (Hyper)

- **Expansion**: Rooted + Pixie (pt8 ruled rooted=0)
- **Recurrence**: Hyper observed 0 times in technical_names (the Sets-tab definition was sampled separately). The Rooted pre-state flag appears 0 times in tokenized form.
- **Decomposition**: stable (per FM Sets-tab + pt8 ruling).
- **Pedagogical value**: medium. Rooted-Pixie teaches the rooted pre-state in context; the compressed `Hyper` form does not.
- **Risk axes**: low decomposition risk; high recurrence-evidence risk (singleton in the FM Sets-tab, not observed in the trick corpus).
- **Disposition**: defer or reject. The recurrence is so thin that surfacing this as a macro is premature.

## Proposal M5 -- `Reverse-direction` (the `Reverse` operator)

- **Expansion**: Reverse + base (direction inversion; +0 ADD by observed pattern)
- **Recurrence**: 16 times across corpus (14 FM + 2 PB). Establishes a consistent shape: `Reverse Whirl`, `Reverse Torque`, `Reverse Blender`, `Reverse Drifter`.
- **Decomposition**: stable structurally; ADD weight by-analogy.
- **Pedagogical value**: high. The Reverse-direction concept is broadly applicable; surfacing it as a first-class operator unlocks direction-variant rendering for any base that supports rotation.
- **Risk axes**: low decomposition risk; low community-drift risk; ADD weight pending Red (presumed +0).
- **Disposition**: candidate. The Reverse operator already exists in OPERATOR_INVENTORY at the "pending_red" tier. Promoting it to locked (with a single Red question on ADD weight) would close a coherent direction-variant axis across the corpus.

## Proposal M6 -- `Same-side` (the `ss` operator, already locked)

- Listed for completeness. `ss` is already locked per the Red 2026-05-11 ruling (+0 ADD). The 45 corpus rows confirm this is a stable operator class. No proposal action needed.

## Proposal M7 -- `Stepping-Inspinning` (Leaning)

- **Expansion**: Stepping + Inspinning (depends on M1)
- **Recurrence**: Leaning observed 3 times (FM only). Cleanly references the M1 candidate.
- **Decomposition**: stable.
- **Pedagogical value**: low-medium. Combines two operators that are each more useful in isolation.
- **Disposition**: chain-dependent. Only meaningful if M1 (Inspinning) is accepted; otherwise defer.

## Anti-proposals (explicit non-candidates despite recurrence)

### Anti-M1 -- `Fairy-anything`

29 corpus rows lead with `Fairy`. The shape is structurally consistent (`Fairy ss <base>` pattern dominates). But:

- No IFPA ruling on Fairy's add_bonus.
- No FM Sets-tab definition (unlike Sailing or Phasing).
- Highly FM-author-attached: PassBack uses Fairy only 5 times vs FM's 24.
- Disposition: Q4 batch defers all FM-vocab operators of this class. Do NOT promote despite high recurrence. Documented in NF2A_CANDIDATE_QUEUE row 'fairy'.

This is the load-bearing example of the frequency-is-not-authority rule.

### Anti-M2 -- `Bubba-anything`

4 corpus rows. Decomposable structurally, but `Bubba` is a patronymic naming style (named after a community member). Promoting it to operator status would canonize a personal handle. Reject regardless of frequency.

### Anti-M3 -- `Dragon-anything`

8 corpus rows. Polysemous across modifier / surface / suffix roles. Cannot promote without first resolving the polysemy. ONTOLOGY_CONFLICTS P2 documents.

## Summary

| Proposal | Candidate? | Notes |
|---|---|---|
| M1 -- Inspinning (Front-Spin) | yes | Pairs with Spinning as direction variant |
| M2 -- Sailing (Pixie + Atomic) | defer | Glossary cross-ref, not operator |
| M3 -- Frantic (Pixie + Quantum) | defer | Same as M2, weaker support |
| M4 -- Hyper (Rooted + Pixie) | defer/reject | Thin recurrence |
| M5 -- Reverse | yes | Promote from pending_red to locked; one Red question on ADD |
| M6 -- ss | already locked | No action |
| M7 -- Leaning | chain-dependent | Requires M1 |

Net: two clean candidates (M1 + M5). Both are direction-variant operators already partially recognized; promoting them does not introduce a new operator class, only formalizes an existing one.

The high-frequency FM-vocab macros (Fairy, Gyro, Barraging) are explicitly NOT proposed. Their recurrence reflects FM's compositional grammar, not IFPA-community consensus. Frequency is evidence; consensus is the missing input.
