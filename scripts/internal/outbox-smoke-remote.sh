# Remote half of the verify-prod-email.sh outbox leg. Arrives on the ssh
# stdin stream behind the sudo password and the prepended assignments
# (SMOKE_TO, optional SMOKE_TIMEOUT_SECONDS), per the wire pattern in
# scripts/lib/host-env-remote.sh. Runs the outbox send-path smoke
# (dist/runOutboxSmoke.js, validation gate G10) inside the web container
# against the live stack; the smoke's GATE: line streams back on stdout.
set -euo pipefail

cd /srv/footbag

SMOKE_ARGS=(--to "$SMOKE_TO")
if [[ -n "${SMOKE_TIMEOUT_SECONDS:-}" ]]; then
  SMOKE_ARGS+=(--timeout-seconds "$SMOKE_TIMEOUT_SECONDS")
fi

docker compose --env-file /srv/footbag/env \
  -f docker/docker-compose.yml -f docker/docker-compose.prod.yml \
  exec -T web node dist/runOutboxSmoke.js "${SMOKE_ARGS[@]}" </dev/null
