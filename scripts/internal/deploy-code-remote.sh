#!/usr/bin/env bash
# Root-side body of scripts/deploy-code.sh.
#
# Invoked via:
#   cat - scripts/internal/deploy-code-remote.sh | ssh REMOTE 'sudo -k -S -p "" bash'
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
  # VIDEO_TRANSCODE_TIMEOUT_MS rides along with FFMPEG_TIMEOUT_SECONDS
  # deliberately: application boot refuses an encoder ceiling at or above the
  # caller deadline, so a committed file able to set one but not the other
  # could produce a config no container will boot with.
  local key_re='^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT$|^IMAGE_MAX_CONCURRENT$|^VIDEO_X264_(PRESET|THREADS|RC_LOOKAHEAD)$|^VIDEO_MAX_HEIGHT$|^FFMPEG_TIMEOUT_SECONDS$|^VIDEO_TRANSCODE_TIMEOUT_MS$|^VIDEO_MIN_HOST_AVAILABLE_MB$'
  local line_re='^(NGINX|WEB|WORKER|IMAGE)_MEMORY_LIMIT=|^IMAGE_MAX_CONCURRENT=|^VIDEO_X264_(PRESET|THREADS|RC_LOOKAHEAD)=|^VIDEO_MAX_HEIGHT=|^FFMPEG_TIMEOUT_SECONDS=|^VIDEO_TRANSCODE_TIMEOUT_MS=|^VIDEO_MIN_HOST_AVAILABLE_MB='
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
      IMAGE_MAX_CONCURRENT|VIDEO_X264_THREADS|VIDEO_X264_RC_LOOKAHEAD|VIDEO_MAX_HEIGHT|FFMPEG_TIMEOUT_SECONDS|VIDEO_TRANSCODE_TIMEOUT_MS|VIDEO_MIN_HOST_AVAILABLE_MB)
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

  # The captcha adapter is pinned the same way and for the same kind of reason:
  # a live challenge on a non-production host is not a preference but a broken
  # environment, because a tester has no way to solve one staging is not wired
  # to serve. The compose file defaults it to the stub, so the container behaves
  # correctly with the value absent, but the host env file is what the
  # environment verifier reads and what an operator inspects, and a value that
  # is only ever a default is a value nobody can see. Production is left alone:
  # there the live captcha is activation work with its own step.
  echo "==> Reconciling CAPTCHA_ADAPTER=stub into $ENV_PATH (FOOTBAG_ENV=$FOOTBAG_ENV_VAL; non-production never challenges)..."
  env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)
  chmod 600 "$env_tmp"
  chown root:root "$env_tmp"
  grep -v '^CAPTCHA_ADAPTER=' "$ENV_PATH" > "$env_tmp" || true
  printf 'CAPTCHA_ADAPTER=%s\n' 'stub' >> "$env_tmp"
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

# Runtime-user migration. The containers run as an unprivileged account
# (uid 1000, the base image's own user) rather than as root, so the two places
# they write and the credential files they read all have to be reachable by
# that account. Every step is idempotent: this runs on every deploy and is a
# no-op once the host is already in the target shape.
#
# The credential files stay owned by root and stay off-limits to the host at
# large. A dedicated group is the narrow opening: only that group can read
# them, only the containers are in it, and no operator account gains access by
# being an operator. Group-read is the standard arrangement when a root-managed
# file must be read by an unprivileged service, and the alternative of giving
# the files to the service account outright would let a compromised container
# rewrite the credentials it authenticates with.
echo "==> Applying runtime-user ownership (containers run unprivileged)..."
readonly APP_UID=1000
readonly AWSCREDS_GROUP=awscreds
readonly AWSCREDS_GID=1500

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

# The database directory holds the SQLite file plus its write-ahead log and
# shared-memory sidecars; all three must belong to the running account or the
# first write fails. The media directory is the local storage-adapter backing.
for _d in "${FOOTBAG_DB_DIR:-/srv/footbag/db}" "${FOOTBAG_MEDIA_DIR:-/srv/footbag/media}"; do
  if [[ -d "$_d" ]]; then
    chown -R "$APP_UID":"$APP_UID" "$_d"
  fi
done

# Apply the committed per-environment container sizing now that the release
# tree (and docker/env/<env>.env) is in place, before the service restart.
seed_container_sizing

# Real disk swap on the host. The instances ship with zram swap only, which
# compresses pages in RAM and is close to useless for the incompressible bytes
# video work moves, so without a disk-backed file a memory spike starves the
# host to death (unreachable SSH, hypervisor reboot) instead of degrading.
# Provisioned by the deploy itself so no separate operator step exists to
# forget, and ordered before the service restart so the container budgets the
# sizing seed just applied never run without the valve. Idempotent: an active
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

# Sync LOG_LEVEL from SSM, mirroring the rebuild half: Terraform owns the
# canonical value, and every deploy - code-only included - makes the declared
# value the running value. Without this, a code-only deploy after an SSM
# change leaves the host at a stale level, and production's warn floor
# decides whether the CloudWatch metric filters see anything at all. Plain
# String parameter (no --with-decryption); a missing parameter is a hard
# error: the environment needs its terraform apply first.
ssm_log_level_param="/footbag/${FOOTBAG_ENV_VAL}/app/log_level"
echo "==> Syncing LOG_LEVEL from $ssm_log_level_param ..."
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
  echo "==> Syncing SES_CONFIGURATION_SET_${ses_set_stream^^} from $ses_set_param ..."
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
  # SES configuration-set names are limited to letters, digits, dashes and
  # underscores. Checking the shape here keeps a malformed or placeholder value
  # from reaching a send, where it would fail every message rather than one.
  if [[ ! "$ses_set_value" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "ERROR: SSM $ses_set_param is '$ses_set_value'; expected a configuration-set name." >&2
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
  # Same shape as the SESSION_SECRET checks above, and for the same reason: fail
  # the deploy loud rather than crash-looping the stack on restart. The live
  # mail adapter requires SES_FROM_IDENTITY at boot and the production compose
  # file interpolates it with no default, so arming without it takes production
  # down. Nothing upstream can catch this: a code-only deploy neither writes the
  # value nor checks it, and the host env verifier's mail checks self-neutralise
  # while the host is still dark, so it cannot warn beforehand. This is the last
  # point before the restart at which the value is knowable.
  if [[ "$SES_ADAPTER_DERIVED" == "live" ]] && ! grep -qE '^SES_FROM_IDENTITY=.+' "$ENV_PATH"; then
    echo "ERROR: email is armed but $ENV_PATH carries no SES_FROM_IDENTITY." >&2
    echo "       The live mail adapter requires it at boot and compose supplies no" >&2
    echo "       default, so restarting now would crash-loop production." >&2
    echo "       No script writes it: set-host-env.sh owns the proxy hop count, the" >&2
    echo "       backup bucket and the feed topic and queue values, not this one." >&2
    echo "       Add SES_FROM_IDENTITY to $ENV_PATH, matching the environment's" >&2
    echo "       terraform output ses_sender_identity, then re-run this deploy." >&2
    exit 1
  fi
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

  # Sync the Stripe webhook signing secrets from Parameter Store. Mirrors
  # deploy-rebuild-remote.sh: a real value in the parameter is authoritative
  # and overwrites the host line on every deploy, so the secret is never
  # hand-pasted onto a host; while the parameter still holds its bootstrap
  # placeholder the sync leaves any existing host value
  # untouched, so a value installed by the payments activation or rotation
  # script survives deploys until the parameter carries the real secret.
  # The _previous twin carries the outgoing secret during a Stripe secret roll.
  sync_stripe_webhook_secret() {
    local env_key="$1" param_suffix="$2"
    local param="/footbag/${FOOTBAG_ENV_VAL}/secrets/${param_suffix}"
    local value
    echo "==> Syncing ${env_key} from ${param} ..."
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

echo "==> Reinstalling systemd service units..."
cp "$LIVE_DIR/ops/systemd/footbag.service" /etc/systemd/system/
# The backup unit and its timer ship in the same release tree and carry their
# own sandboxing, so they are reinstalled here too. Previously only the main
# unit was refreshed, which left a changed backup unit sitting unapplied on the
# host until someone remembered to copy it by hand.
if [[ -f "$LIVE_DIR/ops/systemd/footbag-backup.service" ]]; then
  cp "$LIVE_DIR/ops/systemd/footbag-backup.service" /etc/systemd/system/
fi
if [[ -f "$LIVE_DIR/ops/systemd/footbag-backup.timer" ]]; then
  cp "$LIVE_DIR/ops/systemd/footbag-backup.timer" /etc/systemd/system/
fi
systemctl daemon-reload
# The deploy restarts this unit below, thereby asserting it must be running;
# leaving it disabled would assert the incoherent "run now, but not after a
# reboot", which is exactly how a host reboot once left the stack down until
# an operator noticed. Enabling is idempotent. The backup timer below stays
# operator-enabled: its first install is a deliberate procedure with its own
# prerequisites, which this main unit does not have.
systemctl is-enabled --quiet footbag || systemctl enable footbag
# Only restart the timer if it was already enabled: installing the backup timer
# for the first time is a deliberate operator step with its own procedure, not
# something a code deploy should switch on.
if systemctl is-enabled --quiet footbag-backup.timer 2>/dev/null; then
  systemctl restart footbag-backup.timer
fi

# No host-side image build: the workstation builds + ships images via
# docker save | docker load before this remote-half runs. The systemd unit
# refuses to build (--no-build on ExecStart); compose up uses the already-
# loaded images and fails fast if any image is missing.

# ── Schema migration, when one was supplied ──────────────────────────────────
#
# Empty on an ordinary code deploy, which is every deploy that changes no
# schema; scripts/deploy-migrate.sh is the only caller that sets it. The work
# happens here rather than in a script of its own because the migration has
# exactly one safe window — after the new code is in place and before the
# service comes back up — and that window exists only inside this file. A
# separate script would have to stop the service, reach in, and hand control
# back, which is two more places for an interrupted deploy to leave the stack
# down.
#
# The database is backed up immediately before the migration, and restored if
# anything about the migration or the integrity check goes wrong. That backup is
# the whole safety story: a migration is the one deploy step that can destroy
# data that no rebuild can recreate.
if [[ -n "${MIGRATION_SQL:-}" ]]; then
  echo "==> Applying schema migration..."
  command -v sqlite3 >/dev/null 2>&1 || {
    echo "ERROR: sqlite3 CLI is not installed on this host (apt-get install -y sqlite3)." >&2
    echo "       Refusing to migrate; the service has not been stopped." >&2
    exit 1
  }
  # The runtime opens a fixed filename inside the host's database directory, so
  # the migration reaches the same file the application does rather than a path
  # assembled a second way.
  DB_PATH="${FOOTBAG_DB_DIR:-/srv/footbag/db}/footbag.db"
  [[ -f "$DB_PATH" ]] || {
    echo "ERROR: no database at ${DB_PATH}; nothing to migrate." >&2
    exit 1
  }

  # Everything here is a read, and the service is still up: the application
  # holds the database open, so nothing writes to it until it has been stopped
  # and copied. The ledger table itself is created later, inside the migration's
  # own transaction, where the pre-migration copy already covers it.
  #
  # A migration is named and checksummed, so the host can answer three different
  # questions before it touches anything: never applied (apply it), applied with
  # these exact bytes (skip, and let the code deploy finish), or applied with
  # different bytes (refuse, because the database no longer matches the file
  # claiming to describe it, and applying it again would be guesswork).
  if [[ -n "${MIGRATION_NAME:-}" ]]; then
    # Absent on a database that predates the ledger, which is the ordinary case
    # for the first migration ever applied to it. That is "never applied", not
    # an error, so the table is looked for rather than selected from blindly.
    has_ledger="$(sqlite3 "$DB_PATH" \
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations';" \
      || echo 'read-failed')"
    if [[ "$has_ledger" == "read-failed" ]]; then
      echo "ERROR: could not read ${DB_PATH}; refusing to migrate." >&2
      echo "       The service has not been stopped." >&2
      exit 1
    fi

    recorded_checksum=""
    if [[ -n "$has_ledger" ]]; then
      recorded_checksum="$(sqlite3 "$DB_PATH" \
        "SELECT checksum FROM schema_migrations WHERE filename = '${MIGRATION_NAME}';" \
        || echo 'read-failed')"
      if [[ "$recorded_checksum" == "read-failed" ]]; then
        echo "ERROR: could not read the applied-migration ledger; refusing to migrate." >&2
        echo "       The service has not been stopped." >&2
        exit 1
      fi
    fi

    if [[ -n "$recorded_checksum" ]]; then
      if [[ "$recorded_checksum" == "${MIGRATION_CHECKSUM:-}" ]]; then
        # A banner rather than a line. Skipping is a legitimate outcome, because
        # naming the same file twice is idempotent by design, but it is also the
        # outcome that looks exactly like success while changing nothing. A
        # rehearsal run against a host that already carries the migration reads
        # as proof it works unless the deploy says otherwise loudly enough to
        # survive a long log.
        echo ""
        echo "======================================================================"
        echo "  MIGRATION SKIPPED: ${MIGRATION_NAME}"
        echo "  Host $(hostname) already applied this file, with the same contents."
        echo "  Nothing was changed. If this was a rehearsal, it did NOT execute:"
        echo "  migrate a host before rebuilding it, not after."
        echo "======================================================================"
        echo ""
        MIGRATION_SQL=""
      else
        echo "ERROR: ${MIGRATION_NAME} was already applied to this database, but the file has" >&2
        echo "       changed since (recorded ${recorded_checksum}, now ${MIGRATION_CHECKSUM:-none})." >&2
        echo "       Refusing: the database no longer matches the file that names its state." >&2
        echo "       Write a new migration for the additional change instead." >&2
        exit 1
      fi
    fi
  fi
fi

# Re-tested because the already-applied check above can clear it, in which case
# this deploy carries on as an ordinary code deploy.
if [[ -n "${MIGRATION_SQL:-}" ]]; then
  # Stopped first: the application holds the database open, and SQLite writes
  # from two directions is how a half-applied migration becomes a corrupt file.
  systemctl stop footbag

  # Folded into the main file before the copy is taken, the same idiom the
  # backup producer uses. The stop above normally checkpoints twice over, once
  # as each container takes SIGTERM and again in the unit's ExecStopPost backup,
  # but the stop ends in SIGKILL after its timeout and that backup is
  # best-effort by design. A WAL that outlives either one holds committed
  # transactions the copy would not carry, and the restore below deletes the WAL
  # on its way to putting the copy back, so those transactions would be lost by
  # the very step meant to preserve them. The copy has to stand on its own.
  sqlite3 "$DB_PATH" 'PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null || {
    echo "ERROR: could not checkpoint the write-ahead log before copying the database." >&2
    echo "       Refusing to migrate: a copy taken now could not be restored intact." >&2
    echo "       Nothing was migrated; restarting the service." >&2
    systemctl start footbag || true
    exit 1
  }

  migration_backup="${DB_PATH}.pre-migration.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "$DB_PATH" "$migration_backup"
  echo "    pre-migration copy at ${migration_backup}"

  # Restores the database only. The release and its images were promoted earlier
  # in this script, before the migration ran, and nothing here reverts them, so
  # the host comes back up running the NEW code against the OLD schema. That is
  # said out loud rather than left for the operator to work out from a healthy
  # looking stack: additive migrations under the expand-and-contract rule leave
  # that state serviceable, and anything else needs a deliberate recovery.
  restore_and_fail() {
    echo "ERROR: $1" >&2
    echo "       Restoring the pre-migration database and restarting." >&2
    rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
    cp -a "$migration_backup" "$DB_PATH"
    systemctl start footbag || true
    echo "" >&2
    echo "       STATE OF THIS HOST: the database is back as it was, but the code" >&2
    echo "       and images are the NEW release, promoted before the migration ran." >&2
    echo "       This host is now running new code against the pre-migration schema." >&2
    echo "       Recover by redeploying the previous commit with scripts/deploy-code.sh," >&2
    echo "       or by fixing the migration and running the migrating deploy again." >&2
    exit 1
  }

  # One transaction, so a statement that fails part-way leaves nothing applied
  # and the file is exactly as it was. The restore below is for the cases a
  # transaction cannot cover, which is why both exist.
  #
  # The ledger row is written inside that same transaction, so the record and
  # the change it describes cannot disagree: a migration that rolls back leaves
  # no claim to have run, and one that commits is never re-applied by a later
  # deploy that names the same file.
  #
  # The ledger table is created here rather than by a migration, because a
  # database predating it cannot use a migration to record migrations. Inside
  # the transaction, so the pre-migration copy already covers it and a failure
  # leaves no half-made table behind.
  migration_ledger_sql=""
  if [[ -n "${MIGRATION_NAME:-}" ]]; then
    migration_ledger_sql="CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        checksum   TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (filename, checksum, applied_at)
      VALUES ('${MIGRATION_NAME}', '${MIGRATION_CHECKSUM:-}', strftime('%Y-%m-%dT%H:%M:%fZ','now'));"
  fi

  if ! printf 'BEGIN;\n%s\n%s\nCOMMIT;\n' "$MIGRATION_SQL" "$migration_ledger_sql" | sqlite3 "$DB_PATH"; then
    restore_and_fail "the migration SQL failed"
  fi

  integrity="$(sqlite3 "$DB_PATH" 'PRAGMA integrity_check;' || echo 'check-failed')"
  if [[ "$integrity" != "ok" ]]; then
    restore_and_fail "the database failed its integrity check after the migration (${integrity})"
  fi

  # A foreign key the migration broke is not corruption, so the check above
  # passes and the damage surfaces later as a read returning nothing. Checked
  # here, while the previous copy is still one command away.
  fk_violations="$(sqlite3 "$DB_PATH" 'PRAGMA foreign_key_check;' | head -5 || true)"
  if [[ -n "$fk_violations" ]]; then
    restore_and_fail "the migration left foreign-key violations: ${fk_violations}"
  fi

  echo ""
  echo "======================================================================"
  echo "  MIGRATION APPLIED: ${MIGRATION_NAME:-(unnamed)}"
  echo "  Host $(hostname). Integrity check and foreign-key check both clean."
  echo "  Pre-migration copy retained at ${migration_backup}"
  echo "======================================================================"
  echo ""
fi

echo "==> Restarting service (compose up via systemctl, --no-build)..."
cd "$LIVE_DIR"
systemctl restart footbag

# Every `compose exec` below reads from /dev/null, and that redirect is
# load-bearing rather than tidiness. This whole script arrives on the remote
# shell's stdin, and `docker compose exec -T` forwards its own stdin into the
# container: without the redirect the first probe swallows the remainder of the
# script, bash reaches end of input, and the deploy exits 0 having silently
# skipped everything below this point.
#
# Active-check + healthcheck poll. `docker compose up --detach` exits 0 the
# moment containers are spawned; nginx is gated on web's healthcheck which
# has a 15s start_period. A bare `sleep 3` reports success while the stack
# may still be 502/503 to traffic for another 12+ seconds, which then causes
# the workstation-side smoke check to false-fail. Poll up to ~20s for
# systemd-active AND the app reporting ready.
#
# The probe runs inside the web container rather than against the origin from
# the host: nginx rejects any request that does not carry the shared
# origin-verify header, and a host-side probe has no way to send it that would
# not also put the secret in a command line for anyone reading the process
# list. Asking the app directly skips the perimeter and answers the question
# the poll is actually asking, which is whether the application is ready.
_stack_healthy=0
for _i in 1 2 3 4 5 6 7 8 9 10; do
  if systemctl is-active --quiet footbag.service \
     && docker compose --env-file /srv/footbag/env \
          -f docker/docker-compose.yml -f docker/docker-compose.prod.yml \
          exec -T web wget -qO- --timeout=3 http://localhost:3000/health/ready >/dev/null 2>&1 </dev/null; then
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
      web node dist/testkit/personaSeedRunner.js </dev/null; then
    echo "    ERROR: persona-catalog seed step exited non-zero; aborting the deploy." >&2
    exit 1
  fi
fi

# CUTOVER-REMOVE: post-deploy persona rebuild. Runs only when the workstation
# passed REFRESH_TEST_PERSONAS=yes (set by --refresh-test-personas, which the
# deploy_to_aws.sh wrapper allowlists to DEPLOY_TARGET=footbag-staging only).
# The seed step above can only ADD personas: it skips every slug already
# present, so a persona whose spec changed in the code just deployed keeps the
# rows it was first seeded with. This step deletes the persona-owned rows and
# rebuilds them from the deployed catalog, which is the only way an existing
# database converges on the code. Signal only: the catalog is code
# (dist/testkit/canonicalPersonas.js), so there is no payload and no stdin pipe.
# Same container entry point and the same FOOTBAG_ENV handling as the seed: the
# container reads it from /srv/footbag/env per host, and the testkit import
# guard throws when FOOTBAG_ENV='production'.
if [[ "${REFRESH_TEST_PERSONAS:-no}" == "yes" ]]; then
  echo "==> Rebuilding every persona from its deployed spec (persona-owned rows are deleted)..."
  if ! docker compose \
      --env-file "$ENV_PATH" \
      -f "$LIVE_DIR/docker/docker-compose.yml" \
      -f "$LIVE_DIR/docker/docker-compose.prod.yml" \
      exec -T \
      web node dist/testkit/personaRefreshCli.js --apply </dev/null; then
    echo "    ERROR: persona rebuild step exited non-zero; aborting the deploy." >&2
    exit 1
  fi
fi

# Record what this deploy actually shipped. The rsync carries the operator's
# working tree, so the commit on its own can understate it and the dirty paths
# are recorded alongside it. Written last, so the file describes a deploy that
# completed rather than one that started. Not a secret: mode 0644, so reading
# the host to answer "what is running" does not need root.
if [[ -n "${DEPLOY_PROVENANCE:-}" ]]; then
  provenance_tmp=$(mktemp /srv/footbag/.deployed-from.tmp.XXXXXX)
  printf 'deployed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$provenance_tmp"
  printf '%s\n' "$DEPLOY_PROVENANCE" >> "$provenance_tmp"
  chmod 644 "$provenance_tmp"
  chown root:root "$provenance_tmp"
  mv "$provenance_tmp" /srv/footbag/deployed-from
  echo "==> Recorded deploy provenance in /srv/footbag/deployed-from"
fi
