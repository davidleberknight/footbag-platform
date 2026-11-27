# shellcheck shell=bash
# verify-prelive-probes-remote.sh -- root-side half of
# scripts/verify-prelive-probes.sh.
#
# Gathers, from the running containers, the facts the workstation side judges.
# It decides nothing itself, so every verdict is made where a test can drive
# it. Each fact is one marked line on stdout:
#
#   ---FOOTBAG-PRELIVE--- <name> <value>
#
# Two modes, one per session:
#   reads       the web container's TRUST_PROXY and the address Express's own
#               trust function resolves for a spoofed forwarded chain; the
#               running nginx's forwarded-header and real-ip lines; the
#               dev-only folders' files and their digests; and the live URL
#               screening adapter's answer for three addresses. Nothing is
#               written: the containers are only read and asked.
#   error-line  one deliberate error line, written to the web container's own
#               standard output as root, so it travels the path every app line
#               does: the logging driver, the app log group, its metric filter.
#
# Receives on the stream, after scripts/lib/closing-report-remote.sh:
#   PROBE_MODE      reads | error-line
#   PROBE_LINE      the line to write (error-line only)
#   PROBE_URLS      the addresses to screen, space-separated (reads only)
# Optional, for its tests: ENV_PATH and COMPOSE_DIR.

: "${PROBE_MODE:?the probe half requires PROBE_MODE}"
ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
COMPOSE_DIR="${COMPOSE_DIR:-/srv/footbag/docker}"

fact() { printf -- '---FOOTBAG-PRELIVE--- %s %s\n' "$1" "$2"; }

# Reads from /dev/null: this body arrives on the remote shell's stdin, and
# compose would otherwise read the rest of it.
compose() {
  docker compose --env-file "$ENV_PATH" \
    -f "${COMPOSE_DIR}/docker-compose.yml" \
    -f "${COMPOSE_DIR}/docker-compose.prod.yml" "$@" </dev/null
}

# One fact from a command's output, or a reported error naming what failed.
# Multi-line output is joined with " ; " so it stays one line.
gather() {
  local name="$1" out rc=0
  shift
  out="$("$@" 2>&1)" || rc=$?
  if (( rc != 0 )); then
    crr_error "${name}: the read on the host exited ${rc}: ${out##*$'\n'}"
    return 0
  fi
  fact "$name" "$(printf '%s\n' "$out" | awk 'NR > 1 { printf " ; " } { printf "%s", $0 }')"
}

# The running nginx's own configuration, as it loaded it, kept to the lines
# that decide which address the app sees: where it proxies, the forwarded
# header it sends, and whose addresses it trusts.
nginx_forwarding() {
  local config
  config="$(compose exec -T -u root nginx nginx -T 2>/dev/null)" || return 1
  grep -E '^[[:space:]]*(proxy_pass|proxy_set_header[[:space:]]+X-Forwarded-For|set_real_ip_from|real_ip_header|real_ip_recursive)[[:space:]]' <<<"$config" \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+/ /g'
}

case "$PROBE_MODE" in
  reads)
    gather trust_proxy compose exec -T web printenv TRUST_PROXY
    # The chain as nginx hands it on: a spoofed entry the viewer sent, the
    # viewer CloudFront saw, the edge nginx appended; the peer is nginx on the
    # docker bridge. The app's parse turns a digit string into a number before
    # Express compiles it, which this repeats.
    gather trust_resolves compose exec -T web node -e '
      const { compileTrust } = require("express/lib/utils");
      const proxyaddr = require("proxy-addr");
      const raw = process.env.TRUST_PROXY;
      const trust = compileTrust(/^\d+$/.test(raw) ? parseInt(raw, 10) : raw);
      const peer = { remoteAddress: "172.18.0.5" };
      const req = { connection: peer, socket: peer, headers: { "x-forwarded-for": "198.51.100.66, 203.0.113.10, 192.0.2.1" } };
      process.stdout.write(proxyaddr(req, trust));'
    gather nginx_forwarding nginx_forwarding
    gather dev_files compose exec -T -u root web sh -c 'cd /app/dist && find dev-bootstrap testkit -type f | sort'
    gather dev_digests compose exec -T -u root web sh -c 'cd /app/dist && find dev-bootstrap testkit -type f | sort | xargs sha256sum'
    gather url_screening compose exec -T web node -e '
      const { getSafeBrowsingAdapter } = require("./dist/adapters/safeBrowsingAdapter");
      (async () => {
        const adapter = getSafeBrowsingAdapter();
        for (const url of process.argv.slice(1)) {
          try {
            const r = await adapter.lookup(url);
            console.log(JSON.stringify({ url, safe: r.safe, threats: r.threatTypes }));
          } catch (e) {
            console.log(JSON.stringify({ url, error: String(e && e.message || e) }));
          }
        }
      })();' ${PROBE_URLS}
    ;;
  error-line)
    : "${PROBE_LINE:?error-line mode requires PROBE_LINE}"
    # PID 1's standard output is what the logging driver ships; a line written
    # anywhere else would never reach the log group, so the probe would prove
    # nothing about the path. As node, the user PID 1 runs as: the container
    # drops every capability, so root cannot open another user's descriptor.
    if compose exec -T -u node web sh -c 'printf "%s\n" "$1" > /proc/1/fd/1' probe "$PROBE_LINE"; then
      fact error_line written
    else
      crr_error "the deliberate error line could not be written to the web container's output"
    fi
    ;;
  *)
    crr_error "unknown probe mode '${PROBE_MODE}'"
    ;;
esac
crr_finish
