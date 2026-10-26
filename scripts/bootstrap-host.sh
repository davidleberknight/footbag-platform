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
#    4  host tools from the pinned manifest, ops/host-tools.env: docker from the
#       distribution unless an engine is already installed, the Compose plugin
#       checked against its SHA-256, sqlite, rsync, the AWS CLI where the image
#       has none.
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
#   15  one reboot on staging, behind its own typed APPLY, so the deploy's
#       suppression of compressed in-RAM swap takes effect; production keeps
#       it, so it needs none.
#   Then it names the milestone-gated steps (payments activation, first admin,
#   the cutover login alarm) and stops before them.
#
# The administrators' keys are not added here because nothing records them: the
# private operations checkout holds the one key Terraform injects, and who else
# holds host access is read live from the host. The step is named with its
# command rather than skipped in silence.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default.
#   - Any identity but the directly authenticated footbag-operator user: the
#     run mints and retires keys and applies the identity tree.
#   - A run with no terminal, before anything changes: it asks for typed
#     confirmations and shows each minted key once.
#   - A host-tools manifest still holding a placeholder pin, before anything
#     changes.
#   - An alias whose HostName is not the address Terraform reports.
#   - A host recording the other environment, at any step.
#   - On production, a deploy step while the go-live marker cannot be read.
#
# --status reads every step's outcome and prints each as DONE, PENDING (with the
# command that finishes it), UNKNOWN, N-A or INFO. It changes nothing and exits
# non-zero while any step is pending or unread, the snapshot excepted, which
# appears on its own a day after an instance is created.
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
# directory the sibling scripts are run from), BOOTSTRAP_HOST_TFVARS,
# FOOTBAG_HOST_TOOLS_MANIFEST, and BOOTSTRAP_HOST_POLL_SECS (the pause between
# polls of a snapshot or a reboot).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"
# shellcheck source=internal/bootstrap-host-tools.sh
source "${SCRIPT_DIR}/internal/bootstrap-host-tools.sh"
# shellcheck source=internal/bootstrap-host-steps.sh
source "${SCRIPT_DIR}/internal/bootstrap-host-steps.sh"

TARGET=""
MODE="apply"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --status) [[ "$MODE" == "apply" ]] || { echo "ERROR: --status and --replace-instance are separate runs." >&2; exit 2; }
              MODE="status"; shift ;;
    --replace-instance) [[ "$MODE" == "apply" ]] || { echo "ERROR: --status and --replace-instance are separate runs." >&2; exit 2; }
              MODE="replace"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

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

declare -A P=()
BH_CRED="<operator credential file>"
operator_credential_select "$ALIAS" "$TARGET" 2>/dev/null && BH_CRED="$OPERATOR_CREDENTIAL_DISPLAY"

# Every mode reaches AWS. The identity is settled and proved before anything
# else, and held to the directly authenticated operator user: this run applies
# the identity tree, mints access keys and retires them, none of which the job
# role may do, and a run that discovered that partway would leave half a host.
aws_profile_ensure || exit 1
aws_identity_require_direct_user footbag-operator || exit 1

# ── Shared pieces ────────────────────────────────────────────────────────────

say() { printf '\n==> %s\n' "$*"; }
proved() { printf '    proved: %s\n' "$*"; }

# One line of the password into a sibling script's stdin, never the operator's
# whole credential file, and never this run's own stdin, which the sibling would
# otherwise inherit and read further lines from.
with_pass() {
  printf '%s\n' "$SUDO_PASS" | bash "$@"
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
      PENDING|UNKNOWN) [[ "$step" == "snapshot" ]] || pending=$(( pending + 1 )) ;;
    esac
  done
  echo ""
  RENDER_PENDING="$pending"
}

host_answers_as_other_env() {
  [[ "${P[HOST_REACHED]:-}" == "yes" && -n "${P[FOOTBAG_ENV]:-}" && "${P[FOOTBAG_ENV]}" != "$TARGET" ]]
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
  else
    require_operator_stdin "scripts/bootstrap-host.sh --target ${TARGET} --status" "$ALIAS" "$TARGET" || exit 1
    refresh_host
    # The verifier is asked only of a host that says it is this environment:
    # held against another environment's values it would report that host's.
    host_answers_as_other_env || bh_probe_host_env "$TARGET"
  fi
  refresh_aws
  render_all
  if host_answers_as_other_env; then
    echo "WARNING: ${ALIAS} records FOOTBAG_ENV=${P[FOOTBAG_ENV]}. The rows above describe that host, not ${TARGET}'s." >&2
    exit 1
  fi
  if (( RENDER_PENDING > 0 )); then
    echo "${RENDER_PENDING} step(s) pending or unread."
    exit 1
  fi
  echo "Every step is done."
  exit 0
fi

# ── --replace-instance ───────────────────────────────────────────────────────

if [[ "$MODE" == "replace" ]]; then
  terminal_present || {
    echo "ERROR: --replace-instance asks for a typed confirmation and needs a terminal." >&2
    echo "       Nothing was changed." >&2
    exit 1
  }

  say "The instance to replace"
  tf_instance_name "$TARGET" || { echo "       Nothing was changed." >&2; exit 1; }
  INSTANCE="$TF_INSTANCE_NAME"
  inst_row="$("$BH_AWS_BIN" lightsail get-instance --region us-east-1 --instance-name "$INSTANCE" \
      --query 'instance.[state.name,createdAt]' --output text </dev/null 2>/dev/null)" || {
    echo "ERROR: could not read ${INSTANCE} from Lightsail. Nothing was changed." >&2
    exit 1
  }
  IFS=$'\t' read -r inst_state inst_created <<< "$inst_row"
  echo "    ${INSTANCE}: ${inst_state}, created ${inst_created}"
  inst_epoch="$(date -u -d "$inst_created" +%s 2>/dev/null)" || {
    echo "ERROR: ${INSTANCE} reports no readable creation time. Nothing was changed." >&2
    exit 1
  }

  # On production after go-live the instance holds the member database, and the
  # only copy younger than the last backup is on its disk. A snapshot captures
  # it, but a backup in the bucket is what every restore path reads, so one must
  # be there and fresh before the host is taken away.
  LIVE=0
  if [[ "$TARGET" == "production" ]]; then
    marker="$("$BH_AWS_BIN" ssm get-parameter --name /footbag/production/app/production_live \
      --region us-east-1 --query Parameter.Value --output text </dev/null 2>/dev/null || true)"
    case "$marker" in
      false) echo "    production-live marker: false (pre-live); no backup freshness required" ;;
      true)
        LIVE=1
        # One interval plus the timer's own jitter is the oldest a healthy host's
        # newest backup can be.
        bh_backup_limit || {
          echo "ERROR: could not read the backup interval from ops/systemd/footbag-backup.timer. Nothing was changed." >&2
          exit 1
        }
        limit="$BH_BACKUP_LIMIT"
        tf_output_read terraform/production snapshots_bucket_name || {
          echo "ERROR: could not read the snapshots bucket from Terraform. Nothing was changed." >&2
          exit 1
        }
        bucket="$TF_OUTPUT_VALUE"
        bh_newest_backup "$bucket" || {
          echo "ERROR: could not list ${bucket}. Nothing was changed." >&2
          exit 1
        }
        newest="$BH_NEWEST_BACKUP"
        newest_epoch="$(date -u -d "$newest" +%s 2>/dev/null || echo 0)"
        age=$(( $(date -u +%s) - newest_epoch ))
        if [[ -z "$newest" ]] || (( age > limit )); then
          echo "ERROR: production is live and the newest database backup in ${bucket} is" >&2
          echo "       ${newest:-absent}, older than one backup interval (${limit}s)." >&2
          echo "       The database between that backup and now lives only on this host's" >&2
          echo "       disk. Find why the backups stopped before replacing it:" >&2
          echo "         < ${BH_CRED} bash scripts/bringup-status.sh --target production --profile <prod-profile>" >&2
          echo "       Nothing was changed." >&2
          exit 1
        fi
        echo "    newest database backup: ${newest} (${age}s old, within ${limit}s)"
        ;;
      *)
        echo "ERROR: could not read the production-live marker, which decides whether a fresh" >&2
        echo "       backup is required first. Nothing was changed." >&2
        exit 1
        ;;
    esac
  fi

  # A live host is stopped and backed up below, which needs the host and its
  # password, so both are settled before anything is asked or changed.
  if (( LIVE )); then
    require_operator_stdin "scripts/bootstrap-host.sh --target ${TARGET} --replace-instance" "$ALIAS" "$TARGET" || exit 1
    require_host_is "$ALIAS" "$TARGET" || { echo "       Nothing was changed." >&2; exit 1; }
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
  # the prefix the apply wrapper accepts.
  SNAP_REUSE_SECS=3600
  prefix="${INSTANCE}-pre-replace-"
  snap=""
  snap_epoch=0
  reused=0
  existing="$("$BH_AWS_BIN" lightsail get-instance-snapshots --region us-east-1 \
      --query "instanceSnapshots[?fromInstanceName=='${INSTANCE}' && starts_with(name, '${prefix}') && (state=='available' || state=='pending')].[name,createdAt,state]" \
      --output text </dev/null 2>/dev/null || true)"
  while IFS=$'\t' read -r s_name s_created s_state; do
    [[ -n "$s_name" ]] || continue
    s_epoch="$(date -u -d "$s_created" +%s 2>/dev/null || echo 0)"
    if (( s_epoch > inst_epoch && s_epoch > snap_epoch && $(date -u +%s) - s_epoch < SNAP_REUSE_SECS )); then
      snap="$s_name"; snap_epoch="$s_epoch"; snap_found_state="$s_state"
    fi
  done <<< "$existing"
  if [[ -n "$snap" ]]; then
    reused=1
    echo "    reusing ${snap}, a snapshot of this instance from the last hour (${snap_found_state})"
  else
    snap="${prefix}$(date -u +%Y%m%dT%H%M%SZ)"
  fi

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
  confirm_from_tty "Type 'APPLY' to snapshot and replace ${INSTANCE}: " "APPLY" || {
    echo "Not confirmed. Nothing was changed." >&2
    exit 1
  }

  QUIESCE_HALF="${SCRIPT_DIR}/internal/bootstrap-host-quiesce-remote.sh"
  quiesce() {
    {
      printf '%s\n' "$SUDO_PASS"
      printf 'MODE=%q\n' "$1"
      cat "$QUIESCE_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-bootstrap-quiesce'
  }
  # Every refusal from here until the apply starts leaves the instance in place,
  # so a host this run stopped is started again on the way out.
  stopped=0
  refuse_before_replace() {
    echo "ERROR: $1 Nothing was replaced." >&2
    if (( stopped )); then
      if quiesce resume; then
        echo "       footbag.service was started again." >&2
      else
        echo "       footbag.service could NOT be started again: the site is DOWN. Start it" >&2
        echo "       with: < ${BH_CRED} bash scripts/host-diagnostics.sh --target ${TARGET}" >&2
      fi
    fi
    exit 1
  }

  if (( LIVE )); then
    say "Stopping ${ALIAS}'s writes and taking its last backup"
    quiesce_from="$(date -u +%s)"
    stopped=1
    stream="$(quiesce stop)" || refuse_before_replace "stopping the service or its last backup failed on ${ALIAS}."
    grep -qx -- '---FOOTBAG-QUIESCED---' <<< "$stream" \
      || refuse_before_replace "${ALIAS} did not report its last backup complete."
    bh_newest_backup "$bucket" || refuse_before_replace "could not list ${bucket} to find the last backup."
    last_epoch="$(date -u -d "${BH_NEWEST_BACKUP:-}" +%s 2>/dev/null || echo 0)"
    [[ -n "$BH_NEWEST_BACKUP" ]] && (( last_epoch >= quiesce_from )) \
      || refuse_before_replace "no backup object in ${bucket} is newer than the stop (newest: ${BH_NEWEST_BACKUP:-none})."
    proved "footbag.service stopped; the last backup, ${BH_NEWEST_BACKUP}, is in ${bucket}"
  fi

  if (( ! reused )); then
    say "Snapshotting ${INSTANCE} as ${snap}"
    "$BH_AWS_BIN" lightsail create-instance-snapshot --region us-east-1 \
      --instance-name "$INSTANCE" --instance-snapshot-name "$snap" </dev/null >/dev/null \
      || refuse_before_replace "Lightsail refused the snapshot."
  fi
  # Polled until complete, failed, or too old for the apply wrapper to accept,
  # whichever comes first, so the wait and the wrapper's limit cannot disagree.
  snap_state=""
  snap_age=0
  while :; do
    snap_row="$("$BH_AWS_BIN" lightsail get-instance-snapshot --region us-east-1 \
        --instance-snapshot-name "$snap" --query 'instanceSnapshot.[state,createdAt]' --output text </dev/null 2>/dev/null || true)"
    IFS=$'\t' read -r snap_state snap_created <<< "$snap_row"
    created_epoch="$(date -u -d "${snap_created:-}" +%s 2>/dev/null)" && [[ -n "${snap_created:-}" ]] \
      || refuse_before_replace "snapshot ${snap} reports no readable creation time ('${snap_row}')."
    snap_age=$(( $(date -u +%s) - created_epoch ))
    [[ "$snap_state" == "available" || "$snap_state" == "error" ]] && break
    (( snap_age < SNAP_USABLE_SECS )) || break
    sleep "$POLL_SECS"
  done
  if [[ "$snap_state" != "available" ]]; then
    refuse_before_replace "snapshot ${snap} is '${snap_state:-unknown}', not complete, after $(( snap_age / 60 )) minutes. It is left as it is."
  fi
  if (( snap_age >= SNAP_USABLE_SECS )); then
    refuse_before_replace "snapshot ${snap} is $(( snap_age / 60 )) minutes old, too old for the apply wrapper's two-hour limit; a re-run takes a fresh one."
  fi
  proved "Lightsail reports ${snap} complete, $(( snap_age / 60 )) minutes old"

  say "Replacing ${INSTANCE} through the apply wrapper"
  bash "${BH_SCRIPTS}/terraform-apply.sh" --target "$TARGET" \
    --replace aws_lightsail_instance.web --instance-snapshot "$snap" </dev/null || {
    echo "ERROR: the replacement apply did not complete. The snapshot ${snap} is kept." >&2
    if (( stopped )); then
      echo "       footbag.service on ${ALIAS} is still stopped, deliberately: what the apply" >&2
      echo "       changed is not known from here. Read the plan's output above, then either" >&2
      echo "       re-run this or start the service on the old host if it still stands." >&2
    fi
    exit 1
  }
  echo ""
  echo "Replaced. The new instance is empty; bootstrap it next:"
  echo "  < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}"
  exit 0
fi

# ── The bootstrap ────────────────────────────────────────────────────────────

# Refused before anything changes: the confirmations below are typed, and each
# minted key is shown once on a terminal.
terminal_present || {
  echo "ERROR: the bootstrap asks for typed confirmations and shows each minted key once," >&2
  echo "       so it needs a terminal. Nothing was changed." >&2
  exit 1
}
require_operator_stdin "scripts/bootstrap-host.sh --target ${TARGET}" "$ALIAS" "$TARGET" || exit 1

# Every pin the run installs from, refused before anything changes.
host_tool_pinned COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256 CWAGENT_VERSION CWAGENT_URL CWAGENT_SHA256 || exit 1
bh_manifest_pins
pin_assignments() {
  local k
  for k in DOCKER_PACKAGE SQLITE_PACKAGE RSYNC_PACKAGE AWSCLI_PACKAGE COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256; do
    host_tool "$k" || return 1
    printf '%s=%q\n' "$k" "$HOST_TOOL_VALUE"
  done
}
PIN_ASSIGNMENTS="$(pin_assignments)" || exit 1

PROVISION_HALF="${SCRIPT_DIR}/internal/bootstrap-host-provision-remote.sh"
ACCOUNT_HALF="${SCRIPT_DIR}/internal/bootstrap-host-account-remote.sh"
REBOOT_HALF="${SCRIPT_DIR}/internal/bootstrap-host-reboot-remote.sh"

provision() {
  local mode="$1"
  require_host_ssh_opts || return 1
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' "$mode"
    printf 'APP_UID=%q\n' "$BH_APP_UID"
    [[ "$mode" == "packages" ]] && printf '%s\n' "$PIN_ASSIGNMENTS"
    cat "$PROVISION_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-bootstrap-provision'
}

# A host step that changes something is preceded by this. Before the record
# exists the pinned key is the identity proof; after, the host is asked.
confirm_identity() {
  if host_answers_as_other_env; then
    echo "ERROR: ${ALIAS} records FOOTBAG_ENV=${P[FOOTBAG_ENV]}, but this run is --target ${TARGET}." >&2
    echo "       Nothing more was changed. Check the HostName for ${ALIAS} in ~/.ssh/config." >&2
    exit 1
  fi
  if [[ "${P[FOOTBAG_ENV]:-}" == "$TARGET" ]]; then
    require_host_is "$ALIAS" "$TARGET" || exit 1
  fi
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
  provision "$mode" || { echo "ERROR: ${title} did not complete on ${ALIAS}." >&2; exit 1; }
  refresh_host
  bh_verdict "$step"
  [[ "$BH_STATE" == "DONE" ]] || { echo "ERROR: ${title} still reads ${BH_STATE}: ${BH_DETAIL}" >&2; exit 1; }
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
    echo "ERROR: the host's own key id reads empty, so the key it uses cannot be told" >&2
    echo "       apart from the ones it does not. Nothing was retired." >&2
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
bash "${BH_SCRIPTS}/terraform-apply-all.sh" --target "$TARGET" </dev/null || {
  echo "ERROR: the Terraform step did not complete; nothing on the host was changed." >&2
  exit 1
}

# Read only now: before the apply a brand-new environment's tree records no
# instance at all.
tf_instance_name "$TARGET" || exit 1
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
    --query 'InvalidParameters' --output text </dev/null 2>/dev/null)" || {
  echo "ERROR: could not read ${BASE_URL_PARAM} from Parameter Store. Nothing on the host was changed." >&2
  exit 1
}
if grep -qF -- "$BASE_URL_PARAM" <<< "$missing_param"; then
  echo "" >&2
  echo "STOPPED: ${TARGET} publishes no ${BASE_URL_PARAM} yet, because CloudFront is not" >&2
  echo "         enabled in its values file, and the deploy cannot run without the address" >&2
  echo "         the site is served at. Next:" >&2
  echo "           1. in terraform/${TARGET}/terraform.tfvars set enable_cloudfront = true and" >&2
  if [[ "$TARGET" == "staging" ]]; then
    echo "              lightsail_origin_dns = \"<static address>.nip.io\", from:" >&2
    echo "                terraform -chdir=terraform/${TARGET} output -raw lightsail_static_ip" >&2
  else
    echo "              lightsail_origin_dns to the origin record pointing at the static address" >&2
  fi
  echo "           2. re-run: < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}" >&2
  echo "         The re-run's Terraform step creates the distribution and publishes the" >&2
  echo "         address. Nothing on the host was changed." >&2
  exit 1
fi
proved "Terraform publishes ${BASE_URL_PARAM}"

# 2. The alias points where Terraform says, and the host key is pinned.
say "Pinned host key"
tf_output_read "terraform/${TARGET}" lightsail_static_ip || {
  echo "ERROR: could not read the ${TARGET} host address from Terraform." >&2
  tf_output_explain "terraform/${TARGET}" lightsail_static_ip
  exit 1
}
TF_IP="$TF_OUTPUT_VALUE"
ALIAS_HOST="$(ssh -G "$ALIAS" 2>/dev/null | grep '^hostname ' | tail -1 | cut -d' ' -f2 || true)"
if [[ "$ALIAS_HOST" != "$TF_IP" ]]; then
  echo "ERROR: ${ALIAS} in ~/.ssh/config names '${ALIAS_HOST}', but Terraform reports ${TF_IP}." >&2
  echo "       Set its HostName to ${TF_IP}, then re-run. Nothing on the host was changed." >&2
  exit 1
fi
bash "${BH_SCRIPTS}/install-known-hosts.sh" --target "$TARGET" </dev/null || exit 1

# 3. The shared account and the second port, through ec2-user the first time.
refresh_host
bh_verdict account
if [[ "$BH_STATE" == "DONE" ]]; then
  proved "shared account: ${BH_DETAIL}"
elif [[ "${P[HOST_PROBE]:-}" == "sudo-refused" ]]; then
  # footbag logs in, so the account exists and people use it. Whatever is wrong
  # with the password, the first-login path is not the repair: it would set the
  # account's password to whatever line 1 of this run's file holds.
  echo "ERROR: ${BH_DETAIL}." >&2
  echo "       Next: ${BH_NEXT}." >&2
  echo "       Nothing on the host was changed." >&2
  exit 1
else
  say "First login as ec2-user"
  echo "    footbag did not answer: ${P[HOST_PROBE]:-unknown}${P[HOST_PROBE_SAID]:+ (${P[HOST_PROBE_SAID]})}"
  require_host_ssh_opts || exit 1
  # Port 22 is the only one a fresh instance listens on. 2222 is tried second,
  # for an operator whose network drops 22 and who has added 2222 from the
  # browser console; both are covered by the pin.
  first_login() {
    {
      printf 'FOOTBAG_PASSWORD=%q\n' "$SUDO_PASS"
      cat "$ACCOUNT_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" -p "$1" -l ec2-user "$ALIAS" 'sudo -n bash -s footbag-bootstrap-account'
  }
  if ! first_login 22 && ! first_login 2222; then
    echo "ERROR: the first login as ec2-user on port 22 did not complete." >&2
    echo "       If port 22 timed out, your network may drop it. Open the Lightsail" >&2
    echo "       browser console (Lightsail, the instance, Connect), which reaches the" >&2
    echo "       host from inside AWS, and add the second port there:" >&2
    echo "         printf 'Port 22\\nPort 2222\\n' | sudo tee /etc/ssh/sshd_config.d/05-footbag-ports.conf >/dev/null && sudo systemctl reload sshd" >&2
    echo "       then re-run; the first login goes through on 2222 after that." >&2
    exit 1
  fi
  refresh_host
  bh_verdict account
  [[ "$BH_STATE" == "DONE" ]] || {
    echo "ERROR: footbag still does not log in on ${ALIAS} with sudo taking its password: ${BH_DETAIL}" >&2
    exit 1
  }
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
  with_pass "${BH_SCRIPTS}/set-host-env.sh" --target "$TARGET" || exit 1
fi
require_host_is "$ALIAS" "$TARGET" || exit 1

# 7. The database directory.
host_step dbdir dbdir

# 8. The host credential chain.
refresh_host; refresh_aws
bh_verdict credentials
if [[ "${P[CRED_CHAIN]:-}" != "ok" ]]; then
  [[ "${P[IAM_SRC_KEYS]-unknown}" != "unknown" && "${P[IAM_SRC_INACTIVE]-unknown}" != "unknown" ]] \
    || { echo "ERROR: could not read the source-profile user's keys." >&2; exit 1; }
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
      exit 1
      ;;
    *) echo "ERROR: could not free a key for this host." >&2; exit 1 ;;
  esac
  refresh_aws
  say "Host credential chain: a key of its own for this host"
  with_pass "${BH_SCRIPTS}/install-host-credentials.sh" --target "$TARGET" --rotate || exit 1
  refresh_host; refresh_aws
  [[ "${P[CRED_CHAIN]:-}" == "ok" ]] || {
    echo "ERROR: the host still does not resolve its runtime role after the install." >&2
    exit 1
  }
fi
proved "the host resolves its runtime role with ${P[CRED_KEY_ID]:-its key}"
[[ "${P[IAM_SRC_KEYS]-unknown}" != "unknown" && "${P[IAM_SRC_INACTIVE]-unknown}" != "unknown" ]] \
  || { echo "ERROR: could not read the source-profile user's keys." >&2; exit 1; }
retire_dead_keys install-host-credentials.sh "${P[IAM_SRC_KEYS]}" "${P[IAM_SRC_INACTIVE]}" "${P[CRED_KEY_ID]:-}" \
  --target "$TARGET" || { echo "ERROR: the dead host's key was not retired." >&2; exit 1; }
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
    with_pass "${BH_SCRIPTS}/${CW_INSTALLER}" --upgrade || exit 1
  else
    [[ "${P[IAM_CW_KEYS]-unknown}" != "unknown" && "${P[IAM_CW_INACTIVE]-unknown}" != "unknown" ]] \
      || { echo "ERROR: could not read the publisher's keys." >&2; exit 1; }
    slot=0
    free_key_slot "$CW_INSTALLER" "${P[IAM_CW_KEYS]}" "${P[IAM_CW_INACTIVE]}" "${P[CWAGENT_KEY_ID]:-}" || slot=$?
    case "$slot" in
      0) ;;
      2)
        echo ""
        echo "STOPPED: a publisher key was retired to make room for this host's own, and it is"
        echo "deleted only once a later run has seen it inactive. Re-run this script:"
        echo "  < ${BH_CRED} bash scripts/bootstrap-host.sh --target ${TARGET}"
        exit 1
        ;;
      *) echo "ERROR: could not free a publisher key for this host." >&2; exit 1 ;;
    esac
    say "CloudWatch agent ${want_cw}: a key of its own for this host"
    with_pass "${BH_SCRIPTS}/${CW_INSTALLER}" --rotate || exit 1
  fi
  refresh_host; refresh_aws
fi
bh_verdict cwagent
if [[ "${P[CW_METRICS]:-}" == "ok" && "${P[IAM_CW_KEYS]-unknown}" != "unknown" && "${P[IAM_CW_INACTIVE]-unknown}" != "unknown" ]]; then
  retire_dead_keys "$CW_INSTALLER" "${P[IAM_CW_KEYS]}" "${P[IAM_CW_INACTIVE]}" "${P[CWAGENT_KEY_ID]:-}" \
    || { echo "ERROR: the publisher's dead key was not retired." >&2; exit 1; }
  refresh_aws
else
  echo "    pending: the agent's metrics are not arriving yet, so its predecessor key is"
  echo "    kept. Re-run this script in a few minutes to retire it."
fi

# 10. The first deploy, or on a live production the restore and a code deploy.
refresh_host
if verdict_is_done deploy; then
  proved "deployed runtime: ${BH_DETAIL}"
else
  confirm_identity
  if [[ "$TARGET" == "staging" ]]; then
    say "First deploy: a rebuild from the committed data"
    bash "$BH_DEPLOY" --target staging --from-csv </dev/tty || exit 1
  else
    case "${P[MARKER]:-unknown}" in
      false)
        say "First deploy: the full rebuild production takes before go-live"
        bash "$BH_DEPLOY" --target production --all-data -W </dev/tty || exit 1
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
          confirm_from_tty "Type 'APPLY' to install the release on ${ALIAS} without starting it: " "APPLY" || {
            echo "Not confirmed. Nothing was deployed." >&2
            exit 1
          }
          with_pass "$BH_DEPLOY_CODE" --first-install --target production || exit 1
          with_pass "${BH_SCRIPTS}/restore-db.sh" --target production --onto-empty || exit 1
          refresh_host
          [[ "${P[DB_FILE]:-}" == "present" && "${P[REPLAY_PENDING]:-}" == "no" ]] || {
            echo "ERROR: after the restore ${ALIAS} reports database ${P[DB_FILE]:-unknown}, erasure replay pending ${P[REPLAY_PENDING]:-unknown}." >&2
            exit 1
          }
          proved "the database is restored and its erasures re-applied"
        elif [[ "${P[REPLAY_PENDING]:-}" == "yes" ]]; then
          echo "ERROR: a restore's erasure replay is pending on ${ALIAS}, which holds the site down" >&2
          echo "       until it completes. Finish it, then re-run this script:" >&2
          echo "         < ${BH_CRED} bash scripts/restore-db.sh --target production --resume-erasure-replay" >&2
          exit 1
        fi
        bash "$BH_DEPLOY" --target production </dev/tty || exit 1
        ;;
      *)
        echo "ERROR: could not read the production-live marker, which decides between the" >&2
        echo "       rebuild deploy and a restore. Nothing was deployed." >&2
        exit 1
        ;;
    esac
  fi
  refresh_host
  bh_verdict deploy
  [[ "$BH_STATE" == "DONE" ]] || { echo "ERROR: after the deploy: ${BH_DETAIL}" >&2; exit 1; }
  proved "deployed runtime: ${BH_DETAIL}"
fi

# 11. The backup timer.
refresh_host; refresh_aws
if verdict_is_done backup; then
  proved "backup timer: ${BH_DETAIL}"
else
  say "Backup timer"
  with_pass "${BH_SCRIPTS}/install-backup-timer.sh" --target "$TARGET" || exit 1
  # The install runs the first backup itself, so the object it wrote is in the
  # bucket by now; the step is done on that object, not on the install's word.
  refresh_host; refresh_aws
  bh_verdict backup
  [[ "$BH_STATE" == "DONE" ]] || { echo "ERROR: backup timer still reads ${BH_STATE}: ${BH_DETAIL}" >&2; exit 1; }
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
    with_pass "${BH_SCRIPTS}/activate-notification-feeds.sh" --target "$TARGET" --state on || exit 1
    # Its own deploy is what writes the queue addresses onto the host, so the
    # step is done once the host holds them and Terraform subscribes the queue.
    refresh_host
    bh_probe_terraform "$TARGET"
    bh_verdict feeds
    [[ "$BH_STATE" == "DONE" ]] || { echo "ERROR: notification feeds still read ${BH_STATE}: ${BH_DETAIL}" >&2; exit 1; }
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
    with_pass "${BH_SCRIPTS}/harden-sshd.sh" --target "$TARGET" --apply || exit 1
    refresh_host
  fi
  if [[ "${P[SSHD_REVERT_PENDING]:-no}" == "yes" ]]; then
    say "Confirming the sshd change"
    with_pass "${BH_SCRIPTS}/harden-sshd.sh" --target "$TARGET" --confirm || exit 1
    refresh_host
  fi
  bh_verdict sshd
  [[ "$BH_STATE" == "DONE" ]] || { echo "ERROR: sshd posture still reads: ${BH_DETAIL}" >&2; exit 1; }
  proved "sshd posture: ${BH_DETAIL}"
fi

# 14. The administrators' keys: named, never invented.
bh_verdict operatorkeys
say "Administrator keys"
echo "    ${BH_DETAIL}."
echo "    Add each administrator's key with:"
echo "      ${BH_NEXT}"

# 15. One reboot on staging, so compressed in-RAM swap is gone.
refresh_host
bh_verdict swap
if [[ "$BH_STATE" == "DONE" ]]; then
  proved "swap: ${BH_DETAIL}"
elif [[ "$TARGET" == "staging" && "${P[ZRAM_ACTIVE]:-}" == "yes" &&"${P[ZRAM_SUPPRESSED]:-}" == "yes" ]]; then
  say "Rebooting ${ALIAS} once, so the compressed-swap suppression takes effect"
  # Its own confirmation: a reboot takes the site down for its length, and no
  # earlier answer in this run was about that.
  echo "This reboots ${ALIAS}. The site is down until the host is back and every"
  echo "container reports healthy again, usually a minute or two."
  confirm_from_tty "Type 'APPLY' to reboot ${ALIAS}: " "APPLY" || {
    echo "Not confirmed; ${ALIAS} was not rebooted. Re-run this script to reboot it." >&2
    exit 1
  }
  require_host_ssh_opts || exit 1
  stream="$(
    {
      printf '%s\n' "$SUDO_PASS"
      cat "$REBOOT_HALF"
    } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-bootstrap-reboot'
  )" || { echo "ERROR: could not schedule the reboot." >&2; exit 1; }
  old_boot="$(grep -A1 '^---FOOTBAG-BOOT-ID---$' <<< "$stream" | tail -1)"
  new_boot=""
  for (( i = 1; i <= 60; i++ )); do
    sleep "$POLL_SECS"
    new_boot="$("$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'cat /proc/sys/kernel/random/boot_id' </dev/null 2>/dev/null || true)"
    [[ -n "$new_boot" && "$new_boot" != "$old_boot" ]] && break
  done
  [[ -n "$new_boot" && "$new_boot" != "$old_boot" ]] || {
    echo "ERROR: ${ALIAS} has not come back with a new boot id." >&2
    exit 1
  }
  proved "${ALIAS} rebooted (boot id ${new_boot})"
  # The service starts at boot; wait for every container to report healthy.
  for (( i = 1; i <= 40; i++ )); do
    refresh_host
    verdict_is_done deploy && break
    sleep "$POLL_SECS"
  done
  verdict_is_done deploy || { echo "ERROR: after the reboot: ${BH_DETAIL}" >&2; exit 1; }
  proved "deployed runtime after the reboot: ${BH_DETAIL}"
fi

# The record of where the host stands, from a fresh read of every step.
bh_probe_pin "$TARGET"
refresh_host; refresh_aws
bh_probe_host_env "$TARGET"
render_all
bh_milestones "$TARGET"
echo ""
if (( RENDER_PENDING > 0 )); then
  echo "${RENDER_PENDING} step(s) still pending; each names its command above. A re-run"
  echo "proves what is done and finishes the rest."
  exit 1
fi
echo "The host is bootstrapped."
exit 0
