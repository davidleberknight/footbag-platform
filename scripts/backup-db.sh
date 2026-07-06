#!/usr/bin/env bash
# scripts/backup-db.sh -- routine SQLite backup producer (host-side).
#
# Checkpoints the WAL into the main file, snapshots the live SQLite file with
# `sqlite3 .backup`, gzips it, uploads it to the primary snapshots bucket under
# routine/YYYY/MM/DD/ with bounded retry, and emits two CloudWatch metrics:
# BackupAgeMinutes (the db-backup-stale alarm watches it; threshold 15 minutes,
# treat_missing_data=breaching) and BackupConsecutiveFailures (raised once a run
# fails three times in a row so a persistently failing backup surfaces even
# while older snapshots keep the age metric healthy). Cross-region DR copies of
# the routine stream ride the bucket's S3 replication; the pre-cutover snapshot
# script uploads its own artifact to a distinct DR path so routine retention
# never ages it out.
#
# Invoked by ops/systemd/footbag-backup.timer every 5 minutes. Requires the
# sqlite3 CLI on the host (apt-get install -y sqlite3) and the aws CLI with
# the assumed-role AWS_PROFILE chain configured in /root/.aws.
#
# Env (from /srv/footbag/env via the systemd unit):
#   FOOTBAG_DB_DIR    host dir holding footbag.db   (default /srv/footbag/db)
#   BACKUP_S3_BUCKET  primary snapshots bucket name (required; production
#                     "<prefix>-db-snapshots", staging "<prefix>-snapshots")
#   AWS_PROFILE       assumed-role source profile   (required by the aws CLI)
#   AWS_REGION        bucket + metric region
#   FOOTBAG_ENV       CloudWatch namespace suffix (Footbag/${FOOTBAG_ENV})

# No `-e`: operational failures are handled explicitly so a failed run can bump
# the consecutive-failure counter and raise its metric before exiting non-zero.
set -uo pipefail

DB_DIR="${FOOTBAG_DB_DIR:-/srv/footbag/db}"
DB_FILE="${DB_DIR}/footbag.db"
# Health timestamp: epoch of the last SUCCESSFUL backup (drives BackupAgeMinutes).
STATE_FILE="${FOOTBAG_BACKUP_STATE:-${DB_DIR}/.last-backup-epoch}"
# Consecutive-failure counter, reset to 0 on every success.
FAIL_FILE="${FOOTBAG_BACKUP_FAIL_STATE:-${DB_DIR}/.backup-consecutive-failures}"
# A WAL checkpoint waits up to this long for in-flight writers to release the
# lock, so the snapshot drains active transactions rather than racing them.
CHECKPOINT_BUSY_TIMEOUT_MS="${FOOTBAG_BACKUP_BUSY_TIMEOUT_MS:-30000}"
UPLOAD_MAX_ATTEMPTS=3

fail() { echo "backup-db: $*" >&2; exit 1; }

put_metric() {
  # Best-effort: a metric-publish failure must not mask the backup outcome.
  aws cloudwatch put-metric-data \
    --namespace "Footbag/${FOOTBAG_ENV}" \
    --metric-name "$1" --value "$2" --unit None >/dev/null 2>&1 || true
}

record_failure() {
  local reason="$1"
  local count=1
  if [[ -f "${FAIL_FILE}" ]]; then
    local prev
    prev=$(cat "${FAIL_FILE}" 2>/dev/null || echo 0)
    [[ "${prev}" =~ ^[0-9]+$ ]] && count=$(( prev + 1 ))
  fi
  echo "${count}" > "${FAIL_FILE}"
  put_metric BackupConsecutiveFailures "${count}"
  echo "backup-db: FAILURE (${count} consecutive): ${reason}" >&2
  exit 1
}

command -v sqlite3 >/dev/null || fail "sqlite3 CLI not installed (apt-get install -y sqlite3)"
command -v aws >/dev/null     || fail "aws CLI not installed"
[[ -f "${DB_FILE}" ]]         || fail "DB file not found: ${DB_FILE}"
[[ -n "${BACKUP_S3_BUCKET:-}" ]] || fail "BACKUP_S3_BUCKET is not set in /srv/footbag/env"
[[ -n "${FOOTBAG_ENV:-}" ]]      || fail "FOOTBAG_ENV is not set"

WORK_DIR=$(mktemp -d /tmp/footbag-backup.XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

TS=$(date -u +%Y%m%dT%H%M%SZ)
DAY_PREFIX=$(date -u +%Y/%m/%d)
SNAP="${WORK_DIR}/footbag-${TS}.db"

# 1. Fold the WAL back into the main DB file. busy_timeout makes the checkpoint
#    wait for in-flight writers instead of failing fast under contention.
sqlite3 "${DB_FILE}" "PRAGMA busy_timeout=${CHECKPOINT_BUSY_TIMEOUT_MS}; PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null \
  || record_failure "WAL checkpoint failed"

# 2. Consistent point-in-time snapshot (safe against in-flight writes).
sqlite3 "${DB_FILE}" ".backup '${SNAP}'" \
  || record_failure "sqlite .backup failed"

integrity=$(sqlite3 "${SNAP}" "PRAGMA integrity_check;" 2>/dev/null || echo "unreadable")
[[ "${integrity}" == "ok" ]] || record_failure "snapshot integrity check failed: ${integrity}"

gzip -9 "${SNAP}" || record_failure "gzip failed"
KEY="routine/${DAY_PREFIX}/footbag-${TS}.db.gz"

# 3. Upload with bounded retry and exponential backoff (1s, 2s between tries).
uploaded=0
for attempt in $(seq 1 "${UPLOAD_MAX_ATTEMPTS}"); do
  if aws s3 cp --only-show-errors "${SNAP}.gz" "s3://${BACKUP_S3_BUCKET}/${KEY}"; then
    uploaded=1
    break
  fi
  echo "backup-db: upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} failed" >&2
  (( attempt < UPLOAD_MAX_ATTEMPTS )) && sleep $(( 2 ** (attempt - 1) ))
done
[[ "${uploaded}" -eq 1 ]] || record_failure "S3 upload failed after ${UPLOAD_MAX_ATTEMPTS} attempts"

# 4. Success: clear the failure counter and refresh the health timestamp.
echo "0" > "${FAIL_FILE}" 2>/dev/null || true
put_metric BackupConsecutiveFailures 0

NOW_EPOCH=$(date -u +%s)
AGE_MINUTES=0
if [[ -f "${STATE_FILE}" ]]; then
  PREV_EPOCH=$(cat "${STATE_FILE}" 2>/dev/null || echo "${NOW_EPOCH}")
  if [[ "${PREV_EPOCH}" =~ ^[0-9]+$ ]]; then
    AGE_MINUTES=$(( (NOW_EPOCH - PREV_EPOCH) / 60 ))
    (( AGE_MINUTES < 0 )) && AGE_MINUTES=0
  fi
fi
echo "${NOW_EPOCH}" > "${STATE_FILE}"
put_metric BackupAgeMinutes "${AGE_MINUTES}"

echo "backup-db: uploaded s3://${BACKUP_S3_BUCKET}/${KEY} (age since previous: ${AGE_MINUTES}m)"
