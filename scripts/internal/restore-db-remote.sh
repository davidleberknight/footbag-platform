#!/usr/bin/env bash
# Root-side body of scripts/restore-db.sh. Never run directly: it expects the
# variable assignments its wrapper emits ahead of this body on the same stdin
# stream, and it runs as root because the wrapper pipes it into sudo.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'SNAPSHOT_KEY=%q\n' "$key";
#     cat scripts/internal/restore-db-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# The snapshot is pulled by the HOST, not pushed through the operator's pipe.
# The host already holds the assumed-role profile that wrote the snapshot, the
# database is tens of megabytes, and shipping it back out through a workstation
# only to send it in again doubles the transfer and puts a copy of production's
# data on the operator's disk for no gain.
#
# Order matters and is the whole design. Everything that can refuse does so
# BEFORE the service is stopped: a restore that fails after the stop is an
# outage, while one that fails before it is a no-op. The snapshot is downloaded,
# decompressed and integrity-checked while the site is still serving, and only a
# snapshot that passed is allowed to reach the point where anything is replaced.
#
# The database in place is copied aside first, and the WAL is folded into it
# before that copy is taken. A copy of the main file alone would omit committed
# transactions still sitting in the write-ahead log, which is precisely the
# undo the operator would reach for if the restored snapshot turned out to be
# the wrong one.
#
# Required shell variables (provided by the caller's prepended assignments):
#   SNAPSHOT_KEY   the S3 key of the snapshot to restore
#
# Optional:
#   BUCKET         the bucket holding that key. Defaults to the host's own
#                  BACKUP_S3_BUCKET. The caller passes it for a cutover
#                  rollback, whose artifact is in the DR bucket rather than
#                  the one this host is configured with.
#   DRILL          1 for the restore drill: restore into the scratch directory,
#                  validate the data, report, and stop there. The live database,
#                  the backup timer and the service are never touched. A drill
#                  that cannot read the members or payments it restored fails,
#                  because a restore nobody can query is not a restore.
#   RESUME_ERASURE_REPLAY
#                  1 to finish a restore whose erasure replay did not complete:
#                  re-run the replay against the database in place and, only on
#                  its success, clear the pending marker, start the service and
#                  restart the backup timer. Refuses when no replay is pending.
#                  SNAPSHOT_KEY is not needed in this mode.
#
# Erasure replay pending. From the moment the snapshot is about to replace the
# database until the replay reports success, the database in place may hold
# personal data members asked to have erased. That window is marked twice: by a
# flag the exit trap reads, so an exit from inside it never restarts the backup
# timer, and by a file beside the database (.erasure-replay-pending), which
# outlives this process. The file is what keeps the window closed across a
# reboot or a deploy: the backup script refuses to run while it exists, and the
# service unit refuses to start. Both are cleared together, when the replay
# succeeds or when the previous database is put back. A run that leaves them in
# place exits 3, so the workstation half can say so in its own words.
#
# Ships with scripts/internal/prune-db-copies.sh ahead of it on the same stream,
# which defines prune_db_copies; after a restore whose service reports ready,
# that deletes set-aside database copies more than seven days old.
set -euo pipefail

# Overridable so this body also runs standalone for its tests, which point it at
# a fixture env file, the same seam the deploy guards use. On a host nothing sets
# it and the default is the only path in play.
ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
[[ -r "$ENV_PATH" ]] || { echo "ERROR: $ENV_PATH not readable." >&2; exit 1; }

# The bucket, region, profile and database directory are the host's own, read
# from the file the runtime uses, so a restore can never reach a bucket the
# running service does not itself back up to.
set -a
# shellcheck disable=SC1090
source "$ENV_PATH"
set +a

DB_DIR="${FOOTBAG_DB_DIR:-/srv/footbag/db}"
DB_FILE="${DB_DIR}/footbag.db"
MARKER="${DB_DIR}/.erasure-replay-pending"
# The exit status of a run that leaves the erasure replay pending. Distinct from
# every other failure, because it is the one that leaves backups paused and the
# site held down until an operator finishes the job.
PENDING_EXIT=3

work=""
backup_timer_paused=0
erasure_replay_pending=0
cleanup() {
  # Shredded before removal: the scratch directory holds a full copy of the
  # member database, and a deleted file's blocks otherwise stay readable.
  if [[ -n "$work" ]]; then
    find "$work" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "$work"
  fi
  # Inside the pending window the backup timer stays stopped, whatever ended
  # the run. A backup taken now would copy personal data members asked to have
  # erased into the snapshot stream, whose promoted generations replicate to an
  # object-locked bucket nobody can delete from, and would become the newest
  # restore point. The marker file keeps the backup script and the service
  # refusing after this process is gone; this is the operator's notice of it.
  if [[ "$erasure_replay_pending" == "1" ]]; then
    echo "" >&2
    echo "ERASURE REPLAY PENDING on $(hostname). Backups are PAUSED and the site is" >&2
    echo "STOPPED; neither will run while ${MARKER} exists." >&2
    echo "Once the database at ${DB_FILE} is the one to serve, finish from a" >&2
    echo "workstation with:" >&2
    echo "  bash scripts/restore-db.sh --target ${FOOTBAG_ENV:-<environment>} --resume-erasure-replay" >&2
    exit "$PENDING_EXIT"
  fi
  # Otherwise restart the backup timer on EVERY exit path, success or failure,
  # including an interrupt part-way through the restore. A timer left stopped is
  # a silent loss of the five-minute recovery point, and nothing would surface
  # it until the stale-backup alarm breached fifteen minutes later.
  if [[ "$backup_timer_paused" == "1" ]]; then
    systemctl start footbag-backup.timer || \
      echo "WARNING: could not restart footbag-backup.timer. Backups are STOPPED; start it by hand." >&2
  fi
}
# EXIT alone runs the cleanup once, and an interrupt or a termination becomes
# an exit so the run stops where it was rather than resuming after the cleanup
# has restarted the timer.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Written before the snapshot replaces anything, so even a crash between the
# replacement and the replay leaves the window marked. The flag is raised only
# once the file exists; a marker that cannot be written is a refusal while
# nothing has been replaced yet.
mark_replay_pending() {
  if ! printf 'snapshot=%s\nbucket=%s\nsince=%s\nbackup_timer_paused=%s\n' \
         "$SNAPSHOT_KEY" "$BUCKET" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$backup_timer_paused" \
         > "$MARKER"; then
    return 1
  fi
  erasure_replay_pending=1
}

# The file goes first and the flag only after it, so a marker that cannot be
# removed still exits as pending rather than restarting the backups.
clear_replay_pending() {
  rm -f "$MARKER"
  erasure_replay_pending=0
}

# Re-applies the erasures the database in place records as due, in a throwaway
# container because the stack is stopped: --no-deps so it starts nothing else,
# --rm so it leaves nothing behind. Compose files are absolute because this half
# runs over ssh with no working directory of its own, and the service unit's
# relative form would resolve against root's home instead.
#
# Judged on the replay's own "erasure-replay: ok" line, not on the exit status
# alone: a container that exits 0 without reaching the replay's verdict has not
# re-applied anything, and the status would call that a success.
run_erasure_replay() {
  local replay_status=0 replay_out
  replay_out="$(docker compose --env-file "${ENV_PATH}" \
       -f /srv/footbag/docker/docker-compose.yml \
       -f /srv/footbag/docker/docker-compose.prod.yml \
       run --rm --no-deps -T web node dist/runErasureReplay.js </dev/null 2>&1)" || replay_status=$?
  [[ -n "$replay_out" ]] && printf '%s\n' "$replay_out"
  (( replay_status == 0 )) && grep -qx 'erasure-replay: ok' <<<"$replay_out"
}

# The same readiness probe the code deploy polls after its restart: systemd
# reporting the unit active says only that compose was started, and the app
# answering its readiness route from inside the web container is what says the
# restored database is being served. Up to about twenty seconds.
wait_until_ready() {
  local _i
  for _i in 1 2 3 4 5 6 7 8 9 10; do
    if systemctl is-active --quiet footbag.service \
       && docker compose --env-file "${ENV_PATH}" \
            -f /srv/footbag/docker/docker-compose.yml \
            -f /srv/footbag/docker/docker-compose.prod.yml \
            exec -T web wget -qO- --timeout=3 http://localhost:3000/health/ready >/dev/null 2>&1 </dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# ── Resume: finish a restore whose erasure replay did not complete ───────────
if [[ "${RESUME_ERASURE_REPLAY:-0}" == "1" ]]; then
  if [[ ! -e "$MARKER" ]]; then
    echo "ERROR: no erasure replay is pending on $(hostname) (no ${MARKER})." >&2
    echo "       Nothing to resume; nothing was changed." >&2
    exit 1
  fi
  [[ -f "$DB_FILE" ]] || {
    echo "ERROR: no database at ${DB_FILE}. Put the database back before resuming;" >&2
    echo "       the marker stays, so backups stay paused and the site stays down." >&2
    exit 1
  }
  # Raised before anything runs, so a failure from here on keeps the timer
  # stopped exactly as the interrupted restore left it.
  erasure_replay_pending=1
  echo "==> Resuming the erasure replay on $(hostname)"
  sed 's/^/    /' "$MARKER" || true
  # The timer is restarted on success unless the interrupted restore recorded
  # that it was not running before the restore began.
  grep -qx 'backup_timer_paused=0' "$MARKER" || backup_timer_paused=1
  if ! run_erasure_replay; then
    echo "" >&2
    echo "ERROR: the erasure replay did not complete again; nothing was started." >&2
    exit 1
  fi
  clear_replay_pending
  echo "==> Starting the service"
  systemctl start footbag
  if ! wait_until_ready; then
    echo "ERROR: the service did not report ready within ~20s. The erasures are" >&2
    echo "       re-applied and backups resume; inspect it with" >&2
    echo "       scripts/host-diagnostics.sh." >&2
    systemctl status footbag --no-pager -l >&2 || true
    exit 1
  fi
  echo ""
  echo "======================================================================"
  echo "  ERASURE REPLAY COMPLETED on $(hostname)"
  echo "  The site is serving and backups resume."
  echo "======================================================================"
  exit 0
fi

: "${SNAPSHOT_KEY:?remote half requires SNAPSHOT_KEY}"

command -v sqlite3 >/dev/null 2>&1 || { echo "ERROR: sqlite3 CLI not installed on this host." >&2; exit 1; }
command -v aws     >/dev/null 2>&1 || { echo "ERROR: aws CLI not installed on this host." >&2; exit 1; }
# The caller's --bucket wins; the host's own BACKUP_S3_BUCKET is the fallback.
# The cutover rollback artifact lives in the DR bucket, which is not what the
# host is configured with, so without this the flag that exists to reach it was
# accepted, printed, and then dropped before the wire.
BUCKET="${BUCKET:-${BACKUP_S3_BUCKET:-}}"
[[ -n "$BUCKET" ]] || { echo "ERROR: no bucket: pass --bucket, or set BACKUP_S3_BUCKET in $ENV_PATH." >&2; exit 1; }
[[ -f "$DB_FILE" ]] || { echo "ERROR: no database at ${DB_FILE}; nothing to restore over." >&2; exit 1; }

DRILL="${DRILL:-0}"
# The drill's elapsed time is measured from here, the start of the download, to
# the end of its validation: the part of a restore the recovery-time objective
# is spent on.
SECONDS=0

umask 077
work="$(mktemp -d)"

echo "==> Fetching s3://${BUCKET}/${SNAPSHOT_KEY}"
aws s3 cp "s3://${BUCKET}/${SNAPSHOT_KEY}" "${work}/snapshot.fetched" >/dev/null \
  || { echo "ERROR: could not download the snapshot; nothing was changed." >&2; exit 1; }

# Detect compression rather than assume it, matching the local half. This is the
# in-place restore, so an assumption that fails here fails after the member
# database has already been replaced.
if [[ "$(head -c2 "${work}/snapshot.fetched" | od -An -tx1 | tr -d ' \n')" == "1f8b" ]]; then
  gunzip -c "${work}/snapshot.fetched" > "${work}/snapshot.db" \
    || { echo "ERROR: the snapshot did not decompress; nothing was changed." >&2; exit 1; }
else
  mv "${work}/snapshot.fetched" "${work}/snapshot.db"
fi

# Checked while the site is still up. A snapshot that fails here never reaches
# the part of this script that stops anything.
integrity="$(sqlite3 "${work}/snapshot.db" 'PRAGMA integrity_check;' 2>/dev/null || echo 'unreadable')"
if [[ "$integrity" != "ok" ]]; then
  echo "ERROR: the snapshot failed its integrity check (${integrity})." >&2
  echo "       Nothing was stopped and nothing was changed." >&2
  exit 1
fi

# Reported, not judged. A row count this script decided was "too low" would be a
# guess about which snapshot the operator meant; a row count they can read is
# the thing that tells them whether this is the one.
#
# Opened read-only, which is not decoration. The sqlite3 CLI opened for writing
# checkpoints a WAL database when it closes, so a reporting query would quietly
# do the job of the explicit checkpoint below, leaving that checkpoint looking
# redundant and its absence looking harmless. A query that exists to describe
# the database must not also modify it.
counts_for() {
  sqlite3 -readonly "$1" "
    SELECT 'members=' || (SELECT COUNT(*) FROM members)
        || ' legacy_members=' || (SELECT COUNT(*) FROM legacy_members)
        || ' historical_persons=' || (SELECT COUNT(*) FROM historical_persons)
        || ' clubs=' || (SELECT COUNT(*) FROM clubs)
        || ' audit_entries=' || (SELECT COUNT(*) FROM audit_entries)
        || ' legacy_claim_declines=' || (SELECT COUNT(*) FROM legacy_claim_declines);
  " 2>/dev/null || echo '(counts unavailable)'
}

echo "    snapshot integrity ok"
echo "    snapshot contents:  $(counts_for "${work}/snapshot.db")"
echo "    database in place:  $(counts_for "$DB_FILE")"

# The drill stops here, before anything the host serves is touched. What it
# proves beyond the integrity check is that the restored data answers queries:
# the members and payments are there to count, and the newest audit row says how
# recent the restored point is, which is the recovery point the drill achieved.
if [[ "$DRILL" == "1" ]]; then
  drill_row="$(sqlite3 -readonly "${work}/snapshot.db" "
    SELECT (SELECT COUNT(*) FROM members) || '|'
        || (SELECT COUNT(*) FROM payments) || '|'
        || COALESCE((SELECT MAX(occurred_at) FROM audit_entries), 'none');
  " 2>/dev/null)" || drill_row=""
  if [[ ! "$drill_row" =~ ^[0-9]+\|[0-9]+\|.+$ ]]; then
    echo "ERROR: restore drill FAILED: the restored database did not answer the member," >&2
    echo "       payment and audit queries. It passed its integrity check, but a" >&2
    echo "       restore nobody can query is not a restore." >&2
    exit 1
  fi
  IFS='|' read -r drill_members drill_payments drill_newest <<<"$drill_row"
  echo ""
  echo "======================================================================"
  echo "  RESTORE DRILL PASSED on $(hostname)"
  echo "  From:          s3://${BUCKET}/${SNAPSHOT_KEY}"
  echo "  Integrity:     ok"
  echo "  Members:       ${drill_members}"
  echo "  Payments:      ${drill_payments}"
  echo "  Newest audit:  ${drill_newest}"
  echo "  Elapsed:       ${SECONDS}s"
  echo "  The live database and the service were not touched; the scratch copy"
  echo "  is shredded as this exits."
  echo "======================================================================"
  exit 0
fi

# An earlier restore whose replay never completed left its marker, and the
# database in place is that un-replayed snapshot. Restoring over it is allowed,
# since a different snapshot may be the way out, but the window is already open:
# it stays open on every exit except this run's own replay succeeding, and
# putting "the previous database" back puts back one that was never replayed.
# The earlier run's record of whether the timer was running carries forward,
# because the timer is stopped now for a reason this run did not see.
prior_pending=0
if [[ -e "$MARKER" ]]; then
  prior_pending=1
  erasure_replay_pending=1
  grep -qx 'backup_timer_paused=0' "$MARKER" || backup_timer_paused=1
  echo "    an earlier restore's erasure replay is still pending on this host;"
  echo "    backups stay paused and the site stays down until this one's succeeds"
fi

# Stop the backup timer before anything touches the database. It fires every
# five minutes independently of this script, and footbag-backup.sh opens the
# same file: a run landing inside the critical section either takes a backup of
# a half-replaced database and ships it, or holds the file open and makes the
# checkpoint below report busy. Restarted by the cleanup trap on every exit path.
if systemctl is-active --quiet footbag-backup.timer 2>/dev/null; then
  backup_timer_paused=1
  systemctl stop footbag-backup.timer || {
    echo "ERROR: could not stop footbag-backup.timer. Refusing to restore while a" >&2
    echo "       backup may fire into the middle of it; nothing was changed." >&2
    backup_timer_paused=0
    exit 1
  }
  echo "    backup timer paused for the duration"
fi

echo "==> Stopping the service"
systemctl stop footbag

# Folded in before the copy is taken, for the same reason the migrating deploy
# does it: an unclean stop can leave committed transactions in the WAL, and a
# copy of the main file alone would silently not carry them. This copy is the
# only way back if the restored snapshot turns out to be the wrong one.
# Read the checkpoint's own result, not just sqlite3's exit status. wal_checkpoint
# returns "busy|log|checkpointed" and sets busy=1 when it could NOT complete --
# while still exiting 0. Sending that row to /dev/null and testing only the exit
# status therefore reported success for exactly the failure this guard exists to
# catch, and the copy taken next would silently omit committed transactions still
# in the WAL.
# tail -1 because `PRAGMA busy_timeout` returns a row of its own, so the output
# is two lines and the checkpoint result is the second.
checkpoint_row="$(sqlite3 "$DB_FILE" 'PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE);' 2>/dev/null | tail -1)" || checkpoint_row=""
if [[ -z "$checkpoint_row" || "${checkpoint_row%%|*}" != "0" ]]; then
  echo "ERROR: could not checkpoint the write-ahead log before setting the current" >&2
  echo "       database aside (wal_checkpoint returned '${checkpoint_row:-no result}';" >&2
  echo "       a leading 1 means it was busy and did not complete). Refusing to" >&2
  echo "       restore over a database whose copy would be incomplete." >&2
  echo "       Restarting the service; nothing was replaced." >&2
  systemctl start footbag || true
  exit 1
fi

# Free space for a second copy of the database, checked before anything is
# moved. A cp that runs out of disk mid-write leaves a truncated file, and the
# two cp calls below are the ones standing between a failed restore and a lost
# database. Refusing here costs nothing; refusing later is not an option.
# Guarded like every other risky read here, and for a sharper reason than most:
# the service is already stopped at this point. An unguarded assignment takes
# the command's status under set -e and aborts the script where it stands --
# before this block, and so before the restart below ever runs -- leaving the
# host down with none of the "nothing was replaced" messages every other refusal
# here prints. A measurement that cannot be taken is not permission to proceed.
db_kb="$(du -k "$DB_FILE" | cut -f1)" || db_kb=""
avail_kb="$(df -Pk "$(dirname "$DB_FILE")" | tail -1 | tr -s ' ' | cut -d' ' -f4)" || avail_kb=""
if [[ ! "$db_kb" =~ ^[0-9]+$ || ! "$avail_kb" =~ ^[0-9]+$ ]]; then
  echo "ERROR: could not measure the database or the free space beside it." >&2
  echo "       Refusing the restore rather than copying blind: a cp that runs out" >&2
  echo "       of disk leaves a truncated file, and this copy is the only way back." >&2
  echo "       Nothing was replaced; restarting the service." >&2
  systemctl start footbag || true
  exit 1
fi
if (( avail_kb < db_kb * 2 )); then
  echo "ERROR: not enough free space to copy the database aside." >&2
  echo "       database ${db_kb} KB, free ${avail_kb} KB, need at least $(( db_kb * 2 )) KB." >&2
  echo "       Nothing was replaced; restarting the service." >&2
  systemctl start footbag || true
  exit 1
fi

superseded="${DB_FILE}.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"
# Guarded, like every other risky step here. This copy is the only way back if
# the restored snapshot turns out to be the wrong one, so a silent failure would
# remove the fallback at the exact moment the next line destroys the original.
if ! cp -a "$DB_FILE" "$superseded"; then
  echo "ERROR: could not copy the database aside; nothing was replaced." >&2
  echo "       Restarting the service." >&2
  systemctl start footbag || true
  exit 1
fi
echo "    database in place copied to ${superseded}"

# The pending window opens here, before the database is touched: from the next
# line until the replay succeeds, what sits at the database path may hold
# personal data members asked to have erased.
if ! mark_replay_pending; then
  echo "ERROR: could not write ${MARKER}; refusing to replace the database without" >&2
  echo "       it, since nothing would then hold backups and the site off if the" >&2
  echo "       erasure replay failed. Nothing was replaced; restarting the service." >&2
  systemctl start footbag || true
  exit 1
fi

# The previous database is back in place. The window closes with it, unless an
# earlier restore's replay was already pending, in which case what came back is
# that un-replayed snapshot and the window stays open.
previous_database_back() {
  if (( prior_pending == 0 )); then
    clear_replay_pending
    systemctl start footbag || true
  fi
}

# The sidecars belong to the file being replaced, and a WAL left beside a
# different database is how a restore turns into corruption.
rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
if ! cp -a "${work}/snapshot.db" "$DB_FILE"; then
  echo "ERROR: could not put the snapshot in place. The database that was here is" >&2
  echo "       intact at ${superseded}; putting it back and restarting." >&2
  rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
  if ! cp -a "$superseded" "$DB_FILE"; then
    echo "ERROR: restoring the previous database ALSO failed. It is intact at" >&2
    echo "       ${superseded} and must be put back by hand before the site is used." >&2
    exit 1
  fi
  previous_database_back
  exit 1
fi

# The containers run as an unprivileged account, and a database root owns is a
# database the application cannot write.
db_owner="$(stat -c '%u:%g' "$superseded")"
chown "$db_owner" "$DB_FILE"
chmod 600 "$DB_FILE"

restored_integrity="$(sqlite3 "$DB_FILE" 'PRAGMA integrity_check;' 2>/dev/null || echo 'unreadable')"
if [[ "$restored_integrity" != "ok" ]]; then
  echo "ERROR: the restored database failed its integrity check in place (${restored_integrity})." >&2
  echo "       Putting the previous database back and restarting." >&2
  rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
  if ! cp -a "$superseded" "$DB_FILE"; then
    echo "ERROR: putting the previous database back ALSO failed. It is intact at" >&2
    echo "       ${superseded} and must be restored by hand before the service is used." >&2
    exit 1
  fi
  chown "$db_owner" "$DB_FILE"
  previous_database_back
  exit 1
fi

# Re-apply the erasures the restored snapshot records as due, while the stack
# is still down. A snapshot can hold an account that was already soft-deleted,
# or flagged deceased, and past its grace window when the snapshot was taken,
# while the purge that followed, and the ledger row saying it was applied, came
# after it and vanished with the restore. Those conditions come back with the
# snapshot, which is what makes replaying both safe and possible. A deletion
# requested after the snapshot is not in it at all, so neither this replay nor
# the daily retention pass, which reads the same restored state, can recover it.
#
# Fatal, and the site stays stopped: a failed replay leaves erased personal data
# in a database the site would serve, and erasure that fails on any persistent
# surface is not an acceptable state to come back up in. The restored database
# stays in place, the pending marker keeps backups and the service refusing,
# and the exit trap names the one command that finishes the job.
echo "==> Re-applying erasures recorded in the restored snapshot"
if ! run_erasure_replay; then
  echo "" >&2
  echo "ERROR: the erasure replay did not complete, so the site has been left" >&2
  echo "       STOPPED. The restored database is in place and may carry personal" >&2
  echo "       data a member asked to have erased. The database it replaced is at" >&2
  echo "       ${superseded}." >&2
  exit 1
fi
clear_replay_pending

echo "==> Restarting the service"
systemctl start footbag

# Old copies are pruned only once the restored database is being served: a
# restore that has not come up is one whose operator may still need every copy
# on the host, including the ones a week old.
if ! wait_until_ready; then
  echo "ERROR: the service did not report ready within ~20s. The restored database" >&2
  echo "       is in place with its erasures re-applied, and backups resume. The" >&2
  echo "       database it replaced is at ${superseded}. Inspect the service with" >&2
  echo "       scripts/host-diagnostics.sh; no old copies were pruned." >&2
  systemctl status footbag --no-pager -l >&2 || true
  exit 1
fi

# A prune that fails costs disk, not data, so it warns and never fails a
# restore that has already succeeded.
if declare -F prune_db_copies >/dev/null; then
  echo "==> Pruning database copies older than seven days"
  prune_db_copies "$DB_DIR" \
    || echo "WARNING: pruning old database copies did not complete; some may remain in ${DB_DIR}. The restore itself succeeded." >&2
else
  echo "WARNING: the copy-pruning helper did not arrive with this body; old database copies in ${DB_DIR} were left alone." >&2
fi

echo ""
echo "======================================================================"
echo "  DATABASE RESTORED on $(hostname)"
echo "  From:     s3://${BUCKET}/${SNAPSHOT_KEY}"
echo "  Contents: $(counts_for "$DB_FILE")"
echo "  The database this replaced is at ${superseded}"
echo "  It is the way back for seven days, after which the first deploy or"
echo "  restore deletes it."
echo "======================================================================"
echo ""
