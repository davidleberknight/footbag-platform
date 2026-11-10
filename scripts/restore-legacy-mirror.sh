#!/usr/bin/env bash
# restore-legacy-mirror.sh -- bring the legacy site crawl back out of its cold
# backup bucket, and prove every file of it against the list it was backed up
# with.
#
# The crawl of the legacy footbag.org site is the only surviving copy of that
# site once the legacy host is gone, and backup-legacy-mirror.sh copies it into
# a private us-west-2 bucket in the Deep Archive storage class. Nothing there
# can be read as it sits: each object must first be restored, which AWS does in
# the background (Standard within about 12 hours, Bulk within about 48), and the
# restored copy is readable only for the days asked for. This is the way back:
# it reads the newest file list the backup wrote (manifests/latest.tsv: path,
# size in bytes, SHA-256), asks AWS to restore every file on it, reports how far
# the restore has got, and once every file is readable downloads the crawl and
# checks every file against its listed size and checksum.
#
# Four modes, exactly one per run:
#
#   --dry-run    report the files on the list, their bytes, and how many are
#                restored, in flight or not yet requested. Changes nothing.
#   --status     the same report, ending READY (exit 0) when every file can be
#                downloaded, NOT READY (exit 3) while any cannot.
#   --request    ask AWS to restore every listed file that is neither restored
#                nor already in flight. A re-run asks only for what is still
#                missing, so it is safe to repeat. Retrieval is billed per byte
#                and per request, so it asks for a typed APPLY every time.
#   --download   copy the crawl into --dest, then check every file on the list
#                there at its listed size and checksum. Objects in the bucket
#                that are not on the list (files since removed from the crawl,
#                kept by the backup by design) are left out.
#
# What it refuses:
#   - any environment but production, the only tree that declares the bucket.
#   - to run while the bucket's gate is off: legacy_mirror_backup_bucket_name is
#     absent or null until enable_legacy_mirror_backup is applied. A Terraform
#     state it cannot read is reported with Terraform's words, never as off.
#   - a bucket with no file list, since without it nothing can be checked.
#   - --tier other than Bulk or Standard (Expedited does not exist for Deep
#     Archive), and --days that is not a whole number of days from 1 to 9999.
#   - --yes, except beside --dry-run or --status, which ask nothing anyway: a
#     restore request is confirmed by a person every time.
#   - to download while any listed file is not yet restored.
#   - a --dest that is the real crawl at
#     legacy_data/legacy_mirror/mirror_footbag_org, lies inside it, or holds it,
#     whatever it is called or linked as; and any --dest that is not empty. A
#     download never writes over a crawl. No flag or variable lifts either.
#   - a --dest whose filesystem has less free space than the crawl's bytes.
#
# A download that fails or does not check out removes what it put in --dest,
# which was empty when it started, so a re-run starts clean; the bucket is
# untouched either way.
#
# Usage:
#   bash scripts/restore-legacy-mirror.sh --target production --dry-run
#   bash scripts/restore-legacy-mirror.sh --target production --request \
#     [--tier Bulk|Standard] [--days N]
#   bash scripts/restore-legacy-mirror.sh --target production --status
#   bash scripts/restore-legacy-mirror.sh --target production --download \
#     --dest /path/to/empty/dir
#
#   --target    the environment: production, and only production. Required.
#   --tier      the retrieval tier for --request: Bulk (default, cheapest,
#               within about 48 hours) or Standard (within about 12 hours).
#   --days      how many days a restored copy stays readable, for --request.
#               Default 7.
#   --dest      the empty directory a --download writes the crawl into; made
#               if it does not exist.
#   --yes       accepted only beside --dry-run or --status.
#
# Exit: 0 done and proven (or a dry run, or --status READY), 1 refused,
# failed or unproven, 2 usage error, 3 --status NOT READY.
#
# Test seams (CI only; operators never set these), announced on stderr when
# set: RESTORE_LEGACY_MIRROR_AWS_BIN and RESTORE_LEGACY_MIRROR_TF_BIN replace
# the AWS CLI and Terraform.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

# The backup bucket's region, fixed by the tree that declares it.
BUCKET_REGION="us-west-2"
# The real crawl on a workstation. A download is never let near it.
REAL_MIRROR="${REPO_ROOT}/legacy_data/legacy_mirror/mirror_footbag_org"
TARGET=""
MODE=""
MODES=0
TIER="Bulk"
DAYS="7"
TIER_SET=0
DAYS_SET=0
DEST=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

set_mode() { MODE="$1"; MODES=$((MODES + 1)); }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --tier) TIER="${2:-}"; TIER_SET=1; shift 2 || { echo "ERROR: --tier requires an argument" >&2; exit 2; } ;;
    --days) DAYS="${2:-}"; DAYS_SET=1; shift 2 || { echo "ERROR: --days requires an argument" >&2; exit 2; } ;;
    --dest) DEST="${2:-}"; shift 2 || { echo "ERROR: --dest requires an argument" >&2; exit 2; } ;;
    --dry-run) set_mode dry-run; shift ;;
    --status) set_mode status; shift ;;
    --request) set_mode request; shift ;;
    --download) set_mode download; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" production || exit 2
if (( MODES != 1 )); then
  echo "ERROR: give exactly one of --dry-run, --status, --request or --download." >&2
  exit 2
fi
if [[ "$MODE" != "request" ]] && (( TIER_SET || DAYS_SET )); then
  echo "ERROR: --tier and --days belong to --request." >&2
  exit 2
fi
if [[ "$TIER" != "Bulk" && "$TIER" != "Standard" ]]; then
  echo "ERROR: --tier must be Bulk or Standard (got '${TIER}'); Deep Archive has no faster tier." >&2
  exit 2
fi
if [[ ! "$DAYS" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "ERROR: --days must be a whole number of days from 1 to 9999 (got '${DAYS}')." >&2
  exit 2
fi
if [[ "$MODE" == "download" && -z "$DEST" ]]; then
  echo "ERROR: --download requires --dest <empty directory>." >&2
  exit 2
fi
if [[ "$MODE" != "download" && -n "$DEST" ]]; then
  echo "ERROR: --dest belongs to --download." >&2
  exit 2
fi
if [[ "$ASSUME_YES" == "yes" && "$MODE" != "dry-run" && "$MODE" != "status" ]]; then
  echo "ERROR: --yes does not carry a ${MODE} in production. It is confirmed from the" >&2
  echo "       terminal, or needs no confirmation; re-run without --yes." >&2
  exit 2
fi

# The destination is judged before anything reaches AWS, by where it really
# is: both paths are resolved through every link, so the crawl cannot be
# reached under another name. Inside the crawl, or holding it, is refused
# whether or not the crawl is there today.
# overlaps <a> <b>: a and b are one path, or one lies inside the other.
overlaps() { [[ "$1" == "$2" || "$1" == "$2"/* || "$2" == "$1"/* ]]; }
DEST_ABS=""
if [[ "$MODE" == "download" ]]; then
  DEST_ABS="$(realpath -m -- "$DEST")"
  MIRROR_ABS="$(realpath -m -- "$REAL_MIRROR")"
  # Each also as written, with no link followed, so a link that moves later
  # cannot open a way in either.
  if overlaps "$DEST_ABS" "$MIRROR_ABS" \
     || overlaps "$(realpath -ms -- "$DEST")" "$(realpath -ms -- "$REAL_MIRROR")"; then
    echo "ERROR: --dest ${DEST} is, lies inside, or holds the real crawl at ${REAL_MIRROR}." >&2
    echo "       A download never writes over a crawl. Choose an empty directory elsewhere." >&2
    exit 2
  fi
  if [[ -e "$DEST_ABS" && ! -d "$DEST_ABS" ]]; then
    echo "ERROR: --dest ${DEST} exists and is not a directory." >&2
    exit 2
  fi
  if [[ -d "$DEST_ABS" ]] && [[ -n "$(find "$DEST_ABS" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "ERROR: --dest ${DEST} is not empty. A download never writes over files;" >&2
    echo "       choose an empty or new directory." >&2
    exit 2
  fi
fi

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${RESTORE_LEGACY_MIRROR_AWS_BIN:-aws}"
TF_BIN="${RESTORE_LEGACY_MIRROR_TF_BIN:-terraform}"
for seam in RESTORE_LEGACY_MIRROR_AWS_BIN RESTORE_LEGACY_MIRROR_TF_BIN; do
  [[ -n "${!seam:-}" ]] && echo "restore-legacy-mirror: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

command -v jq >/dev/null 2>&1 || cr_die "jq is not installed, and the bucket name and listing are read with it. Nothing was changed."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-restore-legacy-mirror.XXXXXX")"
cr_cleanup rm -rf "$WORK"

aws_profile_ensure || cr_die "the AWS identity for this run could not be settled. Nothing was changed."

# ── The bucket ───────────────────────────────────────────────────────────────

# Terraform keeps no null output in its state, so the name may be absent as
# well as null while the gate is off; a state that cannot be read refuses with
# Terraform's own words, because it could be hiding a bucket that exists.
if ! "$TF_BIN" -chdir="${REPO_ROOT}/terraform/${TARGET}" output -json </dev/null >"${WORK}/outputs.json" 2>"${WORK}/tf.err"; then
  cr_die "could not read the terraform/${TARGET} state: $(grep -v '^[[:space:]]*$' "${WORK}/tf.err" | tail -n 1). Nothing was changed."
fi
jq -e 'type == "object"' "${WORK}/outputs.json" >/dev/null 2>&1 \
  || cr_die "terraform/${TARGET} outputs are not a JSON object of outputs. Nothing was changed."
BUCKET_JSON="$(jq -c '.legacy_mirror_backup_bucket_name.value // null' "${WORK}/outputs.json")"
if [[ "$BUCKET_JSON" == "null" ]]; then
  echo "Turn the gate on in the production values file and apply it:" >&2
  echo "  bash scripts/set-terraform-gate.sh --target production \\" >&2
  echo "    --gate enable_legacy_mirror_backup --state on" >&2
  cr_die "there is no backup bucket: legacy_mirror_backup_bucket_name is absent or null because enable_legacy_mirror_backup is off in ${TARGET}. Nothing was changed."
fi
[[ "$BUCKET_JSON" =~ ^\"([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\"$ ]] \
  || cr_die "terraform/${TARGET} output legacy_mirror_backup_bucket_name is not a bucket name: ${BUCKET_JSON}. Nothing was changed."
BUCKET="${BASH_REMATCH[1]}"
echo "Bucket: s3://${BUCKET} (${BUCKET_REGION})"

# ── The file list ────────────────────────────────────────────────────────────

MANIFEST="${WORK}/manifest.tsv"
if ! "$AWS_BIN" s3 cp "s3://${BUCKET}/manifests/latest.tsv" "$MANIFEST" --region "$BUCKET_REGION" \
      --only-show-errors </dev/null >/dev/null 2>"${WORK}/manifest.err"; then
  err="$(grep -v '^[[:space:]]*$' "${WORK}/manifest.err" | tail -n 1)"
  if grep -qE '\((404|NoSuchKey|NotFound)\)|Not Found' <<<"$err"; then
    cr_die "s3://${BUCKET} holds no manifests/latest.tsv, so the crawl was never backed up whole and nothing can be checked. Nothing was changed."
  fi
  cr_die "could not read s3://${BUCKET}/manifests/latest.tsv; AWS answered: ${err}. Nothing was changed."
fi
[[ -s "$MANIFEST" ]] || cr_die "manifests/latest.tsv in s3://${BUCKET} is empty. Nothing was changed."
BAD_LINES="$(grep -cvE $'^[^\t]+\t[0-9]+\t[0-9a-f]{64}$' "$MANIFEST" || [[ $? == 1 ]])"
[[ "$BAD_LINES" == 0 ]] \
  || cr_die "manifests/latest.tsv holds ${BAD_LINES} line(s) that are not path, size and SHA-256. Nothing was changed."
LC_ALL=C sort -t $'\t' -k1,1 "$MANIFEST" > "${WORK}/manifest.sorted"
FILE_COUNT="$(grep -c '' "$MANIFEST")"
TOTAL_BYTES="$(awk -F'\t' '{ s += $2 } END { printf "%.0f", s }' "$MANIFEST")"
echo "File list: ${FILE_COUNT} files, ${TOTAL_BYTES} bytes"

# ── Where each listed file stands ────────────────────────────────────────────

# classify: one line per listed file, "<state>\t<path>\t<size>", into
# classified.tsv, with state ready, inflight, none (not requested), missing
# (not in the bucket) or wrongsize; and the paths in the bucket that are not on
# the list into extras.txt. One listing serves every file: S3 returns each
# object's restore status beside it when asked for RestoreStatus, and leaves it
# out of an object never restored. A class other than the two archive classes
# is readable as it is, so it counts as ready.
classify() {
  if ! "$AWS_BIN" s3api list-objects-v2 --bucket "$BUCKET" --prefix mirror/ --region "$BUCKET_REGION" \
        --optional-object-attributes RestoreStatus --output json </dev/null >"${WORK}/listing.json" 2>"${WORK}/list.err"; then
    cr_die "could not list s3://${BUCKET}/mirror/; AWS answered: $(tail -n 1 "${WORK}/list.err")"
  fi
  # shellcheck disable=SC2016
  jq -r '(.Contents // [])[] | select(.Key | startswith("mirror/"))
    | [(.Key | ltrimstr("mirror/")), (.Size | tostring), (.StorageClass // "STANDARD"),
       (if .RestoreStatus == null then "none"
        elif .RestoreStatus.IsRestoreInProgress == true then "inflight"
        else "ready" end),
       (.RestoreStatus.RestoreExpiryDate // "")] | @tsv' "${WORK}/listing.json" \
    | LC_ALL=C sort -t $'\t' -k1,1 > "${WORK}/listing.tsv" \
    || cr_die "the listing of s3://${BUCKET}/mirror/ could not be read as JSON"
  LC_ALL=C join -t $'\t' -a 1 -e MISSING -o '1.1,1.2,2.2,2.3,2.4' \
    "${WORK}/manifest.sorted" "${WORK}/listing.tsv" \
    | awk -F'\t' -v OFS='\t' '{
        if ($3 == "MISSING") s = "missing";
        else if ($3 != $2) s = "wrongsize";
        else if ($5 == "none" && $4 != "DEEP_ARCHIVE" && $4 != "GLACIER") s = "ready";
        else s = $5;
        print s, $1, $2 }' > "${WORK}/classified.tsv"
  LC_ALL=C comm -13 <(cut -f1 "${WORK}/manifest.sorted") <(cut -f1 "${WORK}/listing.tsv") > "${WORK}/extras.txt"
}

# count_state <state>: files in that state.
count_state() { grep -c "^$1"$'\t' "${WORK}/classified.tsv" || [[ $? == 1 ]]; }
bytes_state() { awk -F'\t' -v s="$1" '$1 == s { b += $3 } END { printf "%.0f", b }' "${WORK}/classified.tsv"; }

report() {
  N_READY="$(count_state ready)"
  N_INFLIGHT="$(count_state inflight)"
  N_NONE="$(count_state none)"
  N_MISSING="$(count_state missing)"
  N_WRONG="$(count_state wrongsize)"
  echo "  restored, readable:   ${N_READY} ($(bytes_state ready) bytes)"
  echo "  restore in flight:    ${N_INFLIGHT} ($(bytes_state inflight) bytes)"
  echo "  not yet requested:    ${N_NONE} ($(bytes_state none) bytes)"
  local soonest
  soonest="$(awk -F'\t' '$4 == "ready" && $5 != "" { print $5 }' "${WORK}/listing.tsv" | LC_ALL=C sort | sed -n 1p)"
  [[ -n "$soonest" ]] && echo "  the first restored copy expires at ${soonest}"
  if (( N_MISSING > 0 )); then
    grep "^missing"$'\t' "${WORK}/classified.tsv" | cut -f2 | sed -n '1,20s/^/    /p' >&2
    cr_error "${N_MISSING} listed file(s) are not in s3://${BUCKET}/mirror/ (up to 20 listed above); re-run backup-legacy-mirror.sh from the crawl if it still holds them"
  fi
  if (( N_WRONG > 0 )); then
    grep "^wrongsize"$'\t' "${WORK}/classified.tsv" | cut -f2 | sed -n '1,20s/^/    /p' >&2
    cr_error "${N_WRONG} listed file(s) are in s3://${BUCKET}/mirror/ at another size than the list says (up to 20 listed above)"
  fi
  return 0
}

echo "==> Restore status of the listed files"
classify
report

# ── --dry-run and --status ───────────────────────────────────────────────────

if [[ "$MODE" == "dry-run" ]]; then
  echo "  --request would ask for ${N_NONE} restore(s); --download needs all ${FILE_COUNT} restored."
  cr_proved "${FILE_COUNT} listed files (${TOTAL_BYTES} bytes): ${N_READY} restored, ${N_INFLIGHT} in flight, ${N_NONE} not requested"
  cr_unproved "nothing was requested or downloaded: a dry run"
  cr_finish
fi

if [[ "$MODE" == "status" ]]; then
  cr_proved "${FILE_COUNT} listed files (${TOTAL_BYTES} bytes): ${N_READY} restored, ${N_INFLIGHT} in flight, ${N_NONE} not requested"
  if (( N_READY == FILE_COUNT )); then
    cr_proved "every listed file is restored and can be downloaded"
    cr_finish_with 0 READY
  fi
  cr_unproved "the download: $(( FILE_COUNT - N_READY )) listed file(s) are not restored yet"
  cr_finish_with 3 "NOT READY"
fi

# ── --request ────────────────────────────────────────────────────────────────

if [[ "$MODE" == "request" ]]; then
  grep "^none"$'\t' "${WORK}/classified.tsv" > "${WORK}/to_request.tsv" || [[ $? == 1 ]]
  if (( N_NONE == 0 )); then
    echo "  every listed file is restored or already in flight; nothing to request."
    cr_proved "every listed file in s3://${BUCKET}/mirror/ is restored or in flight; nothing was requested"
    cr_finish_with 0 "DONE, NOTHING TO REQUEST"
  fi
  echo ""
  echo "About to ask AWS to restore ${N_NONE} file(s), $(bytes_state none) bytes, from Deep Archive"
  echo "in s3://${BUCKET}, at the ${TIER} tier, each readable for ${DAYS} day(s) once restored."
  echo "Deep Archive retrieval is billed per byte and per request, and every"
  echo "restored copy is billed as stored for those days on top of the archive."
  echo "Files already restored (${N_READY}) or in flight (${N_INFLIGHT}) are not asked for again."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to request the restore: " "APPLY"; then
    echo "Not confirmed; nothing was requested." >&2
    cr_unproved "the restore request: not confirmed, and nothing was requested"
    cr_finish_with 1 ABORTED
  fi

  REQUEST="{\"Days\":${DAYS},\"GlacierJobParameters\":{\"Tier\":\"${TIER}\"}}"
  requested=0
  raced=0
  failed=0
  while IFS=$'\t' read -r _ path _; do
    if "$AWS_BIN" s3api restore-object --bucket "$BUCKET" --key "mirror/${path}" --region "$BUCKET_REGION" \
          --restore-request "$REQUEST" </dev/null >/dev/null 2>"${WORK}/restore.err"; then
      requested=$((requested + 1))
    # Another run's request landed between the listing and this one. AWS
    # documents this answer for it; the file is in flight, which is the goal.
    elif grep -q '(RestoreAlreadyInProgress)' "${WORK}/restore.err"; then
      raced=$((raced + 1))
    else
      cr_error "the restore of mirror/${path} was not requested; AWS answered: $(tail -n 1 "${WORK}/restore.err")"
      failed=$((failed + 1))
    fi
  done < "${WORK}/to_request.tsv"
  echo "  ${requested} requested, ${raced} already in flight from elsewhere, ${failed} failed"

  # The outcome is read back from the bucket, not taken from the answers.
  echo "==> Reading the restore status back"
  classify
  report
  if (( N_NONE > 0 )); then
    cr_error "${N_NONE} listed file(s) still show no restore after the request; a re-run asks for them again"
  else
    cr_proved "every listed file now reads back as restored or in flight (${N_READY} restored, ${N_INFLIGHT} in flight)"
  fi
  cr_unproved "the restores finishing: run --status later (Standard takes up to about 12 hours, Bulk up to about 48)"
  cr_finish
fi

# ── --download ───────────────────────────────────────────────────────────────

NOT_READY=$(( FILE_COUNT - N_READY ))
if (( NOT_READY > 0 )); then
  cr_die "${NOT_READY} listed file(s) are not restored yet (${N_INFLIGHT} in flight, ${N_NONE} not requested, $(( N_MISSING + N_WRONG )) missing or at another size); run --request and wait for --status to say READY. Nothing was downloaded."
fi

# Everything in --dest from here on is this run's: it was empty or absent. A
# run that does not end proven takes it back out, so a re-run starts clean.
DEST_CREATED=0
DOWNLOAD_PROVEN=0
remove_partial_download() {
  (( DOWNLOAD_PROVEN )) && return 0
  [[ -d "$DEST_ABS" ]] || return 0
  echo "Removing the unproven download from ${DEST_ABS}." >&2
  find "$DEST_ABS" -mindepth 1 -delete
  if (( DEST_CREATED )); then rmdir "$DEST_ABS"; fi
}
if [[ ! -d "$DEST_ABS" ]]; then
  mkdir -p "$DEST_ABS" || cr_die "could not make ${DEST_ABS}. Nothing was downloaded."
  DEST_CREATED=1
fi
cr_cleanup remove_partial_download

AVAIL="$(df -B1 --output=avail "$DEST_ABS" | tail -n 1 | tr -d ' ')"
[[ "$AVAIL" =~ ^[0-9]+$ ]] || cr_die "could not read the free space at ${DEST_ABS}. Nothing was downloaded."
(( AVAIL >= TOTAL_BYTES )) \
  || cr_die "${DEST_ABS} has ${AVAIL} bytes free and the crawl is ${TOTAL_BYTES} bytes. Nothing was downloaded."

# Objects not on the list are left out by name: they were never requested, so
# they are not readable, and they are not part of the crawl the list vouches
# for. A name holding a pattern character could leave out a listed file too;
# the check below would then name it as missing.
COPY=(s3 cp "s3://${BUCKET}/mirror/" "$DEST_ABS/" --recursive --force-glacier-transfer
  --region "$BUCKET_REGION" --only-show-errors)
N_EXTRAS=0
while IFS= read -r extra; do
  COPY+=(--exclude "$extra")
  N_EXTRAS=$((N_EXTRAS + 1))
done < "${WORK}/extras.txt"
(( N_EXTRAS > 0 )) && echo "  ${N_EXTRAS} object(s) in the bucket are not on the list and are left out."

echo "==> Downloading ${FILE_COUNT} files (${TOTAL_BYTES} bytes) into ${DEST_ABS}"
# A failed copy is already an error with the tool's last line; the run goes on
# to check what landed, so the report says how far it got.
copy_status=0
cr_run "download of the crawl" -- "$AWS_BIN" "${COPY[@]}" </dev/null || copy_status=$?
(( copy_status == 0 )) || echo "  the download exited ${copy_status}; checking what landed." >&2

# ── Prove it ─────────────────────────────────────────────────────────────────

# The same list the backup writes, built the same way from what landed, and
# compared line for line: path, size and SHA-256.
echo "==> Checking every listed file in ${DEST_ABS}"
find "$DEST_ABS" -type f -printf '%P\t%s\n' | LC_ALL=C sort -t $'\t' -k1,1 > "${WORK}/got_sizes.tsv"
find "$DEST_ABS" -type f -printf '%P\0' | LC_ALL=C sort -z > "${WORK}/got_names.bin"
( cd "$DEST_ABS" && xargs -0 -r sha256sum -- < "${WORK}/got_names.bin" ) > "${WORK}/got_sums.txt" 2> "${WORK}/sha.err" \
  || cr_error "could not checksum every downloaded file: $(tail -n 1 "${WORK}/sha.err")"
sed -E 's/^([0-9a-f]{64})  (.*)$/\2\t\1/' "${WORK}/got_sums.txt" | LC_ALL=C sort -t $'\t' -k1,1 > "${WORK}/got_sums.tsv"
LC_ALL=C join -t $'\t' "${WORK}/got_sizes.tsv" "${WORK}/got_sums.tsv" | LC_ALL=C sort > "${WORK}/got.tsv"
LC_ALL=C sort "$MANIFEST" > "${WORK}/want.tsv"
LC_ALL=C comm -23 "${WORK}/want.tsv" "${WORK}/got.tsv" > "${WORK}/bad.tsv"
LC_ALL=C comm -13 "${WORK}/want.tsv" "${WORK}/got.tsv" > "${WORK}/unlisted.tsv"
if [[ -s "${WORK}/bad.tsv" ]]; then
  cut -f1 "${WORK}/bad.tsv" | sed -n '1,20s/^/    /p' >&2
  cr_error "$(grep -c '' "${WORK}/bad.tsv") listed file(s) are missing from the download or differ from the list in size or SHA-256 (up to 20 listed above)"
fi
if [[ -s "${WORK}/unlisted.tsv" ]]; then
  cut -f1 "${WORK}/unlisted.tsv" | sed -n '1,20s/^/    /p' >&2
  cr_error "$(grep -c '' "${WORK}/unlisted.tsv") downloaded file(s) are not on the list as they are (up to 20 listed above)"
fi
if [[ -s "${WORK}/bad.tsv" || -s "${WORK}/unlisted.tsv" ]]; then
  cr_unproved "the download: it does not match the list, so it was removed"
  cr_finish
fi
DOWNLOAD_PROVEN=1
cr_proved "all ${FILE_COUNT} listed files are in ${DEST_ABS} at their listed size and SHA-256, and nothing else is"
cr_finish
