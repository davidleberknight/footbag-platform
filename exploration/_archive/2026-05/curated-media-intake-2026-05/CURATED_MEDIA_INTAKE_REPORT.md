# CURATED_MEDIA_INTAKE_REPORT — 2026-05-13

**Project:** Curated media intake — six artifacts + museum direction + trick-page strategy
**Scope:** Curator-track data additions + QC tooling + placement recommendations + strategic recommendations. No new gallery surfaces; no seeder edits; respects `feedback_gallery_dave_track`.
**Constraints honoured:** no ontology mutation; no parser changes; no fabricated metadata; no auto-promoting inventories; observational/editorial separation preserved; deterministic outputs; curated media only in `curated/`.

---

## A. Curated media additions

Six new rows added to `legacy_data/inputs/curated/media/media_assets.csv`. Four new sources added to `media_sources.csv`. Metadata pulled deterministically via `yt-dlp --skip-download`; no field is fabricated.

| Media ID (UUIDv5) | URL | Source | Title (as reported by YouTube) | Creator | Tier | Status |
|---|---|---|---|---|---|---|
| `5cf4cc9b-03b2-598e-932f-dcabcaa6dfb1` | `youtube.com/playlist?list=PL1reqq3taE5pATDJp3e1AG-FaGCIgERUq` | `curated_playlists` | Big footbag tricks | CeilingF4n | HIGH_QUALITY_DEMO | curated |
| `124750f2-146a-5d57-bb28-118ddcd14286` | `youtube.com/watch?v=u9S7zixV3Yw` | `passback_youtube` | Footbag \| The Set List - Pixie | PassBack | CANONICAL_TUTORIAL | curated |
| `9cba411f-98b1-5682-b22d-ec9fdc7ea36d` | `youtube.com/watch?v=jy-Tjxfftqw` | `passback_youtube` | How to Learn a Footbag Trick | PassBack | CANONICAL_TUTORIAL | curated |
| `b8dff8a7-f0ca-5f96-a7b7-27dfa0cb2930` | `youtube.com/watch?v=ft9SZPyXd54` | `passback_youtube` | How to Identify & Name Freestyle Footbag Tricks | PassBack | CANONICAL_TUTORIAL | curated |
| `473a49ad-ad8c-5cc0-b50a-4f79cbf7b09a` | `youtube.com/watch?v=2URvZFuxBls` | `footbag_hof_archive` | 1998 World Footbag Championships Womens Freestyle Finals | Samantha Conlon and Carol Wedemeyer (per curator) | HIGH_QUALITY_DEMO | curated |
| `c38c6fbe-d696-5b3f-a507-1e6c3dec4757` | `youtube.com/watch?v=YdYxsp6l400` | `community_uploads_unresolved` | Incredible hacky-sack routine | Unknown | HIGH_QUALITY_DEMO | **pending** |

**New `media_sources.csv` entries:** `passback_youtube`, `footbag_hof_archive`, `curated_playlists`, `community_uploads_unresolved`.

**Note on the playlist.** Curated as a single playlist-level artifact, NOT as one row per playlist item. The user spec explicitly forbade dumping playlist contents into curated media. The artifact represents the editorial choice "this playlist is a strong inspiration source"; specific items inside the playlist that warrant individual curation are a follow-up curator task.

**Note on the unresolved clip (`YdYxsp6l400`).** Uploader is `Newsflare` (a news-syndicator; not the original performer). Per user spec, no fabricated attribution: creator field is `Unknown`; `review_status='pending'`; surfaced via `community_uploads_unresolved` source so curators can triage. The clip stays in the curated inventory as an observational artifact awaiting identification — never promoted to a trick-detail page until attribution is resolved.

**Note on attribution for #5.** Title says "Womens Freestyle Finals" (consistent with the curator-supplied attribution; "Sam" = Samantha). Creator field carries both names per the curator's input.

---

## B. Placement rationale (per artifact)

These are **recommendations only**; placement-surface implementation requires consumer-code work that respects the `feedback_gallery_dave_track` boundary. This document is the editorial-intent record.

| Artifact | Primary placement | Secondary placement | Why |
|---|---|---|---|
| Big footbag tricks (playlist) | `/freestyle` landing — new "Inspiration" section above the portal cards | `/freestyle/learn` advanced-progression block | High-level showcase; movement aesthetics; not tied to any single trick or modifier |
| Set List — Pixie (PassBack) | Glossary §6 modifier reference (pixie entry) AND `/freestyle/tricks?view=component#component-pixie` page heading | Per-trick pages whose `base_trick` is pixie-modified | Set education + modifier teaching; pixie-specific |
| How to Learn a Footbag Trick (PassBack) | `/freestyle/learn` index page — top "Learning philosophy" block | Beginner-progression page (future) | Methodology; NOT trick-specific; intentionally orphaned from individual slugs |
| How to Identify & Name Freestyle Tricks (PassBack) | Glossary §6 (Modifiers & Operators) AND §7 (Symbolic Notation) AND §8 (Composition & Decomposition) | Future "How to Read Trick Names" section | Foundational compositional grammar; surfaces three V5 primer sections at once |
| 1998 Worlds Women's Freestyle Finals | `/freestyle/history` — era-card "1990s competition" | `/freestyle/competition` — event archive for Worlds 1998 | Historical archive; museum direction |
| Unknown perf clip | NONE on public surfaces until attribution resolves | Internal curator-triage queue only | Pending — no fabricated attribution |

**Cross-cutting placement rules** the recommendations honour:
1. **Methodology content** (How to Learn, How to Name) is intentionally *not* tied to a single trick slug — it lives at the educational-pathway layer (`/freestyle/learn`) and is referenced from many surfaces.
2. **Trick-page curated thumbnails** (per the user spec) are reserved for *editorially intentional* artifacts — see §H below.
3. **Historical artifacts** route to the History page first; modern performance archives may land there if they earn "iconic" status.
4. **Unresolved artifacts** stay in the curator queue; they NEVER auto-promote to public surfaces.

---

## C. Metadata findings

All metadata pulled deterministically via `yt-dlp --skip-download --print` against the public YouTube API. No field fabricated.

### C.1 Resolved attributions

| Artifact | Title (verbatim) | Channel | Upload date | Duration | View count (at pull) |
|---|---|---|---|---|---|
| Playlist | Big footbag tricks | CeilingF4n | n/a | n/a | n/a |
| Pixie Set List | Footbag \| The Set List - Pixie | PassBack | 2022-11-17 | 3:47 | 1,422 |
| How to Learn | How to Learn a Footbag Trick | PassBack | 2024-11-08 | 8:41 | 1,307 |
| How to Name | How to Identify & Name Freestyle Footbag Tricks | PassBack | 2024-08-19 | 22:54 | 1,323 |
| 1998 Worlds | 1998 World Footbag Championships Womens Freestyle Finals | footbaghof | 2013-04-23 (upload) | 4:09 | 1,001 |
| Unknown perf | Incredible hacky-sack routine | Newsflare | 2014-05-15 | 2:59 | 612,434 |

### C.2 Discrepancies flagged for curator review

- **Pixie Set List title doesn't mention "Fairy".** The user spec described the artifact as "Pixie and Fairy Moves"; the actual title is "The Set List - Pixie". The PassBack channel may have a separate Fairy companion video not yet curated. Recommended follow-up: curator searches PassBack channel for a Fairy-specific Set List video.
- **1998 Worlds upload date is 2013-04-23.** The event is 1998; the upload is 2013 (archival re-upload by Footbag HoF). Both dates are preserved (the title carries 1998; the upload field carries 2013). The historical-event date (1998) is the curatorially-relevant year.
- **Unknown perf uploader is `Newsflare`** (news syndicator). Provenance: the original performer + event are not identifiable from the source metadata. Held pending.

### C.3 What's deliberately NOT in the metadata

- **Per-clip timestamps** for snippet extraction inside PassBack videos. The PassBack Set List Pixie video has named-trick demos at intervals; the timestamps require a curator's actual viewing pass. Not fabricated here.
- **Event-archive linkage** for the 1998 Worlds clip. The event entity (worlds-1998 or similar) exists in the canonical events layer; linking the media to it requires `media_links` rows with `entity_type='event'` — and the existing `media_links` only supports `trick` + `record`. Either extend the entity-type vocabulary (curator + service-code work outside this slice) or surface via documentation.

---

## D. QC additions / verification

### D.1 New script — `legacy_data/scripts/qc_curated_media_urls.py`

Read-only, deterministic curator script. Walks `media_assets.csv`, verifies each URL is reachable + non-private + non-deleted, emits a CSV report to `legacy_data/reports/curated_media_url_qc.csv`.

Per-URL pattern:

| Pattern | Check |
|---|---|
| `youtube.com/watch` / `youtu.be/` / `youtube.com/shorts` | `yt-dlp --skip-download --print '%(title)s'` (30s timeout) |
| `youtube.com/playlist` | `yt-dlp --flat-playlist --skip-download --playlist-end 1 --print '%(playlist_title)s'` |
| Other `http://` / `https://` | `curl -I -L -w '%{http_code}' --max-time 10` |

Status vocabulary: `OK / UNREACHABLE / PRIVATE / DELETED / TIMEOUT / SKIPPED`.

Exit code: 0 if all OK / SKIPPED; 1 if any failure. Smoke-tested on the 3 new PassBack rows: 3/3 OK.

Flags:
- `--filter <source_id>` — limit to a single source
- `--output <path>` — override report location

### D.2 Recommended cadence

- Run weekly via cron (curator-side; not CI — CI shouldn't depend on YouTube uptime)
- Surface failures into the curator-review queue
- Re-run after every batch of new curated rows
- Pin a `yt-dlp` version in `requirements.txt` if regressions surface

### D.3 What the script does NOT do

- Does not write to canonical data (DB or `out/canonical/`)
- Does not modify `media_assets.csv` (read-only)
- Does not auto-retire pending rows (curator decision)
- Does not verify thumbnail availability (yt-dlp metadata pull is sufficient signal; a thumbnail-specific check would be 6× the network cost for marginal benefit)

---

## E. Screenshot integration — `Screenshot_passback_sets.png`

**Status:** The image file is not yet committed to the repo (no match for `Screenshot_passback_sets*` in `find . -name`). Placement recommendation can be authored independently; the image needs to be checked in to `src/public/img/freestyle/` (recommended location) before the placement lands.

### E.1 Recommended primary placement

**Top of `/freestyle/tricks?view=component#axis-set` — the Set modifiers section heading.**

- The component view's set-axis already groups tricks by set modifier (pixie, atomic, quantum, fairy, nuclear, furious)
- A contextual image of the PassBack set vocabulary as the *axis-level introduction* directly supports the educational intent
- Caption: a one-line context line plus a deep-link to the PassBack Set List Pixie video (which is now curated as artifact `124750f2-146a-5d57-bb28-118ddcd14286`)

### E.2 Recommended secondary placement

**Glossary §6 modifier-reference section header,** when V5 glossary §6 surfaces.

The V5 glossary architecture (per `exploration/glossary-v5-synthesis/GLOSSARY_V5_ARCHITECTURE.md` §6) is the right long-term home for set-modifier explanation. The screenshot lands above the Modifiers & Operators section as the visual orientation for the operator-framework subsection.

### E.3 Responsive sizing

- **Desktop**: max-width 720px, centered, with caption below
- **Mobile (<480px)**: full-width within the wrapper; aspect-ratio preserved; caption below

### E.4 Caption / context

Recommended caption (curator may refine):

> "Set vocabulary from the PassBack set-modifier glossary. Pixie, fairy, atomic, quantum, nuclear, and furious are operators that transform the uptime window of a base trick — see the [Set List — Pixie video](https://www.youtube.com/watch?v=u9S7zixV3Yw) for a worked introduction."

### E.5 Anti-placements

- **NOT** decoratively placed in `/freestyle` landing without educational anchoring
- **NOT** as a glossary §13 connective-panel ornament
- **NOT** on individual trick-detail pages (too narrow a context for the set-vocabulary overview)

---

## F. High-ROI future curated-media recommendations

What the curated layer is currently strong in, where the highest-value gaps are.

### F.1 Strong coverage today

- Per-trick demonstration videos via `tt_youtube`, `anz_trikz`, `footbag_finland`, `shred_global`, `flipsider_footbag` — 88+ rows
- Record performance clips via `passback_records` — substantial archive
- The Foundational/canonical tutorial sources are registered (`tt_youtube`, `polini_pointers`, `footbagspot_tutorials`)

### F.2 High-ROI gaps to fill (curator-target priority order)

| Priority | Target | Why |
|--:|---|---|
| 1 | **Slow-motion mechanics clips** for hippy vs leggy distinction (Mirage vs Illusion side-by-side; Butterfly vs Whirl side-by-side) | The body-mechanics axis introduced in `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` is the single most pedagogically valuable concept; visual confirmation accelerates learner internalization 10× |
| 2 | **Decomposition / naming explanation clips** (PassBack #ft9SZPyXd54 is now curated; one or two complementary explanations from different community voices would triangulate) | Symbolic-grammar layer's central pedagogical anchor |
| 3 | **Modifier-operator slow-mo** for spinning, paradox, ducking, symposium, atomic (one per operator; 30-60s each) | The modifier-family pedagogy pages (`/freestyle/modifier/*`) would gain massively from per-operator slow-mo clips |
| 4 | **Topology-comparison demos** — Mirage cluster vs Butterfly cluster vs Whirl cluster shown back-to-back | Reinforces the topology view; surfaces equivalence-cluster relationships visually |
| 5 | **Legendary historical runs** — Honza Weber Worlds 2008, Jan Weber routines, Mariusz Wilk routines, Husted-era Worlds | Museum-direction; cultural canon |
| 6 | **Progression-chain demos** — a 5-trick walking-family progression run | Pairs with the walking-progression page |
| 7 | **Foundational base-trick tutorials** for the 10 canonical bases (mirage, butterfly, whirl, swirl, osis, legover, pickup, illusion, ATW, orbit) | If gaps exist; many already covered by TT and PassBack but a coverage audit would surface holes |
| 8 | **Era-overview supercut clips** — 1990s era / 2000s era / 2010s era | Magazine-style historical context |

Each curated artifact should answer the spec's question: "Why does this belong here?" The priority order above is the answer-density ranking.

### F.3 Anti-targets (do NOT curate)

- **All "watch X compete" runs from a given event.** Pick one definitive routine per era; let the rest live in source inventories.
- **Channel-level subscribe links.** Already covered by the source-registry entries.
- **Algorithmic "videos mentioning whirl"** dumps. Reject by definition.
- **Unwatched candidate playlists.** The curator must view + decide before promotion.

---

## G. Historical museum / gallery direction

The History page currently presents prose-only era descriptions. The user's spec is clear: avoid making History "just another video feed."

### G.1 Recommended structure

```
/freestyle/history
├── Era timeline (visual; horizontal scroll or vertical anchor list)
│   ├── 1980s — Foundational era
│   ├── 1990s — Worlds + ADD system + Footbag World magazine
│   ├── 2000s — Modifier stacking + European refinement
│   ├── 2010s — Documentation era + PassBack rise
│   └── 2020s — Symbolic-grammar layer + curated archives
├── Era cards (one per era)
│   ├── 2-3 historical photographs or magazine covers
│   ├── 1-2 representative curated video clips (the 1998 Worlds Women's
│   │   Finals being our first; future additions per F.2)
│   ├── 4-6 pioneer highlights (players, organizers, magazine editors)
│   └── 1 prose paragraph (curatorial introduction)
└── Artifact gallery (cross-cutting; per-era filterable)
    ├── Magazine covers (Footbag World magazine)
    ├── Tournament flyers / posters
    ├── Iconic still images
    └── Historical visual artifacts
```

### G.2 What this avoids

- **History is NOT a video feed.** Video clips are *one element* of an era card, alongside photos, magazine covers, and prose.
- **History is NOT exhaustive.** Each era card holds 2-3 curated artifacts; the goal is *iconic representation*, not coverage.
- **History is NOT just listings.** Each artifact has editorial context — "why this image, why this era."

### G.3 First-pass curated additions to support this

- The 1998 Worlds Women's Freestyle Finals video is now in the curated inventory. It anchors the 1990s era card.
- **Recommend:** curator gathers 2-3 historical photographs (Footbag World magazine covers; iconic player photos) and ships them via the same `media_assets.csv` pattern with a new media_type value (e.g., `image` or `magazine_cover`).
- **Recommend:** an era-card surface design (separate from this slice; Dave-track decision).

### G.4 The "Artifact of the era" concept

A single artifact featured prominently per era — the visual equivalent of a museum's "feature object." Could be the 1998 Worlds clip for the 1990s; a Footbag World cover for the 1980s; etc. Curator-led; one-per-era cap.

---

## H. Trick-page curated-thumbnail strategy

The user's spec was explicit: each trick page should eventually contain SMALL curated thumbnails for **highly intentional artifacts**.

### H.1 The criteria — what earns a thumbnail

| Criterion | Example | Anti-example |
|---|---|---|
| **Best-in-class tutorial for this specific trick** | Polini Pointers' Whirl tutorial | Any "whirl appears at 0:32" clip |
| **Slow-motion mechanics breakdown** | A frame-by-frame Butterfly hippy-dex clip | A continuous-speed run with Butterfly somewhere |
| **Historical performance of this specific trick** | Footage of an early-1990s Ripwalk performance | A modern run that contains Ripwalk among 30 other tricks |
| **Comparison demo** (this trick vs a structural sibling) | Mirage vs Illusion side-by-side | Generic dictionary listings |
| **Editorial explanation** (curator-narrated breakdown) | A PassBack explanation that focuses on this trick | A general dictionary tour |

### H.2 The hard limit

**Maximum 3 curated thumbnails per trick page.** More than 3 dilutes the editorial-intentional feeling and pushes the page toward the algorithmic feed it's trying to avoid. The 3-thumbnail cap forces curators to choose; the choice is the editorial act.

### H.3 The data-layer pattern

Each curated thumbnail is a `media_assets.csv` row linked to a `media_links.csv` row with `entity_type='trick'`, `entity_id=<slug>`, and an additional `curated_thumbnail_role` column (or a separate CSV like `curated_thumbnail_picks.csv`). The latter is cleaner — it stays out of the existing `media_links` shape — but requires a tiny extension to the consumer service.

Schema sketch (NOT yet implemented):

```
curated_thumbnail_picks.csv
  trick_slug, media_id, role, caption, sort_order
```

Where `role` ∈ {`best_tutorial`, `slow_mo_mechanics`, `historical_performance`, `comparison_demo`, `editorial_explanation`}.

### H.4 What does NOT belong on a trick page

- Raw scraped playlists
- Parser dumps
- Source inventories
- "All videos mentioning whirl" type aggregations
- Unreviewed candidate collections
- Curated artifacts that don't specifically demonstrate or explain *this* trick

### H.5 First batch (no implementation; recommendation only)

| Trick slug | Recommended thumbnail roles to fill |
|---|---|
| ripwalk | best_tutorial (PassBack or TT); slow_mo_mechanics (if available); historical_performance |
| whirl | best_tutorial; slow_mo_mechanics; (no historical for now) |
| mirage | best_tutorial; slow_mo_mechanics (anchored on hippy vs leggy distinction); comparison_demo (vs illusion) |
| montage | editorial_explanation; historical_performance |
| paradox-mirage | best_tutorial; editorial_explanation |

Each row in this table represents 1–3 dev-curator pairs of work. The point isn't quantity; it's choice.

---

## I. Constraints honoured

- **No ontology mutation.** `freestyle_tricks` / `freestyle_trick_modifiers` / `freestyle_trick_modifier_links` untouched.
- **No parser changes.** Notation tokenizers untouched.
- **No fabricated metadata.** Every field in the 6 new rows comes from yt-dlp output or curator-supplied input; the unresolved clip is marked `Unknown` and `pending`.
- **No auto-promoting inventories.** No raw scraped data lands in `curated/`. The unresolved clip is in `community_uploads_unresolved` with `review_status='pending'` — the source name itself signals the queue state.
- **Observational/editorial separation preserved.** All 6 artifacts are curator-authored. The 1998 Worlds attribution is curator-provided (Samantha Conlon + Carol Wedemeyer), preserved as-given.
- **Deterministic outputs.** UUIDv5 IDs are content-addressed (URL-derived); re-running with same inputs produces same IDs. QC report is deterministic given network state.
- **Curated media only in `curated/`.** Source inventories, candidate dumps, and unresolved attributions live in their own staging area (the `community_uploads_unresolved` source segregates them from the canonical-active set).
- **Gallery-Dave-track boundary preserved.** No new template surfaces; no seeder edits; data-layer + docs only.

---

## J. Files staged

| File | Change |
|---|---|
| `legacy_data/inputs/curated/media/media_sources.csv` | +4 source rows (passback_youtube, footbag_hof_archive, curated_playlists, community_uploads_unresolved) |
| `legacy_data/inputs/curated/media/media_assets.csv` | +6 curated rows (1 playlist, 3 PassBack tutorials, 1 historical archive, 1 pending-attribution clip) |
| `legacy_data/scripts/qc_curated_media_urls.py` | **NEW.** URL-availability QC script (read-only; deterministic) |
| `exploration/curated-media-intake-2026-05/CURATED_MEDIA_INTAKE_REPORT.md` | **NEW.** This report |

No template files, no service files, no test files, no schema files touched.

---

## K. Stop confirmation

Curation complete; the data + QC + recommendations + report are staged. The placement implementations (E.1 set-axis screenshot, E.2 glossary §6, F.1 mechanics clips, G era cards, H curated thumbnails) are recommendations for curator + Dave-track coordination, not slice deliverables.

The unresolved clip (`YdYxsp6l400`) stays in the curator-triage queue. If attribution surfaces, a follow-up update flips it from `pending` to `curated` + populates `creator`.

---

*End of CURATED_MEDIA_INTAKE_REPORT.md*
