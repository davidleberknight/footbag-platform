# Wave Alpha Phase 8 — Tier-2 New-Promotion Wave (2026-05-24)

Extends the Phase 6+7 PassBack-doctrine operationalization from
backfills to **promotions**. 18 Tier-2 folk-named tricks promoted as
new canonical-DB rows; each chains off existing canonical-DB bases
(including Phase 1+2 promotions) and uses FM-parens → canonical-bracket
mechanical translation. **4,122 tests passing.**

## What was implemented

Phase 6 + Phase 7 demonstrated that Tier-2 `divergence_large` candidates
are safely backfillable when PassBack is the sole divergent source.
Phase 8 applies the same doctrine to the PROMOTION side: Tier-2
candidates NOT yet in canonical DB.

Filter cascade:
- `frontier_tier = 2_curator_review`
- failure mode = `divergence_large` (NOT composite_modifier / parser_unclean)
- NOT in `canonical_db` (would be a new promotion)
- All slug-modifiers registered in `freestyle_trick_modifiers`
- ≤ 2 modifier-prefix tokens
- FM-parens or fborg-bracket notation available
- Translated `bracket_count == fm/fborg ADD claim` (PassBack outlier non-authoritative)
- Tech-name decomposition includes NO composite-modifier flag (blurry/surging/furious/gyro)
- `base_trick` derived from FM technical decomposition AND exists in canonical DB

Pool: 54 mechanically eligible. Selected: 18 cleanest. (`whirr`
dropped on ADD-math sanity check; FM=5 tokens vs ADD claim=4.)

## The 18 Phase 8 promotions

| Slug | ADD | Base | FM technical decomposition |
|---|---:|---|---|
| `atom-bomb` | 6 | symposium-mirage | Flailing Symposium Mirage |
| `bladerunner` | 5 | eggbeater | Atomic Eggbeater |
| `bling-blang` | 4 | whirl | Whirling Reverse Whirl |
| `chainsaw-massacre` | 7 | symposium-eggbeater | Bubba Paradox Symposium Eggbeater |
| `colossus` | 6 | symposium-whirl | Spyro Diving Symposium Whirl |
| `darkwalk` | 5 | butterfly | Pixie Diving Butterfly |
| `dolomite` | 5 | paradon | Symposium Paradon |
| `ego` | 6 | ducking-whirl | Atomic Ducking Whirl |
| `gangsta-party` | 7 | paradox-blender | Spinning Ducking Paradox Blender |
| `gary-coleman` | 6 | symposium-whirl | Atomic Symposium Whirl |
| `goliath` | 5 | legover | Pixie Ducking Double Legover |
| `maelstrom` | 6 | paradox-whirl | Spinning Ducking Paradox Whirl |
| `morpheus` | 6 | paradox-drifter | Spinning Ducking Paradox Drifter |
| `pandemonium` | 5 | symposium-eggbeater | Pixie Symposium Eggbeater |
| `reactor` | 5 | whirl | Atomic Whirl |
| `ripped-warrior` | 5 | butterfly | Stepping Ducking Far Butterfly |
| `trixie` | 5 | pixie | Triple Pixie |
| `twirl` | 4 | osis | Reverse Swirling Osis |

(Full operational_notation strings in `red_corrections_2026_04_20.csv`.)

## Chain-of-promotion structure

Phase 8 demonstrates the productive chaining of Wave Alpha's earlier
phases:

- 5 rows chain off Phase 1 promotions (`symposium-whirl`,
  `symposium-eggbeater`): `colossus`, `gary-coleman`,
  `chainsaw-massacre`, `pandemonium`, ...
- 3 rows chain off Phase 1 + 6 backfilled atoms (`symposium-mirage`,
  `eggbeater`, `legover`, `pixie`, etc.): `atom-bomb`, `bladerunner`,
  `goliath`, `trixie`
- 1 row chains off Phase 4 (`paradox-drifter` → `morpheus`)

Each earlier promotion compounds. Phase 1 created 13 new bases; those
13 are now the foundation for ~10 of Phase 8's rows. Phase 2 created 16;
those serve another ~5.

## Trick_family overrides (10 rows)

Per loader-19 no-transitive-inheritance forever-rule:

| Slug | base_trick | base.trick_family |
|---|---|---|
| `atom-bomb` | symposium-mirage | mirage |
| `bladerunner` | eggbeater | legover |
| `chainsaw-massacre` | symposium-eggbeater | legover |
| `colossus` | symposium-whirl | whirl |
| `ego` | ducking-whirl | whirl |
| `gangsta-party` | paradox-blender | blender |
| `gary-coleman` | symposium-whirl | whirl |
| `maelstrom` | paradox-whirl | whirl |
| `morpheus` | paradox-drifter | drifter |
| `pandemonium` | symposium-eggbeater | legover |

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +18 rows.

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +46 rows:

- 18 `operational_notation` rows
- 18 `operational_notation_source` rows
- 10 `trick_family` overrides

## Verification performed

1. **Sanity check.** Pre-write: all 18 satisfy
   `bracket_count == official_add`. One candidate (`whirr`) dropped
   when its FM bracket count (5) exceeded the cross-source claim (4).
2. **Doctrine compliance.** Each row has `canonical_db = fm` on ADD
   claim (PassBack outlier non-authoritative per Phase 6+7 doctrine).
3. **Loader applied.** `19_load_red_additions.py` ran cleanly; 573
   corrections applied (527 from Phase 7 baseline + 46 new). Only
   pre-existing skips.
4. **DB state verified.** All 18 slugs present with correct
   `adds`/`base_trick`/`trick_family`/`operational_notation`. All 10
   family overrides applied.
5. **Tests.** `npm test` → 4,122 tests passing; no regressions.

## Cumulative Wave Alpha state

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational backfill (Tier-1) | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions | 16 | 44 |
| Phase 3 | mechanical backfill translations | 20 | 64 |
| Phase 4 | Wave Beta + completion | 14 | 78 |
| Phase 5 | folk-named FM-parens wave | 19 | 97 |
| Phase 6 | Tier-2 foundational-atom backfill | 11 | 108 |
| Phase 7 | Tier-2 FM-parens backfill | 27 | 135 |
| Phase 8 | Tier-2 new-promotion wave | 18 | **153** |

**153 canonical rows touched.** Breakdown:

- 74 notation backfills (15 mini-wave + 20 P3 + 1 P4 + 11 P6 + 27 P7)
- 79 new canonical-row promotions (13 P1 + 16 P2 + 13 P4 + 19 P5 + 18 P8)

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No new modifiers registered
- ❌ No doctrine invention (operationalizes Phase 6+7 rule)
- ❌ No promotion of composite-modifier-flagged tricks
  (blurry/surging/furious/gyro variants stay deferred)
- ❌ No promotion of tricks with unregistered modifiers in the slug
- ❌ No bracket-vs-official-ADD adjudication on deferred rows
