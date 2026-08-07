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
#   --seed-test-personas  Seed the canonical persona catalog via
#                         src/testkit/personaSeedRunner.ts. Adds personas the
#                         database is missing; never updates one it already
#                         has, so the result is complete against the catalog
#                         but not current.
#   --refresh-test-personas  Rebuild every persona from its current spec via
#                         src/testkit/personaRefreshCli.ts: the only action
#                         that makes an existing database current. Reports
#                         what it would do and writes nothing unless --apply
#                         is also given, because it deletes persona-owned
#                         rows, including anything a tester built while
#                         acting as a persona.
#
# The persona catalog is code (canonicalPersonas.ts) and has no per-developer
# extension file: every developer tests against the same reviewed set, and a
# persona only exists if it is in the catalog.
#
# Env:
#   FOOTBAG_ENV           development | staging. Defaults to development if
#                         unset. Production is refused.
#   FOOTBAG_DB_PATH       Path to the SQLite file (default: ./database/footbag.db).
#
# Usage:
#   ./scripts/manage-test-personas.sh --seed-test-personas
#   FOOTBAG_DB_PATH=./custom.db ./scripts/manage-test-personas.sh --seed-test-personas
#   ./scripts/manage-test-personas.sh --refresh-test-personas
#   ./scripts/manage-test-personas.sh --refresh-test-personas --apply

set -euo pipefail
# Anchor cwd at repo root regardless of where the script is invoked from,
# so relative paths to ./database/ and ./src/testkit/ resolve.
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<EOF
Usage: ./scripts/manage-test-personas.sh <action>

Actions:
  --seed-test-personas     Seed the canonical persona catalog. Adds what is
                           missing; never updates a persona that already exists.
  --refresh-test-personas  Rebuild every persona from its current spec. This is
                           the only action that makes an existing database
                           current. Reports and writes nothing without --apply.

Modifiers:
  --apply                  Perform the refresh instead of reporting it. Deletes
                           persona-owned rows, including anything a tester built
                           while acting as a persona.

Notes:
  - Refuses to run when NODE_ENV=production or FOOTBAG_ENV=production.
  - Allows FOOTBAG_ENV in {development, staging}; unset defaults to development.
  - Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
EOF
  exit 1
}

# Positive guards: refuse production. Allow development and staging.
if [[ "${NODE_ENV:-}" == "production" ]] || [[ "${FOOTBAG_ENV:-}" == "production" ]]; then
  echo "refusing to touch test personas: production is hard-blocked." >&2
  echo "  NODE_ENV=${NODE_ENV:-} FOOTBAG_ENV=${FOOTBAG_ENV:-}" >&2
  exit 2
fi

[[ $# -eq 0 ]] && usage

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SEED_ENV="${FOOTBAG_ENV:-development}"

# --apply is a modifier, not an action, so it is read before the action loop
# runs: written either side of the action on the command line, it must still
# reach the action.
APPLY="no"
for arg in "$@"; do
  [[ "$arg" == "--apply" ]] && APPLY="yes"
done

require_db_file() {
  if [[ ! -f "${DB_FILE}" ]]; then
    echo "DB file not found: ${DB_FILE}" >&2
    echo "Build the local DB first (e.g., ./run_dev.sh --from-csv or --soup-to-nuts)." >&2
    exit 1
  fi
}

action_seed_test_personas() {
  require_db_file
  echo "→ Seeding test personas (env=${SEED_ENV})..."
  FOOTBAG_ENV="${SEED_ENV}" npx tsx src/testkit/personaSeedRunner.ts --db "${DB_FILE}"
}

action_refresh_test_personas() {
  require_db_file
  if [[ "${APPLY}" == "yes" ]]; then
    echo "→ Refreshing test personas (env=${SEED_ENV}) — persona-owned rows will be deleted..."
    FOOTBAG_ENV="${SEED_ENV}" npx tsx src/testkit/personaRefreshCli.ts --db "${DB_FILE}" --apply
  else
    echo "→ Reporting the test-persona refresh (env=${SEED_ENV}); nothing will be written..."
    FOOTBAG_ENV="${SEED_ENV}" npx tsx src/testkit/personaRefreshCli.ts --db "${DB_FILE}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-test-personas)
      action_seed_test_personas
      shift
      ;;
    --refresh-test-personas)
      action_refresh_test_personas
      shift
      ;;
    --apply)
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
