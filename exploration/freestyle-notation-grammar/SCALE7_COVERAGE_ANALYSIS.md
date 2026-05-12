# SCALE-7+ Coverage Analysis — Remaining Non-Pilot Pool

Strategic scan of the 106 non-pilot rows in the active dictionary, classified
by enrichment readiness. Informs SCALE-7+ batch composition. **No DB writes.**

## Pool decomposition

| category | count | next-step lane |
|---|---|---|
| **bridge-extension** | 24 | SCALE-7+ (highest ROI; rows share modifier(s) with existing pilots) |
| **standalone-with-records** | 8 | SCALE-7+ (record-traffic justifies independent enrichment) |
| **foundation-adjacent** | 3 | SCALE-7+ (foundation-pass complement) |
| **bridge-isolated** | 2 | SCALE-future (has mods but no pilot siblings yet) |
| **exotic-standalone** | 39 | SCALE-future or skip (no connectivity signals) |
| **blocked** | 12 | deferred (Red / pt12 / federation / variant) |
| **modifier-stub-row** | 18 | skip (modifier-visibility rule per `feedback_modifier_public_visibility.md`) |
| **total** | **106** | |

**Immediately SCALE-7+ eligible: 35 rows** (24 bridge + 8 record + 3 foundation).
**Future-eligible: 41 rows** (2 bridge-isolated + 39 exotic-standalone).
**Permanently deferred or excluded: 30 rows** (12 blocked + 18 modifier-stub).

The 18 modifier-stub rows (barraging, blazing, ducking, gyro, paradox,
spinning, stepping, symposium, tapping, etc.) are entries in
`freestyle_trick_modifiers` AND `freestyle_tricks` simultaneously; they
represent modifiers, not tricks, and the modifier-reference surface is hidden
per `feedback_modifier_public_visibility.md`.

## Tier 1 — Bridge-extension candidates (24 rows)

Sorted by `pilot-siblings` count (existing pilot rows sharing modifier(s)
with this row). Higher pilot-siblings → stronger bridge edge → higher
prose ROI.

| slug | ADD | family | mods | pilot-siblings |
|---|---|---|---|---|
| **surge** | 5 | mirage | paradox + spinning + stepping | **21** |
| **fog** | 5 | double-leg-over | paradox + stepping | **15** |
| **surgery** | 6 | rev-whirl | spinning + stepping + symposium | **15** |
| **royale** | 4 | reverse-drifter | paradox | **12** |
| **fury** | 5 | mirage | furious + paradox | **12** |
| **bigwalk** | 5 | butterfly | spinning + stepping | **9** |
| **venom** | 6 | barfly | spinning + stepping | **9** |
| **witchdoctor** | 4 | mirage | atomic + symposium | **8** |
| **smudge** | 3 | illusion | pixie | **7** |
| **smog** | 4 | double-leg-over | pixie | **7** |
| **flail** | 3 | illusion | symposium | **6** |
| **merkon** | 3 | legover | spinning | **6** |
| **spinning-clipper** | 3 | clipper-stall | spinning | **6** |
| **spinning-osis** | 4 | osis | spinning | **6** |
| **superfly** | 5 | barfly | symposium | **6** |
| **haze** | 4 | double-leg-over | stepping | 3 |
| **sidewalk** | 4 | butterfly | stepping | 3 |
| **stepping-osis** | 4 | osis | stepping | 3 |
| **grave-digger** | 5 | torque | stepping | 3 |
| **vortex** | 4 | drifter | gyro | 1 |
| **blurriest** | 5 | barfly | blurry | 1 |
| **sumo** | 5 | mirage | nuclear | 1 |
| **plasma** | 5 | plasma | quantum | 2 |
| **atomic-torque** | 6 | torque | atomic | 2 |

### Bridge-extension stratification by modifier

| modifier | non-pilot rows | current pilot count | growth potential |
|---|---|---|---|
| stepping | 9 (incl. compound rows) | 4 | 4 → 9 (could double in 1 batch) |
| spinning | 7 | 6 | 6 → 11 |
| paradox | 5 | 12 | already mature; 12 → 14 incremental |
| symposium | 4 | 6 | 6 → 9 |
| pixie | 2 | 7 | nearly complete |
| atomic | 2 | 3 | 3 → 5 (would extend pt10 demo) |
| gyro | 1 | 0 (mobius newly added) | gyro bridge just opened with mobius |
| blurry / furious / quantum / nuclear | 1 each | 0 each | first pilot row per modifier |

## Tier 2 — Foundation-adjacent (3 rows)

Base tricks with multiple compounds rooted; analogous to SCALE-6 foundation
pass.

| slug | ADD | family | compounds rooted |
|---|---|---|---|
| **pickup** | 2 | pickup | 4 (omelette, paste, scrambled-eggbeater, legeater) |
| **double-leg-over** | 3 | legover | 3 |
| **illusion** | 2 | illusion | 2 (eclipse, atomic-illusion, smudge variants) |

Strong SCALE-7 inclusion candidates. Pickup specifically: 3 of its 4 rooted
compounds (paste, scrambled-eggbeater, legeater) are SCALE-1 pilots, so the
pickup base would close the prereq-chain on the pickup-family pilot triad.

## Tier 3 — Standalone-with-records (8 rows)

Independent rows with record-driven traffic. Lower bridge value but
record-holder presence justifies authored prose.

| slug | ADD | records |
|---|---|---|
| eclipse | 3 | 2 |
| dyno | 4 | 2 |
| ripstein | 4 | 2 |
| jani-walker | 5 | 2 |
| barrage | 3 | 1 |
| cross-body-sole-stall | 3 | 1 |
| double-around-the-world | 3 | 1 |
| dada-curve | 4 | 1 |

dyno has notable depth: dyno-family compounds exist (dyno (far) + dyno (same side) both alias mobius/spinning-torque-class structures). dyno could surface naturally with mobius's recursive showcase.

## Blocked rows (12)

Carry forward as-is:

| slug | block reason | unblock condition |
|---|---|---|
| blurry-whirl, blurry-torque, barraging-osis, food-processor | pt12 Expanded-Decomposition class | pt12 packet dispatch + Red ruling |
| omelette, terrage, atomic-illusion | Red Q1/Q2 dependencies | Red Top-3 packet response |
| barfly | federation (FM naming divergence) | federation resolution |
| blur | ontology (pt10 just-shifted) | ontology stabilization |
| tapping-whirl, surreal, rev-whirl, rev-up | SCALE-2 deferred | low priority; can promote anytime |

## Exotic standalones (39 rows)

Rows with no connectivity signals (no modifier_links, no compounds rooted,
no records). Examples sampled: pogo (0 ADD, rooted), most stall-family
rows (head-stall, knee-stall, neck-stall, shoulder-stall, sole-stall,
toe-stall is already pilot, etc.), cloud-stall, hop-over, walk-over,
forehead-stall, knee-clipper, dragonfly-kick, sole-kick, pendulum, etc.

These rows are reachable by direct slug lookup but don't link into the
bridge graph. **Pilot value is low per-row** — each would be an isolated
authored page with no cross-traffic. Promote only on specific demand (e.g.,
a record-holder discovery, a curator request, or a UX surface that needs
them populated).

## Strategic recommendation

### SCALE-7 batch composition options (10 rows)

**Option A — Stepping concentration (highest bridge growth)**
Push the stepping bridge from 4 → 14 pilots in one batch. Stable rows:
haze, sidewalk, stepping-osis, bigwalk, fog, surge, surgery, venom,
grave-digger + 1 cross-bridge filler.

| pros | cons |
|---|---|
| stepping bridge doubles in one batch | concentrates ROI on one modifier |
| 10 stable LOW-risk candidates available | high-ADD-density (5-6 average) |
| many of these are records-rich or compound flagships | less family diversity |

**Option B — Mixed bridge-extension (recommended)**
Top-centrality rows across multiple bridges. e.g.:

| # | slug | bridge | rationale |
|---|---|---|---|
| 1 | pickup | foundation | closes 3 pickup-family SCALE-1 pilot prereqs |
| 2 | smudge | pixie | extends pixie to 7 → 8 (illusion family entry) |
| 3 | smog | pixie | extends pixie to 8 → 9 (double-legover entry) |
| 4 | merkon | spinning | extends spinning to legover family |
| 5 | spinning-clipper | spinning | extends spinning to clipper-stall (foundation just pilot) |
| 6 | spinning-osis | spinning | extends spinning to osis (also just pilot) |
| 7 | royale | paradox | extends paradox to reverse-drifter family |
| 8 | flail | symposium | extends symposium to illusion family |
| 9 | atomic-torque | atomic | extends atomic bridge to torque |
| 10 | fury | furious + paradox | first furious-bridge pilot; pt6-settled multi-modifier |

This composition spreads 5 modifier bridges (pixie, spinning, paradox,
symposium, atomic) + opens furious + adds 1 foundation row + 1 records-rich
mirage compound.

**Option C — Records-rich emphasis**
Prioritize the 8 record-holder rows (eclipse, dyno, ripstein, jani-walker,
barrage, cross-body-sole-stall, double-around-the-world, dada-curve) + 2
bridge fillers. Lower bridge ROI but satisfies organic record-driven
navigation.

### My recommendation: **Option B (mixed bridge-extension)**

Reasoning:
- 6 modifier bridges grow simultaneously (pixie / spinning / paradox / symposium / atomic / furious-NEW)
- 1 foundation row (pickup) closes the pickup-family SCALE-1 prereq chain end-to-end
- 1 records-rich row (fury) satisfies a known divergence-documented case
- All 10 rows pass parser audit (math-clean)
- Cadence-design discipline carries SCALE-5/5b/6 lessons forward

### After SCALE-7

Remaining bridge-extension pool: 14 rows + 8 records-rich + 2 foundation
(double-leg-over, illusion) + 41 future-eligible. SCALE-8 / SCALE-9
plausible without exhausting the LOW-risk pool.

When Red Top-3 returns:
- Q1 unblocks omelette + atomic-illusion (+ atomic-on-X class)
- Q2 unblocks terrage + Double-X class
- Q3 ratifies positional-operator class rule (no row unblocks but enables Phase-2 grammar work)

When pt12 Expanded-Decomp resolves:
- Unblocks blurry-whirl, blurry-torque, food-processor, barraging-osis

## Files produced

- `exploration/freestyle-notation-grammar/SCALE7_COVERAGE_ANALYSIS.md` (this doc)
- `exploration/freestyle-notation-grammar/SCALE7_COVERAGE_MATRIX.csv` (106 rows, full per-row classification)

No DB writes. Ready for SCALE-7 batch selection when you're ready.
