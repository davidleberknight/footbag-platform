#!/usr/bin/env bash
# mute-expected-alarms.sh -- mute, for one heavy step, the notifications of the
# alarms that step is expected to trip, and lift the mute after it.
#
# WHY THIS EXISTS.
#
# A host rebuild, a restore or a fresh instance's bootstrap takes the site down
# and works the host hard, so the distribution's 5xx and latency alarms, the
# host CPU alarm and the container alarms fire as designed, each mailing the
# operator. A run that mails a dozen expected alarms buries the one that
# matters; alert fatigue is the anti-pattern the Well-Architected guidance on
# actionable alerts names. CloudWatch's one-time alarm mute rule is AWS's
# mechanism for a deployment or maintenance window: it mutes the alarms'
# actions only, so their state stays readable (scripts/check-env-health.sh reads
# it after the step), and when the window ends CloudWatch notifies any alarm
# whose state changed during it.
#
# FAIL CLOSED. A mute is itself a change to alerting, so the account's
# alerting-disabled alarm counts every mute rule created, and each run's mute
# raises one email the operator matches to the run. This script mutes only once
# it has read that the applied filter catches mute rules; until then, or if any
# read or the mute itself fails, it warns and mutes nothing, so a run is never
# blocked by its mute and never silently unwatched.
#
# WHAT IT DOES.
#
#   --minutes <n>  Creates (or replaces) the one-time mute rule
#                  footbag-<target>-heavy-step, starting now and lasting n
#                  minutes, over the target's alarms of the expected kinds that
#                  exist. The bound is the clean-up for a run stopped part way:
#                  the rule ends on its own.
#   --clear        Deletes that rule; a rule already gone is not an error.
#
# Usage:
#
#   bash scripts/mute-expected-alarms.sh --target staging --minutes 120
#   bash scripts/mute-expected-alarms.sh --target staging --clear
#
# Flags:
#   --target <staging|production>  required; never defaulted.
#   --minutes <1-600>              mute for this long, starting now.
#   --clear                        lift the mute.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# MUTE_ALARMS_AWS_BIN replaces the AWS CLI; MUTE_ALARMS_NOW replaces the
# current UTC time (yyyy-mm-ddThh:mm).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# require_target.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

REGION="us-east-1"
TARGET=""
MINUTES=""
CLEAR=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --minutes) MINUTES="${2:-}"; shift 2 || { cr_error "--minutes requires an argument"; exit 2; } ;;
    --clear) CLEAR=1; shift ;;
    -h|--help) usage 0 ;;
    *) cr_error "unknown argument '$1' (try --help)"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2
if (( CLEAR )); then
  [[ -z "$MINUTES" ]] || { cr_error "--clear and --minutes are exclusive"; exit 2; }
else
  [[ "$MINUTES" =~ ^[1-9][0-9]*$ ]] && (( MINUTES <= 600 )) \
    || { cr_error "--minutes must be a whole number from 1 to 600 (or pass --clear), not '${MINUTES}'"; exit 2; }
fi

AWS_BIN="${MUTE_ALARMS_AWS_BIN:-aws}"
NOW="${MUTE_ALARMS_NOW:-$(date -u +%Y-%m-%dT%H:%M)}"
for seam in MUTE_ALARMS_AWS_BIN MUTE_ALARMS_NOW; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done

RULE="footbag-${TARGET}-heavy-step"
ERR_FILE="$(mktemp)"
cr_cleanup rm -f -- "$ERR_FILE"
aws_said() { tail -n 1 "$ERR_FILE"; }

aws_profile_ensure || { cr_warn "no AWS identity is available, so nothing was muted or lifted"; cr_finish; }

# ── Clear ────────────────────────────────────────────────────────────────────
if (( CLEAR )); then
  if "$AWS_BIN" cloudwatch delete-alarm-mute-rule --region "$REGION" \
       --alarm-mute-rule-name "$RULE" </dev/null >/dev/null 2>"$ERR_FILE"; then
    echo "== Lifted the mute ${RULE}"
    cr_proved "mute ${RULE} lifted"
  elif grep -q 'ResourceNotFound' "$ERR_FILE"; then
    echo "== No mute ${RULE} was in place"
    cr_proved "no mute ${RULE} in place"
  else
    cr_error "could not lift the mute ${RULE}, so its alarms stay muted until it expires: $(aws_said)"
  fi
  cr_finish
fi

# ── Mute ─────────────────────────────────────────────────────────────────────
# The precondition: the applied alerting-disabled filter on the account's trail
# counts mute rules. The trail and its filters live in the production tree.
pattern="$("$AWS_BIN" logs describe-metric-filters --region "$REGION" \
    --log-group-name /footbag/production/cloudtrail \
    --filter-name-prefix footbag-production-alerting-disabled \
    --query 'metricFilters[].filterPattern' --output text </dev/null 2>"$ERR_FILE")" || {
  cr_warn "nothing was muted: the alerting-disabled filter could not be read ($(aws_said)), so a mute could go unseen"
  cr_finish
}
if [[ "$pattern" != *PutAlarmMuteRule* ]]; then
  cr_warn "nothing was muted: the applied alerting-disabled filter does not yet count mute rules; apply the production tree (scripts/terraform-apply.sh --target production) to enable muting"
  cr_finish
fi

# The alarms a heavy step is expected to trip, of those that exist. Memory,
# disk and backup alarms are never muted: a heavy step is not expected to trip
# them, so one that fires is a real problem.
names="$("$AWS_BIN" cloudwatch describe-alarms --region "$REGION" \
    --alarm-name-prefix "footbag-${TARGET}-" \
    --query 'MetricAlarms[].AlarmName' --output text </dev/null 2>"$ERR_FILE")" || {
  cr_warn "nothing was muted: the ${TARGET} alarms could not be listed: $(aws_said)"
  cr_finish
}
p="footbag-${TARGET}-"
targets=()
for name in $names; do
  case "$name" in
    "${p}cloudfront-5xx"|"${p}site-unavailable"|"${p}origin-latency"|"${p}origin-spike"|"${p}high-cpu"|\
    "${p}container-monitor-heartbeat"|"${p}container-unhealthy-"*|"${p}container-crash-"*)
      targets+=("$name") ;;
  esac
done
if (( ${#targets[@]} == 0 )); then
  cr_warn "nothing was muted: no ${TARGET} alarm of the expected kinds exists"
  cr_finish
fi
list="$(IFS=,; printf '%s' "${targets[*]}")"

if "$AWS_BIN" cloudwatch put-alarm-mute-rule --region "$REGION" --name "$RULE" \
     --description "Muted by the readiness sitting for one heavy step on ${TARGET}" \
     --rule "Schedule={Expression=at(${NOW}),Duration=PT${MINUTES}M}" \
     --mute-targets "AlarmNames=${list}" </dev/null >/dev/null 2>"$ERR_FILE"; then
  echo "== Muted ${#targets[@]} expected ${TARGET} alarm(s) for ${MINUTES} minutes from ${NOW}Z: ${targets[*]}"
  cr_proved "mute ${RULE} over ${#targets[@]} expected alarm(s), ${MINUTES} minutes from ${NOW}Z"
else
  cr_warn "nothing was muted: the mute rule was refused: $(aws_said)"
fi
cr_finish
