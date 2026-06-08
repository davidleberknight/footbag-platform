# Media / Record Linkage Integrity Audit (Part 2)

Read-only. Checks that media and records resolve to canonical trick slugs or wired aliases, with the 2-bag-juggling mismatch as the worked case.

## Summary
Curated `media_tags` are essentially clean. The real gap is `freestyle_records`, which links to tricks by `trick_name` through `trickNameToSlug` (`src/services/freestyleRecordShaping.ts:4`), a pure lowercase-slugify that neither strips side qualifiers nor maps aliases. 71 distinct record names do not resolve to an active slug or alias.

## Worked case: 2-bag-juggling (confirmed)
- Trick exists and is active: `2-bag-juggling` (and `3-bag-juggling`).
- Aliases wired today: `two-bag-juggling`, `two-bag` -> `2-bag-juggling`; `three-bag-juggling`, `three-bag` -> `3-bag-juggling`.
- The record row: `freestyle_records` id `6c853c1d...`, `record_type='trick_consecutive_juggle'`, `trick_name='2-Bag Juggle'`, video `https://youtu.be/XeJHACfaU2Q?t=103`.
- `trickNameToSlug('2-Bag Juggle')` -> `2-bag-juggle`, which is **not** the slug and **not** an alias. So the record's `trickHref` points at `/freestyle/tricks/2-bag-juggle` (a 404), and the `2-bag-juggling` trick page never shows the record. The missing wire is `2-bag-juggle -> 2-bag-juggling`. The today-added aliases used the `two-bag` spelling, not the `2-bag` digit spelling the record uses.

## Record-to-trick resolution: 71 unresolved names, by class

| class | count | fix path |
|---|---|---|
| Juggle (the worked case) | 1 | alias wire `2-bag-juggle` (+ `3-bag-juggle` preventively) |
| Qualifier-strip resolves | 20 | resolver fix: strip trailing `(ss)` / `(op)` / `(near)` / `(far)` before slugify |
| Abbreviations | 3 | review then alias wire (`DDD`, `DSO`, `PLO`) |
| Genuine compounds | 47 | review; coverage gap, not a linkage bug |

**Qualifier-strip (20), high confidence.** These resolve to a real slug once the side qualifier is removed, which the slug-normalization rule already says does not change the slug: `Clipper Stall (ss)` -> clipper-stall, `Double Leg Over (ss)` -> double-leg-over, `Dyno (op)` -> dyno, `Eclipse (ss)`, `Eggbeater (ss)`, `Flail (ss)`, `Pickup (ss)`, `Paste (ss)`, `Smear (ss)`, `Smog (ss)`, `Smudge (ss)`, `Pigbeater (ss)`, `Assassin (ss)`, `Fairy Double Leg Over (ss)`, `Fairy Legover (ss)`, `Fairy Pickup (ss)`, `Pixie Double Pickup (ss)`, `Symposium Mirage (ss)`, `Symposium Swirl (op)`, `Rev Whirl (op)`.

**Abbreviations (3), review.** `DDD`, `DSO`, `PLO` are almost certainly `down-double-down`, a double-spin-osis variant, and a paradox-legover variant, but each needs a curator confirmation before an alias is wired. Do not guess the expansion.

**Genuine compounds (47), review (coverage, not linkage).** Record names for compound tricks that are not canonical dictionary entries: `Stepping Ducking Blurry Whirl`, `Atomic Pickup`, `Blazing Butterfly`, `Blurry Drifter`, `Double Dyno`, `Double Fairy`, `Frantic Legover`, `Gyro Symp Swirl`, `Infinity`, `Infinity Swirl`, `Locomotion`, and similar. These are not mis-wired; they are records for tricks the dictionary does not yet carry. They belong to the promotion sprint's coverage decisions, not this cleanup. (Note: `Infinity` / `Infinity Swirl` may resolve to barfly via the earlier infinity-to-barfly consolidation; flag for the review pass.)

## Curated media tags: nearly clean
Orphan scan over all `#`-prefixed `media_tags.tag_display` (excluding utility tags), checked against active slugs and aliases: only **2** unresolved.

| tag | media count | note |
|---|---|---|
| `#curated` | many | a source/utility tag, not a trick; should be whitelisted in the tag-invariant utility set rather than treated as trick-shaped |
| `#chinlone` | 1 | a stray non-trick term (a related sport), not a freestyle trick; review the single tagged item |

No media tag points at an inactive trick. No trick-shaped media tag is unresolved beyond these two.

## Other linkage surfaces
- `freestyle_media_links` (media_id -> entity_type/entity_id): **empty**. The live media-to-trick linkage runs entirely through `media_tags` (`#slug`), not this table. No juggling rows, no orphans here; the table is currently unused.
- Reciprocal direction: because the trick page resolves its records through the same `trickNameToSlug`, the qualifier and juggle misses are bidirectional - the record has no working trick link, and the trick page does not list the record. The resolver fix and the juggle alias close both directions at once.

## What is NOT broken
- Media badges on the dictionary derive from resolved `media_tags`; with tags essentially clean, badge coverage is consistent with media presence (the 2 orphan tags above are the only exceptions).
- Every media item resolves to an active trick except the 2 orphan tags. No media points at a deleted/inactive trick.
