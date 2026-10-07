#!/usr/bin/env bash
# restart-host.sh
#
# Restarts the application stack on a deployed host and proves it came back.
#
# Some changes reach the running containers only through a restart: a rotated
# key installed on the host, a value written into the host env file, the worker's
# recovery sweep. Each of those runbooks used to end in a hand-typed
# `sudo systemctl restart footbag` over ssh, which is a step an operator holds in
# their head, run with no check that the site answered afterwards. This is that
# step as a script.
#
# WHAT IT DOES.
#
#   1. Proves the host it reached records the environment it was asked for.
#   2. On production, states what is about to happen and asks for APPLY.
#   3. Restarts the footbag service, which brings every container down and up
#      again: web, worker, nginx and the image service.
#   4. Waits for the service to be active, every container running and none
#      unhealthy or still starting, and the application's readiness endpoint to
#      answer from inside the web container. Only then does it report success.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default host.
#   - A host that records a different environment, before anything is changed.
#   - A production restart nobody confirmed at a terminal. Production is what the
#     public is served, so it asks every time; staging does not, as with a
#     staging deploy.
#
# It does not redeploy, rebuild or migrate anything. A restart that does not
# come back healthy is reported as a failure with the service status attached,
# and nothing is rolled back: there is nothing this run changed to roll back to.
#
# Usage. The host sudo password is read from stdin, line 1. Which file holds it
# follows the account the alias connects as:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
# A run started without the redirect names the one it needs.
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/restart-host.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restart-host.sh --target production
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

REMOTE_HALF="${SCRIPT_DIR}/internal/restart-host-remote.sh"

TARGET=""

die() { echo "restart-host: $*" >&2; exit 1; }

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "restart-host: --target requires an argument" >&2; exit 2; } ;;
    -h|--help) usage 0 ;;
    *) echo "restart-host: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] \
  || die "--target must be production or staging (got '${TARGET}')"
[[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/restart-host.sh --target ${TARGET}" \
  "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

if [[ "$TARGET" == "production" ]]; then
  echo ""
  echo "About to RESTART the application stack on ${ALIAS}."
  echo "  Every container stops and starts again. The site answers with the"
  echo "  maintenance page for the few seconds that takes, and a form submitted"
  echo "  in that moment may fail."
  echo ""
  confirm_from_tty "Type 'APPLY' to restart production: " "APPLY" \
    || die "not confirmed; nothing was restarted"
fi

echo "==> Restarting footbag on ${ALIAS}"
if ! {
    printf '%s\n' "$SUDO_PASS"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'; then
  die "the restart on ${ALIAS} did not come back healthy; its own output above says which check failed"
fi

echo ""
echo "== ${TARGET} restarted and healthy =="
