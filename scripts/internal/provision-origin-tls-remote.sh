#!/usr/bin/env bash
# Root-side body of scripts/provision-origin-tls.sh. Never run directly: it
# expects the assignments its wrapper emits ahead of it on the same stdin
# stream, after the sudo password line and scripts/lib/closing-report-remote.sh,
# and it runs as root because the wrapper pipes it into sudo.
#
# Required shell variables (the wrapper's prepended assignments):
#   MODE             status | issue
#   ORIGIN_HOST      origin.<domain>, the name the certificate is for
#   ROLE_ARN         the role certbot assumes to write the DNS-01 challenge
#   FOOTBAG_ENV_VAL  the environment, which names the host's AWS profiles
#
# What it marks on stdout for the wrapper, one line each:
#   ---FOOTBAG-ISSUED--- new|existing           (issue)
#   ---FOOTBAG-FINGERPRINT-DISK--- <sha256>     the certificate on disk
#   ---FOOTBAG-FINGERPRINT-SERVED--- <sha256>   the one nginx serves on 443
#   ---FOOTBAG-NOT-AFTER--- <ISO 8601 time>     the certificate's expiry
#
# The issue mode owns the host side in one elevated shell, because the parts
# are one operation: a certificate with no renewal expires in silence, and a
# renewal with no reload leaves nginx serving the old certificate until it
# expires, which CloudFront answers with 502 to every visitor once the hop is
# https-only. Nothing it issued is removed on failure; the rehearsal
# certificate from Let's Encrypt's staging authority is deleted once issued,
# because no listener may ever serve it.

set -euo pipefail

: "${MODE:?remote half requires MODE}"
: "${FOOTBAG_ENV_VAL:?remote half requires FOOTBAG_ENV_VAL}"
# The status mode also runs before the origin record exists, with both empty.
if [[ "$MODE" != status ]]; then
  : "${ORIGIN_HOST:?remote half requires ORIGIN_HOST}"
  : "${ROLE_ARN:?remote half requires ROLE_ARN}"
fi
ORIGIN_HOST="${ORIGIN_HOST:-}"
ROLE_ARN="${ROLE_ARN:-}"

LE_DIR="${ORIGIN_TLS_LE_DIR:-/etc/letsencrypt}"
# Where the compose file mounts the certificate directories inside nginx.
LE_MOUNT=/etc/letsencrypt
LIVE="${LE_DIR}/live/origin"
HOOK="${LE_DIR}/renewal-hooks/deploy/footbag-nginx-reload"
AWS_CONFIG="${ORIGIN_TLS_AWS_CONFIG:-/root/.aws/config}"
AWS_CREDENTIALS="${ORIGIN_TLS_AWS_CREDENTIALS:-/root/.aws/credentials}"
DROPIN_DIR="${ORIGIN_TLS_SYSTEMD_DIR:-/etc/systemd/system}/certbot-renew.service.d"
PROFILE="footbag-${FOOTBAG_ENV_VAL}-origin-tls"
SOURCE_PROFILE="footbag-${FOOTBAG_ENV_VAL}-source-profile"
# How long nginx has to come back healthy after a restart, in seconds.
HEALTH_WAIT="${ORIGIN_TLS_HEALTH_WAIT:-60}"
# The overrides above exist so the half can run against scratch paths under
# test; a run that uses one proves nothing about a host, and says so.
[[ -n "${ORIGIN_TLS_LE_DIR:-}${ORIGIN_TLS_AWS_CONFIG:-}${ORIGIN_TLS_AWS_CREDENTIALS:-}${ORIGIN_TLS_SYSTEMD_DIR:-}${ORIGIN_TLS_HEALTH_WAIT:-}" ]] \
  && echo "SYNTHETIC: origin TLS paths overridden -- this run proves nothing about a host." >&2

umask 077
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

DNF_ERRORS='^Error|No match for argument|Problem:'
DNF_WARNINGS='^Warning'
CERTBOT_ERRORS='^An unexpected error|^Error|Some challenges have failed|Failed|[Uu]nauthorized'
CERTBOT_WARNINGS='^WARNING|Warning:'
SYSTEMD_ERRORS='[Ff]ailed'
SYSTEMD_WARNINGS='^Warning'

# timer_state is-enabled|is-active
# What systemctl says of the renewal timer. Its exit status only repeats the
# state it prints (non-zero for disabled or inactive), so the printed word is
# the answer, and a read that prints nothing says so.
timer_state() {
  local out rc=0
  out="$(systemctl "$1" certbot-renew.timer 2>/dev/null)" || rc=$?
  printf '%s' "${out:-unreadable (exit ${rc})}"
}

nginx_container() {
  docker ps -q --filter "label=com.docker.compose.service=nginx" --filter status=running | head -n 1
}

# The SHA-256 fingerprint of a certificate on stdin, colons removed, or nothing.
fingerprint() {
  openssl x509 -noout -fingerprint -sha256 2>/dev/null | sed -n 's/^.*Fingerprint=//p' | tr -d ':'
}
disk_fingerprint() {
  [[ -r "${LIVE}/cert.pem" ]] || return 0
  fingerprint < "${LIVE}/cert.pem"
}
served_fingerprint() {
  openssl s_client -connect 127.0.0.1:443 -servername "$ORIGIN_HOST" </dev/null 2>/dev/null | fingerprint
}
not_after() {
  [[ -r "${LIVE}/cert.pem" ]] || return 0
  openssl x509 -noout -enddate -dateopt iso_8601 -in "${LIVE}/cert.pem" 2>/dev/null | sed -n 's/^notAfter=//p'
}

# The certificate on disk names the origin, came from Let's Encrypt's
# production authority, and has more than a third of its lifetime left. A third
# rather than a fixed number of days, because Let's Encrypt is shortening the
# lifetime it issues, and a re-run must not re-issue a healthy certificate.
certificate_holds() {
  local host_check issuer start end s e
  [[ -r "${LIVE}/cert.pem" ]] || return 1
  # A certificate openssl cannot read does not hold.
  host_check="$(openssl x509 -noout -checkhost "$ORIGIN_HOST" -in "${LIVE}/cert.pem" 2>/dev/null)" || return 1
  grep -q 'does match' <<<"$host_check" || return 1
  start="$(openssl x509 -noout -startdate -dateopt iso_8601 -in "${LIVE}/cert.pem" 2>/dev/null)" || return 1
  end="$(openssl x509 -noout -enddate -dateopt iso_8601 -in "${LIVE}/cert.pem" 2>/dev/null)" || return 1
  s="$(date -u -d "${start#notBefore=}" +%s 2>/dev/null)" || return 1
  e="$(date -u -d "${end#notAfter=}" +%s 2>/dev/null)" || return 1
  (( e > s )) || return 1
  openssl x509 -noout -checkend $(( (e - s) / 3 )) -in "${LIVE}/cert.pem" >/dev/null 2>&1 || return 1
  issuer="$(openssl x509 -noout -issuer -in "${LIVE}/cert.pem" 2>/dev/null)" || return 1
  [[ -n "$issuer" ]] && ! grep -qi 'staging' <<<"$issuer"
}

# What CloudFront will check, asked of the listener from the host itself: a
# TLS 1.2 handshake whose chain verifies against the system's trusted roots and
# names the origin. The leaf alone matching the file on disk does not show the
# chain is complete, which CloudFront refuses.
served_verifies() {
  openssl s_client -connect 127.0.0.1:443 -servername "$ORIGIN_HOST" -tls1_2 \
    -verify_hostname "$ORIGIN_HOST" -verify_return_error </dev/null >/dev/null 2>&1
}

mark_certificate() {
  local disk served
  disk="$(disk_fingerprint)"
  served="$(served_fingerprint)"
  echo "---FOOTBAG-FINGERPRINT-DISK--- ${disk}"
  echo "---FOOTBAG-FINGERPRINT-SERVED--- ${served}"
  echo "---FOOTBAG-NOT-AFTER--- $(not_after)"
}

if [[ "$MODE" == status ]]; then
  echo "== certbot"
  if rpm -q certbot python3-certbot-dns-route53 >/dev/null 2>&1; then
    rpm -q certbot python3-certbot-dns-route53
  else
    # What an issue would install, read from the host's own locked release.
    # A repository that offers neither is the run's error: the issue mode
    # could not install certbot.
    echo "    not installed; the host's repositories offer:"
    if offered="$(dnf -q repoquery --available --qf '%{name} %{version}' certbot python3-certbot-dns-route53 2>&1)"; then
      if grep -q '^certbot ' <<<"$offered" && grep -q '^python3-certbot-dns-route53 ' <<<"$offered"; then
        sed 's/^/      /' <<<"$offered"
        echo "---FOOTBAG-CERTBOT-OFFERED--- $(grep '^certbot ' <<<"$offered" | head -n 1 | cut -d' ' -f2)"
      else
        crr_error "the host's repositories do not offer both certbot and python3-certbot-dns-route53 (they offer: '${offered//$'\n'/; }')"
      fi
    else
      crr_error "could not ask dnf what the host's repositories offer: ${offered##*$'\n'}"
    fi
  fi
  if [[ -z "$ORIGIN_HOST" ]]; then
    echo "== no origin name yet: the record and its role come with enable_origin_record"
    crr_finish
  fi
  echo "== the certificate for ${ORIGIN_HOST}"
  if [[ -r "${LIVE}/cert.pem" ]]; then
    echo "    expires $(not_after); $(certificate_holds && echo 'holds' || echo 'does not hold: wrong name, under a third of its lifetime left, or from the staging authority')"
  else
    echo "    none on this host"
  fi
  echo "== renewal"
  echo "    certbot-renew.timer: $(timer_state is-enabled), $(timer_state is-active)"
  echo "    reload hook: $([[ -x "$HOOK" ]] && echo installed || echo absent)"
  echo "== what nginx serves on 443"
  served="$(served_fingerprint)"
  echo "    ${served:-nothing: no listener on 443}"
  mark_certificate
  crr_finish
fi

[[ "$MODE" == issue ]] || { crr_error "unknown mode '${MODE}'"; crr_finish; }

# ── the running nginx can serve a certificate ───────────────────────────────
# A restart keeps a container's port mappings and mounts, so a container
# created before the compose file carried 443 and the certificate directories
# could never serve one. Refused before anything is issued: a deploy of the
# current release recreates it.
echo "== the running nginx container"
id="$(nginx_container)"
if [[ -z "$id" ]]; then
  crr_error "no running nginx container; nothing was issued"
  crr_finish
fi
ports="$(docker port "$id" 443 2>&1)" || ports=""
mounts="$(docker inspect --format '{{range .Mounts}}{{.Destination}} {{end}}' "$id" 2>&1)" || mounts=""
if [[ -z "$ports" || " $mounts " != *" ${LE_MOUNT}/live "* || " $mounts " != *" ${LE_MOUNT}/archive "* ]]; then
  crr_error "the running nginx container does not publish 443 with the certificate directories mounted (ports: '${ports}'; mounts: '${mounts}'); deploy the current release, then re-run; nothing was issued"
  crr_finish
fi
echo "    publishes 443 with the certificate directories mounted"

# ── certbot ─────────────────────────────────────────────────────────────────
echo "== certbot and its Route 53 plugin"
if rpm -q certbot python3-certbot-dns-route53 >/dev/null 2>&1; then
  echo "    already installed"
else
  crr_run --errors "$DNF_ERRORS" --warnings "$DNF_WARNINGS" "dnf install certbot" -- \
    dnf install -y certbot python3-certbot-dns-route53 || crr_finish
fi
if ! systemctl cat certbot-renew.timer >/dev/null 2>&1; then
  crr_error "the certbot package installed no certbot-renew.timer, so nothing would renew the certificate"
  crr_finish
fi

# ── the profile that reaches the challenge role ─────────────────────────────
echo "== the ${PROFILE} profile"
if grep -qs "^\[profile ${PROFILE}\]" "$AWS_CONFIG"; then
  recorded="$(awk -v p="[profile ${PROFILE}]" '$0 == p { s = 1; next } /^\[/ { s = 0 } s && $1 == "role_arn" { print $3 }' "$AWS_CONFIG")"
  if [[ "$recorded" != "$ROLE_ARN" ]]; then
    crr_error "${AWS_CONFIG} already names a different role for ${PROFILE} ('${recorded}', not '${ROLE_ARN}'); correct that stanza, then re-run"
    crr_finish
  fi
  echo "    present"
else
  {
    printf '\n[profile %s]\n' "$PROFILE"
    printf 'role_arn = %s\n' "$ROLE_ARN"
    printf 'source_profile = %s\n' "$SOURCE_PROFILE"
  } >> "$AWS_CONFIG"
  echo "    written into ${AWS_CONFIG}"
fi
export AWS_PROFILE="$PROFILE" AWS_CONFIG_FILE="$AWS_CONFIG" AWS_SHARED_CREDENTIALS_FILE="$AWS_CREDENTIALS"
if ! caller="$(aws sts get-caller-identity --query Arn --output text 2>&1)" \
     || [[ "$caller" != *":assumed-role/${ROLE_ARN##*/}/"* ]]; then
  crr_error "the host cannot assume ${ROLE_ARN} through ${PROFILE}: ${caller##*$'\n'}"
  crr_finish
fi
echo "    assumes ${ROLE_ARN##*/}"

# ── renewal: the timer's environment and the reload hook ────────────────────
echo "== renewal"
dropin="$tmpdir/footbag-aws-profile.conf"
cat > "$dropin" <<EOF
[Service]
Environment=AWS_PROFILE=${PROFILE}
Environment=AWS_CONFIG_FILE=${AWS_CONFIG}
Environment=AWS_SHARED_CREDENTIALS_FILE=${AWS_CREDENTIALS}
EOF
install -d -m 0755 "$DROPIN_DIR"
install -m 0644 "$dropin" "${DROPIN_DIR}/footbag-aws-profile.conf"

hook_src="$tmpdir/footbag-nginx-reload"
cat > "$hook_src" <<'EOF'
#!/usr/bin/env bash
# Installed by scripts/provision-origin-tls.sh. certbot runs it after each
# renewal: nginx re-reads the renewed certificate with no dropped connection,
# and a configuration that fails its own test is never loaded.
set -euo pipefail
id="$(docker ps -q --filter label=com.docker.compose.service=nginx --filter status=running | head -n 1)"
[[ -n "$id" ]] || { echo "footbag-nginx-reload: no running nginx container" >&2; exit 1; }
docker exec "$id" nginx -t
docker exec "$id" nginx -s reload
EOF
install -d -m 0755 "$(dirname "$HOOK")"
install -m 0755 "$hook_src" "$HOOK"

crr_run --errors "$SYSTEMD_ERRORS" --warnings "$SYSTEMD_WARNINGS" "systemctl daemon-reload" -- \
  systemctl daemon-reload || crr_finish
crr_run --errors "$SYSTEMD_ERRORS" --warnings "$SYSTEMD_WARNINGS" "enabling certbot-renew.timer" -- \
  systemctl enable --now certbot-renew.timer || crr_finish
enabled_state="$(timer_state is-enabled)"
active_state="$(timer_state is-active)"
if [[ "$enabled_state" != enabled || "$active_state" != active ]]; then
  crr_error "certbot-renew.timer reads ${enabled_state} and ${active_state} after enabling it, not enabled and active"
  crr_finish
fi
echo "    certbot-renew.timer enabled and active; reload hook installed"

# ── the certificate ─────────────────────────────────────────────────────────
issue_flags=(--dns-route53 -d "$ORIGIN_HOST" --non-interactive --agree-tos
  --register-unsafely-without-email --key-type rsa --rsa-key-size 2048)
if certificate_holds; then
  echo "== the certificate for ${ORIGIN_HOST} holds; nothing is issued"
  echo "---FOOTBAG-ISSUED--- existing"
else
  echo "== rehearsal against Let's Encrypt's staging authority"
  crr_run --errors "$CERTBOT_ERRORS" --warnings "$CERTBOT_WARNINGS" "rehearsal issue" -- \
    certbot certonly --test-cert --cert-name origin-rehearsal --no-directory-hooks "${issue_flags[@]}" \
    || crr_finish
  crr_run --errors "$CERTBOT_ERRORS" --warnings "$CERTBOT_WARNINGS" "removing the rehearsal certificate" -- \
    certbot delete --cert-name origin-rehearsal --non-interactive || crr_finish
  echo "== the certificate, from Let's Encrypt's production authority"
  # A lineage that exists but does not hold (the wrong name, near expiry) is
  # replaced in place, so the listener's paths never change.
  replace=()
  [[ -d "$LIVE" ]] && replace=(--force-renewal)
  crr_run --errors "$CERTBOT_ERRORS" --warnings "$CERTBOT_WARNINGS" "issue" -- \
    certbot certonly --cert-name origin "${replace[@]}" "${issue_flags[@]}" || crr_finish
  if ! certificate_holds; then
    crr_error "certbot reported success, but the certificate in ${LIVE} does not name ${ORIGIN_HOST} with 30 days left from the production authority"
    crr_finish
  fi
  echo "---FOOTBAG-ISSUED--- new"
fi

# ── renewal, proved before the first one is due ─────────────────────────────
# The timer's service must carry the profile, or the first renewal runs with no
# AWS identity and fails its challenge sixty days from now. A dry run renews
# against the staging authority under the same environment, spending nothing of
# the production authority's limits. Random sleep is off because certbot adds
# up to eight minutes of it when no terminal is attached, as here.
echo "== renewal, proved"
service_env="$(systemctl show certbot-renew.service -p Environment --value 2>&1)" || service_env=""
for want in "AWS_PROFILE=${PROFILE}" "AWS_CONFIG_FILE=${AWS_CONFIG}" "AWS_SHARED_CREDENTIALS_FILE=${AWS_CREDENTIALS}"; do
  if [[ " ${service_env} " != *" ${want} "* ]]; then
    crr_error "certbot-renew.service does not carry ${want} (it reads '${service_env}'); the first renewal would run without the challenge role"
    crr_finish
  fi
done
crr_run --errors "$CERTBOT_ERRORS" --warnings "$CERTBOT_WARNINGS" "renewal dry run" -- \
  certbot renew --cert-name origin --dry-run --no-random-sleep-on-renew || crr_finish
echo "    the renewal service carries the profile, and a dry-run renewal succeeded"

# ── nginx serves it ─────────────────────────────────────────────────────────
echo "== nginx on 443"
id="$(nginx_container)"
if [[ -z "$id" ]]; then
  crr_error "no running nginx container to serve the certificate"
  crr_finish
fi
if [[ "$(served_fingerprint)" != "$(disk_fingerprint)" ]]; then
  # The listener is rendered when the container starts, so a first certificate
  # needs a restart; a reload alone would keep serving port 80 only.
  echo "    restarting nginx so it renders its 443 listener"
  crr_run --errors 'Error' --warnings '' "restarting nginx" -- docker restart "$id" || crr_finish
  waited=0
  health=""
  until [[ "$health" == healthy ]]; do
    health="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>&1)" || health="unreadable: ${health##*$'\n'}"
    [[ "$health" == healthy ]] && break
    if (( waited >= HEALTH_WAIT )); then
      crr_error "nginx did not report healthy within ${HEALTH_WAIT} seconds of the restart (last read: ${health})"
      crr_finish
    fi
    sleep 2
    waited=$(( waited + 2 ))
  done
fi
# The hook certbot runs on each renewal, run once now, so a renewal's reload is
# proved before the first one is due.
crr_run --errors 'emerg|failed|[Ee]rror' --warnings '\[warn\]' "the renewal reload hook" -- "$HOOK" || crr_finish

disk="$(disk_fingerprint)"
served="$(served_fingerprint)"
if [[ -z "$disk" || "$served" != "$disk" ]]; then
  crr_error "nginx serves '${served:-nothing}' on 443, not the certificate on disk ('${disk:-none}')"
elif ! served_verifies; then
  crr_error "nginx serves the certificate on disk, but a TLS 1.2 handshake naming ${ORIGIN_HOST} does not verify against the trusted roots: the chain is incomplete or the name does not match, and CloudFront would refuse it"
fi
mark_certificate
crr_finish
