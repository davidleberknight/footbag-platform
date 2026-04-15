# legacy_data

Historical footbag results pipeline. Produces the canonical relational dataset
covering 1980–present and loads it into the platform SQLite database.

---

## Quick start

```bash
cd ~/projects/footbag-platform/legacy_data
source .venv/bin/activate        # or footbag_venv / venv — auto-detected

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

Run from `legacy_data/`. The venv is detected automatically; set `VENV_DIR` to
override.

For exact stage order, script paths, and arguments, read `run_pipeline.sh` — it
is the source of truth.

---

## Pipeline modes

<<<<<<< HEAD
| Mode | Purpose | Mirror access? | Use when |
|------|---------|----------------|----------|
| `full` | Canonical backbone → phase NET → enrichment phases, end to end | Required | **Recommended** — full soup-to-nuts rebuild (current gold standard) |
| `canonical_only` | Canonical backbone only: mirror + curated → canonical CSVs → QC → workbook → seed → DB | Required | Updating source data, overrides, or identity lock |
| `enrichment_only` | Membership, clubs, persons enrichment phases only | Not required | Iterating on enrichment logic (requires canonical outputs already present) |
| `csv_only` | DB load from existing seed CSVs, then enrichment phases | Not required | No mirror access; canonical CSVs and seed must already exist on disk |
| `net_enrichment` | Net enrichment layer only | Not required | Rebuilding net tables against an already-loaded canonical DB |
=======
| Mode | What it runs | Mirror access? | Use when |
|------|-------------|----------------|----------|
| `full` | V0 backbone → net enrichment → phases C–G | Required | Full soup-to-nuts rebuild |
| `canonical_only` | V0 backbone: mirror + curated → canonical CSVs → QC → workbook → seed → DB | Required | Updating source data or overrides |
| `enrichment_only` | Phases C–G: membership, clubs, provisional persons, persons master, DB load | Not required | Iterating on enrichment logic (requires canonical outputs already present) |
| `csv_only` | DB load from existing seed CSVs + phases C–G | Not required | No mirror access; canonical CSVs and seed must already exist |
| `net_enrichment` | Net enrichment layer only — scripts 12→13→14 | Not required | Rebuild net teams/discipline groups (requires canonical DB loaded) |
>>>>>>> 7d430af ( feat: auto-resolve anomalies, viewer modernization, pipeline doc sync)

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

## Authoritative documentation

- `run_pipeline.sh` — authoritative for modes, stages, script paths, arguments.
- `CLAUDE.md` — pipeline rules, source hierarchy, QC requirements, non-negotiable
  constraints.
- `IMPLEMENTATION_PLAN.md` — current sprint status and release checklist.
