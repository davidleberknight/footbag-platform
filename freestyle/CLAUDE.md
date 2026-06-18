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
- **Loaders are DELETE+INSERT, idempotent, with honest counters.** `run_freestyle.sh`
  is safe to re-run.
- **Read inputs from `freestyle/inputs/`.** When adding a loader input, put the
  file under `freestyle/inputs/` and reference it via `SCRIPT_DIR.parent` (the
  `freestyle/` root), not `legacy_data/`.
- **Shared helpers live in `scripts/`.** `_trick_canonicalization.py` and
  `_trick_tag_invariant.py` are shared with the curator-media seeder; the QC
  loaders import them via `REPO_ROOT/scripts`. Do not duplicate them here.

## Run / verify

```
freestyle/run_freestyle.sh            # rebuild against database/footbag.db
```

The trick-dictionary QC (`22_*`) is a hard gate; the media-coverage QC (`24_*`,
`25_*`) is advisory (it audits the curated media layer, not the table rebuild).

## Never

- Never reach back into `legacy_data/` for inputs or code at build or request time.
- Never commit `out/` or `reports/` (gitignored build artifacts).
- Never run `git commit` / `push` / `pull` — stage only; the human owns commits.
