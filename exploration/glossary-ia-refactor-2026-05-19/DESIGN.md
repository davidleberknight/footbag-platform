# Freestyle Glossary IA Refactor — Design Spec -- 2026-05-19

Information-architecture refactor for `/freestyle/glossary`. The glossary has outgrown its origin as a beginner-tutorial article and is now functioning as a hybrid ontology + notation + symbolic-composition reference system. This document proposes a navigable, layered, modular reference structure that preserves all existing content value while restoring scannability and reducing cognitive load.

**This document is a design deliverable, not implementation.** No code begins until a slice is curator-approved.

---

## Locked design defaults (2026-05-19)

Curator-approved defaults; treat as standing positions unless explicitly overridden by a future curator decision in a later session.

**Information architecture (locked).**
- 14-section hierarchical structure approved.
- Essay-style linear progression retired.
- Glossary becomes reference-first.

**Tier model (locked).**
- T1 = canonical (default visible).
- T2 = advanced / reference (collapsed by default).
- T3 = observational / editorial (collapsed by default).
- Badge vocabulary: `[advanced]` + `[observational]` only. `[historical]` and `[disputed]` retired (handled structurally via §13 and section content).

**Beginner / Intermediate / Advanced model (retired).**
- May remain as soft educational badges only.
- No longer the primary structural organizer.

**Jobs / Operational Notation elevation (locked).**
- Dedicated top-level §7 section.
- First-class glossary surface.

**ADD Accounting elevation (locked).**
- Dedicated top-level §8 section.
- Complementary formulas + decomposition chains included.

**Reference-card primitive (approved).**
- Default card fields: name · type · ADD weight · canonical formula · role · examples · expandable advanced details.
- Applies across §2-§6 + §11-§13.

**Root vs Branch family split (locked).**
- Root terminal families: whirl · butterfly · mirage · osis · swirl · rev-whirl.
- Branch families: torque · blender · drifter · barrage · blur · phoenix.

**Collapsible / accordion UX (locked).**
- Canonical material visible by default.
- Advanced material collapsed by default.
- Observational material collapsed by default.

**Sticky sidebar navigation (approved).**
- CSS-first `position: sticky` implementation.
- Mobile fallback acceptable.

**Large prose reduction (approved).**
- Bias toward: concise definitions · formulas · examples · cards · expandable detail.
- Avoid: sprawling essay paragraphs · repeated explanatory prose.

**Canonical vs observational separation (locked).**
- Observational topology and editorial theory must not visually dominate canonical glossary definitions.

**Four-layer philosophy (preserved).**
- canonical truth / symbolic decomposition / educational explanation / observational-editorial topology.

**No parser-AST UI overload (locked).**
- Avoid: compiler aesthetics · parser-debug surfaces · symbolic over-density · excessive token clutter.

**Phased implementation (approved).**
- P1: structural shell + sidebar + section reorder + collapsible scaffolding.
- P2: card primitives + prose compression + family restructuring.
- P3: notation expansion + ADD-accounting expansion + observational topology refinement.

**Anchor preservation (locked).**
- Existing pinned anchors remain stable unless explicitly migrated with redirects.

**Glossary positioning (locked).**
- The glossary is a movement-language reference + ontology surface + symbolic grammar guide + compositional reference + educational navigation layer.
- Not merely a glossary article.

---

## Executive summary

| What | Why |
|---|---|
| Replace the 12-section sequential essay with a **14-section hierarchical reference** organized around use modes (learning / quick reference / ontology) | The page is 917 lines today and reads as a single scrolling tutorial. It cannot serve quick reference at this length |
| Elevate **Jobs / Operational Notation** to a first-class top-level section with subsections, examples scannable in seconds | Notation is the strongest differentiator of the system; currently buried at §7 inside a "Symbolic Notation" header that mixes layers |
| Elevate **ADD Accounting** to a dedicated full section with worked examples + discrepancy cases + policy-dependent semantics | Currently a stub at §10 ("The ADD System") that routes to /freestyle/add-analysis; deserves to teach in place |
| Split canonical definitions from **observational / editorial / theoretical commentary** via `<details>` panels and `[advanced]` toggles | The current essay mixes canonical doctrine with observational topology + symbolic-compression theory in continuous prose. Readers cannot tell what's authoritative |
| **Card-format reference primitives** replace long prose blocks for entries with regular shape (modifiers, atoms, families) | The MODIFIERS section already follows a card pattern; extend the pattern to all canonical entries with the same structural fields (type / weight / formula / role / pairs / examples) |
| **Root vs Branch family separation** in the family view, each family collapsible | Current family section is sprawling; the Root/Branch distinction is the natural ontological seam |
| **Sticky sidebar nav + alphabetical anchors** for the 14 top-level sections | Current jump-nav lives in the body of the page; sticky sidebar makes each section reachable from anywhere in the document |
| **Migrate, do not delete** — observational notes, equivalence chains, network observations, symbolic grammar all move to clearly-labeled `[advanced]` panels | Preserves existing value; signals layer-of-claim explicitly |

---

## 1. Proposed glossary architecture

### 1.1 Design principles (load-bearing)

These principles drive every downstream decision and are tested against in §10's transformed examples:

1. **Three user modes coexist**: learning (sequential reading) / quick reference (anchor-jump to one definition) / ontology mode (compare related entries across surfaces). The architecture must serve all three from the same page.
2. **Canonical vs commentary is visible**: a reader skimming the page can distinguish curator-locked doctrine from observational commentary without reading the whole entry. Commentary lives under explicit `[advanced]` or `[observational]` disclosure.
3. **Card primitives dominate over prose**: entries with regular shape (modifiers, atoms, families, surfaces) render as labeled-field cards. Pedagogical scaffolding stays as prose but is compressed and confined.
4. **Beginner / Intermediate / Advanced as primary axis is retired**: replaced by the 14-section topical hierarchy. Pedagogical progressions can still exist (e.g. the walking-family example) but as embedded subsection content, not the page's primary navigation.
5. **Layer-of-claim is structurally encoded**: canonical doctrine sits at the top level of each section; symbolic decomposition sits in the second tier (often a card-detail); observational topology sits in collapsed `[observational]` panels; pedagogical scaffolding sits at section heads or in dedicated `[walking-example]` panels.
6. **Reuse over invention**: the refactor uses existing partials (operator-board, core-tricks-grid, freestyle-modifier-reference) + the just-shipped reference-shelf `<details>` pattern from `/freestyle`. No new shared partials needed for the pilot.
7. **Test-pinned anchors are forever-invariants**: ~24 `#term-{slug}` and `#glossary-panel-{term}` anchors are pinned by integration tests. Refactor preserves every one of them.

### 1.2 The four-layer philosophy (preserved)

The four-layer philosophy from glossary v5 stays intact. The IA refactor makes the layers visually distinct rather than collapsing them:

| Layer | Where it lives in the new structure | Rendering treatment |
|---|---|---|
| **Canonical truth** | Top-level section content; card primary fields | Default visible, no `<details>` wrapping |
| **Symbolic decomposition** | Card "decomposition" field; second-tier text | Default visible, smaller font, indented under the canonical field |
| **Educational explanation** | Section preambles; walking-example panels | Compressed prose; collapsed `[walking-example]` block when verbose |
| **Observational / editorial topology** | `[observational]` panels and Family & Topology Concepts (§11) | Collapsed `<details>` by default; clear "Observational" badge |

---

## 2. Section hierarchy

### 2.1 Top-level structure (14 sections)

| # | Section | Status | Primary purpose | Layer mix |
|---|---|---|---|---|
| 1 | **Core Concepts** | Existing (§1, rename) | Page identity + four-surface framing | Canonical + light pedagogy |
| 2 | **Contact Surfaces & Delays** | Existing (no change) | Foundational, foot, body-region, variants | Canonical only |
| 3 | **Dexterities** | Existing (no change) | Motion style, direction, execution window, quality | Canonical only |
| 4 | **Timing & Sets** | Existing (minor rename) | Timing clock + set vocabulary | Canonical only |
| 5 | **Core Trick Families** | Existing (rename), restructured | Root + Branch family separation; each collapsible | Canonical + observational |
| 6 | **Modifiers & Operators** | Existing (no change) | Modifier-reference partial + operator board | Canonical |
| 7 | **Jobs / Operational Notation** | Existing (rename + elevate) | Semantic, operational, flags, tokens, examples | Canonical + advanced |
| 8 | **ADD Accounting** | Net-new (extract + expand from §10) | Philosophy, weights, formulas, discrepancies, policy | Canonical + observational |
| 9 | **Symbolic Composition** | Existing (rename) | Composition + decomposition + compression theory | Canonical + observational |
| 10 | **Run Architecture** | Net-new (extract from current §10 + new prose) | Combo flow, sequence patterns, transitions | Pedagogical + canonical |
| 11 | **Family & Topology Concepts** | Existing (rename) | Connective panels (movement neighborhoods) + cross-axis observations | Observational |
| 12 | **Community Vocabulary** | Split from §11 | Folk names, regional variants, slang | Observational |
| 13 | **Historical Terms** | Split from §11 | Era-specific, deprecated, lineage notes | Historical observational |
| 14 | **Sources** | Existing (renumbered) | Attribution + canonical-reference list | Provenance |

### 2.2 Section-by-section subsection map

Compact view; expanded card details are in §10.

```
§1 Core Concepts
   • What is freestyle footbag? (1 sentence)
   • The four canonical surfaces (CONTACT / SET / DEX / DELAY)
   • The four-layer philosophy (canonical / symbolic / educational / observational)
   • How to use this page (1 paragraph; replaces current intro essay)

§2 Contact Surfaces & Delays
   • Foundational delays
   • Foot surfaces
   • Body-region surfaces
   • Variants
   (existing structure preserved exactly)

§3 Dexterities
   • Motion style
   • Direction
   • Execution window
   • Quality
   (existing structure preserved exactly)

§4 Timing & Sets
   • Timing clock (existing SVG)
   • Set vocabulary
   • Set modifiers (cross-link to §6)

§5 Core Trick Families
   • Root Terminal Families (whirl / butterfly / mirage / osis / swirl / rev-whirl)
     - One collapsible card per root family
   • Branch Families (torque / blender / drifter / barrage / blur / phoenix)
     - One collapsible card per branch family

§6 Modifiers & Operators
   • Modifier feel cards (existing partial; 13 cards)
   • Advanced decomposition reference (existing)
   • Intermediate operators (existing)
   • Execution mechanics (existing)
   • Set modifiers (existing)

§7 Jobs / Operational Notation                      ← ELEVATED
   • Semantic notation (compact-form)
   • Operational notation (Jobs lineage)
   • Component flags ([BOD] / [DEX] / [XBD] / [DEL] / [UNS])
   • Directional tokens (SAME / OP / IN / OUT)
   • Side tokens (FRONT / BACK / SIDE / TOP)
   • Sequencing operators (>, >>, plant markers)
   • State flags
   • Decomposition examples (collapsed; symbolic strip per atom)
   • Equivalence chains (collapsed; chain-registry preview)

§8 ADD Accounting                                   ← ELEVATED + NEW
   • ADD philosophy (flag-count doctrine)
   • Base trick weights (12 atoms with their ADD values)
   • Modifier weights (operator inventory with +1/+2 rotational table)
   • Additive formulas (operator + base = compound)
   • Complementary formulas (composite-modifier decompositions)
   • Decomposition chains (multi-step worked examples)
   • Discrepancy cases (open Red questions, doctrine-locked)
   • Policy-dependent semantics (counting-frame doctrine)
   • Historical conflicts (pre-2026 vs current)
   • Worked examples: mobius, blur, nuclear, quantum, baroque (each collapsible)

§9 Symbolic Composition
   • Compositional vocabulary
   • Decomposition patterns
   • Walking-family progression (existing; pedagogical; collapsed)
   • Symbolic compression theory (collapsed [observational])

§10 Run Architecture                                ← NEW
   • Combo flow basics
   • Sequence patterns
   • Transitions
   • (Cross-link to /freestyle/combo-analysis for full reference)

§11 Family & Topology Concepts
   • Movement neighborhoods (existing 6 connective panels)
   • Cross-axis relationships
   • [observational] Network analysis observations
   • [observational] Equivalence-chain theory

§12 Community Vocabulary                            ← SPLIT
   • Folk names (modern community)
   • Regional variants

§13 Historical Terms                                ← SPLIT
   • Deprecated names
   • Era-specific terminology
   • Lineage notes

§14 Sources                                         ← RENUMBERED
   • Attribution list
   • Canonical reference index
```

### 2.3 Why this hierarchy (rationale)

- **§1-§6 carry the canonical vocabulary** the reader must absorb to read any other surface. They retain their current order; readers familiar with the existing glossary find what they expect.
- **§7 (Jobs / Operational Notation) is the strongest differentiator** of the freestyle system. Elevated to position 7 (instead of buried at the current §7 under a generic "Symbolic Notation" heading), it now reads as a destination section, not as a continuation of the prior prose.
- **§8 (ADD Accounting) follows notation** because ADD math depends on notation flag-count doctrine. This is the natural pedagogical sequence: learn the surface vocabulary → learn the notation → learn how the notation drives the difficulty score.
- **§9 (Symbolic Composition) follows ADD** because composition operators (`compression`, `equivalence`) are the symbolic-grammar layer ABOVE both notation and ADD. Composition is "ontology pattern recognition" — it depends on the lower layers being clear first.
- **§10 (Run Architecture) is the new sequence-level pedagogy** complementing the trick-level vocabulary built in §1-§9. Mostly cross-links to /freestyle/combo-analysis; the section exists to anchor the cross-link rather than duplicate content.
- **§11-§13 are all observational + historical** and group naturally. Splitting §11 (current "Community & Historical Vocabulary") into §12 + §13 makes "folk names you'll hear today" distinct from "deprecated names you'll see in old footage."
- **§14 Sources** moves to the absolute end (currently §12; renumbered to §14 to make room for the new sections).

---

## 3. Accordion / collapse recommendations

### 3.1 Default-visible vs default-collapsed contract

The user said "expandable accordion-style sections where practical" — but not all sections benefit from being collapsed. The contract:

**Default visible (no `<details>` wrapper):**
- §1 (Core Concepts) — the one-screen page identity
- §2 / §3 / §4 — foundational vocabulary; these need to be browsable as definition lists, not collapsed
- §6 (Modifiers & Operators) entry-level cards (the 13 feel cards stay visible)
- §7 first-tier subsections (semantic / operational / flags / tokens) — these ARE the reference; collapsing them defeats quick-reference
- §8 first-tier subsections (philosophy / base trick weights / modifier weights) — same reasoning
- §11 connective panels are visible by default (small structured cards already)

**Default collapsed (`<details>` wrapped):**
- §5 each individual family card (root + branch) — large bodies; visitor expands only the family they need
- §6 advanced decomposition reference subsection — already its own conceptual layer
- §7 "Decomposition examples" subsection — long examples with operational chains; collapse to keep §7 scannable
- §7 "Equivalence chains" — chain-registry preview; collapse by default
- §8 each worked example (mobius / blur / nuclear / quantum / baroque) — show the section header always; expand the specific example
- §8 "Discrepancy cases" subsection
- §8 "Historical conflicts" subsection
- §9 "Walking-family progression" — pedagogical; long; collapse to keep §9 scannable
- §9 "Symbolic compression theory" — observational; collapse
- §11 "Network analysis observations" — observational
- §11 "Equivalence-chain theory" — observational
- §13 "Era-specific terminology" — long historical lists

**Visual treatment:** collapsed details use the same restrained palette as the just-shipped `/freestyle` reference shelf: small triangle marker + bold summary title + subdued summary lede. No heavy borders; the shelf-style border ring is reserved for the page-level reference shelf, not per-section.

### 3.2 The `[observational]` and `[advanced]` badge convention

Inside every section, content that's observational/editorial gets a small inline badge so the reader can scan for canonical-only material:

```
[observational]      — derived from corpus analysis, not curator-locked
[advanced]           — deeper material; safe to skip on first read
[historical]         — pre-2026 doctrine; preserved for lineage
[disputed]           — open Red question; doctrine not yet settled
```

These are CSS-classed inline chips, not separate sections. They let observational content live next to canonical without claiming canonical authority.

---

## 4. Card-format recommendations

### 4.1 The reference card primitive

Modifiers, atoms, families, and surfaces all share a similar regular shape. Standardize a single card primitive across all of them:

```
─────────────────────────────────────────────────────────────────
  PARADOX                                          [body modifier]
─────────────────────────────────────────────────────────────────
  ADD weight       +1
  Canonical formula  CLIP > OP IN [DEX]
  Role             entry topology modifier
  Pairs with       symposium, stepping
  Examples         paradox whirl, blur, torque

  ▸ Operational details                              [advanced]
  ▸ Decomposition examples                           [advanced]
  ▸ Related families                                 [observational]
  ▸ Disputed semantics                               [disputed]
─────────────────────────────────────────────────────────────────
```

**Card fields (canonical, always visible):**
- Title (capitalized term + type chip)
- ADD weight (numeric)
- Canonical formula (compact notation)
- Role (one-line role-in-grammar)
- Pairs with (1-3 commonly-paired modifiers)
- Examples (3-5 representative compounds)

**Card details (collapsed by default):**
- Operational details — full operational notation chains
- Decomposition examples — multi-step compositions
- Related families — observational topology cross-references
- Disputed semantics — open Red questions

### 4.2 Card applies-to inventory

| Section | Card shape applies? | Notes |
|---|---|---|
| §2 Contact Surfaces | YES | Each surface (toe / clipper / sole / etc.) is a card with surface name, abbreviation, position, common modifiers |
| §3 Dexterities | YES | Each dex axis (motion style / direction / execution / quality) is itself a section, but each dex VALUE is a card |
| §4 Sets | YES | Each set type (toe set / clipper set / pixie / symposium) is a card |
| §5 Families | YES | Each family is a collapsed card; expanded body has 6+ fields |
| §6 Modifiers | YES (already mostly) | Existing modifier-feel cards already follow this shape; extend with the standard field set |
| §7 Notation | NO | Notation is examples + tokens; reference tables, not cards |
| §8 ADD | NO at section level | Worked examples ARE cards (per slug); section-level content is tables + prose |
| §9 Composition | NO | Conceptual content; doesn't fit the card shape |
| §11 Topology | YES (connective panels = cards) | Existing connective panels already follow card shape; keep |
| §12 Community | YES | Each folk name is a card with canonical equivalent + region |
| §13 Historical | YES | Each historical term is a card with era + modern equivalent |

### 4.3 The Family card (§5 specific)

The family view is sprawling today. The card spec for §5:

```
─────────────────────────────────────────────────────────────────
  WHIRL                                            [root terminal family]
─────────────────────────────────────────────────────────────────
  Canonical formula  CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]
  Family anchor    whirl (3 ADD)
  Common descendants  blurry whirl · paradox whirl · gyro whirl
  Sibling families  butterfly · osis · swirl
  Notable compounds  mobius · blur · stepping paradox whirl

  ▸ Full descendant tree                             [advanced]
  ▸ Network observations                             [observational]
  ▸ Doctrine notes                                   [historical]
─────────────────────────────────────────────────────────────────
```

The Root vs Branch distinction lives in the type chip:
- `[root terminal family]` — whirl, butterfly, mirage, osis, swirl, rev-whirl
- `[branch family]` — torque, blender, drifter, barrage, blur, phoenix

Root families are full-depth ontology anchors (parents, not just compound expressions). Branch families are derived/compositional families that emerge from the root grammar.

---

## 5. Navigation recommendations

### 5.1 Sticky sidebar (primary navigation)

A left-rail sticky sidebar with the 14 top-level sections. Stays visible while the reader scrolls. On mobile (<768px) becomes a collapsed top-bar with a hamburger that opens a drawer.

```
┌────────────────────────┬─────────────────────────────────────┐
│ § Core Concepts        │  [Main glossary content scrolls]   │
│ § Surfaces & Delays    │                                    │
│ § Dexterities          │                                    │
│ § Timing & Sets        │                                    │
│ § Families             │                                    │
│ § Modifiers            │                                    │
│ § Notation             │                                    │
│ § ADD Accounting       │                                    │
│ § Composition          │                                    │
│ § Run Architecture     │                                    │
│ § Topology             │                                    │
│ § Community            │                                    │
│ § Historical           │                                    │
│ § Sources              │                                    │
│ ───────────────        │                                    │
│ Alphabetical index ▸   │                                    │
│ Search ▸               │                                    │
└────────────────────────┴─────────────────────────────────────┘
```

**Layout rules:**
- Desktop ≥1024px: sidebar 220px fixed left; main content takes the rest with max-width 760px
- Tablet 768-1023px: sidebar collapses to a horizontal scrollable strip below the hero
- Mobile <768px: sidebar becomes a sticky compact dropdown ("Jump to: ▾") at the top of the page

**Sticky sidebar must NOT require JS for the desktop layout.** The sidebar is server-rendered with `position: sticky; top: 0`. On mobile the dropdown is a native `<select>` styled to look like a button — JS-enhancement progressively adds drawer animation, but the `<select>` fallback works without JS.

### 5.2 Alphabetical index (secondary navigation)

A separate `/freestyle/glossary#alphabetical` page section (or a side-panel link) lists every defined term alphabetically with its anchor:

```
A: ATW · Atomic · Around the world (see ATW) · ...
B: Barrage · Blender · Blur · Body modifier · Butterfly · ...
C: Clipper · Clipper stall · Compact notation · ...
...
```

Renders once near the page foot. Reuses the existing `glossaryAnchors.ts` content module.

### 5.3 In-page anchors

Every card carries an anchor `#term-{slug}` so external surfaces can deep-link in. The 24 currently-pinned anchors are preserved verbatim:

| Pinned anchor set | Source test | Status |
|---|---|---|
| 6 `#glossary-panel-{term}` connective-panel anchors | `freestyle.glossary-anchors.routes.test.ts:64-70` | Preserved (panels move to §11) |
| 5 inline `#term-{slug}` (butterfly, clipper, mirage, stepping, cross-body) | same:73-79 | Preserved |
| 11 foundational-tricks `#term-{slug}` anchors | same:93-111 | Preserved (atoms move to §5 root-family cards) |
| 3 set-modifiers anchors (`#set-modifiers-tier-1`, `#term-pixie`, `#term-fairy`) | same:113-118 | Preserved |
| 7 §3 modifier reference anchors | same:120-129 | Preserved (modifier-reference partial stays in §6) |

### 5.4 Quick-jump links inside cards

When a card mentions a term defined elsewhere on the glossary, the term renders as a small `<a class="term-link">` with the appropriate anchor. Example: the Paradox card's "Pairs with: symposium, stepping" turns into:

```
Pairs with: <a href="#term-symposium">symposium</a>, <a href="#term-stepping">stepping</a>
```

No new content authoring needed — the `glossaryAnchors.ts` content module already has the slug→anchor mapping.

---

## 6. Migration plan from current structure

### 6.1 Phased migration (recommended)

Three phases, each independently shippable. Curator can stop at any phase.

| # | Phase | Scope | Risk |
|---|---|---|---|
| **P1** | **Structural shell + reorder** | Rebuild the section order to 14 sections; introduce the sticky sidebar; preserve every existing piece of content but move it to its new section. No new prose. No card-format changes yet. | Low — pure moves, anchors preserved |
| **P2** | **Card primitives + collapses** | Convert each modifier / family / atom into the standard reference-card primitive; introduce `<details>` collapses for the sections listed in §3.1; add `[observational]` / `[advanced]` badges. Compress identified prose blocks into card summaries. | Medium — visual rewrite; tests need updates |
| **P3** | **§7 + §8 expansion** | Expand §7 (Jobs / Operational Notation) with the 9 subsections + decomposition examples. Build §8 (ADD Accounting) from the §10 stub + the 5 worked examples (mobius / blur / nuclear / quantum / baroque). Build §10 (Run Architecture) cross-link anchor section. | Medium-high — net-new content; needs curator review of phrasing |

### 6.2 P1 — Structural shell (smallest useful slice)

If only one phase ships, it's P1. Concrete steps:

1. **Sidebar partial**: new `src/views/partials/glossary-sidebar.hbs` — 14 anchored section links + alphabetical-index link + sources link
2. **Template restructure**: rewrite `src/views/freestyle/glossary.hbs` so the existing 12 sections renumber to the new 14-section order. Move §10 stub content to the new §8 anchor. Split §11 into §12 + §13. Add stubs (single-paragraph placeholders) for the net-new content in §8 / §10 — to be filled in P3.
3. **Service**: rename `FreestyleGlossaryContent` fields if helpful, but **no shape changes required** for P1 — the existing 11 data fields all map cleanly.
4. **Anchor preservation**: every existing `#term-{slug}` and `#glossary-panel-{slug}` anchor stays at its new section location.
5. **Tests**: update section-heading text assertions in `freestyle.glossary-anchors.routes.test.ts`; anchor assertions unchanged.
6. **VC entry**: small update to docs/VIEW_CATALOG.md describing the new 14-section structure + sticky sidebar.

P1 ships in one PR; ~250-350 LOC delta.

### 6.3 P2 — Card primitives

After P1 is curator-approved:

1. **Card partial**: new `src/views/partials/glossary-reference-card.hbs` — accepts `{ slug, title, typeChip, fields[], detailPanels[] }`
2. **Service shape**: new types `GlossaryReferenceCard` + `GlossaryReferenceField` + `GlossaryReferenceDetailPanel`
3. **Section conversions**: in priority order — §6 (modifiers; mostly already cards), §5 (families; current sprawl), §2/§3 (surfaces + dex values), §11 (already cards; minor field-set alignment)
4. **Badge component**: small `<span class="glossary-layer-badge glossary-layer-badge--observational">[observational]</span>` partial — used inline across the page
5. **CSS**: card primitives, sidebar styling, sticky positioning, mobile drawer
6. **Prose compression**: the 6 long prose blocks identified in §7 below get compressed into card summary lines + collapsed `<details>` for their advanced commentary

P2 ships in 1-2 PRs depending on slice preference; ~400-600 LOC delta.

### 6.4 P3 — Section expansion

After P2:

1. **§7 (Jobs / Operational Notation) expansion**: 9 subsections authored. Decomposition examples + equivalence chains. Reuses existing notation tokenization helpers.
2. **§8 (ADD Accounting) full build**: the 9 subsections listed in §2.2. The 5 worked examples (mobius / blur / nuclear / quantum / baroque) become collapsed cards with the same structure as the first-class metadata strip from the resolved-trick pilot.
3. **§10 (Run Architecture)**: anchor section + cross-links. Likely 50-100 lines of glossary-side content; the heavy lifting stays at /freestyle/combo-analysis.

P3 ships in 1-3 PRs; ~500-800 LOC delta depending on prose density.

---

## 7. Identification of redundant prose blocks

The audit identified six prose blocks over 80 words that are candidates for compression into reference-card summaries or collapsed details:

| Section | Prose block | Word count | Type | Recommendation |
|---|---|---|---|---|
| §1 intro | "This glossary teaches how the freestyle language works..." | ~140 words | Pedagogical scaffolding | Compress to 1 sentence + 3-bullet "How to use this page" callout |
| §5 sibling-families | "Sibling terminal families..." (lines 298-311) | ~140 words | Canonical + observational | Move to a single root-family card's "Sibling families" field + a small `[observational]` panel for the cross-family observation |
| §5 family-membership | "Family membership is not..." (lines 289-297) | ~120 words | Canonical | Compress to the card type-chip (`[root terminal family]` vs `[branch family]`) + a 1-line clarification |
| §7 two-layers prose | "The two layers are complementary..." (lines 572-580) | ~100 words | Canonical clarification | Move to §7's preamble (1 sentence); the detail goes into a collapsed `[explainer]` panel |
| §8 future-note | "Forthcoming: the next layer..." (lines 749-757) | ~100 words | Pedagogical / roadmap | Delete or move to a single-line "See also: /freestyle/combo-analysis" cross-link |
| §12 sources framing | (lines 887-914) | ~200 words | Provenance scaffolding | Compress to a 1-sentence header + cleaner attribution list (current 6-item structured list is fine) |

**Total compression target**: ~750 words of prose → ~150 words. The other ~600 words either disappear (the "forthcoming" note) or move into collapsed `[advanced]` / `[observational]` panels where readers opting in to deeper context can still find them.

**What is NOT compressed:**
- The canonical definitions themselves (the DLs in §2 / §3 / §4) — these are already compact reference format
- The walking-family progression in §9 — strong pedagogical value as-is; just gets wrapped in a `<details>` so it doesn't dominate §9
- The 6 connective panels in §11 — already structured cards
- The modifier feel cards in §6 — already cards
- The 12 abbreviations and operational-token tables in §7 — already tabular

---

## 8. Canonical vs observational separation

### 8.1 Three explicit content tiers

The new structure encodes layer-of-claim into the visual hierarchy. Three tiers:

| Tier | Visual treatment | What lives here | Reader interpretation |
|---|---|---|---|
| **T1 Canonical** | Default visible; top-level card fields + section bodies | Curator-locked doctrine | "This is established" |
| **T2 Advanced (canonical, but deeper)** | Collapsed `<details>` with `[advanced]` badge | Operational details, decomposition examples, edge cases | "This is true; you can skip on a first read" |
| **T3 Observational** | Collapsed `<details>` with `[observational]` badge | Corpus observations, network analysis, equivalence-chain theory, symbolic compression theory | "This is interpretation; not curator-locked" |

A fourth implicit tier — **historical / disputed** — gets its own badges (`[historical]` / `[disputed]`) inside T2 or T3 panels when relevant.

### 8.2 Per-section T1/T2/T3 mix

Rough proportion estimates:

| Section | T1 | T2 | T3 | Notes |
|---|---:|---:|---:|---|
| §1 Core Concepts | 100% | — | — | Page identity is doctrine |
| §2 Surfaces | 100% | — | — | All canonical |
| §3 Dexterities | 100% | — | — | All canonical |
| §4 Timing & Sets | 100% | — | — | All canonical |
| §5 Families | 60% | 20% | 20% | Family anchors + descendants are canonical; full descendant trees are advanced; network observations are observational |
| §6 Modifiers | 70% | 20% | 10% | Feel cards canonical; advanced decomposition + intermediate operators are advanced; some "disputed semantics" callouts are observational |
| §7 Notation | 75% | 25% | — | Notation rules are canonical; long decomposition examples are advanced |
| §8 ADD Accounting | 50% | 30% | 20% | Doctrine is canonical; worked examples are advanced; counting-frame discussions + historical conflicts are observational |
| §9 Composition | 50% | 20% | 30% | Compositional vocabulary canonical; walking-example pedagogical (T2); symbolic compression theory observational |
| §10 Run Architecture | 40% | 20% | 40% | Thin canonical core; mostly observational + cross-link |
| §11 Topology | 30% | — | 70% | Connective panels are observational layer by definition |
| §12 Community | 50% | — | 50% | Folk-name → canonical mapping canonical; etymology / regional notes observational |
| §13 Historical | 30% | — | 70% | Deprecated → modern mapping canonical; era-specific commentary observational/historical |
| §14 Sources | 100% | — | — | Attribution is canonical |

### 8.3 The "observational" badge convention

Every `<details>` that wraps T3 content carries the observational badge on its summary:

```html
<details class="glossary-detail glossary-detail--observational">
  <summary class="glossary-detail-summary">
    <span class="glossary-detail-title">Whirl as central attractor</span>
    <span class="glossary-detail-badge glossary-detail-badge--observational">observational</span>
  </summary>
  <div class="glossary-detail-body">
    <p>Network analysis observation: whirl is the dictionary's most-connected family node...</p>
  </div>
</details>
```

This means: a reader who never expands `[observational]` panels still sees the full canonical glossary. A reader who opts in to all of them sees the full glossary v5 in its current form.

---

## 9. Recommended UI hierarchy

### 9.1 Page structure

```
─────────────────────────────────────────────────────────────────
  Hero                                                       (Zone H)
    Breadcrumb · Freestyle › Glossary
    h1: Freestyle Glossary
    subtitle: A movement-language reference for surfaces, dexterities,
              modifiers, notation, and the trick families they compose.
─────────────────────────────────────────────────────────────────
  Sidebar (sticky)              │  Main column (scrolls)        (Zone N + M)
  • 14 section links            │                                
  • Alphabetical index link     │  §1 Core Concepts            
  • Search (deferred)           │  §2 Surfaces & Delays         
                                │  ... (sections in order) ...  
                                │  §14 Sources                  
─────────────────────────────────────────────────────────────────
  Footer                                                      (Zone F)
    Cross-links to /freestyle, /freestyle/tricks, /freestyle/operators
─────────────────────────────────────────────────────────────────
```

### 9.2 Within a section

```
  ┌─ § Section title                                       (anchor)
  │   Section preamble (1-2 sentences; no prose dump)
  │
  │   ┌── Card 1 ────────────────────────────────────────┐
  │   │  Title                                  [type chip] │
  │   │  ─────────────────────────────────────────         │
  │   │  field 1   value                                   │
  │   │  field 2   value                                   │
  │   │  field 3   value                                   │
  │   │  ▸ Advanced details            [advanced]          │
  │   │  ▸ Observational notes         [observational]     │
  │   └─────────────────────────────────────────────────────┘
  │
  │   ┌── Card 2 ────────────────────────────────────────┐
  │   │  ...                                              │
  │   └────────────────────────────────────────────────────┘
  │
  │   Section footer link (cross-ref to deeper page)
  └─
```

### 9.3 The card primitive at scale

To prevent visual sprawl: cards are RELATIVELY uniform across §2-§13. The same field-row pattern (label-left, value-right) is used everywhere a card appears. Reader scanning §5 sees the same structure as in §6 + §11 + §12 — only the field labels and chip types differ. This is the load-bearing cognitive uniformity that makes the page scannable.

---

## 10. Concrete examples of transformed sections

This section shows BEFORE / AFTER for three high-impact transformations.

### 10.1 The Paradox modifier (§6)

**Before** (representative; current `freestyle-modifier-reference` partial output is similar):
```
PARADOX
The most common Tier-1 body modifier. A paradox is an in-dexterity
from the clipper position where the bag passes from the inside of
the body to the outside, with a half-rotation of the body to face
the bag at the end. Paradox enters most compounds as an "entry
topology" — it specifies how the bag arrives at the catching foot
rather than describing a full trick. Pairs with stepping (becomes
"blur"), symposium (becomes "paradox symposium whirl"), and other
modifiers freely. The canonical formula is CLIP > OP IN [DEX]...
[continues for ~120 more words]
```

**After** (reference card with collapsible advanced details):
```
─────────────────────────────────────────────────────────────────
  PARADOX                                            [body modifier]
─────────────────────────────────────────────────────────────────
  ADD weight        +1
  Canonical formula CLIP > OP IN [DEX]
  Role              entry topology modifier
  Pairs with        symposium · stepping · ducking
  Examples          paradox whirl · blur · paradox symposium whirl

  ▸ Operational details                              [advanced]
    The half-rotation transitions the bag from inside to outside
    of the body; the catching foot is on the opposite side.

  ▸ Decomposition examples                           [advanced]
    blur = stepping + paradox + mirage = 4 ADD
    nuclear ≈ paradox + atomic (curator-pending)

  ▸ Related modifiers                                [observational]
    Often cited as the "entry topology" parallel to symposium's
    "execution topology" — see §11 for cross-axis discussion.
─────────────────────────────────────────────────────────────────
```

The 120-word prose paragraph becomes 6 labeled fields + 3 collapsed details. A reader scanning §6 sees the card as one unit (6 lines visible); the reader who clicks an arrow sees the deeper material.

### 10.2 The Whirl family (§5)

**Before** (current §5 mixes prose + a `core-tricks-grid` partial; root vs branch not visually distinguished; family relationships scattered across 5 separate paragraphs).

**After** (root + branch separation + collapsible family cards):
```
─────────────────────────────────────────────────────────────────
  §5 Core Trick Families

  Tricks group into FAMILIES — clusters that share a base atom,
  a common modifier stack, or a structural anchor. Root terminal
  families are foundational ontology anchors; branch families
  derive from compositional grammar.
─────────────────────────────────────────────────────────────────

  Root Terminal Families

  ┌── whirl ────────────────────────────────────[root terminal]──┐
  │  Canonical formula  CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL] │
  │  Family anchor      whirl (3 ADD)                            │
  │  Common descendants blurry whirl · paradox whirl · gyro whirl│
  │  Sibling families   butterfly · osis · swirl                 │
  │  Notable compounds  mobius · blur · stepping paradox whirl   │
  │  ▸ Full descendant tree                       [advanced]     │
  │  ▸ Network observations                       [observational]│
  └───────────────────────────────────────────────────────────────┘

  ┌── butterfly ────────────────────────────────[root terminal]──┐
  │  ...                                                          │
  └───────────────────────────────────────────────────────────────┘

  [4 more root family cards: mirage · osis · swirl · rev-whirl]

  Branch Families

  ┌── torque ─────────────────────────────────────[branch]───────┐
  │  Canonical formula  CLIP > OP IN [DEX] > BACK SPIN [BOD] >   │
  │                     OP CLIP [XBD] [DEL]                       │
  │  Family anchor      torque (4 ADD)                            │
  │  Parent family      whirl                                     │
  │  Common descendants paradox torque · mobius · blurry torque   │
  │  Notable compounds  mobius · fury · paradox torque            │
  │  ▸ Full descendant tree                       [advanced]     │
  └───────────────────────────────────────────────────────────────┘

  [5 more branch family cards: blender · drifter · barrage · blur · phoenix]
─────────────────────────────────────────────────────────────────
```

The 280-word current family prose (lines 276-311) becomes a 2-sentence preamble + 12 card primitives. Each card collapses by default to show just its summary line (title + type chip + canonical formula line); expanded shows the 5 canonical fields + collapsed advanced + observational subpanels.

### 10.3 The Jobs / Operational Notation section (§7)

**Before** (current §7 is "Symbolic Notation"; mixes semantic + operational + tokens + examples + abbreviations + surfaces; ~270 lines; high density; no visual subsection hierarchy).

**After** (9 named subsections; each first-tier subsection visible, examples collapsed):
```
─────────────────────────────────────────────────────────────────
  §7 Jobs / Operational Notation

  Notation is the strongest differentiator of the freestyle system.
  Two layers coexist: the compact SEMANTIC form ("gyro torque") used
  for naming, and the operational JOBS form (originated 1995) that
  describes execution. Both are canonical; they encode different aspects.
─────────────────────────────────────────────────────────────────

  §7.1 Semantic notation (compact form)
       Definition: shorthand compositional reading of a compound.
       Example: gyro torque · stepping paradox mirage · blurry whirl
       Cross-reference: §9 Symbolic Composition for compression theory.

  §7.2 Operational notation (Jobs lineage)
       Definition: full ATAM-style chain describing execution mechanics.
       Originated 1995 (Ben Job). Carries bracket flags for ADD math.
       Example: torque = CLIP > OP IN [DEX] > BACK SPIN [BOD] > OP CLIP [XBD] [DEL]

  §7.3 Component flags
       [BOD]  body action (spin, jump, body movement)
       [DEX]  dexterity (in/out crossings)
       [XBD]  cross-body (foot crosses over support leg)
       [DEL]  delay (the catch)
       [UNS]  unusual surface (head, knee, etc.)
       Each flag contributes 1 ADD to the trick's official value.

  §7.4 Directional tokens
       SAME · OP · IN · OUT · SS · OS

  §7.5 Side tokens
       FRONT · BACK · SIDE · TOP

  §7.6 Sequencing operators
       >   primary sequence
       >>  step marker (no-plant transition)
       (plant)  explicit plant marker

  §7.7 State flags
       (back) (front) ...

  ▸ §7.8 Decomposition examples                      [advanced]
    Worked operational chains for the 12 core atoms.

  ▸ §7.9 Equivalence chains                          [advanced]
    Chain registry preview: e.g. mobius ≡ gyro torque ≡ spinning ss torque
─────────────────────────────────────────────────────────────────
```

§7.1-§7.7 are always visible (the canonical first-class reference). §7.8 + §7.9 are collapsed because they're long and meant for deeper study.

---

## 11. Risk analysis

### 11.1 Cognitive risk

| Risk | Mitigation |
|---|---|
| Too many sections (14) overwhelms first-time visitor | Sticky sidebar lets the reader see all 14 at once and pick. Sections are short for surface vocabulary (§2-§4) so the 14 don't all feel heavy. |
| Card primitive feels too uniform; sections start to look the same | Type chips (`[body modifier]`, `[root terminal family]`, `[surface]`, etc.) give each section a different visual rhythm. Layer badges + cross-link references break the monotony. |
| Observational content gets buried inside collapsed panels and feels less authoritative | Section §11 (Family & Topology Concepts) is still always-visible at its top level; observational panels live INSIDE it. The badge is a visibility signal, not a demotion. |

### 11.2 Implementation risk

| Risk | Mitigation |
|---|---|
| Anchor preservation breaks under refactor | 24 pinned anchors enumerated in §5.3; refactor preserves each one. Tests fail loudly if any are dropped. |
| `<details>` everywhere creates JS-free progressive-enhancement issues | `<details>` is native HTML; no JS needed. The sticky sidebar uses `position: sticky` (CSS-only). The mobile drawer uses a native `<select>` fallback. |
| Refactor blows up template line count | Current template is 917 lines. P1 (structural shell) likely stays around 1100; P2 (cards) tightens it back down to ~900-1000; P3 (expansion) goes to ~1500. Manageable if a new partial `glossary-reference-card.hbs` carries the card render. |

### 11.3 Doctrine risk

| Risk | Mitigation |
|---|---|
| New §8 (ADD Accounting) duplicates /freestyle/add-analysis | §8 stays as a glossary-level summary + cross-link to /freestyle/add-analysis. The 5 worked examples are short; the full formula sprints stay at /freestyle/add-analysis. |
| New §10 (Run Architecture) creates a hollow stub | §10 is essentially a cross-link anchor to /freestyle/combo-analysis. No new doctrine; just an explicit pointer at the right point in the reader's pedagogical path. |
| §12 + §13 split fragments folk-name lookup | Both sections render on the same page; alphabetical index sees both. Reader landing from a search lands on the right card regardless of which section. |
| Curator commentary moved to `[observational]` panels gets lost | Panels live next to canonical content (NOT in a separate section). A curator update only affects the panel; reader scrolling sees it. The badge signals optional content, not invisible content. |

---

## 12. What this document does NOT propose

- Does not delete any canonical content
- Does not delete equivalence chains, operator decompositions, movement neighborhoods, observational notes, or symbolic grammar concepts (per the explicit preservation directive)
- Does not introduce client-side JS (sticky sidebar is CSS; `<details>` is native HTML)
- Does not propose Beginner/Intermediate/Advanced as primary navigation (retired per the design principle)
- Does not propose a separate "Advanced Glossary" page — depth lives in collapsed `[advanced]` panels, not a separate URL
- Does not commit code

---

## 13. Curator decisions (resolved 2026-05-19)

All 8 open decisions answered. Resolutions:

1. **Card primitive scope**: ✓ **Full P2** — apply across §2-§6 + §11-§13 in one P2 PR.
2. **Sticky sidebar implementation**: ✓ **CSS-only `position: sticky`** — no JS dependency; mobile fallback to native `<select>`.
3. **`<details>` polish**: ✓ **Minimal CSS** — same restrained styling as `/freestyle` reference shelf + Phase B Tier-4 disclosure + observational compact cards.
4. **Layer badges**: ✓ **Two only — `[advanced]` + `[observational]`**. Drops `[historical]` (§13 is the historical section; badge redundant) and `[disputed]` (open Red questions surface via section content, not inline chips).
5. **Type chip vocabulary**: ✓ **Approved as proposed**. 13 chip values: `[body modifier]`, `[set modifier]`, `[root terminal family]`, `[branch family]`, `[foot surface]`, `[body-region surface]`, `[delay variant]`, `[dex axis]`, `[dex value]`, `[set type]`, `[movement neighborhood]`, `[folk name]`, `[historical term]`.
6. **§10 Run Architecture scope**: ✓ **Thin cross-link anchor**. ~50 lines; short paragraph + cross-link to `/freestyle/combo-analysis`. No new doctrine on the glossary.
7. **§12 + §13 split rule**: ✓ **Folk = still actively used today; Historical = retired/era-specific**. Borderline cases (regional but unknown elsewhere) go to Community by default.
8. **P1 ship order**: ✓ **Structural shell + reorder first — single PR**. ~300 LOC. P2 (cards + collapses) + P3 (§7 + §8 expansion + §10 anchor) follow only after P1 is curator-validated live.

---

## 14. Suggested implementation sequence

Per §6.1, three phases:

| Phase | Effort | Risk | Curator approval point |
|---|---|---|---|
| P1 — structural shell + reorder + sidebar | ~3-5 hours work; ~300 LOC | Low | After §13 decisions resolved |
| P2 — card primitives + collapses + prose compression | ~6-10 hours work; ~500 LOC | Medium | After P1 visual review |
| P3 — §7 + §8 expansion + §10 anchor | ~8-12 hours work; ~700 LOC | Medium-high (new prose) | After P2 visual review |

**Recommendation**: Approve P1 first. After P1 ships and curator reviews the 14-section reorder + sticky sidebar live, P2 + P3 inherit a curator-tested foundation. Each subsequent phase can iterate without re-deciding the architecture.

---

## 15. Cross-references

- Current glossary template: `src/views/freestyle/glossary.hbs`
- Current glossary service: `freestyleService.getGlossaryPage()` (lines 5349-5424)
- Existing partials reused: `core-tricks-grid`, `freestyle-modifier-reference`, `operator-board`
- Pattern reuse: `freestyle-reference-shelf` (the just-shipped `<details>` pattern on /freestyle landing)
- Pattern reuse: `trick-first-class-strip` (Wikipedia-infobox-style bordered card)
- Pattern reuse: `trick-add-analysis-disclosure` (collapsed Tier-4 ADD-derivation pattern)
- Test pins: `tests/integration/freestyle.glossary-anchors.routes.test.ts` + `freestyle.glossary-slice-c.routes.test.ts` + `freestyle.glossary-connective-panels.routes.test.ts`
- VC entry to update: `docs/VIEW_CATALOG.md` (freestyle glossary entry)

---

## Approval gate

This document is a design proposal. No code changes are pending. Curator review of the 8 open decisions in §13 is the gate to P1.

Recommended next step: walk through §13 decisions in order; once decided, P1 begins with a single PR (structural shell + reorder + sidebar) targeted at ~300 LOC.
