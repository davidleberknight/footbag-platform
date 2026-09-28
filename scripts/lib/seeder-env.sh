#!/usr/bin/env bash
#
# The database seeder's Python environment, scripts/.venv: built or repaired,
# brought to the hash-pinned scripts/requirements.txt, and proved, in one place.
#
# Four callers need it (the dev launcher, the local database reset, the deploy's
# rebuild, the workstation setup) and each used to build it its own way with its
# own test for "already there". The weakest of those, a file-exists check, called
# an environment healthy after its interpreter link had come to resolve to a
# different Python, and the next pip call crashed. One definition, judged by the
# outcome, is what stops the four drifting apart again.
#
# Usage, sourced:
#
#     source "${REPO_ROOT}/scripts/lib/seeder-env.sh"
#     seeder_env_ensure "$REPO_ROOT" || exit 1
#
# It rebuilds only what does not work, so a healthy environment is left as it
# is, and it returns non-zero with the reason on stderr when it cannot finish.

# shellcheck source=python-env.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/python-env.sh"

seeder_env_ensure() {
  local root="$1" venv py pin
  venv="${root}/scripts/.venv"
  pin="$(tr -d '[:space:]' 2>/dev/null < "${root}/.python-version" || true)"
  py="python${pin%.*}"
  if ! footbag_venv_healthy "$venv"; then
    # Proved before anything is removed, so a machine without the pinned Python
    # keeps its environment rather than losing and failing to rebuild it.
    if [[ -z "$pin" ]] || ! command -v "$py" >/dev/null 2>&1 \
       || [[ "$("$py" -c 'import platform; print(platform.python_version())')" != "$pin" ]]; then
      echo "ERROR: Python ${pin:-(no .python-version)} is not available as ${py}; bash scripts/setup-dev-workstation.sh installs it." >&2
      return 1
    fi
    echo "→ Building the seeder Python environment at ${venv}"
    rm -rf -- "$venv"
    if ! "$py" -m venv "$venv"; then
      echo "ERROR: could not create ${venv} with ${py}." >&2
      echo "       bash scripts/setup-dev-workstation.sh installs the pinned Python." >&2
      rm -rf -- "$venv"
      return 1
    fi
  fi
  "${venv}/bin/python3" -m pip install --quiet --disable-pip-version-check --require-hashes -r "${root}/scripts/requirements.txt" || return 1
  if ! footbag_venv_healthy "$venv" "${root}/scripts/requirements.txt"; then
    echo "ERROR: ${venv} does not satisfy scripts/requirements.txt at Python $(cat "${root}/.python-version") after installing." >&2
    return 1
  fi
}
