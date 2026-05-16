# SEMANTIC_COMPRESSION_DOCTRINE.md

**Status:** doctrine draft. No destructive edits applied. This document defines the structural and locution framework that emerged from the 2026-05-15 rulings + the PT12_ROUND2_SYNTHESIS adjudication-shape observation, plus an architectural proposal for layered decomposition display.

**Scope:** ontology vs pedagogy vs parser-representation separation. Adjudication-framework codification. Maturity classification of emerging doctrines. Sequencing recommendation. Explicit cautions about what NOT to harden prematurely.

**Foundations:** `PT12_ROUND2_SYNTHESIS.md` (decomposition class taxonomy + reclassified pt12 queue). `RED_RESOLVED_CANON.md` (settled rulings). `RED_OPEN_QUESTIONS_REFORMULATED.md` (genuinely-open items). Memory: `project_freestyle_state`, `project_red_consultation_state`, `project_freestyle_federation`, `feedback_parser_editorial_separation`, `feedback_reversible_content_governance`.

**Audience:** the curator (primary) and future synthesis agents (secondary). Not user-facing prose.

**Reading order:** §2 → §3 → §5 → §7 for fastest-leverage reading. §10 is the maturity-map quick-reference.

---

## §1. Purpose and posture

This document codifies an emerging adjudication framework without locking it. The goal is to give downstream work (parser updates, Layer-B UI, SCALE-6a prose, glossary integration, Round-2 packet authoring) a shared vocabulary and a calibrated sense of which doctrines are stable enough to act on.

Three motivating observations:

1. **The 2026-05-15 rulings answered Wave 1 with mechanism, not weight.** This is a methodological pattern, not a coincidence. Future packets and downstream work should respect it.
2. **The taxonomic vocabulary the maintainer surfaced (five decomposition classes) is sound but underspecified at the locution level.** Phrases like "X = Y" carry different doctrinal weight depending on whether X "is canonically defined as" Y, "is commonly read as" Y, or "structurally expands to" Y. The doctrine document must keep these distinct.
3. **The system is converging on a layered display architecture (Layer A surface / Layer B expanded / Layer C diagnostic) whether we name it or not.** Naming it lets us govern visibility per surface.

This doctrine is **alpha**: stable enough to guide work but not stable enough to enforce. It is curator-authored, not committee-approved. Future Red rulings, particularly answers to Round-2 Q1 / Q3 / Q5 / Q6, will refine it.

---

## §2. The five decomposition classes (formalized)

The maintainer's taxonomy, restated with definitions tight enough to classify any future ruling.

### Class 1. Flat compositional decomposition

**Definition:** every token in the surface name maps to exactly one locked operator or one named base. The decomposition reads left-to-right with no expansion, no hidden structure, no count-bearing operators.

**Math:** `Surface name = Modifier₁(+w₁) + Modifier₂(+w₂) + … + Base(b)` produces `ADD = w₁ + w₂ + … + b` via simple summation.

**Examples:**
- `Paradox Whirl` = paradox(+1) + whirl(3) = 4
- `Spinning Butterfly` = spinning(+1) + butterfly(3) = 4
- `Ducking Osis` = ducking(+1) + osis(3) = 4

**Identifying signals:** the surface name's tokens are all present in `OPERATOR_REFERENCE_ENTRIES` (as modifiers) or the foundational atom set (as bases); no surface token requires expansion; the additive formula reproduces stated ADD.

**Doctrine maturity:** **stable**. This is the default class; the parser already handles it via `exact_modifier_derived` status.

### Class 2. Expanded semantic decomposition

**Definition:** a surface token compresses two or more locked operators into one folk-shorthand symbol. The structural reading expands the compressed token into its constituent operators.

**Math:** the compressed token's decomposition replaces the token in the formula. `Compressed-token = Op₁ + Op₂`, so `Compressed-token X = Op₁(+w₁) + Op₂(+w₂) + X(b)`.

**Examples:**
- `Blurry` = stepping + paradox
- `Sailing` = pixie + atomic
- `Surging` = stepping + spinning
- `Barraging` = (dex) + (dex) — a count-bearing sub-pattern (§2.6)

**Identifying signals:** stated ADD systematically exceeds the flat formula by a consistent integer across multiple bases; expert ruling confirms a multi-operator expansion that the surface name doesn't reveal; the expansion is **uniform** across bases (transitive).

**Doctrine maturity:** **emerging consensus** for the framework itself; **expert-confirmed but narrow** for individual tokens (blurry confirmed on 4 cases; barraging on 1).

**Sub-pattern: count-bearing operators.** Barraging is structurally `(dex) + (dex)` — two dexes specifically, not "an extra dex." Furious may be `(dex) × 3` if the count-doctrine extends (Round-2 Q2). Double / triple are quantifier wrappers. Count-bearing operators expand uniformly across bases AND carry a numeric count as part of their semantics. They are a sub-pattern of Class 2, not a separate class.

### Class 3. Hidden cross-body / X-dex semantics

**Definition:** a named operator carries a structural component (cross-body character, X-dex, paradox-from-toe character) that is not visible in its surface name. The hidden component contributes to ADD math and to mechanical reading.

**Math:** the operator's weight reflects the hidden component. `Atomic` carries +2 on rotational bases (pt10) not because atomic is rotational, but because atomic carries hidden paradox-from-toe character that reads as +1 paradox + atomic-set-character; on rotational bases the +1 surfaces.

**Examples:**
- `Atomic` carries X-dex character similar to paradox from a toe (2026-05-15 ruling). The hidden structure is a paradox-equivalent-from-toe modifier.
- `X-Dex` itself flags hidden cross-body structure when present in trick names where it isn't explicit (pt1 ruling: X-Dex fires only in specific named tricks).

**Identifying signals:** stated ADD diverges from flat formula in a way that's consistent across a family; expert ruling cites mechanical character ("X-dex similar to paradox") rather than weight adjustment; the hidden structure is mechanical, not orthographic.

**Doctrine maturity:** **expert-confirmed but narrow**. One ruling (Atom Smasher); doctrine scope pending (Q3).

**Open question:** is hidden structure surface-bound (only on toe-launched bases) or universal (every atomic-X carries the character)?

### Class 4. Positional / directional zero-weight operators

**Definition:** operators that refine identity without contributing to ADD. They produce structural variants (direction, side, position) but the math passes through.

**Math:** `Operator-zero-weight X = X-weight`. No contribution.

**Examples:**
- `ss` = +0 (pt11 + pt12)
- `far` = +0 (2026-05-15)
- `reverse` = +0 (2026-05-15)
- `rooted` = +0 (pt8)
- `near`, `op`, `os` by-analogy +0 (still pending formal ruling)

**Identifying signals:** the operator produces a named variant pair (Whirl / Rev-Whirl; Drifter / Rev-Drifter) where both members carry the same stated ADD; the additive formula requires the operator to contribute zero.

**Doctrine maturity:** **stable** for ss / far / reverse / rooted; **emerging consensus** for near / op / os (by-analogy).

### Class 5. Policy-dependent operators

**Definition:** weight depends on the base's structural class (rotational vs non-rotational, compound vs atomic, body-led vs surface-led). The operator's policy specifies the conditional weight.

**Math:** `Operator(+w_when_C) X` where C is a structural condition on X. Atomic: `+1 on non-rotational, +2 on rotational` per pt10.

**Examples:**
- `Atomic` = +1/+2 by rotational class (pt10)
- (Hypothesized) `Furious` = +2 on rotational; non-rotational case TBD (pt6 + Wave 1 Q1.c)
- (Hypothesized) `Whirling` / `Spinning` if rotational-escalation had not been retired — but pt10 retired this; these are now flat +1

**Identifying signals:** expert ruling explicitly specifies "weight = w₁ when condition, w₂ otherwise"; the formula table has a conditional rule rather than a flat weight.

**Doctrine maturity:** **stable** for atomic; **unresolved** for furious-non-rotational.

**Note:** policy-dependence is orthogonal to expanded decomposition. Atomic is Class 3 (hidden character) AND Class 5 (policy-dependent weight). The two classes coexist on one token.

### Class assignment summary

| Token | Primary class | Secondary | Status |
|---|---|---|---|
| Paradox | 1 | — | stable |
| Stepping | 1 | — | stable |
| Spinning | 1 | — | stable (post-pt10 flat) |
| Ducking | 1 | — | stable |
| Symposium | 1 | — | stable |
| Pixie | 1 | — | stable |
| Quantum | 1 | — | stable (pt10) |
| Nuclear | 2 | 1 | stable (= paradox + atomic per pt10) |
| Blurry | 2 | — | newly stable (= stepping + paradox, 2026-05-15) |
| Sailing | 2 | — | stable (= pixie + atomic) |
| Surging | 2 | — | stable (= stepping + spinning) |
| Atomic | 5 | 3 | stable for weight; Class-3 character newly surfaced 2026-05-15 (Q3 pending) |
| Barraging | 2 (count-bearing) | — | newly stable (= (dex)+(dex), 2026-05-15) |
| Furious | 5 | possibly 2 | partial (rotational confirmed; non-rotational + count-reading pending) |
| Whirling | 1 | — | stable (= whirl-modifier, pt11) |
| Miraging | 1 | — | stable |
| Illusioning | 1 | — | by-analogy (not formally locked) |
| Double | 4 (wrapper) | per-compound | stable wrapper; per-compound rulings supersede |
| Triple | 4 | — | stable wrapper |
| ss, far, reverse, rooted | 4 | — | stable |
| Inspinning | 4 (directional) | — | stable (directional variant of spinning) |
| Fairy (as modifier) | TBD | — | newly legitimate (2026-05-15); class assignment pending Q4.C weight |
| Gyro | TBD | — | partial; Mobius ≈ Gyro Torque establishes relationship to spinning (Q4 pending) |

---

## §3. The four locution levels

The doctrine separates four ways of stating that two readings are related. Each carries different authority and different downstream implications.

### Level 1. "is canonically defined as"

**Authority:** expert ruling. Curator-locked. The decomposition IS the canonical reading; alternatives are non-canonical.

**Surface:** dictionary entries, formula table, canonical decomposition strings.

**Example:** `Blender is canonically defined as Whirling Osis` (pt11). This is the authoritative reading; FM's alternative readings are folk-aliases at most.

**Implication:** the parser MAY use this reading without flagging it as derived. The formula table treats this as the canonical formula. Pedagogy may teach the structural reading as how the trick is built.

### Level 2. "is commonly read as"

**Authority:** community usage. Pedagogical, not authoritative.

**Surface:** glossary, educational pages, modifier-family bridges, prose explanations.

**Example:** `Mobius is commonly read as Spinning Torque` (and as Gyro Torque, in the FM register). This is how players talk about the trick; the structural reading lives alongside the canonical short name.

**Implication:** the parser does NOT derive from this; the alternative reading is documented but not load-bearing for ADD math. Pedagogy may teach this as a reading that illuminates structure.

### Level 3. "structurally expandable to"

**Authority:** structural reasoning + operator-substitution rules. Doctrine-derived.

**Surface:** Layer B (expanded semantic decomposition; see §5).

**Example:** `Mobius structurally expands to Spinning ss Miraging Osis`. The expansion follows from applying the locked operator-decomposition rules (Spinning Torque → Spinning Miraging Osis via Torque = Miraging Osis).

**Implication:** the structural expansion may be deep (multiple operator-substitution steps), and each stopping depth is a legitimate reading. The pedagogy says: "the language compresses recurring structures; the long form and the short form are both valid stopping depths."

### Level 4. "parser-derived interpretation"

**Authority:** the tokenizer + grammar rules. Machine-readable. Diagnostic, not pedagogical.

**Surface:** Layer C (parser/diagnostic; see §5).

**Example:** `Atom Smasher parses as self-atom (notation field is empty)`. The parser has no notation string to decompose, so it returns the trick-name as its own atom. The trick is NOT structurally undefined; the parser simply has nothing to parse.

**Implication:** parser-derived status is internal-only; it surfaces in diagnostic panels and curator tooling but never in player-facing surfaces. A trick may be `parser_status=self_atom` while being `canonically_defined_as=Atomic Mirage` and `structurally_expandable_to=paradox-from-toe + Mirage`.

### Distinguishing the levels in practice

When writing prose or operator-reference entries, the verb signals the level:

| Verb / phrase | Level | Authority |
|---|---|---|
| "Blender is Whirling Osis" | 1 | Expert ruling |
| "Mobius is canonically defined as Spinning Torque" | 1 | Expert ruling |
| "Mobius is commonly read as Spinning Torque" | 2 | Community usage |
| "Mobius is commonly read as Gyro Torque (FM register)" | 2 | Community / federation |
| "Mobius structurally expands to Spinning ss Miraging Osis" | 3 | Doctrine-derived |
| "Mobius parses as self-atom (no notation)" | 4 | Parser-derived |

Mixing the verbs in user-facing prose is a doctrine error. The glossary's compression flow should not say "Mobius is Spinning ss Miraging Osis" (Level 1 phrasing for a Level 3 expansion) — it should say "Mobius structurally expands to" or "Mobius can be read as."

---

## §4. Why "mechanism not weight" became the framework

The 2026-05-15 rulings established a methodological pattern worth codifying.

### The pattern

Wave 1 asked Red to choose between weight options:

- Q1: "is blurry +1 universal, or +2 on rotational bases?"
- Q4: "is far = +1 or is there an implicit paradox?"

Red answered neither set of options directly. Instead:

- Q1 answer: "blurry decomposes to stepping + paradox" (structural-mechanism reading)
- Q4 answer: "atomic involves an X-dex similar to paradox from a toe" (mechanical-character reading)

In both cases, the answer was a **mechanism** — a structural-or-mechanical statement — rather than a **weight** — a numeric adjustment.

### Why mechanism wins

Three reasons the mechanism framework is structurally better:

1. **Compositional consistency.** Weight rulings create exception classes (atomic +2 rotational / +1 elsewhere); mechanism rulings dissolve into composition (atomic carries hidden paradox; the +2 is the paradox(+1) + atomic-set(+1) summing through the math). Composition extends naturally; exception classes accumulate.

2. **Predictive power.** Mechanism rulings predict the answers to unasked questions. If blurry = stepping + paradox, then Blurry X for any X is structurally Stepping Paradox X (the transitivity question is now meaningful and testable). Weight rulings ("blurry +1") are silent on adjacent rows.

3. **Pedagogical legibility.** Mechanism is teachable; weight is memorizable. A learner who knows "blurry expands to stepping + paradox" can read any new blurry-X trick correctly. A learner who knows "blurry is +1 flat" must look up each row.

### Implication for Round-2 and beyond

When framing Round-2 questions:

- Lead with mechanism. "What is the structural source of the +1 gap?" beats "is the operator +1 or +2?"
- Offer mechanism options first. "Does atomic carry X-dex universally / only toe-launched / only Atom Smasher" is a mechanism-shape question.
- Reserve weight options for cases where structural reasoning is exhausted (Q4.C Fairy weight, where the question genuinely is "what number does this operator add").

### Limit of the framework

Mechanism-not-weight is not absolute. Some operators are genuinely numeric:

- **Class 4 zero-weight operators** are mechanism-neutral; the +0 weight is the answer.
- **Class 1 flat-additive operators** carry a weight as their definition.
- **Class 5 policy-dependent weights** are conditional but still numeric.

The framework applies when stated ADD diverges from flat formula by a consistent pattern. In those cases, ask for mechanism. When stated and flat agree, no question needs asking.

---

## §5. Layered decomposition-display architecture

### Layer definitions

The system is converging on three display layers. Naming them lets us govern visibility, separation, and authoring discipline.

**Layer A — Canonical surface decomposition.**

- Concise, culturally recognizable, the name players actually say.
- One reading per trick: the canonical decomposition (e.g., `Blender = Whirling Osis`).
- Maps to the existing dictionary trick-name + notation field + canonical decomposition string.
- Authority: Level 1 ("is canonically defined as").

**Layer B — Expanded semantic decomposition.**

- Reveals structural depth; surfaces hidden operators (stepping/paradox/X-dex relationships).
- Multiple readings possible per trick (stopping depths). E.g., `Mobius → Spinning Torque → Spinning Miraging Osis`.
- Includes equivalence chains, cross-family relationships, hidden structural readings.
- Authority: Levels 2 and 3 ("is commonly read as" / "structurally expandable to").

**Layer C — Parser / diagnostic decomposition.**

- Machine-oriented expansion. Tokenizer output, formula-table status, unresolved-token warnings.
- Includes parser status (`exact_modifier_derived` / `exact_self_atom` / `approximate` / `policy_dependent`), `computed_adds`, `asserted_adds` reconciliation.
- Authority: Level 4 ("parser-derived interpretation").

### Layer mapping to existing project structure

| Layer | Where it lives now | Where it lives going forward |
|---|---|---|
| A | Dictionary cards (`/freestyle/tricks` + `/freestyle/tricks/:slug` hero); landing core-tricks grid; glossary §5 core-tricks grid | unchanged |
| B | Glossary §8 compression flow (osis → torque → mobius); modifier-family pages; equivalence-chain panels; glossary §9 connective panels | extends to trick-detail page "Expanded readings" section (new); operator-board cross-links |
| C | Trick-detail "Structural decomposition" diagnostic panel | extends to curator-only deeper inspection tooling (e.g., parser-trace, formula-table-row visualization) |

### Where each layer should appear

| Surface | Layer A | Layer B | Layer C |
|---|---|---|---|
| Trick-dictionary browse card | ✓ (compact) | — | — |
| Trick-detail hero | ✓ (full canonical) | — | — |
| Trick-detail body | ✓ (description, learning notes) | ✓ (expandable "How the structure reads" section) | ✓ (diagnostic panel, present already) |
| Glossary terminology section | ✓ (term definitions) | ✓ (compression flow, family relationships) | — |
| Glossary §9 topology panels | — | ✓ (observational, cross-family) | — |
| Operator-board (landing + learn) | — | ✓ (operator semantics + worked examples) | — |
| Modifier-family pages | — | ✓ (primary surface) | — |
| Curator review tools | — | — | ✓ (primary surface) |

**Layering rules:**

- **A is always present.** Every trick has a canonical surface decomposition (even if it's `self-atom`).
- **B is opt-in per-trick.** Not every trick warrants expanded reading; sui-generis folk names without structural readings stay A-only.
- **C is always derivable but rarely surfaced to players.** Diagnostic panel is the one public surface; otherwise C is curator-side only.

### Why this layering matters

Two key separation rules emerge:

1. **Pedagogy lives in Layer B.** Player-facing prose that says "Mobius can be read as..." or "Blurry expands to stepping + paradox" is Layer B. The verb-discipline of §3 (level-appropriate verbs) keeps Layer B prose honest.

2. **Ontology lives in Layer A.** The canonical decomposition + ADD math is Layer A. Editorial decisions about expansion live in Layer B and do NOT alter Layer A. This is the parser/editorial-separation forever-rule restated in display-layer terms.

A trick can have:
- Layer A: `Atom Smasher = Atomic Mirage = 4 ADD`
- Layer B: `Atom Smasher commonly reads as Atomic Mirage; structurally expandable to (paradox-from-toe) + Mirage`
- Layer C: `parser_status=self_atom; asserted_adds=4; computed_adds=null (no notation)`

All three are simultaneously true, surfaced on different surfaces, with different audiences and authorities.

---

## §6. Hidden-structure surfacing analysis

The maintainer asked: should hidden structure be always surfaced / optionally expandable / context-dependent / preserved as compressed?

This depends on (a) doctrine maturity for the hidden structure, (b) pedagogical value, (c) cultural recognition of the folk name. The six case studies below classify each.

### Case 1. Blurry Whirl

- Surface name: `Blurry Whirl`. Folk-compressed.
- Hidden structure: `Stepping Paradox Whirl` (Class 2 expanded).
- Doctrine maturity: **expert-confirmed** (2026-05-15); transitivity to other bases pending Q1.
- Recommendation: **always surfaced in Layer B**, optional in Layer A. The structural reading is high-value pedagogy; the folk name is the player-facing handle.

### Case 2. Blurry Torque

- Surface name: `Blurry Torque`.
- Hidden structure: `Stepping Paradox Torque` AND deep form `Stepping Paradox Miraging Osis`.
- Two stopping depths. Both are legitimate Layer B readings.
- Recommendation: **always surfaced in Layer B with both stopping depths**. Demonstrates the multi-stopping-depth pattern; pedagogically excellent.

### Case 3. Food Processor

- Surface name: `Food Processor` (sui-generis; metaphorical).
- Hidden structure: `Stepping Paradox Blender` (Class 2 expanded) AND deep form `Stepping Paradox Whirling Osis`.
- Doctrine: same family as Blurry-X; Food Processor is structurally `Blurry Blender`.
- Recommendation: **always surfaced in Layer B**. Note the alias relationship: `Food Processor ↔ Blurry Blender`. The sui-generis folk name is the canonical Layer A handle; the structural expansion lives in Layer B.

### Case 4. Mobius

- Surface name: `Mobius`.
- Hidden structures (multiple): `Spinning Torque` (one stopping depth), `Spinning Miraging Osis` (deeper), `Gyro Torque` (federation-equivalent).
- Doctrine maturity: **stable** for the structural readings (pt11); **stable** for the FM federation equivalence (2026-05-15).
- Recommendation: **always surfaced in Layer B as the flagship compression-flow example**. Already implemented in glossary §8; extending to trick-detail page would add value.
- Caution: compression-intent (Q5) is unresolved. The pedagogy currently says "decompresses to" / "compresses to" — these verbs imply intentional shorthand. If Q5 lands on "retrospective interpretation," verbs need adjustment to "can be read as" / "structurally expands to."

### Case 5. Atom Smasher

- Surface name: `Atom Smasher` (sui-generis; metaphorical).
- Layer A reading: `Atomic Mirage`.
- Hidden structure (per 2026-05-15): involves X-dex similar to paradox from a toe.
- Doctrine maturity: **expert-confirmed but narrow** (one row); doctrine scope pending Q3.
- Recommendation: **HOLD — do not surface hidden structure in Layer B until Q3 doctrine settles.** Premature surfacing risks teaching a narrow ruling as universal. Keep `Atomic Mirage` as the Layer A canonical reading; Layer B should currently say "structural reading under community review" or similar.

### Case 6. Barraging Osis (Baroque)

- Surface name: `Baroque` (sui-generis folk name).
- Layer A reading: `Barraging Osis`.
- Hidden structure: `(dex) + (dex) + Osis` (Class 2 count-bearing).
- Doctrine maturity: **expert-confirmed but narrow** (one row); doctrine scope pending Q2.
- Recommendation: **surface in Layer B with explicit annotation that the operator semantics (barraging as count-bearing vs +1 flat) are under doctrine review (Q2).** This is a borderline case: the math closes, the structural reading is legitimate, but the operator-class assignment is doctrine-pending.

### Summary policy

| Doctrine maturity for the hidden structure | Layer B treatment |
|---|---|
| Stable | Always surface; teach as canonical structural reading |
| Emerging consensus | Surface with "structurally expandable to" verb (Level 3 phrasing) |
| Expert-confirmed but narrow | Surface with explicit "under community review" annotation OR hold pending doctrine resolution |
| Parser hypothesis or unresolved | Do not surface in player-facing Layer B; keep in curator-side notes only |

This policy is doctrine-aware: it gates Layer B visibility on the maturity of the structural reading, not on a static rule.

---

## §7. Nature of semantic compression — hybrid evaluation

The maintainer asked: is semantic compression intentional notation shorthand, embodied-mechanics shorthand, retrospective parser interpretation, or hybrid?

### Evidence-based answer: **hybrid, with per-token determination required.**

Different folk names compress differently. Treating all compressions as one category obscures the structural diversity.

### Compression archetypes observed

| Archetype | Example | Compression source | Layer B verb |
|---|---|---|---|
| **A. Intentional notation shorthand** | Sailing = Pixie + Atomic | Community deliberately shortened a multi-operator stack | "compresses to" / "decompresses to" |
| **B. Embodied-mechanics shorthand** | Blurry = Stepping + Paradox | The compressed name describes a recognizable movement pattern; the operators are reconstructions of how the movement works | "expands to" / "structurally reads as" |
| **C. Retrospective parser interpretation** | Food Processor = Stepping Paradox Blender | The folk name is sui-generis (metaphorical); the structural reading is a post-hoc analysis | "can be read as" / "structurally expandable to" |
| **D. Cross-system equivalence** | Mobius ≈ Gyro Torque (FM register) | Two communities arrived at different surface names for the same structure | "is also known as" / "in the federation register" |

A single trick may carry multiple archetypes simultaneously. Mobius is type A (community-compressed from Spinning Torque) AND type D (federation equivalent to Gyro Torque). Atom Smasher is type C (post-hoc structural analysis) AND type B if the new "X-dex from toe" reading lands as universal.

### Doctrine statement

**Compression is hybrid; per-token annotation is required.** A future `compression_intent` field on dictionary rows would capture this:

```typescript
type CompressionIntent =
  | 'intentional'        // type A; community-authored shorthand
  | 'mechanics-bound'    // type B; name describes movement, operators reconstruct
  | 'retrospective'      // type C; sui-generis folk name, structural reading is post-hoc
  | 'federation-equivalent'  // type D; cross-system name correspondence
  | 'unknown';           // default
```

This field would inform Layer B's verb discipline (§3) per-trick rather than uniformly.

### Why NOT to over-harden compression doctrine

Three reasons to keep this annotation alpha:

1. **Determining compression archetype per token requires expert ruling or strong community evidence.** We have it for ~5 tokens at most; ~150 dictionary rows would need annotation. Premature annotation creates rot.
2. **The archetypes themselves may merge or split with new evidence.** Round-2 Q5 may rule that the entire compression framework is one of {A, B, C} not a hybrid. Hold judgment.
3. **Pedagogy works fine with verb-discipline alone.** Layer B prose can use "can be read as" universally (most conservative) without committing to archetype. The archetypes are useful for curator authoring decisions, not user-facing prose.

**Recommendation:** treat compression archetype as an *internal curator annotation*, not a user-facing taxonomy. Surface it in curator review tools (Layer C-adjacent) but not in trick pages.

---

## §8. Parser architecture implications

### Question 1. Should barrage become explicit operator vocabulary?

**Answered in PT12_ROUND2_SYNTHESIS §4.4: yes, with structural-expansion semantics inline.**

The operator-reference entry stays; the `decomposition` field gains a count-bearing form `(dex) + (dex)`. The parser does NOT tokenize `barraging` differently in canonical_name strings (preserves parser/editorial separation). The structural reading lives in `OPERATOR_REFERENCE_ENTRIES`, not in the tokenizer.

### Question 2. Should blurry-class expansions become parser doctrine or optional interpretation?

**Recommendation: parser doctrine at the *structural-decomposition layer* (Layer C); optional interpretation at the editorial layer (Layer B).**

Concretely:

- The parser-population script (`scripts/parse_freestyle_notation.py`) should recognize `blurry` as expanding to `stepping paradox` when constructing `structural_parse_json` and `computed_adds`. This is mechanical and reproducible.
- The canonical_name field stays `blurry-X` (preserving the folk name); the parser does NOT rewrite canonical_name at tokenization.
- The editorial layer (operator-reference + glossary prose) authoritatively states the expansion. Layer B surfaces it.

This separates *how the parser computes ADD math* from *how the dictionary names tricks*. The parser doctrine ensures the formula table reflects the new structural reading; the editorial layer governs how the reading is taught.

### Question 3. Should hidden-X/paradox semantics remain advisory until broader evidence?

**Recommendation: yes, remain advisory. Do not promote to parser doctrine until Q3 settles.**

Two reasons:

1. **The Q3 doctrine scope is unsettled.** The 2026-05-15 ruling addressed Atom Smasher specifically. Whether the X-dex character applies to all atomic-X / only toe-launched / only Atom Smasher is the Q3 doctrine question. Promoting to parser doctrine prematurely would harden the wrong reading.
2. **The math already closes via pt10.** Atomic's +1/+2 rotational policy already produces the correct stated ADDs across the atomic family. The X-dex character is a *mechanical-explanation* layer, not a *math-correction* layer. The parser doesn't need it to compute correct ADDs.

Concretely: the operator-reference entry for `atomic` can carry a `mechanicalNote` field documenting the X-dex character as advisory annotation, but `decomposition` stays as the pt10 reading until Q3 broadens or narrows it.

### Question 4. Metadata fields that may now be required

Five candidate fields, in decreasing order of necessity. Recommend deferring schema changes; use TypeScript content modules per `feedback_reversible_content_governance`.

| Field | Owner | Why | Maturity for adding |
|---|---|---|---|
| `decomposition_layer_b` (expanded structural reading) | TS content module | Layer B trick-detail surface needs this | Ready post-Q1 doctrine settlement |
| `compression_intent` (archetype A/B/C/D) | Curator annotation | Verb-discipline in Layer B prose | Hold; alpha until Round-2 settles |
| `hidden_structure_note` (X-dex / paradox-from-toe annotation) | Curator annotation | Advisory; surfaces in curator tooling | Hold; pending Q3 |
| `secondary_reading` (alternative canonical reading) | Curator annotation | Federation equivalents (Mobius / Gyro Torque) | Ready; small data set |
| `mechanical_character_note` (free-form mechanism note) | Curator annotation | Surfaces in operator-reference + advanced trick-detail | Already supported via `pendingNote`; no new field |

**Recommendation:** add `decomposition_layer_b` and `secondary_reading` to the TypeScript content modules; defer the rest until doctrine settles.

### Question 5. Operator-reference module evolution

The current `OperatorReferenceEntry` shape has:

```typescript
slug, name, category, oneLineMeaning, decomposition,
pendingNote, workedExamples, lineageNote, curatorConfirmPending
```

Post-Round-2-settlement, the candidate extension:

```typescript
// Existing fields unchanged.

// New: archetype assignment for compression-intent discipline.
compressionArchetype: 'intentional' | 'mechanics-bound' |
                      'retrospective' | 'federation-equivalent' |
                      'unknown';

// New: structural class (the five classes from §2).
decompositionClass: 1 | 2 | 3 | 4 | 5;

// New: when class is 5 (policy-dependent), the policy rule.
policy?: { condition: string; weightIfTrue: number; weightIfFalse: number };

// New: hidden structural character annotation (advisory).
hiddenStructureNote?: string;
```

These fields are alpha. Adding them without Round-2 answers would harden choices prematurely. Wait.

---

## §9. Doctrine maturity map

The classification the maintainer asked for. Each doctrine sized per its current evidence base.

| Doctrine | Maturity | Evidence | Open questions |
|---|---|---|---|
| **Five-class decomposition taxonomy** | Emerging consensus | Tested against all 2026-05-15 rulings; fits cleanly | Sub-pattern (count-bearing) — separate class or absorbed in Class 2? |
| **Mechanism-not-weight adjudication framework** | Stable | Two Wave-1 answers followed this shape; methodologically self-consistent | None for the framework itself; specific rulings still mechanism-vs-weight choices |
| **Four locution levels** | Emerging consensus | Distinguishes language-types observed in existing prose | Verb-discipline not yet enforced in current glossary prose (drift candidate) |
| **Layered display architecture (A/B/C)** | Parser hypothesis | Layers exist in current code de facto; naming/governance proposed here | Layer B implementation surface not yet authored on trick pages |
| **Blurry = stepping + paradox doctrine** | Expert-confirmed but narrow | 4 cases ruled (Blur + 3 new) | Universal transitivity (Q1) |
| **Barraging = (dex)+(dex) doctrine** | Expert-confirmed but narrow | 1 case ruled | Operator-class assignment (Q2); furious-as-count parallel |
| **Atomic carries hidden X-dex from toe** | Expert-confirmed but narrow | 1 case ruled (Atom Smasher) | Scope (Q3.A); operator-relationship to paradox (Q3.B); nuclear interaction (Q3.C) |
| **Far / reverse positional = +0** | Stable | Wave 1 Q3 confirmed | None |
| **ss = +0 universal** | Stable | pt11 + pt12 + Wave 1 | None |
| **Spinning flat +1 (no rotational escalation)** | Stable | pt10 + pt11 | None |
| **Atomic +1/+2 rotational policy** | Stable | pt10 | Interaction with hidden-X-dex doctrine (Q3.C) |
| **Compression-archetype classification (A/B/C/D)** | Parser hypothesis | Proposed here; not yet expert-ratified | Q5 settles whether the entire framework is hybrid or single-archetype |
| **Hidden-structure surfacing policy** | Unresolved | Pending Q6 | The doctrine-maturity gating rule in §6 is the alpha policy |
| **Operator-vs-trick role disambiguation** | Unresolved | Fairy confirmed as operator-vocab but disambiguation rule pending | Q4 |
| **Fairy-as-modifier ADD weight** | Unresolved | Legitimacy confirmed; weight not specified | Q4.C |
| **Furious non-rotational weight** | Unresolved | pt6 derived +2 rotational only | Wave 1 Q1.c (sub-question; still open) |
| **Gyro / spinning relationship** | Emerging consensus | Mobius ≈ Gyro Torque establishes correspondence | Are they aliases or distinct operators? (Q4 territory) |
| **Compression intent per token** | Unresolved | Hybrid framework proposed; per-row determination required | Q5 settles framework; per-row annotation deferred |
| **Frigidosis decomposition** | Unresolved | Red deferred in pt11 | Wait for new evidence |
| **Witchdoctor atomic-symposium math** | Unresolved | pt12 Q2 drafted, not answered | Touched by Q3 (atomic doctrine); may resolve transitively |

### Maturity-gated action policy

| Maturity | Action policy |
|---|---|
| Stable | Safe to lock in canonical docs, formula tables, parser doctrine, pedagogy prose |
| Emerging consensus | Safe to draft against; mark as "current working doctrine"; revisit annually |
| Expert-confirmed but narrow | Surface in Layer B with appropriate verb-discipline; do NOT generalize without doctrine ruling |
| Parser hypothesis | Use in curator tooling and internal docs only; do not surface to players |
| Unresolved | Hold; do not author against; flag in IP as known-deviation |

---

## §10. Recommended sequence from here

The maintainer listed seven candidate next steps. Recommended sequencing:

### Phase A (immediate; parallel-able; no Round-2 dependency)

**A.1. Land the doctrine documents as canonical exploration references.**

- `PT12_ROUND2_SYNTHESIS.md` — already landed (2026-05-15).
- `SEMANTIC_COMPRESSION_DOCTRINE.md` — this document.
- Both stay in `exploration/red-consolidation/`; no canonical-doc changes yet.

**A.2. SCALE-6a authoring for the 4 newly-unblocked blurry-class rows.**

- Blurry Whirl, Blurry Torque, Food Processor, Baroque (Barraging Osis).
- Use Level 3 verbs ("structurally expandable to") for the expanded decompositions, not Level 1 ("is").
- Hold atomic-family rows (Atom Smasher, Sumo, Eggbeater, etc.) pending Q3 + Q6.
- Hold Mobius pending Q5 (current glossary compression flow uses "compresses / decompresses" — Level 1-shaped verbs; verify these stay appropriate after Q5).

**A.3. Send Round-2 packet.**

- Six grammar-level questions from PT12_ROUND2_SYNTHESIS §8.
- High info-leverage; each question closes a doctrine.
- Maintainer's action.

### Phase B (after Round-2 reply; ~1-2 weeks lag)

**B.1. Apply destructive ontology changes locked by Round-2 answers.**

Subject to specific answers:

- Operator-reference module updates (PT12_ROUND2 §10.4): blurry, barraging, far/reverse, fairy, gyro, blistering.
- FM_MATH_DIVERGENCES.csv reclassifications.
- Glossary prose updates reflecting new doctrine.

**B.2. Parser remediation.**

- Barraging + blurry expansion at the structural-decomposition layer (`parse_freestyle_notation.py`).
- Far / reverse explicit +0 in positional-operator set.
- NO changes to canonical_name tokenization (parser/editorial separation forever-rule).

**B.3. Update memory.**

- `project_freestyle_state.md` — pt12 queue close; operator semantics; new doctrines.
- `project_red_consultation_state.md` — Wave 1 effectively resolved by 2026-05-15; Round-2 packet sent.
- `project_freestyle_federation.md` — federation cohort reclassifications.

### Phase C (Layer B UI; weeks-scale; doctrine-dependent)

**C.1. Layer B trick-detail surface.**

- Add an "Expanded reading" section to trick-detail pages (`/freestyle/tricks/:slug`).
- Visibility-gated by `decomposition_layer_b` field on the trick row.
- Verb-discipline enforced per locution level (§3).
- Cross-link from glossary §8 compression flow to trick pages (and back).

**C.2. Glossary integration of new operator vocabulary.**

- Add Blistering / Fairy-as-modifier / Gyro entries (post-Round-2 settlement on weights + roles).
- Extend modifier-family pages to include the new operators.
- Operator-board updates if Q4 changes the operator-vs-trick disambiguation.

**C.3. Family-tree expansion (Batch 4+ work; already proposed in glossary roadmap).**

- Extend the 4 pilot families (whirl, butterfly, mirage, osis) to include torque, legover, illusion, swirl.
- Add hidden-structure annotations for atomic-family rows IF Q6 lands on always-surface or expandable.

### Phase D (longer-term; doctrine-stable)

**D.1. Modifier-system bridge rows.**

- SCALE-N batches authoring prose for rows that bridge operator families.
- Doctrine-stable rows only; do not author against unresolved doctrines.

**D.2. Doctrine codification in canonical docs.**

- IF the doctrine maturity map shows 4+ stable doctrines that are not yet in canonical docs, propose updates to `docs/DESIGN_DECISIONS.md` (or a new `docs/FREESTYLE_DOCTRINE.md`).
- Tests describe long-term contracts; doctrines do too. Adding "the four locution levels" as a canonical design decision lets future authoring discipline reference it.
- Caution: per `doc-governance.md`, canonical docs describe design intent; this doctrine is a design intent. Adding it is legitimate; doing so prematurely is drift.

**D.3. Compression-archetype annotation rollout.**

- Once Q5 settles, annotate dictionary rows with their compression archetype (intentional / mechanics-bound / retrospective / federation-equivalent / unknown).
- Curator-led; no automation.
- Affects Layer B verb-discipline only; does not surface to players directly.

---

## §11. Explicit cautions

Five places where premature hardening would cause damage. Documented so future synthesis agents do not undo this discipline.

### Caution 1. Do not promote Class-3 hidden-structure readings to Layer A without Q6.

Atom Smasher's hidden X-dex character is a Class-3 doctrine. Surfacing it in Layer A (dictionary canonical decomposition) without Q6 settling would commit to a doctrine scope that may not hold. Stay in Layer B with appropriate verb-discipline.

### Caution 2. Do not rewrite canonical_name strings to reflect expanded decomposition.

`Food Processor` stays `Food Processor` in canonical_name; the dictionary uses the folk name. Expanded readings live in `decomposition` (operator-reference) or `decomposition_layer_b` (future field). The parser/editorial separation forever-rule explicitly forbids rewriting canonical_name from expansion rules.

### Caution 3. Do not lock compression-archetype annotation per trick before Q5.

The four archetypes (intentional / mechanics-bound / retrospective / federation-equivalent) are hypothesis-grade. Per-row annotation requires expert ruling or strong community evidence; we have neither for most tricks. Hold.

### Caution 4. Do not promote Round-2 candidate fields to the database schema.

Use TypeScript content modules per `feedback_reversible_content_governance`. SQL schema migrations are forward-only and expensive to undo. The `decomposition_layer_b` field, `compression_intent`, `hidden_structure_note`, and friends should live in `src/content/` modules until the doctrine is stable.

### Caution 5. Do not change pedagogical verbs uniformly before Q5.

Current glossary §8 prose says "compresses / decompresses." If Q5 lands on retrospective interpretation, these become Level-1 verbs for Level-3 content (a doctrine error). But changing them now to "can be read as" is also premature if Q5 lands on intentional. Hold; let Q5 settle before adjusting verbs.

---

## §12. Doctrine deltas — quick reference

What is locked vs what is open as of 2026-05-15.

### Locked (Phase B can act on these immediately post-Round-2 reply)

- Blurry = stepping + paradox for the 4 confirmed cases.
- Barraging Osis = two-dex + osis = 5 (operator-class assignment Q2 still open, but the row is canonical).
- Far / reverse = +0 positional.
- Mobius ≈ Gyro Torque federation equivalence.
- Fairy as legitimate operator vocabulary.
- Blistering set = Gyro Whirling Set.

### Open (Round-2 questions; do not act on these yet)

- Blurry transitivity to other bases (Q1).
- Barraging operator class (Class 2 count-bearing vs Class 1 flat +1) and Furious count-reading (Q2).
- Atomic family X-dex scope (Q3.A / Q3.B / Q3.C).
- Operator-vs-trick boundary doctrine (Q4) and Fairy ADD weight (Q4.C).
- Compression intent framework (Q5).
- Hidden vs flat structure preservation policy (Q6).

### Permanently deferred (no current path to resolution)

- Frigidosis decomposition (pt11 deferred; no new evidence).
- Cloud stall ADD (pt8 deferred; low priority).
- Scrambled Eggbeater status (pt8 on-hold).

---

## §13. Cross-references

- `PT12_ROUND2_SYNTHESIS.md` — pt12 integration + reclassified queue + Round-2 packet draft.
- `RED_RESOLVED_CANON.md` — settled rulings; all Layer-A canonical decompositions.
- `RED_OPEN_QUESTIONS_REFORMULATED.md` — modern-vocabulary statement of open items.
- `RED_NO_LONGER_NEEDED.md` — do-not-resend list; respect when authoring future packets.
- `RED_WAVE1_PACKET.md` — Wave 1 send-ready text; effectively answered 2026-05-15.
- `feedback_parser_editorial_separation.md` — parser/editorial separation forever-rule; load-bearing for §8.
- `feedback_reversible_content_governance.md` — prefer TypeScript content modules over SQL schema migrations during ontology refinement.
- `feedback_frequency_not_authority.md` — corpus recurrence is evidence, not authority; used in operator-promotion decisions.
- `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` — six requirements for canonical trick promotion; intersects with Layer A discipline.

---

*End of SEMANTIC_COMPRESSION_DOCTRINE.md*
