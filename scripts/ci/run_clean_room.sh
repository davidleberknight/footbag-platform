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
# to run here: the worktree holds only committed material, so the real-data trees
# the loader would otherwise overwrite are simply absent, which is the same
# condition the runner enjoys and the reason that gate has been runner-only.
#
# It refuses rather than adapting when the local toolchain cannot reproduce the
# runner, because a prediction made under a different Node major is not a
# prediction.
#
# WHAT IT CANNOT COVER.
#
# Two jobs are GitHub-hosted and have no local form at all: the CodeQL analysis
# and the pull-request dependency review. Those are named in the summary every
# run, so the residue is never silently forgotten.
#
# Usage:
#   scripts/ci/run_clean_room.sh              # what a commit of the current tree would do
#   scripts/ci/run_clean_room.sh --head       # the last commit, ignoring uncommitted work
#   scripts/ci/run_clean_room.sh --quick      # build, unit and integration only
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

FROM_HEAD=0
QUICK=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --head)  FROM_HEAD=1; shift ;;
    --quick) QUICK=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

# ---- Preconditions -----------------------------------------------------------

git rev-parse --git-dir >/dev/null 2>&1 || {
  echo "ERROR: not a git repository; the clean room is built from a git worktree." >&2
  exit 1
}

# The runner's Node major is the one the lockfile and the prebuilt native addons
# were resolved against. A different one here makes the answer this gate gives
# about the runner worthless, so it refuses instead of reporting a result it
# cannot stand behind.
CI_NODE_MAJOR="$(grep -m1 "node-version:" .github/workflows/ci.yml | tr -dc '0-9')"
LOCAL_NODE_MAJOR="$(node -v | tr -dc '0-9.' | cut -d. -f1)"
if [[ -z "$CI_NODE_MAJOR" ]]; then
  echo "ERROR: could not read node-version from .github/workflows/ci.yml." >&2
  exit 1
fi
if [[ "$LOCAL_NODE_MAJOR" != "$CI_NODE_MAJOR" ]]; then
  echo "ERROR: this machine runs Node ${LOCAL_NODE_MAJOR}; the runner pins Node ${CI_NODE_MAJOR}." >&2
  echo "       A run under a different major does not predict the runner. Switch Node and re-run." >&2
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
mkdir -p "$CLEAN_HOME"

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
}

gate() {
  local name="$1"; shift
  echo ""
  echo "→ [clean-room:${name}] $*"
  local rc=0
  set +e
  ( cd "$TREE" && clean_env "$@" )
  rc=$?
  set -e
  GATE_NAMES+=("$name")
  if (( rc == 0 )); then
    GATE_RESULTS+=("PASS")
  else
    GATE_RESULTS+=("FAIL (exit ${rc})")
    ANY_FAIL=1
    echo "ERROR: [clean-room:${name}] FAILED (exit ${rc})" >&2
  fi
}

# The package cache is the one piece of machine state deliberately kept: it holds
# published tarballs the lockfile already pins by integrity hash, so it cannot
# change what gets installed, and a cold cache would add minutes to every run of
# a gate meant to be reached for before every push.
NPM_CACHE="${HOME}/.npm"

echo "→ installing from the lockfile (npm ci)"
( cd "$TREE" && clean_env npm_config_cache="$NPM_CACHE" npm ci --no-audit --no-fund ) >/dev/null

# The integration suite drives the legacy extractors as real subprocesses and
# they parse mirror HTML with a third-party library, so the runner installs the
# pinned Python requirements before running it. Without the same step here the
# tests fall back to a bare interpreter that has none of them, which is not a
# faithful room: it fails for a reason the runner does not have. The virtual
# environment goes in the throwaway directory rather than the checkout, so the
# interpreter answering is the one the requirements file describes and never
# whichever one the workstation happens to carry.
PY_READY=0
if command -v python3 >/dev/null 2>&1 && python3 -m venv "${WORK_DIR}/venv" >/dev/null 2>&1; then
  echo "→ installing the pinned Python requirements"
  if ( cd "$TREE" && clean_env PIP_CACHE_DIR="${HOME}/.cache/pip" \
         "${WORK_DIR}/venv/bin/pip" install -q -r legacy_data/requirements.txt ) >/dev/null 2>&1; then
    CLEAN_PATH="${WORK_DIR}/venv/bin:${PATH}"
    PY_READY=1
  fi
fi

gate build       npm run build
gate unit        npm run test:unit
gate integration npm run test:integration

if (( QUICK == 0 )); then
  gate lint              npm run lint
  gate conventions       bash scripts/ci/assert_conventions.sh
  gate generated-content bash scripts/ci/assert_generated_content_current.sh
  gate harness           bash scripts/ci/assert_claude_harness.sh
  gate hook-fixtures     bash scripts/ci/test_hooks.sh

  # The loader gate and the guards that read what it builds have been
  # runner-only, not because a workstation cannot run them but because running
  # them in the working checkout would overwrite the real-data trees a
  # maintainer holds and cannot regenerate. Here there is nothing to overwrite:
  # the worktree carries only committed material, which is the same thing the
  # runner checks out. This is the point of the clean room, not an aside.
  if ! command -v sqlite3 >/dev/null 2>&1; then
    unrun db-load-smoke "sqlite3 is not installed"
    unrun freestyle-db-integrity "sqlite3 is not installed"
  else
    gate db-load-smoke env FOOTBAG_DB_PATH=./database/footbag-ci.db \
      STUB_PASSWORD=clean-room-not-a-real-password \
      bash -c 'bash scripts/reset-local-db.sh && python3 scripts/ci/assert_loader_row_counts.py --db ./database/footbag-ci.db'

    if (( PY_READY )); then
      gate freestyle-db-integrity env FOOTBAG_TEST_DB=./database/footbag-ci.db \
        bash scripts/ci/run_db_integrity_guards.sh
      gate legacy-pytest env PYTHONDONTWRITEBYTECODE=1 \
        python3 -m pytest legacy_data/tests/ -q -p no:cacheprovider
    else
      unrun freestyle-db-integrity "could not build the pinned Python environment"
      unrun legacy-pytest "could not build the pinned Python environment"
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
echo "  Not covered here, and only ever on GitHub:"
echo "    codeql              static analysis, GitHub-hosted"
echo "    dependency-review   pull-request only, GitHub-hosted"
echo "=============================================="

if (( ANY_FAIL )); then
  echo "CLEAN ROOM FAILED: the runner will see the same." >&2
  exit 1
fi
if (( ANY_UNRUN )); then
  echo "CLEAN ROOM INCOMPLETE: every gate that ran passed, but the ones marked above did not run," >&2
  echo "so this run does not speak for them. Close them or accept a narrower answer." >&2
  exit 77
fi
echo "Clean room green. The runner sees the same tree in the same conditions."
