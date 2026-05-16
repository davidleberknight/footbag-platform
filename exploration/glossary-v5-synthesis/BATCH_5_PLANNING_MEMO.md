# Batch 5 — Planning & Design Memo

**Status:** planning-only. No implementation, no destructive edits. Architecture + visual-language planning for the first primarily-visual phase of the glossary v5 operationalization.

**Builds on:** Batches 1–4 ship state (operationalized 2026-05-15; v5 §1–§11 sectional spine live; §6 split into Surface A modifier feel cards + Surface B Advanced Reference; family-tree visuals + timing-clock SVG + abbreviations service-shaped).

**Reading order:** §1 + §5 for the strategic posture and restraint budget; §2 + §3 for visual grammar; §4 for topology expansion; §8 for sequencing; §9 for risks.

---

## §1. Strategic posture

Batch 5 is the threshold where the glossary either matures into a calm, restrained symbolic-pedagogy surface or starts to drift into parser-aesthetic territory. The most important design discipline carried forward from Batches 1–4 is **restraint as identity**: the glossary currently feels unusually calm for the density of educational material it carries, and that calm is load-bearing.

### What Batch 5 must NOT become

- A parser UI. No AST visualizations, no tokenizer traces, no grammar trees.
- A formal-grammar specification surface. Notation is taught as a *readable language*, not a typed grammar.
- A diagram catalog. Every visual element must earn its place against the existing visual budget (§5).
- A reference for symbolic-system insiders. Beginner readers must still be able to ignore symbolic surfaces.
- An ontology dashboard. Operator stacking is pedagogical here; ontology lives in the dictionary + memory.

### What Batch 5 must remain

- **Movement-first.** Every symbolic element should refer to a felt-mechanism reader can identify in a video. Symbols aid intuition; they don't replace it.
- **Layered.** A beginner reading §1–§4 should be unaffected by changes to §5–§9. The advanced layer expands; the primer stays untouched.
- **Compositional, not formal.** The language compresses recurring structures into shorter readable names. Surface that mechanism; don't impose a grammar on it.

### Doctrine echo: mechanism over weight

The 2026-05-15 Red rulings established that the strongest adjudications answer with *mechanism* (blurry expands to stepping + paradox; atomic carries X-dex character) rather than *weight* (blurry +2 / far +1). Batch 5 should mirror this discipline at the visual layer: visual elements should reveal *mechanism* (operator stacking, role persistence, base anchoring), not *math* (ADD totals, weight chips). ADD chips can appear but must remain subordinate to the structural reading.

---

## §2. Symbolic compression — visual redesign

### §2.1 Current state assessment

The glossary §8 compression flow currently renders three stacked cards (`#osis` / `#torque` / `#mobius`) with `≡` readings as role-classified `notation-token` spans. The cards are CSS-tokenized but the visual story they tell is weaker than the language they're teaching. Specifically:

- The flow is vertical but doesn't visually *show the build*. A reader sees three independent cards rather than a single substitution sequence.
- The role-coloured spans are present but small; they don't pop against surrounding prose enough to read as a teaching device.
- The "what got added between cards" is implicit. The arrow tells you the cards are sequential; it doesn't tell you *what operator the next card adds*.
- There is no visual anchor that persists across cards. The base trick (`osis`) is named in all three readings but is not visually identified as the load-bearing element.

### §2.2 Pedagogical patterns the redesign should teach

Three patterns the visual must convey:

1. **Compression** — the language has multiple legitimate names for the same trick at different stopping depths. Short forms are the community's preferred surface; long forms are the structural reading.
2. **Persistent structure** — the base anchor (osis, mirage, butterfly) is invariant through the chain. Modifiers stack onto a fixed structural element. Readers should *see* the anchor persist.
3. **Operator stacking, not operator multiplication** — each compression step *adds one* operator. The growth is linear, not combinatorial. The visual should show "one operator added per step" explicitly.

### §2.3 Proposed visual grammar

**Operator-chip ladder** is the recommended shape. Each compression step renders as a horizontal line of small operator chips, with the rightmost element being the base anchor. Between steps, an explicit substitution arrow names the operator being added.

Design elements:

- **Chip shape:** flat rectangle, no border (or 1px subtle border in a tone near the chip's role colour). Inline with prose-line height. No rounded corners; rounded chips read as buttons.
- **Chip role colours:** four roles maximum (see §3.4 saturation rules):
  - Base / anchor: core-family green (`#7f9a6b` — matches the existing notation `notation-core-family` colour)
  - Modifier: modifier olive (`#b5a85a` — matches `notation-modifier`)
  - Rotation / direction: rotation orange (`#c08a55` — matches `notation-rotation`)
  - Side / positional: neutral grey (`#8a8470` — matches `notation-side`)
- **Role persistence visual cue:** the base-anchor chip carries a thin underline (1px, role colour) that extends from the leftmost chip in the longest reading. This is the "this is the structural element everything else stacks onto" cue.
- **Substitution arrow:** simple `↓` glyph with a small text label naming the added operator. No animation, no expanding box.
- **ADD chip:** small monospaced numeric (◆N) at the right end of each reading, in subdued grey. Visually subordinate.

### §2.4 Worked-example sketches

**Example 1 — Mobius family (osis → torque → mobius).** The flagship compression chain.

```
                                              ◆ 3
   osis ───────────────────────────────────       #osis
   ────                                          (base anchor)


    ↓  + miraging (+1)


                                              ◆ 4
   miraging   osis ───────────────────────       #torque
              ────                              (= miraging osis)


    ↓  + spinning  + ss (+1)


                                              ◆ 5
   spinning   ss   miraging   osis ─────────    #mobius
                              ────              (community shorthand)
                                                spinning ss torque
                                                spinning ss miraging osis
```

The base-anchor underline persists; each row adds operators to the left. The two alternative readings on the mobius row teach that the same trick has multiple legitimate stopping depths.

**Example 2 — Mirage family (mirage → paradox mirage → fury).** A second compression chain that doesn't go through `osis`; demonstrates that the pattern generalizes.

```
                                              ◆ 2
   mirage ──────────────────────────────────       #mirage
   ──────                                          (base anchor)


    ↓  + paradox (+1)


                                              ◆ 3
   paradox   mirage ────────────────────────       #paradox-mirage
             ──────                                 (compositional)


    ↓  + furious (+2)


                                              ◆ 5
   furious   paradox   mirage ──────────────       #fury
                       ──────                       (community shorthand)
                                                    furious paradox mirage
```

**Example 3 — Cross-example density progression (butterfly → ripwalk → blurry whirl).** A different pedagogical pattern: not same-anchor compression but progressive modifier-density across three readings, teaching the *stepping + paradox* expansion mechanism.

```
   butterfly ───────────────────────────────       #butterfly  ◆ 3
   ─────────                                       (one anchor)

   stepping   butterfly ────────────────────       #ripwalk    ◆ 4
              ─────────                             (1 modifier)
                                                   = stepping butterfly

   stepping   paradox   whirl ──────────────       #blurry-whirl  ◆ 5
                        ─────                       (2 modifiers,
                                                     different anchor)
                                                   blurry whirl
                                                   = stepping paradox whirl
```

This third example carries an additional teaching value: it surfaces that `blurry` is folk-shorthand for `stepping + paradox`. The pattern is the same operator-stacking visual but with a different anchor on the third row, teaching that compression isn't only along a single base.

### §2.5 What this should NOT look like

- **Not a parser tree.** No left-recursive nesting; no AST brackets; no labelled production rules.
- **Not a state machine.** No transition labels with conditional guards; no cycles.
- **Not an arithmetic formula.** ADD values stay subordinate; the visual story is structural, not numeric.
- **Not interactive.** No hover-to-expand, no click-to-decompose. Static SVG / HTML only. Interaction risks turning the surface into a notation IDE.

### §2.6 What stays text

The thesis sentence ("The language evolves by compressing recurring compositional structures into shorter readable symbolic forms") stays as plain prose. The post-ladder explanation ("Three names. One progression…") stays as prose. The ladder is a *visual support* for the prose, not a replacement.

---

## §3. Operator chip system

### §3.1 Chip-worthy entities

| Entity | Role | Chip | Reason |
|---|---|---|---|
| Foundational atoms (mirage, butterfly, whirl, osis, torque, swirl, legover, pickup, illusion, around-the-world, orbit, clipper-stall) | Base anchor | ✓ | Load-bearing structural element; needs persistent visual identity in ladders |
| Body modifiers (stepping, paradox, spinning, ducking, symposium) | Modifier | ✓ | Compositional grammar; teaches modifier stacking |
| Set modifiers with locked decomposition (pixie, fairy, atomic, quantum, blurry, nuclear, barraging, furious) | Modifier | ✓ | Same |
| Compositional modifiers (miraging, whirling) | Modifier | ✓ | These are the operators behind torque / blender; visually equivalent to body modifiers |
| Side / positional markers (ss, op, far, reverse) | Side | ✓ (subdued) | Earn a chip but in neutral grey; visually subordinate |

### §3.2 Non-chip-worthy entities

| Entity | Why no chip |
|---|---|
| Folk-shorthand names (blurry, sailing, surging) appearing as their *expanded form* | The chip shows the expansion; the folk name itself is a label on the result, not a chip |
| ADD values | Already rendered as small ◆N at right edge; chipping them would over-emphasize math |
| Sub-field labels ("dex window", "midtime", "ss-direction") | Glossary terms; prose-style references, not symbolic operands |
| Trick names in prose ("Atom Smasher", "Phoenix") | These are identities, not operators; chipping them obscures the structural-vs-naming distinction |
| Section anchors (#osis, #mobius) | Identity references; rendered as text with `#` prefix per the compact symbolic-object pattern |

### §3.3 Hierarchy rules

When multiple chips appear in a row, visual hierarchy follows the structural reading order (left-to-right):

1. **Set primitive** (if present) leftmost — the launch-position context
2. **Body modifiers** (paradox, ducking, spinning, etc.) next — the in-flight transformations
3. **Compositional modifiers** (miraging, whirling) next — the structural-equivalence operators
4. **Side / positional markers** (ss, op, far, reverse) — directional refinements
5. **Base anchor** rightmost — the load-bearing structural element

This matches how the notation reads as a sentence ("spinning ss miraging osis" = `spinning` + `ss` + `miraging` + `osis`).

### §3.4 Saturation rules

**Maximum four simultaneous role-colours per page.** Already in use across notation-token spans. The four are:

| Role | Hex | Visual weight |
|---|---|---|
| Core family / anchor | `#7f9a6b` | Full saturation; the only "loud" colour |
| Modifier | `#b5a85a` | Medium saturation |
| Rotation / direction | `#c08a55` | Medium saturation |
| Side / positional | `#8a8470` | Low saturation; near-neutral |

No additional colours for Batch 5. If a fifth role emerges (e.g., explicit count-bearing chips for barraging's `(dex)+(dex)`), it joins the modifier band, not its own band.

### §3.5 Typography rules

- Chip text: same body font as the rest of the page (no monospaced unless the chip is a notation-flag like `[DEX]`).
- Chip text size: **same as body text** in compression ladders; one step smaller (0.9rem) in Surface A modifier cards if chips are adopted there.
- No bold, no italic inside chips. Weight is carried by colour, not type style.
- Lowercase preserved (notation is taught in lowercase).
- Operator names spelled out (`spinning` not `SPIN`; operational notation `[BOD]` uppercase is a separate layer).

### §3.6 Spacing rules

- Chips in a ladder row: separated by **two spaces** (visually distinct gap; not packed).
- Ladder rows: one blank line between rows.
- Substitution-arrow block: `↓` glyph centred, with the arrow label on the same line. No vertical lines connecting cards.
- Maximum row width: ~60 characters of chip content. If a chain exceeds 60 chars, break into two ladders rather than wrapping a single row.

### §3.7 Interaction rules

**None in Batch 5.** Static visuals only. No hover tooltips, no click-to-expand, no animation. Interaction risks the parser-IDE aesthetic and locks Batch 5 to a specific UX framework. Defer to Batch 7+ if ever.

### §3.8 Restraint guardrails

- A chip in isolated prose is a chip too many. Chips only appear inside compression ladders, family-tree-style structural decompositions, or topology-panel notation hints. They never appear in body prose.
- A row with more than 6 chips is a row too long. Break into two ladders, or step back and reconsider whether the ladder is teaching anything that simpler prose wouldn't.
- A page with more than 3 ladders is a page too dense. The glossary surfaces compression in *one* worked example (§8); proliferating compression visuals across other sections breaks the calm.

---

## §4. Movement topology expansion

### §4.1 Inclusion heuristics for new panels

A topology-panel candidate must satisfy:

1. **Connects to ≥4 named compounds** in the live dictionary (matches the existing 6-panel richness threshold).
2. **Has observed cross-family relationships** — e.g., torque relates to mirage (= miraging osis), osis (its base), mobius (its spinning form), blender (cousin via osis). Cross-family richness is what panels are *for*; if a candidate only has same-family compounds, it belongs in the family-tree visual (§5 already shipped), not a topology panel.
3. **Pedagogical value at the intermediate level.** A reader who knows the canonical atoms but is still building modifier intuition should benefit from the panel.
4. **Doctrine stability.** Structural readings cited in the panel must be locked (no Q1/Q2/Q3/Q5/Q6 doctrine-pending entries).
5. **Operator vocabulary present in NOTATION_STYLE_GUIDE / RED_RESOLVED_CANON.** Don't surface speculative operators.

### §4.2 Candidate evaluation

Against the heuristics above:

| Candidate | Compounds (≥4?) | Cross-family? | Intermediate value? | Doctrine stable? | Verdict |
|---|---|---|---|---|---|
| Torque | ✓ (~8: torque, blender, mobius, spinning torque, blurry torque, paradox torque, mirage→torque, osis→torque) | ✓ (relates to mirage, osis, mobius, blender) | ✓ | ✓ (pt11 ruling) | **INCLUDE** |
| Butterfly | ✓ (~12: butterfly, ripwalk, dimwalk, atomic butterfly = legbeater, matador, surreal, phoenix, mind-bender, spinning butterfly) | ✓ (relates to clipper-stall, stepping family, ducking family) | ✓ (highest pedagogical value of any base) | ✓ | **INCLUDE** |
| Mirage | ✓ (~11: mirage, paradox mirage, fury, blur, atom smasher, sumo, surge, surreal, omelette = atomic illusion (related)) | ✓ (relates to paradox, atomic, illusion, stepping-paradox) | ✓ | ✓ | **INCLUDE** |
| Osis | ✓ (~7: osis, torque, blender, mobius, witchdoctor, paradox osis, spinning osis) | ✓ (relates to torque, blender, whirl-family) | ✓ | mostly (witchdoctor still Q3-touched but pre-existing in glossary) | **INCLUDE** |
| Stepping | ✓ (~9: ripwalk, dimwalk, sidewalk, bigwalk, tripwalk, blur, blurry whirl, blurry torque, food processor) | ✓ (relates to paradox via blurry-family) | ✓ but overlaps with paradox panel in blurry-family teaching | ✓ | **DEFER** — risks double-coverage with paradox panel; needs design clarity on how to split |
| Paradox-mirage (compound) | ✗ (it's a single compound, not a family anchor) | — | — | — | **REJECT** — covered inside paradox panel as a worked example |
| Atomic / quantum neighborhood | ✓ (~10: atom smasher, eggbeater, legbeater, silo, flux, matador, sumo, omelette, tripwalk, legeater, quantum mirage) | ✓ | ✓ | **NO** — Q3 doctrine pending (atomic family X-dex scope, hidden-vs-flat preservation) | **DEFER — DOCTRINE BLOCKED** |
| Rotational neighborhood (whirl/swirl/torque/dyno) | ✓ (whirl, swirl, torque, blender, dyno) | ✓ | ✓ but partially overlaps with whirl panel | unclear | **DEFER** — sub-pattern of whirl panel; reconsider when whirl panel feels insufficient |
| Midtime body modifiers (ducking/spinning/diving/weaving/zulu) | ✗ as anchors (these are modifiers, not anchors) | — | already surfaced in Surface A body cluster note | — | **NOT-A-PANEL** — better as inline cluster note (already shipped); could become an *observational cross-cut* in §9 footer prose |

### §4.3 Recommended Batch 5 expansion

**+4 panels:** torque, butterfly, mirage, osis. Brings §9 from 6 to 10 connective panels.

Cumulative panel set (post-Batch 5):
- paradox, symposium, ducking, spinning, whirl, pixie (Batches 1–4)
- torque, butterfly, mirage, osis (Batch 5)

Ten panels is at the upper edge of what feels surveyable without a TOC. Beyond 10, the panel grid risks feeling like a catalog rather than a curated set. Lock at 10 for the rest of v5; revisit only after observation.

### §4.4 Deferred candidates

- **Stepping** — Hold for Batch 6. The blurry-family teaching needs design clarity: does stepping panel surface the bluerry expansion (`stepping + paradox`) or does paradox panel surface it? Currently the modifier-feel cards on Surface A cover stepping; a topology panel for stepping would need a distinct angle (cross-family stepping use: ripwalk / sidewalk / blur / tripwalk).
- **Rotational neighborhood** — Hold; sub-pattern of existing whirl panel.
- **Atomic / quantum neighborhood** — Doctrine-blocked. Wait for Q3 + Q6 answers; the atomic family's hidden-X-dex character determines whether the panel surfaces the X-dex reading or stays flat.

### §4.5 Movement neighborhoods (observational lens)

The candidate list surfaced the question: is there a category broader than "family" (canonical) and narrower than "topology" (observational)? Proposed term: **movement neighborhood** — an observational structural-clustering distinct from canonical family.

Proposed Batch 5 introduction (single paragraph in §9 prose, not a separate visual element):

> Some tricks cluster by structural neighborhood rather than family. The atomic family compounds (Atom Smasher, Eggbeater, Legbeater) share a launch-mechanic neighborhood. The whirl-family rotationals (Whirl, Swirl, Torque) share a midtime-rotation neighborhood. The blurry compounds (Blur, Blurry Whirl, Food Processor) share an operator-expansion neighborhood. These are observational lenses, not canonical classifications; the dictionary remains the authoritative family taxonomy.

This sits inside §9 (Movement Topologies — Observational) and does not add a new visual surface. It names the concept so future panels can reference it without inventing terminology ad-hoc.

---

## §5. Visual hierarchy & restraint — the load-bearing section

The single most important section of this memo. If Batch 5 ships visual elements that violate the restraint discipline, the glossary loses its identity.

### §5.1 Visual budget per page

The glossary as a whole must remain *scannable in 90 seconds* without overwhelming a beginner. Per-page visual element budget:

| Element type | Maximum count per page | Current count | Headroom |
|---|---:|---:|---:|
| Inline SVG diagrams | 3 | 1 (timing clock) | +2 |
| Operator-chip ladders | 1 worked example | 0 (current §8 is text) | +1 (the Batch 5 redesign) |
| Topology panel grid | 1 (the existing §9) | 1 (6 panels) | 0 (expand within; don't add new grid) |
| Family-tree visuals | 1 (the existing §5) | 1 (4 pilot trees) | 0 |
| Compression-flow cards | 1 worked example | 1 (current vertical stack) | 0 (replace with ladder; don't stack) |

Translation: Batch 5 adds **one** new visual element (the operator-chip ladder), upgrades **one** existing element (compression-flow cards become a ladder), and expands **one** existing element (§9 panels: 6 → 10). It adds zero net new visual surfaces.

### §5.2 Color budget

Four role colours maximum. Already in use. Batch 5 does not introduce a fifth.

If a structural concept that emerges from Batch 5 *seems* to need a fifth colour (e.g., "count-bearing operators like barraging") — the answer is to nest it within an existing colour band, not to expand the palette.

### §5.3 Chip density limits

Per §3.8:
- Max 6 chips per row in a compression ladder.
- Max 1 ladder per surface (only §8 has a ladder).
- Chips never appear in body prose.

### §5.4 Diagram complexity limits

- Inline SVG only; no external assets.
- Maximum 5 nodes per diagram (matches the timing-clock five-beat structure).
- Flow direction = top-down OR left-right only (not both within one diagram).
- No labelled edges except the timing-clock phase labels (which are baseline labels, not transition annotations).
- No nested diagrams.

### §5.5 Spacing philosophy

Whitespace is information. Visual elements need *room* to read as deliberate. Specifically:

- A new visual element gets at least **1.5rem** of vertical space above and below.
- Compression ladder rows are separated by **a full row** of whitespace, not packed.
- Topology panels in the §9 grid use the existing grid gap (already restrained at ~1.25rem); do not tighten when adding 4 more panels.
- If a page feels visually full, the answer is more whitespace, not fewer elements (the elements are already at budget).

### §5.6 When NOT to visualize

A visualization decision should default to "no" unless the content meets at least two of:

- The structural pattern repeats across ≥3 examples in the glossary
- The pattern teaches *mechanism*, not *taxonomy*
- The pattern reduces, not increases, the cognitive load for a beginner reader scanning the page
- The pattern is doctrine-stable

Concretely, do NOT visualize:

- **Single-step compositions.** "Paradox Whirl = paradox + whirl" is a one-step compound; the existing prose handles it. No diagram needed.
- **Singleton concepts.** Reference entries for individual terms (cross-body, dex window, hippy/leggy) are prose-defined; chipping them would over-emphasize.
- **Cross-reference lists.** "See also: paradox, symposium, ducking" stays as inline links, not a diagram.
- **Math relationships.** ADD totals visible as chips, but no graphical math (no arrow-from-modifier-to-ADD-chip). Math stays subordinate.
- **Cross-family relationships that aren't structural.** Subjective "feel" connections (e.g., "whirl-family tricks often act as connectors") stay as prose observations; they don't earn a diagram.
- **Doctrine-pending readings.** Atomic family's hidden-X-dex character (Q3-pending) does not get visualized yet. If Q3 settles to universal-scope, revisit in Batch 6.

---

## §6. Canonical vs observational surfaces

### §6.1 Four surface modes

The glossary now juggles four content modes:

| Mode | Authority | Voice | Where on the live glossary |
|---|---|---|---|
| **Canonical** | Curator / Red ruling | "is X" / "is canonically defined as Y" | Dictionary surface; §10 Traditional Reference |
| **Educational** | Curator-authored teaching | "is commonly read as Y" | §1–§7 primer; §6 Surface A feel cards |
| **Observational** | Symbolic-grammar analysis | "structurally expandable to Y" / "shares neighborhood with" | §8 compression flow; §9 topology panels |
| **Exploratory** | Curator hypothesis | "may be read as" / "under community review" | (Not currently on live glossary; would require alpha-badge convention if introduced) |

### §6.2 Visual distinction strategy

The four-mode distinction is currently uneven:

- Observational mode has a badge (`symbolic-layer-badge` in §9 + §11).
- Educational mode has tier badges (Beginner / Intermediate / Advanced Reference) at section level.
- Canonical mode has no badge (it's the default).
- Exploratory mode has no badge or visual surface yet.

For Batch 5, formalize:

1. **Canonical mode** stays unmarked. Prose default; verb level 1 ("is").
2. **Educational mode** keeps tier-badge convention. Verb level 2/3 ("is commonly read as" / "structurally expandable to"); the compression-ladder visual is educational-mode work.
3. **Observational mode** keeps the observational badge in §9 + §11. Additionally, the proposed "movement neighborhoods" paragraph (§4.5) sits inside §9 to inherit the badge.
4. **Exploratory mode** — defer. If a future Batch 6+ introduces exploratory content (e.g., curator-hypothesized topology relationships), it'll need an alpha badge convention. Don't introduce now; no need yet.

### §6.3 Verb discipline integration

Per `SEMANTIC_COMPRESSION_DOCTRINE.md` §3, the four locution levels map to the four surface modes:

| Mode | Verb level | Example |
|---|---|---|
| Canonical | 1 | "Blender is Whirling Osis" |
| Educational | 2 | "Mobius is commonly read as Spinning Torque" |
| Observational | 3 | "Mobius structurally expandable to Spinning ss Miraging Osis" |
| Parser-diagnostic (curator only) | 4 | "Atom Smasher parses as self-atom" |

The compression-ladder visual sits in Observational mode. Its prose around the ladder should use Level-3 verbs uniformly. The current glossary §8 prose mixes Level-1 ("decompresses to") and Level-3 phrasing; Batch 5 verb-tighten is in-scope for the ladder redesign.

Doctrine constraint: do **not** flip verbs uniformly to either Level-1 ("compresses to") or Level-3 ("can be read as") before Round-2 Q5 settles. The current mixed phrasing is acceptable as alpha; the locked verb discipline lands when Q5 returns.

---

## §7. Movement-feel topology — future research

### §7.1 Six candidate family lenses

The user's brief surfaced six possible movement-feel categories. Each evaluated:

| Lens | Definition | Educational value | Subjectivity | Surface fit |
|---|---|---|---|---|
| **Rotational families** | Whirl, swirl, torque, blender; tricks whose midtime carries the bag in rotation | High | Low (structural) | Glossary §9 (could be a neighborhood paragraph) |
| **Compressed families** | Blurry, sailing, atomic-as-folk; named single-tokens that expand to multi-operator structures | High | Low (doctrine-grounded) | Glossary §9 movement-neighborhoods paragraph |
| **Flowing families** | Tricks that pair well as connectors in continuous-flow runs | Moderate | High (subjective, performance-bound) | Not glossary — better in a future routine-analysis surface |
| **Technical-density families** | Modifier-heavy compounds (gauntlet, montage, surreal, fury) | Moderate | Moderate | Marginal — could be a worked example in §6 advanced modifier prose; not a panel |
| **Connector families** | Whirl-led / ducking-led / drifter-led tricks commonly used to maintain flow | Moderate | High | Not glossary — routine-analysis territory |
| **Uptime-heavy / symposium-heavy structures** | Tricks whose distinctive density lives in the uptime (atomic / quantum / blurry treatments) or in the symposium-stacked compounds | Moderate-High | Low (structural) | Glossary §9 movement-neighborhoods paragraph (could be a sub-lens) |

### §7.2 Educationally valuable vs subjective assessment

**Keep in glossary scope (low subjectivity, structural):**
- Rotational neighborhood
- Compressed-family neighborhood (the operator-expansion lens)
- Uptime-heavy / symposium-heavy neighborhood
- Midtime body modifiers neighborhood (already shipped inline in Surface A cluster note)

**Defer to a non-glossary surface (subjective, performance-bound):**
- Flowing families
- Connector families
- Technical-density families (could be a worked-example block in Surface B prose if needed)

### §7.3 Glossary vs insights vs dictionary placement

| Concept type | Placement |
|---|---|
| Canonical families (whirl family, butterfly family) | Dictionary `trick_family` axis; family-tree visuals in §5 |
| Movement neighborhoods (rotational, compressed, midtime, uptime-heavy, symposium-heavy) | Glossary §9 observational paragraph + possibly future panel labels |
| Routine-analysis lenses (flowing, connector, technical-density) | A future routine-analysis surface (not currently scoped); definitely not glossary |
| Topology-axis observations (X-dex variants, cross-body family, stepping-paradox compounds) | Glossary §9 panels (current 6 + Batch 5 +4) |

The discipline: glossary stays *structural*. Subjective performance-lenses go elsewhere.

---

## §8. Sequencing recommendations

### §8.1 Safe now (Batch 5 scope)

| Item | Why safe |
|---|---|
| Symbolic compression flow redesign as operator-chip ladder (§2) | Visual budget allows it; doctrine stable for the three worked examples; pedagogically high-leverage |
| Topology panel expansion +4 (torque, butterfly, mirage, osis) | All four anchors meet inclusion heuristics; doctrine-stable; visual budget allows it |
| Visual restraint budget codified as a glossary-style note | Architecturally needed; doctrine-stable; protects future batches |
| Canonical/educational/observational mode formalization in prose | Already partially in place; extending is low-risk |
| Movement-neighborhoods paragraph in §9 prose (no new visual) | Adds vocabulary without adding visual elements; ties subsequent work together |

### §8.2 Hold (Batch 6+)

| Item | Reason for hold |
|---|---|
| Operator chips inside Surface A modifier feel cards | Surface A is intentionally prose-first; chips would change its identity. Revisit if reader feedback indicates a need. |
| Stepping topology panel | Risk of double-coverage with paradox panel in the blurry-family teaching. Needs design clarity. |
| Interactive compression flow (hover-to-expand, click-to-decompose) | Parser-IDE aesthetic risk. Static visuals only for v5. |
| Exploratory-mode visual surface (alpha-badge convention) | No content needs it yet. Don't introduce conventions speculatively. |
| Family-tree visual upgrade with topology overlays | Family trees are family-tier; topology is observational-tier. Mixing the surfaces obscures the layer distinction. |

### §8.3 Doctrine-blocked (waiting on Round-2 Red answers)

| Item | Doctrine dependency |
|---|---|
| Atomic / quantum neighborhood panel | Q3 (atomic family X-dex scope) — determines whether the panel surfaces the hidden-X-dex reading or stays flat |
| Verb discipline lock on compression-flow prose ("compresses to" vs "can be read as") | Q5 (compression intent: intentional vs retrospective) |
| Atom Smasher / Eggbeater / Legbeater hidden-structure rendering | Q6 (hidden vs flat structure preservation in named compounds) |
| Fairy as an operator chip (modifier weight + role assignment) | Q4.C (Fairy-as-modifier ADD weight + Q4 operator-vs-trick role doctrine) |
| Furious chip — count-bearing vs flat-modifier rendering | Q2 (barraging operator class + furious-as-count parallel) |

### §8.4 Future research

| Item | Why future |
|---|---|
| Movement-feel routine-analysis surface (flowing / connector / technical-density) | Outside glossary scope; would need a new educational surface |
| Interactive symbolic surfaces | Current architecture is no-client-JS; would need progressive-enhancement scaffold |
| Animated compression flow | Static-only discipline in current v5; revisit only if static teaching demonstrably fails |
| Operator-relationship graph visualization | Risk of becoming a parser IDE; needs a years-long observation window before reconsidering |
| Cross-batch SCALE prose draft archive viewer | Already in `_archive/2026-05/`; if needed, a separate maintenance surface, not glossary |

---

## §9. Danger / risk analysis

### §9.1 Top risks

1. **Visual saturation creep.** Each batch adds elements. Without enforced budgets, the glossary loses its calm. Severity: high.
2. **Operator-chip parser drift.** Chips with hover tooltips, expandable rows, or animated transitions read as a notation IDE. The aesthetic shift is hard to reverse once shipped. Severity: high.
3. **Topology panel proliferation.** Each new panel costs cognitive load. 10 panels feels surveyable; 12+ feels like a catalog. Severity: medium.
4. **Doctrine-pending visual commitment.** Locking visual verbs ("compresses to" prominently in the compression ladder) before Q5 settles could require a redesign if Q5 picks retrospective interpretation. Severity: medium.
5. **Cross-family / neighborhood confusion.** "Movement neighborhoods" overlap with families and topologies. Without crisp definitions, readers conflate them. Severity: medium.
6. **Exploratory-mode introduction debt.** If Batch 5 introduces exploratory content without an alpha-badge convention, future batches inherit the inconsistency. Severity: low (only triggers if exploratory content is added — which §8.2 says no).
7. **Color-budget inflation by request.** Inevitable curator pressure to add a fifth role colour for one specific pedagogical use. Once added, it doesn't come back. Severity: medium.

### §9.2 Mitigations

1. **Visual saturation:** This memo's §5 budget is the mitigation. Codify in `legacy_data/CLAUDE.md` archive-governance-adjacent location AND in the v5 architecture spec at `exploration/glossary-v5-synthesis/`.
2. **Operator-chip drift:** Lock "static only" as a Batch 5 forever-rule. No hover, no click, no animation. The ladder is HTML/CSS only.
3. **Topology proliferation:** Cap at 10 panels for the rest of v5. Memorialize in this memo §4.3.
4. **Doctrine-pending visuals:** Use Level-3 verbs ("structurally expandable to") universally in the ladder; revisit when Q5 settles.
5. **Cross-family confusion:** Define "movement neighborhood" in one sentence in §9 prose (per §4.5). Tie back to "family is canonical; topology is observational; neighborhood is observational-structural lens."
6. **Exploratory mode:** Don't introduce. Defer to a future batch with explicit need.
7. **Color-budget inflation:** When the request lands, redirect to: "Use an existing role colour; if structurally distinct, propose nesting within the modifier band; if neither works, defer." The four-colour limit is curator-protected.

### §9.3 Stop conditions

If any of the following occur during Batch 5 implementation, STOP and revisit this memo:

- User feedback says "the glossary feels busy" or "I lose track of the structure"
- A new panel is being added that doesn't satisfy all 5 inclusion heuristics (§4.1)
- A visual element requires hover / click / animation to be intelligible
- A fifth role colour is being introduced
- Compression-ladder verbs are being changed to Level-1 ("compresses to") before Q5 returns
- A "subjective" topology (connector families, flowing families) is being proposed for glossary inclusion

### §9.4 Success signals

Concrete signals that Batch 5 succeeded:

- A beginner can read §1–§4 unchanged and not notice the symbolic additions.
- A curator can describe the compression-ladder visual in one sentence to a third party.
- The §9 panel grid feels curated, not catalogued (test: can a reader recall which panels exist after a 30-second scan?).
- No "what does this chip mean?" curator-side confusion in the 4 weeks following ship.
- The verb discipline is consistent: Level-1 prose around canonical entries, Level-3 prose around observational visuals.

---

## §10. Plaintext mockup gallery

Three compression-ladder mockups + two topology-panel mockups, in increasing aesthetic restraint. The final shipped form should land closer to mockup 3 of each.

### §10.1 Compression ladder — mobius (3 variants)

**Mockup A — Bracket-heavy (REJECT; too parser-flavoured):**

```
┌──────────────────────────────────┐
│ [osis ◆3]                        │   #osis
└──────────────────────────────────┘
            │
            │  + miraging
            ▼
┌──────────────────────────────────┐
│ [miraging] [osis ◆3]             │   #torque ◆4
└──────────────────────────────────┘
            │
            │  + spinning + ss
            ▼
┌──────────────────────────────────┐
│ [spinning] [ss] [miraging] [osis │   #mobius ◆5
│  ◆3]                             │   (community shorthand)
└──────────────────────────────────┘
```

Too many boxes. Reads as parser AST. Reject.

**Mockup B — Middle-ground (acceptable; what current glossary roughly does):**

```
#osis                                                          ◆ 3
osis

   ↓ + miraging

#torque                                                        ◆ 4
miraging  osis        (≡ miraging osis)

   ↓ + spinning  + ss

#mobius                                                        ◆ 5
spinning  ss  miraging  osis        (≡ spinning ss torque,
                                       ≡ spinning ss miraging osis)
```

Reasonable. Misses the "persistent anchor" visual cue. Acceptable as fallback.

**Mockup C — Recommended (RESTRAINED; preserves identity):**

```
osis                                                           ◆ 3
────                                                          #osis

       ↓ + miraging

miraging   osis                                                ◆ 4
           ────                                               #torque

       ↓ + spinning   + ss

spinning   ss   miraging   osis                                ◆ 5
                           ────                               #mobius
                                                              (community shorthand)
```

The underline on the base anchor (osis) persists across all three rows; modifiers stack to its left; ADD chips sit subordinately at right; substitution arrows name the added operator explicitly. The chip-role colouring (in actual implementation) would carry: `osis` core-green, `miraging`/`spinning` modifier-olive, `ss` neutral-grey. No box, no border, no bracket. **Recommend.**

### §10.2 Compression ladder — fury

Same pattern; different base.

```
mirage                                                         ◆ 2
──────                                                        #mirage

       ↓ + paradox

paradox   mirage                                               ◆ 3
          ──────                                              #paradox-mirage

       ↓ + furious

furious   paradox   mirage                                     ◆ 5
                    ──────                                    #fury
                                                              (community shorthand)
```

Note: `furious` ADD is +2 rotational on mirage per pt6, so the ladder adds 1 step to ADD between paradox-mirage(3) and fury(5). This is correct doctrine; the visual just shows the operator addition.

### §10.3 Cross-example density progression — butterfly / ripwalk / blurry whirl

This is a DIFFERENT pedagogical pattern: not same-anchor compression. Shown to demonstrate the operator-stacking visual generalizes to non-chain cases.

```
butterfly                                                      ◆ 3
─────────                                                     #butterfly

stepping   butterfly                                           ◆ 4
           ─────────                                          #ripwalk
                                                              (≡ stepping butterfly)

stepping   paradox   whirl                                     ◆ 5
                     ─────                                    #blurry-whirl
                                                              (≡ stepping paradox whirl,
                                                                 ≡ blurry whirl)
```

The third row's anchor is `whirl`, not `butterfly`. The base-underline cue still applies (each row underlines its own base). The teaching is: "blurry is folk-shorthand for stepping + paradox; you can see the stacking pattern reused across different anchors."

### §10.4 New topology panel — torque (observational)

Mockup of one of the 4 new panels. Format matches existing §9 panels.

```
Torque                                                  [observational]
─────────────────────────────────────────────────────────────────────
A rotational compound base: miraging applied to osis.
Structurally readable as "miraging osis"; widely used as its own
named base in compounds.

Used in these tricks
   • blender = whirling osis            [3-ADD]
   • mobius = spinning torque           [5-ADD]
   • blurry torque = stepping paradox torque    [6-ADD]
   • paradox torque                     [5-ADD]

Related symbolic groups
   rotational-midtime · osis-base · miraging-modifier

Notation hint
   [DEL] CLIP after midtime rotation; structurally
   identical to "miraging osis"

Learn more about Torque → /freestyle/modifier/torque-family
```

### §10.5 New topology panel — butterfly (observational)

```
Butterfly                                                [observational]
─────────────────────────────────────────────────────────────────────
A wing-motion atomic base: out-dex to clipper. The densest
family-anchor in the dictionary; modifier-stacking reference.

Used in these tricks
   • ripwalk = stepping butterfly         [4-ADD]
   • dimwalk = pixie ss butterfly         [4-ADD]
   • legbeater = atomic butterfly         [4-ADD]
   • matador = nuclear butterfly          [5-ADD]
   • phoenix = pixie ducking butterfly    [5-ADD]
   • mind-bender                          [6-ADD]
   • surreal = surging paradox whirl      [6-ADD; relates by stepping]

Related symbolic groups
   wing-motion · clipper-base · stepping-bridge · pixie-bridge

Notation hint
   [DEL] CLIP after midtime; out-dex character; ss-direction
   implicit when clipper-led

Learn more about Butterfly → /freestyle/modifier/butterfly-family
```

### §10.6 What the mockups do NOT include

- No edit / favourite / hover / interaction controls.
- No animated arrows.
- No expandable "see more readings" toggles.
- No formal grammar production notation.
- No ADD-math arrows or formula derivations.
- No colour gradients (chip role colours are flat).
- No icons (except the existing observational badge and the simple `↓` substitution glyph).

Restraint is the design.

---

## §11. Memo close

Batch 5 is the threshold where the glossary either *graduates* into a calm, restrained symbolic-pedagogy surface or *regresses* into parser-aesthetic territory. The discipline carried forward — restraint as identity, mechanism over weight, layered audiences, movement-first language — is the asset.

The recommended scope:
- 1 new visual (operator-chip ladder, replacing the current §8 compression-flow cards)
- 4 new topology panels (§9: torque, butterfly, mirage, osis)
- 1 new prose paragraph (movement neighborhoods in §9)
- Codified visual budget (§5 of this memo as the doctrine reference)
- Verb-discipline tightening in compression-ladder prose (Level-3 throughout)

Defer or hold the rest of the candidate space.

When implementation begins, this memo's §5 (visual budget), §8 (sequencing), and §9 (risks + stop conditions) are the contract.

---

## §12. Cross-references

- [[project_glossary_v5_synthesis]] — v5 architecture; this memo plans the next operationalization phase
- [[project_freestyle_state]] — Batches 1–4 ship state; what's already on the live glossary
- [[project_semantic_compression_doctrine]] — doctrine framework for the four locution levels + three-layer architecture
- [[project_red_consultation_state]] — Wave 2 packet sent 2026-05-15; Q3 / Q5 / Q6 answers feed Batch 5 doctrine-locked items
- `exploration/glossary-v5-synthesis/GLOSSARY_V5_ARCHITECTURE.md` — the v5 sectional spine
- `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md` — full doctrine document (5 classes + 4 locution levels + 3 layers)
- `src/views/freestyle/glossary.hbs` — current live surface (§1–§11 spine post-Batch 4)
- `src/services/freestyleService.ts` — `FreestyleGlossaryContent` view-model
- `src/public/css/style.css` — existing `glossary-tier-badge*`, `symbolic-layer-badge`, `glossary-modifier-card*` patterns (Batch 5 chip system builds on these conventions)
