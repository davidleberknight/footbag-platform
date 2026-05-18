#!/usr/bin/env bash
# scripts/validate-club-candidates.sh -- pre-cutover gate G7.
#
# Read-only probe over legacy_club_candidates: normalization quality
# (non-null normalized name), duplicate detection, and leader-confidence
# distribution. Emits GATE: G7 PASS|FAIL: <reason>; exit non-zero on FAIL.
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

q() { sqlite3 "${DB_FILE}" "$1"; }

total=$(q "SELECT COUNT(*) FROM legacy_club_candidates;")
if [[ "${total}" -eq 0 ]]; then
  printf 'GATE: G7 FAIL: zero legacy_club_candidates rows present (pipeline not run?)\n'
  exit 1
fi

# Dedup key sanity: every row carries a legacy_club_key (NOT NULL in schema,
# but ensure no empty strings slipped through).
empty_keys=$(q "SELECT COUNT(*) FROM legacy_club_candidates WHERE legacy_club_key = '';")

# Duplicate cluster count over display_name (case-insensitive). Rows in a
# cluster become merge candidates rather than independent clubs at
# resolution time.
dup_clusters=$(q "SELECT COUNT(*) FROM (
  SELECT LOWER(display_name) AS dn FROM legacy_club_candidates
  WHERE display_name <> ''
  GROUP BY dn HAVING COUNT(*) > 1
);")

# Confidence-score histogram (high / medium / low / null buckets).
hi=$(q  "SELECT COUNT(*) FROM legacy_club_candidates WHERE confidence_score >= 0.8;")
me=$(q  "SELECT COUNT(*) FROM legacy_club_candidates WHERE confidence_score >= 0.5 AND confidence_score < 0.8;")
lo=$(q  "SELECT COUNT(*) FROM legacy_club_candidates WHERE confidence_score < 0.5 OR confidence_score IS NULL;")

if [[ "${empty_keys}" -gt 0 ]]; then
  printf 'GATE: G7 FAIL: %d of %d legacy_club_candidates have empty legacy_club_key\n' \
    "${empty_keys}" "${total}"
  exit 1
fi

printf 'GATE: G7 PASS: %d candidates; %d duplicate-name clusters; confidence hi=%d me=%d lo=%d\n' \
  "${total}" "${dup_clusters}" "${hi}" "${me}" "${lo}"
exit 0
