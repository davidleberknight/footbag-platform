# DSC2_CATEGORY_VIEW_SLICE3B_REPORT

**Project:** DICTIONARY-SYMBOLIC-CARD-2 — Implementation slice 3B
**Scope:** Migrate the **By Category** dictionary view (`?view=category`) onto the shared symbolic trick-card system. The 5-column legacy spreadsheet is retired entirely. Card-uniformity contract now holds across every browse view.
**Date:** 2026-05-13
**Result:** Shipped; 2862 / 2862 unit+integration tests pass; tsc clean.

---

## 1. Before / after

### 1.1 Before — the spreadsheet

By Category rendered as five-column tables, one per category. Header row: `Trick | ADD | Description | Notation | Also known as`. Each trick's row carried a self-anchored hashtag link (`#whirl` → `/freestyle/tricks/whirl`), an ADD value, the raw description prose, the semantic notation as a `<code>` cell, and comma-separated aliases. The visual idiom was a data grid; long descriptions made the cells uneven.

### 1.2 After — symbolic cards

By Category now renders as `<section class="trick-category-group">` entries with stable `id="category-{slug}"` anchors. Each section's heading wraps the category label in a self-anchored `<a>` link + a count chip. Cards inside the section render via the shared `dictionary-trick-card.hbs` partial — identical to the By ADD, By Family, and By Component views. Cards sort ADD ascending then trick name alphabetical within a category.

The dictionary's **card-uniformity contract** now holds: every browse view (`?view=add` default, `?view=family`, `?view=component`, `?view=category`, plus the `?view=sets` alias) renders the same card. Only the grouping wrapper differs.

---

## 2. Within-category ordering

Per `UNIFIED_DICTIONARY_VIEW_PLAN.md` §5.3, cards within a category sort by:

1. **ADD ascending.** Rows without numeric ADD sink to the bottom via `POSITIVE_INFINITY` substitution.
2. **Trick name alphabetical** as tiebreaker.

This is the same sort used in slice 3A (component view) for within-group ordering. The category view inherits the convention so the reader's expectation transfers across views.

Verified by integration test: in the seeded compound category (mirage 2 ADD, whirl 3 ADD, ripwalk 4 ADD, spinning-whirl 4 ADD, montage 7 ADD), cards render in that exact order — including `ripwalk` before `spinning-whirl` because of the alphabetical tiebreaker within ADD=4.

---

## 3. Category enumeration

The view continues to enumerate categories via the existing `categoryOrder` constant + alphabetical fallthrough for any non-priority categories present:

| Slot | Category | Anchor ID | Source |
|---:|---|---|---|
| 1 | `dex` | `category-dex` | `categoryOrder[0]` |
| 2 | `body` | `category-body` | `categoryOrder[1]` |
| 3 | `set` | `category-set` | `categoryOrder[2]` |
| 4 | `compound` | `category-compound` | `categoryOrder[3]` |
| 5+ | _any other_ | `category-{slug}` | Alphabetical fallthrough |

Modifier-category rows are excluded (existing `feedback_modifier_public_visibility` rule). Empty categories don't render — the existing `categoryOrder.filter(cat => grouped.has(cat))` filter ensures only populated categories appear.

---

## 4. Files changed

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | `FreestyleTrickGroup` extended with `cards: DictionaryTrickCard[]` + `anchorId: string`. `grouped` map widened from `FreestyleTrickRow[]` to `FreestyleTrickRowWithStatus[]` so `shapeDictionaryTrickCard` has the operational-notation columns. New `sortCategoryRows` + `buildCategoryGroup` helpers; ADD-ascending-then-name sort applied. ~+30 lines. |
| `src/views/freestyle/tricks.hbs` | Category branch retired: 5-column `<table class="records-table">` replaced with `<section class="trick-category-group" id="category-{slug}">` + heading-wrapped self-anchor link + count chip + `<div class="dict-card-stack">` + shared partial. ~−40 / +12 lines. |
| `tests/integration/freestyle.category-view.routes.test.ts` | **NEW.** 11 integration tests covering route + spreadsheet retirement; section anchors + heading links + count chip; ADD-ascending-then-name sort; modifier-row exclusion; card-uniformity attributes. |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | Updated 4 legacy assertions: "shows trick descriptions in the category view" (now: descriptions NOT rendered); "renders Notation column header" (now: header retired, dict-card-stack present); "renders a hashtag under each trick name" + "strips hyphens from compound slugs" (now: data-trick-slug attribute replaces hashtag-link pattern). |
| `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` | Regression guard upgraded: category is no longer "not-yet-migrated"; new card-uniformity test loops over every browse view (`add`, `family`, `category`, `component`, `sets`) and asserts each renders `dict-card-stack`. |

---

## 5. Tests passed

- New: `freestyle.category-view.routes.test.ts` → 11 / 11
- Updated regression: `freestyle.tricks-insights.routes.test.ts`, `freestyle.dictionary-trick-card.routes.test.ts`
- Full unit+integration: **2862 / 2862** pass (157 test files; +11 from slice 3A)
- `tsc -p tsconfig.json --noEmit` → clean

---

## 6. The card-uniformity invariant — now a tested contract

Slice 3B closes the contract `UNIFIED_DICTIONARY_VIEW_PLAN.md` §2 specified:

> Every browse-mode view shares this contract:
> 1. **Card component:** identical across views.
> 2. **Grouping wrapper:** an `<section>` per group, headed by a group-heading row.
> 3. **Within-group ordering:** by ADD ascending, then trick name alphabetical (with documented exceptions per view).
> 4. **Modifier-stub exclusion** at the service layer.
> 5. **Empty groups visible** when populated count is zero (component view chose to hide; others retain the visible-when-populated rule).
> 6. **No prose** on cards.
> 7. **Observational separation** where applicable.

The contract is now mechanically verified by the regression test:

```typescript
it('every browse view now renders via the shared dictionary-trick-card partial (card-uniformity contract)', async () => {
  for (const view of ['', 'family', 'category', 'component', 'sets']) {
    const url = view ? `/freestyle/tricks?view=${view}` : '/freestyle/tricks';
    const res = await request(createApp()).get(url);
    expect(res.status).toBe(200);
    expect(res.text, `${url} must render dict-card-stack`).toContain('dict-card-stack');
  }
});
```

If any future change re-introduces a non-partial render path in one of the browse views, this test fails. The contract has teeth.

---

## 7. Known gaps / curator follow-ups

1. **Categories that exist in production but weren't in the test fixture:** real-world data may include `dex` and `body` rows. The service constructs them identically to `set` and `compound`. No code-path delta expected; coverage just requires production data to exercise.

2. **Within-category headings.** Some categories (especially `compound`, which is the largest) might benefit from sub-grouping (e.g., by ADD subheadings inside the section). `UNIFIED_DICTIONARY_VIEW_PLAN.md` §5.4 flags this as a future enhancement; not in slice 3B scope.

3. **Description data is now unrendered on browse cards.** The seed strings that previously appeared in the `Description` column of the spreadsheet no longer appear anywhere on the browse page. They remain on the trick-detail page (`/freestyle/tricks/:slug` via `trick-about.hbs`). This is intentional per the symbolic-card spec; no data is lost, just relocated.

4. **The `?view=category` URL has no cross-link affordances yet.** Unlike `?view=family` (which surfaces cross-links to walking-progression / topology pages), `?view=category` has no cross-link convention defined. If curators want category-level cross-links (e.g., compound → walking-progression for butterfly compounds), that's a future enhancement.

5. **The `dex` and `body` categories are slated for retirement** per the ontology cleanup work in the curator track — most tricks currently classified as `dex` or `body` are arguably compounds. If those categories empty out, slice 3B's empty-category filter quietly hides them.

---

## 8. Constraints honoured

- No schema changes
- No ontology changes
- No ADD-rule changes
- No parser changes
- No alias insertion
- Same shared `<dictionary-trick-card>` partial used (no special-case templates)
- Modifier-category rows excluded (existing filter preserved)
- Empty categories hidden (existing filter preserved)
- Cards sort ADD ascending then name (same as slice 3A)
- Card-uniformity contract now mechanically tested across all browse views

---

## 9. The view-toggle, end of slice 3B

The dictionary's view-toggle now reads:

```
By ADD · By family · By category · By component
```

Four browse modes; each renders the same card; each carries its own grouping wrapper. `?view=sets` continues to work as a legacy alias for `?view=component`. The dictionary's surface uniformity is structurally complete.

A fifth surface remains conceptually open: **By topology** as an advanced symbolic browse over the symbolic-grammar-2 data (topology groups + movement archetypes). That's a separate slice (likely outside DSC-2's slice numbering — perhaps "DSC-2-extra" or a new project). The data is shipped; the surface is not. Whether to add it as a fifth toggle tab or as a sidebar lens is a curator decision pending.

---

## 10. Recommendation for what's next

**DSC-2 is structurally complete after slice 3B.** Every browse view migrated. Card-uniformity contract tested. The dictionary's surface vocabulary is consolidated.

Three reasonable next directions:

1. **Topology axis as a separate browse view.** Most natural extension of slice 3A — `?view=topology` adds the deferred axis as its own view (rather than as a fifth column on the component view). Estimated 1–2 dev-days; same pattern as 3A.

2. **Token-level glossary linking on cards** (per `SYMBOLIC_FUTURE_CAPABILITIES.md` §5.3). Each operational-notation token gets a `linkHref` to its glossary anchor; the card markup wraps tokens in `<a>` when the link is present. Estimated 1 dev-day; small tokenizer extension + template change.

3. **GLOSSARY-V5 architecture migration** (per the just-shipped `glossary-v5-synthesis` exploration package). Begin the §1–§12 V5 glossary build by extending today's static template. Larger scope — curator-led content authoring.

The DSC-2 track itself doesn't need more work to satisfy its original brief. Subsequent work depends on which direction the curator prioritises.

---

## 11. Stop confirmation

Per the slice cadence: **stopping after slice 3B.** No further DSC-2 work begins automatically.

---

*End of DSC2_CATEGORY_VIEW_SLICE3B_REPORT.md*
