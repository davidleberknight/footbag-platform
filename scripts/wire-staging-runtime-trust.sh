#!/usr/bin/env bash
# wire-staging-runtime-trust.sh
#
# Tells staging's application runtime role to trust the shared human-operator
# job role, and proves afterwards that it does.
#
# WHY THIS EXISTS.
#
# Until this runs, onboarding a named operator still writes a
# footbag-staging-runtime profile onto their workstation, and the chain fails
# the first time anybody uses it. That is a quiet failure rather than a loud
# one: the profile is there, it looks right, and what is missing sits in an
# account-level trust policy nobody is looking at.
#
# The operation used to be a hand edit of one value in the private operations
# checkout followed by an apply. That shape can carry out the change and cannot
# carry out the thing that matters, which is reading the trust policy back
# afterwards, so the gap was invisible: the edit and the apply both succeed
# whether or not the resulting policy names the role. A precondition, a change,
# an apply and an outcome worth proving is exactly the shape a script owns.
#
# WHY NO --target.
#
# Its subject exists in exactly one environment. Production's tree declares no
# variable that could name the job role, and that absence is the control keeping
# the role out of production rather than an omission to be corrected here. An
# environment flag would imply a choice that does not exist.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated footbag-operator. The job role
#     is denied every write to the runtime role it assumes, deliberately: a role
#     that can rewrite the role it assumes can attach administrator access to it
#     and land somewhere none of its denials reach. Run as the role, this would
#     fail on that one resource in the middle of an otherwise healthy plan.
#   - Wire a principal that does not exist. AWS rejects a trust policy naming an
#     absent principal, so running this before the identity tree has been
#     applied breaks every staging apply on that one resource until the value is
#     taken back out. The role is looked up first and the run refuses rather
#     than half-applying.
#   - Invent the assignment. The values file carries the line, commented, and a
#     script that added one where none existed would be writing a value into a
#     file whose shape it had guessed.
#   - Repeat work that is done. The live trust policy is read before anything
#     is changed, because the values file says what was last written and only
#     the policy says what is true.
#
# Usage:
#   bash scripts/wire-staging-runtime-trust.sh
#
# Flags:
#   --yes        Accept the typed confirmation in advance, for a run with no
#                terminal attached.
#   -h, --help   This text.
#
# Exit: 0 wired and proven, 1 refused or unproven, 2 usage error.
#
# Test seams (CI only; operators never set these):
#   WIRE_TRUST_AWS_BIN     replaces the aws CLI
#   WIRE_TRUST_APPLY_CMD   replaces the apply this hands off to
#   TFVARS_OVERRIDE        the values file to read and write, so a test owns
#                          that input rather than inheriting whichever private
#                          checkout the machine happens to have wired
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# confirm_from_tty reads the answer from /dev/tty rather than stdin, refuses
# when no terminal exists and --yes was not given, and assigns ASSUME_YES
# unconditionally so an exported value cannot stand in for the typed word.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# The AWS identity this run uses, supplied and proved rather than inherited.
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

AWS_BIN="${WIRE_TRUST_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"
APPLY_CMD="${WIRE_TRUST_APPLY_CMD:-${SCRIPT_DIR}/terraform-apply.sh}"

# The identity that may write this tree, named as a literal rather than read
# from the profile the library owns: a check that takes the name from the same
# place the credential came from is not a check.
FOOTBAG_OPERATOR_USER="footbag-operator"
# The runtime role whose trust is being widened, and the variable that widens it.
RUNTIME_ROLE="footbag-staging-app-runtime"
TFVAR_NAME="dev_tester_role_arn"

while (( $# )); do
  case "$1" in
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

if [[ "$AWS_BIN" != "aws" ]]; then
  echo "==> NOTE: the AWS binary is stubbed for this run; it proves nothing" >&2
  echo "    about the account." >&2
fi

# ── The identity this run acts on the strength of ────────────────────────────

aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Widening the staging runtime role's trust is refused to the job role, which is denied every write to the role it assumes." \
  || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

# Taken from the proved ARN rather than read back separately, so the account the
# role ARN names is definitionally the account this run authenticated against.
ACCOUNT_ID="$(printf '%s' "$AWS_IDENTITY_ARN" | cut -d: -f5)"
if [[ ! "$ACCOUNT_ID" =~ ^[0-9]{12}$ ]]; then
  echo "ERROR: could not read an account id out of ${AWS_IDENTITY_ARN}." >&2
  exit 1
fi
DEV_TESTER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${FOOTBAG_DEV_TESTER_ROLE}"

# ── Is it already true? ──────────────────────────────────────────────────────

# Asked of AWS rather than of the values file, and asked first. The file records
# what was last written into it, which is not the same fact: an edit that was
# never applied leaves the file saying yes and the estate saying no, and that is
# precisely the state this script exists to end.
trusted_principals() {
  "$AWS_BIN" iam get-role --role-name "$RUNTIME_ROLE" \
    --query 'Role.AssumeRolePolicyDocument.Statement[].Principal.AWS' \
    --output text 2>/dev/null || true
}

trust_names_the_role() {
  printf '%s\n' "$(trusted_principals)" | tr '\t' '\n' | grep -Fxq -- "$DEV_TESTER_ROLE_ARN"
}

echo "-- staging runtime trust --"
echo "    runtime role:  ${RUNTIME_ROLE}"
echo "    job role:      ${DEV_TESTER_ROLE_ARN}"

if trust_names_the_role; then
  echo ""
  echo "Already wired: ${RUNTIME_ROLE} trusts ${FOOTBAG_DEV_TESTER_ROLE}."
  echo "Nothing to do."
  exit 0
fi

# ── The principal has to exist before anything names it ──────────────────────

if ! "$AWS_BIN" iam get-role --role-name "$FOOTBAG_DEV_TESTER_ROLE" >/dev/null 2>&1; then
  echo "ERROR: there is no IAM role named ${FOOTBAG_DEV_TESTER_ROLE} in account ${ACCOUNT_ID}." >&2
  echo "" >&2
  echo "       AWS rejects a trust policy naming a principal that does not" >&2
  echo "       exist, so writing the value now would not fail here: it would" >&2
  echo "       fail on this one resource in every staging apply from now until" >&2
  echo "       somebody took it back out again." >&2
  echo "" >&2
  echo "       The role is declared in the account-level identity tree, which" >&2
  echo "       only this identity may apply:" >&2
  echo "         bash scripts/terraform-apply.sh --target identity --init" >&2
  echo "" >&2
  echo "       Nothing done." >&2
  exit 1
fi
echo "    the job role exists, so a trust policy may name it"

# ── The values file ──────────────────────────────────────────────────────────

# Resolved rather than the link: each environment's values file is a symlink
# into the maintainers' private operations checkout, and the write below goes
# through it with `cat >` so the link survives.
TFVARS_LINK="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/staging/terraform.tfvars}"
if [[ ! -e "$TFVARS_LINK" ]]; then
  echo "ERROR: ${TFVARS_LINK} does not exist." >&2
  echo "       Staging's values file is a symlink into the private operations" >&2
  echo "       checkout, which is a prerequisite for operations work rather" >&2
  echo "       than a convenience. Nothing done." >&2
  exit 1
fi
TFVARS_PATH="$(readlink -f "$TFVARS_LINK")"
if [[ -z "$TFVARS_PATH" || ! -f "$TFVARS_PATH" ]]; then
  echo "ERROR: ${TFVARS_LINK} does not resolve to a file (dangling symlink)." >&2
  echo "       Nothing done." >&2
  exit 1
fi
case "$TFVARS_PATH" in
  "$REPO_ROOT"/*)
    if ! git -C "$REPO_ROOT" check-ignore -q "$TFVARS_PATH" 2>/dev/null; then
      echo "ERROR: ${TFVARS_PATH} is inside this repository and git does not ignore it." >&2
      echo "       The values file carries operator CIDR ranges; writing it where" >&2
      echo "       git can pick it up is how those get committed. Nothing done." >&2
      exit 1
    fi
    ;;
esac

if ! grep -qE "^[[:space:]]*#?[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH"; then
  echo "ERROR: no ${TFVAR_NAME} assignment in ${TFVARS_LINK}, commented or otherwise." >&2
  echo "       Add one rather than letting this script invent the line: a value" >&2
  echo "       written into a file whose shape was guessed is how a tree comes" >&2
  echo "       to carry something nobody declared. Nothing done." >&2
  exit 1
fi

CURRENT_VALUE="$(grep -E "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH" \
  | tail -1 | grep -oE '"[^"]*"' | tr -d '"' || true)"

TFVARS_TMP=""
cleanup() {
  if [[ -n "$TFVARS_TMP" && -e "$TFVARS_TMP" ]]; then
    rm -f -- "$TFVARS_TMP"
  fi
}
trap cleanup EXIT INT TERM

if [[ "$CURRENT_VALUE" == "$DEV_TESTER_ROLE_ARN" ]]; then
  echo "    values file already carries the ARN; it has not been applied yet"
else
  TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-wire-trust.XXXXXX")"
  chmod 600 "$TFVARS_TMP"
  # The line is rewritten whole, commented or not, because the form it arrives
  # in is a comment and the form it leaves in is an assignment.
  VAR_NAME="$TFVAR_NAME" ARN_VALUE="$DEV_TESTER_ROLE_ARN" awk '
    BEGIN { pattern = "^[ \t]*#?[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=" }
    $0 ~ pattern && !done {
      printf "%s = \"%s\"\n", ENVIRON["VAR_NAME"], ENVIRON["ARN_VALUE"]
      done = 1
      next
    }
    { print }
  ' "$TFVARS_PATH" > "$TFVARS_TMP"

  echo ""
  echo "The one line this changes in ${TFVARS_LINK}:"
  echo ""
  diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
  echo ""
fi

echo "This will set ${TFVAR_NAME} in staging's values file if it is not already"
echo "set, apply the staging tree, and then read ${RUNTIME_ROLE}'s trust policy"
echo "back and refuse to report success unless it names ${FOOTBAG_DEV_TESTER_ROLE}."
echo ""
if ! confirm_from_tty "Type 'APPLY' to wire staging's runtime trust: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  exit 1
fi

if [[ -n "$TFVARS_TMP" ]]; then
  cat "$TFVARS_TMP" > "$TFVARS_PATH"
  echo "==> ${TFVAR_NAME} written"
fi

# ── Apply ────────────────────────────────────────────────────────────────────

# The identity is already settled and exported, so the apply inherits it rather
# than resolving one of its own.
echo "==> Applying the staging tree"
if ! bash "$APPLY_CMD" --target staging; then
  echo "ERROR: the staging apply did not complete, so the trust policy is" >&2
  echo "       whatever the apply left it as. The values file now carries the" >&2
  echo "       ARN, which is correct and is not the problem: re-run this to" >&2
  echo "       pick up where it stopped." >&2
  exit 1
fi

# ── Prove it ─────────────────────────────────────────────────────────────────

# The outcome, not the invocation. An apply that exits zero says terraform was
# satisfied with its own plan, which is a different claim from this role now
# trusting that one.
echo "==> Reading the trust policy back"
if ! trust_names_the_role; then
  echo "ERROR: ${RUNTIME_ROLE} still does not trust ${DEV_TESTER_ROLE_ARN}." >&2
  echo "" >&2
  echo "       The apply reported success, so what it applied did not carry" >&2
  echo "       this principal. The likeliest cause is that the plan read a" >&2
  echo "       different values file from the one written above." >&2
  echo "" >&2
  echo "       Principals it does trust:" >&2
  printf '%s\n' "$(trusted_principals)" | tr '\t' '\n' | sed 's/^/         /' >&2
  exit 1
fi

echo "    ${RUNTIME_ROLE} trusts ${DEV_TESTER_ROLE_ARN}"
echo ""
echo "Done. A named operator's footbag-staging-runtime profile now has a chain"
echo "that resolves. Proving it end to end is a separate run, at that operator's"
echo "own workstation:"
echo ""
echo "  bash scripts/setup-operator-workstation.sh --target staging --check"
exit 0
