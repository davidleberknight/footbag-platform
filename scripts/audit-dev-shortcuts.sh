#!/usr/bin/env bash
# scripts/audit-dev-shortcuts.sh -- production-residue gate.
#
# Runs the prefix-queries that detect rows persisted by the permanent
# dev/staging-only mechanisms (the register-allowlist admin bootstrap and the
# test-data persona harness). Both are excluded from the production image, so
# their marker rows must never appear in a production database; a non-zero count
# means dev/staging data leaked into prod. Exits non-zero if any count > 0;
# suitable for use as a CI gate.
#
# (The `dev-shortcuts/*` created_by marker namespace it queries is a stable
# historical identifier, kept unchanged so existing rows and tests keep matching.)
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db). Works on any
# environment (dev, staging, production-DB-attached-for-audit); has no
# FOOTBAG_ENV guard.
#
# Usage:
#   ./scripts/audit-dev-shortcuts.sh
#   FOOTBAG_DB_PATH=/path/to/prod.db ./scripts/audit-dev-shortcuts.sh

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

echo "dev-shortcuts audit (${DB_FILE}):"

c1=$(run_count "reason_code dev_admin_*" \
  "SELECT COUNT(*) FROM member_tier_grants WHERE reason_code LIKE 'dev_admin_%';")

c2=$(run_count "action_type admin.dev_*_grant" \
  "SELECT COUNT(*) FROM audit_entries WHERE action_type LIKE 'admin.dev_%_grant';")

c4=$(run_count "created_by dev-shortcuts/*" \
  "SELECT COUNT(*) FROM member_tier_grants WHERE created_by LIKE 'dev-shortcuts/%';")

c5=$(run_count "reason_code dev_persona_seed" \
  "SELECT COUNT(*) FROM member_tier_grants WHERE reason_code = 'dev_persona_seed.tier_grant';")

c6=$(run_count "action_type testkit.persona_seed/switch" \
  "SELECT COUNT(*) FROM audit_entries WHERE action_type IN ('testkit.persona_seed','testkit.persona_switch');")

total=$((c1 + c2 + c4 + c5 + c6))

echo
if [[ "${total}" -eq 0 ]]; then
  echo "OK: zero dev-shortcut rows present."
  exit 0
else
  echo "FAIL: ${total} dev-shortcut row(s) detected. Must be zero before production deploy." >&2
  exit 1
fi
