#!/usr/bin/env bash
# Secret scan. The single home for two things: how the scanner is found on this
# machine, and the two scopes the project scans at.
#
# Modes:
#   (default)  all of history, which is what the push gate and the full local
#              runner check, matching the job continuous integration runs; then
#              every uncommitted change a commit would carry, so the local run
#              judges the code on disk rather than only what is already committed.
#   --staged   only what is about to be committed, which is what the pre-commit
#              hook checks.
#
# Why the default mode scans the working tree too: the history scan reads commits
# only, so a credential in a modified or new file passed the full local run and
# was first seen by the push gate. The uncommitted set is tracked files changed
# since HEAD plus new files git does not ignore, the same set the clean room
# carries. Ignored trees (the mirror, dependencies, the virtualenv) are never
# committed, so they are left out rather than walked.
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

# --redact -v in both modes, matching the flags the runner's action passes.
# Without them a scan prints a count and nothing else: "leaks found: 2" tells
# the reader a number and sends them to re-run the scanner by hand to learn
# which rule, which file, which line. --redact keeps the matched value itself
# out of the output, which is what makes printing the rest safe in a terminal
# and a log.
if [ "$staged" -eq 1 ]; then
  native_args="git --staged --config .gitleaks.toml --no-banner --redact -v"
  docker_args="git --staged --config /repo/.gitleaks.toml --no-banner --redact -v"
else
  native_args="detect --source . --config .gitleaks.toml --no-banner --redact -v"
  docker_args="detect --source /repo --config /repo/.gitleaks.toml --no-banner --redact -v"
fi
# The working-tree pass scans a copy of the uncommitted set, run from inside it so
# reported paths are repository-relative and the path allowlist in .gitleaks.toml
# matches them as it does in history.
REPO_DIR="$PWD"
tree_native_args=(dir . --config "${REPO_DIR}/.gitleaks.toml" --gitleaks-ignore-path "${REPO_DIR}/.gitleaksignore" --no-banner --redact -v)
tree_docker_args=(dir . --config /repo/.gitleaks.toml --gitleaks-ignore-path /repo/.gitleaksignore --no-banner --redact -v)

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

# The container is pinned by digest as well as tag, because a tag can be moved.
# The digest belongs to one version, so a workflow pin bumped without it is
# refused rather than silently scanned with the old image.
IMAGE_VERSION="8.24.3"
IMAGE_DIGEST="sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055"

rc=0
native_version=""
if command -v gitleaks >/dev/null 2>&1; then
  native_version="$(gitleaks version 2>/dev/null | tr -d 'v[:space:]')"
fi
# Docker counts only when its daemon answers: an installed client with no running
# daemon cannot run the pinned container, so it is the same as no Docker here.
docker_ok=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker_ok=1
fi

scanner=""
if [ -n "$native_version" ] && [ "$native_version" = "$PINNED_VERSION" ]; then
  echo "  gitleaks ${PINNED_VERSION} (native), matching the runner" >&2
  scanner=native
  # shellcheck disable=SC2086
  gitleaks $native_args
  rc=$?
elif [ "$docker_ok" -eq 1 ]; then
  # An installed binary at the wrong version is worse than none: it answers
  # confidently with a different rule set. Say which one was skipped and why,
  # rather than quietly preferring the container.
  if [ -n "$native_version" ]; then
    echo "  gitleaks ${native_version} is installed; the runner uses ${PINNED_VERSION}." >&2
    echo "  Using the pinned container instead, so this scan means something." >&2
  fi
  if [ "$PINNED_VERSION" != "$IMAGE_VERSION" ]; then
    echo "ERROR: the workflow pins gitleaks ${PINNED_VERSION}, but this script's image digest is for ${IMAGE_VERSION}." >&2
    echo "       Update IMAGE_VERSION and IMAGE_DIGEST here to the new version's digest." >&2
    exit 1
  fi
  echo "  gitleaks ${PINNED_VERSION} (container), matching the runner" >&2
  scanner=docker
  # shellcheck disable=SC2086
  docker run --rm -v "$PWD:/repo" -w /repo "zricethezav/gitleaks:v${PINNED_VERSION}@${IMAGE_DIGEST}" $docker_args
  rc=$?
else
  # On the runner the scanner is always present, so its absence there is a broken
  # job rather than a machine without the tool, and must fail rather than skip.
  if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "ERROR: neither gitleaks ${PINNED_VERSION} nor a running docker is available, and the secret scan cannot be skipped here." >&2
    exit 1
  fi
  # On a workstation a scan at a different version is not the scan the push gate
  # runs, so it is not run; continuous integration runs the real one on every push.
  if [ -n "$native_version" ]; then
    echo "  WARNING: secret scan SKIPPED — gitleaks ${native_version} is installed, the runner uses ${PINNED_VERSION}, and docker is not running." >&2
  else
    echo "  WARNING: secret scan SKIPPED — neither gitleaks ${PINNED_VERSION} nor a running docker is available." >&2
  fi
  echo "  Install gitleaks ${PINNED_VERSION}, or start docker, to run the same scan the push gate runs." >&2
  [ "$skip_ok" -eq 1 ] && exit 0
  exit 77
fi

# The working-tree pass. A deleted file has nothing to scan and a symlink is not
# followed out of the tree, so only regular files are copied.
tree_rc=0
if [ "$staged" -eq 0 ]; then
  mapfile -t uncommitted < <(
    { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard; } | sort -u
  )
  if [ "${#uncommitted[@]}" -eq 0 ]; then
    echo "  working tree: no uncommitted changes to scan" >&2
  else
    SCAN_DIR="$(mktemp -d -t footbag-secret-scan-XXXXXX)"
    trap 'rm -rf "$SCAN_DIR"' EXIT INT TERM
    copied=0
    for f in "${uncommitted[@]}"; do
      if [ -f "$f" ] && [ ! -L "$f" ]; then
        mkdir -p "${SCAN_DIR}/$(dirname "$f")"
        cp "$f" "${SCAN_DIR}/${f}"
        copied=$((copied + 1))
      fi
    done
    echo "  working tree: scanning ${copied} uncommitted file(s)" >&2
    if [ "$copied" -gt 0 ]; then
      if [ "$scanner" = native ]; then
        (cd "$SCAN_DIR" && gitleaks "${tree_native_args[@]}")
        tree_rc=$?
      else
        docker run --rm -v "$SCAN_DIR:/scan:ro" -v "$PWD:/repo:ro" -w /scan \
          "zricethezav/gitleaks:v${PINNED_VERSION}@${IMAGE_DIGEST}" "${tree_docker_args[@]}"
        tree_rc=$?
      fi
    fi
  fi
  if [ "$tree_rc" -ne 0 ]; then
    echo >&2
    echo "SECRET SCAN FAILED on uncommitted changes: each finding above names its file," >&2
    echo "line and rule. Remove a real value. A synthetic AWS key id in a test is" >&2
    echo "allowed when its body spells FIXTURE or EXAMPLE." >&2
    [ "$rc" -eq 0 ] && rc=$tree_rc
  fi
fi

# The guidance belongs beside the check rather than in the hook, so the hook stays
# a one-line entry point and there is one place to correct if the advice changes.
if [ "$rc" -ne 0 ] && [ "$staged" -eq 1 ]; then
  echo >&2
  echo "COMMIT REFUSED: the secret scanner found something in the staged changes." >&2
  echo "Each finding above names its file, line and rule. A synthetic AWS key id in" >&2
  echo "a test is allowed when its body spells FIXTURE or EXAMPLE, so rename it that" >&2
  echo "way. Any other genuine false positive takes a per-finding fingerprint entry" >&2
  echo "in .gitleaksignore; if it is real, remove the value rather than allowlisting" >&2
  echo "it. To commit anyway: git commit --no-verify" >&2
fi

exit $rc
