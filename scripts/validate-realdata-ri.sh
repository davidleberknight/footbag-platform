#!/usr/bin/env bash
# scripts/validate-realdata-ri.sh -- real-data invariants RI1-RI5.
#
# Read-only whole-population checks over a loaded real dataset. Emits one
# GATE: RI<N> PASS|FAIL: <reason> line per invariant to stdout, each carrying a
# count at most and never a name or an address, and exits non-zero if any
# invariant fails.
#
#   RI1: no historical_persons attribution points at a missing legacy_members row
#   RI2: every claimed legacy account points at a real member
#   RI3: every stored login email is lowercased
#   RI4: every US and Canadian club and club candidate carries a state
#   RI5: every active freestyle trick's ADD matches its scoring brackets
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

# The clubs page groups a country's clubs by state only when every club there has
# one, and a member confirming a club the old site never made real is asked for a
# state only when its candidate row carries none. Either kind of row missing one
# is data the pipeline dropped, not data the old site lacked.
stateless_clubs=$(sqlite3 -readonly "${db}" "SELECT (SELECT COUNT(*) FROM clubs WHERE country IN ('United States','Canada') AND COALESCE(TRIM(region),'') = '') + (SELECT COUNT(*) FROM legacy_club_candidates WHERE country IN ('United States','Canada') AND COALESCE(TRIM(region),'') = '');" 2>/dev/null || echo -1)
if [[ "${stateless_clubs}" == "0" ]]; then
  echo "GATE: RI4 PASS: every US and Canadian club and club candidate carries a state"
else
  echo "GATE: RI4 FAIL: ${stateless_clubs} US or Canadian club or club candidate row(s) carry no state"
fi

# A trick's numeric ADD equals its count of scoring brackets, the rule the trick
# editor enforces on a save; this holds it over the whole dictionary. A row with
# no number or no scoring bracket cannot be judged. Every bracket must be a known
# one: seven that score, and KICK, which marks an action and does not.
bracket_count="(length(n)-length(replace(n,'[BOD]','')))/5 + (length(n)-length(replace(n,'[DEX]','')))/5 + (length(n)-length(replace(n,'[XBD]','')))/5 + (length(n)-length(replace(n,'[DEL]','')))/5 + (length(n)-length(replace(n,'[UNS]','')))/5 + (length(n)-length(replace(n,'[PDX]','')))/5 + (length(n)-length(replace(n,'[XDEX]','')))/6"
known_removed="replace(replace(replace(replace(replace(replace(replace(replace(n,'[BOD]',''),'[DEX]',''),'[XBD]',''),'[DEL]',''),'[UNS]',''),'[PDX]',''),'[XDEX]',''),'[KICK]','')"
active_tricks=$(sqlite3 -readonly "${db}" "SELECT COUNT(*) FROM freestyle_tricks WHERE is_active = 1;" 2>/dev/null || echo -1)
bad_notations=$(sqlite3 -readonly "${db}" "WITH t AS (SELECT adds, upper(COALESCE(operational_notation,'')) AS n FROM freestyle_tricks WHERE is_active = 1), c AS (SELECT adds, n, ${bracket_count} AS k FROM t) SELECT COUNT(*) FROM c WHERE ${known_removed} LIKE '%[%' OR (k > 0 AND adds GLOB '[0-9]*' AND adds NOT GLOB '*[^0-9]*' AND k <> CAST(adds AS INTEGER));" 2>/dev/null || echo -1)
if [[ "${active_tricks}" == "0" ]]; then
  echo "GATE: RI5 SKIP: no active freestyle tricks are loaded"
elif [[ "${bad_notations}" == "0" ]]; then
  echo "GATE: RI5 PASS: every active freestyle trick's ADD matches its scoring brackets"
else
  echo "GATE: RI5 FAIL: ${bad_notations} active trick(s) have an ADD that differs from their scoring brackets, or an unknown bracket"
fi

[[ "${orphan_links}" == "0" && "${orphan_claims}" == "0" && "${bad_emails}" == "0" && "${stateless_clubs}" == "0" && "${active_tricks}" != "-1" && "${bad_notations}" == "0" ]]
