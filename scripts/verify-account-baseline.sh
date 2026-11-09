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
#   bash scripts/verify-account-baseline.sh --save
#   bash scripts/verify-account-baseline.sh --compare <the file --save printed> \
#     [--ignore-user <name>]...
#
# Flags:
#   --profile <p>   AWS profile; else the identity this run settles and proves.
#   --quiet         only print failures.
#   --save          instead of the report, record the facts that must not change
#                   under anybody else's work: footbag-operator's unique id, every
#                   key and its status, its attached and inline policies, its MFA
#                   device, whether it has a console sign-in, and its tags; every
#                   user's keys and their status; and both runtime trust
#                   documents, canonical JSON. Written to
#                   ${TMPDIR:-/tmp}/footbag-baseline-<uid>/baseline-<date>.txt,
#                   mode 600 in a mode-700 directory, never over an existing file.
#   --compare <file>
#                   instead of the report, read the same facts and compare them
#                   with a saved file, printing every difference.
#   --ignore-user <name>
#                   with --compare: leave that user's own keys out, for the one
#                   change a dev-and-tester lifecycle is expected to make. Never
#                   footbag-operator.
#
# Exit: 0 everything passes (or saved, or the same), 1 one or more findings or
# a fact that could not be read, 2 usage error, 3 the compared facts differ.
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
# The shared job role every named dev-and-tester assumes. An ordinary IAM role
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
MODE="report"
COMPARE_FILE=""
IGNORE_USERS=()
# A trust document in one canonical form: keys sorted, and every array sorted.
# AWS stores a trust's principals as internal ids and writes them back in no
# fixed order, so the same trust read twice can list the same principals in a
# different order. Every array in a policy is a set (statements, principals,
# actions), so sorting them changes nothing about what the document allows.
TRUST_CANON='walk(if type == "array" then sort else . end)'

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
    --save) MODE="save"; shift ;;
    --compare)
      MODE="compare"
      COMPARE_FILE="${2:-}"
      shift 2 || { echo "ERROR: --compare requires a saved file" >&2; exit 2; }
      ;;
    --ignore-user)
      IGNORE_USERS+=("${2:-}")
      shift 2 || { echo "ERROR: --ignore-user requires a name" >&2; exit 2; }
      ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

if [[ "$MODE" == "compare" && ! -r "$COMPARE_FILE" ]]; then
  echo "ERROR: --compare needs a saved baseline file it can read; '${COMPARE_FILE}' is not one." >&2
  exit 2
fi
if (( ${#IGNORE_USERS[@]} )) && [[ "$MODE" != "compare" ]]; then
  echo "ERROR: --ignore-user goes with --compare." >&2
  exit 2
fi
for _ignored in ${IGNORE_USERS[@]+"${IGNORE_USERS[@]}"}; do
  if [[ "$_ignored" == "footbag-operator" || -z "$_ignored" ]]; then
    echo "ERROR: footbag-operator is the identity this comparison exists to hold" >&2
    echo "       still; it is never left out." >&2
    exit 2
  fi
done

# Every finding, every control deliberately off and every read that failed is
# listed once in the closing report at the end; the exit status follows from it.
# shellcheck source=lib/closing-report.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/closing-report.sh"

AWS_ARGS=()
if [[ -n "$PROFILE" ]]; then
  AWS_ARGS+=(--profile "$PROFILE")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. Nothing here asks the operator to export anything.
  aws_profile_ensure || cr_die "could not settle the AWS identity this run reads as"
fi

if [[ "$AWS_BIN" != "aws" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
fi

FINDINGS=0
# Controls that are deliberately off, counted apart from findings because they
# are not faults.
#
# A verdict has to distinguish the outcomes it is asked about, and this one
# could not. The two alternate contacts sit behind a flag that stays off until
# their values are set, so counting them as findings made the exit
# status non-zero before an apply and non-zero after a completely successful
# one, leaving an operator to tell the two apart by counting failure lines. The
# denial proof already carries a third verdict for the same reason; this is the
# same move.
GATED=0

pass() { (( QUIET )) || printf '  PASS  %s\n' "$1"; }
fail() { cr_error "$1"; FINDINGS=$(( FINDINGS + 1 )); }
# Listed as a warning beside the findings, because an operator reading for
# problems should see it, and counted separately, because it is not one.
gated() { cr_warn "GATED $1"; GATED=$(( GATED + 1 )); }
note() { (( QUIET )) || printf '        %s\n' "$1"; }

# AWS's own message from the last read is kept, so a read that failed is
# reported with its reason and never mistaken for an answer.
AWS_ERR="$(mktemp)"
cr_cleanup rm -f "$AWS_ERR"
aws_q() { "$AWS_BIN" "$@" ${AWS_ARGS[@]+"${AWS_ARGS[@]}"} 2>"$AWS_ERR"; }
aws_err() {
  local msg
  msg="$(grep -v '^[[:space:]]*$' "$AWS_ERR" | tail -n 1)"
  printf '%s' "${msg:-the aws CLI printed no message}"
}

# aws_read <var> <absent-error-code|-> <what> <aws args...>
# Reads into <var>. AWS answering that the thing does not exist, by the error
# code the API documents for it, reads as an empty answer, which each check
# judges as absence. Any other failure is a finding carrying AWS's own message,
# and returns 1 so no check is judged on a read that did not answer.
aws_read() {
  local _var="$1" _absent="$2" _what="$3" _out
  shift 3
  if _out="$(aws_q "$@")"; then
    printf -v "$_var" '%s' "$_out"
    return 0
  fi
  printf -v "$_var" '%s' ""
  if [[ "$_absent" != - ]] && grep -qF "(${_absent})" "$AWS_ERR"; then
    return 0
  fi
  fail "could not read ${_what}: $(aws_err)"
  return 1
}

ACCOUNT_ID="$(aws_q sts get-caller-identity --query Account --output text)" || ACCOUNT_ID=""
if [[ -z "$ACCOUNT_ID" || "$ACCOUNT_ID" == "None" ]]; then
  echo "       Check the profile and that its key still authenticates." >&2
  cr_die "could not resolve an identity, so nothing below could be read: $(aws_err)"
fi

# ── The facts that must not move, saved or compared ──────────────────────────
#
# A dev-and-tester's onboarding, offboarding and proving all run on a machine
# that also holds footbag-operator, and the requirement on every one of them is
# that the directly authenticated identity and both runtime trusts come out
# exactly as they went in. Saying so is a claim; saving these facts before and
# comparing after is the evidence. One fact per line, each read directly and
# normalized so that ordering and formatting never read as a change. A read that
# fails ends the run: a fact that could not be read is not the same fact.
baseline_facts() {
  local out user rows policy tags mfa login trust role
  # This runs in a pipeline's subshell, so the reason goes to a file the main
  # shell lists in its report.
  facts_fail() {
    printf 'could not read %s; nothing was saved or compared: %s\n' "$1" "${2:-$(aws_err)}" > "$FACTS_ERR"
    exit 1
  }

  out="$(aws_q iam get-user --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'User.[UserId,Arn,PermissionsBoundary.PermissionsBoundaryArn]' --output text)" \
    || facts_fail "${FOOTBAG_OPERATOR_USER}"
  printf 'operator.id\t%s\n' "$(cut -f1 <<<"$out")"
  printf 'operator.arn\t%s\n' "$(cut -f2 <<<"$out")"
  # A permissions boundary caps AdministratorAccess without touching the policy
  # list, so it is a fact of its own. The CLI prints None when there is none.
  local boundary
  boundary="$(cut -f3 <<<"$out")"
  [[ -z "$boundary" || "$boundary" == None ]] && boundary="none"
  printf 'operator.boundary\t%s\n' "$boundary"
  rows="$(aws_q iam list-access-keys --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'AccessKeyMetadata[].[AccessKeyId,Status]' --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s keys"
  while IFS=$'\t' read -r akid status; do
    [[ -n "$akid" ]] && printf 'operator.key\t%s %s\n' "$akid" "$status"
  done <<<"$rows"
  policy="$(aws_q iam list-attached-user-policies --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'AttachedPolicies[].PolicyArn' --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s attached policies"
  # The CLI prints None for an empty answer in text form; that is no entry.
  for p in $policy; do [[ "$p" == None ]] || printf 'operator.attached\t%s\n' "$p"; done
  policy="$(aws_q iam list-user-policies --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'PolicyNames' --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s inline policies"
  # Each inline policy by its content as well as its name, so an edit to the
  # document under an unchanged name is a change. Recorded as a digest of the
  # normalized document: the comparison needs equality, not the text.
  local doc digest
  for p in $policy; do
    [[ "$p" == None ]] && continue
    doc="$(aws_q iam get-user-policy --user-name "$FOOTBAG_OPERATOR_USER" --policy-name "$p" \
      --query 'PolicyDocument' --output json)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s inline policy ${p}"
    digest="$(jq -S -c . <<<"$doc" 2>/dev/null | sha256sum | cut -d' ' -f1)"
    [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || facts_fail "${FOOTBAG_OPERATOR_USER}'s inline policy ${p} as JSON"
    printf 'operator.inline\t%s %s\n' "$p" "$digest"
  done
  mfa="$(aws_q iam list-mfa-devices --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'MFADevices[].SerialNumber' --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s MFA devices"
  for p in $mfa; do [[ "$p" == None ]] || printf 'operator.mfa\t%s\n' "$p"; done
  # A console sign-in, by its presence. Absent is an answer AWS gives by name;
  # any other failure is a fact that could not be read.
  if login="$("$AWS_BIN" iam get-login-profile --user-name "$FOOTBAG_OPERATOR_USER" \
        ${AWS_ARGS[@]+"${AWS_ARGS[@]}"} --query 'LoginProfile.UserName' --output text 2>&1)"; then
    printf 'operator.console\tpresent\n'
  elif [[ "$login" == *NoSuchEntity* ]]; then
    printf 'operator.console\tabsent\n'
  else
    facts_fail "${FOOTBAG_OPERATOR_USER}'s console sign-in" "$(tail -n 1 <<<"$login")"
  fi
  tags="$(aws_q iam list-user-tags --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'Tags[].[Key,Value]' --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s tags"
  while IFS=$'\t' read -r k v; do
    [[ -n "$k" ]] && printf 'operator.tag\t%s=%s\n' "$k" "$v"
  done <<<"$tags"
  # The other ways in or out of the identity: a group grants or denies outside
  # the user's own policy list, and SSH keys, signing certificates and
  # service-specific credentials are credentials beside the access keys.
  rows="$(aws_q iam list-groups-for-user --user-name "$FOOTBAG_OPERATOR_USER" \
    --query 'Groups[].GroupName' --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s groups"
  for p in $rows; do [[ "$p" == None ]] || printf 'operator.group\t%s\n' "$p"; done
  local kind query
  for kind in ssh-public-keys signing-certificates service-specific-credentials; do
    case "$kind" in
      ssh-public-keys) query='SSHPublicKeys[].[SSHPublicKeyId,Status]' ;;
      signing-certificates) query='Certificates[].[CertificateId,Status]' ;;
      service-specific-credentials) query='ServiceSpecificCredentials[].[ServiceSpecificCredentialId,Status]' ;;
    esac
    rows="$(aws_q iam "list-${kind}" --user-name "$FOOTBAG_OPERATOR_USER" \
      --query "$query" --output text)" || facts_fail "${FOOTBAG_OPERATOR_USER}'s ${kind}"
    while IFS=$'\t' read -r cid status; do
      [[ -n "$cid" && "$cid" != None ]] && printf 'operator.%s\t%s %s\n' "$kind" "$cid" "$status"
    done <<<"$rows"
  done

  rows="$(aws_q iam list-users --query 'Users[].UserName' --output text)" || facts_fail "the IAM users"
  for user in $rows; do
    out="$(aws_q iam list-access-keys --user-name "$user" \
      --query 'AccessKeyMetadata[].[AccessKeyId,Status]' --output text)" || facts_fail "${user}'s keys"
    if [[ -z "$out" ]]; then
      printf 'user.key\t%s none\n' "$user"
    fi
    while IFS=$'\t' read -r akid status; do
      [[ -n "$akid" ]] && printf 'user.key\t%s %s %s\n' "$user" "$akid" "$status"
    done <<<"$out"
  done

  for role in "${RUNTIME_ROLES[@]}"; do
    trust="$(aws_q iam get-role --role-name "$role" \
      --query 'Role.AssumeRolePolicyDocument' --output json)" || facts_fail "${role}'s trust policy"
    trust="$(jq -S -c "$TRUST_CANON" <<<"$trust" 2>/dev/null)" || facts_fail "${role}'s trust policy as JSON"
    printf 'trust.%s\t%s\n' "$role" "$trust"
  done
}

if [[ "$MODE" == "save" || "$MODE" == "compare" ]]; then
  command -v jq >/dev/null 2>&1 || cr_die "jq is needed to read the trust policies."
  FACTS_ERR="$(mktemp)"
  cr_cleanup rm -f "$FACTS_ERR"
  FACTS="$(baseline_facts | LC_ALL=C sort)" \
    || cr_die "$(cat "$FACTS_ERR")"
  if [[ "$MODE" == "save" ]]; then
    # A baseline is working state for one onboarding cycle, not a credential,
    # so it lives in a private temp directory rather than beside the credential
    # files in ~/AWS. Per user, and refused unless it is a real directory this
    # user owns with no access for anybody else, because a shared temp directory
    # is a place somebody else could have created it first.
    SAVE_DIR="${TMPDIR:-/tmp}/footbag-baseline-$(id -u)"
    mkdir -p -m 700 -- "$SAVE_DIR"
    if [[ -L "$SAVE_DIR" || ! -d "$SAVE_DIR" || ! -O "$SAVE_DIR" \
          || "$(stat -c '%a' "$SAVE_DIR" 2>/dev/null || stat -f '%Lp' "$SAVE_DIR")" != 700 ]]; then
      cr_die "${SAVE_DIR} is not a directory of yours at mode 700; nothing was saved."
    fi
    SAVE_BASE="${SAVE_DIR}/baseline-$(date -u +%Y-%m-%d)"
    SAVE_PATH="${SAVE_BASE}.txt"
    n=2
    while [[ -e "$SAVE_PATH" ]]; do SAVE_PATH="${SAVE_BASE}-${n}.txt"; n=$(( n + 1 )); done
    ( umask 077 && printf '%s\n' "$FACTS" > "$SAVE_PATH" )
    echo "Saved $(grep -c . <<<"$FACTS") facts for account ${ACCOUNT_ID} to ${SAVE_PATH}"
    cr_proved "every baseline fact was read and saved to ${SAVE_PATH}"
    cr_finish
  fi
  # A named user's own key lines are left out on both sides when asked: that
  # one change is what a dev-and-tester lifecycle makes. Nothing about
  # footbag-operator or either trust can be left out.
  ignore_filter() {
    local u line
    while IFS= read -r line; do
      for u in ${IGNORE_USERS[@]+"${IGNORE_USERS[@]}"}; do
        [[ "$line" == "user.key"$'\t'"${u} "* ]] && continue 2
      done
      printf '%s\n' "$line"
    done
  }
  # The saved trusts are put in the same canonical form before comparing, so a
  # baseline saved before arrays were sorted still compares by content.
  canon_saved_trusts() {
    local line key doc
    while IFS= read -r line; do
      if [[ "$line" == trust.*$'\t'* ]]; then
        key="${line%%$'\t'*}"
        doc="$(jq -S -c "$TRUST_CANON" <<<"${line#*$'\t'}" 2>/dev/null)" || doc="${line#*$'\t'}"
        printf '%s\t%s\n' "$key" "$doc"
      else
        printf '%s\n' "$line"
      fi
    done
  }
  SAVED="$(ignore_filter < "$COMPARE_FILE" | canon_saved_trusts | LC_ALL=C sort)"
  NOW="$(ignore_filter <<<"$FACTS" | LC_ALL=C sort)"
  if [[ "$SAVED" == "$NOW" ]]; then
    echo "Unchanged since ${COMPARE_FILE}: footbag-operator, every key outside those left out, and both runtime trusts."
    cr_proved "footbag-operator, every key outside those left out, and both runtime trusts are unchanged since ${COMPARE_FILE}"
    cr_finish
  fi
  echo "CHANGED since ${COMPARE_FILE}:" >&2
  # diff exits 1 when the two differ, which is the case this branch is in.
  { diff <(printf '%s\n' "$SAVED") <(printf '%s\n' "$NOW") || [[ $? == 1 ]]; } \
    | sed -n 's/^< /  was: /p; s/^> /  now: /p' >&2
  # Exit 3 is the status a caller branches on, so the run ends on it on purpose,
  # with the difference listed as the error it is.
  cr_error "the compared facts have CHANGED since ${COMPARE_FILE}; each difference is printed above"
  cr_finish_with 3 CHANGED
fi

echo "Account baseline for ${ACCOUNT_ID}"
echo ""

# ── 1. Account-wide public access block on storage ───────────────────────────
#
# Per-bucket settings already exist; this is the account-wide backstop that
# survives a bucket created later without them, which is the case it exists for.
echo "Storage"
if ! aws_read PAB NoSuchPublicAccessBlockConfiguration "the account-level public access block" \
  s3control get-public-access-block --account-id "$ACCOUNT_ID" \
  --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text; then
  note "the read did not answer, so the control was not checked rather than found absent"
elif [[ -z "$PAB" ]]; then
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
if ! aws_read PWPOL NoSuchEntity "the IAM account password policy" \
  iam get-account-password-policy --output json; then
  note "the read did not answer, so the policy was not checked rather than found absent"
elif [[ -z "$PWPOL" ]]; then
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
if ! aws_read ANALYZERS - "the Access Analyzer list" accessanalyzer list-analyzers \
  --query 'analyzers[?status==`ACTIVE` && (type==`ACCOUNT` || type==`ORGANIZATION`)].name' \
  --output text; then
  note "the read did not answer, so the analyzers were not checked rather than found absent"
elif [[ -n "$ANALYZERS" ]]; then
  pass "Access Analyzer active for external access: ${ANALYZERS}"
else
  fail "no active IAM Access Analyzer of an external-access type"
  note "it finds resource policies granting access outside the account; an"
  note "unused-access analyzer is a different tool and does not cover this"
fi

# An analyzer that reports findings nobody resolves is a control in name only:
# an active finding is a resource policy granting an outsider access right now.
# Each external-access analyzer's active findings are counted, and any is a
# finding here, so this run cannot pass while the account is exposed.
if aws_read ANALYZER_ARNS - "the Access Analyzer ARNs" accessanalyzer list-analyzers \
  --query 'analyzers[?status==`ACTIVE` && (type==`ACCOUNT` || type==`ORGANIZATION`)].arn' \
  --output text && [[ -n "$ANALYZER_ARNS" && "$ANALYZER_ARNS" != "None" ]]; then
  for analyzer_arn in $ANALYZER_ARNS; do
    if ! aws_read ACTIVE_FINDINGS - "the active Access Analyzer findings" \
      accessanalyzer list-findings --analyzer-arn "$analyzer_arn" \
      --filter '{"status":{"eq":["ACTIVE"]}}' --query 'length(findings)' --output text; then
      note "the read did not answer, so active findings were not counted"
    elif [[ "$ACTIVE_FINDINGS" == "0" ]]; then
      pass "Access Analyzer reports no active finding: ${analyzer_arn##*/}"
    else
      fail "Access Analyzer reports ${ACTIVE_FINDINGS} active finding(s): ${analyzer_arn##*/}"
      note "each is a resource policy granting access outside the account; resolve"
      note "the policy, or archive the finding only if the access is intended"
    fi
  done
fi

# ── 3a. GuardDuty ────────────────────────────────────────────────────────────
#
# The detector analyses the trail's management events and the S3 object-level
# events the trail deliberately does not store, and reports a stopped trail on
# its own. A detector that exists but is suspended reads as present and watches
# nothing, so the check is on its status, not on its existence.
if ! aws_read DETECTOR_ID - "the GuardDuty detector list" guardduty list-detectors \
  --query 'DetectorIds[0]' --output text; then
  note "the read did not answer, so the detector was not checked rather than found absent"
elif [[ -z "$DETECTOR_ID" || "$DETECTOR_ID" == "None" ]]; then
  fail "no GuardDuty detector in this region"
  note "declared in the shared tree behind enable_guardduty; turn it on with"
  note "scripts/apply-account-baseline.sh --enable-guardduty"
elif ! aws_read DETECTOR_STATUS - "the GuardDuty detector status" guardduty get-detector \
  --detector-id "$DETECTOR_ID" --query 'Status' --output text; then
  note "the read did not answer, so the detector's status was not checked"
elif [[ "$DETECTOR_STATUS" == "ENABLED" ]]; then
  pass "GuardDuty detector enabled: ${DETECTOR_ID}"
  # The last 30 days' cost per feature, so the usage review after the free
  # trial is a line in this report rather than a console visit. S3 protection
  # is the part that scales with traffic; turning it off is a Terraform change
  # to the shared tree's feature list.
  if aws_read GD_USAGE - "the GuardDuty usage statistics" guardduty get-usage-statistics \
    --detector-id "$DETECTOR_ID" --usage-statistic-type SUM_BY_FEATURES \
    --usage-criteria 'Features=S3_DATA_EVENTS,CLOUD_TRAIL,DNS_LOGS,FLOW_LOGS' \
    --query 'UsageStatistics.SumByFeature[].[Feature,Total.Amount,Total.Unit]' --output text; then
    note "GuardDuty cost, last 30 days, by feature:"
    while IFS=$'\t' read -r gd_feature gd_amount gd_unit; do
      [[ -n "${gd_feature:-}" ]] && note "  ${gd_feature} ${gd_amount} ${gd_unit}"
    done <<<"$GD_USAGE"
  fi
else
  fail "GuardDuty detector ${DETECTOR_ID} is ${DETECTOR_STATUS:-in an unreadable state}, not ENABLED"
fi

# ── 3b. The audit trail ──────────────────────────────────────────────────────
#
# The trail is declared in the production tree because production's alarms read
# its log group, but it records the whole account, so it is checked here. A trail
# that exists and is stopped, or that has stopped delivering, keeps nothing while
# reading as configured. validate-logs then proves the files delivered over the
# last seven days are the ones AWS signed: a deleted or edited log file fails it.
TRAIL_NAME="footbag-production-trail"
if ! aws_read TRAIL_STATUS TrailNotFoundException "the audit trail's status" cloudtrail \
  get-trail-status --name "$TRAIL_NAME" \
  --query '[IsLogging, LatestDeliveryError]' --output text; then
  note "the read did not answer, so the trail was not checked rather than found stopped"
elif [[ -z "$TRAIL_STATUS" ]]; then
  fail "no audit trail named ${TRAIL_NAME}"
else
  read -r TRAIL_LOGGING TRAIL_DELIVERY_ERROR <<<"$TRAIL_STATUS"
  if [[ "$TRAIL_LOGGING" != "True" ]]; then
    fail "audit trail ${TRAIL_NAME} is not logging"
  elif [[ -n "$TRAIL_DELIVERY_ERROR" && "$TRAIL_DELIVERY_ERROR" != "None" ]]; then
    fail "audit trail ${TRAIL_NAME} reports a delivery error: ${TRAIL_DELIVERY_ERROR}"
  else
    pass "audit trail ${TRAIL_NAME} is logging with no delivery error"
  fi
  # The tool prints a summary per file kind, "<valid>/<total> digest files
  # valid" and the same for log files, and names any file that fails. The
  # verdict needs both summaries present with every file valid: a run that
  # printed neither checked nothing, and a count of zero digests over seven
  # days means nothing was delivered to check. It reads every digest and log
  # file in the window from the trail bucket, so it takes minutes, and it needs
  # read access to that bucket, which the dev-and-tester role deliberately
  # lacks.
  VALIDATE_START="$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)"
  if ! aws_read TRAIL_ARN - "the audit trail's ARN" cloudtrail describe-trails \
    --trail-name-list "$TRAIL_NAME" --query 'trailList[0].TrailARN' --output text; then
    note "the read did not answer, so the log files were not validated"
  elif ! aws_read VALIDATION - "the audit trail's log-file validation" cloudtrail \
    validate-logs --trail-arn "$TRAIL_ARN" --start-time "$VALIDATE_START"; then
    note "the log files were not validated, which is a failure rather than a pass"
  else
    DIGESTS="$(grep -oE '^[0-9]+/[0-9]+ digest files valid' <<<"$VALIDATION" || [[ $? == 1 ]])"
    LOGS="$(grep -oE '^[0-9]+/[0-9]+ log files valid' <<<"$VALIDATION" || [[ $? == 1 ]])"
    digests_ok=0 logs_ok=0
    if [[ "$DIGESTS" =~ ^([0-9]+)/([0-9]+)\  ]] && (( BASH_REMATCH[2] > 0 )) \
      && [[ "${BASH_REMATCH[1]}" == "${BASH_REMATCH[2]}" ]]; then
      digests_ok=1
    fi
    if [[ "$LOGS" =~ ^([0-9]+)/([0-9]+)\  ]] && [[ "${BASH_REMATCH[1]}" == "${BASH_REMATCH[2]}" ]]; then
      logs_ok=1
    fi
    if (( digests_ok && logs_ok )) && ! grep -qi 'invalid' <<<"$VALIDATION"; then
      pass "audit trail log files validate for the last 7 days: ${DIGESTS}, ${LOGS}"
    else
      fail "audit trail log files did not validate for the last 7 days"
      note "${DIGESTS:-no digest summary printed}; ${LOGS:-no log summary printed}"
      note "a deleted or edited log file, or a gap in delivery, looks like this"
    fi
  fi
fi

# ── 4. Alternate contacts ────────────────────────────────────────────────────
#
# Unset means every notice of that kind reaches only the root mailbox, and
# nobody is told if it goes unread.
echo ""
echo "Notification reachability"
for kind in OPERATIONS SECURITY; do
  if ! aws_read CONTACT ResourceNotFoundException "the ${kind} alternate contact" \
    account get-alternate-contact --alternate-contact-type "$kind" \
    --query 'AlternateContact.EmailAddress' --output text; then
    note "the read did not answer, so the ${kind} contact was not checked rather than found unset"
  elif [[ -n "$CONTACT" && "$CONTACT" != "None" ]]; then
    pass "alternate contact ${kind} is set"
  else
    gated "alternate contact ${kind} is unset until enable_account_alternate_contacts is on"
  fi
done
# Billing notices stay with the root mailbox by design, so a billing contact is
# not declared; one set by hand would send them somewhere nothing records.
if ! aws_read CONTACT ResourceNotFoundException "the BILLING alternate contact" \
  account get-alternate-contact --alternate-contact-type BILLING \
  --query 'AlternateContact.EmailAddress' --output text; then
  note "the read did not answer, so the BILLING contact was not checked rather than found unset"
elif [[ -n "$CONTACT" && "$CONTACT" != "None" ]]; then
  fail "a BILLING alternate contact is set, but billing notices belong with the root mailbox and no tree declares one"
else
  pass "no BILLING alternate contact: billing notices stay with the root mailbox"
fi

# ── 5. Root account posture ──────────────────────────────────────────────────
echo ""
echo "Root account"
if ! aws_read SUMMARY - "the account summary" iam get-account-summary --output json; then
  note "the read did not answer, so root's MFA and keys were not checked"
elif [[ -z "$SUMMARY" ]]; then
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
    note "root should hold no access keys"
  fi
fi

# ── 6. Every IAM user's keys, with age and last use ──────────────────────────
#
# Age and last use in one place, rather than a console trip per key. Reported
# rather than judged: rotation is for cause and never on a clock, so whether any
# of this amounts to a reason is a human's call.
echo ""
echo "Access keys"
if ! aws_read USERS - "the IAM users" iam list-users --query 'Users[].UserName' --output text; then
  note "the read did not answer, so no key was reported"
elif [[ -z "$USERS" ]]; then
  fail "could not list IAM users"
else
  NOW="$(date -u +%s)"
  for user in $USERS; do
    if ! aws_read ROWS - "${user}'s access keys" iam list-access-keys --user-name "$user" \
      --query 'AccessKeyMetadata[].[AccessKeyId,Status,CreateDate]' --output text; then
      continue
    fi
    if [[ -z "$ROWS" ]]; then
      (( QUIET )) || printf '  ----  %s: no access keys\n' "$user"
      continue
    fi
    while IFS=$'\t' read -r akid status created; do
      [[ -n "$akid" ]] || continue
      CREATED_EPOCH="$(date -u -d "$created" +%s 2>/dev/null || echo "$NOW")"
      AGE_DAYS=$(( ( NOW - CREATED_EPOCH ) / 86400 ))
      # A read that failed says so rather than reading as a key never used.
      if ! aws_read LASTUSED - "the last use of ${akid}" iam get-access-key-last-used --access-key-id "$akid" \
        --query 'AccessKeyLastUsed.LastUsedDate' --output text; then
        LASTUSED="unknown (the read failed)"
      fi
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
# and the way back in down together. Every named dev-and-tester's path is added
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
if ! aws_read BG_ROWS - "${FOOTBAG_OPERATOR_USER}'s active access keys" \
  iam list-access-keys --user-name "$FOOTBAG_OPERATOR_USER" \
  --query 'AccessKeyMetadata[?Status==`Active`].AccessKeyId' --output text; then
  note "the read did not answer, so the way back in was not checked rather than found gone"
elif [[ -z "$BG_ROWS" || "$BG_ROWS" == "None" ]]; then
  fail "${FOOTBAG_OPERATOR_USER} holds no active access key"
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
aws_read BG_ATTACHED - "${FOOTBAG_OPERATOR_USER}'s attached policies" \
  iam list-attached-user-policies --user-name "$FOOTBAG_OPERATOR_USER" \
  --query 'AttachedPolicies[].PolicyName' --output text || BG_ATTACHED="<unread>"
aws_read BG_INLINE - "${FOOTBAG_OPERATOR_USER}'s inline policies" \
  iam list-user-policies --user-name "$FOOTBAG_OPERATOR_USER" \
  --query 'PolicyNames' --output text || BG_INLINE="<unread>"
note "attached: ${BG_ATTACHED:-<none>}"
note "inline:   ${BG_INLINE:-<none>}"

for role in "${RUNTIME_ROLES[@]}"; do
  if ! aws_read TRUST - "the trust policy of ${role}" iam get-role --role-name "$role" \
    --query 'Role.AssumeRolePolicyDocument' --output json; then
    note "the read did not answer, so ${role} was not checked"
  elif [[ -z "$TRUST" ]]; then
    fail "${role}: could not read the trust policy"
  elif grep -qF ":user/${FOOTBAG_OPERATOR_USER}" <<< "$TRUST"; then
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
echo "Dev-and-tester job role"

DEV_TESTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${DEV_TESTER_ROLE}"
DEV_TESTER_PRESENT=0
# AWS answering NoSuchEntity is the role's real absence; any other failure is a
# read that did not answer, never the pre-apply state.
if ! aws_read DEV_TESTER_DOC NoSuchEntity "the ${DEV_TESTER_ROLE} role" \
  iam get-role --role-name "$DEV_TESTER_ROLE"; then
  note "the read did not answer, so the job role was not checked"
elif [[ -n "$DEV_TESTER_DOC" ]]; then
  DEV_TESTER_PRESENT=1
  pass "${DEV_TESTER_ROLE}: ${DEV_TESTER_ROLE_ARN}"
else
  note "no ${DEV_TESTER_ROLE} role yet: the account-level identity tree has not"
  note "been applied, so no named dev-and-tester can act as anything but themselves."
  note "Nothing to compare against the runtime trust policies until it has."
fi

# One runtime role's trust document, or an empty string when it could not be
# read; AWS's message for the failure is then aws_err. Which principals it names
# is the question every comparison below asks.
read_trust() {
  aws_q iam get-role --role-name "$1" --query 'Role.AssumeRolePolicyDocument' \
    --output json
}

if (( DEV_TESTER_PRESENT )); then
  # Staging must name it, because the reads a deploy makes are that job.
  STAGING_TRUST="$(read_trust "$STAGING_RUNTIME_ROLE")" || STAGING_TRUST=""
  if [[ -z "$STAGING_TRUST" ]]; then
    fail "${STAGING_RUNTIME_ROLE}: could not read the trust policy to compare the job role: $(aws_err)"
  elif grep -qF "$DEV_TESTER_ROLE_ARN" <<< "$STAGING_TRUST"; then
    pass "${STAGING_RUNTIME_ROLE} trusts ${DEV_TESTER_ROLE}"
  else
    fail "${STAGING_RUNTIME_ROLE} does not name ${DEV_TESTER_ROLE_ARN}"
    note "a named dev-and-tester can authenticate and reach nothing a deploy needs, which"
    note "reads as a broken account rather than as a missing principal"
    note "set dev_tester_role_arn to the ARN above and apply staging"
  fi

  # Production must not, and its absence there cannot be asserted from that
  # tree's configuration: production declares no variable to set it, so an ARN
  # found in that trust was put there by hand and nothing else would report it.
  PRODUCTION_TRUST="$(read_trust "$PRODUCTION_RUNTIME_ROLE")" || PRODUCTION_TRUST=""
  if [[ -z "$PRODUCTION_TRUST" ]]; then
    fail "${PRODUCTION_RUNTIME_ROLE}: could not read the trust policy to check the job role is absent: $(aws_err)"
  elif grep -qF "$DEV_TESTER_ROLE_ARN" <<< "$PRODUCTION_TRUST"; then
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

if ! aws_read SSO_INSTANCE - "the Identity Center instances" sso-admin list-instances \
  --query 'Instances[].[InstanceArn,IdentityStoreId]' --output text; then
  note "the read did not answer, so dormancy was not checked rather than confirmed."
elif [[ -z "$SSO_INSTANCE" || "$SSO_INSTANCE" == "None" ]]; then
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
    fail "could not read the permission sets of the dormant instance: $(aws_err)"
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
      fail "could not read the users of the dormant directory: $(aws_err)"
      note "the call did not answer, so this was not checked rather than confirmed."
    fi
  fi
fi

echo ""
# The gated count is stated on both paths, because a run that said nothing about
# it would read as though those controls had passed.
if (( GATED )); then
  echo "${GATED} control(s) not yet on: the operations and security contacts sit" >&2
  echo "behind enable_account_alternate_contacts, which turns on once both values" >&2
  echo "are in the shared tree's secrets file. They are not findings and" >&2
  echo "do not decide this run." >&2
  echo "" >&2
fi

if (( FINDINGS == 0 )); then
  echo "No findings."
  cr_proved "every account-level control read here is in place"
  cr_finish
fi
echo "${FINDINGS} finding(s)." >&2
echo "" >&2
echo "All four account controls are declared in terraform/shared/account-baseline.tf." >&2
echo "The public-access block, the password policy and Access Analyzer carry no" >&2
echo "values and apply as they stand. Apply the shared tree as the" >&2
echo "directly authenticated identity; the job role cannot read its state," >&2
echo "deliberately." >&2
cr_finish
