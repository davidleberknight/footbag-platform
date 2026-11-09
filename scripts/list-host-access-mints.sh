#!/usr/bin/env bash
# list-host-access-mints.sh
#
# Lists every call to Lightsail's GetInstanceAccessDetails since a given time,
# allowed or denied, and attributes each one. Read-only.
#
# WHY THIS EXISTS.
#
# That call mints a short-lived certificate and private key for a host's default
# account, which has passwordless sudo, and the production break-glass alarm
# fires on every one of them, against either host, because the trail is
# account-wide. An alarm is only useful if each firing can be matched to the run
# that caused it. Every script that mints does so through
# scripts/lib/host-access-mint.sh, which puts an application id naming the
# script in the call's user agent; the trail records the user agent, and this
# listing reads it back.
#
# Each call is printed and classed as one of:
#   claimed       the user agent carries an application id from the known
#                 table in scripts/lib/host-access-mint.sh, and the call
#                 succeeded
#   denied        the call carries an error code (AccessDenied and the like):
#                 an attempt that minted nothing, listed as a warning naming
#                 who tried
#   unattributed  a successful call carrying no known application id: an
#                 error, and the run exits non-zero. Match it by its time and
#                 source address, and investigate it if nothing does.
#
# "Claimed" is not "proved". An application id is text the caller chose, so it
# says which script the call claims to come from, not that it did; the person
# who ran that script confirms the run.
#
# Two facts about the event record are taken from its documented structure and
# a captured production event: the instance is recorded under
# requestParameters.instanceName and the response is not logged. How the
# application id appears is taken from the AWS CLI's documentation of
# AWS_SDK_UA_APP_ID, which adds an app/<id> token to the user agent, and is
# confirmed by the first staging drill (scripts/host-break-glass.sh --drill
# --target staging). An event with no user agent or no instance name still
# lists, by time and source address, and is classed unattributed.
#
# WHAT IT REFUSES TO DO.
#
#   - Run without a window: one of --since or --days is required, never both.
#   - Accept a --since that is not a UTC time in the form below.
#   - Reach back further than the 90 days CloudTrail's event history holds,
#     which would list a shorter window than the one asked for and say nothing.
#   - Change anything.
#
# Usage:
#   bash scripts/list-host-access-mints.sh --since 2026-11-09T00:00:00Z
#   bash scripts/list-host-access-mints.sh --days 7
#
# Flags:
#   --since <UTC time>  List calls from this time on: YYYY-MM-DDTHH:MM:SSZ
#                       (seconds optional).
#   --days <n>          List calls from n days ago on, 1 to 90.
#
# Output: one line per call on stdout, tab-separated: time, class, principal,
# source address, instance, error code, application id. The closing report on
# stderr lists every denied and unattributed call.
#
# Test seam (CI only; operators never set it), announced on stderr when set:
# LIST_HOST_ACCESS_MINTS_AWS_BIN replaces the aws CLI.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

HISTORY_DAYS=90
SINCE=""
DAYS=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) SINCE="${2:-}"; shift 2 || { echo "ERROR: --since needs a value" >&2; exit 2; } ;;
    --days)  DAYS="${2:-}"; shift 2 || { echo "ERROR: --days needs a value" >&2; exit 2; } ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 ;;
  esac
done

if [[ -n "$SINCE" && -n "$DAYS" ]]; then
  echo "ERROR: give --since or --days, not both." >&2
  exit 2
fi
if [[ -z "$SINCE" && -z "$DAYS" ]]; then
  echo "ERROR: give the window to list: --since <UTC time> or --days <n>." >&2
  exit 2
fi

now_epoch="$(date -u +%s)"
oldest_epoch=$(( now_epoch - HISTORY_DAYS * 86400 ))
if [[ -n "$DAYS" ]]; then
  if [[ ! "$DAYS" =~ ^[1-9][0-9]*$ ]] || (( DAYS > HISTORY_DAYS )); then
    echo "ERROR: --days must be a whole number from 1 to ${HISTORY_DAYS} (got '${DAYS}'):" >&2
    echo "       CloudTrail's event history holds ${HISTORY_DAYS} days." >&2
    exit 2
  fi
  SINCE="$(date -u -d "@$(( now_epoch - DAYS * 86400 ))" +%Y-%m-%dT%H:%M:%SZ)"
else
  # The form is checked before date(1) reads it, because date accepts almost
  # anything ("yesterday", a bare number) and would turn a typo into a window
  # nobody asked for.
  if [[ ! "$SINCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z$ ]] \
     || ! since_epoch="$(date -u -d "$SINCE" +%s 2>/dev/null)"; then
    echo "ERROR: --since must be a UTC time such as 2026-11-09T00:00:00Z (got '${SINCE}')." >&2
    exit 2
  fi
  if (( since_epoch < oldest_epoch )); then
    echo "ERROR: --since ${SINCE} is more than ${HISTORY_DAYS} days ago, and CloudTrail's event" >&2
    echo "       history holds only ${HISTORY_DAYS} days; the listing would silently start later." >&2
    exit 2
  fi
fi

AWS_BIN="${LIST_HOST_ACCESS_MINTS_AWS_BIN:-aws}"
[[ -n "${LIST_HOST_ACCESS_MINTS_AWS_BIN:-}" ]] \
  && echo "SYNTHETIC: LIST_HOST_ACCESS_MINTS_AWS_BIN is set; this listing proves nothing about the account." >&2

# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# The table of known application ids lives with the one function that mints, so
# a new caller is attributable here the day it is added there.
# shellcheck source=lib/host-access-mint.sh
source "${REPO_ROOT}/scripts/lib/host-access-mint.sh"

aws_profile_ensure || cr_die "could not settle the AWS identity this listing reads as"

AWS_ERR="$(mktemp)"
cr_cleanup rm -f "$AWS_ERR"

# Every event the trail holds for the call, as CloudTrail's own JSON strings.
# The CLI follows the pagination itself.
if ! events_json="$("$AWS_BIN" cloudtrail lookup-events --region us-east-1 \
    --lookup-attributes AttributeKey=EventName,AttributeValue=GetInstanceAccessDetails \
    --start-time "$SINCE" --query 'Events[].CloudTrailEvent' --output json 2>"$AWS_ERR")"; then
  cr_die "could not read CloudTrail's event history: $(tr '\n' ' ' <"$AWS_ERR")"
fi

# One row per event, oldest first, its fields joined by the unit separator. A
# field the event does not carry reads as empty, never as a guess. Not tabs:
# bash's read folds a run of whitespace separators into one, so an empty field
# would shift every field after it.
FS=$'\x1f'
if ! rows="$(jq -r '
    (. // []) | map(fromjson) | sort_by(.eventTime) | .[]
    | [ (.eventTime // ""),
        (.userIdentity.arn // .userIdentity.principalId // ""),
        (.sourceIPAddress // ""),
        (.requestParameters.instanceName // ""),
        (.errorCode // ""),
        (.userAgent // "") ]
    | map(tostring | gsub("[\u001f\n\t]"; " ")) | join("\u001f")' <<<"$events_json" 2>"$AWS_ERR")"; then
  cr_die "CloudTrail's event history did not parse as the documented event structure: $(tr '\n' ' ' <"$AWS_ERR")"
fi

known_app_id() {
  local id
  for id in "${HOST_ACCESS_MINT_APP_IDS[@]}"; do
    [[ "$id" == "$1" ]] && return 0
  done
  return 1
}

claimed=0 denied=0 unattributed=0
APP_TOKEN_RE='(^|[[:space:]])app/([^[:space:]]+)'
while IFS="$FS" read -r time principal source instance error agent; do
  [[ -n "$time$principal$source$agent" ]] || continue
  app=""
  [[ "$agent" =~ $APP_TOKEN_RE ]] && app="${BASH_REMATCH[2]}"
  shown_principal="${principal:-(not recorded)}"
  shown_source="${source:-(not recorded)}"
  shown_instance="${instance:-(not recorded)}"
  if [[ -n "$error" ]]; then
    class=denied
    denied=$(( denied + 1 ))
    cr_warn "denied attempt at ${time} by ${shown_principal} from ${shown_source} on ${shown_instance}: ${error}"
  elif [[ -n "$app" ]] && known_app_id "$app"; then
    class=claimed
    claimed=$(( claimed + 1 ))
  else
    class=unattributed
    unattributed=$(( unattributed + 1 ))
    if [[ -n "$app" ]]; then
      why="its application id '${app}' is not one a known script uses"
    elif [[ -z "$agent" ]]; then
      why="the event records no user agent"
    else
      why="its user agent carries no application id"
    fi
    cr_error "unattributed mint at ${time} by ${shown_principal} from ${shown_source} on ${shown_instance}: ${why}; match it by time and source address, and investigate it if nothing does"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$time" "$class" "$shown_principal" "$shown_source" \
    "$shown_instance" "${error:--}" "${app:--}"
done <<<"$rows"

cr_proved "every GetInstanceAccessDetails call since ${SINCE} is listed: ${claimed} claimed, ${denied} denied, ${unattributed} unattributed"
cr_unproved "that each claimed mint came from the run its application id names: claimed is not proved, and the person who ran that script confirms the run"

cr_finish
