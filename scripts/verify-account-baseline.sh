#!/usr/bin/env bash
# verify-account-baseline.sh
#
# Reads the account-level security controls and says which are in place. Makes
# no change of any kind.
#
# WHY THIS EXISTS.
#
# The account lockdown checklist is four console steps, and nothing re-asserts
# them. A console-set control has no Terraform behind it, so nothing detects it
# being turned off, nothing notices it was never turned on, and the checklist is
# the only record that it was ever meant to exist. Key usage has the same
# problem from the other direction: reading each key's last-used date meant a
# console trip, so it happened only if somebody remembered where to look. And
# nothing schedules that read, deliberately: rotation here is for cause and
# never on a clock.
#
# The two human-identity paths fail the same silent way. Both runtime trust
# policies name the super-admin user and the federated operator role by literal
# ARN, and AWS resolves each of those to an internal id at save time, so a user
# or a permission set recreated under the same name leaves a trust policy that
# still reads correctly and refuses every AssumeRole, with no terraform plan
# diff to show for it. Only a comparison against the live ARN catches it.
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
# The super-admin identity, and the two roles whose trust policies name it. Both
# are checked below because nothing else in the tree watches either, and losing
# either one strands every operator on a path that has no replacement yet.
SUPER_ADMIN_USER="footbag-operator"
STAGING_RUNTIME_ROLE="footbag-staging-app-runtime"
PRODUCTION_RUNTIME_ROLE="footbag-production-app-runtime"
RUNTIME_ROLES=("$STAGING_RUNTIME_ROLE" "$PRODUCTION_RUNTIME_ROLE")
# The two human-operator permission sets. Identity Center generates the IAM role
# behind each with a suffix nobody chooses, so both live ARNs are read back and
# compared against the trust policies rather than assumed to still match.
#
# They are checked against different documents, which is the point of the split:
# the super-admin role belongs in both runtime trust policies, and the
# dev-and-tester role belongs in staging's and in no other. Production naming it
# is a finding rather than a pass, because production's tree declares no variable
# that could put it there.
SUPER_ADMIN_PERMISSION_SET="FootbagSuperAdmin"
DEV_TESTER_PERMISSION_SET="FootbagDevTester"
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

pass() { (( QUIET )) || printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; FINDINGS=$(( FINDINGS + 1 )); }
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
    fail "alternate contact ${kind} is unset"
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

# ── 7. The super-admin identity, and the two paths that depend on it ─────────
#
# The section above reports every key; this one asserts the three things whose
# ABSENCE is the finding, which is the opposite direction and the reason it is
# separate.
#
# The design retains this IAM user permanently as the super-admin identity: the
# one directly authenticated way in, kept unfederated so a failure of the
# identity provider cannot take the normal route and the way back in down
# together. Federation is added beside it, never in place of it. So a run that
# finds no active key here has found that fallback gone.
#
# The two runtime trust policies name that user by literal ARN, and the chained
# runtime profiles resolve through them. Removing either entry cannot be undone
# by recreating the user, because a recreated user has a different principal.
# Nothing else in this tree reads those policies, which is why they are here
# rather than left to surface as a deploy failing weeks later.
echo ""
echo "Super-admin identity"
BG_ROWS="$(aws_q iam list-access-keys --user-name "$SUPER_ADMIN_USER" \
  --query 'AccessKeyMetadata[?Status==`Active`].AccessKeyId' --output text || true)"
if [[ -z "$BG_ROWS" || "$BG_ROWS" == "None" ]]; then
  fail "${SUPER_ADMIN_USER} holds no active access key, or could not be read"
  note "it is the way back in when the federated path itself is what has failed"
else
  pass "${SUPER_ADMIN_USER} holds an active access key"
fi

for role in "${RUNTIME_ROLES[@]}"; do
  TRUST="$(aws_q iam get-role --role-name "$role" \
    --query 'Role.AssumeRolePolicyDocument' --output json || true)"
  if [[ -z "$TRUST" ]]; then
    fail "${role}: could not read the trust policy"
  elif printf '%s' "$TRUST" | grep -qF ":user/${SUPER_ADMIN_USER}"; then
    pass "${role} still trusts ${SUPER_ADMIN_USER}"
  else
    fail "${role} no longer names ${SUPER_ADMIN_USER} in its trust policy"
    note "the chained runtime profiles resolve through this, and a recreated"
    note "user is a different principal, so this is not undone by recreating it"
  fi
done

# ── 8. The federated operator role, and the suffix that silently invalidates ──
#
# Identity Center generates the IAM role behind the permission set as
# AWSReservedSSO_<name>_<suffix>, and the suffix is generated. Both runtime trust
# policies name that role by literal ARN, so deleting and recreating the
# permission set produces a new suffix and leaves both policies pointing at a
# principal that no longer exists. Nothing reports that: the trust reads
# correctly, terraform plan shows no diff because the configuration still holds
# the old string, and the failure surfaces weeks later as an AssumeRole that
# refuses.
#
# The alternative was to trust the reserved SSO path by pattern, which survives
# recreation but widens the trust to any SSO role in the account. A check that
# already runs costs less than that.
#
# Before the federated path exists this section has nothing to say, and says so
# rather than failing: the role's absence is the current state of the estate, not
# a finding.
echo ""
echo "Federated operator role"

# The instance first, because it is the thing the console enable produced and
# nothing else in this tree reads it. Without this an operator asking whether the
# enable took has no scripted way to find out, and the answer arrives as a
# hand-typed CLI call — which is the shape this whole script exists to replace.
SSO_INSTANCE="$(aws_q sso-admin list-instances \
  --query 'Instances[].[InstanceArn,IdentityStoreId]' --output text || true)"
if [[ -z "$SSO_INSTANCE" || "$SSO_INSTANCE" == "None" ]]; then
  note "no IAM Identity Center instance: the federated path is not stood up, and"
  note "every operator action is still attributed to ${SUPER_ADMIN_USER}"
else
  pass "Identity Center instance: ${SSO_INSTANCE}"
fi

# The exit status is kept rather than discarded, because a read that could not be
# made and a role that does not exist both arrive here as an empty string. Only
# the second is the current state of the estate; the first is an access denial, a
# throttle or an expired credential, and reporting it as "nothing stood up yet"
# silences the comparison below and lets the whole gate exit green while having
# checked nothing.
#
# What each answer means differs between the two permission sets, so this reads
# one and reports on it, and the caller decides which trust documents must name
# it. GENERATED_ROLE_STATUS carries the verdict: `ok` with an ARN to compare,
# `absent` for a set no role has been generated behind yet, and `failed` or
# `ambiguous` for the two cases it has already reported.
GENERATED_ROLE_ARN=""
GENERATED_ROLE_STATUS=""

read_generated_role() {
  local set_name="$1"
  local answer="" count=0
  GENERATED_ROLE_ARN=""
  GENERATED_ROLE_STATUS="ok"

  if ! answer="$(aws_q iam list-roles --path-prefix '/aws-reserved/sso.amazonaws.com/' \
    --query "Roles[?starts_with(RoleName, \`AWSReservedSSO_${set_name}_\`)].Arn" \
    --output text)"; then
    fail "could not read the generated ${set_name} role"
    note "this is not the same as the role being absent: the call itself did not"
    note "answer, so the comparison against the runtime trust policies below was"
    note "skipped rather than passed. Check the profile still authenticates and that"
    note "it carries iam:ListRoles on the reserved SSO path."
    GENERATED_ROLE_STATUS="failed"
    return
  fi

  # `--output text` separates a list with tabs, so two matching roles arrive
  # joined on one line. Used whole, that string is a needle no trust document can
  # contain, and every runtime role then fails the comparison below even when its
  # trust is correct — which reads as a broken trust policy rather than as the
  # recreated permission set it actually is.
  if [[ -n "$answer" && "$answer" != "None" ]]; then
    # shellcheck disable=SC2086
    set -- $answer
    count=$#
    GENERATED_ROLE_ARN="$1"
  fi

  if (( count > 1 )); then
    fail "${count} roles match AWSReservedSSO_${set_name}_*"
    note "the suffix is generated, so a permission set that was deleted and recreated"
    note "leaves a role behind under the old one. Which of them the operators actually"
    note "assume is the question, so nothing is compared against a guess:"
    # shellcheck disable=SC2086
    printf '        %s\n' $answer
    GENERATED_ROLE_ARN=""
    GENERATED_ROLE_STATUS="ambiguous"
    return
  fi

  if [[ -z "$GENERATED_ROLE_ARN" ]]; then
    GENERATED_ROLE_STATUS="absent"
    return
  fi

  pass "${set_name} role: ${GENERATED_ROLE_ARN}"
}

# One runtime role's trust document, or an empty string when it could not be
# read. Which principals it names is the question every comparison below asks.
read_trust() {
  aws_q iam get-role --role-name "$1" --query 'Role.AssumeRolePolicyDocument' \
    --output json || true
}

# The super-admin role belongs in both trust policies: its job is the whole
# estate, and production is reachable from no other federated role.
read_generated_role "$SUPER_ADMIN_PERMISSION_SET"
SUPER_ADMIN_ROLE_ARN="$GENERATED_ROLE_ARN"
if [[ "$GENERATED_ROLE_STATUS" == "absent" ]]; then
  note "no ${SUPER_ADMIN_PERMISSION_SET} role yet: operators still authenticate as"
  note "${SUPER_ADMIN_USER}, which keeps the super-admin work the roles do not"
  note "carry. Nothing to compare until the identity tree is applied."
elif [[ "$GENERATED_ROLE_STATUS" == "ok" ]]; then
  for role in "${RUNTIME_ROLES[@]}"; do
    TRUST="$(read_trust "$role")"
    if [[ -z "$TRUST" ]]; then
      fail "${role}: could not read the trust policy to compare the operator role"
    elif printf '%s' "$TRUST" | grep -qF "$SUPER_ADMIN_ROLE_ARN"; then
      pass "${role} trusts the live ${SUPER_ADMIN_PERMISSION_SET} role"
    else
      fail "${role} does not name the live ${SUPER_ADMIN_PERMISSION_SET} role ARN"
      note "the generated suffix changes whenever the permission set is recreated,"
      note "and the stale ARN keeps reading as a valid trust while granting nothing"
      note "set super_admin_sso_role_arn to the ARN above and apply both environments"
    fi
  done
fi

# The dev-and-tester role is checked against both documents too, but for opposite
# answers. Staging must name it, because the reads a deploy makes are that job.
# Production must not, and its absence there cannot be asserted from that tree's
# configuration: production declares no variable to set it, so an ARN found in
# that trust was put there by hand and nothing else would ever report it.
read_generated_role "$DEV_TESTER_PERMISSION_SET"
DEV_TESTER_ROLE_ARN="$GENERATED_ROLE_ARN"
if [[ "$GENERATED_ROLE_STATUS" == "absent" ]]; then
  note "no ${DEV_TESTER_PERMISSION_SET} role yet: either the identity tree has not"
  note "been applied, or nobody on the roster holds that job. An unassigned"
  note "permission set generates no role, and staging then names no such principal."
elif [[ "$GENERATED_ROLE_STATUS" == "ok" ]]; then
  STAGING_TRUST="$(read_trust "$STAGING_RUNTIME_ROLE")"
  if [[ -z "$STAGING_TRUST" ]]; then
    fail "${STAGING_RUNTIME_ROLE}: could not read the trust policy to compare the dev-and-tester role"
  elif printf '%s' "$STAGING_TRUST" | grep -qF "$DEV_TESTER_ROLE_ARN"; then
    pass "${STAGING_RUNTIME_ROLE} trusts the live ${DEV_TESTER_PERMISSION_SET} role"
  else
    fail "${STAGING_RUNTIME_ROLE} does not name the live ${DEV_TESTER_PERMISSION_SET} role ARN"
    note "a dev-and-tester can sign in and reach nothing a deploy needs, which reads"
    note "as a broken account rather than as a missing principal"
    note "set dev_tester_sso_role_arn to the ARN above and apply staging"
  fi

  PRODUCTION_TRUST="$(read_trust "$PRODUCTION_RUNTIME_ROLE")"
  if [[ -z "$PRODUCTION_TRUST" ]]; then
    fail "${PRODUCTION_RUNTIME_ROLE}: could not read the trust policy to check the dev-and-tester role is absent"
  elif printf '%s' "$PRODUCTION_TRUST" | grep -qF "$DEV_TESTER_ROLE_ARN"; then
    fail "${PRODUCTION_RUNTIME_ROLE} names the ${DEV_TESTER_PERMISSION_SET} role"
    note "that role's job is staging, and this grant is the one thing the split into"
    note "two roles exists to prevent. Nothing in production's tree can produce it,"
    note "so it was added by hand: remove the principal and apply production."
  else
    pass "${PRODUCTION_RUNTIME_ROLE} does not name the ${DEV_TESTER_PERMISSION_SET} role"
  fi
fi

echo ""
if (( FINDINGS == 0 )); then
  echo "No findings."
  exit 0
fi
echo "${FINDINGS} finding(s)." >&2
echo "" >&2
echo "Three of these belong in the shared Terraform tree rather than in a console:" >&2
echo "the public-access block, the password policy and Access Analyzer all have" >&2
echo "provider resources. The alternate contacts are the genuine exception, since" >&2
echo "what goes in those fields is a decision about who the association wants" >&2
echo "notified rather than a mechanism." >&2
exit 1
