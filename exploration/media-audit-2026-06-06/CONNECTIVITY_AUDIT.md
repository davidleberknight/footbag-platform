# Part A — Media Connectivity Audit

Model recap: `media_items` (unified) ← `media_tags` → `tags`. A media item is "linked to a trick" when it carries a tag whose `tag_normalized` = `#<trick-slug>` of an `is_active=1` trick, plus the marker `#trick`. Trick-detail surfaces media bucketed by `SOURCE_TIER` (`tierOf(source_id)` → TUTORIAL / DEMONSTRATION / RECORD); a source not in `SOURCE_TIER` returns `null` and is **not** surfaced. Competition record videos live separately in `freestyle_records.video_url` (keyed by text `trick_name`).

## A1. Per-source inventory (active `media_items`)

| Source (`source_id`) | Items | `SOURCE_TIER` | Distinct tricks linked |
|---|---:|---|---:|
| passback_records | 80 | RECORD | 53 |
| tt_youtube (Tricks of the Trade) | 40 | TUTORIAL | 39 |
| passback_demos | 20 | DEMONSTRATION | 20 |
| shred_global | 15 | DEMONSTRATION | 15 |
| passback_basics | 14 | TUTORIAL | 14 |
| anz_trikz | 11 | TUTORIAL | (within 21*) |
| footbag_finland | 8 | DEMONSTRATION | 8 |
| passback_tutorials | 3 | **— none —** ⚠ | not surfaced |
| flipsider_footbag | 1 | DEMONSTRATION | 1 |
| _(no source_id)_ | 23 | n/a (null) | 13 (17 are `#trick`) ⚠ |

\*anz_trikz contributed to 21 distinct trick links in the broader join; the per-source video count is 11 (multiple tags per item).

**Registered-but-EMPTY sources (0 media_items)** — 11 of 20: `community_uploads_unresolved`, `curated_playlists`, `everything_footbag`, `footbag_foundations` (Erik Chan), `footbag_hof_archive`, `footbagspot_passback`, `footbagspot_tutorials`, `passback_youtube`, `polini_pointers`, **`tt1`**, **`tt2`** (the Kenny Shults DVDs). Several of these already have a `SOURCE_TIER` entry (footbagspot_tutorials, polini_pointers, footbag_foundations, everything_footbag, footbagspot_passback) — i.e. tier buckets defined for sources that have no media yet.

## A2. Exact issue lists

### Issue 1 — Untiered media is invisible on trick pages (linked but not surfaced)
- **17** `#trick`-tagged items have **no `source_id`** → `tierOf`=null → they never appear in the trick-detail Tutorial/Demo split.
- **`passback_tutorials`** (3 items) is **absent from `SOURCE_TIER`** → same outcome, despite being a named tutorial source.
- **Fix:** add `passback_tutorials: 'TUTORIAL'` to `SOURCE_TIER`; backfill `source_id` on the 17 sourceless `#trick` items (or assign a tier-bearing source). Cheap, unblocks already-linked media.

### Issue 2 — Record videos are stranded from trick pages
- `freestyle_records` holds **204** rows, **all** with `video_url` (+ `video_timecode`), keyed by **text `trick_name`**.
- Only **80** record clips exist as `media_items` (`passback_records`). ~**124** record videos are in `freestyle_records` but not in the unified media system, and reach a trick page only when `trick_name` happens to match a slug.
- **`2-Bag Juggle`** record → `https://youtu.be/XeJHACfaU2Q?t=…` exists in `freestyle_records`, but 2-bag juggle is a juggling/consecutive discipline with **no freestyle trick page**, so the video has nowhere to surface. (Note: `consecutive_kicks_records` has **no** video column at all — juggling/consecutive videos that do exist live only in `freestyle_records`.)
- **Fix:** (a) normalize `freestyle_records.trick_name` → slug and render the record clip on the matching trick page (RECORD tier already supports this); (b) for disciplines without a trick page (2-bag/3-bag juggle, consecutive net/golf), surface record videos on a Records/Consecutive surface instead of a trick page.

### Issue 3 — 82% of first-class tricks have no media
- **535 / 651** active tricks have zero linked media; only **116** have any. See `MEDIA_COVERAGE_MATRIX.md` for the value-ranked gap list.

### Issue 4 — Pinned-hero media unused
- `featured_media_id` is set on **0** tricks. The schema supports a curated hero clip per trick but nothing uses it — a zero-ingestion surfacing win (pin the best existing clip).

### Issue 5 — Empty source registrations imply unfinished ingestion
- `tt1`/`tt2` (the actual DVDs) are registered with `creator='Kenny Shults'` but hold **0** items — all TT media currently rides `tt_youtube`. `footbag_hof_archive`, `passback_youtube`, `curated_playlists`, `everything_footbag`, `polini_pointers`, `footbag_foundations` are registered shells awaiting ingestion.

## A3. Reproducing these numbers
```sql
-- per-source active item counts
SELECT coalesce(source_id,'(none)'), count(*) FROM media_items
WHERE moderation_status='active' GROUP BY source_id ORDER BY 2 DESC;
-- tricks with >=1 linked media
SELECT count(DISTINCT ft.slug) FROM media_tags mt JOIN tags g ON g.id=mt.tag_id
JOIN freestyle_tricks ft ON ft.slug=substr(g.tag_normalized,2) WHERE ft.is_active=1;
-- untiered #trick media (not surfaced)
SELECT coalesce(source_id,'(none)'),count(*) FROM media_items
WHERE moderation_status='active' AND id IN
 (SELECT mt.media_id FROM media_tags mt JOIN tags g ON g.id=mt.tag_id WHERE g.tag_normalized='#trick')
 AND coalesce(source_id,'x') NOT IN (/* the 13 SOURCE_TIER ids */) GROUP BY source_id;
-- record videos vs unified
SELECT count(*), sum(video_url IS NOT NULL) FROM freestyle_records;  -- 204 / 204
```
