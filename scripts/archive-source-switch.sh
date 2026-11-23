#!/usr/bin/env bash
# archive-source-switch.sh
#
# Moves the Legacy Archive's source of truth from the crawl to the archive
# bucket, once, at go-live.
#
# Before go-live the workstation crawl is the archive's source and
# scripts/publish-archive.sh publishes it with a sync that deletes whatever the
# crawl lacks. From the cutover the archive bucket is the source of truth,
# changed only by scripts/archive-edit.sh, and a publish would overwrite and
# delete those edits. The SSM parameter /footbag/<env>/archive-source records
# which phase an environment is in: Terraform declares it with the archive
# stack at "crawl" and never moves it again (its value is ignored after
# creation), the publish proceeds only while it reads exactly "crawl", and this
# script writes "bucket". There is no way back in this script: once edits live
# only in the bucket, a return to the crawl would publish over them.
#
# Where it sits in the go-live order, on each environment:
#   1. the final crawl
#   2. the final scripts/publish-archive.sh run
#   3. the last scripts/backup-legacy-mirror.sh run (production), which freezes
#      the whole crawl in the cold copy
#   4. this switch
#
# What a run does, in order:
#   1. Proves the run is the directly authenticated footbag-operator IAM user.
#   2. Reads the parameter. Already "bucket": the switch is done, which it says,
#      and the run changes nothing. Anything but "crawl" or "bucket" refuses.
#   3. Production only: proves the archive bucket's replication configuration
#      holds an enabled rule to the cold-copy bucket,
#      footbag-production-legacy-mirror-backup, covering the whole bucket, with
#      delete-marker replication Disabled and storage class DEEP_ARCHIVE. That
#      rule is what makes every later edit recoverable: it carries every write
#      to the cold copy and never a delete.
#   4. States the change and takes a typed APPLY, read from the terminal.
#   5. Production only: copies the objects the archive held before that rule
#      existed into the cold copy, by running scripts/backfill-replication.sh as
#      a child with --source archive-cold-copy. Live replication copies only
#      objects written after the rule, so without this the cold copy would hold
#      the edits but not the archive they edited. The child takes its own typed
#      APPLY on production and proves its copy by sampling; the switch goes no
#      further unless it succeeds. Re-running it is safe: a job with nothing
#      left to copy is that script's expected outcome.
#   6. Writes "bucket" and reads it back.
#
# Staging has no cold copy (no legacy-mirror-backup bucket and no rule to one),
# so on staging steps 3 and 5 are skipped and the closing report says so.
#
# What it refuses:
#   - a run with no --target; there is no default
#   - any identity but the directly authenticated footbag-operator IAM user
#   - a parameter that does not exist. It is declared with the archive stack,
#     so its absence means that stack is not applied as expected; treating it
#     as "crawl" would switch an environment nothing has verified.
#   - a read that failed for any other reason, with AWS's message
#   - a parameter reading anything other than "crawl" or "bucket"
#   - on production, an archive bucket with no replication rule to the cold copy
#     as described above; apply terraform/production with the archive cold-copy
#     replication rule first
#   - a run with no terminal to type APPLY on; no flag or variable answers it
#
# Usage:
#   bash scripts/archive-source-switch.sh --target staging
#   bash scripts/archive-source-switch.sh --target production --dry-run
#   bash scripts/archive-source-switch.sh --target production
#
# Flags:
#   --target staging|production   the environment; required, no default
#   --dry-run                     run every read and precondition, run the
#                                 backfill's own dry run on production, and
#                                 write nothing
#
# Test seams (CI only; operators never set these), each announced on stderr:
# FOOTBAG_AWS_BIN and FOOTBAG_TERRAFORM_BIN replace the AWS CLI and Terraform,
# and ARCHIVE_SOURCE_SWITCH_BACKFILL replaces the backfill script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# confirm_from_tty and require_target. Sourcing this also assigns ASSUME_YES,
# so nothing exported in the operator's shell can answer the prompt.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET=""
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "archive-source-switch: --target requires an argument" >&2; exit 2; } ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "archive-source-switch: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done
require_target "$TARGET" staging production || exit 2

AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
TF_BIN="${FOOTBAG_TERRAFORM_BIN:-terraform}"
BACKFILL="${ARCHIVE_SOURCE_SWITCH_BACKFILL:-${SCRIPT_DIR}/backfill-replication.sh}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
[[ -n "${FOOTBAG_TERRAFORM_BIN:-}" ]] && echo "NOTE: using a stand-in for Terraform; the identifiers this run uses are not the estate's." >&2
[[ -n "${ARCHIVE_SOURCE_SWITCH_BACKFILL:-}" ]] && echo "NOTE: using a stand-in for the backfill; this run proves nothing about the cold copy." >&2

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

# Both stacks keep the archive and its parameters in us-east-1.
REGION="us-east-1"
PARAM="/footbag/${TARGET}/archive-source"
COLD_BUCKET="footbag-${TARGET}-legacy-mirror-backup"

WORK_DIR="$(mktemp -d /tmp/footbag-archive-source-switch.XXXXXX)"
cr_cleanup rm -rf "${WORK_DIR}"

last_line() { grep -v '^[[:space:]]*$' "$1" | tail -n 1 || [[ $? == 1 ]]; }

# ── 1. Who is asking ──────────────────────────────────────────────────────

# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
aws_profile_ensure || cr_die "could not settle the AWS identity this run acts as. Nothing changed."
# shellcheck source=lib/aws-identity.sh
source "${SCRIPT_DIR}/lib/aws-identity.sh"
aws_identity_require_direct_user footbag-operator \
  || cr_die "the switch is made as the directly authenticated footbag-operator IAM user only. Nothing changed."
echo "Acting as ${AWS_IDENTITY_ARN}"

# ── 2. Where the archive's source stands ──────────────────────────────────

# read_source: sets SOURCE_VALUE. A parameter that does not exist, or a read
# that failed, ends the run with AWS's own message. Called in this shell, never
# in a command substitution, so a refusal lands in this run's closing report.
SOURCE_VALUE=""
read_source() {
  local said
  if SOURCE_VALUE="$("$AWS_BIN" ssm get-parameter --name "$PARAM" --region "$REGION" \
      --query Parameter.Value --output text 2> "${WORK_DIR}/get.err")"; then
    return 0
  fi
  said="$(last_line "${WORK_DIR}/get.err")"
  if [[ "$said" == *"(ParameterNotFound)"* ]]; then
    echo "The archive stack declares ${PARAM}; apply terraform/${TARGET} so it exists." >&2
    cr_die "${PARAM} does not exist, so the archive stack is not as expected. Nothing changed."
  fi
  cr_die "could not read ${PARAM}: ${said:-aws printed no message}. Nothing changed."
}

read_source
CURRENT="$SOURCE_VALUE"
echo "${PARAM} reads '${CURRENT}'"
if [[ "$CURRENT" == "bucket" ]]; then
  echo "The ${TARGET} archive bucket is already the source of truth; nothing to do."
  cr_proved "${PARAM} reads 'bucket': the publish refuses and the bucket is the archive's source (already switched)"
  cr_finish
fi
if [[ "$CURRENT" != "crawl" ]]; then
  cr_die "${PARAM} reads '${CURRENT}', which is neither 'crawl' nor 'bucket'. Find out what wrote it before switching. Nothing changed."
fi

# ── 3. Production: the rule that keeps every edit recoverable ─────────────

if [[ "$TARGET" == "production" ]]; then
  ARCHIVE_BUCKET="$("$TF_BIN" -chdir="terraform/${TARGET}" output -raw archive_bucket_name </dev/null 2> "${WORK_DIR}/tf.err")" \
    || ARCHIVE_BUCKET=""
  if [[ -z "$ARCHIVE_BUCKET" ]]; then
    cr_die "terraform/${TARGET} output archive_bucket_name is empty: $(last_line "${WORK_DIR}/tf.err"). Apply the archive stack first. Nothing changed."
  fi

  GATE="apply terraform/${TARGET} with the archive cold-copy replication rule"
  if ! replication="$("$AWS_BIN" s3api get-bucket-replication --bucket "$ARCHIVE_BUCKET" \
      --region "$REGION" --output json 2> "${WORK_DIR}/repl.err")"; then
    said="$(last_line "${WORK_DIR}/repl.err")"
    if [[ "$said" == *"(ReplicationConfigurationNotFoundError)"* ]]; then
      cr_die "${ARCHIVE_BUCKET} has no replication configuration, so no rule copies it to ${COLD_BUCKET}; ${GATE}. Nothing changed."
    fi
    cr_die "could not read ${ARCHIVE_BUCKET}'s replication configuration: ${said:-aws printed no message}. Nothing changed."
  fi
  # One enabled rule over the whole bucket that writes into Deep Archive in the
  # cold copy and never carries a delete. A rule with a prefix would leave part
  # of the archive uncovered; one carrying delete markers would let a deletion
  # in the bucket hide the cold copy's object too.
  if ! jq -e --arg dest "arn:aws:s3:::${COLD_BUCKET}" '
      [.ReplicationConfiguration.Rules[]?
        | select(.Status == "Enabled")
        | select(.Destination.Bucket == $dest)
        | select(.Destination.StorageClass == "DEEP_ARCHIVE")
        | select(.DeleteMarkerReplication.Status == "Disabled")
        | select(((.Filter // {}) == {}) or ((.Filter.Prefix // "") == "" and (.Filter | keys) == ["Prefix"]))
      ] | length > 0' <<<"$replication" >/dev/null; then
    cr_die "${ARCHIVE_BUCKET} has no enabled whole-bucket rule replicating to ${COLD_BUCKET} in DEEP_ARCHIVE with delete-marker replication Disabled; ${GATE}. Nothing changed."
  fi
  echo "Replication: ${ARCHIVE_BUCKET} -> ${COLD_BUCKET} (DEEP_ARCHIVE, deletes not carried)"
  cr_proved "${ARCHIVE_BUCKET} replicates every write, and no delete, to ${COLD_BUCKET} in DEEP_ARCHIVE"
fi

# ── 4. State the change and confirm ───────────────────────────────────────

echo ""
echo "This makes the ${TARGET} archive bucket the archive's source of truth:"
if [[ "$TARGET" == "production" ]]; then
  echo "  first    copies every object ${ARCHIVE_BUCKET} already holds into"
  echo "           ${COLD_BUCKET} by S3 Batch Replication (it asks its own APPLY)"
else
  echo "  skipped  the cold-copy backfill: staging has no cold copy"
fi
echo "  then     writes 'bucket' to ${PARAM}"
echo "From then on scripts/publish-archive.sh refuses on ${TARGET} and the archive"
echo "changes only through scripts/archive-edit.sh. This script never switches back."
echo ""

if (( DRY_RUN )); then
  if [[ "$TARGET" == "production" ]]; then
    bash "$BACKFILL" --target "$TARGET" --source archive-cold-copy --dry-run \
      || cr_die "the backfill's dry run refused (its message is above). Nothing changed."
    cr_proved "the backfill's preconditions hold (its dry run)"
  fi
  echo "Dry run: every precondition holds; nothing changed."
  cr_unproved "the switch itself (dry run): ${PARAM} still reads 'crawl'"
  cr_finish
fi

confirm_from_tty "Type 'APPLY' to continue: " "APPLY" || cr_die "Not confirmed. Nothing changed."

# ── 5. Production: the archive as it stood, into the cold copy ────────────

if [[ "$TARGET" == "production" ]]; then
  # Run directly, not through cr_run: it asks its own APPLY at the terminal.
  if ! bash "$BACKFILL" --target "$TARGET" --source archive-cold-copy; then
    cr_die "the backfill into ${COLD_BUCKET} did not prove its copy (its message is above). ${PARAM} still reads 'crawl'; re-run this script once it is resolved."
  fi
  cr_proved "the objects the archive held before its cold-copy rule are in ${COLD_BUCKET} (the backfill's sample)"
else
  echo "Skipping the cold-copy backfill: staging has no cold copy."
  cr_unproved "a cold copy of the staging archive: staging has none by design"
fi

# ── 6. Switch, and prove it ───────────────────────────────────────────────

if ! "$AWS_BIN" ssm put-parameter --name "$PARAM" --value bucket --type String --tier Standard \
    --overwrite --region "$REGION" > /dev/null 2> "${WORK_DIR}/put.err"; then
  cr_die "could not write ${PARAM}: $(last_line "${WORK_DIR}/put.err"). It still reads 'crawl'."
fi
# Read back rather than trusting the write: the publish reads this parameter,
# and a switch that did not take leaves the publish free to overwrite edits.
read_source
AFTER="$SOURCE_VALUE"
if [[ "$AFTER" != "bucket" ]]; then
  cr_die "${PARAM} reads '${AFTER}' after the write, not 'bucket'. Investigate before any edit or publish."
fi
echo "${PARAM} now reads 'bucket'."
cr_proved "${PARAM} reads 'bucket' (read back): the publish refuses and the bucket is the archive's source"
cr_finish
