#!/usr/bin/env bash
# check-env-health.sh -- read whether an environment is fit for a heavy step:
# its host's CPU burst allowance, and its alarms in ALARM.
#
# WHY THIS EXISTS.
#
# A Lightsail instance is burstable. Once its burst allowance is spent it runs
# at its baseline CPU, and a heavy step started there (a bootstrap, a restore,
# a deploy) crawls, times out and fails, spending more credit as it goes. A
# fresh instance starts with almost none. Separately, an alarm that fires during
# a long run is only email, and a critical one sent while the operator watches a
# terminal reads as noise unless a script stops on it. This read answers both
# from the operator's workstation, through CloudWatch and Lightsail, so it works
# while the host or the site is down, which is when it matters.
#
# WHAT IT DOES, in order:
#
#   1. Reads the instance Terraform names for the target, and its latest
#      BurstCapacityPercentage from Lightsail. Below the minimum (50 unless
#      --min-burst says otherwise) is an error naming the reading. --alarms-only
#      skips this read.
#   2. Lists the target's CloudWatch alarms in ALARM (names starting
#      footbag-<target>-, in us-east-1). One whose actions include the critical
#      topic is an error; any other is a warning. --wait-minutes waits up to that
#      long for the critical ones to return to OK first, so the read after a
#      deploy can let the deploy's own expected alarms clear.
#
# It changes nothing. Exit 0 when both pass (warnings listed), 1 otherwise.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default.
#   - A burst reading or an alarm listing it cannot get: an unread health is
#     not a healthy one.
#
# Usage:
#
#   bash scripts/check-env-health.sh --target staging
#   bash scripts/check-env-health.sh --target staging --alarms-only --wait-minutes 10
#   bash scripts/check-env-health.sh --target staging --allow-site-down --fresh-instance
#   bash scripts/check-env-health.sh --target production --min-burst 30
#
# Flags:
#   --target <staging|production>  required; never defaulted.
#   --min-burst <0-100>            the lowest burst capacity accepted (50).
#   --alarms-only                  skip the burst read.
#   --allow-site-down              count the alarms a down site raises (the
#                                  distribution's 5xx and latency, the container
#                                  alarms) as warnings: the read before a rebuild
#                                  or restore, which exists to end them. The
#                                  host's CPU, memory and disk alarms and the
#                                  backup alarms still stop it.
#   --fresh-instance               also count footbag-<target>-db-backup-stale
#                                  and footbag-<target>-db-backup-failing as
#                                  warnings: the read before the bootstrap of a
#                                  fresh instance. Such an instance holds no
#                                  database yet, so its backups cannot run and
#                                  those alarms stay in ALARM until the step
#                                  restores the database they read. Every other
#                                  critical alarm still stops it.
#   --wait-minutes <n>             wait up to n minutes for critical alarms to
#                                  return to OK before judging them (0).
#
# Test seams (CI only; operators never set these), each announced on stderr:
# CHECK_ENV_HEALTH_AWS_BIN and CHECK_ENV_HEALTH_TERRAFORM_BIN replace the two
# tools; CHECK_ENV_HEALTH_POLL_SECS sets the wait between alarm reads (30).
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
# tf_instance_name.
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"

REGION="us-east-1"
TARGET=""
MIN_BURST=50
ALARMS_ONLY=0
ALLOW_SITE_DOWN=0
FRESH_INSTANCE=0
WAIT_MINUTES=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --min-burst) MIN_BURST="${2:-}"; shift 2 || { cr_error "--min-burst requires an argument"; exit 2; } ;;
    --alarms-only) ALARMS_ONLY=1; shift ;;
    --allow-site-down) ALLOW_SITE_DOWN=1; shift ;;
    --fresh-instance) FRESH_INSTANCE=1; shift ;;
    --wait-minutes) WAIT_MINUTES="${2:-}"; shift 2 || { cr_error "--wait-minutes requires an argument"; exit 2; } ;;
    -h|--help) usage 0 ;;
    *) cr_error "unknown argument '$1' (try --help)"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2
[[ "$MIN_BURST" =~ ^[0-9]+$ ]] && (( MIN_BURST <= 100 )) \
  || { cr_error "--min-burst must be a whole number from 0 to 100, not '${MIN_BURST}'"; exit 2; }
[[ "$WAIT_MINUTES" =~ ^[0-9]+$ ]] \
  || { cr_error "--wait-minutes must be a whole number, not '${WAIT_MINUTES}'"; exit 2; }

AWS_BIN="${CHECK_ENV_HEALTH_AWS_BIN:-aws}"
TF_OUTPUT_BIN="${CHECK_ENV_HEALTH_TERRAFORM_BIN:-terraform}"
POLL_SECS="${CHECK_ENV_HEALTH_POLL_SECS:-30}"
for seam in CHECK_ENV_HEALTH_AWS_BIN CHECK_ENV_HEALTH_TERRAFORM_BIN CHECK_ENV_HEALTH_POLL_SECS; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done
[[ "$POLL_SECS" =~ ^[0-9]+$ ]] || cr_die "the poll interval must be a whole number of seconds, not '${POLL_SECS}'"

aws_profile_ensure || cr_die "no AWS identity is available for the reads"

ERR_FILE="$(mktemp)"
cr_cleanup rm -f -- "$ERR_FILE"
aws_said() { tail -n 1 "$ERR_FILE"; }

# ── 1. Burst capacity ────────────────────────────────────────────────────────
if (( ! ALARMS_ONLY )); then
  tf_instance_name "$TARGET" || cr_die "could not read the ${TARGET} instance name from Terraform"
  INSTANCE="$TF_INSTANCE_NAME"
  end="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  start="$(date -u -d '-30 minutes' +%Y-%m-%dT%H:%M:%SZ)"
  # Text output, one line per datapoint: timestamp then average. The latest
  # timestamp is the reading; ISO times sort as text.
  points="$("$AWS_BIN" lightsail get-instance-metric-data --region "$REGION" \
      --instance-name "$INSTANCE" --metric-name BurstCapacityPercentage \
      --period 300 --unit Percent --statistics Average \
      --start-time "$start" --end-time "$end" \
      --query 'metricData[].[timestamp,average]' --output text </dev/null 2>"$ERR_FILE")" \
    || cr_die "could not read the burst capacity of ${INSTANCE}: $(aws_said)"
  latest="$(sort <<<"$points" | awk 'NF == 2 { last = $2 } END { print last }')"
  [[ "$latest" =~ ^[0-9]+(\.[0-9]+)?$ ]] \
    || cr_die "${INSTANCE} reported no burst capacity in the last 30 minutes, so its headroom is unknown"
  latest="$(awk -v v="$latest" 'BEGIN { s = sprintf("%.1f", v); sub(/\.0$/, "", s); print s }')"
  if awk -v v="$latest" -v m="$MIN_BURST" 'BEGIN { exit !(v + 0 < m + 0) }'; then
    cr_error "${INSTANCE} has ${latest}% of its CPU burst capacity, below the ${MIN_BURST}% a heavy step needs: it would run at baseline CPU. Let the host idle (take the stack down or cold-restart it if it is busy) and read again."
  else
    echo "==> ${INSTANCE} burst capacity: ${latest}% (at least ${MIN_BURST}% needed)"
    cr_proved "${INSTANCE} burst capacity ${latest}%, at least ${MIN_BURST}%"
  fi
fi

# ── 2. Alarms in ALARM ───────────────────────────────────────────────────────
CRITICAL_TOPIC=":footbag-${TARGET}-alarms-critical"
CRITICAL=(); OTHERS=()
# The alarms a site that is down raises: what a rebuild or restore exists to
# end. The host's own CPU, memory and disk and the backups are never among them.
site_down_alarm() {
  local p="footbag-${TARGET}-"
  case "$1" in
    "${p}cloudfront-5xx"|"${p}site-unavailable"|"${p}origin-latency"|"${p}origin-spike"|\
    "${p}container-monitor-heartbeat"|"${p}container-unhealthy-"*|"${p}container-crash-"*) return 0 ;;
  esac
  return 1
}
# The alarms a fresh instance raises because it holds no database to back up:
# what its bootstrap ends by restoring one. Matched by exact name, so any other
# backup alarm (a failing promotion) still counts as it is.
fresh_instance_alarm() {
  local p="footbag-${TARGET}-"
  case "$1" in
    "${p}db-backup-stale"|"${p}db-backup-failing") return 0 ;;
  esac
  return 1
}
read_alarms() {
  local listing name actions
  CRITICAL=(); OTHERS=()
  listing="$("$AWS_BIN" cloudwatch describe-alarms --region "$REGION" --state-value ALARM \
      --alarm-name-prefix "footbag-${TARGET}-" \
      --query 'MetricAlarms[].[AlarmName,join(`,`,AlarmActions)]' --output text </dev/null 2>"$ERR_FILE")" \
    || return 1
  while IFS=$'\t' read -r name actions; do
    [[ -n "$name" ]] || continue
    if (( ALLOW_SITE_DOWN )) && site_down_alarm "$name"; then OTHERS+=("$name"); continue; fi
    if (( FRESH_INSTANCE )) && fresh_instance_alarm "$name"; then OTHERS+=("$name"); continue; fi
    if [[ ",${actions}," == *"${CRITICAL_TOPIC},"* ]]; then CRITICAL+=("$name"); else OTHERS+=("$name"); fi
  done <<<"$listing"
}

read_alarms || cr_die "could not list the ${TARGET} alarms in ALARM: $(aws_said)"
deadline=$(( $(date -u +%s) + WAIT_MINUTES * 60 ))
while (( ${#CRITICAL[@]} > 0 )) && (( $(date -u +%s) < deadline )); do
  echo "  waiting for ${CRITICAL[*]} to return to OK (until $(date -u -d "@${deadline}" +%H:%M:%SZ))"
  sleep "$POLL_SECS"
  read_alarms || cr_die "could not list the ${TARGET} alarms in ALARM: $(aws_said)"
done
for name in "${OTHERS[@]+"${OTHERS[@]}"}"; do
  cr_warn "warning alarm ${name} is in ALARM"
done
for name in "${CRITICAL[@]+"${CRITICAL[@]}"}"; do
  cr_error "critical alarm ${name} is in ALARM: find what it watches before going on"
done
(( ${#CRITICAL[@]} == 0 )) && cr_proved "no critical ${TARGET} alarm is in ALARM"
cr_finish
