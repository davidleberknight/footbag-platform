#!/usr/bin/env bash
# Two commits:
#   1. symbolic-grammar DB load (runtime reads the DB, not exploration/ CSVs)
#   2. slice-4 tool-path leftovers (the trick_video_discovery/ move surfaced them)
# commit.sh is never staged; nothing is pushed.
set -euo pipefail
cd "$(dirname "$0")"

LEFTOVER_FILES=(
  tests/unit/freestyleEmbeddedCoverage.test.ts
  scripts/acquire_footbag_org_demos.py
  scripts/promote_snippet_candidates.py
  legacy_data/scripts/build_embedded_coverage_content.py
  legacy_data/scripts/build_symbolic_grammar_master.py
  src/content/freestyleEmbeddedCoverage.ts
)

# ── 1. symbolic-grammar DB load ─────────────────────────────────────────────
git reset -q HEAD -- "${LEFTOVER_FILES[@]}"
git commit \
  -m "feat(freestyle): load the symbolic-grammar layer into the DB; service reads tables not CSVs" \
  -m "symbolicGrammarService read six CSVs from exploration/symbolic-grammar-2/ at request time (and they were COPYed into the web image). Adds six symbolic_* observational tables, a freestyle loader (26_load_symbolic_grammar.py, wired into run_freestyle.sh) that DELETE+INSERTs the committed CSVs into them, and db.ts prepared statements; the service now reads those tables (buildCache mapping unchanged, keyed by column name) and the fail-safe still serves empty when they are absent. Drops the Dockerfile COPY of the CSV dir and its guard test (runtime is DB-backed now). createTestDb seeds the symbolic_* tables from the committed CSVs so every test DB carries the observational data the always-present CSVs used to provide. Loader reads exploration/symbolic-grammar-2/ for now; relocating those CSVs + build scripts into freestyle/ is the remaining follow-up." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" \
  -- \
  database/schema.sql \
  freestyle/loaders/26_load_symbolic_grammar.py \
  freestyle/run_freestyle.sh \
  src/db/db.ts \
  src/services/symbolicGrammarService.ts \
  docker/web/Dockerfile \
  tests/fixtures/testDb.ts \
  tests/integration/symbolicGrammarService.test.ts \
  tests/unit/dockerfile-symbolic-grammar-data.test.ts

# ── 2. slice-4 tool-path leftovers ──────────────────────────────────────────
git add -- "${LEFTOVER_FILES[@]}"
git commit \
  -m "fix(freestyle): repoint tool-path references after the trick_video_discovery/ move" \
  -m "The slice-4 move of trick_video_discovery/ into freestyle/tools/ left several consumers pointing at the old legacy_data/tools path (the embedded-coverage drift-guard test and content module, acquire_footbag_org_demos's MANIFEST, the snippet-promotion and embedded-coverage / symbolic-grammar build scripts). Repoints them to freestyle/tools/trick_video_discovery/. The embedded-coverage drift-guard test was the only one in the suite; the rest are build/one-off scripts that were broken-if-run." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"

echo
echo "Two commits created. Review with 'git log --stat -2'."
