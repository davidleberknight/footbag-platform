#!/usr/bin/env bash
# scripts/step-amazon-linux.sh -- steps a host to the Amazon Linux 2023 release
# pinned in ops/tool-versions.env, or reports where it stands.
#
# Why this exists: a host's distribution packages, docker included, are the ones
# its locked release serves, so patching the operating system means stepping the
# release, deliberately and staging first, when the maintainer decides to patch.
# Move AMAZON_LINUX_RELEASE (and DOCKER_ENGINE_HOST to the version that release
# serves) with scripts/bump-tool.sh, then run this on staging, prove staging,
# and run it on production.
#
# A step owns the whole change, in this order:
#   1. production only: the release gate, so the pin being stepped to is the one
#      continuous integration proved on main;
#   2. how many packages the step changes, read without changing any, and a
#      typed APPLY on production;
#   3. a manual Lightsail snapshot of the instance, complete before anything
#      moves: dnf cannot step a release back, so the snapshot is the way back;
#   4. footbag.service stopped and one database backup run to completion and
#      proved in the snapshots bucket, so no write is lost if the host is rebuilt;
#   5. production only: the branded maintenance page checked as what visitors
#      see. CloudFront serves it for every origin error, so with the service
#      stopped it is up without a change of its own;
#   6. the backup timer stopped, the free disk checked, and the upgrade run as
#      a transient systemd unit so a dropped session cannot cut it short; then
#      the release and an empty "left to install" list proved;
#   7. a reboot when dnf or smart-restart says the new kernel or core libraries
#      need one, proved by a new boot id;
#   8. the backup timer and the service started again, and success reported only
#      once the host's sqlite3, docker, Compose and release match the pins, every
#      container is healthy and /health/ready answers.
# Any failure after the stop leaves the service stopped, deliberately: what the
# step changed is not known from here. The closing report names the snapshot.
#
# What it refuses to do:
#   - Run without --target; there is no default host.
#   - Act on a host whose recorded FOOTBAG_ENV is not the target.
#   - Step production outside the release gate, or without a typed APPLY at a
#     terminal.
#   - Touch the host before the snapshot is complete and the backup proved.
#   - Report success unless the host then matches the pins and the stack is
#     healthy.
#
# Usage:
#   < <operator credential file> bash scripts/step-amazon-linux.sh --target <staging|production> [--status]
#
# Flags:
#   --target   staging or production (required)
#   --status   report the host's release, the pin, the newer releases the
#              distribution offers and any pending reboot; changes nothing
#
# A re-run on a host already at the pin, with nothing left to install and no
# reboot pending, changes nothing and says so.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"
# shellcheck source=lib/host-snapshot.sh
source "${SCRIPT_DIR}/lib/host-snapshot.sh"
# shellcheck source=lib/host-reboot.sh
source "${SCRIPT_DIR}/lib/host-reboot.sh"
# shellcheck source=lib/production-release-gate.sh
source "${SCRIPT_DIR}/lib/production-release-gate.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/step-amazon-linux-remote.sh"
REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
VERSIONS_HALF="${SCRIPT_DIR}/internal/host-tool-versions-remote.sh"
DNF_PARSER="${SCRIPT_DIR}/internal/dnf-check-update-remote.sh"
QUIESCE_HALF="${SCRIPT_DIR}/internal/bootstrap-host-quiesce-remote.sh"
REBOOT_HALF="${SCRIPT_DIR}/internal/bootstrap-host-reboot-remote.sh"
RESTART_HALF="${SCRIPT_DIR}/internal/restart-host-remote.sh"

AWS_BIN="${FOOTBAG_STEP_AL_AWS_BIN:-aws}"
CURL_BIN="${FOOTBAG_STEP_AL_CURL_BIN:-curl}"
POLL_SECS="${FOOTBAG_STEP_AL_POLL_SECS:-15}"
[[ -n "${FOOTBAG_STEP_AL_AWS_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_STEP_AL_AWS_BIN='${AWS_BIN}' -- this run proves nothing about the estate." >&2
[[ -n "${FOOTBAG_STEP_AL_CURL_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_STEP_AL_CURL_BIN='${CURL_BIN}' -- not reaching the real edge." >&2
[[ -n "${FOOTBAG_STEP_AL_POLL_SECS:-}" ]] && echo "SYNTHETIC: FOOTBAG_STEP_AL_POLL_SECS=${POLL_SECS} -- the waits are shortened." >&2

TARGET="" MODE=step
usage() {
  sed -n '/^# Usage:/,/^# A re-run/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "step-amazon-linux: --target requires an argument" >&2; exit 2; } ;;
    --status)  MODE=status; shift ;;
    -h|--help) usage 0 ;;
    *) echo "step-amazon-linux: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done
[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] \
  || cr_die "--target must be production or staging (got '${TARGET}')"
local_file() { [[ -r "$1" ]] || cr_die "missing ${1#"${REPO_ROOT}/"}"; }
local_file "$REMOTE_HALF"; local_file "$REPORT_LIB"; local_file "$VERSIONS_HALF"; local_file "$DNF_PARSER"
local_file "$QUIESCE_HALF"; local_file "$REBOOT_HALF"; local_file "$RESTART_HALF"

tool_pins_ok AMAZON_LINUX_RELEASE SQLITE_VERSION DOCKER_ENGINE_HOST COMPOSE_VERSION \
  || cr_die "the version list is missing a pin this step proves against"
tool_pin AMAZON_LINUX_RELEASE; PIN="$TOOL_PIN_VALUE"
tool_pin SQLITE_VERSION; PIN_SQLITE="$TOOL_PIN_VALUE"
tool_pin DOCKER_ENGINE_HOST; PIN_DOCKER="$TOOL_PIN_VALUE"
tool_pin COMPOSE_VERSION; PIN_COMPOSE="$TOOL_PIN_VALUE"

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || cr_die "no usable ssh alias ${ALIAS}"
require_operator_stdin "scripts/step-amazon-linux.sh --target ${TARGET}" "$ALIAS" "$TARGET" \
  || cr_die "no operator credential on standard input"
require_host_is "$ALIAS" "$TARGET" || cr_die "${ALIAS} is not the ${TARGET} host"

# One send per mode, on the wire pattern: the password, the values, the shared
# reporting functions, then the body.
send() {
  local mode="$1"; shift
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' "$mode"
    printf 'AMAZON_LINUX_RELEASE=%q\n' "$PIN"
    local kv
    for kv in "$@"; do printf '%s=%q\n' "${kv%%=*}" "${kv#*=}"; done
    cat "$REPORT_LIB"
    cat "$DNF_PARSER"
    [[ "$mode" == prove ]] && cat "$VERSIONS_HALF"
    cat "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}

# Runs a send, shows it, keeps only its marked value lines for marked() and lists
# every problem it reported. The rest of the session is never written down.
LAST_LOG=""
send_reported() {
  local label="$1"; shift
  LAST_LOG="$(mktemp "$(_cr_tmp)/send.XXXXXX")"
  local rc=0
  cr_run_marked "$label" -- _send_into "$LAST_LOG" "$@" || rc=$?
  return "$rc"
}
_send_into() { local log="$1"; shift; send "$@" | cr_keep_marked "$log"; return "${PIPESTATUS[0]}"; }
marked() { grep -m1 -e "^---FOOTBAG-$1--- " -- "$LAST_LOG" | cut -d' ' -f2-; }

if [[ "$MODE" == status ]]; then
  echo "==> status of Amazon Linux on ${ALIAS} (pinned ${PIN})"
  send_reported "status" status || true
  cr_proved "status read from ${ALIAS}; nothing was changed"
  cr_finish
fi

# ── 1. The release gate ──────────────────────────────────────────────────────
if [[ "$TARGET" == production ]]; then
  echo "==> The production release gate"
  production_release_gate_deploy "$REPO_ROOT" \
    || cr_die "the release gate refuses this tree; nothing was changed"
  cr_proved "the release gate passed: the pin ${PIN} is on a CI-proven main"
fi

# ── 2. What the step changes, and the confirmation ───────────────────────────
echo "==> What stepping ${ALIAS} to ${PIN} changes"
send_reported "preview" preview || cr_die "could not read what the step would change; nothing was changed"
PACKAGES="$(marked PREVIEW)"
[[ "$PACKAGES" =~ ^[0-9]+$ ]] || cr_die "the host reported no package count; nothing was changed"
send_reported "status" status || cr_die "could not read the host's state; nothing was changed"
PENDING_REBOOT="$(marked REBOOT)"
if [[ "$PACKAGES" == 0 && "$PENDING_REBOOT" == not-needed ]]; then
  echo "    ${ALIAS} is at ${PIN}, nothing is left to install and no reboot is pending; nothing to do"
  cr_proved "${ALIAS} already at ${PIN} with nothing left to install"
  cr_finish
fi
echo "    ${PACKAGES} package(s) move; a reboot is ${PENDING_REBOOT:-of unknown need} before the step"

if [[ "$TARGET" == production ]]; then
  production_staging_first_reminder
  echo ""
  echo "About to step ${ALIAS} to Amazon Linux ${PIN}: ${PACKAGES} package(s), docker"
  echo "included. The run snapshots the instance, stops footbag.service, takes and"
  echo "proves a database backup, steps the release, reboots if the new kernel or"
  echo "core libraries need it, and starts the service again. The site shows the"
  echo "maintenance page from the stop until the service is back, usually a few"
  echo "minutes, and the CloudFront 5xx alarm fires for that window."
  echo ""
  confirm_from_tty "Type 'APPLY' to step production: " "APPLY" \
    || cr_die "not confirmed; nothing was changed"
fi

# ── 3. The snapshot ──────────────────────────────────────────────────────────
aws_profile_ensure || cr_die "no AWS identity; nothing was changed"
if [[ "$TARGET" == production ]]; then
  aws_identity_require_direct_user footbag-operator || cr_die "production is stepped only as footbag-operator; nothing was changed"
fi
tf_instance_name "$TARGET" || cr_die "could not read the ${TARGET} instance from Terraform; nothing was changed"
INSTANCE="$TF_INSTANCE_NAME"
tf_output_read "${REPO_ROOT}/terraform/${TARGET}" snapshots_bucket_name \
  || cr_die "could not read the snapshots bucket from Terraform: ${TF_OUTPUT_ERROR:-unknown}; nothing was changed"
BUCKET="$TF_OUTPUT_VALUE"

SNAP="${INSTANCE}-pre-step-$(date -u +%Y%m%dT%H%M%SZ)"
echo "==> Snapshotting ${INSTANCE} as ${SNAP}"
host_snapshot_create "$AWS_BIN" "$INSTANCE" "$SNAP" || cr_die "${HS_ERROR}; nothing was changed"
# Four hours: a snapshot still pending after that is a Lightsail problem to look
# at before anything moves, not one to wait out.
host_snapshot_wait "$AWS_BIN" "$SNAP" 14400 "$POLL_SECS" || cr_die "${HS_ERROR}; nothing was changed"
cr_proved "Lightsail reports ${SNAP} complete"

# ── 4. The stop and the proved backup ────────────────────────────────────────
STOPPED=0
STARTED=0
left_stopped() {
  if (( STOPPED && ! STARTED )); then
    cr_error "footbag.service on ${ALIAS} is still STOPPED, deliberately: what the step changed is not known from here. Read the report above, then either start it with 'bash scripts/restart-host.sh --target ${TARGET}' or go back to the pre-step host from the manual snapshot ${SNAP}"
  fi
}
cr_cleanup left_stopped

quiesce_from="$(date -u +%s)"
STOPPED=1
echo "==> Stopping footbag.service and taking its last backup"
quiesce_log="$(mktemp "$(_cr_tmp)/quiesce.XXXXXX")"
_quiesce_send() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' stop
    cat "$REPORT_LIB"
    cat "$QUIESCE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}
# Only the host's marked lines are kept, for its completion marker; the rest of
# what it printed is shown and never written down.
_quiesce() { _quiesce_send | cr_keep_marked "$quiesce_log"; return "${PIPESTATUS[0]}"; }
cr_run_marked "stop and back up" -- _quiesce || cr_die "stopping the service or its last backup failed"
grep -qx -- '---FOOTBAG-QUIESCED---' "$quiesce_log" || cr_die "${ALIAS} did not report its last backup complete"
host_newest_backup "$AWS_BIN" "$BUCKET" || cr_die "$HS_ERROR"
last_epoch="$(date -u -d "${HS_NEWEST_BACKUP:-}" +%s 2>/dev/null)" \
  || cr_die "the newest backup in ${BUCKET} has no readable time ('${HS_NEWEST_BACKUP:-none}')"
[[ -n "$HS_NEWEST_BACKUP" ]] && (( last_epoch >= quiesce_from )) \
  || cr_die "no backup object in ${BUCKET} is newer than the stop (newest: ${HS_NEWEST_BACKUP:-none})"
cr_proved "footbag.service stopped; the last backup, ${HS_NEWEST_BACKUP}, is in ${BUCKET}"

# ── 5. What visitors see ─────────────────────────────────────────────────────
PAGE_MARKER=""
DOMAIN=""
if [[ "$TARGET" == production ]]; then
  page_source="${REPO_ROOT}/terraform/production/maintenance-page/maintenance.html"
  PAGE_MARKER="$(sed -n 's/.*<h1>\(.*\)<\/h1>.*/\1/p' "$page_source" 2>/dev/null | head -1)"
  if tf_output_read "${REPO_ROOT}/terraform/production" cloudfront_domain && [[ -n "$PAGE_MARKER" ]]; then
    DOMAIN="$TF_OUTPUT_VALUE"
    curl_err="$(mktemp "$(_cr_tmp)/curl.XXXXXX")"
    curl_rc=0
    body="$("$CURL_BIN" -sS --max-time 20 -w '\n%{http_code}' "https://${DOMAIN}/" 2>"$curl_err")" || curl_rc=$?
    status="${body##*$'\n'}"
    if (( curl_rc != 0 )); then
      cr_warn "with the service stopped, https://${DOMAIN}/ could not be read, so what visitors see was not checked: $(tail -n 1 "$curl_err")"
    elif [[ "$status" == 503 && "$body" == *"$PAGE_MARKER"* ]]; then
      cr_proved "visitors see the branded maintenance page (503) while the service is stopped"
    else
      cr_warn "with the service stopped, https://${DOMAIN}/ answered ${status:-nothing}, not the branded maintenance page"
    fi
  else
    cr_warn "could not read the distribution domain or the page heading, so what visitors see was not checked"
  fi
fi

# ── 6. The step ──────────────────────────────────────────────────────────────
echo "==> Stepping ${ALIAS} to ${PIN}"
send_reported "step" step || cr_die "the step on ${ALIAS} did not complete"
REBOOT="$(marked REBOOT)"
[[ "$REBOOT" == needed || "$REBOOT" == not-needed ]] || cr_die "the host did not say whether a reboot is needed"
cr_proved "${ALIAS} reports Amazon Linux ${PIN}, with nothing at that release left to install"

# ── 7. The reboot ────────────────────────────────────────────────────────────
if [[ "$REBOOT" == needed ]]; then
  echo "==> Rebooting ${ALIAS}: the new kernel or core libraries need it"
  host_reboot_and_wait "$ALIAS" "$REBOOT_HALF" "$POLL_SECS" 60 || cr_die "$HR_ERROR"
  cr_proved "${ALIAS} rebooted (boot id ${HR_BOOT_ID})"
else
  cr_proved "no reboot needed"
fi

# ── 8. Back in service, and proved ───────────────────────────────────────────
echo "==> Starting the backup timer and the service"
send_reported "resume" resume || cr_die "could not start the backup timer"
_restart() {
  {
    printf '%s\n' "$SUDO_PASS"
    cat "$RESTART_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'
}
cr_run_marked --errors "$FOOTBAG_FAILURE_GRAMMAR" --warnings "$FOOTBAG_NOTICE_GRAMMAR" \
  "start and prove the stack" -- _restart || cr_die "the stack did not come back healthy"
STARTED=1
cr_proved "footbag.service active, every container healthy, /health/ready answering"
send_reported "versions" prove \
  "EXPECTED_SQLITE_VERSION=${PIN_SQLITE}" \
  "EXPECTED_DOCKER_ENGINE=${PIN_DOCKER}" \
  "EXPECTED_AMAZON_LINUX_RELEASE=${PIN}" \
  "EXPECTED_COMPOSE_VERSION=${PIN_COMPOSE}" \
  || cr_die "the host does not match the pins"
cr_proved "the host's sqlite3, docker, Compose and release match the pins"

# edge_served_again <domain>
# Proves visitors are served a page again after the restart. Only an answer
# that is a page counts; a failed read or any other status is a warning with
# what came back, never a proof.
edge_served_again() {
  local domain="$1" curl_err curl_rc=0 status
  curl_err="$(mktemp "$(_cr_tmp)/curl.XXXXXX")"
  status="$("$CURL_BIN" -sS -o /dev/null --max-time 20 -w '%{http_code}' "https://${domain}/" 2>"$curl_err")" || curl_rc=$?
  if (( curl_rc != 0 )); then
    cr_warn "https://${domain}/ could not be read after the restart, so visitors being served again was not proved: $(tail -n 1 "$curl_err")"
  elif [[ "$status" == 503 ]]; then
    cr_warn "https://${domain}/ still answers 503 after the restart; CloudFront may be serving its cached error for a few more seconds"
  elif [[ "$status" =~ ^[23][0-9][0-9]$ ]]; then
    cr_proved "https://${domain}/ answers ${status} again"
  else
    cr_warn "https://${domain}/ answers ${status:-nothing} after the restart, not a page"
  fi
}
if [[ -n "$DOMAIN" ]]; then
  edge_served_again "$DOMAIN"
fi

cr_unproved "the patch date and any notable change are recorded: that is the System Administrator's note, per the patching story"
echo ""
echo "The manual snapshot ${SNAP} is kept: it is the way back to ${ALIAS} as it was before the step."
cr_finish
