# DSC2_ADD_VIEW_IMPLEMENTATION_REPORT

**Project:** DICTIONARY-SYMBOLIC-CARD-2 — Implementation slice 1
**Scope:** Build the shared symbolic trick-card view-model + partial; migrate ONLY the By ADD dictionary view to use it. Other browse views (By family, By category, By sets) intentionally untouched.
**Date:** 2026-05-13
**Result:** Shipped; 2830 / 2830 unit+integration tests pass; tsc clean.

---

## 1. Before / after behaviour

### 1.1 Before (legacy By ADD view)

Each trick rendered as a `<li class="trick-row">` carrying:

- Title link
- Tier-aware media chip (Tutorial available / Demo only / No video yet)
- ADD chip
- Family chip
- Category chip
- Status badge (for external placeholders)
- Inline raw semantic notation (`<code>{{notation}}</code>`) or "Notation pending" fallback
- Prose description or "Description pending" fallback
- Aliases line, capital `Aliases:` label
- Placeholder note (for external placeholders)

The layout read as a spreadsheet-style row of metadata pills with a prose description below. Notation was rendered as a raw string, not role-tagged.

### 1.2 After (symbolic trick card)

Each trick renders as an `<article class="dict-card" data-trick-slug="..." data-media-coverage="...">` carrying:

- Title link (or plain span for external placeholders) — top-left
- ADD label (`4 ADD` / `— ADD`) — top-right; co-equal weight with the title
- Operational notation — role-tagged token spans (cool/warm palettes already in the CSS) — the **visual center of gravity** of the card
- Aliases line (lowercase `aliases:` label, comma-separated) when populated
- Optional media chip (`Tutorial available` / `Demo only`) when media coverage exists; absent when no media (absence is the signal)
- Status badge (`External source — not yet adjudicated`) for external placeholders
- Placeholder note explainer for external placeholders

Operational notation null → `Notation pending` italic placeholder, not a raw-string code block.
Prose descriptions → removed entirely from browse cards (still appear in `?view=category` legacy spreadsheet).
Family/category chips → removed (deferred; future slice may reintroduce family chip if needed).
Capital "Aliases:" → lowercase "aliases:" with letter-spaced uppercase prefix label.

---

## 2. Fields rendered (by slot)

| Slot | Field on `DictionaryTrickCard` | Rendered when |
|---|---|---|
| Title link | `displayName`, `href`, `isExternalOnly` | Always; href suppressed when external-only |
| ADD label | `adds`, `addsLabel` | Always (label is pre-shaped: `4 ADD` / `— ADD`) |
| Operational notation | `operationalNotation` (role-tagged tokens) | When `operationalNotationStatus === 'available'` |
| Notation pending placeholder | — | When `operationalNotationStatus === 'pending'` |
| Aliases | `commonAliases[]` | When non-empty |
| Media chip | `mediaCoverage` (`'tutorial'\|'demo'`) + `hasReferenceMedia` | When media exists (chip absent for `'none'`) |
| Status badge | `statusBadge` | When external-only placeholder |
| Placeholder note | `placeholderNote` | When external-only placeholder |
| Data attributes | `data-trick-slug`, `data-media-coverage` | Always (for test + future-tooling access) |

Reserved fields not yet rendered: `hasRecords`, `trickFamily`. Both are on the view model for future slices but the partial does not surface them — the operational notation is the visual anchor; chips for these would dilute it.

---

## 3. Notation coverage

The card consumes `freestyle_tricks.operational_notation` (column shipped earlier in O1a/O1b/O1d). The column is **sparse** across the dictionary; many rows have `operational_notation = NULL`.

| Card state | When |
|---|---|
| Role-tagged token spans | `operational_notation` populated → `shapeOperationalNotationDisplay()` returns non-null |
| "Notation pending" italic | `operational_notation` NULL / empty / whitespace-only |

The card never renders the legacy semantic `notation` column on the browse view. Semantic notation still appears on the trick-detail page via `trick-notation.hbs`. This is the intended split per `NOTATION_LAYER_STRATEGY.md` and `SYMBOLIC_CARD_SPEC.md` §4.0: operational notation is the card's center of gravity.

**Gap:** the production database population of `operational_notation` is unknown but expected to be sparse. Many browse cards may show "Notation pending" until curator authoring fills the column. This is a content gap, not a rendering gap.

---

## 4. Alias handling

| Behaviour | Source |
|---|---|
| All aliases from `freestyle_trick_aliases` table | `aliasesByTrickSlug` map already built by `getFreestyleTricksIndexPage` |
| Comma-separated rendering, alphabetical order | Determined by `freestyleTrickAliases.listAll` query (`ORDER BY trick_slug, alias_text COLLATE NOCASE`) |
| Lowercase "aliases:" label | Per `SYMBOLIC_CARD_SPEC.md` §4: aliases are visually secondary; label is small/muted |
| Common-alias filter | **Not yet applied** — the `commonAliases` field name reserves the contract; slice 1 passes all aliases through |

**Gap:** the field is named `commonAliases` but currently equals the full alias array. A future curator-policy slice will introduce alias-kind tagging (`folk` / `structural` / `typo` / `url-variant`) and the service will filter to `kind = 'folk' OR kind = 'common'`. Slice 1 documents the contract without enforcing the filter.

---

## 5. Mobile considerations

CSS in `src/public/css/style.css`:

```css
@media (max-width: 480px) {
  .dict-card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .dict-card-title { font-size: 1.05rem; }
  .dict-card-add { font-size: 0.85rem; }
  .dict-card-notation { font-size: 0.92rem; }
}
```

Behaviour on mobile:

- Title + ADD stack vertically (title on top, ADD below)
- Operational notation slightly smaller (0.92rem from 0.98rem) but still monospace and role-coloured
- Hanging indent on notation continuation lines preserved: `text-indent: -1.4em; padding-inline-start: 1.4em`
- Token spans carry `white-space: nowrap` (`.dict-card-notation .op-token`) so multi-word fusions (`butterfly wing`, `front whirl`) never break mid-token

Sticky group headings: NOT implemented in slice 1. Group headings (the `<h2>{{addLabel}}</h2>` in `tricks.hbs`) scroll normally. Track as a future enhancement.

---

## 6. Other views — regression-checked

| View | Status |
|---|---|
| `?view=family` | Untouched. Returns 200; does NOT use `dict-card-stack`. |
| `?view=category` | Untouched. Still renders the legacy spreadsheet table. |
| `?view=sets` | Untouched. Still renders `<li class="trick-row">` with media chips. |

Tests in `freestyle.dictionary-trick-card.routes.test.ts` explicitly verify each non-ADD view returns 200 AND does NOT contain `dict-card-stack`. Regression coverage is in place for the next migration phase.

---

## 7. Files changed

| File | Change |
|---|---|
| `src/db/db.ts` | Extended `FreestyleTrickRowWithStatus` + `listAllWithPending` query to surface `operational_notation` + `operational_notation_source` columns to the dictionary index. (+7 lines) |
| `src/services/freestyleService.ts` | New `DictionaryTrickCard` interface; new `shapeDictionaryTrickCard` builder; `FreestyleTrickAddGroup` extended with `cards: DictionaryTrickCard[]`; addGroups construction now emits parallel `tricks` (legacy) + `cards` (new) shapes. (+103 / -8 lines) |
| `src/views/freestyle/tricks.hbs` | Replaced the inline By ADD `<li class="trick-row">` markup with a `<div class="dict-card-stack">` loop over `cards` rendering via the new partial. By family / By category / By sets branches unchanged. (-38 / +4 lines) |
| `src/views/partials/dictionary-trick-card.hbs` | **NEW.** The canonical reusable card partial; consumes `DictionaryTrickCard`. |
| `src/public/css/style.css` | New `.dict-card-*` rules; mobile media query at < 480px; operational notation typography (monospace, hanging indent, role-coloured via existing `.op-token--*` classes). (+137 lines) |
| `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` | **NEW.** 18 integration tests covering the new card: route stability, required slots, sparse-vs-deep rendering (Toe Stall + Mirage + Ripwalk + Mobius + Montage), card placement within ADD groups, non-ADD regression guard. |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | 10 pre-existing tests updated: description / placeholder / chip / alias assertions migrated to the new card contract. Pre-existing test count unchanged. |

---

## 8. Tests passed

- New: `freestyle.dictionary-trick-card.routes.test.ts` → 18 / 18
- Updated: `freestyle.tricks-insights.routes.test.ts` → 100 / 100 (10 tests rewritten; full suite still passing)
- Full unit+integration: **2830 / 2830** pass (155 test files)
- `tsc -p tsconfig.json --noEmit` → clean

---

## 9. Sample card renders (HTML snapshots from tests)

### Toe Stall (sparse)

```html
<article class="dict-card" data-trick-slug="toe-stall" data-media-coverage="none">
  <header class="dict-card-header">
    <a class="dict-card-title" href="/freestyle/tricks/toe-stall">toe stall</a>
    <span class="dict-card-add" aria-label="1 ADD">1 ADD</span>
  </header>
  <code class="dict-card-notation" aria-label="Operational notation">
    <span class="op-token op-token--component-flag op-token--component-flag-toe" data-role="component_flag" title="...">[toe]</span>
    <span class="op-token op-token--sequence-op-minor" data-role="sequence_op" title="...">&gt;</span>
    <span class="op-token op-token--surface" data-role="surface" title="...">toe</span>
  </code>
</article>
```

Three notation tokens; no aliases; no media chip. Card height ≈ 60-70px.

### Ripwalk (compound)

```html
<article class="dict-card" data-trick-slug="ripwalk" data-media-coverage="none">
  <header class="dict-card-header">
    <a class="dict-card-title" href="/freestyle/tricks/ripwalk">ripwalk</a>
    <span class="dict-card-add" aria-label="4 ADD">4 ADD</span>
  </header>
  <code class="dict-card-notation" aria-label="Operational notation">[clip] &gt; op in dex &gt; butterfly wing &gt; ss clipper</code>
  <p class="dict-card-aliases">
    <span class="dict-card-aliases-label">aliases:</span>
    blurry butterfly, stepping butterfly
  </p>
</article>
```

Multi-token operational notation; two aliases. Card height ≈ 90-100px.

### Mobius (folk-name alias coincides with semantic compressed form)

```html
<article class="dict-card" data-trick-slug="mobius" data-media-coverage="none">
  <header class="dict-card-header">
    <a class="dict-card-title" href="/freestyle/tricks/mobius">mobius</a>
    <span class="dict-card-add" aria-label="5 ADD">5 ADD</span>
  </header>
  <code class="dict-card-notation" aria-label="Operational notation">[clip] &gt; spinning &gt; ss miraging op osis</code>
  <p class="dict-card-aliases">
    <span class="dict-card-aliases-label">aliases:</span>
    gyro torque
  </p>
</article>
```

Single alias (`gyro torque`) — folk-name layer 5 coincides textually with the semantic-compressed layer 2. Per the layer model (`NOTATION_LAYER_STRATEGY.md` §3.1), this is expected; the card surfaces the single alias without semantic-vs-folk distinction in slice 1. Future detail-density renderings will surface both layer roles separately.

### Montage (deep compound)

```html
<article class="dict-card" data-trick-slug="montage" data-media-coverage="none">
  <header class="dict-card-header">
    <a class="dict-card-title" href="/freestyle/tricks/montage">montage</a>
    <span class="dict-card-add" aria-label="7 ADD">7 ADD</span>
  </header>
  <code class="dict-card-notation" aria-label="Operational notation">
    [clip] &gt; spinning &gt; ducking &gt; paradox symposium whirl &gt; ss clipper
  </code>
</article>
```

Eight tokens; the operational signature of the trick is visually scannable. Same template as Toe Stall — only slot population differs.

---

## 10. Known visual concerns

1. **Operational notation coverage is sparse.** Most browse cards will currently show "Notation pending" until curator authoring catches up. This is a content gap, not a rendering bug. Recommend a curator effort to populate `operational_notation` on the highest-traffic tricks before migrating the remaining views.

2. **Common-aliases filter not yet applied.** Slice 1 passes all aliases through. Some tricks have many aliases (typo variants, URL-slug variants, dialect spellings). On those cards the alias line may grow longer than visually desirable. Track for a curator-policy slice.

3. **Group headings do not stick.** Long ADD groups (4 ADD typically has 30+ members in production) scroll past the heading. Track sticky-heading as a CSS-only enhancement.

4. **No grouping indicator within an ADD section.** The legacy By ADD view did not group within an ADD value either, so no regression. Per `UNIFIED_DICTIONARY_VIEW_PLAN.md` §3.2, a future enhancement is to sort within-ADD by family + name; that's a service-side change deferred for now.

5. **Token-level linking not yet implemented.** Each operational token is a span; future work (per `SYMBOLIC_FUTURE_CAPABILITIES.md` §5.3) would wrap each in an `<a>` to its glossary anchor / modifier-family page. Deferred.

6. **Mobile sticky behaviour for ADD group headings is not implemented.** Scrolling a long group can leave the reader without a header reference. Recommended for the next mobile-polish pass.

---

## 11. Constraints honoured (recap)

- No ontology changes
- No ADD changes
- No parser changes
- No alias insertion
- No glossary rewrite
- No schema changes (the `listAllWithPending` query selects already-existing columns; type extended to surface them; no DDL)
- Only the By ADD view migrated; By family / By category / By sets explicitly preserved at their legacy markup

---

## 12. Recommendation for next migration target

**Recommend: `?view=family`.**

Reasoning:

1. **Smallest delta.** The family view today is a 2-column records-table (Trick | ADD). Migrating it to symbolic cards is structurally smaller than By Category (which is a 5-column spreadsheet) or By Sets (which has additional grouping logic).
2. **Highest user-value next.** The family view is the second most common navigation path after By ADD. Migrating it next means the dictionary's two most-used surfaces share the same card vocabulary; the user mental model unifies fastest.
3. **Tests the per-group cross-link affordance** specified in `UNIFIED_DICTIONARY_VIEW_PLAN.md` §4.3 (family heading → walking-progression cross-link). That's a single-link addition per group; shipping it on family is a good early proof.
4. **By Sets / By Category have more nuance.** By Sets needs the rename to By Component (Task E in DSC-1) plus a service-shape refactor over modifier-link memberships. By Category retires the spreadsheet (the most visible UI change) and benefits from being last so the card has been visually validated on three views first.

Suggested sequence for subsequent slices:

| Slice | View | Reason |
|---|---|---|
| 2 | `?view=family` | Smallest delta; highest user-value next; tests the family-heading cross-link affordance |
| 3 | `?view=sets` → renamed to `?view=component` | Largest conceptual change (axes, group ordering, intentional duplication of cards across groups) |
| 4 | `?view=category` | Retires the spreadsheet; the most visible UI change so validate the card on three views first |

---

## 13. Stop confirmation

Per the task spec: **stopping after this slice.** No work on By Family / By Category / By Component begins automatically.

---

*End of DSC2_ADD_VIEW_IMPLEMENTATION_REPORT.md*
