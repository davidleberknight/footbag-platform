#!/usr/bin/env bash
# scripts/validate-showcase-presence.sh -- asserts the permanent showcase
# event and its Footbag Hacky Hall-of-Fame persona are PRESENT in the target
# database.
#
# The showcase event (tagged #event_2025_beaver_open) and the "Footbag Hacky"
# historical person are permanent records that ship in every environment,
# production included. They are the only surface linking the Footbag Hacky
# system account to a visible event, result, and historical-person record, so
# a build that dropped them must not reach production. This gate fails loudly
# if either is missing, naming the counts so the operator can rebuild.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "GATE: SHOWCASE-PRESENCE FAIL: DB not found at ${DB_FILE}"
  exit 1
fi

hacky=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM historical_persons WHERE person_name = 'Footbag Hacky';")
beaver=$(sqlite3 "${DB_FILE}" "SELECT COUNT(*) FROM tags WHERE tag_normalized = '#event_2025_beaver_open';")

if [[ "${hacky}" -eq 0 || "${beaver}" -eq 0 ]]; then
  echo "GATE: SHOWCASE-PRESENCE FAIL: showcase records missing (Footbag Hacky rows: ${hacky}; #event_2025_beaver_open tags: ${beaver}). Rebuild the database so script 08 seeds them." >&2
  exit 1
fi

echo "GATE: SHOWCASE-PRESENCE PASS: showcase event + Footbag Hacky present"
exit 0
