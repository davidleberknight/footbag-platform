# legacy_data

Historical footbag results pipeline. Produces the canonical relational dataset
covering 1980–present and loads it into the platform SQLite database.

---

## Quick start

```bash
cd ~/projects/footbag-platform/legacy_data

./run_pipeline.sh full           # recommended: full rebuild (mirror access required)
./run_pipeline.sh canonical_only # canonical pipeline only (mirror access required)
./run_pipeline.sh enrichment_only# enrichment phases only (canonical outputs must exist)
./run_pipeline.sh csv_only       # DB load from existing CSVs + enrichment (no mirror needed)
./run_pipeline.sh net_enrichment # net enrichment layer only (canonical DB must be loaded)
```

`full` is the current gold-standard rebuild command. It runs the canonical
backbone, the net enrichment layer, and all enrichment phases in one invocation.
Prefer it over ad-hoc mode sequencing unless you specifically need a partial
rerun.

**A full run needs two gitignored, maintainer-only inputs** that a fresh clone does
not have (obtain them from the historical-pipeline maintainer's handoff): the
footbag.org mirror `legacy_data/mirror_footbag_org/`, and the IFPA membership roster
`legacy_data/membership/inputs/membership_input_normalized.csv`. The mirror is
required by `canonical_only` / `full` / `--soup-to-nuts`; the roster is required by
the membership-enrichment modes (`full` / `csv_only` / `enrichment_only`). Every
other input a full run reads is committed — the curated inputs under
`inputs/curated/`, the `overrides/`, the latest identity-lock snapshots, and the
`seed/` CSVs — so the mirror and the roster are the only two you must supply.

Run from `legacy_data/`. You need only `python3`: the pipeline creates the venv and
installs requirements automatically on every run (every stage runs inside the venv),
so no manual activation or `pip install` is needed. Set `VENV_DIR` to reuse an
existing venv.

For exact stage order, script paths, and arguments, read `run_pipeline.sh` — it
is the source of truth.

Refer to docs/DEV_ONBOARDING.md for runnning hello world without these files. 

---

## Data tiers and PII

What is committed vs maintainer-only, and when each is used:

**Tier 1, committed, runs the site (hello-world).** The committed canonical event
data (`event_results/canonical_input/*.csv`, real event results and historical
persons, `legacy_email` empty) plus the committed mirror-derived seed CSVs
(`seed/clubs.csv` for club names and locations;
`seed/club_members.csv` for member display names and aliases). These hold real
competitor and club names and results, treated as public for practical purposes
pre-go-live, with no emails, contact details, or membership status.
`bash scripts/reset-local-db.sh` builds entirely from these; no maintainer-only
archive is needed. The synthetic fixtures under `legacy_data/tests/fixtures/` are
a fallback the reset stages only if `canonical_input/` is absent.

**Tier 2 — gitignored, maintainer-only, full data path.**
- the **mirror** (`mirror_footbag_org/`) — footbag.org HTML crawl; used by
  `run_pipeline.sh full` / `canonical_only` to regenerate canonical data.
- the **footbag.org member dump** (the legacy-site export) — richer than the mirror
  (full member/payment/admin/committee records); the authoritative member data.
- the **IFPA membership roster** (`membership/inputs/membership_input_normalized.csv`)
  — a normalized extract of the IFPA "Show Members" export (member PII; operator
  handoff; not regenerable from the mirror). Read only by membership enrichment
  Phase C, i.e. `run_pipeline.sh full` / `csv_only` / `enrichment_only` (and
  `deploy-local-data.sh --soup-to-nuts` / `--from-csv`); the default
  `reset-local-db.sh` / `./run_dev.sh` skip it.

**Never commit member emails or pipeline-output snapshots.** Member contact emails
and membership status stay out of the repo. The `out/` dirs are gitignored, and so
are `clubs/snapshots/` and `legacy_data/snapshots/` — do not re-add point-in-time
pipeline snapshots (they have carried member emails). The operational pre-cutover DB
snapshot lives under `database/snapshots/` instead.

**Testing.** CI's `db-load-smoke` gate and `npm test` run against committed Tier-1
data only. A small set of tests needs Tier-2 data — the persona-crawl gate needs the
roster and skips on a clone without it; a tester who must run those gets the gitignored
roster from the maintainer who owns the legacy-data handoff.

---

## Script-consumed CSVs: committed vs gitignored

This lists only the CSVs the pipeline and loaders actually read. The
historical-pipeline maintainer produces many more interim CSVs as intermediate
steps; those, and everything under the gitignored `out/` trees, are byproducts,
not script inputs, and are never committed. The final, useful results are
committed as the curated, seed, and identity inputs below.

**One script input is gitignored (the member roster); every other CSV a script reads is committed.**

| CSV (path / glob) | Git | Read by | What it is |
|---|---|---|---|
| `membership/inputs/membership_input_normalized.csv` | **gitignored** | `membership/scripts/01_build_membership_enrichment.py` (phase C) | IFPA member roster (real member PII); operator handoff, not regenerable |
| `event_results/canonical_input/*.csv` (5 files) | committed | `reset-local-db.sh`, `run_pipeline.sh` canonical loaders | real committed competitor event data (event results and historical persons, `legacy_email` empty); the maintainer regenerates it from the mirror |
| `seed/clubs.csv`, `seed/club_members.csv`, `seed/clubs_url_verdicts.csv` | committed | `load_clubs_seed.py`, `load_club_members_seed.py` | mirror-derived club seed (names and locations) |
| `inputs/name_variants.csv` | committed | `load_name_variants_seed.py` | name-variant pairs (generated; only HIGH rows load) |
| `inputs/identity_lock/*.csv` | committed (older `Persons_Truth_Final_v*` / `Placements_ByPerson_v*` snapshots are gitignored; the latest of each is whitelisted) | `pipeline/identity/build_name_variants.py` | frozen identity lock (patch-toolchain only) |
| `inputs/bap_data_updated.csv` | committed | `build_name_variants.py` | Big-Add-Posse honor names |
| `inputs/canonical_discipline_fixes.csv` | committed | canonical pipeline | discipline-name corrections |
| `inputs/consecutives_records.csv`, `inputs/curated/**/*.csv` | committed | workbook, canonical | curated pre-1997 sources and records |
| `overrides/*.csv` | committed | `build_name_variants.py`, canonical pipeline | curated person and event overrides |

**Missing-input handling.** The gitignored member roster fails loudly with
guidance, never silently: `run_pipeline.sh` preflights it and aborts with a
how-to-obtain message, and `01_build_membership_enrichment.py` raises a clear
error before reading. `canonical_input` is committed, so it is present on every
clone; the `reset-local-db.sh` fallback stages the synthetic fixtures only if it
is somehow absent. The committed seed and name-variant loaders also error on a
missing or malformed file rather than crashing opaquely.

---

## Pipeline modes

| Mode | Purpose | Mirror access? | Use when |
|------|---------|----------------|----------|
| `full` | Canonical backbone → phase NET → enrichment phases, end to end | Required | **Recommended** — full soup-to-nuts rebuild (current gold standard) |
| `canonical_only` | Canonical backbone only: mirror + curated → canonical CSVs → QC → workbook → seed → DB | Required | Updating source data, overrides, or identity lock |
| `enrichment_only` | Membership, clubs, persons enrichment phases only | Not required | Iterating on enrichment logic (requires canonical outputs already present) |
| `csv_only` | DB load from existing seed CSVs, then enrichment phases | Not required | No mirror access; canonical CSVs and seed must already exist on disk |
| `net_enrichment` | Net enrichment layer only | Not required | Rebuilding net tables against an already-loaded canonical DB |

### Canonical backbone (`canonical_only` / included in `full`)

Extracts events from the footbag.org mirror and curated pre-1997 sources,
canonicalizes them into `out/canonical/*.csv`, runs a QC gate, builds the
release workbook, and loads the canonical seed into the platform SQLite DB.

**Fails fast on QC hard failures** — workbook, seed, and DB steps do not run
if QC reports hard errors. Fix at the source (parser, override, or curated CSV)
and re-run.

### Enrichment phases (`enrichment_only` / included in `full`)

| Phase | What it does | Output |
|-------|-------------|--------|
| C | Membership enrichment | `membership/out/` |
| D | Club inference pipeline | `clubs/out/` |
| E | Provisional persons | `persons/provisional/out/` |
| F | Persons master | `persons/out/persons_master.csv` |
| G | Enrichment DB load | `historical_persons` (PROVISIONAL), `legacy_club_candidates`, `legacy_person_club_affiliations` |

A preflight check runs first; if the required canonical outputs are missing,
the mode exits early.

### Net enrichment (`net_enrichment` / included in `full`)

Additive layer that reads canonical tables read-only and populates net-specific
enrichment tables (discipline groups, teams, appearances, review queue).
Requires the canonical DB to already be loaded.

### CSV-only rebuild (`csv_only`)

For use without mirror access. Loads the canonical seed from existing CSVs into
the DB, then runs the enrichment phases. Does not re-run QC, the workbook, or
mirror/curated extraction, and does not run phase NET.

---

## Script catalog

Ordered by what an operator runs most often. `legacy_data/run_pipeline.sh`
is the entry point for most pipeline work. The root `scripts/deploy-*.sh`
orchestrators wrap the pipeline plus the AWS staging deploy. Everything
below that is diagnostic tooling or individual stages for targeted
debugging.

### Level 1, the one you run every day

#### `legacy_data/run_pipeline.sh`
Main pipeline driver. Every routine pipeline operation goes through this
in one of the 5 modes listed above.
- Mirror required: yes for `full` and `canonical_only`; no for the rest
- Mutates DB: yes (`database/footbag.db`)
- Curated inputs: `overrides/`, `inputs/curated/`, `inputs/identity_lock/`, `seed/`, `inputs/name_variants.csv`
- Safe to rerun: yes; idempotent; fails fast on QC hard failure

### Level 2, root-level orchestrators

#### `scripts/deploy-local-data.sh`
Single orchestrator for local SQLite DB preparation. Wraps
`legacy_data/run_pipeline.sh` and `scripts/reset-local-db.sh` into one
entry point with explicit modes and preflight checks. Does NOT push to
AWS.

Modes (see `scripts/deploy-local-data.sh --help` for full detail):
- `--soup-to-nuts` delegates to `reset-local-db.sh` then
  `run_pipeline.sh full` (mirror required); drops and rebuilds the DB
- `--from-csv` delegates to `reset-local-db.sh` then
  `run_pipeline.sh csv_only` (mirror not required); drops and rebuilds
  the DB
- `--db-only` delegates to `scripts/reset-local-db.sh` (fastest, skips
  phase C/D/E/F/G; see `reset-local-db.sh` warning below)
- `--dry-run` prints what each mode would run

#### `scripts/deploy-to-aws.sh`
AWS staging deploy orchestrator. Composes `deploy-local-data.sh`,
`deploy-code.sh`, and `deploy-rebuild.sh`. Default with no flags is
code-only: it ships code and leaves the staging DB untouched (`-k` is the
explicit equivalent). A DB rebuild + staging replace is opt-in via
`--from-csv` / `--soup-to-nuts`. Each destructive step prompts before
acting (rebuild local DB, replace staging DB, wipe S3).

Modes (mutually exclusive; default = no flag = code-only):
- `-r, --reuse-local-db` ships current `database/footbag.db` as-is
- `-k, --keep-staging-db` doesn't touch the staging DB; code + media still ship

Modifiers:
- `-y, --yes` accepts every destructive prompt as default-yes (CI)
- `-W, --no-s3-wipe` skips the S3 wipe; still rsync new media bytes
- `-m, --sync-media` builds and pushes curated media to S3 (default off)
- `-n, --dry-run` prints planned actions; runs nothing
- `-h, --help` shows full usage

Combinations work: `-ryW` = reuse local DB, accept defaults, skip wipe.

#### `scripts/reset-local-db.sh`
Fastest path to a fresh `database/footbag.db`. Mirror-free: loads the
committed real canonical event data plus clubs and members from the
committed seed CSVs (falling back to the synthetic canonical-input
fixtures only if `canonical_input/` is somehow absent). Underlies
`deploy-local-data.sh --db-only` and the default path of
`deploy-rebuild.sh`.
- Mirror required: no — reads the committed `seed/clubs.csv` /
  `seed/club_members.csv` via `load_clubs_seed.py` and
  `load_club_members_seed.py` (the mirror extractors run from
  `run_pipeline.sh`, not here)
- Mutates DB: yes; fully destructive each run
- Does NOT run the phase C/D/E/F/G enrichment pipeline. Clubs and club
  members are seeded from the committed seed CSVs, which populate
  `legacy_club_candidates` and `legacy_person_club_affiliations`
  directly. Phase NET (scripts 12, 13, 14) and phase V
  (`load_name_variants_seed.py --apply`) DO run. Provisional
  `historical_persons` rows are not populated. Use `run_pipeline.sh
  csv_only` or `deploy-local-data.sh --from-csv` when you need the full
  enrichment.

### Level 3, QC and diagnostics

#### `legacy_data/pipeline/qc/run_qc.py`
Canonical QC gate. Exits 1 on any hard failure, which stops the pipeline.
Run standalone after any canonical rebuild, before committing
`out/canonical/`.

#### `legacy_data/pipeline/qc/check_alias_registry.py`
Alias registry validator. `--mode preflight` reports; `--mode gate` exits
1 on violation. Runs at the top of every `run_pipeline.sh` invocation.

#### `legacy_data/pipeline/qc/check_alias_duplicate_persons.py`
Detects duplicate persons caused by alias drift. See
`skills/cleanup-alias-pattern-c.md`.

#### `legacy_data/pipeline/qc/check_name_variants.py`
Structural QC for `inputs/name_variants.csv`. Runs inside `run_qc.py`.

#### `legacy_data/pipeline/event_comparison_viewerV13.py`
Builds `out/event_comparison_viewer_v13.html` for visual QC.

### Level 4, standalone builders and exports

#### `legacy_data/pipeline/build_workbook_release.py`
Builds `out/Footbag_Results_Release.xlsx`. Stage 5 of 7 inside the
pipeline; standalone invocation requires a completed rebuild + release +
QC pass. Rules and column mapping: `skills/workbook-v22.md`.

#### `legacy_data/pipeline/platform/export_canonical_platform.py`
Exports canonical CSVs to platform format
(`event_results/canonical_input/`). Inside the pipeline; also step 2 of
the identity rebuild workflow.

#### `legacy_data/pipeline/identity/build_name_variants.py`
Builds `inputs/name_variants.csv` deterministically from canonical plus
identity lock. Invoked inside `run_pipeline.sh`; safe to run standalone.

### Level 5, identity-chain individual scripts

Normally driven by `run_pipeline.sh` phases C, D, E, F. Run individually
during identity debugging per `skills/rebuild-identity-pipeline.md`.

| Script | Phase | Purpose |
|--------|-------|---------|
| `legacy_data/membership/scripts/01_build_membership_enrichment.py` | C | Build membership enrichment CSVs |
| `legacy_data/clubs/scripts/01_build_club_person_universe.py` | D | Build club person universe from seed + membership |
| `legacy_data/clubs/scripts/05_build_club_only_persons.py` | D | Identify club-only persons |
| `legacy_data/persons/provisional/scripts/01_build_provisional_persons_master.py` | E | Build provisional persons master |
| `legacy_data/persons/provisional/scripts/02_build_provisional_identity_candidates.py` | E | Generate provisional identity candidates |
| `legacy_data/persons/provisional/scripts/03_reconcile_provisional_to_historical.py` | E | Reconcile provisional to historical canonical |
| `legacy_data/persons/provisional/scripts/04_promote_provisional_to_historical_candidates.py` | E | Promote provisional to historical candidates |
| `legacy_data/persons/scripts/05_build_persons_master.py` | F | Build `persons/out/persons_master.csv` |

### Level 6, enrichment DB loaders

Inside `run_pipeline.sh` phase G; standalone use for targeted reload.

| Script | Purpose |
|--------|---------|
| `legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py` | Load historical_persons (PROVISIONAL), legacy_club_candidates, legacy_person_club_affiliations |

### Level 7, mirror extractors

Invoked by `legacy_data/run_pipeline.sh` (`full` / `canonical_only`);
standalone use after a mirror refresh.

| Script | Output | Rerun behavior |
|--------|--------|----------------|
| `legacy_data/scripts/extract_clubs.py` | `seed/clubs.csv` | skips if output CSV is newer than this script |
| `legacy_data/scripts/extract_club_members.py` | `seed/club_members.csv` | skips if output CSV is newer than this script |

### Level 8, mirror creation (rare)

#### `legacy_data/create_mirror_footbag_org.py`
Crawls `footbag.org` into `legacy_data/mirror_footbag_org/`. Long-running
(multi-day per its docstring); uses checkpointing to resume after
interruption, with progress/robots/log state anchored to the script
directory so a resume works from any working directory. The mirror
directory is gitignored.

The crawler captures the two live footbag.org content hosts: the main site
(`www.footbag.org`) at the archive-tree root and the WordPress vhost
(`sites.footbag.org`), whose pages map under a reserved `sites/<slug>/` prefix
inside that one tree. It loads every seed list in `mirror_seeds/` by default so
index-hidden content is captured (`--seeds` narrows to specific lists), and it
generates the archive navigation at the end of each run (an Archive Directory
page, per-area browse indexes, and a homepage card) so every captured page is
reachable by browsing.

Videos are skipped by default: video binaries dominated the previous crawl's
time and disk (each is ffmpeg re-encoded), so the page crawl runs without them
while every page, poster, thumbnail, caption, and document is still captured.
Each skipped video keeps its original URL in the mirror and is recorded
(deduplicated, with all referring pages) in
`mirror_footbag_org/skipped_videos.json` plus a human-readable
`skipped_videos_summary.txt`. Pass `--process-videos` to download and re-encode
videos during the crawl, or run `--video-backfill` afterward to fetch the
recorded videos and repair their referring pages from that manifest.

### Not catalogued

One-shot patch scripts under `legacy_data/tools/patch_*.py`, audit and
alias analysis tools under `legacy_data/pipeline/` not invoked by
`run_pipeline.sh`, the community workbook builder
(`build_workbook_community.py`, separate v13 lineage), and the
deprecated `mvfp` (not `mvfp_full`) seed lineage
(`event_results/scripts/06_build_mvfp_seed.py` and `verify_mvfp_seed.py`)
are not listed here. Each has a top-of-file docstring.

---

## Curated CSV register

These files are human-curated or human-maintained. Do NOT regenerate
blindly.

### Frozen (patch-toolchain only)
- `inputs/identity_lock/Persons_Truth_Final.csv`
- `inputs/identity_lock/Placements_ByPerson.csv`

### Append-only
- `inputs/identity_lock/Person_Display_Names_v1.csv` (add new person rows
  via the `promote-curated-source` workflow)

### Curated source data
- `inputs/curated/events/structured/*.csv` (pre-1997 structured event
  CSVs)
- `inputs/canonical_discipline_fixes.csv` (discipline name corrections)

### Overrides (all files in `overrides/` are curated)
- `overrides/person_aliases.csv`
- `overrides/event_rename.csv`
- `overrides/results_file_overrides.csv`
- `overrides/*.yaml` (per-person corrections)

### Generated but human-reviewable
- `seed/clubs.csv` (mirror-derived; will be superseded by the legacy-site
  data import)
- `seed/club_members.csv` (same)
- `inputs/name_variants.csv` (regenerated by `build_name_variants.py`;
  only HIGH-confidence rows reach the DB)

---

## Workflow picker

### Full rebuild from mirror (pipeline work)
```
cd legacy_data && . footbag_venv/bin/activate   # or .venv / venv; auto-detected
./run_pipeline.sh full
```

### Rebuild from CSVs, no mirror (pipeline work)
```
cd legacy_data && . footbag_venv/bin/activate
./run_pipeline.sh csv_only
```

### Local DB prep for AWS staging (operator)
```
bash scripts/deploy-local-data.sh --soup-to-nuts   # regenerate CSVs + build DB
bash scripts/deploy-local-data.sh --from-csv       # no mirror; build DB from CSVs
bash scripts/deploy-local-data.sh --db-only        # fast; skip phase C/D/E/F/G
```

### Enrichment-only iteration (pipeline work)
```
cd legacy_data && . footbag_venv/bin/activate
./run_pipeline.sh enrichment_only
```

### Identity-pipeline rebuild
See `skills/rebuild-identity-pipeline.md`.

### AWS staging deploy
```
bash deploy_to_aws.sh                               # default: code-only; staging DB untouched (prompts on schema drift)
bash deploy_to_aws.sh -k                            # explicit code-only; staging DB untouched
bash deploy_to_aws.sh -r                            # ship current local DB as-is
bash deploy_to_aws.sh --from-csv                    # rebuild local DB from committed CSVs (+ operator roster), replace staging
bash deploy_to_aws.sh --soup-to-nuts                # regenerate from legacy mirror, then ship
bash deploy_to_aws.sh -y                            # accept defaults non-interactively (CI)
bash deploy_to_aws.sh -n                            # dry run
bash deploy_to_aws.sh -ryW                          # combined: reuse, yes, no S3 wipe
```
The root `deploy_to_aws.sh` wrapper handles preflight (tools, SSH alias,
disk, DB lock, schema drift, credential file) and forwards args to
`scripts/deploy-to-aws.sh`. With no flags the deploy is code-only (the
staging DB is untouched); `--from-csv` / `--soup-to-nuts` opt into a DB
rebuild + staging replace, prompting before each destructive step.
The mirror-driven `--soup-to-nuts` path regenerates committed
`canonical_input/`, `name_variants.csv`, and `seed/` files; review with
`git status` before pushing.

---

## Cross-references (outside legacy_data)

- `scripts/deploy-local-data.sh`, local DB prep orchestrator
- `scripts/deploy-to-aws.sh`, two-step AWS staging deploy orchestrator
- `scripts/deploy-code.sh`, code-only deploy (used by `deploy-to-aws.sh -k` / `--keep-staging-db`)
- `scripts/deploy-rebuild.sh`, code + DB replacement deploy (used by `deploy-to-aws.sh` default mode and `-r` / `--reuse-local-db`)
- `scripts/deploy-migrate.sh`, future preserve-data migration deploy (stub)
- `scripts/smoke-local.sh`, HTTP smoke check (called by deploy scripts)
- `scripts/*.ts`, TS audit tools (auto-link, provenance, email collision, unresolved cohort)

---

## Authoritative documentation

- `run_pipeline.sh` — authoritative for modes, stages, script paths, arguments.
- `CLAUDE.md` — pipeline rules, source hierarchy, QC requirements, non-negotiable
  constraints.
- The maintainers' private tracker: current work status and the release checklist.
