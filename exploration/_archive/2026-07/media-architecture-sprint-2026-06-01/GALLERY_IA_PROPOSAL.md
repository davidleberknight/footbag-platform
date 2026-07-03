# Gallery Information-Architecture Proposal (Part 2)

Architecture/governance only — **no UI implementation**. Proposes the multi-domain hierarchy the
current 8 source-galleries grow into. Gallery rows remain Dave-track / admin-UI-created
(`feedback_gallery_dave_track`); this is the map, not the build.

## Current state

The `/media` surface is effectively "freestyle media, grouped by curated source" — 8 source-named
galleries (`tricks_of_the_trade`, `anz_trikz`, `shred_global`, `footbag_finland`, `passback_records`,
`passback_tutorials`, `chinlone`, `curated_freestyle_tricks`) computed by tag-AND match on
`member_gallery_tags`. Source is the *only* organizing axis today. That is a sound mechanism but a
thin information architecture: it answers "who made it," not "what is it / what's it for / what
discipline."

## Two orthogonal axes (do not conflate)

Galleries should be composable along two independent axes — both already expressible as tag-AND:

- **Domain axis** (what discipline): Freestyle · Net · Sideline · Events · Community · Documentary/History · Educational.
- **Pedagogy axis** (what role): Trick demonstrations · Tutorials · Concept media · Set systems · Records · Historical archives · Learning progressions · Family exemplars.

A gallery is a tag-AND intersection of (domain) × (pedagogy/source). Keeping these orthogonal avoids
the combinatorial-overlap mess of one flat source list.

## Proposed hierarchy

```
Media
├── Freestyle                         (#freestyle)
│   ├── Trick demonstrations          DEMONSTRATION-tier sources (#shred_global, #footbag_finland, passback_demos)
│   ├── Tutorials                     TUTORIAL-tier sources (#tricks_of_the_trade, #anz_trikz, #passback_tutorials)
│   ├── Concept media                 #concept_*  (naming, learning, set-lists — see CONCEPT_MEDIA_GOVERNANCE.md)
│   ├── Set systems                   #set_*  (pixie / fairy / atomic / quantum families)
│   ├── Records                       RECORD-tier (#passback_records)
│   ├── Historical archives           archival sources (#footbag_org, legacy re-hosts)
│   ├── Learning progressions         curated ordered sets (see PROGRESSION_MODELING_MEMO.md)
│   └── Family exemplars              curator-flagged exemplar clip per family
├── Net                               #discipline_net
├── Sideline                          #discipline_sideline
├── Event footage                     #event_*
├── Community archives                community-contributed (attribution in provenance)
├── Documentary / history             long-form historical/documentary
└── Educational systems               cross-domain concept/educational (#concept_*)
```

## How the current 8 map in (no data migration implied)

| Current source-gallery | New home (domain × pedagogy) |
|---|---|
| `tricks_of_the_trade`, `anz_trikz`, `passback_tutorials` | Freestyle › Tutorials |
| `shred_global`, `footbag_finland` (+ `passback_demos`) | Freestyle › Trick demonstrations |
| `passback_records` | Freestyle › Records |
| `footbag_org` | Freestyle › Historical archives |
| `chinlone` | (re-home) → **Net/Sideline sibling: Discipline — Chinlone** (`#discipline_chinlone`); NOT under Freestyle |
| `curated_freestyle_tricks` | the aggregate Freestyle roll-up |

The source galleries don't disappear — they remain valid *source* slices; the new tree adds the
domain × pedagogy organizing layer above them.

## Design principles

- **Browseability:** at most two clicks to any clip — pick a domain, then a pedagogy/source slice.
- **Pedagogical flow:** within Freestyle, order slices learning-first (Tutorials → Concept → Set
  systems → Progressions → Demonstrations → Records → Archives), not alphabetically by source.
- **Historical preservation:** Historical archives + Documentary are first-class siblings, never
  buried under a source; re-hosted legacy (footbag.org) is explicitly an *archive*, not a tutorial.
- **Semantic clarity:** chinlone is a *separate discipline*, not freestyle — the current
  `chinlone` gallery sitting beside freestyle sources is the kind of category confusion the
  domain axis fixes.
- **Scalability:** new sources slot under an existing pedagogy node (the 6-point registration already
  assigns a tier); new disciplines add a top-level domain node; nothing requires re-architecting.
- **No overlap:** a clip's galleries are deterministic from its tags (domain prefix/word + pedagogy
  tier from `source_id`); membership is computed, never hand-assigned per clip.

## Out of scope / deferred
- Actual gallery JSON / admin-UI rows (Dave track).
- The `/media` page redesign (renderer work — explicitly excluded).
- Cross-domain Net/Sideline ingestion (only the IA slots are reserved here).
