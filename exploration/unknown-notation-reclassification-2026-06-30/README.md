# Unknown / notation-pending reclassification — 2026-06-30

Classification / IA artifact. Re-buckets the public **"Unknown"** dex-count population by its
real blocker today, so each row answers: **what is the next concrete action before it becomes
canonical?** No behavioral code changed.

> **NOTE — these are NOT promotions.** Every row here is an **already-active** `freestyle_tricks`
> row that merely lacks `operational_notation`. "Ready for Authoring" here means *backfill the
> op_notation on an existing canonical*, not *promote a new canonical*. Accordingly, all 18 Ready
> rows are **excluded from `../promotion-queue-2026-06-30/PROMOTION_QUEUE.csv`** by its
> canonical-overlap filter. This artifact is unaffected by the universe de-staling described in the
> promotion-queue README (its population comes from the live DB, not the observational universe).

## What "Unknown" is

The landing dex-count card labels a trick **"Unknown"** purely because its `operational_notation`
field is empty (`dexCount()` in `freestyleService.ts` → `'Unknown'`). It is a *missing-field*
artifact, not a real blocker. Population: **38 active `freestyle_tricks` with empty
`operational_notation`** (`spyro`, a dexless body atom, renders as `0`, not Unknown; the 10
`modifier`-category rows are excluded from the public bar by the `resolveTrickKind==='trick'`
filter — see below).

The codebase **already** has the right machinery: `classifyNotationBlocker()` → `BLOCKER_GROUPS`
(used in the add-analysis view) splits notation-less tricks into
`undefined-operator / governance / documented / needs-authoring / identification`. The landing
dex-count card just hasn't adopted it.

## Model (same five primaries as the frontier slice, + Identification)

Precedence: `Doctrine Blocked > Parser Limitation > Identification Needed > Needs Curator Review > Ready for Authoring`.
Flags stack: `notation_placeholder`, `operator_now_settled`, `undefined_operator`,
`verification_needed`, `operator_anchor`.

## Result (38 rows)

| Primary | count |
|---|---:|
| Ready for Authoring | 18 |
| Needs Curator Review | 11 |
| Doctrine Blocked | 9 |
| Parser Limitation | 0 |
| Identification Needed | 0 |

**~two-thirds of "Unknown" is stale.** The Ready rows have a known canonical ADD and a movement
JOB already written — only the symbolic operational notation is missing.

### Ready for Authoring (18) — move immediately
terraging family (`terrage`, `terraging_illusion`, `terraging_legover`, `terraging_mirage`),
`atomic_torque`, `paradox_blur`, `gyro_diving_clipper`, `blurry_torque`, `blurry_whirl`
(+`verification_needed`: approximate ADD), `liquifier`, `floatation`, `redwetter`, `warp`,
`witchdoctor`, `sole_survivor`, `spyro`, `bill_ted_s_excellent_adventure`, `oh_wheely`.

### Doctrine Blocked (9) — genuinely unresolved operator
All **`blazing`** (the only undefined operator with canonical rows here): the bare `blazing` anchor +
`blazing_butterfly`, `blazing_drifter`, `blazing_illusion`, `blazing_legover`, `blazing_mirage`,
`blazing_symposium_mirage`, `blazing_torque`, `blazing_paradox_whirl`.

### Needs Curator Review (11)
The 9 `modifier`-category operator anchors (`barraging`, `ducking`, `gyro`, `paradox`, `spinning`,
`stepping`, `symposium`, `tapping`, `terraging`) — operator definitions, not dex-tricks;
`down_double_down` (DDD, governance/verification); `big_apple_sauce` (genuine multi-reading
canonical choice).

## Recommendation on the public "Unknown" label — split + rename

Eliminate the raw **"Unknown"** bar; adopt the existing `classifyNotationBlocker` groups, which the
add-analysis view already uses:
- **"Operational notation pending"** (the ~18 Ready — movement JOB + ADD written) — honest, actionable.
- **"Blocked: undefined operator"** (blazing, 9).
- **"Blocked: curator / governance"** (DDD, big_apple_sauce).

Two refinements for the eventual code slice (not now): `classifyNotationBlocker` never returns
`identification` (dead branch), and `documented` lumps the one real canonical-choice row
(`big_apple_sauce`).

**Data-hygiene finding:** the 10 `modifier`-category rows are `is_active` `freestyle_tricks` with no
op_notation — operator *definitions*, not dex-tricks. Correctly excluded from the public bar, but
worth questioning whether they should be active trick rows at all (per the trick-termination rule,
modifier-only names are not tricks).

## Files / reproduction

- `CLASSIFICATION.csv` — columns: `slug, current_label, primary, flags, next_action, rationale,
  add, job, base, family`.
- `build_promotion_pipeline.py` — the deterministic generator (also builds the promotion queue).
  Reads `database/footbag.db`, the frontier artifact, and `freestyleObservationalUniverse.ts`.
  Run from repo root: `python3 exploration/promotion-queue-2026-06-30/build_promotion_pipeline.py`.
