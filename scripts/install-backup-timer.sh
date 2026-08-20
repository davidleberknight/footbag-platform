#!/usr/bin/env bash
# install-backup-timer.sh
#
# Install and start the footbag-backup systemd pair on a deployed Lightsail
# host: the 5-minute SQLite snapshot producer (footbag-backup.service, which
# runs /srv/footbag/scripts/backup-db.sh; the deploy rsync puts that script
# on the host) and the timer that drives it. Runs from the operator
# workstation over ssh; the one-time unit install is the only host-side step
# the deploy pipeline does not already cover.
#
# After installation the service is started once immediately, so a missing
# prerequisite (BACKUP_S3_BUCKET unset in /srv/footbag/env, sqlite3 or aws
# CLI absent) fails loudly here instead of silently on the first timer tick.
#
# Sudo pattern: the shared wire. The sudo password is line one of the ssh
# stdin stream, both unit files follow as base64 assignments, and the root-side
# body is cat'd onto the same stream. Nothing secret reaches an argument list,
# no terminal is involved, and every privileged step runs in one elevated shell.
# The units travel in the pipe rather than by scp, so the host never holds a
# staging directory and there is nothing to clean up after a failure.
#
# Usage (the sudo password is read from stdin, line 1; --dry-run needs none):
#   < <operator credential file> bash scripts/install-backup-timer.sh --target staging
#   < <operator credential file> bash scripts/install-backup-timer.sh --target production
#   < <operator credential file> bash scripts/install-backup-timer.sh --target staging --ssh-alias my-host
#   scripts/install-backup-timer.sh --target staging --dry-run
#
# After the first two scheduled runs emit the BackupAgeMinutes metric, set
# enable_backup_alarm = true in terraform/<target>/terraform.tfvars and
# apply, so the db-backup-stale alarm goes live against flowing data
# (arming it earlier pages immediately: treat_missing_data is breaching).
set -euo pipefail

TARGET="staging"
SSH_ALIAS=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --ssh-alias)
      SSH_ALIAS="${2:-}"
      shift 2 || { echo "ERROR: --ssh-alias requires an argument" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing
      # the header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

case "$TARGET" in
  staging|production) ;;
  *)
    echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2
    exit 2
    ;;
esac

if [[ -z "$SSH_ALIAS" ]]; then
  SSH_ALIAS="footbag-$TARGET"
fi

UNIT_SERVICE="ops/systemd/footbag-backup.service"
UNIT_TIMER="ops/systemd/footbag-backup.timer"
for unit in "$UNIT_SERVICE" "$UNIT_TIMER"; do
  if [[ ! -f "$unit" ]]; then
    echo "ERROR: $unit not found (run from the project root)" >&2
    exit 2
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/install-backup-timer-remote.sh"

if (( DRY_RUN )); then
  echo "== dry run: install footbag-backup units on $TARGET (ssh alias: $SSH_ALIAS) =="
  echo ""
  echo "Would run, in order:"
  echo "  1. Read the sudo password from stdin, line 1"
  echo "  2. Pipe it, both unit files as base64 assignments, and the root-side"
  echo "     body (${REMOTE_HALF#"$SCRIPT_DIR"/}) into one ssh session"
  echo "  3. That body installs both units, reloads systemd, enables the timer,"
  echo "     runs the service once, and prints the status and journal tail"
  echo ""
  echo "Nothing is staged on the host, so nothing needs cleaning up afterwards."
  echo ""
  echo "Follow-up after two BackupAgeMinutes datapoints:"
  echo "  set enable_backup_alarm = true in terraform/$TARGET/terraform.tfvars and apply"
  exit 0
fi

# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

require_operator_stdin "scripts/install-backup-timer.sh --target $TARGET" || exit 1
# Operator-only preflight: a plain message on a machine without the deploy
# alias (a tester workstation), rather than a raw ssh resolution error at the
# first remote step. It follows the credential guard, as in every sibling
# script, so a run refused for a missing credential says so wherever it runs.
# Below the --dry-run exit, whose contract is a hermetic command plan with no
# host contact and no local ssh-config requirement.
require_ssh_alias "$SSH_ALIAS" || exit 1

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote half: $REMOTE_HALF" >&2; exit 1; }

echo "== installing footbag-backup units on $TARGET (ssh alias: $SSH_ALIAS) =="
echo ""

UNIT_SERVICE_B64="$(base64 -w0 < "$UNIT_SERVICE")"
UNIT_TIMER_B64="$(base64 -w0 < "$UNIT_TIMER")"

if ! {
      printf '%s\n' "$SUDO_PASS"
      printf 'UNIT_SERVICE_B64=%q\n' "$UNIT_SERVICE_B64"
      printf 'UNIT_TIMER_B64=%q\n'   "$UNIT_TIMER_B64"
      cat "$REMOTE_HALF"
    } | ssh "${HOST_SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'; then
  echo "" >&2
  echo "ERROR: unit install or first backup run failed on $SSH_ALIAS." >&2
  echo "Common causes:" >&2
  echo "  - the credential file's first line is not the host sudo password" >&2
  echo "  - BACKUP_S3_BUCKET unset in /srv/footbag/env (backup-db.sh refuses to run)" >&2
  echo "  - sqlite3 or aws CLI missing on the host" >&2
  echo "  - /srv/footbag/scripts/backup-db.sh absent (no deploy has shipped it yet)" >&2
  exit 1
fi

echo ""
echo "== footbag-backup.timer installed and active on $TARGET =="
echo ""
echo "Next step: after the timer has run at least twice (BackupAgeMinutes flowing"
echo "in CloudWatch namespace Footbag/$TARGET), set enable_backup_alarm = true in"
echo "terraform/$TARGET/terraform.tfvars and apply to arm the db-backup-stale alarm."
exit 0
