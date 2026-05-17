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
# Reason: SERVICE_CATALOG §3 -- All SQL lives in src/db/db.ts as named
# prepared statements; services call named statements, never compile SQL
# strings inline. Mechanical enforcement prevents business logic from
# leaking into raw SQL surfaces.
#
# Allowlisted exceptions:
#   - src/dev-admin-shortcuts/**   dev-only seed/override tooling; not a service
echo "[conventions] check: .prepare( outside src/db/db.ts"
hits=$(grep -rn --include='*.ts' '\.prepare(' src/ \
  | grep -v '^src/db/db\.ts:' \
  | grep -v '^src/dev-admin-shortcuts/' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: SQL compilation must live in src/db/db.ts" >&2
  violations=$((violations + 1))
fi

# Rule: AWS SDK and Stripe imports live only in src/adapters/.
# Reason: DESIGN_DECISIONS §1.9 -- external service SDK calls must be
# encapsulated behind typed adapter interfaces. Services obtain adapters
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
# Reason: DESIGN_DECISIONS §1.11 -- configuration loads once at startup
# from the host environment into a single typed config singleton; no other
# module reads process.env directly. The singleton fail-fasts on
# misconfiguration and is Object.freeze'd. Scattered process.env reads
# bypass that contract.
#
# Allowlisted exceptions:
#   - src/dev-admin-shortcuts/**                  dev-only tooling; not production code
#   - src/imageWorker.ts                          separate-process entry-point with its own env bootstrap (per file header)
#   - src/services/operationsPlatformService.ts   test-only override (FOOTBAG_TEST_MEMORY_PERCENT) mocking cgroup reads; never set in production
#
# Comment-only mentions (lines whose match is inside a // comment) are
# filtered so src/server.ts and src/transcodeWorker.ts pass without an
# explicit allowlist entry.
echo "[conventions] check: process.env reads outside src/config/env.ts"
hits=$(grep -rn --include='*.ts' 'process\.env' src/ \
  | grep -v -E ':[0-9]+:[[:space:]]*//' \
  | grep -v '^src/config/env\.ts:' \
  | grep -v '^src/dev-admin-shortcuts/' \
  | grep -v '^src/imageWorker\.ts:' \
  | grep -v '^src/services/operationsPlatformService\.ts:' \
  || true)
if [ -n "$hits" ]; then
  echo "$hits" >&2
  echo "  FAIL: process.env reads must go through src/config/env.ts" >&2
  violations=$((violations + 1))
fi

# Rule: templates must not carry inline style="...", <style> blocks, or
# inline <script> tags.
# Reason: DESIGN_DECISIONS §3.12 (security header layering) and VC §4.4
# (asset rules) -- the app's Content-Security-Policy is style-src 'self'
# and script-src 'self'. Inline style/script violates CSP and breaks the
# page silently in production. All CSS lives in src/public/css/style.css;
# all client behavior lives in src/public/js/*.js loaded via <script src>.
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

if [ "$violations" -gt 0 ]; then
  echo "[conventions] $violations rule(s) violated" >&2
  exit 1
fi

echo "[conventions] all rules pass"
