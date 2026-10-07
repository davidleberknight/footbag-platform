#!/usr/bin/env bash
# scripts/validate-bootstrap-leaders.sh -- pre-cutover gate G8.
#
# Counts club_bootstrap_leaders rows. Per pipeline validation gate G8, a sufficient
# count of high-confidence candidates is required so leadership activation
# can use path 1 (bootstrap-confirmed) rather than path 2 (first affiliated
# member accepts). The current minimum threshold is 1 row (any candidate
# better than none); operators raise it via FOOTBAG_BOOTSTRAP_LEADER_MIN.
#
# Per IP, tuning authority for G8 is joint between maintainers; lowering
# below the IFPA-board-set floor requires sign-off (not enforced here).
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).

set -euo pipefail
# Streamed to a host and run from a process substitution, $0 is not a file and
# there is no checkout to move into; the database then comes from FOOTBAG_DB_PATH.
if [[ -f "$0" ]]; then
  cd "$(dirname "$0")/.."
fi

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

q() { sqlite3 -readonly "${DB_FILE}" "$1"; }

MIN="${FOOTBAG_BOOTSTRAP_LEADER_MIN:-1}"
total=$(q "SELECT COUNT(*) FROM club_bootstrap_leaders;")

if [[ "${total}" -lt "${MIN}" ]]; then
  printf 'GATE: G8 FAIL: %d club_bootstrap_leaders rows (< minimum %d)\n' "${total}" "${MIN}"
  exit 1
fi

printf 'GATE: G8 PASS: %d club_bootstrap_leaders rows (>= minimum %d)\n' "${total}" "${MIN}"
exit 0
