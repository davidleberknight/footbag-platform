#!/usr/bin/env bash
# scripts/dns-ttl-preflight.sh -- the T-48h DNS TTL gate before the apex/www flip.
#
# The zone moves to Route 53 as go-live preparation and the operator applies every
# record there through Terraform afterwards; nothing is hand-applied on any zone
# and no DNS action at the cutover belongs to anyone else.
#
# This script OBSERVES and never writes. The gate it serves asks for the 60-second
# TTL on the apex and www to be seen coming out of the authoritative nameservers
# 48 hours before the freeze, with the value recorded, so that the previously
# cached TTL has certainly expired before the records change. Terraform already
# sets that TTL, in both the legacy-mirror state and the alias state, precisely so
# there is no separate drop step to forget -- which is why lowering it here would
# be a second writer for a value Terraform owns, and the collision between a
# hand-applied record and the apply that follows it is the failure the whole
# records-actor posture exists to prevent. What was missing was never the write.
# It was the observation.
#
#   --phase handover   verify the apex and www TTL as served by the zone's own
#                      nameservers, ahead of the flip at the write-freeze.
#                      Default records: "footbag.org.,www.footbag.org.".
#
# The MX/TXT TTL before the mail cutover is a separate step on the same zone and
# is not checked here: this reads A/AAAA only. The apex MX TTL is 1 day as served
# today, so that pre-shrink has to lead the MX flip by at least that.
#
# Required env vars:
#   FOOTBAG_LEGACY_HOSTED_ZONE_ID    Hosted-zone id for the zone
# Optional:
#   FOOTBAG_DNS_ZONE                 Zone apex (default: footbag.org)
#   FOOTBAG_LEGACY_RECORDS           Comma-separated record names, trailing dot,
#                                    overriding the per-phase default
#   FOOTBAG_DNS_TTL_SECONDS          TTL the gate requires (default: 60)
#   FOOTBAG_DNS_AUTHORITATIVE_NS     Comma-separated nameservers to ask, instead
#                                    of the zone's own NS set
#   --mock                           Skip every lookup; emit PASS so the
#                                    aggregator can be exercised without network
#
# Exits non-zero when a required TTL is not observed, or a lookup cannot be made.

set -euo pipefail
cd "$(dirname "$0")/.."

MOCK=0
PHASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mock) MOCK=1; shift ;;
    --phase) PHASE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

case "${PHASE}" in
  handover) DEFAULT_RECORDS="footbag.org.,www.footbag.org." ;;
  *) echo "--phase handover is required (it is the only phase: the apex/www TTL ahead of the operator's flip on Route 53)" >&2; exit 2 ;;
esac

if [[ "${MOCK}" -eq 1 ]]; then
  printf 'GATE: DNS-TTL PASS: mock mode (no lookup performed; proves nothing about the zone)\n'
  exit 0
fi

ZONE_ID="${FOOTBAG_LEGACY_HOSTED_ZONE_ID:-}"
if [[ -z "${ZONE_ID}" ]]; then
  echo "FOOTBAG_LEGACY_HOSTED_ZONE_ID must be set" >&2
  exit 1
fi

ZONE="${FOOTBAG_DNS_ZONE:-footbag.org}"
RECORDS="${FOOTBAG_LEGACY_RECORDS:-${DEFAULT_RECORDS}}"
TTL="${FOOTBAG_DNS_TTL_SECONDS:-60}"

if ! [[ "${TTL}" =~ ^[0-9]+$ ]]; then
  echo "FOOTBAG_DNS_TTL_SECONDS must be a whole number of seconds, got '${TTL}'" >&2
  exit 1
fi

for tool in dig aws; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} not found in PATH" >&2
    exit 1
  fi
done

# The gate says "from the authoritative nameservers", so the zone's own NS set is
# what gets asked, not whatever the local resolver has cached. Every one of them
# is asked: a zone whose delegation includes a server that answers differently,
# or does not answer at all, is exactly the condition worth catching before the
# flip rather than during it.
if [[ -n "${FOOTBAG_DNS_AUTHORITATIVE_NS:-}" ]]; then
  NS_LIST="${FOOTBAG_DNS_AUTHORITATIVE_NS}"
else
  NS_LIST=$(dig +short NS "${ZONE}" 2>/dev/null | sed 's/\.$//' | paste -sd, - || true)
fi

if [[ -z "${NS_LIST}" ]]; then
  echo "no authoritative nameservers found for ${ZONE}; set FOOTBAG_DNS_AUTHORITATIVE_NS to name them" >&2
  exit 1
fi

fail=0
observed_any=0

# What Route 53 holds, as opposed to what it serves. This is the half that dig
# cannot answer: an alias is served as an ordinary address record, so a resolver
# sees a TTL that the alias does not own and cannot be asked to change -- Route 53
# takes it from the target. Saying so is the honest result for a name that has
# already flipped, and it is why reading the API here is worth the call.
classify_record() {
  local name="$1" rtype="$2" sets
  sets=$(aws route53 list-resource-record-sets \
    --hosted-zone-id "${ZONE_ID}" \
    --query "ResourceRecordSets[?Name=='${name}' && Type=='${rtype}']" \
    --output json) || return 1
  printf '%s' "${sets}" | python3 -c '
import json, sys

sets = json.load(sys.stdin)
if not sets:
    print("absent")
elif len(sets) > 1:
    # More than one set at one name and type means a routing policy is in play and
    # each set carries its own TTL. Reporting it beats picking the first and
    # calling the name verified.
    print("multiple %d" % len(sets))
elif "AliasTarget" in sets[0]:
    print("alias")
else:
    print("simple %s" % sets[0].get("TTL", "none"))
'
}

IFS=',' read -ra REC_LIST <<< "${RECORDS}"
IFS=',' read -ra NS_ARR <<< "${NS_LIST}"

for rec in "${REC_LIST[@]}"; do
  for rtype in A AAAA; do
    if ! shape=$(classify_record "${rec}" "${rtype}"); then
      printf 'GATE: DNS-TTL FAIL: cannot read %s %s from zone %s\n' "${rec}" "${rtype}" "${ZONE_ID}"
      fail=1
      continue
    fi

    case "${shape}" in
      absent)
        # The legacy zone carries no IPv6 at either name, so an absent AAAA is the
        # expected state and not a finding.
        continue
        ;;
      multiple*)
        printf 'GATE: DNS-TTL FAIL: %s %s has %s record sets; each carries its own TTL and this check assumes one\n' \
          "${rec}" "${rtype}" "${shape#multiple }"
        fail=1
        continue
        ;;
      alias)
        printf 'note: %s %s is an ALIAS, so it has no TTL of its own; the value served below is inherited from its target\n' \
          "${rec}" "${rtype}"
        ;;
    esac

    for ns in "${NS_ARR[@]}"; do
      answer=$(dig "@${ns}" +noall +answer "${rec}" "${rtype}" 2>/dev/null || true)
      served=$(printf '%s' "${answer}" | sed -E 's/[[:space:]]+/ /g' | cut -d' ' -f2 | head -1)
      if [[ -z "${served}" ]]; then
        printf 'GATE: DNS-TTL FAIL: %s %s returned no answer from %s\n' "${rec}" "${rtype}" "${ns}"
        fail=1
        continue
      fi
      observed_any=1
      # The observed value is printed for every name and every server whether it
      # passes or fails: this line is what the cutover log keeps as the record
      # that the TTL was seen, and when it was.
      printf 'observed: %s %s ttl=%s from %s (required %s)\n' "${rec}" "${rtype}" "${served}" "${ns}" "${TTL}"
      if [[ "${served}" != "${TTL}" ]]; then
        printf 'GATE: DNS-TTL FAIL: %s %s served ttl %s from %s, gate requires %s\n' \
          "${rec}" "${rtype}" "${served}" "${ns}" "${TTL}"
        fail=1
      fi
    done
  done
done

if [[ "${observed_any}" -eq 0 && "${fail}" -eq 0 ]]; then
  printf 'GATE: DNS-TTL FAIL: no A or AAAA record was observed for %s; the gate cannot pass on an empty result\n' "${RECORDS}"
  exit 1
fi

if [[ "${fail}" -ne 0 ]]; then
  exit 1
fi

printf 'GATE: DNS-TTL PASS: every checked record served ttl %s from all %d authoritative nameservers\n' \
  "${TTL}" "${#NS_ARR[@]}"
exit 0
