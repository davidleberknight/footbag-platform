#!/usr/bin/env bash
# restore-db.sh
#
# The other half of scripts/backup-db.sh: takes a snapshot back out of S3 and
# turns it into a running database again.
#
# A backup nobody has restored from is a belief rather than a control, and the
# restore drills the go-live plan requires cannot be performed without a
# procedure to perform. This is that procedure, written as a script rather than
# as runbook prose so it can be tested, rehearsed and run identically under
# pressure by someone who did not write it.
#
# Two destinations, and it never guesses which one is meant:
#
#   --to-local <path>   Downloads, verifies and writes the snapshot to a local
#                       file. Nothing is deployed and no host is touched. This
#                       is the drill destination and the default posture: the
#                       question a drill answers is whether the artifact is
#                       restorable, and that does not require a live host.
#
#   --target <env>      Restores onto a deployed host, in place. The host pulls
#                       the snapshot itself using the profile that wrote it, the
#                       service is stopped, the database in place is copied aside
#                       first, and the service is restarted. Requires a typed
#                       confirmation.
#
# What it refuses, and why each refusal exists:
#
#   - A snapshot that fails PRAGMA integrity_check. Checked before anything is
#     stopped or replaced, so a bad artifact costs nothing.
#   - A restore onto a host whose SES or payment adapter is live, unless that
#     host is production and the operator has typed the production confirmation.
#     A snapshot carries the outbox and every member's address: bring it up
#     against live SES on a drill host and the worker mails real people from a
#     database that is not the live one. That failure is unrecoverable in the
#     only way that matters, because the mail has already gone.
#   - A target the operator did not name. There is no default host.
#
# What it reports rather than judges: the row counts of the snapshot and of the
# database it would replace, side by side. A script that decided a count was
# "too low" would be guessing at which snapshot was meant; an operator reading
# both counts is not.
#
# Sudo pattern: the shared wire. The sudo password is line one of the ssh stdin
# stream, the snapshot key follows as an assignment, and the root-side body is
# cat'd onto the same stream. Nothing secret reaches an argument list.
#
# Usage (the sudo password is read from stdin, line 1; --to-local needs none):
#   bash scripts/restore-db.sh --source production --to-local /tmp/drill.db
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/restore-db.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-db.sh --target production --snapshot routine/2026/08/21/footbag-20260821T055900Z.db.gz
#   bash scripts/restore-db.sh --source staging --to-local /tmp/drill.db --dry-run
set -euo pipefail

TARGET=""
SOURCE_ENV=""
TO_LOCAL=""
SNAPSHOT_KEY=""
BUCKET=""
SSH_ALIAS=""
AWS_PROFILE_ARG=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)    TARGET="${2:-}";     shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --source)    SOURCE_ENV="${2:-}"; shift 2 || { echo "ERROR: --source requires an argument" >&2; exit 2; } ;;
    --to-local)  TO_LOCAL="${2:-}";   shift 2 || { echo "ERROR: --to-local requires an argument" >&2; exit 2; } ;;
    --snapshot)  SNAPSHOT_KEY="${2:-}"; shift 2 || { echo "ERROR: --snapshot requires an argument" >&2; exit 2; } ;;
    --bucket)    BUCKET="${2:-}";     shift 2 || { echo "ERROR: --bucket requires an argument" >&2; exit 2; } ;;
    --ssh-alias) SSH_ALIAS="${2:-}";  shift 2 || { echo "ERROR: --ssh-alias requires an argument" >&2; exit 2; } ;;
    --profile)   AWS_PROFILE_ARG="${2:-}"; shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; } ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing the
      # header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

# One destination, named. Two would be ambiguous and none would be a guess.
if [[ -n "$TARGET" && -n "$TO_LOCAL" ]]; then
  die "--target and --to-local are mutually exclusive: name one destination"
fi
if [[ -z "$TARGET" && -z "$TO_LOCAL" ]]; then
  die "name a destination: --to-local <path> for a drill, or --target <staging|production> to restore a host"
fi

# The snapshot stream to read from. It defaults to the environment being
# restored, because reading staging's snapshots onto production is a mistake
# with no legitimate form; naming it explicitly is how a drill reads production's
# artifacts without a production host being involved.
[[ -z "$SOURCE_ENV" ]] && SOURCE_ENV="$TARGET"
case "$SOURCE_ENV" in
  staging|production) ;;
  *) die "--source must be 'staging' or 'production' (got '${SOURCE_ENV:-}')" ;;
esac

if [[ -n "$TARGET" ]]; then
  case "$TARGET" in
    staging|production) ;;
    *) die "--target must be 'staging' or 'production' (got '$TARGET')" ;;
  esac
fi

# Everything a local destination needs before the network is touched. Both of
# these refuse the run outright, so checking them after the snapshot lookup
# means listing a bucket for a run that was never going to proceed, and it means
# an unusable AWS environment answers first: the listing fails, the script exits
# on its own error, and the operator is told about credentials rather than about
# the file they were seconds from overwriting.
if [[ -n "$TO_LOCAL" ]]; then
  command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 CLI not installed"
  [[ -e "$TO_LOCAL" ]] && die "refusing to overwrite an existing file at ${TO_LOCAL}"
fi

# The two buckets are not named to the same pattern, which is a fact about the
# deployed estate rather than a choice available here: production's snapshot
# bucket carries a db- infix and staging's does not. Guessing one shape for both
# reads an empty listing on one environment and calls it "no snapshots".
if [[ -z "$BUCKET" ]]; then
  case "$SOURCE_ENV" in
    production) BUCKET="footbag-production-db-snapshots" ;;
    staging)    BUCKET="footbag-staging-snapshots" ;;
  esac
fi

[[ -z "$SSH_ALIAS" && -n "$TARGET" ]] && SSH_ALIAS="footbag-$TARGET"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/restore-db-remote.sh"

AWS_ARGS=()
[[ -n "$AWS_PROFILE_ARG" ]] && AWS_ARGS=(--profile "$AWS_PROFILE_ARG")

if (( DRY_RUN )); then
  echo "== dry run: restore from ${SOURCE_ENV} snapshots (bucket ${BUCKET}) =="
  echo ""
  if [[ -n "$TO_LOCAL" ]]; then
    echo "Would download the snapshot, verify it, and write it to ${TO_LOCAL}."
    echo "No host is contacted and nothing is deployed."
  else
    echo "Would, in order:"
    echo "  1. Read the sudo password from stdin, line 1"
    echo "  2. Read /srv/footbag/env from ${SSH_ALIAS} and refuse if its SES or"
    echo "     payment adapter is live and this is not a confirmed production restore"
    echo "  3. Require a typed confirmation naming ${TARGET}"
    echo "  4. Pipe the password, the snapshot key, and the root-side body"
    echo "     (${REMOTE_HALF#"$SCRIPT_DIR"/}) into one ssh session, which downloads"
    echo "     the snapshot host-side, verifies it, stops the service, copies the"
    echo "     database in place aside, restores, re-verifies and restarts"
  fi
  exit 0
fi

command -v aws >/dev/null 2>&1 || die "aws CLI not installed"

# Latest unless the operator named one. Named explicitly is the normal case for
# a real recovery, where the whole question is which point in time to return to.
if [[ -z "$SNAPSHOT_KEY" ]]; then
  echo "==> Finding the most recent snapshot in s3://${BUCKET}/routine/"
  SNAPSHOT_KEY="$(aws "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" s3 ls "s3://${BUCKET}/routine/" --recursive \
    | sort | tail -1 | tr -s ' ' | cut -d' ' -f4)"
  [[ -n "$SNAPSHOT_KEY" ]] || die "no snapshots found in s3://${BUCKET}/routine/ (has the backup timer ever run?)"
fi
echo "    snapshot: s3://${BUCKET}/${SNAPSHOT_KEY}"

# ── Local destination: a drill, and the default posture ──────────────────────
if [[ -n "$TO_LOCAL" ]]; then
  umask 077
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT INT TERM

  echo "==> Downloading"
  aws "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" s3 cp "s3://${BUCKET}/${SNAPSHOT_KEY}" "${work}/snapshot.db.gz" >/dev/null \
    || die "could not download the snapshot"
  gunzip -c "${work}/snapshot.db.gz" > "${work}/snapshot.db" || die "the snapshot did not decompress"

  integrity="$(sqlite3 "${work}/snapshot.db" 'PRAGMA integrity_check;' 2>/dev/null || echo 'unreadable')"
  [[ "$integrity" == "ok" ]] || die "the snapshot failed its integrity check (${integrity})"

  counts="$(sqlite3 "${work}/snapshot.db" "
    SELECT 'members=' || (SELECT COUNT(*) FROM members)
        || ' legacy_members=' || (SELECT COUNT(*) FROM legacy_members)
        || ' historical_persons=' || (SELECT COUNT(*) FROM historical_persons)
        || ' clubs=' || (SELECT COUNT(*) FROM clubs)
        || ' audit_entries=' || (SELECT COUNT(*) FROM audit_entries)
        || ' auto_link_staged_candidates=' || (SELECT COUNT(*) FROM auto_link_staged_candidates);
  " 2>/dev/null || echo '(counts unavailable)')"

  cp -a "${work}/snapshot.db" "$TO_LOCAL"
  echo ""
  echo "======================================================================"
  echo "  SNAPSHOT RESTORED to ${TO_LOCAL}"
  echo "  From:     s3://${BUCKET}/${SNAPSHOT_KEY}"
  echo "  Integrity check: ok"
  echo "  Contents: ${counts}"
  echo "  This is a copy of live data. Delete it when the drill is recorded."
  echo "======================================================================"
  exit 0
fi

# ── Host destination: in place, behind the adapter check and a typed word ────
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

require_operator_stdin "scripts/restore-db.sh --target $TARGET" || exit 1
require_ssh_alias "$SSH_ALIAS" || exit 1
[[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"

HOST_ENV_FILE="$(mktemp)"
trap 'rm -f "$HOST_ENV_FILE"' EXIT INT TERM
host_env_fetch "$SSH_ALIAS" "$HOST_ENV_FILE" || exit 1

host_value() { grep -E "^$1=" "$HOST_ENV_FILE" | tail -1 | cut -d= -f2-; }
SES_ADAPTER_ON_HOST="$(host_value SES_ADAPTER)"
PAYMENT_ADAPTER_ON_HOST="$(host_value PAYMENT_ADAPTER)"

# The refusal that matters most, and the one with no second chance. A restored
# database carries the outbox and every member's address; a worker draining it
# against live SES sends real mail from a database that is not the live one.
# Production is exempt only because restoring production onto production is the
# case where the mail in that outbox is the mail that was genuinely pending, and
# it still costs a typed confirmation below.
if [[ "$TARGET" != "production" ]]; then
  if [[ "$SES_ADAPTER_ON_HOST" == "live" || "$PAYMENT_ADAPTER_ON_HOST" == "live" ]]; then
    echo "ERROR: ${SSH_ALIAS} has an outbound adapter armed" >&2
    echo "         SES_ADAPTER=${SES_ADAPTER_ON_HOST:-unset} PAYMENT_ADAPTER=${PAYMENT_ADAPTER_ON_HOST:-unset}" >&2
    echo "       A restored database carries the outbox and every member's address, so" >&2
    echo "       bringing it up here would mail real people from a database that is not" >&2
    echo "       the live one. Disarm the host first with scripts/arming.sh, or restore" >&2
    echo "       to a local file with --to-local instead." >&2
    exit 1
  fi
fi

echo ""
echo "This REPLACES the live database on ${SSH_ALIAS}."
echo "  snapshot:        s3://${BUCKET}/${SNAPSHOT_KEY}"
echo "  SES adapter:     ${SES_ADAPTER_ON_HOST:-unset}"
echo "  payment adapter: ${PAYMENT_ADAPTER_ON_HOST:-unset}"
echo "The database in place is copied aside on the host first and is not deleted."
echo ""

CONFIRM_WORD="RESTORE ${TARGET^^}"
confirm_from_tty "Type '${CONFIRM_WORD}' to continue: " "$CONFIRM_WORD" \
  || die "not confirmed; nothing was restored"

if ! {
      printf '%s\n' "$SUDO_PASS"
      printf 'SNAPSHOT_KEY=%q\n' "$SNAPSHOT_KEY"
      cat "$REMOTE_HALF"
    } | ssh "${HOST_SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'; then
  echo "" >&2
  echo "ERROR: the restore failed on ${SSH_ALIAS}." >&2
  echo "       The remote half refuses before stopping the service, so an early" >&2
  echo "       failure changed nothing. If it failed after the stop, its own output" >&2
  echo "       names the copy it set aside and whether it restarted." >&2
  exit 1
fi

echo ""
echo "== restore complete on ${TARGET} =="
echo "Record the date, the elapsed time and the outcome: that record is the drill"
echo "evidence the go-live backup and recovery gate asks for."
exit 0
