# legacy_data

Historical footbag results pipeline. Produces the canonical relational dataset
covering 1980–present and loads it into the platform SQLite database.

---

## Quick start

```bash
cd ~/projects/footbag-platform/legacy_data
source .venv/bin/activate        # or footbag_venv / venv — auto-detected

./run_pipeline.sh full           # soup-to-nuts (mirror access required)
./run_pipeline.sh canonical_only # canonical pipeline only → workbook + DB load (mirror access required)
./run_pipeline.sh enrichment_only# enrichment phases only (requires canonical outputs already present)
./run_pipeline.sh csv_only       # load DB from existing CSVs + run enrichment (no mirror access needed)
```

Run from `legacy_data/`. The venv is detected automatically; set `VENV_DIR` to
override.

---

## Pipeline modes

| Mode | What it runs | Mirror access? | Use when |
|------|-------------|----------------|----------|
| `canonical_only` | V0 backbone: mirror + curated → canonical CSVs → QC → workbook → seed → DB | Required | Updating source data or overrides |
| `enrichment_only` | Phases C–F + G: membership enrichment, clubs pipeline, provisional persons, persons master, DB load | Not required | Iterating on enrichment logic (requires canonical outputs already present) |
| `full` | `canonical_only` then `enrichment_only` in sequence | Required | Full soup-to-nuts rebuild |
| `csv_only` | DB load from existing seed CSVs + Phases C–F + G | Not required | No mirror access; canonical CSVs and seed must already exist |

### canonical_only (V0 backbone)

Seven stages in order, **fails fast on QC hard failures** (stages 5–7 never run
if QC returns exit 1):

| # | Stage | Output |
|---|-------|--------|
| 1 | Rebuild | mirror + curated → `out/stage2_canonical_events.csv` |
| 2 | Release | identity lock + export → `out/canonical/*.csv` + platform export |
| 3 | Supplement | `02p5b_supplement_class_b.py` → Placements_Flat workbook completeness |
| 4 | QC gate | `pipeline/qc/run_qc.py` — exit 1 on any hard failure |
| 5 | Workbook | `pipeline/build_workbook_release.py` → `out/Footbag_Results_Release.xlsx` |
| 6 | Seed build | `event_results/scripts/07_build_mvfp_seed_full.py` → `event_results/seed/mvfp_full/` |
| 7 | DB load | `event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py` → `database/footbag.db` |

### enrichment_only (Phases C–F + G)

Runs a preflight check first (exits if required canonical outputs are missing):

| Phase | What it does | Output |
|-------|-------------|--------|
| C | Membership enrichment | `membership/out/` |
| D | Club inference pipeline | `clubs/out/` |
| E | Provisional persons | `persons/provisional/out/` |
| F | Persons master | `persons/out/persons_master.csv` |
| G | Enrichment DB load | `historical_persons` (PROVISIONAL), `legacy_club_candidates`, `legacy_person_club_affiliations` |

### csv_only (DB load + Phases C–F + G)

For use **without mirror access**. Requires that canonical CSVs and seed files already
exist on disk (produced by a prior `canonical_only` run).

Preflight checks for:
- `event_results/canonical_input/{events,event_disciplines,event_results,event_result_participants,persons}.csv`
- `event_results/seed/mvfp_full/seed_{events,event_disciplines,event_results,event_result_participants,persons}.csv`
- `membership/inputs/membership_input_normalized.csv`
- `seed/clubs.csv`, `seed/club_members.csv`

Then runs:
1. DB load from existing seed (`08_load_mvfp_seed_full_to_sqlite.py`)
2. Phases C → D → E → F → G (enrichment + enrichment DB load)

Does **not** re-run QC, the workbook, or mirror/curated extraction.

---

## Authoritative documentation

Full pipeline rules, source hierarchy, QC requirements, and non-negotiable
constraints are documented in `CLAUDE.md`.

The current sprint status and release checklist are in `IMPLEMENTATION_PLAN.md`.
