# CI smoke fixture: canonical_input

Tiny synthetic canonical_input subset consumed by the loader regression CI gate
(`scripts/ci/stage_loader_smoke_fixtures.sh` + `scripts/ci/assert_loader_row_counts.py`).

Not consumed by any production pipeline. Operators populate the real
`legacy_data/event_results/canonical_input/` via `bash scripts/deploy-local-data.sh`,
which is unaffected by these files.

## Contents

- 5 events (`2020_testfixture_alpha` through `2022_testfixture_epsilon`)
- 12 disciplines spanning `freestyle`, `net`, `consecutive` categories with both
  `singles` and `doubles` `team_type`
- 16 placement rows
- 23 participant rows (includes 4 doubles-net pairings so script 13 can build
  `net_team` rows)
- 8 persons with valid UUIDs; 3 have `member_id` populated so
  `load_legacy_members_seed.py` picks them up via the persons.csv gap-fill path

## Regenerating after a schema change

The fixture must satisfy:

1. Every NOT NULL / CHECK / FK constraint exercised by `07_build_mvfp_seed_full.py`
   and `08_load_mvfp_seed_full_to_sqlite.py`.
2. Every `MIN_ROWS` threshold in `scripts/ci/assert_loader_row_counts.py`.

When a schema change touches columns these fixtures populate, regenerate the
fixture by:

1. Add or rename the column in the relevant CSV(s) here.
2. Run `bash scripts/ci/stage_loader_smoke_fixtures.sh` then
   `bash scripts/reset-local-db.sh` locally.
3. Run `python3 scripts/ci/assert_loader_row_counts.py --db ./database/footbag.db`
   and confirm all 29 tables pass their thresholds.
4. If any threshold is too tight, either add fixture rows OR lower the threshold
   in the assertion script (and explain in the commit message).
