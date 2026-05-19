# Job Notation -- Executable Accounting Intersections -- 2026-05-19

Audit of how Ben Job's 1995 grammar notation intersects the modern executable-accounting layer. Deliverable per the brief's Objective 5.

Source documents:
- `exploration/fborg/JobsNotation.txt` (the Job source)
- `exploration/add-multiplier-doctrine-2026-05-19.md` (the multiplier doctrine context)
- `src/content/freestyleResolvedFormulas.ts` (29 resolved-formula entries; Sprints 1-6)

---

## 1. Executable accounting reaffirmed: secondary + educational + detail-page scoped

Before stating intersections: the executable accounting layer is by curator design a SECONDARY surface. It serves educational + detail-page purposes only. The Job intersection audit must NOT push the system toward parser maximalism, symbolic overload, AST exposure, or unreadable formulas.

Concretely: any intersection point identified below is a question of whether Job's content informs the EDITORIAL doctrine that the accounting layer renders. Job's content does NOT become a new parser input; does NOT become a new layer in the four-layer ontology; does NOT pre-empt curator authority.

---

## 2. Intersection map

| Accounting surface | Current home | Job intersection |
|---|---|---|
| **ADD computation** | `freestyleResolvedFormulas.ts` derivation strings (29 entries) | Job notation does NOT compute ADDs (the 1995 doc carries no ADD counts). Job grammar can illustrate WHY a trick has its ADD value (the dex-segment length is one structural input), but it does NOT supply ADD arithmetic |
| **Operator decomposition** | `freestyleResolvedFormulas.ts` operator field + chain registry `freestyleSymbolicEquivalences.ts` | Job's grammar IS a decomposition layer (alternate to chain readings). For 10 of 15 examples, Job provides a grammar-level decomposition where modern doctrine has a chain-level decomposition. The two co-exist; they don't merge |
| **Multiplier doctrine** | `exploration/add-multiplier-doctrine-2026-05-19.md` + the not-in-modifier-table operators (`double`, `flying`, `swing`, `reverse`) | Job confirms `(for | back)spin` as a structural element (modern: spinning + gyro = +1 multipliers). Job's `(no plant while)` confirms the symposium / pogo lineage. Job's `same/op` transitions confirm paradox as a side-change operator (modern: +1 multiplier). All three multiplier-class confirmations are doctrinal-backing evidence, NOT a doctrine override |
| **rev(+0)** | 3 entries in resolved formulas (rev-whirl, orbit, rev-up); rev operator in workbook companion-note text | Job's 1995 grammar does NOT explicitly model reverse-direction tricks. Job's example for `Mirage` is `toe > op in dex > op toe`; the inverse direction (illusion = `toe > op out dex > op toe`) is implicit in the grammar but not named. The rev(+0) operator is a modern-doctrine extension; Job's grammar supports it but does not pre-empt the +0 doctrine |
| **Shorthand equivalence** | `freestyleSymbolicEquivalences.ts` chain registry | Job's grammar form is NOT a chain reading. The two systems decompose differently. Chain reading = operator + base atom; Job grammar = primitive-token sequence. Documentation: surface BOTH for the same trick where Job provides an example; do NOT collapse into a single canonical reading |
| **Operational notation** | `freestyle_tricks.operational_notation` column + `exploration/freestyle-notation-grammar/NOTATION_STYLE_GUIDE.md` (ATAM grammar §13) | The closest direct analog. Modern operational notation uses uppercase + bracketed flags (CLIP > OP IN [DEX] > ...); Job grammar uses lowercase + parenthesized phrases (clip > op in dex > ...). The ATAM grammar §13 IS a descendant of Job's 1995 proposal, refined over 30 years. Cross-link in glossary §7 |
| **Structural decomposition** | `freestyle_tricks.base_trick` + `freestyle_trick_modifier_links` | Modern structural decomposition is COMPOSITIONAL (base + modifiers). Job's grammar is GENERATIVE (compose primitives into instances). These answer different questions. Job's grammar does NOT reshape the base/modifier model |

---

## 3. Multiplier-doctrine intersection points

The recent `add-multiplier-doctrine-2026-05-19.md` audit catalogued 31 operators across 5 classes. Job's notation provides supporting evidence (or doctrinal divergence) for several of those classifications:

| Operator | Class (per multiplier audit) | Job evidence |
|---|---|---|
| `paradox` | C. Structural multiplier (+1) | Job's grammar makes paradox structurally explicit (same → op transition); confirms the side-change-as-operator framing |
| `symposium` | C. Structural multiplier (+1, no-plant) | Job's `(no plant while)` element confirms symposium's no-plant structural identity |
| `pogo` | D. Operator modifier (+0; zero-ADD) | Job uses `Pogo` and `(no plant while)` interchangeably in one example; modern doctrine distinguishes pogo (+0) from symposium (+1). Doctrinal divergence — RP-7 |
| `spinning` | C. Structural multiplier (+1; full turn) | Job's `(for)spin` element — but Job's axis is forward/backward, modern is full/half. RP-6 doctrinal question |
| `gyro` | C. Structural multiplier (+1; half turn) | Job's `(back)spin` — same RP-6 question |
| `reverse` / `rev` | A. Directional reversal (+0) | Job does NOT explicitly model reverse direction; the orbit/illusion/pickup direction-variant atoms are not in Job's named examples. Job is silent on rev(+0) doctrine |
| `double` | C. Structural multiplier (NOT in modifier table; +1 implicit) | Job uses "Double Pickup" and "Double Over Down" as named examples; community usage evidence for the multiplicity pattern. RP-3, RP-4 |
| `flying` | C. Structural multiplier (NOT in modifier table; +1 implicit) | Job lists "jumping/flying" as a future-formula primitive (not yet formalized in his 1995 paper); modern Sprint 5 formalized `flying-clipper = flying(+1) + clipper(1) = 2 ADD`. Job is forward-compatible |
| `swing` | C. Structural multiplier (NOT in modifier table; +1 implicit) | Job explicitly lists swing as a future-formula primitive: "swing (Pendulum, Rake)". Direct confirmation of the Sprint 5/6 pendulum + rake doctrine; Job named both companion tricks in 1995 |
| `atomic` | C. Structural multiplier (set; +1/+2 rotational) | Job does NOT name atomic; the atomic operator emerged after Job |
| `ducking` | C/D. Structural multiplier with arguable primitive character | Job lists "duck" as a future-formula primitive (and "dive" as a separate one). Confirms ducking AND diving as peer structural elements; modern doctrine has both in modifier table (+1 each) |
| `stomping` | (not yet in audit) | Job lists "stomping (both legs plant)" as a future-formula primitive. NOT currently modeled in the modern dictionary. Audit-finding for the multiplier doctrine package |

**Doctrinal alignment summary:** Job and modern doctrine agree on the multiplier-CLASS character of paradox, symposium, spinning/gyro (with one axis-divergence), ducking, diving, flying, swing. Job and modern doctrine diverge on:
- pogo vs symposium distinction (Job conflates; modern distinguishes)
- spinning/gyro axis (forward/backward vs full/half)
- atomic, blurry, gyro (modern operators that postdate Job)

---

## 4. rev(+0) and Job's notation

Job's 1995 grammar does not explicitly model direction reversal as an operator. Direction is implicit in the in/out and same/op grammar tokens:

- `toe > op in dex > op toe` (Job's mirage) — in-dex on op leg
- `toe > op out dex > op toe` (constructive: would be illusion) — out-dex on op leg

The modern dictionary names mirage and illusion as separate canonical atoms (Red 2026-05-11: direction is structural). The modern rev(+0) operator is an editorial-layer doctrine for the orbit/ATW pair (and rev-whirl/whirl, rev-up/whirl).

**Conclusion:** Job's grammar is compatible with the modern rev(+0) framing but does not provide additional evidence. Job's 1995 paper pre-dates the formal direction-variant atom doctrine (mirage/illusion as separate atoms is a later development; Job's grammar derives both from the same formula).

The integration plan: do NOT use Job's notation to revise the rev(+0) doctrine. Job's grammar is silent on the operator; modern doctrine is the authority.

---

## 5. Compatible? Yes. Equivalent? No.

The intersection audit's most important finding is at this paragraph: Job's grammar and modern executable accounting are COMPATIBLE (both decompose tricks, both can render the same example with their own framing) but NOT EQUIVALENT (they answer different questions and use different units of decomposition).

| Question | Job grammar answers | Modern accounting answers |
|---|---|---|
| What primitive movements does this trick contain? | YES (token sequence) | Partially (modifier list) |
| What named operators apply to this trick? | NO | YES (resolved formula) |
| Where does the ADD value come from? | NO (no ADD counts) | YES (derivation string) |
| What chain reading equates this trick to another? | NO | YES (chain registry) |
| What family or movement neighborhood does this trick belong to? | NO (not modeled) | YES (trick_family + movement system) |
| What is the structural set/catch shape? | YES (formula head/tail) | Partially (notation when present) |
| What direction does the dex move? | YES (in/out token) | Partially (dex archetype taxonomy) |
| Which leg anchors which segment? | YES (same/op token) | NO (not explicitly modeled) |

The two systems are PEERS, not parent-child. The integration plan treats them accordingly: Job's grammar surfaces alongside modern accounting in glossary pedagogy, but does NOT replace or subsume any modern accounting surface.

---

## 6. Parser separation reinforced

Per `feedback_parser_editorial_separation`, the parser reads `canonical_name` only; the editorial layer reads `base_trick` + modifier links. The Job-notation integration must respect this boundary:

| Surface | Parser-touch allowed? | Job-content allowed? |
|---|---|---|
| `canonical_name` (parser input) | YES | NO (Job's content is editorial, not canonical name) |
| Chain registry (`freestyleSymbolicEquivalences.ts`) | NO | Limited (Job's grammar form is NOT a chain reading; do not add as reading entry; cross-reference is fine) |
| Resolved formulas (`freestyleResolvedFormulas.ts`) | NO | Limited (Job's grammar form is NOT a derivation; do not add as derivation entry) |
| Operational notation (`freestyle_tricks.operational_notation`) | NO | NO (modern ATAM grammar is the canonical operational notation; Job's grammar is descendant-evidence only, not the column value) |
| Glossary content (Surface A modifier cards + Surface B reference) | NO | YES (educational integration per `job_glossary_integration_plan.md`) |
| Workbook columns (`build_trick_reconciliation_workbook.py`) | NO (workbook is downstream of canonical) | YES (additive Job-comparison columns per `high_value_notation_gaps.md` §6) |
| Movement System view | NO | Indirect (Job's grammar surfaces gaps in current axes per `high_value_notation_gaps.md` §7) |

Anywhere Job content is allowed (glossary + workbook), the integration is REVERSIBLE TypeScript content + workbook Python (curator-authored, no schema change).

---

## 7. What the audit recommends NOT doing

Hard list:

| NOT-action | Why |
|---|---|
| Use Job's grammar form as the operational_notation column value for any trick | Modern ATAM grammar §13 is canonical; Job's grammar is descendant-evidence |
| Add Job's grammar form as a chain registry reading | Chain readings are operator + base atom decompositions; Job's grammar is primitive-token sequences. Different units, different layer |
| Mass-promote Job's 15 examples to canonical rows | Only 10 of 15 are already canonical; the 5 missing (Clipper-to-Clipper, Pogo-Paradox-Symposium-Blur, Double-Over-Down, Double-Pickup, Gyro-Ripwalk) require independent curator + community-usage evaluation |
| Use Job's `(for | back)spin` to revise spinning/gyro full-vs-half doctrine | RP-6 Red question pending; do not pre-empt |
| Use Job's conflated `Pogo` + `(no plant while)` framing to revise pogo/symposium distinction | RP-7 Red question pending; modern doctrine distinguishes them |
| Auto-derive ADD counts from Job's grammar (e.g., "more tokens = higher ADD") | Job's grammar carries no ADD semantics; the modern resolved-formula derivation is the authority |
| Add a "Job grammar" field to the resolved-formula type | Resolved formulas have a single `derivation` string; adding a parallel Job grammar field would over-specify and risk drift |

---

## 8. What the audit recommends doing (curator-paced)

| # | Action | Layer | Risk |
|---|---|---|---|
| AI-1 | Add 3 mechanical operational_notation values (QW-1, QW-2, QW-3 from gaps doc) | `freestyle_tricks.operational_notation` column | Low |
| AI-2 | Add "Notation philosophies" sidebar to glossary §7 (per integration plan §6) | Surface B (glossary advanced) | Low |
| AI-3 | Add 4-example side-by-side comparison to glossary §8 | Surface B (glossary advanced) | Low |
| AI-4 | Add Job-grammar-reading column to reconciliation workbook for the 10 canonical examples | Workbook | Low |
| AI-5 | Surface RP-1 through RP-7 in the next Red Wave 2 packet | Red consultation | N/A (pre-packet) |
| AI-6 | Document the swing-as-Job-confirmed primitive in the multiplier doctrine audit's §1.3 | Audit doc | Low (corrective addendum) |

All 6 actions are reversible TypeScript content / additive workbook columns / Red packet questions. Zero schema change; zero parser change; zero UI redesign; zero mass canonicalization.

---

## 9. Closing constraint reminder

The brief's executable-accounting constraint, verbatim:

> Executable accounting remains:
> - secondary
> - educational
> - detail-page scoped
>
> Do NOT let Job notation push the system toward:
> - parser maximalism
> - symbolic overload
> - AST exposure
> - unreadable formulas

The intersection audit confirms: Job's notation does NOT push the system in any of those directions. Job's grammar is a 1995 historical proposal that surfaces educational + governance value at the glossary + workbook layers, leaving the executable-accounting layer's secondary/educational/detail-page-scoped status preserved.
