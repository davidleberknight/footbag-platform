#!/usr/bin/env bash
# scripts/provision-origin-tls.sh -- issues the certificate that encrypts the
# CloudFront-to-origin hop on production, installs its renewal, and proves nginx
# serves it on 443; or reports where that stands.
#
# Why this exists: CloudFront reaches the origin over plain HTTP until the origin
# holds a publicly trusted certificate for a name of its own, origin.<domain>.
# Until then session cookies, payment webhooks and the origin-verify secret
# cross that hop in clear. Let's Encrypt issues that certificate by DNS-01: the
# host writes one TXT record in the zone, through a role that may write that
# record and nothing else. Production only: staging has no name of its own in a
# zone this account controls, so its hop stays plaintext.
#
# A run owns the whole change, in this order:
#   1. the Terraform outputs: the origin's name and the challenge role, both
#      present only once enable_origin_record has created them;
#   2. public DNS: the domain delegated to Route 53, the origin name resolving
#      to the host's static address, and its CAA record permitting Let's
#      Encrypt, because DNS-01 and the CAA check read the public answers;
#   3. the role, simulated against IAM: allowed to write the challenge record
#      and refused on the apex, www, the mail records and any other TXT name;
#   4. a typed APPLY at a terminal;
#   5. on the host: certbot from the distribution's own repositories, the
#      profile that reaches the role, a rehearsal issue against Let's Encrypt's
#      staging authority, then the real issue, the renewal timer with the
#      profile in its environment, and the hook that reloads nginx on renewal;
#   6. nginx restarted on a first issue so it renders its 443 listener, and the
#      certificate it serves on 443 proved to be the one on disk.
# An issued certificate is never deleted: a later step depends on it, and Let's
# Encrypt limits how often the same name may be issued.
#
# What it does not do: switch CloudFront to https-only, close port 80, or
# rotate the origin-verify secret. Those follow, in that order, once this has
# proved the listener.
#
# What it refuses to do:
#   - Run with any target but production; there is no default.
#   - Act on a host whose recorded FOOTBAG_ENV is not production.
#   - Issue before the zone is delegated, the record resolves and its CAA
#     permits Let's Encrypt, or while the role can write anything beyond the
#     challenge record.
#   - Issue without a typed APPLY at a terminal, or as anyone but the directly
#     authenticated footbag-operator.
#   - Report success unless nginx serves the certificate on disk.
#
# Usage:
#   < <operator credential file> bash scripts/provision-origin-tls.sh --target production [--status]
#   bash scripts/provision-origin-tls.sh --target production --dry-run
#
# Flags:
#   --target    production (required)
#   --status    report certbot (installed, or what the host's repositories
#               offer), the certificate, the renewal timer and what nginx
#               serves on 443; changes nothing, and runs before the origin
#               record exists too
#   --dry-run   print what a run does; connects to nothing
#
# A re-run on a host already serving a valid certificate re-checks the renewal
# timer and hook, issues nothing, and says so.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/provision-origin-tls-remote.sh"
REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"

AWS_BIN="${FOOTBAG_ORIGIN_TLS_AWS_BIN:-aws}"
DIG_BIN="${FOOTBAG_ORIGIN_TLS_DIG_BIN:-dig}"
[[ -n "${FOOTBAG_ORIGIN_TLS_AWS_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_ORIGIN_TLS_AWS_BIN='${AWS_BIN}' -- this run proves nothing about the estate." >&2
[[ -n "${FOOTBAG_ORIGIN_TLS_DIG_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_ORIGIN_TLS_DIG_BIN='${DIG_BIN}' -- not reading public DNS." >&2

# The public resolver every DNS read here asks, so the answers are the ones
# Let's Encrypt's own lookups see, not a local cache or the workstation's split
# view.
RESOLVER=1.1.1.1

TARGET="" MODE=issue
usage() {
  sed -n '/^# Usage:/,/^# A re-run/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "provision-origin-tls: --target requires an argument" >&2; exit 2; } ;;
    --status)  MODE=status; shift ;;
    --dry-run) MODE=dry-run; shift ;;
    -h|--help) usage 0 ;;
    *) echo "provision-origin-tls: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done
require_target "$TARGET" production || exit 2

ALIAS="footbag-${TARGET}"
TF_DIR="${REPO_ROOT}/terraform/${TARGET}"

if [[ "$MODE" == dry-run ]]; then
  echo "== dry run: origin TLS on ${ALIAS}"
  echo ""
  echo "Would run, in order:"
  echo "  1. Read origin_hostname, origin_tls_role_arn, lightsail_static_ip and"
  echo "     route53_zone_id from the production Terraform outputs"
  echo "  2. Ask ${RESOLVER} for the domain's nameservers (Route 53), the origin"
  echo "     name's address (the static IP) and its CAA (letsencrypt.org)"
  echo "  3. Simulate the challenge role: allowed on the challenge TXT record,"
  echo "     refused on the apex, www, MX and another TXT name"
  echo "  4. Ask for a typed APPLY"
  echo "  5. On the host: install certbot, write the role's profile, issue against"
  echo "     Let's Encrypt's staging authority and then its production one, enable"
  echo "     the renewal timer and install the nginx reload hook"
  echo "  6. Restart nginx on a first issue and prove the certificate it serves on"
  echo "     443 is the one on disk"
  cr_unproved "anything about the estate: a dry run connects to nothing"
  cr_finish
fi

local_file() { [[ -r "$1" ]] || cr_die "missing ${1#"${REPO_ROOT}/"}"; }
local_file "$REMOTE_HALF"
local_file "$REPORT_LIB"

# ── 1. The Terraform outputs ────────────────────────────────────────────────
# read_output <variable> <output>
# Called directly, never inside $(...), so a refusal ends this run and its
# report rather than a subshell.
read_output() {
  tf_output_read "$TF_DIR" "$2" \
    || cr_die "could not read ${2} from the ${TARGET} Terraform: ${TF_OUTPUT_ERROR:-unknown}; nothing was changed"
  printf -v "$1" '%s' "$TF_OUTPUT_VALUE"
}
echo "== The production Terraform outputs"
read_output ORIGIN_HOST origin_hostname
read_output ROLE_ARN origin_tls_role_arn
read_output STATIC_IP lightsail_static_ip
read_output ZONE_ID route53_zone_id
# --status runs before the record exists too: it then reports what the host's
# own repositories offer for certbot, which is worth knowing before the zone
# moves, and says there is no certificate to read yet.
if [[ -z "$ORIGIN_HOST" || -z "$ROLE_ARN" ]]; then
  if [[ "$MODE" != status ]]; then
    cr_die "the origin record and its challenge role do not exist yet: enable_origin_record is off. It goes on once the zone is authoritative on Route 53; nothing was changed"
  fi
  ORIGIN_HOST="" ROLE_ARN=""
elif ! [[ "$ORIGIN_HOST" =~ ^origin\.[a-z0-9.-]+$ ]]; then
  cr_die "origin_hostname '${ORIGIN_HOST}' is not origin.<domain>; nothing was changed"
fi
[[ "$STATIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || cr_die "lightsail_static_ip '${STATIC_IP}' is not an address; nothing was changed"
[[ "$ZONE_ID" =~ ^Z[A-Z0-9]+$ ]] || cr_die "route53_zone_id '${ZONE_ID}' is not a hosted zone id; nothing was changed"
DOMAIN="${ORIGIN_HOST#origin.}"
CHALLENGE="_acme-challenge.${ORIGIN_HOST}"
if [[ -n "$ORIGIN_HOST" ]]; then
  cr_proved "Terraform holds ${ORIGIN_HOST} and its challenge role"
fi

require_ssh_alias "$ALIAS" || cr_die "no usable ssh alias ${ALIAS}"
require_operator_stdin "scripts/provision-origin-tls.sh --target ${TARGET}" "$ALIAS" "$TARGET" \
  || cr_die "no operator credential on standard input"
require_host_is "$ALIAS" "$TARGET" || cr_die "${ALIAS} is not the ${TARGET} host"

send() {
  local mode="$1"
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' "$mode"
    printf 'ORIGIN_HOST=%q\n' "$ORIGIN_HOST"
    printf 'ROLE_ARN=%q\n' "$ROLE_ARN"
    printf 'FOOTBAG_ENV_VAL=%q\n' "$TARGET"
    cat "$REPORT_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}
LAST_LOG=""
send_reported() {
  local label="$1" mode="$2" rc=0
  LAST_LOG="$(mktemp "$(_cr_tmp)/send.XXXXXX")"
  cr_run_marked "$label" -- _send_into "$LAST_LOG" "$mode" || rc=$?
  return "$rc"
}
_send_into() { local log="$1"; shift; send "$@" | cr_keep_marked "$log"; return "${PIPESTATUS[0]}"; }
marked() { grep -m1 -e "^---FOOTBAG-$1--- " -- "$LAST_LOG" | cut -d' ' -f2- || [[ $? == 1 ]]; }

if [[ "$MODE" == status ]]; then
  echo "== Origin TLS on ${ALIAS} (${ORIGIN_HOST})"
  send_reported "status" status || cr_die "could not read the origin TLS state of ${ALIAS}; nothing was changed"
  cr_proved "status read from ${ALIAS}; nothing was changed"
  cr_finish
fi

# ── 2. Public DNS ───────────────────────────────────────────────────────────
# dig_short <variable> <name> <type>
# Called directly, for the same reason as read_output.
dig_short() {
  local out
  out="$("$DIG_BIN" +short +time=5 +tries=2 "@${RESOLVER}" "$2" "$3" 2>&1)" \
    || cr_die "could not ask ${RESOLVER} for the ${3} record of ${2}: ${out##*$'\n'}; nothing was changed"
  printf -v "$1" '%s' "$out"
}
echo "== Public DNS for ${ORIGIN_HOST}, as ${RESOLVER} answers"
dig_short ns "$DOMAIN" NS
[[ -n "$ns" ]] || cr_die "${RESOLVER} returns no nameservers for ${DOMAIN}; nothing was changed"
while IFS= read -r server; do
  [[ "$server" == *.awsdns-* ]] \
    || cr_die "${DOMAIN} is still delegated to ${server}, not Route 53: Let's Encrypt would read the challenge from there; nothing was changed"
done <<<"$ns"
dig_short addr "$ORIGIN_HOST" A
[[ "$addr" == "$STATIC_IP" ]] \
  || cr_die "${ORIGIN_HOST} resolves to '${addr//$'\n'/ }', not the host's static address ${STATIC_IP}; nothing was changed"
dig_short caa "$ORIGIN_HOST" CAA
grep -qx -- '0 issue "letsencrypt.org"' <<<"$caa" \
  || cr_die "the CAA record of ${ORIGIN_HOST} does not permit Let's Encrypt ('${caa//$'\n'/; }'); the issue would be refused; nothing was changed"
cr_proved "${DOMAIN} is delegated to Route 53, ${ORIGIN_HOST} resolves to ${STATIC_IP} and its CAA permits Let's Encrypt"

# ── 3. The role's reach ─────────────────────────────────────────────────────
aws_profile_ensure || cr_die "no AWS identity; nothing was changed"
aws_identity_require_direct_user footbag-operator || cr_die "origin TLS is provisioned only as footbag-operator; nothing was changed"

# simulate <expected> <record name> <type>
# Asks IAM what the live role may do with one change to the zone. Only the
# decision IAM gives is read; any failure to ask is the run's error.
ZONE_ARN="arn:aws:route53:::hostedzone/${ZONE_ID}"
simulate() {
  local expected="$1" name="$2" type="$3" decision
  decision="$("$AWS_BIN" iam simulate-principal-policy \
      --policy-source-arn "$ROLE_ARN" \
      --action-names route53:ChangeResourceRecordSets \
      --resource-arns "$ZONE_ARN" \
      --context-entries \
        "ContextKeyName=route53:ChangeResourceRecordSetsNormalizedRecordNames,ContextKeyValues=${name},ContextKeyType=stringList" \
        "ContextKeyName=route53:ChangeResourceRecordSetsRecordTypes,ContextKeyValues=${type},ContextKeyType=stringList" \
      --query 'EvaluationResults[0].EvalDecision' --output text 2>&1)" \
    || cr_die "could not simulate the challenge role for ${type} ${name}: ${decision##*$'\n'}; nothing was changed"
  if [[ "$expected" == allowed ]]; then
    [[ "$decision" == allowed ]] \
      || cr_die "the challenge role may not write ${type} ${name} (IAM: ${decision}); certbot's challenge would fail; nothing was changed"
  else
    [[ "$decision" == implicitDeny || "$decision" == explicitDeny ]] \
      || cr_die "the challenge role may write ${type} ${name} (IAM: ${decision}); its reach is wider than the challenge record; nothing was changed"
  fi
}
echo "== What the challenge role may change in the zone"
simulate allowed "$CHALLENGE" TXT
simulate denied "$DOMAIN" A
simulate denied "www.${DOMAIN}" CNAME
simulate denied "$DOMAIN" MX
simulate denied "_acme-challenge.${DOMAIN}" TXT
simulate denied "$ORIGIN_HOST" A
# One request changing the challenge record and the apex together: a policy
# that matched any one name rather than every name would let it through.
simulate denied "${CHALLENGE},${DOMAIN}" TXT
cr_proved "the challenge role may write the TXT record ${CHALLENGE} and was refused the apex, www, MX, another TXT name, the origin record itself and a request pairing the challenge with the apex"

# ── 4. The confirmation ─────────────────────────────────────────────────────
echo ""
echo "About to issue the origin certificate for ${ORIGIN_HOST} on ${ALIAS}: certbot is"
echo "installed if missing, a rehearsal is issued from Let's Encrypt's staging authority"
echo "and deleted, the real certificate is issued, renewal is scheduled, and nginx is"
echo "restarted once so it serves the certificate on 443. Port 80 keeps serving"
echo "throughout, and CloudFront still reaches the origin over HTTP until the switch"
echo "to https-only, which is a separate step."
echo ""
confirm_from_tty "Type 'APPLY' to issue the origin certificate on production: " "APPLY" \
  || cr_die "not confirmed; nothing was changed"

# ── 5 and 6. Issue, renew, serve, prove ─────────────────────────────────────
echo "== Issuing and serving the origin certificate on ${ALIAS}"
send_reported "issue" issue || cr_die "the origin certificate was not issued and served on ${ALIAS}; the report above names where it stopped"
ISSUED="$(marked ISSUED)"
DISK="$(marked FINGERPRINT-DISK)"
SERVED="$(marked FINGERPRINT-SERVED)"
NOT_AFTER="$(marked NOT-AFTER)"
[[ "$ISSUED" == new || "$ISSUED" == existing ]] || cr_die "the host did not say whether it issued a certificate"
[[ -n "$DISK" && -n "$SERVED" ]] || cr_die "the host did not report both the certificate on disk and the one nginx serves"
[[ "$DISK" == "$SERVED" ]] \
  || cr_die "nginx serves a certificate on 443 (${SERVED}) other than the one on disk (${DISK})"
if [[ "$ISSUED" == new ]]; then
  cr_proved "a certificate for ${ORIGIN_HOST} was issued, valid until ${NOT_AFTER:-an unread date}"
else
  cr_proved "the certificate for ${ORIGIN_HOST} already held, valid until ${NOT_AFTER:-an unread date}; nothing was issued"
fi
cr_proved "nginx serves that certificate on 443 (sha256 ${DISK})"
cr_proved "certbot-renew.timer is enabled, and the reload hook reloaded nginx"
cr_unproved "the hop itself: CloudFront still reaches the origin over HTTP until its origin is switched to https-only"
cr_unproved "the expiry alarm: it goes live once origin_cert_days_to_expiry shows datapoints and enable_origin_cert_alarm is set"
cr_finish
