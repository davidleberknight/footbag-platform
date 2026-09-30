#!/usr/bin/env bash
#
# Which workstation tools the local runners need, reported all at once.
#
# A missing tool used to surface one gate at a time, far into a run and far from
# the cause: a skipped secret scan, a Terraform gate that could not start, a
# clean-room gate that failed on a missing encoder and read as a test failure.
# This reports every missing or wrong-version tool up front, each with the fix,
# the way the operator workstation script reports its tools. For sqlite3,
# ffmpeg, jq and age a version other than the push gate's recorded one is a
# [note], never a problem; tool_report_require, for CI, fails only on a missing
# tool and turns a version difference into a warning annotation.
#
# What this refuses to do:
#
#   - Install anything. scripts/setup-dev-workstation.sh installs what this
#     reports, and uses this same check to decide what is missing.
#   - Hold its own copy of a version. Where the push gate pins one, it is read
#     from the continuous-integration workflow or from .nvmrc and
#     .python-version, the files that workflow reads, so the two cannot drift.
#   - Decide a run's verdict. It reports; each gate still decides for itself
#     whether a missing tool is a skip or a failure.
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
    ffprobe)
      command -v ffprobe >/dev/null 2>&1 || echo "ffprobe is not installed; it ships with ffmpeg. Install ffmpeg."
      ;;
    docker)
      if ! command -v docker >/dev/null 2>&1; then
        echo "docker is not installed. Install the container runtime per the developer onboarding guide."
      elif ! timeout 10 docker info >/dev/null 2>&1; then
        echo "docker is installed but its daemon is not answering. Start it (Docker Desktop, or: sudo service docker start)."
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
    sqlite3|ffmpeg|jq|age)
      command -v "$tool" >/dev/null 2>&1 || echo "${tool} is not installed. Install the ${tool} package."
      ;;
    *)
      echo "tool-report: unknown tool '${tool}'." >&2
      return 2
      ;;
  esac
}

# The installed version against the push gate's recorded one; one line when
# they differ, nothing when they match or nothing is recorded. Kept apart from
# _tool_report_check, which answers only whether a tool is usable here: a
# workstation's operating-system packages are its own, so a different version
# is worth knowing and never a reason to reinstall.
_tool_report_version_note() {
  local tool="$1" root="$2" workflow="$2/.github/workflows/ci.yml" key pin have
  case "$tool" in sqlite3|ffmpeg|jq|age) ;; *) return 0 ;; esac
  command -v "$tool" >/dev/null 2>&1 || return 0
  key="TOOL_$(printf '%s' "$tool" | tr 'a-z' 'A-Z')_VERSION"
  pin="$(_tool_report_pin "$key" "$workflow")"
  [ -n "$pin" ] || return 0
  case "$tool" in
    sqlite3) have="$(sqlite3 --version 2>/dev/null | cut -d' ' -f1)" ;;
    ffmpeg)  have="$(ffmpeg -version 2>/dev/null | sed -n '1s/^ffmpeg version \([0-9][0-9.]*\).*/\1/p')" ;;
    jq)      have="$(jq --version 2>/dev/null | sed 's/^jq-//')" ;;
    age)     have="$(age --version 2>/dev/null | sed 's/^v//')" ;;
  esac
  case "$have" in
    "$pin"|"$pin".*) ;;
    *) echo "${tool} ${have:-of unknown version} is installed; the push gate runs ${pin} (${key} in the CI workflow). Output formats can differ between versions, so a suite can pass here and fail there." ;;
  esac
}

# Prints a heading, every problem found, and a one-line total. Always returns 0:
# the report informs, it does not gate. A version other than the push gate's is
# a note, not a problem.
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
    while IFS= read -r line; do
      if [ -n "$line" ]; then echo "  [note] ${line}"; fi
    done < <(_tool_report_version_note "$tool" "$root")
  done
  if [ "$problems" -eq 0 ]; then
    echo "  all ${#} tools present"
  else
    echo "  ${problems} tool problem(s) above; the gates that need them will skip or fail."
    echo "  bash scripts/setup-dev-workstation.sh installs them at the pinned versions."
  fi
  return 0
}

# For CI. Fails only when a tool is missing, because a suite then skips cases
# the runner is meant to execute. A version other than the recorded one is a
# GitHub warning annotation, never a failure: the runner image moves on its own
# schedule, and when to follow it is the maintainer's call.
tool_report_require() {
  local root missing="" t line
  root="$(_tool_report_root)"
  for t in "$@"; do
    line="$(_tool_report_check "$t" "$root")"
    if [ -n "$line" ]; then missing="${missing}${line}"$'\n'; fi
    line="$(_tool_report_version_note "$t" "$root")"
    if [ -n "$line" ]; then echo "::warning title=Tool version::${line}"; fi
  done
  if [ -n "$missing" ]; then
    printf '%s' "$missing" | sed 's/^/  [missing] /' >&2
    return 1
  fi
  echo "  ${#} tools present"
}
