#!/usr/bin/env bash
# bootstrap-shared-state.sh
#
# Creates the Terraform state bucket for a brand-new AWS account and moves the
# shared tree's state into it: the one Terraform change that cannot go through
# scripts/terraform-apply.sh, because the backend it would initialize against is
# the bucket this run creates.
#
# WHY THIS EXISTS.
#
# terraform/shared creates the S3 bucket its own state lives in, so a fresh
# account needs two steps: apply once with the backend removed, state kept
# locally, to create the bucket; then restore the backend and migrate the state
# into it. Those steps lived only in a comment in terraform/shared/backend.tf,
# and the moment they are needed is an account rebuild after a disaster or a
# handover, which is exactly when nobody should be improvising Terraform.
#
# WHAT IT DOES.
#
#   1. Reads the bucket, key and region from terraform/shared/backend.tf, the one
#      place they are written.
#   2. Proves the operator identity, then reads where the account stands:
#        state object present      -> already bootstrapped; reports it, changes
#                                     nothing
#        bucket present, no state,
#        local bootstrap state kept -> resumes at the migration
#        bucket present, no state,
#        no local bootstrap state   -> refuses: import the bucket instead
#        no bucket                  -> both steps
#   3. Stages the tree without its backend in a private work area outside the
#      repository, plans to a saved file, shows it, takes a typed APPLY, and
#      applies that exact plan.
#   4. Restores the backend there and migrates the state into the bucket.
#   5. Proves the state object is in the bucket, then removes the local copy.
#
# WHAT IT REFUSES TO DO.
#
#   - Keep state inside the repository. The work area is under your home
#     directory at mode 700, so no state file can be committed by accident.
#   - Remove the local state before the bucket is proven to hold it. Once the
#     bucket exists, that local file is the only record of what was created; a
#     stop part way keeps it, and running this again resumes at the migration.
#   - Create a bucket over one that exists without state. That is an import,
#     decided by a person, not a re-creation.
#
# Usage:
#   bash scripts/bootstrap-shared-state.sh
#   bash scripts/bootstrap-shared-state.sh --check
#
# Flags:
#   --check   Report where the account stands and what would run; change nothing.
#             Exits 0 when already bootstrapped, 1 otherwise.
#   --yes     Accept the typed confirmation in advance.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

CHECK_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

# Test seams: stand-ins for terraform and the AWS CLI, and for where the work
# area lives. A run that uses one says so, because a stubbed run proves nothing
# about the account.
TF_BIN="${BOOTSTRAP_STATE_TF_BIN:-terraform}"
AWS_BIN="${BOOTSTRAP_STATE_AWS_BIN:-aws}"
WORK_ROOT="${BOOTSTRAP_STATE_WORK_ROOT:-${HOME}/.local/share/footbag/terraform-bootstrap}"
for seam in BOOTSTRAP_STATE_TF_BIN BOOTSTRAP_STATE_AWS_BIN BOOTSTRAP_STATE_WORK_ROOT; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam} is set -- this run proves nothing about the account." >&2
done

TREE="terraform/shared"
WORK="${WORK_ROOT}/shared"

backend_value() {
  grep -m1 -E "^[[:space:]]*$1[[:space:]]*=" "${TREE}/backend.tf" | sed -E 's/.*=[[:space:]]*"([^"]*)".*/\1/'
}
BUCKET="$(backend_value bucket)"
KEY="$(backend_value key)"
REGION="$(backend_value region)"
if [[ -z "$BUCKET" || -z "$KEY" || -z "$REGION" ]]; then
  echo "ERROR: could not read bucket, key and region from ${TREE}/backend.tf. Nothing changed." >&2
  exit 1
fi

aws_profile_ensure || exit 1

# Present, or absent, and nothing else. Only a 404 means absent: a 403 is an
# identity that may not look (another account, or a missing permission), and
# reading that as "no bucket" would send the run off to create one. Anything
# that is neither stops the run with AWS's own words.
s3_probe() {
  local what="$1" err
  shift
  if err="$("$AWS_BIN" s3api "$@" --region "$REGION" 2>&1 >/dev/null)"; then
    return 0
  fi
  if grep -qE '\((404|NoSuchKey|NoSuchBucket|NotFound)\)' <<< "$err"; then
    return 1
  fi
  echo "ERROR: could not tell whether ${what} exists; AWS answered:" >&2
  echo "       ${err}" >&2
  echo "       Check the identity printed above belongs to the account that owns the bucket. Nothing changed." >&2
  exit 1
}
state_in_bucket() { s3_probe "s3://${BUCKET}/${KEY}" head-object --bucket "$BUCKET" --key "$KEY"; }
bucket_exists() { s3_probe "s3://${BUCKET}" head-bucket --bucket "$BUCKET"; }
local_state_kept() { [[ -s "${WORK}/terraform.tfstate" ]]; }

echo "Shared Terraform state for s3://${BUCKET}/${KEY} (${REGION})"
if state_in_bucket; then
  echo "  Already bootstrapped: the state object is in the bucket. Nothing to do."
  local_state_kept && echo "  A local bootstrap copy remains at ${WORK}; it is superseded and safe to remove."
  exit 0
fi

APPLY_STEP=1
if bucket_exists; then
  if ! local_state_kept; then
    echo "REFUSING: the bucket exists but holds no state, and no local bootstrap state is kept at ${WORK}." >&2
    echo "         Re-creating it is not the fix; import the bucket and its settings into the shared" >&2
    echo "         tree's state instead. Nothing changed." >&2
    exit 1
  fi
  APPLY_STEP=0
  echo "  The bucket exists and the local bootstrap state is kept: resuming at the migration."
else
  echo "  No bucket yet: apply the shared tree on local state, then migrate the state into the bucket."
fi

if (( CHECK_ONLY )); then
  exit 1
fi

VAR_ARGS=(-var-file="${REPO_ROOT}/${TREE}/terraform.tfvars")
[[ -e "${TREE}/secrets.auto.tfvars" ]] && VAR_ARGS+=(-var-file="${REPO_ROOT}/${TREE}/secrets.auto.tfvars")

# The work area holds state, so it is private, and it survives a stop part way
# on purpose. Only the saved plan is removed on every exit: it is a full copy of
# state and nothing needs it once applied or abandoned.
mkdir -p -m 700 "$WORK"
chmod 700 "$WORK"
PLAN_FILE="${WORK}/bootstrap.plan"
trap 'shred -u "$PLAN_FILE" 2>/dev/null || rm -f "$PLAN_FILE"' EXIT INT TERM

# The tree without its backend, plus the provider lock so the providers are the
# ones every other run uses. Copied fresh each run so a resume uses current code.
find "$WORK" -maxdepth 1 -name '*.tf' -delete
for f in "${TREE}"/*.tf; do
  [[ "$(basename "$f")" == "backend.tf" ]] && continue
  cp "$f" "${WORK}/"
done
[[ -f "${TREE}/.terraform.lock.hcl" ]] && cp "${TREE}/.terraform.lock.hcl" "${WORK}/"

if (( APPLY_STEP )); then
  echo "==> terraform init (local state)"
  "$TF_BIN" -chdir="$WORK" init -input=false
  echo "==> terraform plan"
  "$TF_BIN" -chdir="$WORK" plan -input=false -out="$PLAN_FILE" "${VAR_ARGS[@]}"
  if ! confirm_from_tty "Type 'APPLY' to create the shared resources shown above on local state: " "APPLY"; then
    echo "Not confirmed; nothing has been applied." >&2
    exit 1
  fi
  "$TF_BIN" -chdir="$WORK" apply -input=false "$PLAN_FILE"
  if ! bucket_exists; then
    echo "ERROR: the apply finished but s3://${BUCKET} does not answer. The local state is kept at ${WORK};" >&2
    echo "       check the apply output, then run this again." >&2
    exit 1
  fi
fi

echo "==> Moving the state into s3://${BUCKET}/${KEY}"
cp "${TREE}/backend.tf" "${WORK}/"
"$TF_BIN" -chdir="$WORK" init -input=false -migrate-state -force-copy

# Proved, not assumed: only once the bucket holds the object is the local copy
# removed, and with it the work area.
if ! state_in_bucket; then
  echo "ERROR: the migration finished but the state object is not in the bucket. The local state is" >&2
  echo "       kept at ${WORK}; run this again to retry the migration." >&2
  exit 1
fi
rm -rf "$WORK"
echo "Bootstrapped: the shared state is in s3://${BUCKET}/${KEY}. Continue with scripts/terraform-apply.sh --target shared --init."
