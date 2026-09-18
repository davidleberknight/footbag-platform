#!/usr/bin/env bash
# diagnose-cwagent.sh
#
# Read-only diagnostic for the CloudWatch agent on a Lightsail host. Changes
# nothing, on the host or in the account.
#
# It exists because the workstation cannot tell the two silences apart. When no
# metrics arrive, the agent may be running with no configuration, or running
# with a configuration and having its writes refused, and from outside those
# look the same. The distinguishing facts are all on the host: whether the
# translated config the service reads exists at all, which namespace it carries,
# and what the agent's own log says.
#
# Uses the same wire as the installer: the sudo password is the first line of
# stdin and the root-side body is cat-piped into the same stream, so no secret
# reaches any process argv and nothing is staged on the host.
#
# Usage. Reads the sudo password from stdin, line 1.
#
# Which file holds that password follows the account the alias connects as, and
# each account has its own file per environment, because staging and production
# are separate hosts with separate passwords:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/HOST_OPERATOR.txt  ~/AWS/HOST_OPERATOR_PRODUCTION.txt
#
# A run started without the redirect names the one it needs.
#
#   < ~/AWS/HOST_OPERATOR.txt bash scripts/diagnose-cwagent.sh --target staging
#   < ~/AWS/HOST_OPERATOR_PRODUCTION.txt bash scripts/diagnose-cwagent.sh --target production
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-production ...

set -euo pipefail

TARGET=""

usage() {
  cat <<'EOF'
Usage: < ~/AWS/HOST_OPERATOR.txt bash scripts/diagnose-cwagent.sh --target staging
       < ~/AWS/HOST_OPERATOR_PRODUCTION.txt bash scripts/diagnose-cwagent.sh --target production

Reads the sudo password from stdin (line 1). Read-only.

Which file holds that password follows the account the alias connects as; a run
started without the redirect names the one it needs.

Override the SSH target:
  DEPLOY_TARGET=footbag-production ...
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

# shellcheck source=lib/host-env-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"

require_target "$TARGET" staging production || exit 2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${DEPLOY_TARGET:-footbag-${TARGET}}"
REMOTE_HALF="${SCRIPT_DIR}/internal/diagnose-cwagent-remote.sh"

# The shared guard rather than a gate of this script's own. It reads the account
# the alias connects as and names the credential file that account keeps for this
# environment, which is what this script's header promises and what a
# placeholder in a refusal cannot do: an operator part way onto their own named
# account is told to redirect a file holding somebody else's password, the
# connection succeeds on the key, and sudo fails in a way that reads as a broken
# account. It reads the one password line too, so nothing here consumes stdin
# twice.
require_operator_stdin "scripts/diagnose-cwagent.sh --target ${TARGET}" \
  "$REMOTE" "$TARGET" || exit 1

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote-half: $REMOTE_HALF" >&2; exit 1; }

require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

echo "==> Diagnosing the CloudWatch agent on $REMOTE"
# Exactly ONE line of the operator's stdin reaches the host, not the whole file,
# and the guard above is where that line was read. sudo consumes it and the
# remote bash inherits whatever follows, so forwarding the rest of a credential
# file would run each remaining line as a root shell command. That this script
# only reads is no protection: what it forwards is not its own.
{
  printf '%s\n' "$SUDO_PASS"
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'
