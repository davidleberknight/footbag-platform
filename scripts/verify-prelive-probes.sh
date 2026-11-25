#!/usr/bin/env bash
# verify-prelive-probes.sh -- the pre-live probes: four controls proved on the
# running environment, each against the decision that asks for it.
#
# WHY THIS EXISTS.
#
# Four go-live gates are proved in the pre-go-live operator session, and each
# needs more than a page load: what the app makes of a spoofed forwarded
# address, whether the built image left the dev-only code out, whether a real
# error line reaches the alarm that watches for it, and whether URL screening
# answers from the live service rather than the stub. Done by hand, each is a
# command remembered from a runbook; here each is a read of the running system
# with a stated pass, and the run says what it did not prove.
#
# THE PROBES.
#
#   A. Forwarded address. The web container's TRUST_PROXY reads 2, the hop
#      count of CloudFront then nginx; Express's own trust function, compiled
#      from that value inside the running container, resolves a chain carrying
#      a spoofed entry to the real visitor; and the running nginx sends the
#      forwarded header on every location it proxies and trusts only loopback
#      and the docker bridge for its own real-ip. Not proven here: that no
#      shorter path reaches the origin than through CloudFront, which the
#      origin-fence check owns.
#   B. Image strip. In the running web container, dist/dev-bootstrap and
#      dist/testkit hold exactly the stub files docker/web/Dockerfile writes,
#      with exactly its contents. The /dev/* answers are smoke-security.sh's.
#   C. Error-line alarm. One deliberate error line, written to the web
#      container's own output, reaches the app log group and moves the
#      footbag-<target>-app-errors alarm to ALARM. It refuses to start while
#      that alarm is already in ALARM, since a state this run did not cause
#      proves nothing. Expected side effects, stated: the alarm topic mails its
#      subscribers on ALARM and again on OK, and the admin dashboard records an
#      open alarm that clears itself.
#   D. URL screening. The running web container's own screening adapter
#      answers unsafe, with a threat type, for Google's canonical malware-test
#      address and for a second test address the stub's deny list does not
#      hold (so only the live service can refuse it), and safe for an ordinary
#      address. A lookup that throws fails. Nothing is saved.
#
# WHAT IT REFUSES.
#
#   - A target other than staging or production; there is no default.
#   - A host that records another environment, before anything is read.
#   - Any AWS identity it cannot settle, for the alarm and log reads.
#
# Usage. The host sudo password is read from stdin, line 1:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/verify-prelive-probes.sh --target production
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/verify-prelive-probes.sh --target staging --profile footbag-operator
#
# Flags:
#   --target staging|production   Required, no default.
#   --profile <p>                 AWS profile for the alarm and log reads; else
#                                 the identity this run settles and proves.
#
# Exit: 0 every probe passed; 1 any failed, or a refusal; 2 usage error.
#
# Test seams (CI only), each announced on stderr: VERIFY_PRELIVE_AWS_BIN
# replaces the aws CLI, VERIFY_PRELIVE_POLL_SECONDS the wait between polls.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""
AWS_PROFILE_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "verify-prelive-probes: --target requires an argument" >&2; exit 2; } ;;
    --profile) AWS_PROFILE_ARG="${2:-}"; shift 2 || { echo "verify-prelive-probes: --profile requires an argument" >&2; exit 2; } ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify-prelive-probes: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done
require_target "$TARGET" staging production || exit 2

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${VERIFY_PRELIVE_AWS_BIN:-aws}"
POLL_SECONDS="${VERIFY_PRELIVE_POLL_SECONDS:-30}"
for seam in VERIFY_PRELIVE_AWS_BIN VERIFY_PRELIVE_POLL_SECONDS; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done

REMOTE_HALF="${SCRIPT_DIR}/internal/verify-prelive-probes-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
DOCKERFILE="${REPO_ROOT}/docker/web/Dockerfile"
for f in "$REMOTE_HALF" "$REMOTE_REPORT_LIB" "$DOCKERFILE"; do
  [[ -r "$f" ]] || cr_die "missing ${f}, which this run needs"
done

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/verify-prelive-probes.sh --target ${TARGET}" "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

if [[ -z "${VERIFY_PRELIVE_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  if [[ -n "$AWS_PROFILE_ARG" ]]; then
    export AWS_PROFILE="$AWS_PROFILE_ARG"
  else
    aws_profile_ensure || cr_die "no AWS identity to read the alarm and the log group with (the reason is printed above)"
  fi
fi

WORK="$(mktemp -d)"
cr_cleanup rm -rf -- "$WORK"

# The second address is a Safe Browsing test page Google lists; the stub's deny
# list holds only the first, so a refusal of the second is the live service's.
CANONICAL_BAD="http://malware.testing.google.test/testing/malware/"
SECOND_BAD="https://testsafebrowsing.appspot.com/s/malware.html"
ORDINARY="https://example.com/"

# send <mode> [<VAR=value>...]: one root session running the half in <mode>.
send() {
  local mode="$1" kv
  shift
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'PROBE_MODE=%q\n' "$mode"
    for kv in "$@"; do printf '%s=%q\n' "${kv%%=*}" "${kv#*=}"; done
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}

# The value of one fact the half printed, or empty.
fact() { sed -n "s/^---FOOTBAG-PRELIVE--- $2 //p" "$1" | tail -n 1; }

echo "== pre-live probes: ${TARGET} =="

READS="${WORK}/reads.out"
cr_run_marked "the probes' reads on ${ALIAS}" -- send reads "PROBE_URLS=${CANONICAL_BAD} ${SECOND_BAD} ${ORDINARY}" > "$READS" || true

# ── A. Forwarded address ─────────────────────────────────────────────────────
a_fail=0
tp="$(fact "$READS" trust_proxy)"
if [[ "$tp" == "2" ]]; then echo "  A  TRUST_PROXY reads 2 in the web container"
else cr_error "A: the web container's TRUST_PROXY reads '${tp:-nothing}', not 2, the hop count of CloudFront then nginx"; a_fail=1; fi
resolved="$(fact "$READS" trust_resolves)"
if [[ "$resolved" == "203.0.113.10" ]]; then echo "  A  a spoofed forwarded chain resolves to the visitor"
else cr_error "A: Express's trust function in the web container resolves the spoofed chain to '${resolved:-nothing}', not the visitor 203.0.113.10"; a_fail=1; fi
nginx="$(fact "$READS" nginx_forwarding)"
IFS=';' read -r -a nginx_lines <<<"${nginx// ; /;}"
proxied=0; forwarded=0; real_ip_from=(); real_ip_header=0
for line in ${nginx_lines[@]+"${nginx_lines[@]}"}; do
  case "$line" in
    "proxy_pass "*) proxied=$((proxied + 1)) ;;
    "proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for") forwarded=$((forwarded + 1)) ;;
    "set_real_ip_from "*) real_ip_from+=("${line#set_real_ip_from }") ;;
    "real_ip_header X-Forwarded-For") real_ip_header=1 ;;
  esac
done
trusted="$(printf '%s\n' ${real_ip_from[@]+"${real_ip_from[@]}"} | sort | paste -sd ' ' -)"
if (( proxied > 0 && forwarded == proxied && real_ip_header )) && [[ "$trusted" == "127.0.0.1 172.16.0.0/12" ]]; then
  echo "  A  nginx forwards the address on all ${proxied} proxied locations and trusts only loopback and the docker bridge"
else
  cr_error "A: the running nginx proxies ${proxied} location(s) but sends the appended forwarded header on ${forwarded}, trusts '${trusted:-nothing}' for its real-ip, and reads the header for it: $(( real_ip_header )) (expected every location, '127.0.0.1 172.16.0.0/12', 1)"
  a_fail=1
fi
(( a_fail )) || cr_proved "A: the forwarded address resolves to the visitor through the app's own trust setting and the running nginx"
cr_unproved "A: that nothing reaches the origin except through CloudFront; the origin-fence check owns that"

# ── B. Image strip ───────────────────────────────────────────────────────────
# What the Dockerfile writes, read from it rather than restated here: each
# stub is a printf of one literal into one file under dist/.
expected_digests=""
while IFS= read -r stub_line; do
  [[ "$stub_line" =~ printf\ \'([^\']*)\'\ \>\ dist/([^[:space:]\;\&]+) ]] || continue
  # The literal is a printf format by design: the Dockerfile renders it the same way.
  # shellcheck disable=SC2059
  digest="$(printf "${BASH_REMATCH[1]}" | sha256sum | cut -d' ' -f1)"
  expected_digests+="${digest}  ${BASH_REMATCH[2]}"$'\n'
done < <(grep -E "printf '[^']*' > dist/" "$DOCKERFILE")
expected_digests="$(printf '%s' "$expected_digests" | sort -k2 | awk 'NR > 1 { printf " ; " } { printf "%s", $0 }')"
have_digests="$(fact "$READS" dev_digests)"
if [[ -z "$expected_digests" ]]; then
  cr_error "B: no stub file could be read out of ${DOCKERFILE}, so there is nothing to compare the image with"
elif [[ "$have_digests" == "$expected_digests" ]]; then
  echo "  B  the dev-only folders hold exactly the Dockerfile's stubs"
  cr_proved "B: dist/dev-bootstrap and dist/testkit in the running image are exactly the Dockerfile's stubs"
else
  cr_error "B: the running image's dev-only folders hold '${have_digests:-nothing}', not the Dockerfile's stubs '${expected_digests}'"
fi
cr_unproved "B: the /dev/* answers; smoke-security.sh checks them after every deploy"

# ── D. URL screening ─────────────────────────────────────────────────────────
screening="$(fact "$READS" url_screening)"
d_fail=0
screen_of() {
  local url="$1" entry
  IFS=';' read -r -a entries <<<"${screening// ; /;}"
  for entry in ${entries[@]+"${entries[@]}"}; do
    [[ "$(jq -r '.url // empty' <<<"$entry" 2>/dev/null)" == "$url" ]] && { printf '%s' "$entry"; return 0; }
  done
  return 1
}
command -v jq >/dev/null 2>&1 || cr_die "jq is not installed, so the screening answers cannot be read"
for url in "$CANONICAL_BAD" "$SECOND_BAD" "$ORDINARY"; do
  answer="$(screen_of "$url")" || { cr_error "D: no screening answer for ${url}"; d_fail=1; continue; }
  if [[ -n "$(jq -r '.error // empty' <<<"$answer")" ]]; then
    cr_error "D: screening ${url} failed: $(jq -r '.error' <<<"$answer")"; d_fail=1; continue
  fi
  safe="$(jq -r '.safe' <<<"$answer")"; threats="$(jq -r '(.threats // []) | join(",")' <<<"$answer")"
  if [[ "$url" == "$ORDINARY" ]]; then
    if [[ "$safe" == "true" ]]; then echo "  D  ${url} reads safe"
    else cr_error "D: the ordinary address ${url} reads unsafe (${threats:-no threat named}), so every link would be refused"; d_fail=1; fi
  elif [[ "$safe" == "false" && -n "$threats" ]]; then
    echo "  D  ${url} refused (${threats})"
  else
    cr_error "D: ${url} reads safe=${safe} with threats '${threats}', not refused; the screening is not the live service's"
    d_fail=1
  fi
done
(( d_fail )) || cr_proved "D: the running app's URL screening refuses both test addresses, the second only the live service lists, and passes an ordinary one"

# ── C. Error-line alarm ──────────────────────────────────────────────────────
ALARM="footbag-${TARGET}-app-errors"
LOG_GROUP="/footbag/${TARGET}/app"
alarm_state() {
  "$AWS_BIN" cloudwatch describe-alarms --alarm-names "$ALARM" \
    --query 'MetricAlarms[0].StateValue' --output text </dev/null
}
run_c() {
  local before probe_id start_ms count state="" i
  if ! before="$(alarm_state 2>&1)"; then cr_error "C: could not read ${ALARM}: ${before##*$'\n'}"; return; fi
  case "$before" in
    OK|INSUFFICIENT_DATA) ;;
    ALARM) cr_error "C: ${ALARM} is already in ALARM, so a firing now would prove nothing; wait for OK and run again"; return ;;
    *) cr_error "C: ${ALARM} was not found (read '${before}'); the ${TARGET} Terraform is not applied"; return ;;
  esac
  probe_id="prelive-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  start_ms="$(( $(date +%s) * 1000 - 60000 ))"
  local line
  line="$(printf '{"level":"error","msg":"prelive.probe.deliberate_error","probe":"%s","time":"%s"}' "$probe_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  local out="${WORK}/error-line.out"
  cr_run_marked "the deliberate error line on ${ALIAS}" -- send error-line "PROBE_LINE=${line}" > "$out" || true
  [[ "$(fact "$out" error_line)" == written ]] || { cr_error "C: the deliberate error line was not written"; return; }
  local arrived=0
  for (( i = 1; i <= 8; i++ )); do
    count="$({ "$AWS_BIN" logs filter-log-events --log-group-name "$LOG_GROUP" --start-time "$start_ms" \
      --filter-pattern "{ \$.probe = \"${probe_id}\" }" --query 'events[].eventId' --output text </dev/null || true; } | wc -w)"
    (( count > 0 )) && { arrived=1; break; }
    (( i < 8 )) && sleep "$POLL_SECONDS"
  done
  (( arrived )) || { cr_error "C: the deliberate error line ${probe_id} never reached ${LOG_GROUP}, so app lines are not being shipped"; return; }
  echo "  C  the deliberate error line reached ${LOG_GROUP}"
  for (( i = 1; i <= 10; i++ )); do
    state="$(alarm_state 2>/dev/null || true)"
    [[ "$state" == ALARM ]] && break
    (( i < 10 )) && sleep "$POLL_SECONDS"
  done
  if [[ "$state" == ALARM ]]; then
    echo "  C  ${ALARM} fired"
    cr_proved "C: a real error line reached ${LOG_GROUP} and moved ${ALARM} to ALARM; it mails on ALARM and again on OK"
  else
    cr_error "C: ${ALARM} did not reach ALARM within $(( 10 * POLL_SECONDS )) seconds of the line arriving (last read '${state:-nothing}'), so its filter or its period does not catch an error line"
  fi
}
run_c

cr_finish
