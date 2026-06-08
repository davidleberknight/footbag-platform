# Merged Coverage + Promotion Dashboard

Read-only. One board for both goals: topology coverage (notation present, audit-visible) and promotion-notation-readiness (notation gate cleared). Pending = notation written into red_corrections, not yet reloaded into the DB.

## Overall
| metric | value |
|---|---|
| active tricks | 651 |
| notation in DB (audit-visible now) | 473 (72.7%) |
| notation written, reload-pending | 44 |
| projected coverage after reload | **79.4%** |
| notation-less remaining | 134 |

## Candidate families
| family | members | DB notation | pending | missing | covered+pending % |
|---|---|---|---|---|---|
| whirl | 73 | 50 | 14 | 9 | 88% |
| mirage | 67 | 47 | 11 | 9 | 87% |
| butterfly | 48 | 33 | 10 | 5 | 90% |
| swirl | 24 | 13 | 0 | 11 | 54% |
| legover | 42 | 32 | 1 | 9 | 79% |
| illusion | 34 | 25 | 1 | 8 | 76% |
| osis | 37 | 28 | 1 | 8 | 78% |
| torque | 22 | 14 | 0 | 8 | 64% |

## Worked batches

- **whirl/mirage/butterfly** (closed): 26 derived.

- **stepping+pixie grammar unlock** (closed): 18 derived (entry grammar ratified), 14 held (9 modifier-not-folded-into-base, 5 flagged multi-modifier chains).


## Unresolved blockers

- notation-less remaining: 134.

- The held 'modifier-not-folded-into-base' cases (stepping-diving-X, stepping-ducking-X, pixie-symposium-X) need full multi-modifier composition, not the set-swap; derivable with care in a follow-up. The flagged spinning-paradox chains + the named/operator tail (railing/floating/warping/furious) remain curator/source-dependent.


## Go-forward
The stepping+pixie entry grammar is reusable across every family. Resume family batches (swirl/legover/illusion/osis/torque), which now go deeper, plus a multi-modifier-composition pass for the 9 held modifier-not-folded cases.

