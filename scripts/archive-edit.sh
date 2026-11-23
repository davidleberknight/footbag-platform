#!/usr/bin/env bash
# archive-edit.sh
#
# The one way the legacy archive changes once its bucket is the source of
# truth. Nothing re-crawls the old site after the cutover and the publisher
# refuses, so a correction (a page fixed, a photograph replaced, a file
# withdrawn) is pulled from the bucket, edited on the workstation, checked, and
# pushed back key by key, each write conditional on the bucket still holding
# exactly what was pulled. Every push writes a report of the versions it
# replaced, and a rollback puts those versions back.
#
# Modes, one per run:
#   pull     --prefix P | --keys FILE  --dest DIR
#            Download the current objects into DIR/tree and record, per key,
#            the ETag, VersionId, size and content hash in DIR/state/ledger.tsv,
#            plus the whole bucket's key listing for the link check. DIR must
#            be absent or empty (or an unfinished pull of the same selection,
#            which is resumed); it is created mode 700 and may not sit inside
#            the repository, because the archive holds members' contact details.
#   preview  --dest DIR
#            Print the command that serves DIR/tree on 127.0.0.1 in the
#            foreground, for reading the edited pages in a browser.
#   check    --dest DIR [--delete-list FILE]
#            Judge the files added or changed since the pull with
#            check-archive-pages.py, re-encode every added or changed mp4
#            through the platform's own video transcode (refused unless the PATH
#            ffmpeg is production's pinned release) and every jpg and gif
#            through the pinned ffmpeg, and record a check stamp of the content hashes. A pulled
#            file missing from the tree must be on the delete list, and every
#            listed key must have been pulled and removed from the tree.
#   push     --dest DIR [--delete-list FILE]
#            Write the checked changes: changed keys with --if-match on the
#            pulled ETag, new keys with --if-none-match '*', listed deletes with
#            --if-match, each Content-Type from a fixed table. Then invalidate
#            exactly the changed paths and run the edge proof. The versions
#            replaced are written to DIR/state/push-<time>.tsv as each key lands.
#   rollback --report FILE
#            For every key in a push report whose current version is still the
#            one that push wrote: copy the replaced version back, or for a key
#            the push created, delete it (a delete marker, so the pushed version
#            stays recoverable), or for a key the push deleted, restore the
#            deleted version. Then invalidate and run the edge proof.
#
# What it refuses:
#   - push and rollback unless /footbag/<env>/archive-source reads exactly
#     "bucket" (before the cutover the crawl is the source and the publisher
#     owns the bucket);
#   - push unless the current tree matches the stamp the last passing check
#     wrote, file by file and delete list included;
#   - any key under _gate/, which holds the Terraform-owned refusal pages;
#   - a delete of a key that was not pulled, or that a page in the pulled tree
#     still links to (pages the pull did not bring down are not scanned);
#   - a whole-bucket sync of any kind: no --delete, no s3 sync;
#   - push and rollback without a typed APPLY at a terminal, on any target.
#
# Usage:
#   scripts/archive-edit.sh pull     --target staging|production --prefix P --dest DIR
#   scripts/archive-edit.sh pull     --target staging|production --keys FILE --dest DIR
#   scripts/archive-edit.sh preview  --dest DIR [--port N]
#   scripts/archive-edit.sh check    --dest DIR [--delete-list FILE]
#   scripts/archive-edit.sh push     --target staging|production --dest DIR [--delete-list FILE]
#   scripts/archive-edit.sh rollback --target staging|production --report FILE
#
# Flags:
#   --target staging|production   Target environment (required for the modes
#                              that reach AWS; no default). A pulled directory
#                              records its target and refuses any other.
#   --profile <p>              AWS profile; else the identity this run settles
#                              and proves.
#   --signing-key <pem>        Passed to the edge proof (default the
#                              environment's own key).
#
# Identifiers come from terraform output in the target environment's tree.
# Credentials are operator credentials, as for the publisher.
#
# Test seams (CI only; operators never set these): FOOTBAG_AWS_BIN and
# FOOTBAG_TERRAFORM_BIN replace the AWS CLI and Terraform,
# ARCHIVE_EDIT_FFMPEG replaces the pinned ffmpeg runner for stills (called as
# "<seam> ffmpeg ARGS"), ARCHIVE_EDIT_TRANSCODE replaces the platform's video
# transcode (called as "<seam> <input> <output.mp4>"), and
# ARCHIVE_EDIT_EDGE_VERIFIER replaces the edge proof.
# Each says so on stderr when in use.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
# confirm_from_tty: the shared typed confirmation, read from the terminal.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
TF_BIN="${FOOTBAG_TERRAFORM_BIN:-terraform}"
EDGE_VERIFIER="${ARCHIVE_EDIT_EDGE_VERIFIER:-${SCRIPT_DIR}/verify-archive-edge.sh}"
FFMPEG_CMD=(bash "${SCRIPT_DIR}/ffmpeg-pinned.sh")
[[ -n "${ARCHIVE_EDIT_FFMPEG:-}" ]] && FFMPEG_CMD=("$ARCHIVE_EDIT_FFMPEG")
TRANSCODE_CMD=("${REPO_ROOT}/node_modules/.bin/tsx" "${SCRIPT_DIR}/transcode-curator-video.ts")
[[ -n "${ARCHIVE_EDIT_TRANSCODE:-}" ]] && TRANSCODE_CMD=("$ARCHIVE_EDIT_TRANSCODE")
[[ -n "${ARCHIVE_EDIT_TRANSCODE:-}" ]] && echo "NOTE: using a stand-in for the platform's video transcode; this run proves nothing about how video is encoded." >&2
CHECKER="${SCRIPT_DIR}/check-archive-pages.py"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
[[ -n "${FOOTBAG_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the identifiers this run uses are not the estate's." >&2
[[ -n "${ARCHIVE_EDIT_FFMPEG:-}" ]] && echo "NOTE: using a stand-in for the pinned ffmpeg; this run proves nothing about how media is encoded." >&2
[[ -n "${ARCHIVE_EDIT_EDGE_VERIFIER:-}" ]] && echo "NOTE: using a stand-in for the edge proof; this run proves nothing about what members are served." >&2

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

MODE="${1:-}"
case "$MODE" in
  pull|preview|check|push|rollback) shift ;;
  -h|--help) usage ;;
  *) echo "ERROR: the first argument must be a mode: pull, preview, check, push or rollback" >&2; exit 2 ;;
esac

TARGET_ENV=""
PREFIX=""
PREFIX_SET=0
KEYS_FILE=""
DEST=""
DELETE_LIST=""
REPORT=""
PORT=8000
AWS_PROFILE_ARG=""
SIGNING_KEY=""
need_value() { [[ $# -ge 2 && -n "$2" ]] || { echo "ERROR: $1 requires an argument" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) need_value "$@"; TARGET_ENV="$2"; shift 2 ;;
    --prefix) [[ $# -ge 2 ]] || { echo "ERROR: --prefix requires an argument" >&2; exit 2; }; PREFIX="$2"; PREFIX_SET=1; shift 2 ;;
    --keys) need_value "$@"; KEYS_FILE="$2"; shift 2 ;;
    --dest) need_value "$@"; DEST="$2"; shift 2 ;;
    --delete-list) need_value "$@"; DELETE_LIST="$2"; shift 2 ;;
    --report) need_value "$@"; REPORT="$2"; shift 2 ;;
    --port) need_value "$@"; PORT="$2"; shift 2 ;;
    --profile) need_value "$@"; AWS_PROFILE_ARG="$2"; shift 2 ;;
    --signing-key) need_value "$@"; SIGNING_KEY="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$MODE" in
  pull|push|rollback)
    if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
      echo "ERROR: --target must be 'staging' or 'production'" >&2
      exit 2
    fi ;;
  *)
    [[ -z "$TARGET_ENV" ]] || { echo "ERROR: ${MODE} reaches no environment and takes no --target" >&2; exit 2; } ;;
esac
case "$MODE" in
  pull)
    [[ -n "$DEST" ]] || { echo "ERROR: pull needs --dest" >&2; exit 2; }
    if [[ "$PREFIX_SET" -eq 1 && -n "$KEYS_FILE" ]] || [[ "$PREFIX_SET" -eq 0 && -z "$KEYS_FILE" ]]; then
      echo "ERROR: pull needs exactly one of --prefix or --keys" >&2; exit 2
    fi ;;
  preview|check|push)
    [[ -n "$DEST" ]] || { echo "ERROR: ${MODE} needs --dest" >&2; exit 2; } ;;
  rollback)
    [[ -n "$REPORT" ]] || { echo "ERROR: rollback needs --report" >&2; exit 2; } ;;
esac
[[ "$PORT" =~ ^[1-9][0-9]{0,4}$ ]] || { echo "ERROR: --port must be a port number" >&2; exit 2; }

# The operator's paths are read against the directory they typed them in; the
# rest of the run is anchored on the repository, whatever that directory was.
for var in DEST KEYS_FILE DELETE_LIST REPORT SIGNING_KEY; do
  [[ -n "${!var}" ]] && printf -v "$var" '%s' "$(realpath -m -- "${!var}")"
done
cd "$REPO_ROOT"

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

umask 077
WORK_DIR="$(mktemp -d /tmp/footbag-archive-edit.XXXXXX)"
cr_cleanup rm -rf "${WORK_DIR}"

if [[ -n "$DEST" ]]; then
  TREE="${DEST}/tree"
  STATE="${DEST}/state"
  LEDGER="${STATE}/ledger.tsv"
  BUCKET_KEYS="${STATE}/bucket-keys.txt"
  STAMP="${STATE}/check-stamp.tsv"
  ENCODED="${STATE}/media-encoded.tsv"
  DELETED_LEDGER="${STATE}/deleted.tsv"
fi

# ---- Shared helpers ------------------------------------------------------------

sha_of() { sha256sum -- "$1" | cut -d' ' -f1; }

# A key the archive can hold and this script may touch. _gate/ is Terraform's.
key_problem() {
  local key="$1"
  case "$key" in
    '') echo "an empty key" ;;
    /*) echo "a key with a leading slash" ;;
    */) echo "a directory marker" ;;
    _gate/*) echo "a key under the reserved _gate/ prefix" ;;
    *$'\t'*|*$'\n'*) echo "a key holding a tab or line break" ;;
    ..|../*|*/..|*/../*|*//*|.|./*|*/.|*/./*) echo "a key with an empty, '.' or '..' segment" ;;
    *) return 1 ;;
  esac
}

AWS_ARGS=()
settle_identity() {
  if [[ -n "$AWS_PROFILE_ARG" ]]; then
    AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
  else
    aws_profile_ensure || cr_die "could not settle the AWS identity this run uses"
  fi
}

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV:-none}"
tf_out() { "$TF_BIN" -chdir="$TF_DIR" output -raw "$1" 2>>"${WORK_DIR}/terraform.err"; }
read_bucket() {
  BUCKET="$(tf_out archive_bucket_name)" || BUCKET=""
  if [[ -z "$BUCKET" ]]; then
    tf_said="$(grep -v '^[[:space:]]*$' "${WORK_DIR}/terraform.err" | tail -n 1 || [[ $? == 1 ]])"
    cr_die "the archive bucket name is empty in ${TF_DIR}: ${tf_said:-terraform printed no error}"
  fi
}
read_distribution() {
  DIST_ID="$(tf_out archive_distribution_id)" || DIST_ID=""
  if [[ -z "$DIST_ID" ]]; then
    tf_said="$(grep -v '^[[:space:]]*$' "${WORK_DIR}/terraform.err" | tail -n 1 || [[ $? == 1 ]])"
    cr_die "the archive distribution id is empty in ${TF_DIR}: ${tf_said:-terraform printed no error}"
  fi
}

# Every AWS call runs with stdin closed: most run inside a loop that is reading
# a key list on stdin, which a child that reads stdin would silently consume.
aws_call() { "$AWS_BIN" "$@" < /dev/null; }

aws_said() { grep -v '^[[:space:]]*$' "$1" | tail -n 1 || [[ $? == 1 ]]; }

# Edits are allowed only once the bucket is the source of truth, which the
# cutover records in this parameter. Anything but exactly "bucket" refuses,
# a missing parameter included; a read that failed for another reason is an
# error carrying AWS's message, never taken for an answer.
require_bucket_source() {
  local name="/footbag/${TARGET_ENV}/archive-source" value
  if ! value="$(aws_call ssm get-parameter --name "$name" --query Parameter.Value \
      --output text "${AWS_ARGS[@]}" 2> "${WORK_DIR}/ssm.err")"; then
    if grep -q 'ParameterNotFound' "${WORK_DIR}/ssm.err"; then
      cr_die "REFUSING: ${name} does not exist, so the bucket is not yet the archive's source of truth"
    fi
    cr_die "could not read ${name}: $(aws_said "${WORK_DIR}/ssm.err")"
  fi
  if [[ "$value" != "bucket" ]]; then
    echo "Before the cutover the crawl is the archive's source and the publisher" >&2
    echo "owns the bucket; an edit here would be overwritten by the next publish." >&2
    cr_die "REFUSING: ${name} reads '${value}', not 'bucket'"
  fi
  echo "Archive source: ${name} reads 'bucket'."
}

# Content-Type per extension, fixed, so an edited key is served exactly as the
# published ones are and never as whatever a workstation's type table guesses.
content_type_for() {
  local ext="${1##*.}"
  case "${ext,,}" in
    html|htm) echo "text/html" ;;
    css) echo "text/css" ;;
    jpg) echo "image/jpeg" ;;
    gif) echo "image/gif" ;;
    mp4) echo "video/mp4" ;;
    pdf) echo "application/pdf" ;;
    ics) echo "text/calendar" ;;
    ttf) echo "font/ttf" ;;
    eot) echo "application/vnd.ms-fontobject" ;;
    woff) echo "font/woff" ;;
    woff2) echo "font/woff2" ;;
    ico) echo "image/vnd.microsoft.icon" ;;
    txt) echo "text/plain" ;;
    ps) echo "application/postscript" ;;
    *) return 1 ;;
  esac
}

url_path() {
  python3 -c 'import sys, urllib.parse; print("/" + urllib.parse.quote(sys.argv[1], safe="/"))' "$1"
}

require_pulled() {
  [[ -f "${STATE}/meta" && -f "$LEDGER" && -f "${STATE}/pull-complete" ]] \
    || cr_die "${DEST} holds no finished pull; run pull first"
  PULLED_TARGET="$(sed -n 's/^target=//p' "${STATE}/meta")"
  PULLED_BUCKET="$(sed -n 's/^bucket=//p' "${STATE}/meta")"
}

declare -A LEDGER_ETAG=() LEDGER_VERSION=() LEDGER_SHA=()
load_ledger() {
  local key etag version size sha
  while IFS=$'\t' read -r key etag version size sha; do
    [[ -n "$key" ]] || continue
    LEDGER_ETAG["$key"]="$etag"
    LEDGER_VERSION["$key"]="$version"
    LEDGER_SHA["$key"]="$sha"
  done < "$LEDGER"
  return 0
}

declare -A ALREADY_DELETED=()
load_deleted() {
  local key
  [[ -f "$DELETED_LEDGER" ]] || return 0
  while IFS=$'\t' read -r key _; do
    [[ -n "$key" ]] && ALREADY_DELETED["$key"]=1
  done < "$DELETED_LEDGER"
  return 0
}

# The edit relative to the pull: added and modified files, pulled files missing
# from the tree, and the delete list, each a sorted file of keys in WORK_DIR.
compute_changes() {
  : > "${WORK_DIR}/added.txt"; : > "${WORK_DIR}/modified.txt"; : > "${WORK_DIR}/missing.txt"
  : > "${WORK_DIR}/delete.txt"; : > "${WORK_DIR}/bad-keys.txt"
  declare -A seen=()
  local file key problem
  while IFS= read -r -d '' file; do
    key="${file#"${TREE}/"}"
    seen["$key"]=1
    # A link would upload whatever it points at, wherever that is.
    if [[ -L "$file" ]]; then
      printf '%s: a symbolic link\n' "$key" >> "${WORK_DIR}/bad-keys.txt"
      continue
    fi
    if problem="$(key_problem "$key")"; then
      printf '%s: %s\n' "$key" "$problem" >> "${WORK_DIR}/bad-keys.txt"
      continue
    fi
    if [[ -z "${LEDGER_SHA[$key]+x}" ]]; then
      printf '%s\n' "$key" >> "${WORK_DIR}/added.txt"
    elif [[ "$(sha_of "$file")" != "${LEDGER_SHA[$key]}" ]]; then
      printf '%s\n' "$key" >> "${WORK_DIR}/modified.txt"
    fi
  done < <(find "$TREE" \( -type f -o -type l \) -print0)
  for key in "${!LEDGER_SHA[@]}"; do
    [[ -n "${seen[$key]+x}" ]] || printf '%s\n' "$key" >> "${WORK_DIR}/missing.txt"
  done
  if [[ -n "$DELETE_LIST" ]]; then
    [[ -f "$DELETE_LIST" ]] || cr_die "the delete list is not a file: ${DELETE_LIST}"
    grep -v '^[[:space:]]*$' "$DELETE_LIST" > "${WORK_DIR}/delete.txt" || [[ $? == 1 ]]
  fi
  local f
  for f in added modified missing delete; do LC_ALL=C sort -u -o "${WORK_DIR}/${f}.txt" "${WORK_DIR}/${f}.txt"; done
  cat "${WORK_DIR}/added.txt" "${WORK_DIR}/modified.txt" | LC_ALL=C sort > "${WORK_DIR}/written.txt"
}

delete_list_hash() { sha256sum < "${WORK_DIR}/delete.txt" | cut -d' ' -f1; }

# A delete is only ever of a key the pull brought down (its ETag guards the
# delete) and that the operator has removed from the tree; a pulled file that
# disappeared without being listed is an accident, not a decision.
judge_deletes() {
  local key
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    grep -qxF -- "$key" "${WORK_DIR}/delete.txt" \
      || cr_error "${key} was pulled and is missing from the tree, but is not on the delete list; restore it or list it"
  done < "${WORK_DIR}/missing.txt"
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    if problem="$(key_problem "$key")"; then cr_error "the delete list names ${problem}: ${key}"; continue; fi
    [[ -n "${ALREADY_DELETED[$key]+x}" ]] && continue
    if [[ -z "${LEDGER_SHA[$key]+x}" ]]; then
      cr_error "the delete list names ${key}, which was not pulled; pull it so its ETag guards the delete"
    elif [[ -e "${TREE}/${key}" ]]; then
      cr_error "the delete list names ${key}, which is still in the tree; remove it there too"
    fi
  done < "${WORK_DIR}/delete.txt"
  return 0
}

# ---- pull ----------------------------------------------------------------------

mode_pull() {
  case "$DEST/" in
    "${REPO_ROOT}/"*) cr_die "REFUSING: ${DEST} is inside the repository; the archive holds members' contact details and must not sit where it could be committed" ;;
  esac
  local selection
  if [[ -n "$KEYS_FILE" ]]; then
    [[ -f "$KEYS_FILE" ]] || cr_die "the keys file is not a file: ${KEYS_FILE}"
    selection="keys:$(grep -v '^[[:space:]]*$' "$KEYS_FILE" | LC_ALL=C sort -u | sha256sum | cut -d' ' -f1)"
  else
    selection="prefix:${PREFIX}"
  fi

  local resume=0
  if [[ -e "$DEST" ]]; then
    if [[ -n "$(ls -A -- "$DEST")" ]]; then
      if [[ -f "${STATE}/meta" && ! -f "${STATE}/pull-complete" ]] \
          && grep -qxF "target=${TARGET_ENV}" "${STATE}/meta" \
          && grep -qxF "selection=${selection}" "${STATE}/meta"; then
        resume=1
        echo "Resuming an unfinished pull of the same selection in ${DEST}."
      else
        cr_die "REFUSING: ${DEST} is not empty; pull into an absent or empty directory"
      fi
    fi
  fi
  settle_identity
  read_bucket
  if [[ "$resume" -eq 0 ]]; then
    mkdir -p -m 700 -- "$DEST"
    chmod 700 -- "$DEST"
    mkdir -p -m 700 -- "$TREE" "$STATE"
    printf 'target=%s\nbucket=%s\nselection=%s\n' "$TARGET_ENV" "$BUCKET" "$selection" > "${STATE}/meta"
    : > "$LEDGER"
  fi

  echo "Listing s3://${BUCKET} for the link check ..."
  if ! aws_call s3api list-objects-v2 --bucket "$BUCKET" --query 'Contents[].Key' --output json \
      "${AWS_ARGS[@]}" > "${WORK_DIR}/listing.json" 2> "${WORK_DIR}/list.err"; then
    cr_die "the bucket listing failed: $(aws_said "${WORK_DIR}/list.err")"
  fi
  python3 -c '
import json, sys
keys = json.load(open(sys.argv[1])) or []
bad = [k for k in keys if "\n" in k]
if bad:
    sys.exit("a bucket key holds a line break: %r" % bad[0])
sys.stdout.write("".join(k + "\n" for k in keys))
' "${WORK_DIR}/listing.json" > "$BUCKET_KEYS" || cr_die "the bucket listing could not be read"
  echo "Bucket: $(grep -c '' "$BUCKET_KEYS" || [[ $? == 1 ]]) keys."

  local key problem
  : > "${WORK_DIR}/selected.txt"
  if [[ -n "$KEYS_FILE" ]]; then
    while IFS= read -r key; do
      [[ -n "$key" ]] || continue
      if problem="$(key_problem "$key")"; then cr_error "the keys file names ${problem}: ${key}"; continue; fi
      grep -qxF -- "$key" "$BUCKET_KEYS" || { cr_error "the keys file names ${key}, which the bucket does not hold"; continue; }
      printf '%s\n' "$key" >> "${WORK_DIR}/selected.txt"
    done < <(grep -v '^[[:space:]]*$' "$KEYS_FILE" | LC_ALL=C sort -u)
    [[ "${#CR_ERRORS[@]}" -eq 0 ]] || cr_die "REFUSING: the keys file names keys this pull cannot fetch; nothing was downloaded"
  else
    local skipped=0
    while IFS= read -r key; do
      [[ "$key" == "$PREFIX"* ]] || continue
      if key_problem "$key" >/dev/null; then skipped=$((skipped + 1)); continue; fi
      printf '%s\n' "$key" >> "${WORK_DIR}/selected.txt"
    done < "$BUCKET_KEYS"
    [[ "$skipped" -gt 0 ]] && echo "Skipped ${skipped} key(s) this script never edits (_gate/, directory markers)."
  fi
  local total
  total="$(grep -c '' "${WORK_DIR}/selected.txt" || [[ $? == 1 ]])"
  [[ "$total" -gt 0 ]] || cr_die "REFUSING: the selection matches no editable key"

  declare -A have=()
  local k _rest
  while IFS=$'\t' read -r k _rest; do [[ -n "$k" ]] && have["$k"]=1; done < "$LEDGER"
  local n=0 out meta etag version size
  while IFS= read -r key; do
    n=$((n + 1))
    if [[ -n "${have[$key]+x}" && -f "${TREE}/${key}" ]]; then continue; fi
    out="${TREE}/${key}"
    mkdir -p -- "$(dirname -- "$out")"
    if ! meta="$(aws_call s3api get-object --bucket "$BUCKET" --key "$key" "$out" \
        --query '[ETag,VersionId,ContentLength]' --output text "${AWS_ARGS[@]}" 2> "${WORK_DIR}/get.err")"; then
      cr_die "downloading ${key} failed after ${n} of ${total}; re-run the same pull to finish: $(aws_said "${WORK_DIR}/get.err")"
    fi
    IFS=$'\t' read -r etag version size <<< "$meta"
    if [[ -z "$version" || "$version" == "None" || "$version" == "null" ]]; then
      cr_die "REFUSING: ${key} has no version id, so the bucket is not versioned and no edit could be rolled back"
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$key" "$etag" "$version" "$size" "$(sha_of "$out")" >> "$LEDGER"
  done < "${WORK_DIR}/selected.txt"
  : > "${STATE}/pull-complete"
  echo "Pulled ${total} key(s) into ${TREE}."
  cr_proved "every selected key was downloaded with its ETag and version recorded"
  cr_finish
}

# ---- preview -------------------------------------------------------------------

mode_preview() {
  [[ -d "$TREE" ]] || cr_die "${DEST} holds no pulled tree; run pull first"
  echo "To read the pulled tree in a browser, run this in its own terminal; it"
  echo "serves only to this machine and stops when you press Ctrl-C:"
  echo ""
  printf '    python3 -m http.server --bind 127.0.0.1 --directory %q %s\n' "$TREE" "$PORT"
  echo ""
  echo "Then open http://127.0.0.1:${PORT}/ (root-relative links resolve as the archive does)."
  cr_finish
}

# ---- check ---------------------------------------------------------------------

media_magic_ok() {
  local file="$1" ext="${1##*.}" head4 at4
  head4="$(head -c 4 -- "$file" | od -An -tx1 | tr -d ' \n')"
  at4="$(head -c 8 -- "$file" | tail -c 4)"
  case "${ext,,}" in
    jpg) [[ "$head4" == ffd8ff* ]] ;;
    gif) [[ "$head4" == 47494638 ]] ;;
    # The inputs the platform's video transcode accepts: MP4 (ftyp), the
    # classic QuickTime atoms, and WebM.
    mp4) [[ "$at4" =~ ^(ftyp|moov|mdat|wide|free|skip|pnot)$ || "$head4" == 1a45dfa3 ]] ;;
    *) return 1 ;;
  esac
}

# The video transcode is the platform's own, the function the image worker
# runs, reached through its command-line entry, so that tightening it once
# tightens every path that turns video into served video; it reads
# FFMPEG_TIMEOUT_SECONDS from the environment, which passes through unchanged.
# It finds ffmpeg on the PATH, so before any video encode the PATH ffmpeg is
# proved to be production's pinned release, by the same check the workstation
# setup uses to decide what to install.
require_video_encoder() {
  if [[ -z "${ARCHIVE_EDIT_TRANSCODE:-}" && ! -x "${TRANSCODE_CMD[0]}" ]]; then
    cr_die "REFUSING: ${TRANSCODE_CMD[0]} is missing, so the platform's video transcode cannot run; install the dependencies with npm ci"
  fi
  # shellcheck source=lib/tool-report.sh
  source "${SCRIPT_DIR}/lib/tool-report.sh"
  if ! tool_report ffmpeg > "${WORK_DIR}/ffmpeg-pin.txt"; then
    local line
    while IFS= read -r line; do
      [[ "$line" == *'[missing]'* ]] && cr_error "${line#*\[missing\] }"
    done < "${WORK_DIR}/ffmpeg-pin.txt"
    cr_die "REFUSING: the ffmpeg on the PATH is not production's pinned release; bash scripts/setup-dev-workstation.sh installs it (scripts/ffmpeg-pinned.sh --install)"
  fi
}

# The sanitising encodes. Video goes through the platform's transcode; stills
# use the archive's own conversion (single frame, JPEG quality about 85) with
# metadata dropped; GIFs a plain round trip, which keeps the animation. Each
# rebuilds the bytes from the picture, which is what strips anything else a
# file carried.
encode_media() {
  local in="$1" out="$2" ext="${1##*.}"
  case "${ext,,}" in
    mp4)
      "${TRANSCODE_CMD[@]}" "$in" "$out" ;;
    jpg)
      "${FFMPEG_CMD[@]}" ffmpeg -nostdin -loglevel error -i "$in" -map_metadata -1 \
        -frames:v 1 -q:v 4 -y "$out" ;;
    gif)
      "${FFMPEG_CMD[@]}" ffmpeg -nostdin -loglevel error -i "$in" -map_metadata -1 -y "$out" ;;
  esac
}

mode_check() {
  require_pulled
  load_ledger
  load_deleted
  compute_changes
  if [[ -s "${WORK_DIR}/bad-keys.txt" ]]; then
    while IFS= read -r line; do cr_error "the tree holds ${line}"; done < "${WORK_DIR}/bad-keys.txt"
  fi
  judge_deletes

  local written deleted
  written="$(grep -c '' "${WORK_DIR}/written.txt" || [[ $? == 1 ]])"
  deleted="$(grep -c '' "${WORK_DIR}/delete.txt" || [[ $? == 1 ]])"
  echo "Edit: $(grep -c '' "${WORK_DIR}/added.txt" || [[ $? == 1 ]]) added, $(grep -c '' "${WORK_DIR}/modified.txt" || [[ $? == 1 ]]) changed, ${deleted} to delete."

  local rc=0
  python3 "$CHECKER" --root "$TREE" --bucket-keys "$BUCKET_KEYS" --only "${WORK_DIR}/written.txt" \
    --deleted "${WORK_DIR}/delete.txt" > "${WORK_DIR}/findings.txt" 2> "${WORK_DIR}/checker.err" || rc=$?
  if [[ "$rc" -ge 2 ]]; then
    cr_die "the page checker could not run: $(aws_said "${WORK_DIR}/checker.err")"
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] && cr_error "$line"
  done < "${WORK_DIR}/findings.txt"
  if [[ "${#CR_ERRORS[@]}" -gt 0 ]]; then
    rm -f -- "$STAMP"
    cr_die "the edit did not pass its check; nothing was encoded and no stamp was written"
  fi

  declare -A encoded=()
  local k s
  if [[ -f "$ENCODED" ]]; then
    while IFS=$'\t' read -r k s; do [[ -n "$k" ]] && encoded["$k"]="$s"; done < "$ENCODED"
  fi
  local key file sha ext n_encoded=0 stage out video_ready=0
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    ext="${key##*.}"
    case "${ext,,}" in jpg|gif|mp4) ;; *) continue ;; esac
    file="${TREE}/${key}"
    sha="$(sha_of "$file")"
    if [[ "${encoded[$key]:-}" == "$sha" ]]; then
      echo "  ${key}: already this run's own encode (content hash matches), not re-encoded"
      continue
    fi
    # A video's input format is judged by the transcode itself, which refuses
    # anything it does not recognise as video.
    if [[ "${ext,,}" == mp4 ]]; then
      [[ "$video_ready" -eq 1 ]] || { require_video_encoder; video_ready=1; }
    else
      media_magic_ok "$file" || { cr_error "${key}: its bytes are not the format its name claims"; continue; }
    fi
    # Under /tmp, which the pinned runner mounts at the same path.
    stage="$(mktemp -d "${WORK_DIR}/encode.XXXXXX")"
    cp -- "$file" "${stage}/in.${ext,,}"
    out="${stage}/out.${ext,,}"
    echo "  encoding ${key} ..."
    # stdin closed: the pinned runner forwards it into the container, and here
    # it is the list of keys this loop is reading.
    if ! encode_media "${stage}/in.${ext,,}" "$out" < /dev/null 2> "${stage}/ffmpeg.err" || [[ ! -s "$out" ]]; then
      cr_error "${key}: the sanitising encode failed: $(aws_said "${stage}/ffmpeg.err")"
      continue
    fi
    media_magic_ok "$out" || { cr_error "${key}: the encode produced bytes that are not a ${ext,,}"; continue; }
    cat -- "$out" > "$file"
    sha="$(sha_of "$file")"
    printf '%s\t%s\n' "$key" "$sha" >> "$ENCODED"
    encoded["$key"]="$sha"
    n_encoded=$((n_encoded + 1))
  done < "${WORK_DIR}/written.txt"
  if [[ "${#CR_ERRORS[@]}" -gt 0 ]]; then
    rm -f -- "$STAMP"
    cr_die "a media file could not be sanitised; no stamp was written"
  fi

  {
    printf 'delete-list\t%s\n' "$(delete_list_hash)"
    while IFS= read -r key; do
      [[ -n "$key" ]] && printf 'file\t%s\t%s\n' "$key" "$(sha_of "${TREE}/${key}")"
    done < "${WORK_DIR}/written.txt"
  } > "$STAMP"
  echo "Check passed: ${written} file(s) to write (${n_encoded} re-encoded), ${deleted} to delete. Stamp: ${STAMP}"
  cr_proved "every added or changed file passed the page checks and every added or changed media file is a sanitising encode"
  cr_unproved "links from pages the pull did not bring down to any key this edit deletes"
  cr_finish
}

# ---- push ----------------------------------------------------------------------

verify_stamp() {
  [[ -f "$STAMP" ]] || cr_die "REFUSING: no passing check is recorded for ${DEST}; run check first"
  local want
  want="$(sed -n 's/^delete-list\t//p' "$STAMP")"
  [[ "$want" == "$(delete_list_hash)" ]] \
    || cr_die "REFUSING: the delete list is not the one the last check passed; run check again with it"
  declare -A stamped=()
  local kind key sha
  while IFS=$'\t' read -r kind key sha; do
    [[ "$kind" == "file" ]] && stamped["$key"]="$sha"
  done < "$STAMP"
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    [[ "${stamped[$key]:-}" == "$(sha_of "${TREE}/${key}")" ]] \
      || cr_die "REFUSING: ${key} has changed since the last passing check; run check again"
  done < "${WORK_DIR}/written.txt"
  return 0
}

# One line per key as it lands, so an interrupted push still leaves a report a
# rollback can use: action, key, version and ETag before, version and ETag after.
record_push() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$PUSH_REPORT"; }

update_ledger_row() {
  local key="$1" etag="$2" version="$3" file="$4" tmp
  tmp="${WORK_DIR}/ledger.new"
  awk -F'\t' -v k="$key" '$1 != k' "$LEDGER" > "$tmp"
  printf '%s\t%s\t%s\t%s\t%s\n' "$key" "$etag" "$version" "$(stat -c %s -- "$file")" "$(sha_of "$file")" >> "$tmp"
  cat "$tmp" > "$LEDGER"
}

drop_ledger_row() {
  local key="$1" version="$2"
  awk -F'\t' -v k="$key" '$1 != k' "$LEDGER" > "${WORK_DIR}/ledger.new"
  cat "${WORK_DIR}/ledger.new" > "$LEDGER"
  printf '%s\t%s\n' "$key" "$version" >> "$DELETED_LEDGER"
}

INVALIDATE=()
invalidate_and_verify() {
  local what="$1"
  if [[ "${#INVALIDATE[@]}" -eq 0 ]]; then
    cr_unproved "the edge proof (nothing was written, so nothing was invalidated)"
    return 0
  fi
  read_distribution
  local paths=() p i id
  for p in "${INVALIDATE[@]}"; do paths+=("$(url_path "$p")"); done
  # CloudFront takes at most a thousand paths in one request.
  for ((i = 0; i < ${#paths[@]}; i += 1000)); do
    if ! id="$(aws_call cloudfront create-invalidation --distribution-id "$DIST_ID" \
        --paths "${paths[@]:i:1000}" --query 'Invalidation.Id' --output text \
        "${AWS_ARGS[@]}" 2> "${WORK_DIR}/inv.err")"; then
      cr_error "the invalidation failed, so the edge may serve the old bytes for up to a year: $(aws_said "${WORK_DIR}/inv.err")"
      return 0
    fi
    echo "Invalidation created: ${id} ($(( ${#paths[@]} - i < 1000 ? ${#paths[@]} - i : 1000 )) path(s))"
  done
  cr_proved "exactly the ${#paths[@]} path(s) this ${what} wrote were invalidated"
  local edge_args=(--target "$TARGET_ENV")
  [[ -n "$AWS_PROFILE_ARG" ]] && edge_args+=(--profile "$AWS_PROFILE_ARG")
  [[ -n "$SIGNING_KEY" ]] && edge_args+=(--signing-key "$SIGNING_KEY")
  if bash "$EDGE_VERIFIER" "${edge_args[@]}"; then
    cr_proved "a member's signed request reads the archive through the distribution after the ${what}"
  else
    cr_error "the edge proof failed after the ${what}; the invalidation may still be settling, so retry it before investigating"
  fi
}

mode_push() {
  require_pulled
  [[ "$PULLED_TARGET" == "$TARGET_ENV" ]] \
    || cr_die "REFUSING: ${DEST} was pulled from ${PULLED_TARGET}, not ${TARGET_ENV}"
  load_ledger
  load_deleted
  compute_changes
  [[ ! -s "${WORK_DIR}/bad-keys.txt" ]] || cr_die "REFUSING: the tree holds keys this script never writes; run check"
  verify_stamp
  judge_deletes
  [[ "${#CR_ERRORS[@]}" -eq 0 ]] || cr_die "REFUSING: the deletes do not match the tree; run check"

  settle_identity
  read_bucket
  [[ "$BUCKET" == "$PULLED_BUCKET" ]] \
    || cr_die "REFUSING: ${DEST} was pulled from s3://${PULLED_BUCKET}, but ${TARGET_ENV}'s archive bucket is s3://${BUCKET}"
  require_bucket_source

  # A key an earlier push from this directory deleted is done only if the
  # bucket still answers that it is absent.
  local key now pending_deletes=()
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    if [[ -z "${ALREADY_DELETED[$key]+x}" ]]; then
      pending_deletes+=("$key")
      continue
    fi
    now="$(current_of "$key")" || cr_die "$(aws_said "${WORK_DIR}/head.err")"
    [[ "$now" == "absent" ]] \
      || cr_die "REFUSING: ${key} was deleted by an earlier push from this directory but exists again; pull afresh"
    echo "  ${key}: already deleted by an earlier push (read back: absent)"
  done < "${WORK_DIR}/delete.txt"
  local n_add n_mod
  n_add="$(grep -c '' "${WORK_DIR}/added.txt" || [[ $? == 1 ]])"
  n_mod="$(grep -c '' "${WORK_DIR}/modified.txt" || [[ $? == 1 ]])"
  if [[ "$n_add" -eq 0 && "$n_mod" -eq 0 && "${#pending_deletes[@]}" -eq 0 ]]; then
    echo "Nothing to push: the tree matches the bucket as last pulled or pushed."
    cr_proved "the tree holds no change the bucket lacks"
    cr_finish
  fi

  echo ""
  echo "About to change s3://${BUCKET} (${TARGET_ENV}):"
  while IFS= read -r key; do [[ -n "$key" ]] && echo "  add     ${key}"; done < "${WORK_DIR}/added.txt"
  while IFS= read -r key; do [[ -n "$key" ]] && echo "  change  ${key}"; done < "${WORK_DIR}/modified.txt"
  for key in ${pending_deletes+"${pending_deletes[@]}"}; do echo "  delete  ${key}"; done
  echo "Each write is refused by S3 if the key changed since it was pulled. The"
  echo "changed paths are then invalidated at the edge and the edge proof runs."
  if ! confirm_from_tty "Type APPLY to change the ${TARGET_ENV} archive: " "APPLY"; then
    cr_die "Not confirmed; nothing was written, deleted, or invalidated."
  fi

  PUSH_REPORT="${STATE}/push-$(date -u +%Y%m%dT%H%M%SZ).tsv"
  printf '# target=%s\n# bucket=%s\n' "$TARGET_ENV" "$BUCKET" > "$PUSH_REPORT"
  local file ctype out etag version stopped=0
  while IFS=$'\t' read -r action key; do
    [[ -n "$key" ]] || continue
    file="${TREE}/${key}"
    ctype="$(content_type_for "$key")" || { cr_error "${key}: no Content-Type for its extension"; stopped=1; break; }
    local cond=()
    if [[ "$action" == "change" ]]; then cond=(--if-match "${LEDGER_ETAG[$key]}"); else cond=(--if-none-match '*'); fi
    if ! out="$(aws_call s3api put-object --bucket "$BUCKET" --key "$key" --body "$file" \
        --content-type "$ctype" "${cond[@]}" --query '[ETag,VersionId]' --output text \
        "${AWS_ARGS[@]}" 2> "${WORK_DIR}/put.err")"; then
      if [[ "$action" == "change" ]]; then
        cr_error "${key}: not written; S3 refused it, which on a 412 means the key changed since the pull: $(aws_said "${WORK_DIR}/put.err")"
      else
        cr_error "${key}: not written; S3 refused it, which on a 412 means the key now exists: $(aws_said "${WORK_DIR}/put.err")"
      fi
      stopped=1
      break
    fi
    IFS=$'\t' read -r etag version <<< "$out"
    if [[ "$action" == "change" ]]; then
      record_push change "$key" "${LEDGER_VERSION[$key]}" "${LEDGER_ETAG[$key]}" "$version" "$etag"
    else
      record_push add "$key" "-" "-" "$version" "$etag"
    fi
    update_ledger_row "$key" "$etag" "$version" "$file"
    INVALIDATE+=("$key")
    echo "  ${action} ${key}: ${version}"
  done < <(sed 's/^/add\t/' "${WORK_DIR}/added.txt"; sed 's/^/change\t/' "${WORK_DIR}/modified.txt")

  if [[ "$stopped" -eq 0 ]]; then
    for key in ${pending_deletes+"${pending_deletes[@]}"}; do
      if ! out="$(aws_call s3api delete-object --bucket "$BUCKET" --key "$key" \
          --if-match "${LEDGER_ETAG[$key]}" --query 'VersionId' --output text \
          "${AWS_ARGS[@]}" 2> "${WORK_DIR}/del.err")"; then
        cr_error "${key}: not deleted; S3 refused it, which on a 412 means the key changed since the pull: $(aws_said "${WORK_DIR}/del.err")"
        stopped=1
        break
      fi
      record_push delete "$key" "${LEDGER_VERSION[$key]}" "${LEDGER_ETAG[$key]}" "$out" "-"
      drop_ledger_row "$key" "$out"
      INVALIDATE+=("$key")
      echo "  delete ${key}: delete marker ${out}"
    done
  fi
  [[ "$stopped" -eq 0 ]] || echo "Stopped at the first refused key; the keys above it are written and listed in the report." >&2

  echo ""
  echo "Push report (action, key, version before, ETag before, version after, ETag after):"
  grep -v '^#' "$PUSH_REPORT" | sed 's/^/  /' || [[ $? == 1 ]]
  echo "Written to ${PUSH_REPORT}; roll back with:"
  printf '  scripts/archive-edit.sh rollback --target %s --report %q\n' "$TARGET_ENV" "$PUSH_REPORT"
  invalidate_and_verify push
  [[ "$stopped" -eq 0 ]] && cr_proved "every change was written conditionally and its new version recorded"
  cr_finish
}

# ---- rollback ------------------------------------------------------------------

# The version and ETag a key currently has, or 'absent' when S3 answers 404
# (no object, or a delete marker on top). Any other failure is an error.
current_of() {
  local key="$1" out
  if out="$(aws_call s3api head-object --bucket "$BUCKET" --key "$key" \
      --query '[VersionId,ETag]' --output text "${AWS_ARGS[@]}" 2> "${WORK_DIR}/head.err")"; then
    printf '%s\n' "$out"
    return 0
  fi
  if grep -qE '\((404|NoSuchKey)\)|Not Found' "${WORK_DIR}/head.err"; then
    echo "absent"
    return 0
  fi
  echo "could not read ${key}: $(aws_said "${WORK_DIR}/head.err")" >&2
  return 1
}

mode_rollback() {
  [[ -f "$REPORT" ]] || cr_die "the report is not a file: ${REPORT}"
  local rep_target rep_bucket
  rep_target="$(sed -n 's/^# target=//p' "$REPORT")"
  rep_bucket="$(sed -n 's/^# bucket=//p' "$REPORT")"
  [[ "$rep_target" == "$TARGET_ENV" ]] || cr_die "REFUSING: the report is of a push to '${rep_target}', not ${TARGET_ENV}"
  settle_identity
  read_bucket
  [[ "$BUCKET" == "$rep_bucket" ]] || cr_die "REFUSING: the report names s3://${rep_bucket}, but ${TARGET_ENV}'s archive bucket is s3://${BUCKET}"
  require_bucket_source

  local record="${REPORT%.tsv}.rollback.tsv"
  declare -A rolled=()
  local k v
  if [[ -f "$record" ]]; then
    while IFS=$'\t' read -r k v; do [[ -n "$k" ]] && rolled["$k"]="$v"; done < "$record"
  fi

  # Decide every key before changing any, so the operator confirms one plan.
  : > "${WORK_DIR}/plan.tsv"
  local action key old_v old_e new_v new_e now cur_v cur_e
  while IFS=$'\t' read -r action key old_v old_e new_v new_e; do
    [[ -n "$key" && "$action" != \#* ]] || continue
    now="$(current_of "$key")" || { cr_error "$(aws_said "${WORK_DIR}/head.err")"; continue; }
    IFS=$'\t' read -r cur_v cur_e <<< "$now"
    if [[ -n "${rolled[$key]+x}" ]] && { [[ "$cur_v" == "${rolled[$key]}" ]] || [[ "${rolled[$key]}" == "absent" && "$now" == "absent" ]]; }; then
      echo "  ${key}: already rolled back by an earlier run (read back: ${now%%$'\t'*})"
      continue
    fi
    case "$action" in
      change|add)
        if [[ "$cur_v" != "$new_v" ]]; then
          cr_error "${key}: not rolled back; its current version is ${cur_v}, not ${new_v}, which this push wrote, so something changed it since"
          continue
        fi ;;
      delete)
        if [[ "$now" != "absent" ]]; then
          cr_error "${key}: not restored; the push deleted it but it exists again (version ${cur_v})"
          continue
        fi ;;
      *) cr_error "the report holds an unknown action '${action}' for ${key}"; continue ;;
    esac
    printf '%s\t%s\t%s\t%s\n' "$action" "$key" "$old_v" "$new_e" >> "${WORK_DIR}/plan.tsv"
  done < "$REPORT"
  [[ "${#CR_ERRORS[@]}" -eq 0 ]] || cr_die "REFUSING: some keys changed since the push; nothing was rolled back"
  if [[ ! -s "${WORK_DIR}/plan.tsv" ]]; then
    echo "Nothing to roll back."
    cr_proved "every key in the report already reads back as rolled back"
    cr_finish
  fi

  echo ""
  echo "About to roll back s3://${BUCKET} (${TARGET_ENV}):"
  while IFS=$'\t' read -r action key old_v new_e; do
    case "$action" in
      change) echo "  restore ${key} to version ${old_v}" ;;
      add) echo "  remove  ${key} (a delete marker; the pushed version stays recoverable)" ;;
      delete) echo "  restore ${key} to version ${old_v}, which the push deleted" ;;
    esac
  done < "${WORK_DIR}/plan.tsv"
  if ! confirm_from_tty "Type APPLY to roll back the ${TARGET_ENV} archive: " "APPLY"; then
    cr_die "Not confirmed; nothing was rolled back or invalidated."
  fi

  local src out stopped=0
  while IFS=$'\t' read -r action key old_v new_e; do
    src="$(url_path "$key")"
    src="${BUCKET}${src}?versionId=${old_v}"
    case "$action" in
      change)
        out="$(aws_call s3api copy-object --bucket "$BUCKET" --key "$key" --copy-source "$src" \
          --if-match "$new_e" --query 'VersionId' --output text "${AWS_ARGS[@]}" 2> "${WORK_DIR}/rb.err")" || stopped=1 ;;
      delete)
        out="$(aws_call s3api copy-object --bucket "$BUCKET" --key "$key" --copy-source "$src" \
          --if-none-match '*' --query 'VersionId' --output text "${AWS_ARGS[@]}" 2> "${WORK_DIR}/rb.err")" || stopped=1 ;;
      add)
        out="$(aws_call s3api delete-object --bucket "$BUCKET" --key "$key" \
          --if-match "$new_e" --query 'VersionId' --output text "${AWS_ARGS[@]}" 2> "${WORK_DIR}/rb.err")" || stopped=1
        [[ "$stopped" -eq 1 ]] || out="absent" ;;
    esac
    if [[ "$stopped" -eq 1 ]]; then
      cr_error "${key}: not rolled back; S3 refused it, which on a 412 means it changed in the moment since it was read: $(aws_said "${WORK_DIR}/rb.err")"
      break
    fi
    printf '%s\t%s\n' "$key" "$out" >> "$record"
    INVALIDATE+=("$key")
    echo "  ${action} ${key}: rolled back (now ${out})"
  done < "${WORK_DIR}/plan.tsv"
  echo "Rollback record: ${record}"
  invalidate_and_verify rollback
  [[ "$stopped" -eq 0 ]] && cr_proved "every planned key was rolled back conditionally on the version the push wrote"
  cr_unproved "the pulled directory's ledger, which now describes the pushed versions; pull again before a further edit"
  cr_finish
}

case "$MODE" in
  pull) mode_pull ;;
  preview) mode_preview ;;
  check) mode_check ;;
  push) mode_push ;;
  rollback) mode_rollback ;;
esac
