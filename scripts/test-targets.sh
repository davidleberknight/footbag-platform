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
#   - Browser specs and the legacy pytest files are targeted too, as CHECK
#     lines: a changed spec runs itself, a page object the specs naming it, a
#     page template the specs named for it, a legacy Python module the pytest
#     files naming it. A schema change that creates or drops a table reaches
#     every vitest, browser and pytest file naming that table, because a test
#     still naming a dropped table fails wherever it lives.
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
SPECS=()
PYTESTS=()
CHECKS=()
NOTES=()

add_check() {
  local c
  for c in "${CHECKS[@]+"${CHECKS[@]}"}"; do [ "$c" = "$1" ] && return 0; done
  CHECKS+=("$1")
}
note() { NOTES+=("$1"); }

# A vitest target: an existing unit or integration *.test.ts. The browser tier
# is targeted separately below; the smoke and dev tiers need a live environment
# or a real local member load and are not targeted runs.
add_test() {
  case "$1" in
    tests/e2e/*|tests/smoke/*|tests/dev/*) return 0 ;;
    *.test.ts) [ -f "$1" ] && TESTS+=("$1") ;;
  esac
  return 0
}

# A browser spec, run on its own through Playwright, which starts its own stack.
# The deployed-site checks point at a live environment and are never targeted.
add_spec() {
  case "$1" in
    tests/e2e/deployed/*) return 0 ;;
    tests/e2e/*.spec.ts) [ -f "$1" ] && SPECS+=("$1") ;;
  esac
  return 0
}

add_pytest() { [ -f "$1" ] && PYTESTS+=("$1"); return 0; }

# Browser specs and legacy pytest files that name $1 as a whole word.
specs_naming() {
  grep -rlwF --include='*.spec.ts' -- "$1" tests/e2e 2>/dev/null || true
}
pytests_naming() {
  grep -rlwF --include='test_*.py' -- "$1" legacy_data/tests legacy_data/legacy_mirror/tests 2>/dev/null || true
}


# Tables a working-tree change to the schema creates or drops. A dropped table
# breaks every test that still names it, in whichever tier that test lives, and
# none of those is reached by grepping for the schema file itself.
schema_tables_changed() {
  git diff HEAD -- "$1" 2>/dev/null \
    | grep -E '^[-+]CREATE TABLE' \
    | sed -E 's/^[-+]CREATE TABLE (IF NOT EXISTS )?([A-Za-z0-9_]+).*/\2/' \
    | sort -u || true
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

# Collect the output of a command as targets of one tier, through that tier's
# add function; true when any were found.
collect_with() {
  local adder="$1" f found=1
  shift
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    "$adder" "$f"
    found=0
  done < <("$@")
  return "$found"
}
collect() { collect_with add_test "$@"; }
collect_specs() { collect_with add_spec "$@"; }
collect_pytests() { collect_with add_pytest "$@"; }

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
      if [ "$p" = database/schema.sql ]; then
        local t
        while IFS= read -r t; do
          [ -n "$t" ] || continue
          collect naming "$t" || true
          collect_specs specs_naming "$t" || true
          collect_pytests pytests_naming "$t" || true
        done < <(schema_tables_changed "$p")
      fi
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
    tests/e2e/deployed/*|tests/smoke/*|tests/dev/*)
      note "$p is checked only by the full gate"
      return ;;
    tests/e2e/*.spec.ts)
      add_spec "$p"
      return ;;
    tests/e2e/*)
      # A page object or helper reaches the browser specs that import it.
      collect_specs specs_naming "$stem" || note "$p is checked only by the full gate"
      return ;;
    legacy_data/*|freestyle/*|*.py)
      collect naming "$base" || true
      case "$base" in
        test_*.py) add_pytest "$p" ;;
        *.py) collect_pytests pytests_naming "$stem" || true ;;
      esac
      note "$p: the whole Python suites and database guards run only in the full gate"
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
      # A browser spec named for the page drives the template a route suite
      # only renders: the wizard steps are the case this exists for.
      case "$base" in
        *.hbs) collect_specs find tests/e2e -maxdepth 1 -name "*${stem}*.spec.ts" -type f || true ;;
      esac
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
if [ "${#SPECS[@]}" -gt 0 ]; then
  mapfile -t SPECS < <(printf '%s\n' "${SPECS[@]}" | sort -u)
  add_check "npm run test:e2e -- ${SPECS[*]}"
fi
if [ "${#PYTESTS[@]}" -gt 0 ]; then
  mapfile -t PYTESTS < <(printf '%s\n' "${PYTESTS[@]}" | sort -u)
  # The legacy suites write bytecode and a cache beside the source unless both
  # are pointed away, the same as the full gate's own pytest invocation.
  if py="$(source scripts/lib/python-env.sh 2>/dev/null && footbag_python pipeline fail 2>/dev/null)"; then
    py="${py#"$REPO_ROOT"/}"
    add_check "PYTHONPYCACHEPREFIX=\"\${TMPDIR:-/tmp}/footbag-pytest-pycache\" $py -m pytest -q -p no:cacheprovider ${PYTESTS[*]}"
  else
    note "pytest files reached (${PYTESTS[*]}), but the legacy pipeline environment is missing; build it with: bash legacy_data/run_pipeline.sh venv"
  fi
fi
for c in "${CHECKS[@]+"${CHECKS[@]}"}"; do echo "CHECK: $c"; done
for n in "${NOTES[@]+"${NOTES[@]}"}"; do echo "NOTE: $n"; done
exit 0
