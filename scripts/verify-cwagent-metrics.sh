#!/usr/bin/env bash
# verify-cwagent-metrics.sh
#
# The check that gates arming the host CPU / memory / disk alarms. Read-only:
# it makes three CloudWatch reads and mutates nothing.
#
# A CloudWatch alarm binds to one exact namespace, metric name and dimension
# set. "The agent is running" does not prove that binding, because the agent can
# publish the same metric names under different dimensions and the alarm still
# watches nothing. These alarms treat missing data as missing, so a wrongly bound
# one sits in INSUFFICIENT_DATA and raises a warning nobody can act on; before
# the missing-data treatment was corrected it sat in OK and reported health it
# had never measured. This script is the proof that was missing.
#
# What it asserts, one row per alarm, each against the live account:
#   cpu_usage_active    cpu=cpu-total          aws_cloudwatch_metric_alarm.high_cpu
#   mem_used_percent    no dimensions at all   aws_cloudwatch_metric_alarm.high_memory
#   disk_used_percent   path=/ fstype=xfs      aws_cloudwatch_metric_alarm.high_disk
#
# Those three combinations mirror the alarm resources named beside them in the
# environment's cloudwatch.tf, and the two move together: a root filesystem that
# is not xfs changes both the alarm dimension and the row here.
#
# It requires a RECENT datapoint rather than the metric merely existing. Listing
# metric names keeps showing a metric for two weeks after its host went quiet, so
# a listing cannot tell a live agent from one that died last Tuesday. Asking for
# datapoints inside a short window proves the binding and the liveness together.
#
# Deliberately not checked: the alarms' own state. State alone proves nothing
# here, and an alarm's state reason is a snapshot from its last transition, which
# on this account is months old on two of them and a hand-set rehearsal string on
# the third.
#
# Usage:
#   scripts/verify-cwagent-metrics.sh --target staging
#   scripts/verify-cwagent-metrics.sh --target production --profile <p>
#
# Flags:
#   --target staging|production  Environment to check (required, no default).
#   --profile <p>                AWS profile; else ambient AWS_PROFILE.
#   --window-minutes <n>         How far back to look for a datapoint
#                                (default 15). Widen it only when the agent was
#                                just installed and the first publish is still
#                                in flight.
#
# Test seam (CI only; operators never set this): CWAGENT_VERIFY_AWS_BIN replaces
# the aws CLI. A run using it says so on stderr, because this script exists to be
# a proof and a stubbed proof is worth nothing.
#
# Exit: 0 all three bound and live, 1 one or more missing, 2 usage error.
set -euo pipefail

TARGET=""
PROFILE=""
WINDOW_MINUTES=15

# Both environments' stacks are us-east-1, and metrics are region-scoped, so an
# operator whose ambient default region is elsewhere would otherwise get three
# clean failures against a perfectly healthy host.
REGION="us-east-1"

AWS_BIN="${CWAGENT_VERIFY_AWS_BIN:-aws}"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --window-minutes)
      WINDOW_MINUTES="${2:-}"
      shift 2 || { echo "ERROR: --window-minutes requires an argument" >&2; exit 2; }
      ;;
    --help|-h) usage ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage ;;
  esac
done

# No default target. Which environment a proof speaks for is exactly the thing
# an operator must not get wrong by omission.
case "$TARGET" in
  staging|production) ;;
  '') echo "ERROR: --target is required ('staging' or 'production')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2; exit 2 ;;
esac

if [[ ! "$WINDOW_MINUTES" =~ ^[0-9]+$ ]] || (( WINDOW_MINUTES < 1 )); then
  echo "ERROR: --window-minutes must be a positive whole number (got '$WINDOW_MINUTES')" >&2
  exit 2
fi

[[ -n "$PROFILE" ]] && export AWS_PROFILE="$PROFILE"

# The agent publishes no instance dimension, so the namespace is the only thing
# separating one host's numbers from another's. Production has its own; staging
# still publishes to the bare default it has used since install, because it is
# the only host there and moving it means re-installing the agent on a working
# environment. These strings match the environment's cloudwatch.tf and, for
# production, the publisher user's PutMetricData condition in its iam.tf.
if [[ "$TARGET" == "production" ]]; then
  NAMESPACE="CWAgent/production"
else
  NAMESPACE="CWAgent"
fi

START="$(date -u -d "${WINDOW_MINUTES} minutes ago" +%Y-%m-%dT%H:%M:%SZ)"
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PASSED=0
FAILED=0
FAILED_NAMES=""

# One row. Dimension arguments are passed through verbatim, and mem_used_percent
# passes none at all, which is what the agent emits and therefore what the alarm
# must bind to.
check_metric() {
  local metric="$1" described="$2"
  shift 2
  local count
  count="$("$AWS_BIN" cloudwatch get-metric-statistics \
    --namespace "$NAMESPACE" --metric-name "$metric" "$@" \
    --start-time "$START" --end-time "$END" \
    --period 60 --statistics SampleCount \
    --query 'length(Datapoints)' --output text \
    --region "$REGION" 2>/dev/null || echo "")"

  if [[ "$count" =~ ^[0-9]+$ ]] && (( count > 0 )); then
    printf '  PASS  %-20s %-24s %s datapoints\n' "$metric" "$described" "$count"
    PASSED=$(( PASSED + 1 ))
  else
    printf '  FAIL  %-20s %-24s no datapoints\n' "$metric" "$described"
    FAILED=$(( FAILED + 1 ))
    FAILED_NAMES="${FAILED_NAMES} ${metric}"
  fi
}

if [[ -n "${CWAGENT_VERIFY_AWS_BIN:-}" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the estate." >&2
fi

echo "Checking ${TARGET} host metrics in namespace ${NAMESPACE}, last ${WINDOW_MINUTES} minutes:"
check_metric cpu_usage_active  "cpu=cpu-total"    --dimensions Name=cpu,Value=cpu-total
check_metric mem_used_percent  "no dimensions"
check_metric disk_used_percent "path=/ fstype=xfs" --dimensions Name=path,Value=/ Name=fstype,Value=xfs
echo

if (( FAILED == 0 )); then
  # Whether to tell the operator to arm depends on whether they already have.
  # Printing arming instructions at an environment whose alarms have been live
  # for months teaches the reader to skim the last paragraph, and the last
  # paragraph is where a real instruction would go.
  armed="$("$AWS_BIN" cloudwatch describe-alarms \
    --alarm-name-prefix "footbag-${TARGET}-high" \
    --query 'length(MetricAlarms)' --output text \
    --region "$REGION" 2>/dev/null || echo "")"

  if [[ "$armed" == "3" ]]; then
    echo "All three combinations are publishing, and the three alarms exist and"
    echo "are bound to them. Nothing to do."
  else
    echo "All three combinations are publishing. The alarms will bind to real data."
    echo "Arm them with:"
    echo "  scripts/arm-cwagent-alarms.sh --target ${TARGET}"
    echo "which runs this same check first, so there is nothing to remember."
  fi
  exit 0
fi

# Which failures appear says which fault it is, and the two have completely
# different fixes, so the script names the distinction rather than leaving the
# operator to infer it from three identical FAIL rows.
if (( PASSED == 0 )); then
  echo "Nothing is arriving in ${NAMESPACE}. The agent is not publishing at all:" >&2
  echo "it is not installed, not running, its credentials are refused, or it is" >&2
  echo "publishing to a different namespace. Check the agent's own log on the" >&2
  echo "host, and confirm the publisher user's PutMetricData grant names" >&2
  echo "${NAMESPACE}; a grant and a config that disagree fail exactly this way." >&2
else
  echo "Some combinations are missing:${FAILED_NAMES}" >&2
  echo "The agent is publishing, so this is a dimension mismatch rather than a" >&2
  echo "dead agent. List what the host actually emits and compare it with the" >&2
  echo "alarm dimensions in terraform/${TARGET}/cloudwatch.tf:" >&2
  echo "  aws cloudwatch list-metrics --namespace ${NAMESPACE} --region ${REGION}" >&2
  echo "A root filesystem that is not xfs is the common cause; the alarm" >&2
  echo "dimension and the expectation in this script both move to match it." >&2
fi

echo >&2
echo "Do not arm the alarms until this passes." >&2
exit 1
