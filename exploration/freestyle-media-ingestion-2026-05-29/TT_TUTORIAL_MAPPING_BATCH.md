# Media-track handoff: wire TT tutorials as primary on the foundational trick cards

**Owner:** media / gallery track (`media_links.csv` `is_primary` and/or `freestyle_tricks.featured_media_id`; needs a DB rebuild). Prepared from the doctrine track; not applied here.

## Why

Across the ~50 most important beginner tricks, **`featured_media_id` is NULL for every one** of them, so no beginner card surfaces a primary "watch the tutorial" video, even though the Tricks-of-the-Trade series covers most of the basics and 31 TT videos are already loaded as assets.

## Authoritative mapping

`curated/freestyle_media/tt_roster.csv` already carries the TT number to trick mapping in its `expected_trick_slug` column. Wire each loaded TT asset as the trick's primary tutorial per that column. Verify first whether the TT video already renders on the card via tags (gallery), so this sets the primary slot rather than duplicating.

## Ready to wire (dict entry exists, lesson is a real trick)

| TT | trick | TT | trick | TT | trick |
|---|---|---|---|---|---|
| 2 | toe-stall | 16 | legover | 28 | osis |
| 3 | inside-stall | 17 | mirage | 29 | double-around-the-world |
| 4 | outside-stall | 18 | clipper-stall | 30 | double-leg-over |
| 5 | knee-stall | 19 | hop-over | 31 | symposium-mirage |
| 7 | flying-outside | 22 | sole-stall | 32 | paradox-mirage |
| 8 | flying-inside | 24 | cross-body-sole-stall | 33 | drifter |
| 9 | clipper | 25 | pendulum | 35 | torque |
| 11 | cloud-stall | 26 | butterfly | 36 | spinning-osis |
| 12 | forehead-stall | 27 | whirl | 37 | swirl |
| 13 | neck-stall | | | 38 | spinning-butterfly |
| | | | | 42 | symposium-whirl |

## Verify dict status first (roster flags "pending Red", but they appear active in the DB)

TT 6 (spin), 20 (flying-clipper), 21 (dragonfly-kick), 40 (da-da-curve), 41 (whirling-swirl). Wire once their dictionary status is confirmed.

## Blocked / skip

- TT 10 (sole-kick): roster says not yet in the dictionary; renders pending.
- TT 23 (squeeze): in the dictionary but base/category unspecified; confirm before wiring.
- TT 1 (Shoes): meta lesson, not a trick.
- TT 34: unconfirmed lesson, no video id.

## Already done (this session)

- TT 14 (Around The World) -> around-the-world-kick (primary)
- TT 15 (Around The World Toe Stall) -> around-the-world (primary)

See TT_ATW_MAPPING_CORRECTION.md for that change.
