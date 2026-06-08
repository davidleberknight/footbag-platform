# Grammar Ruling Pass - Proposal for Curator Review

Read-only. Three recurring rulings extracted from corpus evidence, ranked by unlock impact. Nothing written.

## Ruling 1 - `>>`-base composition (10 unlocks, HIGH confidence)
**Ruling:** when a modifier is inserted at a `>>` set boundary (eggbeater / merkon / tomahawk / superfly bases), the `>>` collapses to single `>` separators around the inserted token(s). The base's own set-to-dex no-plant `>>` is absorbed into the composition.

**Evidence:** every modifier composition on the eggbeater `TOE >> OP OUT` base renders as single `>`:
- `fairy-eggbeater`: `TOE > SAME OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
- `pixie-eggbeater`: `TOE > SAME IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]`
- `symposium-eggbeater`: `SET > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]`

**Unlocks (only-blocker):** stepping-ducking-symposium-eggbeater, spinning-eggbeater, spinning-tomahawk, spinning-ducking-superfly, fairy-merkon, fairy-ripstein, barraging-barfly, barraging-eggbeater, symposium-mobius, symposium-tomahawk. (10)

The largest single ruling; it also clears two tricks held back in the whirl batch (spinning-tomahawk, symposium-tomahawk).

## Ruling 2 - tapping operator (3 unlocks, HIGH confidence)
**Grammar:** `tapping-X = TOE > OP OUT [DEX] >> <base core>`. The fourth entry operator alongside pixie (TOE / SAME IN), stepping (CLIP / OP IN), fairy (TOE / SAME OUT); tapping is TOE / OP OUT, +1, with a uniform `>>` separator.

**Evidence:** 18 notations, every one opening `TOE > OP OUT [DEX] >>` (tap, tapping-whirl, tapping-mirage, tapping-clipper, tapping-osis, ...). One exception: tapping-illusion uses `(plant) >` (a one-off marker).

**Unlocks (only-blocker):** tapping-legover, tapping-guay, tapping-double-over-down. (3)

## Ruling 3 - fairy entry separator (ratify + correct; least clean)
**Ruling:** fairy = `TOE > SAME OUT [DEX] > <core>` by default; `>>` only when a body modifier (ducking / diving / spin) immediately follows. Corpus: 26 `>` vs 13 `>>`, and the `>>` cases are overwhelmingly fairy+body-mod.

**Correction consequence:** three fairy-modifier rows currently use `>>` with no following body modifier and would standardize to `>`:
- `fairy-whirl` (mine): `TOE > SAME OUT [DEX] >> OP IN [DEX] ...` -> `TOE > SAME OUT [DEX] > OP IN [DEX] ...`
- `fairy-butterfly` (mine): `... >> SAME/OP OUT [DEX] ...` -> `... > SAME/OP OUT [DEX] ...`
- `fairy-twirl` (pre-existing curated row): same shift.

The least-clean of the three: the corpus is genuinely mixed, so the curator may prefer to keep per-trick `>>`. No new tricks are unlocked by this ruling alone; it only enables fairy on `>>`-bases when paired with Ruling 1 (e.g. fairy-merkon).

## Combined impact
| ruling | unlocks | confidence | side effect |
|---|---|---|---|
| `>>`-base composition | **10** | HIGH | clears spinning/symposium-tomahawk |
| tapping operator | **3** | HIGH | adds a 4th entry operator |
| fairy separator | 0 new | mixed | corrects 2-3 rows; enables fairy-on-`>>`-base with Ruling 1 |

Accepting Rulings 1 + 2 unlocks **13 held tricks** across legover, whirl, mirage, butterfly, torque, double-over-down, mobius, superfly, barfly, and more. Ruling 3 is a consistency call.

## Requested decisions
1. `>>`-base collapse-to-`>` rule - confirm.
2. tapping = `TOE > OP OUT [DEX] >>` - confirm.
3. fairy separator: standardize on `>` (correct the 3 rows) vs keep per-trick `>>` - your call.
