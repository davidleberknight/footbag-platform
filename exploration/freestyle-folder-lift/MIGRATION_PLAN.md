# Freestyle pipeline → `freestyle/` folder lift — execution plan

## Why this is a go-live blocker

At cutover everything under `legacy_data/` freezes for good (read-only, no further writes). Freestyle is the **one pipeline that keeps living** past cutover, because freestyle content is curated from sources that are not footbag.org. So the freestyle pipeline must move out of the soon-frozen folder and become self-contained before the freeze, or freestyle curation dies at cutover. This is on the critical path to the `legacy_data/` freeze milestone.

## Acceptance gate (done when)

On a **fresh checkout with no mirror present**:
1. `freestyle/run_freestyle.sh` rebuilds every freestyle table from committed inputs.
2. The legacy pipeline (`reset-local-db.sh`, `run_pipeline.sh`) still runs with the freestyle steps removed.
3. Every `/freestyle/*` page renders; freestyle QC passes.
4. `npm run build` and the test suite are green.
5. No non-test pipeline script (outside the mirror builder) references a live external URL; a build check enforces this.
6. Nothing under `src/` reads `legacy_data/` at request time.

## Target layout

```
freestyle/
  run_freestyle.sh          # rebuilds all freestyle tables from committed inputs, no mirror needed
  README.md                 # what it is, how to run, where inputs come from
  CLAUDE.md                 # agent rules for the living freestyle pipeline
  loaders/                  # 10, 11, 17, 19, 21, 22, 24 (renamed/un-numbered as they leave the legacy sequence)
  scripts/                  # parse_freestyle_notation.py, build_symbolic_grammar_*.py, the one-time mirror scrape generator
  inputs/                   # curated/tricks, freestyle_reconciliation, records_master, consecutives, trick_aliases, scraped-moves snapshot
  symbolic_grammar/         # the staging CSVs (until loaded into DB) + the generator
  exploration/              # the keep-and-move subset of today's exploration/ folders
```

The mirror (`legacy_data/mirror_footbag_org/`, large + local-only) stays in `legacy_data/`; the freestyle build never reads it directly — see Slice 1.

---

## Slices (execution order)

Each slice lands independently with the build + tests green, so the lift can pause between slices without leaving a broken tree.

### Slice 1 — Make the pipeline deterministic and mirror-free (this is the "kill live scrape" item, as the first slice of the lift, not a one-off)

The freestyle build currently reaches the live internet and the local-only mirror, so it cannot satisfy "fresh checkout, no mirror present." Fix both in one slice.

1. `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py`: replace the live HTTP fetch with a read of the committed mirror (`legacy_data/mirror_footbag_org/`, the ~930 needed pages).
2. Run that mirror-fed scrape **once** and **commit its parsed output** as a static input (`freestyle/inputs/footbag_org_moves_snapshot.*`). `run_freestyle.sh` consumes the committed snapshot; it never scrapes and never needs the mirror.
3. `scripts/acquire_footbag_org_demos.py`: if the demo files are mirrored, point at the mirror; otherwise run it once before shutdown and commit its output.
4. `20_link_footbag_org_sources.py` only stores a footbag.org URL as source metadata (no fetch) — leave it.
5. Add a build check that fails if any non-test pipeline script (other than the mirror builder) references a live external URL: footbag.org, `footbaghalloffame.net`, `bigaddposse.com` (the last is fetched by `legacy_data/scripts/diff_live_honor_rosters.py`, which is opt-in and never wired into CI — scope the check accordingly).

Acceptance: a fresh checkout with the mirror moved aside rebuilds the freestyle move tables from the committed snapshot; the URL-guard check passes.

### Slice 2 — Cut the two request-time `legacy_data/` readers

A clean `legacy_data/` freeze requires nothing under `src/` reading it at request time. Two non-freestyle readers exist:
- `src/internal-qc/services/netQcService.ts` — reads `legacy_data/out/team_anomaly_worklist.csv` and `legacy_data/out/partner_graph.json` at request time.
- `src/testkit/legacyNewsInspectRoute.ts` — reads `legacy_data/` at request time.

Resolve each: cut the read (bake the data into the DB / a committed asset) or retire the QC/testkit subsystem. Both are internal-only surfaces, so retirement is viable. This slice is independent of the freestyle move and can run in parallel.

Acceptance: `grep -rn "legacy_data" src/` returns no request-time reads.

### Slice 3 — Inventory, move-map, and exploration triage (planning slice, no code moves yet)

1. Lock the file-by-file move-map (table below).
2. Triage the 115 `exploration/` folders into keep-and-move (active freestyle reference) vs archive (`exploration/_archive/`). Criterion: a folder is keep-and-move only if a current code path, the migration itself, or an open IP item depends on it; everything closed gets archived.
3. Decide the symbolic-grammar end-state: load the staging CSVs into the DB as clearly-marked observational tables (consumed by `symbolicGrammarService.ts`) instead of shipping the CSVs into the web image. Specify the table shape and the loader.
4. Specify the `run_freestyle.sh` contract (inputs it reads, tables it writes, the parser-population step that `reset-local-db.sh` omits today, the order).

Acceptance: the move-map and the run_freestyle.sh contract are reviewed and locked.

### Slice 4 — Execute the move (code edits outside `legacy_data/` are the maintainer's; James drives the plan)

1. Move the freestyle loaders/scripts/inputs per the move-map into `freestyle/`.
2. Author `freestyle/run_freestyle.sh` to rebuild every freestyle table from committed inputs (records, consecutives, trick dictionary, red additions, footbag.org-pending, symbolic grammar) and run the parser-population step.
3. Remove the freestyle steps from `reset-local-db.sh` (lines invoking loaders 10, 11, 17, 19) and from `run_pipeline.sh`; the legacy pipeline no longer builds freestyle tables.
4. Implement the symbolic-grammar DB load decided in Slice 3; drop the copy-into-image path.
5. Author `freestyle/README.md` and `freestyle/CLAUDE.md`.

Acceptance: `freestyle/run_freestyle.sh` on a fresh checkout builds the freestyle tables; the legacy pipeline runs clean without freestyle steps.

### Slice 5 — Verify the full acceptance gate

Fresh checkout, mirror moved aside → run `freestyle/run_freestyle.sh`, then `npm run build` and the freestyle + full test suites; load every `/freestyle/*` route; run freestyle QC (loader 22 / 24). All six acceptance criteria pass.

---

## File move-map

| From | To | Notes |
|---|---|---|
| `legacy_data/event_results/scripts/10_load_freestyle_records_to_sqlite.py` | `freestyle/loaders/` | invoked by reset-local-db |
| `legacy_data/event_results/scripts/11_load_consecutive_records_to_sqlite.py` | `freestyle/loaders/` | invoked by reset-local-db |
| `legacy_data/event_results/scripts/17_load_trick_dictionary.py` | `freestyle/loaders/` | invoked by reset-local-db |
| `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py` | `freestyle/scripts/` | becomes one-time mirror-fed generator (Slice 1) |
| `legacy_data/event_results/scripts/19_load_red_additions.py` | `freestyle/loaders/` | invoked by reset-local-db |
| `legacy_data/event_results/scripts/20_link_footbag_org_sources.py` | `freestyle/loaders/` | metadata only, no fetch |
| `legacy_data/event_results/scripts/21_load_footbag_org_pending_tricks.py` | `freestyle/loaders/` | |
| `legacy_data/event_results/scripts/22_qc_trick_dictionary.py` | `freestyle/loaders/` | QC |
| `legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py` | `freestyle/loaders/` | QC |
| `scripts/parse_freestyle_notation.py` | `freestyle/scripts/` | parser-population; reset-local-db omits it today |
| `scripts/acquire_footbag_org_demos.py` | `freestyle/scripts/` | one-time, mirror-fed (Slice 1) |
| `legacy_data/scripts/build_symbolic_grammar_master.py`, `build_symbolic_grammar_2.py` | `freestyle/scripts/` | + DB-load (Slice 3/4) |
| `legacy_data/inputs/curated/tricks/` | `freestyle/inputs/curated/tricks/` | red_additions, red_corrections CSVs |
| `legacy_data/freestyle_reconciliation/` | `freestyle/inputs/freestyle_reconciliation/` | incl. james_adjudications.csv |
| `legacy_data/inputs/curated/records/records_master.csv` | `freestyle/inputs/` | loader 10 input |
| `legacy_data/inputs/consecutives_records.csv` | `freestyle/inputs/` | loader 11 input |
| `legacy_data/inputs/noise/trick_aliases.csv` | `freestyle/inputs/` | loader 17 input |
| (new) scraped-moves snapshot | `freestyle/inputs/` | committed in Slice 1 |
| keep-and-move subset of `exploration/` | `freestyle/exploration/` | per Slice 3 triage |

## Ownership

- **James** owns the plan, the move-map, the exploration triage, the symbolic-grammar table design, and the `run_freestyle.sh` contract (Slices 1–3 + the design of 4).
- **The maintainer** makes the code edits outside `legacy_data/` (the request-time-reader cuts in Slice 2, and wiring in Slice 4).

## Risks

- The scraped-moves snapshot must be committed (Slice 1) or the "no mirror present" gate can never pass — repointing at the mirror alone is insufficient.
- Symbolic-grammar DB load is gated on the same expert/curator answers as the broader observational-tables move; if those are not ready, ship the lift with the CSVs still committed under `freestyle/symbolic_grammar/` (not copied into the image) and defer only the DB-table step.
- Slice 2 (reader cuts) is the one part that can block the freeze independently of freestyle; start it early.
