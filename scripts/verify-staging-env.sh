#!/usr/bin/env bash
# verify-staging-env.sh
#
# Diff /srv/footbag/env on a deployed Lightsail host against the env contract
# implied by terraform output + the production-hardening invariants enforced by
# src/config/env.ts. Reports each invariant as PASS / FAIL / WARN; exits 1 if
# any critical invariant fails.
#
# Run from the operator workstation. Reads terraform state locally via
# `terraform -chdir=terraform/<target> output -raw <name>` (no AWS API calls
# the operator hasn't already authorised). Reads /srv/footbag/env on the host
# via the user-tmp + sudo install pattern: `ssh -t` allocates a remote PTY so
# the remote sudo can prompt for the operator's password on the LOCAL terminal,
# sudo install stages the file (root:0600) to an operator-owned 0600 temp path,
# and a plain `ssh cat` reads it. The password is never piped or captured; the
# operator types it directly into the sudo prompt (TTY noecho). A trap removes
# the staged temp file on every exit path.
#
# Usage:
#   scripts/verify-staging-env.sh                          # defaults to staging
#   scripts/verify-staging-env.sh --target staging
#   scripts/verify-staging-env.sh --target production
#   scripts/verify-staging-env.sh --target staging --ssh-alias my-staging-host
#
# Closes Pass 3 finding §5.6 root cause: the operator-managed /srv/footbag/env
# file has no terraform reconciliation, so most §5.1-§5.5 cluster gaps reduce
# to "what is actually in the host's env file?". This script makes that
# question answerable without ssh-and-grep ad hoc.

# Pipeline note: `set -o pipefail` below makes any SIGPIPE in a pipeline
# surface as exit 141 (= 128 + signal 13). The typical offender is
# `cmd | head -N` because `head` closes its stdin after N lines, leaving
# the upstream producer to SIGPIPE on its next write. If you add a "first
# line" pipeline, prefer `awk 'NR==1'` — it reads stdin to EOF so the
# upstream cannot SIGPIPE. For "last line", GNU `tail -N` is safe
# (buffers, reads to EOF). Do NOT use `awk 'NR==1 {print; exit}'` — `exit`
# reintroduces the same early-close race.
set -euo pipefail

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
      sed -n '2,30p' "$0"
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
# Default path (ssh): use the canonical user-tmp + sudo install pattern.
# /srv/footbag/env is root-owned 0600, so the operator's account cannot cat
# it directly. The leak-resistant flow:
#
#   1. `ssh -t` allocates a remote PTY so the remote `sudo` can prompt for
#      the operator's password on the LOCAL terminal. The password
#      keystrokes are noecho'd by sudo and NEVER appear in any captured
#      stream (we do not redirect stdout/stderr of this step, so the prompt
#      reaches the operator's tty and the typed password reaches the remote
#      sudo via the PTY's stdin direction only).
#   2. `sudo install -m 0600 -o $OP -g $GROUP /srv/footbag/env $TMP_REMOTE`
#      stages the file at a path the operator owns. $OP/$GROUP are captured
#      OUTSIDE sudo's env-reset so they reflect the operator, not root.
#   3. A plain `ssh` + `cat` (no -t, no sudo, BatchMode=yes) reads the
#      staged file into HOST_ENV_RAW. No PTY needed; no secrets share a
#      stream with prompts or diagnostics.
#   4. A trap cleans up the staged file on every exit path (success,
#      failure, interrupt) so secrets do not linger on the host disk if
#      the verification crashes mid-run.
#
# We do NOT use `sudo -S` (project memory: piping a password into a
# stdin-reading command leaks it into the consumer). We do NOT capture the
# `ssh -t` step's stdout/stderr; sudo's prompt goes to the operator's tty
# and the password input is noecho.
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
  LOCAL_PID=$$
  TMP_REMOTE="/tmp/footbag-env-verify-${LOCAL_PID}.env"
  cleanup_remote() {
    ssh -o BatchMode=yes "$SSH_ALIAS" "rm -f $TMP_REMOTE" 2>/dev/null || true
  }
  trap cleanup_remote EXIT INT TERM

  echo ""
  echo "Staging $HOST_ENV_PATH on $SSH_ALIAS via sudo install."
  echo "You will be prompted for your sudo password on this terminal."
  echo "The password is typed directly into sudo; it is NOT captured, NOT echoed, and NOT logged."
  echo ""

  # Capture operator user/group OUTSIDE sudo so the install chown's to the
  # operator, not root. The escaped \$ defers expansion to the REMOTE shell;
  # the non-escaped $HOST_ENV_PATH / $TMP_REMOTE expand locally.
  if ! ssh -t "$SSH_ALIAS" "OP=\$(whoami); GROUP=\$(id -gn); sudo install -m 0600 -o \"\$OP\" -g \"\$GROUP\" $HOST_ENV_PATH $TMP_REMOTE"; then
    echo "" >&2
    echo "ERROR: failed to stage $HOST_ENV_PATH on $SSH_ALIAS." >&2
    echo "Common causes:" >&2
    echo "  - SSH alias '$SSH_ALIAS' not in ~/.ssh/config" >&2
    echo "  - Sudo password entered incorrectly or canceled" >&2
    echo "  - $HOST_ENV_PATH does not exist (host bootstrap incomplete)" >&2
    echo "  - Operator user lacks general sudo access on the host" >&2
    exit 1
  fi

  HOST_ENV_RAW="$(ssh -o BatchMode=yes "$SSH_ALIAS" "cat $TMP_REMOTE" 2>&1)" || {
    echo "ERROR: staged temp file $TMP_REMOTE was unreadable on $SSH_ALIAS." >&2
    exit 1
  }
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
    echo "WARN: unparseable line in $HOST_ENV_PATH: '$trimmed'" >&2
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
#   compose-default       docker-compose uses ${KEY:-default} — default applies
#                         if /srv/footbag/env doesn't override
#   compose-required-env  docker-compose uses ${KEY:?...} — fails compose-up if
#                         /srv/footbag/env doesn't set it
#   missing               neither source provides it
#
# Probes compose files in the LOCAL working tree (docker/docker-compose.yml +
# docker/docker-compose.prod.yml) because those are what ./deploy_to_aws.sh
# will package and ship. If either compose file is missing, that source is
# skipped silently — operators running this script outside the project root
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
    # ${KEY:?...} — compose-required, must be in env file
    if grep -F "\${${key}:?" "$cf" >/dev/null 2>&1; then
      echo "compose-required-env"
      return
    fi
    # ${KEY:-default} — compose provides default, env may override
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

# Session secret hardening.
SESSION_SECRET_ACTUAL="${HOST_ENV[SESSION_SECRET]:-}"
if [[ -z "$SESSION_SECRET_ACTUAL" ]]; then
  check_fail "session secret: SESSION_SECRET is unset"
elif [[ ${#SESSION_SECRET_ACTUAL} -lt 32 ]]; then
  check_fail "session secret: SESSION_SECRET is ${#SESSION_SECRET_ACTUAL} chars (need >= 32)"
elif [[ "${SESSION_SECRET_ACTUAL,,}" == *changeme* ]]; then
  check_fail "session secret: SESSION_SECRET contains 'changeme' placeholder"
else
  check_pass "session secret: SESSION_SECRET present, >= 32 chars, no 'changeme'"
fi

# JWT signing.
check_equals "JWT_SIGNER" "kms" "JWT signer"
check_equals "JWT_KMS_KEY_ID" "$TF_JWT_KMS_KEY_ARN" "JWT KMS key ARN matches terraform"

# SES.
check_equals "SES_ADAPTER" "live" "SES adapter"
check_equals "SES_FROM_IDENTITY" "$TF_SES_SENDER" "SES sender identity matches terraform"

# Media storage.
check_equals "MEDIA_STORAGE_ADAPTER" "s3" "media storage adapter"
check_equals "MEDIA_STORAGE_S3_BUCKET" "$TF_MEDIA_BUCKET" "media bucket matches terraform"

# AWS region + other live-adapter dependencies.
check_set "AWS_REGION" "AWS region"
check_set "SAFE_BROWSING_ADAPTER" "safe-browsing adapter"
check_set "SECRETS_ADAPTER" "secrets adapter (expected: 'live' on $TARGET)"
check_set "HTTP_REACHABILITY_ADAPTER" "HTTP reachability adapter"
check_set "PAYMENT_ADAPTER" "payment adapter (expected: 'stub' on staging until Stripe-SDK ships, 'live' on production)"

# Internal-event secret. Must not be the dev default literal (the literal
# lives in src/config/env.ts:516; do not put it in this script). Check by
# negative property: long enough that the dev default cannot match.
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
# allowlist + seed transport, refuses the others.
# -----------------------------------------------------------------------------
echo ""
echo "Dev-shortcut posture for $TARGET:"

# Production-forbidden regardless of FOOTBAG_ENV value.
DEV_VARS_PROD_FORBIDDEN=(
  FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID
  FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION
  FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL
  FOOTBAG_DEV_ADMIN_GRANT_TIER2
)
for KEY in "${DEV_VARS_PROD_FORBIDDEN[@]}"; do
  check_unset "$KEY" "production-forbidden dev shortcut"
done

# These two are staging-allowed, production-forbidden.
STAGING_ALLOWED_VARS=(
  FOOTBAG_DEV_INITIAL_ADMIN_EMAILS
  FOOTBAG_DEV_ADMIN_SEED_JSON
)
for KEY in "${STAGING_ALLOWED_VARS[@]}"; do
  ACTUAL="${HOST_ENV[$KEY]:-}"
  if [[ "$TARGET" == "production" ]]; then
    check_unset "$KEY" "production-forbidden dev shortcut"
  else
    if [[ -n "$ACTUAL" ]]; then
      check_pass "staging-allowed shortcut: $KEY is set"
    else
      check_warn "staging-allowed shortcut: $KEY is unset (operator may seed personas later via --seed-dev-admins)"
    fi
  fi
done

# -----------------------------------------------------------------------------
# Advisory checks (informational; do not fail the run).
# -----------------------------------------------------------------------------
echo ""
echo "Advisory:"

if [[ -n "${HOST_ENV[TRUST_PROXY]:-}" ]]; then
  check_pass "trust proxy: TRUST_PROXY explicitly set to '${HOST_ENV[TRUST_PROXY]}'"
else
  check_warn "trust proxy: TRUST_PROXY unset; env.ts will default to 'loopback, linklocal, uniquelocal' under NODE_ENV=production. Acceptable; explicit is recommended."
fi

SES_SANDBOX_ACTUAL="${HOST_ENV[SES_SANDBOX_MODE]:-}"
case "$SES_SANDBOX_ACTUAL" in
  ""|"0"|"false")
    if [[ "$TARGET" == "staging" ]]; then
      check_warn "SES sandbox: SES_SANDBOX_MODE is off on staging. Confirm staging SES is out of sandbox in the AWS console; otherwise unverified-recipient sends will dead-letter."
    else
      check_pass "SES sandbox: SES_SANDBOX_MODE off (expected on production)"
    fi
    ;;
  "1"|"true")
    if [[ "$TARGET" == "production" ]]; then
      check_fail "SES sandbox: SES_SANDBOX_MODE is on; production must be out of sandbox"
    else
      check_pass "SES sandbox: SES_SANDBOX_MODE on (staging-acceptable)"
    fi
    ;;
  *)
    check_fail "SES sandbox: SES_SANDBOX_MODE='$SES_SANDBOX_ACTUAL' is not a valid boolean"
    ;;
esac

# -----------------------------------------------------------------------------
# Summary.
# -----------------------------------------------------------------------------
echo ""
echo "Summary:"
printf "  Fails:    %d\n" "$FAILS"
printf "  Warns:    %d\n" "$WARNS"

if (( FAILS > 0 )); then
  echo ""
  echo "$FAILS critical invariant(s) failed. Fix /srv/footbag/env on $SSH_ALIAS before deploying." >&2
  exit 1
fi

echo ""
echo "All critical invariants passed. $WARNS advisory item(s); review above."
exit 0
