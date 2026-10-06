#!/usr/bin/env bash
# setup-dev-workstation.sh
#
# Installs everything a developer workstation needs to run this repository and
# its full local test run, at the versions the push gate pins, and nothing it
# already has. Run it on a fresh Ubuntu (or WSL Ubuntu) after cloning; run it
# again any time, and it reports that there is nothing to do.
#
# WHY THIS EXISTS.
#
# The tools used to be a list of commands in the onboarding guide, copied by
# hand, with versions that nothing checked. A machine set up from that list could
# not reach a green full run: it had no secret scanner, a Terraform newer than
# the one CI formats with, no interpreter of the pinned Python version, and
# browsers without their system libraries. Every one of those surfaced as a
# skipped or failed gate an hour into a run. A setup step that lives in a document
# is a step somebody skips, so it lives here instead.
#
# WHAT IT DOES, IN ORDER, EACH ONLY WHEN NEEDED.
#
#   0. The system python3 back on Ubuntu's own interpreter when it has been
#      pointed elsewhere: apt's own tools are built for that one only, and a
#      python3 they cannot load breaks every apt update. The project never uses
#      the system python3 for its work; it names the pinned interpreter.
#   1. The apt baseline: build tools, sqlite3, ffmpeg, jq, age and the rest.
#   2. Python at exactly the version in .python-version: a pinned standalone
#      CPython build, checksum-verified, under ~/.local.
#   3. Node at exactly the version in .nvmrc, through a pinned nvm whose
#      installer is checksum-verified.
#   4. gitleaks at the push gate's version, unless docker can supply it.
#   5. Terraform at the push gate's version.
#   6. npm dependencies from the lockfile, unless node_modules already holds
#      every package the lockfile pins at its pinned version.
#   7. Playwright's Chromium with its system libraries.
#   8. The two Python environments, each through its own builder.
#   9. The repository's git hooks.
#   10. With --aws only: the AWS CLI v2, which only the administrators and
#       dev-and-testers use.
#   11. With --account only: the named key pair a dev-and-tester is onboarded
#       with, at ~/.ssh/id_ed25519_<account>, where the acceptance looks for it,
#       made with no passphrase.
#   Then it checks every tool again and exits non-zero if anything is missing.
#   With --account it ends by printing what the holder who onboards them needs:
#   the public key, its fingerprint, and the address this machine connects from.
#
# WHAT IT REFUSES TO DO.
#
#   - Install a download it cannot verify. Every archive is compared with the
#     checksum pinned below, and a mismatch stops the run before anything from
#     it is unpacked.
#   - Install a version other than the one the push gate pins. The pins below
#     are checked against .nvmrc, .python-version and the CI workflow first, so a
#     bumped pin without a bumped download is refused rather than installed wrong.
#   - Install Docker. On WSL it is a desktop application with a group change and
#     a restart; it is reported, with the page that installs it.
#   - Touch anything without showing the plan and taking a typed APPLY.
#   - Replace a named key pair it was not told to replace by fingerprint. A pair
#     already at the path is the one an onboarding may have been sealed to, so a
#     re-run keeps it; and once replaced, a re-run finds a different fingerprint
#     there and keeps the new one.
#   - Set aside, or create, only one half of a pair.
#
# Usage:
#   bash scripts/setup-dev-workstation.sh
#   bash scripts/setup-dev-workstation.sh --check
#   bash scripts/setup-dev-workstation.sh --aws --account <first_last>
#   bash scripts/setup-dev-workstation.sh --aws --account <first_last> \
#     --replace-key <SHA256 fingerprint of the pair to retire>
#   bash scripts/setup-dev-workstation.sh --aws --account <first_last> \
#     --replace-key retired [--profile <first_last>]
#
# Flags:
#   --check     Report what would be installed and exit: 0 when nothing is
#               needed, 1 otherwise. Changes nothing and takes no confirmation.
#   --aws       Also install the AWS CLI v2 at the pinned version, verified
#               against its pinned checksum. For the administrators and
#               dev-and-testers.
#   --account <first_last>
#               With --aws: make sure this dev-and-tester's named key pair
#               exists, creating it if not, and end by printing what to post for
#               the holder who onboards them.
#   --replace-key <SHA256:...|retired>
#               With --account: when the pair at the path has this fingerprint,
#               move both halves aside to ~/.ssh/retired_<account>_<time> and
#               create a fresh pair. For re-onboarding after an offboard, which
#               refuses the retired key. The word "retired" instead of a
#               fingerprint sets aside the pair at the path only when it is the
#               one an onboarding was accepted with (the marker the acceptance
#               leaves beside it says so), or, where there is no marker, when
#               --profile names that account's AWS profile and AWS refuses its
#               key as invalid, which is what an offboarded identity's key is
#   --profile <account>
#               With --replace-key retired and no acceptance marker: the AWS
#               profile whose key must be proved dead before its pair is set aside
#   --yes       Accept the typed confirmation in advance.
#
# Test seam (CI only): SETUP_DEV_AWS_BIN replaces the aws CLI used for the
# dead-identity proof, and a run using it says so.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/tool-report.sh
source "${REPO_ROOT}/scripts/lib/tool-report.sh"
# shellcheck source=lib/seeder-env.sh
source "${REPO_ROOT}/scripts/lib/seeder-env.sh"
# shellcheck source=lib/npm-deps.sh
source "${REPO_ROOT}/scripts/lib/npm-deps.sh"

CHECK_ONLY=0
WITH_AWS=0
ACCOUNT=""
REPLACE_KEY=""
DEAD_PROFILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=1; shift ;;
    --aws) WITH_AWS=1; shift ;;
    --account) ACCOUNT="${2:-}"; shift 2 || { echo "ERROR: --account requires an argument" >&2; exit 2; } ;;
    --replace-key) REPLACE_KEY="${2:-}"; shift 2 || { echo "ERROR: --replace-key requires an argument" >&2; exit 2; } ;;
    --profile) DEAD_PROFILE="${2:-}"; shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; } ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

# The same shape the onboarding holds a name to: it becomes their host account,
# their IAM user and the role session name, so a key made under another
# spelling is one the acceptance never finds.
if [[ -n "$ACCOUNT" ]]; then
  if (( ! WITH_AWS )); then
    echo "ERROR: --account goes with --aws: a named key pair is for a" >&2
    echo "       dev-and-tester, who also needs the AWS CLI." >&2
    exit 2
  fi
  if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
    echo "ERROR: '${ACCOUNT}' is not a usable account name: firstname_lastname in" >&2
    echo "       lower-case ASCII, at most 32 characters, as you will be onboarded." >&2
    exit 2
  fi
fi
if [[ -n "$REPLACE_KEY" ]]; then
  if [[ -z "$ACCOUNT" ]]; then
    echo "ERROR: --replace-key goes with --account, which names the pair it replaces." >&2
    exit 2
  fi
  if [[ "$REPLACE_KEY" != "retired" && ! "$REPLACE_KEY" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]]; then
    echo "ERROR: --replace-key takes the SHA256 fingerprint of the pair to retire," >&2
    echo "       as ssh-keygen -l prints it, or the word retired." >&2
    exit 2
  fi
fi
if [[ -n "$DEAD_PROFILE" && "$REPLACE_KEY" != "retired" ]]; then
  echo "ERROR: --profile goes with --replace-key retired." >&2
  exit 2
fi
if [[ -n "$DEAD_PROFILE" && "$DEAD_PROFILE" != "$ACCOUNT" ]]; then
  echo "ERROR: --profile names the account's own profile, ${ACCOUNT}. A different" >&2
  echo "       profile proves nothing about whether this pair's identity is retired." >&2
  exit 2
fi

# ── Pinned downloads ─────────────────────────────────────────────────────────
#
# Each is the exact file this script installs and the SHA-256 its publisher
# lists for it. Bumping a version means changing the version file or workflow
# pin AND the matching lines here; the guard below refuses one without the other.
PYTHON_VERSION="3.12.12"
PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20260211/cpython-3.12.12+20260211-x86_64-unknown-linux-gnu-install_only.tar.gz"
PYTHON_SHA256="4a867ae3436e9d7c3558a8fd2bd82e13dd0de59282e2f4e20e5c879f9085fe86"
NVM_VERSION="0.40.3"
NVM_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh"
NVM_SHA256="2d8359a64a3cb07c02389ad88ceecd43f2fa469c06104f92f98df5b6f315275f"
GITLEAKS_VERSION="8.24.3"
GITLEAKS_URL="https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz"
GITLEAKS_SHA256="9991e0b2903da4c8f6122b5c3186448b927a5da4deef1fe45271c3793f4ee29c"
TERRAFORM_VERSION="1.14.7"
TERRAFORM_URL="https://releases.hashicorp.com/terraform/1.14.7/terraform_1.14.7_linux_amd64.zip"
TERRAFORM_SHA256="e8bbcefea8015156e04e2a325cde37a0b2fb761728bda548e2fe3b8ad7c18c96"
# AWS publishes no checksum list for the CLI; this one was computed from the
# versioned installer when the pin was set, so it holds the download to that
# exact file like every other pin here.
AWS_CLI_VERSION="2.34.8"
AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.34.8.zip"
AWS_CLI_SHA256="de4a8f35c5d19e120e6b5403bbebbf356459ae17af78941ae74e37a78f44aef3"

APT_PACKAGES=(build-essential python3 python3-venv python3-pip sqlite3 ffmpeg git unzip zip
  jq ca-certificates curl openssh-client rsync gpg age lsof)

# ── Seams ────────────────────────────────────────────────────────────────────
#
# A test replaces the package manager, the downloader and the install locations
# with stand-ins. A run that uses one says so, because a stubbed run proves
# nothing about the machine.
BIN_DIR="${SETUP_DEV_BIN_DIR:-${HOME}/.local/bin}"
PYTHON_ROOT="${SETUP_DEV_PYTHON_ROOT:-${HOME}/.local/share/footbag/python}"
APT="${SETUP_DEV_APT:-sudo apt-get}"
DPKG_QUERY="${SETUP_DEV_DPKG_QUERY:-dpkg-query}"
ALTERNATIVES="${SETUP_DEV_ALTERNATIVES:-sudo update-alternatives}"
SYSTEM_PYTHON3="${SETUP_DEV_SYSTEM_PYTHON3:-/usr/bin/python3}"
DIST_PACKAGES="${SETUP_DEV_DIST_PACKAGES:-/usr/lib/python3/dist-packages}"
FETCH="${SETUP_DEV_FETCH:-curl -fsSL -o}"
NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
for seam in SETUP_DEV_BIN_DIR SETUP_DEV_PYTHON_ROOT SETUP_DEV_APT SETUP_DEV_DPKG_QUERY SETUP_DEV_FETCH \
  SETUP_DEV_ALTERNATIVES SETUP_DEV_SYSTEM_PYTHON3 SETUP_DEV_DIST_PACKAGES; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam} is set -- this run proves nothing about this machine." >&2
done

# ── The pins must agree with what the push gate reads ────────────────────────
pin_mismatch=0
want_python="$(tr -d '[:space:]' 2>/dev/null < .python-version || true)"
want_node="$(tr -d '[:space:]v' 2>/dev/null < .nvmrc || true)"
want_gitleaks="$(_tool_report_pin GITLEAKS_VERSION .github/workflows/ci.yml)"
want_terraform="$(_tool_report_pin terraform_version .github/workflows/ci.yml)"
[[ "$want_python" == "$PYTHON_VERSION" ]] || { echo "ERROR: .python-version says ${want_python:-nothing}; this script installs ${PYTHON_VERSION}." >&2; pin_mismatch=1; }
[[ -n "$want_node" ]] || { echo "ERROR: .nvmrc is missing or empty." >&2; pin_mismatch=1; }
[[ "$want_gitleaks" == "$GITLEAKS_VERSION" ]] || { echo "ERROR: the workflow pins gitleaks ${want_gitleaks}; this script installs ${GITLEAKS_VERSION}." >&2; pin_mismatch=1; }
[[ "$want_terraform" == "$TERRAFORM_VERSION" ]] || { echo "ERROR: the workflow pins Terraform ${want_terraform}; this script installs ${TERRAFORM_VERSION}." >&2; pin_mismatch=1; }
if (( pin_mismatch )); then
  echo "       Update the pinned download lines at the top of this script to match. Nothing changed." >&2
  exit 1
fi

PY_MINOR="${PYTHON_VERSION%.*}"
export PATH="${BIN_DIR}:${PATH}"

# ── Detection ────────────────────────────────────────────────────────────────
# The interpreter apt's own module was built for, read from the module's file
# name (apt_pkg.cpython-310-... is Python 3.10), or nothing where apt has none.
distro_python() {
  local so
  so="$(ls "${DIST_PACKAGES}"/apt_pkg.cpython-3*-*.so 2>/dev/null | head -1 || true)"
  [[ -n "$so" ]] || return 0
  printf 'python3.%s\n' "$(basename "$so" | sed -E 's/^apt_pkg\.cpython-3([0-9]+)-.*/\1/')"
}
system_python_ok() {
  [[ -z "$(distro_python)" ]] && return 0
  "$SYSTEM_PYTHON3" -c 'import apt_pkg' >/dev/null 2>&1
}
apt_missing() {
  local pkg status
  for pkg in "${APT_PACKAGES[@]}"; do
    status="$($DPKG_QUERY -W -f='${Status}' "$pkg" 2>/dev/null || true)"
    [[ "$status" == "install ok installed" ]] || printf '%s\n' "$pkg"
  done
}
python_ok() {
  command -v "python${PY_MINOR}" >/dev/null 2>&1 \
    && [[ "$("python${PY_MINOR}" -c 'import platform; print(platform.python_version())' 2>/dev/null)" == "$PYTHON_VERSION" ]]
}
node_ok() { command -v node >/dev/null 2>&1 && [[ "$(node -v 2>/dev/null | tr -d v)" == "$want_node" ]]; }
tool_ok() { [[ -z "$(_tool_report_check "$1" "$REPO_ROOT")" ]]; }
# The two Python environments, judged by whether they work at the pinned version
# and already satisfy their hash-pinned requirements, never by a file existing.
legacy_env_ok() {
  local dir
  dir="$(footbag_venv_dir pipeline fail 2>/dev/null)" || return 1
  footbag_venv_healthy "$dir" legacy_data/requirements.txt
}
seeder_env_ok() { footbag_venv_healthy scripts/.venv scripts/requirements.txt; }
aws_ok() { command -v aws >/dev/null 2>&1 && [[ "$(aws --version 2>&1)" == "aws-cli/${AWS_CLI_VERSION} "* ]]; }
# The revision the lock-pinned Playwright expects, read from its own manifest.
# Read as a file: the package does not export it, so a require() of it fails.
# Playwright writes INSTALLATION_COMPLETE only once a browser is fully unpacked,
# so an interrupted download leaves a folder without it; the folder alone is not
# the outcome. PLAYWRIGHT_BROWSERS_PATH moves the location, as Playwright does.
chromium_ok() {
  local revision
  revision="$(jq -r '.browsers[] | select(.name == "chromium") | .revision' \
    node_modules/playwright-core/browsers.json 2>/dev/null || true)"
  [[ -n "$revision" && -f "${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}/chromium-${revision}/INSTALLATION_COMPLETE" ]]
}

NAMED_KEY="${HOME}/.ssh/id_ed25519_${ACCOUNT}"
NAMED_KEY_TILDE="~/.ssh/id_ed25519_${ACCOUNT}"
# The SHA256 fingerprint of the pair at the named path, or nothing.
named_key_sha() { ssh-keygen -l -f "${NAMED_KEY}.pub" 2>/dev/null | awk '{print $2}'; }

# What the named key pair needs: nothing, "create", or "replace". Settled before
# the plan, so a half pair or an unreadable one stops the run before anything
# is installed.
KEY_ACTION=""
KEY_NOTE=""
if [[ -n "$ACCOUNT" ]]; then
  if [[ -e "$NAMED_KEY" && ! -e "${NAMED_KEY}.pub" ]] || [[ ! -e "$NAMED_KEY" && -e "${NAMED_KEY}.pub" ]]; then
    echo "ERROR: only one half of a key pair is at ${NAMED_KEY_TILDE}. Move it aside," >&2
    echo "       or put its other half beside it, and re-run. Nothing changed." >&2
    exit 1
  fi
  if [[ -e "$NAMED_KEY" ]]; then
    current_sha="$(named_key_sha)" || current_sha=""
    if [[ -z "$current_sha" ]]; then
      echo "ERROR: ssh-keygen cannot read ${NAMED_KEY_TILDE}.pub. Nothing changed." >&2
      exit 1
    fi
    if [[ "$REPLACE_KEY" == "retired" ]]; then
      # A pair is retired when the onboarding it was accepted with has ended.
      # The marker the acceptance left says which pair that was; without one,
      # the account's own identity is asked, and only AWS refusing its key as
      # invalid counts as dead. Anything else, an unreachable network included,
      # is not proof, and the pair is kept.
      marker="${NAMED_KEY}.onboarded"
      if [[ -f "$marker" ]]; then
        if [[ "$(cat "$marker")" == "$current_sha" ]]; then
          KEY_ACTION="replace"
          REPLACE_KEY="$current_sha"
        else
          KEY_NOTE="The pair at ${NAMED_KEY_TILDE} is ${current_sha}, not the one accepted (${marker}): it is kept."
        fi
      elif [[ -z "$DEAD_PROFILE" ]]; then
        echo "ERROR: ${NAMED_KEY_TILDE} carries no acceptance marker, so nothing here says" >&2
        echo "       it was the pair an onboarding used. Name the account's profile so its" >&2
        echo "       identity can be proved retired first:" >&2
        echo "         --replace-key retired --profile ${ACCOUNT}" >&2
        exit 2
      else
        dead_aws="${SETUP_DEV_AWS_BIN:-aws}"
        [[ "$dead_aws" != "aws" ]] && echo "SYNTHETIC: aws='${dead_aws}' -- the identity proof is a stand-in." >&2
        dead_out="$("$dead_aws" sts get-caller-identity --profile "$DEAD_PROFILE" --output text 2>&1 || true)"
        case "$dead_out" in
          *InvalidClientTokenId*|*"security token included in the request is invalid"*)
            KEY_ACTION="replace"
            REPLACE_KEY="$current_sha"
            echo "==> AWS refuses the ${DEAD_PROFILE} key as invalid: that identity is retired."
            ;;
          *"arn:aws:"*)
            echo "ERROR: the ${DEAD_PROFILE} identity still works, so the pair at ${NAMED_KEY_TILDE}" >&2
            echo "       is not retired. Offboard first; nothing changed." >&2
            exit 1
            ;;
          *)
            echo "ERROR: could not prove the ${DEAD_PROFILE} identity retired:" >&2
            printf '         %s\n' "$dead_out" >&2
            echo "       Only AWS refusing the key as invalid counts. Nothing changed." >&2
            exit 1
            ;;
        esac
      fi
    elif [[ -n "$REPLACE_KEY" && "$current_sha" == "$REPLACE_KEY" ]]; then
      KEY_ACTION="replace"
    elif [[ -n "$REPLACE_KEY" ]]; then
      KEY_NOTE="The pair at ${NAMED_KEY_TILDE} is ${current_sha}, not ${REPLACE_KEY}: already replaced, so it is kept."
    fi
  else
    KEY_ACTION="create"
  fi
fi

PLAN=()
system_python_ok || PLAN+=("system python3: point it back at Ubuntu's own $(distro_python), which apt's tools need")
mapfile -t MISSING_APT < <(apt_missing)
(( ${#MISSING_APT[@]} )) && PLAN+=("apt: install ${MISSING_APT[*]}")
python_ok || PLAN+=("python: install CPython ${PYTHON_VERSION} as ${BIN_DIR}/python${PY_MINOR}")
node_ok || PLAN+=("node: install Node ${want_node} with nvm ${NVM_VERSION}")
tool_ok gitleaks || PLAN+=("gitleaks: install ${GITLEAKS_VERSION} into ${BIN_DIR}")
tool_ok terraform || PLAN+=("terraform: install ${TERRAFORM_VERSION} into ${BIN_DIR}")
npm_deps_current "$REPO_ROOT" || PLAN+=("npm: install dependencies from the lockfile (npm ci)")
chromium_ok || PLAN+=("playwright: install Chromium with its system libraries")
legacy_env_ok || PLAN+=("python env: build or repair the legacy pipeline environment")
seeder_env_ok || PLAN+=("python env: build or repair the seeder environment")
[[ "$(git rev-parse --git-path hooks 2>/dev/null)" == *.githooks ]] || PLAN+=("git: activate the repository's hooks")
(( WITH_AWS )) && ! aws_ok && PLAN+=("aws: install AWS CLI ${AWS_CLI_VERSION} into ${BIN_DIR}")
[[ "$KEY_ACTION" == "create" ]] && PLAN+=("ssh key: create ${NAMED_KEY_TILDE} for ${ACCOUNT}, with no passphrase")
[[ "$KEY_ACTION" == "replace" ]] && PLAN+=("ssh key: set ${NAMED_KEY_TILDE} (${REPLACE_KEY}) aside as ~/.ssh/retired_${ACCOUNT}_<time>, then create a fresh pair")

echo "Developer workstation setup for ${REPO_ROOT}"
if (( ${#PLAN[@]} == 0 )); then
  echo "  Nothing to do: every tool is installed at its pinned version."
else
  printf '  %s\n' "${PLAN[@]}"
fi
[[ -n "$KEY_NOTE" ]] && echo "  ${KEY_NOTE}"
tool_ok docker || echo "  Docker is not ready and is not installed by this script: see the container runtime section of the developer onboarding guide."

if (( CHECK_ONLY )); then
  (( ${#PLAN[@]} == 0 )) && exit 0
  exit 1
fi
if (( ${#PLAN[@]} > 0 )); then
  if ! confirm_from_tty "Type 'APPLY' to install the above: " "APPLY"; then
    echo "Not confirmed; nothing has been changed." >&2
    exit 1
  fi
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-setup.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM

# Downloads a pinned file and refuses it unless its checksum matches.
fetch_verified() {
  local url="$1" sha="$2" out="$3"
  $FETCH "$out" "$url"
  if [[ "$(sha256sum "$out" | cut -d' ' -f1)" != "$sha" ]]; then
    echo "ERROR: ${url} does not match its pinned checksum. Nothing from it was installed." >&2
    exit 1
  fi
}

mkdir -p "$BIN_DIR"

# ── 0. The system python3 ────────────────────────────────────────────────────
if ! system_python_ok; then
  distro_py="$(dirname "$SYSTEM_PYTHON3")/$(distro_python)"
  echo "==> system python3 -> ${distro_py}"
  if [[ ! -x "$distro_py" ]]; then
    echo "ERROR: apt's module is built for ${distro_py}, which is not installed. Reinstall Ubuntu's python3 package, then re-run. Nothing changed." >&2
    exit 1
  fi
  # --set only chooses among registered alternatives; a python3 repointed by
  # hand, or one never registered, has none, so register Ubuntu's own first.
  if ! grep -qxF "$distro_py" <<< "$($ALTERNATIVES --list python3 2>/dev/null)"; then
    $ALTERNATIVES --install "$SYSTEM_PYTHON3" python3 "$distro_py" 1
  fi
  $ALTERNATIVES --set python3 "$distro_py"
  if ! system_python_ok; then
    echo "ERROR: the system python3 still cannot load apt's module after pointing it at ${distro_py}." >&2
    exit 1
  fi
fi

# ── 1. apt baseline ──────────────────────────────────────────────────────────
if (( ${#MISSING_APT[@]} )); then
  echo "==> apt: ${MISSING_APT[*]}"
  # An update can report an error while still refreshing the lists: an extra
  # repository with a stale signing key, or a post-update hook that crashes.
  # It is not the verdict; the install below and the final check are.
  if ! $APT update; then
    echo "WARNING: apt update reported errors (above); installing from the package lists apt has." >&2
  fi
  $APT install -y "${MISSING_APT[@]}"
fi

# ── 2. Python ────────────────────────────────────────────────────────────────
if ! python_ok; then
  echo "==> CPython ${PYTHON_VERSION}"
  fetch_verified "$PYTHON_URL" "$PYTHON_SHA256" "$WORK/python.tar.gz"
  rm -rf "${PYTHON_ROOT}/${PYTHON_VERSION}"
  mkdir -p "${PYTHON_ROOT}/${PYTHON_VERSION}"
  tar -xzf "$WORK/python.tar.gz" -C "${PYTHON_ROOT}/${PYTHON_VERSION}"
  ln -sfn "${PYTHON_ROOT}/${PYTHON_VERSION}/python/bin/python${PY_MINOR}" "${BIN_DIR}/python${PY_MINOR}"
fi

# ── 3. Node ──────────────────────────────────────────────────────────────────
if ! node_ok; then
  echo "==> Node ${want_node}"
  if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
    fetch_verified "$NVM_URL" "$NVM_SHA256" "$WORK/nvm-install.sh"
    NVM_DIR="$NVM_DIR" bash "$WORK/nvm-install.sh"
  fi
  # shellcheck disable=SC1091
  set +u; source "${NVM_DIR}/nvm.sh"; nvm install "$want_node"; nvm alias default "$want_node"; set -u
fi

# ── 4. gitleaks ──────────────────────────────────────────────────────────────
if ! tool_ok gitleaks; then
  echo "==> gitleaks ${GITLEAKS_VERSION}"
  fetch_verified "$GITLEAKS_URL" "$GITLEAKS_SHA256" "$WORK/gitleaks.tar.gz"
  tar -xzf "$WORK/gitleaks.tar.gz" -C "$WORK" gitleaks
  install -m 0755 "$WORK/gitleaks" "${BIN_DIR}/gitleaks"
fi

# ── 5. Terraform ─────────────────────────────────────────────────────────────
if ! tool_ok terraform; then
  echo "==> Terraform ${TERRAFORM_VERSION}"
  fetch_verified "$TERRAFORM_URL" "$TERRAFORM_SHA256" "$WORK/terraform.zip"
  unzip -o -q "$WORK/terraform.zip" terraform -d "$WORK"
  install -m 0755 "$WORK/terraform" "${BIN_DIR}/terraform"
fi

# ── 6. npm dependencies ──────────────────────────────────────────────────────
if ! npm_deps_current "$REPO_ROOT"; then
  echo "==> npm ci"
  npm ci
fi

# ── 7. Playwright Chromium ───────────────────────────────────────────────────
if ! chromium_ok; then
  echo "==> Playwright Chromium"
  npx playwright install --with-deps chromium
fi

# ── 8. Python environments, each through its own builder ─────────────────────
echo "==> Python environments"
bash legacy_data/run_pipeline.sh venv
seeder_env_ensure "$REPO_ROOT"

# ── 9. Git hooks ─────────────────────────────────────────────────────────────
bash scripts/install-git-hooks.sh

# ── 10. AWS CLI, with --aws only ─────────────────────────────────────────────
if (( WITH_AWS )) && ! aws_ok; then
  echo "==> AWS CLI ${AWS_CLI_VERSION}"
  fetch_verified "$AWS_CLI_URL" "$AWS_CLI_SHA256" "$WORK/awscli.zip"
  unzip -o -q "$WORK/awscli.zip" -d "$WORK"
  "$WORK/aws/install" --install-dir "${HOME}/.local/aws-cli" --bin-dir "$BIN_DIR" --update
fi

# ── 11. The named key pair, dev-and-testers only ─────────────────────────────
# Moved aside, never deleted: the retired pair may still open something else
# this machine uses, and an offboard has already made it useless on staging.
if [[ "$KEY_ACTION" == "replace" ]]; then
  retired="${HOME}/.ssh/retired_${ACCOUNT}_$(date -u +%Y%m%dT%H%M%SZ)"
  mv -n -- "$NAMED_KEY" "$retired"
  mv -n -- "${NAMED_KEY}.pub" "${retired}.pub"
  # The acceptance marker describes the pair it sits beside, so it goes with it.
  [[ -e "${NAMED_KEY}.onboarded" ]] && mv -n -- "${NAMED_KEY}.onboarded" "${retired}.onboarded"
  if [[ -e "$NAMED_KEY" || -e "${NAMED_KEY}.pub" ]]; then
    echo "ERROR: could not move ${NAMED_KEY_TILDE} aside. Nothing was created." >&2
    exit 1
  fi
  echo "==> ${REPLACE_KEY} set aside as ${retired}"
fi
if [[ -n "$KEY_ACTION" ]]; then
  echo "==> ssh key ${NAMED_KEY_TILDE}"
  mkdir -p -m 700 "${HOME}/.ssh"
  # No passphrase: the pair opens only a staging-only identity that offboarding
  # retires, and a prompt on every connection of a deploy buys nothing more.
  ssh-keygen -q -t ed25519 -N '' -f "$NAMED_KEY" -C "${ACCOUNT} footbag"
fi

# ── Verify the outcome ───────────────────────────────────────────────────────
echo ""
remaining=0
system_python_ok || { echo "  still broken: the system python3 cannot load apt's module" >&2; remaining=1; }
legacy_env_ok || { echo "  still broken: the legacy pipeline Python environment" >&2; remaining=1; }
seeder_env_ok || { echo "  still broken: the seeder Python environment (scripts/.venv)" >&2; remaining=1; }
python_ok || { echo "  still missing: CPython ${PYTHON_VERSION}" >&2; remaining=1; }
node_ok || { echo "  still missing: Node ${want_node} (open a new shell so nvm is on PATH, then re-run)" >&2; remaining=1; }
npm_deps_current "$REPO_ROOT" || { echo "  still missing: npm dependencies at the lockfile's versions" >&2; remaining=1; }
chromium_ok || { echo "  still missing: Playwright's Chromium" >&2; remaining=1; }
if (( WITH_AWS )) && ! aws_ok; then
  echo "  still missing: AWS CLI ${AWS_CLI_VERSION} (an older one earlier on PATH shadows ${BIN_DIR}/aws)" >&2
  remaining=1
fi
tool_report node python3 sqlite3 ffmpeg ffprobe jq age docker gitleaks terraform
for tool in sqlite3 ffmpeg ffprobe jq age gitleaks terraform; do
  tool_ok "$tool" || remaining=1
done
case ":${PATH#"${BIN_DIR}:"}:" in
  *":${BIN_DIR}:"*) ;;
  *) echo "  note: ${BIN_DIR} is not on your login PATH; Ubuntu adds it at the next login once it exists." ;;
esac

# What the holder who onboards them needs, read from the pair itself and from
# the address the outside world sees, never from what was meant to happen.
if [[ -n "$ACCOUNT" ]]; then
  # Under pipefail an unreadable or absent pair fails the read, and errexit
  # would end the run there without the message below saying what is missing.
  key_sha="$(named_key_sha)" || key_sha=""
  if [[ ! -f "$NAMED_KEY" || -z "$key_sha" ]]; then
    echo "  still missing: the key pair ${NAMED_KEY_TILDE}" >&2
    remaining=1
  elif [[ -n "$REPLACE_KEY" && "$key_sha" == "$REPLACE_KEY" ]]; then
    echo "  still in place: the retired pair ${REPLACE_KEY} at ${NAMED_KEY_TILDE}" >&2
    remaining=1
  else
    address=""
    if $FETCH "$WORK/address" "https://checkip.amazonaws.com" 2>/dev/null; then
      address="$(tr -d '[:space:]' < "$WORK/address")"
    fi
    if [[ ! "$address" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
      echo "  could not read the address this machine connects from; re-run when online" >&2
      remaining=1
      address="unknown"
    else
      address="${address}/32"
    fi
    echo ""
    echo "Post these on your onboarding card, for the holder who onboards you:"
    echo "  account:      ${ACCOUNT}"
    echo "  public key:   $(grep -m1 . "${NAMED_KEY}.pub")"
    echo "  fingerprint:  ${key_sha}"
    echo "  address:      ${address}"
    echo "The address is the one this machine reaches the internet from now; onboard"
    echo "from where you will work."
  fi
fi

if (( remaining )); then
  echo "Setup incomplete: the items above are still missing." >&2
  exit 1
fi
echo "Setup complete. Re-run any time; it installs only what is missing."
