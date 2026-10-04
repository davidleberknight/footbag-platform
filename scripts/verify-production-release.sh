#!/usr/bin/env bash
# scripts/verify-production-release.sh -- may this tree ship to production?
#
# The strict form of the production release rules, asked on demand. Every
# production deploy checks the same rules (scripts/lib/production-release-gate.sh):
# it stops on a real problem and reports the rest as warnings, because only
# footbag-operator deploys production and that holder decides at the typed
# confirmation. Here a tree that does not meet every rule fails, listing each
# with what to do about it.
#
# What a proven production release has, in order:
#   1. The change is committed, pushed to main, and CI's "Type-check and test"
#      check is green for that commit.
#   2. ./run_all_tests.sh has passed on that tree (local; no role needed).
#   3. Staging runs that commit, deployed from the clean tree.
#   4. The read-only staging checks have passed against that deploy, as a
#      dev-tester:
#        scripts/as-dev-tester.sh --account <your-name> ./run_all_tests.sh --quick --staging
#   5. This check passes; then bash deploy_to_aws.sh --target production
#   6. After the deploy, the read-only browser check against production:
#        npm run test:deployed -- --target production
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
