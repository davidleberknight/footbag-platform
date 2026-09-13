#!/usr/bin/env bash
# load-check.sh
#
# The staging load check, as one command. It is what the go-live gate index
# means by "one representative load run on staging", and it is the measurement
# the origin-latency alarm threshold is calibrated from.
#
# WHY IT EXISTS.
# The CloudFront origin-latency alarm fires on p90 OriginLatency above 3000 ms
# sustained across three five-minute periods, in both environments. That number
# was a default: nothing had ever measured what the origin actually does, so the
# go/no-go walk had a monitoring precondition it could not honestly check. This
# script produces the baseline that precondition needs.
#
# WHAT IT MEASURES, AND WHY BOTH HALVES ARE NEEDED.
# The client-side half is what a member experiences: latency percentiles and the
# error rate over a real request mix. The CloudWatch half is what the alarm
# itself sees, read at the alarm's own metric, statistic and period. Only the
# second half can calibrate a threshold, because a stopwatch on the operator's
# laptop measures their home connection as well as the platform; only the first
# half can say whether the site was usable while it happened. A run reports both.
#
# WHAT IT REFUSES.
#   - production, by name. A load run against the production distribution before
#     go-live measures nothing the staging run does not, and puts synthetic
#     traffic and synthetic sessions into the environment that is about to
#     receive real member data.
#   - a run whose scenario paths do not all answer 200. A baseline averaged over
#     a 404 is not a baseline, and 404s are fast, so the damage is silent.
#
# WHY IT ASKS NOTHING.
# Staging is disposable and this run writes almost nothing: one persona session
# is minted, which is one audit row, and every other request is a read. The
# environment it can reach is fixed by the --target refusal above rather than by
# a prompt, and a prompt typed on every iteration of a twenty-minute measurement
# stops being read. The production refusal is structural, which is the guard
# that matters here.
#
# Usage:
#   scripts/load-check.sh --target staging
#   scripts/load-check.sh --target staging --duration 300 --concurrency 3
#   scripts/load-check.sh --target staging --preflight-only
#   scripts/load-check.sh --target staging --read-back-only \
#       --window-start 2026-09-13T04:00:00Z --window-end 2026-09-13T04:20:00Z
#
# Flags:
#   --target staging          Environment to measure (required, no default).
#   --duration <seconds>      Length of the timed run (default 1200, so the run
#                             covers four consecutive five-minute CloudWatch
#                             periods, which is what the alarm evaluates).
#   --concurrency <n>         Simultaneous request workers (default 5, set to
#                             the association's expected readership rather than
#                             to a stress level).
#   --persona <slug>          Persona to sign in as for the member page
#                             (default t1_paid, an ordinary paid member).
#   --base-url <url>          Override the address; otherwise it is read from
#                             the staging Terraform output, because no
#                             environment URL is committed to this repository.
#   --profile <p>             AWS profile; else ambient AWS_PROFILE.
#   --settle-seconds <n>      Wait before reading CloudWatch back (default 360).
#                             CloudFront publishes a period some minutes after it
#                             closes, so reading immediately reports a window
#                             that is still filling.
#   --preflight-only          Check every scenario path answers 200 and stop.
#   --read-back-only          Skip the run and re-read a window measured
#                             earlier; requires --window-start and --window-end.
#   --window-start <iso>      UTC instant, e.g. 2026-09-13T04:00:00Z.
#   --window-end <iso>        UTC instant.
#
# Test seams (CI only; operators never set these): FOOTBAG_LOADCHECK_AWS_BIN,
# FOOTBAG_LOADCHECK_TERRAFORM_BIN, FOOTBAG_LOADCHECK_CURL_BIN and
# FOOTBAG_LOADCHECK_DRIVER replace the aws CLI, terraform, curl and the request
# driver. A run using any of them says so on stderr, because this script exists
# to produce a measurement and a stubbed measurement is worth nothing.
#
# Exit: 0 measured, 1 the run or the preflight failed, 2 usage error.
set -euo pipefail

TARGET=""
DURATION=1200
CONCURRENCY=5
PERSONA="t1_paid"
BASE_URL=""
PROFILE=""
SETTLE_SECONDS=360
PREFLIGHT_ONLY=0
READ_BACK_ONLY=0
WINDOW_START=""
WINDOW_END=""

# CloudFront metrics are published in us-east-1 whatever the distribution
# serves, so an operator whose ambient region is elsewhere would otherwise read
# an empty series off a perfectly healthy distribution.
REGION="us-east-1"

# Every instant this script prints or passes is UTC. The AWS CLI renders
# timestamps in the caller's local zone, so an operator in a non-UTC zone would
# otherwise read a period list whose times do not line up with the UTC window
# printed above it, and conclude the run measured the wrong hours.
export TZ=UTC

AWS_BIN="${FOOTBAG_LOADCHECK_AWS_BIN:-aws}"
TERRAFORM_BIN="${FOOTBAG_LOADCHECK_TERRAFORM_BIN:-terraform}"
CURL_BIN="${FOOTBAG_LOADCHECK_CURL_BIN:-curl}"
DRIVER="${FOOTBAG_LOADCHECK_DRIVER:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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
    --duration)
      DURATION="${2:-}"
      shift 2 || { echo "ERROR: --duration requires an argument" >&2; exit 2; }
      ;;
    --concurrency)
      CONCURRENCY="${2:-}"
      shift 2 || { echo "ERROR: --concurrency requires an argument" >&2; exit 2; }
      ;;
    --persona)
      PERSONA="${2:-}"
      shift 2 || { echo "ERROR: --persona requires an argument" >&2; exit 2; }
      ;;
    --base-url)
      BASE_URL="${2:-}"
      shift 2 || { echo "ERROR: --base-url requires an argument" >&2; exit 2; }
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --settle-seconds)
      SETTLE_SECONDS="${2:-}"
      shift 2 || { echo "ERROR: --settle-seconds requires an argument" >&2; exit 2; }
      ;;
    --window-start)
      WINDOW_START="${2:-}"
      shift 2 || { echo "ERROR: --window-start requires an argument" >&2; exit 2; }
      ;;
    --window-end)
      WINDOW_END="${2:-}"
      shift 2 || { echo "ERROR: --window-end requires an argument" >&2; exit 2; }
      ;;
    --preflight-only) PREFLIGHT_ONLY=1; shift ;;
    --read-back-only) READ_BACK_ONLY=1; shift ;;
    --help|-h) usage ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage ;;
  esac
done

# No default target, and only one accepted value. Which environment takes the
# traffic is exactly the decision this script must not make on an operator's
# behalf, and production is refused with its own reason rather than as an
# unrecognised value.
case "$TARGET" in
  staging) ;;
  production)
    echo "ERROR: this load check is refused on production." >&2
    echo "       It would put synthetic traffic and a synthetic session into the" >&2
    echo "       environment that is about to hold real member data, and it would" >&2
    echo "       measure nothing the staging run does not. Calibrate from staging." >&2
    exit 2
    ;;
  "")
    echo "ERROR: --target is required and has no default (only 'staging' is accepted)." >&2
    exit 2
    ;;
  *) echo "ERROR: --target must be 'staging' (got '$TARGET')" >&2; exit 2 ;;
esac

for pair in "DURATION:$DURATION" "CONCURRENCY:$CONCURRENCY" "SETTLE_SECONDS:$SETTLE_SECONDS"; do
  name="${pair%%:*}"
  value="${pair#*:}"
  flag="--$(echo "$name" | tr '[:upper:]_' '[:lower:]-')"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "ERROR: ${flag} must be a whole number (got '${value}')" >&2
    exit 2
  fi
done

if (( DURATION < 1 )) || (( CONCURRENCY < 1 )); then
  echo "ERROR: --duration and --concurrency must both be at least 1" >&2
  exit 2
fi

if (( READ_BACK_ONLY == 1 )) && { [[ -z "$WINDOW_START" ]] || [[ -z "$WINDOW_END" ]]; }; then
  echo "ERROR: --read-back-only requires --window-start and --window-end" >&2
  exit 2
fi

[[ -n "$PROFILE" ]] && export AWS_PROFILE="$PROFILE"

if [[ -n "${FOOTBAG_LOADCHECK_AWS_BIN:-}${FOOTBAG_LOADCHECK_TERRAFORM_BIN:-}${FOOTBAG_LOADCHECK_CURL_BIN:-}${FOOTBAG_LOADCHECK_DRIVER:-}" ]]; then
  echo "SYNTHETIC: a test seam is in use -- this run proves nothing about the estate." >&2
fi

# One handler, installed once. A second `trap` call replaces the first, so a
# later step adding its own would silently drop this one.
COOKIE_JAR=""
cleanup() {
  local rc=$?
  if [[ -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]]; then
    shred -u "$COOKIE_JAR" 2>/dev/null || rm -f "$COOKIE_JAR"
  fi
  exit "$rc"
}
trap cleanup EXIT INT TERM

# The staging address is deliberately unpublished, and that is part of what
# shields an environment holding real member data, so it is read from the
# Terraform output at run time rather than committed here.
if [[ -z "$BASE_URL" ]]; then
  domain="$("$TERRAFORM_BIN" -chdir="${REPO_ROOT}/terraform/staging" \
    output -raw cloudfront_domain 2>/dev/null || true)"
  if [[ -z "$domain" ]]; then
    echo "ERROR: could not read cloudfront_domain from terraform/staging." >&2
    echo "       The private operations checkout supplies the values file this" >&2
    echo "       reads through; without it, pass --base-url explicitly." >&2
    exit 1
  fi
  BASE_URL="https://${domain}"
fi
BASE_URL="${BASE_URL%/}"

DISTRIBUTION_ID="$("$TERRAFORM_BIN" -chdir="${REPO_ROOT}/terraform/staging" \
  output -raw cloudfront_distribution_id 2>/dev/null || true)"

REPORT_DIR="$(mktemp -d -t footbag-loadcheck-XXXXXX)"

# Reads back exactly what the alarm reads: OriginLatency at the alarm's p90,
# alongside p95 and p99 so a threshold can be argued about, at the alarm's own
# five-minute period, over the window the run occupied.
read_back() {
  local start="$1" end="$2"

  if [[ -z "$DISTRIBUTION_ID" ]]; then
    echo "WARNING: no distribution id available, so the alarm's own metric was not read." >&2
    return 0
  fi

  echo "What the alarm's metric saw, ${start} to ${end} (five-minute periods):"
  "$AWS_BIN" cloudwatch get-metric-statistics \
    --namespace AWS/CloudFront --metric-name OriginLatency \
    --dimensions "Name=DistributionId,Value=${DISTRIBUTION_ID}" Name=Region,Value=Global \
    --start-time "$start" --end-time "$end" \
    --period 300 --extended-statistics p90 p95 p99 \
    --region "$REGION" --output json > "${REPORT_DIR}/origin-latency.json"

  jq -r '
    (.Datapoints | sort_by(.Timestamp))[]
    | "  \(.Timestamp)  p90 \(.ExtendedStatistics.p90 | floor) ms   p95 \(.ExtendedStatistics.p95 | floor) ms   p99 \(.ExtendedStatistics.p99 | floor) ms"
  ' "${REPORT_DIR}/origin-latency.json"

  local worst
  worst="$(jq -r '[.Datapoints[].ExtendedStatistics.p90] | if length == 0 then "none" else (max | floor | tostring) end' \
    "${REPORT_DIR}/origin-latency.json")"

  "$AWS_BIN" cloudwatch get-metric-statistics \
    --namespace AWS/CloudFront --metric-name Requests \
    --dimensions "Name=DistributionId,Value=${DISTRIBUTION_ID}" Name=Region,Value=Global \
    --start-time "$start" --end-time "$end" \
    --period 300 --statistics Sum \
    --region "$REGION" --output json > "${REPORT_DIR}/requests.json"

  "$AWS_BIN" cloudwatch get-metric-statistics \
    --namespace AWS/CloudFront --metric-name 5xxErrorRate \
    --dimensions "Name=DistributionId,Value=${DISTRIBUTION_ID}" Name=Region,Value=Global \
    --start-time "$start" --end-time "$end" \
    --period 300 --statistics Average \
    --region "$REGION" --output json > "${REPORT_DIR}/5xx-rate.json"

  echo
  echo "  requests in window   $(jq -r '[.Datapoints[].Sum] | add // 0 | floor' "${REPORT_DIR}/requests.json")"
  echo "  worst 5xx rate       $(jq -r '[.Datapoints[].Average] | if length == 0 then 0 else max end' "${REPORT_DIR}/5xx-rate.json")%"
  echo
  echo "  highest five-minute p90 origin latency: ${worst} ms"
  echo "  the deployed alarm fires at 3000 ms, three consecutive periods."
  echo
}

if (( READ_BACK_ONLY == 1 )); then
  read_back "$WINDOW_START" "$WINDOW_END"
  echo "Reports: ${REPORT_DIR}"
  exit 0
fi

# One session, minted once and reused. Each persona switch writes an audit row,
# so minting per request would put thousands of rows into staging's audit log to
# measure something that does not need them.
COOKIE_JAR="$(umask 077 && mktemp -t footbag-loadcheck-cookies-XXXXXX)"
MEMBER_PATH="/members/${PERSONA}"

if ! "$CURL_BIN" -sS -o /dev/null -c "$COOKIE_JAR" "${BASE_URL}/dev/switch?as=${PERSONA}"; then
  echo "ERROR: could not mint a session for persona '${PERSONA}' at ${BASE_URL}." >&2
  echo "       The persona harness is mounted in staging only, and the personas" >&2
  echo "       must have been seeded: ./deploy_to_aws.sh --seed-test-personas" >&2
  exit 1
fi

run_driver() {
  if [[ -n "$DRIVER" ]]; then
    $DRIVER "$@"
  else
    npx tsx "${SCRIPT_DIR}/loadCheck.ts" "$@"
  fi
}

echo "Load check against ${TARGET}: ${BASE_URL}"
echo "Preflight, one request per scenario path:"
if ! run_driver --base-url "$BASE_URL" --cookie-file "$COOKIE_JAR" \
  --member-path "$MEMBER_PATH" --preflight; then
  exit 1
fi
echo

if (( PREFLIGHT_ONLY == 1 )); then
  echo "Preflight only: every scenario path answers 200. Nothing was measured."
  exit 0
fi

WINDOW_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Running ${DURATION}s at concurrency ${CONCURRENCY}, from ${WINDOW_START}."
echo

if ! run_driver --base-url "$BASE_URL" --cookie-file "$COOKIE_JAR" \
  --member-path "$MEMBER_PATH" --duration "$DURATION" \
  --concurrency "$CONCURRENCY" --out "${REPORT_DIR}/client-side.json"; then
  echo "ERROR: the run failed. Nothing measured." >&2
  exit 1
fi

WINDOW_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "Window: ${WINDOW_START} to ${WINDOW_END}"
echo

if (( SETTLE_SECONDS > 0 )); then
  echo "Waiting ${SETTLE_SECONDS}s for CloudFront to publish the closing period."
  sleep "$SETTLE_SECONDS"
  echo
fi

read_back "$WINDOW_START" "$WINDOW_END"

echo "Reports: ${REPORT_DIR}"
echo "Re-read this same window later with:"
echo "  scripts/load-check.sh --target staging --read-back-only \\"
echo "    --window-start ${WINDOW_START} --window-end ${WINDOW_END}"
