#!/usr/bin/env bash
# verify-mail-records.sh -- prove the footbag.org mail records are being served,
# at the points in the mail move where the sequence waits on them, and after a
# revert of it.
#
# The mail move is ordered so that the legacy webmaster's own address keeps
# working in both directions at every moment. Two of its steps wait on records
# being served rather than merely applied: Google's signing key for footbag.org
# must be live before anything else changes, so mail sent from Google-hosted
# addresses is signed when the sender policy is replaced; and after the mail-day
# apply, every record it publishes must be seen together, with the domain's
# verification token still in the apex text set. Both used to be hand-typed
# lookups. This script is those lookups, judged.
#
# It READS and never writes. Each record is asked of a Route 53 nameserver, whose
# answer must carry the authoritative flag, and of a public resolver, which is
# what the rest of the world sees: an answer the nameserver gives and the
# resolver does not yet give is a propagation wait, reported as a failure so
# that nothing downstream proceeds on it.
#
#   --stage signing    before mail day: google._domainkey.footbag.org serves the
#                      key the values file publishes, exactly.
#   --stage mail-day   after the mail-day apply: the apex routes mail to Google
#                      alone; the apex sender policy names SES and Google only;
#                      the domain verification token is still present; the
#                      reporting policy is served at p=none, the staged starting
#                      point; the bounce-domain records and the signing key are
#                      all served.
#   --stage rollback   after the mail-day apply is reverted: the apex mail routing
#                      and the apex sender policy are the legacy values the values
#                      file carries, served again, with the verification token
#                      kept. A revert is proved, not assumed.
#
# Usage:
#   bash scripts/verify-mail-records.sh --stage <signing|mail-day|rollback> \
#        --nameserver <route53-ns> --resolver <public-resolver> [--tfvars <path>]
#
#   --nameserver  one of the zone's Route 53 nameservers. Required, with no
#                 default. Read the four from
#                 `terraform -chdir=terraform/production output route53_name_servers`.
#   --resolver    a public resolver to ask as the world does, for example
#                 8.8.8.8. Required, with no default.
#   --tfvars      the production values file. Required for the signing stage,
#                 which compares the served key with its google_dkim_txt value,
#                 and for rollback, which reads legacy_mx_records and
#                 legacy_apex_spf from it; optional for mail-day, which then
#                 compares the key as well.
#
# Every observed value is printed with the time it was observed, for the cutover
# log. Exits 0 when every check passes on both servers, 1 when any fails or could
# not be asked, and 2 on a usage error.
#
# Test seam: FOOTBAG_DIG_BIN replaces dig. A run using it says so on stderr,
# because a stubbed run proves nothing about the zone.

set -euo pipefail

APEX="footbag.org"
STAGE=""
NAMESERVER=""
RESOLVER=""
TFVARS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)      STAGE="${2:-}";      shift 2 || { echo "ERROR: --stage requires a value" >&2; exit 2; } ;;
    --nameserver) NAMESERVER="${2:-}"; shift 2 || { echo "ERROR: --nameserver requires a value" >&2; exit 2; } ;;
    --resolver)   RESOLVER="${2:-}";   shift 2 || { echo "ERROR: --resolver requires a value" >&2; exit 2; } ;;
    --tfvars)     TFVARS="${2:-}";     shift 2 || { echo "ERROR: --tfvars requires a path" >&2; exit 2; } ;;
    -h|--help)    sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

case "$STAGE" in
  signing|mail-day|rollback) ;;
  *) echo "ERROR: --stage must be 'signing', 'mail-day' or 'rollback'." >&2; exit 2 ;;
esac
if [[ -z "$NAMESERVER" ]]; then
  echo "ERROR: --nameserver is required (a Route 53 nameserver for ${APEX})." >&2
  exit 2
fi
if [[ -z "$RESOLVER" ]]; then
  echo "ERROR: --resolver is required (a public resolver, asked as the world asks)." >&2
  exit 2
fi
if [[ "$STAGE" == "signing" && -z "$TFVARS" ]]; then
  echo "ERROR: --tfvars is required for the signing stage: the served key is compared with the one the values file publishes." >&2
  exit 2
fi
if [[ "$STAGE" == "rollback" && -z "$TFVARS" ]]; then
  echo "ERROR: --tfvars is required for the rollback stage: the served records are compared with the legacy values the values file carries." >&2
  exit 2
fi
if [[ -n "$TFVARS" && ! -r "$TFVARS" ]]; then
  echo "ERROR: cannot read the values file '$TFVARS'." >&2
  exit 2
fi

DIG_BIN="${FOOTBAG_DIG_BIN:-dig}"
[[ -n "${FOOTBAG_DIG_BIN:-}" ]] && echo "NOTE: using a stand-in for dig; this run proves nothing about the zone." >&2

# A text record arrives as one or more quoted strings; a long key is split across
# several. What a receiver reads is their concatenation, so that is what is
# compared. The values file writes the split as an empty-quote pair with no space,
# which is the form the DNS provider takes, and a served answer shows it with a
# space; both join the same way.
join_txt() {
  sed -E 's/" *"//g; s/^"//; s/"$//'
}

# A single-line string value from the values file, with the HCL escaping of its
# quotes undone.
tfvars_string() {
  local line rhs
  line="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$TFVARS" | tail -1 || true)"
  rhs="$(printf '%s' "$line" | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*$//')"
  rhs="${rhs#\"}"; rhs="${rhs%\"}"
  printf '%s' "$rhs" | sed 's/\\"/"/g'
}

# The key the values file publishes, joined the same way a receiver joins it.
EXPECTED_KEY=""
if [[ -n "$TFVARS" ]]; then
  EXPECTED_KEY="$(tfvars_string google_dkim_txt | join_txt)"
  if [[ -z "$EXPECTED_KEY" && "$STAGE" == "signing" ]]; then
    echo "ERROR: google_dkim_txt is empty or absent in '$TFVARS', so there is no published key to check." >&2
    exit 2
  fi
fi

# The legacy values a reverted mail apply must serve again. The routing is a list,
# compared as a set without regard to case, because the provider may change the
# case of a host name it serves.
EXPECTED_LEGACY_MX=""
EXPECTED_LEGACY_SPF=""
if [[ "$STAGE" == "rollback" ]]; then
  EXPECTED_LEGACY_MX="$(python3 - "$TFVARS" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
m = re.search(r'^\s*legacy_mx_records\s*=\s*\[(.*?)\]', text, re.M | re.S)
if m:
    for v in sorted(s.lower() for s in re.findall(r'"([^"]*)"', m.group(1))):
        print(v)
PY
)"
  EXPECTED_LEGACY_SPF="$(tfvars_string legacy_apex_spf)"
  if [[ -z "$EXPECTED_LEGACY_MX" || -z "$EXPECTED_LEGACY_SPF" ]]; then
    echo "ERROR: legacy_mx_records and legacy_apex_spf must both be set in '$TFVARS' to check a rollback." >&2
    exit 2
  fi
fi

fail=0
OBSERVED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Observed at ${OBSERVED_AT}, stage ${STAGE}, nameserver ${NAMESERVER}, resolver ${RESOLVER}."

# One answer set per server: the records, one per line, without dig's comments.
# The authoritative flag is required of the nameserver, because a nameserver
# that is not authoritative for the zone answers from somewhere else.
ask() {
  local server="$1" name="$2" rtype="$3" out status=0 rec="+rec"
  # The nameserver is asked without recursion, so it answers from its own zone;
  # the resolver is asked with it, as every mail server in the world asks.
  [[ "$server" == "$NAMESERVER" ]] && rec="+norec"
  out="$("$DIG_BIN" "$rec" +noall +comments +answer +tries=3 +time=3 "@${server}" "$name" "$rtype" 2>&1)" || status=$?
  if (( status != 0 )); then
    echo "FAIL: ${name} ${rtype} could not be asked of ${server} (dig exit ${status})." >&2
    return 1
  fi
  if [[ "$server" == "$NAMESERVER" ]] && ! printf '%s\n' "$out" | grep -qE 'flags:[^;]* aa'; then
    echo "FAIL: ${server} did not answer ${name} ${rtype} authoritatively; name a Route 53 nameserver for ${APEX}." >&2
    return 1
  fi
  printf '%s\n' "$out" | { grep -vE '^[[:space:]]*;' || true; } | awk 'NF' \
    | sed -E 's/[[:space:]]+/ /g' | cut -d' ' -f5-
}

check() {
  local label="$1" name="$2" rtype="$3" judge="$4" server values
  for server in "$NAMESERVER" "$RESOLVER"; do
    if ! values="$(ask "$server" "$name" "$rtype")"; then
      fail=1
      continue
    fi
    if [[ -z "$values" ]]; then
      echo "FAIL: ${label}: ${name} ${rtype} has no answer from ${server}."
      fail=1
      continue
    fi
    printf '%s\n' "$values" | sed "s|^|observed: ${name} ${rtype} from ${server}: |"
    if "$judge" "$values"; then
      echo "PASS: ${label} (${server})."
    else
      if [[ "$server" == "$RESOLVER" ]]; then
        echo "FAIL: ${label}: ${server} does not serve it yet. If the nameserver passed, this is propagation: re-run later, and proceed only on a pass."
      else
        echo "FAIL: ${label} (${server})."
      fi
      fail=1
    fi
  done
}

judge_key() {
  local served
  served="$(printf '%s\n' "$1" | head -1 | join_txt)"
  [[ "$(printf '%s\n' "$1" | wc -l)" -eq 1 ]] || return 1
  if [[ -n "$EXPECTED_KEY" ]]; then
    [[ "$served" == "$EXPECTED_KEY" ]]
  else
    [[ "$served" == v=DKIM1* && "$served" == *"p="* ]]
  fi
}
judge_mx() {
  [[ "$1" == "1 smtp.google.com." ]]
}
judge_apex_txt() {
  local spf token
  spf="$(printf '%s\n' "$1" | join_txt_lines | grep -c '^v=spf1' || true)"
  token="$(printf '%s\n' "$1" | join_txt_lines | grep -c '^google-site-verification=' || true)"
  [[ "$spf" -eq 1 ]] \
    && printf '%s\n' "$1" | join_txt_lines | grep -qxF 'v=spf1 include:amazonses.com include:_spf.google.com ~all' \
    && [[ "$token" -ge 1 ]]
}
judge_dmarc() {
  local v
  v="$(printf '%s\n' "$1" | head -1 | join_txt)"
  # The policy starts at p=none and tightens only later, on clean reports; a
  # stricter policy on mail day would quarantine legitimate senders not yet known.
  [[ "$v" == v=DMARC1\;* && "$v" =~ (^|;)[[:space:]]*p=none[[:space:]]*(;|$) && "$v" == *"rua=mailto:"* ]]
}
judge_rollback_mx() {
  [[ "$(printf '%s\n' "$1" | tr 'A-Z' 'a-z' | sort)" == "$EXPECTED_LEGACY_MX" ]]
}
judge_rollback_txt() {
  local spf token
  spf="$(printf '%s\n' "$1" | join_txt_lines | grep -c '^v=spf1' || true)"
  token="$(printf '%s\n' "$1" | join_txt_lines | grep -c '^google-site-verification=' || true)"
  [[ "$spf" -eq 1 ]] \
    && printf '%s\n' "$1" | join_txt_lines | grep -qxF "$EXPECTED_LEGACY_SPF" \
    && [[ "$token" -ge 1 ]]
}
judge_bounce_mx() {
  [[ "$1" =~ ^10\ feedback-smtp\.[a-z0-9-]+\.amazonses\.com\.$ ]]
}
judge_bounce_txt() {
  [[ "$(printf '%s\n' "$1" | join_txt_lines)" == "v=spf1 include:amazonses.com ~all" ]]
}
join_txt_lines() {
  while IFS= read -r l; do printf '%s\n' "$l" | join_txt; done
}

case "$STAGE" in
  signing)
    check "the Google signing key matches the values file" "google._domainkey.${APEX}" TXT judge_key
    ;;
  mail-day)
    check "apex mail routes to Google alone" "$APEX" MX judge_mx
    check "apex sender policy names SES and Google only, and the verification token is kept" "$APEX" TXT judge_apex_txt
    check "reporting policy is published" "_dmarc.${APEX}" TXT judge_dmarc
    check "bounce domain routes to SES feedback" "mail.${APEX}" MX judge_bounce_mx
    check "bounce domain sender policy" "mail.${APEX}" TXT judge_bounce_txt
    check "the Google signing key is still served" "google._domainkey.${APEX}" TXT judge_key
    ;;
  rollback)
    check "apex mail routes to the legacy host again" "$APEX" MX judge_rollback_mx
    check "apex sender policy is the legacy one again, and the verification token is kept" "$APEX" TXT judge_rollback_txt
    ;;
esac

if (( fail != 0 )); then
  echo "GATE: MAIL-RECORDS FAIL (${STAGE}) at ${OBSERVED_AT}."
  exit 1
fi
if [[ "$STAGE" == "mail-day" ]]; then
  echo "GATE: MAIL-RECORDS PASS (mail-day) at ${OBSERVED_AT}. Outside mail tests run no sooner than 3600 seconds after the apply."
elif [[ "$STAGE" == "rollback" ]]; then
  echo "GATE: MAIL-RECORDS PASS (rollback) at ${OBSERVED_AT}. The legacy mail routing and sender policy are served again."
else
  echo "GATE: MAIL-RECORDS PASS (signing) at ${OBSERVED_AT}. Start authentication in the Workspace console next."
fi
exit 0
