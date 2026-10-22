---
name: pipeline-invariant-enforcer
description: Audit invariants before modifying the historical pipeline. Trigger when work touches legacy_data/run_pipeline.sh, pipeline orchestration, canonical CSV generators, identity-lock files, workbook or seed builders, DB loaders, or any script reading or writing legacy_data/out/*. Surfaces risks and pauses for approval; never edits on its own.
---

# Pipeline Invariant Enforcer

Audits a proposed pipeline change against eight structural invariants before any edit lands. Does not write code on its own; it surfaces risks, proposes the minimal fix, and pauses for approval.

Lifecycle scope: the historical pipeline is pre-go-live data-load tooling. This skill applies until cutover; the pipeline, its CSVs and this skill retire when the pipeline is deleted after the final production load is signed off. After cutover the production database is the source of truth.

## When this skill triggers

Any change that touches:

- `legacy_data/run_pipeline.sh` (orchestrator)
- `legacy_data/pipeline/**` (parser, canonicalizer, identity, QC, workbook, platform export)
- `legacy_data/event_results/scripts/**` (loaders, enrichment, link / scrape steps)
- `legacy_data/clubs/scripts/**`, `legacy_data/persons/**`, `legacy_data/membership/**` (identity-pipeline producers)
- `legacy_data/inputs/identity_lock/**` (frozen; patch toolchain only)
- Workbook builders (`build_workbook_release.py`, `export_canonical_platform.py`)
- Seed builders + DB loaders (`07_build_mvfp_seed_full.py`, `08_load_mvfp_seed_full_to_sqlite.py`, `09_load_enrichment_to_sqlite.py`, `scripts/reset-local-db.sh`)
- Any new or edited script that reads `legacy_data/out/*` or writes to `legacy_data/out/`

If the task touches none of these, skip this skill.

---

## Required checks

Run all eight before proposing an edit.

### 1. Producer before consumer

Every script that reads `out/*` must have its producer run earlier in the same orchestrator (`run_pipeline.sh`, `reset-local-db.sh`, or a documented wrapper).

Sweep: list every `out/*` path the touched code reads; locate the producing script; confirm the orchestrator runs the producer first.

Reference failure: `run_pipeline.sh csv_only` aborts in its preflight with `MISSING: event_results/canonical_input/events.csv` when the canonical export (`export_canonical_platform.py`, run in the backbone) has not populated `canonical_input/` first.

### 2. No hidden dependency on prior local state

The pipeline must run end-to-end on a fresh clone with no pre-existing artifacts beyond what is committed and the documented local-only inputs (the footbag.org mirror and the operator-provided membership roster; see `legacy_data/CLAUDE.md`). Forbidden:

- Reading `seed/*.csv`, `out/*.csv`, or `legacy_data/out/*` without an explicit producer step in the same orchestrator
- Assuming `database/footbag.db` already exists
- Assuming a Python environment that the orchestrator's venv bootstrap did not create
- Hand-edited files in `inputs/curated/` without either a generator or a clear "manual source" classification

Verify by mentally walking the orchestrator from a clean checkout. Flag any step that would fail.

### 3. Canonical CSVs remain source of truth

`out/canonical/*.csv` and `event_results/canonical_input/*.csv` are pipeline outputs. Never:

- Hand-edit them
- Patch them downstream inside a loader, workbook builder, or platform export
- Treat them as inputs to upstream pipeline stages

Fixes land at the source: parser, override file, identity-lock patch, or curated CSV. Then rebuild.

### 4. Derived artifacts are not patched directly

Same rule as check 3, applied to every derived artifact:

- Workbook (`out/Footbag_Results_Release.xlsx`)
- Seed CSVs (`event_results/seed/mvfp_full/*.csv`)
- DB tables loaded from canonical
- Scraper outputs (`out/scraped_footbag_moves.csv`, etc.)

If a patch on a derived artifact is the proposed fix, stop and trace upstream.

### 5. Identity resolution happens upstream

`AliasResolver` is the sole identity authority. New code must:

- Route any person-resolution path through the shared resolver in `pipeline/identity/`
- Not reimplement name normalization (NFKC, lowercase, trim is canonical; do not duplicate)
- Not introduce a new alias-merge site; alias merges happen upstream only
- Allow only HIGH-confidence rows into DB-bound output

If remediation is needed, it goes through the existing channels (`overrides/`, `inputs/identity_lock/`, `overrides/person_aliases.csv`), not a one-off in-script patch.

### 6. QC must pass before success

No change is "done" until:

```
legacy_data/.venv/bin/python legacy_data/pipeline/qc/run_qc.py --root legacy_data
```

returns `QC STATUS: PASS` with zero hard failures. `run_pipeline.sh full` enforces this between stage 4 and stage 5. If you bypassed `full`, run QC manually and report the result. Never commit the canonical snapshot (`event_results/canonical_input/`) while QC is failing. Never load the DB after a QC failure.

### 7. Fresh-clone / clean-`out/` behavior is considered

Before claiming a change is correct, simulate or actually run the pipeline from a clean state (it needs the local mirror, refreshed first, or the run silently drops events; see the stale-mirror trap in `legacy_data/CLAUDE.md`). The operator runs these; Claude proposes them:

```
rm -rf legacy_data/out
bash legacy_data/run_pipeline.sh full
```

If the change introduces a consumer that reads a path no prior step writes, the clean-`out/` run fails. Either add the missing producer to the orchestrator, or make the consumer graceful with an actionable preflight error (see check 8).

### 8. Preflight failure messages are actionable

When a step fails preflight (missing input, missing dependency, missing env), the error must name:

- The missing path or condition
- The producer script that should run first, when known
- The orchestrator entry point that wires them together (e.g. `./run_pipeline.sh full`)

Forbidden: bare `FileNotFoundError`, `KeyError`, or a stack trace with no operator hint.

---

## Output protocol

Produce in order:

### 1. Relevant invariants
List which of the eight checks apply to the proposed change. Skip those that do not.

### 2. Risks
Concrete failure modes the change could introduce. Cite files and line numbers.

### 3. Minimal fix
Smallest change that satisfies the invariants. Preference order:

1. Add a producer step to the orchestrator
2. Move an existing step earlier
3. Add a preflight check with an actionable error
4. Make the consumer a graceful no-op with a warning (only when producer cost is high)

### 4. Validation commands
Exact commands the operator should run to confirm the fix. Default set:

```
wc -l legacy_data/out/canonical/*.csv                  # baseline
bash legacy_data/run_pipeline.sh full                  # rebuild
wc -l legacy_data/out/canonical/*.csv                  # delta
git diff --stat legacy_data/event_results/canonical_input/
legacy_data/.venv/bin/python legacy_data/pipeline/qc/run_qc.py --root legacy_data
```

For fresh-clone validation:

```
rm -rf legacy_data/out
bash legacy_data/run_pipeline.sh full
```

For loader-touching changes, also run the loader twice and confirm DELETE+INSERT idempotency (no duplicates, honest counters).

### 5. Pause for approval
Never apply edits without explicit approval. State the proposed edit set and wait. Questions to the human follow `.claude/rules/asking.md`.

---

## Cross-references

Operational procedure detail (do not duplicate here):

- `legacy_data/runbooks/complete-pipeline.md` for the full pipeline run
- `legacy_data/runbooks/historical-pipeline.md` for the debugging variant
- `legacy_data/runbooks/pipeline-diagnostics.md` for QC investigation
- `legacy_data/runbooks/promote-curated-source.md` for adding pre-1997 sources
- `legacy_data/runbooks/rebuild-identity-pipeline.md` for identity-pipeline rebuild
- `legacy_data/runbooks/workbook-v22.md` for the release workbook builder

Rules that load when their paths are touched:

- `.claude/rules/db-write-safety.md` for DB mutation invariants
- `.claude/rules/testing.md` (loads on `legacy_data/tests/**`) for test mandate
- `.claude/rules/doc-governance.md` for doc rules
- `legacy_data/CLAUDE.md` (loads when a file under `legacy_data/` is read) for the subtree's lane, source precedence, local safety rules, known
  pipeline traps and the loader contract (it defers the structural invariants above to this skill)

---

## Anti-patterns this skill catches

- Adding a step that reads `out/foo.csv` without verifying the producer
- Editing `out/canonical/*.csv` directly to "fix" a row
- Adding a one-off patch in a loader instead of fixing the canonical source
- Reimplementing alias normalization in a new script
- Claiming "done" on a green local run with no QC pass
- Adding a step that requires manual prep ("first run X locally") not wired into the orchestrator
- Writing a preflight error that does not name the missing producer
