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
#   SNAPSHOT_KEY   the S3 key of the snapshot to restore, within the host's
#                  own BACKUP_S3_BUCKET
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
[[ -n "${BACKUP_S3_BUCKET:-}" ]] || { echo "ERROR: BACKUP_S3_BUCKET is not set in $ENV_PATH." >&2; exit 1; }
[[ -f "$DB_FILE" ]] || { echo "ERROR: no database at ${DB_FILE}; nothing to restore over." >&2; exit 1; }

umask 077
work="$(mktemp -d)"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT INT TERM

echo "==> Fetching s3://${BACKUP_S3_BUCKET}/${SNAPSHOT_KEY}"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${SNAPSHOT_KEY}" "${work}/snapshot.db.gz" >/dev/null \
  || { echo "ERROR: could not download the snapshot; nothing was changed." >&2; exit 1; }

gunzip -c "${work}/snapshot.db.gz" > "${work}/snapshot.db" \
  || { echo "ERROR: the snapshot did not decompress; nothing was changed." >&2; exit 1; }

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

echo "==> Stopping the service"
systemctl stop footbag

# Folded in before the copy is taken, for the same reason the migrating deploy
# does it: an unclean stop can leave committed transactions in the WAL, and a
# copy of the main file alone would silently not carry them. This copy is the
# only way back if the restored snapshot turns out to be the wrong one.
sqlite3 "$DB_FILE" 'PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null || {
  echo "ERROR: could not checkpoint the write-ahead log before setting the current" >&2
  echo "       database aside. Refusing to restore over a database whose copy would" >&2
  echo "       be incomplete. Restarting the service; nothing was replaced." >&2
  systemctl start footbag || true
  exit 1
}

superseded="${DB_FILE}.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$DB_FILE" "$superseded"
echo "    database in place copied to ${superseded}"

# The sidecars belong to the file being replaced, and a WAL left beside a
# different database is how a restore turns into corruption.
rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
cp -a "${work}/snapshot.db" "$DB_FILE"

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
  cp -a "$superseded" "$DB_FILE"
  chown "$db_owner" "$DB_FILE"
  systemctl start footbag || true
  exit 1
fi

echo "==> Restarting the service"
systemctl start footbag

echo ""
echo "======================================================================"
echo "  DATABASE RESTORED on $(hostname)"
echo "  From:     s3://${BACKUP_S3_BUCKET}/${SNAPSHOT_KEY}"
echo "  Contents: $(counts_for "$DB_FILE")"
echo "  The database this replaced is at ${superseded}"
echo "  It is not cleaned up automatically: it is the only way back."
echo "======================================================================"
echo ""
