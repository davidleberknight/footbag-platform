# Wave Alpha Phase 9 — Gyro Family Promotion (2026-05-24)

A focused thematic slice promoting the `gyro-*` composite-modifier
family. 5 new canonical-row promotions. The Wave Alpha frontier
analyzer originally classified composite-modifier-flagged slugs as
Tier-2 conservatively, but `gyro` is a registered +1 universal body
modifier in `freestyle_trick_modifiers` and the cross-source claims
agree with modifier arithmetic — the conservative flag was over-broad.
**4,122 tests passing.**

## What was implemented

Phase 9 evaluates the 8 composite-modifier Tier-2 candidates against
the Phase 6+7+8 doctrine framework. Of the 8:

- **5 gyro-* compounds** clear modifier arithmetic + cross-source
  ADD agreement → PROMOTED
- **2 blurry-* compounds** fail modifier arithmetic (`blurry`
  registers as +1 in modifier table, but Stanford bucket-claim is 5
  vs modifier-derived 4 → +2 effective for blurry-drifter / blurry-whirl).
  This is a real doctrine question about blurry's ADD on rotational
  bases (modifier table claims uniform +1). → DEFERRED.
- **1 spyro-gyro** has `spyro` as unregistered modifier. → DEFERRED.

## The 5 Phase 9 promotions

| Slug | ADD | Base | Operational notation | Source |
|---|---:|---|---|---|
| `gyro-butterfly` | 4 | butterfly | `CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` | fborg copy-as-is |
| `gyro-double-leg-over` | 4 | double-leg-over | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | Stanford `X.\+1-0+Z` |
| `gyro-illusion` | 3 | illusion | `CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > OP TOE [DEL]` | Stanford `X.\+0-Z` |
| `gyro-mirage` | 3 | mirage | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP TOE [DEL]` | Stanford `X.\+1-Z` |
| `gyro-whirl` | 4 | whirl | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP CLIP [XBD] [DEL]` | Stanford `X.\+1-X` |

All five derive: `gyro(+1) + base = ADD`. Modifier arithmetic, Stanford
bracket-count, and cross-source ADD claim all agree (3 or 4 ADD per row).

Notable: `gyro-double-leg-over` is registered with `gyro dlo` as an alias
(per `aliases` column) to cover the FM-corpus colloquial form.

## Family override (1)

`gyro-double-leg-over` (base=`double-leg-over` whose `trick_family=legover`)
→ override `trick_family` to `legover` per loader-19 no-transitive-
inheritance forever-rule.

## Deferred (3)

| Slug | Reason |
|---|---|
| `blurry-whirl` (in-DB) | Stanford bracket count (4) ≠ official adds (5). Modifier table says blurry=+1 but practical claim is +2. Doctrine: does blurry behave differently on rotational bases? |
| `blurry-drifter` (NEW) | Same blurry-arith mismatch. |
| `spyro-gyro` (NEW) | `spyro` is not in `freestyle_trick_modifiers` registry. |

These remain in `wave_alpha_promotions_2026-05-23.csv` for curator-paced
doctrine work.

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +5 rows.

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +11 rows:
- 5 `operational_notation` rows
- 5 `operational_notation_source` rows
- 1 `trick_family` override

## Verification performed

1. **Pre-write sanity.** All 5 satisfy `bracket_count == official_add`.
2. **Modifier arithmetic.** `gyro(+1) + base.adds == claim` per row.
3. **Loader applied.** `19_load_red_additions.py` ran cleanly; 584
   corrections applied (573 from Phase 8 baseline + 11 new).
4. **DB state verified.** All 5 slugs present; family override applied
   for `gyro-double-leg-over` → `legover`.
5. **Tests.** `npm test` → 4,122 passing; no regressions.

## Doctrine note — when conservatism overshoots

The Wave Alpha frontier-analyzer set `composite_modifier_flag = 1` for
any slug containing `blurry`, `surging`, `furious`, or `gyro`. The
rationale (from memory `feedback_observational_canonical_promotion_cleanup`
and related) was that these modifiers carry doctrine debt — historical
curator-uncertainty about ADD behavior.

Phase 9 demonstrates that the flag is too aggressive: `gyro` is a
fully-registered +1 universal modifier in `freestyle_trick_modifiers`
with multiple confirmed examples (per the modifier-table note:
"Confirmed: gyro torque=mobius=5, gyro whirl=4"). The Wave Alpha
analyzer could be refined to:

- `composite_modifier_unregistered`: only flag when the modifier is
  not in `freestyle_trick_modifiers` (genuine doctrine debt)
- `composite_modifier_registered`: treat as normal modifier (no
  special flag)

This is a recommended next-iteration refinement for the analyzer.

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
| Phase 8 | Tier-2 new-promotion wave | 18 | 153 |
| Phase 9 | gyro family promotion | 5 | **158** |

**158 canonical rows touched.** Breakdown:

- 74 notation backfills
- 84 new canonical-row promotions

Modifier coverage: gyro is now exercised across 5 Wave Alpha rows
(plus existing canonical rows like gyro torque = mobius). Total
modifiers exercised: 17 of 27 registered.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No new modifiers registered (spyro deferred)
- ❌ No doctrine adjudication on blurry's rotational behavior
- ❌ No promotion of unregistered-modifier compounds
- ❌ No backfill of blurry-whirl (doctrine question open)
