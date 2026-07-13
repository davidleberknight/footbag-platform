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
cutover model is `docs/DEVOPS_GUIDE.md` section 15.6.

## Quick start

```
freestyle/run_freestyle.sh [path/to/footbag.db]   # default: database/footbag.db
```

`run_freestyle.sh` is the source of truth for the run order; read it. It calls
`freestyle/_assert_dev_db.sh` first, which refuses any target other than a
development database (`database/footbag.db` or `database/footbag-ci.db`) with no
bypass flag, so the rebuild can never run against staging or production.

The build is idempotent and safe to re-run, with one exception: the records loader
is additive (see the catalog), so edits to existing records take effect only on a
fresh database build.

## Loader catalog (execution order)

Run in this order by `run_freestyle.sh`. All mutations are `DELETE`+`INSERT`
(idempotent) except loader 10. QC 22 is a hard gate; 24 and 25 are advisory.

| Step | Script | Input | Writes | Rerun safety |
|---|---|---|---|---|
| 1 | `loaders/10_load_freestyle_records_to_sqlite.py` | `inputs/curated/records/records_master.csv` | `freestyle_records` | Additive (`INSERT OR IGNORE`, no delete); edits need a fresh build |
| 2 | `loaders/11_load_consecutive_records_to_sqlite.py` | `inputs/curated/records/consecutives_records.csv` | `consecutive_kicks_records` | Idempotent |
| 3 | `loaders/17_load_trick_dictionary.py` | `inputs/base_dictionary/{tricks,trick_modifiers,trick_aliases}.csv` | `freestyle_tricks`, modifiers, sources, source links, aliases | Idempotent |
| 4 | `loaders/19_load_red_additions.py` | `inputs/curated/tricks/red_additions_*.csv`, `red_corrections_*.csv` | tricks, aliases, source links, modifier links (expert overlays) | Idempotent |
| 5 | `loaders/20_link_footbag_org_sources.py` | `inputs/footbag_org_moves_snapshot.csv` | `freestyle_trick_source_links` (footbag.org matches) | Idempotent |
| 6 | `loaders/21_load_footbag_org_pending_tricks.py` | `inputs/footbag_org_moves_snapshot.csv` | pending `freestyle_tricks` (`is_active=0`), aliases, source links | Idempotent |
| 7 | `loaders/21a_load_alias_additions.py` | `inputs/base_dictionary/alias_additions.csv` | `freestyle_trick_aliases` | Idempotent |
| 8 | `loaders/21b_apply_alias_overrides.py` | `inputs/base_dictionary/alias_overrides.csv` | `freestyle_trick_aliases` (overrides) | Idempotent |
| 9 | `loaders/27_load_trick_tips.py` | `inputs/footbag_org_member_tips.ndjson` | `freestyle_trick_tips` | Idempotent |
| 10 | `scripts/parse_freestyle_notation.py --apply` | reads `freestyle_tricks` | updates `structural_parse_json`, `computed_adds`, `add_formula_status` | Idempotent |
| 11 | `loaders/26_load_symbolic_grammar.py` | `symbolic_grammar/*.csv` | the six `symbolic_*` tables | Idempotent |
| 12 | `loaders/22_qc_trick_dictionary.py` | reads the DB | QC report in `out/` | Read-only; **hard gate**, non-zero exit aborts the rebuild |
| 13 | `loaders/24_qc_freestyle_media_coverage.py` | reads the DB | coverage report | Read-only; advisory |
| 14 | `loaders/25_qc_media_tag_invariant.py` | reads the DB | tag-invariant report | Read-only; advisory |

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
curation. Those CSVs are regenerated by `build_symbolic_grammar_2.py` in
`legacy_data/scripts/` from in-pipeline inputs (`inputs/observational/` and the DB),
a manual dev-time step, not part of the rebuild. (Whether every committed
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
- `docs/DEVOPS_GUIDE.md` - operational commands, the cutover model, deploy, backup,
  and rollback.
- `docs/DATA_MODEL.md` - the platform data model.
- `database/schema.sql` - column-level detail for every table.
- `freestyle/doctrine/README.md` - the doctrine index.
- `freestyle/CLAUDE.md` and the path-scoped `.claude/rules/*` - the governing
  agent-facing rules for this subtree.
