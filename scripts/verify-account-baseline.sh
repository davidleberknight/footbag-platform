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
# The emergency identity, and the two roles whose trust policies name it. Both
# are checked below because nothing else in the tree watches either, and losing
# either one strands every operator on a path that has no replacement yet.
BREAK_GLASS_USER="footbag-operator"
RUNTIME_ROLES=("footbag-staging-app-runtime" "footbag-production-app-runtime")
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

# ── 7. The break-glass identity, and the two paths that depend on it ─────────
#
# The section above reports every key; this one asserts the three things whose
# ABSENCE is the finding, which is the opposite direction and the reason it is
# separate.
#
# The design retains this IAM user deliberately as the emergency identity: the
# one directly authenticated way in, kept unfederated so a failure of the
# identity provider cannot take the normal route and the emergency route down
# together. Federation is added beside it, never in place of it. So a run that
# finds no active key here has found the emergency route gone.
#
# The two runtime trust policies name that user by literal ARN, and the chained
# runtime profiles resolve through them. Removing either entry cannot be undone
# by recreating the user, because a recreated user has a different principal.
# Nothing else in this tree reads those policies, which is why they are here
# rather than left to surface as a deploy failing weeks later.
echo ""
echo "Break-glass identity"
BG_ROWS="$(aws_q iam list-access-keys --user-name "$BREAK_GLASS_USER" \
  --query 'AccessKeyMetadata[?Status==`Active`].AccessKeyId' --output text || true)"
if [[ -z "$BG_ROWS" || "$BG_ROWS" == "None" ]]; then
  fail "${BREAK_GLASS_USER} holds no active access key, or could not be read"
  note "it is the way back in when the federated path itself is what has failed"
else
  pass "${BREAK_GLASS_USER} holds an active access key"
fi

for role in "${RUNTIME_ROLES[@]}"; do
  TRUST="$(aws_q iam get-role --role-name "$role" \
    --query 'Role.AssumeRolePolicyDocument' --output json || true)"
  if [[ -z "$TRUST" ]]; then
    fail "${role}: could not read the trust policy"
  elif printf '%s' "$TRUST" | grep -qF ":user/${BREAK_GLASS_USER}"; then
    pass "${role} still trusts ${BREAK_GLASS_USER}"
  else
    fail "${role} no longer names ${BREAK_GLASS_USER} in its trust policy"
    note "the chained runtime profiles resolve through this, and a recreated"
    note "user is a different principal, so this is not undone by recreating it"
  fi
done

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
