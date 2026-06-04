#!/usr/bin/env bash
# scripts/validate-fixture-absence.sh -- asserts the synthetic preview
# fixture is absent from the target database.
#
# The preview fixture (the synthetic event tagged #event_2025_beaver_open
# plus the "Footbag Hacky" historical person) is a dev/CI/staging
# convenience injected only when FOOTBAG_SEED_PREVIEW_FIXTURE=1. A
# production database must never contain it; this gate fails loudly if it
# does, naming the rows so the operator can trace the load that injected
# them.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "GATE: FIXTURE-ABSENCE FAIL: DB not found at ${DB_FILE}"
  exit 1
fi

hacky=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM historical_persons WHERE person_name = 'Footbag Hacky';")
beaver=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM tags WHERE tag_normalized = '#event_2025_beaver_open';")

if [[ "${hacky}" -ne 0 || "${beaver}" -ne 0 ]]; then
  echo "GATE: FIXTURE-ABSENCE FAIL: synthetic preview fixture present (Footbag Hacky rows: ${hacky}; #event_2025_beaver_open tags: ${beaver}). Rebuild the database without FOOTBAG_SEED_PREVIEW_FIXTURE."
  exit 1
fi

echo "GATE: FIXTURE-ABSENCE PASS: no synthetic preview fixture rows"
exit 0
