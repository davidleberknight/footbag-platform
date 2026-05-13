# UNIFIED_DICTIONARY_VIEW_PLAN

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task F
**Scope:** Redesign `/freestyle/tricks` browse views so that **By family**, **By ADD**, and **By category** all use the same symbolic trick card. Only grouping wrappers differ. The current spreadsheet-style "By category" view is retired; the rendering style across all browse modes becomes uniform.
**Companion docs:** [`SYMBOLIC_CARD_SPEC.md`](./SYMBOLIC_CARD_SPEC.md) defines the card. [`COMPONENT_VIEW_REDESIGN.md`](./COMPONENT_VIEW_REDESIGN.md) defines the parallel component view (Task E). [`NOTATION_LAYER_STRATEGY.md`](./NOTATION_LAYER_STRATEGY.md) defines the representation layers. [`OPERATIONAL_NOTATION_STYLE_GUIDE.md`](./OPERATIONAL_NOTATION_STYLE_GUIDE.md) governs notation rendering.
**Out of scope:** Implementation, route changes, schema modifications. Architecture-and-design phase only.

---

## 1. The unification claim

Today the three views render three different shapes:

| View | Current shape | Notation? |
|---|---|---|
| By ADD | "card-ish": name + ADD + raw-string notation block + aliases | Raw plain block |
| By Family | Card stub: name + ADD + family chip; **no notation** | Absent |
| By Category | Spreadsheet row: `Trick \| ADD \| Description \| Notation \| Aliases` | Raw cell |

After unification:

| View | New shape | Notation? |
|---|---|---|
| By ADD | Symbolic card (uniform) | Role-coloured tokens |
| By Family | Symbolic card (uniform) | Role-coloured tokens |
| By Category | Symbolic card (uniform); spreadsheet retired | Role-coloured tokens |

The card is `SYMBOLIC_CARD_SPEC.md`'s 4-required-slot card at `browse` density. The view differences live only in the **grouping wrapper** above each stack of cards.

---

## 2. The shared rendering contract

Every browse-mode view shares this contract:

1. **Card component:** identical across views. Service emits a `TrickCardViewModel` (per `SYMBOLIC_CARD_SPEC.md` §11); template renders four slots (Title / ADD / Operational notation / Aliases).
2. **Grouping wrapper:** an `<section>` per group, headed by a group-heading row.
3. **Within-group ordering:** by ADD ascending, then trick name alphabetical (secondary). Exceptions documented per view below.
4. **Modifier-stub exclusion:** the 18 modifier-stub rows per `feedback_modifier_public_visibility` are filtered at the service layer; views never see them.
5. **Empty groups visible:** when a group has zero current members, it renders as a placeholder row (`0 tricks; reason for emptiness if knowable`). Hiding absence loses information.
6. **No prose:** group subheads are one line; no paragraphs; no tutorial language.
7. **Observational separation:** wherever a group derives its definition from the symbolic-grammar-2 registry, the subhead is observational. Family groupings derive from canonical `freestyle_tricks.trick_family` — canonical, not observational.

---

## 3. By ADD

### 3.1 Grouping

| Slot | Content |
|---|---|
| Group key | ADD value as integer; one group per distinct value present in the dictionary (typically 1–9) |
| Group heading | `N ADD` in display-case (e.g., `3 ADD`, `4 ADD`, `7 ADD`) |
| Group subhead | None on this view. ADD is a numeric rank; no descriptive text is needed. |
| Count chip | `N tricks` right-aligned |
| Anchor ID | `#add-{value}` (e.g., `#add-4`) for hash-anchor jumping |

Groups render top-to-bottom in ascending order of ADD value. **Beginner-friendly tricks scroll to the top; flagship-difficulty tricks at the bottom.** Reverse-order (descending) is a sort toggle available as a future enhancement; ascending is the default.

### 3.2 Within-group ordering

1. **Family alphabetical** as primary sort. Within a single ADD value, tricks sort by their `trick_family` first. This groups family-related tricks together within the ADD section.
2. **Trick name alphabetical** as secondary sort within identical family.

Rationale: at any given ADD value, the most useful adjacency is *"see all 4-ADD tricks in the whirl family next to each other, then all 4-ADD tricks in the butterfly family next to each other"*. Sorting purely by trick name within an ADD scrambles families, hiding the structural relationship.

This is a behavioural change from the current By ADD view, which sorts tricks by name within ADD. The unified version sorts by family, then name.

### 3.3 Empty ADD groups

ADD values with zero member tricks (rare; mainly the ADD-1 group historically) render as empty-state rows. Most ADD values 2–8 have at least one populated trick.

### 3.4 Worked example (sketch)

```
─────────────────────────────────────────────────────────────────────
BROWSE BY ADD

3 ADD                                                       21 tricks

  butterfly family ────────────────────────────────────────────────
  BUTTERFLY                                                   3 ADD
  [clip] > butterfly wing > ss clipper

  mirage family ────────────────────────────────────────────────────
  MIRAGE                                                      3 ADD
  [set] > op in dex > op toe

  PARADOX MIRAGE                                              3 ADD
  [set] > hippy in dex > op toe
  aliases: pdx mirage

  whirl family ─────────────────────────────────────────────────────
  WHIRL                                                       3 ADD
  [clip] > front whirl > ss clipper

  ...

4 ADD                                                       38 tricks

  butterfly family ────────────────────────────────────────────────
  DIMWALK                                                     4 ADD
  [clip] > pixie > butterfly wing > ss clipper

  DUCKING BUTTERFLY                                           4 ADD
  [clip] > duck > butterfly wing > ss clipper

  RIPWALK                                                     4 ADD
  [clip] > op in dex > butterfly wing > ss clipper
  aliases: stepping butterfly, blurry butterfly

  ...
─────────────────────────────────────────────────────────────────────
```

Family-keyed subheadings within an ADD group are typographically lighter than the ADD heading (smaller, muted). They serve as orientation only; they're not separate sections.

---

## 4. By Family

### 4.1 Grouping

| Slot | Content |
|---|---|
| Group key | `trick_family` slug from the canonical schema |
| Group heading | Family name in display-case (`Butterfly family`, `Whirl family`, `Mirage family`) |
| Group subhead | One-line description sourced from the family entry in the dictionary, when authored; otherwise the family-anchor's `canonical_name` definition. No paragraphs. |
| Count chip | `N tricks` right-aligned |
| Anchor ID | `#family-{slug}` (e.g., `#family-butterfly`, `#family-whirl`) |

Groups render in alphabetical order by family slug. Common families first (alphabetical happens to place butterfly, drifter, mirage, osis, whirl near the top).

### 4.2 Within-group ordering

1. **Anchor first.** When a family has a base trick that *is* the family's structural anchor (`butterfly` is the anchor of butterfly-family; `whirl` is the anchor of whirl-family), the anchor renders first in the group, regardless of ADD.
2. **ADD ascending** for all other family members.
3. **Trick name alphabetical** as tertiary sort.

This preserves the family's structural narrative: a learner reading the family from top to bottom sees the anchor, then the lowest-ADD compound, then progressively higher-ADD compounds. The family becomes a difficulty ladder anchored at its base.

### 4.3 Cross-link to symbolic surfaces

When a family has a corresponding **walking progression** (currently: walking-family → butterfly family) or **topology group** (e.g., whirl family ↔ whirl-rotational-topology), the family heading row includes a cross-link:

```
BUTTERFLY FAMILY                                            12 tricks
Compound base + 11 children; the walking-family progression
walks this family step by step.
View the walking-family progression →
```

The cross-link is a single inline link; never a paragraph. Mirrors the cross-link pattern from `feedback_phased_scope_control` and existing shipped surfaces.

### 4.4 Empty families

A family with zero non-modifier-stub members renders as an empty-state row (rare; would indicate a curator-time issue, not normal state).

---

## 5. By Category

### 5.1 The retirement

The current By Category view is a 5-column data grid (Trick | ADD | Description | Notation | Aliases). It is **retired** as a spreadsheet. The category axis remains valuable as a grouping (compound / base / set primitive / etc.), so the view is preserved at its existing URL but rendered with the same symbolic card.

### 5.2 Grouping

| Slot | Content |
|---|---|
| Group key | `freestyle_tricks.category` value (e.g., `compound`, `base`, `set-primitive`, `modifier`) |
| Group heading | Category label in display-case (`Compound tricks`, `Base tricks`, `Set primitives`, `Modifiers`) |
| Group subhead | One-line definition (e.g., "Multi-component trick built from a base + modifier(s)"; "Foundational single-component movement"; ...) |
| Count chip | `N tricks` right-aligned |
| Anchor ID | `#category-{slug}` (e.g., `#category-compound`, `#category-base`) |

**Modifier category:** the `modifier` category (where modifier-stub rows live) is excluded from public rendering per `feedback_modifier_public_visibility`. The category view shows only `compound`, `base`, `set-primitive`, and any other curator-published category.

### 5.3 Within-group ordering

1. **Base / set primitive ordering** within their groups: alphabetical by trick name.
2. **Compound ordering** within the `compound` group: ADD ascending, then trick name alphabetical.

The compound group is by far the largest. The ADD-ascending sort keeps cognitive load manageable.

### 5.4 Subgroup option (deferred)

The compound group is large enough that a future enhancement could nest it by ADD value as subgroups. For now: flat list within the category, ADD-ascending.

---

## 6. Shared rendering rules (recap of §2 with specifics)

### 6.1 Group-heading typography

| Element | Treatment |
|---|---|
| Heading text | Uppercase display-case; site primary text colour; weight bold; 1.3× base size |
| Count chip | Site secondary text colour; right-aligned on the heading row; same baseline as heading |
| Subhead | Site body text colour, italic; 0.9× base size; one line; never wraps to multiple lines on desktop |
| Cross-link | Inline at end of subhead or on its own line below; underlined; same colour as body links |
| Anchor target | Heading row is the scroll target for hash anchors; visible offset when scrolled-to |

The group heading is **visually heavier** than individual card titles. The reader's eye should land on the heading first when scrolling enters a new group; then on cards.

### 6.2 Card-stack typography

Per `SYMBOLIC_CARD_SPEC.md` §4:

- Card title: 1.4× base, bold
- ADD: 1.4× base, bold
- Operational notation: 1.05–1.1× base, monospace, role-coloured
- Aliases: 0.85× base, muted

Identical across all three views.

### 6.3 Card-stack spacing

- Within-group inter-card: 24px vertical rhythm
- Inter-group (between sections): 48px vertical rhythm
- Inter-axis (in By Category between major axes if subdivided): 64px vertical rhythm — though By Category at default does not subdivide by axis

### 6.4 Card density mode

Always `browse` (per `SYMBOLIC_CARD_SPEC.md` §8.1). Detail density is never used in browse views.

### 6.5 Aliases handling

Each card displays its `aliases` field per `SYMBOLIC_CARD_SPEC.md`. The "common aliases only" filter is a service-layer policy (per `NOTATION_LAYER_STRATEGY.md` §5). The view template surfaces the array; the service decides which aliases are common enough to include.

### 6.6 Operational notation handling

Each card renders its `operationalNotation` (per `OPERATIONAL_NOTATION_STYLE_GUIDE.md`). When the column is null:

```
RIPWALK                                                     4 ADD
[notation pending]
aliases: stepping butterfly, blurry butterfly
```

The placeholder is service-emitted and styled consistently with role-coloured tokens (rendered as a single muted token). Cards never render with empty notation slot space; the absence is itself information.

---

## 7. Density handling

### 7.1 Visual density on each view

| View | Group count | Avg cards / group | Total cards |
|---|---|---|---|
| By ADD | ~7 (ADD values 2–8) | ~25 | ~175 |
| By Family | ~10 (major families) | ~15 | ~150 |
| By Category | ~4 (compound, base, set-primitive, other) | ~40 (heavy compound) | ~150 |

Page weight is bounded; all three views fit comfortably in a single scrollable page. No pagination.

### 7.2 Density adjustments per view

Three minor differences:

1. **By ADD subgroup headings (family-keyed within ADD):** lighter visual treatment than top-level group headings. The eye should treat them as orientation hints, not as primary navigation.
2. **By Family heading cross-links:** when a family has a walking-progression or topology cross-reference, the heading row gains a subhead-adjacent link. By ADD and By Category do not have parallel cross-links.
3. **By Category subgroup option (deferred):** the compound group could in a future enhancement be nested by ADD subgroups. For now: flat list.

---

## 8. Mobile stacking

### 8.1 Single column always

All three views render single-column on every viewport. The operational notation needs horizontal room.

### 8.2 Group heading row collapses on narrow viewports

On < 480px:

```
BUTTERFLY FAMILY
12 tricks
Compound base + 11 children; the
walking-family progression walks
this family step by step.
View the walking-family progression →
```

Count chip moves below the heading text; subhead wraps freely; cross-link wraps onto its own line.

### 8.3 Sticky group heading

Same approach as `COMPONENT_VIEW_REDESIGN.md` §6.3 — sticky on scroll so the reader always knows which group they're inside.

### 8.4 Card layout on mobile

Per `SYMBOLIC_CARD_SPEC.md` §3: title + ADD stack vertically; operational notation wraps token-by-token with hanging indent.

---

## 9. The shared service-layer interface (NOT implementation; provisional)

All three views consume the same template-facing shape with a different grouping wrapper:

```ts
interface BrowseViewModel {
  viewKey:  'by-add' | 'by-family' | 'by-category' | 'by-component';
  groups:   BrowseGroup[];
}

interface BrowseGroup {
  groupKey:        string;            // 'add-4', 'family-butterfly', 'category-compound'
  groupLabel:      string;            // '4 ADD', 'Butterfly family', 'Compound tricks'
  groupSubhead:    string | null;     // one-line description; null on By ADD
  crossLink:       { label: string; href: string } | null;  // optional family/topology link
  memberCount:     number;
  anchorId:        string;            // '#add-4', '#family-butterfly', '#category-compound'
  cards:           TrickCardViewModel[];  // sorted per view-specific rules
}
```

The Handlebars template renders this model literally. The service computes the grouping + ordering + filtering per view. By Component (Task E) consumes the same shape with `viewKey: 'by-component'` — fully unified.

A single browse-view template can render all four views. The template's outer loop iterates `groups`; the inner loop iterates `cards`. The card partial is shared. **Code-level unification is a refactor of `tricks.hbs`; the template-side change is mechanical once the service emits the shared shape.**

---

## 10. Migration path (conceptual; NOT in scope for this phase)

1. **Phase 1:** Implement the shared `<TrickCard>` partial in `src/views/partials/trick-card.hbs`. Consume `TrickCardViewModel`.
2. **Phase 2:** Refactor By ADD to use the partial. (Smallest delta; By ADD already has a card-ish render.)
3. **Phase 3:** Refactor By Family to add operational notation via the partial.
4. **Phase 4:** Refactor By Category to retire the spreadsheet table; render via the partial. **This is the largest visual change** because the spreadsheet's compact data-grid form will visibly grow into a card stack.
5. **Phase 5:** Implement the Component view (`COMPONENT_VIEW_REDESIGN.md`) using the same partial. Redirect `?view=sets` to `?view=component`.
6. **Phase 6:** Add cross-links from family headings to walking-progression / topology pages.
7. **Phase 7:** Sticky-heading enhancement (CSS-only).

Each phase is independently shippable; reversibility is preserved by guarding the partial behind a feature flag if needed.

---

## 11. What stays the same (NOT modified)

- Trick-detail pages remain at `/freestyle/tricks/:slug`. Detail-page rendering is unchanged.
- The notation builders (`notationRendering.ts`, `operationalNotationRendering.ts`) are unchanged.
- `freestyle_tricks.notation` and `freestyle_tricks.operational_notation` columns are read as-is; no auto-generation.
- The symbolic-grammar-2 CSVs (modifier groups, topology, archetypes) are read as-is.
- Family classifications (`trick_family` column) remain canonical and authoritative.
- ADD values, modifier links, alias rows are unchanged.

---

## 12. Constraints honoured

- No canonical-data mutation
- No ontology changes
- No ADD changes
- No alias insertion
- No parser changes
- No schema changes
- No auto-generation
- Operational notation rendering consumed from existing service shapes
- Two-layer separation (semantic vs operational) preserved
- Observational-layer attribution preserved on derived subheads

---

## 13. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — the card consumed here (Task B)
- `NOTATION_LAYER_STRATEGY.md` — the layers each card may surface (Task C)
- `OPERATIONAL_NOTATION_STYLE_GUIDE.md` — operational notation conventions (Task D)
- `COMPONENT_VIEW_REDESIGN.md` — the fourth browse view (Task E), uses the same shared service shape
- `NOTATION_SURFACE_AUDIT.md` — current state of the three views (Task A)
- `feedback_modifier_public_visibility.md` — modifier-stub exclusion rule
- `feedback_phased_scope_control.md` — phased migration recommended

---

*End of UNIFIED_DICTIONARY_VIEW_PLAN.md*
