#!/usr/bin/env bash
# smoke-local.sh
# End-to-end smoke check against a running server: status, content, and the
# assets a page needs.
#
# A status code alone passes a page that answered 200 with the error template, an
# empty body, or a stylesheet that 404s, so each page probe also asserts a marker
# only that page renders and the absence of the error template, and the assets the
# home page links are fetched and their types checked.
#
# Usage:
#   # Against npm run dev (port 3000):
#   ./scripts/smoke-local.sh
#
#   # Against Docker Compose stack (port 80). Bring the stack up in another
#   # terminal first with `npm run compose:dev` (auto-teardown on Ctrl+C):
#   BASE_URL=http://localhost ./scripts/smoke-local.sh
#
#   # Against a deployed environment, which adds the checks only a deployed host
#   # can answer (curated media served from the bucket; on production, the payment
#   # webhook reachable through the edge and the live captcha on the sign-in page):
#   BASE_URL=https://<host> SMOKE_ENV=staging ./scripts/smoke-local.sh
#
#   # Against a real origin, which refuses requests that do not carry the
#   # CDN-injected shared secret. Without it every check comes back refused:
#   X_ORIGIN_VERIFY_SECRET=... BASE_URL=http://<origin> ./scripts/smoke-local.sh
#
#   SMOKE_ENV: development (default) | staging | production
#
# Exits 0 if all checks pass, 1 if any fail.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
# Strip a trailing slash so joining `${BASE_URL}${path}` (path starts with `/`)
# never yields a double slash: the app 404s `//events` where `/events` is 200,
# which otherwise fails every check when the configured base URL ends in `/`.
BASE_URL="${BASE_URL%/}"
SMOKE_ENV="${SMOKE_ENV:-development}"
case "$SMOKE_ENV" in
  development|staging|production) ;;
  *) echo "ERROR: SMOKE_ENV must be development, staging or production (got '${SMOKE_ENV}')." >&2; exit 1 ;;
esac
PASS=0
FAIL=0

# Bodies are kept in one private scratch directory, removed on every exit.
WORK_DIR=$(umask 077 && mktemp -d)
ORIGIN_VERIFY_CONFIG=""
cleanup() { rm -rf "${WORK_DIR}"; [ -n "${ORIGIN_VERIFY_CONFIG}" ] && rm -f "${ORIGIN_VERIFY_CONFIG}"; return 0; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# A real origin rejects any request that does not carry the shared secret the CDN
# injects, so checks run against one need that header or every result is a refusal
# that looks like an outage. The value goes into a private config file rather than
# onto the command line, because a command line is readable by every account on the
# host. Absent the variable this is inert, which is the development case.
CURL_OPTS=()
if [ -n "${X_ORIGIN_VERIFY_SECRET:-}" ]; then
  # The value lands inside a quoted curl config string, where a quote, a
  # backslash or a line break would end the string or start a new directive.
  case "${X_ORIGIN_VERIFY_SECRET}" in
    *[\"\\]*|*$'\n'*|*$'\r'*)
      echo "ERROR: X_ORIGIN_VERIFY_SECRET contains a quote, backslash or line break." >&2
      exit 1 ;;
  esac
  ORIGIN_VERIFY_CONFIG=$(umask 077 && mktemp)
  printf 'header = "X-Origin-Verify: %s"\n' "${X_ORIGIN_VERIFY_SECRET}" > "${ORIGIN_VERIFY_CONFIG}"
  CURL_OPTS=(--config "${ORIGIN_VERIFY_CONFIG}")
fi

ok()  { echo "  ✓  $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗  $1"; FAIL=$((FAIL + 1)); }

# fetch <path> <body-file> -> prints "<status> <content-type>"
fetch() {
  curl -s -o "$2" -w "%{http_code} %{content_type}" --max-time 15 \
    ${CURL_OPTS[@]+"${CURL_OPTS[@]}"} "${BASE_URL}$1" || echo "000 -"
}

# Status only: for the health endpoints and the 404 probes.
check() {
  local label="$1" expected="$2" url="$3" actual
  actual=$(fetch "$url" /dev/null)
  actual="${actual%% *}"
  if [ "$actual" = "$expected" ]; then
    ok "${label} (${actual})"
  else
    bad "${label} — expected ${expected}, got ${actual}  [${url}]"
  fi
}

# A page: 200, a marker only that page renders, and not the error template.
check_page() {
  local label="$1" url="$2" marker="$3" body out status
  body="${WORK_DIR}/page"
  out=$(fetch "$url" "$body")
  status="${out%% *}"
  if [ "$status" != "200" ]; then
    bad "${label} — expected 200, got ${status}  [${url}]"
  elif grep -q 'class="error-page"' "$body"; then
    bad "${label} — 200 but the error template rendered  [${url}]"
  elif ! grep -qF -- "$marker" "$body"; then
    bad "${label} — 200 but the page is missing ${marker}  [${url}]"
  else
    ok "${label} (200, content present)"
  fi
}

# Every stylesheet and script a page links: each must answer 200 with the right
# type, so a page that renders with its styles or scripts missing fails here.
check_assets() {
  local page="$1" body="${WORK_DIR}/assets-page" refs ref out status type count=0
  fetch "$page" "$body" >/dev/null
  refs=$( { grep -oE '<link[^>]*rel="stylesheet"[^>]*>' "$body" | grep -oE 'href="/[^"]+"' | sed 's/^href="//; s/"$//' | sed 's/^/css /';
            grep -oE '<script[^>]*src="/[^"]+"' "$body" | grep -oE 'src="/[^"]+"' | sed 's/^src="//; s/"$//' | sed 's/^/js /'; } || true)
  if [ -z "$refs" ]; then
    bad "assets linked from ${page} — none found, so nothing was checked"
    return
  fi
  while read -r kind ref; do
    [ -n "$ref" ] || continue
    ref="${ref//&amp;/&}"
    out=$(fetch "$ref" /dev/null)
    status="${out%% *}"; type="${out#* }"
    count=$((count + 1))
    if [ "$status" != "200" ]; then
      bad "asset ${ref} — expected 200, got ${status}"
    elif [ "$kind" = "css" ] && [[ "$type" != text/css* ]]; then
      bad "asset ${ref} — served as ${type}, not text/css"
    elif [ "$kind" = "js" ] && [[ "$type" != *javascript* ]]; then
      bad "asset ${ref} — served as ${type}, not JavaScript"
    fi
  done <<< "$refs"
  ok "assets linked from ${page} (${count} fetched)"
}

echo "Smoke check: ${BASE_URL} (env: ${SMOKE_ENV})"
echo "────────────────────────────────────────"

# ── Health ────────────────────────────────────────────────────────────────────
check "GET /health/live"                  200 "/health/live"
check "GET /health/ready"                 200 "/health/ready"

# ── Public pages: status, content, and no error template ──────────────────────
check_page "GET / (home)"                        "/"                  'href="/events"'
check_page "GET /clubs"                          "/clubs"             'id="clubs-map"'
check_page "GET /events (landing page)"          "/events"            'href="/events/year/'
check_page "GET /events/year/2025 (year page)"   "/events/year/2025"  '<h1'
check_page "GET /events/year/1899 (empty year)"  "/events/year/1899"  '<h1'

# ── Event detail: must 404 ───────────────────────────────────────────────────
check "GET /events/event_9999_does_not_exist (missing → 404)"    404 "/events/event_9999_does_not_exist"
check "GET /events/not-a-valid-key (bad format → 404)"           404 "/events/not-a-valid-key"

# ── Freestyle section ─────────────────────────────────────────────────────────
# The largest public section, and the one rendering from the most distinct
# templates. A template the runtime account cannot open, or a view-model that
# throws, surfaces here as a 500 while every other section stays green, so
# without these probes a whole section can reach an environment broken and the
# deploy still reports success. The four cover the section landing page, a
# static article, a page built from committed constants, and a database-backed
# index, so a failure confined to any one of those shapes is still caught.
check_page "GET /freestyle (section landing)"          "/freestyle"          'href="/freestyle/'
check_page "GET /freestyle/history (static article)"   "/freestyle/history"  '<h1'
check_page "GET /freestyle/sets (set encyclopedia)"    "/freestyle/sets"     'href="/freestyle/sets/'
check_page "GET /freestyle/tricks (dictionary index)"  "/freestyle/tricks"   'href="/freestyle/tricks'

# ── Assets ────────────────────────────────────────────────────────────────────
check_assets "/"

# ── Deployed environments only ────────────────────────────────────────────────
if [ "$SMOKE_ENV" != "development" ]; then
  # Curated media is served from the bucket through the edge, a path no local
  # stack exercises. One image from the media hub must arrive as an image.
  media_body="${WORK_DIR}/media"
  fetch "/media" "$media_body" >/dev/null
  media_ref=$(grep -oE '/media-store/[^"?]+\.(jpg|jpeg|png|webp)' "$media_body" | head -n 1 || true)
  if [ -z "$media_ref" ]; then
    bad "curated media image on /media — no /media-store/ image linked"
  else
    out=$(fetch "$media_ref" /dev/null)
    if [ "${out%% *}" = "200" ] && [[ "${out#* }" == image/* ]]; then
      ok "curated media image served (${media_ref})"
    else
      bad "curated media image ${media_ref} — got ${out}"
    fi
  fi
fi

if [ "$SMOKE_ENV" = "production" ]; then
  # The payment webhook must be reachable through the edge with its raw-body
  # parser intact: an unsigned delivery is refused with 400 and writes nothing.
  # A 403 or 404 here means Stripe's deliveries are not reaching the app at all.
  webhook_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    ${CURL_OPTS[@]+"${CURL_OPTS[@]}"} -X POST -H 'Content-Type: application/json' \
    --data '{}' "${BASE_URL}/payments/webhook" || echo 000)
  if [ "$webhook_status" = "400" ]; then
    ok "payment webhook reachable and refuses an unsigned delivery (400)"
  else
    bad "payment webhook — expected 400 for an unsigned delivery, got ${webhook_status}"
  fi

  # The live captcha, not a stub or a test key: without it nobody can sign in
  # or register. Cloudflare's published test keys start with 1x, 2x or 3x.
  login_body="${WORK_DIR}/login"
  fetch "/login" "$login_body" >/dev/null
  sitekey=$(grep -oE 'class="cf-turnstile" data-sitekey="[^"]*"' "$login_body" | sed 's/.*data-sitekey="//; s/"$//' | head -n 1 || true)
  if [ -z "$sitekey" ]; then
    bad "captcha on /login — no Turnstile widget rendered"
  elif [[ "$sitekey" =~ ^[123]x0000 ]]; then
    bad "captcha on /login — a Cloudflare test key is configured, not the live one"
  else
    ok "captcha on /login carries a live site key"
  fi
fi

echo "────────────────────────────────────────"
echo "  Passed: ${PASS}   Failed: ${FAIL}"

if [ "$FAIL" -gt 0 ]; then
  echo "SMOKE CHECK FAILED"
  exit 1
else
  echo "SMOKE CHECK PASSED"
  exit 0
fi
