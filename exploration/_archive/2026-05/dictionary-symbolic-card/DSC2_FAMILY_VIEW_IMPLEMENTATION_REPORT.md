# DSC2_FAMILY_VIEW_IMPLEMENTATION_REPORT

**Project:** DICTIONARY-SYMBOLIC-CARD-2 — Implementation slice 2
**Scope:** Migrate the **By Family** dictionary view (`?view=family`) onto the shared symbolic trick-card system. Same shared `<dictionary-trick-card>` partial as slice 1. Only the grouping wrapper, within-group ordering, and the cross-link affordance are new. By Category and By Sets views remain untouched.
**Date:** 2026-05-13
**Result:** Shipped; 2835 / 2835 unit+integration tests pass (5 new tests from slice 2); `tsc` clean.

---

## 1. Before / after behaviour

### 1.1 Before

By Family rendered as a `family-grid` of small `family-card` divs. Each family card carried a 2-column records-table (`<th>Trick</th><th>ADD</th>`). No notation surfaced. No anchor convention. No cross-link to the walking-progression or any other symbolic surface. Visual idiom: spreadsheet-style mini-tables.

### 1.2 After

By Family renders as a vertical stack of family sections (one `<section class="content-section trick-family-group">` per family). Each section carries:

- Family heading row (`<h2>`) wrapping an `<a>` family-filter link (`/freestyle/tricks?family=<slug>`)
- Member count chip (`<span class="section-count">N</span>`)
- Optional cross-link to a symbolic educational surface (e.g., butterfly family → walking-family progression)
- Stack of symbolic trick cards rendered via the same `dictionary-trick-card.hbs` partial

The cards are visually identical to By ADD. The only differences live in the grouping wrapper and within-group ordering.

---

## 2. Within-group ordering

Per `UNIFIED_DICTIONARY_VIEW_PLAN.md` §4.2:

1. **Anchor first.** When a family has a base trick whose slug equals the family slug (e.g., `butterfly` in the butterfly family, `whirl` in the whirl family), the anchor card renders **first** regardless of ADD.
2. **ADD ascending** for all other family members. Rows without numeric ADD sink to the bottom (handled by `Number.POSITIVE_INFINITY` substitution).
3. **Trick name alphabetical** as final tie-breaker.

The anchor-first rule preserves the family's structural narrative: a learner reading the family from top to bottom sees the anchor, then the lowest-ADD compound, then progressively higher-ADD compounds. The family becomes a difficulty ladder anchored at its base.

---

## 3. Cross-link strategy

The service ships a small `FAMILY_CROSS_LINKS` map. Each entry maps a family slug to an optional symbolic-surface deep-link:

```ts
const FAMILY_CROSS_LINKS: Record<string, { label: string; href: string } | undefined> = {
  butterfly: { label: 'Walking-family progression', href: '/freestyle/progression/walking-family' },
};
```

Only the butterfly family currently has a corresponding shipped surface (the walking-family progression page). Future slices may add cross-links when more symbolic surfaces ship — for example:
- whirl-family → `/freestyle/modifier/spinning` (when the modifier-family page emphasises the whirl rotational topology)
- whirl-family → `/freestyle/modifier/paradox` (when the paradox modifier page references the whirl base)

These are not added in slice 2 because the spec requires curator validation of the cross-link UX before expanding the map. Track for a future slice.

The crossLink renders as a small `<p class="trick-family-cross-link"><a>...</a></p>` row immediately under the heading. Subordinate to the cards visually; non-load-bearing if absent.

---

## 4. Service-layer shape (Δ from slice 1)

`FreestyleFamilyGroup` extended:

```ts
export interface FreestyleFamilyGroup {
  familySlug: string;
  familyName: string;
  members: FreestyleTrickIndexRow[];                                 // legacy
  cards: DictionaryTrickCard[];                                       // slice 2 (NEW)
  crossLink: { label: string; href: string } | null;                  // slice 2 (NEW)
}
```

The legacy `members` array is preserved as a parallel emission. No other view consumes it currently; once By Category and By Sets migrate, the legacy field can be removed.

The new `cards` array uses the same `shapeDictionaryTrickCard` builder from slice 1. The sort happens at the DB-row level (so card construction sees rows in the desired order); cards are then built one-for-one.

---

## 5. Fields rendered (recap)

The card itself is unchanged from slice 1. All four required slots plus optional media chip / status badge / placeholder note apply identically. See `SYMBOLIC_CARD_SPEC.md` §1 and slice-1 report §2 for the canonical inventory.

The grouping wrapper renders:

| Slot | Source |
|---|---|
| Family heading anchor ID | `id="family-{familySlug}"` |
| Family heading text | `{{familyName}} family` |
| Family-filter link in heading | `?family={{familySlug}}` |
| Member count chip | `{{cards.length}}` |
| Cross-link (optional) | `{{crossLink.label}}` → `{{crossLink.href}}` |

Mobile behaviour is inherited from slice 1's card CSS plus the existing `.section-heading` rules.

---

## 6. Tests passed

| Test file | Outcome |
|---|---|
| `freestyle.dictionary-trick-card.routes.test.ts` (slice 1 + slice 2) | 23 / 23 |
| `freestyle.tricks-insights.routes.test.ts` | 100 / 100 (1 test rewritten to match new heading markup) |
| Full unit+integration | **2835 / 2835** pass (155 test files) |
| `tsc -p tsconfig.json --noEmit` | clean |

**Slice-2-specific tests** added to `freestyle.dictionary-trick-card.routes.test.ts`:

1. Renders family sections with anchor IDs (`id="family-butterfly"`)
2. Family section heading wraps a family-filter `<a>` link
3. Family section renders the dict-card-stack with shared cards
4. Butterfly family heading renders the walking-progression cross-link
5. Anchor-first ordering: butterfly base trick renders before its compound members

**Regression-guard tests** updated:

- The slice-1 test "`other views do NOT use the dict-card-stack container`" was split: family now DOES use the stack (slice 2 migrated); category and sets do NOT (still legacy).
- The pre-existing test "`makes family-card titles clickable as family-filter links in the family view`" was updated from the old `<h3 class="family-card-title">` markup to the new `<h2>` heading-wrap.

---

## 7. Files changed (slice 2 only)

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | `FreestyleFamilyGroup` extended with `cards` + `crossLink`; introduced `FAMILY_CROSS_LINKS` map; refactored family-group construction to use anchor-first ordering via `sortFamilyEntries` + `buildFamilyGroup` helpers. (~+50 lines) |
| `src/views/freestyle/tricks.hbs` | By Family branch replaced (`family-grid` + records-table → `dict-card-stack` per family section, with heading anchor + cross-link row). (~-35 / +18 lines) |
| `src/public/css/style.css` | `.trick-family-cross-link` style for the heading-row cross-link. (+12 lines) |
| `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` | +5 slice-2 tests; updated regression-guard for migrated family view; seed extended with butterfly base trick to populate the butterfly family. |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | Updated `makes family-card titles clickable` to assert the new `<h2>` heading markup. |

---

## 8. Known visual concerns

1. **Cross-link map is sparse.** Only butterfly has a cross-link today. Other families with shipped symbolic surfaces (whirl → spinning modifier page, mirage → paradox modifier page) could gain cross-links but each addition warrants curator review for label clarity. Track for a future slice.
2. **Member count chip on family heading.** Slice 2 surfaces the chip identically to By ADD; family counts are similar in magnitude (whirl: ~17, butterfly: ~12) so the visual rhythm is consistent.
3. **No within-ADD sub-grouping yet.** Family members are flat within a section. A future enhancement (per `UNIFIED_DICTIONARY_VIEW_PLAN.md`) could insert lightweight ADD subheadings inside a family. Not in scope.
4. **Anchor convention assumes `slug === familySlug`.** Most canonical families satisfy this (`butterfly`, `whirl`, `mirage`, `osis`, `torque`, etc.). A few derivative families don't have a base-trick row at all (e.g., a `dada-curve` family has no `dada-curve` slug to anchor); those families fall through to ADD-ascending. Acceptable.
5. **Family heading clicks to the family-filter route** which routes back into the same `?view=*` with `?family=` applied. This works but produces a re-render of the same view filtered to one family — useful but a bit repetitive. Track as a future UX question.

---

## 9. Constraints honoured

- No ontology changes
- No ADD changes
- No parser changes
- No alias insertion
- No glossary rewrite
- No schema changes
- Only the By Family view migrated; By Category and By Sets explicitly preserved at their legacy markup
- Observational-layer separation: cross-links to symbolic surfaces preserve the canonical/observational boundary (cross-links point to observational surfaces; the heading and family-filter link remain on canonical structure)

---

## 10. Recommendation for next migration target

**Recommend: `?view=sets` → renamed to `?view=component`.**

Per `COMPONENT_VIEW_REDESIGN.md` (Task E in DSC-1), this slice is the largest conceptual change of the four browse modes:

- Rename `?view=sets` → `?view=component` (with 301 redirect for compatibility)
- Four axes (body modifiers / set primitives / topology / archetypes) consumed from the symbolic-grammar-2 CSVs
- Intentional duplication: a trick appears in every group it belongs to
- Cross-link from each group heading to its modifier-family page when one exists (paradox, spinning, ducking already shipped)

This is the largest delta and the highest user-value next: it unlocks "show me all paradox tricks" / "show me all whirl-topology tricks" — questions today's dictionary cannot answer.

Suggested sequence for subsequent slices:

| Slice | View | Scope |
|---|---|---|
| 3 | `?view=sets` → `?view=component` | Rename + 4-axis grouping + intentional duplication + modifier-family cross-links |
| 4 | `?view=category` | Retire the spreadsheet; render via shared card; flat list per category with ADD-ascending ordering |

---

## 11. Stop confirmation

Per the slice cadence: **stopping after this slice.** No work on Component or Category begins automatically.

---

*End of DSC2_FAMILY_VIEW_IMPLEMENTATION_REPORT.md*
