#!/usr/bin/env bash
# verify-dev-tester-role-denials.sh
#
# Proves, against the live account, that the shared dev-and-tester job role is
# denied the things it is meant to be denied. Reads only; changes nothing.
#
# WHY THIS EXISTS.
#
# The job role's policy denies the whole lifecycle of a dev-and-tester, every
# write to its own definition, every write to the directly authenticated
# identity, every mutation of a production edge surface, and the certificate
# that opens a root shell on any host. Those denials are
# what make the lifecycle script's refusal more than a convention: a
# dev-and-tester who bypasses the wrapper and calls IAM directly is refused by AWS rather than
# by a script they chose not to run.
#
# WHAT IT CHECKS, in order:
#
#    1. the whole lifecycle of a dev-and-tester, and their second factor;
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
#   12. passing a role to budgets;
#   13. IAM write over staging-named principals, never granted: every route
#       from a staging-named user, role or policy to administrator;
#   14. assuming any role but the staging runtime role;
#   15. writing any allow-list address, and reading the
#       dev-and-tester addresses the staging plan needs;
#   16. editing or deleting the job's own managed policies, that all three are
#       attached, and that nothing but session revocations is inline;
#   17. the reads a staging plan makes, which must all be allowed.
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
# mean really trying to create a dev-and-tester, really trying to rewrite the role,
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
#   bash scripts/verify-dev-tester-role-denials.sh [--profile <p>] [--quiet]
#
# Flags:
#   --profile <p>    AWS profile; else the identity this run settles and proves.
#   --dev-tester <n> Name to use for the dev-tester ARN the lifecycle denials are
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
ROLE_TF="${REPO_ROOT}/terraform/identity/dev-tester-role.tf"

# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

AWS_BIN="${VERIFY_ROLE_DENIALS_AWS_BIN:-aws}"
ROLE_NAME="$FOOTBAG_DEV_TESTER_ROLE"
FOOTBAG_OPERATOR_USER="footbag-operator"
# Spelled exactly as every other definition of it in the tree, slashes included,
# so two variables of one name cannot hold two different values.
DEV_TESTER_PATH="/footbag-dev-testers/"
DEV_TESTER_NAME="a-dev-tester"
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
    --dev-tester)
      DEV_TESTER_NAME="${2:-}"
      shift 2 || { echo "ERROR: --dev-tester requires an argument" >&2; exit 2; }
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

# A run makes about seventy simulator calls in a row, and IAM throttles that
# rate. The CLI's adaptive retry absorbs it, so a throttled call is retried
# rather than read as an empty answer. Whatever AWS still says on a failure is
# kept, so a FAIL names the reason instead of "returned nothing".
export AWS_RETRY_MODE=adaptive AWS_MAX_ATTEMPTS=10
AWS_ERR="$(mktemp)"
trap 'rm -f "$AWS_ERR"' EXIT INT TERM
aws_q() { "$AWS_BIN" "$@" ${AWS_ARGS[@]+"${AWS_ARGS[@]}"} 2>"$AWS_ERR"; }
# The last error AWS gave, for a FAIL line; empty when it gave none.
aws_said() {
  local said
  said="$(grep -v '^[[:space:]]*$' "$AWS_ERR" 2>/dev/null | tail -n 1 || true)"
  [[ -n "$said" ]] && printf ' (AWS said: %s)' "$said"
  return 0
}

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
DEV_TESTER_ARN="arn:aws:iam::${ACCOUNT_ID}:user${DEV_TESTER_PATH}${DEV_TESTER_NAME}"
MFA_ARN="arn:aws:iam::${ACCOUNT_ID}:mfa/${DEV_TESTER_NAME}"
FOOTBAG_OPERATOR_ARN="arn:aws:iam::${ACCOUNT_ID}:user/${FOOTBAG_OPERATOR_USER}"

if ! aws_q iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "There is no ${ROLE_NAME} role in account ${ACCOUNT_ID}, so there are no" >&2
  echo "denials to prove yet. The account-level identity tree has not been" >&2
  echo "applied. Apply it first, as the directly authenticated identity:" >&2
  echo "  bash scripts/terraform-apply.sh --target identity --init" >&2
  echo "Nothing checked." >&2
  exit 1
fi

echo "Dev-and-tester job role denials for ${ROLE_NAME} in account ${ACCOUNT_ID}"
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
    fail "${label}: the simulator returned nothing, so the denial is unproven$(aws_said)"
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
# role rather than a safe one, and that failure shows up as a dev-and-tester unable
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
    fail "${label}: ${action} came back ${decision:-nothing}, so the role cannot do its job$( [[ -z "$decision" ]] && aws_said)"
  fi
}

# ── 1. The whole lifecycle of a dev-and-tester ───────────────────────────────

echo "Dev-and-tester lifecycle"
mapfile -t LIFECYCLE < <(statement_actions NeverAdministerADevTester)
LIFECYCLE_COUNT=${#LIFECYCLE[@]}
note "${LIFECYCLE_COUNT} action(s) drawn from NeverAdministerADevTester"
simulate_denied "lifecycle on the dev-tester path" "$DEV_TESTER_ARN" "${LIFECYCLE[@]}"

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
# denies the job role every CloudFront call there is.

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
# handing every dev-and-tester who can assume the job role a root shell on staging.

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
# key only, which is what stops a dev-and-tester applying the shared, production or
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
    elif [[ -z "$decision" || "$decision" == None ]]; then
      fail "state boundary: the simulator returned nothing for ${tree} state, so the boundary is unproven$(aws_said)"
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
  elif [[ -z "$decision" || "$decision" == None ]]; then
    fail "static IP: the simulator returned nothing for ${action}, so the absence is unproven$(aws_said)"
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
# condition key makes a negated match true. KMS authorises an alias call against
# the alias as well as the key, and no condition key exists on the alias side,
# so the denial is scoped to key ARNs; both halves of a staging alias change
# must then come back allowed, or a role-run staging apply stops partway with a
# key created and unnamed.

echo ""
echo "A key alias"
mapfile -t KEY_ALIAS < <(statement_actions NeverGraftAnAliasOntoProduction)
PROBE_KEY="arn:aws:kms:us-east-1:${ACCOUNT_ID}:key/00000000-0000-0000-0000-000000000000"
SIM_CONTEXT=(--context-entries "$PROD_TAG")
simulate_denied "key alias on a production-tagged key" "$PROBE_KEY" "${KEY_ALIAS[@]}"
SIM_CONTEXT=()
simulate_denied "key alias on an untagged key" "$PROBE_KEY" "${KEY_ALIAS[@]}"
simulate_allowed "staging alias, alias side" kms:CreateAlias \
  "arn:aws:kms:us-east-1:${ACCOUNT_ID}:alias/footbag-staging"
simulate_allowed "staging alias, alias side" kms:DeleteAlias \
  "arn:aws:kms:us-east-1:${ACCOUNT_ID}:alias/footbag-staging"
simulate_allowed "staging alias, key side" kms:CreateAlias "$PROBE_KEY" \
  --context-entries "$STAGING_TAG"

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

# ── 13. IAM write over staging-named principals ──────────────────────────────
#
# An absence rather than a denial statement, like the static IP. Each of these
# is one step of a route to administrator: make a staging-named user, give it
# AdministratorAccess and a key; or make or rewrite a staging-named role and
# pass it to a service; or add a policy version. None is granted, and a grant
# creeping back is the finding. implicitDeny is the expected answer here.

echo ""
echo "IAM write over staging-named principals"
PROBE_USER="arn:aws:iam::${ACCOUNT_ID}:user/footbag-staging-probe"
PROBE_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/footbag-staging-probe"
PROBE_POLICY="arn:aws:iam::${ACCOUNT_ID}:policy/footbag-staging-probe"
iam_write_probe() {
  local resource="$1" action decision ; shift
  for action in "$@"; do
    decision="$(aws_q iam simulate-principal-policy \
      --policy-source-arn "$ROLE_ARN" \
      --action-names "$action" \
      --resource-arns "$resource" \
      --query 'EvaluationResults[0].EvalDecision' --output text || true)"
    if [[ "$decision" == "allowed" ]]; then
      fail "IAM write: ${action} on ${resource##*:} is granted, a step to administrator"
    elif [[ -z "$decision" || "$decision" == None ]]; then
      fail "IAM write: the simulator returned nothing for ${action}, so the absence is unproven$(aws_said)"
    else
      pass "IAM write: ${action} on ${resource##*:} is not granted (${decision})"
    fi
  done
}
iam_write_probe "$PROBE_USER" iam:CreateUser iam:CreateAccessKey \
  iam:AttachUserPolicy iam:PutUserPolicy
iam_write_probe "$PROBE_ROLE" iam:CreateRole iam:PassRole iam:AttachRolePolicy \
  iam:PutRolePolicy iam:UpdateAssumeRolePolicy
iam_write_probe "$PROBE_POLICY" iam:CreatePolicyVersion iam:SetDefaultPolicyVersion

# ── 14. Assuming another role ────────────────────────────────────────────────
#
# The role may assume the staging runtime role and nothing else, stated as a
# Deny so a role created later with a trust naming this one is still refused.

echo ""
echo "Assuming another role"
simulate_denied "assuming a staging-named role" "$PROBE_ROLE" sts:AssumeRole
simulate_denied "assuming the production runtime role" \
  "arn:aws:iam::${ACCOUNT_ID}:role/footbag-production-app-runtime" sts:AssumeRole
simulate_allowed "chaining into the staging runtime role" sts:AssumeRole "$RUNTIME_ROLE_ARN"
# The other half of the chain is the runtime role's own trust, which the
# simulation above does not read. It must name this role, or the chain is
# refused however the role's own policy reads.
if ! RUNTIME_TRUST="$(aws_q iam get-role --role-name footbag-staging-app-runtime \
    --query 'Role.AssumeRolePolicyDocument' --output json)"; then
  fail "the staging runtime role's trust could not be read, so the chain is unproven$(aws_said)"
elif grep -qF -- "$ROLE_ARN" <<<"$RUNTIME_TRUST" \
     || grep -qE -- '"AROA[A-Z0-9]+"' <<<"$RUNTIME_TRUST"; then
  # A role's trust names another role by ARN, or by its unique id when that
  # role was deleted and recreated; the id form is a broken trust.
  if grep -qF -- "$ROLE_ARN" <<<"$RUNTIME_TRUST"; then
    pass "the staging runtime role's trust names ${ROLE_NAME}"
  else
    fail "the staging runtime role's trust names a role by unique id, which is a deleted ${ROLE_NAME}; re-run scripts/wire-staging-runtime-trust.sh"
  fi
else
  fail "the staging runtime role's trust does not name ${ROLE_NAME}, so the chain is refused; run scripts/wire-staging-runtime-trust.sh"
fi

# ── 15. Allow-list addresses ─────────────────────────────────────────────────
#
# Who may reach staging's SSH ports follows from these parameters. The role
# reads the dev-and-tester addresses, because the staging plan builds the
# allow-list from them, and writes no address anywhere under the path, a
# dev-and-tester's or an administrator's.
# The region is arbitrary: the policy scopes these ARNs to every region.

echo ""
echo "Allow-list addresses"
ADDRESS_PATH="arn:aws:ssm:us-east-1:${ACCOUNT_ID}:parameter/footbag-ops/staging/dev-testers"
note "NotAction-shaped, so this set is representative rather than exhaustive"
simulate_denied "writing a dev-and-tester address" "${ADDRESS_PATH}/probe" \
  ssm:PutParameter ssm:DeleteParameter ssm:DeleteParameters \
  ssm:LabelParameterVersion ssm:AddTagsToResource
simulate_denied "writing any other address under /footbag-ops" \
  "arn:aws:ssm:us-east-1:${ACCOUNT_ID}:parameter/footbag-ops/production/probe" \
  ssm:PutParameter ssm:DeleteParameter
simulate_allowed "reading the dev-and-tester addresses" ssm:GetParametersByPath "$ADDRESS_PATH"
simulate_allowed "reading one dev-and-tester address" ssm:GetParameter "${ADDRESS_PATH}/probe"

# ── 16. The job's own policies ───────────────────────────────────────────────
#
# The job is three managed policies attached to the role, and the role's inline
# policies are left to the session revocations offboarding writes, because a
# role's inline policies share one size limit. So the role must not be able to
# edit or remove its own policies, the three must be attached, and nothing but
# revocations may be inline. The listings are read as this run's identity.

echo ""
echo "The job's own policies"
JOB_POLICIES=(StagingServices EdgeAndIdentity Guardrails)
for suffix in "${JOB_POLICIES[@]}"; do
  iam_write_probe "arn:aws:iam::${ACCOUNT_ID}:policy/${ROLE_NAME}-${suffix}" \
    iam:CreatePolicyVersion iam:SetDefaultPolicyVersion iam:DeletePolicyVersion iam:DeletePolicy
done
ATTACHED="$(aws_q iam list-attached-role-policies --role-name "$ROLE_NAME" \
  --query 'AttachedPolicies[].PolicyName' --output text || true)"
for suffix in "${JOB_POLICIES[@]}"; do
  if [[ " ${ATTACHED//$'\t'/ } " == *" ${ROLE_NAME}-${suffix} "* ]]; then
    pass "policy ${ROLE_NAME}-${suffix} is attached"
  else
    fail "policy ${ROLE_NAME}-${suffix} is not attached; apply the identity tree$( [[ -z "$ATTACHED" ]] && aws_said)"
  fi
done
# A listing that failed is not an empty one: read as empty, it would pass the
# very check it exists for.
if ! INLINE="$(aws_q iam list-role-policies --role-name "$ROLE_NAME" \
    --query 'PolicyNames' --output text)"; then
  fail "the role's inline policies could not be listed, so what they hold is unproven$(aws_said)"
else
  STRAY=""
  for name in $INLINE; do
    [[ "$name" == None || "$name" == revoke-sessions-* ]] || STRAY+=" ${name}"
  done
  if [[ -n "$STRAY" ]]; then
    fail "inline policies other than session revocations:${STRAY}; they take the room offboarding needs"
  else
    pass "the role's inline policies hold only session revocations"
  fi
fi

# ── 17. What a staging plan reads ────────────────────────────────────────────
#
# A plan by this role refreshes every resource in the staging tree, and one
# denied read fails the whole plan. The first four are AWS calls that are
# authorized on no resource, or on a region-less ARN, which a staging-scoped
# grant never matched; the rest are representative of each scoped service. The
# region is arbitrary where the policy scopes to every region.

echo ""
echo "What a staging plan reads"
simulate_allowed "staging refresh" cloudwatch:GetDashboard \
  "arn:aws:cloudwatch::${ACCOUNT_ID}:dashboard/footbag-staging"
simulate_allowed "staging refresh" ssm:DescribeParameters "*"
simulate_allowed "staging refresh" logs:DescribeLogGroups "*"
simulate_allowed "staging refresh" ses:DescribeConfigurationSet "*"
simulate_allowed "staging refresh" ssm:GetParameter \
  "arn:aws:ssm:us-east-1:${ACCOUNT_ID}:parameter/footbag/staging/app/probe"
simulate_allowed "staging refresh" cloudwatch:DescribeAlarms \
  "arn:aws:cloudwatch:us-east-1:${ACCOUNT_ID}:alarm:footbag-staging-probe"
simulate_allowed "staging refresh" sqs:GetQueueAttributes \
  "arn:aws:sqs:us-east-1:${ACCOUNT_ID}:footbag-staging-probe"
simulate_allowed "staging refresh" sns:GetTopicAttributes \
  "arn:aws:sns:us-east-1:${ACCOUNT_ID}:footbag-staging-alarms"
simulate_allowed "staging refresh" s3:GetBucketPolicy "arn:aws:s3:::footbag-staging-media"
simulate_allowed "staging refresh" iam:GetRole "$RUNTIME_ROLE_ARN"
simulate_allowed "staging refresh" lightsail:GetInstance "*"
simulate_allowed "staging refresh" cloudfront:GetDistribution "*"

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
