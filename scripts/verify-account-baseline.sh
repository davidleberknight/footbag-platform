#!/usr/bin/env bash
# verify-account-baseline.sh
#
# Reads the account-level security controls and says which are in place. Makes
# no change of any kind.
#
# WHY THIS EXISTS.
#
# The account lockdown checklist began as four console steps, and nothing
# re-asserted them. A console-set control has no Terraform behind it, so nothing
# detects it being turned off, nothing notices it was never turned on, and the
# checklist is the only record that it was ever meant to exist. All four are
# declared in terraform/shared/account-baseline.tf now, so this script reads
# what that tree asserts rather than what somebody remembered to click; the
# alternate contacts sit behind a gate there because they are the only ones
# carrying values. Key usage has the same
# problem from the other direction: reading each key's last-used date meant a
# console trip, so it happened only if somebody remembered where to look. And
# nothing schedules that read, deliberately: rotation here is for cause and
# never on a clock.
#
# The two human-identity paths fail the same silent way. Both runtime trust
# policies name the IAM user footbag-operator and the shared job role by literal ARN,
# and AWS resolves each of those to an internal id at save time, so a user or a
# role recreated under the same name leaves a trust policy that still reads
# correctly and refuses every AssumeRole, with no terraform plan diff to show
# for it. Only a comparison against what is live catches it.
#
# So this reads all of it in one pass and exits non-zero on anything failing,
# which makes it usable as a gate rather than only as a report.
#
# WHAT IT DELIBERATELY DOES NOT DO.
#
#   - Change anything. Every call here is a read. There is no --fix, because
#     three of these controls belong in Terraform rather than in a script that
#     sets them once, and the fourth is a governance decision about who the
#     association wants notified.
#   - Judge whether a key SHOULD be rotated. It reports age and last use; the
#     rotation rule is evidence-driven and the trigger is a human's call.
#   - Check anything environment-specific. This is the account, so there is no
#     --target: staging and production share one.
#
# Usage:
#   bash scripts/verify-account-baseline.sh --profile <p>
#
# Flags:
#   --profile <p>   AWS profile; else the identity this run settles and proves.
#   --quiet         only print failures.
#
# Exit: 0 everything passes, 1 one or more findings, 2 usage error.
#
# Test seam (CI only; operators never set this): ACCOUNT_BASELINE_AWS_BIN
# replaces the aws CLI. A run using it says so, because this script exists to be
# evidence and stubbed evidence is worth nothing.
set -euo pipefail

# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/aws-profile.sh"

AWS_BIN="${ACCOUNT_BASELINE_AWS_BIN:-aws}"
# The IAM user footbag-operator, and the two roles whose trust policies name it. Both
# are checked below because nothing else in the tree watches either, and losing
# either one strands every operator on a path that has no replacement yet.
FOOTBAG_OPERATOR_USER="footbag-operator"
STAGING_RUNTIME_ROLE="footbag-staging-app-runtime"
PRODUCTION_RUNTIME_ROLE="footbag-production-app-runtime"
RUNTIME_ROLES=("$STAGING_RUNTIME_ROLE" "$PRODUCTION_RUNTIME_ROLE")
# The shared job role every named human operator assumes. An ordinary IAM role
# with a name this project chose, so its ARN is predictable from the account id
# and nothing has to read it back to find out what it is called.
#
# It is checked against both runtime trust documents, for opposite answers:
# staging must name it, because the reads a deploy makes are that job, and
# production must not. Production naming it is a finding rather than a pass,
# because production's tree declares no variable that could put it there, so an
# ARN found in that trust was added by hand and nothing else would report it.
DEV_TESTER_ROLE="$FOOTBAG_DEV_TESTER_ROLE"
PROFILE=""
QUIET=0

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

AWS_ARGS=()
if [[ -n "$PROFILE" ]]; then
  AWS_ARGS+=(--profile "$PROFILE")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. Nothing here asks the operator to export anything.
  aws_profile_ensure || exit 1
fi

if [[ "$AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
fi

FINDINGS=0
# Controls that are deliberately off, counted apart from findings because they
# are not faults.
#
# A verdict has to distinguish the outcomes it is asked about, and this one
# could not. The three alternate contacts sit behind a flag that stays off until
# their identities are decided, so counting them as findings made the exit
# status non-zero before an apply and non-zero after a completely successful
# one, leaving an operator to tell the two apart by counting failure lines. The
# denial proof already carries a third verdict for the same reason; this is the
# same move.
GATED=0

pass() { (( QUIET )) || printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; FINDINGS=$(( FINDINGS + 1 )); }
# Reported on stderr beside the findings, because an operator reading for
# problems should see it, and counted separately, because it is not one.
gated() { printf '  GATED %s\n' "$1" >&2; GATED=$(( GATED + 1 )); }
note() { (( QUIET )) || printf '        %s\n' "$1"; }

aws_q() { "$AWS_BIN" "$@" ${AWS_ARGS[@]+"${AWS_ARGS[@]}"} 2>/dev/null; }

ACCOUNT_ID="$(aws_q sts get-caller-identity --query Account --output text || true)"
if [[ -z "$ACCOUNT_ID" || "$ACCOUNT_ID" == "None" ]]; then
  echo "ERROR: could not resolve an identity, so nothing below could be read." >&2
  echo "       Check the profile and that its key still authenticates." >&2
  exit 1
fi

echo "Account baseline for ${ACCOUNT_ID}"
echo ""

# ── 1. Account-wide public access block on storage ───────────────────────────
#
# Per-bucket settings already exist; this is the account-wide backstop that
# survives a bucket created later without them, which is the case it exists for.
echo "Storage"
PAB="$(aws_q s3control get-public-access-block --account-id "$ACCOUNT_ID" \
  --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text || true)"
if [[ -z "$PAB" ]]; then
  fail "account-level public access block is not configured at all"
  note "aws s3control put-public-access-block, or better, declare it in the shared tree"
elif [[ "$PAB" == *"False"* || "$PAB" == *"false"* ]]; then
  fail "account-level public access block has settings switched off: ${PAB}"
  note "all four must be true; a bucket created later inherits whatever this says"
else
  pass "account-level public access block: all four settings on"
fi

# ── 2. IAM password policy ───────────────────────────────────────────────────
echo ""
echo "Identity"
PWPOL="$(aws_q iam get-account-password-policy --output json || true)"
if [[ -z "$PWPOL" ]]; then
  fail "no IAM account password policy is set"
  note "without one a console user can be created later with a weak password"
else
  MINLEN="$(printf '%s' "$PWPOL" | jq -r '.PasswordPolicy.MinimumPasswordLength // 0' 2>/dev/null || echo 0)"
  REUSE="$(printf '%s' "$PWPOL" | jq -r '.PasswordPolicy.PasswordReusePrevention // 0' 2>/dev/null || echo 0)"
  if (( MINLEN >= 14 )); then
    pass "password policy: minimum length ${MINLEN}"
  else
    fail "password policy minimum length is ${MINLEN}; 14 or more is the baseline"
  fi
  if (( REUSE >= 1 )); then
    pass "password policy: reuse prevention ${REUSE}"
  else
    fail "password policy does not prevent password reuse"
  fi
fi

# ── 3. Access Analyzer ───────────────────────────────────────────────────────
#
# It reports any resource policy granting access outside the account, which is
# the class of mistake least likely to be noticed by reading Terraform.
# Filtered on TYPE as well as status. The console offers two kinds and only one
# of them answers the question this check is asking: an ACCOUNT_UNUSED_ACCESS
# analyzer reports unused roles and permissions, which is useful and is not
# external access. Passing on any active analyzer would report the control as in
# place while the class of mistake it exists to catch went unwatched.
ANALYZERS="$(aws_q accessanalyzer list-analyzers \
  --query 'analyzers[?status==`ACTIVE` && (type==`ACCOUNT` || type==`ORGANIZATION`)].name' \
  --output text || true)"
if [[ -n "$ANALYZERS" ]]; then
  pass "Access Analyzer active for external access: ${ANALYZERS}"
else
  fail "no active IAM Access Analyzer of an external-access type"
  note "it finds resource policies granting access outside the account; an"
  note "unused-access analyzer is a different tool and does not cover this"
fi

# ── 4. Alternate contacts ────────────────────────────────────────────────────
#
# Unset means every notice of that kind reaches only the root mailbox, and
# nobody is told if it goes unread.
echo ""
echo "Notification reachability"
for kind in BILLING OPERATIONS SECURITY; do
  CONTACT="$(aws_q account get-alternate-contact --alternate-contact-type "$kind" \
    --query 'AlternateContact.EmailAddress' --output text || true)"
  if [[ -n "$CONTACT" && "$CONTACT" != "None" ]]; then
    pass "alternate contact ${kind} is set"
  else
    gated "alternate contact ${kind} is unset, which is the declared state"
  fi
done

# ── 5. Root account posture ──────────────────────────────────────────────────
echo ""
echo "Root account"
SUMMARY="$(aws_q iam get-account-summary --output json || true)"
if [[ -z "$SUMMARY" ]]; then
  fail "could not read the account summary"
else
  ROOT_MFA="$(printf '%s' "$SUMMARY" | jq -r '.SummaryMap.AccountMFAEnabled // 0' 2>/dev/null || echo 0)"
  ROOT_KEYS="$(printf '%s' "$SUMMARY" | jq -r '.SummaryMap.AccountAccessKeysPresent // 0' 2>/dev/null || echo 0)"
  if [[ "$ROOT_MFA" == "1" ]]; then
    pass "root has MFA enabled"
  else
    fail "root has NO MFA enabled"
  fi
  if [[ "$ROOT_KEYS" == "0" ]]; then
    pass "root holds no access keys"
  else
    fail "root holds ${ROOT_KEYS} access key(s); root should hold none"
    note "a root access key bypasses every guard rail in the account"
  fi
fi

# ── 6. Every IAM user's keys, with age and last use ──────────────────────────
#
# Age and last use in one place, rather than a console trip per key. Reported
# rather than judged: rotation is for cause and never on a clock, so whether any
# of this amounts to a reason is a human's call.
echo ""
echo "Access keys"
USERS="$(aws_q iam list-users --query 'Users[].UserName' --output text || true)"
if [[ -z "$USERS" ]]; then
  fail "could not list IAM users"
else
  NOW="$(date -u +%s)"
  for user in $USERS; do
    ROWS="$(aws_q iam list-access-keys --user-name "$user" \
      --query 'AccessKeyMetadata[].[AccessKeyId,Status,CreateDate]' --output text || true)"
    if [[ -z "$ROWS" ]]; then
      (( QUIET )) || printf '  ----  %s: no access keys\n' "$user"
      continue
    fi
    while IFS=$'\t' read -r akid status created; do
      [[ -n "$akid" ]] || continue
      CREATED_EPOCH="$(date -u -d "$created" +%s 2>/dev/null || echo "$NOW")"
      AGE_DAYS=$(( ( NOW - CREATED_EPOCH ) / 86400 ))
      LASTUSED="$(aws_q iam get-access-key-last-used --access-key-id "$akid" \
        --query 'AccessKeyLastUsed.LastUsedDate' --output text || true)"
      [[ -z "$LASTUSED" || "$LASTUSED" == "None" ]] && LASTUSED="never used"
      printf '  ----  %-34s %-8s %-9s age %sd  last %s\n' \
        "$user" "$akid" "$status" "$AGE_DAYS" "$LASTUSED"
    done <<< "$ROWS"
  done
  note "read these against the rotation triggers: an operator leaving, a"
  note "suspected exposure, use from an unexpected source or region, or a key"
  note "idle long enough that its existence is no longer justified"
fi

# ── 7. The IAM user footbag-operator, and the two paths that depend on it ────
#
# The section above reports every key; this one asserts the three things whose
# ABSENCE is the finding, which is the opposite direction and the reason it is
# separate.
#
# The design retains this IAM user permanently as the directly authenticated
# identity: the one directly authenticated way in, deliberately reached without assuming
# anything, so that whatever breaks the job role cannot take the normal route
# and the way back in down together. Every named operator's path is added
# beside it, never in place of it. So a run that finds no active key here has
# found that fallback gone.
#
# The two runtime trust policies name that user by literal ARN, and the chained
# runtime profiles resolve through them. Removing either entry cannot be undone
# by recreating the user, because a recreated user has a different principal.
# Nothing else in this tree reads those policies, which is why they are here
# rather than left to surface as a deploy failing weeks later.
echo ""
echo "Directly authenticated IAM user ${FOOTBAG_OPERATOR_USER}"
BG_ROWS="$(aws_q iam list-access-keys --user-name "$FOOTBAG_OPERATOR_USER" \
  --query 'AccessKeyMetadata[?Status==`Active`].AccessKeyId' --output text || true)"
if [[ -z "$BG_ROWS" || "$BG_ROWS" == "None" ]]; then
  fail "${FOOTBAG_OPERATOR_USER} holds no active access key, or could not be read"
  note "it is the way back in when whatever else broke is the job role itself"
else
  # The ids are printed rather than discarded. This call already returned them
  # and reported only that there was one, which left "this identity is unchanged
  # across the walk" as two hand-composed calls at the start and the end and a
  # comparison made by eye. An access key id is not a secret, so it is evidence
  # that can simply be shown.
  pass "${FOOTBAG_OPERATOR_USER} holds an active access key: ${BG_ROWS}"
fi

# The other half of the same evidence. Nothing here judges it: what it should be
# is a question about this account rather than something this script can know,
# and the value of printing it is that two runs can be compared.
BG_ATTACHED="$(aws_q iam list-attached-user-policies --user-name "$FOOTBAG_OPERATOR_USER" \
  --query 'AttachedPolicies[].PolicyName' --output text || true)"
BG_INLINE="$(aws_q iam list-user-policies --user-name "$FOOTBAG_OPERATOR_USER" \
  --query 'PolicyNames' --output text || true)"
note "attached: ${BG_ATTACHED:-<none>}"
note "inline:   ${BG_INLINE:-<none>}"

for role in "${RUNTIME_ROLES[@]}"; do
  TRUST="$(aws_q iam get-role --role-name "$role" \
    --query 'Role.AssumeRolePolicyDocument' --output json || true)"
  if [[ -z "$TRUST" ]]; then
    fail "${role}: could not read the trust policy"
  elif printf '%s' "$TRUST" | grep -qF ":user/${FOOTBAG_OPERATOR_USER}"; then
    pass "${role} still trusts ${FOOTBAG_OPERATOR_USER}"
  else
    fail "${role} no longer names ${FOOTBAG_OPERATOR_USER} in its trust policy"
    note "the chained runtime profiles resolve through this, and a recreated"
    note "user is a different principal, so this is not undone by recreating it"
  fi
done

# ── 8. The shared job role, and the two trust documents that disagree about it ──
#
# An ordinary IAM role with a name this project chose, so unlike the thing that
# stood here before it there is no generated suffix to go stale and nothing to
# read back in order to learn what the role is called. What still has to be
# checked is the pair of runtime trust policies, which name it by literal ARN
# and must disagree: staging names it, production does not.
#
# Before the identity tree is applied this section has nothing to compare and
# says so rather than failing. The role's absence is the current state of the
# estate, not a finding.
echo ""
echo "Human operator job role"

DEV_TESTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${DEV_TESTER_ROLE}"
DEV_TESTER_PRESENT=0
if aws_q iam get-role --role-name "$DEV_TESTER_ROLE" >/dev/null 2>&1; then
  DEV_TESTER_PRESENT=1
  pass "${DEV_TESTER_ROLE}: ${DEV_TESTER_ROLE_ARN}"
else
  note "no ${DEV_TESTER_ROLE} role yet: the account-level identity tree has not"
  note "been applied, so no named operator can act as anything but themselves."
  note "Nothing to compare against the runtime trust policies until it has."
fi

# One runtime role's trust document, or an empty string when it could not be
# read. Which principals it names is the question every comparison below asks.
read_trust() {
  aws_q iam get-role --role-name "$1" --query 'Role.AssumeRolePolicyDocument' \
    --output json || true
}

if (( DEV_TESTER_PRESENT )); then
  # Staging must name it, because the reads a deploy makes are that job.
  STAGING_TRUST="$(read_trust "$STAGING_RUNTIME_ROLE")"
  if [[ -z "$STAGING_TRUST" ]]; then
    fail "${STAGING_RUNTIME_ROLE}: could not read the trust policy to compare the job role"
  elif printf '%s' "$STAGING_TRUST" | grep -qF "$DEV_TESTER_ROLE_ARN"; then
    pass "${STAGING_RUNTIME_ROLE} trusts ${DEV_TESTER_ROLE}"
  else
    fail "${STAGING_RUNTIME_ROLE} does not name ${DEV_TESTER_ROLE_ARN}"
    note "a named operator can authenticate and reach nothing a deploy needs, which"
    note "reads as a broken account rather than as a missing principal"
    note "set dev_tester_role_arn to the ARN above and apply staging"
  fi

  # Production must not, and its absence there cannot be asserted from that
  # tree's configuration: production declares no variable to set it, so an ARN
  # found in that trust was put there by hand and nothing else would report it.
  PRODUCTION_TRUST="$(read_trust "$PRODUCTION_RUNTIME_ROLE")"
  if [[ -z "$PRODUCTION_TRUST" ]]; then
    fail "${PRODUCTION_RUNTIME_ROLE}: could not read the trust policy to check the job role is absent"
  elif printf '%s' "$PRODUCTION_TRUST" | grep -qF "$DEV_TESTER_ROLE_ARN"; then
    fail "${PRODUCTION_RUNTIME_ROLE} names ${DEV_TESTER_ROLE}"
    note "that role's job is staging, and this grant is the one thing the boundary"
    note "between the two environments exists to prevent. Nothing in production's"
    note "tree can produce it, so it was added by hand: remove the principal and"
    note "apply production."
  else
    pass "${PRODUCTION_RUNTIME_ROLE} does not name ${DEV_TESTER_ROLE}"
  fi
fi

# ── 9. The dormant Identity Center instance, and that it stays dormant ────────
#
# An IAM Identity Center instance and an AWS organization exist in this account.
# They were created by hand while a federated operator model was being
# evaluated, Terraform was never applied against them, and the model was
# abandoned. They are kept rather than deleted: both are inert, both are free,
# both are prerequisites if federation is ever revisited, and the organization
# is the prerequisite for the separate emergency-access account that AWS
# break-glass guidance actually recommends and this setup lacks.
#
# Kept is not the same as unwatched. An Identity Center instance that grows a
# permission set or a directory user is a second way into this account that
# nothing else in the tree looks at, that no Terraform plan would show a diff
# for, and that no operator would have reason to check. Dormancy is therefore
# asserted rather than assumed, and a non-zero count is a finding.
echo ""
echo "Identity Center dormancy"

SSO_INSTANCE="$(aws_q sso-admin list-instances \
  --query 'Instances[].[InstanceArn,IdentityStoreId]' --output text || true)"
if [[ -z "$SSO_INSTANCE" || "$SSO_INSTANCE" == "None" ]]; then
  pass "no Identity Center instance in this account"
else
  # shellcheck disable=SC2086
  set -- $SSO_INSTANCE
  SSO_INSTANCE_ARN="$1"
  SSO_STORE_ID="${2:-}"
  note "the dormant instance is present, which is expected: ${SSO_INSTANCE_ARN}"

  # Counted rather than listed, and the read's own failure kept separate from a
  # count of zero: an access denial and an empty instance arrive here the same
  # way, and reporting the first as the second is how this gate would pass
  # having checked nothing.
  if SSO_SETS="$(aws_q sso-admin list-permission-sets \
    --instance-arn "$SSO_INSTANCE_ARN" \
    --query 'length(PermissionSets)' --output text)"; then
    if [[ "$SSO_SETS" == "0" || "$SSO_SETS" == "None" ]]; then
      pass "it carries no permission sets"
    else
      fail "the dormant instance carries ${SSO_SETS} permission set(s)"
      note "nothing in this repository creates one, so it was made by hand. A"
      note "permission set is a way into this account that no Terraform plan shows"
      note "and no other check here looks at."
    fi
  else
    fail "could not read the permission sets of the dormant instance"
    note "this is not the same as there being none: the call did not answer, so"
    note "dormancy was not checked rather than confirmed."
  fi

  if [[ -n "$SSO_STORE_ID" && "$SSO_STORE_ID" != "None" ]]; then
    if SSO_USERS="$(aws_q identitystore list-users \
      --identity-store-id "$SSO_STORE_ID" \
      --query 'length(Users)' --output text)"; then
      if [[ "$SSO_USERS" == "0" || "$SSO_USERS" == "None" ]]; then
        pass "its directory holds no users"
      else
        fail "the dormant directory holds ${SSO_USERS} user(s)"
        note "a directory user is a person who can sign in to this account by a"
        note "path the named-IAM-user model does not account for."
      fi
    else
      fail "could not read the users of the dormant directory"
      note "the call did not answer, so this was not checked rather than confirmed."
    fi
  fi
fi

echo ""
# The gated count is stated on both paths, because a run that said nothing about
# it would read as though those controls had passed.
if (( GATED )); then
  echo "${GATED} control(s) deliberately off: the alternate contacts sit behind" >&2
  echo "enable_account_alternate_contacts, which stays off until the three" >&2
  echo "identities are decided and their values are in the shared tree's secrets" >&2
  echo "file. They are not findings and do not decide this run." >&2
  echo "" >&2
fi

if (( FINDINGS == 0 )); then
  echo "No findings."
  exit 0
fi
echo "${FINDINGS} finding(s)." >&2
echo "" >&2
echo "All four account controls are declared in terraform/shared/account-baseline.tf." >&2
echo "The public-access block, the password policy and Access Analyzer carry no" >&2
echo "values and apply as they stand. Apply the shared tree as the" >&2
echo "directly authenticated identity; the job role cannot read its state," >&2
echo "deliberately." >&2
exit 1
