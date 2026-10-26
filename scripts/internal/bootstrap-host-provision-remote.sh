#!/usr/bin/env bash
# Root-side body of the host provisioning steps of scripts/bootstrap-host.sh.
# Never run directly: it expects the assignments its caller emits ahead of it on
# the same stdin stream, and it runs as root because the caller pipes it into
# sudo.
#
# Invoked via the wire pattern:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'MODE=%q\n' packages;
#     printf 'COMPOSE_VERSION=%q\n' ...;   (and the other pins, for packages)
#     cat scripts/internal/bootstrap-host-provision-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-bootstrap-provision'
#
# One body, three modes, because each is a separate step the bootstrap proves
# and resumes on its own:
#
#   packages  the container engine, sqlite, rsync, the AWS CLI if the image
#             has none, all from the distribution's own signed repositories;
#             the Compose plugin from its publisher, at the pinned version,
#             installed only after the download matches the pinned SHA-256.
#   layout    /srv/footbag and an empty env file, root:root, the file mode 600.
#             An env file already there is never emptied or rewritten: its
#             ownership and mode are corrected and its content left alone.
#   dbdir     the database directory, owned by the account the containers run
#             as, because SQLite writes its sidecars beside the database and a
#             root-owned directory makes the application exit at startup.
#
# What it refuses: a pin still holding its placeholder, a digest that does not
# match, and a machine that is not x86_64, since the pinned binary is built for
# that and nothing else.
#
# Required shell variables:
#   MODE                        packages | layout | dbdir
#   for packages: DOCKER_PACKAGE SQLITE_PACKAGE RSYNC_PACKAGE AWSCLI_PACKAGE
#                 COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256
#   for dbdir:    APP_UID (the containers' numeric account)

set -euo pipefail

: "${MODE:?remote half requires MODE}"

work=""
cleanup() {
  [[ -n "$work" && -d "$work" ]] && rm -rf "$work"
  return 0
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

SRV="/srv/footbag"
ENV_FILE="${SRV}/env"
DB_DIR="${SRV}/db"
PLUGIN_DIR="/usr/local/lib/docker/cli-plugins"

case "$MODE" in
  packages)
    for v in DOCKER_PACKAGE SQLITE_PACKAGE RSYNC_PACKAGE AWSCLI_PACKAGE COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256; do
      [[ -n "${!v:-}" ]] || { echo "ERROR: remote half requires ${v}" >&2; exit 1; }
    done
    if [[ "${COMPOSE_VERSION}${COMPOSE_URL}${COMPOSE_SHA256}" == *REPLACE_WITH_* \
          || ! "$COMPOSE_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
      echo "ERROR: the Compose plugin pin is a placeholder or not a digest; nothing installed." >&2
      exit 1
    fi
    arch="$(uname -m)"
    [[ "$arch" == "x86_64" ]] || {
      echo "ERROR: this host is ${arch}; the pinned Compose plugin is built for x86_64. Nothing installed." >&2
      exit 1
    }

    # The container engine counts as present when any package provides it or a
    # docker client already runs. A host built from the older runbook carries the
    # Docker CE package, whose name is not the distribution's, and asking the
    # package manager for the distribution's docker there would try to replace
    # the engine every container runs on.
    want=("$SQLITE_PACKAGE" "$RSYNC_PACKAGE")
    if rpm -q --whatprovides "$DOCKER_PACKAGE" >/dev/null 2>&1 || docker --version >/dev/null 2>&1; then
      echo "    a container engine is already installed; ${DOCKER_PACKAGE} is not installed over it"
    else
      want=("$DOCKER_PACKAGE" "${want[@]}")
    fi
    command -v aws >/dev/null 2>&1 || want+=("$AWSCLI_PACKAGE")
    missing=()
    for p in "${want[@]}"; do
      rpm -q "$p" >/dev/null 2>&1 || missing+=("$p")
    done
    if (( ${#missing[@]} > 0 )); then
      echo "==> Installing ${missing[*]} from the distribution's repositories"
      dnf install -y "${missing[@]}"
    else
      echo "    distribution packages already installed: ${want[*]}"
    fi

    systemctl enable --now docker
    connecting="${SUDO_USER:-footbag}"
    if id "$connecting" >/dev/null 2>&1 && [[ " $(id -nG "$connecting") " != *" docker "* ]]; then
      usermod -aG docker "$connecting"
      echo "    added ${connecting} to the docker group"
    fi

    have="$(docker compose version --short 2>/dev/null || true)"
    if [[ "v${have#v}" == "$COMPOSE_VERSION" ]]; then
      echo "    Compose plugin already at ${COMPOSE_VERSION}"
    else
      echo "==> Installing the Compose plugin ${COMPOSE_VERSION}"
      work="$(mktemp -d)"
      curl -fsSL "$COMPOSE_URL" -o "${work}/docker-compose"
      if ! printf '%s  %s\n' "$COMPOSE_SHA256" "${work}/docker-compose" \
           | sha256sum -c --quiet - >/dev/null 2>&1; then
        echo "ERROR: the downloaded Compose plugin does not match the pinned SHA-256; nothing installed." >&2
        echo "       pinned:     ${COMPOSE_SHA256}" >&2
        echo "       downloaded: $(sha256sum "${work}/docker-compose" | cut -d' ' -f1)" >&2
        exit 1
      fi
      install -d -m 755 -o root -g root "$PLUGIN_DIR"
      install -m 755 -o root -g root "${work}/docker-compose" "${PLUGIN_DIR}/docker-compose"
      have="$(docker compose version --short 2>/dev/null || true)"
      [[ "v${have#v}" == "$COMPOSE_VERSION" ]] || {
        echo "ERROR: after the install docker compose reports '${have}', not ${COMPOSE_VERSION}." >&2
        exit 1
      }
      echo "    Compose plugin ${COMPOSE_VERSION} installed and verified"
    fi
    ;;

  layout)
    install -d -m 755 -o root -g root "$SRV"
    if [[ -e "$ENV_FILE" ]]; then
      chown root:root "$ENV_FILE"
      chmod 600 "$ENV_FILE"
      echo "    ${ENV_FILE} present; ownership and mode set, content untouched"
    else
      install -m 600 -o root -g root /dev/null "$ENV_FILE"
      echo "    created an empty ${ENV_FILE}, root:root 600"
    fi
    ;;

  dbdir)
    : "${APP_UID:?remote half requires APP_UID}"
    [[ "$APP_UID" =~ ^[0-9]+$ ]] || { echo "ERROR: APP_UID '${APP_UID}' is not a numeric account." >&2; exit 1; }
    install -d -m 750 -o "$APP_UID" -g "$APP_UID" "$DB_DIR"
    chown -R "${APP_UID}:${APP_UID}" "$DB_DIR"
    echo "    ${DB_DIR} owned ${APP_UID}:${APP_UID}"
    ;;

  *)
    echo "ERROR: unknown MODE '${MODE}'." >&2
    exit 1
    ;;
esac
