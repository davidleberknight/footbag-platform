# Current external-URL curation workflow (2026-05-31)

Reframed from "are external links blocked?" to "which existing workflow curates an external
instructional URL?" Investigated read-only against current code (post the 2026-05-31 pull).

**Headline:** the current process **can** represent a curated external instructional video with all
of {external URL, source, title, curator approval, hashtags, trick association, tier/kind, public
surfacing} — **no schema change needed.** The youtube/vimeo "block" I flagged earlier is real but
narrow: it only forbids embedding a *raw non-youtube/vimeo URL as a video*, which the actual goal
does not require (use youtube/vimeo if the demo is hosted there, else re-host to S3).

## The four external-URL mechanisms (distinct; don't conflate)

| Mechanism | What it is | Tags? | Tier/kind? | Trick assoc? | Public on trick page? |
|---|---|---|---|---|---|
| **D. Sidecar → `media_items` video** (`seed_fh_curator`) | The curated trick-media path: a `media_item` with `video_platform ∈ {youtube, vimeo, s3}` + `#curated`+`#<slug>` tags | ✅ | ✅ (source_id tier + `#kind_*`) | ✅ (`#<slug>`) | ✅ (Reference Media block) |
| **A. `media_items.external_url`** | Optional "more info / article" link field on an *existing* media item (set via the curator/member upload form, validated by `externalUrlValidator`) | n/a | n/a | rides its host item | adjunct link only — NOT a standalone embed/video |
| **B. `freestyle_trick_source_links.external_url`** | Curated per-trick **provenance** (footbag.org showmove URLs via script 20 / `scraped_footbag_moves.csv`); carries `asserted_adds/notation` + notes | ❌ | ❌ | ✅ | ❌ — provenance is curator-internal (`freestyleService` does not expose it) |
| **C. gallery `externalLinks`** | Named-gallery "see also" links (gallery sidecars) | ❌ | ❌ | gallery-scoped | gallery page only |

`externalUrlValidator` (used by A and the boot scan) is **host-agnostic** — it allows any
SSRF-safe http/https URL, so footbag.org / footbagspot URLs pass. There is no host allowlist
blocking them.

## What works now

- **Path D represents all 8 requirements** for a public trick-page instructional video, as long as
  the video is reachable as **youtube, vimeo, or s3**. "External URL" is satisfied by the youtube/
  vimeo URL itself, or — for a video hosted elsewhere — by re-hosting the file to S3
  (`video_platform='s3'`, CHECK-allowed) and recording the original footbag.org URL in
  `external_url` for provenance.
- The validator + boot-scan already accept and validate external URLs; `media_items.external_url`
  already stores them.

## What does not work

- **You cannot make a `media_item` whose *primary* is a raw non-youtube/vimeo/s3 URL.** The schema
  CHECK requires a `video` to be `video_platform ∈ {youtube,vimeo,s3}` + `video_id`. So embedding
  footbag.org's *own* legacy player URL directly as the public trick video has no path — but the
  goal doesn't need that (see "cleanest path").
- **B (source-links) is internal**, and **A (external_url)** is an adjunct reference, not a primary
  embed; neither surfaces a footbag.org demo as public trick-page video with tags/tier/kind.

## How James can curate these today (cleanest path)

Per footbag.org demo, branch on hosting:

1. **If the demo is YouTube/Vimeo-hosted** (footbag.org embeds YouTube, or the clip also exists on a
   YouTube channel): curate it through **Path D** exactly like any TT/AnzTrikz clip — a url-ref
   sidecar with `videoUrl` (the youtube/vimeo URL), `#<slug>` + `#freestyle` + `#trick` + a source
   tag, tier via `source_id`, kind via `#kind_demo`. Fully supported, James-only data prep.
2. **If the demo is genuinely footbag.org-hosted (legacy file)**: download the file and re-host it
   to S3, then curate a **file-paired `s3` video** sidecar (Path D, `video_platform='s3'`) with the
   same tags; put the footbag.org page URL in `external_url` for provenance. Also supported — no
   schema change. (footbag.org is IFPA's own site, so re-hosting IFPA video to the IFPA platform is
   in-scope.)

In **both** cases the curation artifact is a normal curated sidecar (James-track). Registering a
`footbag_org` (or `footbagspot`) row in `media_sources` is a one-row addition, not a schema change.

## Is Dave involvement actually required?

- **No schema change is required**, so no Dave schema coordination.
- **James** owns the data prep: candidate manifest, sidecars, source-tag whitelisting in
  `_trick_tag_invariant.py`, S3 upload in **dev** (local mediaStorageAdapter).
- **Dave** is only needed for the **staging/prod seed run** (`seed_fh_curator` is Dave-owned) and
  **prod S3 storage** — the same hand-off as every other curated-media batch. That's "run the
  seeder," not "lift a block" or "change the schema."

So the earlier "Dave must lift the external-link block" framing was wrong: there is no block to lift
for this goal; it's the ordinary curated-media hand-off.

## The 13 footbag.org demo candidates — hosting RESOLVED

Resolved by reading each move's `footbag.org/newmoves/showmove/{id}` page directly. **Result is
uniform: all 13 demos are legacy footbag.org-hosted video files; none is YouTube/Vimeo.** So the
per-clip "branch on hosting" collapses — **every candidate takes Path-D-via-S3 (download + re-host
to S3)**; Path-D-direct does not apply to any of them. Proposed curation metadata is unchanged
(tier = demonstration; kind = `#kind_demo`; tags `#<slug> #freestyle #trick #footbag_org`).

The clips live in two footbag.org sub-archives: the newer "media/42" `.mov` batch (thumbnails under
`/media/.thumb/42/`) and the older "eniac" archive (`/video/eniac/moves/`). 17 clips across 13 moves
(4 moves carry two clips).

| trick slug | footbag.org move | ADD | showmove | clips | gallery file(s) (sub-archive) |
|---|---|---|---|---|---|
| butterfly-swirl | Butterfly Swirl | 4 | 91 | 2 | `butterfly-swirl-ales.mov`, `butterfly-swirl-ales2.mov` (media/42) |
| double-over-down | Double-Over Down | 4 | 97 | 2 | `double-over-down-ales.mov` (media/42) + `d-over-down-ahren` (eniac) |
| down-double-down | Down Double-Down | 4 | 98 | 1 | `down-double-down-ales.mov` (media/42) |
| flurry | Flurry | 4 | 110 | 1 | `flurry-tu` (eniac) |
| high-plains-drifter | High Plains Drifter | 4 | 112 | 1 | `high-plains-drifter-ales.mov` (media/42) |
| paradon | Paradon | 4 | **120** | 1 | `paradon-both-ales.mov` (media/42) |
| paradox-double-leg-over | Paradox Double Leg Over | 4 | 95 | 1 | `p-d-legover-ahren` (eniac) |
| paradox-whirl | Paradox Whirl | 4 | 144 | 1 | `paradox-whirl-ales.mov` (media/42) |
| symposium-double-leg-over | Symposium Double Leg Over | 4 | 96 | 2 | `symposium-dlo-ales.mov`, `symposium-dlo-ales2.mov` (media/42) |
| symposium-eggbeater | Symposium Eggbeater | 4 | 109 | 2 | `symposium-eggbeater-ales.mov`, `symposium-eggbeater-ales2.mov` (media/42) |
| fog | Fog | 5 | 161 | 1 | `fog-eric` (eniac) |
| barraging-osis | Barroque (baroque) | 5 | 152 | 1 | `barraging-torque-ahren` (eniac) |
| hop-over-swirl | Hop Over Swirl | 4 | 113 | 1 | `hop-over-swirl-ales.mov` (media/42) |

Three flags for manifest-building:

1. **ID correction:** candidate `paradon` is showmove **120 (Paradon)**, not **172 (Paradon
   Swirl)** — 172 is a different move (it was the value carried in `james_adjudications.csv`).
2. **Source label vs. slug mismatch** on two eniac clips: move 152 "Barroque" hosts a clip titled
   "Barraging Torque" (`barraging-torque-ahren`); move 161 "Fog" is titled "The Fog" (`fog-eric`).
   The manifest needs an explicit slug↔gallery-file column; do not derive the file name from the slug.
3. **Contributor names are present** (Ales Zelinka, Ahren Gehrman, Tu Vu, Eric Wulff). Per the
   no-individual-names-on-freestyle-public-pages rule they belong in curation metadata / provenance
   only, never in the public Reference Media block.

**Raw asset URLs CONFIRMED.** The `/gallery/show/<file>` popup is just a shell pointing at a concrete
`.mov`. Two deterministic patterns, both HTTP 200 / `video/quicktime`:

- media/42 batch: `http://www.footbag.org/media/42/<file>.mov`
- eniac batch: `http://www.footbag.org/video/eniac/moves/<slug>.mov` (gallery slug carries no
  extension, but the asset is `<slug>.mov`)

Spot-checked downloadable: `hop-over-swirl-ales.mov` (156 KB), `fog-eric.mov` (887 KB). All 17 raw
URLs are mechanically derivable from the gallery-file column above. Nothing further blocks the S3
re-host hand-off; next action is to build the curated candidate manifest.

## Missing link (only if a future requirement appears)

A schema change would be warranted **only** if the curator wants to embed a raw external URL as the
*primary public video* without youtube/vimeo hosting and without re-hosting to S3 — i.e. a new
`video_platform='external'` (or an external-link media kind). The current 8 requirements do **not**
need this, so no schema change is proposed now.

---

### Provenance
Read-only investigation of `seed_fh_curator.py` (url-ref + file-paired sidecar paths; youtube/vimeo
gate at ~695, externalUrl field at ~1274), `database/schema.sql` (`media_items` video CHECK,
`freestyle_trick_source_links`), `src/lib/externalUrlValidator.ts` (host-agnostic), `externalUrlBootScan.ts`,
`20_link_footbag_org_sources.py`, and the trick-detail Reference Media path in `freestyleService.ts`.
Candidate set from the moves-on-video reconciliation. No code, schema, or data change.
