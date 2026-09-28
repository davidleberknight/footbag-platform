#!/usr/bin/env bash
#
# Whether node_modules holds exactly what package-lock.json pins.
#
# "node_modules exists" was the test, and it passes for a tree installed before
# a dependency was added or a version moved: the new package is simply missing,
# and the first sign is something failing to start far from the cause. npm keeps
# a record of what it installed in node_modules/.package-lock.json; comparing that
# with the lockfile, package by package, answers the question actually asked.
#
# Optional packages for other platforms are never installed, so an optional entry
# is only required when it is present.
#
# Usage, sourced:
#
#     source "${REPO_ROOT}/scripts/lib/npm-deps.sh"
#     npm_deps_current "$REPO_ROOT" || npm ci

npm_deps_current() {
  local root="$1"
  [[ -f "${root}/package-lock.json" && -f "${root}/node_modules/.package-lock.json" ]] || return 1
  node -e '
    const [lockPath, installedPath] = process.argv.slice(1);
    const want = require(lockPath).packages || {};
    const have = require(installedPath).packages || {};
    for (const [key, entry] of Object.entries(want)) {
      if (key === "" || entry.link) continue;
      const got = have[key];
      if (!got) { if (entry.optional) continue; process.exit(1); }
      if (got.version !== entry.version) process.exit(1);
    }
  ' "${root}/package-lock.json" "${root}/node_modules/.package-lock.json" 2>/dev/null
}
