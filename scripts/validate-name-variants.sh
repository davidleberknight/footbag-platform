#!/usr/bin/env bash
# scripts/validate-name-variants.sh -- pre-cutover gate G11.
#
# Confirms the name_variants table is seeded with at least the documented
# baseline (pipeline validation gate G11; the seed files under legacy_data/out/
# track the exact counts, currently 389 production pairs). Reads one sampled
# pair back by its own key, which proves only that the table answers a keyed
# read; it is not a symmetry check, because each pair is stored in one
# direction only and lookups search both columns, so there is no reverse row to
# require. Emits a category-source breakdown for operator visibility.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
# FOOTBAG_NAME_VARIANTS_MIN overrides the minimum row count (default 250 -
# slightly under 290 to allow for legitimate de-duplication during load).

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

# Sample probe: pick a random row and read it back by its own key.
sample=$(q "SELECT canonical_normalized || '|' || variant_normalized FROM name_variants ORDER BY RANDOM() LIMIT 1;")
if [[ -z "${sample}" ]]; then
  printf 'GATE: G11 FAIL: cannot sample a row even though COUNT > 0\n'
  exit 1
fi
canonical="${sample%%|*}"
variant="${sample##*|}"
fwd=$(q "SELECT COUNT(*) FROM name_variants WHERE canonical_normalized = '$(printf %s "${canonical}" | sed "s/'/''/g")' AND variant_normalized = '$(printf %s "${variant}" | sed "s/'/''/g")';")
if [[ "${fwd}" -ne 1 ]]; then
  # The sampled pair is a member's name, so it is never printed: the gate's
  # output can leave the host it runs on.
  printf 'GATE: G11 FAIL: a sampled row did not read back by its own key\n'
  exit 1
fi

printf 'GATE: G11 PASS: %d rows (mirror=%d admin=%d member=%d); probe ok\n' \
  "${total}" "${mirror}" "${admin}" "${member}"
exit 0
