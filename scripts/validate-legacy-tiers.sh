#!/usr/bin/env bash
# scripts/validate-legacy-tiers.sh -- pre-cutover gate G6 (tier portion).
#
# Separated from validate-legacy-import-gates.sh so the tier-mapping inputs
# check can be run standalone (deferred-extension columns may evolve
# independently of the broader profile shape).
#
# Today's mapping is honors-only fallback (MIGRATION_PLAN §3): HoF or BAP
# flag → tier2 at claim time; otherwise tier0. The script confirms at
# least one row carries the honor flag so the fallback produces some
# upgrade rows at cutover.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

q() { sqlite3 "${DB_FILE}" "$1"; }

total=$(q "SELECT COUNT(*) FROM legacy_members;")
hof=$(q   "SELECT COUNT(*) FROM legacy_members WHERE is_hof = 1;")
bap=$(q   "SELECT COUNT(*) FROM legacy_members WHERE is_bap = 1;")
honors=$((hof + bap))

if [[ "${total}" -eq 0 ]]; then
  printf 'GATE: G6-tiers FAIL: zero legacy_members rows\n'
  exit 1
fi

if [[ "${honors}" -eq 0 ]]; then
  printf 'GATE: G6-tiers FAIL: zero HoF or BAP flags set; honors-only fallback yields no upgrades\n'
  exit 1
fi

printf 'GATE: G6-tiers PASS: HoF=%d BAP=%d (honors-only fallback ready)\n' "${hof}" "${bap}"
exit 0
