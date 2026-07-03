# The ducking-mirror rule (zulu, weaving)

Zulu and Weaving are platform-tracked ducking sets whose launch incorporates the
ducking movement; the mechanics after the duck are the base trick, unchanged. The
evidence pass behind this rule is
`exploration/zulu-weaving-notation-2026-06-27/PROMOTION_BATCH_DRAFT.md`.

## The rule

A Zulu or Weaving compound = the matching **Ducking** compound — identical base dex
chain, identical `DUCK [BOD]`, identical ADD — plus a non-scoring annotation for the
one distinguishing launch detail:

- **Zulu**: `(across body)` immediately before the duck (the across-body launch
  path).
- **Weaving**: `(same foot)` on the terminal (the same-foot catch).

Both annotations are unbracketed and non-scoring, in the manner of the existing
`(plant foot)` annotation on wrap / walk-over. Everything else — the launch token
(`TOE` or `SET`), the `DUCK [BOD]` body token, the entire base dex chain after the
duck, the terminal `[DEL]`, and the ADD value — is copied verbatim from the
`ducking_<base>` exemplar.

## Why the ADD is inherited, not new

Weaving's modifier registration already equated its compounds with the ducking
compounds (weaving clipper = ducking clipper, weaving butterfly = ducking
butterfly, same values), demonstrating that the distinguishing launch detail is
ADD-neutral for Weaving. Zulu is the sibling ducking set and takes the same equality
by ruling; its modifier row is registered alongside weaving's in
`freestyle/inputs/noise/trick_modifiers.csv` so the ADD math derives Zulu compounds
as base plus the duck, equal to the Ducking compound. Operator values live in
`src/content/freestyleOperatorReference.ts` and the modifier registry, not here.

## Applied scope

The full single-modifier base layer is canonical under this rule: twelve bases
(mirage, clipper, legover, butterfly, whirl, osis, drifter, pickup, illusion, guay,
double-leg-over, toe-stall) times Zulu and Weaving, each mirroring its live
`ducking_<base>` exemplar, with bracket-count == ADD verified per row, and each set's
encyclopedia examples deriving from the modifier links.

## Extension to multi-operator stacks

The mirror generalizes: a zulu/weaving OPERATOR STACK authors mechanically from the
matching canonical **ducking** stack, inheriting its chassis and ADD the same way —
zero new assumptions. The gate is the mirror's existence:

- a stack whose matching ducking stack is canonical authors mechanically;
- a stack whose ducking mirror is not yet canonical is held, and authors when its
  ducking parent lands (the parent authors first; the mirror then inherits).

## Held cases

- Multi-modifier compositions whose ducking mirror is not yet canonical (each
  unblocks when its parent lands).
- Folk names and positional variants over zulu/weaving structures (identity work,
  governed by the alias and positional doctrines, not by this rule).
- The more complex ducking compounds themselves (paradox / symposium / swirl / jump
  / barfly / reverse variants) where the ducking parent is not yet authored.

## Open refinement (not a blocker)

The distinguishing launch detail is carried as a non-scoring annotation rather than
a formal JOB token. A future notation pass may represent it more explicitly — for
Weaving the candidate is flipping the terminal side from the ducking exemplar's `OP`
to `SAME` (the same-foot catch AS the terminal side). Both representations keep ADD
unchanged; until such a pass, the annotation form invents no new syntax.
