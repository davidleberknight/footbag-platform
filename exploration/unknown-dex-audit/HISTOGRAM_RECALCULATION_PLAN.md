# HISTOGRAM_RECALCULATION_PLAN

Recalculation runbook for the six histogram families: data source, current counts, whether the
Unknown-dex bucket blocks an honest recompute, and the post-recovery estimate. Read-only planning;
no histogram is recalculated here. Companions: `HISTOGRAM_INVENTORY.md` (what exists),
`UNKNOWN_DEX_HISTOGRAM_IMPACT.md` (the shift math).

## Precondition that gates four of the six

`structural_parse_json` is populated for **0 of 705** active rows (the parser-population step was
not run after the last rebuild). Any recompute that wants a parser-backed dex/component reading
must first run `scripts/parse_freestyle_notation.py --apply`. The four notation-derived families
also undercount by the 67 Unknown rows until notation recovery lands.

## Family -> data source map + recalc gate

| # | Family | Data source | Current counts (audit baseline) | Blocked by Unknown? | Recalc gate |
|---|---|---|---|---|---|
| 1 | **Difficulty (ADD)** | `freestyle_tricks.adds` (column) | from `adds`; the 67 Unknown already carry ADD | **NO** | **recalc now** |
| 5 | **Body Topology** | curated `freestyle_trick_modifier_links` | ducking 84, spinning 78, gyro 38, diving 24, tapping 21 ... | **NO** (not notation-gated) | **recalc now** (gated only on modifier-link completeness) |
| 2 | **Dexterity Ecology** (dex-count) | `[DEX]` tokens in `operational_notation` | 0=46, 1=204, 2=282, 3+=84, **Unknown=67** | **YES (most distorted)** | after notation recovery + parser |
| 3 | **Terminal Topology** | last catch token of `operational_notation` (`terminal-topology-audit`) | clipper-stall 328, toe-stall 252, osis 84, whirl 74, legover 71, mirage 69 ... | **YES** | after recovery; re-run terminal audit |
| 4 | **Entry Topology** | opening token of `operational_notation` + `modifier_links` (`entry-topology-audit`) | toe-set 207, clip-set 197, symposium 79, paradox 63, pixie 60 ... | **YES** | after recovery; re-run entry audit |
| 6 | **Component Ecology** | atom occurrences in `operational_notation` (`component-ecology-audit`) | cross-body 246, clipper-catch 243, op-in-dex 220, toe-set 207, spin 206 ... | **YES** | after recovery; re-run component audit |

## Blocked vs unblocked

- **Unblocked (recalc immediately): Difficulty (ADD), Body Topology.** Neither reads notation. The
  67 Unknown rows already carry `adds` and (where curated) `modifier_links`, so a recompute today
  is honest. Waiting buys nothing.
- **Blocked by Unknown notation: Dexterity, Terminal, Entry, Component.** All four read
  `operational_notation`, which the 67 Unknown rows lack, so a recompute today ships a dex
  histogram with a 9.8% "Unknown" bar and family/entry/component totals undercounted by up to 67.

## Post-recovery estimates (all 55 base-ready recovered)

From `UNKNOWN_DEX_HISTOGRAM_IMPACT.md`:

- **Dexterity:** 0=47, 1=**239** (+17%), 2=**300** (+6%), 3+=85, **Unknown=12** (-82%). The
  Unknown bar drops below the 0-dex bar.
- **Terminal:** headline bars static (clipper/toe < +0.5%); mid-tier gains -- eggbeater +31%,
  torque +23%, pickup +15%, blender +14%, illusion +12%, whirl +9%; rank changes (torque overtakes
  blender, eggbeater rises ~3 ranks).
- **Entry:** toe-set ~217 (+5%), clip-set ~209 (+6%), set systems small gains; no rank changes.
- **Component:** body/dex component bars (op-in-dex, op-out-dex, duck) gain a few percent;
  per-component deltas need the deferred Cohort 2-55 notation, not estimated here.
- **Difficulty / Body:** **no change** (already complete).

## Recalc sequence (minimizes wait)

1. **Now:** recompute + publish **Difficulty (ADD)** and **Body Topology** -- unblocked.
2. **After the Cohort-1 slice** (and the corrected rows -- see the curator review): re-run
   `parse_freestyle_notation.py --apply`, then recompute Dexterity (the first family to visibly
   improve: Unknown 67 -> ~59).
3. **After the base-ready set (or at least Cohorts 1-2, Unknown -> ~48):** recompute + publish
   **Terminal, Entry, Component**. The residual ~12 (9 base-blocked foundations + 2 roots +
   terrage) is 1.8% -- an acceptable honest-incompleteness floor.
4. Re-derive the two baked glossary histograms (`FAMILY_HISTOGRAM`, `ENTRY_HISTOGRAM` in
   `freestyleTopologyHistograms.ts`) from the re-run audits, and fix the count-baking fragility
   per `HISTOGRAM_INVENTORY.md` (compute live or build-generate with a count-level CI guard).

**Decision: do NOT block ADD + Body on notation recovery; DO hold the four notation-derived
families until at least the base-ready recovery.**
