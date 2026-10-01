#!/usr/bin/env bash
# scripts/test-deployed.sh -- the read-only browser check against a deployed
# environment.
#
# WHY IT EXISTS. After a deploy every URL can answer 200 while the browser refuses
# a script or stylesheet under the content security policy, or a page script
# throws: the clubs map, a video or the captcha is then dead, and no status-code
# smoke notices. This loads the pages a visitor lands on first in a real browser
# and fails on any policy violation, script error, console error or failed
# request. Run it after each staging deploy and after each production deploy; the
# deploy prints the reminder. The staging leg is also the staging-browser row of
# ./run_all_tests.sh --staging.
#
# WHAT IT REFUSES. Any target other than staging or production. On both it loads
# anonymous pages only, signs in as nobody and submits nothing (the spec
# registers nothing else), because a check must not change a deployed host.
#
# It writes nothing on the deployed host: no form, no sign-in, and the browser's
# own policy-violation report POST is aborted before it is sent. Locally,
# Playwright keeps its traces under tests/test-results/deployed. The address it
# loads is the one the environment's host records it serves, asked of the host
# with the credential file the shared rule selects, after the host confirms it
# is that environment. The one-time browser install is
# `npx playwright install chromium`.
#
# Usage:
#   bash scripts/test-deployed.sh --target staging
#   bash scripts/test-deployed.sh --target production
#   (or npm run test:deployed -- --target <staging|production>)
#
# Test seams (announced on stderr): DEPLOYED_BASE_URL supplies the address
# instead of reading Terraform; FOOTBAG_PLAYWRIGHT_BIN replaces the Playwright
# runner.

set -euo pipefail

TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    -h|--help) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=scripts/lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
require_target "$TARGET" staging production || exit 2
cd "$REPO_ROOT"

if [[ -n "${DEPLOYED_BASE_URL:-}" ]]; then
  echo "TEST SEAM: DEPLOYED_BASE_URL is ${DEPLOYED_BASE_URL}; the environment's address was not asked of its host." >&2
  BASE_URL="$DEPLOYED_BASE_URL"
else
  # The address the environment's host records it serves, asked of the host
  # once it confirms it is that environment.
  host_address_for "$TARGET" || exit 1
  BASE_URL="$HOST_ADDRESS"
fi

PLAYWRIGHT_BIN="${FOOTBAG_PLAYWRIGHT_BIN:-${REPO_ROOT}/node_modules/.bin/playwright}"
[[ -n "${FOOTBAG_PLAYWRIGHT_BIN:-}" ]] && echo "TEST SEAM: Playwright is ${FOOTBAG_PLAYWRIGHT_BIN}." >&2

echo "==> Read-only browser check: ${TARGET} at ${BASE_URL}"
DEPLOYED_BASE_URL="$BASE_URL" DEPLOYED_TARGET="$TARGET" \
  "$PLAYWRIGHT_BIN" test -c tests/playwright.deployed.config.ts
