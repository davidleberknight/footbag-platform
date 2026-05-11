# UX3 -- Flagship Synthesis (Phase UX3a)

North-star design exploration. Status: exploration only. No template / CSS / DB / prose / commit changes. No new partial implementation. No widening of media ingestion. No ontology / parser / modifier-weight mutations.

Date: 2026-05-11.

Premise: UX2 is now the canonical long-term infrastructure direction for **all** trick pages. UX3 synthesises UX2's editorial depth with the semantic visual density of the original `prototype-spinning-symposium-whirl.html` reference, on a single universal architecture that scales by content availability rather than by hardcoded slug allowlists.

Reference rows: **Montage**, **Matador**, **Mind Bender**, plus **Toe Stall** and **Mirage** as the sparse / standard end of the density spectrum.

---

## 1. Executive summary

The goal of UX3 is not "richer flagship pages." The goal is **one universal architecture** that:

- renders the simplest trick (Toe Stall, atom) honestly with no decorative scaffolding
- renders the densest trick (Montage, 4-modifier compound) with full semantic decomposition, role-coloured surfaces, and editorial prose
- moves between those two extremes by **data presence**, not by template branching or slug gating

The prototype proved that role-coloured surfaces (token-level coloration of `core_family` / `set` / `rotation` / `modifier` / `delay_surface` / `directionality` / `unusual_surface` / `policy_tokens`) communicate structural information at a glance. UX2 proved that editorial prose + featured-media-slot + progressive disclosure of diagnostics is the right educational shape. Neither alone is the destination. UX3 is the merge.

This document does not propose to remove anything from UX2. It proposes to **promote** what the prototype did better, **demote** what the prototype did worse, and **wrap both** in a universal shell that gracefully scales sparse → standard → flagship.

---

## 2. Source-of-truth inventory

### 2.1 Reference artifacts

- `exploration/freestyle-notation-grammar/prototype-spinning-symposium-whirl.html` -- 360-line baseline; semantic role palette + token-level h1 + modifier-layering visualisation.
- `exploration/freestyle-notation-grammar/prototypes/` -- 5 archetype prototypes (policy-dependent, self-atom, approximate-ADD, candidate-family, unusual-surface) + README.
- `exploration/freestyle-notation-grammar/UX2_EDITORIAL_LAYOUT_PLAN.md` -- the design behind the live UX2 pilot.
- `exploration/freestyle-notation-grammar/UX2_PILOT_IMPLEMENTATION.md` -- implementation report for Montage + Matador + Mind Bender.
- `exploration/footbagmoves-federation/RENDERING_SURFACE_PROPOSAL.md` -- O1 design surface that established warm/cool palette discrimination.
- `feedback_public_facing_prose.md` (memory) -- editorial-prose hygiene rules.
- `project_freestyle_state.md` (memory) -- pt-batch dispositions; three-layer separation forever-rule.

### 2.2 Live infrastructure (will not change in UX3a)

- Cool-palette semantic notation tokens (`notation-token notation-{cssRole}`)
- Warm-palette operational notation tokens (`op-token op-token--{cssRole}`)
- `freestyle_tricks` schema: `notation`, `operational_notation`, `operational_notation_source`, `description`, structural-parse JSON
- `freestyle_trick_modifier_links` for editorial decomposition
- `freestyle_trick_modifiers` for modifier weights and notes
- Family ladder service derivation
- Related Tricks service derivation (R1 / R2 / R3 rules)
- Tier-classified Reference Media split (Tutorials / Demos)
- `video-facade` partial for embedded video

UX3 adds atop this; it does not propose schema changes (those are deferred to a separate phase per `UX2_EDITORIAL_LAYOUT_PLAN.md` §6 if and when 5+ rows of prose authoring is established).

---

## 3. Prototype vs UX2 -- explicit inventory

### 3.1 What the prototype did BETTER

| Element | Prototype shape | Why it works |
|---------|-----------------|--------------|
| **Token-coloured trick name at h1 scale** | `spinning symposium whirl` rendered as 3 inline coloured spans at 2.25rem | Reader perceives structure before reading the page; identity = decomposition. |
| **Modifier-layering nested boxes** | `rotation > modifier > core_family` shown as concentric boxes with weight tags | Makes the additive ADD math visible as a stack; weight assignment is concrete. |
| **ADD derivation formula** | `spinning(+2) + symposium(+1) + whirl(3) = 6` shown as a single line with role-coloured operands | Math is immediate and verifiable; not buried in a diagnostic. |
| **Family lineage by ADD tier** | Rows grouped under ADD = 3, ADD = 4, ADD = 5, ADD = 6 with current row highlighted at the right tier | Progression is vertical and visual; cross-family discovery emerges naturally. |
| **Role-coloured Related Tricks** | Each related trick row uses the same role palette to surface shared tokens (other `spinning` tricks, other `symposium` tricks) | Cross-family relationships are perceivable, not just listable. |
| **Per-token role tooltip** | `data-role` + `title` attributes on every token | Educational hook lives at the token; no separate glossary scroll needed. |

### 3.2 What UX2 did BETTER

| Element | UX2 shape | Why it works |
|---------|-----------|--------------|
| **Short editorial summary in hero** | One-sentence elevator pitch under the title | A learner arriving cold sees an answer to "what is this?" in 5 seconds. |
| **Execution / Learning / Prerequisite prose** | Three dedicated short-prose sections in plain English | Practitioner orientation; mechanics described in body terms, not formal tokens. |
| **Operational notation block** | Warm-palette warmth-vs-cool semantic distinction; FM-derived sequence steps | Mechanics readable independently of the semantic decomposition; supports federation-not-adoption. |
| **Featured-media slot with empty-state** | Hero-adjacent media tile or honest "Curated tutorial coming soon" pill | Sets the visual expectation; empty state is first-class. |
| **Pathways block** | Pre-shaped Learn / Watch / Family cards near the bottom | Three orthogonal user intents addressed without burying anything. |
| **Collapsed diagnostic** | Structural decomposition wrapped in `<details>` | Diagnostic content exists for editors and grammar-aware visitors but does not lead the page. |
| **Honest empty states** | Sections omit when their data is null | No fabricated content. Prototype-style "computed = asserted" displays for atom rows were trivial. |
| **Mobile-first responsive** | All sections wrap cleanly at 375 px | Prototype was desktop-only at 960 px. |
| **Glossary deep-links** | Per-section "Token reference →" anchors | Educational on-ramp without per-token tooltip noise. |

### 3.3 Ideas that should MERGE into UX3

- **Token-coloured trick name** (prototype) -- promote to UX2 hero (replacing or augmenting the current title text). Optional/flagship-only treatment for atoms where the title has nothing to colour.
- **ADD derivation formula** (prototype) -- promote into a quick-stat strip immediately below the hero (one-liner). Replaces the current `dl` "How it's built" treatment.
- **Family lineage by ADD tier** (prototype) -- replace the flat "Trick Family" ladder with tier-grouped rows. Highlight current. Renders the same data, more legibly.
- **Role-coloured Related Tricks** (prototype) -- promote so each related trick carries its role-coloured token. Cross-family lens becomes visual.
- **Modifier-layering nested boxes** (prototype) -- promote as a flagship-only visualisation; sparse rows can omit. Provides the structural-decomposition feel without forcing the parser diagnostic onto every page.
- **Per-token role tooltip** (prototype) -- already partially landed via UX1 Phase A. UX3 extends to ensure every coloured surface (h1 tokens included) carries the tooltip + glossary deep-link pattern.

### 3.4 Prototype ideas that should NOT return

- **"Parsed at" timestamp on the page** -- meta-noise for learners. Belongs in commit messages or QC outputs.
- **Parse-source ("name_decomposition") on the page** -- internal mechanism leakage.
- **Asserted vs computed ADD prominently displayed for atom rows** -- pedagogically empty (atom = its own value).
- **Parse QC panel at full visibility** -- belongs in the diagnostic layer, collapsed by default.
- **Per-token title-tooltip flooding** -- the prototype's tooltip-everywhere model was loud. UX2's deep-link-to-glossary pattern is more restrained.
- **Inline modifier-layering for atoms / self-atom rows** -- empty stacks for atoms read as visual clutter (per `prototypes/README.md` finding).
- **Hardcoded ADD-panel "Parser version"** -- belongs in the diagnostic layer, if at all.

---

## 4. Layered architecture -- three vertical layers

UX3 reads top-to-bottom as three semantic layers:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   SCAN LAYER                                             │
│   (5-second comprehension at first scroll)               │
│                                                          │
│   - Hero: trick-name (role-coloured tokens for compound) │
│   - Quick-stat strip: ADD + family + records + composite │
│   - One-line editorial summary                           │
│   - Featured media slot (full or empty-state)            │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   STUDY LAYER                                            │
│   (15-minute educational depth)                          │
│                                                          │
│   - About this trick (prose description)                 │
│   - Notation (semantic, cool palette)                    │
│   - Set notation (operational, warm palette)             │
│   - Execution (plain-English mechanics)                  │
│   - Learning notes (gotchas + pitfalls)                  │
│   - Before you try this (prerequisites)                  │
│   - Family lineage (ADD-tiered)                          │
│   - Related Tricks (role-coloured cross-family)          │
│   - Reference Media (tutorials + demos grid)             │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   DIAGNOSTIC LAYER                                       │
│   (curator + grammar-aware visitors; collapsed)          │
│                                                          │
│   - Pathways (Learn / Watch / Family)                    │
│   - Previous / Next tricks                               │
│   - Passback Records + Record Progression                │
│   - Structural decomposition (parser diagnostic)         │
│   - Editorial decomposition + ADD math                   │
│   - Policy tokens / approximate-ADD flags                │
│   - Source-provenance + curator review state             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

The layers are visually distinguished but do not require literal section headers naming the layers. They are an authoring discipline: "scan" content is dense + decorative; "study" content is text + grid; "diagnostic" content is collapsed or muted.

### 4.1 Why three layers and not the UX2 two-layer model

UX2 split LEARN / REFERENCE-tail (with MEDIA between). That worked for the pilot but conflated two intents in the LEARN block: (a) visual scan of structure, (b) deep textual study. The prototype's strength is in the visual-scan portion; UX2's strength is in the deep-textual-study portion. Splitting them gives each its own air.

The Pathways / Previous-Next surfaces are demoted to diagnostic because they are navigation-after-comprehension rather than comprehension-supporting. A learner who already understands the trick benefits from these; a learner still figuring out the trick is not yet ready to navigate.

---

## 5. Top-of-page semantic recovery -- bringing back density without chaos

The prototype's load-bearing visual move is the role-coloured trick-name at h1 scale. UX3 promotes this with three constraints:

1. **Coloration is supplemental, never load-bearing.** A reader who is colour-blind or who turns off styles still reads the title as plain text. Role information lives also in `data-role` attributes + token-level glossary deep-links.
2. **Tokens render as a single visual unit, not as separate boxes.** No background pill per token at h1 scale (the prototype's pill-per-token treatment is too noisy at title scale). Token coloration applies to the type fill only, with optional thin underline (matched per role) to differentiate at small sizes.
3. **Quiet for sparse rows.** Toe Stall's title is just "toe stall" with no compound structure to colour. The h1 stays plain. The coloured-tokens treatment activates only when the trick has 2+ modifier_link rows.

The quick-stat strip directly below the title is the prototype's ADD-derivation formula promoted to a hero-adjacent location:

```
spinning + symposium + whirl = 6 ADD
```

Each operand is a role-coloured token (`role-rotation` / `role-modifier` / `role-core` per the prototype palette). Each operator is muted. The total is bold. Atoms render simply:

```
toe stall = 1 ADD
```

This single line replaces the current UX2 hero-stats span and the legacy template's `dl` "How it's built" entry. Visual decomposition density is recovered without burying anything.

---

## 6. Universal UX2 shell concept

The proposal: one trick-detail template (`trick.hbs` post-migration; not necessarily the legacy name) that all 160 active tricks share. The template renders sections conditionally based on data presence, not on per-slug allowlists.

### 6.1 Section-presence rules (no hardcoded slug gates)

| Section | Render condition |
|---------|------------------|
| Hero title + role-coloured tokens | always; coloration activates when `modifier_links.length >= 2` |
| Quick-stat strip (ADD derivation) | always; renders as `name = N ADD` for atoms, formula form for compounds |
| Short editorial summary | `short_description` non-null (new optional column) |
| Featured media slot | always renders the section; body is empty-state when `featured_media_id` is null |
| About this trick | `description` non-null (existing column) |
| Notation (semantic) | `notation` non-null |
| Set notation (operational) | `operational_notation` non-null |
| Execution prose | `execution_summary` non-null (new optional column) |
| Learning notes prose | `learning_notes` non-null (new optional column) |
| Before you try this | `prerequisite_notes` non-null (new optional column) -- fallback link to Previous Tricks anchor |
| Family lineage (ADD-tiered) | `family.length > 1` |
| Related Tricks (role-coloured) | `related.length > 0` |
| Reference Media grid | `tutorialMedia.length || demoMedia.length > 0` |
| Pathways | always |
| Previous / Next | each conditional on its own list |
| Passback Records | `recordCount > 0` |
| Record Progression | `hasProgression` |
| Structural decomposition (collapsed) | `notationGrammar` non-null |
| Modifier layering visualisation | flagship-tier only (see §9) |
| Modifier-ecosystem panel | flagship-tier only |
| Mini relationship graph | flagship-tier only |

### 6.2 Sparse-to-flagship is data-driven

A trick reaches "flagship" rendering not by being on a list, but by **having the data**:
- 2+ modifier_links → role-coloured trick name activates
- 3+ modifier_links → modifier-layering visualisation enabled
- `execution_summary` populated → execution section appears
- `featured_media_id` populated → hero media tile shows the featured video
- `recordCount` ≥ 1 → records section appears
- IFPA record-holder match + tutorial media → modifier-ecosystem panel appears

A curator's job is to author or tag content; the template responds. No allowlist constant gates a slug into a richer experience.

### 6.3 Why this works for Toe Stall AND Montage

Toe Stall (1 ADD, atom, single-modifier base):
- Coloured tokens: NO (single-token title)
- Quick-stat: `toe stall = 1 ADD` (no formula)
- Editorial prose: minimal or none
- Family lineage: short
- Modifier-ecosystem: NO
- Result: short, focused page, ~4 sections

Montage (7 ADD, 4 modifiers, dense family):
- Coloured tokens: YES (`ducking paradox symposium spinning whirl` as 5 role-coloured tokens)
- Quick-stat: full additive formula
- Editorial prose: full (execution + learning + prerequisite)
- Family lineage: 12-member butterfly ladder grouped by ADD tier
- Modifier-ecosystem: YES (cross-family spinning + ducking + paradox + symposium panels)
- Result: ~10-12 sections, all derived from data

Same template. Same architecture. Different render.

---

## 7. Surface classification

Each surface is one of four categories:

### 7.1 A -- Universal (every trick page)

- Hero title (with optional token coloration)
- Quick-stat strip (ADD derivation)
- About this trick (when `description` non-null)
- Notation (semantic, when `notation` non-null)
- Family ladder
- Pathways
- Source-note footer

### 7.2 B -- Flagship-only (data-gated to high-density rows)

- Role-coloured trick name at h1 scale (requires modifier_links count ≥ 2)
- Modifier-layering nested boxes (requires modifier_links count ≥ 3)
- Modifier-ecosystem panels (requires cross-family modifier presence)
- Mini relationship graph (requires 5+ adjacent tricks at adjacent ADD tiers)
- Full ADD derivation formula with coloured operands (requires modifier_links count ≥ 2)
- Featured-media hero tile (requires `featured_media_id` non-null)

### 7.3 C -- Optional / collapsed by default

- Structural decomposition diagnostic
- Editorial decomposition + ADD math
- Policy tokens
- Approximate-ADD flags
- Source-provenance metadata
- Parser version / parsed-at info

### 7.4 D -- Auto-generated (derived from existing data, no curator authoring)

- Related Tricks list (R1 / R2 / R3 rules)
- Previous Tricks list (lower-ADD same-family)
- Next Tricks list (higher-ADD same-family)
- Family ladder rows
- Reference Media split (tutorial / demo tier classification)
- Passback Records rows (from `freestyle_records`)

### 7.5 Surface-by-surface table

| Surface | Class | Activation condition |
|---------|------|----------------------|
| Hero title (plain) | A | always |
| Hero title (role-coloured tokens) | B | modifier_links ≥ 2 |
| Short editorial summary | A (when populated) | `short_description` non-null |
| Quick-stat strip (formula form) | B | modifier_links ≥ 2 |
| Quick-stat strip (atom form) | A | always |
| Featured media tile | B | `featured_media_id` non-null |
| Featured media empty-state | A (sparse) | `featured_media_id` is null |
| About prose | A | `description` non-null |
| Semantic notation | A | `notation` non-null |
| Operational notation | A | `operational_notation` non-null |
| Execution prose | A (when populated) | `execution_summary` non-null |
| Learning prose | A (when populated) | `learning_notes` non-null |
| Prerequisite prose | A (when populated) | `prerequisite_notes` non-null |
| Family lineage (ADD-tiered) | A | family.length > 1 |
| Modifier-layering nested boxes | B | modifier_links ≥ 3 |
| Related Tricks (role-coloured) | D | auto-derived from R1/R2/R3 |
| Modifier-ecosystem panel | B | cross-family modifier coverage ≥ 2 |
| Mini relationship graph | B | 5+ adjacent tricks |
| Reference Media grid | D | tagged media exists |
| Pathways | A | always |
| Previous / Next lists | D | auto-derived |
| Passback Records | D | recordCount > 0 |
| Record Progression | D | hasProgression |
| Structural decomposition | C | collapsed by default |

Net: most surfaces are A or D (universal or auto-generated). Flagship-only surfaces (B) require either schema columns the curator can populate (`short_description`, `featured_media_id`, `execution_summary`, etc.) or a derivable density signal (modifier_links count). The C tier is intentionally minimal -- only diagnostic content collapses.

---

## 8. Relationship rendering -- explicit YES / NO

The user asked specifically whether flagship pages should include relationship visualisations. Each below has a YES / NO answer with rationale:

### 8.1 Mini relationship graphs

**Conditional YES.** A small SVG showing the current trick connected to (a) lower-ADD siblings, (b) higher-ADD siblings, and (c) adjacent-modifier compounds in other families. Maximum 7 nodes. Avoids becoming a graph-of-everything: filter to immediate neighbours only.

Scope: flagship-tier only. Falls back to the textual Previous / Next / Related lists when density is low.

Implementation note: server-rendered SVG with no client JS dependency. No graph library. No fancy auto-layout. Hand-curated arrangement: current trick centre; ladder vertical; cross-family relationships horizontal.

### 8.2 Modifier-family visual clusters

**YES with restraint.** A grid showing every modifier in the current trick's modifier_links, each rendered as a role-coloured chip, each linking to a per-modifier page (or to the glossary section). Adjacent chips show "other tricks using this modifier" by count.

Example for Montage (`pixie ducking butterfly` becomes Phoenix):
```
[ ducking ] [ paradox ] [ symposium ] [ spinning ]
   ↓           ↓            ↓             ↓
  3 sibs    4 sibs        2 sibs       6 sibs
```

Click `ducking` → highlights all in-family rows that share ducking. Click `spinning` → cross-family lens.

Scope: flagship-tier; renders when modifier_links ≥ 3 AND family-size ≥ 5.

### 8.3 Progression maps

**YES (auto-generated, universal).** Already partially present via Family Ladder. UX3 promotes by:

- Grouping family ladder by ADD tier (prototype-style)
- Highlighting current row
- Showing adjacent ADD tiers with arrow affordances
- Linking each row to its detail page

This is universal (all tricks get it, scaling by family density). Not flagship-only.

### 8.4 Compact decomposition diagrams

**YES (flagship-only).** Modifier-layering nested boxes from the prototype, but only when modifier_links ≥ 3. Two-modifier compounds get a horizontal `mod1 + mod2 + base = N` line; only 3+ modifier compounds get the nested-box visualisation.

Avoids the prototype's "modifier-layering for atoms" anti-pattern (which produced empty boxes per `prototypes/README.md`).

### 8.5 "Parallel tricks" panel

**YES (auto-generated, flagship-tier).** Tricks that share the SAME base + same number of modifiers but different specific modifier-set. Example: Matador (Nuclear Butterfly) parallel-tricks panel surfaces other 2-modifier butterfly compounds at same ADD tier (Atomic Butterfly, Spinning Butterfly, Ducking Butterfly).

Differs from Related Tricks (R1 same-family / R2 modifier-prefix / R3 grandparent) by being narrower: same-base + same-modifier-count + same-ADD-tier. Maximum 4 rows.

Renders when ≥ 2 parallel tricks exist.

### 8.6 "Same-base alternatives" panel

**YES (auto-generated, universal).** Tricks that share the same base as the current trick. Wider scope than parallel: any ADD tier. This is the Family Ladder rotated.

Already present in UX2 as Family Ladder. UX3 keeps it; renames not necessary.

### 8.7 "Modifier ecosystem" panel

**YES (flagship-tier, derived).** For each modifier in the current trick's modifier_links, surface a small panel showing 3 representative other tricks using that modifier (across families). Example for `spinning` in Montage: spinning-clipper / spinning-butterfly / spinning-osis (cross-family spinning tour).

Triggers when modifier_links ≥ 2 AND each modifier appears in ≥ 3 other tricks.

### 8.8 How to avoid visual chaos

The flagship surfaces are visually heavy. Mitigation:

1. **Lazy reveal.** Modifier-ecosystem and mini relationship-graph render in the page bottom-half. Above the fold stays scan-layer only.
2. **Consistent palette.** All flagship visuals reuse the cool-palette role colours. No new colour categories.
3. **Maximum density caps.** Mini graph: 7 nodes. Parallel tricks: 4 rows. Modifier ecosystem: 3 reps per modifier. These are hard caps.
4. **Mobile-first responsive.** Each flagship surface collapses to a vertical list at 375 px. No horizontal scroll. No mini-graph below ~600 px (replaced by the textual Related list).
5. **Restraint as default.** If the data is sparse (Toe Stall, atoms, single-modifier compounds), the flagship surfaces simply do not render. Empty-state design carries over.

---

## 9. Progressive density model

Three concrete density tiers with worked examples. Each tier renders the same template; section count varies by data presence.

### 9.1 Sparse -- Toe Stall (1 ADD, atom)

```
┌──────────────────────────────────────────────────────────┐
│ freestyle / tricks                                       │
│                                                          │
│ toe stall                                                │
│ atw family   1 ADD                                       │
│                                                          │
│ toe stall = 1 ADD                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Featured media                                           │
│ Curated tutorial coming soon.                            │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ About this trick                                         │
│ Foot-of-the-foot stall on the toe.                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Notation                                                 │
│ [TOE]                                                    │
│ Token reference →                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ atw family                                               │
│ 1 ADD: toe stall ← here                                  │
│ 2 ADD: around-the-world toe stall                        │
│ 3 ADD: double around-the-world (DLO)                     │
└──────────────────────────────────────────────────────────┘

[ Pathways: Watch records ]
[ Source footer ]
```

Sections rendered: 6. Token coloration: NO (single token). Modifier-layering: NO. Modifier-ecosystem: NO. Mini graph: NO. Featured-media: empty state. Records: none.

### 9.2 Standard -- Mirage (2 ADD, atom-base + family)

```
┌──────────────────────────────────────────────────────────┐
│ freestyle / tricks / mirage family                       │
│                                                          │
│ mirage                                                   │
│ mirage family   2 ADD                                    │
│                                                          │
│ mirage = 2 ADD                                           │
└──────────────────────────────────────────────────────────┘

[ Featured media (empty state) ]
[ About this trick — short prose ]

┌──────────────────────────────────────────────────────────┐
│ Notation                                                 │
│ [MIRAGE]                                                 │
│ Token reference →                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ mirage family                                            │
│ 2 ADD: mirage ← here                                     │
│ 3 ADD: blur, fairy mirage, fury, paradox mirage,         │
│        pixie mirage, quantum mirage, terraging mirage,   │
│        symposium mirage                                  │
│ 4 ADD: blazing mirage, sumo, atom smasher                │
└──────────────────────────────────────────────────────────┘

[ Related Tricks — same family ]
[ Pathways ]
[ Source footer + collapsed Structural decomposition ]
```

Sections rendered: 8. Token coloration: NO (atom title). Modifier-layering: NO. Modifier-ecosystem: NO. Family-ladder: yes, ADD-tiered with current highlighted.

### 9.3 Flagship -- Matador (5 ADD, 1 modifier, has record)

```
┌──────────────────────────────────────────────────────────┐
│ freestyle / tricks / butterfly family                    │
│                                                          │
│ [nuclear]  [butterfly]                                   │
│   ──────────────                                         │
│   role: set  role: core_family                           │
│                                                          │
│ butterfly family   5 ADD   7 kicks (record)              │
│                                                          │
│ nuclear(+2) + butterfly(3) = 5 ADD                       │
└──────────────────────────────────────────────────────────┘

[ Featured media (hero tile if tagged; else empty-state) ]

[ Short editorial summary (one sentence) ]

[ About this trick (existing prose) ]

[ Notation (semantic, cool palette) ]
[ Set notation (operational, warm palette) + source line ]

[ Execution (plain English) ]
[ Learning notes (gotchas) ]
[ Before you try this (prereq prose) ]

┌──────────────────────────────────────────────────────────┐
│ butterfly family lineage                                 │
│                                                          │
│ 3 ADD: butterfly                                         │
│ 4 ADD: atomic-butterfly, dimwalk, ducking-butterfly,     │
│        parkwalk, ripwalk, sidewalk, spinning-butterfly,  │
│        tripwalk                                          │
│ 5 ADD: bigwalk, matador ← here, phoenix                  │
└──────────────────────────────────────────────────────────┘

[ Related Tricks (role-coloured) ]
[ Parallel tricks panel (other 5-ADD butterfly compounds) ]
[ Modifier ecosystem (other nuclear tricks; cross-family) ]

[ Reference Media (tutorials + demos grid; empty state if none) ]

[ Pathways ]
[ Previous Tricks list ]
[ Passback Records (Mateusz Janicki, 7 kicks, YouTube link) ]

[ Collapsed: Structural decomposition + ADD derivation diagnostic ]
[ Source footer ]
```

Sections rendered: 14-16. Token coloration: YES (`nuclear` set + `butterfly` core_family at h1 scale). Modifier-layering: NO (only 1 modifier; threshold is 3). Modifier-ecosystem: YES (`nuclear` appears in ≥ 3 other tricks). Parallel-tricks: YES (≥ 2 same-base-same-modifier-count compounds at 5 ADD tier). Mini graph: borderline (5 adjacent tricks at adjacent ADD tiers; may or may not fire).

### 9.4 Flagship -- Montage (7 ADD, 4 modifiers, dense family)

```
┌──────────────────────────────────────────────────────────┐
│ freestyle / tricks / whirl family                        │
│                                                          │
│ [ducking] [paradox] [symposium] [spinning] [whirl]       │
│  role:mod  role:mod  role:mod   role:rot   role:core     │
│                                                          │
│ whirl family   7 ADD                                     │
│                                                          │
│ ducking(+1) + paradox(+1) + symposium(+1)                │
│   + spinning(+1) + whirl(3) = 7 ADD                      │
└──────────────────────────────────────────────────────────┘

[ Featured media slot ]
[ Short editorial summary ]
[ About this trick + ADD composition ]
[ Notation (semantic, all 5 tokens role-coloured) ]
[ Set notation (operational) + source line ]

[ Execution prose ]
[ Learning notes ]
[ Before you try this ]

┌──────────────────────────────────────────────────────────┐
│ Modifier layering                                        │
│                                                          │
│  ┌─ rotation: spinning (+1) ────────────────────┐        │
│  │  ┌─ modifier: symposium (+1) ──────────┐    │        │
│  │  │  ┌─ modifier: paradox (+1) ──────┐ │    │        │
│  │  │  │  ┌─ modifier: ducking (+1) ─┐ │ │    │        │
│  │  │  │  │  ┌─ core: whirl (3) ──┐ │ │ │    │        │
│  │  │  │  │  └─────────────────────┘ │ │ │    │        │
│  │  │  │  └────────────────────────────┘ │ │    │        │
│  │  │  └───────────────────────────────────┘ │    │        │
│  │  └─────────────────────────────────────────┘    │        │
│  └──────────────────────────────────────────────────┘        │
│                                                          │
│  Total computed = 7 ADD                                  │
└──────────────────────────────────────────────────────────┘

[ Whirl family lineage by ADD tier ]
[ Related Tricks (role-coloured) ]
[ Parallel tricks (other 4-modifier whirls at 7 ADD) ]
[ Modifier ecosystem (ducking + paradox + symposium + spinning panels) ]
[ Mini relationship graph (Montage at centre; ladder vertical; cross-family horizontal) ]

[ Reference Media ]
[ Pathways ]
[ Previous / Next Tricks ]
[ Passback Records ]

[ Collapsed: Structural decomposition + parser diagnostic ]
[ Source footer ]
```

Sections rendered: 16-18. Token coloration: YES (5 tokens at h1 scale). Modifier-layering: YES (4 modifiers → nested boxes). Modifier-ecosystem: YES (each modifier appears in ≥ 3 other tricks). Mini graph: YES (densest neighbourhood in dictionary).

---

## 10. ASCII wireframes -- desktop and mobile

### 10.1 Desktop flagship (>= 1200 px) -- Matador

```
┌──── breadcrumb ─────────────────────────────────────────────────────┐
│ freestyle / tricks / butterfly family                               │
└─────────────────────────────────────────────────────────────────────┘

┌──── SCAN LAYER ─────────────────────────────────────────────────────┐
│                                                                     │
│   [nuclear]  [butterfly]                       butterfly family     │
│                                                5 ADD                │
│                                                7 kicks (record)     │
│                                                                     │
│   nuclear(+2) + butterfly(3) = 5 ADD                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐  ┌────────────────────────────┐
│                                     │  │ Short summary              │
│   [ featured media tile ]           │  │ Caption / source label     │
│                                     │  │ Featured-media metadata    │
└─────────────────────────────────────┘  └────────────────────────────┘

┌──── STUDY LAYER ────────────────────────────────────────────────────┐
│ About this trick                                                    │
│ Notation        Set notation (operational)                          │
│ Execution       Learning notes      Before you try this             │
│ Modifier-ecosystem panel (3 nuclear siblings cross-family)          │
│ butterfly family lineage (ADD-tiered)                               │
│ Related Tricks (role-coloured)                                      │
│ Parallel tricks (other 5-ADD butterflies)                           │
│ Reference Media grid                                                │
└─────────────────────────────────────────────────────────────────────┘

┌──── DIAGNOSTIC LAYER ───────────────────────────────────────────────┐
│ Pathways                                                            │
│ Previous Tricks                                                     │
│ Passback Records                                                    │
│ ▸ Structural decomposition (collapsed)                              │
│ Source footer                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Mobile flagship (375 px) -- Matador

```
┌────────────────────────────┐
│ freestyle / tricks /       │
│ butterfly family           │
│                            │
│ [nuclear] [butterfly]      │
│                            │
│ butterfly family           │
│ 5 ADD                      │
│ 7 kicks (record)           │
│                            │
│ nuclear(+2) +              │
│ butterfly(3) = 5 ADD       │
└────────────────────────────┘

┌────────────────────────────┐
│ [ featured media tile ]    │
│ Caption                    │
│ Source label               │
└────────────────────────────┘

[ Short summary ]
[ About this trick ]
[ Notation ]
[ Set notation (operational) ]
[ Execution ]
[ Learning notes ]
[ Before you try this ]

[ Modifier ecosystem -- vertical stack ]
[ Butterfly family ladder -- ADD-tiered ]
[ Related Tricks -- vertical ]
[ Parallel tricks -- vertical ]
[ Reference Media -- vertical stack ]
[ Pathways -- 3-row vertical ]
[ Previous Tricks -- vertical ]
[ Passback Records -- horizontally-scrollable table ]
[ ▸ Structural decomposition (collapsed) ]
[ Source footer ]
```

Mini relationship graph: hidden below 600 px. Modifier-ecosystem reflows to vertical chips. Each section stacks. Token coloration on the h1 wraps if necessary.

### 10.3 Mobile sparse (375 px) -- Toe Stall

```
┌────────────────────────────┐
│ freestyle / tricks         │
│                            │
│ toe stall                  │
│ atw family   1 ADD         │
│                            │
│ toe stall = 1 ADD          │
└────────────────────────────┘

[ Featured media empty-state ]
[ About this trick ]
[ Notation (single token) ]
[ atw family ladder ]
[ Pathways ]
[ Source footer ]
```

6 sections total. Honest empty state. No flagship surfaces.

---

## 11. Migration strategy

### 11.1 Three-stage migration

**Stage 1 -- Legacy + UX2 pilot coexistence (today's state).**
- `trick.hbs` renders 157 tricks; `trick-ux2.hbs` renders Montage + Matador + Mind Bender.
- Controller branches on `content.ux2Pilot` (slug allowlist via `UX2_PILOT_RAW`).

**Stage 2 -- Universal UX2 shell.**
- Extract scan / study / diagnostic layers into named partials.
- Build one shell template that composes the partials.
- New columns (`short_description`, `execution_summary`, `learning_notes`, `prerequisite_notes`, `featured_media_id`) added to `freestyle_tricks` via single ALTER TABLE migration (per `UX2_EDITORIAL_LAYOUT_PLAN.md` §6.1).
- Controller routes all tricks to the universal shell.
- Section presence is purely data-gated; allowlist constant retired.
- Existing UX2 prose for Montage / Matador / Mind Bender migrates from `UX2_PILOT_RAW` constant into the new columns.
- Legacy `trick.hbs` deleted.

**Stage 3 -- UX3 flagship enrichment.**
- Token-coloured h1 partial added (activates when modifier_links ≥ 2).
- ADD derivation formula partial replaces the current `dl` "How it's built" treatment.
- Family lineage ADD-tiered partial replaces flat family-ladder.
- Modifier-layering nested-boxes partial added (activates when modifier_links ≥ 3).
- Modifier-ecosystem panel partial added (activates by data presence).
- Parallel-tricks panel partial added (auto-derived).
- Mini relationship graph partial added (flagship; renders SVG server-side).

Each Stage 3 partial activates per its data-presence rule. No allowlist. No per-slug constant.

### 11.2 Risk mitigation

- Stage 2 ships the universal shell with NO new visualisations. The shell exists; the prototype-derived visualisations enter in Stage 3. This keeps each stage's risk bounded.
- Stage 3 partials each ship behind a feature flag (or as a separate PR per partial) so any one can be rolled back without affecting the others.
- Empty-state design carries over unchanged.
- Cool/warm palette discipline carries over unchanged.
- Federation-not-adoption carries over unchanged.

---

## 12. Architecture decision

Three candidate architectures:

### 12.1 Option A -- single HBS with conditional rendering

Pros: simplest mental model; one file = one route.
Cons: file becomes large (~1000+ lines) as more conditional sections land. Reuse of section logic across other surfaces (e.g., a future `/freestyle/families/:family` page) requires copy-paste.

### 12.2 Option B -- componentized partial system

Pros: each section is its own file; reuse across routes; smaller files; clearer ownership.
Cons: many files; navigation between files when reading the template increases cognitive load; Handlebars partial system can hide data-flow.

### 12.3 Option C -- hybrid

The shell is one template that composes a small set of named partials. Each partial owns one of the visualisations (token-coloured-h1, ADD-derivation-formula, family-lineage-tiered, modifier-layering, modifier-ecosystem, parallel-tricks, mini-graph). The shell handles section ordering + density-gating logic.

Pros: combines the readability of A (one shell file shows the page shape) with the modularity of B (each partial is small + reusable).
Cons: still has ~10 partials; requires discipline to keep each partial focused.

**Recommendation: Option C.** The shell file remains the source of truth for page composition. Partials are named after the visualisation they render. Naming convention: `partials/freestyle/trick-{section-key}.hbs` (e.g., `trick-hero-tokens.hbs`, `trick-add-formula.hbs`, `trick-family-lineage.hbs`).

Partial set (Stage 2 ships 6, Stage 3 ships 4 more):
- Stage 2: trick-hero, trick-quickstat, trick-prose-section (parameterised; renders execution/learning/prerequisite via params), trick-notation, trick-family-ladder, trick-media
- Stage 3: trick-hero-tokens, trick-add-formula, trick-modifier-layering, trick-modifier-ecosystem, trick-parallel, trick-mini-graph

---

## 13. What advances immediately without Red

| Area | Status | Notes |
|------|--------|-------|
| Layout architecture (universal shell) | ready | Pure HBS / TS work; no ontology dependency. |
| Editorial systems (prose schema columns) | ready | Single ALTER TABLE. Five new nullable columns; loader-19 extension is one-line per column. |
| Media surfaces (featured-media FK column) | ready | One new column + service shaping; FK to existing media_links. |
| Notation scaling (token coloration to h1) | ready | Reuses existing role classes + cssRole tokenisation. |
| Empty-state systems | ready | Already validated via UX2 pilot; carries over. |
| Family-ecosystem rendering | ready | Derived from existing family + modifier_links data. |
| Progression systems (ADD-tiered lineage) | ready | Pure presentation change on existing data. |
| Relationship rendering (mini graph) | ready | Server-rendered SVG, hand-curated layout, no graph library. |
| Modifier-ecosystem panel | ready | Derived from modifier_links. |
| Parallel-tricks panel | ready | Derived from base + modifier-count + ADD-tier. |
| ADD derivation formula | ready | Derived from modifier_links + base; weight lookups already in service. |

Nothing in UX3 design requires Red adjudication. All of UX3 is presentation work over existing ontology + new editorial prose.

What does need Red:
- pt12 same-side / blurry-non-rotational / fairy / paradox questions (separate track).
- These do not gate UX3 implementation; they may affect specific row content but not the shell.

---

## 14. Phased roadmap

### UX3a -- north-star synthesis (this document)
- Design exploration only. No code.
- Deliverable: `UX3_FLAGSHIP_SYNTHESIS.md`. Already in scope.

### UX3b -- universal shell prototype
- Build the universal-shell template (`trick-shell.hbs`) and the 6 Stage-2 partials.
- Migrate `content.ux2Pilot` constant data into new schema columns.
- Add the 5 prose columns + `featured_media_id` to `freestyle_tricks`.
- Service-layer shaping reads new columns; controller routes all tricks to the shell.
- Retire the `UX2_PILOT_RAW` constant.
- Delete legacy `trick.hbs` and `trick-ux2.hbs`.
- Test: full freestyle integration suite green; spot-check 10 representative slugs (atom / single-mod / 2-mod / 3-mod / 4-mod / atom-with-record / compound-with-record / sparse-family / dense-family / multiplicity-edge).

### UX3c -- progressive density activation
- Add density-aware rendering: section presence gated by data, not allowlist.
- Add quick-stat strip (atom form + formula form).
- Add ADD-tiered family lineage partial.

### UX3d -- flagship enrichment (visual layer)
- Add token-coloured h1 partial.
- Add ADD derivation formula partial.
- Add modifier-layering nested-boxes partial.

### UX3e -- relationship rendering (visual layer)
- Add modifier-ecosystem partial.
- Add parallel-tricks partial.
- Add mini relationship-graph partial (SVG, server-rendered).

### UX3f -- curator authoring expansion
- Authoring of `short_description` / `execution_summary` / `learning_notes` / `prerequisite_notes` / `featured_media_id` for top 30 tricks by record-count or family-density.
- Coordination with Dave's gallery-edit-tool for `featured_media_id` curation.
- Empty-state continues to render gracefully for the other ~130 tricks.

### UX3g -- legacy retirement
- Remove the gitignored screenshots / QC artifacts from active reference paths (or move to a cold-storage exploration directory).
- Update `docs/VIEW_CATALOG.md` and `docs/SERVICE_CATALOG.md` to reflect the universal shell.
- Retire `exploration/freestyle-notation-grammar/UX2_EDITORIAL_LAYOUT_PLAN.md` (superseded by UX3 docs).

Each phase is independently mergeable. Each preserves federation-not-adoption + parser/editorial separation + warm/cool palette + restraint-first + empty-state honesty.

---

## 15. Preservation guarantees (every phase)

| Contract | UX3 preserves it because |
|----------|--------------------------|
| Federation-not-adoption | No FM data auto-imports. Operational-notation seeding remains curator-mediated. FM evidence informs prose drafts but does not auto-publish. |
| Parser/editorial separation | Parser reads canonical_name only; editorial-decomposition table (base + modifier_links) is the math source. UX3 visualisations read from the editorial layer; they do not consult the parser layer for ADD math. |
| Restraint-first design | Every visualisation has a data-presence gate. Empty states render honestly. No fabricated content. |
| Warm vs cool palette | Semantic notation stays cool; operational notation stays warm. Token-coloured h1 reuses cool palette. No new colour categories. |
| Sparse-friendly rendering | Toe Stall renders in ~6 sections. Density tier is data-driven. No section forces itself onto sparse rows. |
| Empty-state honesty | Featured-media empty state preserved. Reference Media empty state preserved. Records absent → no Passback Records section. No fake content. |
| Asserted ADD is editorial truth | Computed ADD remains diagnostic-only. UX3 surfaces the editorial value as the visible total. |
| Public-facing prose hygiene | Per `feedback_public_facing_prose.md` -- no pt-batch / Red / James / adjudication / federation-not-adoption / dated curator-reviewed strings in any rendered prose. Source attribution preserved. |
| No client JS dependency | Mini relationship graph is server-rendered SVG. Native `<details>` for collapsed sections. Existing `video-facade` partial unchanged. |

---

## 16. Out of scope for UX3a

- No template / CSS / DB / prose / commit changes.
- No new partials authored.
- No schema migration executed.
- No React / Vue / componentization framework introduction.
- No client-side state machine.
- No GraphQL / federation-graph experimentation.
- No media-ingestion broadening.
- No ontology mutation; no modifier-weight changes; no parser logic changes.
- No removal of legacy surfaces.
- No retirement of `trick.hbs` or `trick-ux2.hbs` in UX3a (Stage 1 coexistence preserved).

---

## 17. Open questions for human review

1. **Density tier names.** "Sparse / Standard / Flagship" is descriptive but the labels appear nowhere in the UI. Acceptable, or should the tiers be invisible to readers entirely (no UI affordance indicates which tier a page is in)?
2. **Token-coloured h1 threshold.** Activation rule "modifier_links ≥ 2" is a defensible threshold. Should single-modifier-on-base rows (e.g. Matador = Nuclear Butterfly) also get the coloured treatment, since the structure is decomposable? Counter-argument: 1-modifier compounds look thin under coloration.
3. **Modifier-layering nested-boxes threshold.** Trigger at modifier_links ≥ 3 keeps the visualisation off 2-modifier compounds (Mind Bender = ducking + paradox + blender; 2 modifiers). Should the threshold be ≥ 2 so Mind Bender gets the visualisation, or ≥ 3 to reserve it for 3+ modifier compounds?
4. **Mini relationship graph -- include or defer to UX3f?** SVG is heavy authoring; the panel is borderline-load-bearing. Acceptable to defer the graph to a later phase even if other flagship enrichment lands in UX3e?
5. **Modifier-ecosystem panel scope.** "3 representative other tricks using this modifier" needs a representative-selection rule. Random? Highest-ADD? Same-family-first? Cross-family preferred? Defer the selection rule to UX3e implementation, or specify now?
6. **Universal shell name.** Recommendation: `views/freestyle/trick.hbs` (preserving the legacy filename, but rewriting its contents). Or `trick-shell.hbs`? Or `trick-detail.hbs` (matching the legacy VIEW_CATALOG.md intent)?
7. **Partial directory.** Recommendation: `views/partials/freestyle/trick-*.hbs`. Or under `views/freestyle/partials/`? Project convention check.
8. **Curator-authoring tooling.** Is `red_corrections_2026_04_20.csv` the right authoring surface for prose, or does authoring 5 prose fields x 30 tricks justify a dedicated tool (e.g., a YAML file per trick)? Out of scope to design; flagged for UX3f.
9. **Architecture commitment.** Confirm Option C (hybrid shell + partials). Or reopen the discussion to A (single template) or B (full partial system) before UX3b starts.

---

## 18. Companion artifacts (none authored in UX3a)

UX3a is a single deliverable: this document. No CSV, no screenshots, no code, no DB writes. Subsequent phases produce implementation artifacts; UX3a produces only the design.

When UX3b begins, expected artifacts:
- `UX3B_UNIVERSAL_SHELL_PLAN.md` -- the migration-execution doc
- `UX3B_PARTIAL_INVENTORY.md` -- the partial catalogue
- Schema migration SQL file
- Service-layer shape update plan
