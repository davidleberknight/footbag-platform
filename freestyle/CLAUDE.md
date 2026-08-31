# CLAUDE.md — freestyle/

Local rules for the living freestyle pipeline.

## Scope

This subtree rebuilds the freestyle tables from committed inputs. It is the one
pipeline that survives the `legacy_data/` freeze, so it must stay self-contained:
read only from `freestyle/inputs/` (and `curated/` for media), never from
`legacy_data/`, and never from the live network.

## Invariants

- **No live fetch, no mirror.** The footbag.org move corpus is the committed
  `inputs/footbag_org_moves_snapshot.csv`. A refresh is an explicit, reviewed
  `scripts/18_scrape_footbag_org_moves.py --live` run that overwrites the
  snapshot; the rebuild never scrapes. The `check_no_live_pipeline_fetch.sh`
  guard enforces no new live fetch.
- **Two kinds of data live in these tables, and the refresh treats them differently.**
  Everything built from `freestyle/inputs/` is reproducible: delete it and a refresh
  puts it back. Some of it is not built from there at all. Curators author movement
  notations onto Emerging Vocabulary rulings, publish canonical tricks through the
  admin funnel, and resolve rulings against the tricks they create; none of that
  exists in any committed file, and nothing can restore it. The refresh reconciles
  the first and preserves the second.
- **The refresh reconciles and verifies in place; it does not clear and repopulate.**
  Each trick-producing loader upserts the rows its own input carries and stamps
  `trick_origin_producer` on insert, ownership settles in a preflight pass before
  anything is written, and retirement runs last over the complete desired map, so no
  producer can delete another's rows and none can reach a curator's. The adjudication
  loader inserts the historical rulings a database is missing and verifies the ones it
  has, refusing rather than repairing when a historical fact disagrees. Both are safe
  to re-run and reach a fixed point in one pass.
- **Loaders that still clear their whole table are the ones whose data is wholly
  derived**: records, consecutive records, modifier registry rows absent from the
  input, symbolic grammar, tips. The records loader is additive (`INSERT OR IGNORE`,
  no `DELETE`), so re-running it preserves existing record rows rather than replacing
  them, and a change to an existing record needs a fresh database build to take
  effect. Do not describe the pipeline as delete-and-insert; that was true before the
  tables held writable authority and is what made a destructive refresh look safe.
- **The record CSVs are hand-curated, not generated.**
  `inputs/curated/records/records_master.csv` and
  `inputs/curated/records/consecutives_records.csv` have no producing pipeline and no
  export back out, so those CSVs and the loaded tables are the only two authoritative
  copies: a correction is edited in the CSV and reloaded.
- **Read inputs from `freestyle/inputs/`.** When adding a loader input, put the
  file under `freestyle/inputs/` and reference it via `SCRIPT_DIR.parent` (the
  `freestyle/` root), not `legacy_data/`.
- **Shared helpers live in `scripts/`.** `_trick_canonicalization.py` and
  `_trick_tag_invariant.py` are shared with the curator-media seeder; the QC
  loaders import them via `REPO_ROOT/scripts`. Do not duplicate them here.

## Run / verify

```
freestyle/run_freestyle.sh            # the routine refresh, against database/footbag.db
```

This is the command to reach for. It reconciles the committed inputs into the
database that is already there, preserves everything a curator wrote, never
deletes the database file, and is safe to run as often as you like: a second run
straight after the first changes nothing. Run it on its own only when you are
keeping the database you have; every rebuild path runs it as one of its own
stages, so a rebuild is never followed by a separate refresh.

Resetting the database is a different operation and is not this. The reset paths
(`./run_dev.sh --reset`, `--from-csv`, `--soup-to-nuts`, `--all-data`, and
`scripts/reset-local-db.sh` beneath them) delete the database file and rebuild it
from committed inputs, which is exactly the right thing when you want a clean
slate and exactly the wrong thing otherwise: authored notation drafts, publication
and resolution state, curator-created canonical tricks and their aliases, source
links and modifier links are all discarded, and no committed file can bring them
back. Use a reset deliberately, not as a way to refresh.

The trick-dictionary QC (`22_*`) is a hard gate; the media-coverage QC (`24_*`,
`25_*`) is advisory (it audits the curated media layer, not the table rebuild).

## Never

- Never reach back into `legacy_data/` for inputs or code at build or request time.
- Never commit `out/` or `reports/` (gitignored build artifacts).
