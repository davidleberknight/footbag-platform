# Ben Job Notation -- Glossary Integration Plan -- 2026-05-19

Reconciliation slice deliverable. Pedagogical integration plan for using Ben Job's 1995 notation document to enrich glossary v5 without collapsing notation systems.

Source document: `exploration/fborg/JobsNotation.txt` (129 lines; titled "Ben Job's Original Proposal", "A List By the Way", originally a 1995 email to footbag@footbag.org).

---

## 1. Major notation concepts in the Job document

Job's notation is a grammar-formula system. Three formula versions are presented in the document:

**Formula 1 (basic dexterity tricks):**

```
(toe | clip) >
[(same | op)(in | out)dexterity]* >
(same | op)(toe | clip)
```

**Formula 2 (with no-plant + spin elements):**

```
(toe | clip) >
[(no plant while)]
[(same | op)(in | out)dexterity | (for | back)spin]* >
(same | op)(toe | clip)
```

**Future-formula elements mentioned but not formalized:** stomping (both legs plant), blind, hop-over, carry (Wrap), duck, dive, jumping/flying, Swirl/Twirl cross-body dex, swing (Pendulum, Rake).

Notation primitives:
- `same` / `op` — relative to the previously-referenced leg
- `in` / `out` — inside / outside
- `|` — choice
- `[ ]` — optional
- `>` — followed by
- `*` — zero or more repetitions
- `(no plant while)` — pogo/symposium element
- `(for | back)spin` — spinning/gyro element

The system reads as a regular-grammar generator: any sequence matching the grammar is a valid trick instance. Job explicitly frames this as a constructive completeness claim ("approach the specification of every trick possible").

---

## 2. Symbolic philosophy

Job's central conceptual contributions:

1. **Tricks are sequences of primitives.** Set + dex segment + catch/kick.
2. **The dex segment is a regular grammar.** Composable from a small alphabet of primitives.
3. **Variation is exhaustively enumerable.** The grammar generates a "truth table of moves, leaving no move undiscovered."
4. **Modifiers extend the grammar additively.** No-plant for symposium/pogo; for/back-spin for spinning/gyro; future extensions for stomping/blind/hop/etc.
5. **Names are secondary to formulas.** Job's framing: a trick IS its grammar form; names are labels, not definitions.

This is structurally compatible with the modern dictionary's parser/editorial separation: Job's grammar is the parser-layer reading; modern dictionary's chain reading is the editorial-layer reading. Both layers can co-exist.

---

## 3. Differences from current IFPA shorthand

Three notation systems currently exist in the IFPA architecture; Job's grammar would be a fourth pedagogical surface (NOT a fifth canonical layer; see §6).

| System | Purpose | Example for `ripwalk` |
|---|---|---|
| Canonical name | Community label | `ripwalk` |
| Chain reading (shorthand equivalence) | Structural decomposition | `stepping butterfly` |
| Operational notation | Surface-precise tokenized form | `CLIP > OP IN [DEX] > OP OUT [DEX] > OP CLIP` (per ATAM grammar §13) |
| Job grammar (proposed pedagogical layer) | Constructive grammar reading | `clip > op in dex > op out dex > op clip` |

**Key differences:**

- **Token style.** Modern uses uppercase + bracketed flags (e.g., `[DEX]`, `[PDX]`, `[DEL]`); Job uses lowercase + parenthesized phrases (e.g., `(no plant while)`, `(back)spin`).
- **Operator framing.** Modern names operators (paradox, symposium, ducking, gyro, atomic); Job describes their behavior structurally (side-change via same/op transition; no-plant; for/back-spin).
- **Compositional completeness.** Modern is descriptive (each canonical row has its own notation); Job is generative (one grammar produces all valid instances).
- **Naming hierarchy.** Modern: folk name carries the structure (e.g., `blur` ≡ `stepping paradox mirage`); Job: descriptive name carries the modifier prefix (e.g., `Pdx Blur` = paradox blur).

**Doctrinal divergence flagged for curator:** Job's `(for | back)spin` operator maps roughly to modern `spinning`/`gyro` but uses a forward/backward axis. Modern doctrine (per `symbolicModifierEducation.ts:150`) frames spinning vs gyro on a full-turn (360°) vs half-turn (180°) axis. These are different distinctions; Job's reading and the modern reading agree on `spinning ≠ gyro` but disagree on what makes them different. Surface as Red Wave 2 question.

---

## 4. Decomposition philosophy

Job's framing puts decomposition at the grammar level; modern doctrine puts decomposition at the chain-reading level. Both are decompositional; they just choose different units of decomposition.

**Job's units:** primitive grammar tokens (set surface, dex direction, modifier element, terminal).
**Modern units:** operator + base atom (e.g., `stepping(+1) + butterfly(3)`).

The two approaches are NOT contradictory. They answer different pedagogical questions:

- Job's grammar answers: "What is the precise sequence of body actions?"
- Modern chain reading answers: "What named operators and base atom does this resolve to?"

A glossary integration that publishes BOTH for the same trick (where Job has an example) would offer learners two complementary lenses on the same movement.

---

## 5. Strengths of Job notation

Five real strengths worth surfacing in glossary pedagogy:

1. **Constructive completeness.** The grammar makes the space of possible tricks visible. Learners can see why mirage and illusion differ at the grammar level (in-dex vs out-dex direction).
2. **Side-change is grammar-explicit.** Same/op transitions encode paradox structurally; learners can see paradox WITHOUT needing the operator vocabulary.
3. **Set-and-catch shape is foregrounded.** Every Job formula starts with a set token and ends with a catch token; the modern dictionary often elides this. Useful for teaching trick structure.
4. **Compositional with simple additive extensions.** Job shows that adding `(no plant while)` and `(for|back)spin` to the basic dex grammar produces an expressive system. This compositional discipline is good pedagogical material.
5. **Historical authority.** 1995 source; pre-dates much of the modern operator vocabulary (paradox, atomic, symposium as named operators were not yet stabilized). Job's grammar shows the structural skeleton on which the modern operator vocabulary was layered.

---

## 6. Where glossary cross-links make sense

### Recommended glossary section placements

| Glossary section | Job content | Format |
|---|---|---|
| **§3 (dex direction)** | Job's same/op + in/out grammar tokens | Educational sidebar: "Job's grammar encodes side-change (same vs op leg-anchor) and direction (in vs out dex). Modern doctrine names the resulting operator paradox (side-change) and dex-archetype (in vs out)." |
| **§7 (operational notation reference / advanced)** | Job's grammar formula (both versions) | Full grammar block with Job's original wording, annotated with modern operator labels |
| **§8 (compositional structure / advanced)** | Job's 15 example tricks with grammar formulas | Side-by-side table: Job's grammar reading vs modern chain reading; learner sees both lenses |
| **§5 (per-pilot family trees)** | Job examples that decompose family bases | Brief footnote per family-tree pilot when Job named the trick (mirage, ripwalk, eggbeater, flurry, etc.) |

### Recommended educational opportunities

1. **"Notation philosophies" sidebar in §7.** Compare grammar-generative (Job) vs chain-decompositional (modern) notation philosophies. Explain that they answer different questions and both have legitimate pedagogical value.
2. **"Historical origins" section in §1 or §12 (deferred).** Note that Job's 1995 letter is the earliest published structural-notation proposal in IFPA-archive material; many modern operator names emerged in the years following.
3. **"Compositional reach" exercise in §8.** Use Job's "Pogo Paradox Symposium Blur" example to show how the grammar can generate compound illustrations without requiring a canonical row.

### Sections NOT recommended

| Section | Why NOT |
|---|---|
| §2 (surfaces) | Job's grammar uses only toe/clip terminals; surface taxonomy is broader than Job's scope |
| §4 (timing clock) | Job's grammar is order-of-operations only; no timing semantics |
| §6 (modifier feel cards) | Surface A (modifier feel) is embodied-analogy layer; Job notation is structural; mixing the layers violates the four-layer ontology separation |
| §11 (alphabetical reference) | Existing alphabetical layer doesn't need a Job-overlay; cross-references are sufficient |

---

## 7. Concepts NOT to import

Hard list of Job concepts that should NOT be promoted into the canonical layer:

| Concept | Why NOT |
|---|---|
| Job's `(no plant while)` as a CANONICAL operator name | Modern doctrine already names the operator `symposium` (and `pogo` for the zero-ADD case). Adopting Job's wording would create alias proliferation without doctrinal benefit |
| Job's `(for | back)spin` as the canonical spinning/gyro distinction | Modern doctrine distinguishes spinning/gyro on a full-vs-half-turn axis; Job's forward/backward axis is a DIFFERENT distinction; do NOT collapse the two |
| Job's grammar formula as the canonical trick representation | The four-layer ontology already has its layer-1 canonical name + layer-2 chain reading; adding Job's grammar as a layer would over-specify |
| Job's "Paradox Double Legover" name for `double-leg-over` | Red pt4-locked: `double-leg-over` chain reading is `miraging legover`. Job's name reflects a 1995 framing predating the miraging-vs-paradox doctrine. Document as historical alternate, not as canonical alias |
| Job's "Pdx Blur" as a canonical alias of `blur` | Modern `blur` is folk-named without paradox prefix; Job's name is structural-descriptive. Surface as observational; do not add to `freestyle_trick_aliases` as a curated alias |
| Auto-promotion of Job's example tricks to canonical rows | The 5 examples NOT in DB (Clipper-to-Clipper, Pogo-Paradox-Symposium-Blur, Double-Over-Down, Double-Pickup, Gyro-Ripwalk) each require independent curator + community-usage evaluation; do NOT mass-canonicalize |

---

## 8. Layer separation rules (reinforced)

The four-layer ontology separation (`footbag-freestyle-dictionary` skill §A) must be preserved when integrating Job's content:

| Ontology layer | Job content placement |
|---|---|
| **Canonical names** | Job's example NAMES (Mirage, Flurry, Ripwalk, etc.) are inputs to the canonical-name layer; only those already canonical remain canonical |
| **Symbolic decomposition** | Job's grammar formulas are an ALTERNATE symbolic reading; do NOT replace existing chain readings; do NOT collapse the two |
| **Glossary pedagogy** | Job's grammar concepts (same/op, in/out, no-plant, for/back-spin) are pedagogical content for §3/§7/§8 |
| **Embodied movement analogy** | Job's notation is structural; do NOT use Job content in modifier feel cards (Surface A) which is embodied-analogy layer |

The integration plan adds material to the GLOSSARY PEDAGOGY layer only. It does NOT mutate canonical names, NOT replace chain readings, NOT collapse the symbolic / pedagogical / embodied layers.

---

## 9. Recommended implementation slices (curator-paced; ALL DEFERRED)

| Slice | Scope | Risk | When |
|---|---|---|---|
| J1 | Add "Notation philosophies" sidebar to glossary §7 | Low | After curator confirms doctrine direction |
| J2 | Add "Job grammar reading" column to selected dictionary cards (the 10 Job examples that are canonical) | Medium (UI surface) | After J1 lands + curator approves Surface B addition |
| J3 | Add Job-grammar-formula sidebar to glossary §8 with the 4 paradigm examples (Mirage, Ripwalk, Symposium Mirage, Pdx Blur) | Low | After J1 lands |
| J4 | Add "Historical origins" footnote in §1 or §12 | Low | When §12 lands |
| J5 | Surface-by-surface review of the 4-axis Job grammar primitives vs current Movement System taxonomy | Medium | Post Red Wave 2 |
| J6 | (NOT recommended) Add Job's "double-X" examples (Pickup, Over Down) as canonical rows | High | Defer to Productive Multiplicity audit per CANONICALIZATION_POLICY.md §10 |

None of these slices are recommended for immediate implementation. The audit positions the curator to make the J1-J5 decisions; J6 is explicitly NOT recommended.
