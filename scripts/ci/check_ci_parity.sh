#!/usr/bin/env bash
# check_ci_parity.sh
#
# Every job the continuous-integration workflow runs, and every command its steps
# invoke, is either reachable from the local runner or named here as one that
# never can be. Anything in neither fails this check, as does a drift between the
# mapping here and the runner's own list of the gates whose absence makes a run
# refuse to call itself green.
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
# Two later holes had the same shape. The mapping for the two database jobs
# pointed at a literal that resolved whatever the clean room contained, so the
# clean room could have stopped running the loader with this check still passing.
# And the runner keeps its own list of the gates that stand for a push-gate job,
# which is this mapping written a second time with nothing holding the two
# together, so a job mapped here but missing there is one whose absence a local
# run does not notice.
#
# A job may also run several steps, and a mapping is keyed by job. A step added
# to a job that already has a gate inherits that gate's mapping and is covered by
# nothing, so the scan also reads what the workflow actually invokes.
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
  [db-load-smoke]="db-load-smoke"
  [freestyle-db-integrity]="freestyle-db-integrity"
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

# Held as one string so every lookup below reads a here-string. Piping a writer
# into `grep -q` is what this tree has already been bitten by: the early exit
# closes the pipe, the writer dies on SIGPIPE, and under pipefail that death is
# the pipeline's status, so a match reads as a miss. Which lookups it hits
# depends on timing, so the check passes on one machine and fails on another
# against identical bytes.
JOBS_LIST="$(printf '%s\n' "${JOBS[@]}")"

# Gate labels the local runner and the clean room actually register.
#
# Nothing is added to this list by hand. A literal appended here is a label that
# resolves whatever the runners contain, so every mapping onto it passes against
# an empty file: the two database jobs were mapped onto a constant `clean-room`
# and could not have failed if the clean room had stopped running them. A label
# earns its place by being registered in one of the two files, or the mapping
# that names it is not evidence of anything.
LOCAL_GATES="$(grep -oE '^\s*run_gate +[a-z0-9-]+' "$RUNNER" | awk '{print $2}'; \
               grep -oE '^\s*gate +[a-z0-9-]+' "$CLEAN_ROOM" | awk '{print $2}')"

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
  if ! grep -qx "$job" <<<"$JOBS_LIST"; then
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
  if ! grep -qx "$job" <<<"$JOBS_LIST"; then
    echo "  FAIL: '${job}' is mapped in the pre-PR table but is no longer a job in ${WORKFLOW}." >&2
    violations=$((violations + 1))
  fi
done

# =============================================================================
# The runner's own list of gates that stand for a push-gate job.
#
# run_all_tests.sh keeps PUSH_GATE_EQUIVALENTS, and uses it to decide whether a
# run may call itself green: a gate on that list which skipped, or which this
# mode never scheduled, makes the run exit non-zero instead of reporting a clean
# tree. That list is a second copy of the mapping above, and nothing held the two
# together. The failure is silent and one-directional: add a workflow job, map it
# here, give it a conditional local gate, forget the runner's list, and a run in
# a mode that never schedules that gate still prints GREEN while the push gate
# runs it for real.
#
# The expected list is derived rather than declared. A mapping naming a gate the
# runner itself registers stands for itself; one naming a gate only the clean
# room registers is reached through the runner's clean-room gate, which is the
# gate that would have to skip for it to go unrun.
# =============================================================================

RUNNER_GATES="$(grep -oE '^\s*run_gate +[a-z0-9-]+' "$RUNNER" | awk '{print $2}')"

# Gates on the runner's list that stand for a STEP of a workflow job rather than
# a job of its own. The job table cannot reach these: a job's second `run:` line
# has no job id to be keyed by.
declare -A STEP_EQUIVALENTS=(
  [generated-content]="the conventions job's second step, assert_generated_content_current.sh"
)

PUSH_GATE_LINE="$(grep -E '^PUSH_GATE_EQUIVALENTS=' "$RUNNER" || true)"
if [[ -z "$PUSH_GATE_LINE" ]]; then
  echo "  FAIL: ${RUNNER} declares no PUSH_GATE_EQUIVALENTS, which is the list it uses to" >&2
  echo "        refuse to report green when a gate standing for a push-gate job did not run." >&2
  violations=$((violations + 1))
  RUNNER_EQUIVALENTS=""
else
  RUNNER_EQUIVALENTS="$(sed -E 's/^PUSH_GATE_EQUIVALENTS="([^"]*)".*/\1/' <<<"$PUSH_GATE_LINE" | tr ' ' '\n' | grep -v '^$' | sort -u)"
fi

EXPECTED_EQUIVALENTS=""
for job in "${JOBS[@]}"; do
  mapping="${COVERED_BY[$job]:-}"
  [[ -z "$mapping" || "$mapping" == EXCLUDED:* ]] && continue
  if grep -qx "$mapping" <<<"$RUNNER_GATES"; then
    EXPECTED_EQUIVALENTS+="${mapping}"$'\n'
  else
    EXPECTED_EQUIVALENTS+="clean-room"$'\n'
  fi
done
for step_gate in "${!STEP_EQUIVALENTS[@]}"; do
  EXPECTED_EQUIVALENTS+="${step_gate}"$'\n'
done
EXPECTED_EQUIVALENTS="$(grep -v '^$' <<<"$EXPECTED_EQUIVALENTS" | sort -u)"

while IFS= read -r expected; do
  [[ -n "$expected" ]] || continue
  if ! grep -qx "$expected" <<<"$RUNNER_EQUIVALENTS"; then
    echo "  FAIL: gate '${expected}' stands for a push-gate job but is absent from" >&2
    echo "        PUSH_GATE_EQUIVALENTS in ${RUNNER}, so a run that never scheduled it," >&2
    echo "        or one where it skipped, would still report green." >&2
    violations=$((violations + 1))
  fi
done <<<"$EXPECTED_EQUIVALENTS"

while IFS= read -r listed; do
  [[ -n "$listed" ]] || continue
  if ! grep -qx "$listed" <<<"$EXPECTED_EQUIVALENTS"; then
    echo "  FAIL: PUSH_GATE_EQUIVALENTS in ${RUNNER} lists '${listed}', which stands for no" >&2
    echo "        workflow job and is not recorded as standing for a job's step. A run would" >&2
    echo "        be held to a gate the push gate does not run." >&2
    violations=$((violations + 1))
  fi
done <<<"$RUNNER_EQUIVALENTS"

# =============================================================================
# Step-level parity: every command the workflow invokes, not merely every job.
#
# Everything above is keyed by job id, and a job may run several steps. Two do:
# the convention gate runs the generated-content check after itself, and the
# harness job runs the hook fixtures after its self-check. A third step added to
# either one inherits that job's mapping and is covered by nothing, with every
# assertion above still green.
#
# So the scan reads what the workflow actually invokes — the repository scripts
# and the npm scripts — and requires each to be invoked locally too. Comments are
# stripped first, so a workflow cannot claim a step it does not run: a comment
# naming a seeding script it never calls read as an invocation until it was.
# =============================================================================

# Commands a workflow step runs that no local gate can or should reproduce.
# Adding a name here accepts that the local run cannot speak for that step.
declare -A CI_ONLY_COMMANDS=()

WORKFLOW_CODE="$(sed -n '/^jobs:/,$p' "$WORKFLOW" | sed 's/#.*//')"
LOCAL_CODE="$(sed 's/#.*//' "$RUNNER"; sed 's/#.*//' "$CLEAN_ROOM"; printf '%s\n' "$PRE_PR")"

INVOKED="$(grep -oE 'npm run [a-z0-9:-]+|scripts/[A-Za-z0-9_/.-]+\.(sh|py)' <<<"$WORKFLOW_CODE" | sort -u || true)"

if [[ -z "$INVOKED" ]]; then
  echo "  FAIL: parsed no invoked commands from ${WORKFLOW}; the parser and the workflow" >&2
  echo "        have diverged, and an empty scope is a broken check rather than a clean one." >&2
  violations=$((violations + 1))
fi

invoked_count=0
while IFS= read -r cmd; do
  [[ -n "$cmd" ]] || continue
  invoked_count=$((invoked_count + 1))
  if [[ -n "${CI_ONLY_COMMANDS[$cmd]:-}" ]]; then
    continue
  fi
  if ! grep -qF "$cmd" <<<"$LOCAL_CODE"; then
    echo "  FAIL: the workflow runs '${cmd}', which neither ${RUNNER}, the clean room, nor" >&2
    echo "        test:pre-pr runs. A push would exercise it and no local run would." >&2
    echo "        Add it to a local gate, or record it as one a workstation cannot run." >&2
    violations=$((violations + 1))
  fi
done <<<"$INVOKED"

for cmd in "${!CI_ONLY_COMMANDS[@]}"; do
  if ! grep -qxF "$cmd" <<<"$INVOKED"; then
    echo "  FAIL: '${cmd}' is recorded as a workflow-only command but the workflow no longer" >&2
    echo "        invokes it." >&2
    violations=$((violations + 1))
  fi
done

if (( violations > 0 )); then
  echo "[ci-parity] FAIL (${violations})" >&2
  exit 1
fi
echo "[ci-parity] pass (${#JOBS[@]} workflow jobs and ${invoked_count} invoked commands, each with a local gate or a recorded reason)"
