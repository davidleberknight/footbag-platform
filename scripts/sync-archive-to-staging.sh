#!/usr/bin/env bash
# sync-archive-to-staging.sh
#
# Replaces what staging's Legacy Archive bucket holds with what production's
# holds, inside AWS, then invalidates staging's archive distribution and proves
# the staging edge. Once production is live its archive bucket is the source of
# truth, and staging rehearses against the same capture rather than against
# whatever was last published there by hand.
#
# Why it takes no --target. Its subject is two fixed environments, production
# read and staging written, and the direction is the whole of what it does. A
# flag naming one of them could only ever take one value, and a script that
# accepted the other would be one that writes production from staging.
#
# The copy is server-side. `aws s3 sync` between two s3:// locations copies each
# object with the S3 CopyObject call, so the bytes move inside S3 and never pass
# through the workstation running this; the capture's pages carry old member
# contact details and have no business landing on a laptop on the way.
#
# DESTRUCTIVE on staging: staging is replaced, never patched. A key staging
# holds that production does not is removed (the sync runs with --delete). The
# reserved _gate/ prefix is excluded on both sides: it holds the two gate pages
# Terraform places in each environment, and staging's carry staging's platform
# URL, so production's must never overwrite them and the sync must never delete
# them.
#
# What it enforces, in order:
#   1. The run is the directly authenticated IAM user footbag-operator, proved
#      by sts get-caller-identity. It is the one principal that can both read
#      production's archive and write staging's: the dev-and-tester role may
#      read production's archive but writes no bucket, and the runtime roles
#      reach neither archive.
#   2. Both buckets and staging's distribution come from terraform output in
#      their own trees, and the two buckets differ.
#   3. Production holds a published archive (its landing page exists).
#      Replacing staging with an empty production would empty staging.
#   4. A typed APPLY, read from the terminal, after the summary of what changes.
#      --dry-run asks nothing, because it changes nothing.
#   5. After the sync, staging's keys and sizes outside _gate/ equal
#      production's, and both of staging's gate pages are still there. Anything
#      else withholds the invalidation.
#   6. One invalidation of /* on staging's archive distribution, then the edge
#      proof, scripts/verify-archive-edge.sh --target staging.
#
# A re-run copies only what differs and proves the same outcome, so a run cut
# short is finished by running it again.
#
# Usage:
#   bash scripts/sync-archive-to-staging.sh              # replace staging, then prove it
#   bash scripts/sync-archive-to-staging.sh --dry-run    # list what would change
#
# Flags:
#   --dry-run   Print what a sync would copy and delete, and change nothing.
#   -h, --help  This text.
#
# The edge proof signs with staging's archive signing key,
# ~/AWS/archive-signing-key-staging.pem; an unreadable key is refused before
# anything is copied, since the proof runs after staging has changed.
#
# Test seams (CI only; operators never set these): FOOTBAG_AWS_BIN and
# FOOTBAG_TERRAFORM_BIN replace the AWS CLI and Terraform, and
# SYNC_ARCHIVE_EDGE_VERIFIER replaces the edge proof. Each says so on stderr
# when in use, because a run through a stand-in proves nothing about the estate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# confirm_from_tty: the shared typed confirmation, read from the terminal, which
# an exported accept flag cannot answer because the library assigns it.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# Every refusal, every tolerated failure and every problem the tools print is
# listed once in the closing report at the end; the exit status follows from it.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
TF_BIN="${FOOTBAG_TERRAFORM_BIN:-terraform}"
EDGE_VERIFIER="${SYNC_ARCHIVE_EDGE_VERIFIER:-${SCRIPT_DIR}/verify-archive-edge.sh}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
[[ -n "${FOOTBAG_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the identifiers this run uses are not the estate's." >&2
[[ -n "${SYNC_ARCHIVE_EDGE_VERIFIER:-}" ]] && echo "NOTE: using a stand-in for the edge proof; this run proves nothing about what staging serves." >&2

# The same default the edge proof resolves, so the two cannot disagree about
# which key signs it.
SIGNING_KEY="${HOME}/AWS/archive-signing-key-staging.pem"
if [[ ! -r "$SIGNING_KEY" ]]; then
  echo "       Provision it with scripts/provision-archive-signing-key.sh --target staging." >&2
  cr_die "staging's archive signing key is not readable: ${SIGNING_KEY}"
fi

# ---- 1. Identity --------------------------------------------------------------

aws_profile_ensure || cr_die "could not settle the AWS identity this run copies as"
aws_identity_require_direct_user "footbag-operator" \
  || cr_die "this run must be the directly authenticated footbag-operator, the one identity that reads production's archive and writes staging's"

WORK_DIR="$(mktemp -d /tmp/footbag-sync-archive.XXXXXX)"
cr_cleanup rm -rf "${WORK_DIR}"

# ---- 2. Terraform-owned identifiers -------------------------------------------

TF_ERR="${WORK_DIR}/terraform_output.err"
# Terraform's own message is kept, so an unreadable state is reported as that
# rather than as an archive stack that was never applied.
tf_out() {
  "$TF_BIN" -chdir="${REPO_ROOT}/terraform/$1" output -raw "$2" 2>>"$TF_ERR"
}
SOURCE_BUCKET="$(tf_out production archive_bucket_name)" || SOURCE_BUCKET=""
DEST_BUCKET="$(tf_out staging archive_bucket_name)" || DEST_BUCKET=""
DEST_DIST_ID="$(tf_out staging archive_distribution_id)" || DEST_DIST_ID=""
if [[ -z "$SOURCE_BUCKET" || -z "$DEST_BUCKET" || -z "$DEST_DIST_ID" ]]; then
  echo "Both archive stacks must be applied (enable_archive = true in each tree)." >&2
  tf_said="$(grep -v '^[[:space:]]*$' "$TF_ERR" | tail -n 1 || [[ $? == 1 ]])"
  cr_die "archive terraform outputs are empty: ${tf_said:-terraform printed no error}"
fi
if [[ "$SOURCE_BUCKET" == "$DEST_BUCKET" ]]; then
  cr_die "production and staging name the same archive bucket (${SOURCE_BUCKET}); nothing would be copied, and --delete would act on the source"
fi

# ---- 3. Production holds a published archive -----------------------------------

# The landing page is the one archive URL the platform emits, so a bucket
# without it is not a published archive, whatever else it holds.
if ! "$AWS_BIN" s3api head-object --bucket "$SOURCE_BUCKET" --key index.html >/dev/null 2> "${WORK_DIR}/head_source.err"; then
  cr_die "production's archive has no landing page (s3://${SOURCE_BUCKET}/index.html): $(tail -n 1 "${WORK_DIR}/head_source.err"). Replacing staging with it would empty staging; nothing was copied."
fi

# `aws s3 ls --recursive` lines are date, time, size, key. Prints one
# "key<TAB>size" line per object outside _gate/, sorted, so two buckets compare
# as two files. The ls must succeed: a failed listing is not an empty bucket.
list_outside_gate() {
  local bucket="$1" out="$2" raw="${2}.raw"
  if ! "$AWS_BIN" s3 ls "s3://${bucket}" --recursive > "$raw" 2> "${raw}.err"; then
    cr_die "could not list s3://${bucket}: $(grep -v '^[[:space:]]*$' "${raw}.err" | tail -n 1 || [[ $? == 1 ]])"
  fi
  sed -nE 's/^[0-9-]+ [0-9:]+ +([0-9]+) (.*)$/\2\t\1/p' "$raw" \
    | { grep -v '^_gate/' || [[ $? == 1 ]]; } \
    | LC_ALL=C sort > "$out"
}

list_outside_gate "$SOURCE_BUCKET" "${WORK_DIR}/source_before.txt"
list_outside_gate "$DEST_BUCKET" "${WORK_DIR}/dest_before.txt"
cut -f1 "${WORK_DIR}/source_before.txt" > "${WORK_DIR}/source_keys.txt"
cut -f1 "${WORK_DIR}/dest_before.txt" > "${WORK_DIR}/dest_keys.txt"
REMOVED_KEYS="${WORK_DIR}/removed_keys.txt"
LC_ALL=C comm -13 "${WORK_DIR}/source_keys.txt" "${WORK_DIR}/dest_keys.txt" > "$REMOVED_KEYS"
SOURCE_COUNT="$(grep -c '' "${WORK_DIR}/source_before.txt" || [[ $? == 1 ]])"
DEST_COUNT="$(grep -c '' "${WORK_DIR}/dest_before.txt" || [[ $? == 1 ]])"
REMOVED_COUNT="$(grep -c '' "$REMOVED_KEYS" || [[ $? == 1 ]])"

echo "Production archive  s3://${SOURCE_BUCKET}  ${SOURCE_COUNT} objects outside _gate/"
echo "Staging archive     s3://${DEST_BUCKET}  ${DEST_COUNT} objects outside _gate/"
echo "Staging keys production does not hold, to be removed: ${REMOVED_COUNT}"
if [[ "$REMOVED_COUNT" -gt 0 ]]; then
  head -20 "$REMOVED_KEYS" | sed 's/^/  /'
  [[ "$REMOVED_COUNT" -gt 20 ]] && echo "  ... and $((REMOVED_COUNT - 20)) more"
fi

# ---- 4. The sync --------------------------------------------------------------

# How aws s3 sync reports a problem on a line of its own.
SYNC_ERRORS='^(copy|delete) failed:|^fatal error:'
SYNC_WARNINGS='^warning:'
# --copy-props metadata-directive carries each object's content type and the
# other headers the edge serves, and no object tags. Production's capture
# objects carry none, and staging's IAM controls read the tag Terraform puts on
# its own gate pages, so a tag must never arrive on staging by way of a copy.
SYNC_ARGS=(
  s3 sync "s3://${SOURCE_BUCKET}/" "s3://${DEST_BUCKET}/"
  --exclude "_gate/*"
  --delete
  --copy-props metadata-directive
  --no-progress
)

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN (--dry-run): listing what a sync would copy and delete."
  dry_rc=0
  "$AWS_BIN" "${SYNC_ARGS[@]}" --dryrun > "${WORK_DIR}/dryrun.txt" 2>&1 || dry_rc=$?
  tail -20 "${WORK_DIR}/dryrun.txt"
  echo "Dry-run operation count: $(grep -c '' "${WORK_DIR}/dryrun.txt" || [[ $? == 1 ]])"
  cr_harvest --errors "$SYNC_ERRORS" --warnings "$SYNC_WARNINGS" "s3 sync (dry run)" "${WORK_DIR}/dryrun.txt"
  if [[ "$dry_rc" -ne 0 ]]; then
    cr_error "the dry-run sync exited ${dry_rc}: $(tail -n 1 "${WORK_DIR}/dryrun.txt")"
  fi
  echo "DRY RUN complete; nothing was copied, deleted, or invalidated."
  cr_proved "production holds a published archive and both buckets could be listed (dry run)"
  cr_unproved "the sync itself, the comparison after it and the staging edge proof (dry run)"
  cr_finish
fi

echo ""
echo "About to replace staging's Legacy Archive with production's:"
echo "  from          s3://${SOURCE_BUCKET} (${SOURCE_COUNT} objects outside _gate/)"
echo "  to            s3://${DEST_BUCKET}, ${REMOVED_COUNT} key(s) production lacks DELETED"
echo "  untouched     _gate/ on both sides"
echo "  distribution  ${DEST_DIST_ID}, the whole cache invalidated (/*)"
if ! confirm_from_tty "Type APPLY to replace staging's archive: " "APPLY"; then
  cr_die "Not confirmed; nothing was copied, deleted, or invalidated."
fi

echo "Copying inside S3 (CopyObject); nothing is downloaded to this machine ..."
SYNC_START="$(date +%s)"
sync_rc=0
"$AWS_BIN" "${SYNC_ARGS[@]}" > "${WORK_DIR}/sync.txt" 2>&1 || sync_rc=$?
cr_harvest --errors "$SYNC_ERRORS" --warnings "$SYNC_WARNINGS" "s3 sync" "${WORK_DIR}/sync.txt"
if [[ "$sync_rc" -ne 0 ]]; then
  cr_die "the sync exited ${sync_rc}; NOT invalidating. Re-running finishes the copy."
fi
echo "Sync complete in $(( $(date +%s) - SYNC_START ))s: $(grep -c '' "${WORK_DIR}/sync.txt" || [[ $? == 1 ]]) operations"

# ---- 5. Staging now equals production ------------------------------------------

# The outcome, not the invocation: a sync that exited 0 has not shown that
# staging holds production's capture. Keys and sizes are compared, outside
# _gate/, from fresh listings of both.
list_outside_gate "$SOURCE_BUCKET" "${WORK_DIR}/source_after.txt"
list_outside_gate "$DEST_BUCKET" "${WORK_DIR}/dest_after.txt"
fail=0
if ! diff "${WORK_DIR}/source_after.txt" "${WORK_DIR}/dest_after.txt" > "${WORK_DIR}/diff.txt"; then
  echo "Staging differs from production after the sync (< production, > staging):" >&2
  head -20 "${WORK_DIR}/diff.txt" >&2
  cr_error "staging's archive does not match production's after the sync: $(grep -c '^[<>]' "${WORK_DIR}/diff.txt") differing line(s)"
  fail=1
fi
for key in _gate/denied.html _gate/not-found.html; do
  if ! "$AWS_BIN" s3api head-object --bucket "$DEST_BUCKET" --key "$key" >/dev/null 2> "${WORK_DIR}/head.err"; then
    cr_error "staging's gate page is missing after the sync: ${key}: $(tail -n 1 "${WORK_DIR}/head.err")"
    fail=1
  fi
done
if [[ "$fail" -ne 0 ]]; then
  cr_die "SYNC FAILED verification; NOT invalidating. Investigate before re-running."
fi
cr_proved "staging's archive holds exactly production's keys and sizes outside _gate/, and both of staging's gate pages"

# ---- 6. Invalidation and the edge proof ----------------------------------------

# Not optional: the edge caches for a year, so without it staging goes on
# serving the capture it held before.
INVALIDATION_ID="$("$AWS_BIN" cloudfront create-invalidation --distribution-id "$DEST_DIST_ID" \
  --paths "/*" --query 'Invalidation.Id' --output text)"
echo "Invalidation created: ${INVALIDATION_ID} (distribution ${DEST_DIST_ID})"

if ! bash "$EDGE_VERIFIER" --target staging --signing-key "$SIGNING_KEY"; then
  echo "If the invalidation just ran, the edge may still be settling; retry" >&2
  echo "scripts/verify-archive-edge.sh --target staging before investigating." >&2
  cr_die "the staging archive edge proof failed after the sync"
fi
cr_proved "staging's archive distribution serves the copied capture"

echo "SYNC: staging's archive now holds production's (${SOURCE_COUNT} objects, invalidation ${INVALIDATION_ID})"
cr_finish
