# Wave Alpha Phase 4 — Wave Beta + Completion (2026-05-24)

Opens the next tier of promotions from the 158-row remaining Tier-1
`promote_with_notation` pool beyond Wave Alpha's initial 30. Adds 13
new canonical-row promotions and completes one Phase 3 deferral.
**4,122 tests passing.**

## What was implemented

The remaining Tier-1 promote-with-notation pool had 158 candidates
after Phase 1+2. Scoring shows 91 candidates score +6 and 6 score +7 —
substantial unused signal. Phase 4 filters this pool by:

- score ≥ +5 (same threshold as Wave Alpha)
- `best_notation_source = fborg` AND `is_canonical_bracket = true`
  (safest source; no convention translation needed)
- ADD-math sanity: `[TOKEN]` bracket count == official ADD claim
- `base_trick` exists as a canonical-DB row
- All modifiers in the slug appear in `freestyle_trick_modifiers`
  (no unregistered modifiers)
- ≤ 2 modifier-prefix tokens

This yields 13 new promotions across 11 families. Plus 1 backfill
completion (`legover`) via Stanford translation.

## The 13 Phase 4 promotions

### New families introduced (not in Wave Alpha)

| Family | Slug | ADD | Op-notation | ADD math |
|---|---|---:|---|---|
| barfly | `ducking-barfly` | 5 | `CLIP > DUCK [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` | ducking(+1) + barfly(4) = 5 |
| drifter | `quantum-drifter` | 4 | `TOE > OP IN [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]` | quantum(+1) + drifter(3) = 4 |
| eclipse | `atomic-eclipse` | 4 | `TOE > OP OUT [DEX] > (JUMP) [BOD] > OP INSIDE [DEL] > OP TOE [DEL]` | atomic(+1 non-rot) + eclipse(3) = 4 |
| eclipse | `miraging-eclipse` | 4 | `SET > OP IN [DEX] > (JUMP) [BOD] > OP INSIDE [DEL] > OP TOE [DEL]` | miraging(+1) + eclipse(3) = 4 |
| eclipse | `pixie-eclipse` | 4 | `TOE > SAME IN [DEX] (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]` | pixie(+1) + eclipse(3) = 4 |
| paradon | `pixie-paradon` | 5 | `TOE > SAME IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME TOE [DEL]` | pixie(+1) + paradon(4) = 5 |
| ripwalk | `paradox-ripwalk` | 5 | `CLIP > SAME IN [PDX] [DEX] (plant) > OP OUT [DEX] > OP CLIP [XBD] [DEL]` | paradox(+1) + ripwalk(4) = 5 |
| torque | `symposium-torque` | 5 | `SET > (NO PLANT WHILE) OP IN [DEX] [BOD] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]` | symposium(+1) + torque(4) = 5 |
| swirl | `stepping-whirling-swirl` | 5 | `CLIP > OP IN [DEX] (plant) > SAME IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` | stepping(+1) + whirling(+1) + swirl(3) = 5 |
| clipper-stall | `fairy-clipper` | 3 | `TOE > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]` | fairy(+1) + clipper-stall(2) = 3 |

### Existing-family additions (deeper compounds in Wave Alpha families)

| Family | Slug | ADD | Op-notation | ADD math |
|---|---|---:|---|---|
| mirage | `stepping-ducking-mirage` | 4 | `CLIP > OP IN [DEX] > DUCK [BOD] > SAME IN [DEX] > SAME TOE [DEL]` | stepping(+1) + ducking(+1) + mirage(2) = 4 |
| illusion | `bubba` | 2 | `CLIP > OP OUT [DEX] > OP TOE [DEL]` | folk-named clipper-entry variant of illusion; structural ADD matches illusion(2) |
| butterfly | `butterfly-kick` | 3 | `SET > JUMP [BOD] > SAME or OP OUT [DEX] > OP CLIP [XBD]` | kick variant of butterfly; [BOD]+[DEX]+[XBD] = 3 ADD (no DEL because kick not stall) |

## Phase 4 backfill (1 row)

| Slug | ADD | Op-notation | Source |
|---|---:|---|---|
| `legover` | 2 | `SET > OP OUT [DEX] > SAME TOE [DEL]` | Stanford `*.-0+Z` (STANFORD_TOKEN_DICT translation; resolves Phase 3 deferral by going Stanford rather than the originally-preferred passback prose source) |

## Trick_family overrides (4 rows)

Per the loader-19 no-transitive-inheritance forever-rule, when
`base_trick` itself sits in a different family the new row's default
`trick_family = base_trick` must be overridden:

| Slug | base_trick | base_trick.trick_family | override to |
|---|---|---|---|
| `ducking-barfly` | `barfly` | `infinity` | `infinity` |
| `quantum-drifter` | `drifter` | `clipper-stall` | `clipper-stall` |
| `paradox-ripwalk` | `ripwalk` | `butterfly` | `butterfly` |
| `symposium-torque` | `torque` | `osis` | `osis` |

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +13 rows.

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +32 rows:

- 13 `operational_notation` rows for new promotions
- 13 `operational_notation_source` rows for new promotions
- 4 `trick_family` overrides
- 1 `operational_notation` row for legover backfill
- 1 `operational_notation_source` row for legover backfill

## Verification performed

1. **ADD-math sanity check.** Pre-write Python check confirmed all 14
   translations satisfy `bracket_count == official_add`.
2. **CSV append.** Pre-load conflict check confirmed zero existing
   freestyle_tricks rows for the 13 promotion slugs.
3. **Loader applied.** `19_load_red_additions.py` ran cleanly; 189
   Red additions total (176 from Phase 3 baseline + 13 new); 402
   corrections applied. Only pre-existing skips (`double-knee.*`,
   `peak-delay.*`).
4. **DB state verified.** All 14 slugs present with correct
   `adds`/`base_trick`/`trick_family`/`operational_notation`. All 4
   family overrides applied (ducking-barfly→infinity, quantum-drifter
   →clipper-stall, paradox-ripwalk→butterfly, symposium-torque→osis).
5. **Tests.** `npm test` → 4,122 tests passing across 230 test files;
   no regressions.

## Still-deferred candidates (carried over from Phase 3)

| Slug | Reason | Action class |
|---|---|---|
| `walk-over` | Passback source is pedagogical prose; no canonical-bracket precedent | Curator authors canonical-bracket form |
| `rake` | Stanford `Z.R` uses atomic-token `R` (rake-primitive); decomposition non-mechanical | Curator authors canonical-bracket form |
| `inspinning-osis` | `inspinning` modifier not in `freestyle_trick_modifiers`; FM (3) and Stanford (4) disagree on ADD | Doctrine: register modifier + reconcile ADD |

Other unregistered-modifier candidates (parked):

- `blistering-whirl`, `inspinning-butterfly`, `inspinning-paradox-illusion`,
  `inspinning-paradox-mirage` — promote only after curator registers
  `blistering` and `inspinning` modifiers in `freestyle_trick_modifiers`.

## Cumulative Wave Alpha state

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational backfill | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions | 16 | 44 |
| Phase 3 | mechanical backfill translations | 20 | 64 |
| Phase 4 | Wave Beta + completion | 14 | **78** |

**78 canonical rows touched.** Breakdown:

- 36 notation backfills (15 mini-wave + 20 Phase 3 + 1 Phase 4) → existing canonical rows gain op_notation
- 42 new canonical-row promotions (13 Phase 1 + 16 Phase 2 + 13 Phase 4) → new compound entries with full notation

Families coverage after Phase 4: illusion, pickup, eggbeater, legover,
whirl, mirage, osis, barfly, drifter, eclipse, paradon, ripwalk,
torque, swirl, clipper-stall, butterfly — **16 families touched**.

## Remaining frontier opportunity

Of the original 393-slug ≥4-source frontier:

- ~78 canonical rows touched in Wave Alpha + Beta
- ~74 high-score (+5 to +7) candidates still unpromoted, mostly:
  - FM-parens source needing translation (still mechanical, just more work)
  - Some unregistered-modifier candidates blocked on doctrine
- Lower-score (≤+4) candidates in the broader Tier-1 pool
- 156 Tier-2 single-filter-fail rows (PassBack-vs-IFPA divergence)

Available for future Wave Gamma / Wave Delta cycles.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No new modifiers registered in `freestyle_trick_modifiers`
- ❌ No passback-prose-to-canonical-bracket authoring
- ❌ No doctrine adjudication on unregistered modifiers
  (`blistering`, `inspinning`)
- ❌ No new automatic-translation rules (all translations follow
  pre-documented STANFORD_TOKEN_DICT + dual-convention rule +
  registered-modifier arithmetic + ADD-math verification)
