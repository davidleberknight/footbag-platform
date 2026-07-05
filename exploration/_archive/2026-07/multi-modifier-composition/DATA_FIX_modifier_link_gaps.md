# Data Fix - Modifier-Link Gaps

Tracked data fix. Read-only record; the correction itself is a source-data + reload change, listed here for the next data pass. No source files edited by this document.

## Fix 1 - genuphobia missing `gyro` modifier link (confirmed)
**Symptom:** link-based ADD recomposition under-counts genuphobia by 1. Stated `adds=7`, but `[fairy, symposium] + torque(4)` recomposes to 6.

**Root cause:** the trick is Fairy **Gyro** Symposium Torque (folk name genuphobia; the spin is spelled "spyro" in the FootbagMoves source). Its `modifier_links` omit the gyro spin. The gap originates in the additions source row, whose modifier-link field reads `fairy|symposium`:

```
genuphobia,7,torque,compound,fairy spyro symposium torque,fairy|symposium,"A symposium torque entered fairy-side with a spyro spin.",...
```

**Canonical token:** `gyro` (38 existing links; e.g. mobius, big-apple, gyro-butterfly). `spyro` is not a recognized modifier (0 links) - it is the source's spelling of the gyro spin. The tracked name confirms: "Fairy Gyro Symposium Torque (Genuphobia)".

**Correction:** the additions modifier-link field `fairy|symposium` -> `fairy|gyro|symposium`. `adds` stays 7 (explicit). After a pipeline reload, genuphobia carries three links and recomposition closes at 7.

**Scope / safety:** this is a trick-definition change to source data, reload-gated. It does not change `adds` or the notation (already backfilled and correct); it only aligns the link table with the name, aliases, description, and content-layer reading. Apply in a data pass, not silently from this document.

## Fix 2 - systemic furious modifier-link gap (5 tricks)
Investigating the `rage` mismatch surfaced a cohort-wide gap. `rage` is Furious Symposium Mirage (`furious(2) + symposium(1) + mirage(2) = 5`); its links record only `[symposium]`, omitting `furious`. Recounting the furious cohort by name/aliases shows this is systemic:

**Furious cohort (notation-missing) = 6: clown-face, furious, fury, genesis, nebula, rage.** Only `fury` carries the `furious` link. The other **five (clown-face, furious, genesis, nebula, rage)** have "furious" in the name/aliases but no `furious` modifier link.

**Correction:** add `furious` to the modifier-link field of those five additions rows (e.g. rage `symposium` -> `furious|symposium`). `furious` is a recognized token (`fury`, `nemesis` carry it). `adds` is unchanged.

**Distinction from Fix 1:** `gyro` is a +1 bracket modifier, so genuphobia's notation was cleanly backfillable. `furious` is a **deferred named-set operator** (`(furious set) >>`, +2), so these five stay notation-deferred with the furious cohort even after the link fix - the fix only corrects cohort membership and modifier-based queries, not notation. railing and surfing have no such link gap (their cohorts link cleanly).

**Dashboard impact:** the deferred-class furious count is **6, not 1** - the earlier link-based count undercounted it by exactly this gap.

## Not gaps (recorded so they are not re-flagged)
The recomposition scan flagged ~26 tricks where stated `adds` exceeds a +1-per-link estimate. Two distinct things are in play, and only one is a gap:
- **ADD is operator-defined, not +1 (expected, not a gap):** surfing (+3), railing (+2), shooting (+3), nuclear (+2), furious (+2), warping (+3), floating (+3), splicing (+2), blurry, illusioning, and the atomic/quantum X-Dex doctrine. The +1-per-link estimator simply does not model these.
- **Missing link (a real gap):** genuphobia (Fix 1) and the five furious-cohort rows (Fix 2). Here the modifier is absent from the link table entirely, independent of how its ADD is counted.
