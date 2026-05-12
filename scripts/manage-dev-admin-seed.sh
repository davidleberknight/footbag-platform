#!/usr/bin/env bash
# scripts/manage-dev-admin-seed.sh -- dev-admin seed operations for dev and staging.
#
# Dev-admin seeding is opt-in and never runs as part of the normal
# ./run_dev.sh launch or the normal ./deploy_to_aws.sh flow. To wire
# seeding into either entry point, pass --seed-dev-admins to that entry
# point; it will invoke this script (or its staging-side equivalent) at
# the right phase. Run standalone for ad-hoc re-seeds.
#
# CUTOVER-REMOVE: this script seeds dev/staging-only admin shortcuts. The
# whole src/dev-admin-shortcuts/ subtree is removed at production cutover.
#
# Actions:
#   --seed-dev-admins   Seed maintainer admin accounts via
#                       src/dev-admin-shortcuts/seed.ts. Reads from
#                       .local/dev-admin-seed.json (JSONC-tolerant,
#                       gitignored, per-maintainer) on dev. On staging,
#                       the deploy pipeline transports
#                       .local/staging-admin-seed.json via env-var; this
#                       script is not the entry point there. Fails loudly
#                       if no seed input exists (exit 1).
#
# Env:
#   FOOTBAG_ENV         development | staging. Defaults to development if
#                       unset. Production is refused.
#   FOOTBAG_DB_PATH     Path to the SQLite file (default: ./database/footbag.db).
#
# Usage:
#   ./scripts/manage-dev-admin-seed.sh --seed-dev-admins
#   FOOTBAG_DB_PATH=./custom.db ./scripts/manage-dev-admin-seed.sh --seed-dev-admins

set -euo pipefail
# Anchor cwd at repo root regardless of where the script is invoked from,
# so relative paths to ./database/ and ./src/dev-admin-shortcuts/ resolve.
cd "$(dirname "$0")/.."

usage() {
  cat >&2 <<EOF
Usage: ./scripts/manage-dev-admin-seed.sh <action>

Actions:
  --seed-dev-admins   Seed maintainer admins from .local/dev-admin-seed.json

Notes:
  - Refuses to run when NODE_ENV=production or FOOTBAG_ENV=production.
  - Allows FOOTBAG_ENV in {development, staging}; unset defaults to development.
  - Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
EOF
  exit 1
}

# Positive guards: refuse production. Allow development and staging.
if [[ "${NODE_ENV:-}" == "production" ]] || [[ "${FOOTBAG_ENV:-}" == "production" ]]; then
  echo "refusing to seed dev-admins: production is hard-blocked." >&2
  echo "  NODE_ENV=${NODE_ENV:-} FOOTBAG_ENV=${FOOTBAG_ENV:-}" >&2
  exit 2
fi

[[ $# -eq 0 ]] && usage

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
SEED_ENV="${FOOTBAG_ENV:-development}"

action_seed_dev_admins() {
  if [[ ! -f "${DB_FILE}" ]]; then
    echo "DB file not found: ${DB_FILE}" >&2
    echo "Build the local DB first (e.g., ./run_dev.sh --from-csv or --soup-to-nuts)." >&2
    exit 1
  fi
  echo "→ Seeding dev-admin accounts (env=${SEED_ENV})..."
  FOOTBAG_ENV="${SEED_ENV}" npx tsx src/dev-admin-shortcuts/seed.ts --db "${DB_FILE}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed-dev-admins)
      action_seed_dev_admins
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
