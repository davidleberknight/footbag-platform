#!/usr/bin/env bash
# scripts/backup-db.sh -- routine SQLite backup producer (host-side).
#
# Checkpoints the WAL into the main file, snapshots the live SQLite file with
# `sqlite3 .backup`, gzips it, uploads it to the primary snapshots bucket under
# routine/YYYY/MM/DD/ with bounded retry, and emits two CloudWatch metrics:
# BackupAgeMinutes (the db-backup-stale alarm watches it; threshold 15 minutes,
# treat_missing_data=breaching) and BackupConsecutiveFailures (raised once a run
# fails three times in a row so a persistently failing backup surfaces even
# while older snapshots keep the age metric healthy).
#
# Retention generations. Every run writes routine/, which the bucket lifecycle keeps
# for two days. The first run of each hour is additionally copied to hourly/ and
# the first run of each day to daily/, so the history thins with age: fine grain
# for the last two days, hourly for a month, daily for just over a year. The
# copies are server-side, so a promotion moves no bytes out of S3. Without the
# generations the stream is roughly a hundred gigabytes of near-identical full copies
# at any moment and still falls off a cliff at the routine window, which is the
# wrong shape both ways: nobody needs six-minute precision three weeks back, and
# a corruption found after the window has nothing to restore from at all.
#
# "First of the window" is decided by asking S3 whether that window already
# holds a point, so a missed or failed promotion simply happens on the next run
# instead of losing the generation. A promotion that fails raises
# BackupPromotionFailures but never fails the run: the snapshot itself is
# already safe, and failing here would raise the consecutive-failure alarm for
# something the alarm does not mean.
#
# Cross-region DR copies ride the bucket's S3 replication, which is scoped to
# the promoted generations: the off-region copy carries hourly and daily points, not
# the six-minute stream. Losing the region therefore costs up to an hour rather
# than up to six minutes, which is the accepted trade for the transfer cost of
# replicating every snapshot. The pre-cutover snapshot script uploads its own
# artifact to a distinct DR path so routine retention never ages it out.
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
# Derived from TS rather than read from a second clock call, so the key and the
# day prefix cannot disagree. Two calls straddling UTC midnight would file a
# 23:59 snapshot under the next day and promote it as that day's point, after
# which the real first run of the day finds the prefix occupied and skips.
DAY_PREFIX="${TS:0:4}/${TS:4:2}/${TS:6:2}"
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

# 5. Retention generations. Copy this snapshot into hourly/ and daily/ when it is the
#    first of its window. The probe asks S3 rather than keeping local state, so
#    a host rebuild, a clock step, or a skipped run cannot leave a window
#    permanently unfilled: the next run in that window promotes instead.
promotion_failed=0

maybe_promote() {
  local probe_prefix="$1" dest_key="$2" generation="$3" found
  found=$(aws s3api list-objects-v2 --bucket "${BACKUP_S3_BUCKET}" \
            --prefix "${probe_prefix}" --max-keys 1 \
            --query 'length(Contents || `[]`)' --output text 2>/dev/null)
  if [[ -z "${found}" ]]; then
    echo "backup-db: ${generation} retention probe failed; run left unpromoted" >&2
    promotion_failed=1
    return
  fi
  # A point already exists for this window; nothing to do.
  [[ "${found}" != "0" ]] && return
  # Server-side copy: the object never leaves S3, so this costs one request.
  #
  # `aws s3api copy-object` rather than the friendlier `aws s3 cp`. Above the
  # CLI's multipart threshold, which a snapshot of this size crosses, `cp`
  # reassembles the object part by part and copies its tags across itself, so it
  # calls s3:GetObjectTagging and s3:PutObjectTagging, neither of which this
  # role grants: it is scoped to reading and writing snapshot objects and
  # nothing else. Below that threshold the same command needs neither, so the
  # failure would arrive the day the database grew rather than the day the code
  # changed. CopyObject carries tags server-side without the caller touching
  # them, so it does the same job inside the permissions the backup already
  # holds, at any size, instead of widening the role to suit a wrapper.
  if aws s3api copy-object --bucket "${BACKUP_S3_BUCKET}" \
       --copy-source "${BACKUP_S3_BUCKET}/${KEY}" \
       --key "${dest_key}" --output text >/dev/null; then
    echo "backup-db: promoted to ${dest_key}"
  else
    echo "backup-db: ${generation} promotion failed for ${dest_key}" >&2
    promotion_failed=1
  fi
}

# TS is YYYYMMDDTHHMMSSZ, so the first 11 characters pin the hour window.
maybe_promote "hourly/${DAY_PREFIX}/footbag-${TS:0:11}" \
              "hourly/${DAY_PREFIX}/footbag-${TS}.db.gz" hourly
maybe_promote "daily/${DAY_PREFIX}/" \
              "daily/${DAY_PREFIX}/footbag-${TS}.db.gz" daily

put_metric BackupPromotionFailures "${promotion_failed}"

echo "backup-db: uploaded s3://${BACKUP_S3_BUCKET}/${KEY} (age since previous: ${AGE_MINUTES}m)"
