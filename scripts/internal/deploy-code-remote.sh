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

echo "==> Promoting release (preserving env, DB, media)..."
rsync -a --delete \
  --exclude=/env --exclude=/db --exclude=/media \
  "$RELEASE_DIR/" "$LIVE_DIR/"
chown -R root:root "$LIVE_DIR"

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

# CUTOVER-REMOVE: post-deploy dev-admin seed. Mirrors the same block in
# deploy-rebuild-remote.sh. Runs only when the workstation passed a
# non-empty FOOTBAG_DEV_ADMIN_SEED_JSON (set by --seed-dev-admins).
# Transient: not written to /srv/footbag/env. Runs inside the web
# container via `node dist/dev-admin-shortcuts/seed.js` (compiled at
# build time; no tsx in the runtime image). The container reads
# FOOTBAG_ENV from /srv/footbag/env (set per host); seedConfig.ts throws
# on import when FOOTBAG_ENV='production'. The deploy_to_aws.sh wrapper
# also allowlists --seed-dev-admins to DEPLOY_TARGET=footbag-staging
# only.
#
# argv-leak hardening: the seed JSON content is piped to the container via
# stdin and reassigned to the env-var inside the container's shell. Passing it
# via `docker compose exec -e "VAR=value"` would put the JSON in the exec
# subprocess's argv where `ps -ef` on the host can read it. Stdin keeps the
# value off any process's argv on the host. Mirrors the sudo-password pattern
# at the top of every remote-half script.
if [[ -n "${FOOTBAG_DEV_ADMIN_SEED_JSON:-}" ]]; then
  echo "==> Running dev-admin seed (transient stdin-piped input)..."
  # FOOTBAG_ENV is NOT overridden here: the container's /srv/footbag/env sets
  # it per host. seedConfig.ts throws on import when FOOTBAG_ENV='production',
  # which is the in-app guard. Overriding FOOTBAG_ENV here would defeat that
  # guard if this code ever ran on a production host.
  if ! printf '%s' "$FOOTBAG_DEV_ADMIN_SEED_JSON" \
      | docker compose \
        --env-file "$ENV_PATH" \
        -f "$LIVE_DIR/docker/docker-compose.yml" \
        -f "$LIVE_DIR/docker/docker-compose.prod.yml" \
        exec -T \
        web sh -c 'FOOTBAG_DEV_ADMIN_SEED_JSON=$(cat) exec node dist/dev-admin-shortcuts/seed.js'; then
    echo "    WARNING: dev-admin seed step exited non-zero." >&2
    echo "    The deploy itself succeeded; the service is up. Re-run the seed" >&2
    echo "    after resolving the failure, or use staging diagnostics to inspect." >&2
  fi
fi
