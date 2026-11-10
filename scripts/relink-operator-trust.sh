#!/usr/bin/env bash
# relink-operator-trust.sh -- after the IAM user footbag-operator has been
# re-created, make both runtime roles trust the new user, and prove it.
#
# WHY THIS EXISTS.
#
# footbag-operator is the one identity not declared in code: it is created by
# hand from the root sign-in, by design, because it is what applies everything
# else. Both runtime roles (footbag-staging-app-runtime and
# footbag-production-app-runtime) trust that user by its literal ARN. When a
# trusted user is deleted, AWS stores the trust with the user's unique
# principal ID in place of the ARN, so a user re-created under the same name is
# a different principal and both trusts go on refusing every AssumeRole from
# it. GetRole returns that principal ID and the Terraform provider reads it, so
# a plain plan of the tree shows an in-place update of the role's
# assume_role_policy back to the ARN, and applying it binds the trust to the new
# user without re-creating the role.
#
# For each runtime tree whose role's live trust no longer names footbag-operator,
# staging first, this:
#   1. plans the tree read-only and requires that plan to show an in-place
#      update of aws_iam_role.app_runtime's assume_role_policy and nothing that
#      deletes or replaces any resource; otherwise it refuses with the reason;
#   2. runs the plain scripts/terraform-apply.sh --target <tree>, through that
#      script's saved plan (the production apply asks for its own typed APPLY);
#   3. reads the trust back.
# Only when the trust is still broken after the plain apply does it offer the
# fallback, scripts/terraform-apply.sh --target <tree> --replace
# aws_iam_role.app_runtime, which re-creates the role and re-saves everything
# that names it. That causes an outage: the host's application loses its AWS
# access until the apply finishes, so the fallback has its own warning and its
# own typed APPLY, which --yes does not answer. The run ends with
# scripts/verify-account-baseline.sh, which checks both trusts and the rest of
# the account baseline.
#
# The identity tree needs nothing: it names footbag-operator only as the
# resource of a denial, and a resource ARN is matched by name, not bound to an
# id.
#
# WHY NO --target.
#
# The subject is the account's one operator user, which both runtime trees
# trust. Repairing one tree leaves the other broken and the baseline failing,
# so a run covers both, and skips a tree whose trust is already right.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated footbag-operator, the new
#     user this exists to reconnect, and the one identity that may change a
#     role's trust.
#   - Apply a tree whose role's trust already names footbag-operator.
#   - Treat a trust it could not read as either broken or fine.
#   - Apply a tree whose read-only plan does not show the in-place trust
#     update, or shows any resource deleted or replaced.
#   - Proceed without the typed APPLY, unless --yes is given. The production
#     apply asks for its own typed APPLY regardless, every time, and the
#     replacement fallback always asks for its own.
#
# Usage:
#   bash scripts/relink-operator-trust.sh --dry-run
#   bash scripts/relink-operator-trust.sh
#
# Flags:
#   --dry-run    read both trusts, plan each broken tree read-only and check the
#                plan, and say what would be applied; change nothing.
#   --yes        accept this script's first confirmation in advance. It does
#                not answer the production apply's own confirmation, nor the
#                replacement fallback's.
#   -h, --help   this text.
#
# Exit: 0 both trusts name footbag-operator and the baseline passes, 1 refused
# or unproven, 2 usage error.
#
# Test seams (CI only; operators never set these), each announced on stderr:
#   RELINK_TRUST_AWS_BIN        replaces the aws CLI for the trust reads
#   RELINK_TRUST_TF_BIN         replaces terraform for the read-only plan
#   RELINK_TRUST_APPLY_CMD      replaces scripts/terraform-apply.sh
#   RELINK_TRUST_BASELINE_CMD   replaces scripts/verify-account-baseline.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

DRY_RUN=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

AWS_BIN="${RELINK_TRUST_AWS_BIN:-aws}"
TF_BIN="${RELINK_TRUST_TF_BIN:-terraform}"
APPLY_CMD="${RELINK_TRUST_APPLY_CMD:-${SCRIPT_DIR}/terraform-apply.sh}"
BASELINE_CMD="${RELINK_TRUST_BASELINE_CMD:-${SCRIPT_DIR}/verify-account-baseline.sh}"
[[ -n "${RELINK_TRUST_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
[[ -n "${RELINK_TRUST_TF_BIN:-}" ]] && echo "NOTE: using a stand-in for terraform; the plan checked is not the tree's." >&2
[[ -n "${RELINK_TRUST_APPLY_CMD:-}" ]] && echo "NOTE: using a stand-in for the apply; no trust was changed." >&2
[[ -n "${RELINK_TRUST_BASELINE_CMD:-}" ]] && echo "NOTE: using a stand-in for the account baseline check; the account was not checked." >&2

# The identity that may change the roles, named as a literal rather than read
# from the profile: a check that takes the name from where the credential came
# from is not a check.
FOOTBAG_OPERATOR_USER="footbag-operator"
# The runtime trees, staging first, so an apply that goes wrong goes wrong
# where the data is meant to be thrown away. Each declares the role at this
# address under the name footbag-<tree>-app-runtime.
TREES=(staging production)
TRUST_ADDRESS="aws_iam_role.app_runtime"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/footbag-relink-trust.XXXXXX")"
chmod 700 "$WORK_DIR"
cr_cleanup rm -rf "$WORK_DIR"

aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Re-saving the runtime trusts changes two IAM roles, which only the directly authenticated footbag-operator may do." \
  || cr_die "the footbag-operator profile could not be used. Nothing was changed."
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" \
  || cr_die "this run is not authenticated as ${FOOTBAG_OPERATOR_USER}. Nothing was changed."

# trust_state <role>: prints "linked" when the live trust names the user,
# "broken" when it does not, and fails when the trust cannot be read.
trust_state() {
  local role="$1" doc
  doc="$("$AWS_BIN" iam get-role --role-name "$role" \
    --query 'Role.AssumeRolePolicyDocument' --output json 2> "${WORK_DIR}/get-role.err")" || return 1
  [[ -n "$doc" ]] || return 1
  # The ARN's end, closing quote included, so a user whose name merely starts
  # with this one (footbag-operator-old) is not taken for it.
  if grep -qF ":user/${FOOTBAG_OPERATOR_USER}\"" <<< "$doc"; then
    echo linked
  else
    echo broken
  fi
}

# check_plan <tree>: plans the tree read-only and refuses unless the plan
# updates the role's assume_role_policy in place and deletes or replaces
# nothing. The saved plan holds a full copy of state, so it lives in the
# private work area and is shredded as soon as it has been read.
check_plan() {
  local tree="$1" plan json role_update destructive
  plan="${WORK_DIR}/plan-${tree}.tfplan"
  if ! (umask 077; "$TF_BIN" -chdir="${REPO_ROOT}/terraform/${tree}" plan -lock=false -input=false \
        -out="$plan" </dev/null >"${WORK_DIR}/plan-${tree}.out" 2>&1); then
    cr_die "the read-only plan of ${tree} failed: $(tail -n 1 "${WORK_DIR}/plan-${tree}.out"). Nothing was changed."
  fi
  if ! json="$("$TF_BIN" -chdir="${REPO_ROOT}/terraform/${tree}" show -json "$plan" </dev/null 2>"${WORK_DIR}/show.err")"; then
    shred -u "$plan" || rm -f "$plan"
    cr_die "could not read the ${tree} plan: $(tail -n 1 "${WORK_DIR}/show.err"). Nothing was changed."
  fi
  shred -u "$plan" || rm -f "$plan"
  if ! role_update="$(jq -r --arg a "$TRUST_ADDRESS" '
        any(.resource_changes[]?; .address == $a and .change.actions == ["update"]
            and (.change.before.assume_role_policy != .change.after.assume_role_policy))
      ' <<<"$json")" \
     || ! destructive="$(jq -r '
        [.resource_changes[]? | select(.change.actions | index("delete")) | .address] | join(", ")
      ' <<<"$json")"; then
    cr_die "could not read the ${tree} plan as JSON. Nothing was changed."
  fi
  if [[ -n "$destructive" ]]; then
    cr_die "the ${tree} plan deletes or replaces ${destructive}; this run applies only the in-place trust update. Apply or resolve that with scripts/terraform-apply.sh --target ${tree} first. Nothing was changed."
  fi
  if [[ "$role_update" != "true" ]]; then
    cr_die "the ${tree} plan shows no in-place update of ${TRUST_ADDRESS}'s assume_role_policy, so a plain apply would not re-save the broken trust. Read the plan with scripts/terraform-apply.sh --target ${tree}. Nothing was changed."
  fi
  echo "    ${tree}: the plan updates ${TRUST_ADDRESS}'s assume_role_policy in place and deletes nothing."
}

BROKEN=()
echo "-- runtime trusts --"
for tree in "${TREES[@]}"; do
  role="footbag-${tree}-app-runtime"
  state="$(trust_state "$role")" \
    || cr_die "could not read the trust policy of ${role}: $(tail -n 1 "${WORK_DIR}/get-role.err"). Nothing was changed."
  if [[ "$state" == linked ]]; then
    echo "    ${role}: trusts ${FOOTBAG_OPERATOR_USER}"
    cr_proved "${role} already trusts ${FOOTBAG_OPERATOR_USER}, so it was left alone"
  else
    echo "    ${role}: no longer names ${FOOTBAG_OPERATOR_USER}"
    BROKEN+=("$tree")
  fi
done

if (( ${#BROKEN[@]} > 0 )); then
  echo "-- read-only plans --"
  for tree in "${BROKEN[@]}"; do
    check_plan "$tree"
  done
fi

if (( DRY_RUN )); then
  for tree in "${BROKEN[@]+"${BROKEN[@]}"}"; do
    echo "Would run: bash scripts/terraform-apply.sh --target ${tree}"
    echo "  and, only if the trust is still broken after it, offer the replacement of ${TRUST_ADDRESS} behind its own APPLY."
  done
  echo "Would then run: bash scripts/verify-account-baseline.sh"
  cr_unproved "the trusts: a dry run, so nothing was applied"
  cr_finish
fi

if (( ${#BROKEN[@]} > 0 )); then
  echo ""
  echo "About to apply terraform/<tree> in: ${BROKEN[*]}."
  echo "Each apply updates footbag-<tree>-app-runtime's trust in place, so it binds to the"
  echo "current ${FOOTBAG_OPERATOR_USER}; the role is not re-created. The plan is shown"
  echo "before each apply, and the production apply asks for its own APPLY."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the trust updates: " "APPLY"; then
    echo "Not confirmed; nothing was changed." >&2
    cr_unproved "the trusts: not confirmed, and nothing was changed"
    cr_finish_with 1 ABORTED
  fi
fi

# replace_role <tree>: the fallback, for a trust a plain apply left broken.
# Re-creating the role is an outage on that host, so it is confirmed on its
# own, at the terminal, whatever --yes said.
replace_role() {
  local tree="$1" role="footbag-${tree}-app-runtime"
  echo ""
  echo "WARNING: ${role}'s trust is still broken after the plain apply."
  echo "The fallback replaces ${TRUST_ADDRESS} in ${tree}: the role is destroyed and"
  echo "re-created, and everything that names it is re-saved. This is an OUTAGE: the"
  echo "${tree} host's application loses its AWS access until the apply finishes."
  echo ""
  ASSUME_YES=""
  if ! confirm_from_tty "Type 'APPLY' to replace ${role}: " "APPLY"; then
    cr_die "the replacement of ${role} was not confirmed, so its trust is still broken. Nothing more was changed."
  fi
  echo "==> Replacing ${TRUST_ADDRESS} in ${tree}"
  if ! bash "$APPLY_CMD" --target "$tree" --replace "$TRUST_ADDRESS"; then
    cr_die "the ${tree} replacement did not complete, so ${role} is as that apply left it. Re-run this to finish."
  fi
  state="$(trust_state "$role")" \
    || cr_die "the ${tree} replacement finished, but the trust policy of ${role} could not be read back: $(tail -n 1 "${WORK_DIR}/get-role.err")"
  [[ "$state" == linked ]] \
    || cr_die "the ${tree} replacement finished, but ${role} still does not name ${FOOTBAG_OPERATOR_USER} in its trust policy."
  cr_proved "${role} was replaced and its trust now names ${FOOTBAG_OPERATOR_USER}"
}

# Run directly rather than inside cr_run: the apply shows its plan and, on
# production, reads its typed word from the terminal. It is on the closing-report
# library, so its own problems reach this report.
for tree in "${BROKEN[@]+"${BROKEN[@]}"}"; do
  role="footbag-${tree}-app-runtime"
  echo "==> Applying ${tree}"
  if ! bash "$APPLY_CMD" --target "$tree"; then
    cr_die "the ${tree} apply did not complete, so ${role} is as that apply left it. Re-run this to finish: it applies only a tree whose trust is still broken."
  fi
  state="$(trust_state "$role")" \
    || cr_die "the ${tree} apply finished, but the trust policy of ${role} could not be read back: $(tail -n 1 "${WORK_DIR}/get-role.err")"
  if [[ "$state" == linked ]]; then
    cr_proved "${role}'s trust was updated in place and now names ${FOOTBAG_OPERATOR_USER}"
  else
    replace_role "$tree"
  fi
done

echo "==> Checking the account baseline"
if bash "$BASELINE_CMD"; then
  cr_proved "the account baseline passes, both runtime trusts included"
else
  cr_error "the account baseline reports a finding; read it above. The runtime trusts were re-saved where they were broken."
fi
cr_finish
