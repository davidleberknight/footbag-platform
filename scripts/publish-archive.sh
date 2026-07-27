#!/usr/bin/env bash
# publish-archive.sh
#
# The single repeatable way the legacy footbag.org mirror becomes the served
# members-only archive: verify the mirror tree, then sync the CONTENTS of its
# www.footbag.org/ subtree to the archive S3 bucket root and invalidate the
# archive CloudFront distribution. Dry-run by DEFAULT (unusual for this repo's
# scripts, deliberately: the destructive form is opt-in): without --apply it
# prints exactly what would change and touches nothing.
#
# DESTRUCTIVE with --apply: the sync uses --delete, so bucket keys absent from
# the mirror tree are removed (the reserved _gate/ prefix, which holds the two
# Terraform-owned gate pages, is excluded from both upload and deletion).
#
# What it enforces, in order:
#   1. The source is a complete mirror root: the www.footbag.org/ subtree plus
#      the four crawl manifests. The manifests themselves NEVER reach the
#      bucket (sitemap.txt leaks the crawling workstation's filesystem paths);
#      syncing from the www subtree is what keeps them out.
#   2. Sanitization gate: every media file (.mp4/.jpg/.gif) must carry its
#      zero-byte .sanitized sidecar, the crawler's marker that the bytes were
#      re-encoded. Bare media files are unscanned bytes; the publish refuses
#      unless --allow-unsanitized matches their exact count. Any other media
#      extension on disk is an unconverted crawler leftover and always fatal.
#      The sidecars themselves are crawl bookkeeping and are never uploaded.
#   3. After an applied sync: the landing page (/index.html, the only archive
#      URL the platform ever emits) resolves to a real key; both gate pages
#      survived; no .sanitized or crawl-manifest key exists in the bucket.
#   4. One CloudFront invalidation of /*. Not optional: the edge TTL is a
#      year, so a re-sync without an invalidation serves the old capture
#      indefinitely.
#   5. Optional --verify-edge: fetch the landing page through the
#      distribution with a hand-signed CloudFront cookie (custom policy,
#      wildcard resource) and expect 200, plus a random missing key
#      expecting 404. The cookie header travels via a 0600 temp file, never
#      argv.
#
# Identifiers come from terraform output in the target environment's tree;
# nothing is hardcoded. Credentials are OPERATOR credentials (the runtime
# roles are read-only on SSM and have no archive-bucket write access).
#
# Usage:
#   scripts/publish-archive.sh --env staging [--profile <p>]                  # dry run
#   scripts/publish-archive.sh --env staging --apply --allow-unsanitized <n> \
#       [--verify-edge [--signing-key <pem>]] [--profile <p>]
#
# Flags:
#   --env staging|production   Target environment (required).
#   --apply                    Execute. Without it: full dry run, exit 0.
#   --profile <p>              AWS profile; else ambient AWS_PROFILE.
#   --mirror-root <path>       Override the mirror root location.
#   --allow-unsanitized <n>    Proceed only if exactly n media files lack
#                              their sidecar (the refusal lists them).
#   --verify-edge              Post-publish signed-cookie fetch through the
#                              distribution.
#   --signing-key <pem>        Private key for --verify-edge
#                              (default: ~/AWS/archive-signing-key.pem).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_ENV=""
APPLY=0
AWS_PROFILE_ARG=""
MIRROR_ROOT="${REPO_ROOT}/legacy_data/legacy_mirror/mirror_footbag_org"
ALLOW_UNSANITIZED=""
VERIFY_EDGE=0
SIGNING_KEY="${HOME}/AWS/archive-signing-key.pem"

usage() {
  sed -n '2,60p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      TARGET_ENV="${2:-}"
      shift 2 || { echo "ERROR: --env requires an argument" >&2; exit 2; }
      ;;
    --apply) APPLY=1; shift ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --mirror-root)
      MIRROR_ROOT="${2:-}"
      shift 2 || { echo "ERROR: --mirror-root requires an argument" >&2; exit 2; }
      ;;
    --allow-unsanitized)
      ALLOW_UNSANITIZED="${2:-}"
      shift 2 || { echo "ERROR: --allow-unsanitized requires an argument" >&2; exit 2; }
      ;;
    --verify-edge) VERIFY_EDGE=1; shift ;;
    --signing-key)
      SIGNING_KEY="${2:-}"
      shift 2 || { echo "ERROR: --signing-key requires an argument" >&2; exit 2; }
      ;;
    -h|--help) usage ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
  echo "ERROR: --env must be 'staging' or 'production'" >&2
  exit 2
fi

AWS_ARGS=()
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
elif [[ -n "${AWS_PROFILE:-}" ]]; then
  echo "Using ambient AWS_PROFILE=${AWS_PROFILE}"
else
  echo "ERROR: pass --profile or export AWS_PROFILE (operator credentials)" >&2
  exit 2
fi

WORK_DIR="$(mktemp -d /tmp/footbag-publish-archive.XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

# ---- 1. Source preconditions -------------------------------------------------

WWW_ROOT="${MIRROR_ROOT}/www.footbag.org"
if [[ ! -d "$WWW_ROOT" ]]; then
  echo "ERROR: ${WWW_ROOT} is missing. The mirror root must be the crawler's" >&2
  echo "output directory (repo symlink footbag_legacy_mirror points at it)." >&2
  exit 1
fi
for manifest in sitemap.txt redirect_map.json skipped_videos.json skipped_videos_summary.txt; do
  if [[ ! -f "${MIRROR_ROOT}/${manifest}" ]]; then
    echo "ERROR: crawl manifest missing: ${MIRROR_ROOT}/${manifest}." >&2
    echo "An incomplete mirror root must not be published; re-run the crawler" >&2
    echo "or point --mirror-root at a complete capture." >&2
    exit 1
  fi
done

# ---- 2. Terraform-owned identifiers -----------------------------------------

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV}"
tf_out() {
  terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true
}
BUCKET="$(tf_out archive_bucket_name)"
DIST_ID="$(tf_out archive_distribution_id)"
ARCHIVE_DOMAIN="$(tf_out archive_domain)"
KEY_PAIR_ID="$(tf_out archive_key_pair_id)"
if [[ -z "$BUCKET" || -z "$DIST_ID" ]]; then
  echo "ERROR: archive terraform outputs are empty in ${TF_DIR}." >&2
  echo "The archive stack must be applied (enable_archive = true) and" >&2
  echo "'terraform -chdir=${TF_DIR} output archive_bucket_name' non-empty." >&2
  exit 1
fi

# ---- 3. Sanitization gate ----------------------------------------------------

UNSANITIZED_LIST="${WORK_DIR}/unsanitized.txt"
: > "$UNSANITIZED_LIST"
while IFS= read -r -d '' media; do
  [[ -f "${media}.sanitized" ]] || printf '%s\n' "$media" >> "$UNSANITIZED_LIST"
done < <(find "$WWW_ROOT" -type f \( -iname '*.mp4' -o -iname '*.jpg' -o -iname '*.gif' \) -print0)
UNSANITIZED_COUNT="$(wc -l < "$UNSANITIZED_LIST")"

LEFTOVER_LIST="${WORK_DIR}/leftover_media.txt"
find "$WWW_ROOT" -type f \( -iname '*.jpeg' -o -iname '*.png' -o -iname '*.bmp' \
  -o -iname '*.tiff' -o -iname '*.tif' -o -iname '*.webp' -o -iname '*.mov' \
  -o -iname '*.avi' -o -iname '*.mkv' -o -iname '*.webm' -o -iname '*.wmv' \
  -o -iname '*.divx' -o -iname '*.mpg' -o -iname '*.mpeg' -o -iname '*.flv' \
  -o -iname '*.m4v' -o -iname '*.ogv' \) > "$LEFTOVER_LIST" || true
if [[ -s "$LEFTOVER_LIST" ]]; then
  echo "REFUSING: unconverted media extensions on disk (crawler leftovers);" >&2
  echo "a completed crawl holds only .mp4/.jpg/.gif. Re-run the crawler for:" >&2
  cat "$LEFTOVER_LIST" >&2
  exit 1
fi

if [[ "$UNSANITIZED_COUNT" -gt 0 && "$ALLOW_UNSANITIZED" != "$UNSANITIZED_COUNT" ]]; then
  echo "REFUSING: ${UNSANITIZED_COUNT} media files lack their .sanitized sidecar" >&2
  echo "(unscanned bytes). Review the list, then re-run with" >&2
  echo "--allow-unsanitized ${UNSANITIZED_COUNT} to accept exactly these:" >&2
  cat "$UNSANITIZED_LIST" >&2
  exit 1
fi
if [[ "$UNSANITIZED_COUNT" -gt 0 ]]; then
  echo "Proceeding with ${UNSANITIZED_COUNT} operator-accepted unsanitized media files."
fi

# ---- 4. Totals before --------------------------------------------------------

SRC_COUNT="$(find "$WWW_ROOT" -type f ! -name '*.sanitized' | wc -l)"
SRC_BYTES="$(find "$WWW_ROOT" -type f ! -name '*.sanitized' -printf '%s\n' | { total=0; while read -r n; do total=$((total + n)); done; echo "$total"; })"
echo "Source: ${SRC_COUNT} files, ${SRC_BYTES} bytes (sidecars excluded)"

BUCKET_LISTING="${WORK_DIR}/bucket_before.txt"
aws s3 ls "s3://${BUCKET}" --recursive "${AWS_ARGS[@]}" > "$BUCKET_LISTING" || true
echo "Bucket before: $(wc -l < "$BUCKET_LISTING") objects"

# ---- 5. Sync -----------------------------------------------------------------

SYNC_ARGS=(
  s3 sync "${WWW_ROOT}/" "s3://${BUCKET}/"
  --exclude "*.sanitized"
  --exclude "_gate/*"
  --delete
  --no-progress
)
if [[ "$APPLY" -eq 0 ]]; then
  echo "DRY RUN (no --apply): listing what an applied publish would change."
  aws "${SYNC_ARGS[@]}" --dryrun "${AWS_ARGS[@]}" | tee "${WORK_DIR}/dryrun.txt" | tail -20
  echo "Dry-run change count: $(wc -l < "${WORK_DIR}/dryrun.txt")"
  echo "DRY RUN complete; nothing was uploaded, deleted, or invalidated."
  exit 0
fi

echo "Applying sync to s3://${BUCKET} ..."
SYNC_START="$(date +%s)"
aws "${SYNC_ARGS[@]}" "${AWS_ARGS[@]}" > "${WORK_DIR}/sync.txt"
SYNC_SECONDS="$(( $(date +%s) - SYNC_START ))"
echo "Sync complete in ${SYNC_SECONDS}s: $(wc -l < "${WORK_DIR}/sync.txt") operations"

# ---- 6. Post-sync verification -----------------------------------------------

fail=0
for key in index.html _gate/denied.html _gate/not-found.html; do
  if ! aws s3api head-object --bucket "$BUCKET" --key "$key" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    echo "ERROR: expected key missing after sync: ${key}" >&2
    fail=1
  fi
done
AFTER_LISTING="${WORK_DIR}/bucket_after.txt"
aws s3 ls "s3://${BUCKET}" --recursive "${AWS_ARGS[@]}" > "$AFTER_LISTING"
echo "Bucket after: $(wc -l < "$AFTER_LISTING") objects"
if grep -q '\.sanitized$' "$AFTER_LISTING"; then
  echo "ERROR: .sanitized sidecar keys present in the bucket" >&2
  fail=1
fi
for manifest in sitemap.txt redirect_map.json skipped_videos.json skipped_videos_summary.txt; do
  if awk '{print $4}' "$AFTER_LISTING" | grep -qx "$manifest"; then
    echo "ERROR: crawl manifest published to the bucket root: ${manifest}" >&2
    fail=1
  fi
done
if [[ "$fail" -ne 0 ]]; then
  echo "PUBLISH FAILED verification; NOT invalidating. Investigate before re-running." >&2
  exit 1
fi

# ---- 7. Invalidation ---------------------------------------------------------

INVALIDATION_ID="$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths "/*" --query 'Invalidation.Id' --output text "${AWS_ARGS[@]}")"
echo "Invalidation created: ${INVALIDATION_ID} (distribution ${DIST_ID})"

# ---- 8. Optional edge verification -------------------------------------------

if [[ "$VERIFY_EDGE" -eq 1 ]]; then
  if [[ -z "$ARCHIVE_DOMAIN" || -z "$KEY_PAIR_ID" ]]; then
    echo "ERROR: --verify-edge needs archive_domain and archive_key_pair_id outputs" >&2
    exit 1
  fi
  if [[ ! -r "$SIGNING_KEY" ]]; then
    echo "ERROR: signing key not readable: ${SIGNING_KEY}" >&2
    echo "Generate/fetch the archive signing keypair into ~/AWS/ or pass --signing-key." >&2
    exit 1
  fi
  EXPIRES="$(( $(date +%s) + 3600 ))"
  POLICY="$(printf '{"Statement":[{"Resource":"https://%s/*","Condition":{"DateLessThan":{"AWS:EpochTime":%s}}}]}' \
    "$ARCHIVE_DOMAIN" "$EXPIRES")"
  cf_b64() { openssl base64 -A | tr '+=/' '-_~'; }
  POLICY_B64="$(printf '%s' "$POLICY" | cf_b64)"
  SIGNATURE="$(printf '%s' "$POLICY" | openssl dgst -sha1 -sign "$SIGNING_KEY" | cf_b64)"
  # The signed cookie is a bearer credential: it reaches curl through a 0600
  # header file, never argv.
  COOKIE_FILE="${WORK_DIR}/cookie_header.txt"
  touch "$COOKIE_FILE" && chmod 600 "$COOKIE_FILE"
  printf 'Cookie: CloudFront-Policy=%s; CloudFront-Signature=%s; CloudFront-Key-Pair-Id=%s\n' \
    "$POLICY_B64" "$SIGNATURE" "$KEY_PAIR_ID" > "$COOKIE_FILE"

  LANDING_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "@${COOKIE_FILE}" \
    "https://${ARCHIVE_DOMAIN}/index.html")"
  MISSING_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "@${COOKIE_FILE}" \
    "https://${ARCHIVE_DOMAIN}/no-such-key-$$-${RANDOM}")"
  echo "Edge check: landing page ${LANDING_CODE} (want 200), missing key ${MISSING_CODE} (want 404)"
  if [[ "$LANDING_CODE" != "200" || "$MISSING_CODE" != "404" ]]; then
    echo "ERROR: edge verification failed. If the invalidation just ran, the edge" >&2
    echo "may still be settling; retry in a minute before investigating." >&2
    exit 1
  fi
fi

echo "PUBLISH: ${TARGET_ENV} archive publish complete (${SRC_COUNT} source files, sync ${SYNC_SECONDS}s, invalidation ${INVALIDATION_ID})"
