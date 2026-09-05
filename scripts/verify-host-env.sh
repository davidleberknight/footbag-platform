#!/usr/bin/env bash
# verify-host-env.sh
#
# Diff /srv/footbag/env on a deployed Lightsail host against the env contract
# implied by terraform output + the production-hardening invariants enforced by
# src/config/env.ts. Reports each invariant as PASS / FAIL / WARN; exits 1 if
# any critical invariant fails.
#
# Run from the operator workstation. Reads terraform state locally via
# `terraform -chdir=terraform/<target> output -raw <name>` (no AWS API calls
# the operator hasn't already authorised). Reads /srv/footbag/env on the host
# through the shared wire in lib/host-env-remote.sh: the sudo password is line
# one of the ssh stdin stream and the root-side body is cat'd onto the same
# stream, so nothing secret reaches any argument list and no terminal is
# involved. The host keeps no staged copy, so there is nothing to clean up.
#
# Usage (the sudo password is read from stdin, line 1). The credential file is
# per-environment, matching the defaults deploy_to_aws.sh resolves; the path is
# not sensitive, the contents are, so these are pasteable as written:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/verify-host-env.sh
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/verify-host-env.sh --target production
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/verify-host-env.sh --target staging --ssh-alias my-staging-host
#
# Why it exists: the operator-managed /srv/footbag/env file has no automatic
# terraform reconciliation, so most deployed-host configuration drift reduces
# to "what is actually in the host's env file?". This script makes that
# question answerable without ssh-and-grep ad hoc.

# Pipeline note: `set -o pipefail` below makes any SIGPIPE in a pipeline
# surface as exit 141 (= 128 + signal 13). The typical offender is
# `cmd | head -N` because `head` closes its stdin after N lines, leaving
# the upstream producer to SIGPIPE on its next write. If you add a "first
# line" pipeline, prefer `awk 'NR==1'`: it reads stdin to EOF so the
# upstream cannot SIGPIPE. For "last line", GNU `tail -N` is safe
# (buffers, reads to EOF). Do NOT use `awk 'NR==1 {print; exit}'`: `exit`
# reintroduces the same early-close race.
set -euo pipefail

# shellcheck source=lib/host-env-expectations.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-expectations.sh"
# shellcheck source=lib/host-env-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"

TARGET="staging"
SSH_ALIAS=""
HOST_ENV_PATH="/srv/footbag/env"
ENV_FILE_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --ssh-alias)
      SSH_ALIAS="${2:-}"
      shift 2 || { echo "ERROR: --ssh-alias requires an argument" >&2; exit 2; }
      ;;
    --env-file)
      # Synthetic-input mode for tests. Skips both `terraform output` and ssh;
      # reads the env file from the given local path; expects TF_JWT_KMS_KEY_ARN,
      # TF_SES_SENDER, TF_MEDIA_BUCKET in the calling environment. Operators
      # never use this flag in real ops; it exists so the check logic can be
      # exercised in CI against controlled fixtures.
      ENV_FILE_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --env-file requires an argument" >&2; exit 2; }
      ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing
      # the header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

case "$TARGET" in
  staging|production) ;;
  *)
    echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2
    exit 2
    ;;
esac

if [[ -z "$SSH_ALIAS" ]]; then
  SSH_ALIAS="footbag-$TARGET"
fi

if [[ -z "$ENV_FILE_OVERRIDE" ]]; then
  TF_DIR="terraform/$TARGET"
  if [[ ! -d "$TF_DIR" ]]; then
    echo "ERROR: terraform directory $TF_DIR does not exist (run from project root)" >&2
    exit 2
  fi
fi

# -----------------------------------------------------------------------------
# Resolve the terraform-output values that the env-file checks compare against.
# Default: read via `terraform output -raw`. Override mode: read from env vars
# (synthetic-input testing only; operators never set these directly).
# -----------------------------------------------------------------------------
if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  echo "== verifying $TARGET host env (env-file override: $ENV_FILE_OVERRIDE) =="
  echo ""
  echo "Synthetic mode: terraform outputs supplied via env vars."
  TF_JWT_KMS_KEY_ARN="${TF_JWT_KMS_KEY_ARN:-}"
  TF_SES_SENDER="${TF_SES_SENDER:-}"
  TF_MEDIA_BUCKET="${TF_MEDIA_BUCKET:-}"
  if [[ -z "$TF_JWT_KMS_KEY_ARN" || -z "$TF_SES_SENDER" || -z "$TF_MEDIA_BUCKET" ]]; then
    echo "ERROR: --env-file mode requires TF_JWT_KMS_KEY_ARN, TF_SES_SENDER, and TF_MEDIA_BUCKET in the environment." >&2
    exit 2
  fi
else
  echo "== verifying $TARGET host env (ssh alias: $SSH_ALIAS) =="
  echo ""
  echo "Reading terraform outputs from $TF_DIR..."
  TF_JWT_KMS_KEY_ARN="$(terraform -chdir="$TF_DIR" output -raw jwt_signing_key_arn 2>/dev/null || true)"
  TF_SES_SENDER="$(terraform -chdir="$TF_DIR" output -raw ses_sender_identity 2>/dev/null || true)"
  TF_MEDIA_BUCKET="$(terraform -chdir="$TF_DIR" output -raw media_bucket_name 2>/dev/null || true)"
  if [[ -z "$TF_JWT_KMS_KEY_ARN" || -z "$TF_SES_SENDER" || -z "$TF_MEDIA_BUCKET" ]]; then
    echo "ERROR: required terraform outputs are empty. Has 'terraform apply' run for $TARGET?" >&2
    echo "  jwt_signing_key_arn = '$TF_JWT_KMS_KEY_ARN'" >&2
    echo "  ses_sender_identity = '$TF_SES_SENDER'" >&2
    echo "  media_bucket_name   = '$TF_MEDIA_BUCKET'" >&2
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# Read the env file.
#
# Default path (ssh): the shared wire in lib/host-env-remote.sh. /srv/footbag/env
# is root-owned 0600, so something has to run as root to hand it over; the sudo
# password rides the ssh stdin stream ahead of the root-side body, so it never
# reaches an argument list and no terminal is involved. The file comes back
# base64-encoded on its own line, and the host is left holding no staged copy,
# so there is no cleanup for a crash or an interrupt to skip.
#
# Override mode (--env-file): read from the supplied local path. Used by
# the synthetic-input test harness; never used in real ops.
# -----------------------------------------------------------------------------
if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  if [[ ! -f "$ENV_FILE_OVERRIDE" ]]; then
    echo "ERROR: --env-file path '$ENV_FILE_OVERRIDE' does not exist" >&2
    exit 2
  fi
  HOST_ENV_RAW="$(cat "$ENV_FILE_OVERRIDE")"
else
  require_operator_stdin "scripts/verify-host-env.sh --target $TARGET" || exit 1
  require_ssh_alias "$SSH_ALIAS" || exit 1

  umask 077
  ENV_LOCAL="$(mktemp /tmp/footbag-env-verify.XXXXXX)"
  # shred, not rm: the fetched copy is the host's entire secret set.
  cleanup_local() { shred -u "${ENV_LOCAL:-}" 2>/dev/null || rm -f "${ENV_LOCAL:-}"; }
  trap cleanup_local EXIT INT TERM

  echo ""
  echo "Reading $HOST_ENV_PATH from $SSH_ALIAS."
  if ! host_env_fetch "$SSH_ALIAS" "$ENV_LOCAL" "" "$HOST_ENV_PATH"; then
    echo "Common causes:" >&2
    echo "  - the credential file's first line is not the host sudo password" >&2
    echo "  - the operator account lacks general sudo access on the host" >&2
    echo "  - $HOST_ENV_PATH does not exist (host bootstrap incomplete)" >&2
    exit 1
  fi
  HOST_ENV_RAW="$(cat "$ENV_LOCAL")"
fi

# -----------------------------------------------------------------------------
# Parse env file into an associative array. Skip comments and blank lines.
# Accept KEY=value and KEY="value" / KEY='value'. Reject lines that don't
# match (operator-edited typos would otherwise be silently ignored).
# -----------------------------------------------------------------------------
declare -A HOST_ENV
PARSE_ERRORS=0

while IFS= read -r line; do
  # Strip leading whitespace; ignore blank lines and comment lines.
  trimmed="${line#"${line%%[![:space:]]*}"}"
  if [[ -z "$trimmed" || "$trimmed" == \#* ]]; then
    continue
  fi
  # KEY=VALUE; KEY must be [A-Z_][A-Z0-9_]*
  if [[ "$trimmed" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    # Strip surrounding quotes if present.
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    HOST_ENV[$key]="$value"
  else
    # The line is reported by shape, never by content. An unparseable line is
    # most often a mangled assignment, so echoing it verbatim is the one path
    # in this script that would print a secret value in the clear.
    echo "WARN: unparseable line in $HOST_ENV_PATH (${#trimmed} chars, starts '${trimmed:0:12}'); value withheld" >&2
    PARSE_ERRORS=$((PARSE_ERRORS + 1))
  fi
done <<< "$HOST_ENV_RAW"

if (( PARSE_ERRORS > 0 )); then
  echo "WARN: $PARSE_ERRORS unparseable line(s) above; values for those keys were not loaded." >&2
fi

# -----------------------------------------------------------------------------
# Check helpers.
# -----------------------------------------------------------------------------
FAILS=0
WARNS=0

check_pass() {
  printf "  PASS  %s\n" "$1"
}

check_fail() {
  printf "  FAIL  %s\n" "$1"
  FAILS=$((FAILS + 1))
}

check_warn() {
  printf "  WARN  %s\n" "$1"
  WARNS=$((WARNS + 1))
}

# A check that cannot run because something it depends on already failed.
# Counts nothing: the dependency reported the fault, and reporting it twice
# under a different name sends the reader looking for two problems.
check_skip() {
  printf "  SKIP  %s\n" "$1"
}

# Assert host env value equals an expected literal.
check_equals() {
  local key="$1" expected="$2" label="$3"
  local actual="${HOST_ENV[$key]:-}"
  if [[ "$actual" == "$expected" ]]; then
    check_pass "$label: $key=$expected"
  elif [[ -z "$actual" ]]; then
    check_fail "$label: $key is unset (expected '$expected')"
  else
    check_fail "$label: $key=$actual (expected '$expected')"
  fi
}

# Assert host env value matches a regex.
check_matches() {
  local key="$1" pattern="$2" label="$3"
  local actual="${HOST_ENV[$key]:-}"
  if [[ -z "$actual" ]]; then
    check_fail "$label: $key is unset"
  elif [[ "$actual" =~ $pattern ]]; then
    check_pass "$label: $key matches $pattern"
  else
    check_fail "$label: $key='$actual' does not match $pattern"
  fi
}

# Assert host env value is set and non-empty.
check_set() {
  local key="$1" label="$2"
  local actual="${HOST_ENV[$key]:-}"
  if [[ -n "$actual" ]]; then
    check_pass "$label: $key is set"
  else
    check_fail "$label: $key is unset"
  fi
}

# Assert host env value is non-empty AND print what it is. Only for the
# non-secret adapter selectors: check_set above also covers real secrets
# (INTERNAL_EVENT_SECRET, STRIPE_WEBHOOK_SECRET_STUB), whose values must never
# reach a terminal. Selectors need the value shown because their non-protective
# settings boot cleanly: a host on SAFE_BROWSING_ADAPTER=stub or
# HTTP_REACHABILITY_ADAPTER=disabled ships without the protection and passes a
# presence-only check, which is the exact drift this script exists to surface.
check_set_value() {
  local key="$1" label="$2"
  local actual="${HOST_ENV[$key]:-}"
  if [[ -n "$actual" ]]; then
    check_pass "$label: $key=$actual"
  else
    check_fail "$label: $key is unset"
  fi
}

# Assert host env value is unset (or empty).
check_unset() {
  local key="$1" label="$2"
  local actual="${HOST_ENV[$key]:-}"
  if [[ -z "$actual" ]]; then
    check_pass "$label: $key is unset"
  else
    check_fail "$label: $key='$actual' must be unset on $TARGET"
  fi
}

# Return the effective source of a config key at container boot, one of:
#   env-file              /srv/footbag/env sets it explicitly (highest priority)
#   compose-literal       docker-compose hardcodes a literal value
#   compose-default       docker-compose uses ${KEY:-default}: default applies
#                         if /srv/footbag/env doesn't override
#   compose-required-env  docker-compose uses ${KEY:?...}: fails compose-up if
#                         /srv/footbag/env doesn't set it
#   missing               neither source provides it
#
# Probes compose files in the LOCAL working tree (docker/docker-compose.yml +
# docker/docker-compose.prod.yml) because those are what ./deploy_to_aws.sh
# will package and ship. If either compose file is missing, that source is
# skipped silently; operators running this script outside the project root
# would still get the env-file-side checks.
get_effective_source() {
  local key="$1"
  if [[ -n "${HOST_ENV[$key]:-}" ]]; then
    echo "env-file"
    return
  fi
  local cf
  for cf in docker/docker-compose.yml docker/docker-compose.prod.yml; do
    [[ -f "$cf" ]] || continue
    # ${KEY:?...}: compose-required, must be in env file
    if grep -F "\${${key}:?" "$cf" >/dev/null 2>&1; then
      echo "compose-required-env"
      return
    fi
    # ${KEY:-default}: compose provides default, env may override
    if grep -F "\${${key}:-" "$cf" >/dev/null 2>&1; then
      echo "compose-default"
      return
    fi
    # KEY: "value" or KEY: value at YAML indent (not in a comment)
    if grep -qE "^[[:space:]]+${key}:[[:space:]]" "$cf"; then
      echo "compose-literal"
      return
    fi
  done
  echo "missing"
}

# Assert that a key is reachable by env.ts at container boot via EITHER
# /srv/footbag/env OR a docker-compose-side hardcoded value / default. FAIL
# only if neither source provides it (or if compose marks it required and the
# env file doesn't set it). Calibrated for the adversarial readiness audit:
# catches a future regression where someone deletes the compose hardcode AND
# the env file doesn't cover the gap.
check_reachable_at_boot() {
  local key="$1" label="$2"
  local src
  src=$(get_effective_source "$key")
  case "$src" in
    env-file)
      check_pass "$label: $key from /srv/footbag/env"
      ;;
    compose-literal)
      check_pass "$label: $key hardcoded in docker-compose"
      ;;
    compose-default)
      check_pass "$label: $key from docker-compose default (env file may override)"
      ;;
    compose-required-env)
      check_fail "$label: $key marked required in docker-compose (\${$key:?...}) but unset in /srv/footbag/env"
      ;;
    missing)
      check_fail "$label: $key unset everywhere (neither /srv/footbag/env nor docker-compose provides it)"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Critical invariants. Each failure is a deploy-blocker.
# -----------------------------------------------------------------------------
echo ""
echo "Critical invariants:"

# Env discriminator + cross-invariant (mirrors R1: FOOTBAG_ENV in {staging,
# production} requires NODE_ENV=production; src/config/env.ts enforces this
# at module load, but only after dotenv has populated process.env from
# /srv/footbag/env. This check catches a misconfigured host before the
# container even starts.)
check_equals "FOOTBAG_ENV" "$TARGET" "env discriminator"
check_equals "NODE_ENV" "production" "NODE_ENV cross-invariant"

# Session secret hardening. Checked by name against the development fallback and
# again by negative properties, so lengthening the literal one day still fails
# this gate on a host rather than sliding under the length check.
SESSION_SECRET_ACTUAL="${HOST_ENV[SESSION_SECRET]:-}"
if [[ -z "$SESSION_SECRET_ACTUAL" ]]; then
  check_fail "session secret: SESSION_SECRET is unset"
elif [[ "$SESSION_SECRET_ACTUAL" == "dev-session-secret-not-for-prod" ]]; then
  check_fail "session secret: SESSION_SECRET is the dev-default literal (must be a fresh value on $TARGET)"
elif [[ ${#SESSION_SECRET_ACTUAL} -lt 32 ]]; then
  check_fail "session secret: SESSION_SECRET is ${#SESSION_SECRET_ACTUAL} chars (need >= 32)"
elif [[ "${SESSION_SECRET_ACTUAL,,}" == *changeme* ]]; then
  check_fail "session secret: SESSION_SECRET contains 'changeme' placeholder"
else
  check_pass "session secret: SESSION_SECRET present, not the dev default, >= 32 chars, no 'changeme'"
fi

# JWT signing.
check_equals "JWT_SIGNER" "kms" "JWT signer"

# The signing adapter stamps this value into every session token's `kid` header
# and rejects any token whose `kid` differs, so it is both published to clients
# and load-bearing. The alias is the intended form; the key's own ARN works, and
# is therefore an advisory rather than a failure, but it publishes the AWS
# account id and the key uuid to everyone holding a session, and moving off it
# logs those sessions out. Anything else is neither.
JWT_KEY_EXPECTED="$(expected_jwt_kms_key_id "$TARGET")"
JWT_KEY_ACTUAL="${HOST_ENV[JWT_KMS_KEY_ID]:-}"
if [[ "$JWT_KEY_ACTUAL" == "$JWT_KEY_EXPECTED" ]]; then
  check_pass "JWT KMS key: JWT_KMS_KEY_ID=$JWT_KEY_EXPECTED"
elif [[ -z "$JWT_KEY_ACTUAL" ]]; then
  check_fail "JWT KMS key: JWT_KMS_KEY_ID is unset (expected '$JWT_KEY_EXPECTED')"
elif [[ -n "$TF_JWT_KMS_KEY_ARN" && "$JWT_KEY_ACTUAL" == "$TF_JWT_KMS_KEY_ARN" ]]; then
  check_warn "JWT KMS key: JWT_KMS_KEY_ID is the key ARN, not '$JWT_KEY_EXPECTED'; it signs correctly but publishes the AWS account id in every session token's kid header. Changing it invalidates every session on this host, so schedule it rather than doing it under load."
else
  check_fail "JWT KMS key: JWT_KMS_KEY_ID=$JWT_KEY_ACTUAL is neither the alias '$JWT_KEY_EXPECTED' nor the key ARN terraform built"
fi

# Arming switches. Deploy-synced from the SSM app/* parameters on every
# deploy; a host missing them predates the sync and needs a redeploy.
check_matches "PAYMENTS_ARMED" '^(armed|dark)$' "payments arming switch (deploy-synced from SSM app/payments_armed)"
check_matches "EMAIL_SEND_ARMED" '^(armed|dark)$' "email arming switch (deploy-synced from SSM app/email_send_armed)"
if [[ "$TARGET" == "staging" ]]; then
  check_equals "PAYMENTS_ARMED" "armed" "payments arming switch (staging seeds 'armed'; inert below production)"
  check_equals "EMAIL_SEND_ARMED" "armed" "email arming switch (staging seeds 'armed'; inert below production)"
fi

# The two link-protection switches, deploy-synced the same way. Unlike the pair
# above they are not inert below production: screening and probing a submitted
# link have no real-world side effect to withhold from a lower environment, so
# these decide what this host actually does and both environments are checked
# the same way.
check_matches "URL_SCREENING_ARMED" '^(armed|dark)$' "URL screening arming switch (deploy-synced from SSM app/url_screening_armed)"
check_matches "REACHABILITY_ARMED" '^(armed|dark)$' "reachability arming switch (deploy-synced from SSM app/reachability_armed)"

# SES. Staging runs the stub adapter: email-gated flows use the in-page
# simulated-email card, and live SES delivery is possible in production only.
# On production the deploy derives the adapter from the email arming flag
# (armed -> live, dark -> stub), so the expectation follows the flag.
if [[ "$TARGET" == "staging" ]]; then
  check_equals "SES_ADAPTER" "stub" "SES adapter (staging runs the stub adapter; live SES is production-only)"
elif [[ "${HOST_ENV[EMAIL_SEND_ARMED]:-}" == "dark" ]]; then
  check_equals "SES_ADAPTER" "stub" "SES adapter (email dark: the stub is the required state)"
else
  check_equals "SES_ADAPTER" "live" "SES adapter"
  check_equals "SES_FROM_IDENTITY" "$TF_SES_SENDER" "SES sender identity matches terraform"
fi

# Captcha. The one adapter that genuinely differs between the two environments
# and, until now, the one nothing asserted: a divergence nothing states is
# indistinguishable from a divergence nobody intended.
#
# Staging is pinned, because a live captcha there is not a preference but a
# broken environment: a tester has no way to solve a challenge staging is not
# wired to serve. Production is only required to be set: activating the live
# captcha is its own operator step, and a host that has not reached it yet is
# early rather than misconfigured. The runtime refuses to boot a production
# process on the stub, which is the harder guarantee.
if [[ "$TARGET" == "staging" ]]; then
  check_equals "CAPTCHA_ADAPTER" "stub" "captcha adapter (staging never challenges: no live captcha is wired there)"
  check_skip "captcha site key: not required (staging runs the stub adapter, which challenges nobody)"
else
  check_set_value "CAPTCHA_ADAPTER" "captcha adapter (expected 'live' once production captcha is activated)"
  # The public half of the widget pair. The live adapter requires it at boot, so
  # a production host without it does not start; it is committed in
  # docker/env/production.env and reconciled every deploy, which is what this
  # confirms. It is not a secret: every visitor receives it in the page markup.
  check_set_value "TURNSTILE_SITE_KEY" "captcha site key (public; required whenever the live captcha adapter runs)"
fi

# Media storage.
check_equals "MEDIA_STORAGE_ADAPTER" "s3" "media storage adapter"
check_equals "MEDIA_STORAGE_S3_BUCKET" "$TF_MEDIA_BUCKET" "media bucket matches terraform"

# AWS region + other live-adapter dependencies.
check_set "AWS_REGION" "AWS region"
check_set_value "SECRETS_ADAPTER" "secrets adapter (expected: 'live' on $TARGET)"

# The two protective selectors are derived from their switches on every deploy,
# so the expectation follows the switch rather than merely requiring a value.
# Presence alone would pass a host shipping without the protection, because a
# selector on its non-protective value boots exactly as cleanly as one on its
# protective value.
case "${HOST_ENV[URL_SCREENING_ARMED]:-}" in
  dark)
    check_equals "SAFE_BROWSING_ADAPTER" "stub" "safe-browsing adapter (screening dark: the stub is the required state, and every submitted link goes unscreened)" ;;
  armed)
    check_equals "SAFE_BROWSING_ADAPTER" "live" "safe-browsing adapter (screening armed)" ;;
  *)
    check_skip "safe-browsing adapter: not checkable while URL_SCREENING_ARMED is ${HOST_ENV[URL_SCREENING_ARMED]:+invalid }${HOST_ENV[URL_SCREENING_ARMED]:-unset} (SAFE_BROWSING_ADAPTER=${HOST_ENV[SAFE_BROWSING_ADAPTER]:-<unset>}); terraform apply publishes the switch, the next deploy syncs it" ;;
esac
case "${HOST_ENV[REACHABILITY_ARMED]:-}" in
  dark)
    check_equals "HTTP_REACHABILITY_ADAPTER" "disabled" "HTTP reachability adapter (reachability dark: no outbound probe from the validation path)" ;;
  armed)
    check_equals "HTTP_REACHABILITY_ADAPTER" "live" "HTTP reachability adapter (reachability armed)" ;;
  *)
    check_skip "HTTP reachability adapter: not checkable while REACHABILITY_ARMED is ${HOST_ENV[REACHABILITY_ARMED]:+invalid }${HOST_ENV[REACHABILITY_ARMED]:-unset} (HTTP_REACHABILITY_ADAPTER=${HOST_ENV[HTTP_REACHABILITY_ADAPTER]:-<unset>}); terraform apply publishes the switch, the next deploy syncs it" ;;
esac
check_set "PAYMENT_ADAPTER" "payment adapter (expected: 'stub' on staging always; on production the deploy derives it from the payments arming flag)"
if [[ "$TARGET" != "staging" && "${HOST_ENV[PAYMENTS_ARMED]:-}" == "dark" ]]; then
  check_equals "PAYMENT_ADAPTER" "stub" "payment adapter (payments dark: the stub is the required state)"
fi
# A stub-adapter host signs and verifies webhooks with a secret that, absent
# this value, is the constant committed to the repository: anyone with a copy
# could forge a delivery the endpoint accepts. The runtime refuses to boot
# without it; checking here reports it before the deploy gets that far.
if [[ "${HOST_ENV[PAYMENT_ADAPTER]:-}" == "stub" ]]; then
  check_set "STRIPE_WEBHOOK_SECRET_STUB" "stub webhook signing secret (required whenever the stub adapter serves a reachable endpoint)"
fi

# Internal-event secret. Must not be the development fallback literal. Checked
# by name below and again by a negative property, length, so a future change to
# the literal still fails this gate on a host.
INTERNAL_SECRET_ACTUAL="${HOST_ENV[INTERNAL_EVENT_SECRET]:-}"
if [[ -z "$INTERNAL_SECRET_ACTUAL" ]]; then
  check_fail "internal event secret: INTERNAL_EVENT_SECRET is unset"
elif [[ "$INTERNAL_SECRET_ACTUAL" == "dev-internal-event-secret-not-for-prod" ]]; then
  check_fail "internal event secret: INTERNAL_EVENT_SECRET is the dev-default literal (must be a fresh value on $TARGET)"
elif [[ ${#INTERNAL_SECRET_ACTUAL} -lt 32 ]]; then
  check_warn "internal event secret: INTERNAL_EVENT_SECRET is ${#INTERNAL_SECRET_ACTUAL} chars (suggest >= 32 for collision resistance)"
else
  check_pass "internal event secret: INTERNAL_EVENT_SECRET present, not the dev default"
fi

# The queue the worker polls for bounce and complaint notifications. A host
# running live SES with no queue records no bounce and no complaint: sending
# carries on and the platform's own view of which mailboxes are dead stops
# being updated, which is invisible until a member reports mail they should
# never have received.
SES_FEEDBACK_QUEUE_ACTUAL="${HOST_ENV[SES_FEEDBACK_QUEUE_URL]:-}"
if [[ "${HOST_ENV[SES_ADAPTER]:-}" != "live" ]]; then
  check_pass "ses feedback queue: not required (SES_ADAPTER is not 'live')"
elif [[ -z "$SES_FEEDBACK_QUEUE_ACTUAL" ]]; then
  check_fail "ses feedback queue: SES_FEEDBACK_QUEUE_URL is unset, so no bounce or complaint is ever recorded (enable the feed queues in terraform, then run scripts/set-host-env.sh)"
else
  check_pass "ses feedback queue: SES_FEEDBACK_QUEUE_URL present"
fi

# Expected publishing topic per SNS feed. The webhooks authenticate on the shared
# key AND the topic, because a valid signature proves only that some topic in
# some AWS account signed the payload. A host with the key and no topic refuses
# every delivery, which looks like a dead feed rather than a misconfiguration,
# so it is checked here alongside the key.
SES_FEEDBACK_ARN_ACTUAL="${HOST_ENV[SES_FEEDBACK_TOPIC_ARN]:-}"
if [[ "${HOST_ENV[SES_ADAPTER]:-}" != "live" ]]; then
  check_pass "ses feedback topic: not required (SES_ADAPTER is not 'live')"
elif [[ -z "$SES_FEEDBACK_ARN_ACTUAL" ]]; then
  check_fail "ses feedback topic: SES_FEEDBACK_TOPIC_ARN is unset, so every feedback delivery is refused (run scripts/set-host-env.sh, which writes the topic ARNs from the Terraform outputs)"
elif [[ ! "$SES_FEEDBACK_ARN_ACTUAL" =~ ^arn:aws:sns: ]]; then
  check_fail "ses feedback topic: SES_FEEDBACK_TOPIC_ARN is not an SNS topic ARN"
else
  check_pass "ses feedback topic: SES_FEEDBACK_TOPIC_ARN present"
fi

# The two sending streams. Both are optional in the runtime config, so an
# absent value degrades to the account's default reputation rather than
# refusing to boot: bulk complaints would then drag transactional delivery down
# with them and nothing would say so. That silence is why this is checked here
# rather than left to the process.
SES_SET_TRANSACTIONAL="${HOST_ENV[SES_CONFIGURATION_SET_TRANSACTIONAL]:-}"
SES_SET_BULK="${HOST_ENV[SES_CONFIGURATION_SET_BULK]:-}"
if [[ "${HOST_ENV[SES_ADAPTER]:-}" != "live" ]]; then
  check_pass "ses configuration sets: not required (SES_ADAPTER is not 'live')"
elif [[ -z "$SES_SET_TRANSACTIONAL" || -z "$SES_SET_BULK" ]]; then
  check_fail "ses configuration sets: SES_CONFIGURATION_SET_TRANSACTIONAL and _BULK must both be set, or bulk and transactional mail share one sending reputation (run scripts/set-host-env.sh, which writes them from the Terraform outputs)"
elif [[ "$SES_SET_TRANSACTIONAL" == "$SES_SET_BULK" ]]; then
  check_fail "ses configuration sets: both names are '$SES_SET_BULK', so the two streams are not separated at all"
else
  check_pass "ses configuration sets: transactional and bulk are separate"
fi

ALARM_ARN_ACTUAL="${HOST_ENV[ALARM_TOPIC_ARN]:-}"
ALARM_QUEUE_ACTUAL="${HOST_ENV[ALARM_QUEUE_URL]:-}"
if [[ -z "$ALARM_QUEUE_ACTUAL" && -z "$ALARM_ARN_ACTUAL" ]]; then
  check_pass "alarm feed: not configured (alarms still reach the operator mailbox)"
elif [[ -z "$ALARM_ARN_ACTUAL" ]]; then
  check_fail "alarm feed: ALARM_QUEUE_URL is set but ALARM_TOPIC_ARN is not, so every alarm read is refused as unattributable"
elif [[ -z "$ALARM_QUEUE_ACTUAL" ]]; then
  check_fail "alarm feed: ALARM_TOPIC_ARN is set but ALARM_QUEUE_URL is not, so no alarm reaches the admin surface"
else
  check_pass "alarm feed: ALARM_QUEUE_URL and ALARM_TOPIC_ARN both present"
fi

# Public-facing required vars.
check_set "PUBLIC_BASE_URL" "public base URL"
check_set "FOOTBAG_DB_PATH" "database path"

# PORT is hardcoded in docker/docker-compose.yml (web + worker services) and
# docker/docker-compose.prod.yml. /srv/footbag/env doesn't need to set it;
# the adversarial check catches a regression where the compose hardcode is
# removed AND the env file doesn't cover the gap.
check_reachable_at_boot "PORT" "app port"

# IMAGE_PROCESSOR_URL: docker-compose provides ${IMAGE_PROCESSOR_URL:-http://image:4000}
# in prod overlay (env may override). When env file DOES override, it must
# not point at localhost (the staging container's localhost is itself, not
# the image worker; the in-stack service name `image` is correct).
check_reachable_at_boot "IMAGE_PROCESSOR_URL" "image processor URL"
if [[ -n "${HOST_ENV[IMAGE_PROCESSOR_URL]:-}" ]]; then
  if [[ "${HOST_ENV[IMAGE_PROCESSOR_URL]}" == *localhost* || "${HOST_ENV[IMAGE_PROCESSOR_URL]}" == *127.0.0.1* ]]; then
    check_fail "image processor URL: /srv/footbag/env override '${HOST_ENV[IMAGE_PROCESSOR_URL]}' references localhost (expected docker service name like 'image:4000')"
  fi
fi

# VIDEO_PROCESSOR_URL inherits from IMAGE_PROCESSOR_URL in env.ts when unset,
# so it's only a failure if BOTH are missing across env + compose. Same
# localhost guard for env-file overrides.
video_src=$(get_effective_source "VIDEO_PROCESSOR_URL")
image_src=$(get_effective_source "IMAGE_PROCESSOR_URL")
if [[ "$video_src" == "missing" && "$image_src" == "missing" ]]; then
  check_fail "video processor URL: VIDEO_PROCESSOR_URL and IMAGE_PROCESSOR_URL both unset everywhere"
elif [[ "$video_src" == "missing" ]]; then
  check_pass "video processor URL: VIDEO_PROCESSOR_URL unset (inherits IMAGE_PROCESSOR_URL per env.ts; that source is $image_src)"
else
  check_reachable_at_boot "VIDEO_PROCESSOR_URL" "video processor URL"
fi
if [[ -n "${HOST_ENV[VIDEO_PROCESSOR_URL]:-}" ]]; then
  if [[ "${HOST_ENV[VIDEO_PROCESSOR_URL]}" == *localhost* || "${HOST_ENV[VIDEO_PROCESSOR_URL]}" == *127.0.0.1* ]]; then
    check_fail "video processor URL: /srv/footbag/env override '${HOST_ENV[VIDEO_PROCESSOR_URL]}' references localhost"
  fi
fi

# -----------------------------------------------------------------------------
# Dev-shortcut presence is forbidden on production; staging permits the
# allowlist transport, refuses the others.
# -----------------------------------------------------------------------------
echo ""
echo "Dev-shortcut posture for $TARGET:"

# This one is staging-allowed, production-forbidden.
STAGING_ALLOWED_VARS=(
  FOOTBAG_DEV_INITIAL_ADMIN_EMAILS
)
for KEY in "${STAGING_ALLOWED_VARS[@]}"; do
  ACTUAL="${HOST_ENV[$KEY]:-}"
  if [[ "$TARGET" == "production" ]]; then
    check_unset "$KEY" "production-forbidden dev shortcut"
  else
    if [[ -n "$ACTUAL" ]]; then
      check_pass "staging-allowed shortcut: $KEY is set"
    else
      check_warn "staging-allowed shortcut: $KEY is unset (the operator can add allowlist emails to bootstrap admins later)"
    fi
  fi
done

# -----------------------------------------------------------------------------
# Advisory checks (informational; do not fail the run).
# -----------------------------------------------------------------------------
echo ""
echo "Advisory:"

# TRUST_PROXY should be the exact integer X-Forwarded-For hop count of the
# chain in front of the app (staging: CloudFront -> nginx = 2). Unset or
# non-integer falls back to named ranges in env.ts, which fails closed:
# req.ip resolves to the CloudFront edge address and per-IP rate limiting
# coarsens to per-edge buckets.
if [[ "${HOST_ENV[TRUST_PROXY]:-}" =~ ^[0-9]+$ ]]; then
  check_pass "trust proxy: TRUST_PROXY=${HOST_ENV[TRUST_PROXY]} (integer hop count)"
else
  check_warn "trust proxy: TRUST_PROXY is not an integer XFF hop count ($TARGET: $(expected_trust_proxy_note "$TARGET")); rate limiting degrades to coarse per-edge buckets under the named-range fallback. Set it with scripts/set-host-env.sh --target $TARGET"
fi

# BACKUP_S3_BUCKET feeds the footbag-backup systemd timer, not app boot:
# backup-db.sh refuses to run without it, so an unset value means no
# snapshots upload once the timer is installed.
if [[ -n "${HOST_ENV[BACKUP_S3_BUCKET]:-}" ]]; then
  check_pass "backup bucket: BACKUP_S3_BUCKET=${HOST_ENV[BACKUP_S3_BUCKET]}"
else
  check_warn "backup bucket: BACKUP_S3_BUCKET unset; footbag-backup.timer cannot upload snapshots without it"
fi

# -----------------------------------------------------------------------------
# Container sizing. The committed docker/env/<target>.env is the source of
# truth; the deploy seeds it into /srv/footbag/env. Assert the host matches:
# keys the file lists must equal it; managed keys it omits must be unset on the
# host (the deploy clears omitted managed keys so they fall back to the
# canonical compose defaults).
# -----------------------------------------------------------------------------
SIZING_CFG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)/docker/env/${TARGET}.env"
# Every key both deploy halves are allowed to seed. A key a deploy seeds but
# this list omits is drift nobody can see: the verifier passes while the host
# runs a value the committed file never intended.
SIZING_KEYS=(NGINX_MEMORY_LIMIT WEB_MEMORY_LIMIT WORKER_MEMORY_LIMIT IMAGE_MEMORY_LIMIT \
             IMAGE_MAX_CONCURRENT VIDEO_X264_PRESET VIDEO_X264_THREADS VIDEO_X264_RC_LOOKAHEAD \
             VIDEO_MAX_HEIGHT FFMPEG_TIMEOUT_SECONDS VIDEO_TRANSCODE_TIMEOUT_MS \
             VIDEO_MIN_HOST_AVAILABLE_MB)
if [[ -f "$SIZING_CFG" ]]; then
  declare -A SIZING_EXPECTED=()
  while IFS= read -r sline || [[ -n "$sline" ]]; do
    sline="${sline%$'\r'}"
    [[ "$sline" =~ ^[[:space:]]*(#|$) ]] && continue
    skey="${sline%%=*}"; sval="${sline#*=}"
    skey="${skey//[[:space:]]/}"
    SIZING_EXPECTED[$skey]="$sval"
  done < "$SIZING_CFG"
  # Advisory: the deploy seeds these from docker/env/<target>.env (the hard
  # guarantee), so a mismatch here is drift to flag, not a launch blocker.
  for skey in "${SIZING_KEYS[@]}"; do
    if [[ -n "${SIZING_EXPECTED[$skey]+x}" ]]; then
      if [[ "${HOST_ENV[$skey]:-}" == "${SIZING_EXPECTED[$skey]}" ]]; then
        check_pass "container sizing: $skey=${SIZING_EXPECTED[$skey]}"
      else
        check_warn "container sizing: $skey=${HOST_ENV[$skey]:-<unset>} (docker/env/${TARGET}.env expects '${SIZING_EXPECTED[$skey]}'; the deploy seeds it)"
      fi
    elif [[ -n "${HOST_ENV[$skey]:-}" ]]; then
      check_warn "container sizing: $skey=${HOST_ENV[$skey]} set on host but docker/env/${TARGET}.env omits it (the deploy clears it)"
    else
      check_pass "container sizing: $skey unset (matches docker/env/${TARGET}.env)"
    fi
  done
else
  check_fail "container sizing: committed config $SIZING_CFG not found"
fi

# -----------------------------------------------------------------------------
# Summary.
# -----------------------------------------------------------------------------
echo ""
echo "Summary:"
printf "  Fails:    %d\n" "$FAILS"
printf "  Warns:    %d\n" "$WARNS"

if (( FAILS > 0 )); then
  echo ""
  # Deliberately not "edit the host env file": most values on that host have a
  # declared owner, and hand-editing one is undone by the next deploy. Each
  # failure above names what owns the value it is about.
  echo "$FAILS critical invariant(s) failed on $SSH_ALIAS. Fix each at its owner before deploying:" >&2
  echo "  an arming switch (payments, email, URL screening, reachability)" >&2
  echo "      -> scripts/arming.sh --target <environment> --switch <name> --state armed|dark" >&2
  echo "         That script owns the values file, the apply and the deploy, in order." >&2
  echo "         Doing them by hand is how a switch and its selector end up disagreeing." >&2
  echo "  a derived selector (safe-browsing, reachability, SES, payment)" >&2
  echo "      -> not editable here: fix its switch above, or redeploy if the switch is right" >&2
  echo "  a committed constant (media storage, secrets, JWT signer, captcha and its site key, sizing)" >&2
  echo "      -> docker/env/<environment>.env, then deploy" >&2
  echo "  a deploy-synced value (session secret, origin verify, JWT key id, media bucket)" >&2
  echo "      -> owned by Terraform and written by the deploy: redeploy" >&2
  echo "  an operator-run value (proxy hops, backup bucket, topics, queues, sender)" >&2
  echo "      -> scripts/set-host-env.sh" >&2
  echo "  anything else (public base URL, env label, DB path, AWS profile/region," >&2
  echo "  captcha site key) is still hand-set on the host; edit it there." >&2
  exit 1
fi

echo ""
echo "All critical invariants passed. $WARNS advisory item(s); review above."
exit 0
