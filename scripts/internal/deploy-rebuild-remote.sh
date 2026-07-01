#!/usr/bin/env bash
# Root-side body of scripts/deploy-rebuild.sh.
#
# Invoked via:
#   cat - scripts/internal/deploy-rebuild-remote.sh | ssh REMOTE 'sudo -S -p "" bash'
#
# Runs as root for the full body; commands are bare (no per-line sudo).
#
# DESTRUCTIVE: replaces the live SQLite database with the rsync'd copy in
# $RELEASE_DIR. Caller is responsible for ensuring the rebuilt local DB is
# what should land on the host.

set -euo pipefail

LIVE_DIR=/srv/footbag
ENV_PATH=/srv/footbag/env
RELEASE_DIR=/home/footbag/footbag-release
NEW_DB="$RELEASE_DIR/database/footbag.db"

require_path() {
  local label="$1"
  local path="$2"
  if [[ ! -e "$path" ]]; then
    echo "Missing required path: $label ($path)" >&2
    exit 1
  fi
}

require_env() {
  local key="$1"
  local value
  value=$(awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/,""); print}' "$ENV_PATH" | tail -1)
  if [[ -z "$value" ]]; then
    echo "Missing required env var in $ENV_PATH: $key" >&2
    exit 1
  fi
  printf '%s' "$value"
}

# Seed the committed per-environment container sizing config (memory limits,
# image concurrency, video tuning) into /srv/footbag/env so production sizing
# is governed by version control instead of an operator remembering to set it.
# The committed file docker/env/<FOOTBAG_ENV>.env is the source of truth: keys
# it lists are set, keys it omits are cleared (so production's omitted video
# knobs fall back to the canonical encoder defaults). Only an allowlist of
# sizing keys is honored and every value is format-checked, so a tampered
# config file cannot inject a secret or a malformed line into the runtime env.
# All input reads are file-redirected (never fd 0), preserving the stdin /
# sudo-password discipline of the cat-pipe remote-exec pattern.
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
  echo "    Seeded container sizing for '$FOOTBAG_ENV' from $cfg"
}

compose_cmd() {
  docker compose \
    --env-file "$ENV_PATH" \
    -f "$LIVE_DIR/docker/docker-compose.yml" \
    -f "$LIVE_DIR/docker/docker-compose.prod.yml" \
    "$@"
}

dump_diagnostics() {
  echo "    ---- systemctl status footbag.service ----" >&2
  systemctl status footbag.service --no-pager -l || true

  echo "    ---- journalctl -u footbag.service -n 100 ----" >&2
  journalctl -u footbag.service -n 100 --no-pager || true

  echo "    ---- docker compose ps ----" >&2
  compose_cmd ps || true

  echo "    ---- docker compose logs web ----" >&2
  compose_cmd logs web --tail=100 || true

  echo "    ---- docker compose logs worker ----" >&2
  compose_cmd logs worker --tail=100 || true

  echo "    ---- docker compose logs nginx ----" >&2
  compose_cmd logs nginx --tail=100 || true
}

echo "    Preflight checks on host..."
command -v docker >/dev/null  || { echo "docker missing on host"  >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl missing on host" >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 missing on host" >&2; exit 1; }
command -v awk >/dev/null     || { echo "awk missing on host"     >&2; exit 1; }
command -v rsync >/dev/null   || { echo "rsync missing on host"   >&2; exit 1; }

# Disk-space preflight: rsync of release dir + DB replace + docker layer churn
# can land 200-400 MB at peak. Refuse to start if /srv/footbag has under 500 MB
# free; the partial-write failure mode is silent corruption of footbag.db.
SRV_AVAIL_KB=$(df -k --output=avail /srv/footbag 2>/dev/null | tail -1 | tr -d ' ')
if [[ -n "$SRV_AVAIL_KB" ]] && (( SRV_AVAIL_KB < 512000 )); then
  echo "ERROR: /srv/footbag has only ${SRV_AVAIL_KB}K free; need >=500 MB." >&2
  echo "Recommendation: ssh ${DEPLOY_TARGET:-<deploy host>} 'sudo journalctl --vacuum-time=7d; sudo docker system prune -af'" >&2
  exit 1
fi

require_path "release dir"        "$RELEASE_DIR"
require_path "env file"           "$ENV_PATH"
require_path "uploaded DB"        "$NEW_DB"
require_path "service unit source" "$RELEASE_DIR/ops/systemd/footbag.service"
require_path "compose file"        "$RELEASE_DIR/docker/docker-compose.yml"
require_path "compose prod file"   "$RELEASE_DIR/docker/docker-compose.prod.yml"

# Runtime AWS credential files must exist on the host for the source-profile +
# AssumeRole chain. Without these the app cannot assume the runtime role and
# KMS Sign / SES Send fail at request time.
test -f /root/.aws/credentials || { echo "Missing /root/.aws/credentials on the host" >&2; exit 1; }
test -f /root/.aws/config       || { echo "Missing /root/.aws/config on the host"      >&2; exit 1; }

# Assert /srv/footbag/env is owned by root with mode 0600. This file holds
# SESSION_SECRET, the SSM-mirrored X_ORIGIN_VERIFY_SECRET, and AWS profile
# config; a 0644 / non-root state is a credential exposure (a non-root user
# on the host or any local-file-disclosure bug in another service can read
# them). Fail-closed at deploy time so the operator notices and fixes.
ENV_PERMS=$(stat -c '%U:%G %a' "$ENV_PATH")
if [[ "$ENV_PERMS" != "root:root 600" ]]; then
  echo "ERROR: $ENV_PATH has wrong ownership/mode: '$ENV_PERMS' (expected 'root:root 600')" >&2
  echo "       Fix with:  sudo chown root:root $ENV_PATH && sudo chmod 600 $ENV_PATH" >&2
  exit 1
fi

# Verify the docker-loaded images match what the workstation built. The
# preceding `docker save | ssh | docker load` step is the only path images
# enter the host; a layer mismatch means corruption in the pipe (network
# truncation, host docker daemon mid-deploy, or workstation registry tampering
# between build and save). Fail before promoting the release. Compare
# RootFS.Layers (DiffIDs = sha256 of uncompressed layer tars) rather than .Id;
# DiffIDs survive save/load regardless of daemon version skew, while .Id is a
# hash of the image config JSON that each daemon may re-serialize differently.
: "${EXPECTED_WEB_IMAGE_LAYERS:?must be set by deploy-rebuild.sh via cat-pipe}"
: "${EXPECTED_WORKER_IMAGE_LAYERS:?must be set by deploy-rebuild.sh via cat-pipe}"
: "${EXPECTED_IMAGE_IMAGE_LAYERS:?must be set by deploy-rebuild.sh via cat-pipe}"
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

# Reconcile FOOTBAG_ENV passed by the workstation against /srv/footbag/env.
# Workstation derives the value from the SSH alias; this is the canonical
# source. If the env file lacks the line, append it. If it has a different
# value, fail (catches a wrong DEPLOY_TARGET pointed at the wrong host;
# preserves operator-set values from never silently overwriting).
: "${FOOTBAG_ENV:?must be set by deploy-rebuild.sh via cat-pipe}"
EXISTING_FOOTBAG_ENV=$(awk -F= '$1=="FOOTBAG_ENV" {sub(/^[^=]*=/,""); print}' "$ENV_PATH" | tail -1)
if [[ -z "$EXISTING_FOOTBAG_ENV" ]]; then
  echo "    Adding FOOTBAG_ENV=$FOOTBAG_ENV to $ENV_PATH ..."
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

# One-shot migration: directory-mount DB layout
if grep -q '^FOOTBAG_DB_PATH=/srv/footbag/footbag.db$' "$ENV_PATH"; then
  echo "    Migrating env file to directory-mount DB layout..."
  sed -i.bak \
    -e 's|^FOOTBAG_DB_PATH=/srv/footbag/footbag.db$|FOOTBAG_DB_PATH=/srv/footbag/db/footbag.db|' \
    "$ENV_PATH"
  if ! grep -q '^FOOTBAG_DB_DIR=' "$ENV_PATH"; then
    echo 'FOOTBAG_DB_DIR=/srv/footbag/db' >> "$ENV_PATH"
  fi
  rm -f /srv/footbag/footbag.db /srv/footbag/footbag.db-wal /srv/footbag/footbag.db-shm
fi

# One-shot migration: MEDIA_STORAGE_ADAPTER seed. Both staging and production
# read/write member uploads through the S3 media bucket via the runtime
# adapter; without this, docker-compose.prod.yml's fail-fast on the var
# stops the stack from starting (and prior to that gate, runtime member
# uploads silently landed on the container's local filesystem instead of S3,
# producing 403s through CloudFront/OAC). Operator can override by setting
# MEDIA_STORAGE_ADAPTER=local in $ENV_PATH before deploy if they want to
# exercise the dev-parity local adapter on a staging host.
if ! grep -q '^MEDIA_STORAGE_ADAPTER=' "$ENV_PATH"; then
  echo "    Seeding MEDIA_STORAGE_ADAPTER=s3 into env file (staging/prod default)..."
  echo 'MEDIA_STORAGE_ADAPTER=s3' >> "$ENV_PATH"
fi

# One-shot migration: INTERNAL_EVENT_SECRET seed. Authenticates the docker-
# internal channel between web and worker for the async curator video upload
# (DD §6.8). Generated locally; never traverses the public surface. To rotate,
# delete the line from /srv/footbag/env and redeploy.
if ! grep -q '^INTERNAL_EVENT_SECRET=' "$ENV_PATH"; then
  echo "    Seeding INTERNAL_EVENT_SECRET into env file (random hex)..."
  printf 'INTERNAL_EVENT_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$ENV_PATH"
fi

# One-shot migration: HTTP_REACHABILITY_ADAPTER seed. Controls the post-
# Safe-Browsing reachability HEAD probe in the external-URL validator.
# Required in prod-mode env.ts; without a seed, web + worker crash-loop on
# first deploy of any branch carrying this adapter. Default 'live' matches
# the intended runtime behavior; an operator who wants to disable outbound
# HEAD probes on a specific host edits this line.
if ! grep -q '^HTTP_REACHABILITY_ADAPTER=' "$ENV_PATH"; then
  echo "    Seeding HTTP_REACHABILITY_ADAPTER=live into env file..."
  echo 'HTTP_REACHABILITY_ADAPTER=live' >> "$ENV_PATH"
fi

# One-shot migration: SECRETS_ADAPTER seed. Selects the live/stub/local impl
# used by Node consumers to read SSM-stored third-party secrets (Safe
# Browsing API key, future Stripe keys, admin bootstrap tokens). Required in
# prod-mode env.ts; without a seed, web + worker crash-loop. 'live' calls
# SSM GetParameter via the assumed-role chain.
if ! grep -q '^SECRETS_ADAPTER=' "$ENV_PATH"; then
  echo "    Seeding SECRETS_ADAPTER=live into env file..."
  echo 'SECRETS_ADAPTER=live' >> "$ENV_PATH"
fi

# One-shot migration: SAFE_BROWSING_ADAPTER seed. Default 'stub' on first
# deploy: until the operator has both put-parameter'd the real Safe Browsing
# API key into SSM AND flipped this to 'live', the validator runs without
# outbound calls to Google. Two-step opt-in is intentional: a key landing
# in SSM without the adapter flip stays in standby, not silently in-use.
if ! grep -q '^SAFE_BROWSING_ADAPTER=' "$ENV_PATH"; then
  echo "    Seeding SAFE_BROWSING_ADAPTER=stub into env file (operator flips to live after put-parameter)..."
  echo 'SAFE_BROWSING_ADAPTER=stub' >> "$ENV_PATH"
fi

# Reconcile SES_ADAPTER for non-production hosts. src/config/env.ts forces the
# stub adapter on staging and development (so no real mail leaves a
# non-production environment) and refuses any other value at boot, so the
# operator has no legitimate choice here; overwriting corrects a stale host
# value (a non-production host left on the live adapter, say) on the next deploy
# instead of letting the stack crash-loop. Production is left operator-owned:
# env.ts requires the live adapter there and SES_FROM_IDENTITY is asserted
# below, so the value is validated rather than auto-written.
FOOTBAG_ENV_VAL=$(require_env FOOTBAG_ENV)
if [[ "$FOOTBAG_ENV_VAL" == "staging" || "$FOOTBAG_ENV_VAL" == "development" ]]; then
  echo "    Reconciling SES_ADAPTER=stub into env file (FOOTBAG_ENV=$FOOTBAG_ENV_VAL; non-production must not send real mail)..."
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
# existing one (env.ts permits PAYMENT_ADAPTER=live on staging, for instance to
# exercise Stripe). Production is operator-set: env.ts forbids 'stub' there and
# the live factory fails fast until the Stripe-SDK slice ships, so a fresh
# production host fails loud at the compose guard, the correct unconfigured signal.
if [[ "$FOOTBAG_ENV_VAL" != "production" ]]; then
  if ! grep -q '^PAYMENT_ADAPTER=' "$ENV_PATH"; then
    echo "    Seeding PAYMENT_ADAPTER=stub into env file (staging/dev default; preserved if already set)..."
    echo 'PAYMENT_ADAPTER=stub' >> "$ENV_PATH"
  fi
fi

NODE_ENV_VAL=$(require_env NODE_ENV)
LOG_LEVEL_VAL=$(require_env LOG_LEVEL)
DB_PATH=$(require_env FOOTBAG_DB_PATH)
PUBLIC_BASE_URL_VAL=$(require_env PUBLIC_BASE_URL)
# SESSION_SECRET is intentionally NOT pulled from /srv/footbag/env here.
# Terraform owns the canonical value (random_id.session_secret in
# terraform/{env}/ssm.tf); the SSM-sync block below fetches that value,
# writes it into /srv/footbag/env, and sets SESSION_SECRET_VAL. First-
# deploy bootstrap: the host's /srv/footbag/env does not need a manual
# SESSION_SECRET= line ahead of time.
JWT_SIGNER_VAL=$(require_env JWT_SIGNER)
JWT_KMS_KEY_ID_VAL=$(require_env JWT_KMS_KEY_ID)
SES_ADAPTER_VAL=$(require_env SES_ADAPTER)
SES_FROM_IDENTITY_VAL=$(require_env SES_FROM_IDENTITY)
AWS_REGION_VAL=$(require_env AWS_REGION)
AWS_PROFILE_VAL=$(require_env AWS_PROFILE)

# Defense-in-depth refuse-check (workstation half also gates this). The
# script auto-wipes the S3 media bucket on staging by default; on non-
# staging environments the operator must pass --keep-media to opt out of
# the wipe. Production media wipes are an out-of-band operator procedure.
: "${KEEP_MEDIA:?must be set by deploy-rebuild.sh via cat-pipe}"
if [[ "$FOOTBAG_ENV_VAL" != "staging" && "$KEEP_MEDIA" != "yes" ]]; then
  echo "ERROR: refusing to auto-wipe S3 media on FOOTBAG_ENV=$FOOTBAG_ENV_VAL." >&2
  echo "       Pass --keep-media to rebuild the DB without touching S3." >&2
  echo "       Wiping non-staging media is out-of-band; see DEVOPS_GUIDE." >&2
  exit 1
fi

# Sync X_ORIGIN_VERIFY_SECRET from SSM to /srv/footbag/env. Both the value
# CloudFront injects (via data.aws_ssm_parameter.origin_verify_secret) and the
# value nginx compares against (rendered into /etc/nginx/nginx.conf by
# docker/nginx/40-render-nginx-conf.sh) must agree, or every CloudFront request
# 444s. The canonical value is generated by the Terraform random_id resource
# in terraform/{staging,production}/ssm.tf; this fetch keeps the host env
# in sync after a `terraform apply -replace=random_id.origin_verify_secret`.
# IAM: AWS_PROFILE source-profile AssumeRoles into app_runtime which holds
# ssm:GetParameter on /footbag/{env}/* and kms:Decrypt on the main key.
ssm_origin_param="/footbag/${FOOTBAG_ENV_VAL}/secrets/origin_verify_secret"
echo "    Syncing X_ORIGIN_VERIFY_SECRET from $ssm_origin_param ..."
ORIGIN_VERIFY_SECRET_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_origin_param" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
) || { echo "ERROR: aws ssm get-parameter failed for $ssm_origin_param" >&2; exit 1; }

# Shape check mirrors docker/nginx/40-render-nginx-conf.sh.
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
# X_ORIGIN_VERIFY_SECRET pattern above: the canonical value is generated
# by random_id.session_secret in terraform/{env}/ssm.tf; this fetch
# keeps the host env in sync after a `terraform apply
# -replace=random_id.session_secret`. SESSION_SECRET rotation invalidates
# every active session (cookie signatures fail under the new secret).
# IAM: same as X_ORIGIN_VERIFY_SECRET; app_runtime holds ssm:GetParameter
# on /footbag/{env}/* and kms:Decrypt on the main key.
ssm_session_param="/footbag/${FOOTBAG_ENV_VAL}/secrets/session_secret"
echo "    Syncing SESSION_SECRET from $ssm_session_param ..."
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
  echo "    Updating FOOTBAG_DEV_INITIAL_ADMIN_EMAILS in $ENV_PATH ..."
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

if [[ "$SESSION_SECRET_VAL" == *'#'* ]]; then
  echo "SESSION_SECRET contains '#' which breaks systemd EnvironmentFile parsing" >&2
  exit 1
fi

if [[ "${SESSION_SECRET_VAL,,}" == *changeme* ]]; then
  echo "SESSION_SECRET appears to be the .env.example placeholder ('changeme...'). Generate a fresh value with: openssl rand -hex 32" >&2
  exit 1
fi

if (( ${#SESSION_SECRET_VAL} < 32 )); then
  echo "SESSION_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32" >&2
  exit 1
fi

# The secret is on disk in /srv/footbag/env now; nothing below needs it, so
# drop it from the shell environment rather than letting it linger for the
# rest of the run.
unset SESSION_SECRET_VAL

if [[ -z "$DB_PATH" || "$DB_PATH" == "/" ]]; then
  echo "Refusing to deploy with unsafe FOOTBAG_DB_PATH: '$DB_PATH'" >&2
  exit 1
fi

echo "    Runtime DB path from env: $DB_PATH"
echo "    WARNING: replacing host DB at $DB_PATH"

echo "    Stopping service..."
systemctl stop footbag || true

echo "    Ensuring compose stack is fully down..."
compose_cmd down --remove-orphans || true

# S3 media sync is gated on the SYNC_MEDIA env, threaded from the workstation's
# orchestrator (deploy-to-aws.sh sets it yes only with the -m/--sync-media
# opt-in; default off). When off, S3 is fully preserved across this deploy
# (no wipe, no sync, no aws-s3 calls).
#
# --keep-media skips deletion of S3-only objects (additive sync).
# Without --keep-media, sync --delete removes S3 objects that have no local
# counterpart. --size-only skips uploads for files whose size already
# matches, avoiding redundant transfers for unchanged media.
# DR bucket auto-receives delete markers via replication.
: "${SYNC_MEDIA:?must be set by deploy-rebuild.sh via cat-pipe}"
if [[ "$SYNC_MEDIA" != "yes" ]]; then
  echo "    SYNC_MEDIA not set: skipping S3 sync; live media untouched."
else
  if [[ -d "${RELEASE_DIR}/.curated-build" ]]; then
    MEDIA_STORAGE_S3_BUCKET_VAL=$(require_env MEDIA_STORAGE_S3_BUCKET)
    SYNC_FLAGS="--size-only"
    if [[ "$KEEP_MEDIA" != "yes" ]]; then
      SYNC_FLAGS="--delete --size-only"
      echo "    Syncing media to s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/ (--delete: removing stale objects)..."
    else
      echo "    Syncing media to s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/ (--keep-media: additive only)..."
    fi
    AWS_PROFILE="$AWS_PROFILE_VAL" aws s3 sync \
      --region "$AWS_REGION_VAL" \
      $SYNC_FLAGS \
      "${RELEASE_DIR}/.curated-build/" \
      "s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/"
    echo "    Media sync complete."
  else
    echo "    WARNING: SYNC_MEDIA=yes but RELEASE_DIR/.curated-build does not exist; skipping S3 sync."
  fi
fi

echo "    Promoting release into $LIVE_DIR ..."
rsync -a --delete --exclude=/env --exclude=/db --exclude=/media --exclude=/data --exclude=/.curated-build "$RELEASE_DIR/" "$LIVE_DIR/"

echo "    Replacing live DB..."
mkdir -p "$(dirname "$DB_PATH")"
# Remove the main DB plus any stale WAL/SHM sidecars. A stale -wal next to a
# fresh main file would shadow the new data on first open.
rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
install -o root -g root -m 600 "$NEW_DB" "$DB_PATH"
chown -R root:root "$LIVE_DIR"

# Apply the committed per-environment container sizing now that the release
# tree (and docker/env/<env>.env) is in place, before the service restart.
seed_container_sizing

if ! test -f "$DB_PATH"; then
  echo "Expected SQLite file at $DB_PATH, but it is not a regular file" >&2
  exit 1
fi

echo "    Verifying copied DB on host..."
sqlite3 "$DB_PATH" 'PRAGMA integrity_check;' | grep -qx 'ok' || {
  echo "Copied DB failed integrity_check on host" >&2
  exit 1
}

echo "    Reinstalling service unit..."
cp "$LIVE_DIR/ops/systemd/footbag.service" /etc/systemd/system/
systemctl daemon-reload

# No host-side image build: the workstation builds + ships images via
# docker save | docker load before this remote-half runs.

# Container log shipping (awslogs). The prod compose overlay routes nginx/web/
# worker stdout into the CloudWatch groups the metric filters read; the awslogs
# driver authenticates with the Docker daemon's own credential chain, so dockerd
# is pointed at a least-privilege logs profile that assumes the Terraform-owned
# logs-publisher role. Installed before the compose restart so container
# (re)creation can attach the driver; a missing or broken profile fails loud
# here rather than letting container creation crash-loop the stack. Neither the
# profile name nor the region is a secret, so plain assignment is fine.
LOGS_PROFILE="footbag-${FOOTBAG_ENV_VAL}-logs"
if ! aws sts get-caller-identity --profile "$LOGS_PROFILE" >/dev/null 2>&1; then
  echo "    ERROR: AWS profile '$LOGS_PROFILE' cannot assume the logs-publisher role." >&2
  echo "           Fix before deploying: run terraform apply for this environment (it creates the" >&2
  echo "           footbag-${FOOTBAG_ENV_VAL}-logs-publisher role and the CloudWatch log groups), then add a" >&2
  echo "           [profile $LOGS_PROFILE] stanza to /root/.aws/config whose role_arn is that role and" >&2
  echo "           whose source_profile is footbag-${FOOTBAG_ENV_VAL}-source-profile." >&2
  exit 1
fi
install -d -m 0755 -o root -g root /etc/systemd/system/docker.service.d
awslogs_dropin_tmp=$(mktemp)
cat > "$awslogs_dropin_tmp" <<DROPIN
[Service]
Environment=AWS_SDK_LOAD_CONFIG=1
Environment=AWS_REGION=${AWS_REGION_VAL}
Environment=AWS_PROFILE=${LOGS_PROFILE}
DROPIN
if ! cmp -s "$awslogs_dropin_tmp" /etc/systemd/system/docker.service.d/awslogs.conf 2>/dev/null; then
  install -m 0644 -o root -g root "$awslogs_dropin_tmp" /etc/systemd/system/docker.service.d/awslogs.conf
  systemctl daemon-reload
  systemctl restart docker
  echo "    Installed dockerd awslogs drop-in; restarted docker."
fi
rm -f "$awslogs_dropin_tmp"

echo "    Restarting service (compose up via systemctl, --no-build)..."
if ! systemctl restart footbag; then
  echo "    ERROR: footbag.service failed to restart. Dumping diagnostics..." >&2
  dump_diagnostics
  exit 1
fi

sleep 3
if ! systemctl is-active --quiet footbag.service; then
  echo "    ERROR: footbag.service is not active after restart. Dumping diagnostics..." >&2
  dump_diagnostics
  exit 1
fi

systemctl status footbag.service --no-pager -l

# CUTOVER-REMOVE: post-deploy persona-catalog seed.
# Current: runs only when the workstation passed SEED_TEST_PERSONAS=yes (set by
#   --seed-test-personas). Signal only: the persona catalog is code
#   (dist/testkit/canonicalPersonas.js), so there is no JSON payload and
#   no stdin pipe. The seed runner is idempotent (skips existing slugs), so a
#   re-run incrementally adds newly-added catalog personas.
# Target: remove this block and the SEED_TEST_PERSONAS pathway at production
#   cutover.
#
# Runs inside the web container via `node dist/testkit/personaSeedRunner.js`
# (compiled at build time; no tsx in the runtime image). FOOTBAG_ENV is NOT
# overridden here: the container reads it from /srv/footbag/env per host;
# the testkit import guard throws when FOOTBAG_ENV='production'. The
# deploy_to_aws.sh wrapper also allowlists --seed-test-personas to
# DEPLOY_TARGET=footbag-staging only.
if [[ "${SEED_TEST_PERSONAS:-no}" == "yes" ]]; then
  echo "    Running persona-catalog seed..."
  if ! compose_cmd exec -T web node dist/testkit/personaSeedRunner.js; then
    echo "    ERROR: persona-catalog seed step exited non-zero; aborting the deploy." >&2
    exit 1
  fi
fi
