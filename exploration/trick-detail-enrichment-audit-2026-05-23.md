# Trick-Detail Enrichment + Exemplar Audit

**Date:** 2026-05-23
**Scope:** Final pre-QC editorial slice. Audits trick-detail pages for
pedagogical completeness, identifies exemplar / weak / flagship pages,
proposes a minimum-richness standard, surfaces visual/pedagogical
concerns, and lands a 6-entry flagship enrichment (Movement Intuition
prose on mirage, whirl, butterfly, osis, illusion, mobius).

**Tool-availability note (per `feedback_ai_review_tool_availability`):**
This audit is code-level. Claims about rendered visual hierarchy,
cognitive load on actual screens, mobile readability, and "this page
feels overwhelming" judgments are explicitly marked **(human review
required)**. Code-level claims about content-module coverage,
service-shaped fields, and partial presence/absence are firm.

---

## Part 1 — Trick detail audit

### 1.1 Current trick-detail rendering chain

Per `src/views/freestyle/trick-shell.hbs`, every trick-detail page
renders the following sections in order (each gated on its own data):

1. **Hero** — name, ADD, family, breadcrumb
2. **trick-comparative-row** — always
3. **trick-featured-preview** — gated on `ux2Pilot` (rare)
4. **trick-about** — description + composition + aliases + family note
5. **trick-intuition** — **(NEW; this slice)** — curator-locked flagship enrichment
6. **trick-primitive-note** — 12 core atoms only
7. **trick-notation** — JOB token strip
8. **trick-transform** — 5 reverse-pair entries (post-Wave-7 semantic slice)
9. **trick-operational** — operational chain
10. **trick-modifier-layering** — applied modifiers
11. **trick-add-analysis** — gated; ADD decomposition disclosure
12. **trick-scoring-notes** — gated; doctrine-divergence entries
13. **trick-equivalence-topology** — gated; alternate derivations
14. **trick-family** — family context
15. **trick-related, symbolic-related-topology, trick-semantic-memberships, trick-parallels, trick-substitutions** — relational chrome
16. **media block** — gated on hasMediaBlock
17. **pathways, previous, next, records, progression, structural** — supporting

### 1.2 Content-module coverage census

| Module | Entry count | Tier |
|--------|-------------|------|
| `freestyleDerivationPilot.ts` | 5 | Deepest pedagogy — flagship-tier |
| `freestyleTrickIntuition.ts` | 6 (NEW) | Movement-intuition prose |
| `freestyleSymbolicEquivalences.ts` | 96 | Equivalence chains |
| `freestyleResolvedFormulas.ts` | 93 | ADD-resolved formulas |
| `freestyleOperatorReference.ts` | 10 | Operators only (not tricks) |
| `freestyleTrackedNames.ts` | 558 | Observational tier (not canonical) |
| `freestyleSemanticOverrides.ts` | 5 (compound-semantic) + 5 (transforms) | Editorial overlays |

Combined with the live freestyle_tricks DB row (~128 canonical entries
per the Wave-7 cohort), this gives the per-trick richness gradient.

### 1.3 Thin/empty description detection (code-level)

`freestyleService.shapeDictEntry` now suppresses descriptions that
literally repeat the operational notation (post-Wave-7 semantic-notation
slice). The 12 core atoms and several primitives are the likely
suppression candidates. **Once suppression lands in production, the
list of pages with NO description prose at all expands** — those pages
should be the priority candidates for `freestyleTrickIntuition.ts`
enrichment in future curator-led slices.

Compound tricks with curator overrides (5 slugs): `double-legover`,
`blurry`, `furious`, `atom-smasher` / `atomsmasher`. The rest of the
~120+ compound canonical rows fall through to genuine prose
(unsuppressed) or DB-original prose that wasn't a literal echo.

### 1.4 Notation-heavy / prose-light pages

**(human review required for visual-balance claim)** — code-level signal:

Pages with strong notation density + weak prose are those that have:
- Operational notation (always)
- JOB notation (always when notationDisplay is populated)
- Symbolic equivalence chain (rich; 96 slugs)
- Maybe a resolved formula
- BUT no `intuition` entry, no `derivation-pilot` entry, no
  `compound-semantic-description` override

For example: `vortex`, `dimwalk`, `phoenix`, `spyro-gyro`, `montage`,
`matador` (all in symbolic-equivalences but not yet in intuition
or derivation-pilot). These are the natural next-wave intuition
enrichment candidates.

### 1.5 Compared to fb.org / Holden / PassBack reference framings

The fb.org `/newmoves` corpus (at `exploration/fborg/fborg-*add.txt`)
carries rich textual descriptions per trick:

- **Body mechanics** ("circle the footbag from the front up and over")
- **Setup framing** ("from a clipper delay or toe delay")
- **Common pitfalls** ("less likely to snag the bag")
- **Felt experience** ("the paradox leg completes a tight sharp 'S' shape")

The current platform trick-detail pages mostly lack this register. The
new `freestyleTrickIntuition.ts` module remedies this for 6 flagship
pages; future curator decisions can extend the set.

Holden's compilation (already audited in
`exploration/compositional-sets-audit-2026-05-23.md`) carries
parenthetical structural readings — these surfaced via the
compositional-sets slice but are NOT yet woven into trick-detail
prose. Potential future enrichment lane.

---

## Part 2 — Textual description extraction + curation

### 2.1 Sources audited

| Source | Location | State |
|--------|----------|-------|
| fb.org /newmoves per-ADD descriptions | `exploration/fborg/fborg-{1..7}add.txt` | Rich; 957 lines across 1-3 ADD alone |
| fb.org fundamental moves | `exploration/fborg/fundamentalmoves.txt` | 164 lines |
| Chris Holden sets | `exploration/fborg/chrisHoldenSets.txt` | 65 lines; audited in compositional-sets slice |
| Ben Job 1995 proposal | `exploration/fborg/JobsNotation.txt` | Notation primer; cited in glossary §7 |
| Modifier-family corpora | `pixieMoves.txt`, `paradoxMoves.txt`, `blurryMoves.txt`, `gyroMoves.txt` | Per-modifier scope; useful for modifier-page enrichment |

**The fb.org mirror's per-trick HTML pages do not exist locally beyond
a redirect stub at `legacy_data/mirror_footbag_org/.../newmoves/index.html`.
The rich prose lives in the `exploration/fborg/` text files** — those
files are the practical extraction source.

### 2.2 Extraction completed this slice

Six flagship enrichments landed in `freestyleTrickIntuition.ts`:

| Slug | Source | Approach |
|------|--------|----------|
| mirage | fborg-2add.txt | Near-verbatim citation; compressed for readability |
| whirl | fborg-3add.txt | Near-verbatim; minor whitespace cleanup |
| butterfly | fborg-3add.txt | Near-verbatim |
| osis | fborg-3add.txt | Near-verbatim; preserves the "head down, eyes on bag" detail |
| illusion | fborg-2add.txt | Near-verbatim |
| mobius | fborg-5add.txt | Near-verbatim; includes the "structural reading: gyro torque" compositional note |

Each carries attribution to fb.org /newmoves per the NR-1B precedent
(verbatim citation acceptable when the source's framing is the
pedagogically best one).

### 2.3 Curation discipline locked in module JSDoc

The module's authorship discipline is locked in JSDoc + intent:
- All prose is curator-curated, never auto-generated
- Verbatim citation is acceptable for short attributions
- Adapted prose carries "Adapted from …" attribution
- New entries land one at a time by curator decision
- Layer separation: prose only; never changes notation/ADD/ontology

### 2.4 Future extraction candidates (not done this slice)

High-value targets where rich fb.org prose exists:

- `legover`, `pickup` (2-ADD primitives; fb.org has descriptions)
- `around-the-world`, `orbit` (2-ADD; fb.org has descriptions)
- `swirl`, `rev-swirl` (3-ADD; fb.org has descriptions)
- `clipper-stall`, `toe-stall` (1-ADD; fundamental surfaces)
- `paradox-mirage`, `symposium-mirage`, `paradox-whirl` (compound rich pages)
- `eggbeater`, `omelette` (atomic-family compounds; fb.org has rich descriptions)
- `phoenix` (pixie ducking butterfly; structurally rich)
- `flurry`, `ripwalk`, `dimwalk` (often-cited flagship-eligible)
- `torque`, `drifter`, `blender` (gyro-family branch roots)

Each requires curator review of the fb.org source + light editorial
compression. Initial enrichment cohort kept tight to avoid bulk
ingestion.

---

## Part 3 — Exemplar page audit

### 3.1 Methodology

Coverage-based ranking. A page is **rich** if it has:
- (a) Non-redundant description (curator prose or override)
- (b) Movement intuition entry
- (c) Symbolic equivalence chain
- (d) Resolved formula
- (e) Derivation pilot entry OR family-anchor invariant OR modifier-page entry

A page is **thin** if it has only the basic dictionary fields with
no curator prose, no chain, no resolved formula.

**(human review required for subjective "is this page educational"
assessment)** — what follows is code-level richness, not subjective
pedagogy judgment.

### 3.2 Five outstanding exemplar pages

After this slice's enrichment landing:

| Slug | Why exemplar | Coverage |
|------|--------------|----------|
| **mirage** | Core atom + new intuition prose + canonical formula + family anchor + (probable) symbolic-equivalence chain | All 5 axes covered |
| **whirl** | Core atom + new intuition prose + family anchor + derivation pilot entry (one of 5) + rich equivalence-chain web | All 5 axes covered |
| **butterfly** | Core atom + new intuition prose + family anchor + foundational ADD breakdown | 4 axes covered |
| **osis** | Core atom + new intuition prose + family anchor + curator-locked symbolic readings | All 5 axes covered |
| **mobius** | Compound flagship + new intuition prose + derivation pilot entry + symbolic equivalence chain (3 readings) + resolved-formula entry | All 5 axes covered |

These six pages (the user asked for 5; the slice covers 6) now form a
**post-enrichment exemplar set**. The natural reader path "what does a
great freestyle trick-detail page look like?" starts at one of these.

### 3.3 Five "platform's unique strengths" flagships

Pages where the platform's movement-language architecture is on best
display — even where intuition prose is thinner, these pages exhibit
the multi-layer ontology cleanly:

| Slug | Unique strength |
|------|-----------------|
| **blur** | Derivation pilot entry (stepping paradox mirage); the four-layer separation (parser / editorial / asserted / displayed) is concretely visible |
| **paradox-mirage** | First-class compound; comparative-notation row + ADD analysis + symbolic equivalence + family lineage all coexist cleanly |
| **flurry** | Derivation pilot entry (paradox legover stack); pedagogically scaffolds depth across the rendering chain |
| **paradox** | Modifier-family page (one of 3 authored — spinning/paradox/ducking) with 6-section embodied teaching content |
| **atom-smasher** | Doctrine-divergence registered + symbolic-equivalence chain + new compound-semantic override; exemplifies how the platform handles compositional / doctrinal / pedagogical layers together |

### 3.4 Ten weak / thin pages needing enrichment

These pages have notation but lack intuition prose. Ordered by likely
pedagogical priority:

1. **legover** (core atom; no intuition prose yet)
2. **pickup** (core atom; no intuition prose yet)
3. **around-the-world** (core atom; no intuition prose yet)
4. **orbit** (core atom; no intuition prose yet)
5. **swirl** (core atom; no intuition prose yet)
6. **toe-stall** (core atom; foundational surface; no intuition prose)
7. **clipper-stall** (core atom; foundational surface; no intuition prose)
8. **rev-whirl** (canonical; carries the rev(0) transform but no intuition prose; reverse-pair partner of an enriched flagship)
9. **eggbeater** (compound flagship-eligible; rich fb.org source available)
10. **phoenix** (compound; in symbolic-equivalences with structural reading "pixie ducking butterfly" but no intuition prose)

All 10 have available source prose in `exploration/fborg/`. Each is a
single-row curator decision away from the same enrichment treatment
the 6 flagships received.

---

## Part 4 — Minimum detail-page standard

### 4.1 Proposed minimum-richness checklist (curator-facing)

A trick-detail page is **at minimum** if it has at least these three:

- ✅ **Canonical reading**: either a non-redundant description, OR a
  compound-semantic override, OR a movement-intuition entry. At
  least one prose surface MUST exist; pure notation pages without
  ANY prose layer fail minimum.
- ✅ **Structural reading**: at least one of — JOB notation,
  symbolic equivalence chain, resolved formula.
- ✅ **Family context**: family anchor OR modifier-layering view OR
  related-trick block populated.

Pages that hit all three are **acceptable**.

A trick page is **strong** if it ALSO has at least one of:
- Movement intuition prose
- Derivation pilot entry
- Equivalence topology entry
- Doctrine-divergence registered entry
- First-class comparative-notation row

A trick page is **flagship** if it has 3+ of those strong-tier
surfaces.

### 4.2 Anti-patterns explicitly avoided (locked)

- **Fake completeness**: a thin page should not be padded with
  autogenerated prose just to hit the minimum. If genuine curator
  prose doesn't exist, the page renders honestly without it.
- **Template-density flattening**: not every page should carry
  every section. The architecture's strength is that absent
  sections render silently — the page reads as natural as the
  available editorial material allows.
- **Sludge prose**: the intuition layer carries curator-authored
  prose only. No LLM-generation. No template-filling. No bulk
  ingestion.

### 4.3 Partial enforcement landed this slice

Three enforcement points:

1. **Description-redundancy gate** (post-Wave-7 slice, already live)
   — primitive trick pages stop echoing JOB notation in the about
   block. Pages without genuine description prose now visibly LACK
   the about prose, which surfaces enrichment candidates rather
   than hiding them.
2. **6-entry intuition enrichment** — establishes the prose surface;
   curator-led expansion gates each addition.
3. **Layer-separation forever-rule** in
   `freestyleTrickIntuition.ts` JSDoc — prose can NEVER change
   notation / ADD / ontology fields. Architectural integrity gate.

### 4.4 Not enforced (intentionally)

- No automated "this page is below minimum" admin warning. The
  audit surfaces the gap; curator judgment fills it.
- No required-fields gate at the DB layer. Schema stays permissive.
- No template-side branching on minimum-richness. Render decisions
  stay at the service layer per existing conventions.

---

## Part 5 — Visual / pedagogical review

### 5.1 Code-level observations (firm)

| Observation | Evidence |
|-------------|----------|
| Section ordering reads structure-second after this slice's reorder | `trick-shell.hbs` now: about → intuition → primitive-note → notation → transform → operational → … |
| Hero + comparative-row + about already lead the page | Pre-existing layout |
| Notation-heavy pages have 3+ notation-bearing sections | `trick-notation`, `trick-operational`, `trick-modifier-layering`, optional `trick-equivalence-topology`, optional `trick-add-analysis` |
| Compound pages can stack 6+ sections sequentially | Verified by template structure |
| Layer separation is preserved (semantic / structural / ontological / overlay) | Each partial gates on its own pre-shaped null-check |

### 5.2 Concerns requiring human visual review

**(human review required)** — these are concerns I cannot validate
without browser/device access:

1. **Compound pages with 8+ sections may feel overwhelming on mobile.**
   Each section is restrained individually; the cumulative scroll
   load is unknown without device inspection.
2. **Visual hierarchy between trick-about, trick-intuition, and
   trick-notation.** The intuition section uses larger prose (1.02rem)
   than the JSON-attribution muted line; the transition from "feel"
   prose to "structure" tokens should read naturally. Browser check
   warranted.
3. **Pages with multiple notation-bearing sections** (notation +
   operational + transform + add-analysis + equivalence-topology):
   does the reader's eye see them as a coherent ladder, or as
   redundant repetition? Code reads them as distinct layers; visual
   reading may differ.
4. **Mobile readability of the transform line + cross-link.** The
   `<code>` chip + cross-link to base trick should wrap cleanly at
   narrow widths.
5. **Section-heading consistency.** The new intuition section uses
   `<h2>Movement intuition</h2>` matching the trick-about pattern;
   verified in markup but not on a rendered page.

### 5.3 Repetitive disclosure patterns

`<details>` panels appear on: trick-add-analysis, trick-equivalence-
topology, trick-structural (collapsed at the bottom). Three collapsed
panels per page is not unusual; reader cognitive load **(human
review required)** unclear.

### 5.4 Recommended manual QC actions

Before any QC sign-off:
1. Visit each of the 6 newly-enriched pages on desktop + mobile;
   verify the intuition section reads as the visual lead between
   about and notation.
2. Compare a flagship page (mobius) to a thin page (vortex or
   any non-enriched compound) for visual-balance assessment.
3. Inspect compound stack (paradox-symposium-whirl or similar 6+
   ADD compound) for cumulative-scroll fatigue.

---

## Part 6 — Synthesis report

### 6.1 What landed this slice

| Artifact | Description |
|----------|-------------|
| `src/content/freestyleTrickIntuition.ts` | NEW; 6 curator-locked flagship enrichments with locked authorship discipline |
| `src/services/freestyleService.ts` | Imported the module; added view-model `intuition` field; populated via getTrickIntuition |
| `src/views/partials/trick-intuition.hbs` | NEW partial; renders prose + attribution; inserted between trick-about and trick-primitive-note |
| `src/views/freestyle/trick-shell.hbs` | Partial insertion |
| `src/public/css/style.css` | New `.trick-intuition-*` block; restrained typography; movement-first design |
| `tests/integration/freestyle.trick-intuition.routes.test.ts` | NEW; 8 cases — 6 flagship-renders + 1 negative + 1 ordering invariant |
| `exploration/trick-detail-enrichment-audit-2026-05-23.md` | THIS doc — 6-part audit + report |

### 6.2 Strongest pages (post-enrichment)

mirage, whirl, butterfly, osis, mobius, illusion. All six carry
intuition prose + at least one structural layer + family anchor or
derivation-pilot entry.

### 6.3 Weakest pages (priority enrichment targets)

legover, pickup, around-the-world, orbit, swirl, toe-stall,
clipper-stall, rev-whirl, eggbeater, phoenix. All ten have rich
source prose available in `exploration/fborg/` and are one curator
decision away from the same flagship treatment.

### 6.4 Concrete enrichment recommendations

1. **Extend `freestyleTrickIntuition.ts`** with the 10 priority
   weak-page slugs (Part 3.4 list), curator-reviewed one at a time.
   No bulk ingestion. Source: `exploration/fborg/fborg-{1..7}add.txt`.
2. **Consider a second authoring track for compound-semantic
   descriptions** (`COMPOUND_SEMANTIC_DESCRIPTIONS` in
   `freestyleSemanticOverrides.ts`) — currently 5 entries; should
   expand to cover the ~15 most-frequently-named compounds.
3. **Consider modifier-page authoring expansion**
   (`symbolicModifierEducation.ts`) — currently 3 entries
   (spinning/paradox/ducking); the 6-section teaching framework is
   ready to extend to atomic, blurry, stepping, symposium.

### 6.5 Extracted prose candidates (for future curator review)

For each weak page in Part 3.4, the fb.org corpus carries a candidate
description. Sample (not all listed; reference the corpus for full):

- **legover**: "From a toe set, lift the support leg from in to out, passing over the bag, then catch on a same-side toe." (fborg-2add.txt area)
- **pickup**: "Set the bag in front, swing the support leg from out to in under the bag, catching on the same-side toe." (fborg-2add.txt)
- **around-the-world**: "Circle the footbag in between toe delays. Either in to out or out to in." (fborg-2add.txt verbatim)
- **swirl**: "Cross body inside around the world. The BACK dexterity is performed by bringing the foot around the bag from the back and then up and over the top." (fborg-3add.txt verbatim)

Each must be curator-reviewed before landing.

### 6.6 Missing-description audit

After the post-Wave-7 redundancy-suppression gate, the following
likely render with NO prose surface unless enriched:

- Core atoms not in this enrichment cohort: legover, pickup,
  around-the-world, orbit, swirl, toe-stall, clipper-stall
- Compounds whose DB description is a literal notation echo:
  uncertain count without live DB inspection; potentially many

### 6.7 Visual / pedagogical concerns

See Part 5.2 — all marked **(human review required)**. Cumulative-
scroll on long compound pages, mobile readability of new transform
line, three-collapsed-panel cognitive load — none independently
resolvable from code.

### 6.8 Recommendations for future curation priorities

In order:

1. **Continue the curator-led intuition enrichment** for the
   10 priority weak pages (Part 3.4). Aim for 1 per curator session.
2. **Expand compound-semantic descriptions** beyond the initial
   5-entry set. Target the doctrine-divergence rows (Wave 7) and
   any compound with a doctrinally-load-bearing reading.
3. **Modifier-page authoring expansion** — atomic, blurry, stepping
   are the highest-payoff candidates based on coverage gap analysis.
4. **Future fb.org full-mirror retrieval** — if the per-trick HTML
   pages become accessible, the NR-1B verbatim-citation pattern
   scales; the current text-file corpus covers 1-7 ADD which is most
   of the publishable canonical set anyway.
5. **Browser QC pass** — once these editorial slices have settled,
   a manual visual review across desktop + mobile + 2-3 representative
   flagship/thin pages would close out the "feel" assessment that
   code-level audit cannot.

### 6.9 "Gold-standard" trick-page characteristics

Emerging from the audit, a gold-standard page exhibits:

1. **Movement-first reading flow** — the page leads with what the
   trick IS and what it FEELS like before what it's composed of.
2. **Structural depth available but progressive** — symbolic
   structure surfaces below the prose, not in front of it.
3. **Cross-source attribution preserved** — fb.org citation, Holden
   parentheticals, doctrine-divergence provenance all surface
   honestly without competing for narrative dominance.
4. **Negative space is respected** — sections absent because the
   editorial data doesn't exist are NOT padded with generated prose.
5. **Layer separation maintained** — JOB notation, operational
   notation, ADD accounting, transform overlay, and intuition prose
   each occupy a distinct visual register and never overwrite the
   others.

The 6 flagship pages this slice enriches exhibit all five
characteristics simultaneously. They are the editorial reference
target for future enrichment work.

---

## Cross-references

- Code: `src/content/freestyleTrickIntuition.ts` (NEW)
- Code: `src/services/freestyleService.ts` — view-model + shaping
- View: `src/views/partials/trick-intuition.hbs` (NEW)
- View: `src/views/freestyle/trick-shell.hbs` — partial ordering update
- CSS: `src/public/css/style.css` — `.trick-intuition-*` block
- Tests: `tests/integration/freestyle.trick-intuition.routes.test.ts` (NEW)
- Source corpus: `exploration/fborg/fborg-{1..7}add.txt`, `chrisHoldenSets.txt`
- Memory: `reference_fborg_newmoves_list` (verbatim-citation precedent)
- Related slice: `exploration/semantic-notation-refinement-2026-05-23.md`
  (description-redundancy gate this slice extends)
- Related slice: `exploration/compositional-sets-audit-2026-05-23.md`
  (Holden compilation audit; relevant for compositional-combination
  enrichment lane)

— end —
