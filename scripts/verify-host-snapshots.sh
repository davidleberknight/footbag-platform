#!/usr/bin/env bash
# verify-host-snapshots.sh
#
# Proves the hosting provider is still taking the daily automatic snapshot of
# the host, not merely that the add-on is configured. Read-only: it writes
# nothing anywhere.
#
# The host snapshot runs inside the hosting provider with no platform code, so
# no job-run row records it and no alarm fires when it stops. A host restore
# rests on the newest snapshot, and a stopped add-on would leave the operator
# with a snapshot weeks old at the one moment it is needed. This reads the
# instance's automatic snapshots and fails unless the newest successful one is
# younger than a day plus the two-hour grace every daily job is allowed.
#
# A new instance has nothing to show yet: the add-on takes its first snapshot
# at the next daily window, up to a day after the instance is created. So an
# instance with no successful snapshot that is younger than the limit, and whose
# AutoSnapshot add-on reads exactly Enabled, is reported as not yet due, with
# the time the first snapshot is due by, under its own exit status. That is not
# a pass: nothing has yet proved the add-on takes snapshots of it.
#
# What it refuses or fails on:
#   - a target it was not given; there is no default
#   - a Terraform output it could not read (the instance name)
#   - an instance with no successful automatic snapshot, including one whose
#     add-on is off, because a check with nothing to look at proves nothing,
#     unless it is new as above; a new instance fails as well when its add-on
#     reads anything but Enabled, when a snapshot the add-on took failed, or
#     when its creation time and add-on cannot be read
#   - no successful snapshot within the last 26 hours
#
# Exit status:
#   0  the newest successful snapshot is within the limit
#   1  a failure or refusal above
#   2  a usage error
#   3  not yet due: a new instance, its add-on Enabled, no snapshot yet
#
# Usage:
#   bash scripts/verify-host-snapshots.sh --target production
#   bash scripts/verify-host-snapshots.sh --target staging
#
# Test seams (CI only; operators never set these), announced on stderr when set:
# VERIFY_HOST_SNAPSHOTS_AWS_BIN and VERIFY_HOST_SNAPSHOTS_TERRAFORM_BIN replace
# the two tools; VERIFY_HOST_SNAPSHOTS_NOW fixes the clock the age is measured
# from.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

TARGET=""
# A day between snapshots plus the grace a daily job is allowed before it reads
# as overdue.
MAX_AGE_HOURS=26

die() { echo "verify-host-snapshots: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "verify-host-snapshots: --target requires an argument" >&2; exit 2; } ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify-host-snapshots: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[[ "$TARGET" == "staging" || "$TARGET" == "production" ]] \
  || die "--target must be staging or production (got '${TARGET}')"

AWS_BIN="${VERIFY_HOST_SNAPSHOTS_AWS_BIN:-aws}"
TF_BIN="${VERIFY_HOST_SNAPSHOTS_TERRAFORM_BIN:-terraform}"
for seam in VERIFY_HOST_SNAPSHOTS_AWS_BIN VERIFY_HOST_SNAPSHOTS_TERRAFORM_BIN VERIFY_HOST_SNAPSHOTS_NOW; do
  [[ -n "${!seam:-}" ]] && echo "verify-host-snapshots: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

if [[ -z "${VERIFY_HOST_SNAPSHOTS_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

INSTANCE="$("$TF_BIN" -chdir="terraform/${TARGET}" output -raw lightsail_instance_name </dev/null 2>/dev/null)" \
  || die "could not read terraform/${TARGET} output lightsail_instance_name"
[[ -n "$INSTANCE" ]] || die "terraform/${TARGET} output lightsail_instance_name is empty"
echo "==> automatic snapshots of ${INSTANCE}"

listing="$("$AWS_BIN" lightsail get-auto-snapshots --resource-name "$INSTANCE" \
  --query 'autoSnapshots[].[createdAt,status]' --output text </dev/null 2>/dev/null)" \
  || die "could not read the automatic snapshots of ${INSTANCE}; is the snapshot add-on enabled?"

now_iso="${VERIFY_HOST_SNAPSHOTS_NOW:-$(date -u +%Y-%m-%dT%H:%M:%S)}"
now_epoch="$(date -u -d "${now_iso} UTC" +%s)"

# to_epoch <timestamp>: the CLI prints a time as an ISO timestamp or, under
# some timestamp settings, as epoch seconds; both are read here.
to_epoch() {
  if [[ "$1" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "${1%%.*}"
  else
    date -u -d "$1" +%s 2>/dev/null
  fi
}

newest_epoch=""
newest_at=""
seen=0
failed=0
while IFS=$'\t' read -r created status; do
  [[ -z "${created:-}" || "$created" == "None" ]] && continue
  seen=$((seen + 1))
  echo "    ${created}  ${status}"
  [[ "$status" == "Failed" ]] && failed=$((failed + 1))
  [[ "$status" == "Success" ]] || continue
  epoch="$(to_epoch "$created")" || die "could not read snapshot time '${created}'"
  if [[ -z "$newest_epoch" ]] || (( epoch > newest_epoch )); then
    newest_epoch="$epoch"; newest_at="$created"
  fi
done <<< "$listing"

if [[ -z "$newest_epoch" ]]; then
  if (( seen == 0 )); then
    lack="${INSTANCE} has no automatic snapshots"
  else
    lack="${INSTANCE} has no successful automatic snapshot among the ${seen} listed"
  fi
  # Whether the instance is too new for its first snapshot to be due. Only a
  # read that answers decides that; a failed one is an error with the tool's
  # own message, never a new instance.
  inst_err="$(mktemp)"
  trap 'rm -f "$inst_err"' EXIT INT TERM HUP
  inst_row="$("$AWS_BIN" lightsail get-instance --instance-name "$INSTANCE" \
    --query "instance.[createdAt,addOns[?name=='AutoSnapshot'].status|[0]]" --output text </dev/null 2>"$inst_err")" \
    || die "${lack}, and whether it is new enough for none to be due yet could not be read: $(grep -v '^[[:space:]]*$' "$inst_err" | tail -n 1)"
  IFS=$'\t' read -r inst_created addon_status <<< "$inst_row"
  # An empty time is refused before it is read: date takes it for midnight.
  [[ -n "${inst_created:-}" ]] && inst_epoch="$(to_epoch "$inst_created")" \
    || die "${lack}, and its creation time '${inst_created:-}' could not be read"
  [[ "${addon_status:-}" == "Enabled" ]] \
    || die "${lack}, and its AutoSnapshot add-on reads '${addon_status:-}', not Enabled"
  (( failed == 0 )) || die "${lack}: the add-on took a snapshot that failed"
  inst_age=$(( now_epoch - inst_epoch ))
  if (( inst_age >= MAX_AGE_HOURS * 3600 )); then
    die "${lack}, so nothing proves the add-on is taking them; it was created ${inst_created}, $(( inst_age / 3600 )) hours ago, past the ${MAX_AGE_HOURS}-hour limit"
  fi
  due="$(date -u -d "@$(( inst_epoch + MAX_AGE_HOURS * 3600 ))" +%Y-%m-%dT%H:%MZ)"
  echo ""
  echo "== first automatic snapshot of ${INSTANCE} is due by ${due}: not yet due on ${TARGET}, since it was created ${inst_created} and the AutoSnapshot add-on is Enabled =="
  exit 3
fi

age_hours=$(( (now_epoch - newest_epoch) / 3600 ))
if (( now_epoch - newest_epoch > MAX_AGE_HOURS * 3600 )); then
  die "the newest successful snapshot of ${INSTANCE} is ${age_hours} hours old (${newest_at}), past the ${MAX_AGE_HOURS}-hour limit; the daily snapshot has stopped"
fi
echo ""
echo "== host snapshots current on ${TARGET}: newest successful snapshot of ${INSTANCE} is ${age_hours} hours old (${newest_at}) =="
