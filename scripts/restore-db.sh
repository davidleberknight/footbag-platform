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
# Three destinations, and it never guesses which one is meant:
#
#   --target <env> --drill
#                       The restore drill. The host pulls the snapshot, verifies
#                       it, and restores it into a scratch file beside nothing
#                       it serves: integrity check, member and payment row
#                       counts, the newest audit timestamp, and the elapsed
#                       time, then the scratch copy is shredded. The live
#                       database and the service are never touched, so it asks
#                       for no confirmation. Production data stays on the
#                       production host and no person handles it.
#
#   --target <env>      Restores onto a deployed host, in place. The host pulls
#                       the snapshot itself using the profile that wrote it, the
#                       service and the backup timer are stopped, the database in
#                       place is copied aside first, the snapshot is put in
#                       place, and the erasures it records as due are re-applied
#                       before the service is restarted. A replay that does not
#                       complete leaves the service stopped and backups paused,
#                       held there across a reboot or a deploy by a marker beside
#                       the database, until --resume-erasure-replay finishes it.
#                       After the service reports ready, set-aside database
#                       copies older than seven days are deleted. Requires a
#                       typed confirmation.
#
#   --target <env> --onto-empty
#                       The same in-place restore, onto a host that has no
#                       database yet: a rebuilt host after go-live, when the
#                       rebuild deploy is refused for good and a snapshot is the
#                       only way the database comes back. The host's database
#                       directory and an empty placeholder are created owned by
#                       the container account, then the restore runs exactly as
#                       above. Refused on a host that already has a database,
#                       so the flag can never stand in for the ordinary restore,
#                       and on one that does not yet carry the release, since
#                       the erasure replay runs in a container of it: the release
#                       is installed first without starting it
#                       (scripts/deploy-code.sh --first-install, which
#                       scripts/bootstrap-host.sh runs), and this restore starts
#                       the service only once the replay has run. A refusal
#                       leaves a service that was not running stopped. Requires
#                       the typed confirmation.
#
#   --target <env> --resume-erasure-replay
#                       Finishes a restore whose erasure replay did not
#                       complete: re-runs the replay against the database in
#                       place and, only when it succeeds, clears the marker,
#                       starts the service and resumes backups. Refuses when no
#                       replay is pending. Production asks for the typed
#                       confirmation.
#
#   --to-local <path>   Downloads, verifies and writes a STAGING snapshot to a
#                       local file. Nothing is deployed and no host is touched.
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
#   - A staging snapshot onto production, whether named by --source or by a
#     --bucket outside footbag-production-*. A staging snapshot holds test
#     accounts and rehearsal data; production restores only from its own
#     buckets, the DR bucket among them.
#   - A production snapshot anywhere but production, whether named by --source
#     or by a footbag-production-* --bucket: not to a workstation, not onto the
#     internet-reachable staging host. Production member data never leaves the
#     production host and its backups; a drill of it runs there, with --drill.
#
# Which snapshot it looks for, which is never a guess between the two classes:
#
#   default             The routine stream and its thinned generations: routine/ for
#                       the last two days, hourly/ for a month, daily/ for just
#                       over a year. The newest point across the three wins.
#
#   --pre-flip          The cutover rollback artifact, under pre-flip/. Asked for
#                       by name because both classes replicate to the DR bucket,
#                       where ~1,200 routine objects sit beside one pre-flip
#                       artifact: a search across both picks the newest routine
#                       snapshot every time, which is a silent restore of the
#                       wrong point in time at the moment nothing can be undone.
#                       In place, a rollback does two things more, because the
#                       artifact was taken with the outbox and payments open and
#                       both pause levers are rows in the database it replaces.
#                       On production it refuses, before the host is reached,
#                       unless the email switch reads dark. And on the restored
#                       copy, before the erasure replay and so before any service
#                       start, it pauses payments and outbound mail; a copy that
#                       does not read back paused is not served. The closing
#                       report then names the repairs the snapshot predates.
#
#   --bucket <name>     The bucket to read from. Defaults to the environment's
#                       own snapshot bucket. The pre-cutover rollback artifact is
#                       written to the cross-region DR bucket, so a rollback
#                       needs this flag AND --pre-flip. The value is carried to
#                       the host, not just used locally.
#
#   --snapshot <key>    An exact key, skipping the search entirely.
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
# Usage (the sudo password is read from stdin, line 1, for --target with or
# without --drill; --to-local needs none).
#
# Which file holds that password follows the account the alias connects as, and
# each account has its own file per environment, because staging and production
# are separate hosts with separate passwords:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
# A run started without the redirect names the one it needs.
#
#   # the restore drill, from the primary bucket and then from the DR bucket:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-db.sh --target production --drill
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-db.sh --target production --drill \
#       --bucket footbag-production-db-snapshots-dr
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/restore-db.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-db.sh --target production --snapshot routine/2026/08/21/footbag-20260821T055900Z.db.gz
#   # finishing a restore whose erasure replay did not complete:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-db.sh --target production --resume-erasure-replay
#   bash scripts/restore-db.sh --source staging --to-local /tmp/drill.db --dry-run
#   # the cutover rollback, both flags, onto the live host:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-db.sh --target production \
#       --pre-flip --bucket footbag-production-db-snapshots-dr
#
# Test seam (CI only; operators never set it), announced on stderr:
# RESTORE_DB_AWS_BIN replaces the aws CLI for the snapshot search and the local
# download. The host is reached through FOOTBAG_HOST_SSH_BIN, which the shared
# host library reads and announces; the identity check uses AWS_PROFILE_BIN and
# AWS_IDENTITY_BIN, announced by theirs.
set -euo pipefail

# shellcheck source=lib/closing-report.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/closing-report.sh"

TARGET=""
SOURCE_ENV=""
TO_LOCAL=""
SNAPSHOT_KEY=""
BUCKET=""
AWS_PROFILE_ARG=""
DRY_RUN=0
PRE_FLIP=0
DRILL=0
RESUME=0
ONTO_EMPTY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)    TARGET="${2:-}";     shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --source)    SOURCE_ENV="${2:-}"; shift 2 || { cr_error "--source requires an argument"; exit 2; } ;;
    --to-local)  TO_LOCAL="${2:-}";   shift 2 || { cr_error "--to-local requires an argument"; exit 2; } ;;
    --snapshot)  SNAPSHOT_KEY="${2:-}"; shift 2 || { cr_error "--snapshot requires an argument"; exit 2; } ;;
    --bucket)    BUCKET="${2:-}";     shift 2 || { cr_error "--bucket requires an argument"; exit 2; } ;;
    --profile)   AWS_PROFILE_ARG="${2:-}"; shift 2 || { cr_error "--profile requires an argument"; exit 2; } ;;
    --pre-flip)  PRE_FLIP=1; shift ;;
    --drill)     DRILL=1; shift ;;
    --onto-empty) ONTO_EMPTY=1; shift ;;
    --resume-erasure-replay) RESUME=1; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing the
      # header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

die() { cr_die "$*"; }

# One destination, named. Two would be ambiguous and none would be a guess.
if [[ -n "$TARGET" && -n "$TO_LOCAL" ]]; then
  die "--target and --to-local are mutually exclusive: name one destination"
fi
if [[ -z "$TARGET" && -z "$TO_LOCAL" ]]; then
  die "name a destination: --target <staging|production> --drill for a drill, --target to restore a host, or --to-local <path> for a staging snapshot"
fi
# The drill runs on the host whose data it is, so it needs a host to run on.
if (( ONTO_EMPTY )) && { [[ -z "$TARGET" ]] || (( DRILL )) || (( RESUME )); }; then
  die "--onto-empty restores onto a named host that has no database: use it with --target alone, not with --drill, --to-local or --resume-erasure-replay"
fi
if (( DRILL )) && [[ -z "$TARGET" ]]; then
  die "--drill runs on a host: name it with --target <staging|production>"
fi

# The snapshot stream to read from. It defaults to the environment being
# restored, because the only legitimate direction is an environment reading its
# own stream.
[[ -z "$SOURCE_ENV" ]] && SOURCE_ENV="$TARGET"
# Both checks here stay hand-rolled, deliberately, and this is the one script
# where that is the right answer.
#
# `--source` names a snapshot STREAM rather than a destination, and this script
# reports its refusals through `die`, which exits 1: the shared check exits 2 as
# a usage error, and a caller distinguishing "bad arguments" from "refused to
# restore" would see the wrong one. `--target` is OPTIONAL here, because an
# absent target means a local restore and that is the ordinary case, while the
# shared check exists precisely to refuse an absent value.
#
# Recorded rather than left looking like an oversight: the shared check is for a
# required destination named with one flag, and neither of these is that.
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/restore-db-remote.sh"
# Travels ahead of the remote half on the same stream and defines the function
# that deletes set-aside database copies once they are more than seven days old.
PRUNE_LIB="${SCRIPT_DIR}/internal/prune-db-copies.sh"
# Travels first on the same stream and defines how the remote half marks the
# problems it meets, which this run then lists in its own closing report.
REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"

AWS_BIN="${RESTORE_DB_AWS_BIN:-aws}"
[[ -n "${RESTORE_DB_AWS_BIN:-}" ]] \
  && echo "SYNTHETIC: RESTORE_DB_AWS_BIN='${AWS_BIN}' -- this run proves nothing about the estate." >&2

# The remote half exits with this status when it leaves an erasure replay
# pending: the restored database is in place, the site is held down and backups
# are paused until the replay is finished.
PENDING_EXIT=3
report_replay_pending() {
  echo "" >&2
  cr_error "the erasure replay on ${SSH_ALIAS} has NOT completed. Backups on ${SSH_ALIAS} are PAUSED and the site is STOPPED, and both stay that way, across a reboot or a deploy, until the replay is finished. Finish it with: bash scripts/restore-db.sh --target ${TARGET} --resume-erasure-replay"
  echo "       The host's own output above names the database in place and the one it replaced." >&2
}

# send_to_host <assignments...>: one session on the host carrying the sudo
# password, the given NAME=value assignments, the report library, the pruning
# helper and the remote half, as the shared wire pattern sends every privileged
# step. Run through cr_run_marked, so every problem the half marks is in this run's
# closing report.
send_to_host() {
  local kv
  {
    printf '%s\n' "$SUDO_PASS"
    for kv in "$@"; do printf '%s=%q\n' "${kv%%=*}" "${kv#*=}"; done
    cat "$REPORT_LIB" "$PRUNE_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'
}

# ── Resume: finish a restore whose erasure replay did not complete ───────────
# Its own mode rather than a step for an operator to type on the host: the
# replay, the marker, the service and the backup timer have to move in one
# order, and only on the replay's success.
if (( RESUME )); then
  [[ -n "$TARGET" ]] || die "--resume-erasure-replay runs on a host: name it with --target <staging|production>"
  if (( DRILL )) || [[ -n "$TO_LOCAL" || -n "$SNAPSHOT_KEY" || -n "$BUCKET" || "$PRE_FLIP" == "1" || "$SOURCE_ENV" != "$TARGET" ]]; then
    die "--resume-erasure-replay takes only --target (and --dry-run): it re-runs the replay against the database already in place"
  fi
  SSH_ALIAS="footbag-$TARGET"
  if (( DRY_RUN )); then
    echo "== dry run: resume the erasure replay on ${SSH_ALIAS} =="
    echo "Would, in order:"
    echo "  1. Read the sudo password from stdin, line 1"
    [[ "$TARGET" == "production" ]] && echo "  2. Require a typed confirmation naming production"
    echo "  3. On the host: refuse unless an erasure replay is pending, re-run it, and"
    echo "     only on 'erasure-replay: ok' clear the marker, start the service and"
    echo "     resume backups"
    exit 0
  fi
  ASSUME_YES=no
  # shellcheck source=lib/host-env-remote.sh
  source "${SCRIPT_DIR}/lib/host-env-remote.sh"
  require_operator_stdin "scripts/restore-db.sh --target $TARGET --resume-erasure-replay" \
    "$SSH_ALIAS" "$TARGET" || die "no operator credential on standard input"
  require_ssh_alias "$SSH_ALIAS" || die "no usable ssh alias ${SSH_ALIAS}"
  require_host_is "$SSH_ALIAS" "$TARGET" || die "the host behind ${SSH_ALIAS} did not confirm it is ${TARGET}"
  [[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"
  [[ -r "$PRUNE_LIB" ]] || die "missing pruning helper: $PRUNE_LIB"
  [[ -r "$REPORT_LIB" ]] || die "missing remote-half report library: $REPORT_LIB"
  echo ""
  echo "This re-runs the erasure replay against the database in place on ${SSH_ALIAS}"
  echo "and, only if it succeeds, starts the site and resumes backups."
  echo ""
  if [[ "$TARGET" == "production" ]]; then
    confirm_from_tty "Type 'APPLY' to continue: " "APPLY" \
      || die "not confirmed; nothing was changed"
  fi
  resume_status=0
  cr_run_marked "erasure replay resume on ${SSH_ALIAS}" -- \
    send_to_host RESUME_ERASURE_REPLAY=1 || resume_status=$?
  if (( resume_status != 0 )) || (( ${#CR_ERRORS[@]} )); then
    if (( resume_status == PENDING_EXIT )); then
      report_replay_pending
    else
      echo "" >&2
      cr_error "resuming the erasure replay failed on ${SSH_ALIAS}; the errors the host marked are listed in the closing report."
    fi
    exit 1
  fi
  echo ""
  echo "== erasure replay completed on ${TARGET}; the site is serving and backups resume =="
  cr_proved "the erasure replay re-ran on ${SSH_ALIAS}, the service reported ready and backups resumed (the host half's checks)"
  cr_finish
fi

# The two directions with no legitimate form, refused before anything else runs
# so a dry run shows them too and nothing reaches the network. A staging
# snapshot holds test accounts and rehearsal data; production restores only from
# its own stream. A production snapshot holds every member's personal data, and
# it never leaves production: not onto a workstation, where it outlives the run
# on a disk nobody audits, and not onto the staging host, which is reachable from
# the internet with its development surfaces on. Its drill runs on production.
if [[ "$TARGET" == "production" && "$SOURCE_ENV" != "production" ]]; then
  die "a staging snapshot never restores onto production: --target production reads only --source production"
fi
if [[ "$SOURCE_ENV" == "production" && "$TARGET" != "production" ]]; then
  die "a production snapshot never leaves production: restore or drill it with --target production"
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

# The same direction rule, applied to the bucket. `--bucket` names the object
# store outright, so a production restore given a staging bucket would read a
# staging snapshot whatever `--source` said. Production restores only from a
# production bucket; the DR bucket the cutover rollback reads is one of them.
if [[ "$TARGET" == "production" && "$BUCKET" != footbag-production-* ]]; then
  die "a staging snapshot never restores onto production: --target production reads only a footbag-production-* bucket (got '${BUCKET}')"
fi
if [[ "$TARGET" != "production" && "$BUCKET" == footbag-production-* ]]; then
  die "a production snapshot never leaves production: a footbag-production-* bucket is read only by --target production (got '${BUCKET}')"
fi

# The host is the target's own alias and nothing else names one: a label and a
# host chosen separately can disagree, and a run that believes the label acts
# on whatever host the other choice reached.
SSH_ALIAS=""
[[ -n "$TARGET" ]] && SSH_ALIAS="footbag-$TARGET"

AWS_ARGS=()
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  AWS_ARGS=(--profile "$AWS_PROFILE_ARG")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. The in-place leg runs on the host and uses the host's own
  # chain; this is the workstation half, which searches and pulls the artifact.
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || die "no AWS identity is available for the snapshot search"
fi

# Every backup bucket, the one whose name ends in -dr, is created in us-west-2
# by the Terraform trees, so the copy that outlives the primary region is read
# there by name, on both halves, rather than through a redirect from the region
# it exists to outlive.
BUCKET_REGION=""
[[ "$BUCKET" == *-dr ]] && BUCKET_REGION="us-west-2"
[[ -n "$BUCKET_REGION" ]] && AWS_ARGS+=(--region "$BUCKET_REGION")

# The two artifact classes are never mixed in a search. The cutover rollback
# lives under pre-flip/; the five-minute stream lives under routine/. Both are
# replicated to the DR bucket, so a search across both there is a search over
# ~1,200 routine objects and one pre-flip artifact, and "most recent" picks a
# routine snapshot every time -- a silent restore of the wrong point in time at
# the one moment there is nothing to fall back on. Restoring the rollback is a
# deliberate act, so it is asked for by name. Resolved before the dry run, so a
# rehearsal shows which class it would reach.
if [[ "$PRE_FLIP" -eq 1 ]]; then
  SEARCH_PREFIX="pre-flip/"
else
  # All three retention generations, newest wins. The producer keeps the six-minute
  # stream under routine/ for two days only, promoting the first run of each
  # hour and each day into hourly/ and daily/, so searching routine/ alone would
  # find nothing older than two days and nothing at all in the disaster-recovery
  # bucket, which carries the promoted generations and not the raw stream. Every
  # generation names its object footbag-<UTC timestamp>, so they interleave correctly
  # when compared on that name.
  SEARCH_PREFIX="routine/ hourly/ daily/"
fi

if (( DRY_RUN )); then
  echo "== dry run: restore from ${SOURCE_ENV} snapshots (bucket ${BUCKET}, prefix ${SEARCH_PREFIX}) =="
  echo ""
  if [[ -n "$TO_LOCAL" ]]; then
    echo "Would download the snapshot, verify it, and write it to ${TO_LOCAL}."
    echo "No host is contacted and nothing is deployed."
  elif (( DRILL )); then
    echo "Would, in order:"
    echo "  1. Read the sudo password from stdin, line 1"
    echo "  2. Pipe the password, the snapshot key, the drill flag and the root-side"
    echo "     body (${REMOTE_HALF#"$SCRIPT_DIR"/}) into one ssh session on ${SSH_ALIAS},"
    echo "     which downloads the snapshot host-side into a scratch directory,"
    echo "     verifies it, reports its row counts, newest audit timestamp and the"
    echo "     elapsed time, and shreds the scratch copy"
    echo "The live database and the service are not touched."
  else
    echo "Would, in order:"
    echo "  1. Read the sudo password from stdin, line 1"
    echo "  2. Read /srv/footbag/env from ${SSH_ALIAS} and refuse if its SES or"
    echo "     payment adapter is live and this is not a confirmed production restore"
    echo "  3. Require a typed confirmation naming ${TARGET}"
    echo "  4. Pipe the password, the snapshot key, and the root-side body"
    echo "     (${REMOTE_HALF#"$SCRIPT_DIR"/}) into one ssh session, which downloads"
    echo "     the snapshot host-side, verifies it, stops the service, copies the"
    echo "     database in place aside, restores, re-verifies, re-applies the"
    echo "     erasures the snapshot records and restarts"
    if (( PRE_FLIP )); then
      [[ "$TARGET" == "production" ]] \
        && echo "  Before step 1: refuse unless the production email switch reads dark"
      echo "  Before the replay: pause payments and outbound mail on the restored copy,"
      echo "     so the service first starts with both levers held"
    fi
  fi
  exit 0
fi

command -v "$AWS_BIN" >/dev/null 2>&1 || die "aws CLI not installed"

# The cutover rollback onto production goes ahead only while the email switch
# reads dark. The pre-flip snapshot holds the outbox unpaused, and both pause
# levers are rows in the database this restore replaces, so the switch, which
# lives in Parameter Store and survives the restore, is the one lever that holds
# across it. Read before the host is reached, and anything but dark refuses,
# a value that cannot be read included. The parameter lives beside the
# application, so it is read there and not in the DR bucket's region. Below
# production the mail adapter is a stub whatever the switch says.
if [[ "$TARGET" == "production" && "$PRE_FLIP" -eq 1 && "$DRILL" -eq 0 ]]; then
  email_param="/footbag/production/app/email_send_armed"
  ssm_args=()
  [[ -n "$AWS_PROFILE_ARG" ]] && ssm_args=(--profile "$AWS_PROFILE_ARG")
  email_value="$("$AWS_BIN" "${ssm_args[@]+"${ssm_args[@]}"}" ssm get-parameter --name "$email_param" \
      --region us-east-1 --query 'Parameter.Value' --output text </dev/null 2>&1)" \
    || die "could not read ${email_param}, so whether the restored service could resend mail is unknown: ${email_value##*$'\n'}"
  [[ "$email_value" == "dark" ]] \
    || die "the production email switch reads '${email_value}', not dark: the restored service would send from the pre-flip snapshot's outbox. Disarm it first with scripts/arming.sh --target production --switch email --state dark, then run again."
  echo "    production email switch reads dark"
fi

# Latest unless the operator named one. Named explicitly is the normal case for
# a real recovery, where the whole question is which point in time to return to.
#
# newest_under <prefix>: sets NEWEST to the newest snapshot key under the prefix,
# or to nothing when the prefix holds none. It sets a variable rather than
# printing, and is called directly rather than inside a command substitution,
# because a failed listing has to end the run here with the CLI's own words: in
# a substitution that refusal would end only the subshell. The CLI exits 1 with
# nothing on stderr for a prefix holding no objects, which is an empty listing
# and not a failure; anything it says on stderr is a failure.
NEWEST=""
LS_ERR="$(mktemp)"
cr_cleanup rm -f -- "$LS_ERR"
newest_under() {
  local listing=""
  NEWEST=""
  if ! listing="$("$AWS_BIN" "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" s3 ls "s3://${BUCKET}/$1" --recursive 2>"$LS_ERR")"; then
    [[ -s "$LS_ERR" ]] && die "could not list s3://${BUCKET}/$1: $(tail -n 1 "$LS_ERR")"
    listing=""
  fi
  # Objects sort chronologically within a generation because the key carries the UTC
  # date path followed by the timestamped name. grep exits 1 when it keeps no
  # line, which here is an empty listing.
  NEWEST="$(printf '%s\n' "$listing" | { grep -v -e '\.manifest\.json$' -e '^$' || [[ $? == 1 ]]; } \
    | sort | tail -1 | tr -s ' ' | cut -d' ' -f4)"
}

# lineage_of <key>: sets LINEAGE_AT and LINEAGE_SINCE from the lineage record the
# backup stored with the object (the time of the newest audit row the snapshot
# holds, and when the history it continues began), each the CLI's None where
# the object carries none. Called directly, for the same reason as newest_under.
LINEAGE_AT=""
LINEAGE_SINCE=""
lineage_of() {
  local record=""
  if ! record="$("$AWS_BIN" "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" s3api head-object --bucket "$BUCKET" --key "$1" \
        --query '[Metadata."audit-newest-at", Metadata."lineage-since"]' --output text 2>"$LS_ERR")"; then
    die "could not read the lineage record of s3://${BUCKET}/$1: $(tail -n 1 "$LS_ERR")"
  fi
  IFS=$'\t' read -r LINEAGE_AT LINEAGE_SINCE <<<"$record"
  LINEAGE_AT="${LINEAGE_AT:-None}"
  LINEAGE_SINCE="${LINEAGE_SINCE:-None}"
}

# The newest name is not always the newest data: a host rebuilt from an old disk
# snapshot could upload its old database under a new name before the backup
# learned to refuse that. So the pick is checked against the newest point of the
# other two generations, by the time of the newest audit row each holds, and the
# one holding later data wins. A point from before the pick's history began (a
# restore that deliberately went back) belongs to the history that restore
# abandoned and is never preferred.
confirm_newest_by_content() {
  local pick="$SNAPSHOT_KEY" pick_at since_compact candidate cand_ts best="$SNAPSHOT_KEY" best_at
  lineage_of "$pick"
  pick_at="$LINEAGE_AT"
  if [[ "$pick_at" == None || "$pick_at" == none ]]; then
    cr_warn "s3://${BUCKET}/${pick} carries no record of the data it holds, so it was chosen by its name alone."
    return 0
  fi
  best_at="$pick_at"
  since_compact=""
  # Compared with the compact time in each key's name, YYYYMMDDTHHMMSSZ, so any
  # fraction of a second is dropped first.
  if [[ "$LINEAGE_SINCE" != None && "$LINEAGE_SINCE" != none ]]; then
    since_compact="${LINEAGE_SINCE%%.*}"
    since_compact="${since_compact%Z}Z"
    since_compact="${since_compact//[-:]/}"
  fi
  for candidate in "$newest_routine" "$newest_hourly" "$newest_daily"; do
    [[ -z "$candidate" || "$candidate" == "$pick" ]] && continue
    cand_ts="${candidate##*/footbag-}"
    cand_ts="${cand_ts%.db.gz}"
    [[ -n "$since_compact" && "$cand_ts" < "$since_compact" ]] && continue
    lineage_of "$candidate"
    [[ "$LINEAGE_AT" == None || "$LINEAGE_AT" == none ]] && continue
    if [[ "$LINEAGE_AT" > "$best_at" ]]; then
      best="$candidate"
      best_at="$LINEAGE_AT"
    fi
  done
  if [[ "$best" != "$pick" ]]; then
    cr_warn "the newest-named snapshot s3://${BUCKET}/${pick} holds older data (newest audit row ${pick_at}) than s3://${BUCKET}/${best} (${best_at}), so the latter is restored. The former is a stale upload; find out how it was written."
    SNAPSHOT_KEY="$best"
  fi
  echo "    newest audit row in the chosen snapshot: ${best_at}"
}

if [[ -z "$SNAPSHOT_KEY" ]]; then
  echo "==> Finding the most recent snapshot in s3://${BUCKET}/ (${SEARCH_PREFIX})"
  if [[ "$PRE_FLIP" -eq 1 ]]; then
    newest_under "pre-flip/"
    SNAPSHOT_KEY="$NEWEST"
  else
    # Compare the three generations on the object name (field 5 of gen/YYYY/MM/DD/name),
    # so the newest point wins wherever it happens to live.
    newest_under 'routine/'; newest_routine="$NEWEST"
    newest_under 'hourly/'; newest_hourly="$NEWEST"
    newest_under 'daily/'; newest_daily="$NEWEST"
    SNAPSHOT_KEY="$(printf '%s\n' "$newest_routine" "$newest_hourly" "$newest_daily" \
      | sed '/^$/d' | sort -t/ -k5 | tail -1)"
    [[ -n "$SNAPSHOT_KEY" ]] && confirm_newest_by_content
  fi
  if [[ -z "$SNAPSHOT_KEY" ]]; then
    if [[ "$PRE_FLIP" -eq 1 ]]; then
      die "no pre-cutover snapshot under pre-flip/ in s3://${BUCKET}. That artifact is written to the DR bucket, so pass --bucket if you have not."
    fi
    die "no snapshots under routine/, hourly/ or daily/ in s3://${BUCKET} (has the backup timer ever run?). For the cutover rollback artifact, pass --pre-flip."
  fi
fi
echo "    snapshot: s3://${BUCKET}/${SNAPSHOT_KEY}"

# ── Local destination: a staging snapshot only ───────────────────────────────
if [[ -n "$TO_LOCAL" ]]; then
  umask 077
  work="$(mktemp -d)"
  cr_cleanup rm -rf -- "$work"

  echo "==> Downloading"
  "$AWS_BIN" "${AWS_ARGS[@]+"${AWS_ARGS[@]}"}" s3 cp "s3://${BUCKET}/${SNAPSHOT_KEY}" "${work}/snapshot.fetched" >/dev/null \
    || die "could not download the snapshot"
  # Detect compression rather than assume it. Every artifact this project writes
  # is now gzipped, but assuming it is what made an uncompressed pre-flip
  # artifact unreadable, and the assumption failed at the one moment it could
  # not be recovered from. Two bytes of check costs nothing.
  if [[ "$(head -c2 "${work}/snapshot.fetched" | od -An -tx1 | tr -d ' \n')" == "1f8b" ]]; then
    gunzip -c "${work}/snapshot.fetched" > "${work}/snapshot.db" || die "the snapshot did not decompress"
  else
    mv "${work}/snapshot.fetched" "${work}/snapshot.db"
  fi

  integrity="$(sqlite3 "${work}/snapshot.db" 'PRAGMA integrity_check;' 2>/dev/null || echo 'unreadable')"
  [[ "$integrity" == "ok" ]] || die "the snapshot failed its integrity check (${integrity})"

  # A count that cannot be taken is listed with sqlite3's words rather than
  # left as a placeholder nobody reads: the copy still restored, so it warns.
  if ! counts="$(sqlite3 "${work}/snapshot.db" "
    SELECT 'members=' || (SELECT COUNT(*) FROM members)
        || ' legacy_members=' || (SELECT COUNT(*) FROM legacy_members)
        || ' historical_persons=' || (SELECT COUNT(*) FROM historical_persons)
        || ' clubs=' || (SELECT COUNT(*) FROM clubs)
        || ' audit_entries=' || (SELECT COUNT(*) FROM audit_entries);
  " 2>&1)"; then
    cr_warn "the snapshot's row counts could not be read: ${counts##*$'\n'}"
    counts='(counts unavailable)'
  fi

  cp -a "${work}/snapshot.db" "$TO_LOCAL"
  echo ""
  echo "======================================================================"
  echo "  SNAPSHOT RESTORED to ${TO_LOCAL}"
  echo "  From:     s3://${BUCKET}/${SNAPSHOT_KEY}"
  echo "  Integrity check: ok"
  echo "  Contents: ${counts}"
  echo "  This is a copy of staging data. Delete it when you are done with it."
  echo "======================================================================"
  cr_proved "s3://${BUCKET}/${SNAPSHOT_KEY} passed its integrity check and is at ${TO_LOCAL}"
  cr_finish
fi

# ── Host destination: in place, behind the adapter check and a typed word ────
# This script has no --yes flag, and must not acquire one by inheritance. The
# shared library assigns ASSUME_YES unconditionally when it is sourced, so an
# exported value in the operator's shell cannot satisfy confirm_from_tty and the
# typed confirmation guarding a live member-database replacement cannot silently
# stop being asked for. This line predates that fix, when each caller was
# expected to clear the variable itself; it is harmless now because the library
# overwrites it either way.
ASSUME_YES=no
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

require_operator_stdin "scripts/restore-db.sh --target $TARGET" \
  "$SSH_ALIAS" "$TARGET" || die "no operator credential on standard input"
require_ssh_alias "$SSH_ALIAS" || die "no usable ssh alias ${SSH_ALIAS}"
require_host_is "$SSH_ALIAS" "$TARGET" || die "the host behind ${SSH_ALIAS} did not confirm it is ${TARGET}"
[[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"
[[ -r "$PRUNE_LIB" ]] || die "missing pruning helper: $PRUNE_LIB"
[[ -r "$REPORT_LIB" ]] || die "missing remote-half report library: $REPORT_LIB"

# The drill changes nothing the host serves: it restores into a scratch
# directory, starts nothing, and leaves the live database and the service alone.
# So the adapter refusal and the typed confirmation below, which both exist
# because an in-place restore replaces what the public is served, do not apply.
if (( DRILL )); then
  echo ""
  echo "Restore drill on ${SSH_ALIAS}. The live database and the service are not touched."
  echo "  snapshot: s3://${BUCKET}/${SNAPSHOT_KEY}"
  echo ""
else
HOST_ENV_FILE="$(mktemp)"
# The copy holds the host's whole env file, secrets included, so it is shredded,
# and deleted anyway when the shred fails.
shred_host_env_copy() {
  [[ -e "$HOST_ENV_FILE" ]] || return 0
  if ! shred -u -- "$HOST_ENV_FILE"; then
    cr_warn "could not shred the copy of the host env file ${HOST_ENV_FILE}; it was deleted without overwriting"
    rm -f -- "$HOST_ENV_FILE"
  fi
}
cr_cleanup shred_host_env_copy
host_env_fetch "$SSH_ALIAS" "$HOST_ENV_FILE" || die "could not read the env file on ${SSH_ALIAS}"

# A key the env file does not carry reads as unset: grep keeping no line exits
# 1, which under pipefail would otherwise end the run here without a word.
host_value() { { grep -E "^$1=" "$HOST_ENV_FILE" || [[ $? == 1 ]]; } | tail -1 | cut -d= -f2-; }
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
    cr_error "${SSH_ALIAS} has an outbound adapter armed: SES_ADAPTER=${SES_ADAPTER_ON_HOST:-unset} PAYMENT_ADAPTER=${PAYMENT_ADAPTER_ON_HOST:-unset}"
    echo "       A restored database carries the outbox and every member's address, so" >&2
    echo "       bringing it up here would mail real people from a database that is not" >&2
    echo "       the live one. Disarm the host first with scripts/arming.sh, or restore" >&2
    echo "       to a local file with --to-local instead." >&2
    exit 1
  fi
fi

echo ""
if (( ONTO_EMPTY )); then
  echo "This restores a database onto ${SSH_ALIAS}, which must have none: the host refuses"
  echo "if it finds one, and changes nothing."
else
  echo "This REPLACES the live database on ${SSH_ALIAS}."
fi
echo "  snapshot:        s3://${BUCKET}/${SNAPSHOT_KEY}"
echo "  SES adapter:     ${SES_ADAPTER_ON_HOST:-unset}"
echo "  payment adapter: ${PAYMENT_ADAPTER_ON_HOST:-unset}"
echo "The database in place is copied aside on the host first and kept for seven days."
echo ""

CONFIRM_WORD="APPLY"
confirm_from_tty "Type '${CONFIRM_WORD}' to continue: " "$CONFIRM_WORD" \
  || die "not confirmed; nothing was restored"
fi

restore_status=0
# BUCKET must cross the wire. Without it the remote half falls back to the
# host's own BACKUP_S3_BUCKET, which is the primary bucket -- so --bucket
# selected the snapshot and printed the banner above, then the host fetched
# from somewhere else. The cutover rollback lives in the DR bucket, so that
# silently restored the wrong database while displaying the right URI.
run_label="restore on ${SSH_ALIAS}"
(( DRILL )) && run_label="restore drill on ${SSH_ALIAS}"
# A cutover rollback carries the body that writes the pause levers, so the host
# writes them with the one body every lever is written by. A drill never pauses.
PAUSE_ON_HOST=0
PAUSE_BODY_B64=""
if (( PRE_FLIP && ! DRILL )); then
  PAUSE_ON_HOST=1
  PAUSE_BODY="${SCRIPT_DIR}/internal/runtime-pause-remote.sh"
  [[ -r "$PAUSE_BODY" ]] || die "missing pause body: $PAUSE_BODY"
  PAUSE_BODY_B64="$(base64 -w0 "$PAUSE_BODY")"
fi
cr_run_marked "$run_label" -- \
  send_to_host "SNAPSHOT_KEY=${SNAPSHOT_KEY}" "BUCKET=${BUCKET}" "BUCKET_REGION=${BUCKET_REGION}" "DRILL=${DRILL}" "ONTO_EMPTY=${ONTO_EMPTY}" \
    "PRE_FLIP=${PAUSE_ON_HOST}" "PAUSE_BODY_B64=${PAUSE_BODY_B64}" \
  || restore_status=$?
# Judged by the errors the host marked as well as by its exit, so a half that
# marked an error and still exited 0 is never followed by a success line.
if (( restore_status != 0 )) || (( ${#CR_ERRORS[@]} )); then
  if (( DRILL )); then
    echo "" >&2
    cr_error "the restore drill FAILED on ${SSH_ALIAS}. Nothing the host serves was changed."
    exit 1
  fi
  if (( restore_status == PENDING_EXIT )); then
    report_replay_pending
    exit 1
  fi
  echo "" >&2
  cr_error "the restore failed on ${SSH_ALIAS}."
  echo "       The remote half refuses before stopping the service, so an early" >&2
  echo "       failure changed nothing. If it failed after the stop, its own output" >&2
  echo "       names the copy it set aside and whether it restarted." >&2
  exit 1
fi

echo ""
if (( DRILL )); then
  echo "== restore drill passed on ${TARGET} =="
  echo "Record the date, the snapshot, its bucket, the counts and the elapsed time"
  echo "above: that record is the drill evidence the go-live backup and recovery"
  echo "gate asks for."
  cr_proved "s3://${BUCKET}/${SNAPSHOT_KEY} restored into scratch on ${SSH_ALIAS} and answered the member, payment and audit queries (the host half's checks)"
  cr_finish
fi
echo "== restore complete on ${TARGET} =="
echo "Record the date, the elapsed time and the outcome: that record is the drill"
echo "evidence the go-live backup and recovery gate asks for."
cr_proved "s3://${BUCKET}/${SNAPSHOT_KEY} is in place on ${SSH_ALIAS} with its erasures re-applied, and the service reported ready (the host half's checks)"
if (( PAUSE_ON_HOST )); then
  cr_proved "payments and outbound mail read back paused on the restored database before the service started (the host half's checks)"
  cr_unproved "the post-load repairs the pre-flip snapshot predates: the first administrator, the co-administrator grants, the area digest routes and owners, and the deceased flags. Redo them, and reconcile payments against Stripe and mail against the sent log, before unpausing either lever or re-arming email"
fi
cr_finish
