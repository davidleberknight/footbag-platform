# Wave-2 Tier-1 Media-Readiness Inventory

Date: 2026-05-11. Status: inventory only; no media tagging executed.

Sibling artifacts: `WAVE2_IMPLEMENTATION_PLAN.md`, `WAVE2_INSERTION_MATRIX.csv`.

Wave-2 Tier-1 ships semantic-first per the implementation plan. Every row's Reference Media section omits initially. This document inventories where curator-tagged media could land in a later pass and which rows have FM video evidence that can seed tutorial-tile curation.

---

## 1. Inventory

| Row | FM video flag | FM video source | IFPA record (display match) | Curator action priority |
|-----|:-:|-----------------|:-:|:-----------------------:|
| Matador | yes | footbagmoves-5adds.txt | yes | **1 (flagship)** |
| Phoenix | yes | footbagmoves-5adds.txt | yes | **1 (flagship)** |
| Tripwalk | yes | footbagmoves-4adds.txt | no | 2 |
| Mind Bender | no | n/a | no | 3 (media-empty) |
| Legeater | no | n/a | no | 3 (media-empty) |
| Spinal Tap | no | n/a | no | 3 (media-empty) |

Net: 3 of 6 Tier-1 rows have FM-side video evidence; 2 also carry IFPA record-page display matches (Matador, Phoenix).

---

## 2. Tier-1 curator priorities (post-insertion)

### Priority 1 (flagship media pairing)

**Matador** -- Nuclear+Butterfly. Has FM video evidence + IFPA record holder match. Highest-yield media-tagging target:
- Tag the FM-evidence video as a tutorial/demonstration tile (curator tier-classification needed).
- Verify the IFPA record-page video exists and is taggable to `#matador`.
- Pair tagging with operational-notation seeding for an editorially-complete first impression.

**Phoenix** -- Pixie+Ducking+Butterfly. Same shape as Matador (FM video + IFPA record match). 3-modifier compound is editorially distinctive; high pedagogical value when paired with tutorial media.

### Priority 2 (FM video only)

**Tripwalk** -- Quantum+Butterfly. FM video evidence; no IFPA record-page match (no Tripwalk-named record holder in the dictionary). Lower curator yield than Priority 1 but worth tagging.

### Priority 3 (media-empty; render the empty state)

**Mind Bender**, **Legeater**, **Spinal Tap** -- no FM video evidence. These render the standard "Tutorials and demonstrations referencing this trick will appear here as they are added." legacy-template empty-state (or, if promoted to UX2 pilot later, the dashed-border featured-media-empty card).

The UX2 pilot (`feedback`: `project_freestyle_state.md`) already validates the empty state. No design work needed.

---

## 3. Source-tier classification (when tagging happens)

Per `src/services/freestyleService.ts` `SOURCE_TIER` registry:
- `tt_youtube` -> TUTORIAL (WorldFootbag TT inventory; see `reference_worldfootbag_channel.md`)
- `anz_trikz` -> TUTORIAL
- `footbag_finland` -> DEMONSTRATION
- `passback_records` -> RECORD (excluded from Reference Media; renders in Passback Records table)

The trick-detail template auto-splits Reference Media into "Tutorials" and "Demonstrations" subsections based on `tierOf(source_id)`. No service-layer changes needed for Wave-2.

---

## 4. Cross-reference with existing curator inventory

Per `reference_worldfootbag_channel.md`: WorldFootbag YouTube channel has exactly 42 TT lessons (#1-#42). If any TT lesson covers a Tier-1 trick (Matador / Phoenix / Mind Bender / Tripwalk / Legeater / Spinal Tap), it becomes a Priority-1 tutorial-tile candidate.

Confirming TT coverage requires running `yt-dlp --flat-playlist --dump-json @WorldFootbag` and grep-checking the title list against the 6 slugs. Not done in W2b planning; flagged as a curator follow-up.

The 42 TT lessons are already indexed in `freestyle_media_links` to existing IFPA tricks (per `project_gallery_organization.md`). If a TT lesson title contains "matador" or "phoenix" etc., it may already be tagged to a related trick; curator can re-tag or add an additional link for the Wave-2 row.

---

## 5. Federation-not-adoption posture (media-specific)

- FM thumbnails are NOT auto-imported. The FM video evidence is a flag indicating "FM hosts a video for this trick"; it does NOT translate to a `freestyle_media_links` row.
- If curator chooses to use the FM-hosted video, the link goes through the existing video-facade partial with the FM source-tier registered (currently not in `SOURCE_TIER`; would need a new source entry `fm_youtube` or similar).
- Alternative path: curator finds an equivalent video on a TUTORIAL-tier source (TT, AnzTrikz) and tags that one. This is the preferred approach per federation-not-adoption.

---

## 6. Out of scope for this inventory

- Actual media tagging. Wave-2 Tier-1 ships semantic-first; media-tagging is a separate curator pass.
- New `SOURCE_TIER` entries for FM video. Deferred until a curator decides to use FM-hosted media.
- TT inventory cross-check against the 6 Tier-1 slugs. Manual step; not in W2b.
- Media coverage QC report (`24_qc_freestyle_media_coverage.py`). Run after curator media-tagging passes; not relevant to W2b.
