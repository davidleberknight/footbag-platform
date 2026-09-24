#!/usr/bin/env bash
# verify-operator-role-denials.sh
#
# Proves, against the live account, that the shared human-operator job role is
# denied the things it is meant to be denied. Reads only; changes nothing.
#
# WHY THIS EXISTS.
#
# The job role's policy denies the whole lifecycle of a human operator, every
# write to its own definition, every write to the directly authenticated
# identity, every mutation of a production edge surface, and the certificate
# that opens a root shell on any host. Those denials are
# what make the lifecycle script's refusal more than a convention: an operator
# who bypasses the wrapper and calls IAM directly is refused by AWS rather than
# by a script they chose not to run.
#
# WHAT IT CHECKS, in order:
#
#    1. the whole lifecycle of a human operator, and their second factor;
#    2. the role's own definition, which it may read and not rewrite;
#    3. the directly authenticated IAM user footbag-operator;
#    4. the production edge surface, denied on a production tag and allowed on
#       a staging one;
#    5. the host-access certificate, on staging and production alike;
#   5b. the firewall and delete calls on a host not tagged staging, and their
#       survival on staging;
#    6. the Terraform state boundary: only staging's state is readable;
#    7. attaching, detaching and releasing a static IP, never granted;
#    8. the account's own controls: organisation, account and region closure,
#       payments, and the trail;
#    9. the runtime role it may assume, which it may read and not rewrite;
#   10. a key alias on a production-tagged or untagged key;
#   11. a production edge function, by name;
#   12. passing a role to budgets.
#
# Until this script existed, proving that meant an operator composing an
# `aws iam simulate-principal-policy` invocation at the keyboard, from the
# statement set in the Terraform, in the middle of a walkthrough. A check
# somebody has to assemble under pressure is a check that gets assembled wrong
# or skipped, and the design's position is that a script owns the whole
# operation rather than the interesting step in the middle of it.
#
# WHY THE SIMULATOR RATHER THAN A REAL ATTEMPT.
#
# Because the thing being proved is a refusal. Proving it by attempting it would
# mean really trying to create an operator, really trying to rewrite the role,
# really trying to delete the production distribution, and the successful case
# is the catastrophe. The simulator answers the same question with no call
# reaching the resource.
#
# WHY IT READS THE TERRAFORM.
#
# The action lists come out of the HCL rather than out of a copy kept here, so
# an action added to a denial is covered the next time this runs and a list that
# quietly shrinks is caught. A second copy of the list in this file would be one
# more thing to keep in step, and the failure mode of that is silence.
#
# WHAT IT DELIBERATELY DOES NOT DO.
#
#   - Change anything. Every call is a simulation or a read.
#   - Apply anything, or tell the operator to. It reports.
#   - Treat implicitDeny as a pass. A refusal that happens because nothing
#     grants the action is not the same fact as a refusal the policy states, and
#     the first one evaporates the day somebody widens a grant. It is reported
#     separately, as a weaker result than the one intended.
#   - Enumerate the inverted denials. Two statements are NotAction-shaped
#     ("everything except reads"), which has no list to read; those are probed
#     with a fixed representative set of writes, and the report says so rather
#     than implying the coverage is exhaustive.
#
# Usage:
#   bash scripts/verify-operator-role-denials.sh [--profile <p>] [--quiet]
#
# Flags:
#   --profile <p>    AWS profile; else the identity this run settles and proves.
#   --operator <n>   Name to use for the operator ARN the lifecycle denials are
#                    simulated against. It need not exist: the denial matches on
#                    the IAM path, so any name under that path answers the
#                    question. Defaults to a placeholder.
#   --quiet          Only print failures.
#
# Exit: 0 everything denied as intended, 1 one or more findings, 2 usage error.
#
# Test seam (CI only; operators never set this): VERIFY_ROLE_DENIALS_AWS_BIN
# replaces the aws CLI. A run using it says so, because this script exists to be
# evidence and stubbed evidence is worth nothing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROLE_TF="${REPO_ROOT}/terraform/identity/human-operator-role.tf"

# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

AWS_BIN="${VERIFY_ROLE_DENIALS_AWS_BIN:-aws}"
ROLE_NAME="$FOOTBAG_DEV_TESTER_ROLE"
FOOTBAG_OPERATOR_USER="footbag-operator"
# Spelled exactly as every other definition of it in the tree, slashes included,
# so two variables of one name cannot hold two different values.
OPERATOR_PATH="/footbag-operators/"
OPERATOR_NAME="an-operator"
QUIET=0
PROFILE=""
declare -a AWS_ARGS=()

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while (( $# )); do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --operator)
      OPERATOR_NAME="${2:-}"
      shift 2 || { echo "ERROR: --operator requires an argument" >&2; exit 2; }
      ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

if [[ -n "$PROFILE" ]]; then
  AWS_ARGS+=(--profile "$PROFILE")
else
  aws_profile_ensure || exit 1
fi

if [[ "$AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
fi

[[ -r "$ROLE_TF" ]] || {
  echo "ERROR: cannot read ${ROLE_TF}, which is where the denied actions are declared." >&2
  echo "       Without it this run would be checking a list it made up." >&2
  exit 1
}

FINDINGS=0
WEAK=0
pass() { (( QUIET )) || printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; FINDINGS=$(( FINDINGS + 1 )); }
weak() { printf '  WEAK  %s\n' "$1" >&2; WEAK=$(( WEAK + 1 )); }
note() { (( QUIET )) || printf '        %s\n' "$1"; }

aws_q() { "$AWS_BIN" "$@" ${AWS_ARGS[@]+"${AWS_ARGS[@]}"} 2>/dev/null; }

# ── Reading the denied actions out of the Terraform ──────────────────────────

# One statement's text, from its Sid to the brace closing it at statement
# indentation. Reading a statement whole rather than grepping the file keeps an
# action from one statement answering for another.
statement_block() {
  sed -n "/Sid[[:space:]]*= \"$1\"/,/^    }/p" "$ROLE_TF"
}

# Every action a statement lists, one per line. Bounded to the Action list
# rather than the whole statement, so the Resource ARNs below it, which also
# contain colons, cannot arrive as actions. Anchored so that asking for Action
# does not match NotAction.
statement_actions() {
  statement_block "$1" \
    | sed -n "/^[[:space:]]*${2:-Action}[[:space:]]*=/,/]/p" \
    | grep -oE '"[a-zA-Z0-9-]+:[A-Za-z0-9*]+"' \
    | tr -d '"'
}

# ── The identity this run acts on the strength of ────────────────────────────

ACCOUNT_ID="$(aws_q sts get-caller-identity --query Account --output text || true)"
if [[ -z "$ACCOUNT_ID" || "$ACCOUNT_ID" == "None" ]]; then
  echo "ERROR: could not resolve an identity, so nothing below could be read." >&2
  echo "       Check the profile and that its key still authenticates." >&2
  exit 1
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
OPERATOR_ARN="arn:aws:iam::${ACCOUNT_ID}:user${OPERATOR_PATH}${OPERATOR_NAME}"
MFA_ARN="arn:aws:iam::${ACCOUNT_ID}:mfa/${OPERATOR_NAME}"
FOOTBAG_OPERATOR_ARN="arn:aws:iam::${ACCOUNT_ID}:user/${FOOTBAG_OPERATOR_USER}"

if ! aws_q iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "There is no ${ROLE_NAME} role in account ${ACCOUNT_ID}, so there are no" >&2
  echo "denials to prove yet. The account-level identity tree has not been" >&2
  echo "applied. Apply it first, as the directly authenticated identity:" >&2
  echo "  bash scripts/terraform-apply.sh --target identity --init" >&2
  echo "Nothing checked." >&2
  exit 1
fi

echo "Operator job role denials for ${ROLE_NAME} in account ${ACCOUNT_ID}"
echo ""

# ── The simulation ───────────────────────────────────────────────────────────

# Simulates every action given on stdin against one resource, and judges each
# decision. `explicitDeny` is the intended answer: the policy says no.
# `implicitDeny` means nothing granted it and nothing denied it either, which is
# a weaker fact that a later widening would silently remove. `allowed` is a
# finding. A caller that needs request context for a conditioned denial sets
# SIM_CONTEXT for the one call and clears it after.
SIM_CONTEXT=()
simulate_denied() {
  local label="$1" resource="$2" ; shift 2
  local -a actions=( "$@" )
  (( ${#actions[@]} )) || { fail "${label}: no actions were read out of the Terraform"; return; }

  local results decision action
  results="$(aws_q iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "${actions[@]}" \
    --resource-arns "$resource" \
    ${SIM_CONTEXT[@]+"${SIM_CONTEXT[@]}"} \
    --query 'EvaluationResults[].[EvalActionName,EvalDecision]' \
    --output text || true)"

  if [[ -z "$results" ]]; then
    fail "${label}: the simulator returned nothing, so the denial is unproven"
    return
  fi

  local explicit=0 implicit=0
  while read -r action decision; do
    [[ -n "$action" ]] || continue
    case "$decision" in
      explicitDeny) explicit=$(( explicit + 1 )) ;;
      implicitDeny)
        implicit=$(( implicit + 1 ))
        weak "${label}: ${action} is implicitDeny, not explicitDeny"
        ;;
      *) fail "${label}: ${action} came back ${decision}" ;;
    esac
  done <<< "$results"

  (( explicit )) && pass "${label}: ${explicit} action(s) explicitly denied"
  (( implicit )) && note "an implicit deny is nothing granting it, not the policy refusing it"
  return 0
}

# Simulates one action expecting it to be ALLOWED. The denials above are only
# half the contract: a denial that also catches the staging case is a broken
# role rather than a safe one, and that failure shows up as an operator unable
# to work rather than as a security event.
simulate_allowed() {
  local label="$1" action="$2" resource="$3" ; shift 3
  local decision
  decision="$(aws_q iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "$action" \
    --resource-arns "$resource" \
    "$@" \
    --query 'EvaluationResults[0].EvalDecision' --output text || true)"
  if [[ "$decision" == "allowed" ]]; then
    pass "${label}: ${action} is allowed, as it must be"
  else
    fail "${label}: ${action} came back ${decision:-nothing}, so the role cannot do its job"
  fi
}

# ── 1. The whole lifecycle of a human operator ───────────────────────────────

echo "Operator lifecycle"
mapfile -t LIFECYCLE < <(statement_actions NeverAdministerAHumanOperator)
LIFECYCLE_COUNT=${#LIFECYCLE[@]}
note "${LIFECYCLE_COUNT} action(s) drawn from NeverAdministerAHumanOperator"
simulate_denied "lifecycle on the operator path" "$OPERATOR_ARN" "${LIFECYCLE[@]}"

# The same statement names the MFA ARNs as well, and a device is not a user, so
# the second resource is checked rather than assumed to follow from the first.
mapfile -t MFA_ACTIONS < <(printf '%s\n' "${LIFECYCLE[@]}" | grep -E 'MFADevice$' || true)
if (( ${#MFA_ACTIONS[@]} )); then
  simulate_denied "second factor" "$MFA_ARN" "${MFA_ACTIONS[@]}"
fi

# ── 2. The role's own definition ─────────────────────────────────────────────

echo ""
echo "Its own definition"
note "NotAction-shaped, so this set is representative rather than exhaustive"
simulate_denied "rewriting the job role" "$ROLE_ARN" \
  iam:UpdateAssumeRolePolicy iam:PutRolePolicy iam:DeleteRolePolicy \
  iam:AttachRolePolicy iam:DetachRolePolicy iam:DeleteRole iam:TagRole

# A read has to survive, because a policy simulation against the role is how a
# grant is checked without exercising it, and this script is that simulation.
simulate_allowed "reading the job role" iam:GetRole "$ROLE_ARN"

# ── 3. The directly authenticated identity ───────────────────────────────────

echo ""
echo "The directly authenticated IAM user ${FOOTBAG_OPERATOR_USER}"
note "NotAction-shaped, so this set is representative rather than exhaustive"
simulate_denied "touching ${FOOTBAG_OPERATOR_USER}" "$FOOTBAG_OPERATOR_ARN" \
  iam:DeleteUser iam:UpdateUser iam:CreateAccessKey iam:DeleteAccessKey \
  iam:AttachUserPolicy iam:PutUserPolicy iam:DeactivateMFADevice

# ── 4. The production edge surface ───────────────────────────────────────────
#
# Both directions, because this denial is conditioned on a tag and the condition
# has a failure mode in each direction. Denied on a production tag is the
# control working; allowed on a staging tag is the guard working. A run that
# checked only the first would pass just as happily against a statement that
# denies the operator every CloudFront call there is.

echo ""
echo "The production edge surface"
PROD_TAG='ContextKeyName=aws:ResourceTag/Environment,ContextKeyValues=production,ContextKeyType=string'
STAGING_TAG='ContextKeyName=aws:ResourceTag/Environment,ContextKeyValues=staging,ContextKeyType=string'
mapfile -t EDGE < <(statement_actions NeverTouchAProductionEdgeSurface)

if (( ${#EDGE[@]} )); then
  EDGE_RESULTS="$(aws_q iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "${EDGE[@]}" \
    --resource-arns "*" \
    --context-entries "$PROD_TAG" \
    --query 'EvaluationResults[].[EvalActionName,EvalDecision]' \
    --output text || true)"
  if [[ -z "$EDGE_RESULTS" ]]; then
    fail "production edge: the simulator returned nothing, so the denial is unproven"
  else
    EDGE_DENIED=0
    while read -r action decision; do
      [[ -n "$action" ]] || continue
      if [[ "$decision" == "explicitDeny" ]]; then
        EDGE_DENIED=$(( EDGE_DENIED + 1 ))
      else
        fail "production edge: ${action} came back ${decision} on a production-tagged resource"
      fi
    done <<< "$EDGE_RESULTS"
    (( EDGE_DENIED )) && pass "production edge: ${EDGE_DENIED} action(s) denied on a production tag"
  fi

  simulate_allowed "staging edge" cloudfront:UpdateDistribution "*" \
    --context-entries "$STAGING_TAG"
  # Creation carries no resource to tag, so the guard has to let it through. If
  # this is ever denied, the Null guard has been dropped and every CloudFront
  # call in staging goes with it.
  simulate_allowed "staging edge" cloudfront:CreateDistribution "*"
else
  fail "production edge: no actions were read out of NeverTouchAProductionEdgeSurface"
fi

# ── 5. The host-access certificate ───────────────────────────────────────────
#
# Denied on every instance, so it is checked against a staging-tagged instance
# as well as a production one. The staging case is the one that matters: a
# denial conditioned on the tag would still pass the production check while
# handing every operator who can assume the job role a root shell on staging.

echo ""
echo "The host-access certificate"
mapfile -t HOST_ACCESS < <(statement_actions NeverMintHostAccessDetails)
if (( ${#HOST_ACCESS[@]} )); then
  for tag_env in staging production; do
    HOST_CTX="ContextKeyName=aws:ResourceTag/Environment,ContextKeyValues=${tag_env},ContextKeyType=string"
    HOST_RESULTS="$(aws_q iam simulate-principal-policy \
      --policy-source-arn "$ROLE_ARN" \
      --action-names "${HOST_ACCESS[@]}" \
      --resource-arns "*" \
      --context-entries "$HOST_CTX" \
      --query 'EvaluationResults[].[EvalActionName,EvalDecision]' \
      --output text || true)"
    if [[ -z "$HOST_RESULTS" ]]; then
      fail "host access (${tag_env}): the simulator returned nothing, so the denial is unproven"
      continue
    fi
    while read -r action decision; do
      [[ -n "$action" ]] || continue
      if [[ "$decision" == "explicitDeny" ]]; then
        pass "host access (${tag_env}): ${action} explicitly denied"
      else
        fail "host access (${tag_env}): ${action} came back ${decision}"
      fi
    done <<< "$HOST_RESULTS"
  done
else
  fail "host access: no actions were read out of NeverMintHostAccessDetails"
fi

# ── 5b. A host that is not staging ───────────────────────────────────────────
#
# The firewall and delete calls are granted for staging's own apply and denied
# on any instance not tagged staging, which is what keeps this role from
# reopening production's firewall or deleting the instance whose database is on
# local disk. Both directions are checked, as for the edge surface: denied on a
# production tag is the control, and allowed on a staging tag is the proof the
# denial does not also take staging's apply with it.

echo ""
echo "A host that is not staging"
mapfile -t NON_STAGING_HOST < <(statement_actions NeverReachANonStagingHost)
if (( ${#NON_STAGING_HOST[@]} )); then
  HOST_RESULTS="$(aws_q iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "${NON_STAGING_HOST[@]}" \
    --resource-arns "*" \
    --context-entries "$PROD_TAG" \
    --query 'EvaluationResults[].[EvalActionName,EvalDecision]' \
    --output text || true)"
  if [[ -z "$HOST_RESULTS" ]]; then
    fail "production host: the simulator returned nothing, so the denial is unproven"
  else
    while read -r action decision; do
      [[ -n "$action" ]] || continue
      if [[ "$decision" == "explicitDeny" ]]; then
        pass "production host: ${action} explicitly denied"
      else
        fail "production host: ${action} came back ${decision} on a production-tagged instance"
      fi
    done <<< "$HOST_RESULTS"
  fi
  for action in "${NON_STAGING_HOST[@]}"; do
    simulate_allowed "staging host" "$action" "*" --context-entries "$STAGING_TAG"
  done
else
  fail "host: no actions were read out of NeverReachANonStagingHost"
fi

# ── 6. The state boundary ────────────────────────────────────────────────────
#
# Not a denial statement: the role simply never grants these, and that absence
# is load-bearing enough to check. Its S3 object scope reaches the staging state
# key only, which is what stops an operator applying the shared, production or
# identity trees, and is why a walkthrough that expects those applies to succeed
# is expecting the wrong thing.

echo ""
echo "The terraform state boundary"
STATE_BUCKET="$(sed -n 's/.*bucket[[:space:]]*=[[:space:]]*"\(footbag-terraform-state-[^"]*\)".*/\1/p' \
  "${REPO_ROOT}/terraform/identity/backend.tf" | head -1)"
if [[ -z "$STATE_BUCKET" ]]; then
  fail "state boundary: could not read the state bucket name out of the identity backend"
else
  for tree in shared production identity; do
    decision="$(aws_q iam simulate-principal-policy \
      --policy-source-arn "$ROLE_ARN" \
      --action-names s3:GetObject \
      --resource-arns "arn:aws:s3:::${STATE_BUCKET}/${tree}/terraform.tfstate" \
      --query 'EvaluationResults[0].EvalDecision' --output text || true)"
    if [[ "$decision" == "allowed" ]]; then
      fail "state boundary: the role can read ${tree}/terraform.tfstate"
    else
      pass "state boundary: ${tree} state is out of reach (${decision})"
    fi
  done
  simulate_allowed "state boundary" s3:GetObject \
    "arn:aws:s3:::${STATE_BUCKET}/staging/terraform.tfstate"
fi

# ── 7. The static IP ─────────────────────────────────────────────────────────
#
# Also an absence rather than a denial statement. Detaching and releasing a
# static IP authorise against the static IP alone, which Lightsail cannot tag,
# and whether attaching can move an address already attached to another
# instance is not documented, so no condition could keep any of the three off
# production's address; withholding them is the whole control, and a grant
# creeping back would reach production at once.

echo ""
echo "The static IP"
for action in lightsail:AttachStaticIp lightsail:DetachStaticIp lightsail:ReleaseStaticIp; do
  decision="$(aws_q iam simulate-principal-policy \
    --policy-source-arn "$ROLE_ARN" \
    --action-names "$action" \
    --resource-arns "*" \
    --query 'EvaluationResults[0].EvalDecision' --output text || true)"
  if [[ "$decision" == "allowed" ]]; then
    fail "static IP: ${action} is granted, which reaches production's address"
  elif [[ -z "$decision" ]]; then
    fail "static IP: the simulator returned nothing for ${action}, so the absence is unproven"
  else
    pass "static IP: ${action} is not granted (${decision})"
  fi
done

# ── 8. The account's own controls ────────────────────────────────────────────
#
# Leaving or rewriting the organisation, closing the account or a region,
# payments, and stopping or deleting the trail: each is a way least privilege
# quietly becomes administrator again. A wildcard entry names a whole service
# and cannot be simulated as one action, so it is left out and said so.

echo ""
echo "The account's own controls"
mapfile -t SELF_ELEVATION < <(statement_actions NoSelfElevation | grep -v '\*' || true)
note "a wildcard entry in NoSelfElevation is not simulated, as it names no one action"
simulate_denied "self-elevation" "*" "${SELF_ELEVATION[@]}"

# ── 9. The runtime role it may assume ────────────────────────────────────────
#
# The one role this role is allowed to assume is the one it must not be able to
# rewrite: attaching an administrator policy to it and assuming it would land
# outside every denial here. NotAction-shaped, so the writes are representative,
# and a read has to survive because a plan refreshes that role.

echo ""
echo "The runtime role it may assume"
RUNTIME_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/footbag-staging-app-runtime"
note "NotAction-shaped, so this set is representative rather than exhaustive"
simulate_denied "rewriting the runtime role" "$RUNTIME_ROLE_ARN" \
  iam:PutRolePolicy iam:AttachRolePolicy iam:UpdateAssumeRolePolicy \
  iam:DeleteRolePolicy iam:DeleteRole
simulate_allowed "reading the runtime role" iam:GetRole "$RUNTIME_ROLE_ARN"

# ── 10. A key alias ──────────────────────────────────────────────────────────
#
# Stated in the negative on the Environment tag, so it must refuse on a
# production-tagged key and on a key carrying no tag at all, since an absent
# condition key makes a negated match true.

echo ""
echo "A key alias"
mapfile -t KEY_ALIAS < <(statement_actions NeverGraftAnAliasOntoProduction)
SIM_CONTEXT=(--context-entries "$PROD_TAG")
simulate_denied "key alias on a production-tagged key" "*" "${KEY_ALIAS[@]}"
SIM_CONTEXT=()
simulate_denied "key alias on an untagged key" "*" "${KEY_ALIAS[@]}"

# ── 11. A production edge function ───────────────────────────────────────────
#
# Scoped by ARN rather than by tag, which is what catches a production function
# that has lost its tag. Simulated with no tag context, so the tag-guarded edge
# denial above does not apply and this statement answers alone.

echo ""
echo "A production edge function"
mapfile -t EDGE_FUNCTION < <(statement_actions NeverRewriteAProductionEdgeFunction)
simulate_denied "production edge function" \
  "arn:aws:cloudfront::${ACCOUNT_ID}:function/footbag-production-probe" \
  "${EDGE_FUNCTION[@]}"

# ── 12. Passing a role to budgets ────────────────────────────────────────────
#
# A budget action applies a policy on its own schedule under a role it was
# passed, after the person who created it has gone.

echo ""
echo "Passing a role to budgets"
mapfile -t BUDGETS_PASS < <(statement_actions NeverPassARoleToBudgets)
SIM_CONTEXT=(--context-entries \
  "ContextKeyName=iam:PassedToService,ContextKeyValues=budgets.amazonaws.com,ContextKeyType=string")
simulate_denied "passing a role to budgets" \
  "arn:aws:iam::${ACCOUNT_ID}:role/footbag-staging-probe" "${BUDGETS_PASS[@]}"
SIM_CONTEXT=()

# ── Verdict ──────────────────────────────────────────────────────────────────

echo ""
if (( FINDINGS == 0 )); then
  if (( WEAK )); then
    echo "No findings, with ${WEAK} weaker-than-intended result(s) reported above." >&2
    echo "Each is an action refused because nothing grants it rather than because" >&2
    echo "the policy denies it. Nothing is wrong in the account today; what is" >&2
    echo "missing is the guarantee that stays true after somebody widens a grant." >&2
    exit 0
  fi
  echo "No findings."
  exit 0
fi
echo "${FINDINGS} finding(s)." >&2
exit 1
