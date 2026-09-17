#!/usr/bin/env bash
# host-diagnostics.sh
#
# Runs the host diagnostics on a deployed host and brings the output back, over
# the same pinned connection every other privileged step in this tree uses.
#
# WHY THIS EXISTS.
#
# The diagnostics themselves have always been a script. Getting them onto the
# host was not: the runbook handed an operator an `scp` and then an `ssh`, with a
# note telling them to upload it every time rather than reuse a copy sitting in
# the home directory, because the deploy ships only the scripts the host itself
# invokes and any other copy is as old as the last hand upload.
#
# That is two defects in one step. A remembered instruction is one an operator
# skips under pressure, and then reads a stale host's answer as the current one.
# And a hand-typed ssh carries none of the host-key pinning the scripts pass on
# their own command line, so the one command somebody ran to check the state of a
# host was the single connection on the whole path with nothing verifying which
# host had answered.
#
# So the upload is unconditional and the connection is pinned, and neither is
# something a person has to remember.
#
# WHAT IT REFUSES TO DO.
#
#   - Connect without the pinned host-key file. Same refusal as the deploy, for
#     the same reason: the sudo password goes out as line one of the stream.
#   - Leave the uploaded copy behind. It is removed on every path out, including
#     an interrupt, so the next run cannot read an old one.
#   - Take the sudo password from anywhere but the operator credential file that
#     every other script on this path reads.
#
# Usage:
#   bash scripts/host-diagnostics.sh --target staging
#   bash scripts/host-diagnostics.sh --target staging status
#   bash scripts/host-diagnostics.sh --target production host-access
#
# The subcommand and any arguments after it are passed through to the
# diagnostics script unchanged; with none, it runs that script's own default.
#
# Flags:
#   --target <staging|production>  which host to run against. No default: which
#                                  host a diagnostic describes is never inherited
#                                  from ambient state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

DIAGNOSTICS="${SCRIPT_DIR}/staging_diagnostics.sh"
TARGET=""

usage() {
  cat <<'EOF'
Usage: bash scripts/host-diagnostics.sh --target <staging|production> [subcommand [args...]]

Uploads the diagnostics script to the host over the pinned connection, runs it
there, brings the output back, and removes the uploaded copy.

  --target <env>   staging or production. Required; never defaulted.

Anything after the flags is passed to the diagnostics script unchanged.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --help|-h) usage; exit 0 ;;
    --*)
      echo "ERROR: unknown flag '$1'" >&2
      usage >&2
      exit 2
      ;;
    *) break ;;
  esac
done

# The shared refusal rather than another copy of it, so an operator meets the
# same words here as in every other script that names an environment.
require_target "$TARGET" staging production || exit 2

ALIAS="footbag-${TARGET}"
CRED_FILE="${HOME}/AWS/AWS_OPERATOR.txt"
[[ "$TARGET" == "production" ]] && CRED_FILE="${HOME}/AWS/AWS_OPERATOR_PRODUCTION.txt"

[[ -r "$DIAGNOSTICS" ]] || {
  echo "ERROR: cannot read ${DIAGNOSTICS}" >&2
  exit 1
}

if [[ ! -r "$CRED_FILE" ]]; then
  echo "ERROR: operator credential file unavailable." >&2
  echo "       The diagnostics use sudo on the host, so they need the same" >&2
  echo "       credential every other script on this path reads." >&2
  exit 1
fi

require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10")

# Read once, from line one, exactly as every other script on this path does. Never
# from a flag, never from the environment, and never echoed.
SUDO_PASS=""
IFS= read -r SUDO_PASS < "$CRED_FILE" || SUDO_PASS=""
if [[ -z "$SUDO_PASS" ]]; then
  echo "ERROR: the first line of ${CRED_FILE} is empty; expected the host sudo password." >&2
  exit 1
fi

# Nothing is uploaded, and that is the point: the body is streamed into one root
# shell, which is the wire pattern every privileged step in this tree uses. There
# is no file on the host, so there is no staging path to choose, no copy for two
# operators to collide over, and no cleanup for a crash or an interrupt to skip.
# The "upload it each time rather than reusing an old copy" instruction the
# runbook carried simply stops being a thing anybody can get wrong.
#
# The whole script runs AS ROOT, under one `sudo -k -S -p ""`, rather than each of
# its own `sudo` calls being answered separately. Those calls expect an
# interactive terminal, which a one-shot ssh does not allocate, and that is
# exactly why the runbook told an operator to log in and run it by hand. Run as
# root, each one is a no-op that succeeds, and the password crosses once as line
# one of the stream rather than being cached on the host for a later command to
# inherit. `-k` ignores any cached timestamp so the host consumes precisely the
# line supplied.
DIAG_ARGS=""
if (( $# > 0 )); then
  DIAG_ARGS="$(printf ' %q' "$@")"
fi

DIAG_STATUS=0
{
  printf '%s\n' "$SUDO_PASS"
  cat "$DIAGNOSTICS"
} | ssh "${SSH_OPTS[@]}" "$ALIAS" "sudo -k -S -p '' bash -s --${DIAG_ARGS}" || DIAG_STATUS=$?

exit "$DIAG_STATUS"
