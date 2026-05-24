# Wave Alpha Phase 10 — Folk-Named Extension Promotion (2026-05-24)

A cleanup slice promoting 4 standalone folk-named tricks whose base
anchors now exist in canonical DB (some via Wave Alpha earlier phases).
**4,122 tests passing.**

## What was implemented

The mechanically-promotable candidate pool is approaching exhaustion.
Phase 10 sweeps the remaining Tier-1 candidates where base-trick
existence + ADD-math both pass cleanly:

- **3 swirl-family folk-named compounds** (butterfly-swirl, paradon-swirl,
  barfly-swirl) — all use `base=swirl`, fborg canonical-bracket source,
  ADD-math verified.
- **1 reactor chain** (`juno-reactor`) — chains on Phase 8's
  `reactor` promotion; fm-parens → canonical-bracket translation;
  ADD-math verified.

## The 4 Phase 10 promotions

| Slug | ADD | Base | Operational notation |
|---|---:|---|---|
| `butterfly-swirl` | 4 | swirl | `SET > SAME/OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` |
| `paradon-swirl` | 5 | swirl | `TOE > OP OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` |
| `barfly-swirl` | 5 | swirl | `CLIP > SAME OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` |
| `juno-reactor` | 6 | reactor | `TOE > SAME IN [DEX] > OP OUT [DEX] >> OP FRONT WHIRL [DEX] [XDEX] > OP CLIP [XBD] [DEL]` |

Each row's `bracket_count == official_add` (4, 5, 5, 6 respectively).
The 3 swirl-family entries demonstrate the swirl base supporting a
family of folk-named extensions; `juno-reactor` chains on the Phase 8
reactor promotion (5 ADD → 6 ADD via one extra X-DEX).

## Family override (1)

`juno-reactor` (base=`reactor` whose `trick_family=whirl`) →
`trick_family=whirl` per loader-19 forever-rule.

## Dropped from initial candidate (1)

| Slug | Reason |
|---|---|
| `torch-r-rack` | FM translation gave 7 brackets; cross-source claim was 6. Pre-write ADD-math sanity check caught the mismatch. The Stepping-Superfly decomposition's modifier-arith says stepping(+1) + superfly(5) = 6, so either FM has an extra token or superfly is undercounted at 5. Curator territory. |

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +4 rows.

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +9 rows:
- 4 `operational_notation` rows
- 4 `operational_notation_source` rows
- 1 `trick_family` override

## Verification performed

1. **Pre-write sanity.** All 4 satisfy `bracket_count == official_add`.
2. **Cross-source verification.** Each row has agreement between fm
   and fborg ADD claims (PassBack divergence, where present, non-
   authoritative per Phase 6+7 doctrine).
3. **Loader applied.** `19_load_red_additions.py` ran cleanly; 593
   corrections applied (584 from Phase 9 baseline + 9 new).
4. **DB state verified.** All 4 slugs present; family override applied
   for `juno-reactor`.
5. **Tests.** `npm test` → 4,122 passing across 230 files;
   no regressions.

## Cumulative Wave Alpha state

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational backfill | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions | 16 | 44 |
| Phase 3 | mechanical backfill translations | 20 | 64 |
| Phase 4 | Wave Beta + completion | 14 | 78 |
| Phase 5 | folk-named FM-parens wave | 19 | 97 |
| Phase 6 | Tier-2 foundational-atom backfill | 11 | 108 |
| Phase 7 | Tier-2 FM-parens backfill | 27 | 135 |
| Phase 8 | Tier-2 new-promotion wave | 18 | 153 |
| Phase 9 | gyro family promotion | 5 | 158 |
| Phase 10 | folk-named extension promotion | 4 | **162** |

**162 canonical rows touched.** Breakdown:
- 74 notation backfills
- 88 new canonical-row promotions

## Mechanical pool exhaustion — what's left

Phase 10's 4-row size signals the mechanically-clean pool is mostly
exhausted. The remaining candidates split into doctrine-debt categories:

**Doctrine questions blocking further mechanical work:**

| Question | Affected rows | Curator decision needed |
|---|---:|---|
| `blurry` ADD on rotational bases (modifier table says +1; effective claim is +2) | 2 (blurry-whirl, blurry-drifter) + others | Update modifier table OR treat as one-off |
| `[PDX]` double-counting on torque-family rows (fborg bracket count exceeds official_add by 1) | 10+ (torque, ripwalk, blizzard + Phase 7's 7 deferrals + Phase 10's torch-r-rack) | Bracket-count overrules vs official ADD overrules |
| `pogo` actual ADD behavior (registry says +0; observed +1 on specific bases) | 2 (pogo-barfly, pogo-pickup) | Refine modifier rules |
| Unregistered modifiers (`blistering`, `inspinning`, `spyro`, `frantic`, `neutron`) | ~10 compounds | Register modifier OR mark untouchable |
| Passback-prose-only sources (rake, walk-over, inspinning-osis) | 3 | Curator authors canonical-bracket form |
| Slug-form vs FM-name mismatches (e.g. fairy-symposium-mirage vs FM "Fairy Flail") | a few | Curator decides slug or aliases |

**Curator-judgment promotion candidates remaining:**

The Phase 4+8 "base doesn't exist" deferrals could yield ~15 more
promotions if the curator assigns bases per row (e.g., spike-hammer,
down-double-down, da-da-curve as standalones; double-fairy as
2-modifier on fairy; etc.). These need curator review.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No doctrine adjudication on the remaining pool
- ❌ No promotion of `torch-r-rack` (ADD-math failure)
- ❌ No tackling of any candidate that requires curator-paced
  judgment beyond mechanical translation
