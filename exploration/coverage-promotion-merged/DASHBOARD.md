# Merged Coverage + Promotion Dashboard

Read-only. One board for both goals: topology coverage (notation present, audit-visible) and promotion-notation-readiness (notation gate cleared). Pending = notation written into red_corrections but not yet materialised into the DB by a pipeline reload.

## Overall
| metric | value |
|---|---|
| active tricks | 651 |
| notation in DB (audit-visible now) | 473 (72.7%) |
| notation written, reload-pending | 26 |
| projected coverage after reload | **76.7%** |
| notation-less remaining | 152 |

## Candidate families (promotion-priority lineages)
| family | members | DB notation | pending | missing | covered+pending % |
|---|---|---|---|---|---|
| whirl | 73 | 50 | 11 | 12 | 84% |
| mirage | 67 | 47 | 8 | 12 | 82% |
| butterfly | 48 | 33 | 7 | 8 | 83% |
| swirl | 24 | 13 | 0 | 11 | 54% |
| legover | 42 | 32 | 0 | 10 | 76% |
| illusion | 34 | 25 | 0 | 9 | 74% |
| osis | 37 | 28 | 0 | 9 | 76% |
| torque | 22 | 14 | 0 | 8 | 64% |

## Worked batches

- **whirl** (closed): 11 derived, 12 blocked.

- **mirage** (closed): 8 derived, 12 held.

- **butterfly** (closed): 7 derived, 8 held (3 stepping, 2 pixie, floating, railing, symposium-atomic placement).


## Unresolved blockers (notation gate)

- notation-missing across all active tricks: 152.

- Recurring no-precedent classes (would unblock multiple families at once): pixie/stepping entry grammar; the operators railing/furious/warping/floating/atomic; blurry (doctrine + per-trick ADD); named tricks with no decomposition.


## Go-forward (candidate-first)
Next by missing-member count: **swirl (11), legover (10), illusion (9), osis (9), torque (8)**. Same workflow: derive precedent-clear only, parser+ADD+terminal verify, write confident, log held, recompute.

