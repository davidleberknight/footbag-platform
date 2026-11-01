#!/usr/bin/env bash
# scripts/step-amazon-linux.sh -- steps a host to the Amazon Linux 2023 release
# pinned in ops/tool-versions.env, or reports where it stands.
#
# Why this exists: a host's distribution packages, docker included, are the ones
# its locked release serves, so patching the operating system means stepping the
# release, deliberately and staging first, when the maintainer decides to patch.
# Move AMAZON_LINUX_RELEASE (and DOCKER_ENGINE_HOST to the version that release
# serves) with scripts/bump-tool.sh, then run this on staging, prove staging,
# and run it on production.
#
# What it refuses to do:
#   - Run without --target; there is no default host.
#   - Act on a host whose recorded FOOTBAG_ENV is not the target.
#   - Step production without a typed APPLY at a terminal.
#   - Report success unless the host then reports the pinned release.
#
# Usage:
#   < <operator credential file> bash scripts/step-amazon-linux.sh --target <staging|production> [--status]
#
# Flags:
#   --target   staging or production (required)
#   --status   report the host's release, the pin and the newer releases the
#              distribution offers; changes nothing
#
# A re-run on a host already at the pin does nothing and says so.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"
REMOTE_HALF="${SCRIPT_DIR}/internal/step-amazon-linux-remote.sh"

TARGET="" MODE=step
die() { echo "step-amazon-linux: $*" >&2; exit 1; }
usage() {
  sed -n '/^# Usage:/,/^# A re-run/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "step-amazon-linux: --target requires an argument" >&2; exit 2; } ;;
    --status)  MODE=status; shift ;;
    -h|--help) usage 0 ;;
    *) echo "step-amazon-linux: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done
[[ "$TARGET" == "production" || "$TARGET" == "staging" ]] \
  || die "--target must be production or staging (got '${TARGET}')"
[[ -r "$REMOTE_HALF" ]] || die "missing remote half: $REMOTE_HALF"
tool_pins_ok AMAZON_LINUX_RELEASE || exit 1
tool_pin AMAZON_LINUX_RELEASE
PIN="$TOOL_PIN_VALUE"

ALIAS="footbag-${TARGET}"
require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/step-amazon-linux.sh --target ${TARGET}" "$ALIAS" "$TARGET" || exit 1
require_host_is "$ALIAS" "$TARGET" || exit 1

if [[ "$MODE" == step && "$TARGET" == "production" ]]; then
  echo ""
  echo "About to step ${ALIAS} to Amazon Linux ${PIN}."
  echo "  Every distribution package moves to the version that release serves,"
  echo "  docker included. Do this only once staging runs ${PIN} and has been proved."
  echo ""
  confirm_from_tty "Type 'APPLY' to step production: " "APPLY" \
    || die "not confirmed; nothing was changed"
fi

echo "==> ${MODE} Amazon Linux on ${ALIAS} (pinned ${PIN})"
if ! {
    printf '%s\n' "$SUDO_PASS"
    printf 'MODE=%q\n' "$MODE"
    printf 'AMAZON_LINUX_RELEASE=%q\n' "$PIN"
    cat "$REMOTE_HALF"
  } | ssh "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash'; then
  die "the ${MODE} on ${ALIAS} did not complete; its own output above says why"
fi
