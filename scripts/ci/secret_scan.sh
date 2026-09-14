#!/usr/bin/env bash
# Secret scan. The single home for two things: how the scanner is found on this
# machine, and the two scopes the project scans at.
#
# Modes:
#   (default)  all of history, which is what the push gate and the full local
#              runner check, matching the job continuous integration runs.
#   --staged   only what is about to be committed, which is what the pre-commit
#              hook checks.
#
# Why the staged mode earns its place: it is the only point at which this problem
# can be prevented rather than recorded. Once a credential-shaped string sits in a
# pushed commit, the history-wide scan keeps reaching it on every run, and the
# protected branch is never rewritten, so the only remedy left is to record the
# finding as a known false positive. That is correct for a false positive and
# worthless for a real leak.
#
# Exit codes: 0 clean, 1 findings (or no scanner where one is required), 77
# skipped because no scanner is installed. The full runner reports 77 as SKIP;
# --skip-ok converts it to 0 for callers that have no SKIP concept. The warning
# prints either way, so a skip is never silent.
set -uo pipefail
cd "$(dirname "$0")/../.."

skip_ok=0
staged=0
for arg in "$@"; do
  case "$arg" in
    --skip-ok) skip_ok=1 ;;
    --staged) staged=1 ;;
  esac
done

if [ "$staged" -eq 1 ]; then
  native_args="git --staged --config .gitleaks.toml --no-banner"
  docker_args="git --staged --config /repo/.gitleaks.toml --no-banner"
else
  native_args="detect --source . --config .gitleaks.toml --no-banner"
  docker_args="detect --source /repo --config /repo/.gitleaks.toml --no-banner"
fi

rc=0
if command -v gitleaks >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  gitleaks $native_args
  rc=$?
elif command -v docker >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:latest $docker_args
  rc=$?
else
  # On the runner the scanner is always present, so its absence there is a broken
  # job rather than a machine without the tool, and must fail rather than skip.
  if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "ERROR: neither gitleaks nor docker is available, and the secret scan cannot be skipped here." >&2
    exit 1
  fi
  echo "  WARNING: secret scan SKIPPED — neither gitleaks nor docker is installed." >&2
  echo "  Install gitleaks, or start docker, to run the same scan the push gate runs." >&2
  [ "$skip_ok" -eq 1 ] && exit 0
  exit 77
fi

# The guidance belongs beside the check rather than in the hook, so the hook stays
# a one-line entry point and there is one place to correct if the advice changes.
if [ "$rc" -ne 0 ] && [ "$staged" -eq 1 ]; then
  echo >&2
  echo "COMMIT REFUSED: the secret scanner found something in the staged changes." >&2
  echo "If it is a genuine false positive, the allowlist file takes a per-finding" >&2
  echo "fingerprint entry; if it is real, remove the value rather than allowlisting" >&2
  echo "it. To commit anyway: git commit --no-verify" >&2
fi

exit $rc
