# freestyle/

The freestyle rebuild pipeline: the loaders and inputs that build the freestyle
dictionary tables from committed CSVs. This is the operational runbook. For what
the subsystem is and who owns each fact, read the maintainer guide,
`docs/FREESTYLE.md`.

## Authority warning

This pipeline is a pre-go-live and local-development tool, not a production edit
path. Before cutover the committed CSVs under `inputs/` were the source of truth.
After cutover the live production database is the single source of truth: freestyle
content is edited only through the audited admin curation surfaces, and this
rebuild is refused on a cutover-marked production host with no bypass. Use it to
build a local development database; never as a way to edit production content. The
cutover model is documented in DEVOPS_GUIDE.md (private GitHub repo).

## Quick start

```
freestyle/run_freestyle.sh [path/to/footbag.db]   # default: database/footbag.db
```

`run_freestyle.sh` is the source of truth for the run order; read it. It calls
`freestyle/_assert_dev_db.sh` first, which refuses any target other than a
development database (`database/footbag.db` or `database/footbag-ci.db`) with no
bypass flag, so the rebuild can never run against staging or production.

This is the routine refresh, and it is what to reach for. It reconciles the
committed inputs into the database that is already there, never deletes the
database file, and reaches a fixed point in one pass: a second run straight after
the first changes nothing. One exception to that: the records loader is additive
(see the catalog), so edits to existing records take effect only on a fresh
database build.

## What the refresh preserves, and what a reset destroys

These tables hold two kinds of data, and the difference decides which command you
want.

Everything built from `freestyle/inputs/` is reproducible. Delete it and a refresh
puts it back exactly as the committed files describe it.

Some of what these tables hold is not built from there at all. Curators author
movement notations onto Emerging Vocabulary rulings, publish canonical tricks
through the admin funnel, and resolve rulings against the tricks they create.
Those rows, and the aliases, source links and modifier links attached to them,
exist only in the database. No committed file carries them and nothing can restore
them.

The routine refresh preserves all of it. Each trick-producing loader upserts what
its own input carries; ownership is settled in a preflight pass before anything is
written, and recorded per row, so no producer can delete another's rows and none
can reach a curator's. Retirement runs last, over the complete map of what every
committed input wants, and removes only rows whose own producer has stopped
carrying them. The adjudication loader tops up the historical rulings a database
is missing and verifies the ones it has, refusing rather than repairing when a
historical fact disagrees.

Resetting the database is a different operation. `./run_dev.sh --reset`,
`--from-csv`, `--soup-to-nuts` and `--all-data`, and `scripts/reset-local-db.sh`
beneath them, delete the database file and rebuild it from committed inputs. That
is right when you want a clean slate and wrong the rest of the time. It discards
authored adjudication drafts, publication and resolution state, and
curator-created canonical tricks, along with the aliases, source links and
modifier links attached to them. Reach for a reset deliberately, never as a way to
refresh.

## Loader catalog (execution order)

Run in this order by `run_freestyle.sh`. QC 22 is a hard gate; 24 and 25 are
advisory. Rerun safety varies by what a loader owns: the trick, alias and
adjudication loaders reconcile against what is already there, while loaders whose
data is wholly derived from a committed file still replace their own rows.

| Step | Script | Input | Writes | Rerun safety |
|---|---|---|---|---|
| 1 | `loaders/10_load_freestyle_records_to_sqlite.py` | `inputs/curated/records/records_master.csv` | `freestyle_records` | Additive (`INSERT OR IGNORE`, no delete); edits need a fresh build |
| 2 | `loaders/11_load_consecutive_records_to_sqlite.py` | `inputs/curated/records/consecutives_records.csv` | `consecutive_kicks_records` | Idempotent |
| 3 | `loaders/16_preflight_trick_ownership.py` | the two curated trick inputs | `freestyle_tricks.trick_origin_producer` only | Read-mostly; refuses the whole refresh if a committed input wants a slug a curator owns or nobody has classified |
| 4 | `loaders/17_load_trick_dictionary.py --stage tricks` | `inputs/base_dictionary/{tricks,trick_modifiers}.csv` | `freestyle_tricks`, modifiers, sources, source links | Upserts its own rows; never clears the table |
| 5 | `loaders/19_load_red_additions.py` | `inputs/curated/tricks/red_additions_*.csv`, `red_corrections_*.csv` | tricks, aliases, source links, modifier links (expert overlays) | Upserts; enriching a row it did not create never takes ownership of it |
| 6 | `loaders/17_load_trick_dictionary.py --stage aliases` | `inputs/base_dictionary/{tricks,trick_aliases}.csv` | `freestyle_trick_aliases` (its own source only) | Runs here because an alias can only attach to a trick that exists, and before the intake, which reads the alias table |
| 7 | `loaders/20_link_footbag_org_sources.py` | `inputs/footbag_org_moves_snapshot.csv` | `freestyle_trick_source_links` (footbag.org matches) | Enricher; scoped to its own source |
| 8 | `loaders/21_load_footbag_org_pending_tricks.py` | `inputs/footbag_org_moves_snapshot.csv` | pending `freestyle_tricks` (`is_active=0`), aliases, source links | Inserts only names nothing already curated resolves to; upserts its own rows |
| 9 | `loaders/21a_load_alias_additions.py` | `inputs/base_dictionary/alias_additions.csv` | `freestyle_trick_aliases` | Enricher; scoped to its own rows |
| 10 | `loaders/21b_apply_alias_overrides.py` | `inputs/base_dictionary/alias_overrides.csv` | `freestyle_trick_aliases` (class and display) | Enricher; fails closed on an override whose alias is absent |
| 11 | `loaders/21c_retire_stale_tricks.py` | the complete desired ownership map | deletes stale committed `freestyle_tricks` rows | Runs last; removes only rows whose own producer stopped carrying them, never a curator's or an unclassified one, and fails closed on a surviving reference |
| 12 | `loaders/28_load_ev_adjudications.py` | `inputs/observational/EV_FORMULA_IDENTITY_ROWS.csv` | `freestyle_ev_adjudications` | Inserts missing historical rulings and verifies the rest; never writes over an existing row, and refuses rather than repairing a disagreement |
| 13 | `loaders/27_load_trick_tips.py` | `inputs/footbag_org_member_tips.ndjson` | `freestyle_trick_tips` | Replaces its own rows; wholly derived |
| 14 | `scripts/parse_freestyle_notation.py --apply` | reads `freestyle_tricks` | updates `structural_parse_json`, `computed_adds`, `add_formula_status` | Derived from the notation it reads |
| 15 | `loaders/26_load_symbolic_grammar.py` | `symbolic_grammar/*.csv` | the six `symbolic_*` tables | Replaces its own rows; wholly derived |
| 16 | `loaders/22_qc_trick_dictionary.py` | reads the DB | QC report in `out/` | Read-only; **hard gate**, non-zero exit aborts the refresh |
| 17 | `loaders/24_qc_freestyle_media_coverage.py` | reads the DB | coverage report | Read-only; advisory |
| 18 | `loaders/25_qc_media_tag_invariant.py` | reads the DB | tag-invariant report | Read-only; advisory |

## Artifacts: committed vs generated vs gitignored

- **Committed inputs** (`inputs/`, `symbolic_grammar/`): the base-dictionary CSVs,
  the curated expert overlays, the records masters, the footbag.org snapshot and
  member-tips file, and the symbolic-grammar CSVs. The source of truth pre-cutover.
- **Sealed provenance input** (committed, not consumed): see below.
- **Generated content** (committed, but produced by a generator, never hand-edited):
  the TypeScript content modules under `src/content/` for the observational
  universe and tracked names. A committed-content drift guard
  (`scripts/ci/assert_generated_content_current.sh`) fails the build if they fall
  out of date with the corpus.
- **Gitignored build artifacts** (`out/`, `reports/`): QC output, never committed.

## Refreshing the footbag.org snapshot (pre-cutover only)

```
python3 freestyle/scripts/18_scrape_footbag_org_moves.py --live
```

Re-scrapes the live site and overwrites `inputs/footbag_org_moves_snapshot.csv` for
review and commit. Without `--live` the script is a no-op. The rebuild never
scrapes; it reads the committed snapshot.

## Regenerating the generated TypeScript content

The observational-universe and tracked-names content modules are regenerated from
the corpus by their generators under `freestyle/scripts/`
(`build_observational_universe_content.py`, `build_tracked_names_content.py`), a
manual dev-time step. Regenerate them rather than hand-editing; the drift guard
above enforces this.

## Symbolic-layer regeneration and its restricted authority

Loader 26 loads six committed `symbolic_grammar/*.csv` into the six `symbolic_*`
tables; the runtime reads them from the database, not from disk. The committed
spreadsheets are authoritative and the database is a rendered copy; the loader must
not run inside a general live-database rebuild that would overwrite unrelated in-app
curation. All but `glossary_crosslinks.csv`, which is hand-authored, are regenerated
by `scripts/build_symbolic_grammar_2.py` reading the database read-only, a manual
dev-time step, not part of the rebuild. (Whether every committed
`symbolic_grammar` CSV is wired into loader 26 or held for a future step is recorded
with the maintainer's decision when made.)

## Sealed provenance input

`inputs/footbag_org_moves_metadata.ndjson` is 303 rows of footbag.org move metadata
(pronunciation, author/holder, and similar), extracted from the legacy dump by
`legacy_data/scripts/extract_footbag_org_moves_metadata.py`. It is preserved
provenance: a sealed archive artifact (immutable, recorded in the legacy-archive
seal manifest) and a future source for upgrading trick descriptions. No loader
consumes it, so the rebuild never reads it.

## exploration/ fence

The build never reads the repository-root `exploration/` tree. That tree is
research and dated working history only, and is never a required build input.

## Layout

- `loaders/` - the DB loaders (filenames keep their legacy numbers).
- `scripts/` - the gated footbag.org scrape, the notation parser, and the content
  generators.
- `inputs/` - committed pipeline inputs.
- `symbolic_grammar/` - committed symbolic-layer CSVs.
- `doctrine/` - the doctrine of record (index: `doctrine/README.md`).
- `tools/` - trick-video discovery and coverage prep.
- `out/`, `reports/` - gitignored build artifacts.

## Where to read next

- `docs/FREESTYLE.md` - the maintainer guide: subsystem orientation, authority
  boundaries, the table-level data model, and the doc map.
- DEVOPS_GUIDE.md (private GitHub repo) - operational commands, the cutover
  model, deploy, backup, and rollback.
- `docs/DATA_MODEL.md` - the platform data model.
- `database/schema.sql` - column-level detail for every table.
- `freestyle/doctrine/README.md` - the doctrine index.
- `freestyle/CLAUDE.md` and the path-scoped `.claude/rules/*` - the governing
  agent-facing rules for this subtree.
