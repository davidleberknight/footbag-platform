# Curated-Media Expansion & Audit — 2026-05-15

**Status:** Phase 1 + 2 shipped this session (Path C; Dave coordination acknowledged). Phase 3 audit + strategic recommendations below. No source-library ingestion under `curated/`; only editorial sidecars + canonical references per the hard constraint.

**Implementation scope this session:**

- NEW gallery: `gallery_passback_tutorials` (3 PassBack tutorial videos)
- Featured-section additions: Rick Reese 1988 + Worlds 2023 Team Freestyle (Medellín)
- Featured candidate deferred: Newsflare "Incredible hacky-sack routine" (provenance below elite threshold; see §C below)
- This audit memo

---

## §0. Implementation summary

### Files changed (8)

| File | Change |
|---|---|
| `curated/galleries/passback_tutorials.json` | NEW — `gallery_passback_tutorials` config; criteriaTags `#curated` + `#passback_tutorials` |
| `curated/galleries/curated_freestyle_tricks.json` | EDIT — added `#passback_tutorials` to `excludeTags` (defensive — keeps tutorials out of the trick gallery) |
| `curated/freestyle_tutorials/pixie-set-list_124750f2.meta.json` | NEW — PassBack "Footbag \| The Set List - Pixie" sidecar |
| `curated/freestyle_tutorials/footbag-trick-learning_9cba411f.meta.json` | NEW — PassBack "How to Learn a Footbag Trick" sidecar |
| `curated/freestyle_tutorials/freestyle-trick-naming_b8dff8a7.meta.json` | NEW — PassBack "How to Identify & Name Freestyle Footbag Tricks" sidecar |
| `src/services/freestyleService.ts` | EDIT — `featured: [...]` array gains `reese-1988` + `worlds-2023-team` (lines ~4729–4757); chronological order in demonstrations cluster |
| `tests/integration/freestyle.portal.routes.test.ts` | EDIT — 2 stale-count assertions updated (6 → 8 ids, 2 → 4 chip strips) |
| `exploration/curated-media-expansion-2026-05/AUDIT_AND_IMPL.md` | NEW — this memo |

### Identity research

| YouTube ID | Title | Author | Disposition |
|---|---|---|---|
| `u9S7zixV3Yw` | Footbag \| The Set List - Pixie | PassBack | Phase 1 sidecar; STRONG_TUTORIAL |
| `jy-Tjxfftqw` | How to Learn a Footbag Trick | PassBack | Phase 1 sidecar; STRONG_TUTORIAL |
| `ft9SZPyXd54` | How to Identify & Name Freestyle Footbag Tricks | PassBack | Phase 1 sidecar; STRONG_TUTORIAL |
| `Zdplm0_RaNY` | Rick Reese - Worlds 1988 - Freestyle Routine | WorldFootbag | Phase 2 Featured (`reese-1988`); historical archive |
| `xoDEvsbQDYk` | Team Freestyle Footbag — 1st Place at World Footbag Championships 2023 in Medellín Colombia | Scott Davidson | Phase 2 Featured (`worlds-2023-team`); modern team format |
| `YdYxsp6l400` | Incredible hacky-sack routine | Newsflare | **NOT featured** — see §C deferral rationale |

### Gallery IDs (post-session)

- `gallery_curated_freestyle_tricks` (existing) — excludeTags refreshed
- `gallery_tricks_of_the_trade` (existing; untouched)
- `gallery_passback_records` (existing; untouched)
- `gallery_anz_trikz` (existing; untouched)
- `gallery_footbag_finland` (existing; untouched)
- `gallery_shred_global` (existing; untouched)
- `gallery_chinlone` (existing; untouched)
- `gallery_passback_tutorials` **NEW**

### Media items promoted (3 + 2)

- 3 PassBack tutorial sidecars → `gallery_passback_tutorials`
- 2 Featured-section additions → `/freestyle` landing page

---

## §1. Strategic posture

The session crossed the Dave-track boundary by explicit James authorization (Path C). Carrying forward:

- **Curated tree stays lightweight.** New sidecars only; no source ingestion; no asset mirroring; no bulk import.
- **TT canonical sidecars untouched.** 40 TT files preserved as-is per the project invariant.
- **Stable gallery IDs.** New gallery uses deterministic `gallery_passback_tutorials` slug; new sidecars use 8-char hash prefix from caller-supplied UUIDv5 IDs.
- **Editorial coherence over completeness.** Featured deliberately deferred 1 of 3 candidates (Newsflare) because Featured-section quality threshold matters more than count.

---

## §A. Coverage analysis

### Well covered (no gaps)

| Area | Surface | Status |
|---|---|---|
| Tutorials — canonical (TT lessons #1–#42) | `gallery_tricks_of_the_trade`, 40 sidecars | Strong; canonical sidecar invariants in place |
| Tutorials — conceptual | `gallery_passback_tutorials` (3 entries, this session) | Newly seeded; intentionally restraint-first |
| Tutorials — informal series | `gallery_anz_trikz` (AnzTrikz) | Adequate for the source |
| Passback records | `gallery_passback_records` | Strong record-tier coverage |
| Worlds routines (modern, 2017–2026) | Featured + curated trick gallery | Good representation |
| Competition formats (Routine/Circle/Sick3/Shred30) | Featured landing strip | Anchor-conceptual coverage |
| Trick-detail reference media | `curated/freestyle_tricks/` sidecars (~150 entries) | Strong via TT + curated singletons |
| Historical women's freestyle | Featured (`conlon-1998`) | Covered but minimal |
| Historical men's freestyle | Featured (`reese-1988`, new) | Covered (1988); broader pre-1990 still thin |

### Under-covered (glaring gaps)

| Area | Current state | Gap severity |
|---|---|---|
| **Modern women's freestyle** (2010+) | Zero curated entries on Featured surface | High — Conlon 1998 is the only women-centric Featured item |
| **Net** | No curated net gallery; some staging CSVs | High — `/net` exists but lacks curated demonstration media |
| **Circle** (named circles beyond Worlds 2017) | One Featured entry; no curated gallery | Medium — Circle is a major format |
| **Doubles** | No curated coverage | High — doubles is a recognized format |
| **Shred** routines (beyond Featured singleton) | Featured only | Medium — Shred is a high-density format with dedicated routines |
| **Artistic / Sick** (best-trick / artistic showcases) | Sparse; no dedicated gallery | Medium — Sick3 has one Featured entry; deeper artistic work missing |
| **Historical footage pre-1985** | None curated | High — pre-1985 freestyle history is genuinely under-documented |
| **Style-specific eras** (Holden / Bartz / Vu / Husted) | No era-organized curation | Medium — surfaces era-anchored pedagogy nicely if curated |
| **Movement-language education** (notation, decomposition) | `gallery_passback_tutorials` partially fills (3 entries) | Medium-improved this session; could grow |
| **International perspectives** (non-North-American) | San Marino 2026; Medellín 2023; nothing else | Medium — Europe/Asia/SA underrepresented |
| **Symbolic-language pedagogy** | Glossary surface; no curated video | Medium — could pair with notation grammar |
| **Symposium** / no-plant variants | Not visually featured | Low-medium |

---

## §B. Tutorial strategy

### Current tutorial architecture

| Source | Tier | Gallery | Volume | Pedagogical character |
|---|---|---|---|---|
| Tricks of the Trade (Kenny Shults) | CANONICAL_TUTORIAL | `gallery_tricks_of_the_trade` | 40 trick-anchored lessons (#1–#42; #34 missing) | Per-trick how-to; canonical IFPA voice |
| PassBack | STRONG_TUTORIAL | `gallery_passback_tutorials` (NEW; 3) | 3 conceptual tutorials | Movement-language / methodology / set-anatomy |
| AnzTrikz | STRONG_TUTORIAL | `gallery_anz_trikz` | Tutorial collection | Foundational and advanced |
| Curated singletons | various | `gallery_curated_freestyle_tricks` | Mixed | One-offs |

**Total tutorial videos under curation:** ~45–50.

### Onboarding value

- TT is **canonical per-trick** — a learner asking "how do I do X" gets a specific answer.
- PassBack (new) is **conceptual per-mechanic** — a learner asking "what's a pixie set / how do I learn anything / why are these named like this" gets a strong answer.
- AnzTrikz is **per-trick foundational** — overlaps TT in some places; complements in others.

### Overlap risk

- **TT vs AnzTrikz**: both per-trick; overlap risk medium. Mitigated by canonical-tier-vs-strong-tier hierarchy; TT is the default reference.
- **PassBack tutorials vs glossary §1 primer prose**: both teach methodology. Pedagogically reinforce each other; no redundancy if cross-linked. *Recommendation: link from glossary §1 primer + §6 Surface A modifier cards to the relevant PassBack tutorial.*

### Canonical tutorial hierarchy (recommended)

```
Tier 1: CANONICAL_TUTORIAL — Tricks of the Trade
  └─ Per-trick how-to. The reference.

Tier 2: STRONG_TUTORIAL — PassBack + AnzTrikz
  ├─ PassBack: conceptual (set anatomy, methodology, naming)
  └─ AnzTrikz: per-trick foundational (complements TT)

Tier 3: HIGH_QUALITY_DEMO — curated singletons
  └─ Worlds routines, era-defining performances
```

### Grouping recommendation

For the existing tutorial galleries, **group by source first, secondary axis open**:

- TT: trick-anchored (already)
- PassBack: **conceptual axis** — set anatomy / methodology / ontology (this session establishes 3)
- AnzTrikz: trick-anchored (already)

Adding new axes (by set, dex family, difficulty, movement concept) inside each gallery would over-engineer. Cross-axis surfacing belongs at the level of the **trick-detail page** ("Reference Media" block) and the **glossary** (cross-links from term entries), not at the gallery level.

---

## §C. Featured section QC

### Current Featured roster (8 post-session)

| Key | Title | Year | Type | Quality signal |
|---|---|---|---|---|
| routine | Worlds 2020 Online Qualification — Yamamoto | 2020 | Format anchor | Elite modern technical |
| circle | Worlds 2017 Open Circle Finals | 2017 | Format anchor | Strong crowd format |
| sick3 | Worlds 2022 — Sick 3 | 2022 | Format anchor | Elite |
| shred30 | Worlds 2020 — Taishi Ishida | 2020 | Format anchor | Elite |
| **reese-1988** ← NEW | Worlds 1988 — Rick Reese | 1988 | Historical archive | Pioneer-era footage |
| conlon-1998 | Worlds 1998 — Women's Finals | 1998 | Historical women's | Strong historical |
| **worlds-2023-team** ← NEW | Worlds 2023 — Team Finals 1st (Medellín) | 2023 | Team format | Modern elite |
| san-marino-2026 | Footbag 2026 — San Marino | 2026 | Modern travelogue | Strong scene piece |

### Balance audit (post-session)

| Dimension | Before this session | After |
|---|---|---|
| Total items | 6 | 8 |
| Decade span | 1998–2026 (28 yrs) | 1988–2026 (38 yrs) |
| Historical (pre-2000) entries | 1 | 2 |
| Format-anchor entries | 4 | 4 |
| Demonstration entries | 2 | 4 |
| Female-centric entries | 1 (Conlon) | 1 |
| International (non-US) entries | 1 (San Marino) | 2 (+ Medellín 2023) |
| Team-format entries | 0 | 1 |

### Deferred candidate: Newsflare "Incredible hacky-sack routine" (`YdYxsp6l400`)

**Decision: NOT featured.**

Editorial rationale:
- Author is **Newsflare** — stock news-aggregation channel, not a footbag community channel.
- Title uses **"hacky-sack"** (amateur press terminology); the canonical site terminology is footbag/freestyle.
- **Player / event / year unknown.** Provenance reads as recycled stock clip.
- Featured's editorial role per the user brief: *"elite, inspirational, representative of freestyle breadth, visually balanced, historically aware."*
- A Newsflare-attributed clip with unresolved identity dilutes this. The video may be a strong demo of some performance, but Featured surface requires elite + identified.

Disposition: **leave the existing pending intake row in `community_uploads_unresolved` source / `pending` status / `HIGH_QUALITY_DEMO` type.** A future identity-research pass (curator + Red?) may resolve the player; if so, it can be promoted then.

### Featured target & rotation philosophy (recommended)

**Target ceiling: 8–10 items maximum.** Beyond 10, the grid feels catalogued rather than curated.

**Rotation philosophy:**

- **Format-anchor cluster (4)**: Routine / Circle / Sick3 / Shred30. Stable. Each pins a competition format the page narrative depends on. Rotate the EMBEDDED VIDEO when a newer iconic performance lands (e.g. swap Worlds 2020 Routine → Worlds 2026 Routine when the 2026 routine becomes iconic). Don't rotate the key/title.
- **Demonstration cluster (currently 4 post-session)**: Historical + modern + women's + team + travelogue. Rotate one per year if curator surfaces a stronger representative; otherwise leave alone. Demonstrations are CHOSEN, not generated.

**What Featured should become:** **mixed editorial picks + canonical legendary routines.** Both. The 4 format anchors are conceptually canonical; the 4 demonstrations are editorial picks. The pairing works.

**What Featured should NOT become:** rotating highlights (lossy), tutorial showcase (the tutorial galleries are the home for that), or "what's new" feed (kills curation).

---

## §D. Tag / taxonomy QC

### Current tag ecosystem

Tags observed across curated sidecars:
- **Surface tags**: `#curated`, `#freestyle`, `#trick`, `#tutorial`, `#demo`, `#record`
- **Source tags**: `#tricks_of_the_trade`, `#passback_records`, `#passback_tutorials` (new), `#anz_trikz`, `#footbag_finland`, `#shred_global`, `#flipsider_footbag`, `#footbag_hof_archive`
- **Trick tags**: `#whirl`, `#mirage`, `#butterfly`, etc. (one per foundational atom + named compound)
- **Era / event tags**: `#worlds_1988` (new), `#worlds_2023` (new), `#worlds_2017`, etc.
- **Creator tags**: `#by_jay7bah`
- **Methodology tags** (new): `#methodology`, `#ontology`, `#pixie`, `#set-list`, `#beginner`

### Inconsistencies + recommendations

| Issue | Detail | Recommendation |
|---|---|---|
| `#trick` overloaded | Used for both "this video features trick X" and "this video IS a trick demo" | Document the convention in `legacy_data/CLAUDE.md` curator section: `#trick` = "trick demonstration / per-trick reference media." Movement-concept / methodology tutorials use `#tutorial` + `#methodology` |
| `#tutorial` ambiguity | Used inconsistently — TT sidecars don't carry `#tutorial`; PassBack tutorials do | Add `#tutorial` to TT sidecars (~40 file edits) OR explicitly document the convention as "source-tag indicates tutorial-ness." Lean toward the documentation route (less churn) |
| `#demo` underused | Demonstrations on Featured don't carry `#demo` (they use `#curated` only) | Optional: add `#demo` to Featured demonstration entries for tag completeness; defer if low-value |
| Missing era tags | Many sidecars lack year/event tags | Apply era tags retroactively if curator-time permits; not urgent |
| Source-tag collisions | None observed; gallery `excludeTags` lists are explicit | Continue maintaining `excludeTags` defensively (already added `#passback_tutorials` this session) |
| Hashtag chip-strip rendering | Featured cards show all non-`#freestyle` / non-`#trick` tags as chips; some carry too many (e.g., `worlds-2023-team` with `#freestyle`, `#curated`, `#worlds_2023`, `#team`) | Visual budget: 2 chips visible max per card. Service-side filter already drops `#freestyle` + `#trick`; consider also filtering `#curated` from chip display |

### Recommended canonical tag scheme

For new sidecars:

```
Required (every sidecar):
  #curated
  #freestyle

Source tag (exactly one):
  #tricks_of_the_trade | #passback_tutorials | #passback_records |
  #anz_trikz | #footbag_finland | #shred_global | #flipsider_footbag |
  #footbag_hof_archive | #by_<channel-slug>

Content axis (one or more):
  #trick (per-trick demo)
  #tutorial (instructional)
  #record (passback / consecutive record)
  #demo (general demonstration)

Optional context:
  #methodology  #ontology  #set-list  #pixie  #beginner
  #worlds_YYYY  #<event-slug>
```

---

## §E. Media surface strategy

### Current surfaces

| Surface | Current load | Purpose | Recommendation |
|---|---|---|---|
| `/media` | Gallery index + named galleries | Browse-by-source | Keep; ensure new `gallery_passback_tutorials` lands here |
| `/freestyle` (landing) | Featured strip (8 items post-session) + Core Tricks + operator board + jump nav | Conceptual entry point | At budget — do not add more featured below 10 ceiling |
| `/freestyle/learn` | Educational pathways | Learning surface | Cross-link to PassBack tutorials |
| `/freestyle/tt-series` | TT gallery view | Named gallery | Stable |
| `/freestyle/tricks/:slug` | Trick-detail reference-media block | Per-trick media | Strong; PassBack-pixie-set-list could link from pixie modifier-family page |
| `/freestyle/glossary` | Glossary surface | Vocabulary teaching | Cross-link from §1 primer + §6 Surface A modifier feel cards to PassBack tutorials |
| History page | TBD | Era surfacing | Reese 1988 + Conlon 1998 could surface from there |

### What belongs where (recommended)

- **`/media`**: all gallery indexes; cross-source browse
- **`/freestyle`**: featured grid only (don't accrue more); operator board; navigation
- **`/freestyle/learn`**: tutorial gallery list with hierarchy (TT canonical → PassBack conceptual → AnzTrikz foundational)
- **Trick-detail**: per-trick reference media only (TT video for that trick, alternate demos)
- **Glossary**: inline cross-links to relevant PassBack tutorials (especially Pixie Set List ↔ §6 Surface A pixie card; Trick Naming ↔ §1 primer)
- **History**: era-anchored Featured demonstrations (Reese 1988, Conlon 1998); not the modern entries

### Surface separation rules

- **No "all curated videos" mega-page.** Galleries stay separate; each has a clear editorial role.
- **No `/freestyle` featured strip beyond 10 items.** Hard cap.
- **No video tile on the home page** beyond the existing landing demo (`demo-freestyle.meta.json`).
- **No tutorial-gallery rotation on /freestyle landing.** Tutorials live in their dedicated surfaces.

---

## §2. Suggested next-wave curated media targets

Highest-leverage curation candidates (curator-led; this audit recommends targets, not promotions):

### Tier A — high pedagogical leverage

1. **PassBack methodology series — additional entries.** PassBack channel likely has more tutorials in the same conceptual line. Curate 2–4 more for `gallery_passback_tutorials` (e.g., a "Dex" methodology video, "Symbolic Notation" if it exists, "How to Practice").
2. **Modern women's freestyle — at least one Featured candidate.** Conlon 1998 is the only women-centric Featured entry. Curate a 2018+ women's routine (Worlds Women's Finals; recent IWC). If a clearly elite candidate exists, promote to Featured (replacing none — bringing total to 9).
3. **Doubles routine.** Worlds Doubles or IWC Doubles. Currently zero coverage. Could become a 9th Featured entry under "team-format-adjacent."
4. **Glossary cross-link integrations.** Edit glossary §1 primer + §6 modifier cards to reference relevant PassBack tutorials by URL (e.g., "See: How to Identify & Name Tricks" near §1 prose).

### Tier B — medium leverage

5. **Pre-1985 historical footage.** Anything earlier than Reese 1988. Difficult to find; high archival value if surfaced.
6. **Net or Doubles demonstrations** with curated tier-1 quality.
7. **Shred 30 — second-era candidate** (e.g., 2024 or 2025 Worlds Shred 30; pairs with Taishi Ishida 2020).

### Tier C — low priority

8. **Era-organized galleries** (Holden / Bartz / Vu / Husted). Heavy curation effort; defer.
9. **Symposium / no-plant demonstrations.** Niche; defer until requested.

---

## §3. Architectural concerns discovered

1. **Hard-coded Featured array in `freestyleService.ts:4692`.** Featured content is service-layer constant. This forces every editorial change to a code change (deploy required). Long-term, consider extracting to a curated JSON file at `curated/landing/featured.json` (or `curated/galleries/featured.json` if the gallery system can support it). Out of scope for this session; flagging for future.
2. **`gallery_curated_freestyle_tricks.excludeTags` lengthening.** Now at 6 entries (added `#passback_tutorials` this session). Each new tutorial source requires an exclude entry. Convention is sound but the list grows linearly. Acceptable; flag if it crosses ~10.
3. **`curated/freestyle_tutorials/` is a new subdirectory.** Establishes a new content-class convention. Document the pattern in `legacy_data/CLAUDE.md` if it sticks (recommend: yes — keep tutorials separate from trick-anchored sidecars).
4. **YouTube oEmbed dependency** for identity research. Worked well this session; if it becomes routine for high-volume curation, consider a curator script.
5. **`#trick` tag overload.** Surfaced in §D; not blocking but worth a documented convention.

---

## §4. QC findings summary

| Category | State | Action needed |
|---|---|---|
| Symbolic consistency (galleries) | Strong | None |
| Educational clarity (tutorials) | Improved this session | Cross-link from glossary recommended |
| Discoverability (galleries) | Good | Ensure `gallery_passback_tutorials` lands in `/media` index (verify after build) |
| Redundancy (tutorial overlap) | Low | None — TT and PassBack complement |
| Visual noise (Featured) | Acceptable at 8 | Hard cap at 10 |
| Family coherence | Strong | None |
| Notation maturity (sidecar tier values) | Adequate | Document tier convention in CLAUDE.md if churn observed |
| Placeholder handling | Strong | Continue suppressing dead embeds |
| TT canonical invariant | Preserved | None — untouched this session |
| URL validation | Identity verified via oEmbed for all 6 candidates | Recommend an automated oEmbed sweep over `curated/**/*.meta.json` periodically |

---

## §5. Strategic recommendations (top 6)

1. **Cap Featured at 8 for now; revisit at 10.** Do not add a 9th unless an editorial gap is unambiguous (e.g., modern women's freestyle).
2. **Document the curated-tutorials subdirectory pattern.** Add a one-paragraph note to `legacy_data/CLAUDE.md` confirming `curated/freestyle_tutorials/` is the home for non-trick-anchored conceptual tutorials.
3. **Add a `#tutorial` convention paragraph** to the curator notes in `legacy_data/CLAUDE.md`. Settle the `#trick` vs `#tutorial` ambiguity.
4. **Cross-link PassBack tutorials from the glossary.** §1 primer → "How to Identify & Name Tricks"; §6 Surface A pixie card → "The Set List - Pixie"; §6 modifier-feel card prose → relevant PassBack tutorial.
5. **Curate one modern women's freestyle entry as Featured candidate.** Highest editorial coverage gap.
6. **Defer Newsflare item (`YdYxsp6l400`)** until identity resolves. The pending intake row remains; promotion threshold is identity + provenance.

---

## §6. Suggested commit message

```
feat(curated-media): CURATED-MEDIA-EXPANSION-2026-05 — PassBack Tutorials gallery + Featured additions

Phase 1 — gallery_passback_tutorials:
- NEW curated/galleries/passback_tutorials.json (stable gallery ID)
- NEW curated/freestyle_tutorials/ subdirectory (3 sidecars)
- 3 PassBack tutorial videos curated: Pixie Set List, How to Learn a Trick,
  How to Identify & Name Tricks (creator: PassBack; tier: STRONG_TUTORIAL)
- curated_freestyle_tricks.json excludeTags gains #passback_tutorials (defensive)

Phase 2 — Featured-section additions:
- reese-1988: 1988 Worlds — Rick Reese (historical archive)
- worlds-2023-team: 2023 Worlds Team Finals 1st (Medellín)
- Featured grows 6 → 8 (chronological order in demonstrations cluster)
- Newsflare YdYxsp6l400 candidate deferred (unresolved provenance below
  elite threshold; intake row remains pending)
- Test assertions updated (6→8 ids; 2→4 chip strips)

Phase 3 — audit + strategic memo:
- exploration/curated-media-expansion-2026-05/AUDIT_AND_IMPL.md
- Coverage analysis, tutorial-strategy hierarchy, Featured QC,
  taxonomy convention, surface separation rules, next-wave targets

HARD CONSTRAINT honored: no source-library ingestion under curated/.
All sidecars are editorial metadata; no raw video assets; no mirrors.
TT canonical sidecars untouched. 3068/3068 tests pass; build clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## §7. Cross-references

- [[project_media_storage]] — mediaStorageAdapter + curator system member context
- [[project_gallery_organization]] — gallery system architecture
- [[project_passback_dictionary_intake]] — PassBack dictionary intake path (different from PassBack tutorials but related provenance)
- [[feedback_gallery_dave_track]] — Dave-track boundary acknowledged + overridden for this session
- `curated/galleries/passback_tutorials.json` — new gallery
- `curated/freestyle_tutorials/*.meta.json` — 3 new sidecars
- `src/services/freestyleService.ts:4692` — Featured array
- `tests/integration/freestyle.portal.routes.test.ts:343,716` — updated test assertions
- `legacy_data/CLAUDE.md` "Curator-canonical sidecar invariants" — TT invariant; pattern extends to PassBack
