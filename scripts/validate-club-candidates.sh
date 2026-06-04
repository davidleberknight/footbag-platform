#!/usr/bin/env bash
# scripts/validate-club-candidates.sh -- pre-cutover club gates.
#
# Read-only probes over the club bootstrap tables, in dependency order:
#   G12  club-only persons extracted into historical_persons (runs FIRST:
#        the classifier's listed_contact / member_active signals need the
#        fully-populated person set, so G7 against a partial set silently
#        under-classifies)
#   G7   legacy_club_candidates normalization quality + duplicate clusters
#   G13  club_bootstrap_leaders coverage per pre-populated club
#   G9   bootstrapped clubs produce valid page inputs (clubs rows reachable
#        by slug with non-empty display fields)
#
# Emits GATE: <id> PASS|FAIL: <reason> per gate; exit non-zero on any FAIL.
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
# Thresholds:
#   FOOTBAG_CLUB_ONLY_PERSONS_MIN   minimum club-only person rows (default 1000)

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

q() { sqlite3 "${DB_FILE}" "$1"; }

fail=0

# ── G12 (first: G7's signals depend on it) ──────────────────────────────────
club_only_min="${FOOTBAG_CLUB_ONLY_PERSONS_MIN:-1000}"
club_only=$(q "SELECT COUNT(*) FROM historical_persons WHERE source = 'CLUB';")
if [[ "${club_only}" -lt "${club_only_min}" ]]; then
  printf 'GATE: G12 FAIL: %d club-only persons in historical_persons (< %d); run the club extraction before G7\n' \
    "${club_only}" "${club_only_min}"
  exit 1
fi
printf 'GATE: G12 PASS: %d club-only persons present\n' "${club_only}"

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

# ── G13: bootstrap-leader coverage per pre-populated club ───────────────────
pp_total=$(q "SELECT COUNT(*) FROM legacy_club_candidates WHERE classification = 'pre_populate';")
pp_with_leader=$(q "SELECT COUNT(DISTINCT c.legacy_club_key)
  FROM legacy_club_candidates c
  JOIN club_bootstrap_leaders l ON l.club_id = c.mapped_club_id
  WHERE c.classification = 'pre_populate';")
pp_without=$(( pp_total - pp_with_leader ))
if [[ "${pp_total}" -gt 0 && "${pp_with_leader}" -eq 0 ]]; then
  printf 'GATE: G13 FAIL: %d pre-populate clubs but zero have bootstrap leaders\n' "${pp_total}"
  fail=1
else
  printf 'GATE: G13 PASS: %d/%d pre-populate clubs carry at least one bootstrap leader (%d defer to leadership path 2)\n' \
    "${pp_with_leader}" "${pp_total}" "${pp_without}"
fi

# ── G9: bootstrapped clubs produce valid page inputs ────────────────────────
# Page validity at the data layer: club URLs key on club_<id>, so every
# clubs row renders when name and country are present. Deeper HTML checks
# belong to the staging rehearsal's manual pass.
bad_pages=$(q "SELECT COUNT(*) FROM clubs
  WHERE name = '' OR name IS NULL OR country = '' OR country IS NULL;")
if [[ "${bad_pages}" -gt 0 ]]; then
  printf 'GATE: G9 FAIL: %d clubs rows missing name or country\n' "${bad_pages}"
  fail=1
else
  printf 'GATE: G9 PASS: all clubs rows carry name and country\n'
fi

exit "${fail}"
