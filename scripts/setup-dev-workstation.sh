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
#   10. With --operator only: the AWS CLI v2, which only operators use.
#   Then it checks every tool again and exits non-zero if anything is missing.
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
#
# Usage:
#   bash scripts/setup-dev-workstation.sh
#   bash scripts/setup-dev-workstation.sh --check
#
# Flags:
#   --check     Report what would be installed and exit: 0 when nothing is
#               needed, 1 otherwise. Changes nothing and takes no confirmation.
#   --operator  Also install the AWS CLI v2 at the pinned version, verified
#               against AWS's published signing key (scripts/keys/aws-cli-v2.pub)
#               as well as a pinned checksum. For operators and dev-testers.
#   --yes       Accept the typed confirmation in advance.
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
OPERATOR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=1; shift ;;
    --operator) OPERATOR=1; shift ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 >&2 ;;
  esac
done

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
# The AWS CLI publishes a signature rather than a checksum list, so it is
# verified both ways: the pinned checksum, and AWS's signature checked against
# its published key, whose fingerprint is pinned here so an edited key file is
# refused too.
AWS_CLI_VERSION="2.34.8"
AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-x86_64-2.34.8.zip"
AWS_CLI_SHA256="de4a8f35c5d19e120e6b5403bbebbf356459ae17af78941ae74e37a78f44aef3"
AWS_CLI_KEY="scripts/keys/aws-cli-v2.pub"
AWS_CLI_KEY_FINGERPRINT="FB5DB77FD5C118B80511ADA8A6310ACC4672475C"

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
(( OPERATOR )) && ! aws_ok && PLAN+=("aws: install AWS CLI ${AWS_CLI_VERSION} into ${BIN_DIR}")

echo "Developer workstation setup for ${REPO_ROOT}"
if (( ${#PLAN[@]} == 0 )); then
  echo "  Nothing to do: every tool is installed at its pinned version."
else
  printf '  %s\n' "${PLAN[@]}"
fi
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
  if ! $ALTERNATIVES --list python3 2>/dev/null | grep -qxF "$distro_py"; then
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

# ── 10. AWS CLI, operators only ──────────────────────────────────────────────
if (( OPERATOR )) && ! aws_ok; then
  echo "==> AWS CLI ${AWS_CLI_VERSION}"
  fetch_verified "$AWS_CLI_URL" "$AWS_CLI_SHA256" "$WORK/awscli.zip"
  $FETCH "$WORK/awscli.zip.sig" "${AWS_CLI_URL}.sig"
  mkdir -p "$WORK/gnupg"
  chmod 700 "$WORK/gnupg"
  # A key file that will not import leaves no fingerprint, and the check below
  # refuses it by name; letting the import's own failure end the run would not.
  GNUPGHOME="$WORK/gnupg" gpg --quiet --import "$AWS_CLI_KEY" 2>/dev/null || true
  key_fpr="$(GNUPGHOME="$WORK/gnupg" gpg --with-colons --fingerprint 2>/dev/null | grep -m1 '^fpr' | cut -d: -f10 || true)"
  if [[ "$key_fpr" != "$AWS_CLI_KEY_FINGERPRINT" ]]; then
    echo "ERROR: ${AWS_CLI_KEY} is not AWS's published signing key (fingerprint ${key_fpr:-none}). Nothing installed." >&2
    exit 1
  fi
  if ! GNUPGHOME="$WORK/gnupg" gpg --quiet --verify "$WORK/awscli.zip.sig" "$WORK/awscli.zip" 2>/dev/null; then
    echo "ERROR: the AWS CLI installer's signature does not verify against AWS's key. Nothing installed." >&2
    exit 1
  fi
  unzip -o -q "$WORK/awscli.zip" -d "$WORK"
  "$WORK/aws/install" --install-dir "${HOME}/.local/aws-cli" --bin-dir "$BIN_DIR" --update
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
if (( OPERATOR )) && ! aws_ok; then
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
if (( remaining )); then
  echo "Setup incomplete: the items above are still missing." >&2
  exit 1
fi
echo "Setup complete. Re-run any time; it installs only what is missing."
