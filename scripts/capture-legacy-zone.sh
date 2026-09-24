#!/usr/bin/env bash
# capture-legacy-zone.sh -- take the fresh capture of the legacy footbag.org zone
# that releases the registrar change, and diff it against the committed capture.
#
# The zone-move gate asks for a fresh capture taken just before the move, with
# every name then verified as served from the Route 53 nameservers against it.
# The verification is scripted (verify-zone-mirror.sh); the capture it compares
# against was a hand-typed zone transfer, and nothing compared a new transfer
# with the capture already committed. A zone the legacy operator changed after
# the last capture would then be mirrored stale, and the verification would pass
# against the old file. This script is that capture and that comparison.
#
# It READS the legacy zone by zone transfer and writes exactly one new file: the
# capture, at the path given, which it refuses to overwrite. It never touches
# Route 53, Terraform state or the registrar.
#
# What it refuses:
#   - an incomplete transfer. A zone transfer opens and closes with the zone's
#     SOA record; a transfer missing either is truncated or refused, and a
#     truncated capture would make every missing name look deliberately absent.
#   - a non-authoritative answer. The transfer is asked of the named server, and
#     a server that does not hold the zone cannot serve one.
#   - an existing output file. A capture is evidence, and evidence is added,
#     never replaced.
#
# Usage:
#   bash scripts/capture-legacy-zone.sh --nameserver <legacy-ns> \
#        --against <committed-capture> --out <new-capture-path>
#
#   --nameserver  a legacy nameserver the registry delegates to. Required, with
#                 no default: read the delegation from the registry with
#                 `dig +norec NS footbag.org @a0.org.afilias-nst.info`.
#   --against     the committed capture this one is compared with. Required.
#   --out         where the new capture is written: the zone-capture folder in
#                 the private operations checkout, named with today's date.
#                 Required, and refused if it already exists.
#
# Exits 0 when the transfer is complete and identical in content to the committed
# capture, 1 when the transfer failed or the zone has changed (the capture is
# still written in the second case, because it is the new reference), and 2 on
# a usage error.
#
# Test seam: FOOTBAG_DIG_BIN replaces dig. A run using it says so on stderr,
# because a stubbed run proves nothing about the zone.

set -euo pipefail

ZONE="footbag.org"
NAMESERVER=""
AGAINST=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --nameserver) NAMESERVER="${2:-}"; shift 2 || { echo "ERROR: --nameserver requires a value" >&2; exit 2; } ;;
    --against)    AGAINST="${2:-}";    shift 2 || { echo "ERROR: --against requires a path" >&2; exit 2; } ;;
    --out)        OUT="${2:-}";        shift 2 || { echo "ERROR: --out requires a path" >&2; exit 2; } ;;
    -h|--help)    sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

if [[ -z "$NAMESERVER" ]]; then
  echo "ERROR: --nameserver is required (a legacy nameserver the registry delegates to)." >&2
  exit 2
fi
if [[ -z "$AGAINST" ]]; then
  echo "ERROR: --against is required (the committed capture to compare with)." >&2
  exit 2
fi
if [[ ! -r "$AGAINST" ]]; then
  echo "ERROR: cannot read the committed capture '$AGAINST'." >&2
  exit 2
fi
if [[ -z "$OUT" ]]; then
  echo "ERROR: --out is required (the new capture's path in the private checkout)." >&2
  exit 2
fi
if [[ -e "$OUT" ]]; then
  echo "ERROR: '$OUT' already exists. A capture is evidence and is never replaced; name the new one by date." >&2
  exit 2
fi
if [[ ! -d "$(dirname "$OUT")" ]]; then
  echo "ERROR: the folder for '$OUT' does not exist." >&2
  exit 2
fi

DIG_BIN="${FOOTBAG_DIG_BIN:-dig}"
[[ -n "${FOOTBAG_DIG_BIN:-}" ]] && echo "NOTE: using a stand-in for dig; this run proves nothing about the zone." >&2

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT INT TERM

dig_status=0
"$DIG_BIN" AXFR "$ZONE" "@${NAMESERVER}" +noall +answer +tries=3 +time=10 > "$TMP" 2>&1 || dig_status=$?
if (( dig_status != 0 )); then
  echo "FAIL: the zone transfer from ${NAMESERVER} failed (dig exit ${dig_status}); nothing was written." >&2
  sed 's/^/  /' "$TMP" >&2
  exit 1
fi

# dig reports a refused or failed transfer as a comment line in its output
# rather than through its exit status, so the content decides, not the status.
if grep -qE '^;' "$TMP"; then
  echo "FAIL: the transfer from ${NAMESERVER} was not clean; nothing was written:" >&2
  grep -E '^;' "$TMP" | sed 's/^/  /' >&2
  exit 1
fi

first_type="$(awk 'NF { print $4; exit }' "$TMP")"
last_type="$(awk 'NF { t = $4 } END { print t }' "$TMP")"
if [[ "$first_type" != "SOA" || "$last_type" != "SOA" ]]; then
  echo "FAIL: the transfer from ${NAMESERVER} does not open and close with the SOA record, so it is incomplete; nothing was written." >&2
  exit 1
fi

cp "$TMP" "$OUT"
echo "Written: ${OUT}"

# The content that matters is the set of record values, which is what the mirror
# carries. Whitespace and the order dig happens to emit are not the zone, and
# neither are the cache lifetimes, which the mirror deliberately lowers; the SOA
# is the legacy operator's own bookkeeping and is not mirrored. So both sides are
# compared as sets of name, class, type and value, and the serials are reported.
normalise() {
  sed -E 's/[[:space:]]+/ /g; s/ $//' "$1" | awk 'NF && $4 != "SOA" { $2 = ""; print }' | sed 's/  / /' | sort -u
}
records="$(normalise "$OUT" | wc -l | tr -d ' ')"
names="$(normalise "$OUT" | cut -d' ' -f1 | sort -u | wc -l | tr -d ' ')"
serial="$(awk '$4 == "SOA" { print $7; exit }' "$OUT")"
old_serial="$(awk '$4 == "SOA" { print $7; exit }' "$AGAINST")"
echo "Captured from ${NAMESERVER}: ${records} distinct records besides the SOA, at ${names} names; SOA serial ${serial} (committed capture: ${old_serial})."

added="$(comm -13 <(normalise "$AGAINST") <(normalise "$OUT"))"
removed="$(comm -23 <(normalise "$AGAINST") <(normalise "$OUT"))"
if [[ -z "$added" && -z "$removed" ]]; then
  echo "PASS: identical in content to ${AGAINST}. Verify the mirror against the new capture next."
  exit 0
fi

echo "FAIL: the zone has changed since ${AGAINST}. The mirror's values must be updated before the registrar is touched."
if [[ -n "$removed" ]]; then
  echo "Only in the committed capture:"
  printf '%s\n' "$removed" | sed 's/^/  - /'
fi
if [[ -n "$added" ]]; then
  echo "Only in the new capture:"
  printf '%s\n' "$added" | sed 's/^/  + /'
fi
exit 1
