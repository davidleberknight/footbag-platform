#!/usr/bin/env bash
# scripts/verify-production-release.sh -- may this tree ship to production?
#
# The one place an operator asks that question before starting a production
# deploy. It runs exactly the check every production deploy runs before it
# touches a host (scripts/lib/production-release-gate.sh), so a PASS here means
# the deploy's own gate will pass on this tree, and a refusal lists every rule
# that fails with what to do about it.
#
# What a production release needs, in order:
#   1. The change is committed, pushed to main, and CI's "Type-check and test"
#      check is green for that commit.
#   2. ./run_all_tests.sh --full has passed on that tree (local; no role needed).
#   3. Staging runs that commit, deployed from the clean tree.
#   4. The read-only staging checks have passed against that deploy, as a
#      dev-tester:
#        scripts/as-dev-tester.sh --account <your-name> ./run_all_tests.sh --quick --staging
#   5. This check passes; then DEPLOY_TARGET=footbag-production bash deploy_to_aws.sh
#   6. After the deploy, the read-only browser check against production:
#        npm run test:deployed -- production
#
# Read-only: it changes nothing anywhere apart from fetching main into this
# repository's origin/main. It never prompts, so it runs where no terminal is
# attached; it reads CI through a signed-in gh and staging through the operator's
# ssh key, and a question it cannot answer is a refusal.
#
# Usage: bash scripts/verify-production-release.sh

set -euo pipefail

case "${1:-}" in
  "") ;;
  -h|--help) sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "ERROR: unknown argument '$1'. This script takes none." >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/production-release-gate.sh
source "${REPO_ROOT}/scripts/lib/production-release-gate.sh"

# The standalone check honours the test seams, announced, so its suite can drive
# it; the deploys never do.
if production_release_gate_require "$REPO_ROOT" --allow-seams; then
  echo "PASS: this tree may ship to production."
  exit 0
fi
exit 1
