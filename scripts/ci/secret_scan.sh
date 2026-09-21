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
  # --redact -v, matching the flags the runner's action passes. Without them
  # this printed a count and nothing else: "leaks found: 13" tells the reader a
  # number and sends them to re-run the scanner by hand to learn which rule,
  # which file, which commit. The runner has said all of that on every run.
  # --redact keeps the matched value itself out of the output, which is what
  # makes printing the rest safe in a terminal and a log.
  native_args="detect --source . --config .gitleaks.toml --no-banner --redact -v"
  docker_args="detect --source /repo --config /repo/.gitleaks.toml --no-banner --redact -v"
fi

# The scanner version the runner installs, read from the workflow so there is
# one place it is written down.
#
# It has to be pinned on both sides, and pinning the action does not do it: the
# action pins the action, and the binary version is a default inside it. Nor is
# "latest" locally the same thing by another route. The rule set is whichever
# version runs, because .gitleaks.toml enables the defaults, so two versions are
# two different scanners. On 2026-09-20 the runner's 8.24.3 reported two
# findings in a test file that a workstation's 8.30.1 did not, and the first
# anybody knew of it was a red push.
#
# Same shape as the Node check in run_clean_room.sh: read the workflow, and
# refuse rather than guess if the value is not there.
PINNED_VERSION="$(grep -m1 'GITLEAKS_VERSION:' "$(dirname "$0")/../../.github/workflows/ci.yml" \
  | tr -d ' "' | cut -d: -f2)"
if [ -z "$PINNED_VERSION" ]; then
  echo "ERROR: no GITLEAKS_VERSION in .github/workflows/ci.yml, so the version the" >&2
  echo "       runner uses is unknown and this scan cannot claim to match it." >&2
  exit 1
fi

rc=0
native_version=""
if command -v gitleaks >/dev/null 2>&1; then
  native_version="$(gitleaks version 2>/dev/null | tr -d 'v[:space:]')"
fi

if [ -n "$native_version" ] && [ "$native_version" = "$PINNED_VERSION" ]; then
  echo "  gitleaks ${PINNED_VERSION} (native), matching the runner" >&2
  # shellcheck disable=SC2086
  gitleaks $native_args
  rc=$?
elif command -v docker >/dev/null 2>&1; then
  # An installed binary at the wrong version is worse than none: it answers
  # confidently with a different rule set. Say which one was skipped and why,
  # rather than quietly preferring the container.
  if [ -n "$native_version" ]; then
    echo "  gitleaks ${native_version} is installed; the runner uses ${PINNED_VERSION}." >&2
    echo "  Using the pinned container instead, so this scan means something." >&2
  fi
  echo "  gitleaks ${PINNED_VERSION} (container), matching the runner" >&2
  # shellcheck disable=SC2086
  docker run --rm -v "$PWD:/repo" -w /repo "zricethezav/gitleaks:v${PINNED_VERSION}" $docker_args
  rc=$?
elif [ -n "$native_version" ]; then
  echo "ERROR: gitleaks ${native_version} is installed but the runner uses ${PINNED_VERSION}," >&2
  echo "       and docker is not available to supply the pinned build. A scan at a" >&2
  echo "       different version is not the scan the push gate runs." >&2
  echo "       Install gitleaks ${PINNED_VERSION}, or start docker." >&2
  exit 1
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
