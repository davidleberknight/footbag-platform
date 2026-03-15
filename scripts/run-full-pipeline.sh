#!/usr/bin/env bash
# scripts/run-full-pipeline.sh
#
# Soup-to-nuts pipeline: raw source inputs → SQLite database ready to serve.
#
# Prerequisites (one-time setup):
#   cd data-pipeline && ./run_pipeline.sh setup && cd ..
#   npm install
#
# The HTML mirror is required for a full rebuild (stages 01-02).
# Unpack it before running:
#   tar -xzf /path/to/mirror.tar.gz -C data-pipeline/mirror/
#
# Usage:
#   ./scripts/run-full-pipeline.sh               # full run (requires mirror)
#   ./scripts/run-full-pipeline.sh --skip-pipeline  # skip to DB load (requires canonical CSVs)
#
# Flow:
#   [1] data-pipeline/run_pipeline.sh all        raw inputs → canonical CSVs
#   [2] 07_build_mvfp_seed_full.py               canonical CSVs → seed CSVs
#   [3] reset-local-db.sh + 08_load_...py        seed CSVs → SQLite DB
#   Then: npm start → http://localhost:3000

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_PIPELINE=false

for arg in "$@"; do
  case $arg in
    --skip-pipeline) SKIP_PIPELINE=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

echo "=========================================="
echo "  Footbag Platform: full pipeline run"
echo "=========================================="

# Step 1: data pipeline (raw inputs → canonical CSVs)
if [ "$SKIP_PIPELINE" = false ]; then
  echo ""
  echo "=== [1/3] Data pipeline: raw inputs → canonical CSVs ==="
  cd "$REPO_ROOT/data-pipeline"
  ./run_pipeline.sh all
  cd "$REPO_ROOT"
else
  echo ""
  echo "=== [1/3] Skipping data pipeline (--skip-pipeline) ==="
  echo "        Expecting canonical CSVs already in:"
  echo "        legacy_data/event_results/canonical_input/"
fi

# Step 2: build seed CSVs from canonical input
echo ""
echo "=== [2/3] Build seed CSVs (07_build_mvfp_seed_full.py) ==="
cd "$REPO_ROOT"
python3 legacy_data/event_results/scripts/07_build_mvfp_seed_full.py \
  --input-dir  legacy_data/event_results/canonical_input \
  --output-dir legacy_data/event_results/seed/mvfp_full

# Step 3: apply schema and load database
echo ""
echo "=== [3/3] Load database (reset schema + 08_load_mvfp_seed_full_to_sqlite.py) ==="
"$REPO_ROOT/scripts/reset-local-db.sh"
python3 legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
  --db       database/footbag.db \
  --seed-dir legacy_data/event_results/seed/mvfp_full \
  --no-backup

echo ""
echo "=========================================="
echo "  Done. Launch the site with: npm start"
echo "  Then open: http://localhost:3000"
echo "=========================================="
