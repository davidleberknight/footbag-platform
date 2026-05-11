# UX3f-b -- Hero Metadata Band Consolidation

Date: 2026-05-11. Status: implemented + validated. Confidence: high.

Reference: `UX3F_A_VISUAL_REFINEMENT.md` (F4 medium-risk candidate promoted), `UX3D_A_PHASE_REPORT.md` (decomposition strip), `UX3C_PHASE_REPORT.md` (hero formula).

Goal: reduce hero-stack fragmentation on flagship pages without removing semantic richness.

Out of scope per user direction: ontology richness reduction, semantic identity flattening, decomposition strip removal.

---

## 1. Hero saturation diagnosis (Montage pre-consolidation)

After UX3f-a (sortname suppression on flagship rows), the Montage hero still rendered **9 distinct stacked elements**:

```
breadcrumb
eyebrow "7 ADD"                                     ← duplicates info below
h1 "Montage"
decomposition strip [spinning][ducking]...[whirl]
family-badge "whirl family"                         ← standalone <p>
hero-stats: 7 ADD | compound | 3 kicks (record)    ← partially duplicates eyebrow
hero formula
hero summary
featured-media preview
```

Three fragmentation sources:
- "7 ADD" appears in eyebrow AND hero-stats (and again in formula, and again in modifier-layering's "Total ≡ 7 ADD")
- Family badge is a standalone `<p>` separated from the hero-stats chips by the decomposition strip
- The `compound` category chip in hero-stats carries low signal (the rest of the hero conveys compound nature implicitly)

The eye reads 5 distinct visual modes in the first ~250px before reaching the decomposition strip.

---

## 2. Unified metadata ribbon concept

Consolidate eyebrow + family-badge + hero-stats into **one flex-wrapping chip row** directly below the h1. Each chip is a semi-opaque pill on the dark hero gradient. Family chip remains a link; ADD + record chips are static spans.

Rendered shape:
```
Montage
[whirl family] [7 ADD] [3 kicks · record]
[spinning][ducking][paradox][symposium][whirl]
spinning(+1) + ducking(+1) + ... + whirl(3) = 7 ADD
A 7-ADD whirl compound: ...
```

The ribbon collapses three previously separate visual elements into a single line. Mobile flex-wraps if 3+ chips don't fit.

### 2.1 Chip semantics

| Chip | Activation | Format |
|------|-----------|--------|
| Family | `dictEntry.trickFamily` non-null | link, "{family} family" |
| ADD | `!isModifier && dictEntry.adds` | static, "{adds} ADD" |
| Modifier | `dictEntry.isModifier === true` | static, "Modifier" (replaces ADD chip on modifier pages) |
| Record | `recordCount > 0` | static, "{topValue} kicks · record" |

Atoms get 2 chips (family + ADD). Tricks with records get 3 (family + ADD + record). Modifier-trick pages (e.g. ducking, paradox) get 2 (family + Modifier).

### 2.2 What's dropped

- **Eyebrow `<p>` with "{adds} ADD"** — replaced by ADD chip in the ribbon
- **Standalone family-badge `<p>`** — replaced by family chip in the ribbon
- **`compound` category chip** — low-signal; the rest of the hero (decomposition strip, formula, modifier-layering) conveys compound-trick nature implicitly
- **Standalone `hero-stats` `<div>`** — replaced by the ribbon row

### 2.3 What's preserved

- **Breadcrumb** — navigation; unchanged position
- **h1** — load-bearing trick name; unchanged
- **Decomposition strip (UX3d-a)** — semantic identity surface; unchanged position below h1+ribbon
- **Sortname subtitle (UX3f-a F1)** — preserved fallback for pages without decomposition strip
- **Hero formula (UX3c-c)** — math surface; unchanged position below decomposition strip
- **Hero summary (UX2 prose)** — editorial pitch; unchanged position
- **Featured-media preview** — empty-state honesty; unchanged

---

## 3. Before/after sketches

### 3.1 Montage (flagship, 4-mod whirl, 1 record holder)

**Before (9 stacked elements):**
```
breadcrumb
─── (~6px gap)
7 ADD                              ← eyebrow
─── (~10px gap)
Montage                            ← h1
─── (~10px gap)
[spinning][ducking][paradox][symposium][whirl]
─── (~12px gap)
whirl family                       ← standalone badge
─── (~10px gap)
7 ADD  compound  3 kicks (record)  ← stats
─── (~12px gap)
spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD
─── (~14px gap)
A 7-ADD whirl compound: ducking, paradox, ...
─── (~16px gap)
[featured-media preview]
```

Total hero height (approximate): ~520px desktop.

**After (7 stacked elements):**
```
breadcrumb
─── (~6px gap)
Montage                            ← h1
─── (~6px gap)
[whirl family] [7 ADD] [3 kicks · record]    ← ribbon (single row)
─── (~12px gap)
[spinning][ducking][paradox][symposium][whirl]
─── (~12px gap)
spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD
─── (~14px gap)
A 7-ADD whirl compound: ducking, paradox, ...
─── (~16px gap)
[featured-media preview]
```

Total hero height (approximate): ~440px desktop. Net savings: ~80px (-15%).

### 3.2 Matador (flagship, 1-mod butterfly, has record)

Before: eyebrow + h1 + family-badge + stats + formula + summary + featured-preview = 7 stacked elements (no decomp strip since modifier_links=1).

After: h1 + ribbon (3 chips) + formula + summary + featured-preview = 5 stacked elements.

Savings: ~50px.

### 3.3 Mind Bender (flagship, 2-mod blender, no record)

Before: eyebrow + h1 + decomp + family-badge + stats + formula + summary = 7 stacked elements.

After: h1 + ribbon (2 chips: family + 6 ADD) + decomp + formula + summary = 5 stacked elements.

Savings: ~60px.

### 3.4 Phoenix (flagship, 2-mod butterfly, no record)

Same shape as Mind Bender. After: h1 + ribbon (2 chips) + decomp + formula + summary.

### 3.5 Toe Stall (sparse atom, no record)

Before: eyebrow ("1 ADD") + h1 + family-badge + stats ("1 ADD" + "set") = 4 stacked elements.

After: h1 + ribbon (2 chips: atw family + 1 ADD) + formula ("toe stall = 1 ADD") = 3 stacked elements.

Savings: ~40px. Atom still feels intentional, not empty — the ribbon clearly shows family + ADD; the formula confirms the math.

### 3.6 Modifier-trick page (e.g. /freestyle/tricks/ducking)

Before: eyebrow ("Modifier") + h1 + stats + about-prose ("This is a modifier...").

After: h1 + ribbon (family + Modifier chip) + formula (omitted for modifier rows; null heroFormula) + about-prose.

The Modifier chip in the ribbon preserves the previous classification signal that the eyebrow carried.

---

## 4. Compression analysis

**Vertical savings per page:**
| Page | Hero pre | Hero post | Saved |
|------|---------:|----------:|------:|
| Montage | ~520px | ~440px | ~80px |
| Matador | ~440px | ~390px | ~50px |
| Mind Bender | ~480px | ~420px | ~60px |
| Phoenix | ~480px | ~420px | ~60px |
| Toe Stall | ~280px | ~240px | ~40px |
| Mirage | ~320px | ~280px | ~40px |

The compression is data-driven: pages with more chips save less (fewer stacked rows already), pages with more redundancy save more. Montage benefits most.

**Element count drops by 2-3** on every trick page:
- Eyebrow `<p>` removed
- Family-badge `<p>` removed
- hero-stats `<div>` removed
- Single ribbon `<p>` added (with 2-3 chips)

Net: -2 stacked elements (3 removed, 1 added).

---

## 5. Metadata hierarchy after consolidation

The page's first 5 visual moments now read in this order:

1. **Breadcrumb** (smallest, neutral navigation)
2. **h1 trick name** (largest, single-line identity)
3. **Ribbon** (small chips, scan-layer metadata)
4. **Decomposition strip** (medium, semantic identity)
5. **Hero formula** (small mono, math derivation)

Then editorial:

6. **Summary** (single-sentence elevator pitch)
7. **Featured-media preview** (empty state or media tile)

The hierarchy now reads cleanly: NAME → METADATA → STRUCTURE → MATH → DESCRIPTION → MEDIA. One strong semantic moment per zone; no competing voices.

Per the user's success criterion **"one strong semantic moment, not multiple competing semantic moments"**: achieved.

---

## 6. Implementation

### 6.1 Template change (`src/views/partials/trick-hero.hbs`)

Removed:
- The eyebrow `<p class="hero-eyebrow">` (line 15 pre-change)
- The standalone `<p><a class="family-badge">...</a></p>` (line 22 pre-change)
- The `<div class="hero-stats">...</div>` (lines 28-36 pre-change)

Added:
- `<p class="trick-hero-meta-ribbon">` with conditional chips:
  - family-link chip when `trickFamily` non-null
  - "Modifier" chip when `isModifier`, OR ADD chip otherwise
  - record chip when `recordCount > 0`

### 6.2 CSS (`src/public/css/style.css`)

Appended ~50 lines:

```css
.trick-hero-meta-ribbon {
  margin: 6px 0 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  font-size: 0.85rem;
}
.trick-hero-meta-chip {
  padding: 3px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}
.trick-hero-meta-chip-family    { background: rgba(255, 255, 255, 0.18); }
.trick-hero-meta-chip-family:hover { background: rgba(255, 255, 255, 0.28); }
.trick-hero-meta-chip-adds      { font-weight: 600; background: rgba(180, 240, 200, 0.22); }
.trick-hero-meta-chip-record    { background: rgba(255, 220, 180, 0.20); }
.trick-hero-meta-chip-modifier  { font-weight: 600; background: rgba(255, 245, 200, 0.22); }
/* mobile tightening at <600px */
```

### 6.3 Test update (`tests/integration/freestyle.tricks-insights.routes.test.ts`)

Family-badge assertion updated to match new class name:

```diff
- it('renders a family badge linking to the family filter', ...) {
-   expect(res.text).toMatch(/class="family-badge"[^>]*href="\/freestyle\/tricks\?family=whirl"[^>]*>whirl family</);
+ it('renders a family chip linking to the family filter', ...) {
+   expect(res.text).toMatch(/class="trick-hero-meta-chip trick-hero-meta-chip-family"[^>]*href="\/freestyle\/tricks\?family=whirl"[^>]*>whirl family</);
```

The link semantics are unchanged; only the class name differs. The "Modifier" + "no fixed ADD value" test continues to pass because the ribbon's Modifier chip carries the "Modifier" text + the About prose carries "no fixed ADD value of its own."

---

## 7. Validation

| Check | Result |
|-------|--------|
| TypeScript build | clean |
| Freestyle integration tests | **244 / 244 green** |
| Per-page ribbon chip inventory | verified across 6 reference pages |
| Atoms (Toe Stall) | ribbon shows 2 chips (family + ADD); no extra widgets |
| Modifier pages (ducking) | ribbon shows "Modifier" chip in place of ADD chip |
| Family chip link semantics | preserved (test assertion updated to new class) |
| Forbidden-term audit | 0 hits |
| Mobile responsiveness | flex-wrap + 0.8rem font + tightened padding at <600px |

### 7.1 Per-page chip render verification (live)

```
toe-stall      chips=[atw family, 1 ADD]
mirage         chips=[mirage family, 2 ADD, 100 kicks · record]
matador        chips=[butterfly family, 5 ADD, 7 kicks · record]
phoenix        chips=[butterfly family, 5 ADD]
mind-bender    chips=[blender family, 6 ADD]
montage        chips=[whirl family, 7 ADD, 3 kicks · record]
```

All chip combinations match design predictions.

---

## 8. Preservation guarantees

| Contract | Preserved because |
|----------|-------------------|
| Ontology richness | All data (family, adds, isModifier, recordCount, topValue) still surfaces in the ribbon; nothing removed semantically |
| Semantic identity | Decomposition strip + hero formula + decomposition cluster all unchanged; ribbon is metadata, not identity |
| Federation-not-adoption | Ribbon reads from existing service-layer view-model fields; no new data sources |
| Restraint-first | Drops the lowest-signal element (`compound` category chip); does NOT drop any structural surface |
| Mobile readability | Flex-wrap handles narrow viewports; chip padding scales at <600px |
| Atom sparse-friendliness | Toe Stall renders 2 chips + formula + 3-section page; still feels intentional |
| Modifier-trick disambiguation | "Modifier" chip preserves the classification signal that previously lived in the eyebrow |
| Sortname fallback | Pages without `heroDecomposition` (no decomp strip) continue to show sortname subtitle as identity continuity (UX3f-a F1 logic preserved) |
| Hero formula prominence | Formula rises closer to the decomposition strip (only ~12px between them now vs ~30-40px before via interceding family-badge + hero-stats) |
| Accessibility | `<p class="trick-hero-meta-ribbon" aria-label="Trick metadata">` adds an aria label; chip text remains readable; family chip remains a `<a>` link |

---

## 9. What was NOT removed

Per the user direction "do not reduce ontology richness, do not flatten semantic identity, do not remove the decomposition strip":

| Element | Status |
|---------|--------|
| Decomposition strip (UX3d-a) | preserved |
| Hero formula (UX3c-c) | preserved |
| Hero summary (UX2 prose) | preserved |
| Featured-media preview | preserved |
| Family chip (just renamed) | preserved (as ribbon chip) |
| ADD chip | preserved (as ribbon chip) |
| Record chip | preserved (as ribbon chip) |
| Modifier classification | preserved (now as ribbon chip on modifier-trick pages) |
| Breadcrumb | preserved |
| h1 | preserved |
| All cluster surfaces (notation, operational, modifier-layering) | preserved |
| All relationship surfaces (related, parallels, substitutions) | preserved |
| All editorial prose (execution, learning, prerequisite) | preserved |
| All navigation surfaces (pathways, previous, next, family ladder) | preserved |
| All record surfaces (passback records, progression) | preserved |
| All diagnostic surfaces (structural decomposition collapsed) | preserved |

The consolidation drops only:
- Eyebrow `<p>` (info absorbed into ribbon)
- Standalone family-badge `<p>` (absorbed into ribbon)
- hero-stats `<div>` (absorbed into ribbon)
- The `compound` category chip (low-signal, per UX3f-a §12)

---

## 10. Files changed

| File | Type | Notes |
|------|------|-------|
| `src/views/partials/trick-hero.hbs` | modified | Replaced 3 elements (eyebrow + family-badge + hero-stats) with single ribbon `<p>`; preserved everything else |
| `src/public/css/style.css` | modified | +~50 lines of `.trick-hero-meta-ribbon` + `.trick-hero-meta-chip-*` rules |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | modified | Family-badge test assertion updated to new class name |
| `legacy_data/reports/html_qc/ux3f-b/*.html` | new | 6 snapshots for QC diff |
| `exploration/freestyle-notation-grammar/UX3F_B_HERO_CONSOLIDATION.md` | new | this report |

No service-layer changes. No new partials. No schema changes.

---

## 11. Safe-now vs medium-risk -- post-UX3f-b state

### Safe-now (this phase)

| # | Refinement | Status |
|---|-----------|:------:|
| F4-a | Drop hero eyebrow | **implemented** |
| F4-b | Merge family-badge + hero-stats into ribbon | **implemented** |
| F4-c | Drop `compound` category chip | **implemented** |
| F5 | "Modifier" chip on modifier-trick pages | **implemented** (replaces eyebrow signal) |

### Medium-risk (deferred per UX3f-a §14.2)

| # | Refinement | Notes |
|---|-----------|-------|
| F6 | Family lineage two-column layout for dense families | CSS-only; deferred |
| F7 | Pathways card compression | Reduce padding + inline title+primary |
| F8 | Substitution inline-compact mode for count ≥3 | Bounded to Matador's 4-substitution render |
| F9 | `.content-section` margin tightening 20→16px on `.trick-shell` | Bigger rhythm change; defer until current phase reviewed |
| F10 | Related Tricks hashtag quietening | Affects all pages |
| F11 | Modifier-layering compact mode for ≥4 modifiers | Loses prototype nested-box motif on Montage; controversial |
| F12 | Move family-note from About to family-section eyebrow | Restructures About partial |
| F13 | h1 font-size reduction (~1.8rem desktop) | Significant visual; needs verification |

### Avoid (preserved from UX3f-a §14.3)

All UX3 surfaces (hero formula, decomposition strip, modifier-layering panel, relationship surfaces, prose sections) remain explicitly NOT removable.

---

## 12. What this phase achieves

Per the user's success criterion "one strong semantic moment, not multiple competing semantic moments":

**Pre-UX3f-b hero**: 3 competing metadata moments (eyebrow / family-badge / hero-stats) stacked between h1 and decomposition strip.

**Post-UX3f-b hero**: 1 unified metadata moment (ribbon) between h1 and decomposition strip.

The hero now reads top-to-bottom as: **identity → metadata → structure → math → description → media**. Each zone has one role; none compete.

Atoms gain elegance: Toe Stall's hero stack drops to 3 elements (h1 + ribbon + formula). Reads decisively.

Flagships gain calm: Montage saves ~80px in the hero stack while preserving all 22 page surfaces below. The compression eases the saturation diagnosed in UX3f-a without removing any structural intelligence.

---

## 13. Decision points

1. **Approve UX3f-b commit?** Self-contained phase. Single commit recommended.
2. **Confirm the dropped `compound` category chip is acceptable?** It was low-signal; the rest of the hero conveys compound-trick nature. If "compound" / "dex" / "set" / "modifier" classification matters more than I'm crediting, restore as a fourth chip.
3. **Sequence next phase**: F8 (substitution inline-compact for Matador's 4-row case) is the smallest next gain; F6 (family-lineage 2-column) is the safest non-Matador refinement.
4. **Reading the page now**: does Montage hero feel calmer? Does Toe Stall still feel intentional (not empty)?
