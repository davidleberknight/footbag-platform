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

# One-shot migration: SES_SANDBOX_MODE seed. Default 1 on first deploy of either
# environment: SES is in sandbox on day 0 until AWS grants production access.
# After SES production access is granted, the operator edits /srv/footbag/env
# to set SES_SANDBOX_MODE=0 and redeploys; the if-not-already-set check below
# preserves that operator edit on subsequent deploys.
if ! grep -q '^SES_SANDBOX_MODE=' "$ENV_PATH"; then
  echo "    Seeding SES_SANDBOX_MODE=1 into env file (initial SES sandbox default)..."
  echo 'SES_SANDBOX_MODE=1' >> "$ENV_PATH"
  if [[ "$FOOTBAG_ENV" == "production" ]]; then
    echo "    NOTE: production seed is also 1 because SES is in sandbox on day 0." >&2
    echo "    NOTE: after AWS grants SES production access, edit /srv/footbag/env" >&2
    echo "          to set SES_SANDBOX_MODE=0 and redeploy. Without this flip," >&2
    echo "          /register/check-email shows a stale sandbox warning banner." >&2
  fi
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
SES_SANDBOX_MODE_VAL=$(require_env SES_SANDBOX_MODE)
AWS_REGION_VAL=$(require_env AWS_REGION)
AWS_PROFILE_VAL=$(require_env AWS_PROFILE)
FOOTBAG_ENV_VAL=$(require_env FOOTBAG_ENV)

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
# IAM: same as X_ORIGIN_VERIFY_SECRET — app_runtime holds ssm:GetParameter
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
# first-admin uses the separate SSM-token claim mechanism documented in
# DESIGN_DECISIONS §3.6 ("Production first-admin design"). Refuse the value
# unless FOOTBAG_ENV is explicitly 'development' or 'staging' — production OR an
# unset/misspelled FOOTBAG_ENV both trip this guard before anything lands on
# disk. (env.ts also boot-fail-fasts under the same condition; this
# script-level guard catches the misconfiguration earlier.)
: "${FOOTBAG_DEV_INITIAL_ADMIN_EMAILS=}"
if [[ -n "$FOOTBAG_DEV_INITIAL_ADMIN_EMAILS" && "$FOOTBAG_ENV" != "development" && "$FOOTBAG_ENV" != "staging" ]]; then
  echo "ERROR: FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is dev/staging-only but was passed with FOOTBAG_ENV=${FOOTBAG_ENV:-<unset>}." >&2
  echo "       Production-first-admin uses the SSM-token claim path; see DESIGN_DECISIONS §3.6." >&2
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

# S3 media cycle (wipe + repopulate) is gated on the --sync-media opt-in
# threaded as SYNC_MEDIA env from the workstation's orchestrator. Without
# the opt-in, S3 is fully preserved across this deploy (no wipe, no sync,
# no aws-s3 calls). With the opt-in, the existing wipe semantics apply:
# auto-wipe on staging by default; --keep-media to skip the wipe but still
# rsync new bytes (incremental ETag-based sync).
#
# Avatar S3 keys are stable per member ID; on a fresh DB seed those IDs map
# to different people, so leaving old objects in place would serve the wrong
# person's photo at the new identity. The wipe ensures the rebuild is a true
# clean slate. The DR bucket auto-receives delete markers via replication.
# CloudFront edge cache may continue serving previously-cached objects for
# up to 7 days under the /media/* TTL, which is acceptable on staging.
: "${SYNC_MEDIA:?must be set by deploy-rebuild.sh via cat-pipe}"
if [[ "$SYNC_MEDIA" != "yes" ]]; then
  echo "    --sync-media not set: skipping S3 wipe + sync; live media untouched."
else
  if [[ "$KEEP_MEDIA" == "yes" ]]; then
    echo "    --keep-media: skipping S3 media wipe."
  else
    MEDIA_STORAGE_S3_BUCKET_VAL=$(require_env MEDIA_STORAGE_S3_BUCKET)
    echo "    Wiping s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/ (staging default; pass --keep-media to skip)..."
    AWS_PROFILE="$AWS_PROFILE_VAL" aws s3 rm \
      --region "$AWS_REGION_VAL" \
      "s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/" \
      --recursive
    echo "    S3 wipe complete; delete markers will replicate to DR bucket automatically."
  fi

  # Repopulate the bucket with the curator-seeded bytes that the workstation
  # produced via scripts/seed_fh_curator.py and rsync'd into
  # RELEASE_DIR/data/media/. Without this, the wipe above leaves S3 empty and
  # the FH avatar + demo-loop URLs render 403/404 (DD §1.5: bytes live in S3,
  # DB rows reference S3 keys; both sides must be in sync).
  if [[ -d "${RELEASE_DIR}/data/media" ]]; then
    : "${MEDIA_STORAGE_S3_BUCKET_VAL:=$(require_env MEDIA_STORAGE_S3_BUCKET)}"
    echo "    Syncing curator-seeded media to s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/ ..."
    AWS_PROFILE="$AWS_PROFILE_VAL" aws s3 sync \
      --region "$AWS_REGION_VAL" \
      "${RELEASE_DIR}/data/media/" \
      "s3://${MEDIA_STORAGE_S3_BUCKET_VAL}/"
    echo "    Curator media sync complete."
  else
    echo "    WARNING: --sync-media set but RELEASE_DIR/data/media does not exist; skipping S3 sync."
  fi
fi

echo "    Promoting release into $LIVE_DIR ..."
rsync -a --delete --exclude=/env --exclude=/db --exclude=/media --exclude=/data "$RELEASE_DIR/" "$LIVE_DIR/"

echo "    Replacing live DB..."
mkdir -p "$(dirname "$DB_PATH")"
# Remove the main DB plus any stale WAL/SHM sidecars. A stale -wal next to a
# fresh main file would shadow the new data on first open.
rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
install -o root -g root -m 600 "$NEW_DB" "$DB_PATH"
chown -R root:root "$LIVE_DIR"

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

# CUTOVER-REMOVE: post-deploy dev-admin seed.
# Current: runs only when the workstation passed a non-empty
#   FOOTBAG_DEV_ADMIN_SEED_JSON via cat-pipe (set by --seed-dev-admins;
#   otherwise the var arrives empty and we skip). Transient: NOT written to
#   /srv/footbag/env, so a future restart cannot replay it. The seed script's
#   own marker-based idempotency makes a replay harmless even if the var
#   were persisted, but transient is cleaner.
# Target: remove this block and the FOOTBAG_DEV_ADMIN_SEED_JSON pathway
#   once the production first-admin SSM-token flow is the only bootstrap
#   mechanism.
#
# Runs inside the web container via `node dist/dev-admin-shortcuts/seed.js`
# (compiled at build time; no tsx in the runtime image). The container
# reads FOOTBAG_ENV from /srv/footbag/env (set per host); seedConfig.ts
# throws on import when FOOTBAG_ENV='production'. The deploy_to_aws.sh
# wrapper also allowlists --seed-dev-admins to DEPLOY_TARGET=footbag-staging
# only.
#
# argv-leak hardening: the seed JSON content is piped to the container via
# stdin and reassigned to the env-var inside the container's shell. Passing it
# via `docker compose exec -e "VAR=value"` would put the JSON in the exec
# subprocess's argv where `ps -ef` on the host can read it. Stdin keeps the
# value off any process's argv on the host. Mirrors the sudo-password pattern
# at the top of every remote-half script.
if [[ -n "${FOOTBAG_DEV_ADMIN_SEED_JSON:-}" ]]; then
  echo "    Running dev-admin seed (transient stdin-piped input)..."
  # FOOTBAG_ENV is NOT overridden here: the container's /srv/footbag/env sets
  # it per host. seedConfig.ts throws on import when FOOTBAG_ENV='production',
  # which is the in-app guard. Overriding FOOTBAG_ENV here would defeat that
  # guard if this code ever ran on a production host.
  if ! printf '%s' "$FOOTBAG_DEV_ADMIN_SEED_JSON" \
      | compose_cmd exec -T \
        web sh -c 'FOOTBAG_DEV_ADMIN_SEED_JSON=$(cat) exec node dist/dev-admin-shortcuts/seed.js'; then
    echo "    WARNING: dev-admin seed step exited non-zero." >&2
    echo "    The deploy itself succeeded; the service is up. Re-run the seed" >&2
    echo "    after resolving the failure, or use staging diagnostics to inspect." >&2
  fi
fi
