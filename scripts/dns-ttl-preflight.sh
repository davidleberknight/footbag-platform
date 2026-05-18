#!/usr/bin/env bash
# scripts/dns-ttl-preflight.sh -- T-48h DNS TTL drop for the legacy zone.
#
# Lowers the TTL on the legacy zone's apex A/AAAA + www records to 60 seconds
# so the cutover record swap propagates inside the cutover window. Issued
# 48 hours before the planned cutover so the previously-cached TTL has
# expired by the swap moment.
#
# Required env vars:
#   FOOTBAG_LEGACY_HOSTED_ZONE_ID    Route 53 hosted-zone id for footbag.org
#   FOOTBAG_LEGACY_RECORDS           Comma-separated list of record names
#                                    (default: "footbag.org.,www.footbag.org.")
# Optional:
#   FOOTBAG_DNS_TTL_SECONDS          New TTL value (default: 60)
#   --dry-run                        Print the change-batch JSON; do not call AWS
#   --mock                           Skip AWS entirely; emit PASS for tests
#
# Exits non-zero on AWS call failure or precondition failure.

set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
MOCK=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=1 ;;
    --mock)    MOCK=1 ;;
    *) echo "unknown arg: ${arg}" >&2; exit 2 ;;
  esac
done

if [[ "${MOCK}" -eq 1 ]]; then
  printf 'GATE: DNS-TTL PASS: mock mode (no AWS call)\n'
  exit 0
fi

ZONE_ID="${FOOTBAG_LEGACY_HOSTED_ZONE_ID:-}"
if [[ -z "${ZONE_ID}" ]]; then
  echo "FOOTBAG_LEGACY_HOSTED_ZONE_ID must be set" >&2
  exit 1
fi

RECORDS="${FOOTBAG_LEGACY_RECORDS:-footbag.org.,www.footbag.org.}"
TTL="${FOOTBAG_DNS_TTL_SECONDS:-60}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found in PATH" >&2
  exit 1
fi

# Build the change-batch JSON. The AWS CLI returns existing record values
# we can splice into a TTL-only UPDATE, but the safe operator path is to
# require the operator to confirm the resource values explicitly.
# We construct UPSERT operations on the A/AAAA record sets; the operator
# is expected to inspect the dry-run output before applying.
changes_json=""
IFS=',' read -ra REC_LIST <<< "${RECORDS}"
for rec in "${REC_LIST[@]}"; do
  for rtype in A AAAA; do
    # Look up the existing record's ResourceRecords list; skip the record
    # if it doesn't exist (e.g. AAAA may not be present).
    existing=$(aws route53 list-resource-record-sets \
      --hosted-zone-id "${ZONE_ID}" \
      --query "ResourceRecordSets[?Name=='${rec}' && Type=='${rtype}']" \
      --output json 2>/dev/null || echo "[]")
    if [[ "${existing}" == "[]" || -z "${existing}" ]]; then
      continue
    fi
    rrs=$(printf '%s' "${existing}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d[0]["ResourceRecords"]))')
    change=$(printf '{"Action":"UPSERT","ResourceRecordSet":{"Name":"%s","Type":"%s","TTL":%s,"ResourceRecords":%s}}' \
      "${rec}" "${rtype}" "${TTL}" "${rrs}")
    if [[ -z "${changes_json}" ]]; then
      changes_json="${change}"
    else
      changes_json="${changes_json},${change}"
    fi
  done
done

if [[ -z "${changes_json}" ]]; then
  echo "no matching A/AAAA records found in zone ${ZONE_ID} for ${RECORDS}" >&2
  exit 1
fi

batch=$(printf '{"Changes":[%s]}' "${changes_json}")

if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf 'GATE: DNS-TTL PASS: dry-run, change-batch follows\n'
  printf '%s\n' "${batch}"
  exit 0
fi

result=$(aws route53 change-resource-record-sets \
  --hosted-zone-id "${ZONE_ID}" \
  --change-batch "${batch}")
change_id=$(printf '%s' "${result}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ChangeInfo"]["Id"])')
printf 'GATE: DNS-TTL PASS: change submitted (id=%s, ttl=%s)\n' "${change_id}" "${TTL}"
exit 0
