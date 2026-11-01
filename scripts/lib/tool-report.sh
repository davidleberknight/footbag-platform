#!/usr/bin/env bash
#
# Which workstation tools the local runners need, reported all at once.
#
# Unreported, a missing tool surfaces one gate at a time, far into a run and far
# from the cause: a skipped secret scan, a Terraform gate that could not start, a
# clean-room gate that failed on a missing encoder and read as a test failure.
# This reports every missing or wrong-version tool up front, each with the fix,
# the way the operator workstation script reports its tools. sqlite3, jq, age,
# ffmpeg and ffprobe must be at the version ops/tool-versions.env pins,
# everywhere, and any other version is a problem; ffmpeg's pin is production's,
# which the pinned-ffmpeg runner (scripts/ffmpeg-pinned.sh) supplies.
#
# What this refuses to do:
#
#   - Install anything. scripts/setup-dev-workstation.sh installs what this
#     reports, and uses this same check to decide what is missing.
#   - Hold its own copy of a version. Each is read from ops/tool-versions.env,
#     from .nvmrc and .python-version, or from the continuous-integration
#     workflow, so a pin and its check cannot drift.
#   - Let a run go ahead on the wrong tools. tool_report returns 1 on any
#     missing or wrong-version tool, and the runners that call it stop.
#
# Usage, sourced:
#
#     source "${REPO_ROOT}/scripts/lib/tool-report.sh"
#     tool_report node python sqlite3 ffmpeg
#
# Tools: node, python (the exact pinned version), python3, sqlite3, ffmpeg, ffprobe, jq,
# age, docker, gitleaks, terraform.
#
# TOOL_REPORT_ROOT overrides the repository root the pins are read from (its
# .github/workflows/ci.yml and .nvmrc). It is the seam a test uses; a run that
# uses it says so on stderr.

_tool_report_root() {
  if [ -n "${TOOL_REPORT_ROOT:-}" ]; then
    echo "TOOL_REPORT_ROOT is set, so versions are read from ${TOOL_REPORT_ROOT} rather than the checkout." >&2
    printf '%s\n' "$TOOL_REPORT_ROOT"
    return 0
  fi
  # This file lives at scripts/lib/, so the root is two directories up from it.
  printf '%s\n' "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
}

# The first value the workflow gives a key, with quotes and spaces stripped.
_tool_report_pin() {
  local key="$1" workflow="$2"
  { grep -m1 "${key}:" "$workflow" 2>/dev/null || true; } | tr -d " '\"" | cut -d: -f2
}

# A pin from the one tool-version list, read with grep and never sourced.
_tool_report_list_pin() {
  local key="$1" root="$2"
  sed -n "s/^${key}=//p" "${root}/ops/tool-versions.env" 2>/dev/null | sed -n '$p'
}

# One line per problem; nothing for a tool that is fine.
_tool_report_check() {
  local tool="$1" root="$2" workflow="$2/.github/workflows/ci.yml" pin have
  case "$tool" in
    node)
      pin="$(tr -d '[:space:]v' 2>/dev/null < "${root}/.nvmrc" || true)"
      if ! command -v node >/dev/null 2>&1; then
        echo "node is not installed; the push gate runs Node ${pin} (.nvmrc). Install it with nvm (nvm install)."
      else
        have="$(node -v 2>/dev/null | tr -d 'v')"
        [ "$have" = "$pin" ] || echo "node ${have} is installed; the push gate runs Node ${pin} (.nvmrc). Switch with nvm (nvm install)."
      fi
      ;;
    python)
      pin="$(tr -d '[:space:]' 2>/dev/null < "${root}/.python-version" || true)"
      if ! command -v "python${pin%.*}" >/dev/null 2>&1; then
        echo "python${pin%.*} is not installed; the push gate runs Python ${pin} (.python-version) and the clean room needs that exact interpreter."
      else
        have="$("python${pin%.*}" -c 'import platform; print(platform.python_version())' 2>/dev/null)"
        [ "$have" = "$pin" ] || echo "python${pin%.*} is ${have}; the push gate runs Python ${pin} (.python-version) and the clean room needs that exact interpreter."
      fi
      ;;
    python3)
      command -v python3 >/dev/null 2>&1 || echo "python3 is not installed. Install python3, python3-venv and python3-pip."
      ;;
    ffmpeg|ffprobe)
      # The pin is the image container's package (8.1.3-r0); the tool reports
      # the upstream version without Alpine's package revision.
      pin="$(_tool_report_list_pin FFMPEG_VERSION "$root" | sed 's/-r[0-9]*$//')"
      if ! command -v "$tool" >/dev/null 2>&1; then
        echo "${tool} is not installed; the pinned version is ${pin}, production's (FFMPEG_VERSION in ops/tool-versions.env). bash scripts/setup-dev-workstation.sh installs it."
      else
        have="$("$tool" -version 2>/dev/null | sed -n "1s/^${tool} version \([0-9][0-9.]*\).*/\1/p")"
        [ "$have" = "$pin" ] || echo "${tool} ${have:-of unknown version} is installed; production runs ${pin} (FFMPEG_VERSION in ops/tool-versions.env), and encodes differ between versions. bash scripts/setup-dev-workstation.sh installs the pinned one."
      fi
      ;;
    docker)
      if ! command -v docker >/dev/null 2>&1; then
        echo "docker is not installed. Install the container runtime per the developer onboarding guide."
      elif ! timeout 10 docker info >/dev/null 2>&1; then
        echo "docker is installed but its daemon is not answering. Start it (Docker Desktop, or: sudo service docker start)."
      else
        # The pin is the apt version string (epoch:version-revision); the
        # running engine reports only the version part.
        pin="$(_tool_report_list_pin DOCKER_ENGINE_WORKSTATION "$root" | sed 's/^[0-9]*://; s/-.*//')"
        have="$(timeout 10 docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
        [ "$have" = "$pin" ] || echo "the docker engine is ${have:-of unknown version}; the pinned workstation engine is ${pin} (DOCKER_ENGINE_WORKSTATION in ops/tool-versions.env). Install that version per the developer onboarding guide's Docker section."
      fi
      ;;
    gitleaks)
      pin="$(_tool_report_pin GITLEAKS_VERSION "$workflow")"
      have=""
      command -v gitleaks >/dev/null 2>&1 && have="$(gitleaks version 2>/dev/null | tr -d 'v[:space:]')"
      if [ "$have" != "$pin" ] && ! { command -v docker >/dev/null 2>&1 && timeout 10 docker info >/dev/null 2>&1; }; then
        if [ -n "$have" ]; then
          echo "gitleaks ${have} is installed but the push gate runs ${pin}, and docker is not running to supply it. Install gitleaks ${pin}, or start docker."
        else
          echo "no secret scanner: gitleaks ${pin} is not installed and docker is not running. Install gitleaks ${pin}, or start docker; without one, commits are not scanned."
        fi
      fi
      ;;
    terraform)
      pin="$(_tool_report_pin terraform_version "$workflow")"
      if ! command -v terraform >/dev/null 2>&1; then
        echo "terraform is not installed; the push gate runs ${pin}. Install Terraform ${pin}."
      else
        have="$(terraform version 2>/dev/null | sed -n '1s/^Terraform v//p')"
        [ "$have" = "$pin" ] || echo "terraform ${have} is installed; the push gate runs ${pin}, and formatting can differ between versions. Install Terraform ${pin}."
      fi
      ;;
    sqlite3|jq|age)
      case "$tool" in sqlite3) key=SQLITE_VERSION ;; jq) key=JQ_VERSION ;; age) key=AGE_VERSION ;; esac
      pin="$(_tool_report_list_pin "$key" "$root")"
      if ! command -v "$tool" >/dev/null 2>&1; then
        echo "${tool} is not installed; the pinned version is ${pin} (${key} in ops/tool-versions.env). bash scripts/setup-dev-workstation.sh installs it."
      else
        case "$tool" in
          sqlite3) have="$(sqlite3 --version 2>/dev/null | cut -d' ' -f1)" ;;
          jq)      have="$(jq --version 2>/dev/null | sed 's/^jq-//')" ;;
          age)     have="$(age --version 2>/dev/null | sed 's/^v//')" ;;
        esac
        [ "$have" = "$pin" ] || echo "${tool} ${have:-of unknown version} is installed; the pinned version is ${pin} (${key} in ops/tool-versions.env), and output formats differ between versions. bash scripts/setup-dev-workstation.sh installs the pinned one."
      fi
      ;;
    *)
      echo "tool-report: unknown tool '${tool}'." >&2
      return 2
      ;;
  esac
}

# Prints a heading, every problem found, and a one-line total. Returns 1 when
# any tool is missing or at a version other than its pin, so a caller that
# gates on it refuses rather than running against tools CI and the hosts do not
# run.
tool_report() {
  local root tool line problems=0
  root="$(_tool_report_root)"
  echo "→ Checking workstation tools (versions from the push gate's pins)"
  for tool in "$@"; do
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      echo "  [missing] ${line}"
      problems=$((problems + 1))
    done < <(_tool_report_check "$tool" "$root")
  done
  if [ "$problems" -eq 0 ]; then
    echo "  all ${#} tools present"
  else
    echo "  ${problems} tool problem(s) above; nothing runs until they are fixed."
    echo "  bash scripts/setup-dev-workstation.sh installs them at the pinned versions."
    return 1
  fi
  return 0
}

# For CI. Fails when a tool is missing, because a suite then skips cases the
# runner is meant to execute, and when sqlite3, jq, age, ffmpeg or ffprobe is at
# any version but its pin, because CI installs the pinned ones itself rather
# than taking the runner image's.
tool_report_require() {
  local root missing="" t line
  root="$(_tool_report_root)"
  for t in "$@"; do
    line="$(_tool_report_check "$t" "$root")"
    if [ -n "$line" ]; then missing="${missing}${line}"$'\n'; fi
  done
  if [ -n "$missing" ]; then
    printf '%s' "$missing" | sed 's/^/  [missing] /' >&2
    return 1
  fi
  echo "  ${#} tools present"
}
