#!/usr/bin/env bash
# scripts/backup-db.sh -- routine SQLite backup producer (host-side).
#
# Snapshots the live SQLite file with `sqlite3 .backup` (WAL-safe), gzips it,
# uploads it to the primary snapshots bucket under routine/YYYY/MM/DD/, and
# emits the BackupAgeMinutes CloudWatch metric that the db-backup-stale alarm
# watches (namespace Footbag/${FOOTBAG_ENV}, no dimensions, alarm threshold
# 15 minutes with treat_missing_data=breaching). Cross-region DR copies of
# the routine stream ride the bucket's S3 replication; the pre-cutover
# snapshot script uploads its own artifact to a distinct DR path so routine
# retention never ages it out.
#
# Invoked by ops/systemd/footbag-backup.timer every 5 minutes. Requires the
# sqlite3 CLI on the host (apt-get install -y sqlite3) and the aws CLI with
# the assumed-role AWS_PROFILE chain configured in /root/.aws.
#
# Env (from /srv/footbag/env via the systemd unit):
#   FOOTBAG_DB_DIR    host dir holding footbag.db   (default /srv/footbag/db)
#   BACKUP_S3_BUCKET  primary snapshots bucket name (required; the
#                     "<prefix>-db-snapshots" bucket from terraform)
#   AWS_PROFILE       assumed-role source profile   (required by the aws CLI)
#   AWS_REGION        bucket + metric region
#   FOOTBAG_ENV       CloudWatch namespace suffix (Footbag/${FOOTBAG_ENV})

set -euo pipefail

DB_DIR="${FOOTBAG_DB_DIR:-/srv/footbag/db}"
DB_FILE="${DB_DIR}/footbag.db"
STATE_FILE="${FOOTBAG_BACKUP_STATE:-${DB_DIR}/.last-backup-epoch}"

fail() { echo "backup-db: $*" >&2; exit 1; }

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

# .backup flushes WAL into the copy and is safe against in-flight writes.
sqlite3 "${DB_FILE}" ".backup '${SNAP}'"

integrity=$(sqlite3 "${SNAP}" "PRAGMA integrity_check;")
[[ "${integrity}" == "ok" ]] || fail "snapshot integrity check failed: ${integrity}"

gzip -9 "${SNAP}"
KEY="routine/${DAY_PREFIX}/footbag-${TS}.db.gz"
aws s3 cp --only-show-errors "${SNAP}.gz" "s3://${BACKUP_S3_BUCKET}/${KEY}"

# Minutes since the previous successful backup (0 on the first run). The
# alarm breaches above 15 or when the metric goes missing, so a dead timer,
# a failing upload, and a wedged host all surface the same way.
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

aws cloudwatch put-metric-data \
  --namespace "Footbag/${FOOTBAG_ENV}" \
  --metric-name BackupAgeMinutes \
  --value "${AGE_MINUTES}" \
  --unit None

echo "backup-db: uploaded s3://${BACKUP_S3_BUCKET}/${KEY} (age since previous: ${AGE_MINUTES}m)"
