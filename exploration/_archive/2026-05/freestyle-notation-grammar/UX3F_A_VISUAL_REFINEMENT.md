# UX3f-a -- Flagship Visual Refinement + Hierarchy Compression

Date: 2026-05-11. Status: design exploration + minimal safe-now refinements applied.

Reference: `UX3D_D_SEMANTIC_DENSITY.md` (typography compression), `UX3D_E_SEMANTIC_CLUSTER.md` (cluster unification), `UX3E_B_IMPLEMENTATION_REPORT.md` (relationship surfaces), current Montage / Mind Bender / Matador / Toe Stall pages.

Goal: refine flagship pages from "feature-rich" to "highly readable and visually elegant."

Out of scope per user direction: new ontology, new relationship systems, new panels, new data, new schema, JS interactions.

Success criterion: a flagship page that feels simultaneously **deep + elegant + readable + navigable + calm**.

---

## 1. Current state inventory (Montage stress test)

Live Montage page renders **22 distinct visual surfaces** vertically, in this sequence:

```
HERO (dark gradient, ~10 stacked elements)
  breadcrumb
  eyebrow "7 ADD"
  h1 "Montage"
  decomposition strip [spinning][ducking][paradox][symposium][whirl]
  family-badge "whirl family"
  subtitle "Spinning Whirl (op) (symp) (ducking)"
  hero-stats: 7 ADD | compound | 3 kicks (record)
  hero-formula: spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD
  hero-summary: editorial elevator pitch
  featured-media preview card (empty state pill)

BODY (light backdrop)
  About this trick (description + dl Base trick + family-note prose)
  Notation card                        ← cluster member 1
  Set notation (operational) card      ← cluster member 2
  Modifier layering card               ← cluster member 3 (5 nested boxes)
  Execution prose                      ← editorial prose
  Learning notes prose
  Before you try this prose
  Montage Family (5 ADD tiers, 16 members)
  Related Tricks (8 cross-family items)
  Media (empty state pill + intro)
  Pathways: Learn / Watch / Family     ← 3 cards
  Previous Tricks (5 lower-ADD rows)
  Passback Records (1 row)
  Structural decomposition (collapsed <details>)
  source footer
```

That's **~30 distinct elements** scrollable on the page. After UX3d-d typography compression + UX3d-e cluster chrome, the page reads more elegantly than pre-refinement, but Montage-class flagships are approaching visual saturation.

---

## 2. Section-weight audit

| Surface | Visual weight | Information density | Status |
|---------|:-------------:|:-------------------:|:------|
| Hero eyebrow "7 ADD" | low | low | duplicate -- appears 4 more times below |
| h1 "Montage" | high | high (anchor) | correct |
| Decomposition strip | medium-high | high | correct -- prototype surface restored |
| Family badge | low-medium | low | correct |
| Sortname subtitle | low | low | **records-side jargon; recommend dropping on flagship** (UX3d-c §4.3) |
| Hero stats chips | medium | medium | partially duplicates eyebrow + formula |
| Hero formula | medium-high | high | correct -- math surface |
| Hero summary | medium | high | correct -- elevator pitch |
| Featured-media preview | medium | low (empty state) | correct -- honest empty state |
| About prose | medium | medium | description + family-note are the highest-weight body prose |
| About `Base trick` dl row | low | low | **duplicates modifier-layering's core layer** |
| About `family-note` blurb | medium-high | high | dense; could move to family-section eyebrow |
| Notation card | medium | high | correct -- cluster anchor |
| Operational card | medium-high | high | correct -- warm-palette counterpart |
| Modifier-layering card | **high** | **high** | dominant on Montage (5 layers, ~280px tall) |
| Execution prose | medium-high | high | correct -- main mechanics text |
| Learning notes | medium | medium | correct |
| Before you try this | medium | medium | correct |
| Family ladder (5 tiers, 16 members) | **high** | medium | **dominant on whirl family; potential compression candidate** |
| Related Tricks (8 rows + hashtags) | medium-high | medium | hashtags add visual noise |
| Media empty state | medium | low | empty-state pill + section intro both say similar things (UX3d-c §4.5) |
| Pathways block | medium | medium | 3 cards × ~150px = ~450px of vertical real-estate |
| Previous Tricks | medium | medium | correct |
| Passback Records | medium | high | correct -- 1 row, compact |
| Structural decomposition | low (collapsed) | high (when open) | correct -- diagnostic-tail discipline |

**Highest-weight surfaces** (most dominant): Modifier layering card (5 layers) + Family ladder (5 tiers, 16 members) + Operational notation card (long token line). All three pull substantial attention.

**Lowest-information-density surfaces** (most candidates for compression): Hero eyebrow (duplicate), Sortname subtitle (jargon), About Base trick dl row (duplicate), Media empty-state duplicate, Pathways card padding.

---

## 3. Saturation analysis -- where does eye fatigue begin?

Reading Montage top to bottom, fatigue cues at:

1. **Around the hero stack (elements 6-10):** "Sortname subtitle + hero stats + hero formula + hero summary + featured-media preview" stack tall. The eye is processing 4-5 distinct visual modes in 250+px before reaching About.

2. **Around the modifier-layering card:** 5 nested boxes with their own internal padding pile to ~280px. The reader has just absorbed the same data via decomposition strip + hero formula; the layering panel is the THIRD presentation of the same modifier set. Pedagogically valuable but visually demanding.

3. **Around the family lineage:** 16 family members across 5 ADD tiers = ~340px of tier-grouped links. The reader has moved past the editorial prose; this is a navigation surface but a large one.

4. **Around Related Tricks + Pathways:** 8 related rows with hashtags + 3 pathway cards add ~600px of lateral navigation. By this point the reader is at scroll-depth ~2200px.

The pattern: **redundancy spikes at the top** (multiple "7 ADD" mentions, multiple decompositions) **and dense navigation surfaces stack in the middle** (family ladder + related + pathways).

The cure isn't removing content -- it's **letting the structural surfaces speak once each** at strong volume, and quieting/compressing the metadata.

---

## 4. Flagship pacing problems

Current pacing reads as: **medium → tight → medium → tight → medium → tight**. There's no genuine breathing room except between the hero and About.

Ideal pacing: **medium-loud → quiet → loud → quiet → medium → quiet → tail**. The reader should encounter clear "loud" zones (hero h1, notation cluster, family lineage) separated by quieter prose / navigation.

Current pacing dampers (zones that should compress):
- Hero eyebrow + sortname + stats chips (compress into one metadata band)
- About dl list (drop redundant Base trick row when modifier-layering renders)
- Pathway cards (reduce padding + smaller title)
- Related Tricks hashtags (quiet down)
- Media empty-state duplication

Current pacing absences (zones that should expand):
- Between cluster and editorial prose (visual break)
- Between family lineage and related tricks (currently abuts)
- Between the last navigation surface and Passback Records (records is high-information; deserves breath above)

---

## 5. Compression candidates (compact modes)

### 5.1 Hero metadata band consolidation

Current 4 rows (eyebrow / family-badge / sortname / hero-stats) could collapse to **2 rows**:
- Row 1: eyebrow chip + family-badge + record chip → unified metadata band
- Row 2: hero-stats reduced to just `compound` category

Saves: ~80px hero height. Drops sortname (records-side jargon) and consolidates `7 ADD` into a single chip rather than 3 appearances (eyebrow + hero-stats + formula + layering total).

### 5.2 Hero formula vs decomposition strip

Both convey decomposition. Currently they sit ~80px apart (separated by hero stats). They could become consecutive:
- Decomposition strip (5 coloured pills, no weights)
- Hero formula (same tokens with weights + total)

Reading rhythm: "this is the structure" → "this is the math". Saves visual fragmentation.

### 5.3 About section dl-list compression

Three remaining rows on Montage after UX3d-c suppressed `ADD value`:
- `Base trick: whirl (3 ADD)` -- duplicates modifier-layering core layer
- `Also known as` (if aliases exist) -- low-priority navigation
- The `family-note` div sits below dl

**Recommendation:** suppress `Base trick` row when `modifier_layering` is non-null. Move `family-note` to a small eyebrow above the family ladder section instead of inside About.

### 5.4 Modifier-layering compact mode (high-modifier rows)

5-layer Montage panel is ~280px on desktop. At 4+ modifiers, an alternative rendering:

```
spinning  (+1)   ←  outermost
ducking   (+1)
paradox   (+1)
symposium (+1)
whirl     (3)   ←  core
─────────────
        Total ≡ 7 ADD
```

A flat indent-stack instead of nested boxes. Same data; ~half the vertical space; less visual force. Activation rule: `modifier_links >= 4` switches to compact mode; `== 3` keeps nested boxes.

**Risk:** medium. Loses the prototype's nested-box motif on the densest flagship. The motif is what makes the surface distinctive. Reconsider whether the nested-box visualisation is worth its vertical cost on 4+ modifier compounds OR whether a hybrid (first 2 layers nested + remaining as compact indented list) reads better.

### 5.5 Family lineage compression for dense families

Montage's whirl family ladder spans 5 ADD tiers with 16 members. At ~30px per row + 24px per tier label = ~280px.

Compression options:
- **Two-column tier members** at desktop (≥800px). Saves ~50% vertical height.
- **Collapse non-adjacent tiers** by default: show 3 ADD (base) + 6 ADD (peers) + 7 ADD (current). Hide 4 ADD + 5 ADD behind "show all" link.
- **Quieter tier labels** (already smaller after UX3c-b; could go smaller still).

The two-column option is the safest: pure CSS, no information hiding.

### 5.6 Related Tricks hashtag de-emphasis

Currently each related-trick row carries name + hashtag link. 8 rows × 2 elements = 16 visual nodes.

**Recommendation:** keep the hashtag link but render it muted + smaller. The hashtag remains accessible for navigation but recedes visually. Or: drop the visible `#name` text and keep just the link element (transparent affordance for hashtag-aware users).

### 5.7 Pathways card compression

3 pathway cards each have:
- h3 title
- primary text (1 line)
- optional secondary text (1 line)
- arrow link (1 line)

Total per card: ~80-100px. 3 cards = ~240-300px.

**Recommendation:** reduce padding from current to ~10px; merge title + primary text on one line for short cases (e.g., "**Watch records:** 1 record (top: David Clavens, 3 kicks)" → single line with bold prefix). Saves ~60% pathway vertical height.

### 5.8 Media section dedup

UX3d-c §4.5 already identified: section-intro `<p>` ("Tutorials and demonstrations referencing this trick will appear here...") + empty-state pill `<p>` ("Curated tutorial coming soon. See the record-holder demonstration...") render two consecutive empty-state messages.

**Recommendation:** suppress section-intro `<p>` when featured-media is in empty state. The pill carries the message.

---

## 6. Hero refinement

The current Montage hero stacks 10+ elements. Below sketches a tighter alternative:

### 6.1 Current

```
breadcrumb
7 ADD             ← eyebrow
Montage           ← h1
[spinning][ducking][paradox][symposium][whirl]  ← decomp strip
whirl family      ← badge
Spinning Whirl (op) (symp) (ducking)            ← sortname
7 ADD  compound  3 kicks (record)               ← stats
spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD  ← formula
A 7-ADD whirl compound: ...                     ← summary
[featured-media preview card]
```

### 6.2 Proposed compression

```
breadcrumb
Montage                                              ← h1
[whirl family]  [7 ADD]  [3 kicks · record]          ← unified metadata chip-row
[spinning][ducking][paradox][symposium][whirl]       ← decomp strip
spinning(+1) + ducking(+1) + ... + whirl(3) = 7 ADD  ← formula (immediately below strip)
A 7-ADD whirl compound: ...                          ← summary
[featured-media preview card]
```

Changes:
- **Eyebrow removed.** "7 ADD" moves into the metadata chip-row as a single chip.
- **Sortname dropped.** Records-side jargon; the decomposition strip already conveys structure.
- **Hero-stats chips compressed.** Combined with family badge + (when record exists) record chip into one inline band.
- **Formula sits directly below decomposition strip.** Visual continuity: tokens → tokens-with-weights.
- **`compound` category dropped** from hero stats. The page's heading discipline already implies "this is a trick page"; `compound` is rarely informative.

Net: hero stack shrinks from ~10 elements to ~7. Hero vertical height drops ~30%.

### 6.3 What stays

- h1 (Montage) -- the load-bearing anchor
- Decomposition strip -- prototype recovery surface
- Hero formula -- math surface; promoted to immediately under the strip
- Hero summary -- editorial pitch
- Featured-media preview -- empty-state honesty

---

## 7. Semantic cluster refinement

UX3d-e gave the 3 cluster surfaces (notation, operational, modifier-layering) matching card chrome. Current cluster on Montage: 3 cards, ~600px combined.

Refinement opportunities:

### 7.1 Visual hierarchy among cluster members

All 3 cards share chrome. Could:
- Make notation card visually lightest (smallest section-intro)
- Make modifier-layering card visually densest (5 nested boxes)
- Make operational notation between them

Currently they're balanced. The dominance from modifier-layering comes from its content size, not its chrome.

### 7.2 Modifier layering -- compact mode for 4+ modifiers

Per §5.4 above. Activate flat-indent mode when modifier_links >= 4 (Montage only today). Preserves the panel's role on 3-modifier compounds (none today; future-wave material).

### 7.3 Operational notation token line compression

Montage's operational line is long: `CLIP >> (BACK) SPIN [BOD] > DUCK [BOD] >> (NO PLANT WHILE) OP FRONT WHIRL [DEX] [PDX] [BOD] > OP CLIP [XBD] [DEL]`. At desktop ~960px, wraps to 2 lines. Mobile wraps to 3-4 lines.

**Not really a compression candidate.** The data is what it is. Could explore breaking the line at sequence-op boundaries (`>>`) to read more like a sentence sequence, but that adds vertical lines.

### 7.4 Cluster vertical break

Currently the 3 cards sit at 12px margin between (UX3d-e tightening). Could go to 8px for even tighter rhythm. But the existing 12px gap already reads as a unified cluster; tightening further would feel cramped.

---

## 8. Relationship surface refinement (EA1 + EA2)

UX3e-b gave parallel + substitution panels. On Montage, both omit (no data). On Mind Bender / Matador / Phoenix, they activate.

Audit on Matador (4 substitutions + 2 parallels = ~250px):
- Substitution swap pills (role-coloured) are at 0.95rem font. Could go smaller (0.88rem) for compression.
- Parallel rows with grid-layout name + ADD on row 1 and decomp snippet on row 2. Decomp snippet at 0.86rem mono — already compact. Could merge to inline if mobile reflow stays clean.

**Recommendation:** inline-compact mode for substitutions when count >= 3. Combine swap + result into single row:

```
ducking → spinning  ·  Spender  ·  6 ADD
```

Saves a row per substitution (~20px each). On Matador's 4-substitution case, saves ~80px.

**Risk:** small. The visual distinction between EA1 and EA2 may dim. Mitigation: keep role-coloured swap pills + arrow glyph at full saturation; only the trick name + ADD compress inline.

---

## 9. Toe Stall sparse baseline -- ensuring elegance

Toe Stall renders (post all UX3 phases):
- breadcrumb / eyebrow / h1 "toe stall" / family badge / hero stats (1 ADD) / hero formula (`toe stall = 1 ADD`) / hero summary (none) / featured-media preview (none)
- About this trick (prose description, no dl rows since no compound)
- Notation card (single TOE token)
- Family ladder (1-3 ADD tier, ~3-5 members)
- Pathways (3 cards, mostly empty)
- (No operational, no modifier-layering, no execution prose, no records, no related, no parallels, no substitutions)
- Structural decomposition (collapsed)

Total: ~8-10 visible surfaces. Reads short and elegant.

**Concern:** the Pathways block currently renders 3 cards regardless of data availability. On Toe Stall, "Learn this trick: no tutorials yet" / "Watch records: no records" / "Related families: ..." reads as "lots of missing things." Could collapse pathways to single quieter row when ≥2 are empty.

**Concern:** the hero metadata band (without compression) shows `1 ADD compound` chips. After §6.2 compression, hero becomes leaner — atoms benefit too.

The atom rendering is healthy. The compression recommendations above benefit atoms similarly: less hero stacking, denser pathway block, cleaner about section.

---

## 10. Typography recommendations

| Surface | Current | Recommendation |
|---------|---------|----------------|
| Hero h1 | site-default (browser/site combination) | Reduce to ~1.8rem on desktop, ~1.5rem mobile -- the decomposition strip carries the identity signal, h1 doesn't need to be huge |
| Eyebrow | small caps | Drop (consolidate into metadata band per §6.2) |
| Section h2 | 1rem uppercase tracked muted (UX3d-d) | keep |
| Section intro | 0.88rem muted (UX3d-d) | keep |
| Hero formula | 0.95rem mono | keep |
| Decomposition strip | 1.05rem mono | keep |
| Modifier-layering name | 1.05rem bold | reduce to 1rem -- still strong but less dominant |
| Modifier-layering weight | 0.9rem mono | keep |
| Parallels decomp snippet | 0.86rem mono | keep |
| Substitution swap | 0.95rem | reduce to 0.88rem |
| Pathway card title | h3 default | reduce to 0.92rem bold for compactness |
| Related Tricks hashtag | inherit | reduce to 0.82rem muted |

Variety check: currently the page uses 4 weights (400/500/600/700) and 2 type families (sans body + mono structural). The mono surfaces are: hero formula, decomp strip, notation tokens, operational tokens, modifier-layering weight pill, parallels decomp, substitution swap. That's a lot of mono. Each is justified by its content type (structural / mathematical). Keep.

---

## 11. Spacing recommendations

| Surface | Current | Recommendation |
|---------|---------|----------------|
| `.content-section` margin | 20px (UX3d-d) | tighten to 16px on .trick-shell, only for flagship-style pages |
| `.section-heading` margin-bottom | 12px (UX3d-d) | keep |
| Cluster card padding | 14px 18px (UX3d-e) | tighten to 12px 16px |
| Cluster inter-card margin | 12px (UX3d-e) | keep |
| Hero block bottom margin | site default (`.hero-sm` padding) | tighten by ~12px |
| Pathway card padding | site default | reduce to 10px |
| Family-lineage tier padding | 8px (UX3c-b) | keep |
| Prose paragraph margin | 8px (UX3d-d) | keep |
| Mobile section margin | 16px (UX3d-d) | tighten to 14px |

Net: 30-40px saved per page on Montage; less impact on sparse pages.

---

## 12. What to de-emphasize

Six items where reduced visual weight improves the overall page:

1. **Hero eyebrow** (`7 ADD` chip above h1) -- redundant with hero stats + formula. **Drop or consolidate.**
2. **Sortname subtitle** (`Spinning Whirl (op) (symp) (ducking)`) -- records-side jargon; decomposition strip covers identity. **Drop on flagship rows.**
3. **About `Base trick` dl row** when modifier-layering renders -- duplicates the layering core. **Suppress.**
4. **`compound` category chip** in hero stats -- low signal; the rest of the hero conveys this implicitly. **Drop.**
5. **Related Tricks hashtags** -- reduce font + opacity; keep link affordance. **Visually quiet.**
6. **Media section-intro** when in empty state -- duplicates the empty-state pill. **Suppress section-intro when featuredMedia is null.**

---

## 13. Before/after hierarchy sketch

### 13.1 Current Montage (top 1500px scroll)

```
┌──────────────────────────────────────────────────────────────────┐
│ HERO BLOCK (~520px)                                              │
│   breadcrumb                                                     │
│   eyebrow "7 ADD"                                                │
│   h1 "Montage"                                                   │
│   decomp strip (5 pills)                                         │
│   family-badge                                                   │
│   sortname subtitle                                              │
│   hero stats (3 chips)                                           │
│   hero formula                                                   │
│   hero summary                                                   │
│   featured-media preview                                         │
└──────────────────────────────────────────────────────────────────┘
        ↓ ~80px gap (current site default)
┌──── About this trick (~280px) ──────────────────────────────────┐
│  prose description                                              │
│  Base trick: whirl (3 ADD)        ← redundant                   │
│  family-note (heavy prose)                                      │
└──────────────────────────────────────────────────────────────────┘
        ↓ 20px gap
┌──── Notation card (~120px) ──────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
        ↓ 12px
┌──── Operational notation card (~180px) ─────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
        ↓ 12px
┌──── Modifier layering card (~340px including header) ───────────┐
│  5 nested boxes                                                  │
│  Total ≡ 7 ADD                                                   │
└──────────────────────────────────────────────────────────────────┘
        ↓ 20px gap
                 (continues...)
```

Sum first 1500px: 5 distinct surface zones, much vertical real-estate spent on hero metadata + cluster cards.

### 13.2 Proposed compressed Montage (top 1500px scroll)

```
┌──── HERO BLOCK (~340px, -180px) ─────────────────────────────────┐
│   breadcrumb                                                     │
│   h1 "Montage"                                                   │
│   [whirl family] [7 ADD] [3 kicks · record]    ← unified band   │
│   decomp strip (5 pills)                                         │
│   formula directly below                                         │
│   summary                                                        │
│   featured-media preview                                         │
└──────────────────────────────────────────────────────────────────┘
        ↓ 16px gap (tightened)
┌──── About (~180px, -100px) ──────────────────────────────────────┐
│  prose description                                                │
│  (Base trick row suppressed; family-note moved to family section)│
└──────────────────────────────────────────────────────────────────┘
        ↓ 16px
┌──── Notation card (~120px) ──────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
        ↓ 12px
┌──── Operational notation card (~180px) ─────────────────────────┐
└──────────────────────────────────────────────────────────────────┘
        ↓ 12px
┌──── Modifier layering card (~280px, -60px) ─────────────────────┐
│  5 nested boxes (compact 4+ mode optional)                       │
│  Total ≡ 7 ADD                                                   │
└──────────────────────────────────────────────────────────────────┘
        ↓ 20px gap
                 (continues...)
```

Net savings: ~340px to the top of the editorial-prose zone. The reader hits Execution prose at ~1100px instead of ~1440px. Saturation moves later in the scroll.

---

## 14. Categorised refinements

### 14.1 Safe now (implemented in this phase)

| # | Refinement | Affected | Risk |
|---|-----------|----------|:----:|
| F1 | Suppress sortname subtitle when `heroDecomposition` non-null | flagship pages (Phoenix / Matador / Mind Bender / Montage / Spender) | low |
| F2 | Suppress About "Base trick" dl row when `modifierLayering` non-null | Montage only today | low |
| F3 | Suppress Media section-intro `<p>` when featured-media is in empty state | UX2-pilot pages | low |

These are the 3 smallest, safest items from §12. Each is a 1-condition template change.

### 14.2 Medium risk (recommended; defer for next phase)

| # | Refinement | Notes |
|---|-----------|-------|
| F4 | Hero metadata band consolidation (per §6.2) | Touches `trick-hero.hbs` significantly; multiple new chips combined |
| F5 | Drop hero eyebrow + `compound` category chip | Affects every trick page; needs site-wide visual review |
| F6 | Family lineage two-column layout for dense families | CSS-only when ≥3 tiers OR ≥12 members |
| F7 | Pathways card compression | Reduce padding + inline title+primary for short cases |
| F8 | Substitution inline-compact mode for count ≥3 | Affects Matador's 4-substitution rendering |
| F9 | Section margin tightening: 20px → 16px on `.trick-shell` | Site-wide rhythm change; could be too tight on prose pages |
| F10 | Related Tricks hashtag quietening (smaller + muted) | Affects all pages; small visual change |
| F11 | Modifier-layering compact mode (flat indent) for `modifier_links >= 4` | Loses prototype nested-box motif on 4+ compounds |
| F12 | Move family-note from About to family-section eyebrow | Restructures the About partial |
| F13 | h1 font-size reduction (1.8rem desktop) | Significant visual change; needs verification across browsers |

### 14.3 Avoid (out of scope)

| # | Anti-pattern | Why avoid |
|---|-------------|----------|
| F14 | Drop the hero formula | UX3c-c surface; load-bearing math |
| F15 | Drop the decomposition strip | UX3d-a surface; prototype recovery anchor |
| F16 | Drop the modifier-layering panel | UX3d-b surface; flagship distinctive |
| F17 | Drop relationship surfaces | UX3e-b just landed; provides structural-ecosystem reading |
| F18 | Drop prose sections | UX2 educational richness; preserve |
| F19 | Replace nested boxes with diagrams | More complexity; less restraint |
| F20 | Add expandable/collapsible sections | Adds JS or `<details>` proliferation; complicates flow |
| F21 | Remove Pathways block | Some pages use it as the only "next step" surface |

---

## 15. Implementation -- safe-now F1 + F2 + F3

### 15.1 F1 -- Sortname suppression on flagship rows

`src/views/partials/trick-hero.hbs`:
```diff
- {{#if content.sortName}}<p class="hero-subtitle">{{content.sortName}}</p>{{/if}}
+ {{#unless content.heroDecomposition}}
+   {{#if content.sortName}}<p class="hero-subtitle">{{content.sortName}}</p>{{/if}}
+ {{/unless}}
```

Rule: when `heroDecomposition` is non-null (UX3d-a activation), the structural identity is conveyed by the role-coloured pill strip; sortname is redundant. Sparse pages without a decomposition strip continue to show sortname as a search-style identity fallback.

### 15.2 F2 -- Base trick row suppression when modifier-layering renders

`src/views/partials/trick-about.hbs`:
```diff
- {{#if content.dictEntry.addComposition}}
- <dt>How it's built</dt>
- <dd class="add-composition">{{content.dictEntry.addComposition}}</dd>
- {{else if content.dictEntry.baseTrick}}
- <dt>Base trick</dt>
- <dd>...</dd>
- {{/if}}
+ {{#if content.dictEntry.addComposition}}
+ <dt>How it's built</dt>
+ <dd class="add-composition">{{content.dictEntry.addComposition}}</dd>
+ {{else if content.dictEntry.baseTrick}}
+   {{#unless content.modifierLayering}}
+   <dt>Base trick</dt>
+   <dd>...</dd>
+   {{/unless}}
+ {{/if}}
```

Rule: when `modifierLayering` renders (Montage today), the layering panel surfaces the base trick as the innermost layer; the About dl row would duplicate. Atoms + simpler compounds continue to show the row.

### 15.3 F3 -- Media section-intro suppression on empty state

`src/views/freestyle/trick-shell.hbs`:
```diff
- {{#if content.hasReferenceMedia}}
- <p class="section-intro">Curated videos referencing {{content.trickName}}.</p>
- {{else}}
- <p class="section-intro">Tutorials and demonstrations referencing this trick will appear here as they are added.</p>
- {{/if}}
+ {{#if content.hasReferenceMedia}}
+ <p class="section-intro">Curated videos referencing {{content.trickName}}.</p>
+ {{/if}}
```

Rule: when no media exists, the empty-state pill carries the message ("Curated tutorial coming soon..."). The section-intro repeats. Drop it.

---

## 16. Validation expectations (post safe-now)

| Check | Expected |
|-------|----------|
| TypeScript build | clean |
| Freestyle integration tests | 244 / 244 green |
| Sortname suppression on Phoenix / Matador / Mind Bender / Montage | hero loses the `(op)(symp)(ducking)` jargon row |
| Base trick dl row on Montage | suppressed (modifier-layering active) |
| Base trick dl row on Mind Bender / Phoenix / Matador | preserved (no modifier-layering at modifier_links < 3) |
| Media section-intro on Matador (empty state) | suppressed |
| Atoms (Toe Stall, Mirage) | unchanged |
| Forbidden-term audit | 0 hits |

---

## 17. What this phase achieves

Per the success criterion "deep + elegant + readable + navigable + calm":

After F1+F2+F3:
- **Deep:** preserved -- all 22 surfaces still render on Montage; the relationship surfaces still cross-link; the modifier-layering panel still nests 5 layers.
- **Elegant:** improved -- the hero loses a row of records-side jargon; About loses a redundant dl row; Media drops a duplicate empty-state line. Visual saturation eases.
- **Readable:** preserved -- typography hierarchy unchanged; cluster chrome unchanged; prose unchanged.
- **Navigable:** preserved -- all anchor links + section IDs intact; Related Tricks + Parallels + Substitutions + Pathways + Previous Tricks all unchanged.
- **Calm:** improved -- 3 small de-emphasis decisions reduce the page's visual noise without removing any structural intelligence.

This phase is intentionally minimal-implementation. The medium-risk catalog (F4-F13) is the next refinement battery; defer until safe-now is reviewed.

---

## 18. Decision points

1. **Approve F1+F2+F3 already implemented?** Visual sanity check on Montage and Matador.
2. **Sequence medium-risk for the next phase**: F4 (hero metadata band) is the biggest gain; F6 (family-lineage 2-column) is the safest within medium-risk; F8 (substitution inline-compact) is bounded to Matador.
3. **Confirm avoid-list (F14-F21)?** Or revisit any item.
4. **Reading the page now**: does Montage feel calmer? Does Matador's substitution panel feel right-weighted?
