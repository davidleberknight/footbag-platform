# Freestyle Curated Media Ingestion — Target Architecture

Status: design + analysis only. No DB writes, no schema migration, no gallery/service edits,
no ontology mutation in this sprint. Curator-confirmed direction: extend the surviving unified
media model; do not create new parallel tables; do not revive `freestyle_media_*`.

This document is an internal working artifact (data/intake track). It is not a canonical doc and
does not change `docs/`. Gallery surfaces and UI placement remain the primary maintainer's track;
everything below about UI is recommendation-only.

---

## 1. The decision and the target model

The brief asked for a new graph (`media_asset` / `media_link` / `media_source` / `media_gallery` /
`media_tag` / `media_review_status`). That graph already exists twice in the repo, and one copy is
being retired:

- **Legacy graph (deprecating, Phase E):** `freestyle_media_sources` / `freestyle_media_assets` /
  `freestyle_media_links`. The link table carries polymorphic edges
  (`entity_type ∈ {trick, person, event, record}` + `entity_id` + `is_primary` + clip range).
  Live counts: 105 assets, 141 links. `legacy_data/IMPLEMENTATION_PLAN.md` Phase E is dropping these
  tables and loaders 21/22/23, migrating their content into the unified model below.
- **Unified model (the target):** `media_items` + `media_tags` + `media_sources` + `member_galleries`
  + `media_jobs` + the S3 `mediaStorageAdapter`. Already the live, richer system: 210 items
  (161 video), 157 curator-sourced, 871 tag rows, 7 distinct sources. The trick-detail page already
  reads its Reference Media from this model via `#<slug>` tags.

**Target:** all new curated media connectivity is expressed in the unified model. The valuable idea
from `freestyle_media_links` (one media item linking to many entities of different kinds) is preserved
as a *linkage convention*, not as a table. See §3.

---

## 2. Entity mapping (brief to unified model)

| Brief entity | Unified-model home | Notes |
|---|---|---|
| `media_source` | `media_sources` (`source_id`, `source_name`, `source_type`, `url`, `creator`) | Legacy `freestyle_media_sources` is identical-shape and cuts over in Phase E. |
| `media_asset` | `media_items` | Curator content = system uploader + `source_id` + `#curated`; member content = `uploader_member_id` + `#by_<slug>` + `source_id` NULL. Photo/video discriminated by `media_type`; clip range via `start_seconds`/`end_seconds`. |
| `media_link` | `media_tags` today (`#<trick-slug>`, `#tricks_of_the_trade`) | The polymorphic-edge concept is preserved via the namespaced-tag convention in §3, not a new table. |
| `media_tag` | `media_tags` + global `tags` | `media_tags.tag_display` is denormalized; `tags.tag_normalized` is the unique key. |
| `media_gallery` | `member_galleries` (+ `member_gallery_tags` / `member_gallery_exclude_tags`) | AND-of-criteria minus excludes, computed at request time. **Primary maintainer's track; reference only.** |
| `media_review_status` | `moderation_status` + system-uploader + `#curated` (today) | Formal review-state ladder is a content-module proposal (§5), not a new column. |

The two ingestion-relevant truths to internalize: (1) curated vs member is already distinguished by
uploader + `source_id` + tag namespace, and (2) media to trick linkage is already tag-based and live.

---

## 3. Linkage-semantics gap analysis

The brief wants one media item to connect to: tricks, operators/modifiers, families, sets,
tutorial-series, progression ladders, historical references, and (eventually) player/session contexts.
Classified against the current tag model:

**Well-served by tags today (no work needed):**
- Trick: `#<slug>` (the live trick-detail read path).
- Tutorial-series: `#tricks_of_the_trade` (drives `/freestyle/tt-series`; 42-lesson roster invariant).

**Expressible with a namespaced-tag convention (no schema change, §6):**
- Family (`#family-<slug>`), modifier/operator (`#modifier-<slug>`), set (`#set-<slug>`),
  media kind/type (`#kind-<type>`, §4), combo membership (`#combo-<id>`).
- These are *ontology entities* the platform already keys by slug, so a tag is a faithful edge.

**Weakly served — the real gap (do not solve unilaterally):**
- Person / event / record / progression-ladder. The legacy polymorphic edge handled
  person/event/record cleanly with `entity_type`/`entity_id`; tags handle them awkwardly because the
  identity space is not a tidy slug namespace (person ids, event keys, record ids). A `#progression-<id>`
  tag could work for ladders, but person/event/record linkage is exactly the question Phase E must
  resolve when it decides where the legacy relational edges land in the unified model.
- **Recommendation:** flag this as an open decision for the Phase E owner; do not invent a person/event
  linkage convention in this sprint. Curated trick/family/series/modifier/set linkage (the high-value
  educational connectivity) does not depend on resolving it.

Net: the educational media graph the sprint actually needs is fully expressible as namespaced tags on
`media_items`. Only the relational (person/event/record) edges need a cross-track decision.

### 3a. Direct vs indirect coverage — the teaches / components-covered layer

A `#<slug>` tag asserts only **direct dedicated coverage**: this clip is *about* that trick. The
coverage audit (`candidates/EXEMPLAR_CORPUS.md`) surfaced that this is one of three distinct coverage
types, and the flat tag model expresses only the first:

1. **Direct dedicated** — clip tagged `#<slug>`, teaching/showing that trick as its subject.
2. **Embedded instructional** — the trick is taught *inside* another trick's tutorial (e.g. `orbit`
   inside the TT "Around The World" lesson; an atom inside a compound lesson like TT #15 "Around The
   World Toe Stall" or TT #31 "Symposium Mirage Stall").
3. **Demo / reference** — appears in a performance/record clip with no teaching intent.

Tagging an embedded-covered trick with `#<slug>` would be misleading (the clip is not *about* it), so
the tag model cannot honestly represent (2) or (3). This makes "indirect coverage" a fourth weakly
served linkage type alongside person / event / record / progression: a different *kind* of edge, not
a different entity namespace.

**Proposed (not built): a `teaches` / `implies` / `components-covered` relationship layer** — an edge
from a media item to the tricks it covers *indirectly*, carrying its own relation type, kept distinct
from the direct `#<slug>` tag. It would let `orbit` register as embedded-covered via the ATW tutorial
without a false `#orbit` tag, and would correct the coverage-metric undercount (direct `#slug` counts
miss all embedded/reference reach). Reversible and curator-governed like the rest of §6; defer the
build, but treat this as the next design direction for the media-graph relationship layer once the
direct-tag conventions (§6) land.

---

## 4. Media taxonomy

Proposed media kinds, mapped to how each would tag and where it surfaces:

| Kind | Tag | Teaching intent | Typical source tier |
|---|---|---|---|
| tutorial | `#kind-tutorial` | yes, technique breakdown | TUTORIAL |
| demo | `#kind-demo` | no, "what it looks like done well" | DEMONSTRATION |
| progression | `#kind-progression` | yes, ladder of steps | TUTORIAL |
| drill | `#kind-drill` | yes, repetition focus | TUTORIAL |
| combo | `#kind-combo` | no, sequence showcase | DEMONSTRATION |
| slowmo | `#kind-slowmo` | analysis aid | either |
| routine | `#kind-routine` | no, full performance | DEMONSTRATION / RECORD |
| historical | `#kind-historical` | archival | any |
| instructional_series | `#kind-series` (+ `#tricks_of_the_trade` etc.) | yes, grouped curriculum | TUTORIAL |

Kind is orthogonal to source tier: tier answers "how much do we trust the teaching intent of this
source" (`SOURCE_TIER`), kind answers "what is this clip". A single source can carry multiple kinds
(this is exactly why `anz_trikz` / `footbagspot_passback` are held at TUTORIAL pending per-clip
override — kind tags are the mechanism that would let per-clip override happen without reclassifying
the whole source).

These kinds live as a reversible registry (§6), never as a schema column.

---

## 5. Trust-layer model (curated vs uncurated)

Two trust layers, kept strictly separate. The separation already exists in code; this formalizes it.

**Curated / reference layer (this sprint's only concern):**
- Uploader = system curator member (`members.is_system = 1`).
- Carries `source_id` (FK `media_sources`) and the auto-applied `#curated` tag.
- Source trust via `SOURCE_TIER` (TUTORIAL / DEMONSTRATION / RECORD).
- May back: canonical trick pages, glossary pedagogy, operator pages, progression systems, ontology
  validation evidence, educational galleries.
- Review states (proposed ladder, expressed via tags/uploader, not a new column):
  `unverified-curated` → `curated` (`#curated`, source attributed) → `expert-reviewed` (curator sign-off).

**Uncurated / community layer (future, not built here):**
- Uploader = regular member; `source_id` NULL; `#by_<slug>` namespace.
- May eventually back: player profiles, shred feeds, combo archives, discovery, community tagging.
- **Firewall (hard invariant to preserve forever):** uncurated media MUST NOT affect canonical
  ontology, formulas, ADD accounting, aliases, or publication status. A community upload tagged
  `#mobius` is discovery metadata, never evidence that mutates the `mobius` row. Ontology promotion
  stays curator-governed and source-attributed.

The firewall is the reason the two layers must never share a promotion path: curated media can be
cited as decomposition/ADD evidence (with curator judgment); uncurated media can only ever be
*associated* by tag.

---

## 6. The one reversible extension (proposed, not executed)

Everything above needs exactly one new artifact to become real, and it is a TypeScript content
module, not a schema change:

- **`src/content/freestyleMediaTaxonomy.ts`** (proposed): the canonical registry of namespaced
  media tag conventions — the `#kind-*` vocabulary (§4) and the `#family-*` / `#modifier-*` / `#set-*`
  / `#series-*` / `#progression-*` / `#combo-*` linkage namespaces (§3), plus the curated review-state
  vocabulary (§5). One file, fully reversible by deletion, no DB churn.

**Why it is proposed and not built in this sprint:** its consumers are service-layer surfaces that
render tier badges and series views (`freestyleService.ts` `SOURCE_TIER` / Reference Media shaping,
the `/freestyle/tt-series` view). Those surfaces are adjacent to the primary maintainer's media/UI
track, and wiring the registry into them is a rendering change. So the registry is specified here and
left for an explicit, coordinated follow-on slice. Authoring the module alone (with no consumer wiring)
is the smallest possible first step if approved.

No other schema, table, column, or loader change is warranted. The unified model already has the
columns (`source_id`, `start_seconds`/`end_seconds`, `moderation_status`) and the tag machinery.

---

## 7. Future UI direction (recommendation only — primary maintainer's track)

Surfaces that would consume this media graph once the linkage tags exist. None are built in this
sprint; listed so the data work is shaped to feed them:

- Trick page: "Watch examples", "Tutorial available", "Slow-mo available", "Used in runs".
- Family / set / operator pages: representative-media strips keyed by `#family-*` / `#set-*` / `#modifier-*`.
- Glossary: inline demo clips on modifier-feel cards via `#modifier-*`.
- Beginner roadmap / progression explorer: ordered tutorial chains via `#kind-progression` + `#progression-*`.
- "Related combos" / "Learn next": combo and progression edges.

Design implication for the data layer: tag media with the linkage namespaces at ingest time so these
surfaces are a pure read later. The cost of the surfaces is the maintainer's; the cost of *enabling*
them is correct tagging now.

---

## 8. Source sequencing (after PassBack)

Grounded in the current `media_sources` registry (19 registered) and load state:

**Low-friction — already registered, tier=TUTORIAL, zero assets loaded (best ROI):**
- `footbag_foundations` (Erik Chan, website), `everything_footbag` (YouTube), `polini_pointers` (YouTube).
  These need only curated entries; no new source registration.

**Partial — registered and partly loaded:**
- `footbagspot_tutorials` (1), `footbagspot_passback` (3), `passback_youtube` (3, tier null —
  decide tier), `anz_trikz` (10, mixed, per-clip kind tags would unlock correct badging).

**Demonstration depth (registered, loaded):**
- `shred_global` (7), `footbag_finland` (8), `flipsider_footbag` (1) — expand demo coverage where
  trick pages have no demo.

**Not registered / exploration-only (need a registration decision first):**
- Sergio / FootbagSer (no references found in repo — net-new; needs source row + tier).
- footbagmoves.com (currently a decomposition-reference only, label `FM`; not a media source —
  registering it as media would be a separate decision).
- PassBack glossary / tricks page (corpus evidence, not a video media source — stays intake-side).

Sequencing recommendation: PassBack (this sprint, staging) → the three zero-asset registered tutorial
sources (highest ROI, lowest friction) → per-clip kind tagging of mixed sources (`anz_trikz`,
`footbagspot_passback`) → demo-gap fill → net-new source registration (FootbagSer) last.

---

## 9. What this sprint does not do

No new media tables. No revival of `freestyle_media_*`. No DB / loader / schema write. No gallery
surfaces or seeder edits. No media-rendering service changes. No PassBack trick/dictionary/alias
promotion (Red Wave 2 gate). No per-video playlist expansion. No future UI surface built. The taxonomy
module (§6) is specified, not written. Everything produced is reversible analysis under
`exploration/freestyle-media-ingestion-2026-05-29/`.
