#!/usr/bin/env bash
# smoke-security.sh
# Blocking security probes for the post-deploy smoke gate. Sibling of
# smoke-local.sh: same check/PASS/FAIL style, run by both deploy scripts
# right after the route smoke, and runnable standalone against any target.
#
# Probes (each a sub-second HTTP check):
#   auth-gate      unauthenticated requests to a member-only and an admin-only
#                  route must redirect to the login page, never serve content.
#   anti-enum      POST /password/forgot must return an identical response for
#                  a registered and an unregistered address, so the endpoint
#                  leaks nothing about account existence. Not run against
#                  production (the registered-address branch enqueues a real
#                  reset email). Note: this probe is deliberately not read-only
#                  on staging/dev — the registered branch mints a reset token
#                  and enqueues mail to the non-deliverable test address.
#   dev-surface    the dev/test harness must match the environment contract:
#                  absent (404) in production, where the image strip and the
#                  env-gated mount exclude it; present in staging/development,
#                  where persona seeding depends on it. The production
#                  first-admin route /admin/bootstrap-claim is NOT part of this
#                  surface and is never probed: it is a real production route.
#
# Usage:
#   BASE_URL=https://<target> SMOKE_ENV=staging ./scripts/smoke-security.sh
#
#   SMOKE_ENV: development | staging | production (required)
#
# Exits 0 if all probes pass, 1 if any fail.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
SMOKE_ENV="${SMOKE_ENV:-}"

case "$SMOKE_ENV" in
  development|staging|production) ;;
  *)
    echo "ERROR: SMOKE_ENV must be 'development', 'staging', or 'production' (got '${SMOKE_ENV}')." >&2
    exit 1
    ;;
esac

# The anti-enumeration probe needs one login email that is registered on the
# target. Every dev and staging build seeds the canonical test personas, whose
# addresses derive as <slug>@personas.test (a reserved, undeliverable domain),
# so the first canonical persona is always present wherever the probe runs.
REGISTERED_PROBE_EMAIL="t0_fresh@personas.test"

PASS=0
FAIL=0

pass() { echo "  ✓  $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗  $1"; FAIL=$((FAIL + 1)); }

status_of() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}$1"
}

# Assert an unauthenticated GET is turned away to the login page (302 with a
# Location that lands on /login), so the route serves no content anonymously.
check_login_redirect() {
  local label="$1"
  local path="$2"
  local out status location
  out=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 10 "${BASE_URL}${path}")
  status="${out%% *}"
  location="${out#* }"
  if [[ "$status" == "302" && "$location" == *"/login"* ]]; then
    pass "${label} (302 → login)"
  else
    fail "${label} — expected 302 to /login, got ${status} → ${location:-<none>}  [${path}]"
  fi
}

check_status() {
  local label="$1"
  local expected="$2"
  local path="$3"
  local actual
  actual=$(status_of "$path")
  if [[ "$actual" == "$expected" ]]; then
    pass "${label} (${actual})"
  else
    fail "${label} — expected ${expected}, got ${actual}  [${path}]"
  fi
}

# Strip per-render attribute values that legitimately differ between two
# renders of the same page (form value refill), then collapse whitespace, so
# the comparison sees only structural/content difference — the signal that
# would leak account existence.
normalize_body() {
  sed 's/value="[^"]*"//g' | tr -s '[:space:]' ' '
}

echo "Security smoke: ${BASE_URL} (env: ${SMOKE_ENV})"
echo "────────────────────────────────────────"

# ── Auth-gate enforcement ─────────────────────────────────────────────────────
check_login_redirect "member-only route gated"  "/members/placeholder/edit"
check_login_redirect "admin-only route gated"   "/admin/"
if [[ "$SMOKE_ENV" != "production" ]]; then
  check_login_redirect "internal tooling gated" "/internal/"
fi

# ── Anti-enumeration response equivalence ─────────────────────────────────────
if [[ "$SMOKE_ENV" == "production" ]]; then
  echo "  -  anti-enumeration probe skipped on production (registered branch sends real mail)"
else
  post_forgot() {
    # Origin header satisfies the origin-pin CSRF perimeter. The captcha token
    # is a placeholder: the stub adapter accepts it; under a live captcha both
    # branches get the identical captcha-failed page, so equivalence still holds.
    curl -s --max-time 10 \
      -H "Origin: ${BASE_URL}" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "email=$1" \
      --data-urlencode "cf-turnstile-response=smoke-security-probe" \
      -w '\n%{http_code}' \
      "${BASE_URL}/password/forgot"
  }
  registered_raw=$(post_forgot "$REGISTERED_PROBE_EMAIL")
  unregistered_raw=$(post_forgot "smoke-probe-unregistered@example.com")
  registered_status="${registered_raw##*$'\n'}"
  unregistered_status="${unregistered_raw##*$'\n'}"
  registered_body=$(printf '%s' "${registered_raw%$'\n'*}" | normalize_body)
  unregistered_body=$(printf '%s' "${unregistered_raw%$'\n'*}" | normalize_body)
  if [[ "$registered_status" != "$unregistered_status" ]]; then
    fail "password-forgot equivalence — status differs by account existence (${registered_status} vs ${unregistered_status})"
  elif [[ "$registered_body" != "$unregistered_body" ]]; then
    fail "password-forgot equivalence — response body differs by account existence (status ${registered_status})"
  else
    pass "password-forgot equivalence (identical ${registered_status} both ways)"
  fi
fi

# ── Dev-surface environment contract ──────────────────────────────────────────
if [[ "$SMOKE_ENV" == "production" ]]; then
  check_status "dev harness absent: /dev/switch"    404 "/dev/switch"
  check_status "dev harness absent: /dev/personas"  404 "/dev/personas"
  check_status "dev harness absent: /dev/outbox"    404 "/dev/outbox"
  check_status "internal tooling absent: /internal/" 404 "/internal/"
else
  check_status "dev harness present: /dev/personas" 200 "/dev/personas"
fi

echo "────────────────────────────────────────"
echo "  Passed: ${PASS}   Failed: ${FAIL}"

if [[ "$FAIL" -gt 0 ]]; then
  echo "SECURITY SMOKE FAILED"
  exit 1
else
  echo "SECURITY SMOKE PASSED"
  exit 0
fi
