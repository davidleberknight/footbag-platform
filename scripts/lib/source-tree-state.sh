#!/usr/bin/env bash
# scripts/lib/source-tree-state.sh -- one fingerprint for "this exact tree".
#
# Sourced, never run. The local runner takes it at the start of a run and again
# at the end, and voids the verdict when the two differ, because gates that read
# different source together describe no single commit.
#
# Asked of git rather than of the filesystem, and by content rather than by
# modification time: it covers the commit, every tracked change against it, and
# the content of every untracked file git does not ignore. Build output and
# anything else ignored is excluded, so a gate writing into dist/ or a coverage
# directory does not change it.

# source_tree_state [dir]
# Prints the fingerprint of the tree at dir (default: the current directory).
source_tree_state() {
  local dir="${1:-.}"
  {
    git -C "$dir" rev-parse HEAD 2>/dev/null || echo "no-head"
    git -C "$dir" diff --binary HEAD 2>/dev/null || true
    (cd "$dir" && git ls-files --others --exclude-standard -z 2>/dev/null \
      | xargs -0 -r sha256sum 2>/dev/null) || true
  } | sha256sum | cut -d' ' -f1
}
