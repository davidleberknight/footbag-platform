#!/usr/bin/env bash
# scripts/manage-test-personas.sh -- test-data persona seeding for dev and staging.
#
# Persona seeding is opt-in and never runs as part of the normal ./run_dev.sh
# launch unless --seed-test-personas is passed. Run standalone for ad-hoc
# re-seeds. Idempotent: a persona whose slug already exists is skipped.
#
# This script seeds the dev/staging-only persona harness in src/testkit/. The
# harness is permanent test scaffolding (env-gated to dev/staging, excluded
# from the production image); it is not removed at cutover.
#
# Actions:
#   --seed-test-personas  Seed the canonical persona catalog (plus the
#                         optional, gitignored .local/test-personas.json
#                         per-developer extension) via
#                         src/testkit/personaSeedRunner.ts.
#
# .local/test-personas.json (optional, gitignored, JSONC-tolerant): a JSON
# array of PersonaSpec objects. slug, displayName, tier, and a non-empty
# coverageNotes[] are required. The full schema lives in the
# personaSeedRunner.ts JSDoc; canonicalPersonas.ts holds live examples. There
# is no checked-in .example template (the whole .local/ tree is gitignored),
# mirroring how the dev-admin seed documents .local/dev-admin-seed.json.
#
# Env:
#   FOOTBAG_ENV           development | staging. Defaults to development if
#                         unset. Production is refused.
#   FOOTBAG_DB_PATH       Path to the SQLite file (default: ./database/footbag.db).
#
# Usage:
#   ./scripts/manage-test-personas.sh --seed-test-personas
#   FOOTBAG_DB_PATH=./custom.db ./scripts/manage-test-personas.sh --seed-test-personas

set -euo pipefail
# Anchor cwd at repo root regardless of where the script is invoked from,
# so relative paths to ./database/ and ./src/testkit/ resolve.
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<EOF
Usage: ./scripts/manage-test-personas.sh <action>

Actions:
  --seed-test-personas  Seed the canonical persona catalog + .local extension

Notes:
  - Refuses to run when NODE_ENV=production or FOOTBAG_ENV=production.
  - Allows FOOTBAG_ENV in {development, staging}; unset defaults to development.
  - Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
EOF
  exit 1
}

# Positive guards: refuse production. Allow development and staging.
if [[ "${NODE_ENV:-}" == "production" ]] || [[ "${FOOTBAG_ENV:-}" == "production" ]]; then
  echo "refusing to seed test personas: production is hard-blocked." >&2
  echo "  NODE_ENV=${NODE_ENV:-} FOOTBAG_ENV=${FOOTBAG_ENV:-}" >&2
  exit 2
fi

[[ $# -eq 0 ]] && usage

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SEED_ENV="${FOOTBAG_ENV:-development}"

action_seed_test_personas() {
  if [[ ! -f "${DB_FILE}" ]]; then
    echo "DB file not found: ${DB_FILE}" >&2
    echo "Build the local DB first (e.g., ./run_dev.sh --from-csv or --soup-to-nuts)." >&2
    exit 1
  fi
  # Pre-validate the optional .local extension if present, so a malformed
  # blob fails before the runner opens the DB. JSONC tolerance: strip `//`
  # line comments before jq.
  if [[ -f .local/test-personas.json ]]; then
    if ! grep -v '^[[:space:]]*//' .local/test-personas.json | jq -e . >/dev/null 2>&1; then
      echo "ERROR: .local/test-personas.json is not valid JSON (after JSONC comment strip)." >&2
      echo "Recommendation: grep -v '^[[:space:]]*//' .local/test-personas.json | jq -e . to see the parse error." >&2
      exit 1
    fi
  fi
  echo "→ Seeding test personas (env=${SEED_ENV})..."
  FOOTBAG_ENV="${SEED_ENV}" npx tsx src/testkit/personaSeedRunner.ts --db "${DB_FILE}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-test-personas)
      action_seed_test_personas
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown action: $1" >&2
      usage
      ;;
  esac
done
