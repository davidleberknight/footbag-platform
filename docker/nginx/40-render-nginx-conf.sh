#!/bin/sh
set -eu

# The paths default to where the container keeps them. The overrides exist so
# the render can be run outside a container, against files a test controls.
template="${NGINX_TEMPLATE_PATH:-/etc/nginx/nginx.conf.template}"
output="${NGINX_CONF_PATH:-/etc/nginx/nginx.conf}"
tls_listen="${ORIGIN_TLS_LISTEN_PATH:-/etc/nginx/origin-tls-listen.conf}"
tls_dir="${ORIGIN_TLS_CERT_DIR:-/etc/letsencrypt/live/origin}"

[ -f "$template" ] || exit 0

: "${X_ORIGIN_VERIFY_SECRET:=}"
: "${PUBLIC_BASE_URL:=}"

# When a secret is provided, require exactly 64 lowercase hex chars. This
# closes two risks:
#   1. sed metacharacter corruption in the substitution below. Hex-only input
#      cannot contain &, |, \, /, or newline, so the rendered nginx config
#      cannot be malformed by the substitution.
#   2. Operator typo / truncation. A 32-char paste (half the secret) would
#      otherwise render a working-but-mismatched gate that 444s every request,
#      including legitimate CloudFront traffic.
# When empty (dev compose default), the rendered check is
#   if ($http_x_origin_verify != "") { return 444; }
# which is a no-op for unauthenticated requests. Correct for dev where
# CloudFront is not in the path. Prod is protected at the outer compose layer:
# docker-compose.prod.yml sets X_ORIGIN_VERIFY_SECRET with :?must be set in
# /srv/footbag/env, so prod compose fails fast before this script runs.
if [ -n "$X_ORIGIN_VERIFY_SECRET" ]; then
  case "$X_ORIGIN_VERIFY_SECRET" in
    *[!0-9a-f]*)
      echo "X_ORIGIN_VERIFY_SECRET must contain only [0-9a-f]" >&2
      exit 1
      ;;
  esac
  secret_len=$(printf '%s' "$X_ORIGIN_VERIFY_SECRET" | wc -c | tr -d ' ')
  if [ "$secret_len" != 64 ]; then
    echo "X_ORIGIN_VERIFY_SECRET must be 64 hex chars (got $secret_len)" >&2
    exit 1
  fi
fi

# Derive PUBLIC_HOST from PUBLIC_BASE_URL: strip scheme, port, and path.
# Pinning Host upstream protects the app from Host-header injection regardless
# of which domain the viewer used (CloudFront default *.cloudfront.net domain,
# custom CNAME, future aliases). Restricted to a small char set so the sed
# substitution below cannot be corrupted.
PUBLIC_HOST=$(printf '%s' "$PUBLIC_BASE_URL" | sed -E 's|^[a-zA-Z]+://||' | sed 's|[/:].*$||' | tr 'A-Z' 'a-z')
case "$PUBLIC_HOST" in
  *[!a-z0-9.-]*)
    echo "PUBLIC_HOST contains forbidden characters: '$PUBLIC_HOST' (from PUBLIC_BASE_URL='$PUBLIC_BASE_URL')" >&2
    exit 1
    ;;
esac
if [ -z "$PUBLIC_HOST" ]; then
  echo "PUBLIC_BASE_URL must be set so PUBLIC_HOST can be derived for nginx Host pinning" >&2
  exit 1
fi

# Render with sed; both substitutions are character-class restricted upstream
# so metacharacter corruption cannot occur. envsubst would pull in gettext,
# which would require a custom Dockerfile build, which OOMs nano_3_0.
sed -e "s|\${X_ORIGIN_VERIFY_SECRET}|${X_ORIGIN_VERIFY_SECRET}|g" \
    -e "s|\${PUBLIC_HOST}|${PUBLIC_HOST}|g" \
    "$template" > "$output"
[ -s "$output" ] || { echo "rendered $output is empty" >&2; exit 1; }

# Origin TLS: the CloudFront-to-origin hop is encrypted once a certificate for
# the origin's own name is on the host. The server block includes this file, so
# the 443 listener shares the one body that carries the origin-verify gate and
# the upstream Host pin, and no second copy of either exists to drift. With no
# certificate the file is empty and nginx listens on 80 alone, which is how
# every environment without one (development, staging, production before
# issuance) boots. Half a pair stops the container rather than serving a
# listener that cannot complete a handshake.
cert="$tls_dir/fullchain.pem"
key="$tls_dir/privkey.pem"
if [ -f "$cert" ] && [ -f "$key" ]; then
  cat > "$tls_listen" <<EOF
listen 443 ssl;
ssl_certificate $cert;
ssl_certificate_key $key;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_cache shared:origin_tls:1m;
ssl_session_timeout 1h;
EOF
elif [ -e "$cert" ] || [ -e "$key" ]; then
  echo "origin TLS needs both $cert and $key; only one is present" >&2
  exit 1
else
  : > "$tls_listen"
fi
