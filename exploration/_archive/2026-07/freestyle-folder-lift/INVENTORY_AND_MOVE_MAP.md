# Freestyle-folder lift — Slice 3: inventory, move-map, triage (planning only)

Status of the arc: slice 1 (deterministic + mirror-free move corpus) and slice 2
(no runtime/request `legacy_data/` reads) are shipped. This is the slice-3
planning deliverable. **No files move in slice 3.** Slice 4 executes the move.

---

## 1. Target `freestyle/` folder layout

```
freestyle/
  run_freestyle.sh            # rebuilds every freestyle table from committed inputs; no mirror, no network
  README.md                   # what it is, how to run, where inputs come from
  CLAUDE.md                   # agent rules for the living freestyle pipeline
  loaders/                    # the DB loaders (un-numbered; they leave the legacy 10..25 sequence)
  scripts/                    # generators + the gated scrape + parser-population + symbolic-grammar builders
  inputs/                     # all committed pipeline inputs (curated CSVs, snapshots, records, aliases)
    curated/tricks/
    curated/records/
    freestyle_reconciliation/
  symbolic_grammar/           # the CSVs symbolicGrammarService reads (until slice-4 DB-load retires them)
  tools/                      # trick_video_discovery and similar prep tools
  exploration/                # keep-and-move active reference only; _archive/ for closed phases
```

`curated/freestyle_*` (demos / media / sets / tricks / tutorials) **stay in `curated/`** — that tree is the curator-owned media seed, not under `legacy_data/`, so the freeze does not touch it. The freestyle loaders read it as an external input by absolute path; no move needed.

---

## 2. Exact file-by-file move map

### Loaders → `freestyle/loaders/`
| From | To |
|---|---|
| `legacy_data/event_results/scripts/10_load_freestyle_records_to_sqlite.py` | `freestyle/loaders/load_freestyle_records.py` |
| `legacy_data/event_results/scripts/11_load_consecutive_records_to_sqlite.py` | `freestyle/loaders/load_consecutive_records.py` |
| `legacy_data/event_results/scripts/17_load_trick_dictionary.py` | `freestyle/loaders/load_trick_dictionary.py` |
| `legacy_data/event_results/scripts/19_load_red_additions.py` | `freestyle/loaders/load_red_additions.py` |
| `legacy_data/event_results/scripts/20_link_footbag_org_sources.py` | `freestyle/loaders/link_footbag_org_sources.py` |
| `legacy_data/event_results/scripts/21_load_footbag_org_pending_tricks.py` | `freestyle/loaders/load_footbag_org_pending_tricks.py` |
| `legacy_data/event_results/scripts/22_qc_trick_dictionary.py` | `freestyle/loaders/qc_trick_dictionary.py` |
| `legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py` | `freestyle/loaders/qc_freestyle_media_coverage.py` |
| `legacy_data/event_results/scripts/25_qc_media_tag_invariant.py` | `freestyle/loaders/qc_media_tag_invariant.py` |

### Scripts (generators / tools) → `freestyle/scripts/`
| From | To | Note |
|---|---|---|
| `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py` | `freestyle/scripts/scrape_footbag_org_moves.py` | gated `--live` refresh; not part of the rebuild |
| `scripts/parse_freestyle_notation.py` | `freestyle/scripts/parse_freestyle_notation.py` | parser-population step of the rebuild |
| `scripts/acquire_footbag_org_demos.py` | `freestyle/scripts/acquire_footbag_org_demos.py` | one-time, gated demo prep |
| `scripts/_trick_canonicalization.py` | `freestyle/scripts/_trick_canonicalization.py` | helper for QC loaders |
| `scripts/_trick_tag_invariant.py` | `freestyle/scripts/_trick_tag_invariant.py` | helper for QC loaders |
| `legacy_data/scripts/build_symbolic_grammar_master.py` | `freestyle/scripts/build_symbolic_grammar_master.py` | symbolic-grammar generator |
| `legacy_data/scripts/build_symbolic_grammar_2.py` | `freestyle/scripts/build_symbolic_grammar_2.py` | symbolic-grammar generator |

### Inputs → `freestyle/inputs/`
| From | To |
|---|---|
| `legacy_data/inputs/curated/tricks/` (red_additions / red_corrections CSVs) | `freestyle/inputs/curated/tricks/` |
| `legacy_data/inputs/curated/records/records_master.csv` | `freestyle/inputs/curated/records/records_master.csv` |
| `legacy_data/inputs/consecutives_records.csv` | `freestyle/inputs/consecutives_records.csv` |
| `legacy_data/inputs/noise/trick_aliases.csv` | `freestyle/inputs/trick_aliases.csv` |
| `legacy_data/inputs/noise/tricks.csv` | `freestyle/inputs/tricks.csv` (scrape audit reference) |
| `legacy_data/inputs/footbag_org_moves_snapshot.csv` (committed in slice 1) | `freestyle/inputs/footbag_org_moves_snapshot.csv` |
| `legacy_data/freestyle_reconciliation/` (incl. `james_adjudications.csv`) | `freestyle/inputs/freestyle_reconciliation/` |

### Symbolic grammar (runtime-consumed) → `freestyle/symbolic_grammar/`
| From | To | Note |
|---|---|---|
| `exploration/symbolic-grammar-2/*.csv` | `freestyle/symbolic_grammar/*.csv` | **`src/services/symbolicGrammarService.ts` reads these at runtime** (`SG2_DIR`); repoint `SG2_DIR` here in slice 4, then load into the DB and retire the file read |

### Tools → `freestyle/tools/`
| From | To |
|---|---|
| `legacy_data/tools/trick_video_discovery/` | `freestyle/tools/trick_video_discovery/` |

**Not moved (archive with their exploration phase, see §5):** the one-off analysis/build scripts in `legacy_data/scripts/` — `build_footbagmoves_*`, `build_fborg_reconciliation_xlsx.py`, `build_glossary_synthesis_1.py`, `build_freestyle_dict_coverage_diff.py`, `build_trick_reconciliation_workbook.py`, `audit_vocabulary_reconciliation.py`, `parse_footbagmoves_corpus.py`, `preview_footbagmoves_match.py`, `prioritize_footbagmoves_canonical_candidates.py`, `promote_fborg_*`, `qc_fborg_master.py`, `import_freestyle_adjudications.py`. These produced specific exploration deliverables; none is part of the rebuild. Confirm per-file before archiving.

---

## 3. Legacy pipeline steps removed (slice 4)

`scripts/reset-local-db.sh` is the only pipeline script that invokes freestyle loaders (`run_pipeline.sh` has none). Remove these invocations and their echo lines, so the legacy reset no longer builds freestyle tables:

- line 132 — loader 10 (freestyle records)
- line 138 — loader 11 (consecutive records)
- line 147 — loader 17 (trick dictionary)
- line 151 — loader 19 (red additions)
- line 155 — loader 20 (footbag.org source provenance)
- the associated `echo` / comment lines (84, 141, 145-146, 150, 154, and the curated-freestyle comment at 250 as applicable)

Note: loaders 21, 22, 24, 25 and `parse_freestyle_notation.py` are **already not** in `reset-local-db.sh` (the legacy reset builds only a partial freestyle dictionary — no pending tricks, no parser population). `run_freestyle.sh` supersedes this with the full, ordered build.

---

## 4. `run_freestyle.sh` contract

**Goal:** on a fresh checkout with the schema applied and committed inputs present, rebuild every freestyle table with no mirror and no network.

**Preconditions:** `database/footbag.db` exists with `database/schema.sql` applied; `freestyle/inputs/` present; Python venv active.

**Steps (ordered; each a DELETE+INSERT idempotent loader with honest counters):**
1. `load_freestyle_records.py` → `freestyle_records`
2. `load_consecutive_records.py` → `consecutive_kicks_records`
3. `load_trick_dictionary.py` → `freestyle_tricks`, `freestyle_trick_modifiers`, `freestyle_trick_aliases`, `freestyle_trick_sources`, `freestyle_trick_source_links` (curated-v1 scope)
4. `load_red_additions.py` → `freestyle_tricks`, `freestyle_trick_aliases`, `freestyle_trick_modifier_links`, `freestyle_trick_relations` (red-husted scope)
5. `link_footbag_org_sources.py` → `freestyle_trick_source_links` (footbag.org provenance overlay)
6. `load_footbag_org_pending_tricks.py` → pending `freestyle_tricks` rows (from the committed `footbag_org_moves_snapshot.csv`)
7. `parse_freestyle_notation.py --apply` → `structural_parse_json`, `computed_add_formula`, `computed_adds` on `freestyle_tricks` (the step `reset-local-db.sh` omits today)
8. `build_symbolic_grammar_master.py` + `build_symbolic_grammar_2.py` → the symbolic-grammar tables/CSVs (slice 4 lands the DB-load so the runtime stops reading `exploration/`)
9. QC gate: `qc_trick_dictionary.py`, `qc_freestyle_media_coverage.py`, `qc_media_tag_invariant.py` — non-zero exit on any hard failure

**Contract:** idempotent (safe to re-run), honest per-loader counters, fails loudly on QC hard failures, never touches the network or the mirror, reads only `freestyle/inputs/` and `curated/freestyle_*`.

---

## 5. Exploration-folder triage rules (116 folders)

Per-folder decision procedure (apply in order; first match wins):

1. **MOVE → `freestyle/exploration/`** if a live `src/` code path reads it at runtime, OR this migration depends on it. Known load-bearing today:
   - `exploration/symbolic-grammar-2/` — read at runtime by `symbolicGrammarService.ts` (until the slice-4 DB-load). **Must move (or be DB-loaded) before `exploration/` can be archived/frozen.**
   - `exploration/freestyle-folder-lift/` — this migration's own plan.
2. **MOVE → `freestyle/exploration/`** if an **open** IP freestyle item names it as the home of pending work (e.g. a live adjudication worklist still being worked).
3. **ARCHIVE → `exploration/_archive/YYYY-MM/`** if it is a completed/closed phase: dated sprint folders, finished adjudication packets, synthesis docs whose output already shipped to code. This is the large majority — `red-adjudication-*`, `glossary-*-2026-*`, `footbagmoves-*`, `passback-*`, `media-*-2026-*`, `notation-*-2026-*`, `atomic-*-migration`, etc. Archive becomes a one-line pointer per the archive-governance rule.
4. **DELETE** only pure scratch with zero provenance value and no committed reference (stray superseded mockups, empty dirs). Default to ARCHIVE; **require explicit per-folder confirmation before any delete** — never bulk-delete.

Slice-4 inputs from this rule: a generated `MOVE / ARCHIVE / DELETE` worklist (one row per folder) reviewed before execution. Grep each folder name across `src/` and the open IP before classifying, so no runtime/IP dependency is archived by mistake.

---

## 6. Acceptance checks for Slice 4

1. **Fresh-checkout rebuild, no mirror present:** `freestyle/run_freestyle.sh` exits 0 and every freestyle table is non-empty (`freestyle_tricks`, `freestyle_records`, `consecutive_kicks_records`, `freestyle_trick_modifiers`, `freestyle_trick_aliases`, `freestyle_trick_modifier_links`, `freestyle_trick_sources`, `freestyle_trick_source_links`, `freestyle_trick_relations`, and the symbolic-grammar tables).
2. **Legacy pipeline decoupled:** `reset-local-db.sh` runs clean with no freestyle steps and no reference to the moved loaders.
3. **No runtime `exploration/` read:** `symbolicGrammarService.ts` reads the DB (or `freestyle/symbolic_grammar/`), not `exploration/symbolic-grammar-2/`; grep proves it.
4. **No `legacy_data/` read from freestyle:** every `freestyle/loaders/*` and `freestyle/scripts/*` reads `freestyle/inputs/` (or `curated/`), never `legacy_data/`; a guard asserts it.
5. **Live-fetch guard still green** (slice 1) and extended to cover `freestyle/`.
6. **Build + tests:** `npm run build` clean; `npx vitest run tests/integration tests/unit` green; every `/freestyle/*` route renders.
7. **Freestyle QC passes** (`qc_trick_dictionary` / `qc_freestyle_media_coverage` / `qc_media_tag_invariant`).
