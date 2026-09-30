#!/usr/bin/env bash
# scripts/validate-realdata-ri.sh -- referential-integrity invariants RI1-RI3.
#
# Read-only whole-population checks over a loaded real dataset. Emits one
# GATE: RI<N> PASS|FAIL: <reason> line per invariant to stdout, each carrying a
# count at most and never a name or an address, and exits non-zero if any
# invariant fails.
#
#   RI1: no historical_persons attribution points at a missing legacy_members row
#   RI2: every claimed legacy account points at a real member
#   RI3: every stored login email is lowercased
#
# One copy of these queries serves both places they run: the test runner calls
# this file against the local database, and the staging real-data leg streams
# the same body over ssh and runs it on the host against the live database. Two
# copies would drift, and the drift would only show on the host nobody watches.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db), opened read-only. When
# streamed there is no file and no repository to move into, so the move to the
# repository root happens only when the script was started from a file.
#
# Refuses a missing database file (exit 1) rather than reporting on nothing.
#
# Usage:
#   bash scripts/validate-realdata-ri.sh
#   FOOTBAG_DB_PATH=/path/to/db bash scripts/validate-realdata-ri.sh

set -uo pipefail
if [[ -f "$0" ]]; then
  cd "$(dirname "$0")/.." || exit 1
fi

db="${FOOTBAG_DB_PATH:-./database/footbag.db}"

if [[ ! -f "${db}" ]]; then
  echo "DB file not found: ${db}" >&2
  exit 1
fi

# A query that cannot answer reports -1, which no invariant accepts, so an
# unreadable table fails the check rather than passing it.
orphan_links=$(sqlite3 -readonly "${db}" "SELECT COUNT(*) FROM historical_persons hp WHERE hp.legacy_member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM legacy_members lm WHERE lm.legacy_member_id = hp.legacy_member_id);" 2>/dev/null || echo -1)
if [[ "${orphan_links}" == "0" ]]; then
  echo "GATE: RI1 PASS: no historical_persons attribution points at a missing legacy_members row"
else
  echo "GATE: RI1 FAIL: ${orphan_links} historical_persons attribution(s) point at a missing legacy_members row"
fi

orphan_claims=$(sqlite3 -readonly "${db}" "SELECT COUNT(*) FROM legacy_members lm WHERE lm.claimed_by_member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = lm.claimed_by_member_id);" 2>/dev/null || echo -1)
if [[ "${orphan_claims}" == "0" ]]; then
  echo "GATE: RI2 PASS: every claimed legacy account points at a real member"
else
  echo "GATE: RI2 FAIL: ${orphan_claims} claimed legacy account(s) point at a missing member"
fi

bad_emails=$(sqlite3 -readonly "${db}" "SELECT COUNT(*) FROM members WHERE login_email IS NOT NULL AND login_email <> lower(login_email);" 2>/dev/null || echo -1)
if [[ "${bad_emails}" == "0" ]]; then
  echo "GATE: RI3 PASS: every stored login email is lowercased"
else
  echo "GATE: RI3 FAIL: ${bad_emails} stored login email(s) are not lowercased"
fi

[[ "${orphan_links}" == "0" && "${orphan_claims}" == "0" && "${bad_emails}" == "0" ]]
