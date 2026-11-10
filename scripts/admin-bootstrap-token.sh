#!/usr/bin/env bash
# admin-bootstrap-token.sh
#
# Full lifecycle for the single-shot first-admin bootstrap token, in one
# wrapper so the operator never has to remember raw `aws ssm` commands:
#
#   provision  Generate a fresh token (openssl rand -hex 32), store it as a
#              SecureString at /footbag/<target>/app/bootstrap/admin_token,
#              and print the token ONCE for out-of-band handoff to the
#              intended first admin. Refuses to overwrite an existing
#              parameter (a live token means a handoff is already in
#              flight; run cleanup first if it must be replaced).
#   status     Report whether the parameter exists. Present means unclaimed,
#              or the claim succeeded but the app's self-delete failed (the
#              admin.bootstrap_token_delete_failed operational alarm fires
#              in that case; run cleanup). Absent means consumed cleanly or
#              never provisioned. With --wait-minutes <n>, it waits for the
#              claim: while the token is present it says where to submit it
#              and checks again, and it exits 3 if the token is still present
#              after n minutes. A successful claim spends the token, so its
#              absence is the claim's proof.
#   cleanup   Delete the parameter. Use after a successful claim whose
#              self-delete failed, or to abort a pending handoff. Asks for
#              a typed APPLY on a terminal, with no flag to skip it: a
#              pending token is a live credential someone may be about to
#              use, and deleting it cannot be undone.
#
# The app consumes the token at POST /admin/bootstrap-claim: on a match it
# grants the first admin atomically and then deletes this parameter itself.
# This script covers provisioning and the failure windows around that flow.
# The token value is written to SSM via a 0600 temp file (cli-input-json)
# so it never appears in process arguments; it is printed to the terminal
# exactly once for the handoff.
#
# Usage:
#   scripts/admin-bootstrap-token.sh --target staging --profile <staging-profile> provision
#   scripts/admin-bootstrap-token.sh --target production --profile <prod-profile> status
#   scripts/admin-bootstrap-token.sh --target production --profile <prod-profile> \
#     status --wait-minutes 30
#   scripts/admin-bootstrap-token.sh --target staging --profile <staging-profile> cleanup
#
# Exit: 0 done (status: read, or with --wait-minutes the token is spent);
# 1 a refusal or a failed read; 2 usage; 3 (--wait-minutes) still present.
#
# Test seams: ADMIN_BOOTSTRAP_AWS_BIN replaces the AWS CLI for the parameter
# calls, and ADMIN_BOOTSTRAP_POLL_SECS the seconds between checks while waiting
# (default 15). A run using either says so on stderr, because a stubbed run
# proves nothing about the account.
set -euo pipefail

# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/aws-profile.sh"
# confirm_from_tty: the shared typed confirmation, read from the terminal.
# shellcheck source=lib/host-env-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"

TARGET=""
AWS_PROFILE_ARG=""
ACTION=""
PRINT_TO_STDOUT="no"
WAIT_MINUTES=""

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --print-to-stdout)
      PRINT_TO_STDOUT="yes"
      shift
      ;;
    --wait-minutes)
      WAIT_MINUTES="${2:-}"
      shift 2 || { echo "ERROR: --wait-minutes requires an argument" >&2; exit 2; }
      ;;
    provision|status|cleanup)
      ACTION="$1"
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      ;;
  esac
done

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be 'staging' or 'production'" >&2
  exit 2
fi
if [[ -z "$ACTION" ]]; then
  echo "ERROR: an action is required: provision | status | cleanup" >&2
  exit 2
fi
if [[ -n "$WAIT_MINUTES" ]]; then
  [[ "$ACTION" == status ]] || { echo "ERROR: --wait-minutes goes with the status action only" >&2; exit 2; }
  [[ "$WAIT_MINUTES" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: --wait-minutes takes a whole number of minutes" >&2; exit 2; }
fi
POLL_SECS="${ADMIN_BOOTSTRAP_POLL_SECS:-15}"
[[ -n "${ADMIN_BOOTSTRAP_POLL_SECS:-}" ]] && echo "NOTE: ADMIN_BOOTSTRAP_POLL_SECS='${POLL_SECS}' replaces the wait between checks; this run proves nothing about the account." >&2
[[ "$POLL_SECS" =~ ^[0-9]+$ ]] || { echo "ERROR: ADMIN_BOOTSTRAP_POLL_SECS must be a whole number" >&2; exit 2; }

PARAM_NAME="/footbag/${TARGET}/app/bootstrap/admin_token"
AWS_BIN="${ADMIN_BOOTSTRAP_AWS_BIN:-aws}"
[[ -n "${ADMIN_BOOTSTRAP_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the account." >&2
AWS_ARGS=()
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. Nothing here asks the operator to export anything.
  aws_profile_ensure || exit 1
fi

# True when the parameter exists, false when AWS says it does not. Any other
# failure stops the run: a read that failed is not an absent token, and taking it
# as one would report a pending claim as spent.
param_exists() {
  local err rc=0
  err="$("$AWS_BIN" ssm get-parameter --name "$PARAM_NAME" "${AWS_ARGS[@]}" 2>&1 >/dev/null)" || rc=$?
  (( rc == 0 )) && return 0
  [[ "$err" == *ParameterNotFound* ]] && return 1
  echo "ERROR: ${PARAM_NAME} could not be read on ${TARGET}: ${err##*$'\n'}" >&2
  exit 1
}

case "$ACTION" in
  provision)
    if param_exists; then
      echo "REFUSING: ${PARAM_NAME} already exists on ${TARGET}." >&2
      echo "A live token means a handoff may be in flight. If it must be" >&2
      echo "replaced, run the cleanup action first, then provision again." >&2
      exit 1
    fi
    # The token is a live admin credential shown exactly once, so it has to reach
    # a person rather than whatever happens to be capturing this script's stdout:
    # a CI log, a wrapper, an agent transcript. Writing it to the terminal device
    # means a caller who redirects stdout collects the surrounding prose and never
    # the secret. Checked BEFORE the parameter is written, because a token nobody
    # can read is not a failed run, it is a live credential needing cleanup.
    if [[ "$PRINT_TO_STDOUT" != "yes" ]] && ! { true >/dev/tty; } 2>/dev/null; then
      echo "ERROR: no terminal to display the token on, and --print-to-stdout was not given." >&2
      echo "       This token is shown once and must not land in a captured stream." >&2
      echo "       Re-run from an interactive shell. Nothing has been provisioned." >&2
      exit 1
    fi
    TOKEN="$(openssl rand -hex 32)"
    TMP_JSON="$(mktemp)"
    chmod 600 "$TMP_JSON"
    trap 'shred -u "$TMP_JSON" 2>/dev/null || true' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    printf '{"Name":"%s","Type":"SecureString","Value":"%s"}\n' \
      "$PARAM_NAME" "$TOKEN" > "$TMP_JSON"
    "$AWS_BIN" ssm put-parameter --cli-input-json "file://${TMP_JSON}" "${AWS_ARGS[@]}" >/dev/null
    echo "Provisioned ${PARAM_NAME} on ${TARGET}."
    echo
    echo "Hand this token to the intended first admin OUT OF BAND (it is"
    echo "shown only this once; it is not retrievable from this script):"
    echo
    if [[ "$PRINT_TO_STDOUT" == "yes" ]]; then
      echo "  ${TOKEN}"
    else
      printf '  %s\n' "$TOKEN" > /dev/tty
    fi
    echo
    echo "They register a normal account, sign in, and submit it at"
    echo "/admin/bootstrap-claim. Afterwards run the status action to"
    echo "verify the parameter self-deleted."
    ;;
  status)
    if [[ -n "$WAIT_MINUTES" ]] && param_exists; then
      # A count of checks rather than a clock, so the bound is the same however
      # long each read takes; with no pause between checks it is one per second
      # of the wait.
      checks=$(( WAIT_MINUTES * 60 / (POLL_SECS > 0 ? POLL_SECS : 1) ))
      echo "WAITING: ${PARAM_NAME} is still present on ${TARGET}, so the token is unclaimed."
      echo "Signed in as the member who is to be the first admin, open"
      echo "/admin/bootstrap-claim on ${TARGET} and submit the token printed earlier."
      echo "The claim spends the token; this checks every ${POLL_SECS} seconds for up"
      echo "to ${WAIT_MINUTES} minutes."
      while (( checks > 0 )); do
        sleep "$POLL_SECS"
        checks=$(( checks - 1 ))
        param_exists || break
      done
    fi
    if param_exists; then
      if [[ -n "$WAIT_MINUTES" ]]; then
        echo "PRESENT: ${PARAM_NAME} still exists on ${TARGET} after ${WAIT_MINUTES} minutes."
        echo "The claim has not spent it. If the claim page reported success, the"
        echo "app's self-delete failed: verify the grant in the audit ledger, then"
        echo "run cleanup. Otherwise submit the token and run this again."
        exit 3
      fi
      echo "PRESENT: ${PARAM_NAME} exists on ${TARGET}."
      echo "Either the token is not yet claimed, or the claim succeeded but"
      echo "the app's self-delete failed (in that case the"
      echo "admin.bootstrap_token_delete_failed operational alarm fired;"
      echo "verify the grant in the audit ledger, then run cleanup)."
    else
      echo "ABSENT: ${PARAM_NAME} does not exist on ${TARGET}."
      echo "The token was consumed cleanly or was never provisioned."
    fi
    ;;
  cleanup)
    if ! param_exists; then
      echo "Nothing to do: ${PARAM_NAME} does not exist on ${TARGET}."
      exit 0
    fi
    echo "About to delete ${PARAM_NAME} on ${TARGET}."
    echo "A token handed out and not yet claimed stops working, and the"
    echo "first admin then needs a newly provisioned one."
    if ! confirm_from_tty "Type APPLY to delete the bootstrap token: " "APPLY"; then
      echo "Not confirmed; nothing was deleted." >&2
      exit 1
    fi
    "$AWS_BIN" ssm delete-parameter --name "$PARAM_NAME" "${AWS_ARGS[@]}"
    echo "Deleted ${PARAM_NAME} on ${TARGET}. The bootstrap token is dead."
    ;;
esac
