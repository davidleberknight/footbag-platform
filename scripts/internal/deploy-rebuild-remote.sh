#!/usr/bin/env bash
# Root-side body of scripts/deploy-rebuild.sh.
#
# Invoked via:
#   cat - scripts/internal/deploy-rebuild-remote.sh | ssh REMOTE 'sudo -k -S -p "" bash'
#
# Runs as root for the full body; commands are bare (no per-line sudo).
#
# DESTRUCTIVE: replaces the live SQLite database with the rsync'd copy in
# $RELEASE_DIR. Caller is responsible for ensuring the rebuilt local DB is
# what should land on the host.

set -euo pipefail

# This body is destructive and must never run without the guard chain that
# the caller prepends into the same shell stream. The production-live guard
# sets this handshake as its last act; a direct invocation of this file (a
# refactor mistake or a hand-run copy) has no guard and refuses here.
if [[ "${PROD_LIVE_GUARD_RAN:-}" != "1" ]]; then
  echo "ERROR: the deploy guards did not run in this shell. This remote half must be" >&2
  echo "       streamed by scripts/deploy-rebuild.sh with its guard scripts prepended;" >&2
  echo "       direct invocation is refused." >&2
  exit 1
fi

LIVE_DIR=/srv/footbag
ENV_PATH=/srv/footbag/env
RELEASE_DIR=/home/footbag/footbag-release
NEW_DB="$RELEASE_DIR/database/footbag.db"

# The account the application containers run as. It has to match the image's
# runtime user, or the runtime directories end up owned by someone the
# container cannot write as.
readonly APP_UID=1000

# The group that owns the AWS credential files. The containers run unprivileged
# and reach the credentials by joining this group, so its numeric id has to
# match the one the compose files add. Host state, not repository state, so a
# rebuilt host has none until a deploy creates it.
readonly AWSCREDS_GROUP=awscreds
readonly AWSCREDS_GID=1500

# Every rewrite of the host env file below stages a full copy through a temp
# file in the same directory and then renames it into place. The rename removes
# the source name, so the happy path leaves nothing behind — but there are
# dozens of these across a run that takes many minutes, and an interruption
# between the copy and the rename (a dropped connection, a signal, a full disk)
# leaves a complete copy of /srv/footbag/env sitting on the host. That file
# holds the session signing key, the worker channel secret and the origin-verify
# secret. Mode 600 limits who can read it; nothing limits how long it stays, and
# nothing looks for it. The sweep is unconditional on exit for that reason: it
# costs nothing on a clean run and is the only thing that cleans up a dirty one.
cleanup_env_tempfiles() {
  rm -f /srv/footbag/.env.tmp.* /srv/footbag/.deployed-from.tmp.* 2>/dev/null || true
}
trap cleanup_env_tempfiles EXIT

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

# Reconcile the committed per-environment host config into /srv/footbag/env, so
# it is governed by version control instead of an operator remembering to set
# it. Two kinds of value: container sizing (memory limits, image concurrency,
# video tuning), and the adapter selectors that are a constant of a deployed
# environment rather than an operational choice. A selector an operator could
# legitimately want the other way without a code change is an arming switch,
# owned by Terraform and synced from Parameter Store further down, not a line
# in this file.
#
# The committed file docker/env/<FOOTBAG_ENV>.env is the source of truth: keys
# it lists are set, keys it omits are cleared (so production's omitted video
# knobs fall back to the canonical encoder defaults). Only an allowlist of keys
# is honored and every value is checked, so a tampered config file cannot inject
# a secret or a malformed line into the runtime env. Because this runs on every
# deploy rather than only when a line is absent, a hand edit on the host does
# not survive.
# All input reads are file-redirected (never fd 0), preserving the stdin /
# sudo-password discipline of the cat-pipe remote-exec pattern.
# Must run after the release tree is promoted into $LIVE_DIR.
# Pass "validate" to parse and check the committed file without writing
# anything. This half calls it that way before it stops the service, so a typo in
# a committed value fails while the stack is still up rather than after the
# service is down and the database has been replaced.
seed_committed_host_config() {
  local mode="${1:-apply}"
  # Second argument is the tree to read the committed file from. Validation runs
  # before the release is promoted, so it reads the incoming file rather than the
  # one currently live; applying runs after, where the two are the same file.
  local cfg="${2:-$LIVE_DIR}/docker/env/${FOOTBAG_ENV}.env"
  # Identical to the code deploy's allowlist, and pinned equal by a test. They
  # had drifted: this half accepted eight keys while the code deploy accepted
  # eleven, so a host stood up by a rebuild never received VIDEO_MAX_HEIGHT and
  # encoded at full source height on an instance sized for 720p, while the
  # verifier checked only the same eight and could not see it.
  local key_re='^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT$|^IMAGE_MAX_CONCURRENT$|^VIDEO_X264_(PRESET|THREADS|RC_LOOKAHEAD)$|^VIDEO_MAX_HEIGHT$|^FFMPEG_TIMEOUT_SECONDS$|^VIDEO_TRANSCODE_TIMEOUT_MS$|^VIDEO_MIN_HOST_AVAILABLE_MB$|^MEDIA_STORAGE_ADAPTER$|^SECRETS_ADAPTER$|^JWT_SIGNER$|^CAPTCHA_ADAPTER$|^TURNSTILE_SITE_KEY$'
  local line_re='^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT=|^IMAGE_MAX_CONCURRENT=|^VIDEO_X264_(PRESET|THREADS|RC_LOOKAHEAD)=|^VIDEO_MAX_HEIGHT=|^FFMPEG_TIMEOUT_SECONDS=|^VIDEO_TRANSCODE_TIMEOUT_MS=|^VIDEO_MIN_HOST_AVAILABLE_MB=|^MEDIA_STORAGE_ADAPTER=|^SECRETS_ADAPTER=|^JWT_SIGNER=|^CAPTCHA_ADAPTER=|^TURNSTILE_SITE_KEY='
  if [[ ! -f "$cfg" ]]; then
    echo "ERROR: host config $cfg is missing; refusing to deploy with unmanaged container sizing and adapter selectors." >&2
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
      IMAGE_MAX_CONCURRENT|VIDEO_X264_THREADS|VIDEO_X264_RC_LOOKAHEAD|VIDEO_MAX_HEIGHT|FFMPEG_TIMEOUT_SECONDS|VIDEO_TRANSCODE_TIMEOUT_MS|VIDEO_MIN_HOST_AVAILABLE_MB)
        [[ "$val" =~ ^[0-9]+$ ]] || { echo "ERROR: $cfg: $key='$val' is not a non-negative integer." >&2; rm -f "$adds"; exit 1; } ;;
      VIDEO_X264_PRESET)
        [[ "$val" =~ ^[a-z]+$ ]] || { echo "ERROR: $cfg: $key='$val' is not a valid x264 preset." >&2; rm -f "$adds"; exit 1; } ;;
      # The three selectors below have exactly one correct value on any
      # deployed host, so the check pins the value rather than the shape: the
      # other value in each pair is a development affordance, and a typo here
      # would otherwise reach a container and fail at boot or, worse, resolve
      # to a working but wrong backend.
      MEDIA_STORAGE_ADAPTER)
        [[ "$val" == "s3" ]] || { echo "ERROR: $cfg: $key='$val'; a deployed host stores media in object storage ('s3')." >&2; rm -f "$adds"; exit 1; } ;;
      SECRETS_ADAPTER)
        [[ "$val" == "live" ]] || { echo "ERROR: $cfg: $key='$val'; a deployed host reads secrets from Parameter Store ('live')." >&2; rm -f "$adds"; exit 1; } ;;
      JWT_SIGNER)
        [[ "$val" == "kms" ]] || { echo "ERROR: $cfg: $key='$val'; a deployed host signs sessions with KMS ('kms')." >&2; rm -f "$adds"; exit 1; } ;;
      CAPTCHA_ADAPTER)
        [[ "$val" =~ ^(live|stub)$ ]] || { echo "ERROR: $cfg: $key='$val' is not 'live' or 'stub'." >&2; rm -f "$adds"; exit 1; } ;;
      # Shape, not value: the site key is issued by Cloudflare and differs per
      # widget, so nothing here can know the right one. What is checkable is
      # that it looks like a Turnstile site key rather than the secret half of
      # the pair, which starts with the same prefix and must never land here.
      TURNSTILE_SITE_KEY)
        [[ "$val" =~ ^0x[A-Za-z0-9_-]{10,}$ ]] || { echo "ERROR: $cfg: $key='$val' is not a Turnstile site key (expected 0x followed by the key body)." >&2; rm -f "$adds"; exit 1; } ;;
    esac
    printf '%s=%s\n' "$key" "$val" >> "$adds"
  done < "$cfg"
  if [[ "$mode" == "validate" ]]; then
    rm -f "$adds"
    echo "    Validated committed host config for '$FOOTBAG_ENV' from $cfg"
    return 0
  fi
  local tmp
  tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$tmp"; chown root:root "$tmp"
  grep -vE "$line_re" "$ENV_PATH" > "$tmp" || true
  cat "$adds" >> "$tmp"
  rm -f "$adds"
  mv "$tmp" "$ENV_PATH"
  echo "    Reconciled committed host config for '$FOOTBAG_ENV' from $cfg"
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
  # In place, with no backup copy: the sed default would leave a full plaintext
  # copy of the previous env file, secrets and all, sitting beside it forever.
  sed -i \
    -e 's|^FOOTBAG_DB_PATH=/srv/footbag/footbag.db$|FOOTBAG_DB_PATH=/srv/footbag/db/footbag.db|' \
    "$ENV_PATH"
  if ! grep -q '^FOOTBAG_DB_DIR=' "$ENV_PATH"; then
    echo 'FOOTBAG_DB_DIR=/srv/footbag/db' >> "$ENV_PATH"
  fi
  rm -f /srv/footbag/footbag.db /srv/footbag/footbag.db-wal /srv/footbag/footbag.db-shm
fi

# MEDIA_STORAGE_ADAPTER, SECRETS_ADAPTER, JWT_SIGNER and CAPTCHA_ADAPTER are
# not seeded here. They are constants of a deployed environment, declared in the
# committed docker/env/<FOOTBAG_ENV>.env and reconciled by
# seed_committed_host_config on every deploy, so the committed file is their
# source rather than whoever last edited the host.

# One-shot migration: INTERNAL_EVENT_SECRET seed. Authenticates the docker-
# internal channel between web and worker for the async curator video upload
# (DD §6.8). Generated locally; never traverses the public surface. To rotate,
# delete the line from /srv/footbag/env and redeploy.
if ! grep -q '^INTERNAL_EVENT_SECRET=' "$ENV_PATH"; then
  echo "    Seeding INTERNAL_EVENT_SECRET into env file (random hex)..."
  printf 'INTERNAL_EVENT_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$ENV_PATH"
fi

# SAFE_BROWSING_ADAPTER and HTTP_REACHABILITY_ADAPTER are not seeded here
# either. They are derived from their arming switches further down, in every
# deployed environment rather than on production alone, so the declared switch
# and the running selector cannot disagree. The two-step opt-in that the old
# seed provided still holds and now lives in Terraform: URL screening is seeded
# dark on production, so a key landing in Parameter Store without the switch
# being flipped stays in standby rather than silently in use.

# Reconcile SES_ADAPTER for non-production hosts. src/config/env.ts forces the
# stub adapter on staging and development (so no real mail leaves a
# non-production environment) and refuses any other value at boot, so the
# operator has no legitimate choice here; overwriting corrects a stale host
# value (a non-production host left on the live adapter, say) on the next deploy
# instead of letting the stack crash-loop. Production is derived, not
# hand-owned: the arming-switch sync later in this script writes SES_ADAPTER
# from the declared flag (armed -> live, dark -> stub).
FOOTBAG_ENV_VAL=$(require_env FOOTBAG_ENV)

# The media bucket name is no longer composed here. It is an identifier
# Terraform creates, published as an app parameter read from the bucket resource
# and synced onto the host further down, so a bucket rename travels with the
# resource instead of relying on every environment's bucket being named by
# construction.
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
# existing one. env.ts refuses the live payment SDK anywhere below production,
# so the stub is the only bootable value here. Production is derived, not
# hand-owned: the arming-switch sync later in this script writes
# PAYMENT_ADAPTER from the declared flag (armed -> live, dark -> stub).
if [[ "$FOOTBAG_ENV_VAL" != "production" ]]; then
  if ! grep -q '^PAYMENT_ADAPTER=' "$ENV_PATH"; then
    echo "    Seeding PAYMENT_ADAPTER=stub into env file (staging/dev default; preserved if already set)..."
    echo 'PAYMENT_ADAPTER=stub' >> "$ENV_PATH"
  fi
  # The stub adapter's built-in signing secret is committed source, so a host
  # that kept it would accept a webhook forged by anyone holding a checkout of
  # the repository. Give each host its own value instead. The whsec_stub_
  # prefix keeps env.ts's production rejection working as a backstop if the
  # value is ever mis-pasted into STRIPE_WEBHOOK_SECRET. Never overwritten: a
  # regenerated secret would silently reject deliveries already configured.
  if ! grep -q '^STRIPE_WEBHOOK_SECRET_STUB=' "$ENV_PATH"; then
    echo "    Seeding a generated STRIPE_WEBHOOK_SECRET_STUB into env file (preserved if already set)..."
    printf 'STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_%s\n' "$(openssl rand -hex 24)" >> "$ENV_PATH"
  fi
fi

# Required for its presence, not its value: this script never reads NODE_ENV
# back. The compose file interpolates it, so a host missing the line produces a
# stack that cannot start, and finding that out here is better than finding it
# out after the database has been replaced. Discarding the value rather than
# capturing it says so, instead of leaving a variable that looks live.
require_env NODE_ENV >/dev/null
# LOG_LEVEL is intentionally NOT pulled from /srv/footbag/env here. Terraform
# owns the canonical value (aws_ssm_parameter.app_log_level in
# terraform/{env}/ssm.tf); the SSM-sync block below fetches it and writes it
# into /srv/footbag/env. First-deploy bootstrap: the host's env file does not
# need a manual LOG_LEVEL= line ahead of time.
DB_PATH=$(require_env FOOTBAG_DB_PATH)
# Presence check only, same as NODE_ENV above: the application reads this at
# boot to decide its canonical host, and nothing in this script needs the value.
require_env PUBLIC_BASE_URL >/dev/null
# SESSION_SECRET is intentionally NOT pulled from /srv/footbag/env here.
# Terraform owns the canonical value (random_id.session_secret in
# terraform/{env}/ssm.tf); the SSM-sync block below fetches that value,
# writes it into /srv/footbag/env, and sets SESSION_SECRET_VAL. First-
# deploy bootstrap: the host's /srv/footbag/env does not need a manual
# SESSION_SECRET= line ahead of time.
# JWT_SIGNER and JWT_KMS_KEY_ID are deliberately NOT required here, for the same
# reason SES_ADAPTER is not: this script now writes both. The signer is a
# constant of the environment, reconciled from the committed host config after
# the release tree is promoted; the key identifier is published by Terraform and
# synced from Parameter Store further down, which needs the AWS profile resolved
# first. Requiring them at this point would ask a first-ever deploy for values it
# is itself about to write. The end state is asserted after both writers have
# run.
# SES_ADAPTER is deliberately NOT required here. No environment hand-owns it:
# staging and development have it written a few lines above, and production
# derives it from the arming switches further down, which needs the AWS profile
# resolved first and so cannot run any earlier. Requiring it at this point
# therefore asks for a value this script is itself about to write, which a
# first-ever production deploy cannot satisfy — the env file has no SES_ADAPTER
# line yet, and the deploy refuses before reaching the code that would add it.
# The end state is asserted after the derivation instead, which is the thing
# actually worth guaranteeing.
# Presence check only. Nothing here reads it, but the live SES adapter requires
# it at boot and the compose file interpolates it with no default, so a host
# missing the line crash-loops the moment email is armed. Catching that before
# the rebuild is the whole value of the check.
require_env SES_FROM_IDENTITY >/dev/null
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
  echo "       Wiping non-staging media is out-of-band; see DEVOPS_GUIDE.md (private GitHub repo)." >&2
  exit 1
fi

# This half carries no separate parameter preflight, and that is deliberate
# rather than a divergence from the code half. Every required fetch below runs
# before anything irreversible: before the service is stopped, before the
# database is replaced, and before the release tree is promoted. A missing
# parameter therefore aborts with the host exactly as it was. The code half
# promotes early, so it preflights the same set before its rsync to avoid
# installing a compose file whose values it has not yet written.

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

# Sync LOG_LEVEL from SSM to /srv/footbag/env, same pattern as the two secrets
# above but on a plain String parameter (no --with-decryption). It is the one
# knob that decides which lines reach CloudWatch at all: a metric filter counting
# a warn-level line is starved if the host runs quieter, and a debug-level host
# floods the log pipeline. Sourcing it from Parameter Store makes the declared
# value the value that actually runs, instead of whatever a past operator typed
# into the host env file.
ssm_log_level_param="/footbag/${FOOTBAG_ENV_VAL}/app/log_level"
echo "    Syncing LOG_LEVEL from $ssm_log_level_param ..."
LOG_LEVEL_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_log_level_param" \
    --query 'Parameter.Value' \
    --output text
) || {
  echo "ERROR: aws ssm get-parameter failed for $ssm_log_level_param" >&2
  echo "       If the parameter does not exist yet, from the workstation run:" >&2
  echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
  exit 1
}
if [[ ! "$LOG_LEVEL_VAL" =~ ^(error|warn|info|debug)$ ]]; then
  echo "ERROR: SSM $ssm_log_level_param is '$LOG_LEVEL_VAL'; expected one of error, warn, info, debug." >&2
  exit 1
fi

env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^LOG_LEVEL=' "$ENV_PATH" > "$env_tmp" || true
printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

# Sync the arming switches the same required-parameter way as LOG_LEVEL. Each
# switch declares the arming state of one real-world side (payments, email);
# Terraform owns the value, and every deploy makes the declared value the
# running value. A missing parameter is a hard error: the environment needs
# its terraform apply first.
ssm_payments_armed_param="/footbag/${FOOTBAG_ENV_VAL}/app/payments_armed"
echo "    Syncing PAYMENTS_ARMED from $ssm_payments_armed_param ..."
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
echo "    Syncing EMAIL_SEND_ARMED from $ssm_email_send_armed_param ..."
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

# Sync the two link-protection switches on the same required-parameter contract.
# The difference from the pair above is what they do below production: money and
# mail are stubbed in a lower environment whatever their switch says, while
# screening and probing a submitted link have no real-world side effect to
# withhold, so these decide in every deployed environment and their selectors
# are derived here for staging exactly as for production.
ssm_url_screening_armed_param="/footbag/${FOOTBAG_ENV_VAL}/app/url_screening_armed"
echo "    Syncing URL_SCREENING_ARMED from $ssm_url_screening_armed_param ..."
URL_SCREENING_ARMED_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_url_screening_armed_param" \
    --query 'Parameter.Value' \
    --output text
) || {
  echo "ERROR: aws ssm get-parameter failed for $ssm_url_screening_armed_param" >&2
  echo "       If the parameter does not exist yet, from the workstation run:" >&2
  echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
  exit 1
}
if [[ ! "$URL_SCREENING_ARMED_VAL" =~ ^(armed|dark)$ ]]; then
  echo "ERROR: SSM $ssm_url_screening_armed_param is '$URL_SCREENING_ARMED_VAL'; expected 'armed' or 'dark'." >&2
  exit 1
fi
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^URL_SCREENING_ARMED=' "$ENV_PATH" > "$env_tmp" || true
printf 'URL_SCREENING_ARMED=%s\n' "$URL_SCREENING_ARMED_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

ssm_reachability_armed_param="/footbag/${FOOTBAG_ENV_VAL}/app/reachability_armed"
echo "    Syncing REACHABILITY_ARMED from $ssm_reachability_armed_param ..."
REACHABILITY_ARMED_VAL=$(
  AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
    --region "$AWS_REGION_VAL" \
    --name "$ssm_reachability_armed_param" \
    --query 'Parameter.Value' \
    --output text
) || {
  echo "ERROR: aws ssm get-parameter failed for $ssm_reachability_armed_param" >&2
  echo "       If the parameter does not exist yet, from the workstation run:" >&2
  echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
  exit 1
}
if [[ ! "$REACHABILITY_ARMED_VAL" =~ ^(armed|dark)$ ]]; then
  echo "ERROR: SSM $ssm_reachability_armed_param is '$REACHABILITY_ARMED_VAL'; expected 'armed' or 'dark'." >&2
  exit 1
fi
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v '^REACHABILITY_ARMED=' "$ENV_PATH" > "$env_tmp" || true
printf 'REACHABILITY_ARMED=%s\n' "$REACHABILITY_ARMED_VAL" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

# Derive the two link-protection selectors from the switches just synced, in
# every deployed environment. The runtime refuses a boot where a switch and its
# selector disagree; deriving here is what makes that refusal unreachable in
# normal operation rather than a routine failure mode.
SAFE_BROWSING_ADAPTER_DERIVED='stub'
[[ "$URL_SCREENING_ARMED_VAL" == "armed" ]] && SAFE_BROWSING_ADAPTER_DERIVED='live'
HTTP_REACHABILITY_ADAPTER_DERIVED='disabled'
[[ "$REACHABILITY_ARMED_VAL" == "armed" ]] && HTTP_REACHABILITY_ADAPTER_DERIVED='live'
echo "    Deriving link-protection adapters from arming switches: SAFE_BROWSING_ADAPTER=$SAFE_BROWSING_ADAPTER_DERIVED HTTP_REACHABILITY_ADAPTER=$HTTP_REACHABILITY_ADAPTER_DERIVED ..."
env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
chmod 600 "$env_tmp"
chown root:root "$env_tmp"
grep -v -e '^SAFE_BROWSING_ADAPTER=' -e '^HTTP_REACHABILITY_ADAPTER=' "$ENV_PATH" > "$env_tmp" || true
printf 'SAFE_BROWSING_ADAPTER=%s\n' "$SAFE_BROWSING_ADAPTER_DERIVED" >> "$env_tmp"
printf 'HTTP_REACHABILITY_ADAPTER=%s\n' "$HTTP_REACHABILITY_ADAPTER_DERIVED" >> "$env_tmp"
mv "$env_tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"
chown root:root "$ENV_PATH"

# Sync the two SES configuration-set names. Outbound mail runs as two streams
# with separate sending reputations, and naming a set on the send is what keeps
# a complaint spike on bulk mail off the reputation that carries password
# resets. Terraform owns both names (the parameter reads the configuration-set
# resource, so a rename moves with it); this fetch puts them on the host so the
# application can name them. A missing parameter is fatal with the same
# instruction as the arming switches above: the alternative is a host that
# silently sends on the account default while the operator believes the streams
# are separated.
for ses_set_stream in transactional bulk; do
  ses_set_param="/footbag/${FOOTBAG_ENV_VAL}/app/ses_configuration_set_${ses_set_stream}"
  echo "    Syncing SES_CONFIGURATION_SET_${ses_set_stream^^} from $ses_set_param ..."
  ses_set_value=$(
    AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
      --region "$AWS_REGION_VAL" \
      --name "$ses_set_param" \
      --query 'Parameter.Value' \
      --output text
  ) || {
    echo "ERROR: aws ssm get-parameter failed for $ses_set_param" >&2
    echo "       If the parameter does not exist yet, from the workstation run:" >&2
    echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
    exit 1
  }
  if [[ -z "$ses_set_value" ]]; then
    echo "ERROR: SSM $ses_set_param resolved empty; expected the configuration-set name terraform published." >&2
    exit 1
  fi
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v "^SES_CONFIGURATION_SET_${ses_set_stream^^}=" "$ENV_PATH" > "$env_tmp" || true
  printf 'SES_CONFIGURATION_SET_%s=%s\n' "${ses_set_stream^^}" "$ses_set_value" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
done
unset ses_set_stream ses_set_param ses_set_value

# Sync the two identifiers Terraform creates and the host needs. Same shape as
# the configuration-set names above and the same reason: the parameter reads the
# resource, so a rename travels with it and no literal is composed here.
#
# The signing-key identifier is the one that bites. The signing adapter stamps
# this exact string into every session token's key-id header and refuses a token
# whose header does not match, so a host holding the key's ARN rather than its
# alias publishes the AWS account id to every client with a session, and
# correcting it later invalidates every live session. Syncing it on every deploy
# is what stops that form taking hold in the first place.
for host_ident in media_bucket:MEDIA_STORAGE_S3_BUCKET jwt_kms_key_id:JWT_KMS_KEY_ID; do
  ident_param="/footbag/${FOOTBAG_ENV_VAL}/app/${host_ident%%:*}"
  ident_var="${host_ident##*:}"
  echo "    Syncing ${ident_var} from $ident_param ..."
  ident_value=$(
    AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
      --region "$AWS_REGION_VAL" \
      --name "$ident_param" \
      --query 'Parameter.Value' \
      --output text
  ) || {
    echo "ERROR: aws ssm get-parameter failed for $ident_param" >&2
    echo "       If the parameter does not exist yet, from the workstation run:" >&2
    echo "         cd terraform/${FOOTBAG_ENV_VAL} && terraform init -upgrade && terraform apply" >&2
    exit 1
  }
  if [[ -z "$ident_value" ]]; then
    echo "ERROR: SSM $ident_param resolved empty; expected the value terraform published." >&2
    exit 1
  fi
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v "^${ident_var}=" "$ENV_PATH" > "$env_tmp" || true
  printf '%s=%s\n' "$ident_var" "$ident_value" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
done
unset host_ident ident_param ident_var ident_value

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
  echo "    Deriving production adapters from arming switches: SES_ADAPTER=$SES_ADAPTER_DERIVED PAYMENT_ADAPTER=$PAYMENT_ADAPTER_DERIVED ..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v -e '^SES_ADAPTER=' -e '^PAYMENT_ADAPTER=' "$ENV_PATH" > "$env_tmp" || true
  printf 'SES_ADAPTER=%s\n' "$SES_ADAPTER_DERIVED" >> "$env_tmp"
  printf 'PAYMENT_ADAPTER=%s\n' "$PAYMENT_ADAPTER_DERIVED" >> "$env_tmp"
  mv "$env_tmp" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
  chown root:root "$ENV_PATH"
  # Assert the end state now that every writer has run. The application refuses
  # to boot without this, so catching an absent value here fails the deploy with
  # a clear cause rather than leaving the stack crash-looping on the host.
  if ! grep -q '^SES_ADAPTER=' "$ENV_PATH"; then
    echo "ERROR: SES_ADAPTER is absent from $ENV_PATH after the arming-switch derivation." >&2
    echo "       The derivation above writes it from app/email_send_armed; if it is missing," >&2
    echo "       that write did not happen and the application will refuse to boot." >&2
    exit 1
  fi

  if [[ "$PAYMENT_ADAPTER_DERIVED" == "stub" ]] && ! grep -q '^STRIPE_WEBHOOK_SECRET_STUB=' "$ENV_PATH"; then
    echo "    Seeding a generated STRIPE_WEBHOOK_SECRET_STUB into env file (dark payments; preserved if already set)..."
    printf 'STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_%s\n' "$(openssl rand -hex 24)" >> "$ENV_PATH"
  fi

  # Sync the Stripe webhook signing secrets from Parameter Store. A real
  # value in the parameter is authoritative and overwrites the host line on
  # every deploy, so the secret is never hand-pasted onto a host; while the
  # parameter still holds its bootstrap placeholder the
  # sync leaves any existing host value untouched, so a value installed by
  # the payments activation or rotation script survives deploys until the
  # parameter carries the real secret. The _previous twin carries the
  # outgoing secret during a Stripe secret roll.
  sync_stripe_webhook_secret() {
    local env_key="$1" param_suffix="$2"
    local param="/footbag/${FOOTBAG_ENV_VAL}/secrets/${param_suffix}"
    local value
    echo "    Syncing ${env_key} from ${param} ..."
    # A failed read and a placeholder are different facts and must not share a
    # branch. Every other parameter read in this script aborts the deploy when
    # the call fails; this one used to swallow the failure and continue, so a
    # transient throttle or a credentials hiccup left a stale secret on the host
    # while the adapter went live, and the deploy still reported success. Both
    # parameters are declared in this environment's Terraform, so a read that
    # fails here means the call failed, not that there is nothing to read.
    if ! value=$(
      AWS_PROFILE="$AWS_PROFILE_VAL" aws ssm get-parameter \
        --region "$AWS_REGION_VAL" \
        --name "$param" \
        --with-decryption \
        --query 'Parameter.Value' \
        --output text 2>/dev/null
    ); then
      echo "ERROR: could not read $param from Parameter Store." >&2
      echo "       Refusing to continue: the host would keep whatever ${env_key} it already has" >&2
      echo "       while the rest of the deploy proceeds, which is how a stale signing secret" >&2
      echo "       survives into an armed host. Fix the credentials or the parameter, then redeploy." >&2
      exit 1
    fi
    if [[ "$value" == TODO-* ]]; then value=""; fi
    if [[ -z "$value" ]]; then
      echo "    ${param} still the placeholder; leaving any existing ${env_key} in place."
      return 0
    fi
    if [[ "$value" != whsec_* ]]; then
      echo "ERROR: SSM $param does not look like a Stripe webhook signing secret (whsec_...)." >&2
      exit 1
    fi
    if [[ "$value" == whsec_stub* ]]; then
      echo "ERROR: SSM $param carries a stub-prefixed secret; production must hold a real Stripe endpoint secret." >&2
      exit 1
    fi
    env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
    chmod 600 "$env_tmp"
    chown root:root "$env_tmp"
    grep -v "^${env_key}=" "$ENV_PATH" > "$env_tmp" || true
    printf '%s=%s\n' "$env_key" "$value" >> "$env_tmp"
    mv "$env_tmp" "$ENV_PATH"
    chmod 600 "$ENV_PATH"
    chown root:root "$ENV_PATH"
  }
  sync_stripe_webhook_secret STRIPE_WEBHOOK_SECRET stripe_webhook_secret
  sync_stripe_webhook_secret STRIPE_WEBHOOK_SECRET_PREVIOUS stripe_webhook_secret_previous
fi

# Sync ARCHIVE_URL the same way, from the parameter Terraform writes when the
# archive stack is enabled. Terraform is the only party that knows the served
# hostname, and the address stays out of every committed file, so this is the
# one route that keeps the declared value and the running value the same
# without an operator editing the host env by hand. A MISSING parameter is
# normal rather than an error: an environment with no archive stack simply has
# no archive, and the variable is then cleared so the application hides its
# Legacy Archive card instead of rendering a dead link.
ssm_archive_url_param="/footbag/${FOOTBAG_ENV_VAL}/app/archive_url"
echo "    Syncing ARCHIVE_URL from $ssm_archive_url_param ..."
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
echo "    Syncing ARCHIVE_LOGIN_REDIRECT from $ssm_archive_redirect_param ..."
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

# Validate the incoming committed host config while the stack is still up and
# the database is still the old one. The apply pass runs after promotion, well
# past the point of no return: a rejected value there would exit with the service
# stopped, the database already replaced and no restart attempted. Reading from
# the release tree rather than the live one, because promotion has not happened.
seed_committed_host_config validate "$RELEASE_DIR"

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

# The release tree is root-owned so the running account cannot rewrite its own
# code, but the recursive chown above also sweeps the runtime directories, and
# those have to belong to the account inside the container: the containers run
# as a non-root user, and SQLite creates its write-ahead log and shared-memory
# sidecars beside the database file, so both the file and its directory must be
# writable by that account or the first open fails outright. The media
# directory is the local storage adapter's backing and has the same
# requirement. Ownership is restored after the sweep rather than set on the
# install above, because the sweep would otherwise undo it.
for _runtime_dir in "$(dirname "$DB_PATH")" "${FOOTBAG_MEDIA_DIR:-/srv/footbag/media}"; do
  if [[ -d "$_runtime_dir" ]]; then
    chown -R "$APP_UID":"$APP_UID" "$_runtime_dir"
  fi
done

# The AWS credential files stay owned by root and become readable by a dedicated
# group the containers join, rather than being handed to the service account
# outright: a compromised container could otherwise rewrite the credentials it
# authenticates with. Without this the containers cannot read them, and the SDK
# quietly falls back to instance metadata and runs as the platform's own
# instance role, which is a different identity with different permissions and
# fails much later and less clearly than a missing file would.
if ! getent group "$AWSCREDS_GROUP" >/dev/null 2>&1; then
  echo "    Creating group $AWSCREDS_GROUP (gid $AWSCREDS_GID)"
  groupadd --gid "$AWSCREDS_GID" "$AWSCREDS_GROUP"
fi
# A pre-existing group under this name with a different id would leave the
# container's supplementary group pointing at the wrong thing, and the failure
# would look like unreadable credentials rather than a numbering mismatch.
_actual_gid="$(getent group "$AWSCREDS_GROUP" | cut -d: -f3)"
if [[ "$_actual_gid" != "$AWSCREDS_GID" ]]; then
  echo "ERROR: group $AWSCREDS_GROUP has gid $_actual_gid, expected $AWSCREDS_GID." >&2
  echo "       The compose files add the containers to gid $AWSCREDS_GID; reconcile before deploying." >&2
  exit 1
fi

if [[ -d /root/.aws ]]; then
  chgrp "$AWSCREDS_GROUP" /root/.aws
  chmod 0750 /root/.aws
  for _f in /root/.aws/credentials /root/.aws/config; do
    if [[ -f "$_f" ]]; then
      chown root:"$AWSCREDS_GROUP" "$_f"
      chmod 0640 "$_f"
    fi
  done
fi

# Apply the committed per-environment host config now that the release tree
# (and docker/env/<env>.env) is in place, before the service restart.
seed_committed_host_config

# Host survivability, duplicated from the code-only half rather than shared: the
# two remote bodies arrive on the target shell's stdin and cannot source a
# library, which is why every block they have in common is duplicated and pinned
# by a parity test instead. These lived only in the code half, so a host whose
# first deploy was a rebuild had no disk swap and no zram suppression, and the
# committed staging sizing explicitly relies on the swapfile as its residual.
#
# Real disk swap on the host. The instances ship with zram swap only, which
# compresses pages in RAM and is close to useless for the incompressible bytes
# video work moves, so without a disk-backed file a memory spike starves the
# host to death (unreachable SSH, hypervisor reboot) instead of degrading.
# Ordered before the service restart so the containers budgeted by the sizing
# seed just applied never run without the valve. Idempotent: an active
# /swapfile is left alone (resizing means swapoff and rm first, deliberately
# manual); the fstab line and sysctl drop-in are written only when absent.
# Swappiness 10: the file is a survival valve, not a performance tier; zram
# keeps its higher priority and still takes compressible pages first.
ensure_swapfile() {
  local size size_mb
  case "$FOOTBAG_ENV" in
    production) size="2G"; size_mb=2048 ;;
    *)          size="1G"; size_mb=1024 ;;
  esac
  if swapon --show=NAME --noheadings | grep -qx /swapfile; then
    echo "==> Swapfile already active"
  else
    echo "==> Provisioning ${size} disk swapfile..."
    fallocate -l "$size" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$size_mb"
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
  fi
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-footbag-swap.conf
  sysctl -q -p /etc/sysctl.d/99-footbag-swap.conf
}
ensure_swapfile

# The instances ship with a compressed in-RAM swap device, and the vendor
# generator gives it priority 100 against the disk swapfile's -2. Every page
# therefore goes to the compressed device first and the disk valve provisioned
# above never sees one. On a small host that is the wrong shape twice over: the
# compressed store occupies RAM in proportion to what it holds, so under
# pressure it grows into the memory it is meant to be relieving, and the bytes
# video work moves do not compress, so what it holds is close to what it costs.
# Production has room to spare and never reaches that point, so this is scoped
# to everything else, leaving production on the vendor default.
#
# Disabling is what the vendor generator itself documents: an empty override
# file suppresses the device. Deliberately NOT swapoff, which is why this only
# takes effect at the next boot: the device holds live anonymous pages, and
# paging them back into a host with less free memory than they occupy is the
# exact starvation this exists to prevent.
ensure_zram_disabled() {
  if [[ "$FOOTBAG_ENV" == "production" ]]; then
    return 0
  fi
  if [[ -f /etc/systemd/zram-generator.conf && ! -s /etc/systemd/zram-generator.conf ]]; then
    echo "==> Compressed in-RAM swap already suppressed for the next boot"
    return 0
  fi
  echo "==> Suppressing the compressed in-RAM swap device (takes effect at next boot)..."
  : > /etc/systemd/zram-generator.conf
  chmod 644 /etc/systemd/zram-generator.conf
}
ensure_zram_disabled

# Assert the end state now that both writers have run: the committed host config
# supplies the JWT signer, and the Terraform-published parameter supplies its key
# identifier. Neither is hand-owned any more, and the application refuses to boot
# without either, so failing here names the cause instead of leaving the stack
# crash-looping on the host.
for jwt_var in JWT_SIGNER JWT_KMS_KEY_ID; do
  if ! grep -q "^${jwt_var}=" "$ENV_PATH"; then
    echo "ERROR: ${jwt_var} is absent from $ENV_PATH after every writer has run." >&2
    echo "       The committed docker/env/<env>.env supplies JWT_SIGNER and the" >&2
    echo "       app/jwt_kms_key_id parameter supplies JWT_KMS_KEY_ID; if one is" >&2
    echo "       missing, that write did not happen." >&2
    exit 1
  fi
done
unset jwt_var

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
# The backup unit and its timer ship in the same release tree and carry their
# own sandboxing, so they are reinstalled here too. Copying only the main unit
# left a changed backup unit sitting unapplied on the host until someone
# remembered to copy it by hand.
if [[ -f "$LIVE_DIR/ops/systemd/footbag-backup.service" ]]; then
  cp "$LIVE_DIR/ops/systemd/footbag-backup.service" /etc/systemd/system/
fi
if [[ -f "$LIVE_DIR/ops/systemd/footbag-backup.timer" ]]; then
  cp "$LIVE_DIR/ops/systemd/footbag-backup.timer" /etc/systemd/system/
fi
systemctl daemon-reload
# Enable for boot, not merely start. This half used to install and start the
# unit without enabling it, so a host whose first deploy was a rebuild ran
# correctly until its first reboot and then came back with nothing running.
# Leaving it disabled asserts the incoherent "run now, but not after a reboot".
systemctl is-enabled --quiet footbag || systemctl enable footbag
# Only restart the timer if it was already enabled: installing the backup timer
# for the first time is a deliberate operator step with its own procedure
# (scripts/install-backup-timer.sh), not something a deploy should switch on.
if systemctl is-enabled --quiet footbag-backup.timer 2>/dev/null; then
  systemctl restart footbag-backup.timer
fi

# No host-side image build: the workstation builds + ships images via
# docker save | docker load before this remote-half runs.

# Container log shipping (awslogs). The prod compose overlay routes nginx/web/
# worker stdout into the CloudWatch groups the metric filters read; the awslogs
# driver authenticates with the Docker daemon's own credential chain, so dockerd
# is pointed at a least-privilege logs profile that assumes the Terraform-owned
# logs-publisher role. Installed before the compose restart so container
# (re)creation can attach the driver; broken IAM fails loud here rather than
# letting container creation crash-loop the stack. The deploy owns the host
# profile stanza itself (idempotent append; operators never hand-edit
# /root/.aws/config). Neither the profile name, the role ARN, nor the region
# is a secret, so plain assignment is fine.
LOGS_PROFILE="footbag-${FOOTBAG_ENV_VAL}-logs"
LOGS_SOURCE_PROFILE="footbag-${FOOTBAG_ENV_VAL}-source-profile"
if ! grep -qs "^\[profile ${LOGS_PROFILE}\]" /root/.aws/config; then
  LOGS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$LOGS_SOURCE_PROFILE" --query Account --output text 2>/dev/null) || {
    echo "    ERROR: source profile '$LOGS_SOURCE_PROFILE' cannot resolve the account id;" >&2
    echo "           the host AWS bootstrap is incomplete (it installs that profile)." >&2
    exit 1
  }
  install -d -m 0700 -o root -g root /root/.aws
  {
    printf '\n[profile %s]\n' "$LOGS_PROFILE"
    printf 'role_arn = arn:aws:iam::%s:role/footbag-%s-logs-publisher\n' "$LOGS_ACCOUNT_ID" "$FOOTBAG_ENV_VAL"
    printf 'source_profile = %s\n' "$LOGS_SOURCE_PROFILE"
    printf 'region = %s\n' "$AWS_REGION_VAL"
  } >> /root/.aws/config
  echo "    Installed [profile $LOGS_PROFILE] stanza into /root/.aws/config."
fi
if ! aws sts get-caller-identity --profile "$LOGS_PROFILE" >/dev/null 2>&1; then
  echo "    ERROR: AWS profile '$LOGS_PROFILE' cannot assume the logs-publisher role." >&2
  echo "           This script installs the profile stanza itself, so the remaining cause is IAM state:" >&2
  echo "           run terraform apply for this environment (it creates the footbag-${FOOTBAG_ENV_VAL}-logs-publisher" >&2
  echo "           role and the CloudWatch log groups), then re-run this deploy. If the role already" >&2
  echo "           exists, review the [profile $LOGS_PROFILE] stanza in /root/.aws/config for drift." >&2
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

# A restart returns as soon as compose has spawned the containers, so a
# container that exits immediately on a startup fault still leaves the unit
# looking active. Checking only that leaves the deploy reporting success for a
# stack that serves nothing, and the failure then surfaces as gateway timeouts
# to visitors instead of as a failed deploy. Poll until the application itself
# answers ready.
#
# The probe runs inside the web container rather than against the origin from
# the host: nginx refuses any request that does not carry the shared
# origin-verify header, and sending it from the host would put that secret into
# a command line every account on the box can read. Asking the application
# directly answers the question the poll is actually asking.
#
# Every `compose exec` here reads from /dev/null, and that redirect is
# load-bearing rather than tidiness. This whole script arrives on the remote
# shell's stdin, and `docker compose exec -T` forwards its own stdin into the
# container: without the redirect the first probe swallows the remainder of the
# script, bash reaches end of input, and the deploy exits 0 having silently
# skipped everything below this point. It failed exactly that way, dropping the
# persona seed and the provenance record while reporting success.
_stack_healthy=0
for _i in 1 2 3 4 5 6 7 8 9 10; do
  if systemctl is-active --quiet footbag.service \
     && compose_cmd exec -T web wget -qO- --timeout=3 http://localhost:3000/health/ready >/dev/null 2>&1 </dev/null; then
    _stack_healthy=1
    break
  fi
  sleep 2
done
if (( _stack_healthy == 0 )); then
  echo "    ERROR: stack did not reach a ready state within ~20s after restart. Dumping diagnostics..." >&2
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
  if ! compose_cmd exec -T web node dist/testkit/personaSeedRunner.js </dev/null; then
    echo "    ERROR: persona-catalog seed step exited non-zero; aborting the deploy." >&2
    exit 1
  fi
fi

# Record what this deploy actually shipped. Mirrors the code-only remote half:
# the rsync carries the operator's working tree, so the commit on its own can
# understate it and the dirty paths are recorded alongside it. Written last, so
# the file describes a deploy that completed rather than one that started. Not a
# secret: mode 0644, so reading the host to answer "what is running" does not
# need root. This path replaces the database, so it is the deploy after which
# that question is hardest to answer any other way.
if [[ -n "${DEPLOY_PROVENANCE:-}" ]]; then
  provenance_tmp=$(mktemp /srv/footbag/.deployed-from.tmp.XXXXXX)
  printf 'deployed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$provenance_tmp"
  printf '%s\n' "$DEPLOY_PROVENANCE" >> "$provenance_tmp"
  chmod 644 "$provenance_tmp"
  chown root:root "$provenance_tmp"
  mv "$provenance_tmp" /srv/footbag/deployed-from
  echo "==> Recorded deploy provenance in /srv/footbag/deployed-from"
fi
