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
#   - A page template is followed to the routes that render it (its render
#     call, the handler around that call, the route registered with the
#     handler), and every suite requesting one of those paths is selected:
#     route suites reach a page by its URL, rarely by its file name.
#   - High-fan-out modules (the database layer, the schema, the app, routes,
#     middleware, env config, the shared factories and test database) reach most
#     of the suite and grep to hundreds of false hits on names like `db` and
#     `env`. They get their own suite and the suites naming their repository
#     path (the schema parity checks name `database/schema.sql`), plus the three
#     app-wide sweeps as a canary, and a note that the full gate is needed at
#     the end of the session. The shared test-data builders are decided by
#     what changed: a working-tree change inside an exported builder reaches
#     every suite calling that builder by name, so a changed default is caught
#     before commit; a change no exported builder owns (an internal helper,
#     module-level state, an import), or a file with no diff to read, still
#     defers to the full gate.
#   - The database module is decided the same way, one level finer: it is a
#     flat list of statement groups, so a working-tree change inside named
#     statements reaches only the source files using those statements, and
#     those files are mapped in turn like any changed file. A change no
#     statement owns (the connection, the transaction helpers, an import,
#     module-level code, a removed or renamed group), a statement used from
#     another high-fan-out file, or a file with no diff to read, still gets
#     the canary sweeps and defers to the full gate.
#   - Browser specs and the legacy pytest files are targeted too, as CHECK
#     lines: a changed spec runs itself, a page object the specs naming it, a
#     page template the specs named for it, a legacy Python module the pytest
#     files naming it. A schema change that creates or drops a table reaches
#     every vitest, browser and pytest file naming that table, because a test
#     still naming a dropped table fails wherever it lives.
#   - The rendered-style check measures the page views a change can reach,
#     named in RENDERED_STYLE_VIEWS: a page template its own view, a partial
#     every page including it, a controller the pages it renders, a service
#     the pages its controllers render, any other module the pages it or a
#     renderer importing it renders. The stylesheet, a layout, or a partial
#     a layout includes reaches every page, so the whole site is measured.
#   - The conventions gate and the linter read the source, and the conventions
#     gate also the templates, the stylesheet and the tests, so a change to
#     any of them runs that check.
#
# WHAT IT REFUSES TO DO.
#
#   - Runs no test and changes nothing; it only prints.
#   - Never widens to the whole suite. A high-fan-out module gets its canary
#     sweeps and a full-gate note instead, and a module with no tests found
#     says so.
#   - Never trims the set. Every suite a change reaches is printed, however
#     many: dropping one is the false green this selection exists to prevent.
#
# Usage:
#   bash scripts/test-targets.sh [path ...]
#
# With no paths it reads the working tree: `git diff --name-only HEAD` plus
# untracked files. Output lines:
#   VITEST: the one vitest command to run
#   CHECK:  each extra check, once
#   NOTE:   what the targeted set cannot prove, and why; and how to run it

set -euo pipefail

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
RENDERED_STYLE=0
LAYOUT_VIEWS=()
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
    # The whole-site layout check has its own config, which the browser suite's
    # config ignores, so it is run through its own script.
    tests/e2e/rendered-style.spec.ts) [ -f "$1" ] && RENDERED_STYLE=1 ;;
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

# The URL paths of the routes that render the page template $1, one per line.
# The render call names the view; the nearest handler signature above it names
# the controller method; the route registered with that method names the path.
# A parameterized path is cut to its fixed prefix (`/freestyle/tricks/:slug`
# -> `/freestyle/tricks/`); a prefix of `/` alone would match every page and is
# dropped.
template_routes() {
  local view ctl var line method rfile rline from path router mount
  view="${1#src/views/}"; view="${view%.hbs}"
  while IFS= read -r ctl; do
    var="$(basename "${ctl%.ts}")"
    while IFS= read -r line; do
      # A handler is an object method, an arrow assigned to a name, or a
      # function declaration, whose first parameter is the request and whose
      # line opens its body; a call passing `req` on ends in `;` instead.
      method="$(head -n "$line" "$ctl" \
        | sed -nE 's/^[[:space:]]*(export[[:space:]]+)?(const[[:space:]]+)?(async[[:space:]]+)?(function[[:space:]]+)?([A-Za-z0-9_]+)[[:space:]]*(\(|[:=][[:space:]]*(async[[:space:]]*)?\()_?req\b.*\{[[:space:]]*$/\5/p' \
        | tail -n 1)"
      [ -n "$method" ] || continue
      while IFS=: read -r rfile rline; do
        from=$(( rline > 3 ? rline - 3 : 1 ))
        path="$(sed -n "${from},${rline}p" "$rfile" | grep -oE "['\"]/[^'\"]*['\"]" | tail -n 1 | tr -d "'\"")"
        [ -n "$path" ] || continue
        # A router mounted under a prefix (`app.use('/admin', adminRouter)`)
        # registers its paths relative to it.
        router="$(sed -nE 's/^export const ([A-Za-z0-9_]+)[[:space:]]*=[[:space:]]*Router\(.*/\1/p' "$rfile" | head -n 1)"
        mount=""
        if [ -n "$router" ]; then
          mount="$(sed -nE "s/.*app\.use\(['\"](\/[^'\"]*)['\"],[[:space:]]*${router}\b.*/\1/p" src/app.ts | head -n 1)"
        fi
        if [ -n "$mount" ] && [ "$mount" != "/" ]; then
          if [ "$path" = "/" ]; then path="$mount"; else path="${mount}${path}"; fi
        fi
        path="${path%%:*}"
        [ -n "$path" ] && [ "$path" != "/" ] && printf '%s\n' "$path"
      done < <(grep -nwE "${var}\.${method}" src/routes/*.ts 2>/dev/null | cut -d: -f1,2)
    done < <(grep -nE "render\(['\"]${view}['\"]" "$ctl" | cut -d: -f1)
  done < <(grep -lE "render\(['\"]${view}['\"]" src/controllers/*.ts 2>/dev/null)
}

# Suites that request the URL path $1 as a quoted string, optionally followed by
# a query string; a path ending in `/` is a parameterized route's prefix and
# needs at least one more character. Anchor links into the page from other
# pages (`#...`) render a different page and are not counted.
route_suites() {
  local re
  # Route paths carry letters, digits, `/`, `-`, `_` and `.`; only the dot is
  # special in a pattern.
  re="$(printf '%s' "$1" | sed 's/\./\\./g')"
  case "$1" in
    */) re="['\"\`]${re}[^'\"\`]" ;;
    *)  re="['\"\`]${re}['\"\`?]" ;;
  esac
  grep -rlE --include='*.test.ts' -- "$re" tests/unit tests/integration 2>/dev/null || true
}

# A page template's suites: those requesting a route that renders it.
page_suites() {
  local p="$1" route f found=1
  while IFS= read -r route; do
    [ -n "$route" ] || continue
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      add_test "$f"
      found=0
    done < <(route_suites "$route")
  done < <(template_routes "$p" | sort -u)
  return "$found"
}

# The rendered-style check measures page views by name: a template's path below
# src/views without its extension. Partials and layouts are not page views, and
# a name with no template is dropped rather than failing the check.
add_layout_view() {
  case "$1" in partials/*|layouts/*) return 0 ;; esac
  [ -f "src/views/$1.hbs" ] || return 0
  local v
  for v in "${LAYOUT_VIEWS[@]+"${LAYOUT_VIEWS[@]}"}"; do [ "$v" = "$1" ] && return 0; done
  LAYOUT_VIEWS+=("$1")
}

# Every page view a partial can change the layout of: the pages including it,
# and through each partial including it, theirs. A layout among them wraps every
# page, so the whole site is measured.
partial_layout_views() {
  local queue=("$1") seen=" " name f v
  while [ "${#queue[@]}" -gt 0 ]; do
    name="${queue[0]}"; queue=("${queue[@]:1}")
    case "$seen" in *" $name "*) continue ;; esac
    seen+="$name "
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      v="${f#src/views/}"; v="${v%.hbs}"
      case "$v" in
        layouts/*) RENDERED_STYLE=1; return 0 ;;
        partials/*) queue+=("${v#partials/}") ;;
        *) add_layout_view "$v" ;;
      esac
    done < <(grep -rlE "\{\{#?>[[:space:]]*${name}([^A-Za-z0-9_/-]|$)" src/views 2>/dev/null || true)
  done
}

# The page views a controller renders by a literal name: what it hands them can
# break their layout as surely as an edit to the template.
controller_layout_views() {
  local v
  while IFS= read -r v; do
    [ -n "$v" ] && add_layout_view "$v"
  done < <(grep -oE "render\(['\"][^'\"]+['\"]" "$1" 2>/dev/null | sed -E "s/^render\(['\"]//; s/['\"]$//" | sort -u)
}

# The page views a module outside the controllers and services can change: those
# it renders itself, and those rendered by any non-controller module importing
# it directly. The dev persona listing is rendered from the testkit and shows the
# persona catalog's own text, so a catalog edit can widen that page.
module_layout_views() {
  local stem f
  stem="$(basename "${1%.ts}")"
  controller_layout_views "$1"
  while IFS= read -r f; do
    [ -n "$f" ] && [ "$f" != "$1" ] || continue
    if grep -qE "from ['\"][./A-Za-z0-9_-]*/${stem}['\"]" "$f"; then controller_layout_views "$f"; fi
  done < <(grep -rlE "render\(['\"]" src --include='*.ts' 2>/dev/null | grep -v '^src/controllers/' || true)
}

# The page views a service feeds: those rendered by every controller importing
# it, directly or through other services importing it, and any it names as the
# template a controller should render.
service_layout_views() {
  local queue=("$(basename "${1%.ts}")") seen=" " stem f v
  while [ "${#queue[@]}" -gt 0 ]; do
    stem="${queue[0]}"; queue=("${queue[@]:1}")
    case "$seen" in *" $stem "*) continue ;; esac
    seen+="$stem "
    while IFS= read -r v; do
      [ -n "$v" ] && add_layout_view "$v"
    done < <(grep -oE "template:[[:space:]]*['\"][^'\"]+['\"]" "src/services/${stem}.ts" 2>/dev/null \
      | sed -E "s/^template:[[:space:]]*['\"]//; s/['\"]$//" | sort -u)
    while IFS= read -r f; do
      [ -n "$f" ] && controller_layout_views "$f"
    done < <(grep -lE "from ['\"][./]*services/${stem}['\"]" src/controllers/*.ts 2>/dev/null || true)
    while IFS= read -r f; do
      [ -n "$f" ] && queue+=("$(basename "${f%.ts}")")
    done < <(grep -lE "from ['\"]\./${stem}['\"]" src/services/*.ts 2>/dev/null || true)
  done
}

high_fan_out() {
  local p="$1" stem
  stem="$(basename "${p%.*}")"
  collect named_like "${stem}.test.ts" || true
  # The repository path is specific where the bare name is not: it reaches the
  # suites that read or guard this file without every suite that imports it.
  collect naming "$p" || true
  if [ "$p" = src/db/db.ts ]; then
    # The conventions gate holds the module's own rules: every statement is
    # compiled here and nowhere else, and none reads SQLite's clock directly.
    add_check "bash scripts/ci/assert_conventions.sh"
    db_statements "$p" && return 0
  fi
  for f in "${CANARY[@]}"; do add_test "$f"; done
  case "$p" in src/testkit/*) module_layout_views "$p" ;; esac
  case "$p" in
    src/testkit/*|tests/fixtures/factories.ts) test_data_builders "$p" && return 0 ;;
  esac
  note "$p is high fan-out; the full gate is needed at session end"
}

# The exported names a working-tree change to $1 touches, one per line, or `-`
# for a changed line no exported declaration owns. A line belongs to the
# nearest top-level declaration above it; a declaration added or removed by the
# change is named from the diff itself, so a deleted or renamed builder still
# reaches the suites calling its old name. Prints nothing with no diff to read.
exports_changed() {
  local p="$1" d hunk start count line i owner
  local decl_lines=() decl_names=()
  local decl_re='^(export )?(declare )?(async )?(function|interface|type|const|let|class|enum) '
  [ -f "$p" ] || return 0
  while IFS= read -r d; do
    decl_lines+=("${d%%:*}")
    case "${d#*:}" in
      export\ *) decl_names+=("$(printf '%s' "${d#*:}" | sed -E "s/${decl_re}([A-Za-z0-9_\$]+).*/\5/")") ;;
      *) decl_names+=("-") ;;
    esac
  done < <(grep -nE "$decl_re" "$p" || true)
  git diff -U0 HEAD -- "$p" 2>/dev/null \
    | grep -E "^[-+]export (declare )?(async )?(function|interface|type|const|let|class|enum) " \
    | sed -E 's/^[-+]export (declare )?(async )?(function|interface|type|const|let|class|enum) ([A-Za-z0-9_$]+).*/\4/' || true
  while IFS= read -r hunk; do
    start="${hunk%%,*}"
    count=1
    case "$hunk" in *,*) count="${hunk#*,}" ;; esac
    # A deletion-only hunk names the line just above the gap.
    [ "$count" -eq 0 ] && count=1
    for ((line = start; line < start + count; line++)); do
      owner="-"
      for ((i = 0; i < ${#decl_lines[@]}; i++)); do
        [ "${decl_lines[i]}" -le "$line" ] || break
        owner="${decl_names[i]}"
      done
      printf '%s\n' "$owner"
    done
  done < <(git diff -U0 HEAD -- "$p" 2>/dev/null | sed -nE 's/^@@ -[0-9,]+ \+([0-9]+(,[0-9]+)?) @@.*/\1/p')
}

# Selects the suites calling each exported builder a change to the test-data
# file $1 touches. Succeeds only when every changed line belongs to one: then
# those suites are everything the change can reach, and the full gate is not
# needed for it.
test_data_builders() {
  local p="$1" name pinned=() unpinned=0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if [ "$name" = "-" ]; then unpinned=1; else pinned+=("$name"); fi
  done < <(exports_changed "$p" | sort -u)
  for name in "${pinned[@]+"${pinned[@]}"}"; do collect naming "$name" || true; done
  [ "${#pinned[@]}" -gt 0 ] && [ "$unpinned" -eq 0 ] || return 1
  note "$p: only exported builders changed (${pinned[*]}); the suites calling them are selected"
}

# The statements a working-tree change to the database module $1 touches, one
# per line: `group.member` for a line inside a statement group's member,
# `group` for the group's own opening lines or an exported function or type,
# or `-` for a changed line no statement owns. A line belongs to the nearest
# member or top-level declaration above it; a group closer ends ownership, so
# the comments and blank lines between groups belong to nothing and, being
# unable to change behaviour, are passed over. The connection and the
# transaction helpers are used by nearly every service, so a change to them is
# `-`. A group the change removes without adding back (removed or renamed) is
# `-` too: its users can no longer be named by the group's new name. A line
# passed over prints `.`, so a comment-only change is told apart from no diff
# at all, which prints nothing.
db_statements_changed() {
  local p="$1" d line text name group="" owner="-"
  local m_line=() m_owner=() m_group=()
  local infra='^(db|transaction|rehearse|savepoint|inTransaction|checkpointAndCloseDatabase)$'
  local decl_re='^export (declare )?(async )?(function|interface|type|const|let|class|enum) ([A-Za-z0-9_$]+).*'
  local member_re='^  (get |async )?([A-Za-z0-9_$]+)[[:space:]]*(\(|:).*'
  [ -f "$p" ] || return 0
  # Owner markers, ascending: each sets the owner from its line onward.
  while IFS= read -r d; do
    line="${d%%:*}"; text="${d#*:}"
    case "$text" in
      ' '*)
        # Matched in the shell: a module of over a thousand statements makes a
        # process per line the slowest part of the run.
        [ -n "$group" ] && [[ "$text" =~ $member_re ]] || continue
        owner="${group}.${BASH_REMATCH[2]}" ;;
      '}'|'};'|'`'|'`;'|')'|');')
        # The closing line still belongs to what it closes.
        group=""; owner="-"; line=$((line + 1)) ;;
      ')'*|'} {'*)
        # A multi-line signature continues the declaration above.
        continue ;;
      'export const '*' = {')
        group="${text#export const }"; group="${group%% *}"
        owner="$group" ;;
      export\ *)
        group=""; owner="-"
        [[ "$text" =~ $decl_re ]] && owner="${BASH_REMATCH[4]}"
        [[ "$owner" =~ $infra ]] && owner="-" ;;
      *) group=""; owner="-" ;;
    esac
    m_line+=("$line"); m_owner+=("$owner"); m_group+=("$group")
  done < <(grep -nE "^[^[:space:]/*]|${member_re}" "$p" || true)

  local i=0 cur="-" curg="" in_hunk=0 start=0 pos sign removed=() added=()
  while IFS= read -r d; do
    if [[ "$d" =~ ^@@\ -[0-9,]+\ \+([0-9]+) ]]; then
      in_hunk=1; start="${BASH_REMATCH[1]}"; pos="$start"
      continue
    fi
    [ "$in_hunk" -eq 1 ] || continue
    sign="${d:0:1}"; text="${d:1}"
    case "$sign" in
      +) line="$pos"; pos=$((pos + 1)) ;;
      # A removed line sits where its hunk does: just above the gap it leaves.
      -) line="$start" ;;
      *) continue ;;
    esac
    while [ "$i" -lt "${#m_line[@]}" ] && [ "${m_line[i]}" -le "$line" ]; do
      cur="${m_owner[i]}"; curg="${m_group[i]}"; i=$((i + 1))
    done
    case "$text" in
      'export const '*' = {')
        name="$(printf '%s' "$text" | sed -E 's/^export const ([A-Za-z0-9_$]+) = \{$/\1/')"
        if [ "$sign" = + ]; then added+=("$name"); printf '%s\n' "$name"; else removed+=("$name"); fi
        continue ;;
      export\ *)
        name="$(printf '%s' "$text" | sed -E "s/${decl_re}/\4/")"
        if [[ "$name" =~ $infra ]]; then printf -- '-\n'; else printf '%s\n' "$name"; fi
        continue ;;
    esac
    # A comment or blank line at the top or member level changes nothing a
    # test could see; statement bodies are indented deeper, so a SQL line
    # opening with `*` is never mistaken for one.
    if [[ "$text" =~ ^[[:space:]]{0,3}(//|/\*|\*|$) ]]; then printf '.\n'; continue; fi
    if [ "$sign" = - ] && [ -n "$curg" ] && [[ "$text" =~ $member_re ]]; then
      # A removed member is named from the diff, so its users are still found.
      printf '%s.%s\n' "$curg" "${BASH_REMATCH[2]}"
    elif [[ "$text" =~ ^[^[:space:]] ]] && ! [[ "$text" =~ ^(\}|\`|\)) ]]; then
      # Any other top-level line: an import, module-level code, a private helper.
      printf -- '-\n'
    else
      printf '%s\n' "$cur"
    fi
  done < <(git diff -U0 HEAD -- "$p" 2>/dev/null || true)

  for name in "${removed[@]+"${removed[@]}"}"; do
    [[ " ${added[*]+"${added[*]}"} " == *" $name "* ]] || printf -- '-\n'
  done
}

# Source files under $2 naming the statement $1 (`group.member` or `group`):
# for a member, those naming both the member and its group as words, which
# matches dotted use and destructuring alike.
statement_users() {
  local group="${1%%.*}" member="${1#*.}" f
  grep -rlwF --include='*.ts' -- "$member" "${@:2}" 2>/dev/null \
    | grep -vx 'src/db/db.ts' \
    | while IFS= read -r f; do grep -qwF -- "$group" "$f" && printf '%s\n' "$f"; done || true
}

# Selects the suites of every source file using a statement a change to the
# database module $1 touches, mapped as though that file had changed. Succeeds
# only when every changed line belongs to a statement or is passed over, and no
# user is itself a high-fan-out file: then those suites are everything the
# change can reach. Otherwise the suites found are still selected, and the
# caller defers the rest to the full gate.
db_statements() {
  local p="$1" token u pinned=() users=() unpinned=0 passed=0
  while IFS= read -r token; do
    case "$token" in
      '') ;;
      -) unpinned=1 ;;
      .) passed=1 ;;
      *) pinned+=("$token") ;;
    esac
  done < <(db_statements_changed "$p" | sort -u)
  for token in "${pinned[@]+"${pinned[@]}"}"; do
    mapfile -t users < <(statement_users "$token" src)
    [ "${#users[@]}" -gt 0 ] || note "$p: $token has no user in src/"
    for u in "${users[@]+"${users[@]}"}"; do
      # A high-fan-out user is reached by most of the suite in turn.
      if is_high_fan_out "$u"; then unpinned=1; else map_path "$u"; fi
    done
    # A suite may prepare against a statement directly rather than through
    # the service using it.
    collect statement_users "$token" tests/unit tests/integration || true
  done
  [ "$unpinned" -eq 0 ] || return 1
  if [ "${#pinned[@]}" -gt 0 ]; then
    note "$p: only these statements changed (${pinned[*]}); the suites of the files using them are selected"
  elif [ "$passed" -eq 1 ]; then
    note "$p: only comments or blank lines changed"
  else
    return 1
  fi
}

no_tests() { note "no tests found for $1; name its suites by hand"; }

# The modules most of the suite depends on: the database layer, the schema, the
# app, routes, middleware, env config, the shared factories and test database.
is_high_fan_out() {
  case "$1" in
    src/db/*|database/*|src/app.ts|src/routes/*|src/middleware/*|src/config/env.ts|\
    src/services/serviceErrors.ts|src/testkit/*|tests/fixtures/factories.ts|\
    tests/fixtures/testDb.ts|tests/setup-env.ts|tests/global-setup.ts|vitest*.config.ts|\
    package.json|package-lock.json|tsconfig*.json) return 0 ;;
  esac
  return 1
}

map_path() {
  local p="$1" base stem domain users

  base="$(basename "$p")"
  stem="${base%.*}"

  # Documents first: a README or CLAUDE.md inside a high-fan-out directory is
  # still a document, not code the whole suite depends on.
  case "$p" in
    .claude/*|CLAUDE.md|*/CLAUDE.md)
      add_check "bash scripts/ci/assert_claude_harness.sh"
      add_check "bash scripts/ci/test_hooks.sh"
      return ;;
    docs/*|*.md)
      note "$p: verify by re-reading"
      return ;;
  esac

  # The conventions gate reads the templates, the stylesheet, the source and the
  # tests, and the linter reads the source, so a change to any of them is in
  # their reach whatever else it maps to.
  case "$p" in
    src/*|tests/*) add_check "bash scripts/ci/assert_conventions.sh" ;;
  esac
  case "$p" in
    src/*.ts|src/*.js) add_check "npm run lint" ;;
  esac

  if is_high_fan_out "$p"; then
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
    return
  fi

  case "$p" in
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
        # A pipeline shell script is driven by the pytest files that name it,
        # as a module is by those importing it.
        *.py|*.sh) collect_pytests pytests_naming "$stem" || true ;;
      esac
      # The conventions gate scans the legacy shell tools for credential
      # handling and the legacy test suites for committed skips.
      case "$p" in
        legacy_data/scripts/*.sh|legacy_data/tools/*.sh|\
        legacy_data/tests/*.py|legacy_data/legacy_mirror/tests/*.py)
          add_check "bash scripts/ci/assert_conventions.sh" ;;
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
      # The runner, the deploy entry point and the pipeline driver source the
      # shared libraries from outside scripts/ too. The legacy tree is searched
      # two levels deep only: below that sits the site mirror.
      mapfile -t users < <(
        { grep -rlF --include='*.sh' -- "lib/$base" scripts 2>/dev/null
          grep -lF -- "lib/$base" ./*.sh legacy_data/*.sh legacy_data/*/*.sh 2>/dev/null
        } | sed 's#^\./##' | grep -v "^$p\$" || true
      )
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
      # A page template maps to every suite requesting a route that renders
      # it, plus the domain suite named for it, else the domain's own route
      # suite; a partial or layout to the suites naming it and the route crawl,
      # which renders every reachable page.
      domain="$(printf '%s' "$p" | sed -nE 's#^src/views/([^/]+)/.*#\1#p')"
      case "$domain" in
        partials|layouts)
          collect naming "$stem" || true
          add_test "${CANARY[0]}"
          if [ "$domain" = layouts ]; then
            RENDERED_STYLE=1
          else
            local partial="${p#src/views/partials/}"
            partial_layout_views "${partial%.hbs}"
          fi ;;
        ?*)
          local view="${p#src/views/}"
          add_layout_view "${view%.hbs}"
          local named=0 routed=0
          if collect named_like "${domain}*${stem}*.test.ts" \
            || collect named_like "${domain}.routes.test.ts"; then
            named=1
          fi
          # A suite reading the template file itself names it by file name.
          if collect naming "$base"; then named=1; fi
          if page_suites "$p"; then routed=1; fi
          if [ "$routed" -eq 0 ]; then
            note "$p: no route found that renders it; suites chosen by file name only"
            if [ "$named" -eq 0 ]; then no_tests "$p"; fi
          fi ;;
        # A stylesheet: the asset, header and policy suites name it by file,
        # and every page it styles is measured.
        *) collect naming "$base" || true
           RENDERED_STYLE=1 ;;
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
    src/public/*)
      # A browser script or static asset is reached by the suites naming its
      # file; route suites request it by URL, which carries the same name.
      collect naming "$base" || no_tests "$p"
      return ;;
    src/services/*.ts)
      add_check "npm run build"; add_check "npm run typecheck:tests"
      domain="$(kebab "${stem%Service}")"
      local before="${#TESTS[@]}"
      collect naming "$stem" || true
      [ -n "$domain" ] && { collect domain_suites "$domain" '*.test.ts' src/services || true; }
      [ "${#TESTS[@]}" -gt "$before" ] || no_tests "$p"
      service_layout_views "$p"
      return ;;
    src/controllers/*.ts)
      add_check "npm run build"; add_check "npm run typecheck:tests"
      domain="$(kebab "${stem%Controller}")"
      local before="${#TESTS[@]}"
      collect naming "$stem" || true
      [ -n "$domain" ] && { collect domain_suites "$domain" '*.routes.test.ts' src/controllers || true; }
      [ "${#TESTS[@]}" -gt "$before" ] || no_tests "$p"
      controller_layout_views "$p"
      return ;;
    src/*.ts|src/*/*.ts|src/*/*/*.ts)
      add_check "npm run build"; add_check "npm run typecheck:tests"
      collect naming "$stem" || no_tests "$p"
      module_layout_views "$p"
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
fi
if [ "${#SPECS[@]}" -gt 0 ]; then
  mapfile -t SPECS < <(printf '%s\n' "${SPECS[@]}" | sort -u)
  add_check "npm run test:e2e -- ${SPECS[*]}"
fi
# The layout check measures exactly the page views a change can reach: the whole
# site for the stylesheet, a layout or the check itself, otherwise only the named
# views, which costs one page per view rather than every view on the site.
if [ "$RENDERED_STYLE" -eq 1 ]; then
  add_check "npm run test:rendered-style"
elif [ "${#LAYOUT_VIEWS[@]}" -gt 0 ]; then
  add_check "RENDERED_STYLE_VIEWS=$(printf '%s\n' "${LAYOUT_VIEWS[@]}" | sort -u | paste -sd, -) npm run test:rendered-style"
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
# A targeted run takes a minute or more; in the foreground it blocks every other
# piece of work until it ends.
if [ "${#TESTS[@]}" -gt 0 ] || [ "${#CHECKS[@]}" -gt 0 ]; then
  echo "NOTE: run every VITEST and CHECK command in the background with its output in the scratchpad, and keep working until it finishes"
fi
for n in "${NOTES[@]+"${NOTES[@]}"}"; do echo "NOTE: $n"; done
exit 0
