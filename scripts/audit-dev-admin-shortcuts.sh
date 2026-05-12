#!/usr/bin/env bash
# scripts/audit-dev-admin-shortcuts.sh -- cutover audit gate.
#
# Runs the four prefix-queries that detect rows persisted by any of the
# dev-admin shortcuts (seed, register-allowlist bootstrap, tier2 invariant
# repair). All four counts must be zero before a production deploy. Exits
# non-zero if any count > 0; suitable for use as a CI gate at cutover.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db). Works on any
# environment (dev, staging, production-DB-attached-for-audit); has no
# FOOTBAG_ENV guard.
#
# Usage:
#   ./scripts/audit-dev-admin-shortcuts.sh
#   FOOTBAG_DB_PATH=/path/to/prod.db ./scripts/audit-dev-admin-shortcuts.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

run_count() {
  local label="$1"
  local sql="$2"
  local count
  count=$(sqlite3 "${DB_FILE}" "${sql}")
  # Human-readable line to stderr; count to stdout for command-substitution
  # capture. Without this split, $(run_count ...) would capture both.
  printf '  %-32s %s\n' "${label}:" "${count}" >&2
  echo "${count}"
}

echo "dev-admin-shortcuts audit (${DB_FILE}):"

c1=$(run_count "reason_code dev_admin_*" \
  "SELECT COUNT(*) FROM member_tier_grants WHERE reason_code LIKE 'dev_admin_%';")

c2=$(run_count "action_type grant_admin_dev_*" \
  "SELECT COUNT(*) FROM audit_entries WHERE action_type LIKE 'grant_admin_dev_%';")

c3=$(run_count "action_type invariant_repair" \
  "SELECT COUNT(*) FROM audit_entries WHERE action_type = 'dev_admin_invariant_repair';")

c4=$(run_count "created_by dev-admin-shortcuts/*" \
  "SELECT COUNT(*) FROM member_tier_grants WHERE created_by LIKE 'dev-admin-shortcuts/%';")

total=$((c1 + c2 + c3 + c4))

echo
if [[ "${total}" -eq 0 ]]; then
  echo "OK: zero dev-admin-shortcut rows present."
  exit 0
else
  echo "FAIL: ${total} dev-admin-shortcut row(s) detected. Must be zero before production deploy." >&2
  exit 1
fi
