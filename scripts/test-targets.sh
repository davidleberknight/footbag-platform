#!/usr/bin/env bash
# test-targets.sh
#
# Prints the smallest set of checks that verifies a change: the changed files'
# own tests, the test files that name what changed, and the one extra check each
# kind of change needs that a targeted vitest run cannot see.
#
# WHY THIS EXISTS.
#
# The full gate takes many minutes over about 870 test files; the checks that
# prove a typical change take seconds. Picking them by judgment drifts both
# ways: too few misses a side effect, too many is the full suite run per change.
# This makes the choice one mechanical command whose output is the evidence.
#
# Vitest's import-graph targeting (`vitest related`, `--changed`) is not used:
# route suites boot the whole app, so the graph reaches almost every test file
# from almost any source file. Targeting is by naming convention and grep:
#
#   - Operator scripts: `x-y.sh` has the companion `xY.script.test.ts` (a few
#     keep the kebab form), and other suites that run it name `x-y.sh`.
#   - A shared shell library is reached through the scripts that source it, so
#     those scripts are mapped in turn (two hops).
#   - Services and controllers are mostly tested through route suites named by
#     kebab-case domain (`hofService` -> `hof-bap-index.routes.test.ts`); about
#     40% of services and nearly every controller are never named by a test.
#   - High-fan-out modules (the database layer, the schema, the app, routes,
#     middleware, env config, the shared factories and test database) reach most
#     of the suite and grep to hundreds of false hits on names like `db` and
#     `env`. They get their own suite plus the three app-wide sweeps as a canary,
#     and a note that the full gate is needed at the end of the session.
#
# WHAT IT REFUSES TO DO.
#
#   - Runs no test and changes nothing; it only prints.
#   - Never widens to the whole suite. A set over the budget is printed with a
#     note to re-target, and a module with no tests found says so.
#
# Usage:
#   bash scripts/test-targets.sh [path ...]
#
# With no paths it reads the working tree: `git diff --name-only HEAD` plus
# untracked files. Output lines:
#   VITEST: the one vitest command to run
#   CHECK:  each extra check, once
#   NOTE:   what the targeted set cannot prove, and why

set -euo pipefail

BUDGET=25
CANARY=(
  tests/integration/route-wiring.crawl.test.ts
  tests/integration/authorization-matrix.test.ts
  tests/integration/csrf.sweep.test.ts
)
CONFORMANCE_GLOBS=('template-*.test.ts' '*-conformance.test.ts')

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  -*) echo "test-targets.sh: unknown option '$1'" >&2; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PATHS=()
if [ "$#" -gt 0 ]; then
  for p in "$@"; do PATHS+=("${p#./}"); done
else
  mapfile -t PATHS < <(
    { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u
  )
fi

TESTS=()
CHECKS=()
NOTES=()

add_check() {
  local c
  for c in "${CHECKS[@]+"${CHECKS[@]}"}"; do [ "$c" = "$1" ] && return 0; done
  CHECKS+=("$1")
}
note() { NOTES+=("$1"); }

# A vitest target: an existing unit or integration *.test.ts. The browser, smoke
# and dev tiers need their own stack or environment and are not targeted runs.
add_test() {
  case "$1" in
    tests/e2e/*|tests/smoke/*|tests/dev/*) return 0 ;;
    *.test.ts) [ -f "$1" ] && TESTS+=("$1") ;;
  esac
  return 0
}

# Test files that name $1 as a whole word (fixed string).
naming() {
  grep -rlwF --include='*.test.ts' -- "$1" tests/unit tests/integration 2>/dev/null || true
}

# Test files whose name matches the glob $1.
named_like() {
  find tests/unit tests/integration -name "$1" -type f 2>/dev/null || true
}

# Suites named for a kebab-case domain ($1, matching the glob $1$2), leaving out
# those that belong to a longer sibling domain in the same source directory ($3):
# `admin-club*` must not pull in the suites of `adminClubCleanupController`.
domain_suites() {
  local domain="$1" suffix="$2" dir="$3" sibling longer=() f skip
  for sibling in "$dir"/*.ts; do
    sibling="$(basename "${sibling%.ts}")"
    sibling="$(kebab "${sibling%Controller}")"
    sibling="${sibling%-service}"
    case "$sibling" in "$domain"-*) longer+=("$sibling") ;; esac
  done
  while IFS= read -r f; do
    skip=0
    for sibling in "${longer[@]+"${longer[@]}"}"; do
      case "$(basename "$f")" in "$sibling"*) skip=1 ;; esac
    done
    [ "$skip" -eq 0 ] && printf '%s\n' "$f"
  done < <(named_like "${domain}${suffix}")
}

kebab() { printf '%s' "$1" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]'; }

camel() {
  local IFS=- out part first
  read -ra parts <<<"$1"
  out="${parts[0]}"
  for part in "${parts[@]:1}"; do
    first="$(printf '%s' "${part:0:1}" | tr '[:lower:]' '[:upper:]')"
    out="${out}${first}${part:1}"
  done
  printf '%s' "$out"
}

# Collect the output of a command as test targets; true when any were found.
collect() {
  local f found=1
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    add_test "$f"
    found=0
  done < <("$@")
  return "$found"
}

script_tests() {
  local base="$1" stem
  stem="${base%.sh}"
  named_like "$(camel "$stem").script.test.ts"
  named_like "${stem}.script.test.ts"
  naming "$base"
}

high_fan_out() {
  local p="$1" stem
  stem="$(basename "${p%.*}")"
  collect named_like "${stem}.test.ts" || true
  for f in "${CANARY[@]}"; do add_test "$f"; done
  note "$p is high fan-out; the full gate is needed at session end"
}

no_tests() { note "no tests found for $1; name its suites by hand"; }

map_path() {
  local p="$1" base stem domain users

  base="$(basename "$p")"
  stem="${base%.*}"

  case "$p" in
    src/db/*|database/*|src/app.ts|src/routes/*|src/middleware/*|src/config/env.ts|\
    src/services/serviceErrors.ts|src/testkit/*|tests/fixtures/factories.ts|\
    tests/fixtures/testDb.ts|tests/setup-env.ts|tests/global-setup.ts|vitest*.config.ts|\
    package.json|package-lock.json|tsconfig*.json)
      add_check "npm run build"
      high_fan_out "$p"
      return ;;
  esac

  case "$p" in
    .claude/*|CLAUDE.md|*/CLAUDE.md)
      add_check "bash scripts/ci/assert_claude_harness.sh"
      add_check "bash scripts/ci/test_hooks.sh"
      return ;;
    docs/*|*.md)
      note "$p: verify by re-reading"
      return ;;
    curated/*)
      add_check "bash scripts/ci/assert_generated_content_current.sh"
      return ;;
    .github/*)
      add_check "bash scripts/ci/check_ci_parity.sh"
      note "$p runs in CI on push"
      return ;;
    tests/e2e/*|tests/smoke/*|tests/dev/*)
      note "$p is checked only by the full gate"
      return ;;
    legacy_data/*|freestyle/*|*.py)
      collect naming "$base" || true
      note "$p: the Python suites and database guards run only in the full gate"
      return ;;
    terraform/*)
      collect naming "$p" || true
      note "$p: terraform validation runs only in the full gate"
      return ;;
    tests/*.test.ts|tests/*/*.test.ts|tests/*/*/*.test.ts)
      add_test "$p"
      add_check "npm run typecheck:tests"
      return ;;
    tests/*)
      collect naming "$stem" || no_tests "$p"
      return ;;
    scripts/lib/*.sh)
      add_check "bash scripts/ci/assert_conventions.sh"
      collect naming "$base" || true
      mapfile -t users < <(grep -rlF --include='*.sh' -- "lib/$base" scripts 2>/dev/null | grep -v "^$p\$" || true)
      if [ "${#users[@]}" -gt 10 ]; then
        note "$p is sourced by ${#users[@]} scripts (high fan-out); the full gate is needed at session end"
      else
        local u
        for u in "${users[@]+"${users[@]}"}"; do collect script_tests "$(basename "$u")" || true; done
      fi
      return ;;
    scripts/ci/*)
      add_check "bash scripts/ci/assert_conventions.sh"
      collect naming "$base" || note "$p is checked only by the full gate"
      return ;;
    scripts/*.sh|run_all_tests.sh|run_dev.sh|*.sh)
      add_check "bash scripts/ci/assert_conventions.sh"
      collect script_tests "$base" || no_tests "$p"
      return ;;
    scripts/*)
      add_check "bash scripts/ci/assert_conventions.sh"
      collect naming "$base" || collect naming "$stem" || no_tests "$p"
      return ;;
    src/views/*|*.css)
      # A page template maps to the domain suite named for it, else the
      # domain's own route suite; a partial or layout to the suites naming it
      # and the route crawl, which renders every reachable page.
      domain="$(printf '%s' "$p" | sed -nE 's#^src/views/([^/]+)/.*#\1#p')"
      case "$domain" in
        partials|layouts)
          collect naming "$stem" || true
          add_test "${CANARY[0]}" ;;
        ?*)
          collect named_like "${domain}*${stem}*.test.ts" \
            || collect named_like "${domain}.routes.test.ts" \
            || no_tests "$p" ;;
      esac
      for g in "${CONFORMANCE_GLOBS[@]}"; do
        collect find tests/unit -maxdepth 1 -name "$g" -type f || true
      done
      return ;;
    src/services/*.ts)
      add_check "npm run build"; add_check "npm run typecheck:tests"
      domain="$(kebab "${stem%Service}")"
      collect naming "$stem" || true
      local before="${#TESTS[@]}"
      collect naming "$stem" || true
      [ -n "$domain" ] && { collect domain_suites "$domain" '*.test.ts' src/services || true; }
      [ "${#TESTS[@]}" -gt "$before" ] || no_tests "$p"
      return ;;
    src/controllers/*.ts)
      add_check "npm run build"; add_check "npm run typecheck:tests"
      domain="$(kebab "${stem%Controller}")"
      local before="${#TESTS[@]}"
      collect naming "$stem" || true
      [ -n "$domain" ] && { collect domain_suites "$domain" '*.routes.test.ts' src/controllers || true; }
      [ "${#TESTS[@]}" -gt "$before" ] || no_tests "$p"
      return ;;
    src/*.ts|src/*/*.ts|src/*/*/*.ts)
      add_check "npm run build"; add_check "npm run typecheck:tests"
      collect naming "$stem" || no_tests "$p"
      return ;;
  esac

  no_tests "$p"
}

if [ "${#PATHS[@]}" -eq 0 ]; then
  echo "NOTE: no changed paths"
  exit 0
fi

for p in "${PATHS[@]}"; do
  [ -n "$p" ] && map_path "$p"
done

if [ "${#TESTS[@]}" -gt 0 ]; then
  mapfile -t TESTS < <(printf '%s\n' "${TESTS[@]}" | sort -u)
  echo "VITEST: npx vitest run --reporter=dot ${TESTS[*]}"
  if [ "${#TESTS[@]}" -gt "$BUDGET" ]; then
    note "over budget (${#TESTS[@]} files, budget $BUDGET); re-target to the suites of the changed behaviour"
  fi
fi
for c in "${CHECKS[@]+"${CHECKS[@]}"}"; do echo "CHECK: $c"; done
for n in "${NOTES[@]+"${NOTES[@]}"}"; do echo "NOTE: $n"; done
exit 0
