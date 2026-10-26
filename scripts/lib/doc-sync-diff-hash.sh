#!/usr/bin/env bash
# Prints one hash of the working tree's non-documentation changes against HEAD.
#
# The per-change doc sync records this hash in a receipt when it has checked a
# change, and the Stop hook recomputes it to decide whether the change in front of
# it is the one that was checked. Both sides call this file, so they cannot drift
# into hashing different things. The docs tree and every markdown file (rules,
# skills, CLAUDE.md files) are left out: they are what a doc sync produces, and an
# approved doc edit must not make the check it came from look stale. Hook scripts
# and settings are code here, because a change to them can leave the harness guide
# describing behaviour the configuration no longer has.
#
# Untracked files count by name and content, because a new source file is a
# change like any other. Refuses nothing and changes nothing; prints the hash on
# stdout.
#
# Usage: bash scripts/lib/doc-sync-diff-hash.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SPECS=(-- . ':(exclude,glob)**/*.md' ':(exclude)docs')
EMPTY_TREE=4b825dc642cb6eb9a060e54bf8d69288fbee4904
BASE=HEAD
git rev-parse --verify -q HEAD >/dev/null || BASE=$EMPTY_TREE

{
  git diff "$BASE" --binary "${SPECS[@]}"
  untracked="$(git ls-files --others --exclude-standard "${SPECS[@]}")"
  if [ -n "$untracked" ]; then
    printf '%s\n' "$untracked"
    printf '%s\n' "$untracked" | git hash-object --stdin-paths
  fi
} | sha256sum | cut -d' ' -f1
