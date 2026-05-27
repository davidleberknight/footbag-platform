# ADD Policy Refinement Recommendations

Based on patterns surfaced by the audit, these are recommended changes to `ADD_FORMULA_ASSUMPTIONS.md` and the DB parser. None of these are authorized changes -- all are pending maintainer review per CLAUDE.md.

Computed ADD is evidence, not authority. These refinements aim to make the formula more accurately model the curator-intended ADD math, not to use the formula to override canonical values.

## R1 -- Backfill `notation` for self-atomed compound tricks

**Observation:** ~30 named compound tricks (Atomsmasher, Fury, Royale, Witchdoctor, Omelette, Terrage, Bullwhip, Eclipse, Mobius, Superfly, Sumo, Vortex, etc.) have empty `notation` in DB. The parser falls back to `<slug>(N) = N` (self-atom), hiding the real decomposition question.

**Recommendation:** Curator-led backfill of `notation` strings for these compounds. The format already used (e.g., `STEPPING PARADOX MIRAGE` for Blur) is sufficient.

**Priority:** medium-high. Backfilling unlocks formula-vs-stated comparison for the focus targets and surfaces additional Red questions (or confirms existing values via formula).

**Out of scope for this audit:** notation strings are curator content; this audit recommends the backfill but does not author it.

## R2 -- Encode rotational-base classification in DB

**Observation:** The atomic-modifier policy (+1 non-rot / +2 rot per pt10) requires knowing whether the base trick is rotational. Currently inferred at analyzer runtime via a hard-coded set (whirl, swirl, torque, drifter, blender, dyno, reverse-drifter).

**Recommendation:** Add a `rotational` boolean (or enum) column to `freestyle_tricks`, populated for all bases. The analyzer reads it instead of hard-coding.

**Priority:** medium. The hard-coded list works but ties parser behavior to a list maintained in code. A DB column is more maintainable.

**Caveat:** pt12-resolution (Q1 in Red packet) may extend rotational-bonus semantics to `blurry` and `barraging`. If so, the column gains a second consumer.

## R3 -- Decide on atomic-set vs atomic-modifier semantic

**Observation:** Atomsmasher's IFPA-stated 4 versus PB-formula 3 (Atomic Mirage = atomic(+1)+mirage(2)=3) suggests one of:

a. Atomic on mirage is actually +2 (rotational bonus applies because of an implicit Paradox in "atomic-set")
b. `Atomic-X` is a compound where atomic = atomic-set = paradox + atomic-modifier, totaling +2
c. The IFPA stated 4 is correct without modifier-formula support and Atomsmasher's value rests on direct dictionary entry rather than computability

**Recommendation:** decide which reading is canonical and update `ADD_FORMULA_ASSUMPTIONS.md` accordingly. The pattern recurs in ~11 PB rows; resolution unblocks all of them.

**Priority:** medium-high. This is the underlying engine for Q3 in the Red packet.

## R4 -- Document `far` operator weight formally

**Observation:** OPERATOR_INVENTORY.csv lists `far` with "ADD weight not formally adjudicated; observed ADD-neutral across 14 inventory rows". The audit confirms it is treated as +0 in 14 FM rows but cannot distinguish that from "implicit +1 that lives elsewhere" given the PB patterns.

**Recommendation:** include `far` in the next Red packet as a focused yes/no question: does `far` carry +0 ADD universally? If yes, document and lock; if no, redefine the formula.

**Priority:** medium. Linked to R3.

## R5 -- Extend BASE_ADD table to include stall slugs

**Observation:** toe-stall, heel-stall, inside-stall, outside-stall, clipper-stall (already present), etc. are flagged by the analyzer as `unresolved-tokens`. They are 1-ADD primitives but the parser doesn't know that.

**Recommendation:** add stall slugs to BASE_ADD with ADD=1.

**Priority:** low. Cosmetic; doesn't change any audit outcome.

## R6 -- Add `is_compound_alias` flag to `freestyle_tricks`

**Observation:** Some canonical rows (Royale possibly; certain folk names) may be aliases for other canonical rows at the same ADD rather than distinct tricks. The DB currently has no way to express this; `freestyle_trick_aliases` is for non-canonical folk names only.

**Recommendation:** add a column or flag that lets a canonical row mark itself as "alias-grade" relative to another canonical row. Useful for direction-variant pairs (drifter / reverse-drifter / royale).

**Priority:** low. Schema change; defer until concrete cases accumulate.

## R7 -- Resolve the Enterrage matrix-vs-formula inconsistency

**Observation:** FM_MATH_DIVERGENCES.csv asserts `IFPA canonical: terraging(+3) + legover(3) = 6` for Enterrage. But DB legover=2; my formula gives 5. The matrix author either used a different legover value, or terraging carries an implicit additional +1.

**Recommendation:** maintainer (or whoever owns FM_MATH_DIVERGENCES) reviews this row and either corrects the formula expression in the matrix OR documents the additional +1 contributing operator.

**Priority:** low-medium. The conflict is internal to a federation reference document; no IFPA dictionary row is affected.

## R8 -- Audit re-run cadence

**Observation:** the analyzer is deterministic and re-runnable. Inputs change (new Red rulings, FM corpus updates, PB notation fixes).

**Recommendation:** re-run `build_add_conflict_audit.py` after any of: a Red ruling that touches operator weights (pt13+, Q4 closure); FM_MATH_DIVERGENCES.csv revision; PassBack source file update; new tricks added to `freestyle_tricks`.

**Priority:** procedural. No immediate action.

## What's explicitly NOT recommended

- **NOT recommended:** rewriting any `freestyle_tricks.adds` value based on this audit. All canonical values are preserved per `DO_NOT_TOUCH_LIST.md`.
- **NOT recommended:** changing the operator weight table without an explicit Red ruling. The R3/R4/R6 recommendations require Red input first.
- **NOT recommended:** adopting any FM stated ADD value into IFPA. The federation_math_divergence convention is firm.
- **NOT recommended:** silent formula updates. Any change to `ADD_FORMULA_ASSUMPTIONS.md` must be paired with a re-run of the analyzer and a refreshed matrix.

## Recommended ordering

| Refinement | Depends on | Owner |
|---|---|---|
| R1 (notation backfill) | none | curator-content |
| R5 (stall BASE_ADD) | none | analyzer maintainer |
| R3 (atomic-set polysemy) | Red ruling Q3 | Red + curator |
| R4 (`far` operator) | Red ruling | Red |
| R2 (rotational column) | Q1 resolution may extend scope | curator-content + schema |
| R7 (Enterrage matrix fix) | none | FM-federation maintainer |
| R6 (`is_compound_alias`) | concrete-case accumulation | schema |
| R8 (re-run cadence) | none | procedural |

R1 unblocks the most downstream work. Start there.
