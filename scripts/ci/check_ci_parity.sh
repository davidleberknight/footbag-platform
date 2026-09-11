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

if (( violations > 0 )); then
  echo "[ci-parity] FAIL (${violations})" >&2
  exit 1
fi
echo "[ci-parity] pass (${#JOBS[@]} workflow jobs, each with a local gate or a recorded reason)"
