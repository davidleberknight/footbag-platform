# Ticket A4 — Record-Video → Trick-Page Bridge Candidates

**Analysis only. No bulk linking performed** (per the ticket). This is the candidate inventory + confidence classification that a follow-up implementation works from.

## Source
`freestyle_records` holds **204 rows, all with `video_url`** (+ `video_timecode`), keyed by free-text `trick_name` → **165 distinct names**. Trick pages surface media by exact tag join (`'#' || freestyle_tricks.slug = tags.tag_normalized`), so a record video reaches a trick page only when its name resolves to an active slug **and** a `media_items` RECORD row carries that `#slug`. Today only the 80 `passback_records` `media_items` clips surface that way; the other freestyle_records videos are stranded.

## Classification (165 distinct record names)

| Bucket | Count | Meaning | Disposition |
|---|---:|---|---|
| **Exact — already surfaced** | 51 | name → active slug, and a `passback_records` RECORD clip already exists on that trick | none (already on the page) |
| **Exact — bridge-ready** | 42 | name → active slug, but **no** `media_items` RECORD clip yet | **bridge:** create a RECORD sidecar |
| **Probable** | 20 | resolves to an active slug after stripping `(ss)`/`(op)`/`(same side)` qualifiers (qualifiers don't change slug) | **bridge:** create a RECORD sidecar on the base slug |
| **Record-category** | 4 | legitimate record category, not a `freestyle_tricks` row | route to a **Records surface**, never a trick page |
| **Review-needed** | 48 | named compound / abbreviation that doesn't resolve; many are real tricks under a different normalization or alias | per-name review (ALIAS/STRUCTURAL) before bridging |
| **Total** | 165 | | |

**High-confidence bridge candidates = 42 (exact, unsurfaced) + 20 (probable) = 62 names** ready for RECORD sidecars with little/no judgment.

## Probable (20) — qualifier strip → base slug (high confidence)
`Assassin (ss)`→assassin · `Clipper Stall (ss)`→clipper-stall · `Double Leg Over (ss)`→double-leg-over · `Dyno (op)`→dyno · `Eclipse (ss)`→eclipse · `Eggbeater (ss)`→eggbeater · `Fairy Double Leg Over (ss)`→fairy-double-leg-over · `Fairy Legover (ss)`→fairy-legover · `Fairy Pickup (ss)`→fairy-pickup · `Flail (ss)`→flail · `Paste (ss)`→paste · `Pickup (ss)`→pickup · `Pigbeater (ss)`→pigbeater · `Pixie Double Pickup (ss)`→pixie-double-pickup · `Rev Whirl (op)`→rev-whirl · `Smear (ss)`→smear · `Smog (ss)`→smog · `Smudge (ss)`→smudge · `Symposium Mirage (ss)`→symposium-mirage · `Symposium Swirl (op)`→symposium-swirl

## Record-category (4) — Records surface, NOT trick pages
`2-Bag Juggle`, `Unique 3-Dex`, `Unique Beastly`, `Unique Fearless`. These are PassBack record categories with no canonical trick slug (per the curated-media skill's RECORD_CATEGORY rule); they belong on a Records/Consecutive surface. They should be staged in `passback_record_categories.csv`, not coerced into the trick pipeline.

### Case study — 2-Bag Juggle
Its record video (`youtu.be/XeJHACfaU2Q`) exists in `freestyle_records` but 2-bag juggle is a juggling/consecutive discipline with **no freestyle trick page**, so it has nowhere to surface via the slug join. It is the canonical example of why the bridge needs a **Records destination** (Part D, Card 2) for discipline-level records, in addition to the per-trick RECORD tier. Do **not** invent a `2-bag-juggle` trick slug to host it.

## Review-needed (48) — resolve per-name before bridging
Many are real tricks under a different normalization (e.g. `Stepping Ducking …` modifier compounds, `Gyro Symp Swirl`, `Reverse Swirl`, `Toe …` variants) and will resolve via ALIAS/STRUCTURAL expansion; others (`DDD`, `DSO`, `PLO`, `Merlin`, `Void`, `Infinity`) are abbreviations or names with no current active slug.

`Alpine PLO, Atomic Pickup, Backside Magellan, Backside Paste, Blazing Butterfly, Blink, Blurry Drifter, DDD, DSO, Double Dyno, Double Fairy, Double Whip, Enterrage, Fracture, Frantic Legover, Grifter, Gyro Symp Swirl, Gyro Toe, Infinity, Infinity Swirl, Locomotion, Merlin, Motion, PLO, Pixie DSO, Pixie DSO (ss), Reverse Swirl, Solestice, Spanishfly, Spinning Symp Swirl, Stepping Ducking Blurry Whirl, Stepping Ducking Magellan, Stepping Ducking Paste, Stepping Ducking Pigbeater, Stepping Ducking Smog, Stepping Ducking Smudge, Swifter, Toe Blur, Toe Ducking Legover, Toe Gyro Mirage, Toe Spinning Toe, Triple Orbit, Void, Weaving Magellan, Weaving Pigbeater, Whirlygig, Whirr, Zulu Clipper`

These go to a `<source>_review_queue.csv` for per-name adjudication — never force-matched to a guessed slug.

## Implementation-ready follow-up (not done here)
1. **Bridge the 62 high-confidence candidates** — emit one RECORD-tier `media_items` row per name onto its slug, through the curated pipeline (sidecar → `seed_fh_curator`), **not** by editing `freestyle_records` or direct DB writes. Same trick may legitimately hold a TT tutorial AND a record clip.
2. **Records surface** — build Part D Card 2 to host the 4 record-categories + discipline-level records (2-Bag Juggle) that have no trick page.
3. **Review queue** — adjudicate the 48 review-needed names (alias/structural) before any bridging.

## Reproduce
```sql
-- exact vs no-exact
WITH r AS (SELECT DISTINCT trick_name, lower(replace(replace(trick_name,' ','-'),'''','')) cand
           FROM freestyle_records WHERE video_url IS NOT NULL)
SELECT CASE WHEN ft.slug IS NOT NULL THEN 'exact' ELSE 'no-exact' END, count(*)
FROM r LEFT JOIN freestyle_tricks ft ON ft.slug=r.cand AND ft.is_active=1 GROUP BY 1;
-- probable: strip ' (ss)'/' (op)'/' (same side)' then re-test slug existence (see audit script)
```
