#!/usr/bin/env bash
# deploy-code.sh
#
# Deploys the current working tree to the staging Lightsail host.
# Code and images only; the live database is never touched.
#
# Prerequisites:
#   - ~/.ssh/config alias "footbag-staging" configured with User footbag.
#     Nothing below passes a login user, a key or a hostname on the command
#     line, so that alias is the only place the connection is defined.
#   - npm test passing locally before running this script
#   - The target host already provisioned and serving. This deploy promotes code
#     and images onto a host that is already standing; it creates no instance,
#     no bucket and no credential, so a first-time environment must be built
#     before this script is any use.
#
# Reads sudo password from stdin (line 1). Run via:
#   bash deploy_to_aws.sh -k
# or, for STAGING only, invoke directly with stdin redirected:
#   < ~/AWS/HOST_OPERATOR.txt bash scripts/deploy-code.sh
#
# Which file holds that password follows the account the alias connects as: the
# shared footbag account reads ~/AWS/AWS_OPERATOR.txt and your own named account
# reads ~/AWS/HOST_OPERATOR.txt. A run started without the redirect names the one
# it needs. Neither has a production counterpart on this path, because a
# production deploy takes the host password at the terminal instead.
#
# Production has no direct form, and redirecting a credential file here does not
# make one: this script refuses a production target unless a terminal is attached,
# because the confirmation is a person rather than a password. Production goes
# through deploy_to_aws.sh, which asks for the typed word and takes the host
# password at the terminal in the same gate.
#
# Override the SSH config alias:
#   DEPLOY_TARGET=footbag-staging ...
#
# Skip the post-deploy direct-IP smoke check (required when nginx X-Origin-Verify
# enforcement is active, since direct-to-origin curls return 444):
#   SKIP_SMOKE=yes ...
#
# Always preserves, by excluding each from the promotion's delete pass rather than
# by naming a path in the host env file:
#   /srv/footbag/env
#   the database directory named by FOOTBAG_DB_DIR in /srv/footbag/env, default
#     /srv/footbag/db, which is what the containers mount
#   /srv/footbag/footbag.db and its -wal and -shm sidecars, the older layout
#   /srv/footbag/media, /srv/footbag/data and /srv/footbag/.curated-build

set -euo pipefail

# ── Args / help ───────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: bash deploy_to_aws.sh -k
   or (staging only): < ~/AWS/HOST_OPERATOR.txt bash scripts/deploy-code.sh

A production deploy runs only through deploy_to_aws.sh, which asks for the typed
confirmation and takes the host password at the terminal. This script refuses a
production target when no terminal is attached.

Reads sudo password from stdin (line 1).

Override the SSH target:
  DEPLOY_TARGET=footbag-staging ...

Skip post-deploy direct-IP smoke check:
  SKIP_SMOKE=yes ...
EOF
}

# Arguments are refused rather than ignored. This script took none and parsed
# none, so `--help` ran a full deploy to whatever DEPLOY_TARGET happened to hold,
# and deploy-migrate.sh forwards unknown options here while telling the operator
# they "behave exactly as in scripts/deploy-code.sh".
if [[ $# -gt 0 ]]; then
  case "$1" in
    --help|-h) usage; exit 0 ;;
    *)
      echo "ERROR: unknown argument '$1'. This script takes none; it is configured" >&2
      echo "       through DEPLOY_TARGET and SKIP_SMOKE." >&2
      usage >&2
      exit 2
      ;;
  esac
fi

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
# Everything this script reads or runs belongs to the checkout it lives in, not to
# wherever the operator happened to be standing. Anchoring the rsync source alone
# left the other half of the same defect: the smoke checks were still resolved
# against the caller's directory, so a run from elsewhere promoted the release and
# then reported a smoke failure that was really a missing file.
cd "$REPO_ROOT"
REMOTE_HALF="${SCRIPT_DIR}/internal/deploy-code-remote.sh"

# shellcheck source=lib/terminal.sh
source "${REPO_ROOT}/scripts/lib/terminal.sh"

# A production deploy stops for a person, in every mode, including this one.
#
# What this leaf replaces is the release the public is served, so it is gated the
# same way a database replacement is, even though the database is untouched here.
# The test is a terminal rather than a word or a variable, and the distinction is
# the point: the typed word lives in deploy_to_aws.sh, which is the only sanctioned
# way in, and a leaf that accepted an acknowledgement variable instead would hand
# anyone able to export it the unattended run this refuses. No environment variable
# can satisfy a terminal, so a scheduled job, a continuous-integration runner and an
# agent session are all refused here by the same check, whatever they set.
#
# First, ahead of every other precondition, because this one decides whether the run
# is allowed to happen at all. Behind the host-key check it would report a missing
# pin file to a caller who was never entitled to run, which names the wrong problem.
#
# Staging is deliberately not gated. It is fed a credential file with nobody at the
# keyboard by design, and its data is disposable.
if [[ "$REMOTE" == "footbag-production" ]] && ! terminal_present; then
  echo "ERROR: a production deploy requires a terminal, and none is attached." >&2
  echo "       Run: bash deploy_to_aws.sh -k" >&2
  echo "       It asks for the typed confirmation and takes the host password at" >&2
  echo "       the terminal. There is no unattended form of a production deploy," >&2
  echo "       and redirecting a credential file in here does not create one:" >&2
  echo "       it supplies a password without supplying a person." >&2
  exit 1
fi

# shellcheck source=lib/image-transfer.sh
source "${REPO_ROOT}/scripts/lib/image-transfer.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${REPO_ROOT}/scripts/lib/ssh-known-hosts.sh"

# shellcheck source=lib/initial-admins.sh
source "${REPO_ROOT}/scripts/lib/initial-admins.sh"

# shellcheck source=lib/terraform-output.sh
source "${REPO_ROOT}/scripts/lib/terraform-output.sh"

# SSH connection options. The host is verified against the operator's pinned
# host-key file and an unrecognized key fails the deploy, which matters here
# because the sudo password goes out as line one of the SSH stream. See
# scripts/lib/ssh-known-hosts.sh for how the pin is sourced and rebuilt.
# ConnectTimeout fails fast on dead targets. ServerAliveInterval keeps the
# long-running cat-pipe and docker-save streams alive across NAT/idle timeouts.
# These options apply to every ssh and rsync-over-ssh invocation; see
# scripts/deploy-rebuild.sh for the parallel set.
require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

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

# The address goes to stderr, not stdout. ssh-known-hosts.sh records that the
# production origin address is deliberately not public: the host's web port is
# scoped to the CloudFront origin ranges rather than open, so publishing the
# address gives away what that scoping withholds. Deploy stdout is what a wrapper,
# a CI job or an agent session captures; the operator still sees this on a
# terminal.
echo "==> Deploy target: $REMOTE ($HOST_IP)" >&2
echo "==> Confirming SSH connectivity..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "echo '    SSH OK'" </dev/null

# ── Verify staging before a production deploy ────────────────────────────────
# A production deploy promotes what staging is already running, so the full
# smoke gate (route smoke + security probes) must pass against staging first;
# a failure aborts before anything on the production host is touched.
# SKIP_SMOKE=yes remains the operator's deliberate override.
if [[ "$FOOTBAG_ENV" == "production" && "$SKIP_SMOKE" != "yes" ]]; then
  tf_output_read "$REPO_ROOT/terraform/staging" cloudfront_domain || true
  staging_domain="$TF_OUTPUT_VALUE"
  STAGING_BASE_URL=""
  [[ -n "$staging_domain" ]] && STAGING_BASE_URL="https://$staging_domain"
  if [[ -z "$STAGING_BASE_URL" ]]; then
    echo "ERROR: a production deploy first verifies the smoke gate against staging," >&2
    echo "       and the staging address could not be read." >&2
    tf_output_explain "terraform/staging" cloudfront_domain
    echo "" >&2
    echo "       SKIP_SMOKE=yes skips the gate deliberately." >&2
    exit 1
  fi
  echo "==> Verifying staging smoke gate before production deploy ($STAGING_BASE_URL) ..."
  if ! BASE_URL="$STAGING_BASE_URL" bash "$REPO_ROOT/scripts/smoke-local.sh"; then
    echo "ERROR: staging smoke check failed; refusing to deploy production." >&2
    exit 1
  fi
  if ! BASE_URL="$STAGING_BASE_URL" SMOKE_ENV=staging bash "$REPO_ROOT/scripts/smoke-security.sh"; then
    echo "ERROR: staging security probes failed; refusing to deploy production." >&2
    exit 1
  fi
fi

# ── Step 1: Prepare upload directory ─────────────────────────────────────────
#
# The staging directory lives in the connecting account's own home, so it is a
# different path for every operator. Resolve it once here and use that one value
# for the upload, the transfer and the root-side promotion. The root half cannot
# derive it: it runs as root, so a `~` there names root's home, and a literal
# path there names whichever account the literal was written for. An operator
# deploying from a named account then uploads to their own home while root
# promotes the shared account's -- shipping whatever that account last deployed,
# and reporting success.
#
# Current: the staging tree lives in the connecting account's own home, so the
#          path varies by operator and both halves are kept in step by passing
#          the resolved value and by the release stamp below.
# Target:  one fixed staging location outside every operator's home, group-owned,
#          that every operator, script, runbook and diagnostic can name. The
#          stamp is already part of that design; the location is not built. Until
#          it is, no script may name an account's home, which a conventions check
#          enforces.
echo "==> Preparing remote upload directory..."
REMOTE_HOME="$(ssh "${SSH_OPTS[@]}" "$REMOTE" 'printf %s "$HOME"' </dev/null)"
# Absolute, not merely non-empty. This captures the remote shell's whole stdout,
# so a host whose profile prints a banner or a version-manager line for a
# non-interactive shell returns that text with the path glued to the end of it.
# Emptiness is the case that never happens there; a relative path built from a
# banner is the one that does, and it survives every check downstream because
# both halves are handed the same wrong value and therefore agree.
if [[ -z "$REMOTE_HOME" || "$REMOTE_HOME" != /* ]]; then
  echo "ERROR: could not resolve the home directory of the deploy account on $REMOTE." >&2
  echo "       Refusing rather than guessing: the upload and the promotion must" >&2
  echo "       name the same directory, and a guess that is wrong ships somebody" >&2
  echo "       else's release." >&2
  echo "       Expected an absolute path. A host that prints a banner or a version" >&2
  echo "       manager's output for a non-interactive shell returns that text too;" >&2
  echo "       silence it for non-interactive logins and re-run." >&2
  exit 1
fi
REMOTE_RELEASE_DIR="${REMOTE_HOME}/footbag-release"
echo "    staging directory: ${REMOTE_RELEASE_DIR}"
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "rm -rf '$REMOTE_RELEASE_DIR' && mkdir -p '$REMOTE_RELEASE_DIR'" </dev/null

# ── Step 2: Rsync deployable files (code only, no database) ──────────────────
#
# The source is $REPO_ROOT, not the working directory. It was `./`, so a run
# started from anywhere but the repository root matched none of the anchored
# includes below, shipped an almost-empty tree, and the remote half then promoted
# it with `rsync -a --delete` -- deleting the live install before anything
# noticed. The docker build below already anchored to $REPO_ROOT, so the two
# halves of this script disagreed about what "here" meant.
echo "==> Rsyncing source to host (code only, no database)..."

# backup-db.sh is the one script that ships, because two systemd units invoke it
# by the relative path scripts/backup-db.sh against WorkingDirectory=/srv/footbag:
# the scheduled backup timer's service, and the main unit's post-stop hook that
# takes a snapshot before a destructive stop. Without it both resolve to nothing
# and exit 127, the post-stop one silently because a leading dash ignores it.
# cutover-marker.sh is the second: it writes the host env file and the live
# database, so it runs on the host as root by design, and the cutover runbook
# now invokes it there instead of handing an operator the two writes to type.
# take-pre-cutover-snapshot.sh is the third, and it shipped with nothing until a
# production host read showed why: its remote half invokes it out of the release
# tree and errors "It ships with the deploy", which was not true of either half,
# so the cutover's own rollback-artifact step failed on every host.
# The rest of scripts/ is operator tooling that has no business on a host, so the
# directory is included only far enough for rsync to descend into it.
rsync -av --delete -e "ssh ${SSH_OPTS[*]}" \
  --include='/.dockerignore' \
  --include='/docker/***' \
  --include='/src/***' \
  --include='/ifpa/***' \
  --include='/ops/***' \
  --include='/scripts/' \
  --include='/scripts/backup-db.sh' \
  --include='/scripts/cutover-marker.sh' \
  --include='/scripts/take-pre-cutover-snapshot.sh' \
  --include='/package.json' \
  --include='/package-lock.json' \
  --include='/tsconfig.json' \
  --exclude='*' \
  "$REPO_ROOT/" "$REMOTE:$REMOTE_RELEASE_DIR/" </dev/null

# Stamp the uploaded tree with an identifier only this run knows, and send the same
# value to the root half, which refuses to promote a tree carrying anything else.
#
# Until now the root half checked that five paths existed and nothing more, and the
# code said so itself: the sender resolves the directory and the root half is handed
# the resolved value, so the two agree by construction even when the value is wrong,
# and agreement is not evidence. What that misses is a tree that is real but is not
# this run's: an upload that died part way and left the previous run's files, or a
# directory that exists for any reason other than this run having just written it.
# The stamp is written after the upload for exactly that reason -- an interrupted
# rsync never reaches it, so the tree it leaves behind cannot be promoted.
#
# It is not a lock and does not pretend to be one. Nothing here serialises two
# deploys; this answers "is this tree mine", which is a question a single operator
# can get wrong on their own.
RELEASE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM}"
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "printf '%s\n' '$RELEASE_STAMP' > '$REMOTE_RELEASE_DIR/.release-stamp'" </dev/null

# ── Step 3: Build images locally (workstation, where memory is plentiful) ────
# The host (Lightsail nano_3_0, 512 MB) cannot fit a parallel npm ci build;
# any boot-time or deploy-time `compose build` on the host OOMs and wedges
# sshd. So the build happens here instead.
#
# This step needs real memory on the workstation, and "more than the host" is
# not the bar. A second operator hit a V8 heap exhaustion at 957 MB available
# and succeeded at 2.4 GB, so budget 2 GB free as the floor and 3 GB to be
# comfortable. On a machine running a desktop session and a browser, free
# memory rather than installed memory is what decides it.

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
# Every value the base compose hard-requires via ${VAR:?} has to be present for
# `docker compose build`, because compose interpolates the whole file before
# building, even though none of these is ever baked into an image. Both are
# runtime-only: the worker-to-web channel secret and the cookie signing key both
# live in /srv/footbag/env on the host and are injected at container start.
# The placeholders are deliberately short and obviously fake, so that if one ever
# did reach a real boot the application's own guards refuse it rather than
# accepting a weak value. Keep this list equal to the ${VAR:?} set in
# docker/docker-compose.yml; a test pins that.
( cd "$REPO_ROOT" \
    && INTERNAL_EVENT_SECRET=build-time-placeholder-unused \
       SESSION_SECRET=build-time-placeholder-unused \
       docker compose \
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
  # operator to perform by hand. Best-effort: a reclaim failure must not abort the
  # deploy.
  #
  # Scoped deliberately, and NOT `docker system prune -af`. That form removes
  # stopped containers first and then every image no container references, so the
  # claim that the running stack's images are kept holds only while the stack is
  # up. After a deploy that left it down, it deletes the current release's images,
  # and a transfer that then fails mid-stream leaves the host with nothing to
  # restart from. `image prune` without -a takes only dangling images, which is
  # exactly what the previous :latest becomes, and cannot touch a tagged image
  # whatever the container state; `builder prune` takes the build cache. Neither
  # removes a container.
  echo "==> Reclaiming host disk (journal vacuum + dangling images + build cache)..."
  printf '%s\n' "$SUDO_PASS" \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" sh -c "journalctl --vacuum-time=7d; docker image prune -f; docker builder prune -af"' \
    || echo "    WARNING: host disk-reclaim step failed; continuing." >&2
  send_images_to_host
fi

# ── Step 5: Run the remote-as-root deploy via cat-pipe ───────────────────────
# printf emits the password line; the EXPECTED_*_IMAGE_LAYERS assignments give
# the remote-half the layer DiffIDs to verify against the docker-loaded images;
# cat appends the remote-half script body. ssh stdin = password + assignments +
# body. sudo -S consumes the password; bash inherits the rest and runs as
# root. Argv on every hop stays free of secrets. Layer DiffIDs are
# space-separated sha256:[0-9a-f]{64} tokens and contain no shell metacharacters.

# The FOOTBAG_DEV_INITIAL_ADMIN_EMAILS value for the permanent dev/staging
# register-allowlist bootstrap. The shared library owns the path, the parsing
# rules and the production refusal; both deploy wrappers reach it the same way
# so the two cannot drift apart. An empty value is a valid answer and clears the
# env var on staging, so a stale list cannot survive the operator emptying it.
INITIAL_ADMIN_EMAILS_CSV="$(resolve_initial_admin_emails_csv "$REPO_ROOT" "$REMOTE")"

# Deploy provenance. This deploy rsyncs the local working tree, not a tagged
# artifact, so the commit alone does not describe what is running: uncommitted
# edits ship too. Record the commit AND the dirty paths on the host, so "what
# is deployed right now" is a question with an answer afterwards instead of an
# inference from whoever last ran this. The dirty list is capped because it is
# a breadcrumb, not a diff.
DEPLOY_COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
# `sed -n '1,40p'` rather than `head -40`: head closes the pipe the moment it
# has its forty lines, which hands SIGPIPE to cut and to git, and pipefail then
# makes the whole assignment exit 141 and abort the deploy under set -e. It only
# bites when the tree carries more than forty dirty paths, so it lay dormant for
# as long as deploys ran from a nearly clean checkout. sed reads to end of input.
DEPLOY_DIRTY_PATHS="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | cut -c4- | sed -n '1,40p' | paste -sd, -)"
DEPLOY_DIRTY_COUNT="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
# Past the cap the list is short, and a short list reads exactly like a complete
# one. Whoever reconstructs what produced an artifact has to be told the record
# is partial, not left to notice by counting commas against the dirty total.
if [[ "$DEPLOY_DIRTY_COUNT" -gt 40 ]]; then
  DEPLOY_DIRTY_PATHS="${DEPLOY_DIRTY_PATHS},+$((DEPLOY_DIRTY_COUNT - 40)) more not listed"
fi
DEPLOY_PROVENANCE="commit=$DEPLOY_COMMIT dirty=$DEPLOY_DIRTY_COUNT paths=${DEPLOY_DIRTY_PATHS:-none}"
echo "==> Shipping working tree at commit $DEPLOY_COMMIT with $DEPLOY_DIRTY_COUNT uncommitted path(s)."
if [[ "$DEPLOY_DIRTY_COUNT" != "0" ]]; then
  echo "    uncommitted: ${DEPLOY_DIRTY_PATHS}"
fi

echo "==> Running remote-as-root deploy (promote, restart)..."
{
  printf '%s\n' "$SUDO_PASS"
  printf 'DEPLOY_PROVENANCE=%q\n'            "$DEPLOY_PROVENANCE"
  printf 'EXPECTED_WEB_IMAGE_LAYERS=%q\n'    "$WEB_IMAGE_LAYERS"
  printf 'EXPECTED_WORKER_IMAGE_LAYERS=%q\n' "$WORKER_IMAGE_LAYERS"
  printf 'EXPECTED_IMAGE_IMAGE_LAYERS=%q\n'  "$IMAGE_IMAGE_LAYERS"
  printf 'FOOTBAG_ENV=%q\n'                  "$FOOTBAG_ENV"
  printf 'DEPLOY_TARGET=%q\n'                "$REMOTE"
  # The directory this run actually uploaded to, resolved in step 1 against the
  # connecting account's home. Sent rather than assumed, so the half that
  # promotes it and the half that filled it can never name different paths.
  printf 'RELEASE_DIR=%q\n'                  "$REMOTE_RELEASE_DIR"
  printf 'RELEASE_STAMP=%q\n'                "$RELEASE_STAMP"
  printf 'FOOTBAG_DEV_INITIAL_ADMIN_EMAILS=%q\n' "$INITIAL_ADMIN_EMAILS_CSV"
  printf 'SEED_TEST_PERSONAS=%q\n'          "${SEED_TEST_PERSONAS:-no}"
  printf 'REFRESH_TEST_PERSONAS=%q\n'       "${REFRESH_TEST_PERSONAS:-no}"
  # Empty on every ordinary code deploy. scripts/deploy-migrate.sh is the only
  # caller that sets it, and the remote half applies it in the one window where
  # the new code is in place and the service is not yet running.
  printf 'MIGRATION_SQL=%q\n'               "${MIGRATION_SQL:-}"
  printf 'MIGRATION_NAME=%q\n'              "${MIGRATION_NAME:-}"
  printf 'MIGRATION_CHECKSUM=%q\n'          "${MIGRATION_CHECKSUM:-}"
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

# ── Step 5: Smoke check ───────────────────────────────────────────────────────
# Smoke runs against the public CloudFront URL, not the direct Lightsail
# origin. The origin is fenced by X-Origin-Verify (returns 444 to anything
# not coming through CloudFront), so direct-IP smoke would always fail under
# the current production-like wiring. No environment URL is committed to the
# repo: the staging address is deliberately unpublished, and that is what
# shields the real-data staging environment. It is read from the environment's
# own Terraform output instead of from a file, so it cannot go stale and no
# operator has to keep a copy. SMOKE_BASE_URL remains the per-run override.
if [[ -z "${SMOKE_BASE_URL:-}" ]]; then
  case "$FOOTBAG_ENV" in
    staging | production)
      tf_output_read "$REPO_ROOT/terraform/$FOOTBAG_ENV" cloudfront_domain || true
      smoke_domain="$TF_OUTPUT_VALUE"
      [[ -n "$smoke_domain" ]] && SMOKE_BASE_URL="https://$smoke_domain"
      ;;
  esac
fi
SMOKE_BASE_URL="${SMOKE_BASE_URL:-}"

if [[ "$SKIP_SMOKE" == "yes" ]]; then
  echo "==> Skipping post-deploy smoke check (SKIP_SMOKE=yes)"
elif [[ -z "$SMOKE_BASE_URL" ]]; then
  # A staging or production deploy must never complete with smoke silently
  # skipped: a deploy that "succeeds" unverified is false confidence.
  # Explicit SKIP_SMOKE=yes remains the operator's deliberate override.
  if [[ "$FOOTBAG_ENV" == "production" || "$FOOTBAG_ENV" == "staging" ]]; then
    echo "ERROR: no public base URL for $FOOTBAG_ENV, so the deploy cannot be" >&2
    echo "       smoke-checked and will not report itself as done." >&2
    tf_output_explain "terraform/$FOOTBAG_ENV" cloudfront_domain
    echo "" >&2
    echo "       Or export SMOKE_BASE_URL, or SKIP_SMOKE=yes to skip deliberately." >&2
    exit 1
  fi
  echo "==> Skipping post-deploy smoke check (no SMOKE_BASE_URL configured for FOOTBAG_ENV=$FOOTBAG_ENV)"
else
  echo "==> Running smoke check against $SMOKE_BASE_URL ..."
  if ! BASE_URL="$SMOKE_BASE_URL" bash "$REPO_ROOT/scripts/smoke-local.sh"; then
    echo "ERROR: post-deploy smoke check failed against $SMOKE_BASE_URL" >&2
    echo "Recommendation: ssh $REMOTE 'sudo journalctl -u footbag -n 200 --no-pager' to inspect host logs." >&2
    exit 1
  fi
  # Blocking security probes (auth gates, anti-enumeration equivalence, the
  # dev-harness environment contract). Same fail-hard stance as the route
  # smoke above.
  echo "==> Running security smoke probes against $SMOKE_BASE_URL ..."
  if ! BASE_URL="$SMOKE_BASE_URL" SMOKE_ENV="$FOOTBAG_ENV" bash "$REPO_ROOT/scripts/smoke-security.sh"; then
    echo "ERROR: security smoke probes failed against $SMOKE_BASE_URL" >&2
    echo "Recommendation: ssh $REMOTE 'sudo journalctl -u footbag -n 200 --no-pager' to inspect host logs." >&2
    exit 1
  fi
fi

echo ""
echo "Deploy complete."
# stderr, for the reason given at the target banner above.
echo "Origin: http://$HOST_IP" >&2
