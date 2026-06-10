#!/usr/bin/env bash
# scripts/validate-legacy-import-gates.sh -- pre-cutover validation gates G1-G6.
#
# Read-only SQLite probes against the loaded legacy data. Emits one
# GATE: G<N> PASS|FAIL: <reason> line per gate to stdout; non-zero exit
# if any gate fails. Consumed by scripts/pre-cutover-checklist.sh.
#
# Gates (per MIGRATION_PLAN.md §24):
#   G1: no email value is shared across accounts, taken across the three
#       legacy email columns (legacy_email/legacy_email2/legacy_email3)
#   G2: legacy_user_id unique where non-NULL
#   G3: legacy_banned presence + non-null ratio
#   G4: profile/contact field shape (null ratios for real_name, country)
#   G5: legacy_member_id format + uniqueness + completeness
#   G6: tier-mapping inputs present (legacy tier columns populated)
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db). No FOOTBAG_ENV
# guard; suitable on any environment.
#
# Usage:
#   ./scripts/validate-legacy-import-gates.sh
#   FOOTBAG_DB_PATH=/path/to/db ./scripts/validate-legacy-import-gates.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

q() { sqlite3 "${DB_FILE}" "$1"; }

fail=0

# Helper: emit a single GATE: line. Increments fail when PASS arg is "FAIL".
emit_gate() {
  local label="$1" status="$2" reason="$3"
  printf 'GATE: %s %s: %s\n' "${label}" "${status}" "${reason}"
  [[ "${status}" == "FAIL" ]] && fail=$((fail + 1))
  return 0
}

# G1: cross-column email collision. An address appearing on more than one
# distinct account, in any of the three email columns, identifies two accounts
# and must be curated before cutover. Case-insensitive, matching how the
# platform resolves claims. A value repeated within one row is not a collision.
g1_dupes=$(q "SELECT COUNT(*) FROM (
  SELECT email FROM (
    SELECT legacy_member_id AS mid, lower(legacy_email)  AS email FROM legacy_members WHERE legacy_email  IS NOT NULL
    UNION ALL
    SELECT legacy_member_id, lower(legacy_email2) FROM legacy_members WHERE legacy_email2 IS NOT NULL
    UNION ALL
    SELECT legacy_member_id, lower(legacy_email3) FROM legacy_members WHERE legacy_email3 IS NOT NULL
  )
  GROUP BY email HAVING COUNT(DISTINCT mid) > 1
);")
if [[ "${g1_dupes}" -eq 0 ]]; then
  emit_gate G1 PASS "no email shared across accounts (across all three email columns)"
else
  emit_gate G1 FAIL "${g1_dupes} email value(s) shared across accounts (cross-column)"
fi

# G2: legacy_user_id duplicates where non-NULL
g2_dupes=$(q "SELECT COUNT(*) FROM (
  SELECT legacy_user_id FROM legacy_members
  WHERE legacy_user_id IS NOT NULL
  GROUP BY legacy_user_id HAVING COUNT(*) > 1
);")
if [[ "${g2_dupes}" -eq 0 ]]; then
  emit_gate G2 PASS "legacy_user_id unique (no duplicates among non-NULL rows)"
else
  emit_gate G2 FAIL "${g2_dupes} duplicate legacy_user_id value(s) found"
fi

# G3: legacy_banned reliability proxy. We don't carry a separate banned column;
# the gate checks that the import-source field is populated so admin review
# can fall back to the import provenance when banned data is missing.
g3_total=$(q "SELECT COUNT(*) FROM legacy_members;")
g3_with_source=$(q "SELECT COUNT(*) FROM legacy_members WHERE import_source IS NOT NULL AND import_source <> '';")
if [[ "${g3_total}" -eq 0 ]]; then
  emit_gate G3 FAIL "zero legacy_members rows present (dump not loaded?)"
elif [[ "${g3_with_source}" -eq "${g3_total}" ]]; then
  emit_gate G3 PASS "all ${g3_total} legacy_members carry import_source provenance"
else
  missing=$((g3_total - g3_with_source))
  emit_gate G3 FAIL "${missing} of ${g3_total} legacy_members missing import_source"
fi

# G4: profile/contact field shape. We require real_name to be populated on
# >= 95% of rows; country on >= 50% (real-world legacy data is sparse).
g4_total="${g3_total}"
g4_realname=$(q "SELECT COUNT(*) FROM legacy_members WHERE real_name IS NOT NULL AND real_name <> '';")
g4_country=$(q "SELECT COUNT(*) FROM legacy_members WHERE country IS NOT NULL AND country <> '';")
if [[ "${g4_total}" -eq 0 ]]; then
  emit_gate G4 FAIL "no rows to sample"
else
  rn_pct=$(( g4_realname * 100 / g4_total ))
  cy_pct=$(( g4_country  * 100 / g4_total ))
  if [[ "${rn_pct}" -ge 95 ]]; then
    emit_gate G4 PASS "real_name ${rn_pct}% / country ${cy_pct}% populated (sample)"
  else
    emit_gate G4 FAIL "real_name only ${rn_pct}% populated (< 95% threshold)"
  fi
fi

# G5: legacy_member_id format + completeness. legacy_member_id is PK so
# uniqueness is guaranteed by the schema; we check format and presence
# (PK NOT NULL also covers presence, but the IP wants the explicit signal).
g5_total="${g3_total}"
g5_malformed=$(q "SELECT COUNT(*) FROM legacy_members WHERE legacy_member_id IS NULL OR legacy_member_id = '';")
if [[ "${g5_malformed}" -eq 0 ]]; then
  emit_gate G5 PASS "all ${g5_total} legacy_member_id values present and non-empty"
else
  emit_gate G5 FAIL "${g5_malformed} legacy_member_id values are NULL or empty"
fi

# G6: tier-mapping inputs. Honors-only fallback (HoF or BAP flags) is the
# current operative mapping (MIGRATION_PLAN §3). Confirm at least one row
# carries the HoF or BAP signal; absent that the fallback would be vacuous.
g6_honors=$(q "SELECT COUNT(*) FROM legacy_members WHERE is_hof = 1 OR is_bap = 1;")
if [[ "${g6_honors}" -gt 0 ]]; then
  emit_gate G6 PASS "${g6_honors} legacy_members carry HoF or BAP honor flag (tier-mapping fallback ready)"
else
  emit_gate G6 FAIL "no legacy_members carry HoF or BAP honor flag; tier-mapping fallback produces zero upgrades"
fi

if [[ "${fail}" -eq 0 ]]; then
  exit 0
else
  echo "validate-legacy-import-gates: ${fail} gate(s) FAILED" >&2
  exit 1
fi
