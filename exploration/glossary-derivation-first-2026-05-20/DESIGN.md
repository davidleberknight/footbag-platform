# Freestyle Glossary -- Derivation-First Compositional Atlas Revision -- 2026-05-20

A philosophical sharpening and structural extension of `exploration/glossary-ia-refactor-2026-05-19/DESIGN.md`.

The earlier design solved structural overload: a 14-section spine, sticky sidebar, T1/T2/T3 collapse model, four-layer philosophy, Root vs Branch family split, badge vocabulary, and no-parser-aesthetics rule were locked and have shipped through P1/P2/P3 on the live glossary. That work cleared the runway. This revision re-centers what the cleared runway is for.

**This document is a curator-review deliverable.** No edits to `src/views/freestyle/glossary.hbs` until a slice is curator-approved.

---

## 0. Status + scope

### 0.1 What this revises

The 2026-05-19 spec organized the glossary as a layered reference. This revision answers a different question: **what is the glossary for?** The answer is sharper than the prior framing:

> The glossary is the *movement-language layer* of the freestyle ontology. The trick dictionary is the canonical object registry. The glossary explains how the registry was generated, how its entries decompose, how families inherit, how ADD accounting emerges, and how runs compose from the same compositional grammar that generates the tricks themselves.

The shift is from **definition-first** to **derivation-first**, and from **trick-level vocabulary** to **trick-level + sequence-level compositional grammar**.

### 0.2 What stays locked

Every locked default from 2026-05-19 stands. 14-section spine, T1/T2/T3 model, badge vocabulary, sticky sidebar, card primitive, Root vs Branch split, reference-first orientation, four-layer philosophy, no parser-AST UI overload, anchor preservation, phased migration.

### 0.3 What this adds

Six new locked principles (numbered 9 to 14 to continue the prior series), plus eight curator decisions resolving the open questions raised during review. The most consequential additions:

- **Derivation-first principle** (Principle 8): formulas are the glossary; definitions are not enough on their own.
- **Existing-content preservation principle** (Principle 9): the refactor is not a rewrite-from-scratch.
- **Run-architecture migration principle** (Principle 10): sequence-level compositional grammar moves into the glossary ecosystem.
- **Compositional-continuity principle** (Principle 11): operators, tricks, families, modifiers, combinations, runs are all manifestations of the same compositional language.

---

## 1. Revised glossary identity statement

> The freestyle glossary is a **compositional movement-language atlas**. It is the explanatory layer of the freestyle ontology: the surface where readers learn how primitive movement operators generate tricks, how tricks compose into families, how families branch into specialized lineages, how modifiers transform structure, how community shorthand compresses formulas, how runs assemble from the same compositional grammar, and how ADD accounting emerges from all of it.
>
> It is not a dictionary of definitions. It is a reference for the derivation system that produces the dictionary.

The trick dictionary at `/freestyle/dictionary` remains the canonical object registry. The combinations surface at `/freestyle/combo-analysis` remains the canonical run-data view. The glossary is the explanatory bridge: it teaches the language those surfaces are written in. This fits cleanly into the existing two-surface contract (VC §6): every reference surface has exactly one home; landings and adjacent pages preview and link out. The glossary is the *explanatory home* for movement-language concepts.

---

## 2. Locked principles consolidated (1 to 14)

Principles 1 to 7 are inherited from 2026-05-19. Principle 8 elevates derivation. Principles 9 to 14 are new.

| # | Principle | Status |
|---|---|---|
| 1 | 14-section hierarchical spine; essay progression retired | Locked (shipped P1) |
| 2 | T1 canonical / T2 advanced / T3 observational; `[advanced]` + `[observational]` badges only | Locked (shipped P1) |
| 3 | Jobs / Operational Notation elevated to dedicated §7 | Locked (shipped P1) |
| 4 | ADD Accounting elevated to dedicated §8 with full build | Locked (shipped P3) |
| 5 | Reference-card primitive as default presentation unit | Locked (shipped P2) |
| 6 | Root vs Branch family split | Locked (shipped P2) |
| 7 | Canonical vs observational visual separation; observational never dominates | Locked |
| 8 | **Derivation-first** -- formulas, decomposition chains, equivalence chains, ADD derivation, family inheritance, symbolic compression are primary; definitions alone are insufficient | **New, locked** |
| 9 | **Existing-content preservation** -- redistribute existing prose into stronger containers; do not flatten or sterilize | **New, locked** |
| 10 | **Run-architecture migration** -- sequence-level grammar is part of the glossary ecosystem | **New, locked** |
| 11 | **Compositional continuity** -- operators, tricks, families, modifiers, combinations, runs are one continuous compositional language | **New, locked** |
| 12 | **Observational elevation** -- topology, neighborhoods, attractor behavior, modifier affinity preserved as clearly-marked panels | **New, locked** |
| 13 | **Compositional-thinking pedagogy** -- the educational arc outranks isolated definitions | **New, locked** |
| 14 | **No parser-aesthetic overload** re-asserted -- derivation panels stay elegant; no AST drawings, no token soup, no compiler aesthetics | Locked (re-asserted) |

---

## 3. Updated section priorities (revised 14-section spine)

The section count stays at 14. The shift is in **section weight**: which sections grow, which compress, which gain new presentation primitives. Specifically, §10 Run Architecture grows from a thin cross-link section into a substantial sequence-level grammar surface.

| # | Section | Previous weight | Revised weight | Why |
|---|---|---|---|---|
| 1 | Core Concepts | Light | Light + reframed identity | Re-anchor as "movement-language atlas" identity |
| 2 | Contact Surfaces & Delays | Foundational | Foundational | Unchanged |
| 3 | Dexterities | Foundational | Foundational | Unchanged |
| 4 | Timing & Sets | Foundational | Foundational | Unchanged |
| 5 | Core Trick Families | Substantial | Substantial + lineage panels per family | Show inheritance chains explicitly |
| 6 | Modifiers & Operators | Substantial | Substantial + formula expansion per modifier | Modifiers become operator entries with formula effect, ADD weight, common compounds |
| 7 | Jobs / Operational Notation | Elevated | **Elevated + paraphrased intro + canonical example battery + Jobs attribution** | The foundational compositional insight gets a paraphrased home |
| 8 | ADD Accounting | Elevated | **Elevated + resolved-doctrine gallery** | Doctrine conflicts get explicit explainer cards; only resolved conflicts surface |
| 9 | Symbolic Composition | Mid | **Mid + symbolic-compression first-class** | Compression theory becomes a central glossary concept |
| 10 | Run Architecture | Thin cross-link | **Substantial sequence-level grammar surface with worked run example** | The compositional language extends upward into runs |
| 11 | Family & Topology Concepts | Observational | Observational + elevated whirl-as-attractor, connector-trick behavior | Topology material preserved + navigable |
| 12 | Community Vocabulary | Observational | Observational | Unchanged |
| 13 | Historical Terms | Observational/historical | Observational/historical | Unchanged |
| 14 | Sources | Provenance | Provenance | Unchanged |

**Net effect:** §7, §8, §9, §10 become the load-bearing explanatory spine. They teach the compositional grammar from operators (§6+§7) through ADD (§8) through symbolic composition (§9) through runs (§10). §11 carries the observational topology as the upper-floor view.

---

## 4. Formula-first presentation recommendations

### 4.1 The presentation hierarchy

For every major glossary entry (trick name, family, modifier, atom), the default presentation order is:

1. **Name** (compressed community form)
2. **Semantic formula** (what the trick IS structurally; one line)
3. **Operational formula** (Jobs notation; one line)
4. **Expanded readings** (zero, one, or more deeper expansions; collapsed by default)
5. **ADD breakdown** (additive ledger; one line)
6. **Family + lineage** (which root, which branch, what it inherits)
7. **Related structures** (equivalence chains, neighborhood links)
8. **Notes** (doctrine, observational, historical; `[advanced]` or `[observational]` collapsed)

Prose is permitted but never replaces the formulas. Where existing prose carries irreducible educational value it is preserved and redistributed (see §15).

### 4.2 What "formula-first" replaces

- **Definition paragraphs** as the only presentation. Replaced by formula + one-line semantic gloss + (optional) expandable prose.
- **Synonym lists** without structural reasoning. Replaced by equivalence chains with operator-level explanation.
- **Family/category labels** without inheritance reasoning. Replaced by family cards showing lineage and modifier-effect ladders.

### 4.3 What formula-first does not replace

- Pedagogical prose for beginners in §1 Core Concepts and section intros.
- Cross-axis observation prose in §11.
- Doctrine narration prose in §8 conflict cards (short but real).

---

## 5. Derivation-panel specification

The **derivation panel** is a new top-level presentation primitive. Every major trick entry, every family card, every doctrine-conflict explainer uses it.

### 5.1 Panel anatomy

```
+---------------------------------------------------------------+
| MOBIUS                                                        |
+---------------------------------------------------------------+
| Compressed         mobius                                     |
| Semantic           gyro torque                                |
| Expanded           spinning same-side torque                  |
| Deep               spinning same-side miraging osis           |
| Operational        CLIP > OP IN [DEX] > (BACK) SPIN [BOD]     |
|                    > OP CLIP [XBD] [DEL]                      |
+---------------------------------------------------------------+
| ADD                official 5  ·  naive computed 6            |
|                    rotational doctrine (see §8.7)             |
+---------------------------------------------------------------+
| Family             gyro family  (branch: torque)              |
| Inherits from      torque (mirage-spin lineage)               |
| Related            blender · spin-mirage · double-osis        |
+---------------------------------------------------------------+
| [advanced] expandable prose: lineage history, doctrine        |
| context, alternative readings                                 |
+---------------------------------------------------------------+
```

### 5.2 Fields

| Field | Required | Source | Notes |
|---|---|---|---|
| Compressed | Yes | Trick dictionary | Display name as community uses it |
| Semantic | Yes | Editorial layer | One-line structural reading |
| Expanded | Optional | Editorial layer | Intermediate semantic depth |
| Deep | Optional | Editorial layer | Maximally explicit structural reading |
| Operational | Optional, recommended | Parser / editorial | Jobs notation |
| ADD | Yes | Canonical + computed | Show both when they disagree |
| ADD doctrine | Conditional | Editorial | Link to §8 conflict gallery when present |
| Family | Yes | Trick dictionary | Root or branch |
| Inherits | Optional | Editorial layer | Lineage chain |
| Related | Optional | Editorial layer | Equivalence chain + neighborhood links |
| Advanced prose | Optional | Editorial | Collapsed by default |

### 5.3 Layer separation invariant

The derivation panel renders content from two layers that must stay separate (memory: `feedback_parser_editorial_separation`):

- **Parser layer:** reads canonical_name only; provides operational notation.
- **Editorial layer:** reads `base_trick` + modifier links + asserted ADD; provides semantic readings, expansions, lineage, doctrine.

The panel does not blend them; it renders parser output in the "Operational" row and editorial output in the others.

### 5.4 No parser-aesthetic overload

The panel is text-mode rows with light typographic hierarchy. No syntax-highlighted token soup, no AST tree drawings, no compiler-style brackets/colons. Jobs notation uses the existing operator-board glyph conventions (already in §7) and never more than two lines per panel.

---

## 6. Jobs-notation integration strategy

### 6.1 Paraphrased introduction (two paragraphs)

§7 opens with exactly two paragraphs. One undersells the philosophical importance; longer essay blocks violate the reference-first architecture. Two paragraphs is the right length.

**Paragraph 1 -- the compositional insight.** Freestyle tricks are not arbitrary movements that happen to have names. They are *generated* by a small number of primitive movement operators acting in sequence on the feet, the body, and the footbag. A trick name is a *compressed formula* for one such sequence. The set of nameable tricks is, in principle, enumerable: pick a starting surface, pick a sequence of operators, and read off the resulting formula. The named tricks in the dictionary are the formulas the community has found worth naming. This compositional approach was articulated most famously in a foundational notation proposal by Ben Job. The notation in this section is the modernized expression of that proposal. The same/op/in/out/dex tokens, the surface and delay flags, and the sequencing operators are all elements of the generative system Ben proposed.

**Paragraph 2 -- modern glossary interpretation.** This glossary treats Ben's insight as the seed of a layered explanatory system. Tricks have multiple legitimate readings at different semantic depths. The shortest reading is the community name. The deepest reading is the full operational formula. Between them sit intermediate readings, equivalence chains, and the modifier inheritance that explains why two differently-named tricks share structure. The examples that follow show the system in action: each row is a formula, and the formula generates the named trick on its right. The grammar reveals itself in the examples; the prose's job is only to point at the examples.

The section then transitions immediately into the canonical-example battery. The examples are the proof.

### 6.2 Canonical-example battery (10 to 12 visible)

Six examples are too few to reveal the grammar. Twenty or more upfront is visually noisy. The right size is 10 to 12 visible by default, with a `show more examples` expansion below. The visible set is curated to demonstrate compositional growth, modifier stacking, symbolic compression, and semantic depth in one pass.

| # | Operational formula | Compressed name | Demonstrates |
|---|---|---|---|
| 1 | `TOE > OP IN [DEX] > OP TOE` | mirage | atom + single operator |
| 2 | `(FRONT) SPIN [BOD] > CLIP [XBD] [DEL]` | whirl | rotational atom |
| 3 | `CLIP > OP IN [DEX] > OP CLIP` | legover | base compound |
| 4 | `CLIP > SAME IN [DEX] > OP OUT [DEX] > SAME TOE` | paradox double legover | paradox operator + stacking |
| 5 | `CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE` | flurry | deeper stacking |
| 6 | `TOE > OP IN [DEX] > OP IN [DEX] > OP TOE` | double-dex mirage | dex-count compounding |
| 7 | `SPIN [BOD] > TOE > OP IN [DEX] > OP TOE` | spinning mirage | spinning operator |
| 8 | `CLIP > SAME IN [DEX] > OP IN [DEX] > SAME OUT [DEX] > OP TOE` | symposium | multi-axis composition |
| 9 | `CLIP > OP IN [DEX] (STEPPING) > OP CLIP` | stepping paradox ≡ blurry | symbolic compression in action |
| 10 | `SPIN [BOD] > CLIP > OP IN [DEX] > OP CLIP` | spinning legover (torque-adjacent) | torque lineage |
| 11 | `(BACK) SPIN [BOD] > CLIP > OP IN [DEX] > OP CLIP [XBD]` | torque | torque atom emergence |
| 12 | `CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]` | mobius (≡ gyro torque) | compression compound + semantic ladder |

Row 9 shows symbolic compression *inline* by including the `≡ blurry` equivalence in the right column. Row 12 shows semantic-depth compression with `≡ gyro torque`. These are the compression hooks the §9 section will pick up.

Below the visible 12, the `show more examples` reservoir holds the longer alphabetical battery, target ~50 examples covering edge cases (composite modifiers, doctrine-conflict tricks, historical compounds, branch-family demonstrations).

### 6.3 Attribution

The intro uses Ben Job's name. Per the curator decision: Jobs notation is historically foundational; this is not random attribution clutter. The phrasing is "articulated most famously in a foundational notation proposal by Ben Job" -- respectful without becoming biographical. Memory `feedback_no_individual_names_freestyle_views` carries Jobs notation as the codified exception (notation tradition, not personal credit), and this phrasing fits inside that exception.

### 6.4 Notation reference (existing, light reorganization)

The existing §7 inventory of flags / tokens / operators is preserved. The reorganization:

- Move the paraphrased intro and canonical-example battery to the top.
- Demote the alphabetical token reference into a collapsed table by default.
- Keep the decomposition examples block; show three or four examples by default with the rest in a collapsed reservoir.

---

## 7. ADD-doctrine integration strategy

### 7.1 §8 as the doctrine-explaining surface

§8 ADD Accounting (already elevated and built in P3) is the home for ADD doctrine. The revision strengthens it from a worked-examples gallery into an explicit **doctrine explainer**.

### 7.2 §8 subsections (revised)

| Subsection | Content |
|---|---|
| §8.1 Philosophy | Why ADD exists; what it measures; flag-count doctrine in one paragraph |
| §8.2 Atom weights | 12 core atoms with ADD values |
| §8.3 Operator weights | +1/+2 modifier inventory; rotational vs translational |
| §8.4 Additive formulas | operator + base = compound; worked examples |
| §8.5 Complementary formulas | composite-modifier decompositions |
| §8.6 Decomposition chains | multi-step worked examples |
| §8.7 Resolved-doctrine gallery | per-conflict explainer cards (see §7.3 below) |
| §8.8 Policy-dependent semantics | counting-frame doctrine; one trick scored differently by frame |
| §8.9 Historical conflicts | pre-2026 vs current weightings; rationale for shifts |

### 7.3 Resolved-doctrine gallery (curator decision: resolved only)

The doctrine gallery surfaces *resolved* conflicts. Open Red-track adjudication does not appear in the main glossary -- it would risk feeling unstable or speculative on a public-facing explanatory surface. Three category labels are acceptable for conflicts the glossary surfaces:

- **policy-dependent** -- the ADD depends on a counting-frame choice; both readings are valid under their respective frames
- **multiple accepted readings** -- the community recognizes two stable readings; neither has been overridden
- **historical disagreement** -- pre-2026 reading differs from current reading; the historical context is preserved as explanatory material

Open Red questions stay behind the Red-consultation track unless explicitly approved, pedagogically unavoidable, or already community-visible.

Initial resolved-doctrine card set:

- **mobius** -- rotational doctrine (official 5 vs naive 6)
- **barraging** -- two-dex reading (resolved 2026-05-15)
- **blurry** -- expansion doctrine (resolved 2026-05-15)
- **far/reverse** -- +0 modifier doctrine (resolved 2026-05-15)
- **fairy** -- operator status (resolved 2026-05-15)
- **double-operators** -- general rule for double-X compounds
- **quantum** -- policy-dependent ADD
- **mobius ≡ gyro-torque** -- equivalence doctrine (resolved 2026-05-15)

Cards for open conflicts (nuclear, furious unresolved, whirling-as-modifier, etc.) stay in `exploration/red-adjudication-*` until they resolve.

### 7.4 Conflict-card format

Each card uses the derivation-panel format from §5, with an explicit "Conflict" row replacing the standard "Related" row:

```
+---------------------------------------------------------------+
| MOBIUS -- ROTATIONAL DOCTRINE                                 |
+---------------------------------------------------------------+
| Official ADD            5                                     |
| Naive computed          6                                     |
+---------------------------------------------------------------+
| Reading 1 (official)    rotational atoms count once per       |
|                         continuous rotation; spin + osis      |
|                         share a single rotational frame       |
| Reading 2 (naive)       each ADD-bearing token contributes    |
|                         independently regardless of frame     |
+---------------------------------------------------------------+
| Adjudication            mechanism, not weight (see §9.X)      |
| Status                  resolved; official reading governs    |
+---------------------------------------------------------------+
```

The conflict card *teaches the doctrine* by exhibiting the conflict; it does not adjudicate in prose alone.

### 7.5 Cross-references

§8 cross-references §7 (notation) for token-counting and §9 (symbolic composition) for the "mechanism, not weight" framework. The three sections together form the ADD pedagogy.

---

## 8. Doctrine / conflict presentation model

### 8.1 The doctrine note primitive

Doctrine notes can appear in derivation panels (§5), in §8.7 conflict cards, in family cards (§5 Families), or in modifier cards (§6 Modifiers). The format is consistent:

```
+---------------------------------------------------------------+
| [doctrine] short title                                        |
+---------------------------------------------------------------+
| Reading A     one-line statement                              |
| Reading B     one-line statement                              |
| Mechanism     one-line statement of what differs              |
| Status        resolved / policy-dependent / historical        |
| (optional)    expandable prose for context                    |
+---------------------------------------------------------------+
```

### 8.2 What doctrine notes do not do

- They do not editorialize ("we believe", "in our view"). They state the readings and the mechanism.
- They do not bury history. When a doctrine has shifted, the history is in expandable prose, not in the headline.
- They do not surface unresolved curator work as if it were settled. Open conflicts stay out of the main glossary (curator decision).

### 8.3 Color and emphasis

Doctrine notes use a muted background tone (same family as `[advanced]` panels) with a distinct left border accent. They never use red, alert iconography, or warning language. A doctrine is not an error; it is a *fact about the system* worth knowing.

---

## 9. Symbolic-compression teaching strategy

Symbolic compression is no longer a corner topic in §9; it is one of the three load-bearing concepts (alongside notation and ADD).

### 9.1 The four locutions

Per memory `project_semantic_compression_doctrine`:

| Locution | Verb | What it asserts |
|---|---|---|
| Canonically defined | "is" | The community-named structural form |
| Commonly read | "reads as" | Widely-accepted equivalent reading |
| Structurally expandable | "expands to" | Deeper semantic decomposition |
| Parser-derived | "parses as" | Operational-notation output |

§9 teaches these verbs explicitly. Every derivation panel in the glossary uses them; readers learn the distinction by repeated exposure.

### 9.2 Compression as a literacy skill

§9 includes a short pedagogical sequence that walks the reader from a fully-expanded operational formula down to the compressed community name and back up again:

```
Deep:         spinning same-side miraging osis
                ↓ (compress same-side miraging osis → torque)
Expanded:     spinning same-side torque
                ↓ (compress spinning same-side torque → gyro torque)
Semantic:     gyro torque
                ↓ (community shorthand)
Compressed:   mobius
```

Then upward:

```
Compressed:   mobius
                ↑ (decompress to community-readable form)
Semantic:     gyro torque
                ↑ (decompress to structural form)
Expanded:     spinning same-side torque
                ↑ (decompress to fully explicit form)
Deep:         spinning same-side miraging osis
```

Lesson: **multiple readings coexist legitimately**. Shortest readable form wins socially; deeper expansions preserve structure. Neither is "the right answer".

### 9.3 Compression cards -- distributed surfacing

Compression cards are a presentation primitive showing a single trick in all locutions side by side. Per curator decision: §9 is the **primary home**, AND compression cards are linked or rendered in:

- **Major trick entries** (§5, §6) -- mobius would feel incomplete without its compression ladder
- **Major modifier entries** (§6) -- modifiers that participate in compression (paradox → blurry compression) carry a card
- **Family anchors** (§5) -- each Root family gets one canonical compression example
- **§7 notation** -- after the canonical-example battery, compression cards show the depth ladder for selected examples
- **§11 topology** -- when compression explains a topology relationship

Compression is not an isolated concept. It is a property of the whole movement language. The card surfaces everywhere the property is load-bearing.

### 9.4 Initial compression-card set

- mobius (gyro torque ≡ spinning same-side torque ≡ spinning same-side miraging osis)
- blurry (stepping paradox ≡ blurry; the canonical symbolic-compression example)
- terraging (terraging ≡ double pixie)
- barraging (barraging ≡ high stepping)
- sailing (sailing ≡ pixie illusion)
- paradox double legover (the paradox-stack reading)
- nuclear (the resolved nuclear chain)
- symposium (the multi-axis compression)

---

## 10. Equivalence-chain rendering

### 10.1 The equivalence-chain primitive

Equivalence chains are a distinct presentation primitive from compression cards. A compression card shows one trick at multiple locutions. An **equivalence chain** shows two or more *separately named* tricks that are structurally equivalent:

```
+---------------------------------------------------------------+
| Equivalence chain                                             |
+---------------------------------------------------------------+
| blurry        ≡  stepping paradox            [historical]     |
| terraging     ≡  double pixie                [historical]     |
| barraging     ≡  high stepping               [historical]     |
| sailing       ≡  pixie illusion              [historical]     |
| mobius        ≡  gyro torque                 [structural]     |
| paradox       ≡  op-in-dex prefix            [structural]     |
+---------------------------------------------------------------+
```

### 10.2 Source labels (curator decision)

Per curator decision, equivalence chains include both Holden corpus equivalences and curator-derived equivalences, visually distinguished by source label. Four labels:

| Label | Source | Authority |
|---|---|---|
| `[historical]` | Holden Move Sets corpus or other historical source | Authoritative; preserved exactly |
| `[curator-derived]` | Curator-approved structural equivalence not in historical sources | Authoritative; flagged as derived |
| `[community]` | Widely-used community shorthand | Observational; reflects community usage |
| `[structural]` | Derived from operator decomposition; ontologically true | Canonical structural reading |

Labels appear as a right-aligned chip on each chain row. They preserve source rigor without artificially limiting the ontology. The glossary is now an ontology surface, not merely a historical archive; if the system derives a structurally valid equivalence and the curator approves it and it is pedagogically valuable, it belongs.

### 10.3 Equivalence chains vs aliases

Aliases (the four-category alias system, memory `project_freestyle_dict_future_ia`) and equivalence chains are different objects:

- An **alias** is a name pointing at a single canonical trick record.
- An **equivalence chain** is a structural assertion that two or more *separately named* canonical objects are mechanically the same movement.

The glossary surfaces both in distinct presentation primitives so the reader sees the difference.

### 10.4 Where equivalence chains live

In §9 they are first-class content. In §7 they appear in the canonical-example battery (rows 9, 12). In §11 they appear in movement-neighborhood panels where structural equivalence explains a topology. In §8 they appear when an equivalence chain has ADD implications (two equivalent tricks should have the same ADD; when they do not, doctrine conflict surfaces).

---

## 11. Semantic-depth expansion rendering

### 11.1 The semantic-depth ladder

A **semantic-depth ladder** is a single trick rendered at multiple semantic depths in stacked form, each row independently readable:

```
# mobius
# gyro torque
# spinning same-side torque
spinning same-side miraging osis
```

Hashtag prefixes denote depth. Visual styling: each row uses the same font and weight; depth is communicated by indentation or by the `#` count, not by color or size.

### 11.2 What the ladder communicates

- All four rows are legitimate names for the same movement.
- The community uses the top row in conversation.
- The middle rows are pedagogically useful for explaining structure.
- The bottom row is what the parser produces.
- No row is "more correct" than another; they are different *depths* of the same object.

### 11.3 Where ladders live

In derivation panels (§5) the ladder is a sub-component. In §9 compression cards it is the central element. In §5 family cards the family root and its branches are shown as a ladder. In §7 the canonical-example battery shows ladders for two examples (rows 9 and 12). In §10 Run Architecture (next section), runs themselves get ladders at the *sequence* level.

---

## 12. Examples of transformed glossary entries

These are reference targets, not implementation plans.

### 12.1 Paradox (modifier)

```
+---------------------------------------------------------------+
| PARADOX                                                       |
+---------------------------------------------------------------+
| Type             modifier (operator)                          |
| ADD weight       +1                                           |
| Operator effect  inserts an op-in-dex transition before the   |
|                  base trick's terminating atom                |
| Formula          [base] → [base prefixed by OP IN [DEX]]      |
+---------------------------------------------------------------+
| Common compounds  paradox legover, paradox mirage, stepping   |
|                   paradox (≡ blurry), paradox double legover, |
|                   flurry, blurry whirl                        |
+---------------------------------------------------------------+
| Family            stacks cleanly with: stepping, double,      |
|                   spinning, ducking                           |
+---------------------------------------------------------------+
| [advanced] expandable: paradox-as-bridge prose; lineage from  |
| early-1990s naming convention; ADD-doctrine intersection      |
+---------------------------------------------------------------+
```

### 12.2 Whirl family (Root family)

```
+---------------------------------------------------------------+
| WHIRL  (Root family · 1 of 6)                                 |
+---------------------------------------------------------------+
| Atom              whirl  (continuous-rotation surface-stall)  |
| ADD               3                                           |
| Operational       (FRONT) SPIN [BOD] > CLIP [XBD] [DEL]       |
+---------------------------------------------------------------+
| Direct children   whirling X (modifier applied to any base)   |
|                   rev-whirl  (reverse direction; ADD 4)       |
|                   double-whirl  (rotational continuation)     |
+---------------------------------------------------------------+
| Branch lineage    whirl → torque (gyro family root) →         |
|                   blender, mobius, drifter                    |
+---------------------------------------------------------------+
| Compression       whirl is a foundational atom; not further   |
|                   compressible. All whirl-family compounds    |
|                   expand to "spinning [base]" with rotational |
|                   doctrine applied.                           |
+---------------------------------------------------------------+
| [observational] expandable: whirl-as-central-attractor;       |
| connector-trick behavior; cross-axis relationships            |
+---------------------------------------------------------------+
```

### 12.3 Mobius (named trick, doctrine conflict)

Already shown in §5.1 and §7.4. The two presentations are consistent: the §5 panel introduces the trick; the §8.7 conflict card explains why its ADD doctrine matters.

### 12.4 Flurry (named trick, deep operational example)

```
+---------------------------------------------------------------+
| FLURRY                                                        |
+---------------------------------------------------------------+
| Compressed       flurry                                       |
| Semantic         double paradox legover                       |
| Expanded         clip > op-in-dex > same-in-dex > op-out-dex  |
|                  > same toe                                   |
| Operational      CLIP > OP IN [DEX] > SAME IN [DEX] >         |
|                  OP OUT [DEX] > SAME TOE                      |
+---------------------------------------------------------------+
| ADD              official 4 (paradox +1 over paradox legover) |
+---------------------------------------------------------------+
| Family           legover (branch: paradox-stack)              |
| Inherits from    paradox legover (one paradox-step deeper)    |
| Related          paradox double legover · paradox legover     |
|                  · ducking flurry                             |
+---------------------------------------------------------------+
```

This entry is mostly formulas. There is no prose. The structure is the explanation.

### 12.5 Blur (named trick, P4 pilot)

```
+---------------------------------------------------------------+
| BLUR                                                          |
+---------------------------------------------------------------+
| Compressed       blur                                         |
| Semantic         stepping paradox                             |
| Expanded         paradox with a stepping operator prefix      |
| Operational      CLIP > OP IN [DEX] (STEPPING) > OP CLIP      |
+---------------------------------------------------------------+
| ADD              official 3 (paradox +1, stepping +0)         |
+---------------------------------------------------------------+
| Family           paradox-stack (branch of legover lineage)    |
| Inherits from    paradox legover; stepping legover            |
| Related          blurry (≡ blur in extended form)             |
|                  blurry whirl, blurry mirage, blurry osis     |
+---------------------------------------------------------------+
| Compression card                                              |
|   # blur                                                      |
|   # stepping paradox                                          |
|   stepping paradox legover (extended structural reading)      |
+---------------------------------------------------------------+
| Equivalence                                                   |
|   blur ≡ blurry                       [historical]            |
|   blurry ≡ stepping paradox legover   [structural]            |
+---------------------------------------------------------------+
| [observational] expandable: blur as the canonical             |
| symbolic-compression bridge; pedagogical pivot from simple    |
| modifiers to full compositional system                        |
+---------------------------------------------------------------+
```

Blur is the P4 pedagogical centerpiece. It demonstrates compression (`blur ≡ blurry ≡ stepping paradox`), modifier stacking (`paradox + stepping`), paradox doctrine, family branching, shorthand literacy, ADD accounting, and beginner recognizability all in one entry.

### 12.6 Connector trick (sequence-level entry)

```
+---------------------------------------------------------------+
| CONNECTOR -- whirl-class                                      |
+---------------------------------------------------------------+
| Function         sequence-level connector: smooths the        |
|                  transition between two ADD-distant tricks    |
|                  by inserting a rotational neutral state      |
| Examples         whirl, rev-whirl, drifter                    |
| Why these        rotational continuation atoms allow the run  |
|                  to maintain density without re-resetting     |
|                  the surface state                            |
+---------------------------------------------------------------+
| Density          connectors lower per-second ADD but raise    |
|                  the *visual* density of a run; doctrine      |
|                  trade-off (see §10.X)                        |
+---------------------------------------------------------------+
| [observational] expandable: connector-affinity topology;      |
| symbolic compression in run-reading                           |
+---------------------------------------------------------------+
```

---

## 13. Visual-connection recommendations

### 13.1 The five-axis connection

Every major derivation panel connects five axes:

- **Formula** -- operational or semantic
- **Family** -- root or branch
- **ADD** -- additive ledger
- **Lineage** -- inheritance chain
- **Shorthand** -- compressed community name

Panels render these as adjacent rows so the reader sees the connection visually without prose explaining it. Vertically adjacent rows = related views of the same object.

### 13.2 Visual conventions

- **Names are typographic:** trick name = primary heading; semantic reading = secondary heading; deeper expansions = lighter weight. Hierarchy by typography, not by color.
- **Cross-references are links, not duplications:** when an entry references another family, it links to that family's anchor.
- **Symbols are consistent:** `≡` = equivalence; `>` = sequence; `→` = expansion.
- **Badges are uppercase-sm:** `[advanced]`, `[observational]`, `[doctrine]`, `[historical]`, `[curator-derived]`, `[community]`, `[structural]`. No other badge types.
- **Doctrine is muted-tone:** doctrine notes share a visual family with `[advanced]` but with a distinct left-border accent.

### 13.3 What the reader sees on a single trick page

Seven visible rows: name, semantic ladder (two or three lines), operational formula (one or two lines), ADD ledger, family, lineage, related. The full explanation is one click away.

---

## 14. Combination / run-language migration

This section operationalizes Principle 10 (run-architecture migration) and Principle 11 (compositional continuity).

### 14.1 The architectural decision

The combinations surface at `/freestyle/combo-analysis` (shipped 2026-05-17) is the canonical *data home* for sequence-level analyses. It is the right place for actual run records, density numbers, and sequence visualizations.

The glossary §10 Run Architecture is the *explanatory home* for the sequence-level grammar that the combo page is written in. It teaches the language; the combo page exhibits the data. This is the two-surface contract applied at the sequence level.

### 14.2 §10 Run Architecture expansion

```
§10 Run Architecture
   • Overview: how runs compose from tricks
   • Sequence operators (transitions, shuffles, plant markers)
   • Connector tricks (whirl-class, drifter-class)
   • Density and per-second ADD
   • Sequence-level symbolic compression (run-reading shorthand)
   • Sick3 structure and other run-level archetypes
   • Worked run example (the centerpiece; see §14.4)
   • Compositional continuity: from trick to run
   • Cross-link: /freestyle/combo-analysis (canonical run data)
```

### 14.3 The continuity narrative

§10 opens with a paragraph framing the continuity explicitly:

> The same compositional logic that generates tricks generates runs. A trick is a sequence of operators on a single surface state. A run is a sequence of tricks on a continuously-evolving surface state. The operators, modifiers, and dexterity tokens you read in §6 and §7 do not disappear when the unit of analysis grows; they extend upward.
>
> Connectors smooth transitions between ADD-distant tricks. Modifier clusters create stylistic signatures across a run. Symbolic compression in run-reading produces the same shorthand-vs-expansion duality that compresses individual trick names. ADD aggregates across runs but with the same doctrinal subtleties (counting frame, rotational continuation, modifier stacking) that govern individual tricks.
>
> The glossary's job here is to make the continuity visible.

### 14.4 Worked run example (the centerpiece)

Per curator decision: §10 must include a worked run example with notation + density + topology + connector behavior side by side. A single excellent worked example is worth pages of prose.

Proposed example (curator to revise the specific run):

```
+---------------------------------------------------------------+
| WORKED RUN EXAMPLE -- "Symposium-into-Mobius transition"      |
+---------------------------------------------------------------+
| Compressed run    sym > whirl > mobius                        |
+---------------------------------------------------------------+
| Expanded run                                                  |
|   symposium                  (4 ADD; multi-axis composition)  |
|   ↓ whirl-class connector                                     |
|   whirl                      (3 ADD; rotational neutral)      |
|   ↓ rotational continuation into spin                         |
|   mobius                     (5 ADD; gyro torque)             |
+---------------------------------------------------------------+
| Operational run                                               |
|   CLIP > SAME IN [DEX] > OP IN [DEX] > SAME OUT [DEX]         |
|     > OP TOE                            [symposium]           |
|   > (FRONT) SPIN [BOD] > CLIP [XBD] [DEL]                     |
|                                          [whirl]              |
|   > CLIP > OP IN [DEX] > (BACK) SPIN [BOD]                    |
|     > OP CLIP [XBD] [DEL]               [mobius]              |
+---------------------------------------------------------------+
| Density           3 tricks · 12 total ADD · ~6s typical       |
|                   ≈ 2.0 ADD/s                                 |
|                   Visual density higher: rotational           |
|                   continuity reads as one extended phrase     |
+---------------------------------------------------------------+
| Topology          symposium (multi-axis) → whirl (attractor)  |
|                   → mobius (gyro family). Whirl functions as  |
|                   the topological bridge: it shares           |
|                   rotational frame with mobius (allowing      |
|                   the spin to continue) and surface state     |
|                   with symposium (allowing the clip to        |
|                   transition cleanly)                         |
+---------------------------------------------------------------+
| Connector role    whirl here is acting as a *connector*       |
|                   rather than a terminal trick. The reader    |
|                   sees how a Root-family atom serves a        |
|                   sequence-level grammatical role             |
+---------------------------------------------------------------+
| Compression       at the run level, this sequence is          |
|                   commonly compressed in conversation as      |
|                   "sym into mobius" -- the whirl is           |
|                   structurally present but semantically       |
|                   absorbed into the transition. This is the   |
|                   sequence-level analog of trick-level        |
|                   symbolic compression                        |
+---------------------------------------------------------------+
| [observational] expandable: this transition pattern occurs    |
| in [N] of the runs catalogued at /freestyle/combo-analysis;   |
| analysis of why                                                |
+---------------------------------------------------------------+
```

The reader sees in one panel: the run name, the formula at three depths, the density math, the topology reasoning, the connector role, and the sequence-level compression. The whole compositional argument is visible at once. Pages of prose collapse into a single legible artifact.

### 14.5 New presentation primitives in §10

- **Connector cards** (§12.6 example): one per connector class.
- **Density ladder:** how trick ADDs aggregate; worked example.
- **Run-reading compression ladder:** run rendered at three depths.
- **Sequence-equivalence chains:** runs structurally equivalent at the sequence level (shuffle variants).
- **Topology-of-runs panel:** observational; how movement neighborhoods predict transition likelihood.

### 14.6 Cross-references

§10 links explicitly to §6 (modifier-cluster behavior), §7 (sequence operators), §8 (run-level ADD aggregation), §9 (run-reading compression), §11 (movement-neighborhood explanations), and `/freestyle/combo-analysis` for actual run data. §6, §7, §8, §9, §11 link back to §10. The bidirectional cross-link is the wire that holds the continuity narrative together.

---

## 15. Content-preservation + redistribution strategy

### 15.1 The preservation inventory

| Existing content | Current location | Revised home |
|---|---|---|
| Family-ontology prose | scattered in §5 + §11 | family cards (§5) + observational panels (§11) |
| Movement-neighborhood narratives | §11 | §11 (kept), topology cards + expandable prose |
| Operator theory prose | §6 + §7 | operator/modifier cards (§6) + paraphrased intro (§7) |
| Notation explanations | §7 | notation reference (§7), collapsed by default |
| ADD doctrine prose | §8 + §10 (legacy) | doctrine cards (§8.7) + worked examples (§8.4-§8.6) |
| Observational insights | §11 + scattered | observational panels (§11) + expandable rows in derivation panels |
| Equivalence chains | §7 + §9 + scattered | equivalence-chain primitive (§9, §10) |
| Symbolic examples | §9 + scattered | compression cards (§9) + canonical-example battery (§7) |
| Educational prose (beginner) | §1 + scattered intros | §1 (Core Concepts), section intros (§7, §8, §9, §10) |
| Historical framing | §11 + §13 | §13 Historical Terms + expandable history panels |

### 15.2 The redistribution rule

```
existing prose block
    ↓
identify what the prose is asserting
    ↓
choose the right container:
    canonical    → derivation panel field or card field
    observational → [observational] expandable panel
    doctrine     → doctrine card (§8.7 or inline)
    pedagogical  → section intro prose (kept as prose)
    historical   → §13 entry or expandable history panel
    ↓
redistribute; preserve content; remove only redundancy
```

### 15.3 What gets deleted

- **Duplicated prose:** consolidated to one home; others link in.
- **Sprint/process language:** never belongs in canonical surfaces.
- **Speculative AI-overgenerated content:** flagged for curator review before redistribution.

Everything else is preserved.

### 15.4 The "clean but empty" anti-pattern

A failure mode is producing a beautifully-organized but content-thin glossary. This is unacceptable. The right posture: cards as the *default-visible* layer, prose as the *expandable* layer. Scanners get cards; readers get prose. The content is all still there.

---

## 16. Compositional-continuity strategy

### 16.1 The continuity chain

```
primitive operators
    ↓
atoms (foundational surface-stalls and kicks)
    ↓
modifiers (operators that transform atoms)
    ↓
named tricks (compressed operator sequences)
    ↓
families (named-trick groupings by root atom)
    ↓
branch lineages (families generated by modifier stacks)
    ↓
combinations (multi-trick sequences)
    ↓
runs (full performances with density and architecture)
```

Each arrow is a compositional step. The same operators that build tricks build runs.

### 16.2 Where the continuity surfaces

- **§1** introduces the chain in one paragraph.
- **§5** shows atom → family.
- **§6** shows modifier → trick.
- **§7** shows operator → formula at the trick level *and* at the sequence level.
- **§8** shows ADD aggregation across the chain.
- **§9** explains compression at every level.
- **§10** extends the chain into runs (the worked run example in §14.4 is the keystone).
- **§11** observes the topology that emerges.

No section "owns" the continuity. Every section reinforces it. The reader internalizes the chain by repeated exposure.

### 16.3 Educational arc

Compositional thinking is taught by the sequence of reading, not by a single section labeled "compositional thinking". The reader who works through §6 → §7 → §8 → §9 → §10 has implicitly learned the chain.

---

## 17. Observational topology -- elevation, not hiding

### 17.1 The observational corpus

- Whirl as central attractor
- Connector-trick behavior
- Branch-family lineage maps
- Movement neighborhoods + cross-axis relationships
- Modifier-affinity clusters
- Sequence-level convergence patterns
- Symbolic-compression network observations
- Topology of equivalence chains

This corpus is the upper-floor view of the compositional grammar. It is highly valuable.

### 17.2 Visual elevation, semantic clarity

- **Visual elevation:** observational panels use distinctive styling so they are *visible* as a category, not hidden in expandables-only.
- **Semantic clarity:** `[observational]` badge marks them; verb in observational content is "appears to" or "tends to", not "is".
- **Topology cards:** the existing six movement-neighborhood panels become dedicated topology cards in §11.
- **Inline pointers from canonical panels:** a one-line link from a canonical panel to the §11 topology card; the observation never lives inside the canonical panel.

### 17.3 What elevation rules out

Elevation does not mean treating observational as canonical. It means giving it a clear home, identity, and cross-links. Readers always know which layer they are reading.

---

## 18. Risks + non-goals

### 18.1 Risks

| Risk | Mitigation |
|---|---|
| "Clean but empty" oversimplification | Principle 9 explicit; §15 inventory tracks every existing block to a new home |
| Parser-aesthetic overload | Principle 14 re-asserted; derivation panels are text-mode rows; no AST drawings, no token soup |
| Glossary growing beyond navigability | 14-section spine cap holds; new content goes into expandable panels and §10 subsections |
| Doctrine cards reading as "open issues backlog" | Curator decision: resolved only in main glossary; §8.7 framing is *teaching the doctrine* |
| Formula notation diverging between sections | Consistent conventions in §13.2; same symbols and casing everywhere |
| Sequence-level grammar duplicating /freestyle/combo-analysis | §14.1 two-surface contract; §10 teaches, combo page exhibits |
| Observational content overshadowing canonical | Principle 7 stands; visual hierarchy keeps canonical primary |
| Public-facing prose leaking sprint/process language | `feedback_public_facing_prose` applies; all redistributed prose passes the hygiene filter |
| Worked run example feeling cherry-picked | Curator selects the example; further examples in `show more` reservoir |
| Compression-card distribution becoming visual noise | One canonical compression card per relevant entry, not multiple; reservoir holds the rest |

### 18.2 Non-goals

- Not a full rewrite. Existing content is preserved.
- Not a parser surface. The glossary explains the grammar; it is not syntax-highlighted.
- Not a replacement for the dictionary.
- Not a replacement for `/freestyle/combo-analysis`.
- Not an audit tool.
- Not a Red-ruling exposure surface. Open Red questions stay behind the consultation track unless explicitly approved.

---

## 19. Phased implementation suggestion

P1/P2/P3 from the 2026-05-19 design shipped. This revision proposes P4/P5/P6.

### P4 -- Derivation primitives (pilot)

Build the partials:
- Derivation panel
- Compression card
- Equivalence chain (with source-label chip)
- Semantic-depth ladder
- Doctrine note

Apply to the **P4 pilot set:** mobius + blur + paradox + whirl + flurry.

This compact testbed demonstrates root families, branch families, compression, semantic-depth ladders, doctrine conflicts, operational notation, ADD derivation, equivalence chains, modifier inheritance, and lineage expansion -- nearly the whole system in miniature.

Blur is the centerpiece: probably the single best pedagogical bridge between simple tricks and the full compositional system.

Acceptance: one curator review of the five rendered panels confirms visual elegance and content fidelity. No content migration yet.

### P5 -- Section-by-section content migration

Walk the 14 sections in order. For each: inventory existing prose, apply §15.2 redistribution rule, insert new primitives, confirm content preservation (§15.4 anti-pattern check). Six to eight curator-review checkpoints (one per section pair). Bulk of the work.

### P6 -- Run-architecture expansion

Expand §10 into the full subsection structure. Build the worked run example (§14.4). Build connector cards. Build the density ladder, run-reading compression, sequence-equivalence chains. Wire bidirectional cross-references between §10 and §6/§7/§8/§9/§11 and `/freestyle/combo-analysis`.

Acceptance: one curator review of §10 confirms it teaches sequence-level grammar without duplicating combo-page data; worked run example reads as the centerpiece.

### Later (post-P6)

Compression cards expand from the initial set in §9.4 toward the full inventory. Equivalence chains expand from `[historical]` Holden-corpus rows toward curator-derived `[structural]` rows. Doctrine cards expand as further conflicts resolve through Red-consultation track.

---

## 20. Curator decisions (locked 2026-05-20)

| # | Question | Decision |
|---|---|---|
| 1 | Jobs intro length | Two paragraphs. Paragraph 1 = compositional insight. Paragraph 2 = modern glossary interpretation + bridge into examples. Then transition to formula → trick examples. |
| 2 | Canonical-example battery size | 10 to 12 visible by default; `show more examples` for the reservoir. Visible set covers mirage, whirl, paradox, flurry, double-dex, spinning, symposium, blur/blurry, torque lineage, and a compression example. |
| 3 | Compression cards location | Both: primary home §9, also linked or rendered in major trick entries, major modifier entries, family anchors. Compression is a property of the whole movement language. |
| 4 | Equivalence-chain sourcing | Both Holden corpus and curator-derived. Visually distinguished by source-label chip: `[historical]`, `[curator-derived]`, `[community]`, `[structural]`. |
| 5 | Run Architecture presentation | Include worked run example with notation + density + topology + connector behavior side by side. A single excellent worked example is worth pages of prose. |
| 6 | Unresolved doctrine conflicts | Resolved conflicts only in main glossary. `[policy-dependent]`, `[multiple accepted readings]`, `[historical disagreement]` allowed when officially acknowledged. Open Red-track stays behind the consultation track. |
| 7 | Ben Job attribution | Use the name. Phrasing: "articulated most famously in a foundational notation proposal by Ben Job." Notation tradition; not random attribution clutter. |
| 8 | P4 pilot set | mobius + blur + paradox + whirl + flurry. Blur is the pedagogical bridge between simple tricks and the full compositional system. |

---

## 21. Closing

The glossary is no longer a glossary. It is a compositional movement-language atlas. The refactor's job is to make that visible without losing what is already there.

The prior design solved structure. This revision sharpens identity and locks the curator decisions that govern the next phase. P4 builds the primitives. P5 migrates the content. P6 wires the sequence-level grammar in. At the end the reader who opens the glossary sees, on any page, the same thing: how the compositional language generates the object they came to read about.
