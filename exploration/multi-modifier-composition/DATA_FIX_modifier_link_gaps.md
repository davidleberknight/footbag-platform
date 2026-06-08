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

## Possible sibling (needs separate review, not part of Fix 1)
- `rage`: stated `adds=5`, links `[symposium]`, base `mirage` -> recomposes to 3 (a 2-ADD gap). May have two missing links or be a named compound; review before any change.

## Not gaps (recorded so they are not re-flagged)
The recomposition scan flagged ~26 tricks where stated `adds` exceeds a +1-per-link estimate. All but genuphobia (and possibly rage) are **named-set or multi-ADD operators** whose ADD comes from the operator definition, not +1 per link: surfing (+3), railing (+2), shooting (+3), nuclear (+2), furious (+2), warping (+3), floating (+3), splicing (+2), blurry, illusioning, and the atomic/quantum X-Dex doctrine. These are expected, not data gaps; the +1-per-link estimator simply does not model them.
