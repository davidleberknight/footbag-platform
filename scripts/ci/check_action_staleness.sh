#!/usr/bin/env bash
# Reports any GitHub Action pinned in the workflows that has fallen behind its
# newest published release. It only reports: nothing here edits a workflow, and
# the bump stays a reviewed human change.
#
# This fills the one gap no scanner covers. A vulnerable dependency raises a
# security advisory, and the dependency audit and the pull-request dependency
# review both catch that. An action that has merely aged out raises no advisory
# at all, so when the platform withdraws the runtime it executes on, the only
# warning anyone gets is a deprecation annotation on a run page that a person
# has to happen to read. This is the check that reads it for them.
#
# Deliberately not part of the offline convention gate: it calls the GitHub API,
# and a network hiccup or a rate limit must never fail an ordinary build. It
# runs on its own schedule and by hand.
#
# Usage:
#   bash scripts/ci/check_action_staleness.sh
#
# Needs an authenticated `gh` (a workstation login, or GH_TOKEN in a workflow).
# Exit 0 when every pin is current or undeterminable, 1 when any pin is behind.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "[action-staleness] SKIP: gh is not installed; cannot query release data" >&2
  exit 0
fi

shopt -s nullglob

# Collect one entry per action repository. A repository can appear many times
# and under sub-paths (the CodeQL init and analyze steps share one repository),
# so reduce to the distinct owner/repo plus the SHA it is pinned at.
pins=""
for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
  while IFS= read -r line; do
    ref=$(printf '%s\n' "$line" | sed -E "s/.*uses:[[:space:]]*//; s/[[:space:]]*#.*$//; s/^[\"']//; s/[\"']$//; s/[[:space:]]*$//")
    case "$ref" in
      ./*|docker://*|"") continue ;;
    esac
    sha="${ref##*@}"
    printf '%s' "$sha" | grep -qE '^[0-9a-f]{40}$' || continue
    action="${ref%@*}"
    repo=$(printf '%s' "$action" | cut -d/ -f1,2)
    pins="${pins}${repo} ${sha}"$'\n'
  done < <(grep -E '^[[:space:]]*-?[[:space:]]*uses:[[:space:]]' "$wf" || true)
done

stale=""
checked=0
undeterminable=""

while IFS=' ' read -r repo pinned; do
  [ -n "$repo" ] || continue
  checked=$((checked + 1))

  # Take the highest published release whose tag is a plain three-part version.
  # That filter is what keeps this honest across differently-shaped projects:
  # the CodeQL repository also publishes bundle releases whose tags track the
  # analysis engine rather than the action, and picking "latest" blindly would
  # report a current pin as behind on every run.
  latest=$(
    gh api "repos/${repo}/releases?per_page=100" \
      --jq '[.[] | select(.draft == false and .prerelease == false) | .tag_name | select(test("^v?[0-9]+\\.[0-9]+\\.[0-9]+$"))] | .[]' 2>/dev/null \
      | sed -E 's/^v//' | sort -V -r | head -1
  ) || latest=""

  if [ -z "$latest" ]; then
    undeterminable="${undeterminable}  ${repo} (no plain version releases found)"$'\n'
    continue
  fi

  latest_sha=$(gh api "repos/${repo}/commits/v${latest}" --jq '.sha' 2>/dev/null) \
    || latest_sha=$(gh api "repos/${repo}/commits/${latest}" --jq '.sha' 2>/dev/null) \
    || latest_sha=""

  if [ -z "$latest_sha" ]; then
    undeterminable="${undeterminable}  ${repo} (release v${latest} does not resolve to a commit)"$'\n'
    continue
  fi

  if [ "$latest_sha" != "$pinned" ]; then
    stale="${stale}  ${repo}"$'\n'"    pinned at ${pinned}"$'\n'"    current  ${latest_sha} (v${latest})"$'\n'
  fi
done < <(printf '%s' "$pins" | sort -u)

if [ -n "$undeterminable" ]; then
  printf '[action-staleness] could not determine the current release for:\n%s' "$undeterminable" >&2
fi

if [ -n "$stale" ]; then
  printf '[action-staleness] pinned actions behind their current release:\n%s' "$stale" >&2
  echo "[action-staleness] FAIL: bump these by hand in a reviewed pull request, then re-run" >&2
  exit 1
fi

echo "[action-staleness] pass (${checked} pinned actions, all current)"
