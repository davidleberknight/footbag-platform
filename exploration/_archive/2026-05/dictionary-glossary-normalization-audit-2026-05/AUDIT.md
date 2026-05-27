# Dictionary / Glossary Normalization Audit — 2026-05-16

## Status

Audit only. No code changes. Batch 5 (symbolic-compression visuals) paused pending normalization.

## Methodology

Verified the user's claims against:

- `src/views/freestyle/{tricks,glossary,landing,learn}.hbs`
- `src/views/partials/{dictionary-trick-card,operator-board}.hbs`
- `src/services/freestyleService.ts` (operator board cells, view-builders, category construction)
- `src/content/freestyleOperatorReference.ts` (curator operator definitions)
- Memory entries: [[project_freestyle_state]], [[project_red_consultation_state]], [[project_symbolic_ux_rollout]], [[project_freestyle_core_atoms]], [[project_semantic_compression_doctrine]]

Items flagged "**unverified**" require running queries against the freestyle_tricks table during implementation; the audit calls out where this matters.

---

## 1. Confirmed issues by surface

### 1.1 Trick-card rendering inconsistency across views

**Verified.** All five views in `tricks.hbs` (ADD / family / category / component / topology) already route through the same partial `dictionary-trick-card.hbs`. The inconsistency is NOT in partial choice. It traces to three real divergence points:

| Divergence | Mechanism | Impact |
|---|---|---|
| **Density mode** | ADD + category use `density="registry"` (inline single-line); family + component + topology use `density="browse"` (vertical stack with all readings) | Same #whirl card shows 1 reading inline in ADD, all readings stacked in family — feels like different cards |
| **`groupAnchor` parameter** | ADD + category pass `null`; family passes `familySlug`; component passes `def.slug`; topology passes `def.slug` | Token underline emphasis (`isFamilyAnchor=true`) is only present in family/component/topology — ADD shows no anchor highlighting at all |
| **Pending-notation placeholder** | Browse density renders `<em>Notation pending</em>` when both `tokenizedEquivalences` and `operationalNotation` are absent; registry density renders **nothing** (silent gap) | A trick missing a formula looks "empty" in ADD/category and "labelled pending" in family/component/topology |

**Severity: high.** Trust issue exactly as the user described.

### 1.2 Tricks vs modifiers conflated in browse surfaces

**Verified at code level; row-level needs DB check.** The operator-board references `NOTATION('atomic')`, `NOTATION('fairy')`, `NOTATION('quantum')` (lines 4602-4607 of freestyleService.ts), which means slugs `atomic`, `fairy`, `quantum`, `pixie` exist as `freestyle_tricks` rows. The dictionary's ADD-grouping view does NOT filter modifier-class rows out of the buckets.

User's specific claims (each is row-level; needs DB query during implementation):

- `pogo`, `rooted`, `spin` shown as ADD-bucketed tricks — should be modifiers/operators **(unverified row-level)**
- `0 ADD` tricks in any browse surface — should be filtered or category-shifted **(unverified)**
- `atomic`, `fairy`, `pixie`, `sailing`, `surging`, `shooting` shown as 0/1-ADD tricks — should be in modifier surface **(unverified row-level; code path exists)**
- Trick contract: every true trick must end in bag contact (stall or kick). Modifiers don't have that property. **This is the discriminating test.**

**Severity: high.** Distorts the difficulty ladder and breaks the operator/trick semantic separation that's the heart of glossary §6 / SEMANTIC_COMPRESSION_DOCTRINE.

### 1.3 Operator board content errors

**Verified at code level.** Three cells need curator changes:

| Cell | Current | Issue | Fix |
|---|---|---|---|
| `body / SPIN` | `'SPIN + TORQUE' → 'MOBIUS'` | Stale; Red ruled 2026-05-15 that Mobius ≈ Gyro Torque, not Spinning Torque | Move Mobius example to GYRO row; SPIN row needs a non-Mobius example |
| `structural / OP` | `'OP + BUTTERFLY' → 'BUTTERFLY'` | Reads as a no-op; teaches nothing | Replace with an example where OP changes the result, OR drop the row and surface "opposite is the default" in caption only |
| `body / DUCK` | name "Ducking"; example `'PIX + DUCK + BUTTERFLY' → 'PHOENIX'` | Cell suggests Ducking is one operator, but it's the representative of a 4-way family (ducking / diving / weaving / zulu) | Name "Duck / Dive" or "Head path"; keep Phoenix example; family note in caption |

**Severity: medium-high.** Cells are visible on landing + glossary + /freestyle/learn. Stale ruling on a load-bearing trick is corrosive.

### 1.4 Family / category taxonomy issues

**Partially verified.** User's claims:

| Claim | Verification path | Audit position |
|---|---|---|
| `clipper family` and `clipper-stall family` both exist | Need DB query on `trick_family` column | If true, this is data debt — pick canonical and alias the other |
| `legover family` and `double-legover family` both exist | Same | Same pattern; `double-legover` is almost certainly an over-faceted artifact |
| Many compounds belong to multiple families (e.g. `double legover` ↔ legover + mirage) | Verified conceptually; the current `trick_family` column is single-value (1:1) | Schema limitation; design discussion needed |
| Clipper is a surface/catch, not a trick family | Conceptually correct per the [[project_freestyle_core_atoms]] memory: `clipper-stall` is a core atom (catch), not a structural anchor | Reshape clipper-as-family → clipper-as-surface |
| Missing symposium / paradox families/topologies | Current scheme treats these as body modifiers, not family anchors — yet they DO have family-like cohorts (symp osis / symp legover / symp whirl all hang together) | Symposium = modifier-with-family-character; same for paradox. Topology surface is the right home, not family. |

**Severity: medium.** Affects browse trust but doesn't break individual trick pages.

### 1.5 Category view granularity

**Verified conceptually.** Categories rendered in `?view=category` are wide and unhelpful:

- `Dexterity` — overbroad (almost every trick has a dex)
- `Compound` — overbroad (most freestyle tricks are compound)
- `Body` — undersplit (spinning / ducking / paradox / symposium / flying all live here together)
- `Set` — incomplete (likely missing pixie-derived chains)
- `Other` — missing rake, etc.

**Severity: medium.** Browse usefulness; not a correctness bug.

### 1.6 Component / topology view distinction unclear

**Verified.** Two browse surfaces sit alongside each other (`?view=component`, `?view=topology`) but their roles aren't legible:

- `component` browse: groups by `freestyle_trick_modifier_links` (which modifier a trick uses)
- `topology` browse: observational symbolic-grammar layer; six panels per the connective-panels system

Per current code these are two different lenses on similar data. User wants clarification, possibly merger.

**Severity: low.** Both work; the question is editorial.

### 1.7 Glossary content gaps

**Verified by reading `glossary.hbs`:**

| §  | Gap | Severity |
|----|-----|----------|
| §3 Dexterity | Has hippy/leggy, missing in-out vs out-in direction vocabulary | medium |
| §7 Symbolic Notation | "Symbolic" framing strong, but few visible symbols in the section itself; the tokenized examples are inline with prose | medium |
| §8 Composition & Decomposition | Examples are short list items without formulas | medium |
| §9 Movement Topologies | Six connective panels; coverage incomplete, not labelled as such | low |
| §12 Sources | Vague prose; doesn't name footbag.org / PassBack / footbagmoves.com / AnzTrikz / WFA / Tricks of the Trade | low |

**Severity: medium.** Glossary is otherwise in good shape post-Batches 1-4.

### 1.8 Navigation gaps

**Verified.** Cross-surface jumps that don't exist:

- Glossary term → trick examples using that term: only the 6 connective panels carry this
- Trick card → "Learn this term" glossary deep-link: cards have a deep-link icon but no glossary anchor
- Family-view section → glossary topology subsection for that family: only `crossLink` on family groups, not consistently wired
- Set/modifier surface → tricks-using-this list: the user expected this exists on `/freestyle/sets`; not in current implementation

**Severity: low-medium.** Each individual jump is small; cumulative effect is "you can't navigate the language."

### 1.9 Educational Pathways redundancy

**Verified.** Landing page has an "Educational pathways" section that overlaps with glossary §8 (compositional flow) + the operator board cards. Two competing entry points to the same content.

**Severity: low.** Editorial; deletable.

---

## 2. Canonical trick-card rendering contract

The single contract every browse surface MUST satisfy. Renderer is `dictionary-trick-card.hbs` and only that partial. No view branches around it.

### 2.1 View-model fields (required on `DictionaryTrickCard`)

Already present in current type:
- `slug`, `displayName`, `href`, `adds`, `addsLabel`
- `tokenizedEquivalences: SemanticBrowseToken[][]`
- `operationalNotation: OperationalNotation | null`
- `operationalNotationStatus: 'available' | 'pending'`
- `hasReferenceMedia`, `mediaCoverage`, `mediaCoverageLabel`
- `isExternalOnly`, `statusBadge`, `placeholderNote`
- `hasRecords`
- `trickFamily: string | null`

**Add to satisfy contract:**
- `kind: 'trick' | 'modifier' | 'operator' | 'surface' | 'pending-review'` — discriminator. Modifiers / operators / surfaces NEVER appear in ADD-bucketed views; only `kind === 'trick'` does.
- `primaryFamily: { slug: string; name: string } | null` — pre-shaped family chip
- `secondaryFamilies: readonly { slug: string; name: string }[]` — for multi-family compounds (e.g. double-legover ↔ legover + mirage). Empty by default.
- `categoryChip: { slug: string; name: string } | null` — pre-shaped category chip (replaces in-template inference)
- `glossaryAnchor: string | null` — anchor on `/freestyle/glossary#term-{slug}` or `#modifier-{slug}` for "Learn this term" deep-link

### 2.2 Density modes

Two only:

| Mode | Layout | Tokens shown | Notation pending | Used by |
|---|---|---|---|---|
| `inline` | single-line scan row | first reading only | suppressed (silent) | ADD, category, future flat lists |
| `stacked` | vertical card with multiple readings + notation row | all readings | `<em>Notation pending</em>` line | family, component, topology, dictionary detail card |

Renaming "registry" → `inline` and "browse" → `stacked` clarifies the meaning. Names describe shape, not surface.

### 2.3 Family-anchor underline rule

`isFamilyAnchor` on tokens highlights when the token slug matches the active view's `groupAnchor`. Currently only stacked density honors it; **inline should honor it too** when there's an anchor. Reason: in family-view we shouldn't have to read browse density to see "the family token is the anchor here."

### 2.4 Identity invariant

The same `slug` rendered in any view must produce the same:
- `displayName` (canonical name spelling and casing)
- `addsLabel` string
- token vocabulary (token texts, role classes, slug attributes)
- `glossaryAnchor` target
- `primaryFamily` chip

What MAY differ across views:
- Density mode (inline vs stacked)
- Whether secondary chips render (e.g. category chip suppressed in category view to avoid self-reference)
- Which token gets `isFamilyAnchor=true` (driven by `groupAnchor`)

What MUST NEVER differ:
- Token text or token role classification
- The slug-to-displayName mapping
- The trick's `kind` classification

---

## 3. Proposed taxonomy

### 3.1 Trick `kind` discriminator

| `kind` | Definition | Examples | Browse-surface rule |
|---|---|---|---|
| `trick` | Ends in bag contact (stall or kick). Has a structural anchor. Includes catch primitives — they are the simplest tricks. | whirl, mirage, mobius, ripwalk, dimwalk, **toe-stall, clipper-stall, cloud-stall** | Appears in ALL browse surfaces |
| `modifier` | Transforms a base trick; doesn't end in bag contact alone | spinning, ducking, paradox, symposium, stepping | Filtered out of all 5 trick browse views; appears in modifier surface |
| `operator` | Set primitive that initiates a trick; doesn't end in bag contact alone | pixie, fairy, atomic, quantum, nuclear, barraging | Filtered out of all 5 trick browse views; appears on operator board + glossary §6 |
| `surface` | Bare surface NAME masquerading as a trick row; not the stall trick itself | clipper (the body-category row, not clipper-stall) | Filtered out of all 5 trick browse views |
| `pending-review` | Curator-flagged ambiguity | surging (initial set) | Internal-only QC panel; never on public surfaces |

**Discriminating test for `kind === 'trick'`:** authored canonical name ends in a stall or kick. **Stall primitives DO pass this test** — toe-stall, clipper-stall, cloud-stall, sole-stall etc. all end in bag contact and surface as the simplest tricks (1-2 ADD) in the ladder. The `kind='surface'` classification is reserved for the narrow case where a row is a bare surface name (not a stall), such as `clipper` (body-category, ADD=1) being a surface label rather than the `clipper-stall` trick.

**Surface as a facet (deferred):** the "this trick lands on surface X" property is orthogonal to the kind discriminator. Slice E or F adds an `isSurface` boolean / surface-facet field to drive glossary §2 cross-links without conflating the two ontology layers (canonical nomenclature vs structural-role discriminator).

### 3.2 Family redefinition

| Concept | Old framing | New framing |
|---|---|---|
| `family` | Single-value column on `freestyle_tricks.trick_family` | Multi-value membership table `freestyle_trick_family_memberships(trick_slug, family_slug, is_primary)` |
| Family anchors | Whatever the column held (mixed: structural + surface + family-ish) | Canonical structural anchors only: whirl, swirl, mirage, butterfly, osis, torque, legover, illusion, drifter, pickup. Curator-authored set; size ~12 |
| Surfaces masquerading as families (clipper, toe) | Treated as family slugs | Reclassified `kind=surface`. Surface facet ≠ family |
| Modifiers with family-character (paradox, symposium) | Not modeled as families | Topology facet covers this — paradox topology, symposium topology — separate from structural family |

Multi-family handles user's "double-legover ↔ legover + mirage" case:
- `primary: legover` (the named base)
- `secondary: mirage` (the dex it's built on)

### 3.3 Category retire-and-replace

Replace the current 5-value category column. New category taxonomy:

| Category | Replaces | Member rule |
|---|---|---|
| Set-based | (Set) | Compound tricks whose base is a set-modifier (pixie-derived, atomic-derived, etc.) |
| Spinning | (subset of Body) | Body modifier = spinning |
| Ducking/Diving | (subset of Body) | Body modifier ∈ {ducking, diving, weaving, zulu} |
| Paradox | (subset of Body) | Body modifier = paradox |
| Symposium | (subset of Body) | Body modifier = symposium |
| Flying | (subset of Body) | Body modifier = flying (when present) |
| Cross-body | (XBD-marked) | Cross-body component flagged |
| Compound-multi | (Compound catch-all retired) | Compounds carrying 2+ body modifiers |
| Specialty | (Other) | rake, others not fitting above |

Drop entirely: `Dexterity` (every trick has a dex; not a useful filter), `Compound` (every compound is in a more specific bucket).

### 3.4 Component vs topology decision

**Recommend: keep both, clarify roles.**

- `component`: data-driven view backed by `freestyle_trick_modifier_links`. Each modifier (set / body / structural) gets a section listing tricks that use it. "Which modifier?"
- `topology`: editorial view backed by curator-defined movement-topology groups (current `connectivePanels`). "Which body-mechanic family?"

The two answer different questions and should not merge. **Fix:** add explicit "Why two views?" caption on each, with a single sentence distinguishing them.

---

## 4. View-by-view repair plan

### 4.1 ADD view (`?view=add`, default)

| Item | Change |
|---|---|
| Density | Stays `inline` |
| Filter | Drop rows where `kind !== 'trick'` |
| Anchor highlighting | None (no group anchor) — current correct |
| Pending-notation handling | Stays suppressed (per inline contract) |
| Bucket invariant | 0 ADD bucket either drops entirely OR is curator-confirmed (some routine moves may live here legitimately) |

### 4.2 Family view (`?view=family`)

| Item | Change |
|---|---|
| Density | Stays `stacked` |
| Filter | Drop rows where `kind !== 'trick'` |
| Anchor | family slug; family-token underline preserved |
| Section heading | Add badge: primary family vs containing-family (when trick appears in multiple) |
| Empty families | Suppress families with zero `kind='trick'` members |
| `crossLink` to glossary topology | Wire to `/freestyle/glossary#topology-{familySlug}` if available |

### 4.3 Category view (`?view=category`)

| Item | Change |
|---|---|
| Density | Stays `inline` |
| Filter | Drop rows where `kind !== 'trick'` |
| Categories | New taxonomy per §3.3 above |
| Anchor | None (categories aren't slug-anchored) |

### 4.4 Component view (`?view=component`)

| Item | Change |
|---|---|
| Density | Stays `stacked` |
| Filter | Drop rows where `kind !== 'trick'` |
| Anchor | component slug |
| Caption | Add "What this is" sentence distinguishing from topology view |

### 4.5 Topology view (`?view=topology`)

| Item | Change |
|---|---|
| Density | Stays `stacked` |
| Filter | Drop rows where `kind !== 'trick'` |
| Anchor | topology slug |
| Coverage | Either expand to comprehensive OR explicitly mark as "selected topologies" with §9 deep-link |

### 4.6 New modifier-and-operator surface (`?view=operators` or `/freestyle/sets`)

| Item | Change |
|---|---|
| Density | New variant: `compact-operator` (different from inline/stacked because the cell content differs: no ADD chip, instead shows `+1 body modifier` / `set primitive` / etc.) |
| Scope | Renders `kind ∈ {modifier, operator, surface}` rows |
| Companion to ADD view | Cards link to "Tricks using this" via `/freestyle/tricks?component={slug}` |

Audit decision: this surface arguably already exists at `/freestyle/sets`. Reuse, don't duplicate.

---

## 5. Landing page corrections

### 5.1 Operator board fixes

| Tier | Cell | Fix |
|---|---|---|
| Body | SPIN | Replace example: keep "MOBIUS" but move it to the GYRO cell; SPIN cell gets a non-Mobius example (e.g. `SPIN + BUTTERFLY → SPINNING BUTTERFLY`) |
| Body | GY | Replace example to use Mobius: `GY + TORQUE → MOBIUS` |
| Body | DUCK | Rename "Ducking" → "Head path" or "Duck/Dive"; caption notes the 4-way family |
| Structural | OP | EITHER drop the cell (it teaches nothing visible) OR replace with an example where OP changes the result. Decision recommendation: **drop** — "OP is the default" belongs in operator-board lede, not as its own cell |

### 5.2 PassBack Tutorials surfaced

Add `PassBack Tutorials` to the landing "Tutorials & Learning" section. Wire to `/media/gallery_passback_tutorials` (gallery already exists per recent curated-media work).

### 5.3 Educational Pathways section

**Recommend: remove from landing.** Move pathway content into glossary §8 (Composition & Decomposition) where formulas already live. Specific pathway worth preserving:

> Walking-family progression: butterfly → ripwalk → dimwalk → sidewalk → dada-curve → matador → phoenix. Seven steps, each adding or swapping one modifier on the butterfly base.

Lands in glossary §8 as a worked-example callout.

---

## 6. Glossary corrections

| § | Change |
|---|---|
| §3 Dexterity | Add direction subsection: in-dex vs out-dex (toward body / away from body); pairs with hippy/leggy axis |
| §6 / §7 ordering | Swap §6 "Modifiers" and §7 "Symbolic Notation" so notation precedes modifier reference, OR keep order but rename §7 to "Notation reference" and add visible symbol glyphs (atomic glyph, pixie glyph, etc.) to the top of the section |
| §8 Composition | Add walking-family progression callout (per §5.3 above). Each progression step gets a formula |
| §9 Movement Topologies | Add explicit "Representative selections, not comprehensive" framing. Add 2-3 missing topology panels (symposium, paradox) — these have curator-confirmed members already |
| §12 Sources | Restructure as named source families: footbag.org, PassBack, footbagmoves.com, AnzTrikz, Tricks of the Trade (WorldFootbag YouTube), historical WFA/NHSA records. NO individuals inline |

---

## 7. Navigation improvements

### 7.1 Cross-links to add

| From | To | Mechanism |
|---|---|---|
| Glossary term card | `/freestyle/tricks?component={slug}` (tricks using this term) | New "Used in these tricks" link in glossary term cells |
| Trick card | `/freestyle/glossary#term-{slug}` or `#modifier-{slug}` for each token in the card | New `glossaryAnchor` field on `SemanticBrowseToken`; renderer wraps tokens in anchor links |
| Family-view section heading | `/freestyle/glossary#topology-{familySlug}` | Wire `crossLink` (already a service-shaped slot, currently unwired) |
| Modifier surface entry | `/freestyle/tricks?component={slug}` | New deep-link icon on each modifier card |
| Glossary §5 family-tree members | Already link to trick detail; confirm pattern carries to family-view cards too | Audit only |

### 7.2 Glossary/dictionary jump buttons

Add page-level navigation: glossary page hero gets a "Browse the trick dictionary →" CTA; trick dictionary hero gets a "Learn the language →" link to `/freestyle/glossary`. Single sentence each.

---

## 8. Data-model / service changes needed

### 8.1 Schema additions (database/schema.sql)

Per [[feedback_reversible_content_governance]] (prefer TypeScript content modules over SQL during ontology refinement), the changes below should land as **TypeScript curator data**, not schema migrations — UNLESS the data is large enough or the queries complex enough to warrant SQL. Each decision is explicit:

| Change | Land as | Rationale |
|---|---|---|
| `freestyle_tricks.kind` column | TypeScript override table keyed by slug — `freestyleTrickKindOverrides.ts` | Curator decision per trick; small set; reversible; reads at service-shape time |
| `freestyle_trick_family_memberships(trick_slug, family_slug, is_primary)` | TypeScript registry — `freestyleFamilyMemberships.ts` | Curator-authored; small set (~12 families × N members each); needs no joins for browse use |
| New category taxonomy | TypeScript content module — replaces existing category mapping | Curator-authored taxonomy |
| `glossaryAnchor` resolution table | TypeScript — `freestyleGlossaryAnchorMap.ts` (term-slug → anchor-id) | Already exists in part; extend |

**No SQL migrations in this batch.** When the ontology stabilizes (post Red Wave 2+3 reply), formalize as schema.

### 8.2 Service-layer changes

| Service-layer change | Where | Effort |
|---|---|---|
| Add `kind` to `DictionaryTrickCard` view-model + shape it from override table | `shapeDictionaryTrickCard` | small |
| Filter `kind !== 'trick'` rows out of ADD / family / category / component / topology view shaping | `getTricksPage` and inner builders | small |
| Add `primaryFamily` + `secondaryFamilies` chips to view-model | `shapeDictionaryTrickCard` | medium |
| Add `categoryChip` to view-model + replace category-derivation in template | `shapeDictionaryTrickCard` | small |
| Add `glossaryAnchor` to view-model | `shapeDictionaryTrickCard` | small |
| Add `glossaryAnchor` to `SemanticBrowseToken` so tokens link to glossary | `semanticNotationRendering.ts` | medium |
| New compact-operator density mode | `dictionary-trick-card.hbs` + new partial OR new shape variant | medium |
| Wire `isFamilyAnchor` in inline density | `dictionary-trick-card.hbs` (CSS + markup) | small |
| Restore pending-notation behavior in inline density (silent stays correct; confirm via tests) | n/a (verification only) | trivial |
| Operator-board cell edits (Mobius, OP, Duck/Dive caption) | `freestyleService.ts:4595-4634` | small |
| Drop "Educational Pathways" section | `landing.hbs` + content shaping | small |
| Add PassBack Tutorials chip to landing | `landing.hbs` + content shaping | small |
| Glossary §3 / §8 / §9 / §12 expansions | `glossary.hbs` + content shaping for new dl/p blocks | medium |

### 8.3 Renames

`density="registry"` → `density="inline"`; `density="browse"` → `density="stacked"`. Renames clarify the shape-vs-surface distinction. Touches: `dictionary-trick-card.hbs`, `tricks.hbs`, CSS class names (mechanical search-replace).

---

## 9. Test strategy

### 9.1 New invariant tests

| Test | Asserts |
|---|---|
| `dict-card-renders-identically-across-views` | For 3 canonical pilot tricks (e.g. whirl, mobius, ripwalk), render in all 5 views and assert: same displayName, same addsLabel, same first-reading tokens (text + slug + role), same primaryFamily chip slug. Density may differ; identity must not. |
| `add-view-filters-non-trick-kinds` | Seed a modifier (`pixie`), an operator (`atomic`), a surface (`clipper`); render ADD view; assert none appear in any ADD bucket |
| `family-view-filters-non-trick-kinds` | Same as above for `?view=family` |
| `modifier-surface-shows-only-non-trick-kinds` | Render `/freestyle/sets` or `?view=operators`; assert no `kind='trick'` rows appear |
| `every-trick-has-bag-contact-in-canonical-name` | Iterate all `kind='trick'` slugs; assert canonical name ends in a known catch-token (stall list + kick list). This is the trick discriminator. |
| `operator-board-mobius-references-gyro` | Render landing; assert `MOBIUS` appears in the GYRO cell example, not the SPIN cell |
| `operator-board-no-noop-cells` | Assert no operator cell has `compositionA + base === compositionResult` (i.e. no `X + Y → Y` patterns) |
| `tokens-link-to-glossary` | Render a card with tokens; assert token markup includes glossary anchor href for each token where curator has authored one |
| `pending-notation-handling` | Inline density: silent. Stacked density: italic "Notation pending". Pin both. |

### 9.2 Existing tests likely affected

- `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` — Slice 1 assertions for ?view=family scope. New assertions for kind filtering will land here.
- `tests/integration/freestyle.routes.test.ts` — landing operator board assertions will need update for Mobius/Gyro swap.
- `tests/integration/freestyle.tricks-insights.routes.test.ts` — pending placeholder absence in registry-mode; rename to "inline mode" but logic preserved.

### 9.3 Coverage floor

All new shaping functions land with full coverage. Current threshold (95% statements / 76% branches / 93% functions) stays.

### 9.4 No skips

Slice A lands with all tests passing. No `.skip` / `.todo` / xfail.

---

## 10. Recommended implementation batches

Strong preference per user: **Slice A canonical renderer normalization lands first.** No new visual features until rendering identity holds.

### Slice A — Canonical renderer normalization

**Scope:** make all 5 views render identical primitives for the same slug.

1. Add `kind` field + override table + shape in service
2. Filter `kind !== 'trick'` out of all 5 trick-browse views
3. Rename density modes (`registry` → `inline`, `browse` → `stacked`)
4. Add `categoryChip` + `glossaryAnchor` fields to view-model; shape from new content modules
5. Wire `isFamilyAnchor` in inline density (CSS + markup)
6. Invariant tests per §9.1 first three rows

**Out of scope for Slice A:** taxonomy expansion, multi-family memberships, glossary content edits, landing operator-board fixes.

**Estimated:** medium PR. ~6-8 service changes + 1 partial change + 5-7 new tests + content modules.

### Slice B — Operator board content corrections

**Scope:** Three cell edits + caption clarifications + PassBack Tutorials chip.

1. SPIN cell: new example
2. GY cell: Mobius example
3. DUCK cell: rename "Head path", family caption
4. OP cell: drop
5. PassBack Tutorials in landing learn block
6. Update operator-board tests for new cell content

**Estimated:** small PR. Surgical content edits + 2-3 test updates.

### Slice C — Glossary content expansion

**Scope:** §3 directional vocab + §7 reordering or rename + §8 walking-family progression + §9 representative-only framing + §12 source families.

1. §3: add in-dex / out-dex dl entries
2. §7: rename header OR move; add visible glyph row at top
3. §8: walking-family progression callout
4. §9: framing edit
5. §12: source-family list (footbag.org / PassBack / footbagmoves.com / AnzTrikz / TT)
6. Remove "Educational Pathways" from landing

**Estimated:** medium PR. Content-heavy; few service changes; tests on §3 + §8 anchors.

### Slice D — Family / category taxonomy

**Scope:** multi-family memberships + category replacement + family deduplication (clipper, double-legover).

1. `freestyleFamilyMemberships.ts` content module
2. `freestyleCategoryTaxonomy.ts` content module
3. Reshape `?view=family` to honor multi-membership
4. Reshape `?view=category` to use new taxonomy
5. Reclassify clipper → `kind=surface`
6. Deduplicate `legover` vs `double-legover`
7. Invariant test: each clipper-anchored trick now appears under its proper structural family
8. Invariant test: double-legover appears in both legover and mirage family-view sections

**Estimated:** medium-large PR. Curator data work + service reshape + new invariants.

### Slice E — Navigation cross-links

**Scope:** glossary-to-dictionary and dictionary-to-glossary jumps.

1. `glossaryAnchor` on `SemanticBrowseToken`; renderer wraps tokens in links
2. "Used in these tricks" links in glossary term cells
3. Family-view section heading cross-link to topology subsection
4. Modifier-surface deep-link to component-view
5. Page-hero cross-link CTAs

**Estimated:** small-medium PR. Mostly link wiring + a few new tests.

### Slice F — Component / topology editorial clarification

**Scope:** captions clarifying the two views' roles + topology coverage expansion.

1. Caption on each view explaining "Why this view"
2. Add symposium + paradox topology panels (data already supports)
3. Coverage-completeness label

**Estimated:** small PR.

---

## 11. Out of scope / blocked

- **Batch 5 symbolic-compression visuals** — paused per user instruction. Resume after Slice A lands at minimum; ideally after Slices A-D.
- **SQL migration of `kind` column** — wait for Red Wave 2 reply (operator-vs-trick boundary is one of the Wave 2 questions). Reversible TypeScript content modules until ontology stabilizes per [[feedback_reversible_content_governance]].
- **PassBack alias / dictionary promotion** — gated on Red Wave 2; doesn't interact with this audit's slices.
- **Glossary v5 Batch 5** — paused.

---

## 12. Decision log (open questions for curator)

These are NOT blocking for Slice A but should land before Slices B-D ship:

| # | Question | Default if no answer |
|---|---|---|
| 1 | OP operator cell: drop entirely, or replace example? | Drop |
| 2 | Inline density: should family-anchor underline appear in non-family views (e.g. category view filtered by family)? | No — only when `groupAnchor` is set |
| 3 | Topology panels for symposium + paradox: ship in Slice C or Slice F? | Slice F |
| 4 | Walking-family progression: glossary §8 callout, or new dedicated /freestyle/progressions page? | Glossary §8 callout |
| 5 | Clipper reclassification (`kind=surface`): does that also remove the existing `clipper family` browse section in family view? | Yes — surface family is its own facet |
| 6 | Multi-family memberships: which compounds qualify? Curator-authored list, or rule-derived (every compound with body-modifier-on-different-anchor)? | Curator-authored list; small set |
| 7 | Pending-notation placeholder: should inline mode show ANY indicator (e.g. a small dim "?" glyph) or stay silent? | Stay silent |

---

## Audit summary

**Confirmed issues: 9 surfaces affected.** Rendering identity, kind/category taxonomy, operator-board content, glossary completeness, navigation cross-links.

**Root cause:** mixed-`kind` rows in `freestyle_tricks` table flow through views that don't filter. A single discriminator field with override-table semantics fixes the largest cohort in one slice.

**Slice A unblocks Batch 5.** Visual identity across views is the precondition for adding any new visual features.

**Estimated total work: 6 small/medium PRs.** Slice A is load-bearing; B-F can run in parallel after A lands.

End of audit.
