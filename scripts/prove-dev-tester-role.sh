#!/usr/bin/env bash
# prove-dev-tester-role.sh
#
# Proves, end to end, that a named dev-and-tester can do the staging job through
# the FootbagDevTester role, and that doing it moved nothing administrative.
# Run by a footbag-operator holder on their own machine, after onboarding and
# accepting themselves, and again after any re-onboarding.
#
# WHY THIS EXISTS.
#
# "The role works" is several claims, each easy to take on trust and each with
# a different way of being false: the role can plan staging but not apply it,
# can apply but not deploy, can deploy but the tests reach staging as somebody
# else, or all of it works and the run quietly changed the directly
# authenticated identity on the way. Each of those was a hand-typed command in a
# runbook, with the operator judging its output. Here they are one run, each step
# judged by the script that owns it, in an order where a failure stops the run
# and names where to resume.
#
# WHAT IT DOES, in order:
#   1  as the role: assume the staging runtime role directly, which proves the
#      job role's own chain into it on any machine, this one included; then a
#      staging Terraform plan that must be empty, applying nothing
#      (terraform-apply.sh --require-empty-plan). Pending drift is refused here,
#      because this run did not come to apply it
#   2  as the role: a code-only staging deploy (deploy_to_aws.sh)
#   3  as the role: the quick test gate with the staging rows
#      (run_all_tests.sh --quick --staging), which rewrites the staging pass
#      receipt this machine keeps
#   4  as footbag-operator: the job role's denials, simulated
#      (verify-dev-tester-role-denials.sh)
#   5  as footbag-operator: the account's protected facts against a baseline
#      saved before the onboarding (verify-account-baseline.sh --compare), with
#      only this account's own key left out
#   6  as footbag-operator: the onboarding read back, read-only
#      (onboard-dev-tester.sh --verify), the one step given the shared sudo
#      password
#
# With --checks-only it runs steps 4 and 5 alone, read-only, with no typed
# word and no password: the check after an identity apply, before anybody is
# onboarded, and the check after an offboarding. Without --account it leaves
# no user's key out of the comparison; with one, it leaves out that account's
# own key, the one change its lifecycle is expected to make. Either way the
# baseline is found as below, so nobody carries its path between commands.
#
# WHAT IT REFUSES TO DO.
#
#   - Prove footbag-operator or the shared account. Neither is a named identity.
#   - Run without a saved baseline. Without one, step 5 would have nothing to
#     compare and the run would claim an invariant it never checked; save one
#     before onboarding with: bash scripts/verify-account-baseline.sh --save
#   - Hand the shared sudo password to anything but step 6. Every other step's
#     stdin is closed.
#   - Run without a terminal: step 2 replaces what staging runs, and that is
#     confirmed by a typed APPLY.
#
# Usage, from the machine the account was accepted on, the redirect being the
# shared account's staging sudo password:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/prove-dev-tester-role.sh \
#     --account david_leberknight
#
# The checks alone, from any terminal, with nothing redirected:
#   bash scripts/prove-dev-tester-role.sh --checks-only
#   bash scripts/prove-dev-tester-role.sh --checks-only --account david_leberknight
#
# Flags:
#   --account <first_last>   the named dev-and-tester to prove; optional with
#                            --checks-only, where it names the key left out
#   --checks-only            steps 4 and 5 only, as footbag-operator, read-only
#   --baseline <file>        the saved baseline to compare with; default the
#                            newest one verify-account-baseline.sh --save wrote,
#                            in ${TMPDIR:-/tmp}/footbag-baseline-<uid>/
#   --from-step <1-6>        resume a run that stopped part way; not with
#                            --checks-only, which is re-run whole
#
# Exit: 0 everything proved, 1 a step failed, 2 usage error, 3 the onboarding is
# in place but its acceptance is not yet visible in CloudTrail (re-run step 6).
# With --checks-only: 0 both checks passed, 1 one failed, 2 usage error.
#
# Test seams (CI only; operators never set these): PROVE_WRAP_CMD replaces the
# as-dev-tester.sh wrapper, PROVE_AWS_BIN the aws CLI the chain is proved with,
# and PROVE_APPLY_CMD, PROVE_DEPLOY_CMD, PROVE_RUNNER_CMD, PROVE_DENIALS_CMD,
# PROVE_BASELINE_CMD and PROVE_VERIFY_CMD replace each step's script. A run using
# any of them says so.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# confirm_from_tty, and the unconditional assignment of ASSUME_YES.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/terminal.sh
source "${SCRIPT_DIR}/lib/terminal.sh"

WRAP_CMD="${PROVE_WRAP_CMD:-${SCRIPT_DIR}/as-dev-tester.sh}"
AWS_CMD="${PROVE_AWS_BIN:-aws}"
APPLY_CMD="${PROVE_APPLY_CMD:-${SCRIPT_DIR}/terraform-apply.sh}"
DEPLOY_ENTRY="${PROVE_DEPLOY_CMD:-${REPO_ROOT}/deploy_to_aws.sh}"
RUNNER_CMD="${PROVE_RUNNER_CMD:-${REPO_ROOT}/run_all_tests.sh}"
DENIALS_CMD="${PROVE_DENIALS_CMD:-${SCRIPT_DIR}/verify-dev-tester-role-denials.sh}"
BASELINE_CMD="${PROVE_BASELINE_CMD:-${SCRIPT_DIR}/verify-account-baseline.sh}"
VERIFY_CMD="${PROVE_VERIFY_CMD:-${SCRIPT_DIR}/onboard-dev-tester.sh}"

ACCOUNT=""
BASELINE=""
FROM_STEP=1
FROM_STEP_GIVEN=0
CHECKS_ONLY=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while (( $# )); do
  case "$1" in
    --account) ACCOUNT="${2:-}"; shift 2 || { echo "ERROR: --account requires a name" >&2; exit 2; } ;;
    --baseline) BASELINE="${2:-}"; shift 2 || { echo "ERROR: --baseline requires a file" >&2; exit 2; } ;;
    --from-step) FROM_STEP="${2:-}"; FROM_STEP_GIVEN=1; shift 2 || { echo "ERROR: --from-step requires a step" >&2; exit 2; } ;;
    --checks-only) CHECKS_ONLY=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

if [[ "$ACCOUNT" == "footbag-operator" || "$ACCOUNT" == "footbag" ]]; then
  echo "ERROR: '${ACCOUNT}' is not a named identity; there is no role use of it to prove." >&2
  exit 2
fi
# Required for the whole proof; optional for the checks alone, but never
# malformed when given.
if [[ -n "$ACCOUNT" ]] || (( ! CHECKS_ONLY )); then
  if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
    echo "ERROR: --account names the dev-and-tester to prove, firstname_lastname." >&2
    exit 2
  fi
fi
if (( CHECKS_ONLY && FROM_STEP_GIVEN )); then
  echo "ERROR: --checks-only runs two read-only checks and is re-run whole; it takes no --from-step." >&2
  exit 2
fi
if [[ ! "$FROM_STEP" =~ ^[1-6]$ ]]; then
  echo "ERROR: --from-step takes 1 to 6." >&2
  exit 2
fi

# The baseline: named, or the one saved most recently on this machine, by the
# time it was written. Not by name: a second save on one day is named with a
# counter, and "-2" sorts before ".txt", so the name order picks the older file.
BASELINE_DIR="${TMPDIR:-/tmp}/footbag-baseline-$(id -u)"
if [[ -z "$BASELINE" ]]; then
  BASELINE="$(find "$BASELINE_DIR" -maxdepth 1 -name 'baseline-*.txt' -printf '%T@ %p\n' 2>/dev/null \
    | LC_ALL=C sort -n | tail -1 | cut -d' ' -f2- || true)"
fi
if [[ -z "$BASELINE" || ! -r "$BASELINE" ]]; then
  echo "ERROR: no saved baseline to compare with, so this run could not show that" >&2
  echo "       footbag-operator and both runtime trusts are unchanged. Save one now," >&2
  echo "       before anything else changes, and pass it with --baseline if it is" >&2
  echo "       not in ${BASELINE_DIR}:" >&2
  echo "         bash scripts/verify-account-baseline.sh --save" >&2
  exit 2
fi

for seam in PROVE_WRAP_CMD PROVE_AWS_BIN PROVE_APPLY_CMD PROVE_DEPLOY_CMD PROVE_RUNNER_CMD \
            PROVE_DENIALS_CMD PROVE_BASELINE_CMD PROVE_VERIFY_CMD; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
done

# Steps 4 and 5, shared by the whole proof and the checks alone. Both read only,
# with stdin closed. The comparison leaves out the named account's own key, and
# nothing when no account is named.
run_denials() { bash "$DENIALS_CMD" </dev/null; }
compare_baseline() {
  local -a ignore=()
  [[ -n "$ACCOUNT" ]] && ignore=(--ignore-user "$ACCOUNT")
  bash "$BASELINE_CMD" --compare "$BASELINE" "${ignore[@]}" </dev/null
}

if (( CHECKS_ONLY )); then
  echo "Checking, as footbag-operator and read-only, against ${BASELINE}:"
  echo "  the job role's denials, then footbag-operator and both runtime trusts"
  if [[ -n "$ACCOUNT" ]]; then
    echo "  with ${ACCOUNT}'s own key left out"
  else
    echo "  with no user's key left out"
  fi
  check_failed() {
    echo "" >&2
    echo "FAILED: ${1}. Re-run once fixed:" >&2
    echo "  bash scripts/prove-dev-tester-role.sh --checks-only${ACCOUNT:+ --account ${ACCOUNT}}" >&2
    exit 1
  }
  echo ""
  echo "== The job role's denials, as footbag-operator"
  run_denials || check_failed "a denial the role must carry did not hold"
  echo ""
  echo "== footbag-operator and both runtime trusts, against ${BASELINE}"
  BASE_RC=0
  compare_baseline || BASE_RC=$?
  case "$BASE_RC" in
    0) ;;
    3) check_failed "something administrative CHANGED since the baseline; the lines above say what" ;;
    *) check_failed "the protected facts could not be read" ;;
  esac
  echo ""
  ASIDE=""
  [[ -n "$ACCOUNT" ]] && ASIDE=", ${ACCOUNT}'s own key aside"
  echo "CHECKED: the role's denials hold, and footbag-operator and both runtime trusts"
  echo "are exactly as they were in ${BASELINE}${ASIDE}."
  exit 0
fi

if [[ -t 0 ]]; then
  echo "ERROR: stdin is a terminal. The last step reads the shared account's sudo" >&2
  echo "       password from stdin, so redirect its file:" >&2
  echo "         < ~/AWS/AWS_OPERATOR.txt bash scripts/prove-dev-tester-role.sh --account ${ACCOUNT}" >&2
  exit 1
fi
if ! terminal_present; then
  echo "ERROR: no terminal to confirm on. The deploy step replaces what staging runs" >&2
  echo "       and is confirmed by a typed word. Nothing was run." >&2
  exit 1
fi
# Read once, here, and given to step 6 alone. The steps before it run with
# their stdin closed, so none of them can consume it or pass it on.
SUDO_PASS=""
IFS= read -r SUDO_PASS || true
if [[ -z "$SUDO_PASS" ]]; then
  echo "ERROR: nothing arrived on stdin; redirect the shared account's staging sudo password file." >&2
  exit 1
fi

echo "Proving ${ACCOUNT} through the FootbagDevTester role on staging, against ${BASELINE}:"
echo "  1. as the role: the chain into the staging runtime role, then a staging"
echo "     plan that must be empty"
echo "  2. as the role: a code-only deploy to staging, replacing what staging runs"
echo "  3. as the role: the quick test gate with the staging rows, which rewrites"
echo "     this machine's staging pass receipt"
echo "  4-6. as footbag-operator, read-only: the role's denials, the protected"
echo "     account facts against the baseline, and the onboarding read back"
echo ""
if ! confirm_from_tty "Type 'APPLY' to run them: " "APPLY"; then
  echo "Not confirmed; nothing was run." >&2
  exit 1
fi

# stop <step> <what>: one failure, one place to resume.
stop() {
  echo "" >&2
  echo "FAILED at step ${1}: ${2}" >&2
  echo "       Resume once fixed:" >&2
  echo "         < ~/AWS/AWS_OPERATOR.txt bash scripts/prove-dev-tester-role.sh --account ${ACCOUNT} --from-step ${1}" >&2
  exit 1
}
as_role() { bash "$WRAP_CMD" --account "$ACCOUNT" "$@" </dev/null; }

if (( FROM_STEP <= 1 )); then
  echo ""
  echo "== 1. The chain into the staging runtime role as ${ACCOUNT}, then a staging plan that must be empty"
  # Assumed directly from the job-role session rather than through a workstation
  # profile, so the proof does not depend on which profile this machine names
  # footbag-staging-runtime: on an administrator's machine that one chains from
  # footbag-operator. Only the session's ARN is asked for; its credentials are
  # never printed and are discarded with the call.
  PROVE_ACCOUNT_ID="$(as_role "$AWS_CMD" sts get-caller-identity --query Account --output text)" \
    || stop 1 "the job role's identity could not be read"
  RUNTIME_ARN="arn:aws:iam::${PROVE_ACCOUNT_ID}:role/footbag-staging-app-runtime"
  CHAINED="$(as_role "$AWS_CMD" sts assume-role --role-arn "$RUNTIME_ARN" \
    --role-session-name "$ACCOUNT" --duration-seconds 900 \
    --query 'AssumedRoleUser.Arn' --output text)" \
    || stop 1 "the job role could not assume the staging runtime role"
  [[ "$CHAINED" == "arn:aws:sts::${PROVE_ACCOUNT_ID}:assumed-role/footbag-staging-app-runtime/${ACCOUNT}" ]] \
    || stop 1 "the chain landed on ${CHAINED:-nothing}, not footbag-staging-app-runtime"
  echo "    chained into ${CHAINED}"
  as_role bash "$APPLY_CMD" --target staging --require-empty-plan \
    || stop 1 "the job role could not plan staging, or the plan was not empty"
fi
if (( FROM_STEP <= 2 )); then
  echo ""
  echo "== 2. A code-only staging deploy as ${ACCOUNT}"
  as_role bash "$DEPLOY_ENTRY" --target staging || stop 2 "the code-only deploy did not finish"
fi
if (( FROM_STEP <= 3 )); then
  echo ""
  echo "== 3. The quick gate with the staging rows, as ${ACCOUNT}"
  as_role bash "$RUNNER_CMD" --quick --staging || stop 3 "the gate did not pass"
fi
if (( FROM_STEP <= 4 )); then
  echo ""
  echo "== 4. The job role's denials, as footbag-operator"
  run_denials || stop 4 "a denial the role must carry did not hold"
fi
if (( FROM_STEP <= 5 )); then
  echo ""
  echo "== 5. footbag-operator and both runtime trusts, against ${BASELINE}"
  BASE_RC=0
  compare_baseline || BASE_RC=$?
  case "$BASE_RC" in
    0) ;;
    3) stop 5 "something administrative CHANGED since the baseline; the lines above say what" ;;
    *) stop 5 "the protected facts could not be read" ;;
  esac
fi

echo ""
echo "== 6. The onboarding of ${ACCOUNT}, read back"
VERIFY_RC=0
printf '%s\n' "$SUDO_PASS" | bash "$VERIFY_CMD" --verify --target staging --account "$ACCOUNT" || VERIFY_RC=$?
SUDO_PASS=""
case "$VERIFY_RC" in
  0) ;;
  3)
    echo ""
    echo "Steps 1 to 5 proved. The onboarding is in place, but CloudTrail does not show"
    echo "its acceptance yet; re-run the last step in a few minutes:"
    echo "  < ~/AWS/AWS_OPERATOR.txt bash scripts/prove-dev-tester-role.sh --account ${ACCOUNT} --from-step 6"
    exit 3
    ;;
  *) stop 6 "the onboarding did not read back as in place" ;;
esac

echo ""
echo "PROVED: ${ACCOUNT} chained into the staging runtime role, planned, deployed and"
echo "tested staging through the role, the role's denials hold, and footbag-operator"
echo "and both runtime trusts are exactly as they were in ${BASELINE}."
