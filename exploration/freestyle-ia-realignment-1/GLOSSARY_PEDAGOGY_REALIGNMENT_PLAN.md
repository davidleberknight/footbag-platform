# Glossary Pedagogy Realignment — Plan

Batch 3 of the IA realignment. Generated 2026-05-14. Pre-implementation planning artifact; no code shipped from this slice. Implementation gated on maintainer approval per the user spec ("Do NOT implement immediately. Planning/mockup phase first.").

Companion to `FREESTYLE_IA_REALIGNMENT_PLAN.md`. Where the parent plan owns surface-level IA, this plan owns the **pedagogy layer** of the glossary specifically.

---

## TL;DR

Five surface-level changes to `src/views/freestyle/glossary.hbs` plus minor service-layer support for the torque/mobius teaching flow:

1. Open the glossary with a one-paragraph **teaching philosophy** stub (replaces the post-Batch-1 generic intro).
2. Reframe `§8 Notation (Jobs Notation)` as **§8 Symbolic Compression** with the torque/mobius flow as the lead example.
3. Update `§9 Operational Notation` to a sharper semantic-vs-operational contrast (clear boundary, not blur).
4. Replace the `[PDX]` operational-flag wording (verbatim PassBack adaptation; same edit deferred from Batch 1 C-10).
5. Integrate seven PassBack-quality definitions (alpine, symple, muted, hippy/leggy, dex windows, trick phases, side relationships) as concise glossary entries — no walls.

Plus zero code change in this slice:
- Connective panels stay; a small in-glossary note reframes them as educational/dictionary bridges (deferred from Batch 1 C-14).
- Out-of-scope: any new operator semantics, ADD claims, Wave-1-pending readings, browse functionality.

---

## PART 1 — Glossary teaching philosophy

The glossary teaches **how the language works** — not what every trick is, not how to browse, not who holds which record. Three coherent strands:

| Strand | What it teaches | What it doesn't |
|---|---|---|
| **Vocabulary** | Contact / Set / Dex / Spin / Duck / Delay (already on landing). Mechanics of execution: hippy vs leggy, symposium vs symple vs muted, trick phases (uptime / midtime / downtime), side relationships (ss / op / far / near). | Trick rows, ADD scoring, family topology. |
| **Composition** | How operators stack onto base tricks. How modifiers transform primitives. How recurring structures compress into named shorthand. The torque/mobius flow is the flagship teaching example. | Recursive maximal decomposition. Trick browse. |
| **Shorthand readability** | What a notation token means at a glance. Why `spinning ss torque` is preferred over `spinning ss miraging osis` in practice. Why dictionary names get long and stay legible. | Browse cards. Faceted filters. |

Three things the glossary is **not**:

- **Not a dictionary.** No canonical trick rows; no family topology renderings; no faceted browse.
- **Not an encyclopedia.** No exhaustive coverage of every term. Where a concept needs depth, link to the educational-pathways page or a connective panel — don't inline an essay.
- **Not a browse surface.** No symbolic-object cards inside glossary entries; compact browse lives on `/freestyle/tricks` and the landing-page Core Tricks grid.

Operating rules baked into every glossary edit in this batch:

1. **Concise wins.** Every entry sits inside an existing `<dl>` or short subsection. No new prose section exceeds 4 sentences.
2. **Mechanics first.** A glossary entry that describes a component starts with how it's executed, then layers on naming/notation context only if non-obvious.
3. **Stopping-depth honest.** Don't expand operators recursively to atoms unless the expansion teaches something the compressed form hides.
4. **One source per claim.** Every definition cites either an existing-site canon source, PassBack glossary line, or `RED_RESOLVED_CANON.md` ruling. No invented wording.

---

## PART 2 — Torque / Mobius teaching-flow mockup

**Maintainer decision (2026-05-14): CONFIRMED inside §3.** "The flow is compositional structure. It belongs in 'How Tricks Are Built.' NOT a detached showcase section."

**Placement.** New §3 sub-section inside "How Tricks Are Built", immediately after the existing intermediate-operators reference subsection (currently at `glossary.hbs:138–161`). Anchor: `id="symbolic-compression-flow"`.

**Heading.** "Symbolic compression — a worked example"

**Service-layer support.** None required. The three symbolic objects are hardcoded in the template (the glossary is editorial; no live DB join). The `osis`, `torque`, `mobius` ADD values come from `RED_RESOLVED_CANON.md` A.3 (osis = 3, torque = 4 per pt11, mobius = 5 per pt11). Template renders the same compact-symbolic-object pattern shipped on the landing Core Tricks grid (PART H-pre rule).

**Visual-first principle (maintainer-emphasized 2026-05-14).** The symbolic progression carries the lesson. Prose stays minimal — the cards do the teaching. Forbidden: essay pedagogy, ontology dissertation, decomposition walls.

**Mockup (rendered with the existing `.core-trick-object` Batch-2 CSS for visual continuity with the landing-page Core Tricks grid):**

```
#osis
3

       ↓

#torque
≡ miraging osis
4

       ↓

#mobius
≡ spinning ss torque
≡ spinning ss miraging osis
5
```

**Teaching prose (full text proposed for the template — kept deliberately short; ≤ 50 words total):**

> Three names. One progression. Each card adds one operator and gives the result a shorter name.
>
> The community uses the shortest readable form. `mobius` is the name players actually say — but `spinning ss miraging osis` is no less correct. The language picks its own stopping points.

Concise. The cards teach the structure; the prose names the principle. Nothing more.

**Pedagogical commitments built into the flow:**

| Commitment | How the flow honors it |
|---|---|
| Composition is visible | Each arrow names exactly what was added |
| Compression is meaningful | Mobius surfaces TWO stopping depths so the reader can see compression happening |
| Stopping-depth is a choice | Three equivalent readings are explicitly named; none called "the right one" |
| Intermediate operators are real | `torque` is treated as a first-class compositional unit, not just a shortcut |
| No new ontology | Every relationship in the flow is pt11-canonical per `RED_RESOLVED_CANON.md` C.1 |

**What the flow is NOT:**

- Not a browse card group (no links to trick pages; no per-card hover behavior).
- Not exhaustive — it's one example, illustrative. Mirage families, butterfly families, etc., get their own treatment on educational-pathways pages.
- Not extensible by future ontology drift — adding new `≡` lines to mobius (e.g., `spinning ss reverse-blender`) would require a Red ruling first.

---

## PART 3 — Jobs notation reframing

**Current state.** `glossary.hbs §8` lines 235–289. Heading: "8. Notation (Jobs Notation)". Opens with "Jobs notation is the community's compact symbolic shorthand…", then three examples (whirl, paradox whirl, gauntlet), then a structural-roles subsection.

**Diagnosis.** The current section is well-intentioned but philosophically overweight. It treats Jobs notation as a "notation system" with structural roles — the framing centers the system, not the insight. The torque/mobius flow added in §3 (above) demonstrates the insight more clearly than the §8 prose does.

**Proposed reframe.**

| Element | Current | Proposed |
|---|---|---|
| Heading | "8. Notation (Jobs Notation)" | "8. Symbolic Compression — how trick names encode structure" |
| Opening | Definitional ("Jobs notation is the community's…") | Insight-first thesis sentence (maintainer-mandated, 2026-05-14): **"The language evolves by compressing recurring compositional structures into shorter readable symbolic forms."** Followed by: "The longer you stack operators on a base, the longer the name — until the community converges on shorthand. Jobs notation is that shorthand made legible." |
| Lead example | Whirl (the single-token case) | Brief recap of the §3 torque/mobius flow with a cross-link; new lead example shifts to **gauntlet** = `stepping ducking paradox torque` (already in current §8) which shows operator-stacking at 7 ADD |
| Structural-roles subsection | Long prose about color-coded roles | Reduced to 2 sentences: "The visual hierarchy is restrained — only the four primary roles carry color saturation. Hover any token on a trick page to see its role and resolved family name." Link to trick page for live demo. |
| Closing | (none) | One-sentence forward link: "The next section describes the operational layer — how the trick is executed. Symbolic compression lives in trick names; operational mechanics live in the sequence of plants, dexes, and contacts." |

**Why the thesis sentence matters (maintainer 2026-05-14):** the rename to "Symbolic Compression" is philosophically accurate because the system is not centered on "a notation" — it is centered on the evolution of readable compressed shorthand. The thesis sentence makes this central claim explicit at the top of §8 so the section's lesson is impossible to miss.

**Net effect on section length.** ~55 lines → ~30 lines. Same teaching content; tighter framing.

**What stays untouched.**

- The three colored-token notation examples (whirl / paradox whirl / gauntlet) render as-is. The educational value of seeing the live notation tokens with color roles is preserved.
- The `notation-display-tokens` partial markup. No service-shape change.
- The `notationExamples` view-model field. No service-shape change.

---

## PART 4 — Operational-vs-semantic notation explanation

**Current state.** `glossary.hbs §9 Operational Notation` (lines 291–306+) already opens with a side-by-side framing: "While the Jobs notation above describes a trick's structural identity (semantic), operational notation describes its execution mechanics."

**Diagnosis.** The framing is correct but buried in prose. A brief tabular contrast would make the boundary unmistakable.

**Proposed insertion** at the top of `§9 Operational Notation`, immediately after the section heading:

```
| Layer | Describes | Renders as |
|---|---|---|
| Semantic notation (§8) | Compositional structure — what the trick IS | Operator stack (e.g., `stepping ducking paradox torque`) |
| Operational notation (§9) | Execution mechanics — what the body DOES | Bracket-flagged sequence (e.g., `CLIP > OP IN [DEX] > OP OUT [DEX] > [DEL] CLIP`) |
```

Followed by one sentence: "The two layers are complementary, not interchangeable. Both render on trick-detail pages when authored."

**Forbidden directions** (explicit in user spec):

- Do NOT blur the layers. The semantic layer never carries `[DEX]` flags. The operational layer never carries `spinning` as a single token — it carries the body-movement sequence the player executes.
- Do NOT collapse one into the other. They are complementary; the same trick may be named at three semantic stopping depths (per the torque/mobius flow) yet still have a single canonical operational form.

---

## PART 5 — PassBack integration targets

Seven concepts to integrate. Each must land as a concise glossary entry (1–3 sentences max), inside an existing `<dl>` block where possible, with explicit PassBack source attribution rendered as a small lineage line. No walls. No verbatim copy/paste unless the wording is the entire entry (Symposium pattern from Batch 1).

| # | Concept | Target section | Source | Length budget | Notes |
|---|---|---|---|---|---|
| 1 | Alpine (modifier) | new entry in `§4 Naming & Evolution` shorthand table OR a new `§3` micro-block | `passback-glossary.txt:269` | 2 sentences | "Divides a trick between uptime and downtime, inserting a duck or dive between them. Alpine Ripwalk = Stepping Ducking Butterfly." |
| 2 | Symposium (semantic) | EXTEND existing `term-symposium` entry in modifier-reference dl (currently render-disabled per [[feedback_modifier_public_visibility]] — leave the hidden surface enriched but not re-enabled) | `passback-glossary.txt:185` (verbatim) | 1 sentence | The verbatim wording shipped to the operator board in Batch 1 C-7. Same wording here. |
| 3 | Symple | new entry in `§3 modifier-reference` dl (hidden surface) OR a new `§3` micro-block | `passback-glossary.txt:188` | 2 sentences | "Starts symposium but mid-component, the non-symple foot returns to the ground. Naturally suits some compositions (e.g., Symp Legover)." |
| 4 | Muted | new entry in `§3` modifier-reference dl OR a new `§3` micro-block | `passback-glossary.txt:194` | 1 sentence | "An active leg held in the air for an entire component without planting." |
| 5 | Dex windows | new micro-block inside `§3` adjacent to the existing modifier-reference dl | `passback-glossary.txt:236` | 3 sentences | "The phantom space the leg draws around the bag. A deep dex sits high in the window; a thin dex sits at the edge. A *the* component misses the window entirely." |
| 6 | Hippy vs leggy | new micro-block inside `§3` (lifts the landing-page Dex sub-field clarification into the glossary, deeper) | `passback-glossary.txt:160` | 2 sentences | "Hippy dex: motion from the hip, thigh circles the bag. Leggy dex: motion from the knee, calf circles the bag. Every dex is one or the other (or a hybrid)." |
| 7 | Trick phases + side relationships | new micro-block inside `§3` named "Uptime, midtime, downtime — and which side" | `passback-glossary.txt:200, 209` | 4 sentences | "Tricks break into three phases by bag direction: uptime (bag rising), midtime (the peak), downtime (bag falling). A side modifier — same-side (ss / near) or opposite (op / far) — connects each component to its predecessor. ss is implied for Clipper-led tricks; op for Toe-led tricks." |

**De-duplication discipline.** The landing-page Basic Components grid already names hippy / leggy / regular / symposium / in-out / out-in / same-side / opposite — those are LABELS in the landing grid. The glossary's role here is the **mechanical depth** (what hippy DOES, not just that it exists). Landing = labels; glossary = mechanics.

**What this batch does NOT integrate.**

- "Stomping" (PassBack:197) — historical oldschool component; not in active vocabulary; skip.
- "Crispy" (PassBack:275) — user spec doesn't list it; skip.
- "Attack" (PassBack:206) — execution-quality term; could fit later but not in this slice.

---

## PART 6 — PDX / paradox cleanup

**Current state.** `glossary.hbs:319–320`:

```html
<dt id="op-flag-pdx"><code>[PDX]</code></dt>
<dd>Paradox component — the dex is performed in the paradox direction. Equivalent to the <code>paradox</code> body modifier in semantic notation.</dd>
```

**Diagnosis.** "the paradox direction" is circular — defines paradox in terms of paradox. The PassBack glossary at line 218 has the authoritative mechanical definition.

**Proposed wording (operational PDX flag — visible surface):**

```html
<dt id="op-flag-pdx"><code>[PDX]</code></dt>
<dd>Paradox component — flags a cross-body far dex that requires a hip-pivot repositioning to bring the leg under the bag. Operationally: <code>CLIP &gt; OP IN [DEX]</code> (clipper set, far in-out dex). Equivalent to the <code>paradox</code> body modifier in semantic notation. <span class="lineage-note">Adapted from PassBack glossary § "Paradox".</span></dd>
```

**Proposed wording (semantic-paradox entry — render-disabled `term-paradox` in `modifier-reference` dl, line 127):**

Current (already conservative; per Batch 1 C-10 I deferred this):
```
A hip pivot between two dexes on the same set. +1 body modifier. The set leaves and returns to the same foot while the body changes sides in between.
```

Proposed extension (adds mechanical-clarity sentence + cross-link; keeps existing intro intact):

```
A hip pivot between two dexes on the same set. +1 body modifier. The set leaves and returns to the same foot while the body changes sides in between. Most paradox tricks read as "clipper set far in-out dex" — `Pdx Whirl` is `Clipper far Whirl` in long form.
```

**Layer-respecting wording rule.**

- Operational entry talks **mechanics**: hip-pivot, leg routing, plant-foot identity.
- Semantic entry talks **structure**: which slot in the operator stack paradox occupies (+1 body modifier; pairs with stepping).
- Neither entry pretends to describe both layers.

---

## PART 7 — Glossary vs dictionary authority boundaries

Restated explicitly (also in `FREESTYLE_IA_REALIGNMENT_PLAN.md` PART B; reiterated here for the Batch 3 implementer):

| Surface | Owns | Does NOT own |
|---|---|---|
| **Glossary** | Vocabulary, mechanics, composition concepts, shorthand, execution detail. The "how the language works" explanation. | Canonical trick rows. Family browse. Faceted filters. Topology maps. Compact symbolic-object cards. |
| **Dictionary** (`/freestyle/tricks`) | Canonical trick rows. Family/component/operator/ADD/topology/set/modifier browse facets. Faceted filtering. Compact symbolic-object cards in browse. | Definitions. Mechanics. Conceptual primers. |

**Lines that test the boundary.** Three glossary patterns that look harmless but would migrate dictionary functionality into the glossary — all forbidden in this slice:

| Pattern | Why forbidden |
|---|---|
| "Tricks in the **whirl family** include…" with a rendered list of trick names | Family-browse functionality belongs to `/freestyle/tricks?view=family`, not glossary prose. |
| Compact symbolic-object cards inside the modifier-reference dl | Symbolic cards live on the landing Core Tricks grid and the dictionary. Putting them inside the glossary turns the glossary into a browse surface. |
| A "see all tricks using X modifier" link adjacent to a glossary entry | Faceted-filter URLs (`?view=sets#set-pixie`) are dictionary navigation; only the dictionary should originate them. |

**Lines that respect the boundary.** Cross-links FROM the glossary TO dictionary surfaces are fine; what's forbidden is recreating dictionary functionality IN the glossary. Example permitted: "See the **clipper family** on the trick dictionary." Example forbidden: rendering a list of clipper-family tricks inside glossary §10 prose.

---

## PART 8 — Connective-panel positioning strategy

**Current state.** `glossary.hbs §13` lines 455–500. Six connective panels (paradox, symposium, ducking, spinning, whirl, pixie). Each panel shows: definition, related tricks list, related symbolic groups, notation hint, optional deeplink.

**Diagnosis.** Connective panels have drifted toward dictionary-browse functionality (the "related tricks list" inside each panel is essentially a small browse view). They started as glossary entries but now do dictionary work.

**Per spec:** "keep for now but begin repositioning them conceptually as dictionary educational views / family/topology exploration surfaces rather than core glossary definition material."

**Proposed change in this batch:** ZERO code change to the panels themselves. Add one in-glossary section heading note at the top of `§13` (continuing the change deferred from Batch 1 C-14):

```
<h2 class="section-heading" id="connective-panels">13. Connective panels — educational bridges</h2>
<p class="section-intro">
  These panels link glossary terms to the canonical structures they appear
  in. They will migrate to the trick dictionary in a future slice as
  family/topology exploration surfaces; for now they live at the bottom of
  the glossary as a transitional home.
</p>
```

That's it. Panel data shape, rendering code, and tests are untouched in Batch 3.

**Future migration (deferred to a later batch):** the panels relocate to `/freestyle/tricks` as a topology-view, accessible via a new facet. Glossary §13 dissolves; only the conceptual definitions (paradox-the-concept, etc.) remain in glossary as short entries pointing to the relocated panel.

---

## PART 9 — Before / after glossary examples

Three concrete before/after pairs the implementer should match exactly.

### 9.1 — Glossary intro (Batch 1 shipped concise intro; Batch 3 adds a teaching-philosophy sentence)

**Currently shipped (Batch 1, glossary.hbs:19–28):**
```
This glossary defines the terminology used across the freestyle surfaces:
execution mechanics, run-quality terms, trick components, and the
compositional vocabulary by which trick names are built. It is written
for newcomers who want a foothold and for experienced players who want a
reference that matches their mental model.

Canonical trick rows and faceted browse live in the trick dictionary.
The set-notation reference is at /freestyle/sets.
```

**Proposed Batch 3 enhancement:**
```
This glossary teaches how the freestyle language works: vocabulary,
mechanics, and the compositional shorthand the community uses to name
tricks. It is the "how it reads" layer — for the canonical catalog of
named tricks, see the trick dictionary; for the set-notation reference,
see /freestyle/sets.

The language is symbolic and compositional. Recurring movement structures
compress into named operators; named operators stack onto base tricks to
produce new ones. The same trick can usually be named at several depths
— shortest readable form wins.
```

Net: one paragraph added. Frames the philosophy. Two sentences.

### 9.2 — §8 Notation reframing (Jobs notation → symbolic compression)

**Currently shipped opening:**
```
Jobs notation is the community's compact symbolic shorthand for what a
trick actually does. The trick's name tells you its identity; Jobs
notation tells you its structural anatomy — which set begins it, which
modifiers shape it, which base trick anchors it, and where it catches.
```

**Proposed:**
```
The language evolves by compressing recurring compositional structures
into shorter readable symbolic forms. The longer you stack operators on
a base, the longer the name — until the community converges on a shorter
shorthand. Jobs notation is that shorthand made legible.

A trick called "mobius" decompresses to "spinning ss torque", and
further to "spinning ss miraging osis". All three forms are legitimate;
the community uses the shortest readable one. See the symbolic-compression
flow in §3 for a worked example.
```

Thesis sentence (the first one) is maintainer-mandated wording, 2026-05-14. Internal cross-link to the new §3 torque/mobius flow. Bullet list of "what notation makes visible" stays as-is (already concise).

### 9.3 — PDX flag wording (already detailed in PART 6)

Before: 1 sentence ("dex is performed in the paradox direction").
After: 2 sentences with mechanical detail + operational notation example + PassBack lineage line.

---

## PART 10 — Risks of glossary re-bloat

The single biggest failure mode for this batch is **the glossary growing back into encyclopedia shape**. Specific anti-patterns the implementer must reject during code review:

| Anti-pattern | Mitigation |
|---|---|
| Adding "see also: …" sub-paragraphs after every entry | Cap on `<dl>` entries: max 2 sentences per `<dd>`. |
| Recursive expansion of every modifier into its base components | Stopping-depth rule (PART 1 #3). |
| Rendering tables of "tricks using modifier X" inside glossary entries | Boundary rule (PART 7). |
| Importing operator-board cards into glossary §3 again (Batch 1 retired this) | Negative test guards (the `does not render the operator-board partial on the glossary page` test shipped in Batch 1 stays). |
| Inlining the full PassBack glossary entry verbatim | Length budget per entry (PART 5 column 5). |
| Adding implementation-state language ("deferred", "current") into the rendered glossary prose | Per `doc-governance.md`: glossary is public-facing, no implementation-state vocabulary. Same rule applies. |
| Introducing new operator semantics under the guise of "glossary clarification" | Out-of-scope rule (PART 8 of the user spec). |

**Quantitative budget.** This batch adds **≤ 80 lines** to `glossary.hbs` net. If a single change exceeds 25 lines, escalate to maintainer before continuing.

**Test guard against re-bloat.** Add one Batch-3 contract test asserting the glossary HTML body length stays under a reasonable threshold (e.g., 35 KB after gzip). Mechanical guard against unbounded growth.

---

## PART 11 — Unresolved ontology areas pending Red

Per `project_red_consultation_state` Wave 1 packet (sent / pending reply), these are explicitly NOT surfaced in Batch 3:

| Topic | Status | Why it stays out |
|---|---|---|
| Rotational-bonus generalization (blurry/barraging/furious +1 vs +2) | Wave 1 Q1 pending | Any glossary entry depending on these ADDs would either pre-resolve or stale-out. |
| Q4 FM-vocab batch (fairy, gyro, blazing, surging, railing, flailing, splicing, surfing, neutron, bubba, twinspinning, jolimont, smiling, spyro-as-modifier) | Wave 1 Q2 pending | The 14 FM-vocab modifiers stay out of glossary entries. Fairy and pixie already render via the Batch-1 set-modifiers subsection (anchors preserved, no compositional claims). |
| Positional/directional weights (far, reverse) | Wave 1 Q3 pending | Batch 3 PDX wording uses `far` as a direction term (factual), not as an ADD claim. The wording does NOT say "far = +0" or any other weight. |
| Atomic-set polysemy (the +1 systemic gap) | Wave 1 Q4 pending | Atomic-anything stays out of glossary teaching flows in this batch. |
| Furious non-rotational reading | Wave 1 Q1c pending | Furious stays in its pendingNote in NF-2A; glossary doesn't expand. |
| Witchdoctor / Frigidosis / Scrambled Eggbeater decomposition | Wave 2 Theme 2 | Not in glossary scope. |
| Down-family canonicalization | Wave 2 Theme 6 | Not in glossary scope. |
| Frantic / Leaning / Hyper / Sailing / Bling Blang equivalence-chain promotion | Wave 2 Theme 8 | Stay out of compact browse surface AND glossary. |

**Source-attribution split for Batch 3 changes:**

| Category | Count | Source |
|---|---|---|
| CANON (existing site canon) | 4 | torque/mobius flow (pt11), gauntlet example (existing §8), operator-board cross-links (existing partial), semantic-vs-operational table (existing §8/§9 framing) |
| PB-ADAPT (PassBack glossary) | 7 | All Part 5 items + the PDX rewording (PART 6) |
| RED_RESOLVED_CANON cross-references | 3 | osis = 3 / torque = 4 / mobius = 5 (A.1 + A.3 + C.1) |
| UNRESOLVED / deferred | 8 | Per the table above |

Zero new definitions, zero new operator semantics, zero ADD claims.

---

## Implementation order (when approved)

Suggested batching for the maintainer's eventual implementation slice:

1. **C-3-A** — PDX flag rewording (`glossary.hbs:319–320`) + ADD entry-level PassBack-source lineage line CSS class if not present.
2. **C-3-B** — Glossary intro philosophy extension (PART 9.1).
3. **C-3-C** — `§8` Symbolic Compression reframe (PART 3 + PART 9.2), heading rename to "Symbolic Compression".
4. **C-3-D** — `§3` Symbolic-compression-flow torque/mobius mockup insertion (PART 2).
5. **C-3-E** — `§9` semantic-vs-operational table insertion (PART 4).
6. **C-3-F** — PassBack integration micro-blocks (PART 5; one micro-block per concept, all in `§3`).
7. **C-3-G** — `§13` connective-panel positioning note (PART 8).
8. **C-3-H** — Batch 3 contract tests + the body-length guard test (PART 10).
9. **C-3-I** — doc-sync VIEW_CATALOG.md (glossary entry already drift-corrected in Batch 1; the new symbolic-compression-flow + reframed §8 heading need adding).

Each unit ships in a single PR-equivalent diff with its own tests; rejection-per-unit allowed.

---

## Cross-references

- `FREESTYLE_IA_REALIGNMENT_PLAN.md` PART H-pre — compact symbolic-object rendering rule (this batch's torque/mobius flow renders under that rule)
- `RED_RESOLVED_CANON.md` A.3 (named-compound ADDs) + C.1 (equivalence-chain rulings) — basis for the torque/mobius flow being rendered as canon, not invention
- `passback-glossary.txt:185, 188, 194, 200, 209, 218, 236, 269` — source lines for all PassBack adaptations
- [[feedback_modifier_public_visibility]] — Modifier Reference dl is render-disabled; Batch 3 may expand the hidden dl but not re-enable
- [[feedback_public_facing_prose]] — strip curator-internal language from rendered prose (constrains PART 5 wording)
- [[feedback_frequency_not_authority]] — Batch 3 does not promote any FM-vocab terms despite their corpus recurrence
- `tests/integration/freestyle.routes.test.ts` — existing glossary contract tests; Batch 3 tests slot in here

---

## Maintainer decisions (resolved 2026-05-14)

Both ambiguities resolved by the maintainer prior to implementation:

1. **Torque/mobius flow placement: INSIDE §3.** Rationale: the flow is compositional structure and belongs in "How Tricks Are Built", not a detached showcase section. Approved.

2. **PassBack integration: GROUPED subsection.** Heading: **"Execution Mechanics"**. Subhead: **"Concepts adapted from the PassBack glossary"**. Then the seven micro-entries (alpine / symposium / symple / muted / dex windows / hippy vs leggy / phases & sides). Rationale: grouped maintains discoverability, maintainability, conceptual coherence; scattered insertion risks glossary drift, inconsistent tone, future duplication, hidden educational material. Approved.

Additional maintainer guidance (2026-05-14):
- **Torque/mobius prose minimum** — the symbolic progression carries the lesson; explanatory prose stays compact (≤ 50 words). Forbidden: essay pedagogy, ontology dissertation, decomposition walls.
- **Thesis sentence required in §8** — verbatim: "The language evolves by compressing recurring compositional structures into shorter readable symbolic forms." This is the core thesis of the whole system.
- **§8 rename to "Symbolic Compression" approved** — "freestyle evolved readable symbolic compression" is the philosophically accurate framing.

Implementation may proceed C-3-A → C-3-I per the order above.
