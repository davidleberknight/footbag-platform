# Dictionary browse cleanup + INCOMPLETE authoring queue

Read-only analysis. Produced after the browse-cleanup change set. Source of
truth: `database/footbag.db` (freestyle_tricks) + the TS resolver
(`resolveOperationalNotationRaw`: CoreTrickSpec -> RESOLVED_FORMULAS_SPRINT_1 ->
DB op_notation).

## Status taxonomy (ratified)

- **COMPLETE** = canonical + resolved JOB / decomposition.
- **INCOMPLETE** = canonical + adjudicated, but JOB / decomposition not yet
  authored. Stays visible in canonical browse; carries an `INCOMPLETE` badge.
- **EMERGING VOCABULARY** = external / unadjudicated (is_active=0,
  review_status='pending'). Excluded from canonical browse.

## What shipped in the browse cleanup

- Canonical browse (By ADD and the views derived from the same buckets) now
  **excludes external/unadjudicated placeholders** (the 34 is_active=0 +
  pending rows that showed "External source, not yet adjudicated"). They no
  longer appear on any canonical browse surface.
- Canonical-but-incomplete tricks **stay visible**; they are not hidden merely
  for lacking a JOB.
- The "canonical decomposition pending" prose was replaced by a simple
  **INCOMPLETE** badge on browse rows and first-class cards.
- Secondary ADD ordering in By Dex Count / By Movement System / Movement
  Neighborhoods now renders visible `N ADD` band headers.
- By modifier and By movement system each carry a one-line note explaining that
  their per-grouping totals are different lenses and are not expected to match.

## The INCOMPLETE authoring queue (16 tricks)

These are active, adjudicated (expert_reviewed) canonical tricks for which the
resolver returns no JOB notation, so they render the INCOMPLETE badge. Grouped
by what is blocking authorship.

### Missing operator definition (11)

The operator token in the name is not yet defined (no ADD weight / chassis /
parity), so no notation can be authored without first defining the operator.

`blazing` (operator undefined) — 8:
| slug | base | family | ADD |
|---|---|---|---|
| blazing-butterfly | butterfly | butterfly | 4 |
| blazing-drifter | drifter | drifter | 4 |
| blazing-illusion | illusion | illusion | 3 |
| blazing-legover | legover | legover | 3 |
| blazing-mirage | mirage | mirage | 3 |
| blazing-symposium-mirage | mirage | mirage | 4 |
| blazing-torque | torque | torque | 5 |
| blazing-paradox-whirl | whirl | whirl | 5 |

`terraging` (operator undefined) — 3:
| slug | base | family | ADD |
|---|---|---|---|
| terraging-illusion | illusion | illusion | 5 |
| terraging-legover | legover | legover | 5 |
| terraging-mirage | mirage | mirage | 5 |

Unblock: define `blazing` and `terraging` (ADD contribution + chassis parity).
Once defined, all 11 are mechanical sibling-composed notation.

### Missing modifier doctrine (2)

The operator is registered, but its compositional doctrine is unsettled, so the
chassis cannot be mirrored confidently.

| slug | base | family | ADD | blocker |
|---|---|---|---|---|
| blurry-torque | torque | torque | 6 | blurry-transitivity (how blurry composes onto a compound base) |
| blurry-whirl | whirl | whirl | 5 | blurry-transitivity |

### Contested interpretation (1)

| slug | base | family | ADD | blocker |
|---|---|---|---|---|
| paradox-blur | blur | mirage | 5 | double-paradox / paradox dex-direction unsettled (on the do-not-re-promote hold list) |

### Missing notation only (2)

Structure is settled; the row just needs its notation transcribed.

| slug | base | family | ADD | note |
|---|---|---|---|---|
| spyro | spyro | spyro | 1 | settled base (plant-before-dex gyro, not inspin); author the 1-bracket form |
| sole-survivor | whirl | whirl | 5 | whirl base + sole-surface catch; confirm the sole-surface token then author |

## Separate hygiene gap: DB op_notation not backfilled (15)

These 15 are active tricks whose DB `operational_notation` is empty but which
**resolve via RESOLVED_FORMULAS_SPRINT_1** in TypeScript, so they render their
JOB correctly and are NOT incomplete in the browse. They are listed only because
the DB column lags the TS overlay; backfilling the column from the resolver is a
data-hygiene task, not authoring:

liquifier, floatation, gyro-diving-clipper, down-double-down,
bill-ted-s-excellent-adventure, redwetter, hop-over, fairy-merkon, oh-wheely,
warp, witchdoctor, fairy-gyro-torque, fairy-ripstein, atomic-torque,
big-apple-sauce.

## Emerging Vocabulary wiring (done)

The 34 external placeholders are excluded from canonical browse AND now surface
on the Emerging Vocabulary page (`/freestyle/observational`) in a dedicated
"External / unadjudicated (database-tracked)" disclosure section. This is sourced
directly from the DB (`freestyleTricks.listExternalPending`: is_active=0 +
review_status='pending', non-modifier), kept distinct from the generated
observational universe (in_db=false) above it. They render as tracked names with
no canonical hashtag and no detail-page link, consistent with the rest of the
surface.
