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
set -euo pipefail

: "${SNAPSHOT_KEY:?remote half requires SNAPSHOT_KEY}"

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

command -v sqlite3 >/dev/null 2>&1 || { echo "ERROR: sqlite3 CLI not installed on this host." >&2; exit 1; }
command -v aws     >/dev/null 2>&1 || { echo "ERROR: aws CLI not installed on this host." >&2; exit 1; }
# The caller's --bucket wins; the host's own BACKUP_S3_BUCKET is the fallback.
# The cutover rollback artifact lives in the DR bucket, which is not what the
# host is configured with, so without this the flag that exists to reach it was
# accepted, printed, and then dropped before the wire.
BUCKET="${BUCKET:-${BACKUP_S3_BUCKET:-}}"
[[ -n "$BUCKET" ]] || { echo "ERROR: no bucket: pass --bucket, or set BACKUP_S3_BUCKET in $ENV_PATH." >&2; exit 1; }
[[ -f "$DB_FILE" ]] || { echo "ERROR: no database at ${DB_FILE}; nothing to restore over." >&2; exit 1; }

umask 077
work="$(mktemp -d)"
backup_timer_paused=0
cleanup() {
  rm -rf "$work"
  # Restart the backup timer on EVERY exit path, success or failure, including
  # an interrupt part-way through the restore. A timer left stopped is a silent
  # loss of the five-minute recovery point, and nothing would surface it until
  # the stale-backup alarm breached fifteen minutes later.
  if [[ "$backup_timer_paused" == "1" ]]; then
    systemctl start footbag-backup.timer || \
      echo "WARNING: could not restart footbag-backup.timer. Backups are STOPPED; start it by hand." >&2
  fi
}
trap cleanup EXIT INT TERM

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
        || ' auto_link_staged_candidates=' || (SELECT COUNT(*) FROM auto_link_staged_candidates);
  " 2>/dev/null || echo '(counts unavailable)'
}

echo "    snapshot integrity ok"
echo "    snapshot contents:  $(counts_for "${work}/snapshot.db")"
echo "    database in place:  $(counts_for "$DB_FILE")"

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
db_kb="$(du -k "$DB_FILE" | cut -f1)"
avail_kb="$(df -Pk "$(dirname "$DB_FILE")" | tail -1 | tr -s ' ' | cut -d' ' -f4)"
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

# The sidecars belong to the file being replaced, and a WAL left beside a
# different database is how a restore turns into corruption.
rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
if ! cp -a "${work}/snapshot.db" "$DB_FILE"; then
  echo "ERROR: could not put the snapshot in place. The database that was here is" >&2
  echo "       intact at ${superseded}; putting it back and restarting." >&2
  rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
  cp -a "$superseded" "$DB_FILE" || echo "ERROR: restoring the previous database ALSO failed. It is at ${superseded}." >&2
  systemctl start footbag || true
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
  systemctl start footbag || true
  exit 1
fi

# Re-apply erasures the restored snapshot has forgotten, while the stack is
# still down. A snapshot taken before an erasure carries the personal data that
# erasure removed, and the ledger row saying it was applied lives in that same
# database, so both vanish together. The conditions that justified the erasure
# come back too -- the account is still soft-deleted, or still flagged deceased,
# and still past its grace window -- which is what makes replaying safe as well
# as necessary. The daily retention pass would catch this eventually; running it
# here is the difference between serving a member's erased data for a few
# seconds and serving it until tomorrow.
#
# A throwaway container because the stack is stopped: --no-deps so it starts
# nothing else, --rm so it leaves nothing behind. Compose files are absolute
# because this half runs over ssh with no working directory of its own, and the
# service unit's relative form would resolve against root's home instead.
# Not fatal to the restore, and deliberately so: the database is already in
# place, and refusing to start the site would turn a privacy gap into an
# outage. It is loud instead.
echo "==> Re-applying erasures recorded after this snapshot was taken"
if ! docker compose --env-file "${ENV_PATH}" \
     -f /srv/footbag/docker/docker-compose.yml \
     -f /srv/footbag/docker/docker-compose.prod.yml \
     run --rm --no-deps -T web node dist/runErasureReplay.js </dev/null; then
  echo "WARNING: the erasure replay did not complete. The restored database may" >&2
  echo "         carry personal data that was erased after this snapshot was" >&2
  echo "         taken. Re-run it, or run the purge by hand, before the site" >&2
  echo "         takes member traffic." >&2
fi

echo "==> Restarting the service"
systemctl start footbag

echo ""
echo "======================================================================"
echo "  DATABASE RESTORED on $(hostname)"
echo "  From:     s3://${BUCKET}/${SNAPSHOT_KEY}"
echo "  Contents: $(counts_for "$DB_FILE")"
echo "  The database this replaced is at ${superseded}"
echo "  It is not cleaned up automatically: it is the only way back."
echo "======================================================================"
echo ""
