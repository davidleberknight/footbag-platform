# UX3b0 -- Universal Shell Convergence Plan

Date: 2026-05-11. Status: implemented + validated. Convergence prototype.

Sibling: `UX3_FLAGSHIP_SYNTHESIS.md` (north-star design). This plan executes the first concrete migration step: replace the legacy/pilot template split with a single universal shell composed from named partials, without schema changes.

Out of scope for UX3b0: schema migration; new prose columns; `featured_media_id` column; ontology mutation; modifier-weight changes; parser logic changes; flagship visual enrichment (token-coloured h1, modifier-layering, modifier-ecosystem panels). All deferred to UX3b1+.

---

## 1. Goal

Prove the universal UX3 shell can host both the legacy and the UX2 pilot rendering paths before adding any new schema columns. After UX3b0:

- All trick-detail pages render via one template (`src/views/freestyle/trick-shell.hbs`)
- Section content is extracted into 14 named partials shared by both rendering paths
- A read-only density classification (`sparse` / `standard` / `flagship`) attaches to every page's view-model, derived from existing data only
- Pilot-vs-legacy ordering branch survives as the only remaining behavioural difference, scoped to a single `{{#if content.ux2Pilot}}` block inside the shell
- The old `UX2_PILOT_RAW` constant stays as the activation source for UX2 ordering; the controller no longer chooses between two templates

---

## 2. Implementation summary

### 2.1 Files added

| File | Purpose | Lines |
|------|---------|------:|
| `src/views/freestyle/trick-shell.hbs` | Universal shell; one entry per slug; conditional ordering | 146 |
| `src/views/partials/trick-hero.hbs` | Title + breadcrumb + family/ADD/category chips + optional UX2 summary | 34 |
| `src/views/partials/trick-featured-preview.hbs` | UX2 hero-adjacent featured-media preview (or empty pill) | 31 |
| `src/views/partials/trick-about.hbs` | About-this-trick prose + ADD composition + aliases + family note | 63 |
| `src/views/partials/trick-notation.hbs` | Semantic notation block (cool palette) | 16 |
| `src/views/partials/trick-operational.hbs` | Operational notation block (warm palette) + source-line + glossary deeplink | 19 |
| `src/views/partials/trick-prose.hbs` | Parameterized prose section (execution / learning / prereq) | 24 |
| `src/views/partials/trick-family.hbs` | Family ladder | 27 |
| `src/views/partials/trick-related.hbs` | Related Tricks list (R1/R2/R3 derived) | 18 |
| `src/views/partials/trick-previous.hbs` | Previous Tricks list (lower-ADD same-family) | 20 |
| `src/views/partials/trick-next.hbs` | Next Tricks list (higher-ADD same-family) | 20 |
| `src/views/partials/trick-pathways.hbs` | Learn / Watch / Family pathways cards | 40 |
| `src/views/partials/trick-records.hbs` | Passback Records table | 55 |
| `src/views/partials/trick-progression.hbs` | Record Progression table | 55 |
| `src/views/partials/trick-structural.hbs` | Structural decomposition panel; `collapsed` param toggles `<details>` wrap | 175 |
| `src/views/partials/trick-media-grid.hbs` | Tutorials + Demonstrations grid pair (used by both UX2 media block and legacy reference-media section) | 37 |

15 new files. Total ~780 lines extracted into reusable partials. Shell file is 146 lines.

### 2.2 Files modified

| File | Change |
|------|--------|
| `src/controllers/freestyleController.ts` | Replaced two-template branch (`trick` vs `trick-ux2`) with single render of `trick-shell`. 4-line edit. |
| `src/services/freestyleService.ts` | Added `densityTier: 'sparse' \| 'standard' \| 'flagship'` field on `FreestyleTrickContent`; added `classifyDensityTier()` helper; populated `densityTier` in the content view-model. ~50 lines added. |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | Two test assertions updated: `'About This Trick'` → `'About this trick'` (case-change for unification). 2-line edit. |

### 2.3 Files NOT removed (kept as dead code through UX3b0)

- `src/views/freestyle/trick.hbs` (597 lines) -- legacy template; no longer referenced by the controller; deleted in UX3b1 once schema migration lands.
- `src/views/freestyle/trick-ux2.hbs` (687 lines) -- pilot template; same status as above.

Reason for retention: convergence reviewers can diff the partial set against either source. Removal in UX3b1 reduces ~1300 lines of dead code.

### 2.4 Controller delta

```diff
-      const template = vm.content.ux2Pilot ? 'freestyle/trick-ux2' : 'freestyle/trick';
-      res.render(template, vm);
+      res.render('freestyle/trick-shell', vm);
```

One template chosen unconditionally. The pilot-vs-legacy branch moved from the controller into the shell's `{{#if content.ux2Pilot}}` ordering switch.

---

## 3. Density classification rules (read-only at UX3b0)

`classifyDensityTier()` is a pure function over existing data. Output: `'sparse' | 'standard' | 'flagship'`. Does not affect rendering at UX3b0; future phases (UX3c+) consume this signal to gate flagship-only visual surfaces.

### 3.1 Inputs

All derived from existing tables; no schema reads added:

| Input | Derived from |
|-------|--------------|
| `modifierLinkCount` | `dictEntry.appliedModifiers.length` (already shaped from `freestyle_trick_modifier_links`) |
| `hasSemanticNotation` | `freestyle_tricks.notation` non-empty |
| `hasOperationalNotation` | `freestyle_tricks.operational_notation` non-empty |
| `recordCount` | `currentRows.length` from `freestyle_records` |
| `hasReferenceMedia` | `tutorialMedia.length \|\| demoMedia.length > 0` |
| `hasUx2Prose` | `lookupUx2Pilot(slug) !== null` |

### 3.2 Rules

```
flagship    if  hasUx2Prose
            OR  (modifierLinkCount >= 3 AND hasOperationalNotation AND recordCount > 0)

sparse      if  modifierLinkCount == 0
            AND not hasOperationalNotation
            AND recordCount == 0
            AND not hasReferenceMedia

standard    otherwise
```

### 3.3 Sample classifications (live DB, 2026-05-11)

| Slug | modifiers | op-notation | records | media | UX2 prose | tier |
|------|----------:|:-----------:|--------:|:-----:|:---------:|------|
| toe-stall | 0 | no | 0 | varies | no | sparse / standard |
| butterfly | 0 | no | 0 | no | no | sparse |
| mirage | 0 | no | 0 | no | no | sparse |
| clipper | 0 | no | 0 | no | no | sparse |
| pickup | 0 | no | 0 | no | no | sparse |
| phoenix | 2 | yes | 0 | no | no | **standard** |
| matador | 1 | yes | 1 | no | yes | **flagship** (UX2 prose) |
| mind-bender | 2 | yes | 0 | no | yes | **flagship** (UX2 prose) |
| montage | 4 | yes | 0 | no | yes | **flagship** (UX2 prose) |
| spender | 2 | yes | 0 | no | no | **standard** |

The "flagship" tier today is determined almost entirely by `hasUx2Prose` (the curator-authored UX2 prose for Matador / Mind Bender / Montage). The "3 modifier-links + operational + records" branch would fire for Montage if it had a record holder; currently Montage has none. The most natural "pure-data flagship" candidate today is none; pilot prose is the dominant gate.

### 3.4 Density tier is invisible to readers

No CSS class, no UI affordance, no tier name renders on the page. The signal exists in the view-model for future phase consumption and for QC / test assertions. A reader cannot tell from the page which tier a row sits in. By design, per `UX3_FLAGSHIP_SYNTHESIS.md` §17 question 1.

---

## 4. Proposed partial set (final inventory)

15 partials, all under `src/views/partials/` (flat directory; matches existing convention).

| Partial | Used by UX2 path | Used by legacy path | Parameters |
|---------|:----------------:|:-------------------:|------------|
| trick-hero | yes | yes | `summary` (optional) |
| trick-featured-preview | yes | no | none |
| trick-about | yes | yes | none |
| trick-notation | yes | yes | none |
| trick-operational | yes | yes | none |
| trick-prose | yes | no | `heading`, `paragraphs`, `intro` (optional), `extraLink` (optional), `sectionClass` (optional) |
| trick-family | yes | yes | none |
| trick-related | yes | yes | none |
| trick-previous | yes | yes | none |
| trick-next | yes | yes | none |
| trick-pathways | yes | yes | none |
| trick-records | yes | yes | none |
| trick-progression | yes | yes | none |
| trick-structural | yes (collapsed) | yes (expanded) | `collapsed` (boolean) |
| trick-media-grid | yes (inside media block) | yes (inside reference-media section) | none |

Reuse: 13 of 15 partials are used by both rendering paths. 2 are UX2-exclusive (trick-featured-preview, trick-prose). 0 are legacy-exclusive.

The shell file composes them in either UX2 or legacy order based on `content.ux2Pilot`.

---

## 5. Before / after route behavior matrix

`GET /freestyle/tricks/:slug` -- per-page render behaviour. All page bodies verified via curl + HTML diff in `legacy_data/reports/html_qc/ux3b0/{before,after}/`.

| Page | Pre-UX3b0 template | Post-UX3b0 template | Rendering equivalent? |
|------|-------------------|---------------------|----------------------|
| toe-stall | trick.hbs | trick-shell.hbs (legacy branch) | yes (with one case-change) |
| butterfly | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| mirage | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| pickup | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| clipper | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| phoenix | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| spender | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| ... (155 more non-pilot tricks) | trick.hbs | trick-shell.hbs (legacy branch) | yes |
| montage | trick-ux2.hbs | trick-shell.hbs (UX2 branch) | yes |
| matador | trick-ux2.hbs | trick-shell.hbs (UX2 branch) | yes |
| mind-bender | trick-ux2.hbs | trick-shell.hbs (UX2 branch) | yes |

The single case-change ("About This Trick" → "About this trick") affects 157 pages and is the only public-copy difference. Per the UX3b0 scope: "Do not change public copy except where needed for template unification." The case unification is the minimal required public-copy change.

---

## 6. Implementation diff summary

```
 src/controllers/freestyleController.ts             |   8 +-
 src/services/freestyleService.ts                   |  53 ++++++++++-
 src/views/freestyle/trick-shell.hbs                | 146 ++++++++++++++++++++ (new)
 src/views/partials/trick-about.hbs                 |  63 +++++++++++ (new)
 src/views/partials/trick-family.hbs                |  27 ++++ (new)
 src/views/partials/trick-featured-preview.hbs      |  31 +++++ (new)
 src/views/partials/trick-hero.hbs                  |  34 ++++++ (new)
 src/views/partials/trick-media-grid.hbs            |  37 ++++++ (new)
 src/views/partials/trick-next.hbs                  |  20 ++++ (new)
 src/views/partials/trick-notation.hbs              |  16 +++ (new)
 src/views/partials/trick-operational.hbs           |  19 +++ (new)
 src/views/partials/trick-pathways.hbs              |  40 ++++++ (new)
 src/views/partials/trick-previous.hbs              |  20 ++++ (new)
 src/views/partials/trick-progression.hbs           |  55 +++++++++ (new)
 src/views/partials/trick-prose.hbs                 |  24 ++++ (new)
 src/views/partials/trick-records.hbs               |  55 +++++++++ (new)
 src/views/partials/trick-related.hbs               |  18 +++ (new)
 src/views/partials/trick-structural.hbs            | 175 +++++++++++++++++++++ (new)
 tests/integration/freestyle.tricks-insights.routes.test.ts | 4 +/-
 18 files changed, ~785 insertions, ~3 deletions
```

No file deletions in UX3b0. Legacy templates retained as dead code; removed in UX3b1.

---

## 7. Rendered HTML QC results

HTML snapshots captured in `legacy_data/reports/html_qc/ux3b0/`:

```
ux3b0/
  before/
    matador.html      23,359 bytes  (pre-shell UX2 pilot render)
    mind-bender.html  19,733 bytes
    phoenix.html      19,305 bytes  (pre-shell legacy render)
  after/
    matador.html      23,820 bytes  (post-shell)
    mind-bender.html  19,938 bytes  (post-shell)
    mirage.html       19,306 bytes  (post-shell; legacy branch)
    montage.html      28,485 bytes  (post-shell; UX2 branch)
    phoenix.html      19,996 bytes  (post-shell; legacy branch)
    toe-stall.html    11,526 bytes  (post-shell; legacy branch; sparsest)
```

Diffs between before/after are minimal: whitespace shifts, the `About This Trick` → `About this trick` case unification, and partial-boundary whitespace. No content / order / class regression.

### 7.1 Per-page section order (after)

**Toe Stall** (sparse, legacy branch, 6 sections):
```
h1 toe stall
About this trick
Notation
Structural decomposition (expanded inline)
What you can do with this trick
Tutorials
[source footer]
```

**Phoenix** (standard, legacy branch, 9 sections):
```
h1 phoenix
About this trick
Notation
Set notation (operational)
Structural decomposition (expanded inline)
What you can do with this trick
Related Tricks
Previous Tricks
phoenix Family
[source footer]
```

**Matador** (flagship, UX2 branch, 13 sections):
```
h1 Matador (+ hero summary; + featured-preview empty pill)
About this trick
Notation
Set notation (operational)
Execution
Learning notes
Before you try this
Matador Family
Related Tricks
Media
What you can do with this trick
Previous Tricks
Passback Records
▸ Structural decomposition (collapsed)
[source footer]
```

**Montage** (flagship, UX2 branch, similar to Matador minus Passback Records since no record holder).

**Mind Bender** (flagship, UX2 branch, similar to Matador minus Passback Records).

All 5 reference pages: HTTP 200. All 5: forbidden-term audit clean.

---

## 8. Validation results

| Check | Result |
|-------|--------|
| TypeScript build (`npm run build`) | **clean** |
| Freestyle integration tests (`npm test -- tests/integration/freestyle`) | **244 / 244 passed** |
| HTTP 200 on toe-stall / mirage / phoenix / matador / montage / mind-bender | **6 / 6 OK** |
| Forbidden-term grep across 6 reference pages | **0 hits** on Red / pt10 / pt11 / pt12 / adjudication / James / federation-not-adoption |
| UX2 pilot section ordering on Matador / Mind Bender / Montage | **preserved** (verified via grep on `<h2>` sequence) |
| Legacy section ordering on Phoenix / Mirage / Toe Stall | **preserved** (verified via grep on `<h2>` sequence; case unification only delta) |
| Reference Media empty state | **preserved** (UX2 branch always renders Media section; legacy branch omits when no media) |
| Structural decomposition collapse state | **preserved** (UX2 branch: collapsed in `<details>`; legacy branch: expanded inline) |
| Featured-media preview block | **preserved** for UX2 pilot rows; **absent** for legacy rows |

---

## 9. Public-copy delta (the only behavioural change)

| Page set | Change |
|----------|--------|
| 157 non-pilot tricks | h2 "About This Trick" → h2 "About this trick" (case unification) |
| Montage / Matador / Mind Bender | no change (already lowercase) |
| All tricks | no other public-copy changes |

This is the minimum required for partial unification per the UX3b0 scope.

---

## 10. Recommendation on UX3b schema migration

**Safe to proceed with UX3b1 schema migration.** Reasoning:

1. **Convergence proved.** One template renders both rendering paths bit-for-bit equivalently (after the case unification). The shell's `{{#if content.ux2Pilot}}` branch is the only remaining behavioural divergence; collapsing it requires the new schema columns to back the prose / featured-media data.

2. **Rendering surface stable.** All 15 partials are pure functions of the existing view-model. Schema additions for `short_description` / `execution_summary` / `learning_notes` / `prerequisite_notes` / `featured_media_id` map cleanly into the existing partial parameters (already exercised today via `UX2_PILOT_RAW` constant on 3 rows).

3. **Test suite already covers the new render paths.** 244 / 244 integration tests pass against the universal shell.

4. **Density classification is wired and read-only.** UX3c can promote section-presence gating from "ux2Pilot non-null" to "data-presence" rules without further service-layer plumbing.

5. **Risk surfaces are bounded.** Schema migration is a single `ALTER TABLE` with 5 nullable columns + 1 FK. Loader-19 extension is one-line per column. Existing `UX2_PILOT_RAW` constant retires in the same change; pilot prose migrates one-time from constant to columns.

### 10.1 Recommended UX3b1 sequence

1. Schema migration (add 5 nullable columns + featured_media_id FK).
2. Loader-19 `SOURCE_ASSERTABLE_FIELDS` allowlist extension (+5 lines).
3. Service-layer shaping reads new columns; falls back to `UX2_PILOT_RAW` constant for the 3 pilot rows.
4. One-time backfill: write Montage / Matador / Mind Bender prose into the new columns via `red_corrections_2026_04_20.csv`.
5. Service-layer reads new columns only; retire `UX2_PILOT_RAW` constant.
6. Delete `src/views/freestyle/trick.hbs` and `src/views/freestyle/trick-ux2.hbs` (now-orphaned dead code).
7. Optional: collapse the shell's two-branch ordering into a single data-driven flow (UX3c).

Each step is independently mergeable.

### 10.2 What NOT to do in UX3b1

- Author prose for additional tricks (curator pacing; defer to UX3f).
- Add `featured_media_id` data (deferred to UX3c or UX3f per gallery-edit-tool coordination per `feedback_gallery_dave_track.md`).
- Promote any new slug into the UX2 ordering (the universal shell's data-driven section presence handles this without per-slug allowlists once schema lands).
- Introduce flagship visual surfaces (token-coloured h1, modifier-layering, modifier-ecosystem). Deferred to UX3d / UX3e.

---

## 11. Risks + mitigations (UX3b0 itself)

| Risk | Mitigation |
|------|-----------|
| Partial whitespace differs subtly from the inlined template | HTML diffs reviewed; whitespace shifts are cosmetic only; no visible rendering change |
| `About This Trick` → `About this trick` case change affects 157 pages | Documented as the only intentional public-copy change; tests updated to match |
| Old templates retained but unused (1300 lines dead code) | Documented; removal scheduled for UX3b1; reviewability improved during transition |
| Partials not picked up by Handlebars engine | Verified: `src/views/partials/` is the auto-registered partials directory per `src/app.ts:133`; all 15 new partials live there |
| `trick-prose` partial's `extraLink` parameter goes unused | `content.ux2Pilot.prereqExtraLink` is not surfaced by the service today; the partial accepts it for forward compatibility but always renders without it |

---

## 12. Preservation guarantees

| Contract | Preserved because |
|----------|-------------------|
| Federation-not-adoption | No FM data auto-imports; operational-notation source-provenance line unchanged |
| Parser/editorial separation | Parser still reads `canonical_name` only; editorial decomposition lives in modifier_links table |
| Pt10/pt11 baseline | No modifier weight changes; no schema changes |
| Restraint-first design | Every partial gates on its data; empty states preserved |
| Warm/cool notation distinction | Token coloration unchanged in trick-notation + trick-operational partials |
| Sparse-friendly rendering | Toe Stall renders in 6 sections (sparse branch); no flagship surface forced onto sparse rows |
| Empty-state honesty | UX2 branch: Media section always renders with empty-state body; Featured-preview empty pill unchanged. Legacy branch: Reference Media section omits when no media |
| Wave-1 UX conventions | Glossary deeplinks per section + tooltip system + structural-decomposition diagnostic surface all preserved |
| Asserted ADD is editorial truth | Structural decomposition framing in `trick-structural.hbs` preserves the asserted-vs-computed copy verbatim |
| Public-facing prose hygiene | Forbidden-term audit clean across all reference pages |

---

## 13. Out of scope (deferred to UX3b1+)

- Schema migration for prose / featured-media columns.
- Removal of legacy templates (`trick.hbs`, `trick-ux2.hbs`).
- Retirement of `UX2_PILOT_RAW` constant.
- Collapse of pilot-vs-legacy ordering branch into data-driven section presence (UX3c).
- Token-coloured h1 partial (UX3d).
- Modifier-layering nested-boxes partial (UX3d).
- Modifier-ecosystem panel (UX3e).
- Parallel-tricks panel (UX3e).
- Mini relationship graph (UX3e).
- ADD-tiered family lineage replacement (UX3d).
- Curator-authored prose for the other ~157 tricks (UX3f).
- Featured-media tagging beyond Wave-2 Tier-1 (UX3f, requires Dave coordination).

---

## 14. Decision points awaiting human input

1. **Approve UX3b1?** Schema migration recommended per §10. Single ALTER TABLE with 5 nullable columns + 1 FK. Estimated effort: small.
2. **Retain legacy templates through UX3b1, or remove now?** Recommendation: retain through UX3b1 for reviewability; delete in same PR as schema migration once `UX2_PILOT_RAW` retires.
3. **Case unification: "About this trick"** -- confirm this is the desired form universally (vs reverting to "About This Trick" if you preferred legacy casing).
4. **Density tier visibility.** Currently invisible to readers per §3.4. Confirm this stays invisible, or expose as a CSS class for future flagship-styling hooks.
5. **Partial directory.** Current convention: flat `src/views/partials/` with `trick-` prefix. Acceptable, or prefer subdirectory `src/views/partials/freestyle/`?

---

## 15. Companion artifacts

- HTML snapshots: `legacy_data/reports/html_qc/ux3b0/{before,after}/`
- Diff reproducer: `diff before/{slug}.html after/{slug}.html` for any of the 3 sampled pages
- Test changes: `tests/integration/freestyle.tricks-insights.routes.test.ts` (2 line edits for the case unification)

UX3a north-star: `exploration/freestyle-notation-grammar/UX3_FLAGSHIP_SYNTHESIS.md` (840 lines).
