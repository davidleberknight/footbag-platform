#!/usr/bin/env bash
# Regeneration-is-a-no-op guard for the generated freestyle content modules.
#
# src/content/freestyleObservationalUniverse.ts and
# src/content/freestyleTrackedNames.ts are generated from committed input CSVs
# plus the built database. This runs both generators and fails if a committed
# module differs from a fresh regeneration, i.e. a source input changed without
# the module being regenerated and committed. It belongs in the tier that
# already builds the database, because both generators open it read-only
# (they honor FOOTBAG_DB_PATH, falling back to the local dev database).
#
# On failure the regenerated modules are left in place so the diff is
# inspectable and directly committable; the workspace is disposable in CI.
set -euo pipefail
cd "$(dirname "$0")/../.."

MODULES=(
  src/content/freestyleObservationalUniverse.ts
  src/content/freestyleTrackedNames.ts
)

python3 freestyle/scripts/build_observational_universe_content.py >/dev/null
python3 freestyle/scripts/build_tracked_names_content.py >/dev/null

if git diff --exit-code -- "${MODULES[@]}" >/dev/null; then
  echo "[generated-content] current: regeneration is a no-op."
else
  echo "[generated-content] FAIL: a committed generated module is stale vs its inputs." >&2
  echo "  A source input changed without regenerating. Re-run the generators and" >&2
  echo "  commit the regenerated modules:" >&2
  echo "    python3 freestyle/scripts/build_observational_universe_content.py" >&2
  echo "    python3 freestyle/scripts/build_tracked_names_content.py" >&2
  git --no-pager diff --stat -- "${MODULES[@]}" >&2
  exit 1
fi
