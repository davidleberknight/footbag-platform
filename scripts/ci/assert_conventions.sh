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

# Rule: SQL compilation (.prepare) lives only in src/db/db.ts.
# Reason: All SQL compilation must live in src/db/db.ts as named prepared
# statements; services call those named statements, never compile SQL strings
# inline. Mechanical enforcement prevents business logic from
# leaking into raw SQL surfaces.
#
# Allowlisted exceptions:
#   - src/testkit/**         permanent test scaffolding (persona row builders); not a service
#   - src/dev-bootstrap/**   dev-only seed/override tooling; not a service
echo "[conventions] check: .prepare( outside src/db/db.ts"
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

# Rule: AWS SDK and Stripe imports live only in src/adapters/.
# Reason: External service SDK calls must be encapsulated behind typed
# adapter interfaces. Services obtain adapters
# via get<Purpose>Adapter() and never import SDK packages directly. The
# adapter seam is the only boundary between application code and external
# services; violating it breaks dev/staging/prod parity and the adapter-
# test contract.
#
# No allowlists (all current imports are in src/adapters/).
echo "[conventions] check: AWS SDK / Stripe imports outside src/adapters/"
hits=$(grep -rnE --include='*.ts' "(from |require\()['\"](@aws-sdk|stripe)" src/ \
  | grep -v '^src/adapters/' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: AWS SDK or Stripe imports must live in src/adapters/" >&2
  violations=$((violations + 1))
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
echo "[conventions] check: process.env reads outside src/config/env.ts"
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

# Rule: templates must not carry inline style="...", <style> blocks, or
# inline <script> tags.
# Reason: The app's Content-Security-Policy is style-src 'self' and
# script-src 'self'. Inline style/script violates CSP and breaks the page
# silently in production. All CSS lives in src/public/css/style.css; all
# client behavior lives in src/public/js/*.js loaded via <script src>.
#
# Permitted exceptions (filtered by the grep below):
#   - <script src="..." defer></script>             external JS loaded from /public/js
#   - <script type="application/json" id="...">     non-executable JSON data island per VC §4.4
echo "[conventions] check: inline style/script in src/views/**"
# Regex anchored to attribute boundary: `style=` must be at line-start or
# preceded by whitespace. Prevents false positives on attribute NAMES that
# end with `-style` (e.g. `data-anchor-style="solid"`, SVG `font-style=`,
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

# Rule: templates must not nest one <form> inside another.
# Reason: HTML closes the outer form at the first </form>, silently orphaning
# every later control and the submit button, so the form submits nothing in the
# browser. The server-side render still emits all tags, so route tests pass
# while the page is broken in production (the members/profile-edit.hbs Save
# regression). When independent actions must interleave with a form's fields,
# associate the controls via the HTML form="id" attribute instead of nesting.
# Per-file depth scan: `<form` opens, `</form` closes (`<form` never matches
# inside `</form>`); flag depth > 1, a close before an open, or any imbalance.
echo "[conventions] check: nested <form> in src/views/**"
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

# Rule: every fixture-staging script must declare the real-data guard.
# Reason: scripts/ci/stage_*.sh files populate paths that on a workstation
# may hold real data (legacy mirror, canonical CSVs, uploaded media). The
# .claude/rules/testing.md "Fixture-staging scripts" rule mandates a real-
# data detection that runs before any destructive operation; the canonical
# reference is scripts/ci/stage_loader_smoke_fixtures.sh, which carries
# `# REAL-DATA GUARD` in its header. A new stager omitting the marker has
# not declared the guard. The 2026-05-09 incident (60 GB mirror lost to
# --force) is the precedent.
echo "[conventions] check: # REAL-DATA GUARD marker in scripts/ci/stage_*.sh"
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

# Rule: every static form-* class token in a template has a defining rule in
# src/public/css/style.css.
# Reason: VC §4.3 mandates one canonical form vocabulary and §4.4 makes it a
# hard rule that no template uses an undefined CSS class. An undefined form-*
# class renders unstyled in production while route tests still pass. This gate
# scans class="..." attributes for tokens beginning with `form-`, skipping
# Handlebars-interpolated tokens (containing `{` or `}`) and BEM modifier
# tokens (containing `--`), and fails on any token style.css does not define.
echo "[conventions] check: undefined form-* classes in src/views/**"
form_defined_file="$(mktemp)"
grep -oE '\.form-[a-zA-Z0-9_-]+' src/public/css/style.css | sed 's/^\.//' | sort -u > "$form_defined_file"
form_class_hits=$(grep -rnoE --include='*.hbs' 'class="[^"]*"' src/views/ \
  | awk -v deffile="$form_defined_file" '
      BEGIN { while ((getline c < deffile) > 0) defined[c] = 1 }
      {
        p = index($0, "class=\"")
        if (p == 0) next
        loc = substr($0, 1, p - 1)
        rest = substr($0, p + 7)
        q = index(rest, "\"")
        attr = substr(rest, 1, q - 1)
        n = split(attr, toks, /[ \t]+/)
        for (i = 1; i <= n; i++) {
          t = toks[i]
          if (t ~ /^form-/ && t !~ /[{}]/ && t !~ /--/ && !(t in defined))
            print loc t
        }
      }
  ' || true)
rm -f "$form_defined_file"
if [ -n "$form_class_hits" ]; then
  echo "$form_class_hits" >&2
  echo "  FAIL: template uses a form-* class with no rule in src/public/css/style.css; define it and document in VC §4.3" >&2
  violations=$((violations + 1))
fi

# Rule: every font-family declaration in style.css resolves through the
# --font-body / --font-mono tokens (or inherits), except inside @font-face
# blocks, which by nature name the typeface they register.
# Reason: the site has one type system behind two tokens; a raw typeface
# stack in a rule reintroduces a parallel type vocabulary that drifts from
# the shared standard and ships a different font to one surface.
echo "[conventions] check: raw font-family outside @font-face in style.css"
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

# Rule: colors come from the :root design tokens; no raw hex in rule bodies.
# Reason: a hex literal in a rule is an untracked one-off that drifts from the
# shared palette; a new color enters as a named :root token first.
echo "[conventions] check: raw hex color outside :root in style.css"
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

# Rule: border-radius uses the --radius* tokens, never a raw px value.
# Reason: corner radii are part of the token system; a raw px is an untracked one-off.
echo "[conventions] check: raw px border-radius in style.css"
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

# Rule: media queries use only the canonical breakpoints 480/768/1024 (1024 = tablet).
# Reason: a consistent breakpoint set keeps responsive behavior coherent; ad-hoc
# breakpoints fragment the reflow story across surfaces.
echo "[conventions] check: non-canonical @media breakpoints in style.css"
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

# Rule: no committed skipped tests (.skip / .todo / xit).
# Reason: a silently skipped test is a coverage regression nothing reports;
# if a test cannot land, the feature cannot either. Conditional gating via
# describe.skipIf (e.g. smoke suites behind RUN_STAGING_SMOKE) is allowed:
# the condition is explicit and environment-driven, not a silent off switch.
echo "[conventions] check: committed .skip/.todo/xit in tests"
skip_hits=$(grep -rnE --include='*.ts' '(\.skip\(|\.todo\(|\bxit\()' tests/ \
  | grep -v 'skipIf' \
  || true)
if [ -n "$skip_hits" ]; then
  echo "$skip_hits" >&2
  echo "  FAIL: committed skipped tests are forbidden; gate conditionally with skipIf or fix the test" >&2
  violations=$((violations + 1))
fi

# Rule: short-form Handlebars comments must not contain mustaches.
# Reason: {{! ... }} terminates at the FIRST }}, so a comment containing a
# mustache (e.g. an inline {{example}}) ends early and spills its remaining
# text into the rendered page, evaluating any embedded expression along the
# way. Comments that need to mention template syntax use the long form
# {{!-- ... --}} (which tolerates internal mustaches) or plain words.
echo "[conventions] check: short-form {{! comments containing mustaches in templates"
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

# Rule: code comments carry no doc-path references or delivery-epoch labels.
# Reason: .claude/rules/comments.md requires every comment to state a self-
# contained WHY in plain words. Doc paths (docs/, exploration/, or any *.md
# filename) rot independently of the code and mislead once renamed; sprint /
# slice / phase / wave labels are delivery-epoch tags that stop meaning anything
# once the epoch passes. Bare section shorthands (DD §, SC §, US §,
# DATA_GOVERNANCE §) are permitted locators and carry no .md, so they pass. The
# scan parses real // and /* */ comments only, so string literals such as URLs
# (https://...) are not flagged.
echo "[conventions] check: doc-path / epoch-label references in src/ comments"
doc_label_hits=$(python3 - <<'PYEOF'
import re, pathlib

md_re    = re.compile(r'[A-Za-z0-9_./-]+\.md\b')
path_re  = re.compile(r'\b(?:exploration|docs)/')
label_re = re.compile(
    r'\b(?:[Pp]hase|[Ss]lice|[Ww]ave)[ -][0-9A-Z]'
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

# Rule: Handlebars comments carry no doc-path references or delivery-epoch labels.
# Reason: the same self-contained-WHY rule that governs .ts comments applies to
# {{! }} / {{!-- --}} template comments; a doc path or a phase/slice/wave label
# inside one rots when the doc moves or the epoch passes. Only comment spans are
# scanned, so rendered template text is never flagged. Same md/path/label
# patterns as the .ts scan above.
echo "[conventions] check: doc-path / epoch-label references in src/views/**/*.hbs comments"
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
echo "[conventions] check: inline JSON serialization in src/views/**"
json_hits=$(grep -rnE --include='*.hbs' 'JSON\.|stringify' src/views/ || true)
if [ -n "$json_hits" ]; then
  echo "$json_hits" >&2
  echo "  FAIL: emit data islands via the centralized escaping helper; no inline JSON.stringify in templates" >&2
  violations=$((violations + 1))
fi

# Rule: SQL writers use the canonical strftime UTC timestamp, never datetime('now').
# Reason: views, triggers, and string comparisons sort timestamps lexically, so
# every writer must emit strftime('%Y-%m-%dT%H:%M:%fZ','now'); the space-separated
# datetime('now') output breaks lexical=chronological ordering. Scope is the
# production SQL surfaces (db.ts + the schema); test-fixture and pipeline SQL are
# outside this harm model.
echo "[conventions] check: datetime('now') in src/db/db.ts + database/*.sql"
datetime_hits=$(grep -nE "datetime\([[:space:]]*['\"]now['\"]" src/db/db.ts database/*.sql || true)
if [ -n "$datetime_hits" ]; then
  echo "$datetime_hits" >&2
  echo "  FAIL: use strftime('%Y-%m-%dT%H:%M:%fZ','now'); datetime('now') breaks lexical ordering" >&2
  violations=$((violations + 1))
fi

# Rule: templates do not assemble a URL from two or more variables.
# Reason: a logic-light view renders a pre-shaped *Href field; assembling a URL
# from multiple variables in the template moves URL shaping and its escaping out
# of the service and risks a silently malformed link. A single variable (one
# query param, one path segment) is fine. The -o tokenization isolates each
# attribute value so two single-variable links on one line do not false-positive.
echo "[conventions] check: multi-variable href/src URL assembly in src/views/**"
url_hits=$(grep -rnoE --include='*.hbs' '(href|src)="[^"]*"' src/views/ \
  | grep -E '(href|src)="[^"]*\{\{[^}]*\}\}[^"]*\{\{' || true)
if [ -n "$url_hits" ]; then
  echo "$url_hits" >&2
  echo "  FAIL: build URLs from one variable or a pre-shaped *Href field; no multi-variable URL assembly in templates" >&2
  violations=$((violations + 1))
fi

# Rule: templates do not branch on a raw domain enum.
# Reason: the service supplies a pre-shaped boolean (isAdmin, isCompleted);
# branching on a raw role/status/tier/level field in a logic-light view puts an
# authorization or state decision in the template. The dot and the trailing
# space/paren anchor the match to the exact field name, so pre-shaped fields such
# as curatedStatus or statusLabel are not flagged.
echo "[conventions] check: template branching on raw domain enums in src/views/**"
enum_hits=$(grep -rnE --include='*.hbs' '\((eq|neq|gt|lt) [a-zA-Z0-9_.]*\.(role|status|tier|level)( |\))' src/views/ || true)
if [ -n "$enum_hits" ]; then
  echo "$enum_hits" >&2
  echo "  FAIL: branch on a service-supplied boolean, not a raw .role/.status/.tier/.level field" >&2
  violations=$((violations + 1))
fi

# Rule: cookies are set or cleared only through the cookie-helper libs.
# Reason: a session or flash cookie carries HttpOnly/Secure/SameSite attributes
# that must not vary; a direct res.cookie()/res.clearCookie()/Set-Cookie write can
# silently drop one. src/lib/sessionCookie.ts and src/lib/flashCookie.ts are the
# only allowed emission sites.
echo "[conventions] check: direct cookie emission outside the cookie-helper libs"
cookie_hits=$(grep -rnE --include='*.ts' "res\.cookie\(|res\.clearCookie\(|res\.(setHeader|append|header|set)\([[:space:]]*['\"][Ss]et-[Cc]ookie['\"]" src/ \
  | grep -vE 'src/lib/sessionCookie\.ts:|src/lib/flashCookie\.ts:' || true)
if [ -n "$cookie_hits" ]; then
  echo "$cookie_hits" >&2
  echo "  FAIL: set or clear cookies only via src/lib/sessionCookie.ts or src/lib/flashCookie.ts" >&2
  violations=$((violations + 1))
fi

# Rule: SQL uses positional ? parameters, never named :param binds.
# Reason: the codebase binds statements positionally; a named :param mixed into
# the positional convention silently misbinds parameters. Scope is the SQL-
# compiling surfaces (db.ts plus the .prepare-allowlisted dev-bootstrap/testkit).
# ${...} interpolations are stripped first, and the lookbehind excludes :: casts
# and time formats like %H:%M:%fZ.
echo "[conventions] check: named :param SQL binds in SQL-compiling files"
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

# Rule: controllers never execute a db statement directly; SQL stays in services.
# Reason: a controller is HTTP glue (parse, call service, render); reaching into a
# db/db statement group from a controller leaks the data layer past the service
# boundary. Only value-imports from a db/db module are flagged, so adapter calls
# (for example a payment controller's Stripe adapter) are not false-positives.
echo "[conventions] check: controllers executing db statements directly"
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

# Rule: a *_failed operational-error audit row is written via
# recordOperationalError, not appendAuditEntry directly.
# Reason: recordOperationalError pairs the audit row with a logger.error() that
# drives the staging/prod alarm and the in-test guard; a direct appendAuditEntry
# for a *_failed row writes the forensic row with no alarm. The '.failed'
# business-event suffix and dynamic actionType values are excluded.
echo "[conventions] check: appendAuditEntry for *_failed rows in src/services/**"
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

# Rule: synthetic-only identifiers in fixtures/content/scripts.
# Rule: script credential-handling discipline.
# Both delegated to dedicated checkers so their pattern sets stay readable.
echo "[conventions] check: synthetic-only identifiers (delegated)"
if ! bash scripts/ci/check_synthetic_identifiers.sh; then
  violations=$((violations + 1))
fi
echo "[conventions] check: script credential handling (delegated)"
if ! bash scripts/ci/check_script_credentials.sh; then
  violations=$((violations + 1))
fi
echo "[conventions] check: append-only triggers present (delegated)"
if ! bash scripts/ci/check_append_only_triggers.sh; then
  violations=$((violations + 1))
fi
echo "[conventions] check: GitHub Actions SHA-pinning (delegated)"
if ! bash scripts/ci/check_action_pinning.sh; then
  violations=$((violations + 1))
fi

# Rule: the Dependabot config exists and covers the three shipped ecosystems.
# Reason: dependency currency for npm packages, GitHub Actions, and Docker base
# images is automated by Dependabot; a missing or narrowed config silently
# reopens the gap, so presence plus ecosystem coverage is asserted here.
echo "[conventions] check: Dependabot config covers npm + github-actions + docker"
dependabot_missing=""
if [ ! -f .github/dependabot.yml ]; then
  dependabot_missing=".github/dependabot.yml is absent"
else
  for eco in npm github-actions docker; do
    if ! grep -qE "package-ecosystem:[[:space:]]*[\"']?${eco}[\"']?" .github/dependabot.yml; then
      dependabot_missing="${dependabot_missing}${eco} "
    fi
  done
fi
if [ -n "$dependabot_missing" ]; then
  echo "  missing ecosystem coverage: $dependabot_missing" >&2
  echo "  FAIL: .github/dependabot.yml must cover npm, github-actions, and docker" >&2
  violations=$((violations + 1))
fi

if [ "$violations" -gt 0 ]; then
  echo "[conventions] $violations rule(s) violated" >&2
  exit 1
fi

echo "[conventions] all rules pass"
