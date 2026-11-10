#!/usr/bin/env bash
# backup-legacy-mirror.sh -- copy the whole legacy site crawl into its cold
# backup bucket, and prove the bucket holds every file of it.
#
# The crawl of the legacy footbag.org site is the only surviving copy of that
# site once the legacy host is gone. The served archive holds only the published
# www subtree and follows every publish, deletions included, so it is not a
# backup of the crawl. This copies the whole crawl, the www subtree and the
# crawl's own manifests alike, into a private, versioned us-west-2 bucket in the
# Deep Archive storage class, the cheapest there is, which suits a copy that is
# read only to recover.
#
# Incremental: each run uploads only what is new or changed since the last, so
# it is re-run after every change to the crawl. It never deletes. A file removed
# from the local crawl stays in the bucket as it was, and a file changed locally
# leaves its earlier version behind under the bucket's versioning, so a mistaken
# change to the archive can always be rolled back from here.
#
# Each run also writes a list of every file in the crawl (relative path, size in
# bytes, SHA-256) and uploads it beside the copy, as manifests/<UTC time>.tsv and
# manifests/latest.tsv, in the standard storage class so it can be read without
# a restore. The list says what the crawl held at that moment, and its checksums
# are what a restore is checked against.
#
# Verification proves the outcome: a second, dry sync must find nothing left to
# upload, and every file on the list must be in the bucket under mirror/ at its
# listed size.
#
# What it refuses:
#   - any environment but production, the only tree that declares the bucket.
#   - to run while the bucket's gate is off: the bucket name comes from the
#     production tree's output, which is empty until enable_legacy_mirror_backup
#     is applied.
#   - a mirror root that is missing, empty, or has no www.footbag.org subtree,
#     which is not a crawl.
#   - a file name the list cannot hold (a tab, a newline or a backslash), and a
#     symbolic link, which the upload would follow to whatever it points at.
#   - to upload without a typed APPLY from the terminal. A production run asks
#     every time, so --yes is refused except beside --dry-run, which changes
#     nothing.
#
# Usage:
#   bash scripts/backup-legacy-mirror.sh --target production --dry-run
#   bash scripts/backup-legacy-mirror.sh --target production
#
#   --target    the environment: production, and only production. Required.
#   --dry-run   report the files and bytes in the crawl and how many would
#               upload, and change nothing.
#   --yes       accepted only beside --dry-run, which asks nothing anyway; a
#               copy into production is confirmed by a person every time.
#
# Exit: 0 copied and proven (or a dry run), 1 refused or unproven, 2 usage error.
#
# Test seams (CI only; operators never set these): FOOTBAG_AWS_BIN and
# FOOTBAG_TERRAFORM_BIN replace the AWS CLI and Terraform, and
# BACKUP_LEGACY_MIRROR_ROOT replaces the mirror root. Each says so on stderr
# when in use, because a run through a stand-in proves nothing about the crawl
# or the account.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

# The backup bucket's region, fixed by the tree that declares it.
BUCKET_REGION="us-west-2"
TARGET=""
DRY_RUN=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" production || exit 2
if [[ "$ASSUME_YES" == "yes" ]] && (( ! DRY_RUN )); then
  echo "ERROR: --yes does not carry a copy into production. It asks every time, from" >&2
  echo "       the terminal, because a flag cannot establish that somebody is there." >&2
  echo "       Re-run without --yes." >&2
  exit 2
fi

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
TF_BIN="${FOOTBAG_TERRAFORM_BIN:-terraform}"
MIRROR_ROOT="${BACKUP_LEGACY_MIRROR_ROOT:-${REPO_ROOT}/legacy_data/legacy_mirror/mirror_footbag_org}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
[[ -n "${FOOTBAG_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the bucket this run uses is not the estate's." >&2
[[ -n "${BACKUP_LEGACY_MIRROR_ROOT:-}" ]] && echo "NOTE: using a stand-in mirror root; this run proves nothing about the crawl." >&2

command -v jq >/dev/null 2>&1 || cr_die "jq is not installed, and the bucket name is read from Terraform's JSON output with it. Nothing was changed."

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/footbag-backup-legacy-mirror.XXXXXX")"
cr_cleanup rm -rf "$WORK_DIR"

# ── The crawl ────────────────────────────────────────────────────────────────

[[ -d "$MIRROR_ROOT" ]] || cr_die "the mirror root ${MIRROR_ROOT} does not exist. Nothing was changed."
[[ -d "${MIRROR_ROOT}/www.footbag.org" ]] \
  || cr_die "${MIRROR_ROOT} has no www.footbag.org subtree, so it is not a crawl of the legacy site. Nothing was changed."

# A crawl that finished carries its own manifests beside the www subtree. One
# missing is worth knowing, but the copy is still worth taking: this script never
# deletes, so an incomplete copy can only add to what the bucket holds.
for manifest in sitemap.txt redirect_map.json skipped_videos.json skipped_videos_summary.txt; do
  [[ -f "${MIRROR_ROOT}/${manifest}" ]] \
    || cr_warn "the crawl manifest ${manifest} is missing from ${MIRROR_ROOT}; the crawl may not have finished. The rest is copied."
done

LINKS="${WORK_DIR}/links.txt"
find "$MIRROR_ROOT" -type l > "$LINKS" 2> "${WORK_DIR}/find.err" \
  || cr_die "could not read the whole mirror tree: $(tail -n 1 "${WORK_DIR}/find.err"). Nothing was changed."
if [[ -s "$LINKS" ]]; then
  head -n 20 "$LINKS" | sed 's/^/  /' >&2
  cr_die "$(grep -c '' "$LINKS") symbolic link(s) in the crawl, listed above. The upload would copy whatever each points at, which the file list cannot vouch for. Nothing was changed."
fi

# Relative path and size of every file, sorted so two runs over the same crawl
# write the same list. NUL-separated until the names are known to be safe.
NAMES="${WORK_DIR}/names.bin"
find "$MIRROR_ROOT" -type f -printf '%P\0' 2> "${WORK_DIR}/find.err" | LC_ALL=C sort -z > "$NAMES" \
  || cr_die "could not list the mirror tree: $(tail -n 1 "${WORK_DIR}/find.err"). Nothing was changed."
BAD_NAMES="${WORK_DIR}/bad_names.txt"
tr '\0' '\n' < "$NAMES" | grep -E $'[\t\\\\]' > "$BAD_NAMES" || [[ $? == 1 ]]
NEWLINE_NAMES="$(tr -cd '\n' < "$NAMES" | wc -c)"
if [[ -s "$BAD_NAMES" || "$NEWLINE_NAMES" -gt 0 ]]; then
  head -n 20 "$BAD_NAMES" | sed 's/^/  /' >&2
  cr_die "file name(s) in the crawl hold a tab, a newline or a backslash, which the file list cannot record unambiguously. Rename them in the crawl first. Nothing was changed."
fi

FILE_COUNT="$(tr -cd '\0' < "$NAMES" | wc -c)"
(( FILE_COUNT > 0 )) || cr_die "${MIRROR_ROOT} holds no files. Nothing was changed."
SIZES="${WORK_DIR}/sizes.tsv"
find "$MIRROR_ROOT" -type f -printf '%P\t%s\n' 2> "${WORK_DIR}/find.err" | LC_ALL=C sort -t $'\t' -k1,1 > "$SIZES" \
  || cr_die "could not size the mirror tree: $(tail -n 1 "${WORK_DIR}/find.err"). Nothing was changed."
TOTAL_BYTES="$(awk -F'\t' '{ s += $2 } END { printf "%.0f", s }' "$SIZES")"
echo "Crawl: ${MIRROR_ROOT}"
echo "  ${FILE_COUNT} files, ${TOTAL_BYTES} bytes"

# ── The bucket ───────────────────────────────────────────────────────────────

aws_profile_ensure || cr_die "the AWS identity for this run could not be settled. Nothing was changed."

TF_DIR="${REPO_ROOT}/terraform/${TARGET}"
TF_JSON="${WORK_DIR}/outputs.json"
if ! "$TF_BIN" -chdir="$TF_DIR" output -json > "$TF_JSON" 2> "${WORK_DIR}/tf.err"; then
  cr_die "could not read the ${TARGET} tree's outputs: $(grep -v '^[[:space:]]*$' "${WORK_DIR}/tf.err" | tail -n 1). Nothing was changed."
fi
BUCKET="$(jq -r '.legacy_mirror_backup_bucket_name.value // empty' "$TF_JSON")" \
  || cr_die "the ${TARGET} tree's outputs are not JSON. Nothing was changed."
if [[ -z "$BUCKET" ]]; then
  echo "Turn the gate on in the production values file and apply it:" >&2
  echo "  bash scripts/set-terraform-gate.sh --target production \\" >&2
  echo "    --gate enable_legacy_mirror_backup --state on" >&2
  cr_die "the backup bucket does not exist yet: legacy_mirror_backup_bucket_name is empty because enable_legacy_mirror_backup is off in ${TARGET}. Nothing was changed."
fi
DEST="s3://${BUCKET}/mirror/"
echo "Bucket: ${BUCKET} (${BUCKET_REGION}), crawl under mirror/"

# What a sync would do now, as the number of lines a dry sync prints. Without
# --delete a sync only uploads, so each line is a file still to copy. Every
# non-empty line is counted, not only the ones shaped like an upload, so a line
# in a form nobody expected keeps the proof below from passing rather than being
# skipped.
pending_uploads() {
  local out="$1"
  "$AWS_BIN" s3 sync "$MIRROR_ROOT" "$DEST" --dryrun --no-progress --region "$BUCKET_REGION" \
    > "$out" 2> "${out}.err" || return 1
  grep -c '[^[:space:]]' "$out" || [[ $? == 1 ]]
}

PENDING_FILE="${WORK_DIR}/pending.txt"
if ! PENDING="$(pending_uploads "$PENDING_FILE")"; then
  cr_die "could not compare the crawl with ${DEST}: $(tail -n 1 "${PENDING_FILE}.err"). Nothing was changed."
fi
echo "  ${PENDING} file(s) new or changed since the last copy"

if (( DRY_RUN )); then
  head -n 20 "$PENDING_FILE"
  cr_unproved "the copy: a dry run, so nothing was uploaded and the bucket was not checked against a file list"
  cr_proved "${FILE_COUNT} files (${TOTAL_BYTES} bytes) in the crawl, ${PENDING} of them to upload"
  cr_finish
fi

echo ""
echo "About to upload the ${PENDING} new or changed file(s) of the crawl to ${DEST}"
echo "in the Deep Archive storage class, then a list of all ${FILE_COUNT} files with their"
echo "checksums beside it. Nothing in the bucket is deleted or overwritten in place;"
echo "a changed file keeps its earlier version."
echo ""
if ! confirm_from_tty "Type 'APPLY' to copy the crawl: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  cr_unproved "the copy: not confirmed, and nothing was changed"
  cr_finish_with 1 ABORTED
fi

# ── The file list ────────────────────────────────────────────────────────────

# Hashed after the confirmation, because it reads every byte of the crawl.
echo "==> Listing ${FILE_COUNT} files with their checksums"
SUMS="${WORK_DIR}/sums.txt"
( cd "$MIRROR_ROOT" && xargs -0 -r sha256sum -- < "$NAMES" ) > "$SUMS" 2> "${WORK_DIR}/sha.err" \
  || cr_die "could not checksum the crawl: $(tail -n 1 "${WORK_DIR}/sha.err"). Nothing was uploaded."
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE_LIST="${WORK_DIR}/${STAMP}.tsv"
# sha256sum writes "<hash>  <name>"; the names hold no backslash, so none is
# escaped, and the list is joined to the sizes on the name.
sed -E 's/^([0-9a-f]{64})  (.*)$/\2\t\1/' "$SUMS" | LC_ALL=C sort -t $'\t' -k1,1 > "${WORK_DIR}/sums.tsv"
LC_ALL=C join -t $'\t' "$SIZES" "${WORK_DIR}/sums.tsv" > "$FILE_LIST"
LISTED="$(grep -c '' "$FILE_LIST" || [[ $? == 1 ]])"
[[ "$LISTED" == "$FILE_COUNT" ]] \
  || cr_die "the file list holds ${LISTED} entries for ${FILE_COUNT} files; the crawl changed while it was read. Nothing was uploaded; re-run when it is still."

# ── Upload ───────────────────────────────────────────────────────────────────

echo "==> Uploading to ${DEST}"
cr_run "upload of the crawl" -- "$AWS_BIN" s3 sync "$MIRROR_ROOT" "$DEST" \
  --storage-class DEEP_ARCHIVE --region "$BUCKET_REGION" --only-show-errors \
  || cr_die "the upload did not complete. What it copied stays; re-run to finish, since the copy is incremental."
cr_run "upload of the file list" -- "$AWS_BIN" s3 cp "$FILE_LIST" "s3://${BUCKET}/manifests/${STAMP}.tsv" \
  --region "$BUCKET_REGION" --only-show-errors \
  || cr_die "the crawl was copied but its file list was not; re-run to write it."
cr_run "upload of the latest file list" -- "$AWS_BIN" s3 cp "$FILE_LIST" "s3://${BUCKET}/manifests/latest.tsv" \
  --region "$BUCKET_REGION" --only-show-errors \
  || cr_die "the crawl and manifests/${STAMP}.tsv were copied, but manifests/latest.tsv was not; re-run to write it."

# ── Prove it ─────────────────────────────────────────────────────────────────

echo "==> Checking the bucket against the crawl"
if ! LEFT="$(pending_uploads "$PENDING_FILE")"; then
  cr_die "could not compare the crawl with ${DEST} after the upload: $(tail -n 1 "${PENDING_FILE}.err")"
fi
if [[ "$LEFT" != 0 ]]; then
  head -n 20 "$PENDING_FILE" >&2
  cr_die "${LEFT} file(s) are still not in the bucket after the upload, listed above. Re-run to finish."
fi
cr_proved "a second, dry sync finds nothing left to upload to ${DEST}"

BUCKET_KEYS="${WORK_DIR}/bucket_keys.tsv"
if ! "$AWS_BIN" s3api list-objects-v2 --bucket "$BUCKET" --prefix mirror/ --region "$BUCKET_REGION" \
      --query 'Contents[].[Key,Size]' --output text > "$BUCKET_KEYS" 2> "${WORK_DIR}/list.err"; then
  cr_die "could not list ${DEST}: $(tail -n 1 "${WORK_DIR}/list.err")"
fi
sed -E 's#^mirror/##' "$BUCKET_KEYS" | grep -v '^None$' | LC_ALL=C sort > "${WORK_DIR}/bucket.tsv" || [[ $? == 1 ]]
MISSING="${WORK_DIR}/missing.tsv"
LC_ALL=C sort "$SIZES" > "${WORK_DIR}/sizes.sorted"
LC_ALL=C comm -23 "${WORK_DIR}/sizes.sorted" "${WORK_DIR}/bucket.tsv" > "$MISSING"
if [[ -s "$MISSING" ]]; then
  head -n 20 "$MISSING" | sed 's/^/  /' >&2
  cr_die "$(grep -c '' "$MISSING") listed file(s) are absent from ${DEST} or there at another size, listed above (path, size)."
fi
BUCKET_COUNT="$(grep -c '' "${WORK_DIR}/bucket.tsv" || [[ $? == 1 ]])"
cr_proved "all ${FILE_COUNT} listed files are in ${DEST} at their listed sizes (the bucket holds ${BUCKET_COUNT} objects there; any beyond the list are files since removed from the crawl, kept by design)"
cr_proved "the file list is at s3://${BUCKET}/manifests/${STAMP}.tsv and manifests/latest.tsv"
cr_unproved "the checksums on the list against the stored bytes: Deep Archive objects cannot be read without a restore"
cr_finish
