#!/usr/bin/env bash
# lock-python-deps.sh
#
# Regenerates the hash-locked Python requirement files every install in this
# repository reads:
#
#   legacy_data/requirements.txt    from legacy_data/requirements.in
#   scripts/requirements.txt        from scripts/requirements.in
#   scripts/requirements-tools.txt  from scripts/requirements-tools.in, the pinned
#                                   pip-tools this script runs
#
# The .in files name the direct dependencies; the .txt files are pip-tools'
# compiled output, every package in the closure pinned and hashed. That is
# pip-tools' own convention, and it keeps every install reading requirements.txt.
#
# WHY THIS EXISTS.
#
# Every version of every package is pinned, and a requirements file pins only
# the packages it names. Everything they pull in floated: each CI run and each
# fresh environment took whatever was newest that day, so two machines built
# from the same commit could run different numpy, and nothing recorded which.
# A lock names every package in the closure at an exact version with the hash of
# each published file, and installs read it with --require-hashes, so a file
# that is not the one locked is refused rather than installed.
#
# WHAT IT DOES AND REFUSES TO DO.
#
#   - Keeps every version already in a lock. pip-compile reads the existing
#     output and holds its pins, so a run with no arguments only adds or refreshes
#     hashes and drops packages nothing requires any more. A version moves only
#     when named: --upgrade-package <name> (repeatable), or --upgrade for all.
#   - Runs pip-tools from its own hash lock in a throwaway environment that the
#     trap removes, so nothing is installed into any environment you use.
#   - Changes no environment. Rebuilding one from the new lock is its builder's
#     job: legacy_data/run_pipeline.sh venv, and run_dev.sh for the seeder.
#
# Usage:
#   bash scripts/lock-python-deps.sh
#   bash scripts/lock-python-deps.sh --upgrade-package numpy
#   bash scripts/lock-python-deps.sh --upgrade
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPILE_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --upgrade) COMPILE_ARGS+=(--upgrade); shift ;;
    --upgrade-package)
      [[ -n "${2:-}" ]] || { echo "ERROR: --upgrade-package needs a package name." >&2; exit 2; }
      COMPILE_ARGS+=(--upgrade-package "$2"); shift 2 ;;
    -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# Compiled under exactly the Python every environment runs, or the closure and
# its markers describe a different interpreter.
PIN="$(tr -d '[:space:]' 2>/dev/null < .python-version || true)"
PY="python${PIN%.*}"
if [[ -z "$PIN" ]] || ! command -v "$PY" >/dev/null 2>&1 \
   || [[ "$("$PY" -c 'import platform; print(platform.python_version())')" != "$PIN" ]]; then
  echo "ERROR: the locks are compiled under Python ${PIN:-(no .python-version)}, and ${PY} is not that version here." >&2
  echo "       bash scripts/setup-dev-workstation.sh installs it. Nothing changed." >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-lock.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM

echo "→ Installing the pinned pip-tools into a throwaway environment"
"$PY" -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install --quiet --require-hashes -r scripts/requirements-tools.txt

compile() {
  local input="$1" output="$2"
  shift 2
  echo "→ ${output}"
  "$WORK/venv/bin/pip-compile" --quiet --generate-hashes --allow-unsafe --strip-extras \
    --no-emit-index-url --output-file "$output" "$@" "$input"
}

compile scripts/requirements-tools.in scripts/requirements-tools.txt "${COMPILE_ARGS[@]}"
compile legacy_data/requirements.in legacy_data/requirements.txt "${COMPILE_ARGS[@]}"
compile scripts/requirements.in scripts/requirements.txt "${COMPILE_ARGS[@]}"

# Verify the outcome: each compiled file pins every line and hashes every package.
for lock in scripts/requirements-tools.txt legacy_data/requirements.txt scripts/requirements.txt; do
  if grep -E '^[A-Za-z0-9]' "$lock" | grep -vq '=='; then
    echo "ERROR: ${lock} carries a requirement without an exact version." >&2
    exit 1
  fi
  if [[ "$(grep -cE '^[A-Za-z0-9]' "$lock")" -gt "$(grep -cE '^[A-Za-z0-9].*\\$' "$lock")" ]]; then
    echo "ERROR: ${lock} carries a requirement without hashes." >&2
    exit 1
  fi
done

echo "Locked. Rebuild environments from the new locks with:"
echo "  bash legacy_data/run_pipeline.sh venv     (the legacy pipeline environment)"
echo "  ./run_dev.sh                              (the seeder environment)"
