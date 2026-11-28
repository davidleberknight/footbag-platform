#!/usr/bin/env bash
# scripts/backup-db.sh -- routine SQLite backup producer (host-side).
#
# Copies the live SQLite database with `VACUUM INTO`, checks the copy's
# integrity, gzips it, uploads it to the primary snapshots bucket under
# routine/YYYY/MM/DD/ with bounded retry, and emits three CloudWatch metrics:
# BackupAgeMinutes (the db-backup-stale alarm watches it; threshold 15 minutes,
# treat_missing_data=breaching), BackupConsecutiveFailures (the count of
# consecutive failed runs, published on every run and zero on success; the
# db-backup-failing alarm fires at three, so a persistently failing backup
# surfaces even while older snapshots keep the age metric healthy), and
# BackupPromotionFailures (the db-backup-promotion-failing alarm watches it, and
# fires only when every run in an hour failed to promote; see the retention
# generations below).
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
# something the alarm does not mean. It answers to an alarm of its own instead,
# on every run in an hour failing, which is the state where the generations stop
# advancing and the recovery window collapses to the routine/ window alone.
#
# The copy. `VACUUM INTO` writes a consistent snapshot of the database from one
# read transaction, including every committed change still in the write-ahead
# log, so no checkpoint is needed first and none is run: a checkpoint changes
# nothing about what the copy holds, and a reader holding the database open
# blocks it for the whole busy timeout on every run. `.backup` is not used
# because it copies page by page and starts over whenever another process
# commits, so while members are writing it can run indefinitely without
# finishing. Needs sqlite3 3.27 or newer; the host's version is the pinned one.
#
# Only a continuation of the stored history is uploaded. A host rebuilt from a
# day-old disk snapshot boots with a day-old database and this timer running, and
# its upload would otherwise become the newest snapshot, be promoted, replicate
# into the object-locked bucket, and be what the next restore puts back. Each
# upload records, as object metadata, the id and time of the database's newest
# audit row that the testkit can neither write nor delete (LINEAGE_ROWS below);
# a run uploads only if the database still holds the row recorded on the newest
# stored snapshot. Those audit rows are never removed, so a continuation
# always holds it and a stale or foreign copy never does, however many rows its
# own worker writes after boot. A timestamp comparison would not do: a day-old
# database's daily jobs all fall due at once and stamp fresh audit rows within
# minutes. A database deliberately put back (a restore, a rebuild deploy) carries
# a single-use declared-restore marker beside it, written by the script that put
# it there; it lets one upload through, is consumed by it, and expires after six
# hours so a disk snapshot that caught one in flight cannot revive it. The newest
# stored snapshot is read from the bucket, not from local state, because local
# state is exactly what a disk snapshot brings back stale.
#
# A run killed by a signal, including the final backup the service unit takes on
# stop, counts as a failed run, so a backup that is killed every time raises the
# consecutive-failure metric instead of leaving only a journal line.
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
# How long the copy waits if its read lock is momentarily busy (a writer
# recovering the log, the application's own checkpoint at shutdown) before it
# counts as a failed run. Matches the application's 30-second transaction cap.
COPY_BUSY_TIMEOUT_MS="${FOOTBAG_BACKUP_BUSY_TIMEOUT_MS:-30000}"
UPLOAD_MAX_ATTEMPTS=3
# Written by a restore or a rebuild deploy that put this database in place on
# purpose; lets one upload through without the lineage check.
DECLARED_RESTORE="${DB_DIR}/.declared-restore"
# The generations searched for the newest stored snapshot, newest-grained first.
LINEAGE_PREFIXES=(routine/ hourly/ daily/)

fail() { echo "backup-db: $*" >&2; exit 1; }

# Every AWS call is bounded, so a hung connection fails this run, which counts
# it and leaves the timer free for the next one, instead of holding the backup
# until the service manager's own start limit kills it. A call that runs out
# exits 124 and is handled like any other failed call.
BACKUP_AWS_TIMEOUT_SECS="${BACKUP_AWS_TIMEOUT_SECS:-60}"
aws() {
  local real
  real="$(type -P aws)" || return 127
  # --foreground keeps the call in this script's process group, so a stop
  # signalled to the run (the service manager's, an operator's) reaches it too.
  timeout --foreground --kill-after=10 "${BACKUP_AWS_TIMEOUT_SECS}" "$real" "$@"
}

put_metric() {
  # Best-effort: a metric-publish failure must not mask the backup outcome. It
  # is still logged with the CLI's own reason, because an alarm fed by a metric
  # that silently stopped arriving reads as healthy or as missing data, and the
  # journal is the only place that says why.
  local err
  if ! err="$(aws cloudwatch put-metric-data \
    --namespace "Footbag/${FOOTBAG_ENV}" \
    --metric-name "$1" --value "$2" --unit None 2>&1 >/dev/null)"; then
    echo "backup-db: metric $1 was not published: $(tail -n 1 <<<"${err:-no output from the aws CLI}")" >&2
  fi
}

record_failure() {
  local reason="$1"
  local count=1
  if [[ -f "${FAIL_FILE}" ]]; then
    local prev
    prev=$(cat "${FAIL_FILE}" 2>/dev/null || echo 0)
    [[ "${prev}" =~ ^[0-9]+$ ]] && count=$(( prev + 1 ))
  fi
  # A counter that cannot be written still leaves the failure metric to publish,
  # so the write is logged with the shell's reason rather than ending the run.
  local write_err
  if ! write_err="$( { echo "${count}" > "${FAIL_FILE}"; } 2>&1 )"; then
    echo "backup-db: consecutive-failure counter ${FAIL_FILE} was not written: $(tail -n 1 <<<"${write_err:-no message from the shell}")" >&2
  fi
  put_metric BackupConsecutiveFailures "${count}"
  echo "backup-db: FAILURE (${count} consecutive): ${reason}" >&2
  exit 1
}

command -v sqlite3 >/dev/null || fail "sqlite3 CLI not installed (apt-get install -y sqlite3)"
command -v aws >/dev/null     || fail "aws CLI not installed"
[[ -f "${DB_FILE}" ]]         || fail "DB file not found: ${DB_FILE}"
[[ -n "${BACKUP_S3_BUCKET:-}" ]] || fail "BACKUP_S3_BUCKET is not set in /srv/footbag/env"
[[ -n "${FOOTBAG_ENV:-}" ]]      || fail "FOOTBAG_ENV is not set"

# A restore that has put a snapshot in place but not yet re-applied the
# erasures it records leaves this marker beside the database. Backing that
# database up would copy personal data a member asked to have erased into the
# snapshot stream, whose promoted generations replicate to an object-locked
# bucket nobody can delete from, and would make it the newest restore point.
# Refused as a failed run, so the consecutive-failure metric rises and the
# pause is visible rather than silent; nothing is uploaded.
[[ -e "${DB_DIR}/.erasure-replay-pending" ]] \
  && record_failure "a restore's erasure replay has not completed (${DB_DIR}/.erasure-replay-pending); refusing to back up. Finish it with scripts/restore-db.sh --target ${FOOTBAG_ENV} --resume-erasure-replay"

WORK_DIR=$(mktemp -d /tmp/footbag-backup.XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT
# A signal ends the run as a counted failure and then through the EXIT trap,
# never through bash's own fatal-signal handling, where a second signal can cut
# the cleanup short. The traps are cleared first so the failure is recorded once.
trap "trap '' HUP INT TERM; record_failure 'killed by SIGHUP'" HUP
trap "trap '' HUP INT TERM; record_failure 'killed by SIGINT'" INT
trap "trap '' HUP INT TERM; record_failure 'killed by SIGTERM'" TERM

TS=$(date -u +%Y%m%dT%H%M%SZ)
# Derived from TS rather than read from a second clock call, so the key and the
# day prefix cannot disagree. Two calls straddling UTC midnight would file a
# 23:59 snapshot under the next day and promote it as that day's point, after
# which the real first run of the day finds the prefix occupied and skips.
DAY_PREFIX="${TS:0:4}/${TS:4:2}/${TS:6:2}"
SNAP="${WORK_DIR}/footbag-${TS}.db"

# 1. Consistent point-in-time copy from one read transaction, write-ahead log
#    included. The busy_timeout pragma prints its value, hence the redirect.
sqlite3 "${DB_FILE}" "PRAGMA busy_timeout=${COPY_BUSY_TIMEOUT_MS}; VACUUM INTO '${SNAP}';" >/dev/null \
  || record_failure "snapshot (VACUUM INTO) failed"

integrity=$(sqlite3 "${SNAP}" "PRAGMA integrity_check;" 2>/dev/null || echo "unreadable")
[[ "${integrity}" == "ok" ]] || record_failure "snapshot integrity check failed: ${integrity}"

# 2. Lineage: upload only a continuation of the stored history, or a database
#    a restore or rebuild declared it put in place on purpose.
AWS_ERR="${WORK_DIR}/aws.err"
TS_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
ID_RE='^[A-Za-z0-9_]+$'
last_aws_error() { tail -n 1 "${AWS_ERR}" 2>/dev/null || true; }

# The audit rows that can serve as the lineage record: every row except those
# the testkit writes or the persona rebuild deletes. On staging a code-only
# deploy rebuilds the personas, and the rebuild deletes the persona switch and
# finance-journey rows it wrote, the rows the persona seed wrote under its
# dev-shortcuts/personas marker, and every row a persona member (an id starting
# member_persona_) was the actor of. A record naming such a row would be deleted
# under the next backup, which would then refuse a database that does continue
# the history. The rule excludes every testkit.* action type rather than only
# the ones the rebuild deletes today, so a testkit row added later cannot become
# the record either; excluding a row the rebuild keeps only makes the record an
# older row, which the check still finds.
# Production never holds these rows, so there the record is the newest row, as
# it would be without the rule. The same rule picks the row recorded on the
# upload and the row a refusal names as this database's own newest, so the two
# always agree.
LINEAGE_ROWS="action_type NOT GLOB 'testkit.*' AND created_by <> 'dev-shortcuts/personas' AND (actor_member_id IS NULL OR actor_member_id NOT LIKE 'member_persona_%')"

if ! local_wm="$(sqlite3 "${SNAP}" \
       "SELECT id || char(9) || occurred_at FROM audit_entries WHERE ${LINEAGE_ROWS} ORDER BY occurred_at DESC, id DESC LIMIT 1;" 2>&1)"; then
  record_failure "could not read the newest audit row from the snapshot: ${local_wm##*$'\n'}"
fi
LOCAL_ID=none
LOCAL_AT=none
[[ -n "${local_wm}" ]] && IFS=$'\t' read -r LOCAL_ID LOCAL_AT <<<"${local_wm}"
[[ "${LOCAL_ID}" == none || ( "${LOCAL_ID}" =~ ${ID_RE} && "${LOCAL_AT}" =~ ${TS_RE} ) ]] \
  || record_failure "the snapshot's newest audit row has an unexpected shape (id '${LOCAL_ID}', time '${LOCAL_AT}')"

# The second lineage record: the newest scheduled job run. The audit row above
# moves only when somebody acts, so a database rolled back across a quiet
# stretch still holds the stored row; the worker records a job run every few
# minutes whatever members do, so the newest run on the stored snapshot is one
# such a database lacks. Like the audit row it is checked by being held, not by
# its time: a rolled-back host's worker starts a fresh run as soon as it boots.
# The retention prune removes only runs weeks old, never the newest. Runs the
# staging test kit seeds or deletes are left out. Read from the snapshot copy,
# so the backup still only reads the live database.
JOB_LINEAGE_ROWS="json_extract(details_json, '\$.seededBy') IS NULL AND job_name NOT IN ('SYS_Reconcile_Payments_Nightly', 'SYS_Reconciliation_Digest')"
if ! local_jobs="$(sqlite3 "${SNAP}" \
       "SELECT id FROM system_job_runs WHERE ${JOB_LINEAGE_ROWS} ORDER BY started_at DESC, id DESC LIMIT 1;" 2>&1)"; then
  record_failure "could not read the newest job run from the snapshot: ${local_jobs##*$'\n'}"
fi
LOCAL_JOBS_ID="${local_jobs:-none}"
[[ "${LOCAL_JOBS_ID}" == none || "${LOCAL_JOBS_ID}" =~ ${ID_RE} ]] \
  || record_failure "the snapshot's newest job run has an unexpected id '${LOCAL_JOBS_ID}'"

LINEAGE_SINCE=none
declared=0
if [[ -e "${DECLARED_RESTORE}" ]]; then
  m_since="$(sed -n 's/^since=//p' "${DECLARED_RESTORE}" | head -n 1)"
  m_by="$(sed -n 's/^by=//p' "${DECLARED_RESTORE}" | head -n 1)"
  m_expires="$(sed -n 's/^expires=//p' "${DECLARED_RESTORE}" | head -n 1)"
  # Only a marker this run's own account owns, and nobody else can write, is a
  # declaration: the database directory belongs to the app account, which could
  # otherwise write one and have a database that does not continue the history
  # uploaded as a new lineage.
  m_owner="$(stat -c '%u' "${DECLARED_RESTORE}" 2>/dev/null || echo unknown)"
  m_mode="$(stat -c '%a' "${DECLARED_RESTORE}" 2>/dev/null || echo 777)"
  m_trusted=0
  [[ "${m_owner}" == "$(id -u)" ]] && (( (8#${m_mode} & 8#022) == 0 )) && m_trusted=1
  if (( m_trusted )) && [[ "${m_since}" =~ ${TS_RE} && "${m_expires}" =~ ^[0-9]+$ ]] \
     && (( $(date -u +%s) < m_expires )); then
    declared=1
    LINEAGE_SINCE="${m_since}"
    echo "backup-db: declared restore by ${m_by:-an unnamed script} at ${m_since}; this upload starts a new lineage"
  else
    # Ignored rather than refused: whether this database may be uploaded is then
    # the lineage check's to decide, exactly as if the marker were absent.
    echo "backup-db: WARNING: ignoring the declared-restore marker ${DECLARED_RESTORE} (by '${m_by}', since '${m_since}', expires '${m_expires}', owner uid ${m_owner}, mode ${m_mode}): it is expired, malformed, or not this account's alone. The lineage check decides this run." >&2
    rm_err="$( { rm -f "${DECLARED_RESTORE}"; } 2>&1 )" \
      || echo "backup-db: WARNING: the ignored marker was not removed: ${rm_err##*$'\n'}" >&2
  fi
fi

if (( declared == 0 )); then
  newest=""
  for prefix in "${LINEAGE_PREFIXES[@]}"; do
    listing="$(aws s3api list-objects-v2 --bucket "${BACKUP_S3_BUCKET}" --prefix "${prefix}" \
                 --query 'Contents[].Key' --output text 2>"${AWS_ERR}")" \
      || record_failure "could not list ${prefix} in s3://${BACKUP_S3_BUCKET}, so cannot tell whether this database continues the stored history; nothing was uploaded: $(last_aws_error)"
    newest="$(tr '\t' '\n' <<<"${listing}" | { grep -E '\.db\.gz$' || [[ $? == 1 ]]; } | sort | tail -n 1)"
    [[ -n "${newest}" ]] && break
  done

  if [[ -z "${newest}" ]]; then
    echo "backup-db: no stored snapshot yet; this upload starts the history"
  else
    meta="$(aws s3api head-object --bucket "${BACKUP_S3_BUCKET}" --key "${newest}" \
              --query '[Metadata."audit-newest-id", Metadata."audit-newest-at", Metadata."lineage-since", Metadata."jobs-newest-id"]' \
              --output text 2>"${AWS_ERR}")" \
      || record_failure "could not read the lineage record of s3://${BACKUP_S3_BUCKET}/${newest}; nothing was uploaded: $(last_aws_error)"
    IFS=$'\t' read -r S_ID S_AT S_SINCE S_JOBS_ID <<<"${meta}"
    if [[ "${S_ID:-None}" == None ]]; then
      echo "backup-db: WARNING: the newest stored snapshot ${newest} carries no lineage record, so this run cannot check that the database continues it; uploading, and every later run is checked against this one." >&2
    else
      [[ "${S_SINCE:-None}" == None ]] && S_SINCE=none
      [[ ( "${S_ID}" == none || "${S_ID}" =~ ${ID_RE} ) && ( "${S_SINCE}" == none || "${S_SINCE}" =~ ${TS_RE} ) ]] \
        || record_failure "the lineage record of s3://${BACKUP_S3_BUCKET}/${newest} has an unexpected shape (id '${S_ID}', lineage since '${S_SINCE}'); nothing was uploaded"
      if [[ "${S_ID}" != none ]]; then
        held="$(sqlite3 "${SNAP}" "SELECT count(*) FROM audit_entries WHERE id = '${S_ID}';" 2>&1)" \
          || record_failure "could not look up audit row ${S_ID} in the snapshot: ${held##*$'\n'}"
        [[ "${held}" == "1" ]] \
          || record_failure "this database does not continue the stored history, so it was not uploaded: the newest stored snapshot s3://${BACKUP_S3_BUCKET}/${newest} records audit row ${S_ID} (${S_AT}), which this database does not hold; its own newest audit row is ${LOCAL_ID} (${LOCAL_AT}). A host rebuilt from a disk snapshot holds an old database: put the newest backup back with scripts/restore-db.sh --target ${FOOTBAG_ENV}, which declares the restore and lets backups resume."
      fi
      # A snapshot uploaded before this mark existed carries none, and is
      # checked by its audit row alone.
      [[ "${S_JOBS_ID:-None}" == None ]] && S_JOBS_ID=none
      [[ "${S_JOBS_ID}" == none || "${S_JOBS_ID}" =~ ${ID_RE} ]] \
        || record_failure "the lineage record of s3://${BACKUP_S3_BUCKET}/${newest} has an unexpected job-run id '${S_JOBS_ID}'; nothing was uploaded"
      if [[ "${S_JOBS_ID}" != none ]]; then
        held_job="$(sqlite3 "${SNAP}" "SELECT count(*) FROM system_job_runs WHERE id = '${S_JOBS_ID}';" 2>&1)" \
          || record_failure "could not look up job run ${S_JOBS_ID} in the snapshot: ${held_job##*$'\n'}"
        [[ "${held_job}" == "1" ]] \
          || record_failure "this database does not continue the stored history, so it was not uploaded: the newest stored snapshot s3://${BACKUP_S3_BUCKET}/${newest} records job run ${S_JOBS_ID}, which this database does not hold, though it holds that snapshot's audit row: it was rolled back across a stretch in which no member acted. A host rebuilt from a disk snapshot holds an old database: put the newest backup back with scripts/restore-db.sh --target ${FOOTBAG_ENV}, which declares the restore and lets backups resume."
      fi
      LINEAGE_SINCE="${S_SINCE}"
    fi
  fi
fi
META_JSON="$(printf '{"audit-newest-id":"%s","audit-newest-at":"%s","lineage-since":"%s","jobs-newest-id":"%s"}' \
  "${LOCAL_ID}" "${LOCAL_AT}" "${LINEAGE_SINCE}" "${LOCAL_JOBS_ID}")"

gzip -9 "${SNAP}" || record_failure "gzip failed"
gzip -t "${SNAP}.gz" || record_failure "the compressed snapshot does not test intact, so it was not uploaded"
LOCAL_SIZE="$(stat -c '%s' "${SNAP}.gz")" || record_failure "could not read the compressed snapshot's size"
KEY="routine/${DAY_PREFIX}/footbag-${TS}.db.gz"

# 3. Upload with bounded retry and exponential backoff (1s, 2s between tries),
#    each wait keeping its first half and randomising its second (equal jitter)
#    so a retry never lines up with another caller that failed at the same time.
#    An attempt counts only once the stored object reads back at the local
#    file's size: a copy that exits 0 and stores nothing, or stores a short
#    object, would otherwise reset the failure alarm with no usable backup.
uploaded=0
for attempt in $(seq 1 "${UPLOAD_MAX_ATTEMPTS}"); do
  if aws s3 cp --only-show-errors --metadata "${META_JSON}" "${SNAP}.gz" "s3://${BACKUP_S3_BUCKET}/${KEY}"; then
    stored_size="$(aws s3api head-object --bucket "${BACKUP_S3_BUCKET}" --key "${KEY}" \
      --query ContentLength --output text 2>&1)" || stored_size=""
    if [[ "${stored_size}" == "${LOCAL_SIZE}" ]]; then
      uploaded=1
      break
    fi
    echo "backup-db: upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} reported success, but s3://${BACKUP_S3_BUCKET}/${KEY} reads back as ${stored_size:-absent}, not ${LOCAL_SIZE} bytes" >&2
  else
    echo "backup-db: upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} failed" >&2
  fi
  if (( attempt < UPLOAD_MAX_ATTEMPTS )); then
    step_ms=$(( 1000 * 2 ** (attempt - 1) ))
    wait_ms=$(( step_ms / 2 + RANDOM % (step_ms / 2 + 1) ))
    sleep "$(( wait_ms / 1000 )).$(printf '%03d' $(( wait_ms % 1000 )))"
  fi
done
[[ "${uploaded}" -eq 1 ]] || record_failure "S3 upload failed after ${UPLOAD_MAX_ATTEMPTS} attempts"

# The declared restore is spent: the upload just made is now the newest stored
# snapshot, and every later run is checked against it.
if (( declared == 1 )); then
  rm_err="$( { rm -f "${DECLARED_RESTORE}"; } 2>&1 )" \
    || echo "backup-db: WARNING: the declared-restore marker ${DECLARED_RESTORE} was used but not removed, so the next run may skip the lineage check too: ${rm_err##*$'\n'}" >&2
fi

# 4. Success: clear the failure counter and refresh the health timestamp.
# A counter left standing makes the next single failure count on top of it and
# raise the failing-backup alarm early, so a failed reset is logged with the
# shell's reason. It does not fail the run: the snapshot is already uploaded.
if ! reset_err="$( { echo "0" > "${FAIL_FILE}"; } 2>&1 )"; then
  echo "backup-db: consecutive-failure counter ${FAIL_FILE} was not reset: $(tail -n 1 <<<"${reset_err:-no message from the shell}")" >&2
fi
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
# The snapshot is already uploaded, so a timestamp that cannot be written is
# logged with the shell's reason and the age metric still goes out.
if ! state_err="$( { echo "${NOW_EPOCH}" > "${STATE_FILE}"; } 2>&1 )"; then
  echo "backup-db: health timestamp ${STATE_FILE} was not written: $(tail -n 1 <<<"${state_err:-no message from the shell}")" >&2
fi
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
