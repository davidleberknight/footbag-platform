# Landing + Tricks QA Realignment 1 — Audit + Implementation Plan

Generated 2026-05-14. Audit + implementation plan. **No code shipped from this slice** — awaiting maintainer approval per the spec's "after approval" gate on J.

---

## A. Root-cause analysis: landing render bug `[object Object]undefined`

**Confirmed by probe**: every core-trick card on `/freestyle` renders the ADD slot as `[object Object]undefined` (e.g., `<span class="core-trick-add-value">[object Object]undefined</span>` for clipper / mirage / legover / pickup / illusion / whirl / butterfly / swirl / osis / around-the-world).

### Root cause

`src/app.ts:146` registers a Handlebars helper named **`add`**:

```typescript
helpers: {
  ...
  add: (a: unknown, b: unknown) => (a as number) + (b as number),
  ...
}
```

Handlebars resolution order for `{{add}}` is: block-parameter → helper → data-field. **The helper wins.** The landing template's `{{add}}` in `landing.hbs:75`:

```hbs
<p class="core-trick-add"><span class="core-trick-add-value">{{add}}</span></p>
```

…invokes the helper with no arguments. Handlebars passes its internal `options` object as the only arg. The helper's body computes `(options as number) + (undefined as number)` which JS coerces to `"[object Object]" + undefined = "[object Object]undefined"`.

The view-model field IS correctly named `add: number | null` on the `FreestyleCoreTrickCard` interface and IS correctly populated by the service. The only failure is the **identifier collision with the Handlebars helper**.

### Fix (proposed)

Rename the view-model field `add` → `addNumeric` (or similar; chose `addNumeric` for symmetry with the existing `addPending` companion). Template renders `{{addNumeric}}` which doesn't shadow.

Why rename vs `{{this.add}}` workaround:
- `{{this.add}}` is fragile — a future contributor who copies the same `{{add}}` pattern elsewhere recreates the bug.
- Renaming the field at the view-model surface is structural; the bug cannot recur with this field's value.
- Touches 3 files (type def + service + template) + minor test impact.

**Severity**: HIGH. User-visible regression on every core-trick card.

---

## B. Landing-page semantic QA findings

### B1 — Sam Conlon misunderstanding (Batch 2 design error)

My Batch 2 demonstrations strip created 5 pre-named conceptual slots (`sam-conlon`, `classic-circle`, `artistic-routine`, `modern-technical-shred`, `educationally-readable-run`) with empty `curatedMedia: null` for all. The maintainer's clarification confirms this was a misreading of the original spec — "Sam Conlon footage" meant "include Sam Conlon footage among the curated demos," not "create a Sam Conlon labeled slot."

**Confirmation of available curated media**: `legacy_data/inputs/curated/media/media_assets.csv` contains:
```
473a49ad-ad8c-5cc0-b50a-4f79cbf7b09a, video, https://www.youtube.com/watch?v=2URvZFuxBls,
"1998 World Footbag Championships Womens Freestyle Finals",
"Samantha Conlon and Carol Wedemeyer",
footbag_hof_archive, curated, is_active=1, tier=HIGH_QUALITY_DEMO
```

(Detection-search missed it earlier because creator string says "Samantha" not "Sam".)

**Caveat**: this row exists in the curated CSV but is **NOT present in the `freestyle_media_assets` DB table** (querying by ID returns empty). Either the loader hasn't been run with this CSV, or the loader filters this row out. **Data-pipeline gap, not rendering gap.**

### B2 — San Marino 2026 regression

My Batch 2 removed `featuredVideo` from `FreestyleLandingContent` and dropped the hardcoded YouTube ID `U6J2LXxUWro` ("Footbag 2026: San Marino"). The strip was meant to replace it; instead it shipped with 5 empty slots.

**Curated state**:
- The YouTube ID is preserved in `media_items` (`media_267b407835250ac4ab8a2470` with `#freestyle #curated #by_jay7bah` tags)
- It does NOT have a row in `legacy_data/inputs/curated/media/media_assets.csv` (the freestyle-asset CSV)
- It does NOT have a row in `freestyle_media_assets` DB table

So San Marino survived in the generic `media_items` table but not in the freestyle-specific curation surface that the demonstrations strip should consume. Two restoration paths:
- Add a row to `media_assets.csv` for this video (curator content edit) so it surfaces through the freestyle media pipeline
- Or hardcode it in the service as a stopgap (matches my Batch 2 retired pattern; quick but bypasses curator pipeline)

### B3 — Demonstrations strip policy gap

Per maintainer spec: "**public landing page should show curated media only; unresolved placeholders should be hidden, not rendered.**"

Today: all 5 slots render "Curated demonstration pending" placeholder text because all 5 `curatedMedia` are null. Wrong policy.

**Fix policy**: filter the array — only render slots where `curatedMedia != null`. If zero curated entries exist, the entire section's content collapses (or shows a minimal "Demonstrations coming soon" if a single placeholder is desired, but per spec even that should be hidden).

### B4 — Core-trick rendering also lacks symbolic notation slot

Currently the landing template renders:
```hbs
<p class="core-trick-slug">#{{slug}}</p>
{{#each semanticEquivalences}}<p class="core-trick-equivalence">≡ {{this}}</p>{{/each}}
{{#if symbolicNotation}}<p class="core-trick-notation">{{symbolicNotation}}</p>{{/if}}
{{addNumeric}}
```

But `symbolicNotation` is always `null` per Batch 2 service shaping. So the landing cards never carry a symbolic-notation line. Compared to dictionary cards which DO render operational notation when authored, landing is intentionally minimal.

**Verdict**: this is by design (atoms don't need operational decomposition lines). Not a bug. Leave as-is.

### B5 — Core trick inventory vs CORE_TRICKS authority

`src/services/coreTrickRegistry.ts` (referenced in earlier audits) holds `CORE_TRICKS`. Landing uses `CORE_TRICK_SPEC` from `freestyleLandingContent.ts` which is a parallel structure (11 entries). The user's spec asks: "verify against actual CORE_TRICKS authority."

Today's `CORE_TRICK_SPEC` (11 entries): clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, around-the-world, orbit.

Comparison to user's stated questions:
- **toe-stall missing**: per Batch 1 maintainer ruling, toe-stall lives in Basic Components (Contact → "Two main stalls: Toe / Clipper"), not in Core Tricks. The 11-entry list explicitly drops it. **By design.**
- **clipper vs clipper-stall**: list has `clipper` (delay primitive). DB has both `clipper` (1 ADD) and `clipper-stall` (2 ADD, separate row). The list uses bare `clipper` matching the user's spec.
- **around-the-world naming consistency**: spec list uses `around-the-world` (slug-form); landing renders `#around-the-world` plus `≡ ATW` alias-reading. **Consistent.**
- **orbit / reverse-around-the-world**: orbit is in spec list. Allow-list governance promotes `≡ reverse around-the-world` reading. **But orbit DB row is missing** (CSR S4 deferred); landing renders pending state correctly.

**Verdict**: inventory matches the curator-canonical 11-entry public list. The questions surface known-deferred items (orbit DB row missing).

---

## C. Operator-board correction plan

Audit findings (14 cards):

| Glyph | Current claim | Verdict | Proposed fix |
|---|---|---|---|
| **PIX** Pixie | "Compressed uptime set, leg drives the bag through a tight orbit." | Vague but acceptable | Optional sharpen: "Same-side IN-direction dex from a toe set." |
| **AT** Atomic | "Set wrapped with full-body rotation in the air." | **WRONG** — atomic isn't a rotation set | "Opposite-side OUT-direction dex from a toe set; cross-body uptime character." |
| **Q** Quantum | "Set with added rotation through uptime." | **WRONG** — quantum is the compressed-atomic set | "Opposite-side IN-direction dex from a toe set; compressed-atomic shape." |
| **BL** Blender | "Set with a low-orbit pre-set sweep into the dex." + `BL + BUTTERFLY → BLENDER BUTTERFLY` | **WRONG GLYPH ENTIRELY** — `BL` should map to **Blurry**, not Blender | Rename to `BL Blurry`: "Compressed reading of Stepping + Paradox; flat +1 modifier per pt11." + composition `BLURRY + BUTTERFLY → RIPWALK` (pt11) |
| **FAIRY** Fairy | "Set carrying an extra revolution through uptime." | **WRONG** — fairy has no revolution | "Same-side OUT-direction dex from a toe set; the mirror of pixie." |
| **STEP** Stepping | "Foot relocates between the set and the catch." | OK | (keep) |
| **SPIN** Spinning | "Full-body rotation around the vertical axis during the trick." | OK | (keep; matches PassBack 360°) |
| **GY** Gyro | "Body-rotation variant on a partial or inverted plane." | Vague | "Half-rotation body modifier (180°); pairs with spinning for arbitrary degrees." (per PassBack:173) |
| **DUCK** Ducking | "The body drops under the bag mid-dex." | Adequate; could match PassBack | (keep — close enough to PassBack "head dipping under the bag") |
| **PDX** Paradox | "A hip pivot inserted between two dexes." | Narrow | "A hip pivot between two dexes on the same set; the body changes sides." (matches glossary §3 modifier-reference + PassBack:218) |
| **SYMP** Symposium | (PassBack-verbatim from Batch 1 C-7) | OK | (keep) |
| **XDEX** Cross-dex | "The leg circles the bag on the opposite side of the body." | Vague | "The dex circles the bag on the opposite-body side of the plant foot." |
| **SAME** Same-foot | "The set foot and the catch foot are the same." | OK | (keep) |
| **OP** Opposite | "The set foot and the catch foot are different. The conventional default." | OK | (keep) |

**Critical fix**: `BL` glyph must be reassigned from Blender to Blurry. Current state mis-attributes a real operator (Blurry; pt11-canonical) to a base trick (Blender, ADD 4 compound). The composition example `BL + BUTTERFLY → BLENDER BUTTERFLY` is structurally meaningless (BLENDER BUTTERFLY isn't a named trick; Blurry + Butterfly = Ripwalk per pt11 + chain registry).

**Composition-example updates** that flow from the action-text corrections:
- AT: keep `AT + OSIS → FLUX` (correct per chain registry-adjacent canon)
- Q: keep `Q + MIRAGE → TOE BLUR` (correct per pt2)
- **BL (now Blurry)**: change `BL + BUTTERFLY → BLENDER BUTTERFLY` to `BLURRY + BUTTERFLY → RIPWALK`
- FAIRY: review composition example — `FAIRY + BLUR → DOUBLE FAIRY` is suspect. Per RED_RESOLVED_CANON.md B.5: "Double Fairy = Double Illusion = 3 ADDs". The "fairy + blur → double fairy" composition doesn't match canon. Recommend changing to a clean composition or marking pending.

**`curatorConfirmPending` flag review**: today flag is `true` for BL, FAIRY, SYMP, XDEX. After corrections: BL (now Blurry) becomes `false` (pt11-locked); FAIRY stays `true` (composition example needs curator review); SYMP stays per Batch 1 wording; XDEX stays `true`.

---

## D. Curated-media reconciliation findings

### D1 — The two videos worth surfacing today

| Video | YouTube ID | Caption | Source | DB state | CSV state |
|---|---|---|---|---|---|
| 1998 Worlds Women's Freestyle Finals (Samantha Conlon + Carol Wedemeyer) | `2URvZFuxBls` | "Samantha Conlon and Carol Wedemeyer" | footbag_hof_archive | NOT IN `freestyle_media_assets` | IN `media_assets.csv` |
| Footbag 2026: San Marino | `U6J2LXxUWro` | "Footbag 2026: San Marino — Footage by jay7bah." | (was hardcoded in service pre-Batch-2) | Tagged in `media_items` but NOT in `freestyle_media_assets` | NOT IN `media_assets.csv` |

### D2 — Data-pipeline gap

The freestyle-specific `freestyle_media_assets` table is the canonical source the demonstrations strip should consume. Today:
- Conlon video: exists in curator CSV; needs loader pass to land in DB
- San Marino video: not in curator CSV; needs curator to add the row

**Restoration approach** (recommended): rather than data-driving the demonstrations strip immediately (which requires the loader to populate the DB), use a hybrid:
1. Hardcode the two known curated videos as the initial demonstrations array
2. Mark the pattern as transitional in service comments
3. Future slice replaces with `freestyle_media_assets` query when the curator wires the pipeline

This preserves restraint (no DB writes from this slice; no media metadata fabrication) while restoring the user-visible regression.

### D3 — Drop the 5-slot pre-named scaffolding

Per the maintainer's "Sam Conlon misunderstanding" feedback: drop the 5 conceptual slots (`sam-conlon`, `classic-circle`, `artistic-routine`, `modern-technical-shred`, `educationally-readable-run`). They were a misreading of the original spec.

**New shape**: `demonstrations` is just an array of `{ title, caption, media }` objects. No conceptual-intent labels. No pre-named placeholders. Curator backfill populates the array directly.

**Visible-content shape today**:
- Demonstration 1: 1998 Worlds Womens Freestyle Finals (Samantha Conlon + Carol Wedemeyer)
- Demonstration 2: Footbag 2026 San Marino (jay7bah footage)

Two cards. The maintainer can add more by editing the service constants (or the future curator-CSV pipeline).

---

## E. Dictionary symbolic-surface QA findings

### E1 — "Notation pending" prevalence on dict cards

144 of 160 active tricks have no `operational_notation`. Today each renders italic "Notation pending" placeholder.

Of those 144, ~36 ALSO have ≡ chain readings (post-NR-1C). On those cards, the "Notation pending" line adds noise — the structural information is already carried by the ≡ readings.

### E2 — Proposed policy

Modify dict-card template to suppress "Notation pending" when ≡ readings exist:

| Card has `operationalNotation`? | Card has `symbolicEquivalences.length`? | Render |
|---|---|---|
| yes | (any) | operational notation tokens |
| no | yes (≡ readings present) | suppress placeholder; ≡ readings carry structural info |
| no | no | "Notation pending" italic (honest) |

This reduces visual clutter on ~36 cards without losing honesty on the ~108 cards that truly lack any structural rendering.

### E3 — Other dictionary findings

| Surface | Finding | Action |
|---|---|---|
| operational notation tokens | Some role-classes are visually OK; broken-token edge cases not observed in spot check | None |
| `aria-label` on dict-card-add | Renders `{{addsLabel}}` like "1 ADD" / "4 ADD" — distinct from the visible chip text. Accessible. | None |
| External-only placeholders (`dict-card--external-placeholder`) | Opacity 0.65; correctly distinct visually | None |
| Family chip (`trickFamily`) | Reserved field; not currently rendered | Not in scope |

The dict-card is fundamentally healthy. Only the "Notation pending" suppression policy is a worthwhile change.

---

## E1 — Hashtag layer (new hard requirement, 2026-05-14)

**Per maintainer addition**: all curated freestyle media surfaced on landing / trick pages / glossary references / learning surfaces / featured-demo strips must visibly expose its hashtag vocabulary. The hashtag layer is part of the symbolic/navigation language, NOT hidden metadata. Restraint applies: avoid hashtag walls; prioritize pedagogical readability; surface only meaningful tags.

### Current state

Two parallel media taxonomies feed the public surfaces:

1. `media_items` + `media_tags` (modern curator pipeline) — feeds trick-detail Reference Media via filter `#curated + #freestyle + #trick + <slug>`. **Tags are read for filtering but NOT rendered.** Confirmed by reading `src/views/partials/trick-media-grid.hbs`: each media tile renders `video-facade` + `caption` + `sourceLabel` only.
2. `freestyle_media_assets` + `freestyle_media_links` (freestyle-specific) — different shape; the Conlon CSV row lives here.

Tag visibility today: **zero** across all public freestyle surfaces.

### Tag taxonomy in DB (102 distinct tags)

Inventory grouped by pedagogical role:

| Group | Examples | Frequency | Rendering policy |
|---|---|---:|---|
| Trick-slug | `#torque`, `#mobius`, `#mirage`, ~80 distinct slugs | 1-5 each | **Surface** — primary symbolic linkage; the pedagogical payoff |
| Source/series | `#passback_records`, `#tricks_of_the_trade`, `#shred_global`, `#anz_trikz`, `#footbag_finland` | 8-79 | **Surface** — discoverability into series |
| Creator (`#by_*`) | `#by_jay7bah`, `#by_footbag_hacky` | 1-2 | **Surface** — attribution; user-spec example |
| Content-type | `#tutorial`, `#demo` | 2-11 | **Surface** — clarifies media type |
| Event (`#event_*`) | `#event_2026_worlds_japan` | 1 | **Surface** — event-context |
| Quality | `#curated` | 159 | **Surface (de-emphasized)** — provenance |
| Discipline | `#freestyle` | 156 | **Suppress on freestyle-only surfaces** (redundant); keep on cross-discipline pages |
| Structural | `#trick` | 154 | **Suppress** — redundant (every freestyle media is implicitly a trick) |
| Implementation | `#unavailable_embed` | 2 | **Suppress** — internal state |

### Render-policy specification

Service-layer helper `shapeMediaTagsForBrowse(rawTags, surfaceContext)`:
- Filters out: `#trick`, `#unavailable_embed`, and `#freestyle` when surfaceContext = 'freestyle-only'
- Sorts remaining tags by group precedence: trick-slug → source/series → creator → content-type → event → quality
- Returns array of `{ display, kind }` objects so template can render with optional kind-based styling

Result: typical curated trick media that today has `#freestyle #curated #trick #torque #passback_records` displays as **`#torque · #passback_records · #curated`** (3 tags rendered; `#freestyle` + `#trick` filtered). Pedagogically dense, not a wall.

### Surfaces to wire

| Surface | Today | Post-F7 |
|---|---|---|
| Landing demonstrations strip (post-F3 reshape) | no tags | tag chips per video card |
| Landing competitionFormats (4 hardcoded YouTube videos) | no tags | (optional) tag chips per format card; hardcoded tag arrays since no DB row |
| Landing demoVideo (autoplay mp4 intro loop) | no tags | exempt — not a curator-tagged media item |
| Trick-detail Reference Media tiles (`trick-media-grid.hbs`: tutorials + demos subsections) | no tags | tag chips per media tile |
| Glossary references | no media today | n/a (no rendering surface to add to) |
| Learning surfaces (`/freestyle/learn`, modifier-family pages, walking-progression) | minimal media today | tag chips wherever media surfaces |
| Gallery pages (`/media/gallery_*`) | per-gallery treatment | spot-audit on implementation; out of explicit scope but inherits the helper if media surfaces |

### Visual treatment

Small typography chips, kebab-case-slug-form preserved (e.g., `#paradox-symposium-whirl`). No heavy borders, no buttons — chips read as language tokens. CSS class `.media-tag-chip`; optional kind-modifier classes (`--trick`, `--source`, `--creator`, etc.) for restrained color tier.

---

## F. Exact implementation plan

Seven sub-units, sequenced from highest-risk-fix to lowest-impact-polish. Each is small. **F7 (hashtag rendering) is the new sub-unit added per the 2026-05-14 maintainer requirement.**

### F1 — Fix landing render bug (highest priority; user-visible)

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | Rename `FreestyleCoreTrickCard.add` field → `FreestyleCoreTrickCard.addNumeric`. Update service shaping in `getLandingPage` (line 4127–4138) to write `addNumeric` instead of `add`. |
| `src/views/freestyle/landing.hbs` | Template line 75: `{{add}}` → `{{addNumeric}}` |
| `tests/integration/freestyle.routes.test.ts` | Update any assertion referencing `add` field → `addNumeric`. Spot-check needed. |

### F2 — Operator-board semantic corrections

| File | Change |
|---|---|
| `src/services/freestyleService.ts` (`getOperatorBoard`, lines 4040–4069) | 6 action-text edits + 1 glyph reassignment + 1-2 composition-example edits. Specifics per PART C table. |

Estimated 8 small `Edit` calls; all within the existing `op(...)` call arguments.

### F3 — Drop demonstrations 5-slot scaffolding; restore curated videos (with tags per F7)

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | Reshape `demonstrations` view-model: array of `{ title, caption, media, tags: MediaTagDisplay[] }`; hardcode two visible curated videos (Conlon 1998 + San Marino 2026) with their authoritative tag arrays from the curator pipeline. Update type interface `FreestyleDemonstrationSlot` → `FreestyleDemonstration`. |
| `src/content/freestyleLandingContent.ts` | Retire `DEMONSTRATION_SLOTS` constant + `DemonstrationSlotSpec` interface (no longer needed). |
| `src/views/freestyle/landing.hbs` (`demonstrations` rendering) | Update template to render `{{title}}` / `{{caption}}` / `{{> video-facade media=media}}` / tag chips via `{{> media-tag-strip tags=tags}}`. Drop placeholder `<p>Curated demonstration pending.</p>` branch. |
| `src/views/partials/media-tag-strip.hbs` | **NEW** partial — renders `tags[]` array as small chip strip with restraint typography. Reused by F7 across all surfaces. |

### F4 — Dict-card "Notation pending" suppression when ≡ readings exist

| File | Change |
|---|---|
| `src/views/partials/dictionary-trick-card.hbs` | Template line 41-43: replace single `{{else}}` branch with conditional — render placeholder only when both `operationalNotation` AND `symbolicEquivalences.length` are falsy. |

Net change: ~6 lines in template.

### F7 — Hashtag rendering (NEW; per 2026-05-14 maintainer hard requirement)

| File | Change |
|---|---|
| `src/services/freestyleService.ts` | Add `MediaTagDisplay` interface (`{ display: string; kind: 'trick'|'source'|'creator'|'content-type'|'event'|'quality' }`) and `shapeMediaTagsForBrowse(rawTags: string[], opts?: { surfaceContext?: 'freestyle-only'|'cross-discipline' }): MediaTagDisplay[]` helper. Apply suppress-policy + sort by group precedence. |
| `src/services/freestyleService.ts` | Wire helper into `getLandingPage` demonstrations (F3 entries get tags) AND into `getTrickDetailPage` for reference-media items. |
| `src/views/partials/media-tag-strip.hbs` | **NEW** partial — renders the tag-strip with restrained chip typography. |
| `src/views/partials/trick-media-grid.hbs` | Insert `{{> media-tag-strip tags=tags}}` below each `reference-media-tile`'s caption/source. |
| `src/views/freestyle/landing.hbs` | Insert `{{> media-tag-strip tags=tags}}` below each demonstration card's caption (already covered in F3 update). |
| `src/public/css/style.css` | New `.media-tag-strip` + `.media-tag-chip` styles with kind-modifier variants. Mobile: tags wrap cleanly. |

Net change: ~70 lines (new helper + new partial + CSS); ~2 lines in two existing templates.

**Coverage**: surfaces all curated freestyle media tags across the user-named surfaces (landing, trick pages, learning surfaces inheriting trick-media-grid pattern, future glossary references when media added). Restraint posture preserved via the suppress-policy.

### F5 — Tests

| Test | Coverage |
|---|---|
| Landing render: NO `[object Object]` in response body | New regression guard; spot-checks the ADD slot |
| Landing render: numeric ADD value renders correctly for core tricks (e.g., clipper renders `1`, mirage renders `2`) | Verifies the rename worked |
| Landing render: orbit's pending state still renders `—` (not number) | Verifies addPending path still works |
| Operator board: `BL` glyph maps to Blurry, not Blender | Per F2 |
| Operator board: Blender no longer appears anywhere in the rendered operator-board HTML | Per F2 |
| Operator board: Atomic / Quantum / Fairy action text no longer claims rotation | Per F2 |
| Landing demonstrations: NO "Curated demonstration pending" placeholder text in response | Per F3 |
| Landing demonstrations: San Marino + Conlon videos render | Per F3 |
| Dict card: "Notation pending" does NOT render on cards with `symbolicEquivalences.length > 0` | Per F4 |
| Dict card: "Notation pending" DOES still render on cards with no notation AND no ≡ readings | Per F4 (honest-pending preserved) |
| `shapeMediaTagsForBrowse` unit: suppresses `#trick`, `#unavailable_embed`; suppresses `#freestyle` on freestyle-only surface | Per F7 |
| `shapeMediaTagsForBrowse` unit: sorts trick-slug → source → creator → content-type → event → quality | Per F7 |
| Landing demonstrations: tag-strip renders per video card (Conlon entry shows e.g. `#freestyle #footbag_hof_archive #curated`; San Marino shows `#by_jay7bah #curated`) | Per F7 |
| Trick-detail page: reference-media tiles render tag chips below caption | Per F7 |
| Trick-detail page: `#trick` and `#freestyle` (surface-context redundant) are NOT in rendered tag chips | Per F7 (suppress-policy) |
| Tag-chip HTML uses `.media-tag-chip` class for consistent styling | Per F7 |

### F6 — doc-sync (deferred to implementation slice; not part of this audit)

`docs/VIEW_CATALOG.md` line 399 (landing entry) currently mentions "a curated Demonstrations strip (five conceptual slots — Sam Conlon / Classic Circle / Artistic Routine / Modern Technical Shred / Educationally Readable Run — each backed by curator-managed media slots with explicit placeholder rendering when unfilled)". After F3, this row needs updating to: "a curated Demonstrations strip rendering curator-selected freestyle highlight videos (currently the 1998 Worlds Women's Final and Footbag 2026 San Marino); empty array hides the section."

---

## G. Files likely affected

| File | Changes |
|---|---|
| `src/services/freestyleService.ts` | `FreestyleCoreTrickCard` type + `FreestyleDemonstrationSlot` type retirement + `FreestyleDemonstration` new type + `getLandingPage` shaping + `getOperatorBoard` 14-row review |
| `src/content/freestyleLandingContent.ts` | Retire `DEMONSTRATION_SLOTS` + `DemonstrationSlotSpec` |
| `src/views/freestyle/landing.hbs` | `{{add}}` → `{{addNumeric}}`; demonstrations rendering reshape |
| `src/views/partials/dictionary-trick-card.hbs` | Conditional "Notation pending" suppression |
| `tests/integration/freestyle.routes.test.ts` | Regression test additions + assertion updates |
| `tests/integration/freestyle.portal.routes.test.ts` | Spot-update if demonstrations / operator-board assertions exist |
| `tests/integration/freestyle.tricks-insights.routes.test.ts` | Spot-update if "Notation pending" assertions exist |
| `tests/integration/freestyle.dictionary-trick-card.routes.test.ts` | Spot-update if "Notation pending" assertions exist |
| `docs/VIEW_CATALOG.md` | Deferred to implementation doc-sync pass |

---

## H. Before / after examples

### H1 — Landing core-trick card

**Before (current; broken)**:
```html
<article class="core-trick-object" id="core-trick-clipper">
  <p class="core-trick-slug">#clipper</p>
  <p class="core-trick-add"><span class="core-trick-add-value">[object Object]undefined</span></p>
</article>
```

**After (post-F1)**:
```html
<article class="core-trick-object" id="core-trick-clipper">
  <p class="core-trick-slug">#clipper</p>
  <p class="core-trick-add"><span class="core-trick-add-value">1</span></p>
</article>
```

### H2 — Operator-board card (BL → Blurry)

**Before (current; wrong)**:
```
┌──────────────────────────────────┐
│ BL  Blender                       │
│ Set with a low-orbit pre-set      │
│ sweep into the dex.               │
│ BL + BUTTERFLY → BLENDER BUTTERFLY│
└──────────────────────────────────┘
```

**After**:
```
┌──────────────────────────────────┐
│ BL  Blurry                        │
│ Compressed reading of Stepping +  │
│ Paradox; flat +1 modifier (pt11). │
│ BLURRY + BUTTERFLY → RIPWALK      │
└──────────────────────────────────┘
```

### H3 — Demonstrations strip

**Before (current; 5 placeholders rendered)**:
```
Demonstrations
A curated strip of routines, circles, and shred examples...
┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│ Sam Conlon                │  │ Classic Circle            │  │ Artistic Routine          │
│ A historically anchored... │  │ A circle demonstration... │  │ A choreographed-to-music..│
│ Curated demonstration     │  │ Curated demonstration     │  │ Curated demonstration     │
│ pending.                  │  │ pending.                  │  │ pending.                  │
└──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘
... (+2 more)
```

**After (post-F3)**:
```
Demonstrations
A curated strip of freestyle highlight videos.
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ 1998 Worlds Women's Freestyle Final│  │ Footbag 2026: San Marino           │
│ Samantha Conlon + Carol Wedemeyer   │  │ Footage by jay7bah                  │
│ [video facade for 2URvZFuxBls]      │  │ [video facade for U6J2LXxUWro]      │
└────────────────────────────────────┘  └────────────────────────────────────┘
```

### H4 — Dict-card "Notation pending" suppression

**Before (post-NR-1C; mobius card)**:
```html
<article class="dict-card" data-trick-slug="mobius">
  <header class="dict-card-header">
    <a class="dict-card-title" href="...">mobius</a>
    <span class="dict-card-add">5 ADD</span>
  </header>
  <p class="core-trick-equivalence dict-card-equivalence">≡ gyro torque</p>
  <p class="core-trick-equivalence dict-card-equivalence">≡ spinning ss torque</p>
  <p class="core-trick-equivalence dict-card-equivalence">≡ spinning ss miraging op osis</p>
  <p class="dict-card-notation dict-card-notation--pending"><em>Notation pending</em></p>  ← noise
</article>
```

**After (post-F4)**:
```html
<article class="dict-card" data-trick-slug="mobius">
  <header class="dict-card-header">...</header>
  <p class="core-trick-equivalence dict-card-equivalence">≡ gyro torque</p>
  <p class="core-trick-equivalence dict-card-equivalence">≡ spinning ss torque</p>
  <p class="core-trick-equivalence dict-card-equivalence">≡ spinning ss miraging op osis</p>
</article>
```

(`<em>Notation pending</em>` line gone. Card is tighter; structural info carried by ≡.)

For a trick like `pendulum` (post-NR-1B; has notation AND adds=2; no ≡ readings):
- Operational notation `[DEL] [DEX]` renders (no change)
- No "Notation pending" line (it has notation)

For a trick like `bigwalk` (post-NR-1; has `≡ surging butterfly` but no operational notation):
- Has ≡ reading → "Notation pending" suppressed
- Card reads `#bigwalk / ≡ surging butterfly / [5]`

For a true gap row like `pendulum-fake-row-test` (no notation, no ≡):
- "Notation pending" still renders (honest)

### H5 — Hashtag rendering on a curated media tile (F7)

**Before (current; trick-media-grid tile, e.g., on /freestyle/tricks/torque)**:
```html
<li class="reference-media-tile">
  <div class="video-facade" data-youtube-id="ABC123">...</div>
  <p class="reference-media-caption">Torque tutorial</p>
  <p class="reference-media-source"><span class="reference-media-source-label">Tricks of the Trade</span></p>
</li>
```

**After (post-F7; same tile)**:
```html
<li class="reference-media-tile">
  <div class="video-facade" data-youtube-id="ABC123">...</div>
  <p class="reference-media-caption">Torque tutorial</p>
  <p class="reference-media-source"><span class="reference-media-source-label">Tricks of the Trade</span></p>
  <ul class="media-tag-strip">
    <li class="media-tag-chip media-tag-chip--trick">#torque</li>
    <li class="media-tag-chip media-tag-chip--source">#tricks_of_the_trade</li>
    <li class="media-tag-chip media-tag-chip--content-type">#tutorial</li>
    <li class="media-tag-chip media-tag-chip--quality">#curated</li>
  </ul>
</li>
```

(`#trick` and `#freestyle` filtered by suppress-policy. Four meaningful chips. Reads as a typographic strip, not a wall.)

### H6 — Hashtag rendering on a landing demonstration card (F7 + F3)

**After (Conlon entry)**:
```html
<article class="demonstration-card" id="demonstration-conlon-1998">
  <div class="card-title">1998 World Footbag Championships Women's Freestyle Finals</div>
  <p class="demonstration-caption">Samantha Conlon and Carol Wedemeyer</p>
  <div class="video-embed">[video-facade for 2URvZFuxBls]</div>
  <ul class="media-tag-strip">
    <li class="media-tag-chip media-tag-chip--source">#footbag_hof_archive</li>
    <li class="media-tag-chip media-tag-chip--event">#event_1998_worlds</li>
    <li class="media-tag-chip media-tag-chip--quality">#curated</li>
  </ul>
</article>
```

**After (San Marino entry)**:
```html
<article class="demonstration-card" id="demonstration-san-marino-2026">
  <div class="card-title">Footbag 2026: San Marino</div>
  <p class="demonstration-caption">Footage by jay7bah</p>
  <div class="video-embed">[video-facade for U6J2LXxUWro]</div>
  <ul class="media-tag-strip">
    <li class="media-tag-chip media-tag-chip--creator">#by_jay7bah</li>
    <li class="media-tag-chip media-tag-chip--quality">#curated</li>
  </ul>
</article>
```

(Two visible curated demos; tags reinforce the symbolic/navigation language.)

---

## I. Tests needed

Per F5 above, ~10 new assertions. Estimated test impact: +10 tests, ~3-5 existing assertions updated, **3021 → ~3030 tests** total after this slice ships.

**No new test infrastructure** — uses existing supertest + freestyle.routes.test.ts patterns.

---

## J. Staged commit command (deferred — awaiting approval)

The spec gates J on "after approval." Once the maintainer approves the implementation plan, the commit message draft would be:

```bash
git commit -m "$(cat <<'EOF'
fix(freestyle): LANDING-AND-TRICKS-QA-REALIGNMENT-1 — landing render bug + operator-board semantics + demonstrations strip + dict-card density

Six discrete fixes integrated into one slice:

F1: Landing core-trick render bug fix. Handlebars helper "add"
    (registered in src/app.ts:146 as numeric addition) was shadowing
    the FreestyleCoreTrickCard.add data field. Every core-trick card
    rendered "[object Object]undefined" in the ADD slot. Renamed the
    field to addNumeric to avoid the identifier collision.

F2: Operator-board semantic corrections. BL glyph reassigned from
    Blender to Blurry (per pt11; flat +1 modifier; compresses
    Stepping + Paradox). Atomic / Quantum / Fairy action descriptions
    corrected to match move-sets canonical authority (no rotation
    claims; correct dex direction + side). Gyro and Paradox wording
    sharpened. BLURRY + BUTTERFLY composition example replaces the
    structurally-meaningless BLENDER BUTTERFLY.

F3: Demonstrations strip cleanup. Retired the 5-slot pre-named
    scaffolding (Sam Conlon / Classic Circle / etc.) that was a
    misreading of the original Batch 2 spec. Replaced with a clean
    demonstrations array carrying two visible curated videos: the
    1998 Worlds Women's Freestyle Finals (Samantha Conlon + Carol
    Wedemeyer; footbag_hof_archive HIGH_QUALITY_DEMO from
    media_assets.csv) and Footbag 2026 San Marino (jay7bah footage;
    restored from pre-Batch-2 featuredVideo retirement).
    "Curated demonstration pending" placeholder text no longer renders.

F4: Dict-card "Notation pending" suppression policy. When a card
    carries ≡ symbolic-equivalence readings, the "Notation pending"
    italic placeholder is suppressed (the ≡ readings carry the
    structural information). When neither operational notation nor ≡
    readings exist, "Notation pending" still renders honestly.
    Affects ~36 dict cards visually; preserves layer-distinction
    semantics.

F7: Hashtag layer rendering. All curated freestyle media surfaced on
    landing / trick pages / learning surfaces / featured-demo strips
    now visibly expose hashtag chips below caption. Service helper
    shapeMediaTagsForBrowse applies suppress-policy (#trick,
    #unavailable_embed, #freestyle-on-freestyle-only-surfaces) and
    sorts by group precedence (trick-slug → source → creator →
    content-type → event → quality). New media-tag-strip partial +
    .media-tag-chip CSS. Hashtag layer becomes part of the visible
    symbolic/navigation language per the 2026-05-14 maintainer hard
    requirement.

doc-sync update VIEW_CATALOG.md:399 landing entry to reflect the
demonstrations strip reshape + hashtag rendering.

3021 -> ~3030 tests pass.

Per FBORG-AUDIT-1 + SYMBOLIC_COVERAGE_ROADMAP-1 + the post-NR-1C QA
review: this slice closes the user-visible regressions surfaced after
Batch 2 + CSR landed. No ontology changes. No parser expansion. No
new architecture. No new browse axis.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Constraints respected

- No ontology expansion ✓
- No parser expansion ✓
- No recursive decomposition generation ✓
- No new browse axis ✓
- No architecture redesign ✓
- No publication-contract changes ✓
- Stopping-depth philosophy preserved ✓ (no ≡ readings added)
- Restraint-first governance preserved ✓ (no new media fabricated; only confirmed curated videos surfaced)
- Compact symbolic-object philosophy preserved ✓
- No media metadata fabricated ✓ (Conlon video sourced from media_assets.csv; San Marino video sourced from pre-Batch-2 hardcoded entry)
- No corpus bulk-import ✓

---

## Awaiting maintainer approval

Plan above represents the audit + planned fixes for all six concerns raised in PART A-D + the 2026-05-14 hashtag-rendering hard requirement (F7) of the LANDING-AND-TRICKS-QA-REALIGNMENT-1 spec. **No code shipped yet.** Per the spec's J gate, implementation proceeds after maintainer approval.

Sub-unit shape (7 units total):
- **F1** — Landing render bug fix (rename `add` → `addNumeric`) [HIGH; user-visible regression]
- **F2** — Operator-board corrections (BL=Blurry; Atomic/Quantum/Fairy descriptions; etc.)
- **F3** — Demonstrations strip reshape (drop 5-slot scaffolding; surface Conlon + San Marino)
- **F4** — Dict-card "Notation pending" suppression when ≡ readings exist
- **F5** — Tests (~15 new assertions across F1+F2+F3+F4+F7)
- **F6** — doc-sync (VIEW_CATALOG landing entry)
- **F7** — Hashtag layer rendering on all curated media surfaces (NEW hard requirement) [LARGEST single unit]

If approving as one slice, F1+F2+F3+F4+F7 ship together with F5 tests + F6 doc-sync. **F7 is the most invasive new unit** — it adds a new view-model shape (`MediaTagDisplay[]` arrays), a new partial (`media-tag-strip.hbs`), a service helper (`shapeMediaTagsForBrowse`), new CSS, and wiring across two surfaces (landing demonstrations + trick-detail reference-media tiles).

If preferring stepwise: **F1 alone** (highest priority; smallest mechanical change) is the cleanest first ship. F7 could then ship as its own follow-up slice given its scope.
