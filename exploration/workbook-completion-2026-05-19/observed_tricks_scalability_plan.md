# Observed Tricks Scalability Plan -- 2026-05-19

Phase 3 companion deliverable. Plan for designing the `/freestyle/observed-tricks` public surface to scale to 200+ entries without prose bloat.

Context: PassBack staging produces ~187 new_candidate entries. FootbagMoves (Phase 4) would add 487+ more. Even at PB-only scope the surface needs to scale to ~200 cards.

---

## 1. Design constraints

| Constraint | Source |
|---|---|
| Compressed cards, not full-prose | Curator brief 2026-05-19 |
| Alphabetical OR ADD grouping | Curator brief 2026-05-19 |
| Less repeated prose | Curator brief 2026-05-19 |
| External ADD claims secondary (not primary visual element) | Curator brief 2026-05-19 |
| Source/status clear but not verbose | Curator brief 2026-05-19 |
| Maintain `feedback_no_individual_names_freestyle_views` | Memory |
| Workbook-first architecture | Memory |
| No broad UI redesign | Curator brief |

The scalability concern is the central design problem: existing freestyle dictionary cards (per `dictionary-trick-card` partial) are dense + readable, but at 200+ entries they would create a 3-screen-deep scroll surface with substantial repeated boilerplate (each card repeats source attribution, ADD disclaimers, etc.).

---

## 2. Recommended UI patterns

### 2.1 Three card-density tiers

| Density tier | When to use | What's visible |
|---|---|---|
| **Compact card** (recommended default for Observed Tricks) | Browse / scrollable list | Name + ADD chip + source short-form (e.g., "PB" badge) + 1-line note |
| **Expanded card** (on demand) | User clicks/expands a compact card | + external formula + structural reading + curator note |
| **Full card** (NOT recommended for this surface) | Canonical trick detail pages only | All prose + descriptions + media |

Observed Tricks surface uses compact-by-default with expandable details (HTML `<details>` element per project pattern, with no JS dependency).

### 2.2 Grouping options

| Grouping | Pros | Cons |
|---|---|---|
| **Alphabetical** (A-Z) | Familiar; classic dictionary; easy to scan | No ADD context grouping |
| **ADD count** (1 ADD / 2 ADD / 3 ADD / ...) | Reveals ADD distribution; pedagogically useful | Many rows in 3-5 ADD buckets |
| **Source** (PassBack / FM / etc.) | Source attribution visible at section level | Heterogeneous ADDs within group |
| **Hybrid: ADD primary, A-Z secondary** | Combines pedagogy + searchability | Slightly more complex template |

**Recommendation: Hybrid grouping** — primary section header by ADD count (`# 1 ADD`, `# 2 ADD`, etc.), with cards sorted alphabetically within each section. Mirrors fundamentalmoves.txt source structure + matches the user's emerging ADD-graded learning ladder pedagogy.

### 2.3 Source attribution short-form

To reduce repeated prose, use a single-letter or 2-letter source badge:

| Badge | Source |
|---|---|
| `PB` | PassBack Dictionary |
| `FB` | Footbag.org (`fborg`) |
| `FM` | FootbagMoves |
| `IFPA` | Curator-confirmed (would not appear in Observed Tricks but useful for context) |

Hover/tap reveals full source attribution string (e.g., "PassBack Dictionary 2026-05-12 staging").

### 2.4 Compact-card structure (mockup)

```
┌─────────────────────────────────────────────────────┐
│  Pixie Whirl                                 [PB]   │
│  4 ADD · pixie + whirl decomposition                │
│                                                     │
│  [details] external formula • curator note ▼        │
└─────────────────────────────────────────────────────┘
```

- Name + source badge on top line
- ADD + 1-line structural reading on second line
- `<details>` expand for external formula + curator note
- Zero prose per card by default

---

## 3. Page architecture

### 3.1 View model (proposed)

```typescript
interface ObservedTricksPageContent {
  byAdd: ObservedAddBucket[];
  totalCount: number;
  sources: string[];  // ["PassBack", "FootbagMoves"]
}

interface ObservedAddBucket {
  addCount: number | null;    // null for "ADD unknown"
  cards: ObservedTrickCard[];
}

interface ObservedTrickCard {
  observedName: string;
  slug: string;
  sourceBadge: string;        // "PB" / "FB" / "FM"
  sourceAttribution: string;  // full string for tooltip
  externalAdd: number | null;
  shortReading: string;       // optional 1-line decomposition
  externalFormula: string;    // for details expand
  curatorNote: string;        // for details expand
}
```

### 3.2 Route + service

- Route: `/freestyle/observed-tricks` registered in `src/routes/publicRoutes.ts`
- Controller: `observedTricksController.observedTricksPage()`
- Service: `observedTricksService.shapeObservedTricksPage()`
- Content module: `src/content/observedTricks.ts` (curator-authored from PB staging)

### 3.3 Template

Single template at `src/views/freestyle/observed-tricks.hbs`:

- Page header: brief explanation ("Observed Tricks — names + ADD claims from external sources, NOT curator-confirmed canonical")
- Section per ADD bucket
- Compact-card partial per row
- `<details>`-style expand for external formula + curator note

### 3.4 CSS

Use existing dictionary-trick-card density-mode CSS as starting point. Add observed-tricks-specific CSS for:
- Source badge styling
- Compact-row variant
- `<details>` summary line

---

## 4. Pagination considerations

For 200 cards across 5-7 ADD buckets:
- 1 ADD: ~10 cards
- 2 ADD: ~30 cards
- 3 ADD: ~50 cards
- 4 ADD: ~50 cards
- 5 ADD: ~30 cards
- 6 ADD: ~20 cards
- 7+ ADD: ~10 cards

Total = ~200; manageable as single page with section headers per ADD bucket. No pagination needed initially.

If FM ingestion grows the surface to 500+ cards, consider:
- Search/filter input (client-side, no JS dependency required for basic filter)
- ADD-bucket-only pages (`/freestyle/observed-tricks/3-add`, etc.)
- Defer until growth makes it necessary

---

## 5. Layer separation rules (reinforced)

| Surface | Observed Tricks content |
|---|---|
| Canonical trick pages (`/freestyle/tricks/:slug`) | NO observed-tricks content; canonical-only |
| `/freestyle/tricks` (landing) | NO observed-tricks content; curator-confirmed only |
| `/freestyle/observed-tricks` (new) | YES; observational-only surface |
| Glossary (any section) | NO observed-tricks content; glossary is pedagogical primitive layer |
| Operational notation grammar (§7) | NO observed-tricks content; grammar is doctrinal |

The Observed Tricks surface is the ONLY public surface where external-source-attributed (not curator-confirmed) entries appear.

---

## 6. Accessibility + responsive

| Aspect | Decision |
|---|---|
| Mobile-first layout | Yes; compact cards work well at 480px |
| `<details>` expand keyboard accessible | Yes (HTML native) |
| Screen-reader source badge | Use `aria-label="PassBack source"` on badges |
| ADD bucket section headers | `<h2>` with explicit `# N ADD` text (per heading hierarchy) |

---

## 7. Implementation slice ordering

| # | Slice | Risk | Gate |
|---|---|---|---|
| 1 | Curator triage of PB staging (per PB1 in passback finalization plan) | Low | Curator availability |
| 2 | Curate `observed_tricks.csv` from triaged subset | Low | Triage complete |
| 3 | Build observedTricks content module + service + controller | Medium | CSV ready |
| 4 | Author Handlebars template + CSS | Medium | Service ready |
| 5 | Wire route + nav entry | Low | Template ready + curator approval of placement |
| 6 | Tests (integration + service contract) | Low | Route wired |
| 7 | doc-sync invocation (VIEW_CATALOG + SERVICE_CATALOG updates) | Low | Tests passing |

---

## 8. Concepts NOT to implement

| Concept | Why NOT |
|---|---|
| Client-side interactivity (drag, multi-select, complex filter UI) | Project pattern: no SPA; server-rendered |
| Promoting observed tricks to canonical via UI | Bypasses curator workflow |
| Displaying individual PB contributor names | `feedback_no_individual_names_freestyle_views` |
| Showing ADD as primary visual element (large chip dominating card) | Curator brief: "external ADD claims secondary" |
| Showing source attribution as full sentence on each card | Curator brief: "less repeated prose" |
| Auto-linking observed-trick names to canonical pages without curator confirmation of equivalence | Risk: implying canonical endorsement |

---

## 9. Success condition for Phase 3

Per curator brief:
- compressed cards ✓ (compact-card pattern)
- alphabetical / ADD grouping if available ✓ (hybrid: ADD primary, A-Z secondary)
- less repeated prose ✓ (1-line card + details expand)
- external ADD claims secondary ✓ (chip not headline)
- source/status clear but not verbose ✓ (2-letter badge + tooltip)

Phase 3 implementation can begin once curator approves this plan. Recommended sequencing: Phase 1 + 2 (workbook governance gate; this slice) complete BEFORE Phase 3 begins.
