#!/usr/bin/env bash
# bootstrap-host.sh
#
# Takes a fresh Lightsail instance to a deployable, deployed host with no
# hand-typed step, and reports, step by step, how far any host has got.
#
# WHY THIS EXISTS.
#
# Lightsail runs no user_data here, so everything a host carries beyond the
# image was put there by hand: the shared footbag account, the second sshd port,
# Docker and the Compose plugin, /srv/footbag and its env file, the database
# directory's owner. A snapshot restore carries that state; any new instance
# starts without it, and the runbook steps that recreated it were held in a
# person's head. A new instance is always in us-east-1: the region is fixed
# there, where the SES sender identity and the CloudFront certificate are bound,
# so a rebuild is a replacement in the same region, never a move to another
# one. This script is those steps, in
# order, followed by the existing host scripts in bring-up order, so one command
# stands an environment up and its status mode says what is missing.
#
# THE ORDER, each step proving its outcome before it skips:
#
#    1  terraform-apply-all.sh: the shared tree, identity, then the environment,
#       each plan shown and confirmed by that script. Then the instance's name as
#       Terraform records it, which a restore from snapshot changes, and the
#       address the site is served at: a brand-new environment's first pass
#       publishes none until CloudFront is enabled, and the run stops there
#       naming that step rather than failing inside the deploy.
#    2  install-known-hosts.sh: the host key pinned from the Lightsail API, so
#       nothing below connects to a host it has not verified. Before the host
#       records which environment it is, this pin is what proves the host is
#       footbag-<target>-web: it is that instance's key, read from AWS.
#    3  first login as ec2-user on port 22 with the Terraform key pair: sshd on
#       2222 as well, the shared footbag account in wheel with ec2-user's keys
#       copied, its sudo password set from line 1 of the operator credential
#       file. Done when footbag logs in on the alias and sudo takes the password.
#       Taken only when footbag's login is refused or does not answer; an
#       account that logs in and whose sudo refuses the password is reported and
#       never repaired, and an existing account's usable password is never
#       changed.
#    4  host tools from the tool-version list, ops/tool-versions.env: docker from the
#       distribution unless an engine is already installed, the Compose plugin
#       checked against its SHA-256, sqlite, rsync, the AWS CLI where the image
#       has none. On a host whose containers are running, stepping the Amazon
#       Linux release first counts the packages the step would change and asks
#       for its own typed APPLY: the upgrade runs under the serving site.
#    5  /srv/footbag and an empty env file, root:root, mode 600.
#    6  set-host-env.sh: the host's FOOTBAG_ENV record. From here every step
#       first asks the host which environment it is.
#    7  the database directory, owned by the containers' account.
#    8  install-host-credentials.sh --rotate, the host proving its own chain,
#       then --retire for the dead host's key. A key is deleted only on a later
#       run, once it has been seen inactive, never in the run that retired it,
#       and nothing is retired while the host's own key id reads empty. A user
#       holding two keys while the host holds neither, which no rotation can
#       mint past, has one of them retired without the host's proof, since
#       nothing here uses either; the rotation follows once it is deleted.
#    9  install-cwagent-<target>.sh: --upgrade when only the pinned version
#       moved, keeping the agent's key; --rotate when the host holds none of the
#       publisher's keys; its metrics proved, then the same retirement.
#   10  the first deploy. On production after go-live, which refuses the
#       rebuild deploy for good, the database comes back by restore and the
#       erasure replay runs before the site serves: deploy-code.sh
#       --first-install promotes the release, loads the images and installs the
#       unit without starting it; restore-db.sh --onto-empty restores, replays
#       the erasures and starts the service; then the code deploy runs its
#       ordinary path, which verifies.
#   11  install-backup-timer.sh, done once a backup object has landed.
#   12  activate-notification-feeds.sh, only when the values file turns them on,
#       done once the host holds both queue addresses.
#   13  harden-sshd.sh --apply, and --confirm for a change left unconfirmed.
#   14  the administrators' keys: named, not run (see below).
#   15  one reboot, behind its own typed APPLY, when the host needs one: when
#       `dnf needs-restarting -r` reports a kernel or core library installed
#       since boot, on either environment, and on staging so the deploy's
#       suppression of compressed in-RAM swap takes effect (production keeps
#       that swap, so it needs none for it). Done once the host is back with a
#       new boot id, every container healthy, and no reboot still reported.
#   Then it names the milestone-gated steps (payments activation, first admin,
#   the cutover login alarm) and stops before them.
#
# The administrators' keys are not added here because nothing records them: the
# private operations checkout holds the one key Terraform injects, and who else
# holds host access is read live from the host. The step is named with its
# command rather than skipped in silence.
#
# Every run ends with one closing report (scripts/lib/closing-report.sh) listing
# each error and warning it met, its own, its siblings' and those the host
# halves marked on their streams, with what it proved; the exit status follows
# from that list.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default.
#   - Any identity but the directly authenticated footbag-operator user: the
#     run mints and retires keys and applies the identity tree.
#   - A run with no terminal, before anything changes: it asks for typed
#     confirmations and shows each minted key once.
#   - A tool-version list still holding a placeholder pin, before anything
#     changes.
#   - An alias whose HostName is not the address Terraform reports.
#   - A host recording the other environment, at any step.
#   - On production, a deploy step while the go-live marker cannot be read.
#
# --status reads every step's outcome and prints each as DONE, PENDING (with the
# command that finishes it), UNKNOWN, N-A or INFO. It changes nothing and exits
# non-zero while any step is pending or unread, the snapshot excepted, which
# appears on its own a day after an instance is created. A reboot the host
# reports needed is listed in its closing report.
#
# --replace-instance is the only route that replaces aws_lightsail_instance.web,
# the instance Terraform records, under whatever name a restore gave it. It asks
# for its own typed APPLY naming the instance and the snapshot. On production
# after go-live it first refuses unless the snapshots bucket holds a database
# backup newer than one backup interval, and after the APPLY it stops
# footbag.service and runs one backup to completion, proved by a new object in
# the bucket, so no write the host took is lost with it. It then takes a manual
# snapshot of the instance and waits until Lightsail reports it complete, and
# only then runs terraform-apply.sh --replace with that snapshot, which proves
# the snapshot again before it plans and accepts none older than two hours. A
# snapshot of this instance from the last hour, complete or still being taken,
# is reused rather than duplicated, and a run that cannot hand the apply a
# complete snapshot inside those two hours stops. Terraform replaces the static
# address's attachment and the firewall with the instance, so the new instance
# answers on the same address behind the same rules. The snapshot is never
# deleted by this script: once taken it is AWS's record, and the fresh instance
# is bootstrapped next by a plain run of this script.
#
# Usage (the host sudo password is read from stdin, line 1; which file holds it
# follows the account the alias connects as):
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/bootstrap-host.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/bootstrap-host.sh --target production
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/bootstrap-host.sh --target staging --status
#   bash scripts/bootstrap-host.sh --target staging --replace-instance
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/bootstrap-host.sh --target production --replace-instance
#
# --status without the redirect still reports the Terraform, pin and AWS rows
# and reads the host rows as UNKNOWN. --replace-instance reaches the host only on
# a live production, to stop it and take its last backup, and reads the
# password from stdin only there.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# FOOTBAG_HOST_SSH_BIN (the ssh client, from the shared wire library),
# BOOTSTRAP_HOST_TF_BIN, BOOTSTRAP_HOST_AWS_BIN, BOOTSTRAP_HOST_SCRIPTS_DIR (the
# directory the sibling scripts are run from, the sqlite3 build among them),
# BOOTSTRAP_HOST_TFVARS, FOOTBAG_TOOL_VERSIONS, BOOTSTRAP_HOST_SQLITE3_BIN (a
# file shipped in place of the built sqlite3), and BOOTSTRAP_HOST_POLL_SECS (the
# pause between polls of a snapshot or a reboot).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

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
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"
# shellcheck source=lib/host-reboot.sh
source "${SCRIPT_DIR}/lib/host-reboot.sh"
# shellcheck source=internal/bootstrap-host-steps.sh
source "${SCRIPT_DIR}/internal/bootstrap-host-steps.sh"

TARGET=""
MODE="apply"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}"
  cr_finish
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { cr_error "--target requires an argument"; exit 2; }
      ;;
    --status) [[ "$MODE" == "apply" ]] || { cr_error "--status and --replace-instance are separate runs."; exit 2; }
              MODE="status"; shift ;;
    --replace-instance) [[ "$MODE" == "apply" ]] || { cr_error "--status and --replace-instance are separate runs."; exit 2; }
              MODE="replace"; shift ;;
    -h|--help) usage ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || { cr_error "no environment to run against"; exit 2; }

BH_TARGET="$TARGET"
ALIAS="footbag-${TARGET}"
# The web instance as Terraform records it, read once the tree can answer: a
# restore from snapshot brings the host back under a new name and keeps the old
# instance, stopped, under the original one, so a name spelled here would
# snapshot, replace or report the wrong host.
INSTANCE=""
POLL_SECS="${BOOTSTRAP_HOST_POLL_SECS:-15}"
if [[ -n "${BOOTSTRAP_HOST_POLL_SECS:-}" ]]; then
  echo "SYNTHETIC: poll interval ${POLL_SECS}s -- this run proves nothing about the estate." >&2
fi
bh_announce_seams

# The reporting library every host half that reports problems is sent behind:
# a body arriving on stdin cannot source it.
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
# This run's own scratch, for the streams it keeps to read the halves' reports.
BH_WORK="$(mktemp -d)"
cr_cleanup rm -rf "$BH_WORK"

declare -A P=()
BH_CRED="<operator credential file>"
operator_credential_select "$ALIAS" "$TARGET" 2>/dev/null && BH_CRED="$OPERATOR_CREDENTIAL_DISPLAY"

# Every mode reaches AWS. The identity is settled and proved before anything
# else, and held to the directly authenticated operator user: this run applies
# the identity tree, mints access keys and retires them, none of which the job
# role may do, and a run that discovered that partway would leave half a host.
aws_profile_ensure || cr_die "the AWS profile for this run could not be settled; nothing was read or changed"
aws_identity_require_direct_user footbag-operator \
  || cr_die "this run needs the directly authenticated footbag-operator user; nothing was read or changed"

# ── Shared pieces ────────────────────────────────────────────────────────────

say() { printf '\n==> %s\n' "$*"; }
proved() {
  printf '    proved: %s\n' "$*"
  cr_proved "$*"
}

# One line of the password into a sibling script's stdin, never the operator's
# whole credential file, and never this run's own stdin, which the sibling would
# otherwise inherit and read further lines from.
with_pass() {
  printf '%s\n' "$SUDO_PASS" | bash "$@"
}

# capture_send <label> <send> [args...]
# Runs a host send whose output the caller reads afterwards, shows what it
# printed, and folds every problem the half marked on its stream into this run's
# closing report. Sets SEND_OUT; returns the send's status.
SEND_OUT=""
capture_send() {
  local label="$1" rc=0 log
  shift
  SEND_OUT="$("$@" 2>&1)" || rc=$?
  if [[ -n "$SEND_OUT" ]]; then printf '%s\n' "$SEND_OUT"; fi
  log="$(mktemp "${BH_WORK}/send.XXXXXX")"
  printf '%s\n' "$SEND_OUT" > "$log"
  cr_harvest --sentinels-only "$label" "$log"
  return "$rc"
}

# The steps judged from a fresh read, so a step is skipped only on its outcome as
# it stands now.
refresh_host() { bh_probe_host "$ALIAS"; }
refresh_aws() { bh_probe_aws "$TARGET"; }

verdict_is_done() {
  bh_verdict "$1"
  [[ "$BH_STATE" == "DONE" || "$BH_STATE" == "N-A" ]]
}

render_row() {
  local n="$1" step="$2"
  bh_verdict "$step"
  printf ' %2s. %-28s %-8s %s\n' "$n" "$BH_TITLE" "$BH_STATE" "$BH_DETAIL"
  if [[ -n "$BH_NEXT" && "$BH_STATE" != "DONE" && "$BH_STATE" != "N-A" ]]; then
    printf '      next: %s\n' "$BH_NEXT"
  fi
}

render_all() {
  local i=0 step pending=0
  echo ""
  echo "== host bootstrap: ${TARGET} =="
  for step in "${BH_STEPS[@]}"; do
    i=$(( i + 1 ))
    render_row "$i" "$step"
    case "$BH_STATE" in
      PENDING|UNKNOWN|FAILED) [[ "$step" == "snapshot" ]] || pending=$(( pending + 1 )) ;;
    esac
  done
  echo ""
  RENDER_PENDING="$pending"
}

host_answers_as_other_env() {
  [[ "${P[HOST_REACHED]:-}" == "yes" && -n "${P[FOOTBAG_ENV]:-}" && "${P[FOOTBAG_ENV]}" != "$TARGET" ]]
}

# Whether the packages installed since the host booted need a reboot to be the
# running ones, as the status probe read it. A check that could not answer is
# an error, never read as either answer.
report_reboot_need() {
  [[ "${P[HOST_REACHED]:-}" == "yes" ]] || return 0
  case "${P[REBOOT_NEEDED]:-}" in
    no) cr_proved "${ALIAS} needs no reboot for the packages installed since it booted" ;;
    yes) cr_warn "${ALIAS} needs a reboot: dnf needs-restarting -r reports a kernel or core library installed since boot. A run of this script offers it as its last step." ;;
    *) cr_error "could not read whether ${ALIAS} needs a reboot: ${P[REBOOT_NEEDED_SAID]:-the status probe reported nothing}" ;;
  esac
}

# ── --status ─────────────────────────────────────────────────────────────────

if [[ "$MODE" == "status" ]]; then
  bh_manifest_pins
  bh_probe_terraform "$TARGET"
  tf_instance_name "$TARGET" 2>/dev/null && P[INSTANCE]="$TF_INSTANCE_NAME"
  bh_probe_pin "$TARGET"
  if [[ -t 0 ]]; then
    echo "Skipping the host probe: it needs the host sudo password on stdin."
    echo "  Re-run as: < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET} --status"
    P[HOST_REACHED]=unknown
    cr_unproved "the host rows: the run had no sudo password to read them with"
  else
    require_operator_stdin "scripts/bootstrap-host.sh --target ${TARGET} --status" "$ALIAS" "$TARGET" \
      || cr_die "no host sudo password on stdin"
    refresh_host
    # The verifier is asked only of a host that says it is this environment:
    # held against another environment's values it would report that host's.
    host_answers_as_other_env || bh_probe_host_env "$TARGET"
  fi
  refresh_aws
  render_all
  if host_answers_as_other_env; then
    cr_die "${ALIAS} records FOOTBAG_ENV=${P[FOOTBAG_ENV]}. The rows above describe that host, not ${TARGET}'s."
  fi
  report_reboot_need
  if (( RENDER_PENDING > 0 )); then
    echo "${RENDER_PENDING} step(s) pending or unread."
    cr_die "${RENDER_PENDING} step(s) pending or unread on ${ALIAS}; each row above names its command"
  fi
  echo "Every step is done."
  cr_proved "every bootstrap step reads done on ${ALIAS}"
  cr_finish
fi

# ── --replace-instance ───────────────────────────────────────────────────────

if [[ "$MODE" == "replace" ]]; then
  terminal_present || cr_die "--replace-instance asks for a typed confirmation and needs a terminal. Nothing was changed."

  say "The instance to replace"
  tf_instance_name "$TARGET" || cr_die "could not read the ${TARGET} web instance from Terraform. Nothing was changed."
  INSTANCE="$TF_INSTANCE_NAME"
  inst_row="$("$BH_AWS_BIN" lightsail get-instance --region us-east-1 --instance-name "$INSTANCE" \
      --query 'instance.[state.name,createdAt]' --output text </dev/null 2>"${BH_WORK}/aws.err")" \
    || cr_die "could not read ${INSTANCE} from Lightsail ($(tail -n 1 "${BH_WORK}/aws.err")). Nothing was changed."
  IFS=$'\t' read -r inst_state inst_created <<< "$inst_row"
  echo "    ${INSTANCE}: ${inst_state}, created ${inst_created}"
  inst_epoch="$(date -u -d "$inst_created" +%s 2>/dev/null)" \
    || cr_die "${INSTANCE} reports no readable creation time ('${inst_row}'). Nothing was changed."

  # On production after go-live the instance holds the member database, and the
  # only copy younger than the last backup is on its disk. A snapshot captures
  # it, but a backup in the bucket is what every restore path reads, so one must
  # be there and fresh before the host is taken away.
  LIVE=0
  if [[ "$TARGET" == "production" ]]; then
    marker_rc=0
    marker="$("$BH_AWS_BIN" ssm get-parameter --name /footbag/production/app/production_live \
      --region us-east-1 --query Parameter.Value --output text </dev/null 2>"${BH_WORK}/aws.err")" || marker_rc=$?
    (( marker_rc == 0 )) || marker="unreadable, exit ${marker_rc}: $(tail -n 1 "${BH_WORK}/aws.err")"
    case "$marker" in
      false) echo "    production-live marker: false (pre-live); no backup freshness required" ;;
      true)
        LIVE=1
        # One interval plus the timer's own jitter is the oldest a healthy host's
        # newest backup can be.
        bh_backup_limit \
          || cr_die "could not read the backup interval from ops/systemd/footbag-backup.timer. Nothing was changed."
        limit="$BH_BACKUP_LIMIT"
        tf_output_read terraform/production snapshots_bucket_name \
          || cr_die "could not read the snapshots bucket from Terraform. Nothing was changed."
        bucket="$TF_OUTPUT_VALUE"
        host_newest_backup "$BH_AWS_BIN" "$bucket" || cr_die "${HS_ERROR}. Nothing was changed."
        newest="$HS_NEWEST_BACKUP"
        if [[ -n "$newest" ]]; then
          newest_epoch="$(date -u -d "$newest" +%s 2>/dev/null)" \
            || cr_die "the newest database backup in ${bucket} reports a time that cannot be read ('${newest}'), so its age is unknown. Nothing was changed."
          age=$(( $(date -u +%s) - newest_epoch ))
        fi
        if [[ -z "$newest" ]] || (( age > limit )); then
          cr_error "production is live and the newest database backup in ${bucket} is ${newest:-absent}, older than one backup interval (${limit}s)."
          echo "       The database between that backup and now lives only on this host's" >&2
          echo "       disk. Find why the backups stopped before replacing it:" >&2
          echo "         < ${BH_CRED} bash scripts/bringup-status.sh --target production --profile <prod-profile>" >&2
          echo "       Nothing was changed." >&2
          exit 1
        fi
        echo "    newest database backup: ${newest} (${age}s old, within ${limit}s)"
        ;;
      *)
        cr_die "could not read the production-live marker (${marker}), which decides whether a fresh backup is required first. Nothing was changed."
        ;;
    esac
  fi

  # A live host is stopped and backed up below, which needs the host and its
  # password, so both are settled before anything is asked or changed.
  if (( LIVE )); then
    require_operator_stdin "scripts/bootstrap-host.sh --target ${TARGET} --replace-instance" "$ALIAS" "$TARGET" \
      || cr_die "no host sudo password on stdin. Nothing was changed."
    require_host_is "$ALIAS" "$TARGET" || cr_die "${ALIAS} is not the ${TARGET} host. Nothing was changed."
  fi

  # How old a snapshot may be when the apply wrapper reads it. The wrapper
  # refuses one older than two hours, so a snapshot reaching complete later than
  # this, which leaves the wrapper a few minutes to plan, cannot protect the
  # replacement and is refused here rather than there.
  SNAP_USABLE_SECS=$(( 7200 - 300 ))
  # A snapshot of THIS instance from the last hour, complete or still being
  # taken, is reused rather than duplicated: a run declined at the prompt, or
  # re-run while a slow first snapshot is still being taken, then waits on the
  # one already started instead of starting another. One taken of an earlier
  # instance under the same name predates this one's creation and is never
  # reused, and the name carries the instance as Terraform records it, which is
  # the prefix the apply wrapper accepts. A listing that fails is not "none to
  # reuse": it is reported, and a fresh snapshot is taken.
  SNAP_REUSE_SECS=3600
  prefix="${INSTANCE}-pre-replace-"
  snap=""
  reused=0
  if host_snapshot_recent "$BH_AWS_BIN" "$INSTANCE" "$prefix" "$inst_epoch" "$SNAP_REUSE_SECS"; then
    if [[ -n "$HS_NAME" ]]; then
      snap="$HS_NAME"
      reused=1
      echo "    reusing ${snap}, a snapshot of this instance from the last hour (${HS_STATE})"
    fi
  else
    cr_warn "${HS_ERROR}; no snapshot is reused, and a fresh one is taken"
  fi
  [[ -n "$snap" ]] || snap="${prefix}$(date -u +%Y%m%dT%H%M%SZ)"

  echo ""
  echo "This REPLACES ${INSTANCE}. Terraform destroys the running instance and creates"
  echo "a fresh one from the image, with nothing on it, and replaces the static"
  echo "address's attachment and the firewall with it, so the new instance answers on"
  echo "the same address behind the same rules."
  if (( LIVE )); then
    echo "Production is live: footbag.service is stopped first, so nothing more is"
    echo "written, and one backup runs to completion and is proved in ${bucket}."
    echo "The site stays down from there; the bootstrap brings it back on the new host."
  fi
  echo "The running instance is snapshotted as:"
  echo "  ${snap}"
  echo "and the replacement goes ahead only once that snapshot is complete. The"
  echo "snapshot is kept: it is the way back to the host as it is now."
  echo ""
  confirm_from_tty "Type 'APPLY' to snapshot and replace ${INSTANCE}: " "APPLY" \
    || cr_die "not confirmed. Nothing was changed."

  QUIESCE_HALF="${SCRIPT_DIR}/internal/bootstrap-host-quiesce-remote.sh"
  quiesce_send() {
    {
      printf '%s\n' "$SUDO_PASS"
      printf 'MODE=%q\n' "$1"
      cat "$REMOTE_REPORT_LIB"
      cat "$QUIESCE_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-bootstrap-quiesce'
  }
  # Every refusal from here until the apply starts leaves the instance in place,
  # so a host this run stopped is started again on the way out.
  stopped=0
  refuse_before_replace() {
    cr_error "$1 Nothing was replaced."
    if (( stopped )); then
      if capture_send "start footbag.service again" quiesce_send resume; then
        echo "       footbag.service was started again." >&2
      else
        cr_error "footbag.service could NOT be started again: the site is DOWN. Start it with: < ${BH_CRED} bash scripts/host-diagnostics.sh --target ${TARGET}"
      fi
    fi
    exit 1
  }

  if (( LIVE )); then
    say "Stopping ${ALIAS}'s writes and taking its last backup"
    quiesce_from="$(date -u +%s)"
    stopped=1
    capture_send "stop ${ALIAS} and take its last backup" quiesce_send stop \
      || refuse_before_replace "stopping the service or its last backup failed on ${ALIAS}."
    grep -qx -- '---FOOTBAG-QUIESCED---' <<< "$SEND_OUT" \
      || refuse_before_replace "${ALIAS} did not report its last backup complete."
    host_newest_backup "$BH_AWS_BIN" "$bucket" || refuse_before_replace "${HS_ERROR}, so the last backup could not be found."
    [[ -n "$HS_NEWEST_BACKUP" ]] \
      || refuse_before_replace "no backup object in ${bucket} is newer than the stop (newest: none)."
    last_epoch="$(date -u -d "$HS_NEWEST_BACKUP" +%s 2>/dev/null)" \
      || refuse_before_replace "the newest backup object in ${bucket} reports a time that cannot be read ('${HS_NEWEST_BACKUP}')."
    (( last_epoch >= quiesce_from )) \
      || refuse_before_replace "no backup object in ${bucket} is newer than the stop (newest: ${HS_NEWEST_BACKUP})."
    proved "footbag.service stopped; the last backup, ${HS_NEWEST_BACKUP}, is in ${bucket}"
  fi

  if (( ! reused )); then
    say "Snapshotting ${INSTANCE} as ${snap}"
    host_snapshot_create "$BH_AWS_BIN" "$INSTANCE" "$snap" || refuse_before_replace "${HS_ERROR}."
  fi
  # Polled until complete, failed, or too old for the apply wrapper to accept,
  # whichever comes first, so the wait and the wrapper's limit cannot disagree.
  host_snapshot_wait "$BH_AWS_BIN" "$snap" "$SNAP_USABLE_SECS" "$POLL_SECS" || refuse_before_replace "${HS_ERROR}."
  proved "Lightsail reports ${snap} complete, $(( HS_AGE / 60 )) minutes old"

  say "Replacing ${INSTANCE} through the apply wrapper"
  bash "${BH_SCRIPTS}/terraform-apply.sh" --target "$TARGET" \
    --replace aws_lightsail_instance.web --instance-snapshot "$snap" </dev/null || {
    cr_error "the replacement apply did not complete. The snapshot ${snap} is kept."
    if (( stopped )); then
      echo "       footbag.service on ${ALIAS} is still stopped, deliberately: what the apply" >&2
      echo "       changed is not known from here. Read the plan's output above, then either" >&2
      echo "       re-run this or start the service on the old host if it still stands." >&2
    fi
    exit 1
  }
  proved "the apply wrapper replaced ${INSTANCE} from ${snap}"
  echo ""
  echo "Replaced. The new instance is empty; bootstrap it next:"
  echo "  < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}"
  cr_unproved "the new instance: it is empty until this script bootstraps it"
  cr_finish
fi

# ── The bootstrap ────────────────────────────────────────────────────────────

# Refused before anything changes: the confirmations below are typed, and each
# minted key is shown once on a terminal.
terminal_present \
  || cr_die "the bootstrap asks for typed confirmations and shows each minted key once, so it needs a terminal. Nothing was changed."
require_operator_stdin "scripts/bootstrap-host.sh --target ${TARGET}" "$ALIAS" "$TARGET" \
  || cr_die "no host sudo password on stdin. Nothing was changed."

# Every pin the run installs from, refused before anything changes.
tool_pins_ok COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256 CWAGENT_VERSION CWAGENT_URL CWAGENT_SHA256 \
  DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE SQLITE_VERSION \
  || cr_die "the tool-version list is not ready to install from. Nothing was changed."
bh_manifest_pins
pin_assignments() {
  local k
  for k in DOCKER_PACKAGE DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE SQLITE_VERSION RSYNC_PACKAGE AWSCLI_PACKAGE \
           COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256; do
    tool_pin "$k" || return 1
    printf '%s=%q\n' "$k" "$TOOL_PIN_VALUE"
  done
}
PIN_ASSIGNMENTS="$(pin_assignments)" || cr_die "a host pin could not be read from the tool-version list. Nothing was changed."

# The pinned sqlite3 the host installs, built here and shipped over the install
# pipe, so the host needs no compiler. Built only when the packages step runs,
# because the build takes a container and a minute. Its directory is made here,
# in this shell, and registered for cleanup before the build runs in the
# subshell that reads its output, so the cleanup knows it whatever the build
# does. Test seam: a run with BOOTSTRAP_HOST_SQLITE3_BIN set ships that file
# instead, and says so.
SQLITE3_WORK=""
SQLITE_LINE=""
sqlite3_assignment() {
  local bin="${BOOTSTRAP_HOST_SQLITE3_BIN:-}"
  if [[ -n "$bin" ]]; then
    echo "SYNTHETIC: BOOTSTRAP_HOST_SQLITE3_BIN is set; the shipped sqlite3 is a stand-in." >&2
  else
    bin="${SQLITE3_WORK}/sqlite3"
    bash "${BH_SCRIPTS}/build-sqlite3.sh" --output "$bin" </dev/null >&2 || return 1
  fi
  printf 'SQLITE3_B64=%s\n' "$(base64 -w0 < "$bin")"
}

PROVISION_HALF="${SCRIPT_DIR}/internal/bootstrap-host-provision-remote.sh"
DNF_PARSER="${SCRIPT_DIR}/internal/dnf-check-update-remote.sh"
ACCOUNT_HALF="${SCRIPT_DIR}/internal/bootstrap-host-account-remote.sh"
REBOOT_HALF="${SCRIPT_DIR}/internal/bootstrap-host-reboot-remote.sh"

provision_send() {
  local mode="$1"
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' "$mode"
    printf 'APP_UID=%q\n' "$BH_APP_UID"
    if [[ "$mode" == "packages" || "$mode" == "preview" ]]; then printf '%s\n' "$PIN_ASSIGNMENTS"; fi
    if [[ "$mode" == "packages" ]]; then printf '%s\n' "$SQLITE_LINE"; fi
    cat "$REMOTE_REPORT_LIB"
    cat "$DNF_PARSER"
    cat "$PROVISION_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-bootstrap-provision'
}

provision() {
  local mode="$1"
  require_host_ssh_opts || cr_die "the pinned host key for ${ALIAS} is not installed"
  SQLITE_LINE=""
  if [[ "$mode" == "packages" ]]; then
    if [[ -z "${BOOTSTRAP_HOST_SQLITE3_BIN:-}" && -z "$SQLITE3_WORK" ]]; then
      SQLITE3_WORK="$(mktemp -d)"
      cr_cleanup rm -rf "$SQLITE3_WORK"
    fi
    SQLITE_LINE="$(sqlite3_assignment)" || cr_die "the pinned sqlite3 could not be built; nothing was sent to the host."
  fi
  cr_run_marked "provision ${mode}" -- provision_send "$mode"
}

# A host step that changes something is preceded by this. Before the record
# exists the pinned key is the identity proof; after, the host is asked.
confirm_identity() {
  if host_answers_as_other_env; then
    cr_error "${ALIAS} records FOOTBAG_ENV=${P[FOOTBAG_ENV]}, but this run is --target ${TARGET}."
    echo "       Nothing more was changed. Check the HostName for ${ALIAS} in ~/.ssh/config." >&2
    exit 1
  fi
  if [[ "${P[FOOTBAG_ENV]:-}" == "$TARGET" ]]; then
    require_host_is "$ALIAS" "$TARGET" || cr_die "${ALIAS} did not confirm it is the ${TARGET} host."
  fi
}

# Stepping the Amazon Linux release upgrades every package on the host, and on
# a host whose containers are running that happens under the serving site. So
# there, and only there, the packages it would change are counted in a
# separate read first and the operator confirms that count with a typed APPLY.
# A fresh host has nothing running and is stepped without asking, so a first
# bootstrap still runs through.
confirm_release_step() {
  local pin="${P[PIN_AMAZON_LINUX_RELEASE]:-}" count
  [[ -n "$pin" && "${P[AL_RELEASE]:-}" != "$pin" ]] || return 0
  [[ "${P[CONTAINERS]:-}" == *" Up "* ]] || return 0
  say "Counting what stepping ${ALIAS} to Amazon Linux ${pin} would change"
  capture_send "release preview" provision_send preview \
    || cr_die "could not count the packages stepping ${ALIAS} to Amazon Linux ${pin} would change; nothing was upgraded."
  count="$(grep -A1 -e '^---FOOTBAG-UPGRADE-COUNT---$' <<< "$SEND_OUT" | tail -1)"
  [[ "$count" =~ ^[0-9]+$ ]] \
    || cr_die "${ALIAS} reported no package count for Amazon Linux ${pin}; nothing was upgraded."
  if (( count == 0 )); then
    echo "    no package would change; nothing to confirm"
    return 0
  fi
  echo ""
  echo "${ALIAS} is serving: its containers are running. Stepping it from Amazon Linux"
  echo "${P[AL_RELEASE]:-an unknown release} to the pinned ${pin} upgrades the ${count} package(s) listed above"
  echo "under the running site, and an upgrade of docker's own package may restart the"
  echo "engine and the containers with it. A new kernel or core library takes effect"
  echo "only after a reboot, which this run offers at its end."
  confirm_from_tty "Type 'APPLY' to upgrade ${count} package(s) on ${ALIAS} to Amazon Linux ${pin}: " "APPLY" \
    || cr_die "not confirmed; nothing on ${ALIAS} was upgraded. Re-run this script to step it."
}

# Run a host step through the provision half unless it is already done, then
# require it done.
host_step() {
  local step="$1" mode="$2" title
  refresh_host
  bh_verdict "$step"; title="$BH_TITLE"
  if [[ "$BH_STATE" == "DONE" ]]; then
    proved "${title}: ${BH_DETAIL}"
    return 0
  fi
  say "$title"
  confirm_identity
  if [[ "$step" == "packages" ]]; then confirm_release_step; fi
  provision "$mode" || cr_die "${title} did not complete on ${ALIAS}."
  refresh_host
  bh_verdict "$step"
  [[ "$BH_STATE" == "DONE" ]] || cr_die "${title} still reads ${BH_STATE}: ${BH_DETAIL}"
  proved "${title}: ${BH_DETAIL}"
}

# The keys this run deactivated. None of them is deleted by this run: a key is
# deleted only once a later run has seen it inactive, so whatever still held it
# has had the time between to fail visibly while it could still be switched back.
RETIRED_THIS_RUN=""

# retire_dead_keys <installer> <keys> <inactive> <host-key> [installer args...]
# Every key on the user that the host does not hold: an active one is retired
# with the installer's own --retire, which makes the host prove itself first and
# refuses the host's own key; one already inactive when it was read, and not by
# this run's doing, is deleted. Each asks for its own APPLY. Nothing is touched
# while the host's own key id reads empty, because then every key looks unused.
retire_dead_keys() {
  local installer="$1" keys="$2" inactive="$3" host_key="$4" k
  shift 4
  local args=("$@")
  if [[ -z "$host_key" ]]; then
    cr_error "the host's own key id reads empty, so the key it uses cannot be told apart from the ones it does not. Nothing was retired."
    return 1
  fi
  for k in $(bh_extra_keys "$keys" "$host_key"); do
    if bh_has_word "$RETIRED_THIS_RUN" "$k"; then
      echo "    ${k} was retired by this run; a later run deletes it once it reads inactive"
    elif bh_has_word "$inactive" "$k"; then
      say "Deleting ${k}: inactive since an earlier run, and the host does not use it"
      bash "${BH_SCRIPTS}/${installer}" ${args[@]+"${args[@]}"} --delete "$k" </dev/null || return 1
    else
      say "Retiring ${k}, which the host does not use"
      with_pass "${BH_SCRIPTS}/${installer}" ${args[@]+"${args[@]}"} --retire "$k" || return 1
      RETIRED_THIS_RUN+=" ${k}"
      echo "    ${k} is inactive now; re-run this script later and it is deleted then"
    fi
  done
  return 0
}

# free_key_slot <installer> <keys> <inactive> <host-key> [installer args...]
# A user holding the two keys IAM allows while the host holds neither can never
# be rotated: the rotation would mint a third. Neither key is in service here,
# so one is retired without the host's proof, which the installer allows in
# exactly this case, and deleted on a later run once it reads inactive; one
# already inactive from an earlier run is deleted now. Returns 0 when a slot is
# free for the rotation, 2 when this run retired a key and the slot frees on the
# next run.
free_key_slot() {
  local installer="$1" keys="$2" inactive="$3" host_key="$4" k
  shift 4
  local args=("$@") held
  # shellcheck disable=SC2086  # one key id per word
  held=$(printf '%s\n' $keys | grep -c . || true)
  if (( held < 2 )) || { [[ -n "$host_key" ]] && bh_has_word "$keys" "$host_key"; }; then
    return 0
  fi
  k="$(bh_keys_in "$keys" "$inactive")"
  k="${k%% *}"
  if [[ -n "$k" ]]; then
    say "Deleting ${k} to free a key for this host: inactive since an earlier run, and the host holds neither key"
    bash "${BH_SCRIPTS}/${installer}" ${args[@]+"${args[@]}"} --delete "$k" </dev/null || return 1
    return 0
  fi
  k="${keys%% *}"
  say "Retiring ${k} to free a key for this host: the user holds two and the host holds neither"
  with_pass "${BH_SCRIPTS}/${installer}" ${args[@]+"${args[@]}"} --retire "$k" || return 1
  RETIRED_THIS_RUN+=" ${k}"
  return 2
}

# 1. Terraform.
say "Terraform: shared, identity, then ${TARGET}"
bash "${BH_SCRIPTS}/terraform-apply-all.sh" --target "$TARGET" </dev/null \
  || cr_die "the Terraform step did not complete; nothing on the host was changed."

# Read only now: before the apply a brand-new environment's tree records no
# instance at all.
tf_instance_name "$TARGET" || cr_die "could not read the ${TARGET} web instance from Terraform."
INSTANCE="$TF_INSTANCE_NAME"
P[INSTANCE]="$INSTANCE"
proved "the ${TARGET} web instance is ${INSTANCE}"

# The address the site is served at, which the deploy writes onto the host and
# smoke-checks against. Terraform publishes it once CloudFront is enabled, which
# a brand-new environment's first pass does not do, and without it the deploy
# fails far into its run. A name get-parameters cannot find comes back under
# InvalidParameters rather than as a failed call, so absence and an unreadable
# store stay apart.
BASE_URL_PARAM="/footbag/${TARGET}/app/public_base_url"
missing_param="$("$BH_AWS_BIN" ssm get-parameters --names "$BASE_URL_PARAM" --region us-east-1 \
    --query 'InvalidParameters' --output text </dev/null 2>"${BH_WORK}/aws.err")" \
  || cr_die "could not read ${BASE_URL_PARAM} from Parameter Store ($(tail -n 1 "${BH_WORK}/aws.err")). Nothing on the host was changed."
if grep -qF -- "$BASE_URL_PARAM" <<< "$missing_param"; then
  echo "" >&2
  echo "STOPPED: ${TARGET} publishes no ${BASE_URL_PARAM} yet, because CloudFront is not" >&2
  echo "         enabled in its values file, and the deploy cannot run without the address" >&2
  echo "         the site is served at. Next:" >&2
  echo "           1. bash scripts/enable-cloudfront.sh --target ${TARGET}" >&2
  echo "              which sets both values-file lines, applies, and proves the address" >&2
  echo "           2. re-run: < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}" >&2
  echo "         Nothing on the host was changed." >&2
  cr_die "stopped: ${TARGET} publishes no ${BASE_URL_PARAM} until CloudFront is enabled; the next steps are above"
fi
proved "Terraform publishes ${BASE_URL_PARAM}"

# 2. The alias points where Terraform says, and the host key is pinned.
say "Pinned host key"
tf_output_read "terraform/${TARGET}" lightsail_static_ip || {
  cr_error "could not read the ${TARGET} host address from Terraform."
  tf_output_explain "terraform/${TARGET}" lightsail_static_ip
  exit 1
}
TF_IP="$TF_OUTPUT_VALUE"
ALIAS_HOST="$(ssh -G "$ALIAS" 2>/dev/null | grep '^hostname ' | tail -1 | cut -d' ' -f2 || true)"
if [[ "$ALIAS_HOST" != "$TF_IP" ]]; then
  cr_error "${ALIAS} in ~/.ssh/config names '${ALIAS_HOST}', but Terraform reports ${TF_IP}."
  echo "       Set its HostName to ${TF_IP}, then re-run. Nothing on the host was changed." >&2
  exit 1
fi
bash "${BH_SCRIPTS}/install-known-hosts.sh" --target "$TARGET" </dev/null \
  || cr_die "the host key for ${ALIAS} could not be pinned; nothing on the host was changed."

# 3. The shared account and the second port, through ec2-user the first time.
refresh_host
bh_verdict account
if [[ "$BH_STATE" == "DONE" ]]; then
  proved "shared account: ${BH_DETAIL}"
elif [[ "${P[HOST_PROBE]:-}" == "sudo-refused" ]]; then
  # footbag logs in, so the account exists and people use it. Whatever is wrong
  # with the password, the first-login path is not the repair: it would set the
  # account's password to whatever line 1 of this run's file holds.
  cr_error "${BH_DETAIL}."
  echo "       Next: ${BH_NEXT}." >&2
  echo "       Nothing on the host was changed." >&2
  exit 1
else
  say "First login as ec2-user"
  echo "    footbag did not answer: ${P[HOST_PROBE]:-unknown}${P[HOST_PROBE_SAID]:+ (${P[HOST_PROBE_SAID]})}"
  require_host_ssh_opts || cr_die "the pinned host key for ${ALIAS} is not installed"
  # Port 22 is the only one a fresh instance listens on. 2222 is tried second,
  # for an operator whose network drops 22 and who has added 2222 from the
  # browser console; both are covered by the pin.
  first_login() {
    {
      printf 'FOOTBAG_PASSWORD=%q\n' "$SUDO_PASS"
      cat "$REMOTE_REPORT_LIB"
      cat "$ACCOUNT_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" -p "$1" -l ec2-user "$ALIAS" 'sudo -n bash -s footbag-bootstrap-account'
  }
  if ! capture_send "first login (port 22)" first_login 22; then
    said_22="$(grep -v -e '^[[:space:]]*$' -e "^${CRR_SENTINEL}" <<< "$SEND_OUT" | tail -1 || true)"
    if capture_send "first login (port 2222)" first_login 2222; then
      cr_warn "the first login on port 22 did not complete (${said_22:-no reason given}); it went through on 2222, so this network may drop port 22"
    else
      # The one step left to the operator, and why it cannot be a script step:
      # at this point nothing in the estate answers. footbag has no account
      # yet, ec2-user answers on neither port, and Lightsail offers no other
      # way to run a command on the instance from here (no agent, no user_data
      # on an instance already running). The browser console reaches it from
      # inside AWS, and the one line it needs is stated in full.
      cr_error "the first login as ec2-user on port 22 did not complete (${said_22:-no reason given}), and neither did port 2222."
      echo "       If port 22 timed out, your network may drop it. Open the Lightsail" >&2
      echo "       browser console (Lightsail, the instance, Connect), which reaches the" >&2
      echo "       host from inside AWS, and add the second port there:" >&2
      echo "         printf 'Port 22\\nPort 2222\\n' | sudo tee /etc/ssh/sshd_config.d/05-footbag-ports.conf >/dev/null && sudo systemctl reload sshd" >&2
      echo "       then re-run; the first login goes through on 2222 after that." >&2
      exit 1
    fi
  fi
  refresh_host
  bh_verdict account
  [[ "$BH_STATE" == "DONE" ]] \
    || cr_die "footbag still does not log in on ${ALIAS} with sudo taking its password: ${BH_DETAIL}"
  proved "shared account: ${BH_DETAIL}"
fi
confirm_identity

# 4-5. Tools and layout.
host_step packages packages
host_step layout layout

# 6. The environment record.
# Judged on the record itself: the rest of the file is the deploy's to fill, and
# the closing report holds all of it against the verifier.
refresh_host
if [[ "${P[FOOTBAG_ENV]:-}" == "$TARGET" ]]; then
  proved "the host records FOOTBAG_ENV=${TARGET}"
else
  confirm_identity
  say "The host's environment record"
  with_pass "${BH_SCRIPTS}/set-host-env.sh" --target "$TARGET" \
    || cr_die "the host's environment record was not written."
fi
require_host_is "$ALIAS" "$TARGET" || cr_die "${ALIAS} did not confirm it is the ${TARGET} host."

# 7. The database directory.
host_step dbdir dbdir

# 8. The host credential chain.
refresh_host; refresh_aws
bh_verdict credentials
if [[ "${P[CRED_CHAIN]:-}" != "ok" ]]; then
  [[ "${P[IAM_SRC_KEYS]-unknown}" != "unknown" && "${P[IAM_SRC_INACTIVE]-unknown}" != "unknown" ]] \
    || cr_die "could not read the source-profile user's keys."
  slot=0
  free_key_slot install-host-credentials.sh "${P[IAM_SRC_KEYS]}" "${P[IAM_SRC_INACTIVE]}" "${P[CRED_KEY_ID]:-}" \
    --target "$TARGET" || slot=$?
  case "$slot" in
    0) ;;
    2)
      echo ""
      echo "STOPPED: a key was retired to make room for this host's own, and it is deleted"
      echo "only once a later run has seen it inactive. Re-run this script; it deletes the"
      echo "key and then gives the host its own:"
      echo "  < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}"
      cr_die "stopped: a source-profile key was retired to free a slot; a re-run deletes it and gives the host its own"
      ;;
    *) cr_die "could not free a key for this host." ;;
  esac
  refresh_aws
  say "Host credential chain: a key of its own for this host"
  with_pass "${BH_SCRIPTS}/install-host-credentials.sh" --target "$TARGET" --rotate \
    || cr_die "the host's own key was not installed."
  refresh_host; refresh_aws
  [[ "${P[CRED_CHAIN]:-}" == "ok" ]] || cr_die "the host still does not resolve its runtime role after the install."
fi
proved "the host resolves its runtime role with ${P[CRED_KEY_ID]:-its key}"
[[ "${P[IAM_SRC_KEYS]-unknown}" != "unknown" && "${P[IAM_SRC_INACTIVE]-unknown}" != "unknown" ]] \
  || cr_die "could not read the source-profile user's keys."
retire_dead_keys install-host-credentials.sh "${P[IAM_SRC_KEYS]}" "${P[IAM_SRC_INACTIVE]}" "${P[CRED_KEY_ID]:-}" \
  --target "$TARGET" || cr_die "the dead host's key was not retired."
refresh_aws

# 9. The CloudWatch agent. Its metrics take minutes to arrive after an install,
# so a retirement that cannot be proved yet is reported pending and the run goes
# on: the predecessor key stays active, which is the safe side.
refresh_host; refresh_aws
want_cw="${P[PIN_CWAGENT_VERSION]:-}"
CW_INSTALLER="install-cwagent-${TARGET}.sh"
if [[ "${P[CWAGENT_ACTIVE]:-}" != "active" || "${P[CWAGENT_ENABLED]:-}" != "enabled" \
      || "${P[CWAGENT_VERSION]:-}" != "$want_cw" ]]; then
  if bh_cwagent_key_in_service; then
    # The host already publishes with one of the publisher's keys. A version
    # bump or a stopped agent is a package and service change, and minting a key
    # for it would leave a rotation half-done for nothing.
    say "CloudWatch agent ${want_cw}: upgraded in place, keeping ${P[CWAGENT_KEY_ID]}"
    with_pass "${BH_SCRIPTS}/${CW_INSTALLER}" --upgrade || cr_die "the CloudWatch agent upgrade did not complete."
  else
    [[ "${P[IAM_CW_KEYS]-unknown}" != "unknown" && "${P[IAM_CW_INACTIVE]-unknown}" != "unknown" ]] \
      || cr_die "could not read the publisher's keys."
    slot=0
    free_key_slot "$CW_INSTALLER" "${P[IAM_CW_KEYS]}" "${P[IAM_CW_INACTIVE]}" "${P[CWAGENT_KEY_ID]:-}" || slot=$?
    case "$slot" in
      0) ;;
      2)
        echo ""
        echo "STOPPED: a publisher key was retired to make room for this host's own, and it is"
        echo "deleted only once a later run has seen it inactive. Re-run this script:"
        echo "  < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}"
        cr_die "stopped: a publisher key was retired to free a slot; a re-run deletes it and gives the host its own"
        ;;
      *) cr_die "could not free a publisher key for this host." ;;
    esac
    say "CloudWatch agent ${want_cw}: a key of its own for this host"
    with_pass "${BH_SCRIPTS}/${CW_INSTALLER}" --rotate || cr_die "the CloudWatch agent's own key was not installed."
  fi
  refresh_host; refresh_aws
fi
bh_verdict cwagent
if [[ "$BH_STATE" == "FAILED" ]]; then
  # A stopped agent is not "metrics not arriving yet": a re-run would only
  # restart it into the same failure, so the cause and its remedy are stated.
  echo "    FAILED: ${BH_DETAIL}"
  echo "    next: ${BH_NEXT}"
elif [[ "${P[CW_METRICS]:-}" == "ok" && "${P[IAM_CW_KEYS]-unknown}" != "unknown" && "${P[IAM_CW_INACTIVE]-unknown}" != "unknown" ]]; then
  retire_dead_keys "$CW_INSTALLER" "${P[IAM_CW_KEYS]}" "${P[IAM_CW_INACTIVE]}" "${P[CWAGENT_KEY_ID]:-}" \
    || cr_die "the publisher's dead key was not retired."
  refresh_aws
else
  echo "    pending: the agent's metrics are not arriving yet, so its predecessor key is"
  echo "    kept. Re-run this script in a few minutes to retire it."
fi

# The deploy boots the site, and the site refuses to boot on a secret that still
# holds the value Terraform seeded, so each such secret is read before the deploy
# starts and the run stops, naming the command that stores it, while any is
# unset. Each read is the provision script's own read-only status, so what
# counts as set is decided in one place.
require_boot_secrets() {
  local out missing=0
  out="$(FOOTBAG_CR_REPORT_TO="$BH_PROBE_REPORT" bash "${BH_SCRIPTS}/provision-ssm-secret.sh" \
    --target "$TARGET" --secret session_secret status </dev/null 2>&1)" || true
  if ! grep -qE '^  value: +set \(' <<<"$out"; then
    cr_error "the session secret for ${TARGET} is not stored, and the site refuses to boot without it."
    echo "       Store it, then re-run this script:" >&2
    echo "         bash scripts/provision-ssm-secret.sh --target ${TARGET} --secret session_secret store" >&2
    missing=1
  fi
  if [[ "$TARGET" == "production" ]] \
     && ! FOOTBAG_CR_REPORT_TO="$BH_PROBE_REPORT" bash "${BH_SCRIPTS}/provision-turnstile-key.sh" \
          --target production status </dev/null >/dev/null 2>&1; then
    cr_error "the Turnstile secret for production is not stored, and production refuses to boot on the placeholder."
    echo "       Store it, then re-run this script:" >&2
    echo "         bash scripts/provision-turnstile-key.sh --target production store" >&2
    missing=1
  fi
  (( missing == 0 )) || exit 1
}

# 10. The first deploy, or on a live production the restore and a code deploy.
refresh_host
if verdict_is_done deploy; then
  proved "deployed runtime: ${BH_DETAIL}"
else
  require_boot_secrets
  confirm_identity
  if [[ "$TARGET" == "staging" ]]; then
    say "First deploy: a rebuild from the committed data"
    bash "$BH_DEPLOY" --target staging --from-csv </dev/tty || cr_die "the first deploy did not complete."
  else
    case "${P[MARKER]:-unknown}" in
      false)
        say "First deploy: the full rebuild production takes before go-live"
        bash "$BH_DEPLOY" --target production --all-data -W </dev/tty || cr_die "the first deploy did not complete."
        ;;
      true)
        say "Production is live: the database comes back from its backup, never a rebuild"
        # In this order and no other. The restore's erasure replay runs in a
        # container of the release, so the release, its images and the unit must
        # be on the host first; and the site must not serve before the replay has
        # run, so nothing before the restore may start it. A code deploy run
        # first would start the stack on an empty database, which fails its
        # readiness check and leaves a database the restore then refuses to
        # treat as empty.
        if [[ "${P[DB_FILE]:-}" == "absent" ]]; then
          echo "    ${ALIAS} has no database: install the release without starting it, then restore"
          echo ""
          echo "This promotes the working tree onto ${ALIAS}, loads its images and installs"
          echo "footbag.service without starting or enabling it. The site stays down until the"
          echo "restore that follows has re-applied the erasures its snapshot records."
          confirm_from_tty "Type 'APPLY' to install the release on ${ALIAS} without starting it: " "APPLY" \
            || cr_die "not confirmed. Nothing was deployed."
          with_pass "$BH_DEPLOY_CODE" --first-install --target production \
            || cr_die "the release was not installed on ${ALIAS}."
          with_pass "${BH_SCRIPTS}/restore-db.sh" --target production --onto-empty \
            || cr_die "the database was not restored onto ${ALIAS}."
          refresh_host
          [[ "${P[DB_FILE]:-}" == "present" && "${P[REPLAY_PENDING]:-}" == "no" ]] \
            || cr_die "after the restore ${ALIAS} reports database ${P[DB_FILE]:-unknown}, erasure replay pending ${P[REPLAY_PENDING]:-unknown}."
          proved "the database is restored and its erasures re-applied"
        elif [[ "${P[REPLAY_PENDING]:-}" == "yes" ]]; then
          cr_error "a restore's erasure replay is pending on ${ALIAS}, which holds the site down until it completes."
          echo "       Finish it, then re-run this script:" >&2
          echo "         < ${BH_CRED} bash scripts/restore-db.sh --target production --resume-erasure-replay" >&2
          exit 1
        fi
        bash "$BH_DEPLOY" --target production </dev/tty || cr_die "the production code deploy did not complete."
        ;;
      *)
        cr_die "could not read the production-live marker, which decides between the rebuild deploy and a restore. Nothing was deployed."
        ;;
    esac
  fi
  refresh_host
  bh_verdict deploy
  [[ "$BH_STATE" == "DONE" ]] || cr_die "after the deploy: ${BH_DETAIL}"
  proved "deployed runtime: ${BH_DETAIL}"
fi

# 11. The backup timer.
refresh_host; refresh_aws
if verdict_is_done backup; then
  proved "backup timer: ${BH_DETAIL}"
else
  say "Backup timer"
  with_pass "${BH_SCRIPTS}/install-backup-timer.sh" --target "$TARGET" || cr_die "the backup timer was not installed."
  # The install runs the first backup itself, so the object it wrote is in the
  # bucket by now; the step is done on that object, not on the install's word.
  refresh_host; refresh_aws
  bh_verdict backup
  [[ "$BH_STATE" == "DONE" ]] || cr_die "backup timer still reads ${BH_STATE}: ${BH_DETAIL}"
  proved "backup timer: ${BH_DETAIL}"
fi

# 12. The notification feeds, only where the values file turns them on.
bh_probe_terraform "$TARGET"
P[FEEDS_FLAG]="$(bh_tfvars_flag "$TARGET" enable_feed_queues)"
bh_verdict feeds
case "$BH_STATE" in
  DONE|N-A) proved "notification feeds: ${BH_DETAIL}" ;;
  *)
    say "Notification feeds"
    with_pass "${BH_SCRIPTS}/activate-notification-feeds.sh" --target "$TARGET" --state on \
      || cr_die "the notification feeds were not activated."
    # Its own deploy is what writes the queue addresses onto the host, so the
    # step is done once the host holds them and Terraform subscribes the queue.
    refresh_host
    bh_probe_terraform "$TARGET"
    bh_verdict feeds
    [[ "$BH_STATE" == "DONE" ]] || cr_die "notification feeds still read ${BH_STATE}: ${BH_DETAIL}"
    proved "notification feeds: ${BH_DETAIL}"
    ;;
esac

# 13. sshd posture.
refresh_host
bh_verdict sshd
if [[ "$BH_STATE" == "DONE" ]]; then
  proved "sshd posture: ${BH_DETAIL}"
else
  if [[ "${P[SSHD_REVERT_PENDING]:-no}" != "yes" ]]; then
    say "sshd posture"
    with_pass "${BH_SCRIPTS}/harden-sshd.sh" --target "$TARGET" --apply || cr_die "the sshd hardening did not complete."
    refresh_host
  fi
  if [[ "${P[SSHD_REVERT_PENDING]:-no}" == "yes" ]]; then
    say "Confirming the sshd change"
    with_pass "${BH_SCRIPTS}/harden-sshd.sh" --target "$TARGET" --confirm || cr_die "the sshd change was not confirmed."
    refresh_host
  fi
  bh_verdict sshd
  [[ "$BH_STATE" == "DONE" ]] || cr_die "sshd posture still reads: ${BH_DETAIL}"
  proved "sshd posture: ${BH_DETAIL}"
fi

# 14. The administrators' keys: named, never invented.
bh_verdict operatorkeys
say "Administrator keys"
echo "    ${BH_DETAIL}."
echo "    Add each administrator's key with:"
echo "      ${BH_NEXT}"
cr_unproved "which administrators need a key on ${ALIAS}: no record lists them"

# 15. One reboot, when the host needs one: for the packages installed since it
# booted, on either environment, or on staging so compressed in-RAM swap is
# gone. Either reason alone is enough, and one reboot serves both.
refresh_host
bh_verdict swap
swap_state="$BH_STATE"
swap_detail="$BH_DETAIL"
reboot_why=""
if [[ "$swap_state" != "DONE" && "$TARGET" == "staging" && "${P[ZRAM_ACTIVE]:-}" == "yes" && "${P[ZRAM_SUPPRESSED]:-}" == "yes" ]]; then
  reboot_why="so the compressed-swap suppression takes effect"
fi
case "${P[REBOOT_NEEDED]:-}" in
  yes) reboot_why="${reboot_why:+${reboot_why}, and }because dnf needs-restarting -r reports a kernel or core library installed since boot" ;;
  no) ;;
  *) cr_error "could not read whether ${ALIAS} needs a reboot, so it was not rebooted for its packages: ${P[REBOOT_NEEDED_SAID]:-the status probe reported nothing}" ;;
esac
if [[ "$swap_state" == "DONE" ]]; then
  proved "swap: ${swap_detail}"
fi
if [[ -n "$reboot_why" ]]; then
  say "Rebooting ${ALIAS} once, ${reboot_why}"
  # Its own confirmation: a reboot takes the site down for its length, and no
  # earlier answer in this run was about that.
  echo "This reboots ${ALIAS}. The site is down until the host is back and every"
  echo "container reports healthy again, usually a minute or two."
  confirm_from_tty "Type 'APPLY' to reboot ${ALIAS}: " "APPLY" \
    || cr_die "not confirmed; ${ALIAS} was not rebooted. Re-run this script to reboot it."
  require_host_ssh_opts || cr_die "the pinned host key for ${ALIAS} is not installed"
  host_reboot_and_wait "$ALIAS" "$REBOOT_HALF" "$POLL_SECS" 60 || cr_die "${HR_ERROR}"
  proved "${ALIAS} rebooted (boot id ${HR_BOOT_ID})"
  # The service starts at boot; wait for every container to report healthy.
  for (( i = 1; i <= 40; i++ )); do
    refresh_host
    verdict_is_done deploy && break
    sleep "$POLL_SECS"
  done
  verdict_is_done deploy || cr_die "after the reboot: ${BH_DETAIL}"
  proved "deployed runtime after the reboot: ${BH_DETAIL}"
  case "${P[REBOOT_NEEDED]:-}" in
    no) proved "${ALIAS} needs no further reboot for its packages" ;;
    yes) cr_error "${ALIAS} still reports a reboot needed after rebooting: the kernel or core library it was for is not the running one" ;;
    *) cr_error "could not read whether ${ALIAS} needs a reboot after rebooting: ${P[REBOOT_NEEDED_SAID]:-the status probe reported nothing}" ;;
  esac
fi

# The record of where the host stands, from a fresh read of every step.
bh_probe_pin "$TARGET"
refresh_host; refresh_aws
bh_probe_host_env "$TARGET"
render_all
bh_milestones "$TARGET"
echo ""
if (( RENDER_PENDING > 0 )); then
  echo "${RENDER_PENDING} step(s) still pending or failed; each names its command above. A re-run"
  echo "proves what is done and finishes what is pending; a failed step needs its named command."
  cr_die "${RENDER_PENDING} step(s) still pending or failed on ${ALIAS}"
fi
echo "The host is bootstrapped."
cr_proved "every bootstrap step reads done on ${ALIAS}"
cr_unproved "the milestone-gated steps named above: each waits on its milestone"
cr_finish
