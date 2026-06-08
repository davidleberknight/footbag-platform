#!/usr/bin/env bash
# Convention gate (delegated from assert_conventions.sh): every GitHub Actions
# `uses:` reference is pinned to a 40-character commit SHA, never a mutable tag
# or branch. A force-pushed tag could otherwise swap the code CI executes. Local
# composite actions (./...) and digest-pinned container actions (docker://...)
# are exempt by form. A trailing `# vN` tag comment after the SHA is allowed.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

shopt -s nullglob
violations=""
for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
  while IFS= read -r line; do
    # Strip everything up to and including `uses:`, then a trailing # comment,
    # then surrounding quotes/whitespace, leaving the bare action reference.
    ref=$(printf '%s\n' "$line" | sed -E "s/.*uses:[[:space:]]*//; s/[[:space:]]*#.*$//; s/^[\"']//; s/[\"']$//; s/[[:space:]]*$//")
    case "$ref" in
      ./*|docker://*|"") continue ;;
    esac
    after="${ref##*@}"
    if [ "$after" = "$ref" ]; then
      violations="${violations}${wf}: ${ref} (no @<sha>)\n"
    elif ! printf '%s' "$after" | grep -qE '^[0-9a-f]{40}$'; then
      violations="${violations}${wf}: ${ref} (ref after @ is not a 40-char SHA)\n"
    fi
  done < <(grep -E '^[[:space:]]*-?[[:space:]]*uses:[[:space:]]' "$wf" || true)
done

if [ -n "$violations" ]; then
  printf 'unpinned GitHub Actions:\n%b' "$violations" >&2
  echo "[action-pinning] FAIL: pin every Actions 'uses:' to a 40-char commit SHA (./local and docker:// exempt)" >&2
  exit 1
fi
echo "[action-pinning] pass"
