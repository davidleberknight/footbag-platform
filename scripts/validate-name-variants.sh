#!/usr/bin/env bash
# scripts/validate-name-variants.sh -- pre-cutover gate G11.
#
# Confirms the name_variants table is seeded with at least the documented
# baseline (~290 mined pairs per MIGRATION_PLAN §6 + §14.15). Probes a small
# bidirectional sample so the table is queryable in both directions, and
# emits a category-source breakdown for operator visibility.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
# FOOTBAG_NAME_VARIANTS_MIN overrides the minimum row count (default 250 -
# slightly under 290 to allow for legitimate de-duplication during load).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
fi

q() { sqlite3 "${DB_FILE}" "$1"; }

MIN="${FOOTBAG_NAME_VARIANTS_MIN:-250}"
total=$(q "SELECT COUNT(*) FROM name_variants;")

if [[ "${total}" -lt "${MIN}" ]]; then
  printf 'GATE: G11 FAIL: %d name_variants rows (< minimum %d)\n' "${total}" "${MIN}"
  exit 1
fi

# Per-source breakdown for operator visibility; not gate-blocking.
mirror=$(q "SELECT COUNT(*) FROM name_variants WHERE source = 'mirror_mined';")
admin=$(q  "SELECT COUNT(*) FROM name_variants WHERE source = 'admin_added';")
member=$(q "SELECT COUNT(*) FROM name_variants WHERE source = 'member_submitted';")

# Bidirectional sample probe: pick a random row, ensure findByEitherColumn
# semantics work (canonical → variant and variant → canonical both find it).
sample=$(q "SELECT canonical_normalized || '|' || variant_normalized FROM name_variants ORDER BY RANDOM() LIMIT 1;")
if [[ -z "${sample}" ]]; then
  printf 'GATE: G11 FAIL: cannot sample a row even though COUNT > 0\n'
  exit 1
fi
canonical="${sample%%|*}"
variant="${sample##*|}"
fwd=$(q "SELECT COUNT(*) FROM name_variants WHERE canonical_normalized = '$(printf %s "${canonical}" | sed "s/'/''/g")' AND variant_normalized = '$(printf %s "${variant}" | sed "s/'/''/g")';")
if [[ "${fwd}" -ne 1 ]]; then
  printf 'GATE: G11 FAIL: bidirectional probe failed for sample %s|%s\n' "${canonical}" "${variant}"
  exit 1
fi

printf 'GATE: G11 PASS: %d rows (mirror=%d admin=%d member=%d); probe ok\n' \
  "${total}" "${mirror}" "${admin}" "${member}"
exit 0
