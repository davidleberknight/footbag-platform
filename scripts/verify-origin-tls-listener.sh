#!/usr/bin/env bash
# scripts/verify-origin-tls-listener.sh -- proves, against the real nginx image,
# that the origin's 443 listener shares the origin-verify gate and the Host pin,
# and that nginx boots on 80 alone without a certificate.
#
# Why this exists: the render script decides at every container start whether
# nginx listens on 443, from whether a certificate pair is mounted. Its unit
# tests read the rendered text; only a real nginx shows that the text loads,
# that a request without the CloudFront secret is closed on 443 as it is on 80,
# and that half a pair stops the container. Production first meets the
# listener at issuance, after the zone move, so this is the proof before then.
#
# What it runs, on this workstation only, all on the loopback address:
#   1. no certificate: 80 proxies a request carrying the secret, 443 is closed;
#   2. a throwaway self-signed pair: 443 closes a request without the secret,
#      proxies one with it under the pinned Host whatever Host was sent,
#      answers the liveness probe, refuses TLS 1.1, and 80 still serves;
#   3. half a pair: the container refuses to start.
# The upstream is a second container of the same image standing in for the
# app, answering with the Host it was sent. The pair is made for this run in a
# private temporary directory and removed with the containers and the network
# when the run ends, however it ends. Nothing deployed is reached.
#
# What it refuses to do:
#   - Run without docker, curl or openssl.
#   - Run while either loopback port is already answering, or while a
#     container or network of its own names is left from an earlier run.
#
# Usage:
#   bash scripts/verify-origin-tls-listener.sh
#
# Test seams (each says on stderr when in use):
#   FOOTBAG_VERIFY_TLS_DOCKER_BIN    docker
#   FOOTBAG_VERIFY_TLS_CURL_BIN      curl
#   FOOTBAG_VERIFY_TLS_OPENSSL_BIN   openssl
#   FOOTBAG_VERIFY_TLS_SETTLE_SECS   seconds to let nginx start (default 3)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

case "${1:-}" in
  "") ;;
  -h|--help) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"; exit 0 ;;
  *) echo "verify-origin-tls-listener: unknown argument '$1' (try --help)" >&2; exit 2 ;;
esac

DOCKER="${FOOTBAG_VERIFY_TLS_DOCKER_BIN:-docker}"
CURL="${FOOTBAG_VERIFY_TLS_CURL_BIN:-curl}"
OPENSSL="${FOOTBAG_VERIFY_TLS_OPENSSL_BIN:-openssl}"
SETTLE="${FOOTBAG_VERIFY_TLS_SETTLE_SECS:-3}"
[[ -n "${FOOTBAG_VERIFY_TLS_DOCKER_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_VERIFY_TLS_DOCKER_BIN='${DOCKER}' -- no real nginx runs." >&2
[[ -n "${FOOTBAG_VERIFY_TLS_CURL_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_VERIFY_TLS_CURL_BIN='${CURL}' -- no real request is made." >&2
[[ -n "${FOOTBAG_VERIFY_TLS_OPENSSL_BIN:-}" ]] && echo "SYNTHETIC: FOOTBAG_VERIFY_TLS_OPENSSL_BIN='${OPENSSL}' -- no real certificate is made." >&2
[[ -n "${FOOTBAG_VERIFY_TLS_SETTLE_SECS:-}" ]] && echo "SYNTHETIC: FOOTBAG_VERIFY_TLS_SETTLE_SECS=${SETTLE} -- the start wait is shortened." >&2

NET=footbag-tls-proof
WEB=footbag-tls-proof-web
NGINX=footbag-tls-proof-nginx
HTTP_PORT=18080
HTTPS_PORT=18443
# Sixty-four hex characters, the shape the render script requires; a value of
# this run's own, never the real secret.
SECRET="$(printf 'f%.0s' $(seq 64))"

for tool in "$DOCKER" "$CURL" "$OPENSSL"; do
  command -v "$tool" >/dev/null 2>&1 || cr_die "${tool} is not installed; nothing was started"
done

compose="${REPO_ROOT}/docker/docker-compose.yml"
IMAGE="$(sed -n '/^  nginx:/,/^  [a-z]/{s/^    image: *//p;}' "$compose" | head -n 1)"
[[ "$IMAGE" == nginx:*@sha256:* ]] || cr_die "no pinned nginx image found in ${compose#"${REPO_ROOT}/"} (found '${IMAGE}'); nothing was started"

for port in "$HTTP_PORT" "$HTTPS_PORT"; do
  if "$CURL" -sk --max-time 2 -o /dev/null "http://127.0.0.1:${port}/" 2>/dev/null \
     || "$CURL" -sk --max-time 2 -o /dev/null "https://127.0.0.1:${port}/" 2>/dev/null; then
    cr_die "something already answers on 127.0.0.1:${port}; nothing was started"
  fi
done
for name in "$WEB" "$NGINX"; do
  if "$DOCKER" container inspect "$name" >/dev/null 2>&1; then
    cr_die "a container named ${name} already exists, left from an earlier run; remove it with '${DOCKER} rm -f ${name}' and re-run; nothing was started"
  fi
done
if "$DOCKER" network inspect "$NET" >/dev/null 2>&1; then
  cr_die "a network named ${NET} already exists, left from an earlier run; remove it with '${DOCKER} network rm ${NET}' and re-run; nothing was started"
fi

WORK="$(mktemp -d)"
chmod 700 "$WORK"
STARTED=0
teardown() {
  if (( STARTED )); then
    "$DOCKER" rm -f "$WEB" "$NGINX" >/dev/null 2>&1 \
      || cr_warn "could not remove the proof containers ${WEB} and ${NGINX}; remove them with '${DOCKER} rm -f ${WEB} ${NGINX}'"
    "$DOCKER" network rm "$NET" >/dev/null 2>&1 \
      || cr_warn "could not remove the proof network ${NET}; remove it with '${DOCKER} network rm ${NET}'"
  fi
  rm -rf "$WORK"
}
cr_cleanup teardown

mkdir -p "$WORK/none" "$WORK/pair/live/origin" "$WORK/half/live/origin"
cat > "$WORK/web.conf" <<'EOF'
events {}
http { server { listen 3000; location / { return 200 "upstream saw host=$host\n"; } } }
EOF
chmod 644 "$WORK/web.conf"
"$OPENSSL" req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=origin.invalid \
  -keyout "$WORK/pair/live/origin/privkey.pem" -out "$WORK/pair/live/origin/fullchain.pem" >/dev/null 2>&1 \
  || cr_die "openssl could not make the throwaway certificate; nothing was started"
cp "$WORK/pair/live/origin/fullchain.pem" "$WORK/half/live/origin/fullchain.pem"
# The secret reaches the container from a file, never its command line, as the
# real deploy's environment file carries it.
printf 'X_ORIGIN_VERIFY_SECRET=%s\nPUBLIC_BASE_URL=https://www.example.org\n' "$SECRET" > "$WORK/nginx.env"
chmod 600 "$WORK/nginx.env"

STARTED=1
"$DOCKER" network create "$NET" >/dev/null || cr_die "could not create the docker network ${NET}"
"$DOCKER" run -d --name "$WEB" --network "$NET" --network-alias web \
  -v "$WORK/web.conf:/etc/nginx/nginx.conf:ro" "$IMAGE" >/dev/null \
  || cr_die "could not start the stand-in upstream from ${IMAGE}"

# start_nginx <certificate directory to mount as /etc/letsencrypt>
start_nginx() {
  "$DOCKER" rm -f "$NGINX" >/dev/null 2>&1 || [[ $? == 1 ]]
  "$DOCKER" run -d --name "$NGINX" --network "$NET" \
    -p "127.0.0.1:${HTTP_PORT}:80" -p "127.0.0.1:${HTTPS_PORT}:443" \
    --env-file "$WORK/nginx.env" \
    -v "${REPO_ROOT}/docker/nginx/nginx.conf.template:/etc/nginx/nginx.conf.template:ro" \
    -v "${REPO_ROOT}/docker/nginx/40-render-nginx-conf.sh:/docker-entrypoint.d/40-render-nginx-conf.sh:ro" \
    -v "$1:/etc/letsencrypt:ro" "$IMAGE" >/dev/null \
    || cr_die "could not start nginx from ${IMAGE}"
  sleep "$SETTLE"
}

# expect <what> <command...>: proved when the command succeeds.
expect() {
  local what="$1"; shift
  if "$@"; then cr_proved "$what"; else cr_error "not so: ${what}"; fi
}
answer_with_secret() {
  local body
  body="$("$CURL" -sk --max-time 5 -H "X-Origin-Verify: ${SECRET}" -H "Host: attacker.example" "$1" 2>/dev/null)" || return 1
  [[ "$body" == *"host=www.example.org"* ]]
}
closed() { ! "$CURL" -sk --max-time 5 -o /dev/null "$1" 2>/dev/null; }
healthz() { [[ -n "$("$CURL" -sk --max-time 5 "$1/nginx-healthz" 2>/dev/null)" ]]; }
old_tls_refused() { ! "$CURL" -sk --tls-max 1.1 --max-time 5 -o /dev/null "$1/nginx-healthz" 2>/dev/null; }
not_running() {
  local state
  state="$("$DOCKER" inspect -f '{{.State.Running}}' "$NGINX" 2>&1)" || return 0
  [[ "$state" != true ]]
}

HTTP="http://127.0.0.1:${HTTP_PORT}"
HTTPS="https://127.0.0.1:${HTTPS_PORT}"

echo "== no certificate"
start_nginx "$WORK/none"
expect "with no certificate, port 80 proxies a request carrying the secret, under the pinned Host" answer_with_secret "$HTTP/"
expect "with no certificate, nothing answers on 443" closed "$HTTPS/"

echo "== a certificate pair"
start_nginx "$WORK/pair"
expect "with a pair, 443 closes a request without the secret" closed "$HTTPS/"
expect "with a pair, 443 proxies a request carrying the secret, under the pinned Host" answer_with_secret "$HTTPS/"
expect "with a pair, 443 answers the liveness probe" healthz "$HTTPS"
expect "with a pair, 443 refuses TLS 1.1" old_tls_refused "$HTTPS"
expect "with a pair, port 80 still proxies a request carrying the secret" answer_with_secret "$HTTP/"

echo "== half a pair"
start_nginx "$WORK/half"
expect "with half a pair, nginx refuses to start" not_running

cr_finish
