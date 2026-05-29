# High-value media exemplar corpus + coverage audit (2026-05-29)

Read-only audit and editorial selection. **No `media_items` written, no galleries touched, no
service code, no ingestion tooling run.** This is an ontology/editorial data candidate — the clean
handoff input for Dave's gallery-edit-tool track. Source: read-only queries against
`database/footbag.db`; coverage as of 2026-05-29.

Selection principle (curator-stated): weight **ontological multi-role significance** over ADD or
obscurity. A trick like `mirage` earns an exemplar because it is simultaneously a dex archetype, a
topology root, a family generator, a pedagogical primitive, and a modifier host — not because of its
ADD. An obscure 7-ADD compound does not.

## Coverage audit

Coverage here means **direct dedicated `#slug` media** only: a video tagged for that specific trick
as its subject. That is the narrowest of three coverage types (see "Coverage types" below), so these
metrics deliberately **undercount** real pedagogical reach.

- 514 active tricks. **86 (16%)** have a direct dedicated video; **49 (9%)** a direct dedicated
  TUTORIAL-tier clip (tt_youtube / anz_trikz / footbagspot / foundations / polini / everything-footbag).
- These percentages count only direct `#slug` tags. They do NOT count **embedded** instructional
  coverage (a trick taught inside another trick's tutorial) or demo/reference appearances, so true
  pedagogical coverage is meaningfully higher than 9%.
- **Core atoms (12):** 11 of 12 carry a direct dedicated tutorial clip. The 12th, **`orbit`**, has
  no dedicated clip but IS embedded-covered inside the TT "Around The World" tutorial (TT #14/#15).
  It is NOT a true zero-media gap (correction, 2026-05-29).
- **Genuine direct-coverage gaps / weak spots among foundational nodes:**
  - NO direct media, no obvious embedded home: `flurry` (4-ADD legover family generator).
  - DEMO/RECORD only (no tutorial): `blender`, `barrage`, `mobius` (+ `dyno`, `smear` runners-up).
  - Embedded-covered, dedicated clip optional later: `orbit` (inside ATW).

## Coverage types (audit refinement, 2026-05-29)

The single `#slug` metric conflates three different things. Future audits and any future "tutorial
available" affordance must distinguish:

1. **Direct dedicated coverage** — a clip tagged `#<slug>` that teaches or shows that trick as its
   subject. (What the 16% / 9% metrics measure.)
2. **Embedded instructional coverage** — the trick is taught *inside* another trick's tutorial:
   `orbit` inside ATW; `toe-stall` inside any toe-terminated lesson; a component inside a compound
   lesson such as TT #15 "Around The World Toe Stall" or TT #31 "Symposium Mirage Stall".
3. **Demo / reference coverage** — the trick appears in a performance/record clip with no teaching
   intent (most `passback_records` / `shred_global` entries).

The current metric sees only (1), so it undercounts (2) and (3). This almost certainly affects other
foundational primitives and progression concepts, not just orbit: any atom or component reliably
demonstrated inside a compound's tutorial is pedagogically covered without a dedicated tagged item.

**Future relationship layer (proposed, not built):** a `teaches` / `implies` / `components-covered`
edge from a media item to the tricks it covers *indirectly*, distinct from the direct `#slug` tag.
This is another linkage type the flat tag model does not express, so it belongs alongside the
linkage-semantics work in `ARCHITECTURE.md` §3. It would let `orbit` register as embedded-covered via
the ATW tutorial without a misleading dedicated `#orbit` tag, and would correct the undercount above.
Do not build it now; record it as the next design direction for the media-graph relationship layer.

## The exemplar corpus (18)

Status: COVERED = a tutorial-tier exemplar already exists; THIN = single tutorial clip on a pivotal
node; UPGRADE = only demo/record exists, wants a tutorial; GAP = no media at all.

| # | Slug | Ontological roles | ADD | Coverage | Action |
|---|---|---|---|---|---|
| 1 | mirage | dex archetype · topology root · family generator · pedagogical primitive · modifier host | 2 | COVERED (anz+tt) | confirm gold exemplar |
| 2 | illusion | direction-mirror of mirage · root of the `illusioning` operator (just accepted) | 2 | THIN (anz only) | confirm; pivotal post-illusioning ruling |
| 3 | whirl | rotational dex family generator | 3 | COVERED (anz+tt) | confirm |
| 4 | osis | spin/clipper family generator (parent of torque, blender) | 3 | COVERED (tt) | confirm |
| 5 | butterfly | out-dex family generator | 3 | COVERED (tt) | confirm |
| 6 | legover | legover family generator | 2 | COVERED (tt+anz) | confirm |
| 7 | clipper-stall | cross-body surface anchor · drifter family root | 2 | COVERED (tt) | confirm |
| 8 | swirl | reverse-dex family | 3 | COVERED (tt+anz) | confirm |
| 9 | toe-stall | primal stall / entry vocabulary | 1 | COVERED (tt+anz) | confirm |
| 10 | around-the-world | iconic dex primitive (ATW) | 2 | COVERED (tt) | confirm |
| 11 | pickup | pickup family root | 2 | COVERED (anz) | confirm |
| 12 | orbit | core atom (one of the 12) | 2 | EMBEDDED (TT ATW #14/#15) | optional dedicated clip later (not a gap) |
| 13 | paradox-mirage | paradox-operator exemplar · BOP component (glossary-defined run concept) | 3 | THIN (tt only) | confirm; consider 2nd clip |
| 14 | symposium-mirage | symposium-operator exemplar · no-plant timing | 3 | COVERED (tt) | confirm |
| 15 | barrage | `barraging`-operator host · double-dex mirage | 3 | **UPGRADE** | ingest tutorial (demo exists) |
| 16 | blender | whirling-osis · osis-family generator · modifier host | 4 | **UPGRADE** | ingest tutorial (demo exists) |
| 17 | flurry | 4-ADD legover-family generator (flurricane parent) | 4 | **GAP** | **ingest tutorial** |
| 18 | mobius | torque-family flagship (gyro-torque folk) · famous movement-language exemplar | 5 | **UPGRADE** | ingest tutorial (demo exists) |

Deliberately excluded (runners-up, restraint): `dyno`, `smear`, `drifter` (already covered),
`eggbeater` (already covered), `torque` (already covered). The corpus anchors roles, not every node.

## Candidate packets (4 ingestion/upgrade items; orbit deferred)

Each packet is a data candidate for Dave's gallery-edit-tool. Proposed tags assume the taxonomy
module (`ARCHITECTURE.md` §6, `#kind-*` / `#family-*` conventions) lands first. **URL is left blank
on purpose:** the verify-external-URLs forever-rule forbids extrapolated URLs, so the curator/Dave
must supply and HTTP-confirm each clip. I am not guessing video IDs.

```
slug: orbit            | DEFERRED (not a gap) | embedded-covered inside TT ATW (#14/#15)
  optional dedicated #orbit clip later IF a clear orbit-subject tutorial exists; no priority; do not
  ingest now. Better resolved by the future teaches/components-covered layer than a dedicated tag.

slug: flurry           | gap   | proposed tags: #curated #flurry #family-legover #kind-tutorial
  tier: TUTORIAL preferred | source: TBD | note: 4-ADD legover family generator (flurricane parent)
  url: NEEDS curator-supplied + HTTP-verified

slug: barrage          | upgrade | proposed tags: #curated #barrage #family-barrage #kind-tutorial
  tier: TUTORIAL (demo exists: shred_global) | source: TBD (anz_trikz / footbagspot likely)
  note: barraging-operator host; double-dex mirage | url: NEEDS curator-supplied + HTTP-verified

slug: blender          | upgrade | proposed tags: #curated #blender #family-osis #kind-tutorial
  tier: TUTORIAL (demo exists: flipsider_footbag) | source: TBD
  note: whirling-osis; osis-family generator + modifier host | url: NEEDS curator-supplied + HTTP-verified

slug: mobius           | upgrade | proposed tags: #curated #mobius #family-torque #kind-tutorial
  tier: TUTORIAL (demo exists: footbag_finland) | source: TBD
  note: torque flagship; famous movement-language exemplar | url: NEEDS curator-supplied + HTTP-verified
```

For the 13 COVERED/THIN exemplars, no ingestion is needed: the existing tutorial-tier clip is the
canonical reference. When the taxonomy module lands, they should be tagged `#kind-tutorial` +
`#family-<fam>` so the future trick-page "tutorial available" affordance reads cleanly — a tagging
pass on Dave's track, not new ingestion.

## Handoff boundary

This document defines WHICH exemplars matter and WHY, with full proposed metadata. The remaining
steps are Dave's gallery/media track and require his tool + HTTP-verified URLs:

1. Source + HTTP-verify a clip for each of the 4 active items (no URL extrapolation); orbit is
   deferred (embedded-covered).
2. Create the `media_items` rows (system curator uploader, `source_id`, `#curated`).
3. Apply the linkage/kind tags once the taxonomy module (`ARCHITECTURE.md` §6) is approved.

Ontology/editorial governance (this track) ends at the manifest; gallery/media infrastructure
(Dave's track) begins at the write. Clean seam, no overlap.
