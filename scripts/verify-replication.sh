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
#   production   the snapshot bucket's hourly/ tier, the media bucket, and the
#                archive bucket
#   staging      the media bucket and the archive bucket
#
# The archive bucket exists only while the archive stack is enabled. Where its
# Terraform output is null the archive is reported as SKIP, by name, on its own
# line; a skip is never counted as a pass.
#
# What it refuses or fails on:
#   - a target it was not given; there is no default
#   - a Terraform output it could not read, including the archive's: an
#     unreadable output could be hiding an archive that exists and is not
#     replicating
#   - a source bucket with no enabled replication rule
#   - no object old enough to have replicated, because a check with nothing to
#     look at proves nothing and must not report success
#   - a source object not reporting COMPLETED, or its key missing from the
#     destination bucket
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

# Source bucket, prefix pairs. The snapshot bucket replicates its hourly/ and
# daily/ tiers only; hourly/ is the one that always holds a recent object.
declare -a CHECKS=()
MEDIA_BUCKET="$(tf_output media_bucket_name)" || die "could not read terraform/${TARGET} output media_bucket_name"
CHECKS+=("${MEDIA_BUCKET}|")
if [[ "$TARGET" == "production" ]]; then
  SNAP_BUCKET="$(tf_output snapshots_bucket_name)" || die "could not read terraform/${TARGET} output snapshots_bucket_name"
  CHECKS+=("${SNAP_BUCKET}|hourly/")
fi

# Read as JSON rather than raw, because null (the archive stack is off) and an
# empty string are different answers and only JSON tells them apart.
skipped=""
archive_json="$("$TF_BIN" -chdir="terraform/${TARGET}" output -json archive_bucket_name </dev/null 2>/dev/null)" \
  || die "could not read terraform/${TARGET} output archive_bucket_name"
if [[ "$archive_json" == "null" ]]; then
  skipped="archive"
elif [[ "$archive_json" =~ ^\"([a-z0-9][a-z0-9.-]*)\"$ ]]; then
  CHECKS+=("${BASH_REMATCH[1]}|")
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

for check in "${CHECKS[@]}"; do
  src="${check%%|*}"
  prefix="${check#*|}"
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

  if "$AWS_BIN" s3api head-object --bucket "$dest" --key "$key" </dev/null >/dev/null 2>&1; then
    echo "    present in ${dest}"
  else
    fail "${key} is missing from ${dest}"
  fi
done

echo ""
if (( failures > 0 )); then
  die "${failures} replication check(s) failed on ${TARGET}"
fi
if [[ -n "$skipped" ]]; then
  echo "== replication proven on ${TARGET} for every source checked; SKIPPED: ${skipped} =="
else
  echo "== replication proven on ${TARGET}: every source's newest settled object is in its DR bucket =="
fi
