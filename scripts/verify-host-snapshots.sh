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
# What it refuses or fails on:
#   - a target it was not given; there is no default
#   - a Terraform output it could not read (the instance name)
#   - an instance with no automatic snapshots at all, including one whose
#     add-on is off, because a check with nothing to look at proves nothing
#   - no successful snapshot within the last 26 hours
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

newest_epoch=""
newest_at=""
seen=0
while IFS=$'\t' read -r created status; do
  [[ -z "${created:-}" || "$created" == "None" ]] && continue
  seen=$((seen + 1))
  echo "    ${created}  ${status}"
  [[ "$status" == "Success" ]] || continue
  # The CLI prints the creation time as an ISO timestamp or, under some
  # timestamp settings, as epoch seconds; both are read here.
  if [[ "$created" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    epoch="${created%%.*}"
  else
    epoch="$(date -u -d "$created" +%s 2>/dev/null)" || die "could not read snapshot time '${created}'"
  fi
  if [[ -z "$newest_epoch" ]] || (( epoch > newest_epoch )); then
    newest_epoch="$epoch"; newest_at="$created"
  fi
done <<< "$listing"

(( seen > 0 )) || die "${INSTANCE} has no automatic snapshots, so nothing proves the add-on is taking them"
[[ -n "$newest_epoch" ]] || die "${INSTANCE} has no successful automatic snapshot among the ${seen} listed"

age_hours=$(( (now_epoch - newest_epoch) / 3600 ))
if (( now_epoch - newest_epoch > MAX_AGE_HOURS * 3600 )); then
  die "the newest successful snapshot of ${INSTANCE} is ${age_hours} hours old (${newest_at}), past the ${MAX_AGE_HOURS}-hour limit; the daily snapshot has stopped"
fi
echo ""
echo "== host snapshots current on ${TARGET}: newest successful snapshot of ${INSTANCE} is ${age_hours} hours old (${newest_at}) =="
