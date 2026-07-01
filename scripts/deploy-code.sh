#!/usr/bin/env bash
# deploy-code.sh
#
# Deploys the current working tree to the staging Lightsail host.
# Code and images only; the live database is never touched.
#
# Prerequisites:
#   - ~/.ssh/config alias "footbag-staging" configured with User footbag (§6.2)
#   - npm test passing locally before running this script
#   - Initial AWS bootstrap (Path D) complete
#
# Reads sudo password from stdin (line 1). Run via:
#   bash deploy_to_aws.sh -k
# or invoke directly with stdin redirected:
#   < <operator credential file> bash scripts/deploy-code.sh
#
# Override the SSH config alias:
#   DEPLOY_TARGET=footbag-staging ...
#
# Skip the post-deploy direct-IP smoke check (required when nginx X-Origin-Verify
# enforcement is active, since direct-to-origin curls return 444):
#   SKIP_SMOKE=yes ...
#
# Always preserves:
#   /srv/footbag/env
#   /srv/footbag/footbag.db (and any DB at FOOTBAG_DB_PATH)

set -euo pipefail

# ── Args / help ───────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: bash deploy_to_aws.sh -k
   or: < <operator credential file> bash scripts/deploy-code.sh

Reads sudo password from stdin (line 1).

Override the SSH target:
  DEPLOY_TARGET=footbag-staging ...

Skip post-deploy direct-IP smoke check:
  SKIP_SMOKE=yes ...
EOF
}

if [[ -t 0 ]]; then
  echo "ERROR: must receive sudo password on stdin." >&2
  echo "       Run via: bash deploy_to_aws.sh -k" >&2
  echo "" >&2
  usage >&2
  exit 1
fi

# Consume the password from stdin into a shell variable. This deploy needs to
# feed the password to two separate ssh+sudo invocations (image-load and
# remote-half-execute), which can't share a single stdin pipe. The variable
# is emitted to each ssh via `printf` (a bash builtin: no fork, no argv leak).
# The password is never placed on any process's argv. Same-uid memory access
# (ptrace, gcore) remains a pre-existing risk independent of this convention.
IFS= read -r SUDO_PASS

REMOTE="${DEPLOY_TARGET:-footbag-staging}"
SKIP_SMOKE="${SKIP_SMOKE:-no}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/deploy-code-remote.sh"

# SSH connection options. accept-new pins the host key on first contact; later
# connections fail-closed if the host key changes (MITM / instance rotation
# without known_hosts cleanup). ConnectTimeout fails fast on dead targets.
# ServerAliveInterval keeps the long-running cat-pipe and docker-save streams
# alive across NAT/idle timeouts. These options apply to every ssh and rsync-
# over-ssh invocation; see scripts/deploy-rebuild.sh for the parallel set.
SSH_OPTS=(-o "StrictHostKeyChecking=accept-new" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

# Derive FOOTBAG_ENV from the SSH alias so the remote-half can read the right
# /footbag/{env}/secrets/origin_verify_secret SSM parameter without the
# operator having to hand-edit /srv/footbag/env. Exact match against the
# canonical alias names; substring patterns (e.g. *prod*) silently accept
# aliases like footbag-prod or footbag-prd that are NOT the canonical names.
# The deploy_to_aws.sh wrapper allowlists DEPLOY_TARGET to the same two
# values. The remote-half writes this value into /srv/footbag/env if absent
# and fails fast if a different value is already present (catches a wrong
# DEPLOY_TARGET pointed at the wrong host).
case "$REMOTE" in
  footbag-production) FOOTBAG_ENV="production" ;;
  footbag-staging)    FOOTBAG_ENV="staging"    ;;
  *)
    echo "ERROR: cannot derive FOOTBAG_ENV from REMOTE='$REMOTE'." >&2
    echo "       Expected exactly 'footbag-staging' or 'footbag-production'." >&2
    exit 1
    ;;
esac

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote-half: $REMOTE_HALF" >&2; exit 1; }
command -v docker >/dev/null || { echo "ERROR: docker required locally for image build" >&2; exit 1; }

HOST_IP=$(ssh -G "$REMOTE" | awk '/^hostname / {print $2}')

# ── Pre-flight ────────────────────────────────────────────────────────────────

echo "==> Deploy target: $REMOTE ($HOST_IP)"
echo "==> Confirming SSH connectivity..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "echo '    SSH OK'" </dev/null

# ── Step 1: Prepare upload directory ─────────────────────────────────────────

echo "==> Preparing remote upload directory..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "rm -rf ~/footbag-release && mkdir -p ~/footbag-release" </dev/null

# ── Step 2: Rsync deployable files (code only, no database) ──────────────────

echo "==> Rsyncing source to host (code only, no database)..."

rsync -av --delete -e "ssh ${SSH_OPTS[*]}" \
  --include='/.dockerignore' \
  --include='/docker/***' \
  --include='/src/***' \
  --include='/ifpa/***' \
  --include='/ops/***' \
  --include='/package.json' \
  --include='/package-lock.json' \
  --include='/tsconfig.json' \
  --exclude='*' \
  ./ "$REMOTE:~/footbag-release/" </dev/null

# ── Step 3: Build images locally (workstation, where memory is plentiful) ────
# The host (Lightsail nano_3_0, 512 MB) cannot fit a parallel npm ci build;
# any boot-time or deploy-time `compose build` on the host OOMs and wedges
# sshd. The workstation has more RAM than any reasonable Lightsail bundle,
# so building here is safer and faster.

echo "==> Building Docker images locally (workstation)..."
# Build with the base compose only. The prod overlay is runtime-only (mounts,
# memory limits, env that lives in /srv/footbag/env on the host) and would
# fail interpolation here on the workstation. Image content is identical.
#
# Dev/staging images bake `dist/testkit/` and `dist/dev-bootstrap/` (the persona
# harness and the register-allowlist bootstrap); production images set the
# Dockerfile ARG INCLUDE_DEV_SHORTCUTS=0 (overriding the base compose default of
# 1) so those dev/staging-only subtrees are absent from the production container.
# Mirrors the same gate in
# deploy-rebuild.sh.
if [[ "$FOOTBAG_ENV" == "production" ]]; then
  export INCLUDE_DEV_SHORTCUTS=0
fi
# INTERNAL_EVENT_SECRET is a runtime-only value (worker<->web/image auth) that
# the base compose hard-requires via ${VAR:?}. `docker compose build`
# interpolates the whole file before building, so an unset value aborts the
# build even though the secret is never baked into the image. Pass a throwaway
# value scoped to this build only; the real secret lives in /srv/footbag/env on
# the host and is injected at container start.
( cd "$REPO_ROOT" && INTERNAL_EVENT_SECRET=build-time-placeholder-unused docker compose \
    -f docker/docker-compose.yml \
    build )

# Capture layer DiffIDs (RootFS.Layers) for end-to-end integrity verification:
# the remote-half inspects the loaded images and exits non-zero if either layer
# list does not match. Defends against a corrupted docker save | ssh |
# docker load pipe (network truncation, host docker daemon mid-deploy, or
# workstation registry tampering between build and save). DiffIDs are sha256
# of the uncompressed layer tars and survive save/load regardless of daemon
# version skew between workstation and host. .Id is fragile because each
# daemon may re-serialize the image config JSON, producing a benign hash
# difference on identical content.
WEB_IMAGE_LAYERS=$(docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-web 2>/dev/null) || {
  echo "ERROR: docker image inspect failed for docker-web (build did not produce expected image)" >&2
  exit 1
}
WORKER_IMAGE_LAYERS=$(docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-worker 2>/dev/null) || {
  echo "ERROR: docker image inspect failed for docker-worker" >&2
  exit 1
}
IMAGE_IMAGE_LAYERS=$(docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-image 2>/dev/null) || {
  echo "ERROR: docker image inspect failed for docker-image" >&2
  exit 1
}

# ── Step 4: Transfer images to host via docker save | docker load ────────────
# Pre-transfer optimization: if the host already has images with identical
# RootFS DiffIDs, skip the docker save | docker load pipe entirely. The
# pipe transfers ~250 MB even when no layers actually changed; on warm
# cache the upstream `docker compose build` is already cheap, so this skip
# is the dominant savings on routine code-change deploys. Cost when skipped:
# zero. Cost when not skipped: identical to before. Operator's footbag user
# is in the host's docker group, so no sudo needed for `docker image inspect`.
echo "==> Comparing local image RootFS DiffIDs against host..."
REMOTE_WEB_LAYERS=$(ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-web 2>/dev/null" \
  </dev/null || true)
REMOTE_WORKER_LAYERS=$(ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-worker 2>/dev/null" \
  </dev/null || true)
REMOTE_IMAGE_LAYERS=$(ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "docker image inspect --format='{{range .RootFS.Layers}}{{.}} {{end}}' docker-image 2>/dev/null" \
  </dev/null || true)
if [[ -n "$WEB_IMAGE_LAYERS" && -n "$WORKER_IMAGE_LAYERS" && -n "$IMAGE_IMAGE_LAYERS" \
   && "$WEB_IMAGE_LAYERS"    == "$REMOTE_WEB_LAYERS" \
   && "$WORKER_IMAGE_LAYERS" == "$REMOTE_WORKER_LAYERS" \
   && "$IMAGE_IMAGE_LAYERS"  == "$REMOTE_IMAGE_LAYERS" ]]; then
  echo "==> Image RootFS DiffIDs match host; skipping docker save | docker load."
else
  echo "==> Transferring images to host (docker save | docker load)..."
  # Reclaim host disk before the load. Each deploy loads a fresh :latest and
  # leaves the previous image dangling; left unchecked these orphans and build
  # cache fill the disk until `docker load` fails with "no space left on device".
  # This runs, automatically, the same reclaim the failure hint used to ask the
  # operator to perform by hand. The running stack's images are referenced and
  # are kept. Best-effort: a reclaim failure must not abort the deploy.
  echo "==> Reclaiming host disk (journal vacuum + docker prune)..."
  printf '%s\n' "$SUDO_PASS" \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -S -p "" sh -c "journalctl --vacuum-time=7d; docker system prune -af"' \
    || echo "    WARNING: host disk-reclaim step failed; continuing." >&2
  { printf '%s\n' "$SUDO_PASS"; docker save docker-web docker-worker docker-image; } \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -S -p "" docker load'
fi

# ── Step 5: Run the remote-as-root deploy via cat-pipe ───────────────────────
# printf emits the password line; the EXPECTED_*_IMAGE_LAYERS assignments give
# the remote-half the layer DiffIDs to verify against the docker-loaded images;
# cat appends the remote-half script body. ssh stdin = password + assignments +
# body. sudo -S consumes the password; bash inherits the rest and runs as
# root. Argv on every hop stays free of secrets. Layer DiffIDs are
# space-separated sha256:[0-9a-f]{64} tokens and contain no shell metacharacters.

# Parse .local/initial-admins.txt into the FOOTBAG_DEV_INITIAL_ADMIN_EMAILS CSV
# env var for the permanent dev/staging register-allowlist bootstrap; the remote
# half refuses to write it on production. Same parsing rules as
# src/dev-bootstrap/runtime.ts: strip '#' comments, trim, lowercase, skip blank
# lines. Empty/missing file produces an empty value, which clears the env var on
# staging so a stale list cannot persist after the operator empties the file.
INITIAL_ADMIN_EMAILS_CSV=""
LOCAL_ADMIN_FILE="$REPO_ROOT/.local/initial-admins.txt"
if [[ -f "$LOCAL_ADMIN_FILE" ]]; then
  INITIAL_ADMIN_EMAILS_CSV=$(awk '
    {
      sub(/#.*$/, "")
      gsub(/^[ \t]+|[ \t]+$/, "")
      if (length($0) > 0) print tolower($0)
    }
  ' "$LOCAL_ADMIN_FILE" | paste -sd, -)
fi

echo "==> Running remote-as-root deploy (promote, restart)..."
{
  printf '%s\n' "$SUDO_PASS"
  printf 'EXPECTED_WEB_IMAGE_LAYERS=%q\n'    "$WEB_IMAGE_LAYERS"
  printf 'EXPECTED_WORKER_IMAGE_LAYERS=%q\n' "$WORKER_IMAGE_LAYERS"
  printf 'EXPECTED_IMAGE_IMAGE_LAYERS=%q\n'  "$IMAGE_IMAGE_LAYERS"
  printf 'FOOTBAG_ENV=%q\n'                  "$FOOTBAG_ENV"
  printf 'DEPLOY_TARGET=%q\n'                "$REMOTE"
  printf 'FOOTBAG_DEV_INITIAL_ADMIN_EMAILS=%q\n' "$INITIAL_ADMIN_EMAILS_CSV"
  printf 'SEED_TEST_PERSONAS=%q\n'          "${SEED_TEST_PERSONAS:-no}"
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -S -p "" bash'

# ── Step 5: Smoke check ───────────────────────────────────────────────────────
# Smoke runs against the public CloudFront URL by default, not the direct
# Lightsail origin. The origin is fenced by X-Origin-Verify (returns 444 to
# anything not coming through CloudFront), so direct-IP smoke would always
# fail under the current production-like wiring. Operators can override
# SMOKE_BASE_URL for special cases (testing a different distribution, etc.).
case "$FOOTBAG_ENV" in
  staging)    SMOKE_DEFAULT_URL="https://doye1nvv64qep.cloudfront.net" ;;
  production) SMOKE_DEFAULT_URL="" ;;  # set when production CloudFront lands
  *)          SMOKE_DEFAULT_URL="" ;;
esac
SMOKE_BASE_URL="${SMOKE_BASE_URL:-$SMOKE_DEFAULT_URL}"

if [[ "$SKIP_SMOKE" == "yes" ]]; then
  echo "==> Skipping post-deploy smoke check (SKIP_SMOKE=yes)"
elif [[ -z "$SMOKE_BASE_URL" ]]; then
  echo "==> Skipping post-deploy smoke check (no SMOKE_BASE_URL configured for FOOTBAG_ENV=$FOOTBAG_ENV)"
else
  echo "==> Running smoke check against $SMOKE_BASE_URL ..."
  if ! BASE_URL="$SMOKE_BASE_URL" bash scripts/smoke-local.sh; then
    echo "ERROR: post-deploy smoke check failed against $SMOKE_BASE_URL" >&2
    echo "Recommendation: ssh $REMOTE 'sudo journalctl -u footbag -n 200 --no-pager' to inspect host logs." >&2
    exit 1
  fi
fi

echo ""
echo "Deploy complete. Origin: http://$HOST_IP"
