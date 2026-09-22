#!/usr/bin/env bash
# check-certificate-transparency.sh -- who holds a publicly trusted certificate
# for a name under the domain, according to the public logs.
#
# Why this exists. The apex certificate-authorisation record constrains WHICH
# authority may issue for a name under the domain. It does not constrain WHO may
# prove control to that authority: the permitted authority also accepts proof by
# mail to five fixed system addresses at the domain, and strips a leading www so
# a request for the canonical host is proved at the apex set. Until the apex mail
# records point at Google, those addresses reach the outgoing operator's host, so
# for that window the authorisation record is a partial bound and nothing else
# watches the gap.
#
# A certificate issued in that window is not visible from the zone, survives the
# window (up to 200 days at the current maximum), and exports with its private
# key. The public logs are the only place it shows up, which is what this reads.
#
# It READS and never writes. No AWS call, no zone change, no registrar action.
#
# What it refuses to do: judge. It reports every name it finds and fails when one
# is outside the served set the design fixes. It does not decide whether an
# unexpected certificate is benign; that is the operator's call, and a run that
# guessed would teach the operator to ignore it.
#
# Usage:
#   bash scripts/check-certificate-transparency.sh --domain <name> [--out <path>]
#   bash scripts/check-certificate-transparency.sh --mock --domain <name>
#
#   --domain   the registrable domain to read the logs for. Required, with no
#              default: which domain a run reports on is exactly the thing that
#              must not be inherited from ambient state.
#   --out      write the report here as well as printing it. Put it in the
#              private operations checkout beside the other cutover evidence.
#   --mock     read nothing and say so. A mocked pre-cutover run attests to
#              nothing outside the operator's own workstation, and this gate
#              reads the public logs over the network, so a mocked run must not
#              perform it at all. Prints the skip line the aggregator carries up
#              and exits 0.
#
# Exits non-zero when a certificate covers a name outside the served set, or when
# the logs could not be read. An empty result is a pass and says so: no
# certificate under the domain is the expected state before the platform's own
# are issued.
#
# Test seam: FOOTBAG_CURL_BIN replaces curl. A run using it says so on stderr,
# because a stubbed run proves nothing about the logs.

set -euo pipefail

DOMAIN=""
OUT=""
MOCK=0
CURL_BIN="${FOOTBAG_CURL_BIN:-curl}"

if [[ -n "${FOOTBAG_CURL_BIN:-}" ]]; then
  echo "NOTE: FOOTBAG_CURL_BIN is set, so this run reads a stub rather than the public logs." >&2
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2 || { echo "ERROR: --domain requires a name" >&2; exit 2; }
      ;;
    --out)
      OUT="${2:-}"
      shift 2 || { echo "ERROR: --out requires a path" >&2; exit 2; }
      ;;
    --mock)
      MOCK=1
      shift
      ;;
    --help|-h)
      # The whole header, found by reading to the first line that is not a
      # comment rather than by a line number, so the usage cannot outgrow it.
      sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: --domain is required (the registrable domain to read the logs for)." >&2
  exit 2
fi

# A mocked run performs no lookup. Saying so in the gate line rather than
# reporting a pass is the same rule the DNS and image gates follow: a gate that
# inspected nothing must not read as one that looked and was satisfied.
if [[ "${MOCK}" -eq 1 ]]; then
  echo "GATE: CERT-TRANSPARENCY SKIPPED: mock mode (no log read; proves nothing about issuance)"
  exit 0
fi

# The served set the design fixes, plus the two names the platform itself needs
# during the transition. Anything else under the domain holding a certificate is
# what this run exists to surface.
SERVED_SET=(
  "$DOMAIN"
  "www.${DOMAIN}"
  "archive.${DOMAIN}"
  "preview.${DOMAIN}"
  "origin.${DOMAIN}"
  "mail.${DOMAIN}"
)

REPORT=""
add_line() {
  REPORT="${REPORT}${1}"$'\n'
  printf '%s\n' "$1"
}

add_line "Certificate transparency report"
add_line "  domain:    ${DOMAIN}"
add_line "  measured:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
add_line ""
add_line "  The authorisation record at the apex limits which authority may issue."
add_line "  It does not limit who may prove control to that authority, so this reads"
add_line "  the logs instead of inferring safety from the zone."
add_line ""

# One query, covering the domain and every name beneath it. Failure to read is a
# failure of the run: an empty answer and an unreachable log look identical
# otherwise, and the second must never be reported as the first.
RAW=""
if ! RAW="$("$CURL_BIN" -sS --max-time 60 \
  -H 'Accept: application/json' \
  "https://crt.sh/?q=%25.${DOMAIN}&output=json" 2>/dev/null)"; then
  echo "FAIL: could not read the certificate logs for ${DOMAIN}." >&2
  echo "      An unreadable log is not an empty one; re-run before drawing a conclusion." >&2
  exit 1
fi

# An empty body and the literal empty array both mean no certificate is logged.
if [[ -z "${RAW//[[:space:]]/}" || "${RAW//[[:space:]]/}" == "[]" ]]; then
  add_line "  No certificate is logged for any name under ${DOMAIN}."
  add_line ""
  add_line "  pass (nothing logged)"
  [[ -n "$OUT" ]] && printf '%s' "$REPORT" > "$OUT"
  exit 0
fi

if ! NAMES="$(printf '%s' "$RAW" | jq -r '.[] | .name_value' 2>/dev/null | tr '\n' '\n' | sort -u)"; then
  echo "FAIL: the certificate log answered with something this cannot parse." >&2
  exit 1
fi

unexpected=0
expected=0
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  # A wildcard entry is reported under the name it covers rather than silently
  # matched against the served set, because a wildcard is broader than any single
  # name in it and the operator should see it as a wildcard.
  match=0
  for allowed in "${SERVED_SET[@]}"; do
    if [[ "$name" == "$allowed" ]]; then
      match=1
      break
    fi
  done
  if (( match == 1 )); then
    expected=$((expected + 1))
    add_line "EXPECTED    ${name}"
  else
    unexpected=$((unexpected + 1))
    add_line "UNEXPECTED  ${name}  not in the served set"
  fi
done <<< "$NAMES"

add_line ""
add_line "  in the served set: ${expected}"
add_line "  outside it:        ${unexpected}"

[[ -n "$OUT" ]] && printf '%s' "$REPORT" > "$OUT"

if (( unexpected > 0 )); then
  echo "FAIL: ${unexpected} name(s) hold a logged certificate and are not in the served set." >&2
  echo "      Each is either a name the design added and this script does not know" >&2
  echo "      about, or a certificate nobody here requested. This does not judge" >&2
  echo "      which; it refuses to pass over either." >&2
  exit 1
fi

echo "[certificate-transparency] pass (${expected} in the served set, none outside it)"
