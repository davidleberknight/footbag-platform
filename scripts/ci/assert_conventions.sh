#!/usr/bin/env bash
# Convention gate: enforce design rules that have no compile-time check.
# Each rule below is followed at the marked adherence level on this commit;
# the gate prevents future regression. To diagnose locally:
#
#   bash scripts/ci/assert_conventions.sh
#
# A failure prints offending file:line. Fix by relocating the call to the
# canonical site named in each rule's heading below.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=0
skipped=""
skipped_count=0

# Which rule each violation belonged to.
#
# The gate runs sixty-five checks, prints a progress line for each, and keeps
# going after a violation so one run reports everything wrong rather than the
# first thing. The cost is that a failure early on is pushed out of the sixty-line
# tail the outer runners re-show, and the verdict at the end was a bare count: a
# reader was told that one rule was violated and never which, with the offending
# file:line thousands of lines up or gone with a deleted log.
#
# Every check passes through `check`, so that is where a violation is attributed:
# the count is compared against what it was when the previous check started, and
# any increase belonged to that check.
current_check=""
violations_at_check=0
failed_checks=()

attribute_violations() {
  if [ -n "$current_check" ] && [ "$violations" -gt "$violations_at_check" ]; then
    failed_checks+=("$current_check")
  fi
  current_check="${1:-}"
  violations_at_check="$violations"
}

# Announce a check, and say whether it can run at all.
#
# Every check names the paths it reads. Against this repository all of them
# exist, so every check runs. Against a minimal fixture repository, which is how
# the suite proves a rule red and green without ever planting a violation in the
# real tree, most of them have nothing to read. Three wrong answers to that were
# available, and this script gave all three. A
# pipeline with no `|| true` ended the entire run at the eighth check, so nothing
# past it was ever demonstrated. A `grep -q` against an absent file reported a
# FAIL for a file that was never there. And a recursive grep over a missing
# directory found nothing and reported a clean pass, which is the worst of the
# three, because a scope that has quietly shrunk to nothing is a check that
# stopped enforcing anything and says so in the same words it uses for success.
#
# So a check that cannot find what it scans says that it did not run. A skip is
# never free: unless the run declares itself a fixture tree, a skipped check
# fails the gate at the end. The default on a real checkout is therefore closed,
# and no continuous-integration configuration has to know this exists.
#
# The guarded bodies below are deliberately NOT indented. Fourteen of them embed
# a here-document whose terminator has to sit at column 0, so indenting the
# guarded region would mean indenting some bodies and not others; and
# re-indenting sixteen hundred lines would bury a two-line-per-check change in a
# diff where every line had moved.
check() {
  local name="$1"
  shift
  attribute_violations "$name"
  local missing=""
  local target
  for target in "$@"; do
    [ -e "$target" ] || missing="${missing} ${target}"
  done
  if [ -z "$missing" ]; then
    echo "[conventions] check: ${name}"
    return 0
  fi
  echo "[conventions] check: ${name} -- DID NOT RUN, no${missing}"
  skipped="${skipped}  ${name}: no${missing}\n"
  skipped_count=$((skipped_count + 1))
  return 1
}

# A delegated check lives in its own script so its own suite can run it inside a
# throwaway repository. Same contract as above: absent means it did not run.
delegate() {
  local name="$1"
  local script="$2"
  if check "${name} (delegated)" "${ROOT}/scripts/ci/${script}"; then
    if ! bash "${ROOT}/scripts/ci/${script}"; then
      violations=$((violations + 1))
    fi
  fi
}

# Rule: SQL compilation (.prepare) lives only in src/db/db.ts.
# Reason: All SQL compilation must live in src/db/db.ts as named prepared
# statements; services call those named statements, never compile SQL strings
# inline. Mechanical enforcement prevents business logic from
# leaking into raw SQL surfaces.
#
# Allowlisted exceptions:
#   - src/testkit/**         permanent test scaffolding (persona row builders); not a service
#   - src/dev-bootstrap/**   dev-only seed/override tooling; not a service
if check ".prepare( outside src/db/db.ts" src; then
hits=$(grep -rn --include='*.ts' '\.prepare(' src/ \
  | grep -v '^src/db/db\.ts:' \
  | grep -v '^src/testkit/' \
  | grep -v '^src/dev-bootstrap/' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: SQL compilation must live in src/db/db.ts" >&2
  violations=$((violations + 1))
fi
fi

# Rule: tests seed table data through the shared factories, never a hand-rolled
# INSERT.
# Reason: a factory writes the columns the production path writes and applies the
# same normalization, so a row a test creates is a row the application could have
# created. A hand-rolled insert drifts from both. It also drifts silently: a
# column added to a table reaches every factory caller at once and reaches a
# hand-rolled statement never, so the statement keeps seeding a shape the
# application stopped producing and the test keeps passing. A sweep found ~270 of
# these across 100 files, including one whose comment claimed a factory could not
# produce freeform tags while that factory was exported two files away.
#
# Two exemptions, both mechanical, both narrow:
#   - A suite that builds its own minimal fixture schema is inserting into that
#     fixture, not into the application schema; the shared factory writes the
#     production column set and would fail against it. Matched per TABLE: an
#     insert is exempt where this file also creates that table by name. Not per
#     file, because one suite carries the words CREATE TABLE inside a MySQL dump
#     string and a whole-file test handed it blanket immunity.
#   - A suite asserting that the database REFUSES a row cannot use a factory,
#     because a factory typed to the valid shape cannot construct the invalid
#     row. Those carry `factory-cannot-express: <why>` on the statement or in the
#     few lines above it.
#
# The second exemption is deliberately per-statement and not per-file, matching
# the ordering rule below. A file-level version of it shielded two ordinary
# member seeds sitting in a schema suite whose other inserts were genuine
# refusal probes: one real reason at the top bought immunity for everything
# underneath, which is the failure this shape exists to prevent.
#
# A backtick-quoted table name is excluded: that is MySQL dump text in a legacy
# fixture string, not a statement this database ever runs.
#
# The scan reports how many files it read, because a gate here fails closed and
# says what it looked at, so a silently shrinking scope is visible rather than
# reading as a clean pass. A scan that cannot run at all ends the script under
# pipefail, which is what every other scanner-backed check in this file does.
if check "tests seed through factories, not hand-rolled INSERTs" tests; then
insert_out=$(python3 - <<'PYEOF'
import re, pathlib, sys

# `INSERT OR IGNORE INTO` and `OR REPLACE` are the same statement carrying a
# conflict clause. A first version of this check matched neither, which left a
# hand-rolled seed of the application's config table sitting unseen in an
# end-to-end helper.
insert_re = re.compile(r'INSERT\s+(?:OR\s+[A-Z]+\s+)?INTO\s+([A-Za-z_][A-Za-z0-9_]*)', re.I)
create_re = re.compile(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)', re.I)
exempt_re = re.compile(r'factory-cannot-express:', re.I)

scanned = 0
for path in sorted(pathlib.Path('tests').rglob('*.ts')):
    if str(path).startswith('tests/fixtures/'):
        continue
    scanned += 1
    text = path.read_text(encoding='utf-8', errors='replace')
    # The fixture-schema exemption is per TABLE, not per file. A file merely
    # containing the words CREATE TABLE is not building a fixture: one suite
    # carries them inside a MySQL dump string it feeds to a script, and a bare
    # substring test handed that whole file immunity for a reason having nothing
    # to do with the factories. Only a table this file actually creates is
    # exempt, and only where it creates it.
    fixture_tables = {m.group(1).lower() for m in create_re.finditer(text)}
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = insert_re.search(line)
        if not m:
            continue
        if m.group(1).lower() in fixture_tables:
            continue
        # The marker sits on the statement or in the lines just above it, which
        # is where the local builder's explanation lives.
        window = lines[max(0, i - 8):i + 1]
        if any(exempt_re.search(w) for w in window):
            continue
        print(f"{path}:{i + 1}: {line.strip()[:100]}")

if scanned == 0:
    print('scanned no files: the tests/**/*.ts scope matched nothing', file=sys.stderr)
    sys.exit(2)
print(f"[conventions]   scanned {scanned} test files", file=sys.stderr)
PYEOF
)
if [ -n "$insert_out" ]; then
  echo "$insert_out" >&2
  echo "  FAIL: seed test data through tests/fixtures/factories.ts; add a factory if the table has none" >&2
  violations=$((violations + 1))
fi
fi

# Rule: work_queue_items inserts go only through src/services/workQueueService.ts.
# Reason: Every work-queue item must fan out its admin-alerts notification in the
# same step (USER_STORIES global rule: any task added to the work queue notifies
# the admins). workQueueService.enqueue is the single path that writes the row
# and sends the alert together; a direct workQueue.insertItem elsewhere could add
# an item with no notification.
if check "workQueue.insertItem outside src/services/workQueueService.ts" src; then
hits=$(grep -rn --include='*.ts' 'workQueue\.insertItem' src/ \
  | grep -v '^src/db/db\.ts:' \
  | grep -v '^src/services/workQueueService\.ts:' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: work-queue inserts must go through workQueueService.enqueue (row + admin-alerts in one step)" >&2
  violations=$((violations + 1))
fi
fi

# Rule: AWS SDK and Stripe imports live only in src/adapters/.
# Reason: External service SDK calls must be encapsulated behind typed
# adapter interfaces. Services obtain adapters
# via get<Purpose>Adapter() and never import SDK packages directly. The
# adapter seam is the only boundary between application code and external
# services; violating it breaks dev/staging/prod parity and the adapter-
# test contract.
#
# No allowlists (all current imports are in src/adapters/).
if check "AWS SDK / Stripe imports outside src/adapters/" src; then
hits=$(grep -rnE --include='*.ts' "(from |require\()['\"](@aws-sdk|stripe)" src/ \
  | grep -v '^src/adapters/' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: AWS SDK or Stripe imports must live in src/adapters/" >&2
  violations=$((violations + 1))
fi
fi

# Rule: process.env reads live only in src/config/env.ts.
# Reason: Configuration loads once at startup from the host environment
# into a single typed config singleton; no other
# module reads process.env directly. The singleton fail-fasts on
# misconfiguration and is Object.freeze'd. Scattered process.env reads
# bypass that contract.
#
# Allowlisted exceptions:
#   - src/testkit/**                        permanent test scaffolding; not production code
#   - src/dev-bootstrap/**                  dev-only tooling; not production code
#   - src/imageWorker.ts                          separate-process entry-point with its own env bootstrap (per file header)
#
# Comment-only mentions (lines whose match is inside a // comment) are
# filtered so src/server.ts and src/transcodeWorker.ts pass without an
# explicit allowlist entry.
if check "process.env reads outside src/config/env.ts" src; then
hits=$(grep -rn --include='*.ts' 'process\.env' src/ \
  | grep -v -E ':[0-9]+:[[:space:]]*//' \
  | grep -v '^src/config/env\.ts:' \
  | grep -v '^src/testkit/' \
  | grep -v '^src/dev-bootstrap/' \
  | grep -v '^src/imageWorker\.ts:' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: process.env reads must go through src/config/env.ts" >&2
  violations=$((violations + 1))
fi
fi

# Rule: templates must not carry inline style="...", <style> blocks, or
# inline <script> tags.
# Reason: The app's Content-Security-Policy is style-src 'self' and
# script-src 'self'. Inline style/script violates CSP and breaks the page
# silently in production. All CSS lives in src/public/css/style.css; all
# client behavior lives in src/public/js/*.js loaded via <script src>.
#
# Permitted exceptions (filtered by the grep below):
#   - <script src="..." defer></script>             external JS loaded from /public/js
#   - <script type="application/json" id="...">     non-executable JSON data island (the one permitted inline-script form)
if check "inline style/script in src/views/**" src/views; then
# Regex anchored to attribute boundary: `style=` must be at line-start or
# preceded by whitespace. Prevents false positives on attribute NAMES that
# end with `-style` (e.g. a `data-*-style` hook, SVG `font-style=`,
# `border-style=`). The CSP rule targets the HTML `style` attribute on a
# rendered element, not any attribute whose name happens to contain "style".
style_hits=$(grep -rn --include='*.hbs' -E '(^|[[:space:]])style="[^"]*"' src/views/ || true)
styletag_hits=$(grep -rn --include='*.hbs' -E '<style[[:space:]>]' src/views/ || true)
script_hits=$(grep -rn --include='*.hbs' '<script' src/views/ \
  | grep -v 'src=' \
  | grep -v 'type="application/json"' \
  || true)
template_csp_hits=$(printf '%s\n%s\n%s' "$style_hits" "$styletag_hits" "$script_hits" \
  | grep -v '^$' || true)
if [ -n "$template_csp_hits" ]; then
  echo "$template_csp_hits" >&2
  echo "  FAIL: inline style/script violates CSP; use external CSS/JS" >&2
  violations=$((violations + 1))
fi
fi

# Rule: templates must not nest one <form> inside another.
# Reason: HTML closes the outer form at the first </form>, silently orphaning
# every later control and the submit button, so the form submits nothing in the
# browser. The server-side render still emits all tags, so route tests pass
# while the page is broken in production (the members/profile-edit.hbs Save
# regression). When independent actions must interleave with a form's fields,
# associate the controls via the HTML form="id" attribute instead of nesting.
# Per-file depth scan: `<form` opens, `</form` closes (`<form` never matches
# inside `</form>`); flag depth > 1, a close before an open, or any imbalance.
if check "nested <form> in src/views/**" src/views; then
nested_form_hits=""
while IFS= read -r f; do
  if ! awk '
    { o = gsub(/<form/, "&"); c = gsub(/<\/form/, "&"); depth += o - c;
      if (depth > 1 || depth < 0) bad = 1 }
    END { exit (bad || depth != 0) ? 1 : 0 }
  ' "$f"; then
    nested_form_hits="${nested_form_hits}${f}: nested or unbalanced <form>\n"
  fi
done < <(find src/views -name '*.hbs' | sort)
if [ -n "$nested_form_hits" ]; then
  printf '%b' "$nested_form_hits" >&2
  echo "  FAIL: nested <form> orphans the submit button; associate controls via form=\"id\" instead of nesting" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every fixture-staging script must declare the real-data guard.
# Reason: scripts/ci/stage_*.sh files populate paths that on a workstation
# may hold real data (legacy mirror, canonical CSVs, uploaded media). The
# .claude/rules/testing.md "Fixture-staging scripts" rule mandates a real-
# data detection that runs before any destructive operation, declared by a
# `# REAL-DATA GUARD` header marker. A stager omitting the marker has not
# declared the guard. The 2026-05-09 incident (60 GB mirror lost to --force)
# is the precedent. No such stager exists today; this check guards any future one.
if check "# REAL-DATA GUARD marker in scripts/ci/stage_*.sh" scripts/ci; then
missing=""
for f in scripts/ci/stage_*.sh; do
  if [ -f "$f" ] && ! grep -qE '^#.*REAL-DATA GUARD' "$f"; then
    missing="${missing}${f}: missing '# REAL-DATA GUARD' header marker\n"
  fi
done
if [ -n "$missing" ]; then
  printf '%b' "$missing" >&2
  echo "  FAIL: fixture-staging scripts must declare the real-data guard; see .claude/rules/testing.md 'Fixture-staging scripts' section" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every static class token in a template has a defining rule in
# src/public/css/style.css.
# Reason: an undefined class fails nothing at build or test time and renders
# silently unstyled in production while every route test passes, so eye and
# review are the only things standing between it and a shipped page. Three
# reached the tree while this check read `form-` tokens alone: a table class
# with no base rule at all, rendering raw HTML tables beside styled ones; a
# button variant defined only as a descendant of a bar the page did not have;
# and a third consumer missed when the first was retired. The scan reads
# class="..." attributes and skips two token shapes it cannot judge:
# Handlebars-interpolated ones (containing `{` or `}`), whose value is not known
# until render, and BEM modifiers (containing `--`), which are composed rather
# than written whole into the stylesheet. It cannot catch an element that needs
# a class to be styled at all, which is how a bare <fieldset> drew browser
# chrome on six pages; that shape of defect is found by looking at the page.
if check "undefined classes in src/views/**" src/public/css/style.css src/views; then
css_defined_file="$(mktemp)"
# A stylesheet defining no classes at all is not this check's failure to report:
# every template token is then undefined and the check below says so. Without
# the tolerated exit, an empty match ends the entire run under pipefail.
grep -oE '\.[a-zA-Z][a-zA-Z0-9_-]*' src/public/css/style.css | sed 's/^\.//' | sort -u > "$css_defined_file" || true
css_class_hits=$(grep -rnoE --include='*.hbs' 'class="[^"]*"' src/views/ \
  | awk -v deffile="$css_defined_file" '
      BEGIN { while ((getline c < deffile) > 0) defined[c] = 1 }
      {
        p = index($0, "class=\"")
        if (p == 0) next
        loc = substr($0, 1, p - 1)
        rest = substr($0, p + 7)
        q = index(rest, "\"")
        attr = substr(rest, 1, q - 1)
        # A class attribute mixes literal names with Handlebars expressions, so
        # reduce it to the literals before tokenising. Each span becomes a
        # marker. A literal joined to a marker by a trailing hyphen is a prefix
        # the value completes (`notation-{{kind}}`), never a class in itself, so
        # it goes with the marker; the mirror case is a suffix. What survives is
        # a whole literal name, including one written between a block open and
        # its close, and those are checked.
        gsub(/\{\{+[^{}]*\}\}+/, "\001", attr)
        gsub(/[A-Za-z0-9_-]*-\001/, " ", attr)
        gsub(/\001-[A-Za-z0-9_-]*/, " ", attr)
        gsub(/\001/, " ", attr)
        n = split(attr, toks, /[ \t]+/)
        for (i = 1; i <= n; i++) {
          t = toks[i]
          if (t != "" && t !~ /[{}]/ && t !~ /--/ && !(t in defined))
            print loc t
        }
      }
  ' || true)
rm -f "$css_defined_file"
if [ -n "$css_class_hits" ]; then
  echo "$css_class_hits" >&2
  echo "  FAIL: template uses a class with no rule in src/public/css/style.css; define it there" >&2
  violations=$((violations + 1))
fi
fi

# Rule: an element that announces itself to assistive technology carries one of
# the named message classes.
# Reason: the message vocabulary in .claude/rules/view-layer.md fixes four tones
# and one class each, after a rate-limit refusal shipped in the green success
# banner and nothing caught it. This gate cannot judge whether a tone is honest
# for a given sentence; what it does catch is a fifth treatment being born,
# which is how three parallel message families grew in the first place. The
# allowed set is the four message classes, the two field-level ones, and the
# site-frame flash banner, which is the header strip rather than a page message.
if check "message classes on announcing elements in src/views/**" src/views; then
message_class_hits=$(grep -rnoE --include='*.hbs' 'class="[^"]*"[^>]*role="(status|alert)"' src/views/ \
  | grep -vE 'class="[^"]*(form-success-banner|form-notice|form-error-banner|notice-warn|form-field-error|form-field-warning|flash-banner|retirement-notice)' \
  || true)
if [ -n "$message_class_hits" ]; then
  echo "$message_class_hits" >&2
  echo "  FAIL: an element with role=status or role=alert must carry a named message class; see the message vocabulary in .claude/rules/view-layer.md" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every font-family declaration in style.css resolves through the
# --font-body / --font-mono tokens (or inherits), except inside @font-face
# blocks, which by nature name the typeface they register.
# Reason: the site has one type system behind two tokens; a raw typeface
# stack in a rule reintroduces a parallel type vocabulary that drifts from
# the shared standard and ships a different font to one surface.
if check "raw font-family outside @font-face in style.css" src/public/css/style.css; then
font_hits=$(awk '
  /@font-face/ { ff = 1 }
  ff { if (/}/) ff = 0; next }
  /font-family:/ {
    if ($0 !~ /font-family:[[:space:]]*var\(--font-(body|mono)\)/ &&
        $0 !~ /font-family:[[:space:]]*inherit/)
      print FILENAME ":" NR ": " $0
  }
' src/public/css/style.css || true)
if [ -n "$font_hits" ]; then
  echo "$font_hits" >&2
  echo "  FAIL: font-family must use var(--font-body) or var(--font-mono); raw typeface stacks belong only in @font-face" >&2
  violations=$((violations + 1))
fi
fi

# Rule: colors come from the :root design tokens; no raw hex in rule bodies.
# Reason: a hex literal in a rule is an untracked one-off that drifts from the
# shared palette; a new color enters as a named :root token first.
if check "raw hex color outside :root in style.css" src/public/css/style.css; then
hex_hits=$(awk '
  /:root/ { inroot = 1 }
  inroot { if (/}/) inroot = 0; next }
  { line = $0; gsub(/\/\*.*\*\//, "", line) }
  line ~ /#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?/ { print FILENAME ":" NR ": " $0 }
' src/public/css/style.css || true)
if [ -n "$hex_hits" ]; then
  echo "$hex_hits" >&2
  echo "  FAIL: colors must use :root tokens; raw hex belongs only in the :root token block" >&2
  violations=$((violations + 1))
fi
fi

# Rule: border-radius uses the --radius* tokens, never a raw px value.
# Reason: corner radii are part of the token system; a raw px is an untracked one-off.
if check "raw px border-radius in style.css" src/public/css/style.css; then
radius_hits=$(awk '
  /border-radius:/ {
    line = $0; gsub(/\/\*.*\*\//, "", line)
    if (line ~ /border-radius:[^;]*[0-9]+px/) print FILENAME ":" NR ": " $0
  }
' src/public/css/style.css || true)
if [ -n "$radius_hits" ]; then
  echo "$radius_hits" >&2
  echo "  FAIL: border-radius must use var(--radius*) tokens, not raw px" >&2
  violations=$((violations + 1))
fi
fi

# Rule: media queries use only the canonical breakpoints 480/768/1024 (1024 = tablet).
# Reason: a consistent breakpoint set keeps responsive behavior coherent; ad-hoc
# breakpoints fragment the reflow story across surfaces.
if check "non-canonical @media breakpoints in style.css" src/public/css/style.css; then
bp_hits=$(awk '
  /@media/ {
    line = $0
    while (match(line, /[0-9]+px/)) {
      v = substr(line, RSTART, RLENGTH)
      if (v != "480px" && v != "768px" && v != "1024px") { print FILENAME ":" NR ": " $0; break }
      line = substr(line, RSTART + RLENGTH)
    }
  }
' src/public/css/style.css || true)
if [ -n "$bp_hits" ]; then
  echo "$bp_hits" >&2
  echo "  FAIL: @media must use canonical breakpoints 480px / 768px / 1024px only" >&2
  violations=$((violations + 1))
fi
fi

# Rule: no committed skipped tests (.skip / .todo / xit).
# Reason: a silently skipped test is a coverage regression nothing reports;
# if a test cannot land, the feature cannot either. Conditional gating via
# describe.skipIf (e.g. smoke suites behind RUN_STAGING_SMOKE) is allowed:
# the condition is explicit and environment-driven, not a silent off switch.
if check "committed .skip/.todo/xit in tests" tests; then
skip_hits=$(grep -rnE --include='*.ts' '(\.skip\(|\.todo\(|\bxit\()' tests/ \
  | grep -v 'skipIf' \
  || true)
if [ -n "$skip_hits" ]; then
  echo "$skip_hits" >&2
  echo "  FAIL: committed skipped tests are forbidden; gate conditionally with skipIf or fix the test" >&2
  violations=$((violations + 1))
fi
fi

# Rule: the same, for the Python suites.
# Reason: the testing rule's own scope covers legacy_data/tests/ and the mirror
# suite, and a silent skip is a coverage regression nothing reports whatever the
# language. The gate covered only TypeScript.
#
# What this does NOT flag, because those suites already solved it better than the
# TypeScript side had: a skip paired with a fail under an environment declaration.
# Those helpers skip on a developer machine that has no delivered dump or built
# database, and fail outright when the run declares it owns one, which the runner
# sets. That is the shape the rule wants.
#
# The pairing must be in the SAME FUNCTION as the skip, not merely in the same
# file and not merely within a few lines. A file-wide search reads any
# `pytest.fail(` as a guard, including one written for something else entirely --
# a mock asserting a function was never called, say -- and an unconditional skip
# elsewhere in the file then passes unexamined; two files in these suites already
# carry such a `pytest.fail(`, so that hole is one edit from being real. A
# fixed line window is no better: it crosses a `def` boundary in compact code,
# which a test of this very check demonstrated. Python blocks are defined by
# indentation, so the enclosing `def` is what scopes it. What remains forbidden:
# an unconditional `@pytest.mark.skip`, and a `pytest.skip(` whose own function
# contains no `pytest.fail(`.
#
# Reports its scope, for the same reason the insert check above does.
if check "committed skips in the Python suites" legacy_data/tests legacy_data/legacy_mirror/tests; then
py_dirs="legacy_data/tests legacy_data/legacy_mirror/tests"
py_mark_hits=$(grep -rnE --include='*.py' '@pytest\.mark\.skip\b' $py_dirs 2>/dev/null \
  | grep -v 'skipif' || true)
py_unguarded=$(PY_DIRS="$py_dirs" python3 - <<'PYEOF'
import os, pathlib, re, sys

skip_re = re.compile(r'pytest\.skip\(')
fail_re = re.compile(r'pytest\.fail\(')
def_re  = re.compile(r'^(\s*)(?:async\s+)?def\s')

def enclosing_def(lines, i):
    """Index range of the innermost `def` whose body contains line i.

    Walks up for a `def` indented STRICTLY LESS than the skip line, which is what
    "encloses" means; a first version took the nearest `def` above regardless,
    so a skip sitting after a nested helper was attributed to the helper, and a
    skip at module level after a guarded function inherited that function's
    guard. The computed body is then checked to actually contain the line,
    because a `def` above is not the same as a `def` around.
    """
    line_indent = len(lines[i]) - len(lines[i].lstrip())
    for j in range(i - 1, -1, -1):
        m = def_re.match(lines[j])
        if not m:
            continue
        indent = len(m.group(1))
        if indent >= line_indent:
            continue
        end = len(lines)
        for k in range(j + 1, len(lines)):
            stripped = lines[k].strip()
            if not stripped or stripped.startswith('#'):
                continue
            if len(lines[k]) - len(lines[k].lstrip()) <= indent:
                end = k
                break
        return (j, end, indent) if j < i < end else None
    return None


def guard_lines(lines, span):
    """The enclosing def's own body, with any nested def's body left out.

    A `pytest.fail` inside a nested helper is that helper's business, not a
    guard on a skip in the function around it, so it must not exempt one.
    """
    start, end, indent = span
    out = []
    k = start + 1
    while k < end:
        m = def_re.match(lines[k])
        if m and len(m.group(1)) > indent:
            nested = len(m.group(1))
            k += 1
            while k < end:
                s = lines[k].strip()
                if s and not s.startswith('#') and \
                   len(lines[k]) - len(lines[k].lstrip()) <= nested:
                    break
                k += 1
            continue
        out.append(lines[k])
        k += 1
    return out

scanned = 0
for root in os.environ['PY_DIRS'].split():
    base = pathlib.Path(root)
    if not base.is_dir():
        continue
    for path in sorted(base.rglob('*.py')):
        scanned += 1
        lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
        for i, line in enumerate(lines):
            if not skip_re.search(line):
                continue
            span = enclosing_def(lines, i)
            body = guard_lines(lines, span) if span else []
            if any(fail_re.search(w) for w in body):
                continue
            print(f"{path}:{i + 1}: {line.strip()[:100]}")

if scanned == 0:
    print('scanned no files: the Python suite scope matched nothing', file=sys.stderr)
    sys.exit(2)
print(f"[conventions]   scanned {scanned} Python test files", file=sys.stderr)
PYEOF
)
py_skip_hits=$(printf '%s\n%s\n' "$py_mark_hits" "$py_unguarded" | grep -v '^$' || true)
if [ -n "$py_skip_hits" ]; then
  echo "$py_skip_hits" >&2
  echo "  FAIL: a Python skip must be guarded by a fail under the owns-the-input declaration" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a test does not identify a row by ordering on a timestamp and taking one.
# Reason: the platform stamps rows to the millisecond, so two rows written by one
# action or by two quick ones tie, and what happens on a tie decides the test.
# With no tiebreaker SQLite settles it however it likes; with the row's own id
# the order is stable but still arbitrary in time, because nearly every id here
# is a prefix plus a random UUID. Stable is not newest. The tie opens only when
# the writes bunch, which is when the machine is busy, so the test passes alone
# and fails in the full suite, and the failure reads as a wrong value rather than
# a wrong row. Snapshot the matching ids before the action and take what was not
# there before (tests/fixtures/rowPinning.ts), or select on a key the test
# controls, such as an idempotency key it can reconstruct.
#
# Exempt a line that genuinely tests ordering itself, or whose ordering column is
# unique, or whose id really is time-ordered, by writing the reason on it or just
# above it as: ordering-is-the-contract: <why>
if check "tests/ identify a row by ordering on a timestamp" tests; then
row_order_hits=$(python3 - <<'PYEOF'
import re, pathlib

# ORDER BY <col>_at ... LIMIT 1, allowing the clause to wrap across lines inside
# a template literal, which is how most of these are written.
order_re = re.compile(
    r'ORDER\s+BY\s+[A-Za-z_][A-Za-z0-9_.]*_at\b[^;`]{0,200}?LIMIT\s+1\b',
    re.I | re.S,
)
exempt_re = re.compile(r'ordering-is-the-contract:', re.I)

for path in sorted(pathlib.Path('tests').rglob('*.ts')):
    text = path.read_text(encoding='utf-8', errors='replace')
    for m in order_re.finditer(text):
        line_no = text.count('\n', 0, m.start()) + 1
        # The marker may sit on the offending line or on the few lines above it,
        # because the clause often begins partway through a template literal.
        lines = text.splitlines()
        window = lines[max(0, line_no - 7):line_no + 1]
        if any(exempt_re.search(w) for w in window):
            continue
        print(f"{path}:{line_no}: {lines[line_no - 1].strip()[:120]}")
PYEOF
)
if [ -n "$row_order_hits" ]; then
  echo "$row_order_hits" >&2
  echo "  FAIL: pin the row the action wrote (tests/fixtures/rowPinning.ts) instead of ordering by a timestamp; if the ordering is the contract, say so with an ordering-is-the-contract: comment" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a test does not assert against an unfrozen clock or an unseeded random
# source.
# Reason: the value then comes from the machine rather than from the code, so the
# assertion says how fast this box was on this run. Building test data from
# Date.now() or randomUUID() is fine and common; it is comparing against one that
# decides a verdict, which is why this looks only inside expect(...).
#
# Exempt a line whose bound is derived from a budget the code under test declares
# — a client timeout, a configured ceiling — rather than from machine speed, by
# writing the reason on it or just above it as:
#   budget-is-the-contract: <why>
if check "tests/ assert against an unfrozen clock or unseeded randomness" tests; then
unfrozen_hits=$(python3 - <<'PYEOF'
import re, pathlib

# An unfrozen source appearing inside an expect(...) argument.
assert_re = re.compile(r'expect\s*\([^;]{0,200}?(Date\.now\s*\(\)|randomUUID\s*\(\)|randomBytes\s*\()', re.S)
exempt_re = re.compile(r'budget-is-the-contract:', re.I)

for path in sorted(pathlib.Path('tests').rglob('*.ts')):
    text = path.read_text(encoding='utf-8', errors='replace')
    lines = text.splitlines()
    for m in assert_re.finditer(text):
        line_no = text.count('\n', 0, m.start()) + 1
        # The marker may sit on the line or in the few lines above it, because
        # the explanation usually precedes the assertion.
        window = lines[max(0, line_no - 7):line_no + 1]
        if any(exempt_re.search(w) for w in window):
            continue
        print(f"{path}:{line_no}: {lines[line_no - 1].strip()[:120]}")
PYEOF
)
if [ -n "$unfrozen_hits" ]; then
  echo "$unfrozen_hits" >&2
  echo "  FAIL: this assertion is decided by the clock or by randomness; freeze the source, assert shape rather than value, or derive the bound from a budget the code declares and say so with a budget-is-the-contract: comment" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a test does not declare a per-test timeout equal to the configured
# testTimeout.
# Reason: it changes nothing, and it is not harmless. A number written beside a
# case reads as evidence that the case needed a longer budget, so the next reader
# treats a fast test as a slow one and the next author copies the number onto a
# case that really is slow, where it is equally inert. The pattern this repeats
# is the one worth stopping: reaching for a bigger number instead of asking why
# the test is slow. Timeouts that differ from the default are untouched, in
# either direction, because those express a real decision; hook declarations are
# untouched because hookTimeout is a different budget.
#
# The configured value is read from vitest.config.ts rather than written here, so
# this tracks the config instead of drifting from it.
if check "tests/ declare a timeout equal to the configured default" tests vitest.config.ts; then
noop_timeout_hits=$(python3 - <<'PYEOF'
import re, pathlib

cfg = pathlib.Path('vitest.config.ts').read_text(encoding='utf-8', errors='replace')
m = re.search(r'testTimeout\s*:\s*([0-9_]+)', cfg)
if m:
    configured = int(m.group(1).replace('_', ''))
    # `}, 30_000);` closing a case, and `it('name', { timeout: 30_000 }, ...)`.
    tail_re = re.compile(r'^\s*\}\s*,\s*([0-9_]+)\s*\)\s*;?\s*$')
    opt_re = re.compile(r'\b(it|test)\s*\([^)]*\{\s*timeout\s*:\s*([0-9_]+)\s*\}')
    opener_re = re.compile(r'\b(it|test|beforeAll|beforeEach|afterAll|afterEach)\s*\(')

    for path in sorted(pathlib.Path('tests').rglob('*.ts')):
        lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
        for i, line in enumerate(lines):
            mo = opt_re.search(line)
            if mo and int(mo.group(2).replace('_', '')) == configured:
                print(f"{path}:{i + 1}: {line.strip()[:120]}")
                continue
            mt = tail_re.match(line)
            if not mt or int(mt.group(1).replace('_', '')) != configured:
                continue
            # Which construct is being closed decides whether this is inert: the
            # same number on a hook is measured against hookTimeout instead.
            for j in range(i, -1, -1):
                mk = opener_re.search(lines[j])
                if mk:
                    if mk.group(1) in ('it', 'test'):
                        print(f"{path}:{i + 1}: {line.strip()[:120]}")
                    break
PYEOF
)
if [ -n "$noop_timeout_hits" ]; then
  echo "$noop_timeout_hits" >&2
  echo "  FAIL: this timeout equals the configured testTimeout and so does nothing; delete it, or set a value that differs because the case genuinely needs one" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a test file that spawns a process synchronously imports the shared bound
# in tests/fixtures/spawnGuard.ts.
# Reason: a synchronous spawn blocks the worker's event loop, and vitest's own
# testTimeout is a timer on that loop, so it cannot fire while the loop is
# frozen. An unbounded command therefore parks the worker with no failure
# reported and no test named, and the run stops making progress instead of
# failing. The shared bound is applied beneath the loop and turns that into an
# ordinary failure. This check is file-level: it catches a file that never
# adopted the bound, which is the case that reached the main branch, not a file
# that imports it and then omits it on one call site among several.
# Rule: the shared test setup breaks AWS credential resolution for every worker
# and everything it spawns, except the opt-in staging smoke run.
# Reason: tests spawn real operator scripts, and several of those write to live
# AWS. On CI that is inert, because there are no credentials to find. On a
# maintainer's workstation the ambient profile is a real operator identity with
# write access to both environments, so a case that reaches the write succeeds
# against real infrastructure. A test proving a file-mode check passes did
# exactly that: it overwrote a live Safe Browsing key in staging's Parameter
# Store with its fixture value, and the suite reported a clean pass. The
# isolation is default-deny in one place rather than per file, because per file
# is a rule the next file can forget.
if check "the test setup isolates AWS credentials" tests/setup-env.ts tests/fixtures/awsIsolation.ts; then
if ! grep -q 'NO_AWS_CREDENTIALS' tests/setup-env.ts; then
  echo "  FAIL: tests/setup-env.ts must apply NO_AWS_CREDENTIALS from tests/fixtures/awsIsolation.ts" >&2
  violations=$((violations + 1))
fi
if ! grep -q "RUN_STAGING_SMOKE !== '1'" tests/setup-env.ts; then
  echo "  FAIL: the AWS isolation in tests/setup-env.ts must be conditional on the smoke opt-in only" >&2
  violations=$((violations + 1))
fi
for _aws_var in AWS_PROFILE AWS_CONFIG_FILE AWS_SHARED_CREDENTIALS_FILE AWS_EC2_METADATA_DISABLED; do
  if ! grep -q "$_aws_var" tests/fixtures/awsIsolation.ts; then
    echo "  FAIL: tests/fixtures/awsIsolation.ts no longer neutralises $_aws_var" >&2
    violations=$((violations + 1))
  fi
done
unset _aws_var
fi

# The same reasoning one level up: the values in vitest.config.ts only apply if
# that config is the one in force, and nothing in a worker can tell otherwise.
# A run that resolves a different config, or none, silently takes vitest's own
# defaults and reports timeouts at ceilings configured nowhere in this tree. The
# marker and the refusal that reads it are a pair; either one alone is inert, so
# the gate holds both rather than trusting the next edit to keep them together.
if check "the test setup proves this repository's vitest config is in force" vitest.config.ts tests/setup-env.ts; then
if ! grep -q 'FOOTBAG_VITEST_CONFIG_LOADED' vitest.config.ts; then
  echo "  FAIL: vitest.config.ts must stamp FOOTBAG_VITEST_CONFIG_LOADED into the worker env" >&2
  violations=$((violations + 1))
fi
if ! grep -q 'FOOTBAG_VITEST_CONFIG_LOADED' tests/setup-env.ts; then
  echo "  FAIL: tests/setup-env.ts must refuse to run when FOOTBAG_VITEST_CONFIG_LOADED is absent" >&2
  violations=$((violations + 1))
fi
fi

# Rule: the local runner's gates reach AWS only where they say they do, and the
# terraform gate initializes into a throwaway data directory.
# Reason: the same invariant as above, for the half of the tree the TypeScript
# declaration cannot cover. `terraform init -backend=false` does not make an init
# offline: it disables *configuring* a backend and uses whatever was previously
# initialized instead, so in a tree where an operator has run `terraform init`
# the gate loaded the S3 state backend and called STS on every local run. That
# was invisible for months, because a passing credential check looks exactly like
# no credential check, and it surfaced as the terraform gate failing on the day
# the operator's access key stopped being accepted. Avoiding credentials is not
# something a gate can be trusted to do; it is enforced here so a gate that
# starts reaching AWS fails at once rather than passing wherever a key works.
if check "the local runner isolates AWS credentials" run_all_tests.sh scripts/lib/aws-isolation.sh; then
if ! grep -q 'source scripts/lib/aws-isolation.sh' run_all_tests.sh; then
  echo "  FAIL: run_all_tests.sh must source scripts/lib/aws-isolation.sh" >&2
  violations=$((violations + 1))
fi
for _aws_var in AWS_PROFILE AWS_CONFIG_FILE AWS_SHARED_CREDENTIALS_FILE AWS_ACCESS_KEY_ID \
                AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_EC2_METADATA_DISABLED; do
  if ! grep -q "$_aws_var" scripts/lib/aws-isolation.sh; then
    echo "  FAIL: scripts/lib/aws-isolation.sh no longer neutralises $_aws_var" >&2
    violations=$((violations + 1))
  fi
done
unset _aws_var
# Every gate, not just the one that got this wrong. A check naming gate_terraform
# would leave the next gate free to repeat it, and the next gate is exactly how
# this arrived: the defect was written by someone following the rule of the day,
# not by someone being careless. Bodies are read with comments stripped, so a
# gate cannot describe an isolation it does not apply, and `command -v terraform`
# is a presence guard rather than an invocation so it does not match.
#
# gate_smoke is the single declared exception, the same shape as the smoke opt-in
# that exempts one tier on the TypeScript side: it is the operator-only live-AWS
# suite, it says so, and it is the one gate whose purpose is to reach the estate.
_gate_names="$(grep -oE '^gate_[a-z_]+\(\)' run_all_tests.sh | sed 's/()$//')"
if [[ -z "$_gate_names" ]]; then
  echo "  FAIL: no gate functions found in run_all_tests.sh; this check has stopped scanning" >&2
  violations=$((violations + 1))
fi
# The verdict is taken from captured text, never from a pipeline into `grep -q`.
# `grep -qv` exits 0 on empty input, so `<producer> | grep -qv PATTERN` reports a
# violation for a gate that invokes nothing at all, and only `pipefail` masking
# it with the producer's own exit status makes that composition appear to work.
# A check whose correctness rests on that is the shape this repository has
# already been bitten by once.
for _gate in $_gate_names; do
  [[ "$_gate" == "gate_smoke" ]] && continue
  _body="$(sed -n "/^${_gate}()/,/^}/p" run_all_tests.sh | sed 's/#.*//')"
  _calls="$(printf '%s\n' "$_body" \
    | grep -E '(^|[;&|(]|&&)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(aws|terraform)[[:space:]]' || true)"
  _unisolated="$(printf '%s' "$_calls" | grep -v 'aws_isolated_run' || true)"
  if [[ -n "$_unisolated" ]]; then
    echo "  FAIL: ${_gate} invokes aws or terraform outside aws_isolated_run; a gate that reaches AWS while presenting as local is green wherever a key happens to work" >&2
    violations=$((violations + 1))
  fi
done
unset _gate _gate_names _body _calls _unisolated
# The terraform gate additionally has to redirect its data directory: without
# that, -backend=false silently reuses the operator's initialized S3 backend,
# which is the specific defect, and isolation alone would turn it into a hard
# failure rather than preventing it.
if ! sed -n '/^gate_terraform()/,/^}/p' run_all_tests.sh | sed 's/#.*//' | grep -q 'TF_DATA_DIR'; then
  echo "  FAIL: gate_terraform must init into a throwaway TF_DATA_DIR; -backend=false alone reuses the operator's initialized S3 backend" >&2
  violations=$((violations + 1))
fi
fi

# Rule: the same setup denies every worker the rest of the machine it runs on.
# Reason: two suites passed on a maintainer's workstation and failed on the
# runner, one reaching an operator signing key beneath the home directory, the
# other reading a gitignored Terraform values file. Neither asserted the wrong
# contract; both were satisfied by the filesystem rather than by the code, and
# the branch where the contract breaks is unreachable on a machine holding those
# files, so no amount of local running could have found it. The media defaults
# are in the same declaration for a second reason: one of them points at a tree
# holding real member media, and the rule that no test writes real data must not
# depend on each media suite remembering to override it.
if check "the test setup isolates the rest of the machine" tests/setup-env.ts tests/fixtures/machineIsolation.ts; then
if ! grep -q 'noMachineState' tests/setup-env.ts; then
  echo "  FAIL: tests/setup-env.ts must apply noMachineState from tests/fixtures/machineIsolation.ts" >&2
  violations=$((violations + 1))
fi
for _machine_var in HOME FOOTBAG_ENV FOOTBAG_MEDIA_DIR FOOTBAG_CURATED_MEDIA_DIR; do
  if ! grep -q "$_machine_var" tests/fixtures/machineIsolation.ts; then
    echo "  FAIL: tests/fixtures/machineIsolation.ts no longer neutralises $_machine_var" >&2
    violations=$((violations + 1))
  fi
done
unset _machine_var
fi

# Rule: every temporary path a test builds carries the swept prefix.
# Reason: the session sweep in tests/global-setup.ts is what reclaims scratch a
# worker timeout, an out-of-memory kill or a SIGKILL leaves behind, and it
# collects by prefix. A suite that picks its own name is invisible to it, and
# what accumulates is invisible too until someone looks at the filesystem: 417
# abandoned directories and a private key, once, and nearly four hundred entries
# again before this check existed. tests/fixtures/scratchDir.ts builds a
# conforming path for new code; this check is what keeps the next suite from
# spelling its own.
if check "temp paths in tests carry the swept prefix" tests; then
# What this reaches, stated plainly so nobody trusts it further than it goes: a
# temp path built from `tmpdir()`. A hardcoded `/tmp/...` literal is not matched,
# and that is deliberate rather than an oversight. Matching one fires on every
# string that merely names a path without creating anything, and the tree has
# those: a pure argument-builder is tested with `/tmp/in.mp4`. A check that
# reports those gets its findings waved through, which costs more than the case
# it would catch. The convention is still the convention; this catches the way
# it actually gets broken.
scratch_hits=$(grep -rnE --include='*.ts' "(tmpdir\(\),[[:space:]]*[\`'\"])" tests/ \
  | grep -vE "[\`'\"]footbag-(test|e2e)-" \
  | grep -v '^tests/fixtures/scratchDir\.ts:' \
  | grep -v '^tests/global-setup\.ts:' \
  | grep -v '^tests/unit/global-setup-sweep\.test\.ts:' \
  || true)
if [ -n "$scratch_hits" ]; then
  echo "$scratch_hits" >&2
  echo "  FAIL: a temp path a test builds must start with the swept 'footbag-test-' prefix," >&2
  echo "        or the session sweep in tests/global-setup.ts never reclaims what a crash" >&2
  echo "        strands. Use tests/fixtures/scratchDir.ts, or spell the prefix." >&2
  violations=$((violations + 1))
fi
fi

if check "synchronous spawns in tests carry the shared bound" tests; then
spawn_files=$(grep -rlE --include='*.ts' '(spawnSync|execFileSync|execSync)\(' tests/ \
  | grep -v '^tests/fixtures/spawnGuard\.ts$' \
  || true)
guard_hits=$(echo "$spawn_files" | grep -v '^$' | xargs -r grep -L 'spawnGuard' || true)
if [ -n "$guard_hits" ]; then
  echo "$guard_hits" >&2
  echo "  FAIL: a test that spawns synchronously must spread SPAWN_GUARD from tests/fixtures/spawnGuard.ts" >&2
  violations=$((violations + 1))
fi
fi

# Rule: no tracked archives, and no Terraform state in any form.
# Reason: every secret control here reads text, including the gitleaks history
# scan, so an archive is a container none of them can see into. That is not
# theoretical: a saved Terraform plan is a zip, and one committed under an
# unmatched filename carried three live secrets in public history for seven
# weeks with CI green throughout. Delegated so a test can run it inside a
# throwaway repository.
delegate "no tracked archives or Terraform state" check_no_opaque_archives.sh

# Rule: a migration file is additive (expand and contract). Delegated, so the
# gate can be run inside a throwaway repository by its own test rather than
# proved by writing a fixture into this tree.
delegate "migrations are additive" check_migrations_additive.sh

# Rule: no test may reach real cloud object storage or a deployed database.
# Reason: a test suite is collectible by anyone and runs unattended, so it is
# the wrong place to hold something that mutates a live bucket or database.
# Building the S3 adapter with an injected `s3Client` is the supported way to
# exercise the adapter contract; building it without one resolves real AWS
# credentials and writes real objects. Deployed database paths are barred for
# the same reason: every test database is `:memory:` or a temp file.
#
# A third way exists and is not obvious from either of those, because the test
# does not mention AWS at all: it spawns an operator script, and the script
# reaches the cloud itself. What stops that is not this check but the setup,
# which breaks credential resolution for the whole worker, so the child a test
# spawns inherits an environment that cannot authenticate. A spawn handed an
# `env` object built from scratch throws that away and hands the script a clean
# environment on a machine whose ambient profile is a real operator identity.
# One such case existed, reaching a live bucket listing and passing only where
# the credentials happened to be; it has been fixed.
#
# So: a spawn passing an `env` names where that environment came from, by
# spreading the inherited one or the isolation declaration itself. Stated
# plainly, because a check nobody can predict gets waved through: this reaches a
# spawn whose environment mentions neither, anywhere in the call or the lines
# above it. An environment assembled key by key from the inherited one is not
# reached, and is not the case this is about.
if check "real cloud storage / deployed DB access in tests" tests; then
cloud_hits=$(python3 - <<'PYEOF'
import pathlib, re

WINDOW = 6
# How far above a spawn to look for where its environment was built. A helper's
# `const inherited = { ...process.env }` sits a line or two up; nothing legible
# builds it further away than this.
ENV_LOOKBACK = 40

spawn_re = re.compile(r'\b(spawnSync|execFileSync|execSync|spawn)\s*\(')
env_opt_re = re.compile(r'\benv:')
isolated_re = re.compile(r'process\.env|NO_AWS_CREDENTIALS')

for path in sorted(pathlib.Path('tests').rglob('*.ts')):
    lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
    for i, line in enumerate(lines):
        if 'createS3MediaStorageAdapter(' in line:
            window = '\n'.join(lines[i:i + WINDOW])
            if 's3Client' not in window:
                print(f'{path}:{i + 1}: {line.strip()}')
        m = spawn_re.search(line)
        if not m:
            continue
        # The call's own text, to wherever its parentheses close.
        depth = 0
        call = []
        for j in range(i, min(i + 60, len(lines))):
            piece = lines[j][m.start():] if j == i else lines[j]
            call.append(piece)
            depth += piece.count('(') - piece.count(')')
            if depth <= 0:
                break
        call_text = '\n'.join(call)
        if not env_opt_re.search(call_text):
            continue
        context = '\n'.join(lines[max(0, i - ENV_LOOKBACK):i]) + call_text
        if not isolated_re.search(context):
            print(f'{path}:{i + 1}: spawn env replaces the isolated one: {line.strip()[:90]}')
PYEOF
)
db_hits=$(grep -rnE --include='*.ts' "FOOTBAG_DB_PATH[[:space:]]*=[[:space:]]*['\"]/(srv|var|opt)/" tests/ || true)
if [ -n "$cloud_hits" ] || [ -n "$db_hits" ]; then
  [ -n "$cloud_hits" ] && echo "$cloud_hits" >&2
  [ -n "$db_hits" ] && echo "$db_hits" >&2
  echo "  FAIL: tests never touch real object storage or a deployed database; inject an s3Client, keep every test DB in :memory: or a temp path, and spread the inherited environment into any spawn" >&2
  violations=$((violations + 1))
fi
fi

# Rule: short-form Handlebars comments must not contain mustaches.
# Reason: {{! ... }} terminates at the FIRST }}, so a comment containing a
# mustache (e.g. an inline {{example}}) ends early and spills its remaining
# text into the rendered page, evaluating any embedded expression along the
# way. Comments that need to mention template syntax use the long form
# {{!-- ... --}} (which tolerates internal mustaches) or plain words.
if check "short-form {{! comments containing mustaches in templates" src/views; then
comment_hits=$(python3 - <<'PYEOF'
import re, pathlib
for f in sorted(pathlib.Path('src/views').rglob('*.hbs')):
    text = f.read_text()
    for m in re.finditer(r'\{\{!(?!--)', text):
        end = text.find('}}', m.end())
        if end == -1:
            continue
        if '{{' in text[m.end():end]:
            line = text.count('\n', 0, m.start()) + 1
            print(f"{f}:{line}: short-form comment terminates early at its first embedded mustache")
PYEOF
)
if [ -n "$comment_hits" ]; then
  echo "$comment_hits" >&2
  echo "  FAIL: use {{!-- --}} for comments that contain template syntax" >&2
  violations=$((violations + 1))
fi
fi

# Rule: code comments carry no doc-path references or delivery-epoch labels.
# Reason: .claude/rules/comments.md requires every comment to state a self-
# contained WHY in plain words. Doc paths (docs/, exploration/, or any *.md
# filename) rot independently of the code and mislead once renamed; sprint /
# slice / phase / wave labels are delivery-epoch tags that stop meaning anything
# once the epoch passes. Bare section shorthands (DD §, SC §, US §,
# DATA_GOVERNANCE §) are permitted locators and carry no .md, so they pass. The
# scan parses real // and /* */ comments only, so string literals such as URLs
# (https://...) are not flagged.
if check "doc-path / epoch-label references in src/ comments" src; then
doc_label_hits=$(python3 - <<'PYEOF'
import re, pathlib

md_re    = re.compile(r'[A-Za-z0-9_./-]+\.md\b')
path_re  = re.compile(r'\b(?:exploration|docs)/')
label_re = re.compile(
    r'\b(?:[Pp]hase|[Ss]lice|[Ww]ave)[ -][0-9]'  # digit-only: pipeline phases (Phase E/G/H) and editorial prose are not epoch labels
    r'|-WAVE-[0-9]'
    r'|\bUX-?SHIP'
    r'|\bUX[0-9]'
    r'|\bDSC-[0-9]'
    r'|\bNCR-[0-9]'
    r'|[A-Z]{3,}-REFACTOR'
)

def comment_segments(line, in_block):
    """Return (list of comment substrings in line, in_block_after_line)."""
    segs = []
    i, n = 0, len(line)
    if in_block:
        end = line.find('*/')
        if end == -1:
            return [line], True
        segs.append(line[:end])
        i = end + 2
    quote = None
    while i < n:
        c = line[i]
        if quote:
            if c == '\\':
                i += 2; continue
            if c == quote:
                quote = None
            i += 1; continue
        if c in ('"', "'", '`'):
            quote = c; i += 1; continue
        if c == '/' and i + 1 < n and line[i + 1] == '/':
            segs.append(line[i + 2:]); return segs, False
        if c == '/' and i + 1 < n and line[i + 1] == '*':
            end = line.find('*/', i + 2)
            if end == -1:
                segs.append(line[i + 2:]); return segs, True
            segs.append(line[i + 2:end]); i = end + 2; continue
        i += 1
    return segs, False

for f in sorted(pathlib.Path('src').rglob('*.ts')):
    in_block = False
    for lineno, line in enumerate(f.read_text().splitlines(), 1):
        segs, in_block = comment_segments(line, in_block)
        text = ' '.join(segs)
        if not text:
            continue
        if md_re.search(text) or path_re.search(text) or label_re.search(text):
            print(f"{f}:{lineno}: doc-path or delivery-epoch label in comment")
PYEOF
)
if [ -n "$doc_label_hits" ]; then
  echo "$doc_label_hits" >&2
  echo "  FAIL: comments must state a self-contained WHY; drop doc paths (docs/, exploration/, *.md) and sprint/slice/phase/wave labels" >&2
  violations=$((violations + 1))
fi
fi

# Rule: Handlebars comments carry no doc-path references or delivery-epoch labels.
# Reason: the same self-contained-WHY rule that governs .ts comments applies to
# {{! }} / {{!-- --}} template comments; a doc path or a phase/slice/wave label
# inside one rots when the doc moves or the epoch passes. Only comment spans are
# scanned, so rendered template text is never flagged. Same md/path/label
# patterns as the .ts scan above.
if check "doc-path / epoch-label references in src/views/**/*.hbs comments" src/views; then
hbs_comment_hits=$(python3 - <<'PYEOF'
import re, pathlib
md_re    = re.compile(r'[A-Za-z0-9_./-]+\.md\b')
path_re  = re.compile(r'\b(?:exploration|docs)/')
label_re = re.compile(
    r'\b(?:[Pp]hase|[Ss]lice|[Ww]ave)[ -][0-9]'  # digit-only: excludes editorial "Two-Phase Story"
    r'|-WAVE-[0-9]'
    r'|\bUX-?SHIP'
    r'|\bUX[0-9]'
    r'|\bDSC-[0-9]'
    r'|\bNCR-[0-9]'
    r'|[A-Z]{3,}-REFACTOR'
)
comment_re = re.compile(r'\{\{!--.*?--\}\}|\{\{!(?!--).*?\}\}', re.S)
for f in sorted(pathlib.Path('src/views').rglob('*.hbs')):
    text = f.read_text()
    for m in comment_re.finditer(text):
        seg = m.group(0)
        if md_re.search(seg) or path_re.search(seg) or label_re.search(seg):
            line = text.count('\n', 0, m.start()) + 1
            print(f"{f}:{line}: doc-path or delivery-epoch label in Handlebars comment")
PYEOF
)
if [ -n "$hbs_comment_hits" ]; then
  echo "$hbs_comment_hits" >&2
  echo "  FAIL: Handlebars comments must state a self-contained WHY; drop doc paths (docs/, exploration/, *.md) and sprint/slice/phase/wave labels" >&2
  violations=$((violations + 1))
fi
fi

# ---------------------------------------------------------------------------
# Convention and invariant gates (DD §1.15): mechanically-checkable layer rules
# and data invariants. Each fails closed with an offending file:line.
# ---------------------------------------------------------------------------

# Rule: templates never serialize JSON inline; data islands go through the
# centralized escaping helper.
# Reason: a JSON data island must escape a script-close substring in its payload
# so embedded data cannot terminate the surrounding <script> block, and that
# escaping is centralized. An inline JSON.stringify in a template bypasses it.
# Handlebars registers no JSON/stringify helper, so any such token in a .hbs file
# is an inline-serialization anomaly. Tests legitimately use JSON.stringify, so
# the scan is scoped to src/views/.
if check "inline JSON serialization in src/views/**" src/views; then
json_hits=$(grep -rnE --include='*.hbs' 'JSON\.|stringify' src/views/ || true)
if [ -n "$json_hits" ]; then
  echo "$json_hits" >&2
  echo "  FAIL: emit data islands via the centralized escaping helper; no inline JSON.stringify in templates" >&2
  violations=$((violations + 1))
fi
fi

# Rule: SQL writers use the canonical strftime UTC timestamp, never datetime('now').
# Reason: views, triggers, and string comparisons sort timestamps lexically, so
# every writer must emit strftime('%Y-%m-%dT%H:%M:%fZ','now'); the space-separated
# datetime('now') output breaks lexical=chronological ordering. Scope is the
# production SQL surfaces (db.ts + the schema); test-fixture and pipeline SQL are
# outside this harm model.
if check "datetime('now') in src/db/db.ts + database/*.sql" src/db/db.ts database; then
datetime_hits=$(grep -nE "datetime\([[:space:]]*['\"]now['\"]" src/db/db.ts database/*.sql || true)
if [ -n "$datetime_hits" ]; then
  echo "$datetime_hits" >&2
  echo "  FAIL: use strftime('%Y-%m-%dT%H:%M:%fZ','now'); datetime('now') breaks lexical ordering" >&2
  violations=$((violations + 1))
fi
fi

# Rule: templates do not assemble a URL from two or more variables.
# Reason: a logic-light view renders a pre-shaped *Href field; assembling a URL
# from multiple variables in the template moves URL shaping and its escaping out
# of the service and risks a silently malformed link. A single variable (one
# query param, one path segment) is fine. The -o tokenization isolates each
# attribute value so two single-variable links on one line do not false-positive.
if check "multi-variable href/src URL assembly in src/views/**" src/views; then
url_hits=$(grep -rnoE --include='*.hbs' '(href|src)="[^"]*"' src/views/ \
  | grep -E '(href|src)="[^"]*\{\{[^}]*\}\}[^"]*\{\{' || true)
if [ -n "$url_hits" ]; then
  echo "$url_hits" >&2
  echo "  FAIL: build URLs from one variable or a pre-shaped *Href field; no multi-variable URL assembly in templates" >&2
  violations=$((violations + 1))
fi
fi

# Rule: templates do not branch on a raw domain enum.
# Reason: the service supplies a pre-shaped boolean (isAdmin, isCompleted);
# branching on a raw role/status/tier/level field in a logic-light view puts an
# authorization or state decision in the template. The dot and the trailing
# space/paren anchor the match to the exact field name, so pre-shaped fields such
# as curatedStatus or statusLabel are not flagged.
if check "template branching on raw domain enums in src/views/**" src/views; then
enum_hits=$(grep -rnE --include='*.hbs' '\((eq|neq|gt|lt) [a-zA-Z0-9_.]*\.(role|status|tier|level)( |\))' src/views/ || true)
if [ -n "$enum_hits" ]; then
  echo "$enum_hits" >&2
  echo "  FAIL: branch on a service-supplied boolean, not a raw .role/.status/.tier/.level field" >&2
  violations=$((violations + 1))
fi
fi

# Rule: cookies are set or cleared only through the cookie-helper libs.
# Reason: a session or flash cookie carries HttpOnly/Secure/SameSite attributes
# that must not vary; a direct res.cookie()/res.clearCookie()/Set-Cookie write can
# silently drop one. src/lib/sessionCookie.ts and src/lib/flashCookie.ts are the
# only allowed emission sites.
if check "direct cookie emission outside the cookie-helper libs" src; then
cookie_hits=$(grep -rnE --include='*.ts' "res\.cookie\(|res\.clearCookie\(|res\.(setHeader|append|header|set)\([[:space:]]*['\"][Ss]et-[Cc]ookie['\"]" src/ \
  | grep -vE 'src/lib/sessionCookie\.ts:|src/lib/flashCookie\.ts:' || true)
if [ -n "$cookie_hits" ]; then
  echo "$cookie_hits" >&2
  echo "  FAIL: set or clear cookies only via src/lib/sessionCookie.ts or src/lib/flashCookie.ts" >&2
  violations=$((violations + 1))
fi
fi

# Rule: SQL uses positional ? parameters, never named :param binds.
# Reason: the codebase binds statements positionally; a named :param mixed into
# the positional convention silently misbinds parameters. Scope is the SQL-
# compiling surfaces (db.ts plus the .prepare-allowlisted dev-bootstrap/testkit).
# ${...} interpolations are stripped first, and the lookbehind excludes :: casts
# and time formats like %H:%M:%fZ.
if check "named :param SQL binds in SQL-compiling files" src/db/db.ts; then
named_param_hits=$(python3 - <<'PYEOF'
import re, pathlib
files = [pathlib.Path('src/db/db.ts')]
for base in ('src/dev-bootstrap', 'src/testkit'):
    p = pathlib.Path(base)
    if p.exists():
        files += sorted(p.rglob('*.ts'))
sql_kw = re.compile(r'\b(SELECT|INSERT|UPDATE|DELETE)\b', re.I)
param = re.compile(r'(?<![:A-Za-z0-9]):[A-Za-z_][A-Za-z0-9_]*')
for f in files:
    if not f.exists():
        continue
    text = f.read_text()
    for m in re.finditer(r'`([^`]*)`', text, re.S):
        body = m.group(1)
        if not sql_kw.search(body):
            continue
        stripped = re.sub(r'\$\{[^}]*\}', ' ', body)
        if param.search(stripped):
            line = text.count('\n', 0, m.start()) + 1
            print(f"{f}:{line}: named :param bind in SQL; use positional ?")
PYEOF
)
if [ -n "$named_param_hits" ]; then
  echo "$named_param_hits" >&2
  echo "  FAIL: SQL parameters are positional ?; named :param binds are forbidden" >&2
  violations=$((violations + 1))
fi
fi

# Rule: controllers never execute a db statement directly; SQL stays in services.
# Reason: a controller is HTTP glue (parse, call service, render); reaching into a
# db/db statement group from a controller leaks the data layer past the service
# boundary. Only value-imports from a db/db module are flagged, so adapter calls
# (for example a payment controller's Stripe adapter) are not false-positives.
if check "controllers executing db statements directly" src/controllers; then
ctrl_db_hits=$(python3 - <<'PYEOF'
import re, pathlib
root = pathlib.Path('src/controllers')
imp = re.compile(r'import\s+(type\s+)?\{([^}]*)\}\s+from\s+[\'"][^\'"]*db/db[\'"]')
files = sorted(root.rglob('*.ts')) if root.exists() else []
for f in files:
    text = f.read_text()
    names = set()
    for m in imp.finditer(text):
        if m.group(1):
            continue  # 'import type {...}' is types only
        for spec in m.group(2).split(','):
            spec = spec.strip()
            if not spec or spec.startswith('type '):
                continue
            local = spec.split(' as ')[-1].strip()
            if local:
                names.add(local)
    if not names:
        continue
    call = re.compile(r'\b(' + '|'.join(re.escape(n) for n in names) + r')\.[A-Za-z0-9_]+\.(get|run|all|iterate|pluck)\(')
    for i, line in enumerate(text.splitlines(), 1):
        if call.search(line):
            print(f"{f}:{i}: controller executes a db statement directly; move SQL into a service")
PYEOF
)
if [ -n "$ctrl_db_hits" ]; then
  echo "$ctrl_db_hits" >&2
  echo "  FAIL: controllers call services, not db statements; move the SQL into a service" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a *_failed operational-error audit row is written via
# recordOperationalError, not appendAuditEntry directly.
# Reason: recordOperationalError pairs the audit row with a logger.error() that
# drives the staging/prod alarm and the in-test guard; a direct appendAuditEntry
# for a *_failed row writes the forensic row with no alarm. The '.failed'
# business-event suffix and dynamic actionType values are excluded.
if check "appendAuditEntry for *_failed rows in src/services/**" src/services; then
op_error_hits=$(python3 - <<'PYEOF'
import re, pathlib
root = pathlib.Path('src/services')
files = sorted(root.rglob('*.ts')) if root.exists() else []
for f in files:
    text = f.read_text()
    for m in re.finditer(r'appendAuditEntry\(', text):
        start = text.find('{', m.end())
        if start == -1:
            continue
        depth = 0
        j = start
        while j < len(text):
            c = text[j]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        obj = text[start:j + 1]
        am = re.search(r'actionType\s*:\s*([\'"])(.*?)\1', obj)
        if am and am.group(2).endswith('_failed'):
            line = text.count('\n', 0, m.start()) + 1
            print(f"{f}:{line}: appendAuditEntry writes a *_failed row; route via recordOperationalError()")
PYEOF
)
if [ -n "$op_error_hits" ]; then
  echo "$op_error_hits" >&2
  echo "  FAIL: write *_failed operational-error rows via recordOperationalError(), not appendAuditEntry" >&2
  violations=$((violations + 1))
fi
fi

# Rule: synthetic-only identifiers in fixtures/content/scripts.
# Rule: script credential-handling discipline.
# Both delegated to dedicated checkers so their pattern sets stay readable.
delegate "synthetic-only identifiers" check_synthetic_identifiers.sh
delegate "script credential handling" check_script_credentials.sh
delegate "AWS identity resolution" check_aws_identity.sh
delegate "append-only triggers present" check_append_only_triggers.sh
delegate "GitHub Actions SHA-pinning" check_action_pinning.sh
delegate "container hardening" check_dockerfile_hardening.sh
delegate "live external fetch in pipeline scripts" check_no_live_pipeline_fetch.sh
delegate "runtime repo-data reads have a matching Dockerfile COPY" check_runtime_data_paths_copied.sh
delegate "copied runtime assets readable by the image's non-root account" check_runtime_assets_readable.sh
delegate "no terraform state/plan artifacts tracked" check_no_terraform_artifacts.sh
delegate "no sensitive variable assigned in a tracked tfvars example" check_tfvars_sensitive.sh
delegate "every S3 bucket carries the encryption, public-access and deny-plaintext baseline" check_bucket_baseline.sh
delegate "config seed / Configurable Parameters parity" check_config_seed_parity.sh
delegate "every CI job has a local gate or a recorded reason it cannot" check_ci_parity.sh

# Rule: no concrete CloudFront distribution hostname in any tracked file. The
# staging environment is protected by its address staying unpublished, so a
# real distribution hostname in a committed file defeats that control.
# Generic wildcard references like "*.cloudfront.net" are fine: the character
# before the first dot is not alphanumeric, so the pattern skips them.
# No target guard: this reads the tracked tree through git, which exists
# wherever the gate can run at all, so it never has nothing to scan. It still
# announces itself through `check`, with no targets, because that is where a
# violation is attributed to a rule name. Printing the announcement directly is
# what this rule used to do, and the attribution then belonged to whichever
# check ran before it: a real CloudFront violation was reported under the name
# of the continuous-integration parity rule above, which had passed, sending the
# reader to a rule with nothing wrong with it.
check "no concrete CloudFront hostnames tracked"
# Exempt the two documented fake hosts (the onboarding guide's "something
# like" example domain and the Terraform bootstrap placeholder value), plus the
# one staging sneak-preview host the README intentionally publishes as a public
# preview link.
cf_host_hits=$(git grep -nE '[a-z0-9]+\.cloudfront\.net' -- . \
  | grep -v 'scripts/ci/assert_conventions\.sh' \
  | grep -vE 'd1234abcdef8\.cloudfront\.net|placeholder\.cloudfront\.net|doye1nvv64qep\.cloudfront\.net' \
  || true)
if [ -n "$cf_host_hits" ]; then
  echo "$cf_host_hits" >&2
  echo "  FAIL: a concrete CloudFront hostname must never be committed; keep environment addresses in local operator notes" >&2
  violations=$((violations + 1))
fi

# Rule: tests/ comments and describe/it names never reference docs, doc-section
# shorthands, or finding ids. A test name describes the long-term contract in
# plain words; doc paths and section numbers rot as docs evolve, and finding
# ids are throwaway. Product structure (glossary §N sections), pipeline phases,
# user-story slugs, and code identifiers are not doc references and stay.
#
# Comment spans and describe/it/test titles only, which is what this rule always
# said it covered and what it did not do. It was a grep over whole files, so it
# also matched STRING DATA: a filename inside a fixture, an asserted path in a
# `toContain`. Those are values a test constructs or checks, not a reference a
# reader would follow, and there is nothing in them to rot.
#
# The tell that this was a defect rather than strictness: the allowlist had
# grown two entries of different kinds. One shields a real comment that names
# ".md" as the extension a scanner skips, and that one is still needed and still
# here. The other shielded a plain string value, one literal at a time, which is
# the shape of a rule patched at the symptom. Scoping the scan correctly removes
# the need for that second kind entirely.
#
# The scanner below is the same one the epoch-label rule under this uses, and the
# two are deliberately identical: a change to either belongs in both.
if check "tests/ doc / finding-id references" tests; then
test_doc_hits=$(python3 - <<'PYEOF'
import re, pathlib

doc_re = re.compile(
    r'\.md\b'
    r'|exploration/'
    r'|\b(?:DD|US|SC|VC|DM|DG|MP) §'
    r'|MIGRATION_PLAN|USER_STORIES|DESIGN_DECISIONS|SERVICE_CATALOG'
    r'|VIEW_CATALOG|DATA_MODEL|DATA_GOVERNANCE|STABILIZATION_PLAN'
    r'|PHASE_B_LOCK'
    r'|regression: ?B[0-9]'
    r'|\bBUG_HUNT\b'
    r'|\(B[0-9]+\)'
)
# ".md" as the name of a file EXTENSION under discussion, rather than a document
# being cited. A comment explaining which file types a scanner skips has to be
# able to say so.
exempt_re = re.compile(r'documentation \(\.md\)')
title_re  = re.compile(r"\b(?:describe|it|test)\(\s*(['\"`])(.*?)\1", re.S)

def comment_segments(line, in_block):
    """Return (list of comment substrings in line, in_block_after_line)."""
    segs = []
    i, n = 0, len(line)
    if in_block:
        end = line.find('*/')
        if end == -1:
            return [line], True
        segs.append(line[:end])
        i = end + 2
    quote = None
    while i < n:
        c = line[i]
        if quote:
            if c == '\\':
                i += 2; continue
            if c == quote:
                quote = None
            i += 1; continue
        if c in ('"', "'", '`'):
            quote = c; i += 1; continue
        if c == '/' and i + 1 < n and line[i + 1] == '/':
            segs.append(line[i + 2:]); return segs, False
        if c == '/' and i + 1 < n and line[i + 1] == '*':
            end = line.find('*/', i + 2)
            if end == -1:
                segs.append(line[i + 2:]); return segs, True
            segs.append(line[i + 2:end]); i = end + 2; continue
        i += 1
    return segs, False

def flagged(text):
    if not text or exempt_re.search(text):
        return False
    return bool(doc_re.search(text))

for f in sorted(pathlib.Path('tests').rglob('*.ts')):
    in_block = False
    for lineno, line in enumerate(f.read_text().splitlines(), 1):
        segs, in_block = comment_segments(line, in_block)
        scanned = [' '.join(segs)]
        scanned += [m.group(2) for m in title_re.finditer(line)]
        if any(flagged(t) for t in scanned):
            print(f"{f}:{lineno}: doc reference or finding id in test comment or name")
PYEOF
)
if [ -n "$test_doc_hits" ]; then
  echo "$test_doc_hits" >&2
  echo "  FAIL: test comments/names must describe the contract in plain words, not reference docs, doc-section numbers, or finding ids" >&2
  violations=$((violations + 1))
fi
fi

# Rule: tests/ comments and describe/it names carry no delivery-epoch label and
# no dated change-marker. A test describes a permanent contract, so a sprint /
# slice / phase / wave tag or a "(2026-05-25)" stamp on the change dates the
# test rather than the behavior, and stops meaning anything once the epoch
# passes. Only comment spans and the title string of a describe/it/test call
# are scanned, so fixture dates, seeded timestamps, and asserted string values
# are untouched. A date that is genuine data inside prose stays legal: the
# banned shape is a parenthesized stamp, a date introducing a clause, or a date
# next to a change verb. A title asserting that rendered output does NOT expose
# such labels has to name them, so "does/do not expose" titles are exempt.
# A numbered curator-ruling batch tag (pt2, pt11) is the same shape: it dates
# the test to a ruling round and tells a later reader nothing, so a comment
# cites the ruling in words instead. The bare "pt##" placeholder is not a tag
# and stays legal, which is what the tests asserting public pages expose no such
# label have to write.
if check "tests/ epoch-label / dated-change-marker references" tests; then
test_epoch_hits=$(python3 - <<'PYEOF'
import re, pathlib

label_re = re.compile(
    r'\b(?:[Pp]hase|[Ss]lice|[Ww]ave)[ -][0-9A-Z]\b'
    r'|-WAVE-[0-9]'
    r'|\bUX-?SHIP'
    r'|\bUX[0-9]'
    r'|\bDSC-[0-9]'
    r'|\bNCR-[0-9]'
    r'|\bpt[0-9]+\b'
    r'|[A-Z]{3,}-REFACTOR'
)
date        = r'20[0-9]{2}-[0-9]{2}-[0-9]{2}'
marker_re   = re.compile(
    r'\(\s*' + date                                   # a parenthesized stamp
    + r'|' + date + r'\s*[:;]'                        # a date introducing a clause
    + r'|\b(?:added|removed|renamed|corrected|changed|updated|retired|moved'
      r'|migrated|promoted|reversed|deferred)\b[^.]{0,40}?' + date
)
title_re    = re.compile(r"\b(?:describe|it|test)\(\s*(['\"`])(.*?)\1", re.S)
exempt_re   = re.compile(r'do(?:es)? not expose', re.I)

def comment_segments(line, in_block):
    """Return (list of comment substrings in line, in_block_after_line)."""
    segs = []
    i, n = 0, len(line)
    if in_block:
        end = line.find('*/')
        if end == -1:
            return [line], True
        segs.append(line[:end])
        i = end + 2
    quote = None
    while i < n:
        c = line[i]
        if quote:
            if c == '\\':
                i += 2; continue
            if c == quote:
                quote = None
            i += 1; continue
        if c in ('"', "'", '`'):
            quote = c; i += 1; continue
        if c == '/' and i + 1 < n and line[i + 1] == '/':
            segs.append(line[i + 2:]); return segs, False
        if c == '/' and i + 1 < n and line[i + 1] == '*':
            end = line.find('*/', i + 2)
            if end == -1:
                segs.append(line[i + 2:]); return segs, True
            segs.append(line[i + 2:end]); i = end + 2; continue
        i += 1
    return segs, False

def flagged(text):
    if not text or exempt_re.search(text):
        return False
    return bool(label_re.search(text) or marker_re.search(text))

for f in sorted(pathlib.Path('tests').rglob('*.ts')):
    in_block = False
    for lineno, line in enumerate(f.read_text().splitlines(), 1):
        segs, in_block = comment_segments(line, in_block)
        scanned = [' '.join(segs)]
        scanned += [m.group(2) for m in title_re.finditer(line)]
        if any(flagged(t) for t in scanned):
            print(f"{f}:{lineno}: delivery-epoch label or dated change-marker in test comment or name")
PYEOF
)
if [ -n "$test_epoch_hits" ]; then
  echo "$test_epoch_hits" >&2
  echo "  FAIL: test comments and describe/it names state the permanent contract; drop sprint/slice/phase/wave labels and dated change-markers" >&2
  violations=$((violations + 1))
fi
fi

# Rule: no em dashes in visitor-facing text. Em dashes are unrestricted in
# code comments, scripts, and docs; only public text a visitor reads is in
# scope: rendered .hbs text nodes, src/content string values, and the
# visitor-facing strings (page titles, definitions, tooltips, prose) authored
# in src/services and src/controllers. Use a comma, parentheses, or a colon
# instead. Comment blocks (Handlebars and code) are stripped before scanning;
# curator-audit metadata (resolvedFormulas `provenance`, not rendered) and
# standalone "—" no-value placeholders are exempt; dev-only and internal-QC
# surfaces are out of scope.
if check "visitor-facing em dashes" src/views src/content; then
emdash_hits=""
for f in $(grep -rl '—' src/views --include='*.hbs' 2>/dev/null | grep -vE 'internal-qc/|/dev/' || true); do
  h=$(perl -0777 -pe 's/\{\{!--.*?--\}\}//gs; s/\{\{!.*?\}\}//gs' "$f" | grep -nE '—' | sed "s|^|$f:|" || true)
  [ -n "$h" ] && emdash_hits="${emdash_hits}${h}"$'\n'
done
content_emdash=$(grep -rnE '—' src/content --include='*.ts' \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' \
  | grep -vE 'provenance:' \
  || true)
[ -n "$content_emdash" ] && emdash_hits="${emdash_hits}${content_emdash}"$'\n'
for f in $(grep -rl '—' src/services src/controllers --include='*.ts' 2>/dev/null | grep -v 'internal-qc/' || true); do
  s=$(perl -0777 -pe 's{//[^\n]*}{}g; s{/\*.*?\*/}{}gs;' "$f" \
        | grep -nE '—' \
        | grep -vE "(['\"\`])—" \
        | grep -vE 'indexOf' \
        | sed "s|^|$f:|" || true)
  [ -n "$s" ] && emdash_hits="${emdash_hits}${s}"$'\n'
done
if [ -n "$(printf '%s' "$emdash_hits" | tr -d '[:space:]')" ]; then
  printf '%s\n' "$emdash_hits" >&2
  echo "  FAIL: em dashes are not allowed in visitor-facing text; use a comma, parentheses, or a colon" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every font size comes from the closed type scale.
# Reason: the stylesheet had drifted to sixty distinct sizes, many a tenth of a
# rem apart, which is not a hierarchy a reader can perceive. Each step maps to
# one job (metadata, body, subheading, section heading, page title) plus two
# display sizes for figures and icon glyphs. Nothing renders below 0.9rem;
# subordination below that is carried by colour and weight. A closed set only
# stays closed if something checks it.
if check "font sizes come from the type scale" src/public/css/style.css; then
size_ok='0\.9rem|1rem|1\.25rem|1\.5rem|2\.25rem|2rem|3rem|0\.9em|1em'
size_bad=$(grep -nE 'font-size: *[0-9.]+r?em' src/public/css/style.css \
  | grep -vE "font-size: ($size_ok);" || true)
# Sizes carried in custom properties obey the scale too.
token_bad=$(grep -nE '^\s*--[a-z-]*size[a-z-]*: *[0-9.]+r?em' src/public/css/style.css \
  | grep -vE ": *($size_ok);" || true)
if [ -n "$size_bad$token_bad" ]; then
  [ -n "$size_bad" ] && printf '%s\n' "$size_bad" >&2
  [ -n "$token_bad" ] && printf '%s\n' "$token_bad" >&2
  echo "  FAIL: font size is off the type scale (0.9 / 1 / 1.25 / 1.5 / 2.25 rem, display 2 / 3 rem)" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a public control never carries a decorative arrow in its label.
# Reason: colour, resting underline, and wording carry the link affordance; an
# appended arrow is decoration every author must remember to type and every
# reviewer must check. Glyphs that carry meaning are content, not decoration,
# and are allowlisted below: sort-direction indicators, notation showing an
# input-to-result transformation, sequence and ladder separators, and
# position markers within a list. Internal and administrative tooling is out of
# scope and keeps its existing glyphs.
if check "decorative arrows in public control labels" src/views src/public/css/style.css; then
# Matched precisely: an arrow inside a control's own label, meaning immediately
# before the closing tag or immediately after the opening tag of an anchor or
# button. An arrow sitting BETWEEN elements is a separator (a progression chain,
# an operator-to-compound mapping), and an arrow inside <code>/<pre> or a
# dedicated arrow span is notation; neither is a label, so neither matches.
arrow_label='(&rarr;|&larr;|→|←)[[:space:]]*</(a|button)>|<(a|button)[^>]*>[[:space:]]*(&rarr;|&larr;|→|←)'
# An icon-only control whose whole label is the glyph is not a label with an
# arrow appended; it carries its name in aria-label and is exempt.
arrow_icon='<(a|button)[^>]*aria-label=[^>]*>[[:space:]]*(<span[^>]*>)?[[:space:]]*(&rarr;|&larr;|→|←)[[:space:]]*(</span>)?[[:space:]]*</(a|button)>'
arrow_hits=""
for f in $(grep -rlE '&rarr;|&larr;|→|←' src/views --include='*.hbs' 2>/dev/null \
             | grep -vE 'internal-qc/|/dev/|/admin/' || true); do
  h=$(perl -0777 -pe 's/\{\{!--.*?--\}\}//gs; s/\{\{!.*?\}\}//gs' "$f" \
        | grep -nE "$arrow_label" | grep -vE "$arrow_icon" | sed "s|^|$f:|" || true)
  [ -n "$h" ] && arrow_hits="${arrow_hits}${h}"$'\n'
done
# CSS pseudo-element arrows. Reported with the selector they belong to, so the
# semantic ones (sort-direction indicator, ladder separator) can be told apart
# from an arrow bolted onto a link class.
css_arrow=$(perl -0777 -ne '
  while (/([^\n{}]+)\{([^}]*content:[^;}]*(?:\\2192|\\2190|\x{2192}|\x{2190})[^;}]*;[^}]*)\}/gs) {
    my $sel = $1; $sel =~ s/^\s+|\s+$//g; $sel =~ s/\s*\n\s*/ /g;
    next if $sel =~ /sortable|ladder-step/;
    print "$sel\n";
  }' src/public/css/style.css || true)
[ -n "$css_arrow" ] && arrow_hits="${arrow_hits}src/public/css/style.css selectors:"$'\n'"${css_arrow}"$'\n'
if [ -n "$(printf '%s' "$arrow_hits" | tr -d '[:space:]')" ]; then
  printf '%s\n' "$arrow_hits" >&2
  echo "  FAIL: public control labels carry no decorative arrow; drop the glyph and keep the words" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every audit action_type is a lowercase, dotted, domain-prefixed value.
# Reason: action_type is a closed vocabulary that downstream queries, metric
# filters, and the cutover residue audit match on; a value without a namespace
# splits those matchers. Production writes are validated at runtime by
# assertCanonicalActionType in appendAuditEntry; this gate is the build-time
# backstop for every action_type literal in src/, including the persona and
# dev-admin audit-marker constants that reach the DB through a raw-SQL path.
if check "audit action_type literals are dotted (src/**)" src; then
action_type_hits=$(python3 - <<'PYEOF'
import re, pathlib
root = pathlib.Path('src')
dotted = re.compile(r'^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$')
pats = [
    re.compile(r"actionType\s*[:=]\s*'([^']+)'"),
    re.compile(r"_AUDIT_ACTION_TYPE\s*=\s*'([^']+)'"),
]
for f in sorted(root.rglob('*.ts')):
    for i, line in enumerate(f.read_text().splitlines(), 1):
        for pat in pats:
            for m in pat.finditer(line):
                if not dotted.match(m.group(1)):
                    print(f"{f}:{i}: audit action_type '{m.group(1)}' is not lowercase dotted domain.event")
PYEOF
)
if [ -n "$action_type_hits" ]; then
  echo "$action_type_hits" >&2
  echo "  FAIL: audit action_type must be lowercase dotted domain.event (every value namespaced)" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every audit action_type literal in src/ appears in the data model's
# action_type catalogue. Delegated so it can be exercised against a fixture
# repository of its own.
delegate "audit action_type literals appear in the data model catalogue" check_audit_catalogue.sh

# Rule: security-critical dependencies are pinned to an exact version.
# Reason: argon2, better-sqlite3, express, helmet, and marked sit on the
# authentication, storage, HTTP, header-hardening, and markdown-rendering
# paths; a floating range lets a new upstream release install silently on a
# fresh npm install. An upgrade to any of these must be a reviewed, deliberate
# change, so their declared versions are exact x.y.z with no range operator.
if check "security-critical dependencies pinned exactly" package.json; then
# stripe is pinned for a reason beyond supply chain: the SDK carries the API
# version, and an API version change reshapes webhook payloads. A caret range
# lets an unrelated install move object shapes under working payment code.
pin_hits=$(grep -nE '"(argon2|better-sqlite3|express|helmet|marked|stripe)"[[:space:]]*:' package.json \
  | grep -vE ':[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' \
  || true)
if [ -n "$pin_hits" ]; then
  echo "$pin_hits" >&2
  echo "  FAIL: argon2 / better-sqlite3 / express / helmet / marked / stripe must be pinned to an exact x.y.z version" >&2
  violations=$((violations + 1))
fi
fi

# Rule: every static import of a production-stripped subtree has a no-op stub in
# the web image.
# Reason: the production web image deletes dist/testkit and dist/dev-bootstrap,
# then hand-writes no-op stubs for the modules that are still
# statically imported, so app boot survives. That stub list is maintained by hand
# and nothing else checks it, so an import added later resolves fine everywhere
# it is tested and then dies at boot with MODULE_NOT_FOUND on production alone.
# Staging cannot catch it: staging builds with the subtrees included, so it never
# runs the stripped image at all.
if check "stripped-subtree imports have a stub in docker/web/Dockerfile" src docker/web/Dockerfile; then
stripped_hits=$(grep -rn --include='*.ts' -oE "from '[^']*(testkit|dev-bootstrap)/[A-Za-z0-9_/-]+'" src/ \
  | grep -vE '^src/(testkit|dev-bootstrap)/' \
  || true)
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  # Reduce "src/a/b.ts:12:from '../testkit/x'" to the dist path the image must carry.
  module=$(printf '%s' "$hit" | sed -E "s|.*from '||; s|'$||; s|.*/(testkit\|dev-bootstrap)/|\1/|")
  if ! grep -q "dist/${module}.js" docker/web/Dockerfile; then
    echo "$hit" >&2
    echo "  needs a stub written to dist/${module}.js" >&2
    violations=$((violations + 1))
  fi
done <<< "$stripped_hits"
fi

# Rule: the retired internal QC subsystem does not come back.
# Reason: it was operator tooling mounted only in dev and staging, and no
# production deployment may carry its code, routes or tables. A test asserts the
# named files and tables are absent; that catches a file being restored. This
# catches the other direction, QC code reappearing under a name that list does
# not know, so a rename cannot slip past both.
#
# Scope is the surfaces that ship or that build the database: application source,
# the schema, and the pipeline. A QC page cannot return without code in src/ and a
# table in the schema, so scanning those two catches the return itself. Tests are
# deliberately outside it, because the tests proving the subsystem is gone have to
# name it, and telling those apart from a test exercising a restored one is not
# something a pattern can do. Their side is covered by the absence suite instead.
#
# scripts/validate-qc-absence.sh is exempt because it greps a built production
# image for exactly this list. scripts/internal/ is deploy tooling unrelated to
# the retired /internal HTTP mount, which is why the route pattern requires a QC
# path segment rather than matching the word alone.
if check "the retired QC subsystem has not returned" src database; then
# Tracked files only. The claim is that the subsystem is not in the codebase, and
# git knows what the codebase is: grepping the working tree instead walks the
# gitignored Python virtualenv and pipeline output too, which is a hundred
# thousand files of other people's code and generated artifacts, and makes the
# answer depend on what a given workstation happens to be holding.
qc_hits=$(git grep -nE \
  'internal-qc|internalRouter|netQcController|personsQcController|netQcService|personsQcService|personsQcChecks|/internal/(net|persons|freestyle)/|net_review_queue|net_candidate_match|net_curated_match|net_raw_fragment|net_recovery_alias_candidate|net_team_correction_candidate' \
  -- src database legacy_data scripts ':(exclude)**/tests/**' 2>/dev/null \
  | grep -vE '^scripts/validate-qc-absence\.sh:' \
  | grep -vE '^scripts/ci/assert_conventions\.sh:' \
  || true)
if [ -n "$qc_hits" ]; then
  echo "$qc_hits" >&2
  echo "  FAIL: the internal QC subsystem is retired; these name its code, routes or tables" >&2
  violations=$((violations + 1))
fi
fi

# Rule: a table carries the standard metadata columns, or declares why it does not.
# Reason: the stamp answers, from the row itself, when a row was created and last
# changed and by whom; audit_entries holds the account of what each change was, and
# an admin screen, a migration and a debugging session all read the two together.
# That only works if it is uniform, and uniformity kept by hand does not stay kept:
# the rule was written as absolute while forty tables quietly carried fewer, because
# nothing checked. A table whose rows are not activity on this platform has no answer
# to give, so it is declared here beside the family that explains it, and a new table
# must either carry the full set or say which family it joins.
#
# Append-only ledgers are recognised by their `_no_update` immutability trigger rather
# than by a list of their own, so the declarations below never have to track them: they
# keep created_at and created_by and carry none of the mutable trio, because the trigger
# means there is no later change to attribute. A ledger whose trigger is named some other
# way reads here as an ordinary table and is asked for the full set, which is the right
# prompt: either follow the naming the rest of the schema uses, or declare the table.
if check "standard metadata columns on tables in database/schema.sql" database/schema.sql; then
schema_meta_hits=$(python3 - <<'PYEOF'
import re, pathlib

META = ['created_at', 'created_by', 'updated_at', 'updated_by', 'version']
MUTABLE = ['updated_at', 'updated_by', 'version']

# Tables whose rows record something other than a member or an administrator acting
# on this platform. Grouped by the reason, which is the part that has to stay true.
DECLARED = {
    # Imported archival and reference catalogues: the rows record what a source
    # supplied and carry that provenance in their own source columns.
    'legacy_members', 'historical_persons', 'media_sources',
    'name_variants', 'given_name_variants',
    'freestyle_records', 'consecutive_kicks_records',
    'net_stat_policy', 'net_discipline_group', 'net_team', 'net_team_member',
    'net_team_appearance',
    'freestyle_tricks', 'freestyle_trick_modifiers', 'freestyle_trick_sources',
    'freestyle_trick_source_links', 'freestyle_trick_aliases',
    'freestyle_trick_modifier_links', 'freestyle_trick_relations',
    'freestyle_trick_tips',
    'symbolic_equivalence_clusters', 'symbolic_group_membership',
    'symbolic_movement_archetypes', 'symbolic_topology_groups',
    'symbolic_modifier_groups', 'symbolic_glossary_crosslinks',
    # External-event ingestion: each row claims a provider's identifier and is
    # written once by a webhook handler.
    'stripe_events', 'ses_events', 'sns_alarm_events', 'stripe_webhook_failures',
    # Derived cache, recomputed by a background job.
    'tag_stats',
    # Junction rows the application inserts and deletes rather than edits.
    'member_gallery_tags', 'member_gallery_exclude_tags',
    # Admin cleanup queue: latest state rather than history. The resolution upserts
    # overwrite created_at and created_by, so those name who resolved it and when.
    'club_viability_signals', 'club_insight_notes', 'club_cleanup_resolutions',
    'candidate_cleanup_resolutions', 'club_cleanup_claims',
    # Seeded operational configuration; the audit ledger carries the edits.
    'mailing_lists',
    # Schema bookkeeping: the applied migration filenames.
    'schema_migrations',
}

# An append-only table whose author is a typed FK instead of the free-form actor
# column: only an administrator or the seed writes a config row.
LEDGER_TYPED_AUTHOR = {'system_config'}

schema = pathlib.Path('database/schema.sql').read_text()
guarded = set(re.findall(r'CREATE TRIGGER \w+_no_update\s+BEFORE UPDATE ON (\w+)', schema))
tables = set()

for m in re.finditer(r'CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*?)\n\);', schema, re.S):
    name, body = m.group(1), m.group(2)
    tables.add(name)
    line = schema.count('\n', 0, m.start()) + 1
    have = {c for c in META if re.search(r'^\s*' + c + r'\s', body, re.M)}
    if name in guarded:
        want = ['created_at'] + ([] if name in LEDGER_TYPED_AUTHOR else ['created_by'])
        missing = [c for c in want if c not in have]
        carried = [c for c in MUTABLE if c in have]
        if missing:
            print(f"database/schema.sql:{line}: append-only {name} omits {', '.join(missing)}")
        if carried:
            print(f"database/schema.sql:{line}: append-only {name} carries {', '.join(carried)}, "
                  f"which its immutability trigger makes unwritable")
    elif name not in DECLARED:
        missing = [c for c in META if c not in have]
        if missing:
            print(f"database/schema.sql:{line}: {name} omits {', '.join(missing)}")

for name in sorted(DECLARED - tables):
    print(f"database/schema.sql: declared exception {name} names no table in the schema")
PYEOF
)
if [ -n "$schema_meta_hits" ]; then
  echo "$schema_meta_hits" >&2
  echo "  FAIL: add the standard metadata columns, or declare the table in this rule's list beside the family that explains it" >&2
  violations=$((violations + 1))
fi
fi

# Rule: an UPDATE stamps every metadata column its table carries.
# Reason: a row whose updated_by still names a previous actor is worse than one
# carrying no actor at all, because it reads as an answer. Two statements had drifted
# this way, each beside a sibling that stamped correctly, and neither was visible to
# any test: the row was right in every column the page renders.
#
# Allowlisted exceptions, both companions that run in the same transaction as a
# statement stamping the same row:
#   - clearDerivedParse           runs with updateScalars, which stamps the trick row
#   - setMediaItemExternalUrl     runs with the INSERT that created the media row
if check "UPDATE statements stamp the metadata columns their table carries" src/db/db.ts database/schema.sql; then
stamp_hits=$(python3 - <<'PYEOF'
import re, pathlib

MUTABLE = ('updated_at', 'updated_by', 'version')
ALLOWED = {'clearDerivedParse', 'setMediaItemExternalUrl'}

schema = pathlib.Path('database/schema.sql').read_text()
carried = {}
for m in re.finditer(r'CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*?)\n\);', schema, re.S):
    carried[m.group(1)] = {c for c in MUTABLE
                           if re.search(r'^\s*' + c + r'\s', m.group(2), re.M)}

src = pathlib.Path('src/db/db.ts').read_text()
# Bounded at the closing backtick rather than at WHERE: a subquery carries a WHERE of
# its own, and stopping there truncates the scan and invents a missing stamp.
for m in re.finditer(r'UPDATE\s+(\w+)\s+SET([\s\S]*?)`', src):
    table, body = m.group(1), m.group(2)
    missing = [c for c in MUTABLE
               if c in carried.get(table, set()) and not re.search(r'\b' + c + r'\s*=', body)]
    if not missing:
        continue
    names = re.findall(r'get\s+(\w+)\s*\(', src[:m.start()])
    statement = names[-1] if names else '(unnamed statement)'
    if statement in ALLOWED:
        continue
    line = src.count('\n', 0, m.start()) + 1
    print(f"src/db/db.ts:{line}: {statement} updates {table} without stamping "
          f"{', '.join(missing)}")
PYEOF
)
if [ -n "$stamp_hits" ]; then
  echo "$stamp_hits" >&2
  echo "  FAIL: an UPDATE sets updated_at, updated_by and version = version + 1 for every one its table carries" >&2
  violations=$((violations + 1))
fi
fi

# What did not run, and whether that is allowed. A fixture repository declares
# itself and is expected to be missing nearly everything; a real checkout is
# expected to be missing nothing, so a skip there is a rule that has silently
# stopped being enforced and the gate fails on it.
#
# It opens a named span of its own, because the violation it raises is the one
# violation in this file produced outside any `check`. Without a name here the
# final flush below credited it to whichever rule happened to run last, so a
# gate failing because a check had gone missing reported the name of a rule that
# had just passed. That is the same misattribution the CloudFront rule used to
# cause, arriving by the other route: there a check raised a violation without
# opening a span, here a violation is raised after every span has closed.
attribute_violations "every check ran against this tree"
if [ "$skipped_count" -gt 0 ]; then
  echo "[conventions] ${skipped_count} check(s) did not run:" >&2
  printf '%b' "$skipped" >&2
  if [ "${CONVENTIONS_FIXTURE_TREE:-}" != "1" ]; then
    echo "  FAIL: every check runs against this repository. A check with nothing to scan is" >&2
    echo "        a rule that has stopped being enforced, so restore what it reads or move" >&2
    echo "        the rule. Only a fixture tree may skip, and it says so by setting" >&2
    echo "        CONVENTIONS_FIXTURE_TREE=1." >&2
    violations=$((violations + 1))
  fi
fi

# Flush the last check's attribution before reporting.
attribute_violations ""

if [ "$violations" -gt 0 ]; then
  echo "[conventions] $violations rule(s) violated" >&2
  if [ "${#failed_checks[@]}" -gt 0 ]; then
    printf '  %s\n' "${failed_checks[@]}" >&2
    echo "  Each one printed its offending file:line above, before the checks that followed it." >&2
  fi
  exit 1
fi

if [ "$skipped_count" -gt 0 ]; then
  echo "[conventions] all rules that ran pass (${skipped_count} did not run)"
else
  echo "[conventions] all rules pass"
fi
