# Merged Coverage + Promotion Dashboard

Read-only. Topology coverage + promotion-notation-readiness. Pending = written to red_corrections, not yet reloaded.

## Overall
| metric | value |
|---|---|
| active tricks | 651 |
| notation in DB | 473 (72.7%) |
| written, reload-pending | 87 |
| projected coverage after reload | **86.0%** |
| notation-less remaining | 91 |

## Worked
- 8 candidate families: 65 derivations.
- Grammar unlocks: pixie/stepping, tapping/>>-base, side-flip, composition-order, target-selection, fairy-separator (> default).
- Multi-modifier composition: Class-A 2 + side-flip 6 + target-selection 5 + fairy 8 + genuphobia backfill 1.


## Resolved but Deferred Notation Classes
Named-set tokenization cohort; lands together under one verification model.
| class | trick count | reason deferred | dependency |
|---|---|---|---|
| railing | 3 | named-set `+2` not bracket-tokenized | cohort JOB-tokenization + shared verification |
| surfing | 1 | same class | same |
| furious | 6 (clown-face, furious, fury, genesis, nebula, rage) | same class; 5 of 6 also miss the `furious` modifier link (see DATA_FIX_modifier_link_gaps.md) | same cohort tokenization + link fix |


## Data gaps / notes
- **genuphobia modifier-link gap** (filed: DATA_FIX_modifier_link_gaps.md): notation backfilled from the authoritative content layer (7 ADD: fairy + gyro + symposium + torque). The `modifier_links` table records only `[fairy, symposium]`; the gyro spin is missing (the source spells it "spyro"; `gyro` is the canonical token, 38 links, `spyro` 0), so link-based ADD recomposition under-counts by 1. Fix: the additions modifier-link field `fairy|symposium` -> `fairy|gyro|symposium`, reload-gated; notation and `adds` unchanged.
- **Systemic furious modifier-link gap** (filed: DATA_FIX_modifier_link_gaps.md, Fix 2): 5 of the 6 furious-cohort tricks (clown-face, furious, genesis, nebula, rage) carry "furious" in name/aliases but no `furious` modifier link. Add `furious` to those additions rows; reload-gated; `adds` and notation unchanged. Notation stays deferred with the furious named-set cohort. This is why the deferred-class furious count is 6, not 1.


## Remaining held multi-modifier
- atomic operator (1); fairy on multi-`>>` structural (fairy-merkon, fairy-ripstein); fairy-gyro-torque (flip co-modifier); composition-order residuals (margaritaville, spinning-miraging-symposium-torque, stepping-ducking-paradox-illusion); Class-C depth-4 + multi-`>>`; ~39 named tricks.

