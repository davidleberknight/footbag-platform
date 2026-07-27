#!/usr/bin/env bash
# Root-side body of scripts/deploy-code.sh.
#
# Invoked via:
#   cat - scripts/internal/deploy-code-remote.sh | ssh REMOTE 'sudo -S -p "" bash'
#
# (cat - reads operator stdin = password line; cat <file> appends body. ssh
# stdin = password+body. sudo -S consumes the password line; bash inherits
# the rest and runs this body as root.)
#
# Runs as root for the full body; commands are bare (no per-line sudo).

set -euo pipefail

LIVE_DIR=/srv/footbag
ENV_PATH=/srv/footbag/env
RELEASE_DIR=/home/footbag/footbag-release

read_env() {
  awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print}' "$ENV_PATH" | tail -1
}

# Seed the committed per-environment container sizing config (memory limits,
# image concurrency, video tuning) into /srv/footbag/env so production sizing
# is governed by version control instead of an operator remembering to set it.
# The committed file docker/env/<FOOTBAG_ENV>.env is the source of truth: keys
# it lists are set, keys it omits are cleared (so production's omitted video
# knobs fall back to the canonical encoder defaults). Only an allowlist of
# sizing keys is honored and every value is format-checked, so a tampered
# config file cannot inject a secret or a malformed line into the runtime env.
# Must run after the release tree is promoted into $LIVE_DIR.
seed_container_sizing() {
  local cfg="$LIVE_DIR/docker/env/${FOOTBAG_ENV}.env"
  local key_re='^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT$|^IMAGE_MAX_CONCURRENT$|^VIDEO_X264_(PRESET|THREADS|RC_LOOKAHEAD)$'
  local line_re='^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT=|^IMAGE_MAX_CONCURRENT=|^VIDEO_X264_(PRESET|THREADS|RC_LOOKAHEAD)='
  if [[ ! -f "$cfg" ]]; then
    echo "ERROR: sizing config $cfg is missing; refusing to deploy with unmanaged container sizing." >&2
    exit 1
  fi
  local adds key val line
  adds=$(mktemp)
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"
    if [[ ! "$key" =~ $key_re ]]; then
      echo "    WARN: ignoring non-sizing key '$key' in $cfg" >&2
      continue
    fi
    case "$key" in
      *_MEMORY_LIMIT)
        [[ "$val" =~ ^[0-9]+[MG]$ ]] || { echo "ERROR: $cfg: $key='$val' is not a valid memory limit (e.g. 512M)." >&2; rm -f "$adds"; exit 1; } ;;
      IMAGE_MAX_CONCURRENT|VIDEO_X264_THREADS|VIDEO_X264_RC_LOOKAHEAD)
        [[ "$val" =~ ^[0-9]+$ ]] || { echo "ERROR: $cfg: $key='$val' is not a non-negative integer." >&2; rm -f "$adds"; exit 1; } ;;
      VIDEO_X264_PRESET)
        [[ "$val" =~ ^[a-z]+$ ]] || { echo "ERROR: $cfg: $key='$val' is not a valid x264 preset." >&2; rm -f "$adds"; exit 1; } ;;
    esac
    printf '%s=%s\n' "$key" "$val" >> "$adds"
  done < "$cfg"
  local tmp
  tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$tmp"; chown root:root "$tmp"
  grep -vE "$line_re" "$ENV_PATH" > "$tmp" || true
  cat "$adds" >> "$tmp"
  rm -f "$adds"
  mv "$tmp" "$ENV_PATH"
  echo "==> Seeded container sizing for '$FOOTBAG_ENV' from $cfg"
}

# Disk-space preflight: rsync of release dir + docker layer churn can land
# 200 MB at peak. Refuse to start if /srv/footbag has under 500 MB free.
SRV_AVAIL_KB=$(df -k --output=avail /srv/footbag 2>/dev/null | tail -1 | tr -d ' ')
if [[ -n "$SRV_AVAIL_KB" ]] && (( SRV_AVAIL_KB < 512000 )); then
  echo "ERROR: /srv/footbag has only ${SRV_AVAIL_KB}K free; need >=500 MB." >&2
  echo "Recommendation: ssh ${DEPLOY_TARGET:-<deploy host>} 'sudo journalctl --vacuum-time=7d; sudo docker system prune -af'" >&2
  exit 1
fi

# Assert /srv/footbag/env is owned by root with mode 0600. Mirrors the check
# in scripts/internal/deploy-rebuild-remote.sh; see that file for rationale.
test -f "$ENV_PATH" || { echo "ERROR: $ENV_PATH missing" >&2; exit 1; }
ENV_PERMS=$(stat -c '%U:%G %a' "$ENV_PATH")
if [[ "$ENV_PERMS" != "root:root 600" ]]; then
  echo "ERROR: $ENV_PATH has wrong ownership/mode: '$ENV_PERMS' (expected 'root:root 600')" >&2
  echo "       Fix with:  sudo chown root:root $ENV_PATH && sudo chmod 600 $ENV_PATH" >&2
  exit 1
fi

# Verify the docker-loaded images match what the workstation built. The
# preceding `docker save | ssh | docker load` step is the only path images
# enter the host; a layer mismatch means corruption in the pipe. Compare
# RootFS.Layers (DiffIDs = sha256 of uncompressed layer tars) rather than .Id;
# DiffIDs survive save/load regardless of daemon version skew, while .Id is a
# hash of the image config JSON that each daemon may re-serialize differently.
: "${EXPECTED_WEB_IMAGE_LAYERS:?must be set by deploy-code.sh via cat-pipe}"
: "${EXPECTED_WORKER_IMAGE_LAYERS:?must be set by deploy-code.sh via cat-pipe}"
: "${EXPECTED_IMAGE_IMAGE_LAYERS:?must be set by deploy-code.sh via cat-pipe}"
ACTUAL_WEB_IMAGE_LAYERS=$(docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-web 2>/dev/null || true)
ACTUAL_WORKER_IMAGE_LAYERS=$(docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-worker 2>/dev/null || true)
ACTUAL_IMAGE_IMAGE_LAYERS=$(docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-image 2>/dev/null || true)
if [[ "$ACTUAL_WEB_IMAGE_LAYERS" != "$EXPECTED_WEB_IMAGE_LAYERS" ]]; then
  echo "ERROR: docker-web layer mismatch after load" >&2
  echo "       expected: $EXPECTED_WEB_IMAGE_LAYERS" >&2
  echo "       actual:   $ACTUAL_WEB_IMAGE_LAYERS" >&2
  exit 1
fi
if [[ "$ACTUAL_WORKER_IMAGE_LAYERS" != "$EXPECTED_WORKER_IMAGE_LAYERS" ]]; then
  echo "ERROR: docker-worker layer mismatch after load" >&2
  echo "       expected: $EXPECTED_WORKER_IMAGE_LAYERS" >&2
  echo "       actual:   $ACTUAL_WORKER_IMAGE_LAYERS" >&2
  exit 1
fi
if [[ "$ACTUAL_IMAGE_IMAGE_LAYERS" != "$EXPECTED_IMAGE_IMAGE_LAYERS" ]]; then
  echo "ERROR: docker-image layer mismatch after load" >&2
  echo "       expected: $EXPECTED_IMAGE_IMAGE_LAYERS" >&2
  echo "       actual:   $ACTUAL_IMAGE_IMAGE_LAYERS" >&2
  exit 1
fi

# Reconcile FOOTBAG_ENV (passed by workstation via cat-pipe) against
# /srv/footbag/env. Workstation derives the value from the SSH alias; this is
# the canonical source. Mirrors deploy-rebuild-remote.sh.
: "${FOOTBAG_ENV:?must be set by deploy-code.sh via cat-pipe}"
EXISTING_FOOTBAG_ENV=$(read_env FOOTBAG_ENV)
if [[ -z "$EXISTING_FOOTBAG_ENV" ]]; then
  echo "==> Adding FOOTBAG_ENV=$FOOTBAG_ENV to $ENV_PATH ..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'FOOTBAG_ENV=%s\n' "$FOOTBAG_ENV" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
elif [[ "$EXISTING_FOOTBAG_ENV" != "$FOOTBAG_ENV" ]]; then
  echo "ERROR: $ENV_PATH has FOOTBAG_ENV='$EXISTING_FOOTBAG_ENV' but workstation expects '$FOOTBAG_ENV'." >&2
  echo "       Likely a wrong DEPLOY_TARGET. Reconcile manually before deploying." >&2
  exit 1
fi

# One-shot migration: MEDIA_STORAGE_ADAPTER seed. Mirrors deploy-rebuild-remote.sh
# so a code-only deploy onto a host whose env predates this var still gets it.
# docker-compose.prod.yml fails fast if the var is unset, so this seed is
# load-bearing for stack startup. Operator-set values are preserved.
if ! grep -q '^MEDIA_STORAGE_ADAPTER=' "$ENV_PATH"; then
  echo "==> Seeding MEDIA_STORAGE_ADAPTER=s3 into $ENV_PATH (staging/prod default)..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'MEDIA_STORAGE_ADAPTER=%s\n' 's3' >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
fi

# One-shot migration: INTERNAL_EVENT_SECRET seed. Authenticates the docker-
# internal channel between web (`/ipc/job-events`) and worker
# (`/transcode/dispatch`) for the async curator video upload (DD §6.8).
# Generated on the host since the value never reaches CloudFront or any
# public surface; centralizing in SSM would add ops overhead with no security
# gain. docker-compose.prod.yml fails fast if the var is unset, so this seed
# is load-bearing for stack startup. To rotate, delete the line from
# /srv/footbag/env and redeploy: this block regenerates and the worker picks
# up the new value on its next restart.
if ! grep -q '^INTERNAL_EVENT_SECRET=' "$ENV_PATH"; then
  echo "==> Seeding INTERNAL_EVENT_SECRET into $ENV_PATH (random hex)..."
  generated_secret=$(openssl rand -hex 32)
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'INTERNAL_EVENT_SECRET=%s\n' "$generated_secret" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  unset generated_secret
fi

# One-shot migration: HTTP_REACHABILITY_ADAPTER seed. Controls the post-
# Safe-Browsing reachability HEAD probe in the external-URL validator.
# Required in prod-mode env.ts; without a seed, web + worker crash-loop on
# first deploy of any branch carrying this adapter. Default 'live' matches
# the intended runtime behavior; an operator who wants to disable outbound
# HEAD probes on a specific host edits this line. This seed is load-bearing
# for stack startup.
if ! grep -q '^HTTP_REACHABILITY_ADAPTER=' "$ENV_PATH"; then
  echo "==> Seeding HTTP_REACHABILITY_ADAPTER=live into $ENV_PATH..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'HTTP_REACHABILITY_ADAPTER=%s\n' 'live' >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
fi

# One-shot migration: SECRETS_ADAPTER seed. Selects the live/stub/local impl
# used by Node consumers to read SSM-stored third-party secrets (Safe
# Browsing API key, future Stripe keys, admin bootstrap tokens). Required in
# prod-mode env.ts; without a seed, web + worker crash-loop. 'live' calls
# SSM GetParameter via the assumed-role chain. Load-bearing for stack startup.
if ! grep -q '^SECRETS_ADAPTER=' "$ENV_PATH"; then
  echo "==> Seeding SECRETS_ADAPTER=live into $ENV_PATH..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'SECRETS_ADAPTER=%s\n' 'live' >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
fi

# One-shot migration: SAFE_BROWSING_ADAPTER seed. Default 'stub' on first
# deploy: until the operator has both put-parameter'd the real Safe Browsing
# API key into SSM AND flipped this to 'live', the validator runs without
# outbound calls to Google. Two-step opt-in is intentional: a key landing
# in SSM without the adapter flip stays in standby, not silently in-use.
if ! grep -q '^SAFE_BROWSING_ADAPTER=' "$ENV_PATH"; then
  echo "==> Seeding SAFE_BROWSING_ADAPTER=stub into $ENV_PATH (operator flips to live after put-parameter)..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'SAFE_BROWSING_ADAPTER=%s\n' 'stub' >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
fi

# One-shot migration: FOOTBAG_DB_DIR seed. Mirrors deploy-rebuild-remote.sh so a
# code-only deploy onto a host whose env predates the directory-mount layout
# still points at the right DB directory instead of the docker-compose default
# fallback. Operator-set values are preserved.
if ! grep -q '^FOOTBAG_DB_DIR=' "$ENV_PATH"; then
  echo "==> Seeding FOOTBAG_DB_DIR=/srv/footbag/db into $ENV_PATH..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  cp "$ENV_PATH" "$env_tmp"
  printf 'FOOTBAG_DB_DIR=%s\n' '/srv/footbag/db' >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
fi

# Reconcile SES_ADAPTER for non-production hosts. src/config/env.ts forces the
# stub adapter on staging and development (so no real mail leaves a
# non-production environment) and refuses any other value at boot, so the
# operator has no legitimate choice here; overwriting corrects a stale host
# value (a non-production host left on the live adapter, say) on the next deploy
# instead of letting the stack crash-loop. Production is derived, not
# hand-owned: the arming-switch sync later in this script writes SES_ADAPTER
# from the declared flag (armed -> live, dark -> stub).
FOOTBAG_ENV_VAL=$(read_env FOOTBAG_ENV)
[[ -n "$FOOTBAG_ENV_VAL" ]] || { echo "ERROR: FOOTBAG_ENV missing from $ENV_PATH" >&2; exit 1; }
if [[ "$FOOTBAG_ENV_VAL" == "staging" || "$FOOTBAG_ENV_VAL" == "development" ]]; then
  echo "==> Reconciling SES_ADAPTER=stub into $ENV_PATH (FOOTBAG_ENV=$FOOTBAG_ENV_VAL; non-production must not send real mail)..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v '^SES_ADAPTER=' "$ENV_PATH" > "$env_tmp" || true
  printf 'SES_ADAPTER=%s\n' 'stub' >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
fi

# PAYMENT_ADAPTER: seed the stub on a fresh non-production host so the compose
# ${PAYMENT_ADAPTER:?} guard and env.ts have a value, but do not overwrite an
# existing one. env.ts refuses the live payment SDK anywhere below production,
# so the stub is the only bootable value here. Production is derived, not
# hand-owned: the arming-switch sync later in this script writes
# PAYMENT_ADAPTER from the declared flag (armed -> live, dark -> stub).
if [[ "$FOOTBAG_ENV_VAL" != "production" ]]; then
  if ! grep -q '^PAYMENT_ADAPTER=' "$ENV_PATH"; then
    echo "==> Seeding PAYMENT_ADAPTER=stub into $ENV_PATH (staging/dev default; preserved if already set)..."
    env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
    chmod 600 "$env_tmp"
    chown root:root "$env_tmp"
    cp "$ENV_PATH" "$env_tmp"
    printf 'PAYMENT_ADAPTER=%s\n' 'stub' >> "$env_tmp"
    mv "$env_tmp" "$ENV_PATH"
  fi
fi

echo "==> Promoting release (preserving env, DB, media)..."
rsync -a --delete \
  --exclude=/env --exclude=/db --exclude=/media \
  "$RELEASE_DIR/" "$LIVE_DIR/"
chown -R root:root "$LIVE_DIR"

# Apply the committed per-environment container sizing now that the release
# tree (and docker/env/<env>.env) is in place, before the service restart.
seed_container_sizing

# Sync X_ORIGIN_VERIFY_SECRET from SSM to /srv/footbag/env. Both the value
# CloudFront injects (via data.aws_ssm_parameter.origin_verify_secret) and the
# value nginx compares against (rendered into /etc/nginx/nginx.conf by
# docker/nginx/40-render-nginx-conf.sh) must agree, or every CloudFront request
# 444s. The canonical value is generated by the Terraform random_id resource
# in terraform/{staging,production}/ssm.tf; this fetch keeps the host env
# in sync after a `terraform apply -replace=random_id.origin_verify_secret`.
# IAM: AWS_PROFILE source-profile AssumeRoles into app_runtime which holds
# ssm:GetParameter on /footbag/{env}/* and kms:Decrypt on the main key.
echo "==> Syncing X_ORIGIN_VERIFY_SECRET from SSM to $ENV_PATH..."
FOOTBAG_ENV_VAL=$(read_env FOOTBAG_ENV)
AWS_PROFILE_VAL=$(read_env AWS_PROFILE)
AWS_REGION_VAL=$(read_env AWS_REGION)
[[ -n "$FOOTBAG_ENV_VAL" ]] || { echo "ERROR: FOOTBAG_ENV missing from $ENV_PATH" >&2; exit 1; }
[[ -n "$AWS_PROFILE_VAL" ]] || { echo "ERROR: AWS_PROFILE missing from $ENV_PATH" >&2; exit 1; }
[[ -n "$AWS_REGION_VAL"  ]] || { echo "ERROR: AWS_REGION missing from $ENV_PATH" >&2; exit 1; }

ssm_origin_param="/footbag/${FOOTBAG_ENV_VAL}/secrets/origin_verify_secret"
ORIGIN_VERIFY_SECRET_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_origin_param" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
) || { echo "ERROR: aws ssm get-parameter failed for $ssm_origin_param" >&2; exit 1; }

if [[ ! "$ORIGIN_VERIFY_SECRET_VAL" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: SSM $ssm_origin_param is not 64 lowercase hex chars (got ${#ORIGIN_VERIFY_SECRET_VAL} chars)." >&2
  if [[ "$ORIGIN_VERIFY_SECRET_VAL" == TODO-* ]]; then
    echo "       SSM still has the bootstrap placeholder. From the workstation run:" >&2
    echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
    echo "       This swaps the placeholder for a random_id-generated 64-hex value, then re-run this deploy." >&2
  fi
  exit 1
fi

env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^X_ORIGIN_VERIFY_SECRET=' "$ENV_PATH" > "$env_tmp" || true
printf 'X_ORIGIN_VERIFY_SECRET=%s\n' "$ORIGIN_VERIFY_SECRET_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"
unset ORIGIN_VERIFY_SECRET_VAL

# Sync SESSION_SECRET from SSM to /srv/footbag/env. Mirrors the
# X_ORIGIN_VERIFY_SECRET pattern above: random_id.session_secret in
# terraform/{env}/ssm.tf is the canonical value; this fetch keeps the
# host env in sync after a `terraform apply -replace=random_id.session_secret`.
# A rotation invalidates every active session (cookie signatures fail
# under the new secret), which is the intended security behavior.
echo "==> Syncing SESSION_SECRET from SSM to $ENV_PATH..."
ssm_session_param="/footbag/${FOOTBAG_ENV_VAL}/secrets/session_secret"
SESSION_SECRET_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_session_param" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
) || { echo "ERROR: aws ssm get-parameter failed for $ssm_session_param" >&2; exit 1; }

# Defense-in-depth shape check (the env.ts boot guard at src/config/env.ts
# applies the same rules; we catch them here so a broken SSM value fails
# the deploy loud rather than crash-looping the stack on restart).
if [[ "$SESSION_SECRET_VAL" == TODO-* ]]; then
  echo "ERROR: SSM $ssm_session_param still has the bootstrap placeholder." >&2
  echo "       From the workstation run:" >&2
  echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
  echo "       This swaps the placeholder for a random_id-generated 64-hex value, then re-run this deploy." >&2
  exit 1
fi
if [[ "$SESSION_SECRET_VAL" == *'#'* ]]; then
  echo "ERROR: SSM $ssm_session_param contains '#' which breaks systemd EnvironmentFile parsing." >&2
  exit 1
fi
if [[ "${SESSION_SECRET_VAL,,}" == *changeme* ]]; then
  echo "ERROR: SSM $ssm_session_param contains 'changeme'; generate a fresh value via terraform apply -replace=random_id.session_secret." >&2
  exit 1
fi
if (( ${#SESSION_SECRET_VAL} < 32 )); then
  echo "ERROR: SSM $ssm_session_param is ${#SESSION_SECRET_VAL} chars; minimum is 32." >&2
  exit 1
fi

env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^SESSION_SECRET=' "$ENV_PATH" > "$env_tmp" || true
printf 'SESSION_SECRET=%s\n' "$SESSION_SECRET_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"
unset SESSION_SECRET_VAL

# Sync ARCHIVE_URL from the parameter Terraform writes when the archive stack
# is enabled. Terraform is the only party that knows the served hostname, and
# the address stays out of every committed file, so this is the one route that
# keeps the declared value and the running value the same without an operator
# editing the host env by hand. A MISSING parameter is normal rather than an
# error: an environment with no archive stack simply has no archive, and the
# variable is then cleared so the application hides its Legacy Archive card
# instead of rendering a dead link. Present here as well as in the rebuild
# path, so an archive config change rides either deploy mode.
ssm_archive_url_param="/footbag/${FOOTBAG_ENV_VAL}/app/archive_url"
echo "==> Syncing ARCHIVE_URL from $ssm_archive_url_param ..."
ARCHIVE_URL_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_archive_url_param" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null
) || ARCHIVE_URL_VAL=""
if [[ -n "$ARCHIVE_URL_VAL" && ! "$ARCHIVE_URL_VAL" =~ ^https:// ]]; then
  echo "ERROR: SSM $ssm_archive_url_param is '$ARCHIVE_URL_VAL'; expected an https:// base URL." >&2
  exit 1
fi
if [[ -z "$ARCHIVE_URL_VAL" ]]; then
  echo "    No archive parameter for this environment; ARCHIVE_URL left unset (card hidden)."
fi
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^ARCHIVE_URL=' "$ENV_PATH" > "$env_tmp" || true
if [[ -n "$ARCHIVE_URL_VAL" ]]; then
  printf 'ARCHIVE_URL=%s\n' "$ARCHIVE_URL_VAL" >> "$env_tmp"
fi
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

# Sync ARCHIVE_LOGIN_REDIRECT the same optional way. Terraform publishes the
# parameter exactly where the archive edge does not require signed cookies, so
# the application routes its Legacy Archive card through the platform's
# login-gated redirect there; where the parameter is absent (an edge-gated or
# archive-less environment) the variable is cleared and the application keeps
# the direct-link default.
ssm_archive_redirect_param="/footbag/${FOOTBAG_ENV_VAL}/app/archive_login_redirect"
echo "==> Syncing ARCHIVE_LOGIN_REDIRECT from $ssm_archive_redirect_param ..."
ARCHIVE_LOGIN_REDIRECT_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_archive_redirect_param" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null
) || ARCHIVE_LOGIN_REDIRECT_VAL=""
if [[ -n "$ARCHIVE_LOGIN_REDIRECT_VAL" && ! "$ARCHIVE_LOGIN_REDIRECT_VAL" =~ ^(0|1|true|false)$ ]]; then
  echo "ERROR: SSM $ssm_archive_redirect_param is '$ARCHIVE_LOGIN_REDIRECT_VAL'; expected 0, 1, true, or false." >&2
  exit 1
fi
if [[ -z "$ARCHIVE_LOGIN_REDIRECT_VAL" ]]; then
  echo "    No archive-login-redirect parameter for this environment; ARCHIVE_LOGIN_REDIRECT left unset (direct link)."
fi
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^ARCHIVE_LOGIN_REDIRECT=' "$ENV_PATH" > "$env_tmp" || true
if [[ -n "$ARCHIVE_LOGIN_REDIRECT_VAL" ]]; then
  printf 'ARCHIVE_LOGIN_REDIRECT=%s\n' "$ARCHIVE_LOGIN_REDIRECT_VAL" >> "$env_tmp"
fi
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

# Sync the arming switches the same required-parameter way (present in both
# deploy halves, so an arming change rides either deploy mode). Each switch
# declares the arming state of one real-world side (payments, email);
# Terraform owns the value, and every deploy makes the declared value the
# running value. A missing parameter is a hard error: the environment needs
# its terraform apply first.
ssm_payments_armed_param="/footbag/${FOOTBAG_ENV_VAL}/app/payments_armed"
echo "==> Syncing PAYMENTS_ARMED from $ssm_payments_armed_param ..."
PAYMENTS_ARMED_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_payments_armed_param" \
    --query 'Parameter.Value' \
    --output text
) || {
  echo "ERROR: aws ssm get-parameter failed for $ssm_payments_armed_param" >&2
  echo "       If the parameter does not exist yet, from the workstation run:" >&2
  echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
  exit 1
}
if [[ ! "$PAYMENTS_ARMED_VAL" =~ ^(armed|dark)$ ]]; then
  echo "ERROR: SSM $ssm_payments_armed_param is '$PAYMENTS_ARMED_VAL'; expected 'armed' or 'dark'." >&2
  exit 1
fi
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^PAYMENTS_ARMED=' "$ENV_PATH" > "$env_tmp" || true
printf 'PAYMENTS_ARMED=%s\n' "$PAYMENTS_ARMED_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

ssm_email_send_armed_param="/footbag/${FOOTBAG_ENV_VAL}/app/email_send_armed"
echo "==> Syncing EMAIL_SEND_ARMED from $ssm_email_send_armed_param ..."
EMAIL_SEND_ARMED_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_email_send_armed_param" \
    --query 'Parameter.Value' \
    --output text
) || {
  echo "ERROR: aws ssm get-parameter failed for $ssm_email_send_armed_param" >&2
  echo "       If the parameter does not exist yet, from the workstation run:" >&2
  echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
  exit 1
}
if [[ ! "$EMAIL_SEND_ARMED_VAL" =~ ^(armed|dark)$ ]]; then
  echo "ERROR: SSM $ssm_email_send_armed_param is '$EMAIL_SEND_ARMED_VAL'; expected 'armed' or 'dark'." >&2
  exit 1
fi
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^EMAIL_SEND_ARMED=' "$ENV_PATH" > "$env_tmp" || true
printf 'EMAIL_SEND_ARMED=%s\n' "$EMAIL_SEND_ARMED_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

# On production the adapters are derived from the arming switches, never
# hand-edited: armed -> live, dark -> stub. This is what makes an arming flip
# ride tfvars + apply + deploy with no host edit, and what makes a dark
# production behave exactly like staging (stub adapters, simulated-email card,
# fake checkout, no real-world side effect). env.ts refuses a flag/adapter
# mismatch at boot as the fail-fast backstop. A dark payment side also gets a
# host-unique stub webhook signing secret (as staging does): the stub
# adapter's committed fallback secret would accept a webhook forged by anyone
# holding a checkout of the repository.
if [[ "$FOOTBAG_ENV_VAL" == "production" ]]; then
  SES_ADAPTER_DERIVED='stub'
  [[ "$EMAIL_SEND_ARMED_VAL" == "armed" ]] && SES_ADAPTER_DERIVED='live'
  PAYMENT_ADAPTER_DERIVED='stub'
  [[ "$PAYMENTS_ARMED_VAL" == "armed" ]] && PAYMENT_ADAPTER_DERIVED='live'
  echo "==> Deriving production adapters from arming switches: SES_ADAPTER=$SES_ADAPTER_DERIVED PAYMENT_ADAPTER=$PAYMENT_ADAPTER_DERIVED ..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v -e '^SES_ADAPTER=' -e '^PAYMENT_ADAPTER=' "$ENV_PATH" > "$env_tmp" || true
  printf 'SES_ADAPTER=%s\n' "$SES_ADAPTER_DERIVED" >> "$env_tmp"
  printf 'PAYMENT_ADAPTER=%s\n' "$PAYMENT_ADAPTER_DERIVED" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
  if [[ "$PAYMENT_ADAPTER_DERIVED" == "stub" ]] && ! grep -q '^STRIPE_WEBHOOK_SECRET_STUB=' "$ENV_PATH"; then
    echo "==> Seeding a generated STRIPE_WEBHOOK_SECRET_STUB into env file (dark payments; preserved if already set)..."
    printf 'STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_%s\n' "$(openssl rand -hex 24)" >> "$ENV_PATH"
  fi
fi

# Update FOOTBAG_DEV_INITIAL_ADMIN_EMAILS from the workstation's
# .local/initial-admins.txt content (passed via cat-pipe). Empty value clears
# the var so removing an email from the file and redeploying correctly drops
# admin from a future registration.
#
# Production refusal: this allowlist is a dev/staging-only shortcut. Production
# first-admin uses the separate single-shot SSM-token claim mechanism, which
# needs no deploy-time env injection. Refuse the value
# unless FOOTBAG_ENV is explicitly 'development' or 'staging'; production OR an
# unset/misspelled FOOTBAG_ENV both trip this guard before anything lands on
# disk. (env.ts also boot-fail-fasts under the same condition; this
# script-level guard catches the misconfiguration earlier.)
: "${FOOTBAG_DEV_INITIAL_ADMIN_EMAILS=}"
if [[ -n "$FOOTBAG_DEV_INITIAL_ADMIN_EMAILS" && "$FOOTBAG_ENV" != "development" && "$FOOTBAG_ENV" != "staging" ]]; then
  echo "ERROR: FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is dev/staging-only but was passed with FOOTBAG_ENV=${FOOTBAG_ENV:-<unset>}." >&2
  echo "       Production first-admin uses a separate SSM-token claim path that requires no deploy-time env injection." >&2
  echo "       Either empty .local/initial-admins.txt on this workstation before redeploying," >&2
  echo "       or use a workstation that does not have the file present." >&2
  exit 1
fi
if [[ "$FOOTBAG_ENV" == "development" || "$FOOTBAG_ENV" == "staging" ]]; then
  echo "==> Updating FOOTBAG_DEV_INITIAL_ADMIN_EMAILS in $ENV_PATH ..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v '^FOOTBAG_DEV_INITIAL_ADMIN_EMAILS=' "$ENV_PATH" > "$env_tmp" || true
  printf 'FOOTBAG_DEV_INITIAL_ADMIN_EMAILS=%s\n' "$FOOTBAG_DEV_INITIAL_ADMIN_EMAILS" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
  # Defense in depth: drop any legacy FOOTBAG_INITIAL_ADMIN_EMAILS line that
  # may persist from before the rename, so an old key cannot resurrect itself.
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v '^FOOTBAG_INITIAL_ADMIN_EMAILS=' "$ENV_PATH" > "$env_tmp" || true
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
fi

echo "==> Reinstalling systemd service unit..."
cp "$LIVE_DIR/ops/systemd/footbag.service" /etc/systemd/system/
systemctl daemon-reload

# No host-side image build: the workstation builds + ships images via
# docker save | docker load before this remote-half runs. The systemd unit
# refuses to build (--no-build on ExecStart); compose up uses the already-
# loaded images and fails fast if any image is missing.

echo "==> Restarting service (compose up via systemctl, --no-build)..."
cd "$LIVE_DIR"
systemctl restart footbag

# Active-check + healthcheck poll. `docker compose up --detach` exits 0 the
# moment containers are spawned; nginx is gated on web's healthcheck which
# has a 15s start_period. A bare `sleep 3` reports success while the stack
# may still be 502/503 to traffic for another 12+ seconds, which then causes
# the workstation-side smoke check to false-fail. Poll up to ~20s for
# systemd-active AND /health/ready returning 2xx, matching the pattern in
# deploy-rebuild-remote.sh.
_stack_healthy=0
for _i in 1 2 3 4 5 6 7 8 9 10; do
  if systemctl is-active --quiet footbag.service \
     && curl -sf -o /dev/null --max-time 3 http://localhost/health/ready; then
    _stack_healthy=1
    break
  fi
  sleep 2
done
if (( _stack_healthy == 0 )); then
  echo "    ERROR: stack did not reach healthy state within ~20s after restart." >&2
  systemctl status footbag --no-pager -l >&2 || true
  exit 1
fi

systemctl status footbag --no-pager -l

# CUTOVER-REMOVE: post-deploy persona-catalog seed. Mirrors the same block in
# deploy-rebuild-remote.sh. Runs only when the workstation passed
# SEED_TEST_PERSONAS=yes (set by --seed-test-personas). Signal only: the
# persona catalog is code (dist/testkit/canonicalPersonas.js), so there
# is no JSON payload and no stdin pipe. The seed runner is idempotent (skips
# existing slugs). Runs inside the web container via
# `node dist/testkit/personaSeedRunner.js`. FOOTBAG_ENV is NOT overridden
# here: the container reads it from /srv/footbag/env per host; the testkit
# import guard throws when FOOTBAG_ENV='production'. The deploy_to_aws.sh wrapper
# also allowlists --seed-test-personas to DEPLOY_TARGET=footbag-staging only.
if [[ "${SEED_TEST_PERSONAS:-no}" == "yes" ]]; then
  echo "==> Running persona-catalog seed..."
  if ! docker compose \
      --env-file "$ENV_PATH" \
      -f "$LIVE_DIR/docker/docker-compose.yml" \
      -f "$LIVE_DIR/docker/docker-compose.prod.yml" \
      exec -T \
      web node dist/testkit/personaSeedRunner.js; then
    echo "    ERROR: persona-catalog seed step exited non-zero; aborting the deploy." >&2
    exit 1
  fi
fi
