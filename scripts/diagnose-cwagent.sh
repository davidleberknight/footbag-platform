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
# Usage. Reads the sudo password from stdin, line 1:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/diagnose-cwagent.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/diagnose-cwagent.sh --target production
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-production ...

set -euo pipefail

TARGET=""

usage() {
  cat <<'EOF'
Usage: < <operator-credential-file> bash scripts/diagnose-cwagent.sh --target staging|production

Reads the sudo password from stdin (line 1). Read-only.

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
    --help|-h) usage; exit 2 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

case "$TARGET" in
  staging|production) ;;
  '') echo "ERROR: --target is required ('staging' or 'production')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2; exit 2 ;;
esac

if [[ -t 0 ]]; then
  echo "ERROR: must receive sudo password on stdin." >&2
  echo "       Run via: < <operator-credential-file> bash scripts/diagnose-cwagent.sh --target $TARGET" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${DEPLOY_TARGET:-footbag-${TARGET}}"
REMOTE_HALF="${SCRIPT_DIR}/internal/diagnose-cwagent-remote.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote-half: $REMOTE_HALF" >&2; exit 1; }

require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

echo "==> Diagnosing the CloudWatch agent on $REMOTE"
{
  cat
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'
