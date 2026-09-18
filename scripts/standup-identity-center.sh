#!/usr/bin/env bash
# standup-identity-center.sh
#
# The one-time bootstrap of federated operator access.
#
# Applies terraform/identity, which declares what an operator MAY DO: the
# human-operator permission sets and their least-privilege policies. Then hands the
# roster — who the operators are — to scripts/terraform-apply.sh, which is the
# same command a later hiring or firing runs.
#
# THIS IS THE BOOTSTRAP, AND ONLY THE BOOTSTRAP.
#
# A joiner is granted access by an existing operator. The first ones have no such
# person, which is why this exists at all and why it is the one path that runs as
# the directly authenticated identity. Once it has run, adding or removing an
# operator is `scripts/terraform-apply.sh --target operators`, run by an operator
# as themselves, and this script is not in that path. Reaching for it to hire
# somebody would put a privileged sign-in in front of routine work; reaching for
# it to fire somebody would put one in front of revoking access, which is worse.
#
# WHY IT EXISTS RATHER THAN A PLAIN APPLY.
#
# Two preconditions have to hold before the role-definition tree can be applied
# at all, neither of them is visible in a plan, and getting either wrong produces
# a failure that names the wrong cause.
#
# The first is that the Identity Center instance exists. There is no supported
# API for an organization instance -- the create-instance call makes an ACCOUNT
# instance, which carries no permission sets and which AWS rejects outright in an
# organization's management account -- so the enable is a console action the
# maintainer performs, and this script owns everything around it. Applied before
# that, the tree fails inside a data source with a message about an empty list.
#
# The second is that the run is authenticated AS the directly authenticated
# identity. That is a statement about which principal can apply the tree: it is
# privileged administration of the federation, rare and deliberate, and ordinary
# work for the super-admin identity that performs it. The
# permission set's own policy denies the operator roles every write to their own
# definition, because in an organization of one the only account is the
# management account and a service control policy never applies there, so those
# denials have nowhere else to live. That makes this the one tree an operator
# cannot apply, and a run attempted under the federated role fails part-way
# through with an access denial that reads like a broken policy rather than like
# the design working.
#
# The verification afterwards is the other half. Identity Center generates the
# IAM role behind each permission set as AWSReservedSSO_<name>_<suffix>, and the
# suffix cannot be predicted, so the ARNs the runtime-role trust policies must
# name are only knowable after the assignments exist. Leaving an operator to go
# and find them is how one gets copied wrong.
#
# WHAT THIS DELIBERATELY DOES NOT DO.
#
#   - Touch the super-admin identity. Its access key stays, and its ARN stays in
#     both runtime-role trust policies, permanently. A way back in routed
#     through the identity provider is unavailable exactly when the provider is
#     what failed.
#   - Apply the staging or production trees. Putting the generated role ARN into
#     their trust policies is a separate, reviewed apply through
#     scripts/terraform-apply.sh, and step 3 prints the exact commands.
#   - Take a --target. This tree is account-level: staging and production share
#     one AWS account and one set of human operators, so there is no environment
#     to choose.
#
# WHY IT CARRIES THE TRUST-POLICY CHANGE TOO.
#
# The generated role ARN is produced by step 3 and consumed by step 4. Splitting
# those across two scripts would mean an operator copying an ARN from one run's
# output into another run's input, and a mistyped or stale one produces a trust
# policy that reads correctly, shows no plan diff, and refuses every AssumeRole.
# So the run that reads the ARN is the run that writes it, and the operator never
# handles it.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  the two preconditions: one Identity Center instance, and this run
#      authenticated as the directly authenticated identity
#   2  terraform plan to a shredded file, confirm, apply that exact plan
#   3  read each permission set's generated role ARN back and prove every
#      operator is assigned
#   4  write those ARNs into the environments' values files, the super-admin one
#      into both and the dev-and-tester one into staging's alone, each behind its
#      own diff and confirmation
#   5  apply both environment trees through scripts/terraform-apply.sh, so the
#      trust policies carry the new principal alongside the super-admin identity
#
# Usage:
#   scripts/standup-identity-center.sh --dry-run
#   scripts/standup-identity-center.sh --init
#   scripts/standup-identity-center.sh
#   scripts/standup-identity-center.sh --verify
#   scripts/standup-identity-center.sh --from-step 4
#
# Flags:
#   --init            terraform init first, for a tree never initialised here
#   --dry-run         state what a run would do; reads no AWS at all
#   --verify          read the deployed result and change nothing
#   --from-step <n>   resume at step 2, 3, 4 or 5 after a failure
#   --profile <name>  AWS profile; defaults to the one holding the directly
#                     authenticated key, NOT the everyday federated profile,
#                     which this tree denies every write to its own definition
#   --yes             accept the typed confirmation where no terminal is attached
#
# --yes does not reach the production apply in step 5. That confirmation is read
# from the terminal every time, because what it replaces is what the public is
# served, and the apply wrapper refuses the flag outright there.
#
# The preconditions in step 1 are NOT skipped by --from-step. They are two reads,
# they are idempotent, and they are the whole reason this is a script.
#
# Test seams (CI only; operators never set these): STANDUP_IDENTITY_AWS_BIN and
# STANDUP_IDENTITY_TERRAFORM_BIN point the two external commands at stubs,
# STANDUP_IDENTITY_APPLY_SCRIPT replaces the apply wrapper step 5 hands off to,
# and STANDUP_IDENTITY_TFVARS_DIR replaces the directory whose
# <environment>/terraform.tfvars step 4 writes, so a test never reaches the
# private operations checkout. All are announced loudly when set, because a run
# that silently used a stub would prove nothing about the account.
set -euo pipefail

DRY_RUN=0
VERIFY_ONLY=0
FROM_STEP=1
DO_INIT=0
AWS_REGION_ARG="${AWS_REGION:-us-east-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# confirm_from_tty is the shared confirmation helper: it reads the answer from
# /dev/tty rather than stdin, refuses when no terminal exists and --yes was not
# given, and honours --yes. Reused rather than re-implemented so every operator
# script prompts the same way.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# Sourced here for the profile names, which the default below needs. The
# identity it settles for terraform is a separate act and happens past the dry
# run, where the first thing that reaches the account is.
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

# This tree is applied by the directly authenticated bootstrap principal alone,
# so the profile carrying that identity's key is what the aws calls name. Not
# the everyday profile: that one signs in through the very identity centre this
# script is standing up, and the permission set declared here denies every
# federated role each write to its own definition.
AWS_PROFILE_ARG="$FOOTBAG_OPERATOR_KEY_PROFILE"

AWS_BIN="${STANDUP_IDENTITY_AWS_BIN:-aws}"
TF_BIN="${STANDUP_IDENTITY_TERRAFORM_BIN:-terraform}"
APPLY_SCRIPT="${STANDUP_IDENTITY_APPLY_SCRIPT:-${REPO_ROOT}/scripts/terraform-apply.sh}"
TFVARS_DIR="${STANDUP_IDENTITY_TFVARS_DIR:-${REPO_ROOT}/terraform}"

TF_DIR="${REPO_ROOT}/terraform/identity"

# Step 2 applies the identity tree and step 2b applies the roster tree, so both
# have to be initialised before either is touched. Initialising only the first
# leaves the run dying part-way, after the permission set exists, on a message
# about the roster apply that names the wrong cause.
OPERATORS_TF_DIR="${REPO_ROOT}/terraform/operators"

# The two environments whose runtime-role trust policies name the operator
# principal by literal ARN, in the order they are applied: staging first, so a
# mistake is found on the environment whose data is disposable.
TRUST_ENVIRONMENTS=("staging" "production")
# The variables their values files carry the generated role ARNs in. Staging
# carries both; production's values file carries only the first, because the
# dev-and-tester variable is not declared in that tree at all. That absence is
# what keeps the dev-and-tester job off production, rather than a value somebody
# remembered not to set.
SUPER_ADMIN_TRUST_VAR="super_admin_sso_role_arn"
DEV_TESTER_TRUST_VAR="dev_tester_sso_role_arn"

# The directly authenticated identity that applies this tree, and the two
# permission sets whose generated roles are read back afterwards. All three are
# spelled here rather than read from the tree, because they are what this script
# asserts ABOUT the tree; taking them from the thing under test would make the
# check vacuous.
#
# The user and the permission sets are different things with names that no longer
# look alike, which is the point of the second name: `footbag-operator` is the
# directly authenticated IAM user nobody assumes, and FootbagSuperAdmin is the
# federated permission set every super admin does.
SUPER_ADMIN_USER="footbag-operator"
SUPER_ADMIN_PERMISSION_SET="FootbagSuperAdmin"
DEV_TESTER_PERMISSION_SET="FootbagDevTester"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --init)
      DO_INIT=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --verify)
      VERIFY_ONLY=1
      shift
      ;;
    --yes)
      ASSUME_YES="yes"
      shift
      ;;
    --help|-h) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

if [[ ! "$FROM_STEP" =~ ^[1-5]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 5 (got '$FROM_STEP')." >&2
  exit 2
fi

if (( DRY_RUN && VERIFY_ONLY )); then
  echo "ERROR: --dry-run and --verify do different things; pass one or the other." >&2
  echo "       --dry-run states what a run would do and reads nothing." >&2
  echo "       --verify reads the deployed result and applies nothing." >&2
  exit 2
fi

if [[ -n "${STANDUP_IDENTITY_AWS_BIN:-}${STANDUP_IDENTITY_TERRAFORM_BIN:-}${STANDUP_IDENTITY_APPLY_SCRIPT:-}${STANDUP_IDENTITY_TFVARS_DIR:-}" ]]; then
  echo "SYNTHETIC: aws='$AWS_BIN' terraform='$TF_BIN' apply='$APPLY_SCRIPT'" >&2
  echo "SYNTHETIC: tfvars='$TFVARS_DIR' -- this run proves nothing about the account." >&2
fi

aws_read() {
  "$AWS_BIN" "$@" --profile "$AWS_PROFILE_ARG" --region "$AWS_REGION_ARG"
}

echo "== identity centre standup =="
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  echo "  1. Refuse unless exactly one IAM Identity Center instance exists, and unless"
  echo "     this run authenticates as the IAM user ${SUPER_ADMIN_USER}. The instance is"
  echo "     created by a console enable that has no supported API, and the permission"
  echo "     set denies the operator role every write to its own definition, so the"
  echo "     directly authenticated identity is the only one that can apply it."
  echo "  2. terraform -chdir=terraform/identity plan into a mode-600 file shredded on"
  echo "     every exit path, show it, take a typed APPLY, then apply that exact plan."
  echo "     Expect the ${SUPER_ADMIN_PERMISSION_SET} and ${DEV_TESTER_PERMISSION_SET} permission"
  echo "     sets and their inline policies, and nothing at all about who the operators"
  echo "     are."
  echo "  2b. Hand the roster to scripts/terraform-apply.sh --target operators, which is"
  echo "     the same command a later hiring or firing runs. Expect one directory record"
  echo "     per operator and one account assignment each. It must happen before the"
  echo "     read-back below: Identity Center provisions the IAM role behind a permission"
  echo "     set only when that set is first assigned to an account."
  echo "  3. Read the generated AWSReservedSSO_*_* role ARN back for each permission set"
  echo "     and ASSERT it, and assert that somebody is actually assigned: a permission"
  echo "     set assigned to nobody provisions no role and reads as landed in every plan."
  echo "     A roster with no dev-and-tester on it is reported and is not a failure."
  echo "  4. Write the super-admin ARN as ${SUPER_ADMIN_TRUST_VAR} into the staging"
  echo "     and then the production values file, and the dev-and-tester ARN as"
  echo "     ${DEV_TESTER_TRUST_VAR} into staging's alone, each behind its own"
  echo "     diff and confirmation, skipping any that already carries it. No ARN is ever"
  echo "     handed to an operator to paste: a stale one reads as a valid trust and"
  echo "     refuses every AssumeRole."
  echo "  5. Apply both environment trees through the apply wrapper, staging first, so a"
  echo "     mistake lands on the environment whose data is disposable. Production stops"
  echo "     for its own typed confirmation read from the terminal, and --yes does not"
  echo "     carry there."
  echo ""
  echo "Nothing about the super-admin identity changes. Its access key stays and its ARN"
  echo "stays in both runtime-role trust policies: removing it is not undone by"
  echo "recreating the user, because a recreated user is a different principal."
  exit 0
fi

# Everything past the dry run reaches the account. The aws calls carry a profile
# of their own, but terraform takes none and runs on whatever identity the shell
# carries, so the run settles and proves one here rather than letting the apply
# be the thing that discovers there is none.
#
# Settled on the same profile the aws calls name, rather than filled in only
# where the shell was empty. An operator standing in a shell that already names
# their federated sign-in would otherwise have the checks run as the bootstrap
# principal and the apply run as a role the tree denies, which is an apply that
# stops part way through having already made some of the changes.
aws_profile_use "$AWS_PROFILE_ARG" \
  "This tree is applied by the directly authenticated bootstrap identity alone." \
  || exit 1

# ── Step 1: the two preconditions ────────────────────────────────────────────
#
# Deliberately NOT conditioned on --from-step. Both are reads, both are
# idempotent, and a resume that skipped them would be a resume into exactly the
# two failures this script exists to turn into sentences.
echo "-- step 1: preconditions --"
echo ""

# The principal is asserted by ARN rather than trusted from the profile name. A
# profile can be configured under any name and resolve to anything; what matters
# is who the apply will run as.
if ! aws_identity_require_user "$AWS_PROFILE_ARG" "$SUPER_ADMIN_USER"; then
  echo "" >&2
  echo "REFUSING: this tree is applied by the directly authenticated identity alone." >&2
  echo "" >&2
  echo "  The permission set declared here denies the operator role every write to its" >&2
  echo "  own definition. In an organization of one the only account is the management" >&2
  echo "  account, and a service control policy never applies there, so those denials" >&2
  echo "  have nowhere to live but the policy itself -- which means the role cannot" >&2
  echo "  apply the tree that declares it." >&2
  echo "" >&2
  echo "  An access denial part-way through this apply is the design working, not a" >&2
  echo "  missing permission. This has to run as the IAM user ${SUPER_ADMIN_USER}," >&2
  echo "  which is a different profile from the one everyday work goes out on:" >&2
  echo "    bash scripts/standup-identity-center.sh --profile ${FOOTBAG_OPERATOR_KEY_PROFILE}" >&2
  echo "  and that is already the default, so a run that reached this message was" >&2
  echo "  either given another profile or is on a machine where that one holds" >&2
  echo "  something else." >&2
  echo "" >&2
  echo "  If you came here to hire or fire somebody, this is the wrong script. That is" >&2
  echo "  the roster, it is ordinary work, and it runs as you:" >&2
  echo "    scripts/terraform-apply.sh --target operators" >&2
  exit 1
fi

INSTANCE_ARNS="$(aws_read sso-admin list-instances \
  --query 'Instances[].InstanceArn' --output text 2>/dev/null)" || INSTANCE_ARNS=""
INSTANCE_COUNT=0
if [[ -n "$INSTANCE_ARNS" && "$INSTANCE_ARNS" != "None" ]]; then
  # shellcheck disable=SC2086
  set -- $INSTANCE_ARNS
  INSTANCE_COUNT=$#
fi

if (( INSTANCE_COUNT == 0 )); then
  echo "" >&2
  echo "REFUSING: no IAM Identity Center instance in this account." >&2
  echo "" >&2
  echo "  Enabling it is a console action performed by the maintainer, signed in as" >&2
  echo "  root, and there is no supported API to take it over: the create-instance" >&2
  echo "  call makes an ACCOUNT instance, which carries no permission sets at all, and" >&2
  echo "  AWS rejects that call in an organization's management account." >&2
  echo "" >&2
  echo "  Three choices in that flow are permanent or expensive to undo. Enable" >&2
  echo "  Identity Center itself rather than AWS Organizations first, because enabling" >&2
  echo "  from a standalone account creates the organization in the same flow. Choose" >&2
  echo "  the Region the rest of the estate lives in, because changing it later means" >&2
  echo "  deleting the instance and creating another. And leave multi-account" >&2
  echo "  permissions on, because off means no permission set ever appears." >&2
  exit 1
fi

if (( INSTANCE_COUNT > 1 )); then
  echo "" >&2
  echo "REFUSING: ${INSTANCE_COUNT} Identity Center instances answered, and this tree" >&2
  echo "          takes the first one it is given." >&2
  echo "" >&2
  echo "  An account instance alongside the organization instance is the way this" >&2
  echo "  happens, and the two are not interchangeable: an account instance carries no" >&2
  echo "  permission sets, so an apply that picked it would create the directory" >&2
  echo "  records and then fail with nothing to assign them to." >&2
  echo "" >&2
  printf '%s\n' $INSTANCE_ARNS | sed 's/^/    /' >&2
  exit 1
fi

echo "    instance: ${INSTANCE_ARNS}"
echo ""

# ── Step 2: plan, confirm, apply that plan ───────────────────────────────────
if (( FROM_STEP <= 2 )) && (( ! VERIFY_ONLY )); then
  if (( DO_INIT )); then
    echo "-- terraform init --"
    echo ""
    for init_dir in "$TF_DIR" "$OPERATORS_TF_DIR"; do
      if ! "$TF_BIN" -chdir="$init_dir" init; then
        echo "ERROR: terraform init failed in ${init_dir}. Nothing was applied." >&2
        exit 1
      fi
    done
    echo ""
  elif [[ -z "${STANDUP_IDENTITY_TERRAFORM_BIN:-}" ]]; then
    # Both trees are applied by this run, so an uninitialised one is refused here
    # rather than part-way through, where the permission set already exists and
    # the failure arrives as a backend error attributed to the roster apply.
    # Skipped under the terraform seam: a stubbed binary keeps no working
    # directory, so the check would only ever assert something about the fixture.
    for init_dir in "$TF_DIR" "$OPERATORS_TF_DIR"; do
      if [[ ! -d "${init_dir}/.terraform" ]]; then
        echo "ERROR: ${init_dir} has never been initialised, and this run applies it." >&2
        echo "       Re-run with --init, which initialises both trees before either" >&2
        echo "       is applied. Nothing has been changed." >&2
        exit 1
      fi
    done
  fi

  echo "-- step 2: terraform apply --"
  echo ""
  # The plan is written to a mode-600 file under a literal /tmp path and shredded
  # by a trap on EXIT, INT and TERM, so the shred runs on a failed plan, a failed
  # apply and an interrupt alike. A saved plan is a zip carrying a full copy of
  # state, so it holds every resolved value in the clear; left behind by a
  # failure it is a durable copy of them that no credential scan can see into.
  # The directory is literal rather than TMPDIR-relative so the caller's
  # environment cannot redirect it into a checkout.
  #
  # Applying the saved plan rather than replanning at apply time is what makes
  # the reviewed diff the applied diff, and it removes the window between
  # deciding and acting.
  TF_PLAN="$(mktemp /tmp/footbag-identity-plan.XXXXXX)"
  chmod 600 "$TF_PLAN"
  trap 'if [ -n "${TF_PLAN:-}" ] && [ -e "${TF_PLAN}" ]; then shred -u "${TF_PLAN}" 2>/dev/null || true; fi; rm -f "${TF_PLAN:-}"' EXIT INT TERM

  if ! "$TF_BIN" -chdir="$TF_DIR" plan -out="$TF_PLAN"; then
    echo "ERROR: terraform plan failed. Nothing was applied." >&2
    echo "       Resume with --from-step 2 once fixed. If the tree has never been" >&2
    echo "       initialised on this machine, re-run with --init." >&2
    exit 1
  fi
  echo ""
  echo "Read the plan above before answering. Every resource in this tree is new, and"
  echo "none of them is the super-admin identity: that IAM user keeps its access key and"
  echo "keeps its ARN in both runtime-role trust policies, and nothing here changes it."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the plan shown above: " "APPLY"; then
    echo "Aborted before terraform apply. Nothing was changed; resume with --from-step 2." >&2
    exit 1
  fi
  if ! "$TF_BIN" -chdir="$TF_DIR" apply "$TF_PLAN"; then
    echo "ERROR: terraform apply failed. Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 2b: the roster, through the wrapper an ordinary operator uses ───────
#
# The roster is a separate tree because hiring and firing are ordinary work, and
# it is applied here through exactly the command a later hiring runs, rather than
# through a second copy of the plan-and-apply discipline. That is deliberate:
# the bootstrap should walk the same path it is bringing into being, so the path
# is exercised once before anybody depends on it.
#
# It must run before step 3 can read anything back. Identity Center provisions
# the IAM role behind a permission set when that permission set is first ASSIGNED
# to an account, so until the roster exists there is no role to find.
if (( FROM_STEP <= 2 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 2b: the operator roster --"
  echo ""
  if ! bash "$APPLY_SCRIPT" --target operators; then
    echo "ERROR: the roster apply failed, so nobody is assigned the permission set" >&2
    echo "       and no role has been provisioned behind it." >&2
    echo "       Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 3: prove it, and hand over the one value the next step needs ────────
#
# Everything this step can decide, it decides, and the run's exit status carries
# the verdict. What it asserts is the outcome rather than the invocation: that
# the generated role actually exists in the account, and that every operator the
# roster names can reach it.
echo "-- step 3: verify --"
echo ""
VERIFY_FAIL=0

# Everything this step asks about ONE permission set. The answers come back in
# these two rather than on stdout, because the caller decides what a missing role
# means for the set it asked about and step 4 needs the ARN.
#
# Asking per set rather than reading every reserved-SSO role once is deliberate:
# the two sets' roles are told apart only by the name embedded in each, and a
# single listing that matched loosely would hand the dev-and-tester's ARN to the
# super-admin trust policy without either name appearing in the mistake.
GENERATED_ROLE_ARN=""
ASSIGNED_PRINCIPALS=""
PERMISSION_SET_EXISTS=0

inspect_permission_set() {
  local set_name="$1"
  GENERATED_ROLE_ARN=""
  ASSIGNED_PRINCIPALS=""
  PERMISSION_SET_EXISTS=0

  # Read from the account, not from the tree's output. The output would report
  # what Terraform believes it created; this asks IAM what is there, which is the
  # question a trust policy's correctness depends on.
  local role_answer role_count
  role_answer="$(aws_read iam list-roles --path-prefix '/aws-reserved/sso.amazonaws.com/' \
    --query "Roles[?starts_with(RoleName, \`AWSReservedSSO_${set_name}_\`)].Arn" \
    --output text 2>/dev/null)" || role_answer=""

  # `--output text` separates a list with tabs, so the answer is split into
  # fields rather than used whole. Taken wholesale it carries a trailing tab into
  # the values file, and a Terraform string holding an ARN plus whitespace is a
  # principal that does not exist: the trust policy reads correctly and refuses
  # every AssumeRole, with no plan diff to explain it.
  role_count=0
  if [[ -n "$role_answer" && "$role_answer" != "None" ]]; then
    # shellcheck disable=SC2086
    set -- $role_answer
    role_count=$#
    GENERATED_ROLE_ARN="$1"
  fi

  # Two matching roles is not a case to pick a winner in. It means a second
  # permission set of this name has existed, so which of them the operators are
  # actually assigned is exactly the question, and writing either ARN into a
  # trust policy would be a guess with no symptom until an AssumeRole refuses.
  if (( role_count > 1 )); then
    echo "" >&2
    echo "REFUSING: ${role_count} roles match AWSReservedSSO_${set_name}_*." >&2
    echo "" >&2
    echo "  The suffix is generated, and a permission set that was deleted and recreated" >&2
    echo "  leaves a role behind under the old one. Only one of these is the role the" >&2
    echo "  operators actually assume, and this run cannot tell which, so writing either" >&2
    echo "  into a runtime trust policy would be a guess that shows no symptom until an" >&2
    echo "  AssumeRole refuses." >&2
    echo "" >&2
    # shellcheck disable=SC2086
    printf '%s\n' $role_answer | sed 's/^/    /' >&2
    exit 1
  fi

  # Assignment is what makes a permission set reachable. One that exists and is
  # assigned to nobody provisions no role and admits no operator, and it reads as
  # landed in every plan.
  #
  # The listing answers with bare ARNs, which carry no name, so the set being
  # asked about is found by asking each one what it is called. Taking whichever
  # the API listed first was correct only while exactly one permission set
  # existed: with two declared, an arbitrary set's assignments would be reported
  # under the other's name, and the verdict would be about the wrong role while
  # reading exactly as it does now.
  local set_arns ps_arn ps_name account_id found_arn=""
  set_arns="$(aws_read sso-admin list-permission-sets \
    --instance-arn "$INSTANCE_ARNS" --query 'PermissionSets[]' --output text 2>/dev/null)" \
    || set_arns=""

  if [[ -n "$set_arns" && "$set_arns" != "None" ]]; then
    # shellcheck disable=SC2086
    for ps_arn in $set_arns; do
      ps_name="$(aws_read sso-admin describe-permission-set \
        --instance-arn "$INSTANCE_ARNS" --permission-set-arn "$ps_arn" \
        --query 'PermissionSet.Name' --output text 2>/dev/null)" || ps_name=""
      if [[ "$ps_name" == "$set_name" ]]; then
        found_arn="$ps_arn"
        PERMISSION_SET_EXISTS=1
        break
      fi
    done
  fi

  if [[ -n "$found_arn" ]]; then
    account_id="$("$AWS_BIN" sts get-caller-identity --profile "$AWS_PROFILE_ARG" \
      --region "$AWS_REGION_ARG" --query Account --output text 2>/dev/null)" || account_id=""
    ASSIGNED_PRINCIPALS="$(aws_read sso-admin list-account-assignments \
      --instance-arn "$INSTANCE_ARNS" \
      --account-id "$account_id" \
      --permission-set-arn "$found_arn" \
      --query 'AccountAssignments[].PrincipalId' --output text 2>/dev/null)" || ASSIGNED_PRINCIPALS=""
  fi
}

# The super-admin set first. Nothing works without it: it is the set that carries
# production, the roster, and the way an operator applies anything at all.
inspect_permission_set "$SUPER_ADMIN_PERMISSION_SET"
SUPER_ADMIN_ROLE_ARN="$GENERATED_ROLE_ARN"
echo "  ${SUPER_ADMIN_PERMISSION_SET}"
if (( ! PERMISSION_SET_EXISTS )); then
  echo "    NO permission set of that name exists on this instance."
  echo "    The apply that declares it did not land, so there is nothing for an operator"
  echo "    to be assigned and nothing for Identity Center to generate a role from."
  VERIFY_FAIL=1
else
  if [[ -z "$ASSIGNED_PRINCIPALS" || "$ASSIGNED_PRINCIPALS" == "None" ]]; then
    echo "    NO operator is assigned it. Nobody can assume it, and the super-admin"
    echo "    identity is still carrying every operator action in this account."
    VERIFY_FAIL=1
  else
    # shellcheck disable=SC2086
    set -- $ASSIGNED_PRINCIPALS
    echo "    operators assigned: $#"
  fi
  if [[ -z "$SUPER_ADMIN_ROLE_ARN" ]]; then
    echo "    NO generated role. Identity Center provisions one when the set is first"
    echo "    assigned to an account, so this means the assignment did not land."
    VERIFY_FAIL=1
  else
    echo "    generated role: ${SUPER_ADMIN_ROLE_ARN}"
  fi
fi

# The dev-and-tester set. It must exist, because the same tree declares it, but
# nobody holding it is a roster with no dev-and-tester on it rather than a fault.
inspect_permission_set "$DEV_TESTER_PERMISSION_SET"
DEV_TESTER_ROLE_ARN="$GENERATED_ROLE_ARN"
echo "  ${DEV_TESTER_PERMISSION_SET}"
if (( ! PERMISSION_SET_EXISTS )); then
  echo "    NO permission set of that name exists on this instance."
  echo "    One tree declares both sets, so one of them missing means the apply landed"
  echo "    partially, or landed from a revision of the tree that carried only the other."
  VERIFY_FAIL=1
elif [[ -z "$ASSIGNED_PRINCIPALS" || "$ASSIGNED_PRINCIPALS" == "None" ]]; then
  echo "    nobody is assigned it, so Identity Center has generated no role behind it."
  echo "    Staging's trust policy will carry no dev-and-tester principal, which is the"
  echo "    correct state for a roster that has nobody on that tier. Adding somebody with"
  echo "    that role and re-running --from-step 3 writes it."
elif [[ -z "$DEV_TESTER_ROLE_ARN" ]]; then
  echo "    NO generated role, although somebody is assigned it. An assignment provisions"
  echo "    the role, so the two disagreeing means the assignment did not finish."
  VERIFY_FAIL=1
else
  # shellcheck disable=SC2086
  set -- $ASSIGNED_PRINCIPALS
  echo "    operators assigned: $#"
  echo "    generated role: ${DEV_TESTER_ROLE_ARN}"
fi

echo ""
if (( VERIFY_FAIL )); then
  echo "The standup did not complete. Nothing above is safe to build on." >&2
  exit 1
fi

# ── Step 4: the ARN into both environments' values files ─────────────────────
#
# This runs here rather than in a second script because the ARN is read one step
# above. Handing it to an operator to paste somewhere is the failure this whole
# script exists to remove: a stale or mistyped reserved-SSO ARN produces a trust
# policy that reads correctly, shows no plan diff, and refuses every AssumeRole.
#
# The super-admin identity's own ARN is untouched by any of this. It is a literal
# in each tree's HCL, not a variable, so nothing written here can displace it.
if (( FROM_STEP <= 4 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 4: the role ARNs into the values files --"
  echo ""
  for trust_env in "${TRUST_ENVIRONMENTS[@]}"; do
    TFVARS_LINK="${TFVARS_DIR}/${trust_env}/terraform.tfvars"
    if ! TFVARS_PATH="$(resolve_tfvars_target "$TFVARS_LINK" "$REPO_ROOT")"; then
      echo "ERROR: could not resolve ${trust_env}'s values file." >&2
      echo "       It is a gitignored symlink into the private operations checkout;" >&2
      echo "       without that checkout no environment can be applied at all." >&2
      echo "       Resume with --from-step 4 once it is present." >&2
      exit 1
    fi

    # What this environment's values file is asked to carry. Both trees carry the
    # super-admin role. Only staging declares the dev-and-tester variable, so
    # writing it into production's file would set a variable that tree does not
    # have, and the absence there is the whole of what keeps that job off
    # production.
    TRUST_WRITES=("${SUPER_ADMIN_TRUST_VAR} ${SUPER_ADMIN_ROLE_ARN}")
    if [[ "$trust_env" == "staging" && -n "$DEV_TESTER_ROLE_ARN" ]]; then
      TRUST_WRITES+=("${DEV_TESTER_TRUST_VAR} ${DEV_TESTER_ROLE_ARN}")
    fi

    for trust_write in "${TRUST_WRITES[@]}"; do
      # shellcheck disable=SC2086
      set -- $trust_write
      trust_var="$1"
      trust_arn="$2"

      # Idempotent: a re-run after a part-way failure says so rather than showing
      # a diff with nothing in it and asking for a confirmation that changes
      # nothing.
      if grep -qE "^[[:space:]]*${trust_var}[[:space:]]*=[[:space:]]*\"${trust_arn}\"" "$TFVARS_PATH"; then
        echo "    ${trust_env}: already carries this ${trust_var}, nothing to write"
        continue
      fi

      if ! write_tfvars_string "$TFVARS_PATH" "$trust_var" "$trust_arn" \
        "The role exists and can be read again; re-run with --from-step 4."; then
        exit 1
      fi
    done
  done
  echo ""
fi

# ── Step 5: apply both environment trees ─────────────────────────────────────
#
# Handed off to the apply wrapper rather than reimplemented, so each plan is
# saved, shown, confirmed and shredded exactly as every other apply in this tree
# is. Staging first: a mistake then lands on the environment whose data is
# disposable.
#
# --yes is deliberately NOT passed through. The production apply reads its
# confirmation from the terminal every time, and the wrapper refuses the flag
# there outright, because what that apply replaces is what the public is served.
# Routing around that from here would defeat a guard this script does not own.
if (( FROM_STEP <= 5 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 5: apply both environment trees --"
  echo ""
  for trust_env in "${TRUST_ENVIRONMENTS[@]}"; do
    echo "  ${trust_env}:"
    if ! bash "$APPLY_SCRIPT" --target "$trust_env"; then
      echo "ERROR: the ${trust_env} apply failed, so its trust policy does not carry the" >&2
      echo "       operator role yet. Resume with --from-step 5 once fixed." >&2
      exit 1
    fi
    echo ""
  done
fi

if (( VERIFY_ONLY )); then
  echo "Read-only: the values files and both environment trees were left alone."
  echo ""
fi

echo "The federated operator path exists. What it still needs is a person to walk it:"
echo ""
echo "  1. Write the federated profile onto each operator's workstation, under the"
echo "     name everyday work already uses, so no script, runbook step or"
echo "     workstation learns a second one. The access portal URL is the one in"
echo "     the invitation mail, and the permission set is whichever their job"
echo "     carries:"
echo ""
echo "       bash scripts/install-operator-sso-profile.sh \\"
echo "         --start-url https://<your-portal>.awsapps.com/start \\"
echo "         --role ${SUPER_ADMIN_PERMISSION_SET}"
echo ""
echo "     It refuses while a static key still occupies that profile name, which"
echo "     is the failure worth refusing: a key there is preferred over the"
echo "     sign-in silently, so the profile would be written, look right, and"
echo "     never once be used."
echo ""
echo "  2. Prove the trust-policy change, which a deploy does NOT: a staging"
echo "     code-only deploy never chain-assumes a runtime role, it reads Terraform"
echo "     state directly under the ambient profile."
echo ""
echo "       bash scripts/verify-account-baseline.sh"
echo ""
echo "The super-admin identity is unchanged and stays that way: its access key is"
echo "live and its ARN is still named by both runtime trust policies, which is what"
echo "makes it reachable when the identity provider is the thing that has failed."
echo ""
