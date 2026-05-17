# History Page — Media Integration Recommendations

Slice: Historical Evolution Refresh (2026-05-17). Companion to `HISTORY_PAGE_CONDENSED.md`.

## Intent

Identify where curated media belongs on `/freestyle/history` and what specific clips, diagrams, or visual aids would strengthen the narrative. All recommendations are *opportunistic* — the page should not gate on any particular asset existing.

## Current media slots

`history.hbs` already gates three media slots on curator-populated content:
- `heroMedia` — hero/intro media panel
- `pioneersMedia` — within the Founders & Pioneers section
- `modernEraMedia` — within the Modern Game section

Each slot supports `media` (video facade), `caption`, and `placeholderNote`. Service is responsible for populating these from curator content.

## Per-section media recommendations

### §1 — The Two-Phase Story (new opening)

**Recommended:** none required. This is a framing section; visual content would dilute its rhetorical role.

### §2 — Competitive Eras

**Recommended:** **one demonstrative video per era** if curator media exists. Five eras = five small video tiles. Each clip should be ~15-30 seconds and ideally show a player from the era performing a representative trick or sequence.

Specific candidates (subject to curator media availability):

| Era | Clip type | Notes |
|---|---|---|
| Pre-ADD foundational (~1985-1996) | Footage of a foundational player (Kenny Shults, Rick Reese, Tuan Vu) performing early competitive footbag | Often grainy; cultural-record value high |
| Codification (~1996-2002) | First documented Sick3 sequence or representative competitive routine from this window | Bridge from foundational to scored era |
| Modifier-stacking emergence (~2002-2008) | Blurry whirl appearance or a paradox-family compound | The high-ADD vocabulary's debut |
| Difficulty frontier (~2007-2010) | The Greg Solis ADD-22 sequence if footage exists | Corpus-maximum reference |
| Modern European depth (~2014-2025) | A Václav Klouda or Damian Gielnicki routine | Documents the geographic shift visually |

If curator media is sparse, fewer slots can be populated; missing slots gracefully render as headline+prose without media.

### §3 — Pioneers

**Existing slot:** `pioneersMedia`. Keep.

**Recommended:** if a single representative pioneer clip exists (a tribute reel, a documentary excerpt, an early TV appearance), use it. Otherwise leave the slot empty — the pioneers table is sufficient.

**Optional:** small per-row avatar photos for each pioneer (driven by the existing service `profileHref` if/when populated). This is cosmetic and not load-bearing.

### §4 — The ADD System

**Recommended:** **one short "worked example" video or animation** showing a compound trick decomposition — e.g. a slow-motion mobius with labeled annotations "torque base + gyro modifier = 5 ADD." This is exactly the kind of visual `/freestyle/add-analysis` could carry too; coordinate placement.

If video isn't possible, an inline static image showing the equation `mobius = gyro + torque` with each operator labeled would work as a fallback.

### §5 — How Combos Grew

**Recommended:** **one combo-architecture demonstration video** — ideally a representative combo from the historical record (e.g. one of the documented blurry whirl → whirl sequences, or a Greg Solis breadth-style chain).

This is also a natural place for an inline **timeline strip** showing the difficulty plateau visually — a small chart of mean ADD over years. The data is in the v7 report §6 table. A horizontal timeline with the difficulty band highlighted would communicate the plateau finding faster than the prose alone.

### §6 — Geographic Shift

**Recommended:** **a small map graphic** showing the geographic distribution shift — early dots clustered in North America, modern dots clustered in Central Europe. This is the kind of visualization that wouldn't have been worth building at the platform's earlier stages but now would land cleanly given the maturity of the rest of the page.

Fallback: no graphic; existing prose already communicates the finding.

### §7 — Modern Era + Movement-Language Maturation

**Existing slot:** `modernEraMedia`. Keep.

**Recommended:** the existing slot continues to be the right place for a representative modern-era routine. The new "Movement Language as the Modern Vocabulary" sub-section doesn't need video — it's intentionally about codification, not performance.

## Cross-cutting media types

### Timeline strip

A single horizontal timeline showing key events 1985–2025: BAP founding (1992), first scored sequence (~2001), blurry whirl debut (2001), peak ADD (2008), Modern European period (2014+), Movement-Language formalization (2026). Could appear once near the top of the page or be referenced inline within §1.

### Equation graphics

For §4 (ADD System), small inline graphics showing trick decompositions visually. Examples:
```
mobius     = gyro    + torque
5 ADD      = +1      + 4 base

food processor = blurry + symposium + whirl
6 ADD          = +2     + +1        + 3 base
```

These could be rendered as Handlebars partials with token-classified spans (matching the dictionary card's role-classified op-token rendering), preserving the four-layer separation by reusing existing markup.

### Family-tree visual

The Whirl family tree (whirl → blurry whirl → spinning whirl → paradox whirl → symposium whirl → blurry symposium whirl) could anchor §4 or §5. The existing glossary §5 family-tree visual could be reused.

## Implementation priorities

If a future slice implements these:

**Easy wins (low cost, high pedagogical value):**
- Equation graphics in §4 (reuse existing op-token markup)
- Cross-links to existing glossary family-tree visuals
- Timeline strip if maintainer can supply event dates

**Moderate cost (requires curator media):**
- Per-era video clips in §2
- Geographic-shift map graphic in §6

**Deferred (curator-driven; no shipping deadline):**
- High-quality modern-era routine clip in §7
- Pioneer tribute video in §3

## What NOT to add

- **No autoplay video.** All existing video slots use the `video-facade` partial (click-to-play). Preserve this.
- **No external embeds beyond what's already in the platform's media pipeline.** Keep YouTube as the primary source (the existing `media_sources` table supports YouTube; new platforms would need adapter work).
- **No raw research graphs.** Network analysis charts (PageRank distributions, transition matrices) belong in the v7 report, not on `/freestyle/history`. The page is narrative, not statistical.

## Cross-references

- `HISTORY_PAGE_CONDENSED.md` — the structure these recommendations slot into
- `FREESTYLE_EVOLUTION_REPORT_v7.md` — the source of statistical findings these media would illustrate
- `proposed_combo_analysis_page_structure.md` — the future combo-analysis page may share some visual aids
- `[[project_freestyle_state]]` — current media-system state
