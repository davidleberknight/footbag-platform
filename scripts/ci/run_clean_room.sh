#!/usr/bin/env bash
# run_clean_room.sh
#
# Runs the test suite the way the continuous-integration runner does, so that a
# green run here predicts a green run there.
#
# WHY THIS EXISTS.
#
# The runner starts from a checkout of the pushed commit, installs from the
# lockfile, and has an empty home directory. A workstation run starts from the
# maintainer's machine: their home directory holds operator keys, the repository
# holds gitignored values files and multi-gigabyte real-data trees that no clone
# has, their shell exports profile and environment variables, and node_modules is
# whatever was installed last. Every one of those is an input some test reads.
#
# The failure that motivated this was two tests that passed on the workstation
# and failed on the runner: one reached an operator key under ~/AWS, the other
# read a gitignored Terraform values file. Teaching each test to defend itself
# fixes those two and waits for the third. This runs the suite where none of
# those inputs exist in the first place.
#
# WHAT IT REFUSES TO DO.
#
# It never runs in the working checkout, and it never writes there. Everything
# happens in a throwaway git worktree under a temporary directory, removed on a
# trap covering EXIT, INT and TERM. That is also what makes the loader gate safe
# to run here: the worktree holds the committed tree plus the uncommitted and
# untracked non-ignored files, never the gitignored real-data trees the loader
# would otherwise overwrite, so they are simply absent, which is the same
# condition the runner enjoys and the reason that gate has been runner-only.
#
# It refuses rather than adapting when the local toolchain cannot reproduce the
# runner, because a prediction made under a different Node is not a
# prediction.
#
# WHAT IT CANNOT COVER.
#
# Two jobs are GitHub-hosted and have no local form at all: the CodeQL analysis
# and the pull-request dependency review.
#
# Four more have a local form that this room does not run: the secret scan,
# terraform, the browser suite and the security probes.
# They belong to `./run_all_tests.sh --full`, which is the command that stands
# for the push gate; this room is the isolation gate inside it and its value is
# the empty home and a tree with nothing gitignored in it, not breadth. The distinction
# matters because this script used to close by saying the runner saw the same
# tree in the same conditions, which was a claim about all of CI made by
# something running two thirds of it.
#
# And the dependency audit reads the registry at the moment it runs, so even
# where it does run, a verdict from an hour ago is not a verdict about the push.
#
# All of it is printed in the summary every run, so the residue is never
# silently forgotten.
#
# And configuration the machine holds outside the home directory. An empty HOME
# does not deny the SSH client's system-wide config, so `ssh -G` resolves the
# deploy alias to a real host in here exactly as it does on the workstation.
# Two tests took their verdict from that and were green here and red on the
# runner for three pushes running. That class is denied in the shared test
# declaration, tests/fixtures/machineIsolation.ts, rather than by this worktree.
#
# Usage:
#   scripts/ci/run_clean_room.sh              # what a commit of the current tree would do
#   scripts/ci/run_clean_room.sh --head       # the last commit, ignoring uncommitted work
#   scripts/ci/run_clean_room.sh --quick      # build, unit and integration only
#   scripts/ci/run_clean_room.sh --results F  # also write one line per gate to F
#   scripts/ci/run_clean_room.sh --skip-py    # leave out every Python gate
#
# --skip-py leaves out every gate that runs the pre-go-live data pipelines'
# Python: the Python-driven integration suite, the generated-content guard, the
# loader gate, the freestyle database guards and the legacy-data pytest suite,
# and it builds no Python environment. Each is recorded
# NOT RUN, so the room ends INCOMPLETE rather than green: a faster answer about
# everything else, never a claim about those.
#
# A full run executes the unit and integration tiers once, instrumented, as the
# coverage gate: coverage runs exactly those files, so running them again
# uninstrumented would only repeat every test. --quick keeps the two plain tiers.
#
# --results writes `label<TAB>PASS|FAIL|NOTRUN<TAB>detail` per gate, so
# run_all_tests.sh can give each gate run here its own row rather than one row
# for the whole room.
set -euo pipefail

CALLER_DIR="$PWD"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

FROM_HEAD=0
QUICK=0
SKIP_PY=0
RESULTS_FILE=""

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --head)  FROM_HEAD=1; shift ;;
    --quick) QUICK=1; shift ;;
    --skip-py) SKIP_PY=1; shift ;;
    --results)
      [[ $# -ge 2 && -n "$2" ]] || { echo "ERROR: --results needs a file path." >&2; usage 2; }
      RESULTS_FILE="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

# Emptied before anything can fail, so a run that stops at a precondition leaves
# no earlier run's rows behind for a caller to read as this run's. A relative path
# is the caller's, not the repository root this script has moved to.
if [[ -n "$RESULTS_FILE" ]]; then
  [[ "$RESULTS_FILE" == /* ]] || RESULTS_FILE="${CALLER_DIR}/${RESULTS_FILE}"
  mkdir -p "$(dirname "$RESULTS_FILE")"
  : > "$RESULTS_FILE"
fi

# One line per gate for the caller. Tabs and newlines inside the detail would
# break the line format, so they are flattened to spaces.
record_result() {
  [[ -n "$RESULTS_FILE" ]] || return 0
  local detail="${3//$'\t'/ }"
  detail="${detail//$'\n'/ }"
  printf '%s\t%s\t%s\n' "$1" "$2" "$detail" >> "$RESULTS_FILE"
}

# ---- Preconditions -----------------------------------------------------------

git rev-parse --git-dir >/dev/null 2>&1 || {
  echo "ERROR: not a git repository; the clean room is built from a git worktree." >&2
  exit 1
}

# The runner's Node is the one the lockfile and the prebuilt native addons were
# resolved against. A different one here makes the answer this gate gives about
# the runner worthless, so it refuses instead of reporting a result it cannot
# stand behind. Exact, because every version in this repository is pinned: the
# workflow reads the same .nvmrc this compares against.
CI_NODE="$(tr -d '[:space:]v' 2>/dev/null < .nvmrc || true)"
LOCAL_NODE="$(node -v | tr -d '[:space:]v')"
if [[ -z "$CI_NODE" ]]; then
  echo "ERROR: could not read the pinned Node version from .nvmrc." >&2
  exit 1
fi
if [[ "$LOCAL_NODE" != "$CI_NODE" ]]; then
  echo "ERROR: this machine runs Node ${LOCAL_NODE}; the runner pins Node ${CI_NODE} (.nvmrc)." >&2
  echo "       A run under a different Node does not predict the runner. Install it (nvm install) and re-run." >&2
  exit 1
fi

[[ -f package-lock.json ]] || {
  echo "ERROR: package-lock.json is missing; the clean room installs from the lockfile." >&2
  exit 1
}

# ---- The clean room ----------------------------------------------------------

WORK_DIR="$(mktemp -d /tmp/footbag-clean-room.XXXXXX)"
TREE="${WORK_DIR}/tree"
CLEAN_HOME="${WORK_DIR}/home"
# Per-gate output is captured here so a failed gate can be re-shown at the end.
#
# Deliberately OUTSIDE WORK_DIR, which the trap removes. A gate's full output is
# the only thing that can answer why it failed, and the recap below is a
# summary by construction: it selects, and a selection that turned out to be the
# wrong one used to leave the reader with nothing at all, because the evidence
# went with the worktree the moment the run ended. The whole log now outlives
# the run and the path is printed, so the recap can be an aid rather than the
# last copy. One run's worth is kept: the directory is emptied at the start of
# each run, so this never grows and never becomes something to tidy.
GATE_LOG_DIR="${TMPDIR:-/tmp}/footbag-clean-room-last"
rm -rf "$GATE_LOG_DIR"
mkdir -p "$CLEAN_HOME" "$GATE_LOG_DIR"

cleanup() {
  local rc=$?
  git worktree remove --force "$TREE" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
  git worktree prune >/dev/null 2>&1 || true
  exit "$rc"
}
trap cleanup EXIT INT TERM

echo "→ building the clean room at ${TREE}"
git worktree add --detach --quiet "$TREE" HEAD

if (( FROM_HEAD == 0 )); then
  # What a commit of the current tree would put in front of the runner: tracked
  # modifications, plus files that are new but not ignored. Ignored files are
  # deliberately left behind, because their absence is the whole point.
  if ! git diff --quiet HEAD; then
    git diff --binary HEAD > "${WORK_DIR}/working.patch"
    git -C "$TREE" apply "${WORK_DIR}/working.patch"
    echo "  carried $(git diff --name-only HEAD | wc -l) modified file(s) from the working tree"
  fi
  untracked="$(git ls-files --others --exclude-standard)"
  if [[ -n "$untracked" ]]; then
    while IFS= read -r f; do
      mkdir -p "${TREE}/$(dirname "$f")"
      cp "$f" "${TREE}/${f}"
    done <<< "$untracked"
    echo "  carried $(printf '%s\n' "$untracked" | wc -l) untracked file(s) from the working tree"
  fi
fi

# Every variable a developer shell exports that a test or a script it spawns
# reads. `env -i` rather than a list of unsets, so a variable nobody thought of
# cannot travel either; PATH, TERM and the locale are handed back explicitly
# because the toolchain needs them and the runner has them too.
CLEAN_PATH="$PATH"

clean_env() {
  env -i \
    PATH="$CLEAN_PATH" \
    HOME="$CLEAN_HOME" \
    TERM="${TERM:-dumb}" \
    LANG="${LANG:-C.UTF-8}" \
    CI=true \
    "$@"
}

GATE_NAMES=()
GATE_RESULTS=()
FAIL_LOGS=()
ANY_FAIL=0
ANY_UNRUN=0

# A gate that could not run is not a gate that passed. It is recorded as its own
# state and it keeps the run from reporting green, because the whole purpose here
# is that green means the runner will agree.
unrun() {
  local name="$1" reason="$2"
  GATE_NAMES+=("$name")
  GATE_RESULTS+=("NOT RUN (${reason})")
  ANY_UNRUN=1
  record_result "$name" NOTRUN "$reason"
}

# What a failed gate's log is reduced to at the end of the run.
#
# A blind tail was the wrong selection, and had been for as long as it existed.
# The convention gate is the worked example: it prints each violation the moment
# its check finds it, keeps going through all sixty-five checks, and names only
# the rule at the end. Its evidence therefore sits thousands of lines above any
# tail, and a reader was handed the last sixty lines of later checks passing,
# under a heading saying a rule had been violated. That is not a report anyone
# can act on, and it is the shape every gate that fails early shares.
#
# So the selection is by grammar rather than by position: the lines that say
# something failed, wherever in the log they appeared, followed by the tail,
# which is the context a bare grep throws away. Both are bounded, and the full
# log is named underneath, so a selection that misses costs a scroll rather than
# another hour.
#
# The `|| true` on the pipeline is load-bearing under `pipefail`: grep exits
# non-zero when it matches nothing, and head closing the pipe early can leave
# grep dead of SIGPIPE, either of which would otherwise end the run here, inside
# the reporting, at the one moment the reader most needs output.
FAILURE_GRAMMAR='FAIL|FAILED|ERROR|Error:|error TS[0-9]|AssertionError|Traceback|✕|✗|violat|REFUSED|not ok'

recap_gate_log() {
  local log="$1" hits total
  hits="$(grep -nE "$FAILURE_GRAMMAR" "$log" | head -n 40 || true)"
  if [[ -n "$hits" ]]; then
    total="$(grep -cE "$FAILURE_GRAMMAR" "$log" || true)"
    echo "  lines naming a failure (${total:-0} in the log, first 40, numbered into it):"
    printf '%s\n' "$hits" | sed 's/^/    /'
    echo ""
  fi
  echo "  last 20 lines:"
  tail -n 20 "$log" | sed 's/^/    /'
}

gate() {
  local name="$1"; shift
  echo ""
  echo "→ [clean-room:${name}] $*"
  local rc=0 log="${GATE_LOG_DIR}/${name}.log"
  # tee keeps the live output while capturing it; PIPESTATUS[0] is the gate's own
  # exit code, not tee's. stderr is merged in so a gate that fails on stderr
  # alone still has something to re-show.
  set +e
  ( cd "$TREE" && clean_env "$@" ) 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  set -e
  GATE_NAMES+=("$name")
  if (( rc == 0 )); then
    GATE_RESULTS+=("PASS")
    record_result "$name" PASS ""
  else
    GATE_RESULTS+=("FAIL (exit ${rc})")
    FAIL_LOGS+=("$name")
    ANY_FAIL=1
    record_result "$name" FAIL "exit ${rc}"
    echo "ERROR: [clean-room:${name}] FAILED (exit ${rc})" >&2
  fi
}

# The package cache is the one piece of machine state deliberately kept: it holds
# published tarballs the lockfile already pins by integrity hash, so it cannot
# change what gets installed, and a cold cache would add minutes to every run of
# a gate meant to be reached for before every push.
NPM_CACHE="${HOME}/.npm"

# Kept, not discarded: an install script's own output goes to stdout, and it is
# the only account of why one failed.
echo "→ installing from the lockfile (npm ci)"
NPM_CI_LOG="${GATE_LOG_DIR}/npm-ci.log"
if ! ( cd "$TREE" && clean_env npm_config_cache="$NPM_CACHE" npm ci --no-audit --no-fund ) >"$NPM_CI_LOG" 2>&1; then
  echo "ERROR: npm ci failed in the clean room; the last of its output (all of it in ${NPM_CI_LOG}):" >&2
  tail -n 40 "$NPM_CI_LOG" >&2
  exit 1
fi

# The integration suite drives the legacy extractors as real subprocesses and
# they parse mirror HTML with a third-party library, so the runner installs the
# pinned Python requirements before running it. Without the same step here the
# tests fall back to a bare interpreter that has none of them, which is not a
# faithful room: it fails for a reason the runner does not have. The virtual
# environment goes in the throwaway directory rather than the checkout, so the
# interpreter answering is the one the requirements file describes and never
# whichever one the workstation happens to carry.
PY_READY=0
# Captured rather than discarded. When this fails, two gates report NOT RUN and
# the run exits INCOMPLETE, and "could not build the pinned Python environment"
# cannot tell a missing venv module from a dead network or a requirement that
# will not build — a five-second fix and a real problem read identically. The log
# lives under WORK_DIR, which the trap removes, so it is shown here or nowhere.
PY_SETUP_LOG="${WORK_DIR}/python-setup.log"

# The interpreter the runner pins, not whichever python3 this machine has.
#
# Every Python job in the workflow sets a version; this read is the same shape
# as the Node one above, so the two cannot drift. The difference is what
# happens on a mismatch: Node is refused outright, because a suite built
# against another Node is not a prediction at all, while an absent
# pinned Python leaves the Python gates recorded as NOT RUN and the run ending
# INCOMPLETE. That is the honest answer and not a hard stop, because a
# workstation carrying only a newer interpreter can still get a true verdict on
# everything else, and blocking the whole room over it would teach people to
# reach for a flag that skips this.
#
# The version is exact, read from .python-version, the file the workflow's
# setup step reads too. An interpreter of the right minor but another patch is
# a different interpreter, and it gets the same NOT RUN answer as a missing one.
CI_PYTHON="$(tr -d '[:space:]' 2>/dev/null < .python-version || true)"
if [[ -z "$CI_PYTHON" ]]; then
  echo "ERROR: could not read the pinned Python version from .python-version." >&2
  exit 1
fi
PY_BIN="python${CI_PYTHON%.*}"
PY_UNRUN_REASON="could not build the pinned Python environment"
if (( SKIP_PY )); then
  echo "→ --skip-py: no Python environment is built, and every Python gate reports NOT RUN."
  PY_BIN=""
  PY_UNRUN_REASON="left out by --skip-py"
elif ! command -v "$PY_BIN" >/dev/null 2>&1; then
  echo "→ the runner pins Python ${CI_PYTHON} and this machine has no ${PY_BIN} on PATH."
  echo "  The Python gates will report NOT RUN rather than answer with a different"
  echo "  interpreter. Install it (bash scripts/setup-dev-workstation.sh) to close them."
  PY_BIN=""
elif [[ "$("$PY_BIN" -c 'import platform; print(platform.python_version())')" != "$CI_PYTHON" ]]; then
  echo "→ the runner pins Python ${CI_PYTHON}; this machine's ${PY_BIN} is $("$PY_BIN" -c 'import platform; print(platform.python_version())')."
  echo "  The Python gates will report NOT RUN rather than answer with a different"
  echo "  interpreter. Install it (bash scripts/setup-dev-workstation.sh) to close them."
  PY_BIN=""
fi

if [[ -n "$PY_BIN" ]] && "$PY_BIN" -m venv "${WORK_DIR}/venv" >"$PY_SETUP_LOG" 2>&1; then
  echo "→ installing the pinned Python requirements"
  if ( cd "$TREE" && clean_env PIP_CACHE_DIR="${HOME}/.cache/pip" \
         "${WORK_DIR}/venv/bin/pip" install -q --require-hashes -r legacy_data/requirements.txt ) >>"$PY_SETUP_LOG" 2>&1; then
    CLEAN_PATH="${WORK_DIR}/venv/bin:${PATH}"
    PY_READY=1
  fi
fi
if (( PY_READY == 0 )) && [[ -s "$PY_SETUP_LOG" ]]; then
  echo "→ the pinned Python environment could not be built; last 20 lines:"
  tail -n 20 "$PY_SETUP_LOG" | sed 's/^/  /'
fi

# The build type-checks src/; the tests' own type-check follows it in the same
# gate, since both are the push gate's type-check job.
gate build       bash -c 'npm run build && npm run typecheck:tests'

# One integration suite drives the legacy club extractors as real subprocesses,
# and they parse mirror HTML with BeautifulSoup, so it needs the pinned
# environment the block above builds. Without that environment the suite fails on
# its own dependency probe, and the room then reports a failed gate and says the
# runner will see the same — which it will not, because the runner installs these
# requirements. An environment the room could not build is not a verdict on the
# tests. So the tier runs without that one suite and the suite is named NOT RUN,
# which is the same treatment the gates below give a missing sqlite3, and the run
# ends INCOMPLETE rather than green.
#
# A full run takes both tiers once, through the coverage gate, which runs exactly
# the unit and integration files with instrumentation and then holds the
# thresholds. That suite drives a script whose one src/ import, the external-URL
# shape check, many other suites exercise, so leaving it out does not move the
# coverage totals.
PY_ONLY_SUITE="tests/integration/clubChainRedirected.test.ts"
PY_EXCLUDE=()
(( PY_READY )) || PY_EXCLUDE=(-- --exclude "$PY_ONLY_SUITE")
if (( QUICK )); then
  gate unit        npm run test:unit
  gate integration npm run test:integration ${PY_EXCLUDE[@]+"${PY_EXCLUDE[@]}"}
else
  gate coverage    npm run test:coverage ${PY_EXCLUDE[@]+"${PY_EXCLUDE[@]}"}
fi
if (( ! PY_READY )); then
  if (( SKIP_PY )); then
    unrun integration-club-chain "$PY_UNRUN_REASON"
  else
    unrun integration-club-chain "the pinned Python environment could not be built"
  fi
fi

if (( QUICK == 0 )); then
  gate lint              npm run lint
  gate conventions       bash scripts/ci/assert_conventions.sh
  # The generated-content guard regenerates its modules through the freestyle
  # Python loaders, so --skip-py leaves it out with the other Python gates.
  if (( SKIP_PY )); then
    unrun generated-content "$PY_UNRUN_REASON"
  else
    gate generated-content bash scripts/ci/assert_generated_content_current.sh
  fi
  # The hook fixture suite runs once, as its own gate on the next line.
  gate harness           bash scripts/ci/assert_claude_harness.sh --skip-hook-fixtures
  gate hook-fixtures     bash scripts/ci/test_hooks.sh

  # The loader gate and the guards that read what it builds have been
  # runner-only, not because a workstation cannot run them but because running
  # them in the working checkout would overwrite the real-data trees a
  # maintainer holds and cannot regenerate. Here there is nothing to overwrite:
  # the worktree carries no gitignored real-data tree, which is the same thing
  # the runner checks out. This is the point of the clean room, not an aside.
  # The loader gate runs the Python loaders, so --skip-py leaves it out too.
  if (( SKIP_PY )); then
    unrun db-load-smoke "$PY_UNRUN_REASON"
    unrun freestyle-db-integrity "$PY_UNRUN_REASON"
    unrun legacy-pytest "$PY_UNRUN_REASON"
  elif ! command -v sqlite3 >/dev/null 2>&1; then
    unrun db-load-smoke "sqlite3 is not installed"
    unrun freestyle-db-integrity "sqlite3 is not installed"
  else
    gate db-load-smoke env FOOTBAG_DB_PATH=./database/footbag-ci.db \
      STUB_PASSWORD=clean-room-not-a-real-password \
      bash -c 'bash scripts/reset-local-db.sh && python3 scripts/ci/assert_loader_row_counts.py --db ./database/footbag-ci.db'

    if (( PY_READY )); then
      gate freestyle-db-integrity env FOOTBAG_TEST_DB=./database/footbag-ci.db \
        bash scripts/ci/run_db_integrity_guards.sh
      # -rs names every skipped test and why, so a suite that passes with skips
      # says which ones in the report rather than only how many.
      gate legacy-pytest env PYTHONDONTWRITEBYTECODE=1 \
        python3 -m pytest legacy_data/tests/ -q -rs -p no:cacheprovider
    else
      unrun freestyle-db-integrity "$PY_UNRUN_REASON"
      unrun legacy-pytest "$PY_UNRUN_REASON"
    fi
  fi
fi

# ---- Summary -----------------------------------------------------------------

echo ""
echo "=============================================="
echo " CLEAN ROOM SUMMARY"
echo "=============================================="
for i in "${!GATE_NAMES[@]}"; do
  printf '  %-18s %s\n' "${GATE_NAMES[$i]}" "${GATE_RESULTS[$i]}"
done
echo "=============================================="
echo "  NOT PROVEN BY THIS RUN"
echo ""
echo "  Never provable here:"
echo "    codeql              static analysis, GitHub-hosted"
echo "    dependency-review   pull-request only, GitHub-hosted"
echo "    dependency-audit    reads registry state at push time, not now"
echo ""
echo "  Carried by ./run_all_tests.sh --full, not by this room:"
echo "    secret-scan  terraform  e2e  security-probes"
if (( QUICK )); then
  echo "  Not run by --quick: coverage, lint, conventions, generated-content, harness,"
  echo "    hook-fixtures, the database gates and the legacy Python suite."
fi
echo ""
echo "  This machine's, not the runner's:"
echo "    ffmpeg  $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3 || echo absent)"
echo "    sqlite3 $(sqlite3 --version 2>/dev/null | cut -d' ' -f1 || echo absent)"
echo "    The runner image ships its own; a test that reads one of these is"
echo "    answered here by the version above and there by a different one."
echo ""
echo "  One order, not every order:"
echo "    files were shuffled from a seed, printed by the vitest tiers above."
echo "    Green here is green for that order."
echo "=============================================="

# Re-show the tail of every failed gate. Its output did stream past live, but by
# the time the summary lands a later gate has buried it under thousands of lines
# — the loader gate and the Python suites alone run long after the vitest tiers —
# and the summary names which gate failed without saying why. The recap goes last
# on purpose: run_all_tests.sh shows only the tail of this log when the clean room
# is the gate that failed, so the failure has to be what the tail holds. Without
# it that outer report always showed the last gate's output, never the failing
# one, and the reader was sent back to scroll-back to find anything at all.
if (( ${#FAIL_LOGS[@]} > 0 )); then
  echo ""
  echo "=============================================="
  echo " clean-room failure details (${#FAIL_LOGS[@]} gate(s))"
  echo "=============================================="
  for name in "${FAIL_LOGS[@]}"; do
    echo ""
    echo "──── clean-room:${name} ────"
    log="${GATE_LOG_DIR}/${name}.log"
    if [[ -s "$log" ]]; then
      recap_gate_log "$log"
      echo "  full output: ${log}"
    else
      echo "  (no captured output)"
    fi
  done
  echo "=============================================="
  echo " Every gate's full output, passing or failing: ${GATE_LOG_DIR}/"
  echo "=============================================="
fi

if (( ANY_FAIL )); then
  echo "CLEAN ROOM FAILED: the runner will see the same." >&2
  exit 1
fi
if (( ANY_UNRUN )); then
  echo "CLEAN ROOM INCOMPLETE: every gate that ran passed, but the ones marked above did not run," >&2
  echo "so this run does not speak for them. Close them or accept a narrower answer." >&2
  exit 77
fi
echo "Clean room green: every gate it ran passed, in an empty home with no"
echo "inherited shell state, and the working tree minus ignored files. Read that"
echo "against the block above, which says what it did not run."
