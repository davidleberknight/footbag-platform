# Master + DB — QC Report — 2026-05-21

Six QC checks against `SYMBOLIC_GRAMMAR_MASTER.csv` (854 rows) and the
live `freestyle_tricks` table (171 rows). Read-only; no mutation.

Re-runnable tool: `legacy_data/scripts/qc_fborg_master.py` (exits
non-zero on hard failure).

**Result: no hard failures. 3 checks flagged for curator attention.**

---

## Check results

| # | Check | Result |
|---|---|---|
| 1 | duplicate `canonical_slug` (master) | **ok** — 0 |
| 2 | duplicate normalized `display_name` (master) | flag — 2 |
| 3 | live DB rows missing from master | flag — 47 (informational) |
| 4 | `first_class=true` violating the 3 criteria | **ok** — 0 |
| 5 | `equivalent_to` target missing | **ok** — 0 |
| 6 | `curator_review_needed=false` + `unresolved_questions` set | flag — 1 |

Checks 1 and 4 are hard-fail checks — both clean. Checks 2, 3, 6 are
advisory flags.

## Check 4 — first_class integrity holds

0 violations. Every `first_class=true` row satisfies settled doctrine +
no review flag + clean notation + no unresolved questions. The Phase-1
audit (2026-05-21) is holding; `first_class=true` is a reliable
promotion gate.

## Check 5 — equivalent_to references all resolve

0 misses. Every `equivalent_to` value's head token resolves to a live
DB slug or a master canonical_slug/name. (The `clipper-kick`
equivalent_to fix from the clipper-kick decision note is included.)

## Check 2 — duplicate normalized display_name (2)

| normalized name | rows | assessment |
|---|---|---|
| `blurrage` | Blurrage (footbagmoves/6add) ×2 | **Real duplicate** — two byte-identical footbagmoves rows. Already flagged in the blurry/stepping triage (2026-05-21). Curator de-duplication pending. |
| `blurry drifter` | Blurry Drifter (footbagmoves/5add) + (passback/5add) | **Benign** — one row per source is the master's intended per-source-row model. Not a defect. |

Action: the `blurrage` duplicate wants a curator de-dup decision (drop
one footbagmoves row). The `blurry drifter` pair is correct as-is.

Note check 1 (duplicate `canonical_slug`) read 0 even though Blurrage
appears twice: only one of the two Blurrage rows has `canonical_slug`
populated (the 5-ADD ingest touched one; the other stayed
governance-empty). Check 2 caught the real duplicate via display_name.

## Check 3 — live DB rows missing from master (47, informational)

47 of the 171 live `freestyle_tricks` rows have no master row. This is
**expected, not a defect** — the master is the FootbagMoves/PassBack/
FB.org observational corpus; it is not a superset of the IFPA
dictionary. The 47 break down as:

- **Modifier-stub rows (~16)** — `atomic`, `barraging`, `blazing`,
  `ducking`, `furious`, `gyro`, `illusioning`, `paradox`, `pogo`,
  `quantum`, `rooted`, `sailing`, `shooting`, `spinning`, `spyro`,
  `stepping`. These are modifiers, not tricks — external trick lists
  do not enumerate them. Correctly absent.
- **IFPA-curated atoms / stalls (~14)** — `clipper-stall`,
  `cloud-stall`, `cross-body-sole-stall`, `forehead-stall`,
  `heel-stall`, `inside-stall`, `knee-stall`, `neck-stall`,
  `shoulder-stall`, `sole-stall`, `legover`, `orbit`, `guay`,
  `squeeze`. Some are slug-format mismatches (master `leg-over` vs DB
  `legover`) rather than true absences — the QC match is exact-slug +
  normalized-name and does not bridge hyphenation differences.
- **Compounds (~17)** — `atomic-torque`, `barraging-osis`,
  `ducking-whirl`, `paradox-symposium-whirl`, `spinning-symposium-whirl`,
  `spinning-torque`, `spinning-whirl`, `rev-whirl`, `rev-up`, etc.
  IFPA-curated rows the federation sources happen not to list, or
  list under a divergent name.

No action required. If a uniform master↔DB slug map is ever wanted,
that is a separate slug-reconciliation task (related to the deferred
clipper-kick slug-migration debt).

## Check 6 — review=false but unresolved_questions set (1)

| row | issue |
|---|---|
| `symposium-blur` | `curator_review_needed=false` yet `unresolved_questions` = "Double-[BOD] notation; symposium + paradox + blurry/stepping stacking." |

A minor consistency slip: the blurry/stepping triage set
`curator_review_needed=false` on `symposium-blur` but did not clear the
`unresolved_questions` text carried over from the 5-ADD ingest.

**This is a flag, not auto-fixed** (reports-only slice). The fix is a
curator judgment, not mechanical — either:
- the question is real → set `curator_review_needed=true`; or
- the question is stale → clear `unresolved_questions`.

Recommend the curator pick one in a future hygiene pass.

## Summary

| | |
|---|---|
| Hard failures | 0 |
| Real data defect | 1 — duplicate `blurrage` row (curator de-dup) |
| Minor inconsistency | 1 — `symposium-blur` review/question mismatch |
| Informational | 47 DB-rows-not-in-master (expected; corpus boundary) |
| Benign flag | 1 — `blurry drifter` per-source pair (correct) |

The master + DB are in good QC health. `first_class` integrity and
`equivalent_to` integrity — the two checks that gate promotion safety —
are both clean.
