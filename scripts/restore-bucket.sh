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
# From earlier versions (--from-versions --as-of <time>). Undoes deletes inside
# the main bucket itself, within the window its lifecycle rule keeps noncurrent
# versions for. A key whose newest entries are delete markers all created after
# --as-of, with a real version beneath them, is restored by removing those
# markers, which makes the version beneath current again. No real object
# version is ever deleted; only those markers are. A key already deleted at
# --as-of is left alone, and a key whose earlier version has aged out of the
# window is listed as beyond reach. This CAN revive an item that a member
# erasure deleted after --as-of; that is accepted as rare, and the dry run
# lists every key before anything changes. A delete marker placed by a
# lifecycle expiry is revived too, and that rule expires the object again at
# its next run. The listing follows every page AWS returns (the CLI paginates
# on its own), so the bound is the memory the whole version listing needs,
# which these buckets stay far inside.
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
# restore every restored key must read back as present. Nothing to copy or
# nothing to restore is a finished run, not an error. A re-run after a stop part
# way picks up whatever is still missing.
#
# Usage:
#   bash scripts/restore-bucket.sh --target <staging|production> \
#     --bucket <media|archive> [--dry-run] [--yes]
#   bash scripts/restore-bucket.sh --target <staging|production> \
#     --bucket <media|archive|snapshots|cloudtrail> --from-versions \
#     --as-of 2026-11-01T12:00:00Z [--dry-run] [--yes]
#
#   --target         the environment. Required, with no default.
#   --bucket         which bucket to restore.
#   --from-versions  undo deletes from the bucket's own versions instead of
#                    copying from the backup. Requires --as-of.
#   --as-of          an ISO 8601 time with its zone (Z or +hh:mm); deletes
#                    after it are undone.
#   --dry-run        show what would change and stop.
#   --yes            proceed without the typed prompt; staging only.
#
# Exits 0 when the restore is proven or there was nothing to do, 1 on a failed
# or unconfirmed run, and 2 on a usage error.
#
# Test seams (CI only; operators never set these), announced on stderr when
# set: RESTORE_BUCKET_AWS_BIN and RESTORE_BUCKET_TERRAFORM_BIN replace the two
# tools.
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
    --dry-run) DRY_RUN=1; shift ;;
    --yes)    ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

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
echo "==> main bucket s3://${MAIN} (${MAIN_REGION})"

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
# From earlier versions.
# --------------------------------------------------------------------------
if (( FROM_VERSIONS )); then
  echo "==> deletes in s3://${MAIN} after ${AS_OF_UTC} UTC"
  if ! "$AWS_BIN" s3api list-object-versions --bucket "$MAIN" --region "$MAIN_REGION" --output json \
        </dev/null >"${WORK}/versions.json" 2>"${WORK}/versions.err"; then
    cr_die "the versions in s3://${MAIN} could not be listed; AWS answered: $(tail -n 1 "${WORK}/versions.err"). Nothing was changed."
  fi
  # Per key, newest entry first (on a tie the one AWS marks latest leads).
  # The leading run of delete markers is what deleted the key; it is undone
  # only when every marker in it is newer than --as-of and a real version
  # lies beneath it. Times compare as UTC strings on their first nineteen
  # characters, which is how AWS writes them.
  # shellcheck disable=SC2016
  jq -r --arg asof "$AS_OF_UTC" '
    ([(.Versions // [])[] | {k: .Key, id: .VersionId, t: .LastModified[0:19], l: (.IsLatest == true), m: false}]
     + [(.DeleteMarkers // [])[] | {k: .Key, id: .VersionId, t: .LastModified[0:19], l: (.IsLatest == true), m: true}])
    | group_by(.k)[]
    | sort_by([.t, (if .l then 1 else 0 end)]) | reverse
    | . as $all
    | ([$all | to_entries[] | select(.value.m | not) | .key] | first) as $firstreal
    | ($all[0:($firstreal // ($all | length))]) as $run
    | select(($run | length) > 0)
    | if ($run | all(.t > $asof)) | not then empty
      elif $firstreal == null then "GONE\t\($all[0].k)"
      else "RESTORE\t\($all[0].k)\t\([$run[].id] | join(","))\t\($run[-1].t)" end
  ' "${WORK}/versions.json" >"${WORK}/plan.tsv" \
    || cr_die "the version listing of s3://${MAIN} could not be read as JSON. Nothing was changed."

  grep '^RESTORE' "${WORK}/plan.tsv" >"${WORK}/restore.tsv" || [[ $? == 1 ]]
  grep '^GONE' "${WORK}/plan.tsv" >"${WORK}/gone.tsv" || [[ $? == 1 ]]
  n_restore="$(wc -l <"${WORK}/restore.tsv")"
  n_gone="$(wc -l <"${WORK}/gone.tsv")"

  if (( n_gone > 0 )); then
    echo "    ${n_gone} key(s) deleted after ${AS_OF_UTC} have no earlier version left in the window:"
    cut -f2 "${WORK}/gone.tsv" | sed 's/^/      /'
    cr_unproved "${n_gone} key(s) deleted after ${AS_OF_UTC} in s3://${MAIN} are beyond the version window and were not restored"
  fi
  if (( n_restore == 0 )); then
    echo "    nothing in s3://${MAIN} was deleted after ${AS_OF_UTC} that its versions can bring back."
    cr_proved "s3://${MAIN} holds no delete after ${AS_OF_UTC} that an earlier version can undo"
    cr_finish_with 0 "DONE, NOTHING TO RESTORE"
  fi
  echo "    ${n_restore} key(s) deleted after ${AS_OF_UTC} would be restored (key, deleted at):"
  cut -f2,4 "${WORK}/restore.tsv" | sed 's/^/      /'

  if (( DRY_RUN )); then
    cr_proved "dry run: ${n_restore} key(s) in s3://${MAIN} would be restored; nothing was changed"
    cr_finish
  fi
  confirm_or_stop "remove the delete markers above, restoring ${n_restore} key(s) in ${TARGET} s3://${MAIN}"

  done_count=0
  while IFS=$'\t' read -r _ key ids _; do
    IFS=',' read -r -a marker_ids <<<"$ids"
    for id in "${marker_ids[@]}"; do
      if ! "$AWS_BIN" s3api delete-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
            --version-id "$id" </dev/null >/dev/null 2>"${WORK}/del.err"; then
        cr_die "the delete marker ${id} on ${key} could not be removed; AWS answered: $(tail -n 1 "${WORK}/del.err"). ${done_count} of ${n_restore} key(s) were restored; a re-run finishes the rest."
      fi
    done
    done_count=$((done_count + 1))
  done <"${WORK}/restore.tsv"

  # Each restored key must read back as present.
  missing=0
  while IFS=$'\t' read -r _ key _; do
    if ! "$AWS_BIN" s3api head-object --bucket "$MAIN" --region "$MAIN_REGION" --key "$key" \
          </dev/null >/dev/null 2>"${WORK}/head.err"; then
      cr_error "${key} is still absent from s3://${MAIN} after its delete markers were removed: $(tail -n 1 "${WORK}/head.err")"
      missing=$((missing + 1))
    fi
  done <"${WORK}/restore.tsv"
  (( missing == 0 )) && cr_proved "all ${n_restore} restored key(s) read back as present in s3://${MAIN}"
  cr_finish
fi

# --------------------------------------------------------------------------
# From the backup copy.
# --------------------------------------------------------------------------
bucket_region "$DR"
DR_REGION="$REGION"
echo "==> backup copy s3://${DR} (${DR_REGION})"

first_key=""
if ! first_key="$("$AWS_BIN" s3api list-objects-v2 --bucket "$DR" --region "$DR_REGION" --max-items 1 \
      --query 'Contents[0].Key' --output text </dev/null 2>"${WORK}/list.err")"; then
  cr_die "the backup copy s3://${DR} could not be listed; AWS answered: $(tail -n 1 "${WORK}/list.err"). Nothing was changed."
fi
[[ -n "$first_key" && "$first_key" != "None" ]] \
  || cr_die "the backup copy s3://${DR} holds no object, so there is nothing to restore from. Nothing was changed."

SYNC=(s3 sync "s3://${DR}" "s3://${MAIN}" --source-region "$DR_REGION" --region "$MAIN_REGION" --storage-class STANDARD)
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
