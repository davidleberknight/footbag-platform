#!/usr/bin/env bash
# Root-side body of scripts/link-stripe-test-clock.sh. Never run directly: it
# runs as root because the wrapper pipes it into sudo, after the password line,
# the values below and the closing-report remote library, on the same stdin
# stream.
#
# It runs the test-clock link entry point (dist/runLinkTestClockCustomer.js)
# inside the running web container, so the link goes through the payment
# service with the payment key the host actually holds, and that service refuses
# unless the key is a test key. In check mode the entry point runs every refusal
# and writes nothing. Its LINK: line streams back on stdout for the wrapper.
#
# Values the wrapper sends:
#   MEMBER_SLUG   the member to link
#   LINK_MODE     check, or link
#   CUSTOMER_ID   the test-clock customer (link mode only)
# Optional, overridable so this body also runs standalone for its tests:
#   ENV_PATH      the host env file compose reads (default /srv/footbag/env)
set -euo pipefail

ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
if [[ ! -r "$ENV_PATH" ]]; then
  crr_error "${ENV_PATH} is not readable on the host; nothing was linked."
  crr_finish
fi

ARGS=(--member "$MEMBER_SLUG")
if [[ "$LINK_MODE" == "check" ]]; then
  ARGS+=(--check)
elif [[ "$LINK_MODE" == "link" ]]; then
  ARGS+=(--customer "$CUSTOMER_ID")
else
  crr_error "unknown link mode '${LINK_MODE}'; nothing was linked."
  crr_finish
fi

# Reads from /dev/null: this body arrives on the remote shell's stdin, and
# compose would otherwise read the rest of it.
rc=0
docker compose --env-file "$ENV_PATH" \
  -f /srv/footbag/docker/docker-compose.yml \
  -f /srv/footbag/docker/docker-compose.prod.yml \
  exec -T web node dist/runLinkTestClockCustomer.js "${ARGS[@]}" </dev/null || rc=$?
if (( rc != 0 )); then
  crr_error "the link entry point exited ${rc} on the host; its LINK: line says why."
fi
crr_finish
