# UX3c -- Phase Report (a / b / c)

Date: 2026-05-11. Status: implemented + validated. Sister to `UX3B0_UNIVERSAL_SHELL_PLAN.md`, `UX3B1_SCHEMA_MIGRATION_REPORT.md`, and `UX3_FLAGSHIP_SYNTHESIS.md`.

Phases executed in sequence:
- **UX3c-a** -- shell branch collapse; section gating cleanup
- **UX3c-b** -- ADD-tiered family lineage
- **UX3c-c** -- hero quick-stat ADD-derivation formula strip

Out of scope (explicitly deferred per user direction): relationship rendering, modifier-ecosystem panels, mini graphs, flagship visualization density. Reserved for UX3d/e.

---

## 1. UX3c-a -- Section gating cleanup

### 1.1 What changed

`src/views/freestyle/trick-shell.hbs`: the `{{#if content.ux2Pilot}} ... {{else}} ... {{/if}}` branch was removed. The shell now renders one canonical section flow; each section gates internally on its own data via the partials' existing `{{#if}}` guards. Sparse rows (Toe Stall, base butterfly, base mirage, etc.) skip empty sections silently. Featured-preview gates on `ux2Pilot` non-null. Media block gates on a new pre-shaped `content.hasMediaBlock` signal (`hasReferenceMedia || ux2Pilot != null`). Structural decomposition collapses behind `<details>` universally; the legacy expanded-inline render no longer exists.

### 1.2 New service-layer field

`FreestyleTrickContent.hasMediaBlock: boolean` -- pre-shaped gate signal. True when curated reference media exists OR editorial prose is authored. Inlined into the shell.

### 1.3 Section order (universal)

```
hero
featured-preview         (when prose authored)
about
notation                 (when notation present)
operational              (when operational notation present)
execution                (when execution paragraphs present)
learning notes           (when learning paragraphs present)
before you try this      (when prerequisite paragraphs present)
family ladder            (when family.length > 1)
related tricks           (when derived list non-empty)
media                    (when hasReferenceMedia or prose)
pathways                 (always)
previous tricks          (when derived list non-empty)
next tricks              (when derived list non-empty)
passback records         (when recordCount > 0)
record progression       (when hasProgression)
structural decomposition (collapsed <details>; always when notationGrammar non-null)
source footer            (always)
```

### 1.4 Public copy delta

| Change | Where | Affected pages |
|--------|-------|---------------|
| Reference-media h2: `Tutorials` / `Demonstrations` / `Tutorials and demonstrations` -> `Media` (unified) | Section heading | ~6 (any trick with curated media) |
| Section order on 157 legacy pages | Multiple sections | 157 |
| Structural decomposition: expanded inline -> collapsed `<details>` | Diagnostic | 157 (already collapsed for pilot trio) |

The h3 subheadings inside the media block ("Tutorials" / "Demonstrations") preserve per-tier signal exactly as before. Tests updated: 4 assertions in `tests/integration/freestyle.tricks-insights.routes.test.ts` for the new h2 / section-order expectations.

### 1.5 Validation

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | 244 / 244 green (post-test-assertion updates) |
| Section order verified across all 6 reference pages | unified |

---

## 2. UX3c-b -- ADD-tiered family lineage

### 2.1 What changed

The flat `family-ladder` list is replaced by a tier-grouped lineage where each numeric ADD value is its own tier row. Numeric tiers sort ascending; rows with non-numeric or null `adds` (`'modifier'` or similar) collapse into a single "Modifiers" tier rendered last.

### 2.2 New service-layer types

```ts
interface FreestyleFamilyTier {
  addsLabel: string;          // "3 ADD" / "4 ADD" / "Modifiers"
  addsNumeric: number | null; // numeric value or null for the Modifiers tier
  members: FreestyleFamilyMember[];
  hasCurrent: boolean;        // current trick sits in this tier
}
```

`FreestyleTrickContent.familyTiers: FreestyleFamilyTier[]` populated by `buildFamilyTiers(familyMembers)`.

### 2.3 Partial change

`src/views/partials/trick-family.hbs` rewritten to iterate `content.familyTiers` and render each tier as a row with label + member chips. Member chips highlight the current trick with a strong-styled name + `← here` marker, mirroring the prototype's lineage exhibit (`prototype-spinning-symposium-whirl.html`).

### 2.4 New CSS

`src/public/css/style.css` appended ~80 lines of `.family-lineage*` rules. Tier rows are grid-laid (78px label column + flex-wrapping member row). The current tier carries a faint green tint; the current member's strong-name carries a small green pill background (cool-palette `core_family` colour). Responsive: stacks to single-column at <600px.

### 2.5 Sample output (Matador, butterfly family, 12 members)

```
3 ADD: butterfly
4 ADD: atomic butterfly, dimwalk, ducking butterfly, parkwalk, ripwalk,
       sidewalk, spinning butterfly, tripwalk
5 ADD: bigwalk, matador ← here, phoenix
```

### 2.6 Validation

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | 244 / 244 green |
| Tier-grouped rendering on Matador | 3 ADD / 4 ADD / 5 ADD tiers verified; current member highlighted |

---

## 3. UX3c-c -- Hero quick-stat ADD-derivation formula

### 3.1 What changed

A new one-line "quick stat" strip renders inside the hero, between the chips row and the editorial summary. The strip shows the ADD derivation as a sequence of role-coloured tokens.

### 3.2 New service-layer types

```ts
interface HeroFormulaToken {
  kind: 'modifier' | 'base' | 'operator' | 'result';
  text: string;
  weight: string | null;   // "(+2)" / "(3)" / null
  cssRole: string | null;  // 'set' | 'rotation' | 'modifier' | 'core-family' | null
}
```

`FreestyleTrickContent.heroFormula: HeroFormulaToken[] | null` -- built by `buildHeroFormula()` in `getTrickDetailPage`. Data source: `freestyle_trick_modifier_links` (authoritative for Wave-1/Wave-2 single-token canonical names like `matador`, `phoenix`, `montage`) + base trick adds + this row's adds.

`AppliedModifier` extended with `modifierType` and `cssRole` fields for future flagship surfaces; not consumed by `heroFormula` directly (which uses link rows) but available for downstream UX3d work.

### 3.3 Form variants

- **Atom rows** (no modifier links OR modifier-only rows): `<trick-name> = <N> ADD`
  - Example: `toe stall = 1 ADD`, `mirage = 2 ADD`, `butterfly = 3 ADD`
- **Compound rows** (1+ modifier links): `<mod>(+w) + ... + <base>(N) = <total> ADD`
  - Example: `nuclear(+2) + butterfly(3) = 5 ADD`
  - Example: `spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD`

The data source is `freestyle_trick_modifier_links`, NOT canonical-name extraction. This means Wave-1/Wave-2 tricks (whose canonical names are single tokens like `matador`) get full multi-modifier formulas; older tricks whose canonical names already encode the modifier sequence (like `paradox whirl`) get a formula derived from the link table (which is also populated correctly for those rows).

### 3.4 cssRole mapping

| Modifier type / slug | cssRole | Background tint (hero) |
|----------------------|---------|------------------------|
| `modifier_type = 'set'` (nuclear, atomic, pixie, quantum, fairy, blurry, furious, shooting, ...) | `set` | white |
| `modifier_type = 'body'` AND slug in {`spinning`, `whirling`, `swirling`} | `rotation` | warm-tinted |
| Other body modifiers (paradox, ducking, symposium, tapping, stepping, ...) | `modifier` | yellow-tinted |
| Base trick (`butterfly`, `whirl`, `mirage`, ...) | `core-family` | green-tinted, bold |

Operators (`+`, `=`) and the result token (`5 ADD`) render in muted-white prose without backgrounds.

### 3.5 New CSS

`src/public/css/style.css` appended ~50 lines of `.trick-hero-formula` / `.hero-formula-token` / `.hero-formula-{cssRole}` rules. The strip uses a monospace font for readability and reuses the prototype's cool palette adapted to the hero's dark gradient backdrop. Responsive: shrinks font-size at <600px to keep the line stable.

### 3.6 Sample formulas across reference pages

```
toe-stall     toe stall = 1 ADD
mirage        mirage = 2 ADD
butterfly     butterfly = 3 ADD
tripwalk      quantum (+1) + butterfly (3) = 4 ADD
spinning-whirl  spinning (+1) + whirl (3) = 4 ADD
matador       nuclear (+2) + butterfly (3) = 5 ADD
phoenix       pixie (+1) + ducking (+1) + butterfly (3) = 5 ADD
mind-bender   ducking (+1) + paradox (+1) + blender (4) = 6 ADD
spender       spinning (+1) + paradox (+1) + blender (4) = 6 ADD
montage       spinning (+1) + ducking (+1) + paradox (+1) + symposium (+1) + whirl (3) = 7 ADD
```

### 3.7 Validation

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | 244 / 244 green |
| Atom-form rendering | Toe Stall, base butterfly, base mirage all render `<name> = <N> ADD` |
| Compound-form rendering | All Wave-1/Wave-2 + legacy compound rows render the additive formula |
| Role coloration | nuclear -> set; spinning -> rotation; ducking/paradox/symposium -> modifier; base -> core-family |
| Mobile responsiveness | font-size scales at <600px; tokens wrap |

---

## 4. Cross-phase validation

### 4.1 Test suite

`npm test -- tests/integration/freestyle`: **244 / 244 passed** after all three phases landed. 4 test assertions updated in `tests/integration/freestyle.tricks-insights.routes.test.ts` to reflect:
- Reference Media h2 -> `Media`
- Previous Tricks order vs Family ladder (Family now precedes Previous, per UX2 ordering)

### 4.2 Build

`npm run build`: clean.

### 4.3 Forbidden-term audit

Grep across all 6 reference pages (`toe-stall`, `mirage`, `phoenix`, `matador`, `montage`, `mind-bender`) for: `Red`, `pt10`, `pt11`, `pt12`, `adjudication`, `James`, `federation-not-adoption`, `curator-reviewed YYYY-MM-DD`. **0 hits per page.**

### 4.4 HTML snapshots

Saved at `legacy_data/reports/html_qc/ux3c/`:
```
matador.html      504 lines
mind-bender.html  414 lines
mirage.html       488 lines
montage.html      559 lines
phoenix.html      434 lines
toe-stall.html    317 lines
```

Diff vs UX3b1 will show:
- Section reordering on legacy pages (UX2 order now universal)
- New `trick-hero-formula` strip on every page with derivable formula
- Family ladder replaced by `family-lineage` tier groups
- Reference media h2 -> `Media`
- Structural decomposition collapsed universally

These deltas are intended and bounded to UX3c-a/b/c scope.

---

## 5. Files changed

| File | Type | Notes |
|------|------|-------|
| `src/views/freestyle/trick-shell.hbs` | modified | UX3c-a: removed pilot/legacy branch; one canonical flow |
| `src/views/partials/trick-hero.hbs` | modified | UX3c-c: added quick-stat formula strip |
| `src/views/partials/trick-family.hbs` | modified | UX3c-b: tier-grouped lineage |
| `src/services/freestyleService.ts` | modified | +`hasMediaBlock`, +`familyTiers`, +`heroFormula` on view-model; `buildFamilyTiers`, `buildHeroFormula`, `modifierCssRole` helpers; `AppliedModifier` extended with `modifierType` + `cssRole` |
| `src/public/css/style.css` | modified | +130 lines (family-lineage + hero-formula rules) |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | modified | 4 assertions updated for unified flow |
| `legacy_data/reports/html_qc/ux3c/*.html` | new | 6 UX3c HTML snapshots for QC diff |
| `exploration/freestyle-notation-grammar/UX3C_PHASE_REPORT.md` | new | this report |

No DB schema changes. No ontology / modifier-weight / parser changes. No new partials. No new templates.

---

## 6. Density tiers (re-verified post-UX3c)

| Trick | tier | Family-lineage tiers | Hero formula |
|-------|------|----------------------|--------------|
| toe-stall | sparse | atw 1-3 ADD | `toe stall = 1 ADD` |
| mirage | sparse | mirage 2-4 ADD | `mirage = 2 ADD` |
| butterfly | sparse | butterfly 3-5 ADD | `butterfly = 3 ADD` |
| phoenix | standard | butterfly 3-5 ADD | `pixie + ducking + butterfly = 5 ADD` |
| matador | flagship | butterfly 3-5 ADD | `nuclear + butterfly = 5 ADD` |
| montage | flagship | whirl 3-7 ADD (5 tiers) | `spinning + ducking + paradox + symposium + whirl = 7 ADD` |
| mind-bender | flagship | blender 5-6 ADD | `ducking + paradox + blender = 6 ADD` |
| spender | standard | blender 5-6 ADD | `spinning + paradox + blender = 6 ADD` |

All page renders match the density-tier intent: sparse pages get short atom formulas + simple tier ladders; flagship pages get dense multi-modifier formulas + rich tier exhibits.

---

## 7. Preservation guarantees

| Contract | Preserved because |
|----------|-------------------|
| Federation-not-adoption | No FM data auto-imports; operational-notation source line unchanged; hero-formula reads only IFPA-side `modifier_links` + base ADD |
| Parser/editorial separation | Parser-derived `structural_parse_json` continues to surface via the collapsed structural-decomposition; hero formula reads editorial-decomposition data (modifier_links + base_trick), not parser output |
| Restraint-first design | New surfaces (family-lineage tiers, hero-formula) render only when data permits; no fabricated content; quiet visual treatment |
| Warm/cool notation distinction | Hero-formula uses cool palette (matching semantic notation); operational notation block still warm; no cross-palette bleeding |
| Sparse-friendly rendering | Toe Stall renders 4 sections; atom-form formula is single-line; tier ladder still readable for 3-row families |
| Empty-state honesty | Media block continues to render empty-state pill when no curated media is tagged; featured-preview empty pill preserved for pilot trio |
| Asserted ADD is editorial truth | `heroFormula` derives `result` from `dictEntry.adds` (the editorial value), not from computed_adds; modifier weights from the modifier table |
| Public-facing prose hygiene | Forbidden-term audit: 0 hits across 6 reference pages |
| No client JS dependency | Hero-formula is pure HTML/CSS; family-lineage is pure HTML/CSS; structural decomposition uses native `<details>` |
| Mobile responsiveness | Hero formula font-size + family-lineage stacking both scale at <600px |

---

## 8. Recommendation on UX3d / UX3e

**UX3d is unblocked.** Per `UX3_FLAGSHIP_SYNTHESIS.md` §14, UX3d adds flagship-only visual surfaces:

- Token-coloured h1 (uses existing role-coloured token classes; activates when modifier_links.length >= 2)
- Modifier-layering nested-boxes panel (activates when modifier_links.length >= 3)
- Optional: ADD-derivation formula in detail-level large-form rendering (already partially achieved via UX3c-c hero strip; can be extended in the about section)

UX3e (relationship rendering / modifier-ecosystem panels / mini graphs) remains explicitly deferred per the user's sequencing direction.

### 8.1 Recommended UX3d sequence

1. Token-coloured h1 partial -- replaces flat `<h1>{{page.title}}</h1>` with role-coloured token spans when modifier_links count >= 2; falls through to plain h1 otherwise. Reuses `notation-{cssRole}` classes; small CSS adjustment for h1-scale rendering.
2. Modifier-layering visualisation -- nested-box rendering per `UX3_FLAGSHIP_SYNTHESIS.md` §9.4. Activates when modifier_links count >= 3 (excludes 2-modifier compounds like Mind Bender and 1-modifier compounds like Matador). Service computes a layered-tokens shape.
3. Optional: hero quick-stat strip extended with weighting badges per token for greater density (current strip uses muted parenthetical weights; could promote them).

Each step is independently mergeable; no DB schema work needed for any.

### 8.2 What does NOT advance in UX3d

- Modifier-ecosystem panels (UX3e)
- Parallel-tricks panel (UX3e)
- Mini relationship graphs (UX3e)
- Curator-authoring expansion (UX3f)
- Featured-media tagging (UX3f, gallery-edit-tool coordination)

---

## 9. Decision points awaiting human input

1. **Approve commit?** UX3c spans shell + 2 partials + service + CSS + test fixes + 1 report doc. Single logical phase; one commit recommended.
2. **Begin UX3d immediately?** Token-coloured h1 + modifier-layering nested boxes per UX3a §3.3. No schema work; presentation only.
3. **Confirm h2 unification "Media"?** UX3c-a unified the reference-media section heading from per-tier dynamic labels (`Tutorials` / `Demonstrations` / `Tutorials and demonstrations`) to static `Media`. Per-tier signal preserved via internal h3 subheadings.
4. **Confirm structural decomposition collapse universally?** UX3c-a moved the diagnostic from expanded-inline (legacy) to collapsed `<details>` for every page. Curators and grammar-aware visitors expand on demand; learners no longer scroll past it.
5. **Confirm family-lineage tier label format?** Currently `3 ADD` / `4 ADD` / `Modifiers`. Alternative: short form (`3` / `4` / `mod`) for visual quietness. Recommendation: keep `N ADD` labels — they read more clearly and the tier-label column has fixed width.
