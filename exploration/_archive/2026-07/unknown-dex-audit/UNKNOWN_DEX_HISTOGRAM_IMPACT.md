# UNKNOWN_DEX_HISTOGRAM_IMPACT

Projection of how recovering the 55 base-ready Unknown-dex rows (in cohort waves from
`SAFE_RECOVERY_PACKET.md`) would move each of the six histogram families. Read-only; no notation
written, nothing recalculated in production. **Precision note:** Cohort-1 dex counts are EXACT
(from the bracket-count-verified proposed notation); Cohort-2..55 dex counts are APPROXIMATE
(base `[DEX]` count, +1 for dex-adding operators miraging/tapping/stepping/pixie). Terminal/Entry
shifts use each row's `trick_family` / base entry token (the recovered notation's terminal/entry
token equals these by construction). Terminal baseline = the 2026-06-07 `FAMILY_HISTOGRAM` snapshot
(itself stale vs the current 705-row DB per `HISTOGRAM_INVENTORY.md`), so family deltas are
directional.

## Headline

Two of the six families are **not distorted by Unknown-dex at all**; four are.

| # | Family | Source field | Distorted by Unknown? | Recalc can proceed now? |
|---|---|---|---|---|
| 1 | Difficulty (ADD) | `freestyle_tricks.adds` | **NO** -- the 55 already carry `adds` | **Yes** |
| 5 | Body Topology | curated `modifier_links` | **NO** -- not notation-gated | **Yes** |
| 2 | Dexterity Ecology | `[DEX]` tokens in notation | **YES (most)** | wait |
| 3 | Terminal Topology | notation terminal token | **YES** | wait |
| 4 | Entry Topology | notation entry token | **YES** | wait |
| 6 | Component Ecology | notation components | **YES** | wait |

---

## 1. Difficulty (ADD) -- NOT distorted

The 55 already have curator `adds` (distribution: 2:1, 3:10, 4:10, 5:14, 6:13, 7:5, 8:2 -- mostly
4-6 ADD compounds). An ADD histogram built from the `adds` column **already counts all 55**.
Notation recovery changes none of these values.

- current == +C1 == +C1+C2 == +all 55 (no change).
- **Absolute / % change: 0.** Recalc does not need to wait.

## 5. Body Topology -- NOT distorted

Reads curated `freestyle_trick_modifier_links`, not notation. The 55 with modifier links are
already counted in their body ecosystems; the ones with `ML=[]` (folk names) are absent regardless
of notation. Unknown-dex status is orthogonal. **Recalc does not need to wait** (it is gated on
modifier-link completeness, a separate concern).

---

## 2. Dexterity Ecology (dex-count histogram) -- MOST distorted

| stage | 0 dex | 1 dex | 2 dex | 3+ dex | **Unknown** |
|---|---|---|---|---|---|
| **current** | 46 | 204 | 282 | 84 | **67** |
| + Cohort 1 (exact) | 47 | 211 | 283 | 84 | **58** |
| + Cohort 1+2 | 47 | 216 | 288 | 84 | **48** |
| + all 55 base-ready | 47 | 239 | 300 | 85 | **12** |

Absolute / % change (current -> all 55):

| bucket | abs | % |
|---|---|---|
| 0 dex | +1 | +2.2% |
| **1 dex** | **+35** | **+17.2%** |
| 2 dex | +18 | +6.4% |
| 3+ dex | +1 | +1.2% |
| **Unknown** | **-55** | **-82.1%** |

- **Unknown is currently the 4th-largest bar: 67 of 683 trick-kind rows = 9.8%** of the histogram
  sits in a "no data" bucket, ahead of the real 0-dex bucket (46). Recovering the 55 drops it to
  12 (1.8%).
- Categories most affected: **1-dex (+17%)** and **2-dex (+6%)** -- the recovered compounds are
  overwhelmingly single- and double-dex. 0-dex and 3+ barely move.
- Rank-order: no bar swaps (2-dex stays largest, then 1-dex), but the **Unknown bar falls from
  rank 4 to rank 5 (below 0-dex)** -- the histogram stops being dominated by missing data.

## 3. Terminal Topology (families) -- distorted, concentrated in mid-size families

The 55 undercount their `trick_family`. Top family gains (current `FAMILY_HISTOGRAM` snapshot ->
+all 55):

| family | current | +all 55 | abs | % |
|---|---|---|---|---|
| **eggbeater** | 13 | 17 | +4 | **+30.8%** |
| **torque** | 22 | 27 | +5 | **+22.7%** |
| pickup | 27 | 31 | +4 | +14.8% |
| blender | 22 | 25 | +3 | +13.6% |
| illusion | 34 | 38 | +4 | +11.8% |
| whirl | 74 | 81 | +7 | +9.5% |
| mirage | 69 | 74 | +5 | +7.2% |
| legover | 71 | 75 | +4 | +5.6% |
| clipper-stall | 328 | 329 | +1 | +0.3% |
| toe-stall | 252 | 253 | +1 | +0.4% |

- The two **surface roots (clipper/toe) barely move (<0.5%)** -- the Unknown distortion does NOT
  touch the headline bars. It lands almost entirely on **mid-size compound families**.
- **Most affected: eggbeater (+31%) and torque (+23%)** -- both materially undercounted today.
- Rank-order changes: **torque (22->27) overtakes blender (22->25)**; **eggbeater (13->17) rises
  ~3 ranks past barfly (13), double-over-down (12), inside-stall (11)**. The mid-tier ranking is
  currently wrong.
- Cohort-1-only family spread is broad and shallow (clipper-stall/inside-stall/pickup/illusion/
  eclipse/whirl/butterfly-kick/toe-stall, +1 to +2 each); the concentrated eggbeater/torque/mirage
  gains arrive with Cohorts 4-5.

## 4. Entry Topology -- moderate distortion

The 55 by entry surface: **CLIP-set +12, TOE-set +10**, SET/other +33 (the 33 route to set-system
buckets via their set operator -- symposium, pixie, fairy, atomic).

| entry | current | +all 55 | % |
|---|---|---|---|
| toe-set | 207 | ~217 | +4.8% |
| clip-set | 197 | ~209 | +6.1% |
| symposium / pixie / fairy / atomic systems | (79 / 60 / 55 / 11) | + ~6 / +3 / +3 / +2 | small |

Moderate, even shift across the surface entries; no rank changes expected.

## 6. Component Ecology -- distorted (qualitative)

Notation-derived; the 55 contribute their base components plus each operator's component when
recovered (mostly `op-in-dex` / `op-out-dex` / body `[BOD]` events, plus the catch surfaces).
Exact per-component deltas require the deferred notation for Cohorts 2-55, so not quantified here;
directionally the body/dex component bars (`op-in-dex 220`, `op-out-dex 194`, `duck 89`) gain a few
percent. Distorted like Terminal/Entry; recovers with the 55.

---

## Which histogram is most distorted by the Unknown bucket?

**Dexterity / dex-count, unambiguously.** It is the only family where the Unknown rows form a
single explicit bar -- **67 rows = 9.8% of the population, the 4th-largest bucket** -- so the
histogram literally renders a giant "no notation" bar that outranks a real category (0-dex). The
other notation-derived families spread their 67-row undercount across many categories, so no single
bar is as misleading. **Terminal is a clear second** (eggbeater/torque mid-tier ranks are wrong
today), but its distortion hides in the long tail rather than a headline bar.

---

## Recommendation

**Split the recalculation by family:**

- **Recalculate ADD (Difficulty) and Body Topology now.** Neither is distorted by Unknown-dex
  (ADD uses `adds`; Body uses `modifier_links`). Waiting buys nothing.
- **Hold Dexterity, Terminal, Entry, and Component until at least the base-ready recovery lands.**
  Publishing them today ships a dex histogram dominated by a 9.8% "Unknown" bar and a family
  ranking with eggbeater/torque undercounted by 23-31%. That is a misleading public artifact.
- **The base-ready recovery is sufficient to de-distort them:** it takes dex-Unknown 67 -> 12
  (-82%) and corrects the mid-size family ranks. The residual 12 (9 base-blocked foundations + 2
  roots + terrage) is 1.8% -- an acceptable honest-incompleteness floor to publish against.

**Sequencing that minimizes wait:** ship ADD + Body now; land Cohort 1 (8-9 rows, dex-Unknown
67->58, zero doctrine) as the first notation slice; then Cohort 2; recalc and publish the four
notation-derived histograms once the base-ready set (or at least Cohorts 1-2, Unknown -> 48) is in.

## Educational impact of recovering the 55

- **Honesty:** the dex histogram stops advertising that ~1 in 10 named tricks has "no data"; the
  real shape (1-dex/2-dex dominant, +17%/+6%) becomes visible.
- **Compound coverage:** the 55 are mostly **4-6 ADD compound tricks** -- the technically
  interesting vocabulary. Their current absence makes every notation-derived histogram
  under-represent the compound / higher-ADD end. Recovery improves accuracy exactly where a learner
  exploring "what's beyond the basics" looks.
- **Family fairness:** eggbeater, torque, mirage, illusion, blender -- the mid-tier families a
  student graduates into -- currently look smaller than they are. Recovery restores their true
  weight and corrects the mid-tier ranking.
