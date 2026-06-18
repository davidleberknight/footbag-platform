#!/usr/bin/env bash
# One-click commit for slice 3 of the freestyle-folder lift: the inventory /
# move-map / triage plan, plus the IP progress update. Planning only — no files
# move. commit.sh is never staged; nothing is pushed.
set -euo pipefail
cd "$(dirname "$0")"

echo "Files staged:"
git diff --cached --name-only
echo

git commit \
  -m "docs(freestyle): slice 3 of the folder lift — inventory, move-map, triage rules" \
  -m "Adds exploration/freestyle-folder-lift/INVENTORY_AND_MOVE_MAP.md: the target freestyle/ layout, an exact file-by-file move-map (9 loaders, 7 scripts, the input trees + the slice-1 snapshot, the runtime-consumed symbolic-grammar CSVs, tools), the reset-local-db.sh freestyle steps to remove, the run_freestyle.sh build contract (ordered loaders -> tables, parser-population, QC gate), the exploration-folder triage rules (move/archive/delete with a per-folder decision procedure), and slice-4 acceptance checks. Key finding: symbolicGrammarService reads exploration/symbolic-grammar-2/ at runtime, so that folder is load-bearing (move, not archive) until the symbolic-grammar DB-load lands." \
  -m "Updates IMPLEMENTATION_PLAN.md: marks the lift actively underway as a P0 go-live blocker, records slices 1 (deterministic + mirror-free corpus) and 2 (no runtime legacy_data reads) complete, and scopes the remaining work to the move itself." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"

echo
echo "Commit created. Review with 'git show --stat', then 'git push' when ready."
