#!/usr/bin/env bash
# restore-bucket.sh -- put lost objects back into a main bucket, from its backup
# copy in the backup region or from the bucket's own earlier versions.
#
# Every main bucket that holds what members cannot re-create is versioned, and
# the photo and archive buckets are replicated to a -dr bucket in us-west-2.
# Neither protection returns anything by itself: an object lost from the main
# bucket stays lost until somebody copies it back, and doing that by hand means
# typing a cross-region copy against production under pressure. This is that
# copy, with its preconditions, its confirmation and its proof.
#
# Two modes.
#
# From the backup copy (the default). Every object the -dr bucket holds now is
# copied into the main bucket where the main bucket lacks it or holds a
# different size, in the standard storage class (the backup copy sits in the
# one-zone class, which the served bucket must not inherit). Nothing is ever
# removed from the main bucket: the copy runs without --delete, so an object
# the backup lacks is left where it is. For the photo bucket the pending/
# upload-staging prefix is left out: its lifecycle rule expires those files,
# S3 does not replicate the expiry, so the backup still holds abandoned uploads
# that must not come back. Copying back what the backup holds now
# cannot revive an item a member erasure removed, because erasure deletes
# replicate to the backup copy as well.
#
# From earlier versions (--from-versions --as-of <time>). Puts each key back as
# it stood at --as-of, inside the main bucket itself, within the window its
# lifecycle rule keeps noncurrent versions for. What a key held at --as-of is
# its newest entry written at or before that time; a key whose current entry is
# that one has not changed and is not touched. Otherwise:
#   - deleted after --as-of, and the version beneath its delete markers is the
#     one it held then: those markers are removed, which makes that version
#     current again. Only markers are deleted, never a real object version.
#   - overwritten after --as-of, or overwritten and then deleted: the version it
#     held then is copied back over the key as a new current version (one
#     copy-object, the version id in the copy source). Removing the markers
#     would bring back the later overwrite instead, so the copy is the one
#     step. The copy is a conditional write: over a current version it
#     carries that version's ETag (--if-match), and over a delete marker it
#     requires that no version is current (--if-none-match '*'); immediately
#     before it the current version id is read back and compared with the plan.
#     A key written by someone else while the run was going is refused and left
#     as they left it, never overwritten. No version is deleted. A current
#     version with the ETag and size of the version held then already holds
#     that content and is not touched, which is what lets a re-run after a
#     stop part way copy only what is left.
#   - absent at --as-of (deleted at or before it) and written after it: left
#     alone and listed. Putting it back would mean deleting the later object,
#     and this mode never deletes an object version or places a delete marker.
#   - nothing at or before --as-of left in the listing: left alone and listed,
#     since the listing cannot tell a key first written after --as-of from one
#     whose earlier version has aged out of the window. One that holds only
#     delete markers is listed as deleted beyond the window's reach.
# This CAN revive an item that a member erasure deleted after --as-of; that is
# accepted as rare, and the dry run lists every key with its action before
# anything changes. A delete marker placed by a lifecycle expiry is revived too,
# and that rule expires the object again at its next run. A copy is a new
# version, so it is allowed under Object Lock and the snapshot tiers' rules; the
# snapshot and log buckets are written once per key, so in practice only
# deletes are found there. One copy carries up to 5 GB; a larger version is
# refused by AWS and reported with its words. The listing follows every page
# AWS returns (the CLI paginates on its own), so the bound is the memory the
# whole version listing needs, which these buckets stay far inside.
#
# Buckets come from the target tree's Terraform outputs, read once:
#   media      media_bucket_name, backup media_dr_bucket_name
#   archive    archive_bucket_name, backup archive_dr_bucket_name
#   snapshots  snapshots_bucket_name (--from-versions only; a database copy is
#              restored from its backup by restore-db.sh)
#   cloudtrail cloudtrail_bucket_name (--from-versions only, production only:
#              the trail is account-wide and its log bucket lives in the
#              production tree, so staging has none; it has no backup copy)
#
# What it refuses:
#   - a target it was not given; there is no default
#   - a bucket outside the list above, --as-of without --from-versions, or
#     --from-versions without --as-of, or a time without a zone or not a time
#   - --yes on production: a production restore asks at the terminal every
#     time, and a run with no terminal is refused rather than waved through
#   - a Terraform state it could not read, and the archive while its stack is
#     off (Terraform keeps no null output in its state, so the name is absent)
#   - a bucket that does not exist, or that AWS would not show; the second is
#     reported with AWS's own words, never read as absent
#   - an empty backup copy, since copying nothing back proves nothing
#   - to change anything without the typed APPLY
#
# The outcome is proven, not assumed: after a copy a second dry run of the
# same copy must find nothing left to copy, and up to five copied keys are read
# back from the main bucket with their size and storage class; after a version
# restore every key whose markers were removed must read back as present, and
# every key copied back must read back with the new version current at the
# size of the version it was copied from. Nothing to copy or
# nothing to restore is a finished run, not an error. A re-run after a stop part
# way picks up whatever is still missing.
#
# Usage:
#   bash scripts/restore-bucket.sh --target <staging|production> \
#     --bucket <media|archive> [--dry-run] [--yes]
#   bash scripts/restore-bucket.sh --target <staging|production> \
#     --bucket <media|archive|snapshots|cloudtrail> --from-versions \
#     --as-of 2026-11-01T12:00:00Z [--dry-run] [--yes]
#   bash scripts/restore-bucket.sh --target <staging|production> \
#     --bucket <media|archive> --drill [--yes]
#
#   --target         the environment. Required, with no default.
#   --bucket         which bucket to restore.
#   --from-versions  undo deletes and overwrites from the bucket's own versions
#                    instead of copying from the backup. Requires --as-of.
#   --as-of          an ISO 8601 time with its zone (Z or +hh:mm); deletes and
#                    overwrites after it are undone.
#   --prefix         scope either mode to the keys under this folder (ending in /).
#   --drill          prove both recoveries of a media or archive bucket on one
#                    throwaway object under drill/: written, removed outright
#                    and copied back from the backup, deleted and restored from
#                    its versions, read back each time, then every version of it
#                    removed from both buckets. It asks APPLY once, and on
#                    production each of its two restores asks again.
#   --dry-run        show what would change and stop.
#   --yes            proceed without the typed prompt; staging only.
#
# Exits 0 when the restore is proven or there was nothing to do, 1 on a failed
# or unconfirmed run, and 2 on a usage error.
#
# Test seams (CI only; operators never set these), announced on stderr when
# set: RESTORE_BUCKET_AWS_BIN and RESTORE_BUCKET_TERRAFORM_BIN replace the two
# tools; for --drill, RESTORE_BUCKET_DRILL_CHILD replaces the restore it runs,
# and RESTORE_BUCKET_POLL_TRIES, RESTORE_BUCKET_POLL_SECS and
# RESTORE_BUCKET_PAUSE_SECS bound its waits.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

TARGET=""
BUCKET=""
AS_OF=""
FROM_VERSIONS=0
DRY_RUN=0
PREFIX=""
DRILL=0
# How many copied keys are read back after a copy.
SAMPLE_SIZE=5

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --bucket) BUCKET="${2:-}"; shift 2 || { echo "ERROR: --bucket requires an argument" >&2; exit 2; } ;;
    --as-of)  AS_OF="${2:-}"; shift 2 || { echo "ERROR: --as-of requires an argument" >&2; exit 2; } ;;
    --from-versions) FROM_VERSIONS=1; shift ;;
    --prefix) PREFIX="${2:-}"; shift 2 || { echo "ERROR: --prefix requires an argument" >&2; exit 2; } ;;
    --drill)  DRILL=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes)    ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

# A prefix scopes either mode to the keys under it, and must end in a slash so
# it names a folder rather than the start of every key that begins alike.
if [[ -n "$PREFIX" ]] && { [[ ! "$PREFIX" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/$ ]] \
     || [[ "/${PREFIX}" == */./* || "/${PREFIX}" == */../* ]]; }; then
  echo "ERROR: --prefix must be a folder path ending in /, such as drill/restore-drill-1/ (got '${PREFIX}')." >&2
  exit 2
fi
if (( DRILL )); then
  [[ "$BUCKET" == media || "$BUCKET" == archive ]] \
    || { echo "ERROR: --drill exercises a bucket with a backup copy: --bucket media or archive (got '${BUCKET}')." >&2; exit 2; }
  if (( FROM_VERSIONS || DRY_RUN )) || [[ -n "$AS_OF" || -n "$PREFIX" ]]; then
    echo "ERROR: --drill runs both recoveries on its own throwaway object; it takes no --from-versions, --as-of, --prefix or --dry-run." >&2
    exit 2
  fi
fi

if (( FROM_VERSIONS )); then
  case "$BUCKET" in
    media|archive|snapshots) ;;
    cloudtrail)
      if [[ "$TARGET" != "production" ]]; then
        echo "ERROR: staging has no CloudTrail log bucket: the trail is account-wide and its bucket lives in the production tree. Use --target production." >&2
        exit 2
      fi ;;
    *) echo "ERROR: --bucket must be media, archive, snapshots or cloudtrail with --from-versions (got '${BUCKET}')." >&2; exit 2 ;;
  esac
  if [[ -z "$AS_OF" ]]; then
    echo "ERROR: --from-versions requires --as-of <time>: deletes after that time are undone." >&2
    exit 2
  fi
else
  case "$BUCKET" in
    media|archive) ;;
    snapshots)
      echo "ERROR: the snapshot bucket has no copy-back from its backup here; a database copy is restored with restore-db.sh, and deletes inside the bucket with --from-versions." >&2
      exit 2 ;;
    cloudtrail)
      echo "ERROR: the CloudTrail log bucket has no backup copy to restore from; deletes inside it are undone with --from-versions." >&2
      exit 2 ;;
    *) echo "ERROR: --bucket must be media or archive (got '${BUCKET}')." >&2; exit 2 ;;
  esac
  if [[ -n "$AS_OF" ]]; then
    echo "ERROR: --as-of belongs to --from-versions; a copy from the backup takes what the backup holds now." >&2
    exit 2
  fi
fi

# The zone is required, so a time typed in local time is never silently read
# as UTC or the other way round.
AS_OF_UTC=""
if (( FROM_VERSIONS )); then
  if [[ ! "$AS_OF" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:?[0-9]{2})$ ]] \
     || ! AS_OF_UTC="$(date -u -d "$AS_OF" +%Y-%m-%dT%H:%M:%S 2>/dev/null)"; then
    echo "ERROR: --as-of must be an ISO 8601 time with its zone, such as 2026-11-01T12:00:00Z (got '${AS_OF}')." >&2
    exit 2
  fi
fi

# A production restore writes to what the public is served, so it asks every
# time; a flag cannot establish that somebody is there.
if [[ "$TARGET" == "production" && "$ASSUME_YES" == "yes" ]]; then
  echo "ERROR: --yes does not carry a production restore: it asks every time, from the terminal. Re-run without --yes." >&2
  exit 2
fi

# One closing report from here on. Sourced after the usage checks, so a usage
# error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

AWS_BIN="${RESTORE_BUCKET_AWS_BIN:-aws}"
TF_BIN="${RESTORE_BUCKET_TERRAFORM_BIN:-terraform}"
for seam in RESTORE_BUCKET_AWS_BIN RESTORE_BUCKET_TERRAFORM_BIN; do
  [[ -n "${!seam:-}" ]] && echo "restore-bucket: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

aws_profile_ensure || cr_die "the AWS identity for this run could not be settled; nothing was changed"

WORK="$(mktemp -d)"
cr_cleanup rm -rf "$WORK"

# Every output in one read. Terraform keeps no null output in its state, so a
# name that is absent from a readable state means its stack is off; a state
# that cannot be read refuses, because it could be hiding a bucket that exists.
if ! "$TF_BIN" -chdir="${REPO_ROOT}/terraform/${TARGET}" output -json </dev/null >"${WORK}/outputs.json" 2>"${WORK}/tf.err"; then
  cr_die "could not read the terraform/${TARGET} state: $(tail -n 1 "${WORK}/tf.err"). Nothing was changed."
fi
jq -e 'type == "object"' "${WORK}/outputs.json" >/dev/null 2>&1 \
  || cr_die "terraform/${TARGET} outputs are not a JSON object of outputs. Nothing was changed."

# tf_name <output>: sets NAME to the bucket name, or to nothing when the output
# is absent. It sets a variable rather than printing, so a refusal inside it
# ends the run in this shell and reaches the closing report.
tf_name() {
  local value
  NAME=""
  value="$(jq -c --arg n "$1" '.[$n].value // null' "${WORK}/outputs.json")"
  [[ "$value" == "null" ]] && return 0
  if [[ "$value" =~ ^\"([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\"$ ]]; then
    NAME="${BASH_REMATCH[1]}"
    return 0
  fi
  cr_die "terraform/${TARGET} output $1 is neither absent nor a bucket name: ${value}. Nothing was changed."
}

case "$BUCKET" in
  media)     MAIN_OUT=media_bucket_name;     DR_OUT=media_dr_bucket_name ;;
  archive)   MAIN_OUT=archive_bucket_name;   DR_OUT=archive_dr_bucket_name ;;
  snapshots) MAIN_OUT=snapshots_bucket_name; DR_OUT="" ;;
  cloudtrail) MAIN_OUT=cloudtrail_bucket_name; DR_OUT="" ;;
esac
tf_name "$MAIN_OUT"
MAIN="$NAME"
if [[ -z "$MAIN" ]]; then
  [[ "$BUCKET" == "archive" ]] \
    && cr_die "terraform/${TARGET} holds no archive_bucket_name, so the archive stack is off here and there is no archive bucket to restore. Nothing was changed."
  [[ "$BUCKET" == "cloudtrail" ]] \
    && cr_die "terraform/${TARGET} holds no cloudtrail_bucket_name, so the trail is off here and there is no log bucket to restore. Nothing was changed."
  cr_die "terraform/${TARGET} holds no ${MAIN_OUT}; apply that tree before restoring into it. Nothing was changed."
fi
DR=""
if (( ! FROM_VERSIONS )); then
  tf_name "$DR_OUT"
  DR="$NAME"
  [[ -n "$DR" ]] || cr_die "terraform/${TARGET} holds no ${DR_OUT}, so there is no backup copy to restore from. Nothing was changed."
fi

# bucket_region <bucket>: sets REGION to where AWS says the bucket lives, which
# also proves it exists. Only AWS's own not-found means absent; any other
# failure is an error in AWS's words, because an identity that may not look is
# not a missing bucket.
bucket_region() {
  local b="$1" region err
  REGION=""
  if ! region="$("$AWS_BIN" s3api get-bucket-location --bucket "$b" \
        --query LocationConstraint --output text </dev/null 2>"${WORK}/loc.err")"; then
    err="$(tail -n 1 "${WORK}/loc.err")"
    if grep -qE '\((404|NoSuchBucket|NotFound)\)' <<<"$err"; then
      cr_die "s3://${b} does not exist. Nothing was changed."
    fi
    cr_die "could not tell whether s3://${b} exists; AWS answered: ${err}. Nothing was changed."
  fi
  # us-east-1 answers as None.
  [[ "$region" == "None" || -z "$region" ]] && region="us-east-1"
  [[ "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] \
    || cr_die "s3://${b} reported a region this script cannot read: '${region}'. Nothing was changed."
  if ! "$AWS_BIN" s3api head-bucket --bucket "$b" --region "$region" </dev/null >/dev/null 2>"${WORK}/head.err"; then
    err="$(tail -n 1 "${WORK}/head.err")"
    if grep -qE '\((404|NoSuchBucket|NotFound)\)' <<<"$err"; then
      cr_die "s3://${b} does not exist. Nothing was changed."
    fi
    cr_die "could not reach s3://${b} in ${region}; AWS answered: ${err}. Nothing was changed."
  fi
  REGION="$region"
}

bucket_region "$MAIN"
MAIN_REGION="$REGION"
echo "== main bucket s3://${MAIN} (${MAIN_REGION})"

confirm_or_stop() {
  local what="$1"
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to ${what}: " "APPLY"; then
    echo "Not confirmed; nothing was changed." >&2
    cr_unproved "the restore of s3://${MAIN}: not confirmed, and nothing was changed"
    cr_finish_with 1 ABORTED
  fi
}

# --------------------------------------------------------------------------
# The drill: both recoveries proved on one throwaway object.
# --------------------------------------------------------------------------
# A real object lost and brought back, so a bucket restore is known to work
# before one is needed, on a key nothing else uses and with every version of
# it removed afterwards. The backup copy is drilled first: a delete replicates
# a marker to the backup, after which the backup no longer holds the object,
# while removing a version outright is not replicated, so the object is lost
# that way for the copy and by an ordinary delete for the versions. Each
# restore is this script run on the drill's folder alone, so nothing outside
# it can be touched; on production each asks for its own APPLY.
if (( DRILL )); then
  DRILL_CHILD="${RESTORE_BUCKET_DRILL_CHILD:-${REPO_ROOT}/scripts/restore-bucket.sh}"
  # Replication without its time control promises no delivery time, so the
  # wait for a copy is generous.
  POLL_TRIES="${RESTORE_BUCKET_POLL_TRIES:-180}"
  POLL_SECS="${RESTORE_BUCKET_POLL_SECS:-10}"
  PAUSE_SECS="${RESTORE_BUCKET_PAUSE_SECS:-3}"
  for seam in RESTORE_BUCKET_DRILL_CHILD RESTORE_BUCKET_POLL_TRIES RESTORE_BUCKET_POLL_SECS RESTORE_BUCKET_PAUSE_SECS; do
    [[ -n "${!seam:-}" ]] && echo "restore-bucket: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
  done
  bucket_region "$DR"
  DR_REGION="$REGION"
  echo "== backup copy s3://${DR} (${DR_REGION})"
  DRILL_PREFIX="drill/restore-drill-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}${RANDOM}/"
  DRILL_KEY="${DRILL_PREFIX}probe.txt"
  TOKEN="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  printf '%s\n' "$TOKEN" >"${WORK}/probe.txt"
  echo ""
  echo "The drill writes ${DRILL_KEY} into ${TARGET} s3://${MAIN}, waits for"
  echo "its copy in s3://${DR}, removes it from s3://${MAIN} and copies it back"
  echo "from the backup, deletes it and restores it from its versions, then removes"
  echo "every version of it from both buckets. Nothing outside ${DRILL_PREFIX} is touched."
  confirm_or_stop "run the restore drill on ${TARGET} s3://${MAIN}"

  # purge <bucket> <region>: removes every version and delete marker under the
  # drill's folder. Prints how many entries are left, which is 0 when it worked.
  # A listing that matched nothing can come back as no output at all rather
  # than as empty lists, and that is a folder with nothing left in it.
  purge() {
    local b="$1" r="$2" id left
    "$AWS_BIN" s3api list-object-versions --bucket "$b" --region "$r" --prefix "$DRILL_PREFIX" --output json \
      </dev/null >"${WORK}/purge.json" 2>"${WORK}/purge.err" || { echo "unlisted"; return 0; }
    [[ -s "${WORK}/purge.json" ]] || { echo 0; return 0; }
    # A delete that fails is not the verdict: the listing after the loop is,
    # and the last refusal's words are kept in purge.err for its report.
    for id in $(jq -r '[(.Versions // [])[], (.DeleteMarkers // [])[]] | .[] | .VersionId' "${WORK}/purge.json"); do
      if ! "$AWS_BIN" s3api delete-object --bucket "$b" --region "$r" --key "$DRILL_KEY" --version-id "$id" \
          </dev/null >/dev/null 2>>"${WORK}/purge.err"; then
        echo "delete of version ${id} refused" >>"${WORK}/purge.err"
      fi
    done
    "$AWS_BIN" s3api list-object-versions --bucket "$b" --region "$r" --prefix "$DRILL_PREFIX" --output json \
      </dev/null >"${WORK}/purge.json" 2>>"${WORK}/purge.err" || { echo "unlisted"; return 0; }
    [[ -s "${WORK}/purge.json" ]] || { echo 0; return 0; }
    left="$(jq '[(.Versions // [])[], (.DeleteMarkers // [])[]] | length' "${WORK}/purge.json")"
    echo "$left"
  }
  # Runs however the drill ends, so a stop part way leaves no throwaway object
  # behind; one it cannot remove is reported, never hidden.
  # The drill's last writes to the served bucket are still on their way to the
  # backup copy when it ends; a copy that lands after the folder is removed
  # there would stay behind, so the removal waits for the current version's
  # replication first. SETTLED says whether that wait was reached.
  SETTLED=0
  settle() {
    local i status=""
    for (( i = 1; i <= POLL_TRIES; i++ )); do
      status="$("$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$DRILL_KEY" \
        --query ReplicationStatus --output text </dev/null 2>/dev/null)" || status=""
      [[ "$status" == COMPLETED || "$status" == FAILED ]] && break
      (( i < POLL_TRIES )) && sleep "$POLL_SECS"
    done
    [[ "$status" == COMPLETED ]] && SETTLED=1
  }
  drill_cleanup() {
    local b r left
    if (( ${replicated:-0} && ! SETTLED )); then
      cr_unproved "the backup copy s3://${DR} may still receive late copies of ${DRILL_PREFIX}, which this run could not wait for and did not remove"
    fi
    for b in "$MAIN" "$DR"; do
      [[ "$b" == "$MAIN" ]] && r="$MAIN_REGION" || r="$DR_REGION"
      left="$(purge "$b" "$r")"
      if [[ "$left" != "0" ]]; then
        cr_error "the drill's ${DRILL_PREFIX} in s3://${b} could not be fully removed (${left} left): $(tail -n 1 "${WORK}/purge.err" 2>/dev/null)"
      fi
    done
  }
  cr_cleanup drill_cleanup

  # read_back <what>: the object is back in the main bucket with the token.
  read_back() {
    if ! "$AWS_BIN" s3api get-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$DRILL_KEY" "${WORK}/back.txt" \
          </dev/null >/dev/null 2>"${WORK}/get.err"; then
      cr_die "after ${1}, ${DRILL_KEY} is not in s3://${MAIN}: $(tail -n 1 "${WORK}/get.err")"
    fi
    cmp -s "${WORK}/probe.txt" "${WORK}/back.txt" || cr_die "after ${1}, ${DRILL_KEY} in s3://${MAIN} does not hold what the drill wrote"
    cr_proved "${1} brought ${DRILL_KEY} back into s3://${MAIN} with what the drill wrote"
  }
  # absent <what>: the object is gone from the main bucket before a restore.
  absent() {
    if "$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$DRILL_KEY" \
         </dev/null >/dev/null 2>"${WORK}/head.err"; then
      cr_die "after ${1}, ${DRILL_KEY} is still in s3://${MAIN}, so a restore would prove nothing"
    fi
    grep -qE '\((404|NoSuchKey|Not Found)\)|Not Found' "${WORK}/head.err" \
      || cr_die "could not tell whether ${DRILL_KEY} is gone from s3://${MAIN}: $(tail -n 1 "${WORK}/head.err")"
  }
  CHILD=(--target "$TARGET" --bucket "$BUCKET" --prefix "$DRILL_PREFIX")
  [[ "$TARGET" == "staging" ]] && CHILD+=(--yes)

  echo "== writing ${DRILL_KEY}"
  "$AWS_BIN" s3api put-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$DRILL_KEY" --body "${WORK}/probe.txt" \
    </dev/null >/dev/null 2>"${WORK}/put.err" || cr_die "the drill could not write ${DRILL_KEY} into s3://${MAIN}: $(tail -n 1 "${WORK}/put.err")"

  echo "== waiting for its copy in s3://${DR}"
  replicated=0
  for (( i = 1; i <= POLL_TRIES; i++ )); do
    if "$AWS_BIN" s3api head-object --bucket "$DR" --region "$DR_REGION" --key "$DRILL_KEY" </dev/null >/dev/null 2>&1; then
      replicated=1
      break
    fi
    (( i < POLL_TRIES )) && sleep "$POLL_SECS"
  done
  (( replicated )) || cr_die "${DRILL_KEY} did not reach s3://${DR} within $(( POLL_TRIES * POLL_SECS )) seconds, so replication is not carrying new objects; the backup copy cannot be drilled"
  cr_proved "${DRILL_KEY} replicated to s3://${DR}"

  echo "== from the backup copy: ${DRILL_KEY} removed outright from s3://${MAIN}"
  [[ "$(purge "$MAIN" "$MAIN_REGION")" == "0" ]] || cr_die "${DRILL_KEY} could not be removed from s3://${MAIN}: $(tail -n 1 "${WORK}/purge.err")"
  absent "its removal"
  bash "$DRILL_CHILD" "${CHILD[@]}" || cr_die "the restore from the backup copy did not complete; its report above says why"
  read_back "the restore from the backup copy"

  echo "== from earlier versions: ${DRILL_KEY} deleted in s3://${MAIN}"
  # The point to restore to is read from S3's own clock: the copied-back
  # version's time plus a second, with the delete made seconds after it. The
  # workstation's clock can differ from S3's by more than the pause.
  lm="$("$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$DRILL_KEY" \
    --query LastModified --output text </dev/null 2>"${WORK}/head.err")" \
    || cr_die "could not read when ${DRILL_KEY} was written back: $(tail -n 1 "${WORK}/head.err")"
  lm_epoch="$(date -u -d "$lm" +%s 2>/dev/null)" || cr_die "could not read S3's time for ${DRILL_KEY}: ${lm}"
  as_of="$(date -u -d "@$(( lm_epoch + 1 ))" +%Y-%m-%dT%H:%M:%SZ)"
  sleep "$PAUSE_SECS"
  "$AWS_BIN" s3api delete-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$DRILL_KEY" \
    </dev/null >/dev/null 2>"${WORK}/del.err" || cr_die "the drill could not delete ${DRILL_KEY}: $(tail -n 1 "${WORK}/del.err")"
  absent "its delete"
  bash "$DRILL_CHILD" "${CHILD[@]}" --from-versions --as-of "$as_of" \
    || cr_die "the restore from earlier versions did not complete; its report above says why"
  read_back "the restore from earlier versions"
  echo "== waiting for s3://${DR} to catch up before removing the drill's folder"
  settle
  cr_finish
fi

# --------------------------------------------------------------------------
# From earlier versions.
# --------------------------------------------------------------------------
if (( FROM_VERSIONS )); then
  echo "== changes in s3://${MAIN} after ${AS_OF_UTC} UTC"
  VPREFIX=()
  [[ -n "$PREFIX" ]] && VPREFIX=(--prefix "$PREFIX")
  if ! "$AWS_BIN" s3api list-object-versions --bucket "$MAIN" --region "$MAIN_REGION" "${VPREFIX[@]}" --output json \
        </dev/null >"${WORK}/versions.json" 2>"${WORK}/versions.err"; then
    cr_die "the versions in s3://${MAIN} could not be listed; AWS answered: $(tail -n 1 "${WORK}/versions.err"). Nothing was changed."
  fi
  # Per key, newest entry first (on a tie the one AWS marks latest leads).
  # $then is what the key held at --as-of: its newest entry written at or
  # before it. Times compare as UTC strings on their first nineteen
  # characters, which is how AWS writes them. One line per key that changed:
  #   REMOVE  key, markers to remove, version they uncover, deleted at
  #   COPY    key, version to copy back, its size, current id, current kind
  #           (version or marker), current ETag
  #   ABSENT  key, current version: deleted at --as-of, written after it
  #   UNKNOWN key, current id: nothing at or before --as-of is left
  #   GONE    key: only delete markers, all after --as-of
  # shellcheck disable=SC2016
  jq -r --arg asof "$AS_OF_UTC" '
    ([(.Versions // [])[] | {k: .Key, id: .VersionId, t: .LastModified[0:19], l: (.IsLatest == true), m: false, s: (.Size // 0), e: (.ETag // "")}]
     + [(.DeleteMarkers // [])[] | {k: .Key, id: .VersionId, t: .LastModified[0:19], l: (.IsLatest == true), m: true, s: 0, e: ""}])
    | group_by(.k)[]
    | sort_by([.t, (if .l then 1 else 0 end)]) | reverse
    | . as $all
    | $all[0] as $cur
    | (first($all[] | select(.t <= $asof)) // null) as $then
    | (first($all[] | select(.m | not)) // null) as $firstreal
    | if $then != null and $then.id == $cur.id then empty
      elif $then == null then
        (if $firstreal == null then "GONE\t\($cur.k)" else "UNKNOWN\t\($cur.k)\t\($cur.id)" end)
      elif $then.m then
        (if $cur.m then empty else "ABSENT\t\($cur.k)\t\($cur.id)" end)
      elif ($cur.m | not) and $then.e != "" and $cur.e == $then.e and $cur.s == $then.s then empty
      elif $firstreal.id == $then.id then
        ([$all | to_entries[] | select(.value.id == $then.id) | .key] | first) as $i
        | "REMOVE\t\($cur.k)\t\([$all[0:$i][].id] | join(","))\t\($then.id)\t\($all[$i - 1].t)"
      else
        "COPY\t\($cur.k)\t\($then.id)\t\($then.s)\t\($cur.id)\t\(if $cur.m then "marker" else "version" end)\t\($cur.e)"
      end
  ' "${WORK}/versions.json" >"${WORK}/plan.tsv" \
    || cr_die "the version listing of s3://${MAIN} could not be read as JSON. Nothing was changed."

  for kind in REMOVE COPY ABSENT UNKNOWN GONE; do
    grep "^${kind}"$'\t' "${WORK}/plan.tsv" >"${WORK}/${kind}.tsv" || [[ $? == 1 ]]
  done
  n_remove="$(wc -l <"${WORK}/REMOVE.tsv")"
  n_copy="$(wc -l <"${WORK}/COPY.tsv")"
  n_absent="$(wc -l <"${WORK}/ABSENT.tsv")"
  n_unknown="$(wc -l <"${WORK}/UNKNOWN.tsv")"
  n_gone="$(wc -l <"${WORK}/GONE.tsv")"

  # The plan: every key that changed after --as-of, with what happens to it.
  if (( n_gone > 0 )); then
    echo "    ${n_gone} key(s) deleted after ${AS_OF_UTC} have no earlier version left in the window; left alone:"
    cut -f2 "${WORK}/GONE.tsv" | sed 's/^/      /'
    cr_unproved "${n_gone} key(s) deleted after ${AS_OF_UTC} in s3://${MAIN} are beyond the version window and were not restored"
  fi
  if (( n_unknown > 0 )); then
    echo "    ${n_unknown} key(s) have nothing at or before ${AS_OF_UTC} left in the listing: first written after it, or their version then has aged out of the window; left alone (key, current version):"
    cut -f2,3 "${WORK}/UNKNOWN.tsv" | sed 's/^/      /'
    cr_unproved "${n_unknown} key(s) in s3://${MAIN} have no version at or before ${AS_OF_UTC} left to return to and were left alone"
  fi
  if (( n_absent > 0 )); then
    echo "    ${n_absent} key(s) were absent at ${AS_OF_UTC} and written after it; left alone, since this never deletes an object (key, current version):"
    cut -f2,3 "${WORK}/ABSENT.tsv" | sed 's/^/      /'
    cr_unproved "${n_absent} key(s) in s3://${MAIN} written after ${AS_OF_UTC} where none stood then were left alone"
  fi
  if (( n_remove + n_copy == 0 )); then
    echo "    nothing in s3://${MAIN} changed after ${AS_OF_UTC} that its versions can put back."
    cr_proved "s3://${MAIN} holds no delete or overwrite after ${AS_OF_UTC} that an earlier version can undo"
    cr_finish_with 0 "DONE, NOTHING TO RESTORE"
  fi
  if (( n_remove > 0 )); then
    echo "    ${n_remove} key(s) deleted after ${AS_OF_UTC} would be restored by removing their delete markers (key, markers removed, version made current, deleted at):"
    cut -f2- "${WORK}/REMOVE.tsv" | sed 's/^/      /'
  fi
  if (( n_copy > 0 )); then
    echo "    ${n_copy} key(s) overwritten after ${AS_OF_UTC} would have their version then copied back as a new current version (key, version copied back, current version or delete marker it goes over):"
    cut -f2,3,5 "${WORK}/COPY.tsv" | sed 's/^/      /'
  fi

  if (( DRY_RUN )); then
    cr_proved "dry run: in s3://${MAIN}, ${n_remove} key(s) would have delete markers removed and ${n_copy} key(s) a version copied back; ${n_absent} written after ${AS_OF_UTC}, ${n_unknown} with no version then and ${n_gone} beyond the window would be left alone; nothing was changed"
    cr_finish
  fi
  confirm_or_stop "remove the delete markers and copy back the versions listed above, restoring $((n_remove + n_copy)) key(s) in ${TARGET} s3://${MAIN}"

  done_count=0
  while IFS=$'\t' read -r _ key ids _; do
    IFS=',' read -r -a marker_ids <<<"$ids"
    for id in "${marker_ids[@]}"; do
      if ! "$AWS_BIN" s3api delete-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
            --version-id "$id" </dev/null >/dev/null 2>"${WORK}/del.err"; then
        cr_die "the delete marker ${id} on ${key} could not be removed; AWS answered: $(tail -n 1 "${WORK}/del.err"). ${done_count} of ${n_remove} key(s) had their markers removed and no version was copied back; a re-run finishes the rest."
      fi
    done
    done_count=$((done_count + 1))
  done <"${WORK}/REMOVE.tsv"

  # Each copy is refused rather than made over a key that changed since the
  # plan: the current version id is read back first, and the copy itself is a
  # conditional write on what is current. A refused key is an error and the
  # rest go on, since each key stands alone.
  : >"${WORK}/copied.tsv"
  n_refused=0
  while IFS=$'\t' read -r _ key then_id then_size cur_id cur_kind cur_etag; do
    cond=()
    if [[ "$cur_kind" == "version" ]]; then
      now_id=""
      if ! now_id="$("$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
            --query VersionId --output text </dev/null 2>"${WORK}/pre.err")"; then
        cr_error "${key} was not copied back: its current version could not be read before the copy; AWS answered: $(tail -n 1 "${WORK}/pre.err")"
        n_refused=$((n_refused + 1)); continue
      fi
      if [[ "$now_id" != "$cur_id" ]]; then
        cr_error "${key} was not copied back: its current version is ${now_id}, not ${cur_id} as planned, so it was written while the run was going; it is left as it is, and a re-run plans it afresh"
        n_refused=$((n_refused + 1)); continue
      fi
      if [[ -z "$cur_etag" ]]; then
        cr_error "${key} was not copied back: the listing gave no ETag for its current version ${cur_id}, so the copy could not be conditioned on it"
        n_refused=$((n_refused + 1)); continue
      fi
      cond=(--if-match "$cur_etag")
    else
      cond=(--if-none-match '*')
    fi
    new_id=""
    if ! new_id="$("$AWS_BIN" s3api copy-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
          --copy-source "${MAIN}/${key}?versionId=${then_id}" "${cond[@]}" \
          --query VersionId --output text </dev/null 2>"${WORK}/copy.err")"; then
      err="$(tail -n 1 "${WORK}/copy.err")"
      if grep -qE '\((PreconditionFailed|412|ConditionalRequestConflict|409|NoSuchKey|404)\)' <<<"$err"; then
        cr_error "${key} was not copied back: it changed while the run was going, and AWS refused the conditional copy: ${err}. It is left as it is; a re-run plans it afresh"
      else
        cr_error "${key} was not copied back from version ${then_id}; AWS answered: ${err}"
      fi
      n_refused=$((n_refused + 1)); continue
    fi
    echo "    ${key}: version ${then_id} copied back as ${new_id}"
    printf '%s\t%s\t%s\t%s\n' "$key" "$then_id" "$then_size" "$new_id" >>"${WORK}/copied.tsv"
  done <"${WORK}/COPY.tsv"

  # Each key whose markers were removed must read back as present.
  missing=0
  while IFS=$'\t' read -r _ key _; do
    if ! "$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
          </dev/null >/dev/null 2>"${WORK}/head.err"; then
      cr_error "${key} is still absent from s3://${MAIN} after its delete markers were removed: $(tail -n 1 "${WORK}/head.err")"
      missing=$((missing + 1))
    fi
  done <"${WORK}/REMOVE.tsv"
  (( n_remove > 0 && missing == 0 )) && cr_proved "all ${n_remove} key(s) whose delete markers were removed read back as present in s3://${MAIN}"

  # Each key copied back must read back with the copy current, at the size of
  # the version it was copied from.
  bad=0
  n_copied="$(wc -l <"${WORK}/copied.tsv")"
  while IFS=$'\t' read -r key then_id then_size new_id; do
    if ! got="$("$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
          --query '[VersionId,ContentLength]' --output text </dev/null 2>"${WORK}/head.err")"; then
      cr_error "${key} could not be read back after version ${then_id} was copied back: $(tail -n 1 "${WORK}/head.err")"
      bad=$((bad + 1)); continue
    fi
    read -r got_id got_size <<<"$got"
    if [[ "$got_id" != "$new_id" ]]; then
      cr_error "${key} reads back with version ${got_id} current, not the copy ${new_id} of version ${then_id}"
      bad=$((bad + 1))
    elif [[ "$got_size" != "$then_size" ]]; then
      cr_error "${key} reads back at ${got_size} bytes, but version ${then_id} it was copied from is ${then_size}"
      bad=$((bad + 1))
    fi
  done <"${WORK}/copied.tsv"
  (( n_copied > 0 && bad == 0 )) && cr_proved "all ${n_copied} key(s) copied back read back with the copy current, at the size of the version copied"
  cr_proved "counts in s3://${MAIN}: ${n_remove} key(s) had delete markers removed, ${n_copied} of ${n_copy} had their version at ${AS_OF_UTC} copied back (${n_refused} refused), ${n_absent} written after it, ${n_unknown} with no version then and ${n_gone} beyond the window were left alone"
  cr_finish
fi

# --------------------------------------------------------------------------
# From the backup copy.
# --------------------------------------------------------------------------
bucket_region "$DR"
DR_REGION="$REGION"
echo "== backup copy s3://${DR} (${DR_REGION})"

first_key=""
LPREFIX=()
[[ -n "$PREFIX" ]] && LPREFIX=(--prefix "$PREFIX")
if ! first_key="$("$AWS_BIN" s3api list-objects-v2 --bucket "$DR" --region "$DR_REGION" "${LPREFIX[@]}" --max-items 1 \
      --query 'Contents[0].Key' --output text </dev/null 2>"${WORK}/list.err")"; then
  cr_die "the backup copy s3://${DR} could not be listed; AWS answered: $(tail -n 1 "${WORK}/list.err"). Nothing was changed."
fi
[[ -n "$first_key" && "$first_key" != "None" ]] \
  || cr_die "the backup copy s3://${DR} holds no object, so there is nothing to restore from. Nothing was changed."

# With a prefix the copy is the folder alone: both paths carry it, so a key
# outside it is neither listed nor copied.
SYNC_FROM="s3://${DR}" SYNC_TO="s3://${MAIN}"
[[ -n "$PREFIX" ]] && SYNC_FROM+="/${PREFIX}" SYNC_TO+="/${PREFIX}"
SYNC=(s3 sync "$SYNC_FROM" "$SYNC_TO" --source-region "$DR_REGION" --region "$MAIN_REGION" --storage-class STANDARD)
# Upload staging is never copied back. The media bucket's lifecycle rule
# expire-pending-uploads deletes what sits under this prefix after a day, and
# S3 does not replicate a lifecycle expiration, so the backup keeps every
# abandoned upload the rule removed; copying them back would revive files that
# no finished upload ever claimed. The same exclude is on the plan, the copy
# and the verifying dry run, so what is left out is never counted as missing.
# The archive bucket has no such rule and no such prefix.
MEDIA_PENDING_PREFIX="pending/"
[[ "$BUCKET" == "media" ]] && SYNC+=(--exclude "${MEDIA_PENDING_PREFIX}*")

# dry_sync <file>: what the copy would do, one key per line, into <file>.
# Every line the dry run prints must be a copy; anything else stops the run
# rather than being counted as nothing to do.
dry_sync() {
  local out="$1" line
  if ! "$AWS_BIN" "${SYNC[@]}" --dryrun </dev/null >"${WORK}/dry.out" 2>"${WORK}/dry.err"; then
    cr_die "the dry run of the copy failed; AWS answered: $(tail -n 1 "${WORK}/dry.err")"
  fi
  : >"$out"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    if [[ "$line" == "(dryrun) copy: s3://${DR}/"*" to s3://${MAIN}/"* ]]; then
      printf '%s\n' "${line##* to s3://"${MAIN}"/}" >>"$out"
    else
      cr_die "the dry run of the copy printed a line this script does not recognise: ${line}"
    fi
  done <"${WORK}/dry.out"
}

dry_sync "${WORK}/pending.txt"
n_copy="$(wc -l <"${WORK}/pending.txt")"
if (( n_copy == 0 )); then
  echo "    s3://${MAIN} already holds every object in s3://${DR}; nothing to copy."
  cr_proved "s3://${MAIN} already holds every object in its backup copy s3://${DR}"
  cr_finish_with 0 "DONE, NOTHING TO COPY"
fi
echo "    ${n_copy} object(s) would be copied from s3://${DR} into s3://${MAIN}, in the standard storage class; nothing is removed:"
head -n 20 "${WORK}/pending.txt" | sed 's/^/      /'
(( n_copy > 20 )) && echo "      ... and $((n_copy - 20)) more"

if (( DRY_RUN )); then
  cr_proved "dry run: ${n_copy} object(s) would be copied from s3://${DR} into s3://${MAIN}; nothing was changed"
  cr_finish
fi
confirm_or_stop "copy ${n_copy} object(s) from s3://${DR} into ${TARGET} s3://${MAIN}"

# A failed copy is already listed as an error with the tool's last line; the
# run goes on to measure what did land, so the report says how far it got.
copy_status=0
cr_run "copy from the backup" -- "$AWS_BIN" "${SYNC[@]}" </dev/null || copy_status=$?
(( copy_status == 0 )) || echo "    the copy exited ${copy_status}; measuring what landed." >&2

# The verdict comes from the bucket, not from the copy's exit status: nothing
# may be left to copy, and a sample of the copied keys must read back at the
# backup's size in the standard class.
dry_sync "${WORK}/left.txt"
n_left="$(wc -l <"${WORK}/left.txt")"
if (( n_left > 0 )); then
  cr_error "${n_left} object(s) are still missing from s3://${MAIN} after the copy; a re-run copies them"
else
  cr_proved "a second dry run of the copy finds nothing left to copy from s3://${DR} into s3://${MAIN}"
fi

sampled=0
bad=0
while IFS= read -r key && (( sampled < SAMPLE_SIZE )); do
  sampled=$((sampled + 1))
  want="$("$AWS_BIN" s3api head-object --bucket "$DR" --region "$DR_REGION" --key "$key" \
    --query ContentLength --output text </dev/null 2>"${WORK}/h.err")" \
    || { cr_error "${key} could not be read in s3://${DR}: $(tail -n 1 "${WORK}/h.err")"; bad=$((bad + 1)); continue; }
  got="$("$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
    --query '[ContentLength,StorageClass]' --output text </dev/null 2>"${WORK}/h.err")" \
    || { cr_error "${key} is not in s3://${MAIN} after the copy: $(tail -n 1 "${WORK}/h.err")"; bad=$((bad + 1)); continue; }
  read -r got_size got_class <<<"$got"
  # The standard class is the one head-object leaves unnamed.
  if [[ "$got_size" != "$want" ]]; then
    cr_error "${key} in s3://${MAIN} is ${got_size} bytes, but ${want} in the backup copy"; bad=$((bad + 1))
  elif [[ "${got_class:-None}" != "None" && "$got_class" != "STANDARD" ]]; then
    cr_error "${key} in s3://${MAIN} is stored in ${got_class}, not the standard class"; bad=$((bad + 1))
  fi
done <"${WORK}/pending.txt"
if (( sampled > 0 && bad == 0 )); then
  cr_proved "${sampled} copied key(s) read back from s3://${MAIN} at the backup's size, in the standard class"
fi
cr_unproved "the content of every copied object: sizes are checked on a sample of ${SAMPLE_SIZE}, not checksums on all"
cr_finish
