# FB.org → DB Promotion — UPDATE Loader Applied — 2026-05-21

Records the Option A outcome: the additive gap-fill UPDATE loader was
built and applied; the 82 INSERTs were staged for curator selection.
Companion to `FBORG_PROMOTION_DRYRUN_REPORT_2026-05-21.md`.

---

## 1. UPDATE loader — built + applied

**Script:** `legacy_data/scripts/promote_fborg_first_class.py` —
standalone curator-run tool, **not** wired into `run_pipeline.sh`.
Modes: `--dry-run` (default), `--apply`, `--verify`.

**What it wrote:** exactly one column — `freestyle_tricks.jobs_notation_raw`
— gap-filled on **38 rows**. Plus `updated_at` on those rows.

A matched row was filled only when ALL four held:

1. master row `source = 'fborg'` (clean Jobs-notation format;
   footbagmoves/passback rows carry FM-format `Clip >> Op In (DEX)`
   notation and were skipped — wrong format for the column);
2. master `symbolic_notation_raw` is Jobs-format (`[...]` tokens);
3. DB `jobs_notation_raw` was NULL/empty (never overwrite);
4. master `source_adds` == DB `adds` (ADD-match guard).

**Result of the run:**

| | Count |
|---|---:|
| Eligible gap-fills (applied) | 38 |
| Matched-but-skipped | 64 |
| → non-fborg source (FM-format notation) | 59 |
| → ADD-match guard rejected | 3 |
| → master notation not Jobs-format | 2 |

`freestyle_tricks` row count **unchanged at 167** — this loader does
no INSERTs.

## 2. The ADD-match guard earned its place

Three matched rows were rejected by the ADD guard — all genuine slug
collisions that a naive loader would have corrupted:

| DB row | Collision |
|---|---|
| `clipper` (adds 1) | master "Clipper*" is the 2-ADD clipper *stall* — different trick sharing the slug |
| `heel-stall` (adds 1) | master "Heel Delay" is 2-ADD |
| `atom-smasher` (adds 4) | master is the FB.org 3-ADD reading — the **documented cross-source divergence**; the guard prevented writing the 3-ADD-reading notation onto the IFPA 4-ADD canonical row |

Without the guard, the loader would have written wrong-trick notation
onto three canonical rows.

## 3. Parser columns — deliberately not touched

The loader writes only `jobs_notation_raw` (a raw *input* column). It
does **not** touch the parser-owned columns
(`jobs_notation_normalized`, `structural_parse_json`,
`computed_add_formula`, `computed_adds`, `add_formula_status`) — per
the parser/editorial separation rule. Those are derived by
`scripts/parse_freestyle_notation.py --apply`, which **should be run
next** so the 38 newly-filled notations propagate into the parser
layer.

## 4. Idempotence — verified

`promote_fborg_first_class.py --verify` applies, then re-runs and
asserts the second run is a noop. Confirmed:

```
[apply]  rows updated: 38
[verify] second run eligible: 0; rows updated: 0
[verify] idempotence OK — second run was a noop.
```

Idempotent by construction: the WHERE clause requires
`jobs_notation_raw IS NULL OR jobs_notation_raw=''`, so already-filled
rows are never re-touched. `--verify` is the standing idempotence QC
for this loader.

## 5. The 82 INSERTs — staged, not loaded

Per Option A, the 82 genuinely-missing first-class tricks were **not**
inserted. They are staged as a curator-selection queue:

**`FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv`** — 82 rows, with two
blank lead columns for the curator:

- `curator_decision` — fill `accept` / `reject` / `defer` per row
- `curator_notes` — free text

Plus the fields needed to eventually insert (slug, name, source, adds,
add_formula, notation, decomposition, doctrine_status, modifier_chain,
equivalent_to, provenance). The queue is sorted by ADD tier then slug.

Promotion of any subset happens only after the curator fills
`curator_decision` — a future INSERT loader would consume the
`accept`-marked rows, with a match-quality pre-check (the dry-run's
slug+name match has no fuzzy layer; a false-negative INSERT would
duplicate a canonical row).

The live `freestyle_tricks` table is a deliberately curated subset
(it has `ducking-butterfly` but not `ducking-mirage`, etc.) — the
staging queue preserves that curatorial control rather than bypassing
it with a bulk insert.

## 6. Deliverables status

| # | Deliverable | Status |
|---|---|---|
| 1 | Dry-run report | ✓ `FBORG_PROMOTION_DRYRUN_REPORT_2026-05-21.md` |
| 2 | Update/insert counts | ✓ 102 matched (38 filled, 64 skipped) / 82 staged |
| 3 | Blocked-row report | ✓ 0 integrity-blocked |
| 4 | Observational export | ✓ `FBORG_OBSERVATIONAL_EXPORT_2026-05-21.csv` (670 rows) |
| 5 | Loader | ✓ `legacy_data/scripts/promote_fborg_first_class.py` |
| 6 | Idempotence QC | ✓ `--verify` mode, demonstrated |
| 7 | Commit message | ✓ in the turn summary |

## 7. Hard constraints — final status

| Constraint | Status |
|---|---|
| No mass DB promotion | Held — 0 INSERTs; 82 staged for curator selection |
| No silent overwrite of canonical rows | Held — gap-fill only; `jobs_notation_raw` written only where empty |
| No promotion of hedged rows | Held |
| No promotion of curator-review rows | Held |
| Preserve historical source divergences | Held — ADD-guard kept the Atom Smasher divergence intact |
| Spreadsheet remains authoritative staging | Held |
| DB remains publication/canonical layer | Held — 167 rows, +38 notation gap-fills, no new tricks |
| Observational layer explicitly non-canonical | Held |

## Files

```
new   legacy_data/scripts/promote_fborg_first_class.py
new   exploration/footbagmoves-federation/FBORG_PROMOTION_APPLIED_2026-05-21.md   (this file)
new   exploration/footbagmoves-federation/FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv  (82 rows)
mod   database/footbag.db   (freestyle_tricks: 38 jobs_notation_raw gap-fills; row count unchanged at 167)
```
