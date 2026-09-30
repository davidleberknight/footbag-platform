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
# Playwright keeps its traces under tests/test-results/deployed. It needs no
# credential beyond the Terraform read that finds the environment's address. The
# one-time browser install is `npx playwright install chromium`.
#
# Usage:
#   bash scripts/test-deployed.sh staging
#   bash scripts/test-deployed.sh production
#   (or npm run test:deployed -- <staging|production>)
#
# Test seams (announced on stderr): DEPLOYED_BASE_URL supplies the address
# instead of reading Terraform; FOOTBAG_PLAYWRIGHT_BIN replaces the Playwright
# runner.

set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  staging|production) ;;
  -h|--help) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "ERROR: name the environment: staging or production (got '${TARGET}')." >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

if [[ -n "${DEPLOYED_BASE_URL:-}" ]]; then
  echo "TEST SEAM: DEPLOYED_BASE_URL is ${DEPLOYED_BASE_URL}; the environment's address was not read from Terraform." >&2
  BASE_URL="$DEPLOYED_BASE_URL"
else
  # shellcheck source=scripts/lib/terraform-output.sh
  source "${REPO_ROOT}/scripts/lib/terraform-output.sh"
  if ! tf_output_read "${REPO_ROOT}/terraform/${TARGET}" cloudfront_domain || [[ -z "$TF_OUTPUT_VALUE" ]]; then
    echo "ERROR: the ${TARGET} address could not be read from Terraform." >&2
    tf_output_explain "terraform/${TARGET}" cloudfront_domain
    exit 1
  fi
  BASE_URL="https://${TF_OUTPUT_VALUE}"
fi

PLAYWRIGHT_BIN="${FOOTBAG_PLAYWRIGHT_BIN:-${REPO_ROOT}/node_modules/.bin/playwright}"
[[ -n "${FOOTBAG_PLAYWRIGHT_BIN:-}" ]] && echo "TEST SEAM: Playwright is ${FOOTBAG_PLAYWRIGHT_BIN}." >&2

echo "==> Read-only browser check: ${TARGET} at ${BASE_URL}"
DEPLOYED_BASE_URL="$BASE_URL" DEPLOYED_TARGET="$TARGET" \
  "$PLAYWRIGHT_BIN" test -c tests/playwright.deployed.config.ts
