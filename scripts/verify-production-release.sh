#!/usr/bin/env bash
# scripts/verify-production-release.sh -- may this tree ship to production?
#
# The production release rules, asked on demand: would a production deploy of
# this tree be allowed right now? Every production deploy checks the same rules
# (scripts/lib/production-release-gate.sh) and refuses on the same findings, so
# this is a preview of that answer, listing each refusal with what to do about it.
#
# What a production release has, in order:
#   1. The change is committed, pushed to main, and CI's "Type-check and test"
#      check is green on every run for that commit; that green tick is the test
#      proof, since CI and the local run carry the same tests.
#   2. This check passes; then bash deploy_to_aws.sh --target production
#   3. After the deploy, the read-only browser check against production:
#        npm run test:deployed -- --target production
#
# Staging is no part of this: what staging runs, and whether the staging checks
# passed, have no bearing on a production release.
#
# Read-only: it changes nothing anywhere apart from fetching main into this
# repository's origin/main. It never prompts, so it runs where no terminal is
# attached; it reads CI through a signed-in gh, and a question it cannot answer
# is a refusal.
#
# Usage: bash scripts/verify-production-release.sh

set -euo pipefail

case "${1:-}" in
  "") ;;
  -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
