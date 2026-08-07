#!/usr/bin/env bash
# publish-archive.sh
#
# The single repeatable way the legacy footbag.org mirror becomes the served
# members-only archive: verify the mirror tree, then sync the CONTENTS of its
# www.footbag.org/ subtree to the archive S3 bucket root and invalidate the
# archive CloudFront distribution. Naming the environment IS the deploy: the
# command publishes. Pass --dry-run to rehearse instead, which prints exactly
# what would change and touches nothing.
#
# DESTRUCTIVE: the sync uses --delete, so bucket keys absent from the mirror
# tree are removed (the reserved _gate/ prefix, which holds the two
# Terraform-owned gate pages, is excluded from both upload and deletion). A
# second pass then removes what the sync structurally cannot: an excluded
# pattern hides a key from the bucket listing as well as from the upload, so
# --delete never sees it, and a pattern added today would otherwise leave
# yesterday's copy served forever. Every gate below still has to pass, so a
# publish that would ship unscanned or unrecognized bytes refuses before it
# uploads anything.
#
# What it enforces, in order:
#   1. The source is a complete mirror root: the www.footbag.org/ subtree plus
#      the four crawl manifests. The manifests themselves NEVER reach the
#      bucket (sitemap.txt leaks the crawling workstation's filesystem paths);
#      syncing from the www subtree is what keeps them out.
#   2. Sanitization gate: every media file (.mp4/.jpg/.gif) must carry its
#      zero-byte .sanitized sidecar, the crawler's marker that the bytes were
#      re-encoded. Bare media files are unscanned bytes and the publish
#      refuses, naming them. Any other media extension on disk is an
#      unconverted crawler leftover and always fatal.
#      The sidecars themselves are crawl bookkeeping and are never uploaded.
#   3. Independent verification of the finished tree, by the mirror's own
#      verifier (legacy_data/legacy_mirror/verify_mirror.sh). The gates above
#      are this script's reading of the capture; that one is the capture's
#      reading of itself, taking its rules from the crawler rather than
#      restating them, and testing the archive's promises against the bytes
#      that will ship instead of against the log of how they were made: no
#      excluded surface survived into the tree, no credential field, no
#      personal detail of the crawling account's owner, no page the site
#      served as its own error, no crawl manifest inside the published
#      subtree. A check it SKIPS is not a check it passed, so a skipped
#      exclusion or personal-detail check refuses the publish; both depend on
#      an input the operator supplies, and a missing one verifies less than it
#      appears to while still reading green. It parses every page, so on a
#      full capture it costs minutes.
#   4. After an applied sync: the landing page (/index.html, the only archive
#      URL the platform ever emits) resolves to a real key; both gate pages
#      survived; no .sanitized or crawl-manifest key exists in the bucket.
#   5. One CloudFront invalidation of /*. Not optional: the edge TTL is a
#      year, so a re-sync without an invalidation serves the old capture
#      indefinitely.
#   6. Edge verification, always: fetch the landing page through the
#      distribution with a hand-signed CloudFront cookie (custom policy,
#      wildcard resource) and expect 200, plus a random missing key
#      expecting 404. A sync and an invalidation both reporting success do
#      not establish that a member can read the archive; only this does. The
#      cookie header travels via a 0600 temp file, never argv.
#
# Identifiers come from terraform output in the target environment's tree;
# nothing is hardcoded. Credentials are OPERATOR credentials (the runtime
# roles are read-only on SSM and have no archive-bucket write access).
#
# Usage:
#   scripts/publish-archive.sh --env staging              # publish, then verify the edge
#   scripts/publish-archive.sh --env staging --dry-run    # rehearse, change nothing
#
# Flags:
#   --env staging|production   Target environment (required).
#   --dry-run                  Print what a publish would change and exit 0.
#
# Escape hatches, each correct by default and rarely passed:
#   --profile <p>              AWS profile; else ambient AWS_PROFILE.
#   --mirror-root <path>       Override the mirror root location.
#   --signing-key <pem>        Private key for the edge check
#                              (default: ~/AWS/archive-signing-key.pem).
#
# There is no flag to wave through unscanned or unrecognized bytes. A file the
# gates refuse is either something the archive should serve, in which case the
# capture is what needs fixing, or something it should not, in which case it
# belongs in archive-publish-exclusions.txt where the decision is recorded once
# and holds for every future publish. A per-run count override recorded nothing
# and silently absorbed a new file whenever an old one disappeared.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_ENV=""
DRY_RUN=0
AWS_PROFILE_ARG=""
MIRROR_ROOT="${REPO_ROOT}/legacy_data/legacy_mirror/mirror_footbag_org"
EXCLUSION_LIST="${SCRIPT_DIR}/archive-publish-exclusions.txt"
SIGNING_KEY="${HOME}/AWS/archive-signing-key.pem"

usage() {
  sed -n '2,82p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      TARGET_ENV="${2:-}"
      shift 2 || { echo "ERROR: --env requires an argument" >&2; exit 2; }
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --mirror-root)
      MIRROR_ROOT="${2:-}"
      shift 2 || { echo "ERROR: --mirror-root requires an argument" >&2; exit 2; }
      ;;
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

# ---- 1b. Exclusion list ------------------------------------------------------
#
# The maintained list of paths the archive keeps locally but never serves. It is
# applied in two places that must agree: as sync exclusions, so the files are not
# uploaded, and against the unscanned-types refusal, so an excluded file is not
# something an operator is asked to accept. Applying it to only one of the two
# either publishes what the list forbids or demands an override for files that
# were never going to be uploaded.
EXCLUDE_PATTERNS=()
if [[ -f "$EXCLUSION_LIST" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -n "$line" ]] && EXCLUDE_PATTERNS+=("$line")
  done < "$EXCLUSION_LIST"
fi

path_is_excluded() {
  local candidate="$1" pattern
  for pattern in ${EXCLUDE_PATTERNS+"${EXCLUDE_PATTERNS[@]}"}; do
    # shellcheck disable=SC2053  # glob match is the point
    [[ "$candidate" == $pattern || "${candidate##*/}" == $pattern ]] && return 0
  done
  return 1
}

if [[ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]]; then
  echo "Exclusion list: ${#EXCLUDE_PATTERNS[@]} pattern(s) from ${EXCLUSION_LIST##*/}"
else
  echo "Exclusion list: none (${EXCLUSION_LIST##*/} absent or empty)"
fi

# ---- 2. Terraform-owned identifiers -----------------------------------------

TF_DIR="${REPO_ROOT}/terraform/${TARGET_ENV}"
tf_out() {
  terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true
}
BUCKET="$(tf_out archive_bucket_name)"
DIST_ID="$(tf_out archive_distribution_id)"
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

if [[ "$UNSANITIZED_COUNT" -gt 0 ]]; then
  echo "REFUSING: ${UNSANITIZED_COUNT} media files lack their .sanitized sidecar" >&2
  echo "(unscanned bytes: the crawler never re-encoded them). Either re-run the" >&2
  echo "crawler so it does, or, if the archive should not serve them, add them to" >&2
  echo "${EXCLUSION_LIST##*/} and publish again:" >&2
  cat "$UNSANITIZED_LIST" >&2
  exit 1
fi

# ---- 3a. Unrecognized file types ---------------------------------------------
#
# The two checks above know only about media. A file type in neither list is
# invisible to both, and to the crawler's re-encode as well: it is downloaded
# whole, never scanned, never marked, and published without anything having
# looked inside it. That is how a macro-enabled spreadsheet template and a
# 100 MB multi-part archive came to sit in a capture. The re-encode invariant
# exists for exactly those file classes, so anything outside the set below is
# named and refused rather than shipped quietly.
#
# The set is what the archive is made of: pages, the two image formats and the
# one video format the crawler converts to, stylesheets and their fonts,
# published documents, calendar exports and favicons.
KNOWN_LIST="${WORK_DIR}/unknown_types.txt"
find "$WWW_ROOT" -type f \
  ! -iname '*.html' ! -iname '*.htm' ! -iname '*.jpg' ! -iname '*.gif' \
  ! -iname '*.mp4' ! -iname '*.css' ! -iname '*.pdf' ! -iname '*.ics' \
  ! -iname '*.ttf' ! -iname '*.eot' ! -iname '*.woff' ! -iname '*.woff2' \
  ! -iname '*.ico' ! -iname '*.sanitized' \
  > "${KNOWN_LIST}.all" || true
# A path the exclusion list keeps out of the bucket is not a file anyone has to
# accept: it is not being published. Dropping them here is what stops the
# refusal from demanding an override for files the sync will never upload.
: > "$KNOWN_LIST"
excluded_unknown=0
while IFS= read -r candidate; do
  rel_candidate="${candidate#"${WWW_ROOT}/"}"
  if path_is_excluded "$rel_candidate"; then
    excluded_unknown=$((excluded_unknown + 1))
  else
    printf '%s\n' "$candidate" >> "$KNOWN_LIST"
  fi
done < "${KNOWN_LIST}.all"
if [[ "$excluded_unknown" -gt 0 ]]; then
  echo "Exclusion list: ${excluded_unknown} unscanned file(s) are not published (${EXCLUSION_LIST##*/})."
fi
UNKNOWN_COUNT="$(wc -l < "$KNOWN_LIST")"
if [[ "$UNKNOWN_COUNT" -gt 0 ]]; then
  echo "REFUSING: ${UNKNOWN_COUNT} files of types nothing has scanned." >&2
  echo "Neither the crawler's re-encode nor the checks above look at these." >&2
  echo "Read the list. A file the archive should serve means the capture needs" >&2
  echo "fixing; a file it should not means adding it to ${EXCLUSION_LIST##*/}," >&2
  echo "which records the decision once instead of per publish:" >&2
  cat "$KNOWN_LIST" >&2
  exit 1
fi

# ---- 3b. Static-archive sanitization gate ------------------------------------
#
# The crawler sanitizes every page it writes, but a tree can predate that work
# or come from an interrupted run, and none of these defects are visible in a
# sync listing. Each check names a specific, remembered failure:
#
#   Admin-only marker: the legacy templates tag fields shown only to an
#   administrator. A crawl run under an elevated account captures members' home
#   phone numbers and street addresses; publishing that exposes them to every
#   member who can read the archive.
#   Script tag: a frozen archive runs nothing, and the go-live readiness
#   statement says the capture carries no JavaScript. Third-party script
#   references are also insecure content and outbound callouts.
#   Missing character set: served without one, browsers fall back to a legacy
#   encoding and every accented name in the archive turns to mojibake.
#   Absolute legacy-host URL in a stylesheet: resolves only while the old host
#   still answers, is refused as insecure content over TLS, and breaks for good
#   at shutdown.

sanitation_fail=0
# Every sanitation gate below judges only what the publish would actually
# upload. A file the exclusion list keeps out of the bucket cannot leak or break
# anything for a reader, so holding the publish over it refuses a release for a
# file that is not in it. The count of what was skipped is printed rather than
# quietly dropped, so an exclusion list that has grown broad enough to be hiding
# real problems is visible.
report_offenders() {
  local label="$1" listing="$2"
  local published="${listing}.published"
  local count skipped=0 offender rel_offender
  : > "$published"
  if [[ -f "$listing" ]]; then
    while IFS= read -r offender; do
      [[ -n "$offender" ]] || continue
      rel_offender="${offender#"${WWW_ROOT}/"}"
      if path_is_excluded "$rel_offender"; then
        skipped=$((skipped + 1))
      else
        printf '%s\n' "$offender" >> "$published"
      fi
    done < "$listing"
  fi
  if [[ "$skipped" -gt 0 ]]; then
    echo "  (${skipped} file(s) ${label}, not published, so not counted)"
  fi
  count="$(grep -c '' "$published" || true)"
  if [[ "$count" -gt 0 ]]; then
    echo "REFUSING: ${count} file(s) ${label}." >&2
    head -10 "$published" >&2
    [[ "$count" -gt 10 ]] && echo "  ... and $((count - 10)) more" >&2
    sanitation_fail=1
  fi
}

ADMIN_MARKED="${WORK_DIR}/admin_marked.txt"
grep -rl --include='*.html' 'class="admin"' "$WWW_ROOT" > "$ADMIN_MARKED" 2>/dev/null || true
report_offenders "still carry admin-only contact fields" "$ADMIN_MARKED"

SCRIPTED="${WORK_DIR}/scripted.txt"
grep -rliE '<script[ >]' --include='*.html' "$WWW_ROOT" > "$SCRIPTED" 2>/dev/null || true
report_offenders "still carry a script tag" "$SCRIPTED"

# The charset check applies to HTML. Some captured files are XML stored under a
# .html name: the microsites' RSS feeds and WordPress JSON endpoints, which the
# crawler saves at the path their URL gives it. They carry an XML declaration
# instead of an HTML one and always will, so holding them to the HTML rule would
# refuse every publish for good, and the advice below would send an operator to
# re-run a crawler that cannot change them. They are identified by their own
# first line rather than by path, so a real page can never be waved through.
XML_UNDER_HTML="${WORK_DIR}/xml_under_html.txt"
grep -rn --include='*.html' -m1 -E '^<\?xml' "$WWW_ROOT" 2>/dev/null \
  | grep -F ':1:<?xml' | sed 's/:1:<?xml.*$//' | sort -u > "$XML_UNDER_HTML" || true

NO_CHARSET="${WORK_DIR}/no_charset.txt"
NO_CHARSET_ALL="${WORK_DIR}/no_charset_all.txt"
grep -rLi 'charset' --include='*.html' "$WWW_ROOT" > "$NO_CHARSET_ALL" 2>/dev/null || true
if [[ -s "$XML_UNDER_HTML" ]]; then
  grep -xvFf "$XML_UNDER_HTML" "$NO_CHARSET_ALL" > "$NO_CHARSET" || true
  echo "Charset check: $(grep -c '' "$XML_UNDER_HTML") XML file(s) stored under an .html name exempted."
else
  cp "$NO_CHARSET_ALL" "$NO_CHARSET"
fi
report_offenders "declare no character set" "$NO_CHARSET"

STALE_CSS="${WORK_DIR}/stale_css.txt"
grep -rl --include='*.css' 'http://www.footbag.org/' "$WWW_ROOT" > "$STALE_CSS" 2>/dev/null || true
report_offenders "are stylesheets addressing the legacy host" "$STALE_CSS"

if [[ "$sanitation_fail" -ne 0 ]]; then
  echo "" >&2
  echo "Re-run the crawler over this tree so its sanitization passes apply, then" >&2
  echo "publish again. These are not overridable: each one leaks or breaks." >&2
  exit 1
fi
echo "Sanitization gate: no admin-only fields, scripts, missing charsets, or legacy-host stylesheet URLs."

# ---- 3c. Independent verification of the finished tree -----------------------
#
# Everything above is this script's own reading of the capture, and it can only
# refuse what it was written to look for. The mirror's verifier reads the same
# tree against the rules the crawler itself holds, so a rule that changes there
# cannot leave a stale copy passing here. It runs last among the source gates
# because it parses every page: the cheap refusals get to fail first.
#
# A skipped check is not a passed check. The excluded-surface and personal-detail
# checks each depend on an input the operator supplies, and when one is missing
# the verifier reports the skip and carries on to a green summary, which is
# precisely the shape of a verification that looks complete while checking less
# than it claims. Those two stand between a reader and material no reader may
# see, so a skip in either refuses the publish. Other checks may legitimately
# skip on a capture that predates what they read, and those are left to the
# operator's eye rather than held against the publish.
TREE_VERIFIER="${REPO_ROOT}/legacy_data/legacy_mirror/verify_mirror.sh"
if [[ ! -f "$TREE_VERIFIER" ]]; then
  echo "ERROR: the mirror verifier is missing: ${TREE_VERIFIER}" >&2
  echo "A publish is not allowed to skip verification of the tree it ships." >&2
  exit 1
fi
VERIFY_OUT="${WORK_DIR}/verify_tree.txt"
echo "Verifying the capture with ${TREE_VERIFIER##*/}; this reads every page ..."
if ! bash "$TREE_VERIFIER" --mirror "$MIRROR_ROOT" | tee "$VERIFY_OUT"; then
  echo "" >&2
  echo "REFUSING: the capture did not pass verification. Nothing was uploaded." >&2
  echo "Fix the capture (re-run the crawler over it) and publish again." >&2
  exit 1
fi
SKIPPED_GUARDS="$(grep -E '^[[:space:]]*SKIP[[:space:]]+(no excluded surface survived|no personal detail of the account owner)' "$VERIFY_OUT" || true)"
if [[ -n "$SKIPPED_GUARDS" ]]; then
  echo "" >&2
  echo "REFUSING: verification skipped a check that guards what a reader must" >&2
  echo "never see. Supply what it names below and publish again; a check that" >&2
  echo "did not run is not a check that passed:" >&2
  printf '%s\n' "$SKIPPED_GUARDS" >&2
  exit 1
fi
echo "Capture verification: passed, with both privacy checks run rather than skipped."

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
)
# The maintained list, applied to the upload so an excluded file is never sent.
# It cannot also drive removal: aws s3 sync applies --exclude to the bucket
# listing as well as to the source, so a key one of these patterns matches is
# invisible to --delete, and the same line that keeps a file out of the bucket
# pins whatever an earlier publish already put there. Clearing those is the
# reconciliation pass below.
for pattern in ${EXCLUDE_PATTERNS+"${EXCLUDE_PATTERNS[@]}"}; do
  SYNC_ARGS+=(--exclude "$pattern")
done
SYNC_ARGS+=(
  --delete
  --no-progress
)
# The set of keys this publish means the bucket to hold: every source file that
# is not a sidecar and not excluded. Deletion is decided against this rather
# than delegated to the sync, because the sync cannot see an excluded key.
INTENDED_KEYS="${WORK_DIR}/intended_keys.txt"
: > "$INTENDED_KEYS"
find "$WWW_ROOT" -type f ! -name '*.sanitized' > "${WORK_DIR}/source_files.txt"
while IFS= read -r src_file; do
  rel_key="${src_file#"${WWW_ROOT}/"}"
  if ! path_is_excluded "$rel_key"; then
    printf '%s\n' "$rel_key" >> "$INTENDED_KEYS"
  fi
done < "${WORK_DIR}/source_files.txt"
LC_ALL=C sort -o "$INTENDED_KEYS" "$INTENDED_KEYS"

# Keys present in the bucket that the intended set does not name. _gate/ holds
# the two Terraform-owned pages and is never a candidate: the publisher does not
# put them there and must not take them away.
stale_keys_from() {
  local listing="$1" out="$2"
  sed -E 's/^[0-9-]+ [0-9:]+ +[0-9]+ //' "$listing" \
    | grep -v '^_gate/' \
    | LC_ALL=C sort > "${WORK_DIR}/bucket_keys.txt"
  comm -23 "${WORK_DIR}/bucket_keys.txt" "$INTENDED_KEYS" > "$out"
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN (--dry-run): listing what a publish would change."
  aws "${SYNC_ARGS[@]}" --dryrun "${AWS_ARGS[@]}" | tee "${WORK_DIR}/dryrun.txt" | tail -20
  echo "Dry-run change count: $(wc -l < "${WORK_DIR}/dryrun.txt")"
  stale_keys_from "$BUCKET_LISTING" "${WORK_DIR}/stale_dry.txt"
  STALE_DRY="$(wc -l < "${WORK_DIR}/stale_dry.txt")"
  if [[ "$STALE_DRY" -gt 0 ]]; then
    echo "Reconciliation: ${STALE_DRY} key(s) in the bucket that this publish does not"
    echo "intend and the sync cannot reach; a real run removes them:"
    head -20 "${WORK_DIR}/stale_dry.txt"
    if [[ "$STALE_DRY" -gt 20 ]]; then
      echo "  ... and $((STALE_DRY - 20)) more"
    fi
  else
    echo "Reconciliation: nothing stale; the bucket holds only intended keys."
  fi
  echo "DRY RUN complete; nothing was uploaded, deleted, or invalidated."
  exit 0
fi

echo "Applying sync to s3://${BUCKET} ..."
SYNC_START="$(date +%s)"
aws "${SYNC_ARGS[@]}" "${AWS_ARGS[@]}" > "${WORK_DIR}/sync.txt"
SYNC_SECONDS="$(( $(date +%s) - SYNC_START ))"
echo "Sync complete in ${SYNC_SECONDS}s: $(wc -l < "${WORK_DIR}/sync.txt") operations"

# ---- 5a. Reconcile what the sync could not reach ------------------------------
#
# Runs against a listing taken after the sync, so it sees the bucket the sync
# actually left and never re-deletes what the sync already removed. A key here
# is one an exclusion pattern now matches that an earlier publish had uploaded:
# adding a pattern is what makes it stale, and this is what makes adding one
# take effect on the bucket rather than only on the next upload.
RECONCILE_LISTING="${WORK_DIR}/bucket_reconcile.txt"
aws s3 ls "s3://${BUCKET}" --recursive "${AWS_ARGS[@]}" > "$RECONCILE_LISTING"
STALE_KEYS="${WORK_DIR}/stale_keys.txt"
stale_keys_from "$RECONCILE_LISTING" "$STALE_KEYS"
STALE_COUNT="$(wc -l < "$STALE_KEYS")"
if [[ "$STALE_COUNT" -gt 0 ]]; then
  echo "Reconciliation: removing ${STALE_COUNT} key(s) the sync cannot reach."
  while IFS= read -r stale_key; do
    [[ -z "$stale_key" ]] && continue
    echo "  removing: ${stale_key}"
    aws s3 rm "s3://${BUCKET}/${stale_key}" "${AWS_ARGS[@]}" >/dev/null
  done < "$STALE_KEYS"
else
  echo "Reconciliation: nothing stale; the bucket holds only intended keys."
fi

# ---- 6. Post-sync verification -----------------------------------------------

fail=0
for key in index.html _gate/denied.html _gate/not-found.html; do
  if ! aws s3api head-object --bucket "$BUCKET" --key "$key" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    echo "ERROR: expected key missing after sync: ${key}" >&2
    fail=1
  fi
done
# The reconciliation listing already describes the post-sync bucket, so a fresh
# one is only needed when that pass actually removed something. Listing walks
# every key, which on a tree this size costs minutes rather than seconds, and
# the steady state removes nothing.
AFTER_LISTING="${WORK_DIR}/bucket_after.txt"
if [[ "$STALE_COUNT" -gt 0 ]]; then
  aws s3 ls "s3://${BUCKET}" --recursive "${AWS_ARGS[@]}" > "$AFTER_LISTING"
else
  cp "$RECONCILE_LISTING" "$AFTER_LISTING"
fi
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

# ---- 8. Edge verification ----------------------------------------------------
#
# Always. A sync and an invalidation that both report success still leave the
# question a publish exists to answer: can a member actually read the archive
# through the distribution. Only a signed fetch answers it, so it is part of
# publishing rather than something to remember to ask for.

# Delegate to the edge-proof script rather than carrying a second copy of the
# cookie-signing logic: one implementation of the signing means a change to
# the policy shape cannot leave the two disagreeing.
EDGE_ARGS=(--env "$TARGET_ENV" --signing-key "$SIGNING_KEY")
[[ -n "$AWS_PROFILE_ARG" ]] && EDGE_ARGS+=(--profile "$AWS_PROFILE_ARG")
if ! bash "${SCRIPT_DIR}/verify-archive-edge.sh" "${EDGE_ARGS[@]}"; then
  echo "ERROR: edge verification failed after publish. If the invalidation just" >&2
  echo "ran, the edge may still be settling; retry before investigating." >&2
  exit 1
fi

echo "PUBLISH: ${TARGET_ENV} archive publish complete (${SRC_COUNT} source files, sync ${SYNC_SECONDS}s, invalidation ${INVALIDATION_ID})"
