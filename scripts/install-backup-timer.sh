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
# Sudo pattern: `ssh -t` allocates a remote PTY so sudo prompts for the
# operator's password on the local terminal; the password is typed directly
# into sudo's noecho prompt and is never piped, captured, or logged. All
# privileged steps run in a single sudo invocation so the operator is
# prompted at most once.
#
# Usage:
#   scripts/install-backup-timer.sh --target staging
#   scripts/install-backup-timer.sh --target production
#   scripts/install-backup-timer.sh --target staging --ssh-alias my-host
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
      sed -n '2,30p' "$0"
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

# Operator-only preflight: fail fast with a plain message on a machine
# without the deploy alias (a tester workstation), rather than a raw ssh
# resolution error at the first remote step. Avoid `awk ... exit` (SIGPIPE
# under pipefail); mirror the deploy wrapper. Skipped under --dry-run, whose
# contract is a hermetic command plan with no host contact and no local
# ssh-config requirement.
if (( DRY_RUN == 0 )); then
  RESOLVED_HOST=$(ssh -G "$SSH_ALIAS" 2>/dev/null | awk '/^hostname / {print $2}' | tail -1)
  if [[ -z "$RESOLVED_HOST" || "$RESOLVED_HOST" == "$SSH_ALIAS" ]]; then
    echo "ERROR: SSH alias '$SSH_ALIAS' is not configured; this installer is operator-only." >&2
    echo "Recommendation: operators add the deploy alias stanza to ~/.ssh/config." >&2
    exit 1
  fi
fi

UNIT_SERVICE="ops/systemd/footbag-backup.service"
UNIT_TIMER="ops/systemd/footbag-backup.timer"
for unit in "$UNIT_SERVICE" "$UNIT_TIMER"; do
  if [[ ! -f "$unit" ]]; then
    echo "ERROR: $unit not found (run from the project root)" >&2
    exit 2
  fi
done

REMOTE_STAGE_DIR="/tmp/footbag-backup-install-$$"

# The privileged sequence, run as one sudo invocation:
#   install both units -> reload systemd -> enable the timer -> run the
#   service once -> show timer status and the last service journal lines.
REMOTE_PRIVILEGED="install -m 0644 -o root -g root $REMOTE_STAGE_DIR/footbag-backup.service /etc/systemd/system/footbag-backup.service \
&& install -m 0644 -o root -g root $REMOTE_STAGE_DIR/footbag-backup.timer /etc/systemd/system/footbag-backup.timer \
&& systemctl daemon-reload \
&& systemctl enable --now footbag-backup.timer \
&& systemctl start footbag-backup.service \
&& systemctl --no-pager --lines=0 status footbag-backup.timer \
&& journalctl -u footbag-backup.service -n 10 --no-pager"

if (( DRY_RUN )); then
  echo "== dry run: install footbag-backup units on $TARGET (ssh alias: $SSH_ALIAS) =="
  echo ""
  echo "Would run, in order:"
  echo "  1. ssh $SSH_ALIAS mkdir -p $REMOTE_STAGE_DIR"
  echo "  2. scp $UNIT_SERVICE $UNIT_TIMER $SSH_ALIAS:$REMOTE_STAGE_DIR/"
  echo "  3. ssh -t $SSH_ALIAS sudo bash -c '$REMOTE_PRIVILEGED'"
  echo "  4. ssh $SSH_ALIAS rm -rf $REMOTE_STAGE_DIR"
  echo ""
  echo "Follow-up after two BackupAgeMinutes datapoints:"
  echo "  set enable_backup_alarm = true in terraform/$TARGET/terraform.tfvars and apply"
  exit 0
fi

cleanup_remote() {
  ssh -o BatchMode=yes "$SSH_ALIAS" "rm -rf $REMOTE_STAGE_DIR" 2>/dev/null || true
}
trap cleanup_remote EXIT INT TERM

echo "== installing footbag-backup units on $TARGET (ssh alias: $SSH_ALIAS) =="
echo ""

if ! ssh -o BatchMode=yes "$SSH_ALIAS" "mkdir -p $REMOTE_STAGE_DIR"; then
  echo "ERROR: cannot reach $SSH_ALIAS (alias missing from ~/.ssh/config, or host down)" >&2
  exit 1
fi

if ! scp -q "$UNIT_SERVICE" "$UNIT_TIMER" "$SSH_ALIAS:$REMOTE_STAGE_DIR/"; then
  echo "ERROR: failed to copy unit files to $SSH_ALIAS:$REMOTE_STAGE_DIR" >&2
  exit 1
fi

echo "Unit files staged. Installing via sudo; you will be prompted for your sudo password"
echo "on this terminal. The password is typed directly into sudo; it is NOT captured,"
echo "NOT echoed, and NOT logged."
echo ""

if ! ssh -t "$SSH_ALIAS" "sudo bash -c '$REMOTE_PRIVILEGED'"; then
  echo "" >&2
  echo "ERROR: unit install or first backup run failed on $SSH_ALIAS." >&2
  echo "Common causes:" >&2
  echo "  - Sudo password entered incorrectly or canceled" >&2
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
