#!/usr/bin/env bash
# verify-replication.sh
#
# Proves that cross-region replication is delivering objects to the disaster-
# recovery buckets, not merely that it is configured. Read-only: it writes
# nothing anywhere.
#
# The replication alarms say when replication reports failures, and the
# configuration says what should happen. Neither shows that a real object made it
# across. This takes the newest object in each replicated source old enough to
# have finished replicating, and requires the same key to exist in the bucket the
# replication rule names as its destination, with the source reporting the copy
# COMPLETED.
#
# It writes no marker object. A test object written into the source would be
# replicated into the snapshot DR bucket, whose Object Lock retention may make it
# impossible for anyone to remove, and a check that leaves litter in a locked
# bucket is a check nobody can run twice.
#
# What it checks, per environment:
#   production   the snapshot bucket's hourly/ and daily/ tiers, each copy's
#                Object Lock retention read and required at least 60 days
#                ahead, the media bucket, the archive bucket, and the state of
#                the alarm that fires when hourly snapshot replication stops
#   staging      the media bucket and the archive bucket
#
# On both, the delete markers in every database snapshot bucket (production's
# primary bucket and its DR copy, staging's one bucket). A delete marker hides
# every version beneath it from an ordinary read, so a backup bucket could read
# empty while every alarm stays healthy. The buckets are versioned, so each
# lifecycle expiry writes a marker by design; a marker is explained only when its
# key falls under one of the bucket's own enabled expiry rules and it came no
# sooner than that rule's days after the snapshot time in the key's name. The
# rules are read from the bucket, not assumed.
#
# The archive bucket exists only while the archive stack is enabled. Where its
# Terraform output is null, which Terraform records by leaving it out of the
# state, the archive is reported as SKIP, by name, on its own line; a skip is
# never counted as a pass.
#
# What it refuses or fails on:
#   - a target it was not given; there is no default
#   - a Terraform output it could not read, or a state whose outputs it could
#     not read: an unreadable state could be hiding an archive that exists and
#     is not replicating
#   - a source bucket with no enabled replication rule
#   - no object old enough to have replicated, because a check with nothing to
#     look at proves nothing and must not report success
#   - a source object not reporting COMPLETED, or its key missing from the
#     destination bucket
#   - a snapshot bucket's versions or lifecycle rules it could not read, or any
#     delete marker its lifecycle rules do not explain
#
# Usage:
#   bash scripts/verify-replication.sh --target production
#   bash scripts/verify-replication.sh --target staging
#
# Test seams (CI only; operators never set these), announced on stderr when set:
# VERIFY_REPLICATION_AWS_BIN and VERIFY_REPLICATION_TERRAFORM_BIN replace the
# two tools; VERIFY_REPLICATION_NOW fixes the clock the lag window is measured
# from.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

TARGET=""
# Objects younger than this may still be in flight, so they are not judged.
LAG_MINUTES=15

die() { echo "verify-replication: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "verify-replication: --target requires an argument" >&2; exit 2; } ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify-replication: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[[ "$TARGET" == "staging" || "$TARGET" == "production" ]] \
  || die "--target must be staging or production (got '${TARGET}')"

AWS_BIN="${VERIFY_REPLICATION_AWS_BIN:-aws}"
TF_BIN="${VERIFY_REPLICATION_TERRAFORM_BIN:-terraform}"
for seam in VERIFY_REPLICATION_AWS_BIN VERIFY_REPLICATION_TERRAFORM_BIN VERIFY_REPLICATION_NOW; do
  [[ -n "${!seam:-}" ]] && echo "verify-replication: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

if [[ -z "${VERIFY_REPLICATION_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

tf_output() {
  "$TF_BIN" -chdir="terraform/${TARGET}" output -raw "$1" </dev/null 2>/dev/null
}

# Source bucket, prefix and whether the copy must carry an Object Lock. The
# snapshot bucket replicates its hourly/ and daily/ tiers only, through one rule
# each, so both are checked: a daily rule that stopped would leave the
# longest-lived points with no recovery-region copy while hourly/ still passed.
# Their destination holds the Object Lock that keeps a database copy from being
# deleted early, so the newest copy's retention is read as well; a lock that is
# configured but not applied protects nothing.
declare -a CHECKS=()
MEDIA_BUCKET="$(tf_output media_bucket_name)" || die "could not read terraform/${TARGET} output media_bucket_name"
CHECKS+=("${MEDIA_BUCKET}||")
SNAP_BUCKET="$(tf_output snapshots_bucket_name)" || die "could not read terraform/${TARGET} output snapshots_bucket_name"
declare -a MARKER_BUCKETS=("$SNAP_BUCKET")
if [[ "$TARGET" == "production" ]]; then
  CHECKS+=("${SNAP_BUCKET}|hourly/|locked" "${SNAP_BUCKET}|daily/|locked")
  SNAP_DR_BUCKET="$(tf_output dr_bucket_name)" || die "could not read terraform/${TARGET} output dr_bucket_name"
  MARKER_BUCKETS+=("$SNAP_DR_BUCKET")
fi
# The newest database copy must stay locked at least this many days ahead. The
# bucket's default retention is 90 days, so a fresh copy reads about 90; below
# 60 means the lock was shortened or the newest copy is far older than it
# should be.
MIN_LOCK_DAYS=60

# Read every output as JSON, then pick the archive's. Terraform keeps no null
# output in its state, so while the archive stack is off the name is absent and
# asking for it alone fails exactly as an unreadable state does. Reading the
# whole set tells the two apart: a failed read refuses, an absent name is the
# stack off. JSON also keeps an empty string distinct from absent.
skipped=""
all_outputs="$("$TF_BIN" -chdir="terraform/${TARGET}" output -json </dev/null 2>/dev/null)" \
  || die "could not read terraform/${TARGET} outputs"
archive_json="$(jq -c 'if type == "object" then (.archive_bucket_name.value // null) else error("not an object") end' \
  <<<"$all_outputs" 2>/dev/null)" \
  || die "terraform/${TARGET} outputs are not a JSON object of outputs"
if [[ "$archive_json" == "null" ]]; then
  skipped="archive"
elif [[ "$archive_json" =~ ^\"([a-z0-9][a-z0-9.-]*)\"$ ]]; then
  CHECKS+=("${BASH_REMATCH[1]}||")
else
  die "terraform/${TARGET} output archive_bucket_name is neither null nor a bucket name: ${archive_json}"
fi

now="${VERIFY_REPLICATION_NOW:-$(date -u +%Y-%m-%dT%H:%M:%S)}"
cutoff="$(date -u -d "${now} UTC - ${LAG_MINUTES} minutes" +%Y-%m-%dT%H:%M:%S)"

failures=0
fail() { echo "  FAIL: $*" >&2; failures=$((failures + 1)); }

if [[ -n "$skipped" ]]; then
  echo "==> SKIP: archive bucket not checked: terraform/${TARGET} output archive_bucket_name is null, so the archive stack is off here"
fi

lock_floor="$(date -u -d "${now} UTC + ${MIN_LOCK_DAYS} days" +%Y-%m-%dT%H:%M:%S)"

for check in "${CHECKS[@]}"; do
  IFS='|' read -r src prefix lock <<<"$check"
  echo "==> s3://${src}/${prefix}"

  dest_arn="$("$AWS_BIN" s3api get-bucket-replication --bucket "$src" \
    --query "ReplicationConfiguration.Rules[?Status=='Enabled'] | [0].Destination.Bucket" \
    --output text </dev/null 2>/dev/null)" || dest_arn=""
  if [[ -z "$dest_arn" || "$dest_arn" == "None" ]]; then
    fail "${src} has no enabled replication rule"
    continue
  fi
  dest="${dest_arn#arn:aws:s3:::}"
  echo "    replicates to ${dest}"

  # Newest key whose LastModified is before the cutoff. ISO timestamps compare
  # correctly as strings on their first nineteen characters.
  key=""
  listing="$("$AWS_BIN" s3api list-objects-v2 --bucket "$src" --prefix "$prefix" \
    --query 'Contents[].[LastModified,Key]' --output text </dev/null 2>/dev/null)" || listing=""
  while IFS=$'\t' read -r modified k; do
    [[ -z "${k:-}" || "$modified" == "None" ]] && continue
    if [[ "${modified:0:19}" < "$cutoff" || "${modified:0:19}" == "$cutoff" ]]; then
      key="$k"; newest="$modified"
    fi
  done < <(printf '%s\n' "$listing" | sort)
  if [[ -z "$key" ]]; then
    fail "no object under s3://${src}/${prefix} older than ${LAG_MINUTES} minutes, so nothing proves replication"
    continue
  fi
  echo "    newest settled object: ${key} (${newest})"

  status="$("$AWS_BIN" s3api head-object --bucket "$src" --key "$key" \
    --query ReplicationStatus --output text </dev/null 2>/dev/null)" || status=""
  [[ "$status" == "COMPLETED" ]] || fail "${key} in ${src} reports replication status '${status:-none}', not COMPLETED"

  # The copy is read in its own bucket's region, asked of AWS, so the read
  # never rides a redirect through the source region the copy exists to
  # outlive. us-east-1 answers as None.
  dest_region="$("$AWS_BIN" s3api get-bucket-location --bucket "$dest" \
    --query LocationConstraint --output text </dev/null 2>/dev/null)" || dest_region=""
  [[ "$dest_region" == "None" ]] && dest_region="us-east-1"
  if [[ ! "$dest_region" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]; then
    fail "the region of ${dest} could not be read, so its copy of ${key} cannot be checked"
    continue
  fi
  if "$AWS_BIN" s3api head-object --region "$dest_region" --bucket "$dest" --key "$key" </dev/null >/dev/null 2>&1; then
    echo "    present in ${dest}"
  else
    fail "${key} is missing from ${dest}"
    continue
  fi

  [[ "$lock" == "locked" ]] || continue
  retention="$("$AWS_BIN" s3api get-object-retention --region "$dest_region" --bucket "$dest" --key "$key" \
    --query 'Retention.[Mode,RetainUntilDate]' --output text </dev/null 2>/dev/null)" || retention=""
  read -r lock_mode lock_until <<<"$retention"
  if [[ "${lock_mode:-}" != "GOVERNANCE" && "${lock_mode:-}" != "COMPLIANCE" ]]; then
    fail "${key} in ${dest} carries no Object Lock retention, so it could be deleted early"
  elif [[ "${lock_until:0:19}" < "$lock_floor" ]]; then
    fail "${key} in ${dest} is locked only until ${lock_until}, less than ${MIN_LOCK_DAYS} days ahead"
  else
    echo "    locked (${lock_mode}) until ${lock_until}"
  fi
done

AWS_ERR="$(mktemp)"
trap 'rm -f "$AWS_ERR"' EXIT
trap "trap '' HUP INT TERM; exit 130" INT
trap "trap '' HUP INT TERM; exit 143" TERM
aws_reason() { tail -n 1 "$AWS_ERR" 2>/dev/null || true; }

# Epoch seconds of the snapshot time a key's name carries, or nothing when it
# carries none.
key_epoch() {
  [[ "$1" =~ footbag-([0-9]{8})T([0-9]{2})([0-9]{2})([0-9]{2})Z ]] || return 0
  date -u -d "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}:${BASH_REMATCH[3]}:${BASH_REMATCH[4]}" +%s
}

check_delete_markers() {
  local bucket="$1" region rules markers key modified prefix days found best_prefix best_days born died count=0
  echo "==> delete markers in s3://${bucket}"
  region="$("$AWS_BIN" s3api get-bucket-location --bucket "$bucket" \
    --query LocationConstraint --output text </dev/null 2>"$AWS_ERR")" || region=""
  [[ "$region" == "None" ]] && region="us-east-1"
  if [[ ! "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]]; then
    fail "the region of ${bucket} could not be read, so its delete markers cannot be checked: $(aws_reason)"
    return 0
  fi
  if ! rules="$("$AWS_BIN" s3api get-bucket-lifecycle-configuration --region "$region" --bucket "$bucket" \
        --query "Rules[?Status=='Enabled' && Expiration.Days != null].[Filter.Prefix, Expiration.Days]" \
        --output text </dev/null 2>"$AWS_ERR")"; then
    fail "could not read the lifecycle rules of ${bucket}, so its delete markers cannot be judged: $(aws_reason)"
    return 0
  fi
  if ! markers="$("$AWS_BIN" s3api list-object-versions --region "$region" --bucket "$bucket" \
        --query 'DeleteMarkers[].[Key, LastModified]' --output text </dev/null 2>"$AWS_ERR")"; then
    fail "could not list the versions of ${bucket}, so a delete marker hiding a backup would go unseen: $(aws_reason)"
    return 0
  fi
  while IFS=$'\t' read -r key modified; do
    [[ -z "${key:-}" || "$key" == "None" ]] && continue
    count=$((count + 1))
    found=0; best_prefix=""; best_days=""
    while IFS=$'\t' read -r prefix days; do
      [[ -z "${days:-}" ]] && continue
      [[ "$prefix" == "None" ]] && prefix=""
      if [[ "$key" == "$prefix"* ]] && (( found == 0 || ${#prefix} > ${#best_prefix} )); then
        found=1; best_prefix="$prefix"; best_days="$days"
      fi
    done <<<"$rules"
    if (( found == 0 )); then
      fail "delete marker on ${key} in ${bucket} (${modified}) falls under no lifecycle expiry rule, so something deleted it"
      continue
    fi
    born="$(key_epoch "$key")"
    if [[ -z "$born" ]]; then
      fail "delete marker on ${key} in ${bucket} (${modified}): the name carries no snapshot time, so lifecycle expiry cannot explain it"
      continue
    fi
    died="$(date -u -d "$modified" +%s 2>/dev/null)" || died=""
    if [[ -z "$died" ]]; then
      fail "delete marker on ${key} in ${bucket} has an unreadable time '${modified}'"
    elif (( died < born + best_days * 86400 )); then
      fail "delete marker on ${key} in ${bucket} (${modified}) came sooner than the ${best_days}-day expiry of '${best_prefix}', so something deleted it"
    fi
  done <<<"$markers"
  echo "    ${count} delete marker(s) checked against the lifecycle rules"
}

for marker_bucket in "${MARKER_BUCKETS[@]}"; do
  check_delete_markers "$marker_bucket"
done

# The alarm that fires when hourly snapshot replication goes silent exists on
# production only, the one environment whose snapshots replicate. A copy check
# can pass on an object replicated before the rule stopped, so the alarm's own
# state is read as well: it must exist and must not be firing. It lives in the
# backup region, because S3 publishes the latency metric it watches there.
if [[ "$TARGET" == "production" ]]; then
  stopped_alarm="footbag-production-snapshots-hourly-replication-stopped"
  echo "==> alarm ${stopped_alarm} (us-west-2)"
  alarm_state="$("$AWS_BIN" cloudwatch describe-alarms --region us-west-2 --alarm-names "$stopped_alarm" \
    --query 'MetricAlarms[0].StateValue' --output text </dev/null 2>/dev/null)" || alarm_state=""
  case "$alarm_state" in
    OK|INSUFFICIENT_DATA) echo "    state ${alarm_state}" ;;
    ALARM) fail "${stopped_alarm} is in ALARM: no hourly snapshot has replicated for three hours" ;;
    ""|None) fail "${stopped_alarm} does not exist; apply the production tree" ;;
    *) fail "${stopped_alarm} reports an unexpected state '${alarm_state}'" ;;
  esac
fi

echo ""
if (( failures > 0 )); then
  die "${failures} replication check(s) failed on ${TARGET}"
fi
if [[ -n "$skipped" ]]; then
  echo "== replication proven on ${TARGET} for every source checked; SKIPPED: ${skipped} =="
else
  echo "== replication proven on ${TARGET}: every source's newest settled object is in its DR bucket =="
fi
