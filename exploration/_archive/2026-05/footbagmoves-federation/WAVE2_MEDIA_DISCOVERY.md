# Wave-2 Media Discovery (W2c-A)

Date: 2026-05-11. Status: discovery + curator priority guidance only. No `freestyle_media_links` rows added.

Sibling artifacts: `WAVE2_MEDIA_TARGETS.md` (W2b inventory; this artifact extends with curator-action specifics).

Per `feedback_gallery_dave_track.md`: media tagging is Dave's track. This W2c-A discovery surface flags candidate media without proposing edits to Dave's curation surface.

---

## 1. FM evidence summary

| Row | FM video flag | Notes |
|-----|:-:|-------|
| Matador | yes | FM has a hosted video for Matador-as-Nuclear-Butterfly. Also has IFPA-record (display match): a record-holder exists in `freestyle_records` under the slug. |
| Phoenix | yes | FM has a hosted video. Also has IFPA-record display match. |
| Tripwalk | yes | FM has a hosted video. No IFPA record. |
| Mind Bender | no | No FM video. No IFPA record. |
| Legeater | no | No FM video. No IFPA record. |
| Spinal Tap | no | No FM video. No IFPA record. |

3 of 6 carry FM video evidence; 2 of those 3 also have IFPA record-holder pages.

---

## 2. Curator priorities (when W2c-C is approved)

### 2.1 Priority A -- flagship pages with both video paths

**Matador**:
- Path 1: FM-hosted video. Federation-not-adoption posture means using a non-FM-source preferred. Tag if no TT / AnzTrikz coverage exists.
- Path 2: IFPA record-holder video (in `freestyle_records`). Already in DB; should appear in the Passback Records table. Tag a `#matador` link to the record holder's clip if the holder's video coverage exists.
- Path 3: TT inventory cross-check. Run `yt-dlp --flat-playlist --dump-json @WorldFootbag` and grep for "matador" or "nuclear butterfly" in any of the 42 TT lesson titles.

**Phoenix**:
- Path 1: FM-hosted video. Same federation-not-adoption framing as Matador.
- Path 2: IFPA record-holder video. Tag if available.
- Path 3: TT inventory cross-check for "phoenix" or "pixie ducking butterfly".

### 2.2 Priority B -- FM video only

**Tripwalk**:
- Path 1: FM-hosted video.
- Path 2: TT inventory cross-check for "tripwalk" or "quantum butterfly".
- No IFPA record-holder. Page ships empty Passback Records section.

### 2.3 Priority C -- media-empty (render empty state)

Mind Bender, Legeater, Spinal Tap:
- No FM video evidence.
- TT inventory cross-check is the curator's only path. If any TT lesson mentions one of these tricks (by display name or decomposition), tag it.
- If TT silence is total, ship empty Reference Media section + the existing trick-detail template renders gracefully.

---

## 3. Source-tier registration

Per `src/services/freestyleService.ts` `SOURCE_TIER`:
- `tt_youtube` -> TUTORIAL (already registered)
- `anz_trikz` -> TUTORIAL (already registered)
- `footbag_finland` -> DEMONSTRATION (already registered)
- `flipsider` -> DEMONSTRATION (already registered)
- `passback_records` -> RECORD (already registered)

If curator chooses FM-hosted video tagging, a new source entry is needed: `fm_youtube` (or whichever platform FM uses). This is a service-layer edit per the gate `feedback_gallery_dave_track.md` -- coordinate with Dave's track before adding.

Alternative (preferred per federation-not-adoption): find equivalent video on a TUTORIAL-tier source (TT, AnzTrikz) and tag that one. No source-table changes needed.

---

## 4. TT inventory cross-check pattern

Per `reference_worldfootbag_channel.md`:
- WorldFootbag YouTube channel has exactly 42 TT lessons (#1-#42).
- Full inventory dumpable via `yt-dlp --flat-playlist --dump-json` against the channel.
- `tt_youtube` source already registered.

Recommended curator action when W2c-C is approved:
1. Dump TT inventory.
2. For each of the 6 Wave-2 slugs, grep TT video titles for the display name or any decomposition variant.
3. For matches: tag the TT video to the trick's slug as a TUTORIAL-tier reference media row.
4. For non-matches: leave the page media-empty; no further action.

Note: this query is also relevant to broader Wave-1 + Wave-2 + future-wave coverage; if curator runs it, results should be cached so each wave does not re-query the API.

---

## 5. Tag-cadence recommendation

If Matador / Phoenix get tutorial media tagged, the resulting trick-detail pages would show the cleanest possible state for the UX2-pilot promotion path (per `WAVE2_EDITORIAL_ENRICHMENT_PLAN.md` §3.1). The recommendation order:

1. Tag Matador media first (highest editorial yield).
2. Tag Phoenix media second.
3. Tag Tripwalk media (no IFPA record so lower yield).
4. Cross-check TT inventory for Mind Bender / Legeater / Spinal Tap (low expected hit rate).

This is a curator pass, not an automation. Per `feedback_gallery_dave_track.md` coordinate with Dave's gallery-edit-tool track before tagging.

---

## 6. Preservation

- Federation-not-adoption: FM video presence is evidence of existence, not a tagging directive. Curator decides whether to use FM-hosted video or find an IFPA-side equivalent.
- No source-table edits in this discovery doc. Adding `fm_youtube` to `SOURCE_TIER` is a separate decision gated by Dave's track.
- Restraint-first: media-empty rows continue to render the existing empty-state UI. No template changes.

---

## 7. Out of scope

- No `freestyle_media_links` row inserts (W2c-C, gated).
- No source-tier registry additions.
- No TT inventory dump from this agent.
- No edits to `src/services/freestyleService.ts` `SOURCE_TIER` or `SOURCE_LABELS`.
- No `gallery-edit-tool` interactions.

---

## 8. Decision points

1. Approve W2c-C (media tagging) for Matador / Phoenix / Tripwalk only?
2. Coordinate with Dave on gallery-edit-tool status before starting any tagging pass.
3. Decide whether `fm_youtube` source-tier entry is acceptable, or whether tagging is restricted to existing IFPA-side sources (TT, AnzTrikz, passback_records).
