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
# Current: the scan stops at the "Freestyle records" section banner because
# the freestyle sections below it still predate the font tokens.
# Target: scan the whole file once the freestyle surfaces are tokenized.
echo "[conventions] check: raw font-family outside @font-face in style.css (core region)"
font_hits=$(awk '
  /^   Freestyle records$/ { exit }
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

if [ "$violations" -gt 0 ]; then
  echo "[conventions] $violations rule(s) violated" >&2
  exit 1
fi

echo "[conventions] all rules pass"
