#!/usr/bin/env bash
#
# The one place that decides which Python interpreter a project script runs.
#
# Every loader, verifier and suite in this repository needs an interpreter
# carrying the pinned dependencies, and each one used to decide for itself:
# some walked a candidate list, some probed a single hardcoded path, some
# spawned a bare `python3` and hoped. The spellings disagreed, so the same
# checkout could run one script under a virtualenv and the next under whatever
# the host happened to ship. The failure that shape produces is the expensive
# kind: the error names the loader that died rather than the interpreter that
# ran it, and it reproduces on one machine and not the next.
#
# What this refuses to do:
#
#   - Fall back to a bare `python3`. An unpinned interpreter is a wrong answer,
#     not a slower one, and "it works for now" is exactly what let the
#     divergence stay invisible. A caller that cannot find its environment
#     fails and says which paths it tried.
#   - Let anything but the pipeline's own builder create an environment. The
#     check is made here rather than trusted from the argument, so the
#     exclusivity is a property of this file and not a convention the next
#     caller can quietly ignore.
#   - Guess which environment a caller wants. Two exist and they are not
#     interchangeable, so the caller names one.
#
# Usage, sourced:
#
#     source "${REPO_ROOT}/scripts/lib/python-env.sh"
#     PY="$(footbag_python pipeline fail)"      # the interpreter
#     DIR="$(footbag_venv_dir pipeline create)" # the virtualenv directory
#
# Usage, as a command, for callers that are not shell:
#
#     scripts/lib/python-env.sh --print pipeline fail
#     scripts/lib/python-env.sh --print-dir pipeline fail
#
# Environments:
#   pipeline  the legacy-data environment, under legacy_data/, built from
#             legacy_data/requirements.txt
#   seeder    the database seeder's environment, under scripts/, which
#             scripts/reset-local-db.sh builds
#
# Policies:
#   fail      print a diagnostic naming every path tried, and return non-zero
#   create    build the environment when it is absent; accepted only from the
#             pipeline's designated builder
#
# FOOTBAG_REPO_ROOT overrides the repository root this resolves against. It is
# the seam a test uses to point the search at a throwaway tree; nothing else
# sets it, and a run that uses it says so on stderr.

# The candidate names, in the order they are searched, inside whichever
# environment root the caller named. VENV_DIR is the operator's override and
# outranks the rest; it may be absolute or relative to that root.
FOOTBAG_VENV_CANDIDATES=(.venv footbag_venv venv)

# The one script permitted to build an environment.
FOOTBAG_VENV_BUILDER="run_pipeline.sh"

_footbag_repo_root() {
  if [ -n "${FOOTBAG_REPO_ROOT:-}" ]; then
    echo "FOOTBAG_REPO_ROOT is set, so interpreter resolution is running against ${FOOTBAG_REPO_ROOT} rather than the checkout." >&2
    printf '%s\n' "${FOOTBAG_REPO_ROOT%/}"
    return 0
  fi
  # This file lives at scripts/lib/, so the root is two directories up from it.
  ( cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd )
}

_footbag_env_root() {
  local environment="$1" root
  root="$(_footbag_repo_root)" || return 1
  case "$environment" in
    pipeline) printf '%s\n' "${root}/legacy_data" ;;
    seeder)   printf '%s\n' "${root}/scripts" ;;
    *)
      echo "python-env: unknown environment '${environment}'. Name 'pipeline' or 'seeder'." >&2
      return 2
      ;;
  esac
}

# An interpreter inside a candidate directory, or nothing. A virtualenv always
# carries bin/python; the seeder's was addressed as bin/python3 for years, so
# both spellings are accepted and the plain one wins when both are present.
_footbag_interpreter_in() {
  local dir="$1" name
  for name in python python3; do
    if [ -x "${dir}/bin/${name}" ]; then
      printf '%s\n' "${dir}/bin/${name}"
      return 0
    fi
  done
  return 1
}

# Every path this search would consider, in order, so a refusal can name them
# and a caller never has to guess what was looked for.
_footbag_candidate_dirs() {
  local env_root="$1" candidate
  if [ -n "${VENV_DIR:-}" ]; then
    case "$VENV_DIR" in
      /*) printf '%s\n' "$VENV_DIR" ;;
      *)  printf '%s\n' "${env_root}/${VENV_DIR}" ;;
    esac
  fi
  for candidate in "${FOOTBAG_VENV_CANDIDATES[@]}"; do
    printf '%s\n' "${env_root}/${candidate}"
  done
}

_footbag_is_builder() {
  # The outermost entry point, which is the script an operator actually ran.
  # A sourced library sits deeper in BASH_SOURCE, and the command form of this
  # file is its own outermost frame, so neither can pass for the builder.
  local outermost="${BASH_SOURCE[${#BASH_SOURCE[@]} - 1]}"
  [ "$(basename -- "$outermost")" = "$FOOTBAG_VENV_BUILDER" ]
}

_footbag_create_env() {
  local environment="$1" env_root="$2" target="${2}/.venv"
  if [ "$environment" != "pipeline" ]; then
    echo "python-env: only the pipeline environment is built here; '${environment}' is created by its own owner." >&2
    return 2
  fi
  echo "python-env: no virtualenv found under ${env_root}; building ${target}" >&2
  python3 -m venv "$target" >&2 || return 1
  "${target}/bin/pip" install --quiet -r "${env_root}/requirements.txt" >&2 || return 1
  printf '%s\n' "$target"
}

_footbag_refuse() {
  local environment="$1" env_root="$2"
  shift 2
  {
    echo "python-env: no usable Python interpreter for the '${environment}' environment."
    echo "            Environment root: ${env_root}"
    echo "            Tried, in order:"
    local dir
    for dir in "$@"; do
      echo "              ${dir}/bin/python"
    done
    if [ "$environment" = "pipeline" ]; then
      echo "            Create one with: cd legacy_data && python3 -m venv .venv \\"
      echo "                             && .venv/bin/pip install -r requirements.txt"
    else
      echo "            Create one by running: bash scripts/reset-local-db.sh"
    fi
    echo "            There is deliberately no fallback to a system interpreter:"
    echo "            it would not carry the pinned dependencies."
  } >&2
}

# The virtualenv directory for an environment. Prints an absolute path.
footbag_venv_dir() {
  local environment="${1:-}" policy="${2:-}" env_root dir
  if [ -z "$environment" ] || [ -z "$policy" ]; then
    echo "python-env: usage: footbag_venv_dir <pipeline|seeder> <fail|create>" >&2
    return 2
  fi
  case "$policy" in
    fail) ;;
    create)
      # Checked before the search rather than on a miss. A caller that asks for
      # a policy it may not have is wrong whether or not the environment it
      # wanted happens to be sitting there, and a gate that fires only when the
      # directory is absent is a gate that passes on every machine that already
      # has one.
      if ! _footbag_is_builder; then
        echo "python-env: the 'create' policy belongs to ${FOOTBAG_VENV_BUILDER} alone, and this caller is not it." >&2
        echo "            Every other caller declares 'fail', so a missing environment is reported rather than built underneath it." >&2
        return 2
      fi
      ;;
    *)
      echo "python-env: unknown policy '${policy}'. Name 'fail' or 'create'." >&2
      return 2
      ;;
  esac
  env_root="$(_footbag_env_root "$environment")" || return 2

  local -a tried=()
  while IFS= read -r dir; do
    tried+=("$dir")
    if _footbag_interpreter_in "$dir" >/dev/null; then
      printf '%s\n' "$dir"
      return 0
    fi
  done < <(_footbag_candidate_dirs "$env_root")

  if [ "$policy" = "create" ]; then
    _footbag_create_env "$environment" "$env_root"
    return $?
  fi
  _footbag_refuse "$environment" "$env_root" "${tried[@]}"
  return 1
}

# The interpreter for an environment. Prints an absolute path.
footbag_python() {
  local dir
  dir="$(footbag_venv_dir "$@")" || return $?
  _footbag_interpreter_in "$dir"
}

# Command form, so a caller that is not shell runs this code rather than
# reimplementing it.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  case "${1:-}" in
    --print)     shift; footbag_python "$@" ;;
    --print-dir) shift; footbag_venv_dir "$@" ;;
    *)
      echo "python-env: usage: $0 --print|--print-dir <pipeline|seeder> <fail|create>" >&2
      exit 2
      ;;
  esac
fi
