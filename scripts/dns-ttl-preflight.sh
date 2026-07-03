#!/usr/bin/env bash
# scripts/dns-ttl-preflight.sh -- T-48h DNS TTL drop for the zone handover.
# The go-live cutover is the webmaster's manual switch of apex/www on his own
# authoritative bind9 zone; its TTL pre-shrink is his manual action there, not
# this script, which drives Route 53 (not authoritative until the handover).
# So this script is NOT part of the flip checklist; it serves the one
# milestone that moves DNS in Route 53:
#
#   --phase handover  DNS handover milestone: drops TTL on the apex A/AAAA +
#                     www records ahead of the zone move to Route 53.
#                     Default records: "footbag.org.,www.footbag.org.".
#
# The email-day MX/TXT TTL pre-shrink is deliberately NOT done here: those
# records live on the webmaster's authoritative zone until the handover, and
# this script can only rewrite A/AAAA in Route 53, which is not authoritative
# before then. The webmaster lowers the MX/TXT TTL by hand on his own zone
# ahead of the mail swap.
#
# Lowers the TTL on the selected records to 60 seconds, issued 48 hours
# before the swap so the previously-cached TTL has expired by the moment.
#
# Required env vars:
#   FOOTBAG_LEGACY_HOSTED_ZONE_ID    Hosted-zone id for footbag.org
#   FOOTBAG_LEGACY_RECORDS           Comma-separated record names (overrides
#                                    the per-phase default)
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
PHASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --mock)    MOCK=1; shift ;;
    --phase)   PHASE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

case "${PHASE}" in
  handover) DEFAULT_RECORDS="footbag.org.,www.footbag.org." ;;
  *) echo "--phase handover is required (the go-live flip is the webmaster's manual switch on his own zone; the MX/TXT TTL is likewise his manual action there)" >&2; exit 2 ;;
esac

if [[ "${MOCK}" -eq 1 ]]; then
  printf 'GATE: DNS-TTL PASS: mock mode (no AWS call)\n'
  exit 0
fi

ZONE_ID="${FOOTBAG_LEGACY_HOSTED_ZONE_ID:-}"
if [[ -z "${ZONE_ID}" ]]; then
  echo "FOOTBAG_LEGACY_HOSTED_ZONE_ID must be set" >&2
  exit 1
fi

RECORDS="${FOOTBAG_LEGACY_RECORDS:-${DEFAULT_RECORDS}}"
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
