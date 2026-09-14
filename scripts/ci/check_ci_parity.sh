#!/usr/bin/env bash
# check_ci_parity.sh
#
# Every job the continuous-integration workflow runs is either reachable from the
# local runner or named here as one that never can be. A job in neither fails
# this check.
#
# WHY THIS EXISTS.
#
# What gets verified is written down twice, once in the workflow and once in the
# local runner's gate sequence, and nothing held the two together. They drifted:
# the runner's own header said three workflow jobs had no local counterpart when
# there were four, and the hook-fixture job had no local gate at all. Drift of
# that shape is invisible in the direction that matters, because the local run
# stays green while covering less than the reader believes, and the first sign is
# a red push.
#
# The exclusions below are deliberate and each carries its reason. Adding a name
# to that list is a decision to accept that a local run cannot speak for that
# job; it is not a way to quiet this check.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKFLOW="${REPO_ROOT}/.github/workflows/ci.yml"
RUNNER="${REPO_ROOT}/run_all_tests.sh"
CLEAN_ROOM="${REPO_ROOT}/scripts/ci/run_clean_room.sh"

for f in "$WORKFLOW" "$RUNNER" "$CLEAN_ROOM"; do
  [[ -f "$f" ]] || { echo "  FAIL: missing $f" >&2; exit 1; }
done

# Workflow job -> the local gate that speaks for it. A job whose value is one of
# the EXCLUDED_* markers is one no workstation can run.
declare -A COVERED_BY=(
  [typecheck]="build"
  [lint]="lint"
  [dependency-audit]="audit"
  [secret-scan]="secret-scan"
  [conventions]="conventions"
  [harness]="harness"
  [unit-tests]="unit"
  [integration-tests]="integration"
  [coverage]="coverage"
  [e2e]="e2e"
  [security-probes]="security-probes"
  [terraform]="terraform"
  [legacy-pytest]="python-pipeline"
  [db-load-smoke]="clean-room"
  [freestyle-db-integrity]="clean-room"
  [codeql]="EXCLUDED: static analysis runs on GitHub's infrastructure and has no local form"
  [dependency-review]="EXCLUDED: a pull-request-only GitHub action with no local form"
  [ci-complete]="EXCLUDED: an aggregate of the jobs above, not a check of its own"
)

# Job ids are the two-space-indented keys under `jobs:`. Anything deeper belongs
# to a job's body.
mapfile -t JOBS < <(sed -n '/^jobs:/,$p' "$WORKFLOW" | grep -E '^  [a-z0-9_-]+:$' | tr -d ' :')

if (( ${#JOBS[@]} == 0 )); then
  echo "  FAIL: parsed no jobs from ${WORKFLOW}; the parser and the workflow have diverged." >&2
  exit 1
fi

# Gate labels the local runner and the clean room actually register.
LOCAL_GATES="$(grep -oE '^\s*run_gate +[a-z0-9-]+' "$RUNNER" | awk '{print $2}'; \
               grep -oE '^\s*gate +[a-z0-9-]+' "$CLEAN_ROOM" | awk '{print $2}'; \
               echo clean-room)"

violations=0
for job in "${JOBS[@]}"; do
  mapping="${COVERED_BY[$job]:-}"
  if [[ -z "$mapping" ]]; then
    echo "  FAIL: workflow job '${job}' has no local gate and is not listed as one that cannot have one." >&2
    echo "        Add a gate to run_all_tests.sh or scripts/ci/run_clean_room.sh, or record why it is impossible." >&2
    violations=$((violations + 1))
    continue
  fi
  [[ "$mapping" == EXCLUDED:* ]] && continue
  if ! grep -qx "$mapping" <<< "$LOCAL_GATES"; then
    echo "  FAIL: workflow job '${job}' claims local gate '${mapping}', which no runner registers." >&2
    violations=$((violations + 1))
  fi
done

# The reverse direction: a mapping naming a job the workflow no longer has is a
# stale entry that would otherwise sit here looking like coverage.
for job in "${!COVERED_BY[@]}"; do
  if ! printf '%s\n' "${JOBS[@]}" | grep -qx "$job"; then
    echo "  FAIL: '${job}' is mapped here but is no longer a job in ${WORKFLOW}." >&2
    violations=$((violations + 1))
  fi
done

# =============================================================================
# The same assertion for the fast pre-commit gate.
#
# The check above binds the workflow to the full runner. It does not bind the
# workflow to `npm run test:pre-pr`, which is the gate the rules and the
# onboarding guide actually tell an author to run before pushing, and which for a
# long time was build, lint, conventions and vitest. A secret-scan failure
# therefore could not be seen locally by anyone following the documented loop,
# and was first visible as a red push. That is the same drift this file was
# written to stop, one entry point over.
#
# A job here is either reachable from test:pre-pr or carries the reason it cannot
# be. The bar for the fast loop is stricter than for the full runner: a gate
# belongs here only if it is quick and needs nothing beyond the checkout, because
# a slow or flaky gate in the pre-commit path gets skipped by hand, which is
# worse than not claiming it.
# =============================================================================

PACKAGE_JSON="${REPO_ROOT}/package.json"
[[ -f "$PACKAGE_JSON" ]] || { echo "  FAIL: missing $PACKAGE_JSON" >&2; exit 1; }

PRE_PR="$(jq -r '.scripts["test:pre-pr"] // empty' "$PACKAGE_JSON")"
if [[ -z "$PRE_PR" ]]; then
  echo "  FAIL: package.json declares no test:pre-pr script, which the rules name as the pre-commit gate." >&2
  exit 1
fi

# Workflow job -> the literal the pre-PR script must contain to speak for it.
declare -A PRE_PR_COVERED_BY=(
  [typecheck]="npm run build"
  [lint]="npm run lint"
  [conventions]="assert_conventions.sh"
  [secret-scan]="secret_scan.sh"
  [unit-tests]="npm test"
  [integration-tests]="npm test"
  [harness]="EXCLUDED: gates the AI harness configuration rather than application source, and is carried by the full runner"
  [dependency-audit]="EXCLUDED: needs a live call to the registry audit endpoint, so a network hiccup would block every commit"
  [coverage]="EXCLUDED: re-runs the whole instrumented suite, minutes on top of a loop with a sub-two-minute target"
  [e2e]="EXCLUDED: needs browsers and a running stack"
  [security-probes]="EXCLUDED: needs a running stack"
  [terraform]="EXCLUDED: needs the terraform binary"
  [legacy-pytest]="EXCLUDED: needs Python and the legacy data trees"
  [db-load-smoke]="EXCLUDED: runs the loader, which is safe only in the clean room's throwaway worktree"
  [freestyle-db-integrity]="EXCLUDED: same clean-room condition as the loader gate"
  [codeql]="EXCLUDED: static analysis runs on GitHub's infrastructure and has no local form"
  [dependency-review]="EXCLUDED: a pull-request-only GitHub action with no local form"
  [ci-complete]="EXCLUDED: an aggregate of the jobs above, not a check of its own"
)

for job in "${JOBS[@]}"; do
  mapping="${PRE_PR_COVERED_BY[$job]:-}"
  if [[ -z "$mapping" ]]; then
    echo "  FAIL: workflow job '${job}' is not reachable from test:pre-pr and is not listed as one that cannot be." >&2
    echo "        Add it to the test:pre-pr script in package.json, or record why the fast loop cannot carry it." >&2
    violations=$((violations + 1))
    continue
  fi
  [[ "$mapping" == EXCLUDED:* ]] && continue
  if [[ "$PRE_PR" != *"$mapping"* ]]; then
    echo "  FAIL: workflow job '${job}' claims test:pre-pr carries it via '${mapping}', which that script does not run." >&2
    violations=$((violations + 1))
  fi
done

for job in "${!PRE_PR_COVERED_BY[@]}"; do
  if ! printf '%s\n' "${JOBS[@]}" | grep -qx "$job"; then
    echo "  FAIL: '${job}' is mapped in the pre-PR table but is no longer a job in ${WORKFLOW}." >&2
    violations=$((violations + 1))
  fi
done

if (( violations > 0 )); then
  echo "[ci-parity] FAIL (${violations})" >&2
  exit 1
fi
echo "[ci-parity] pass (${#JOBS[@]} workflow jobs, each with a local gate and a pre-PR gate or a recorded reason)"
