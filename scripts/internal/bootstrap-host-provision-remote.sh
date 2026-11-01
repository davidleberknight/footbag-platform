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
#   for packages: DOCKER_PACKAGE DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE
#                 SQLITE_VERSION SQLITE3_B64 RSYNC_PACKAGE AWSCLI_PACKAGE
#                 COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256
#                 SQLITE3_B64 is the pinned sqlite3 binary the workstation built,
#                 base64 on one line; no compiler is installed on the host.
#                 AL_RELEASE_FILE names the release file to read (default
#                 /etc/amazon-linux-release) and SQLITE_INSTALL_PATH the
#                 binary's path (default /usr/bin/sqlite3); only the suite
#                 sets either.
#   for dbdir:    APP_UID (the containers' numeric account)

set -euo pipefail

: "${MODE:?remote half requires MODE}"

work=""
sqlite_work=""
cleanup() {
  [[ -n "$work" && -d "$work" ]] && rm -rf "$work"
  [[ -n "$sqlite_work" && -d "$sqlite_work" ]] && rm -rf "$sqlite_work"
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
    for v in DOCKER_PACKAGE DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE SQLITE_VERSION SQLITE3_B64 \
             RSYNC_PACKAGE AWSCLI_PACKAGE COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256; do
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

    # The package repositories are locked to the pinned Amazon Linux release, so
    # every package below, docker included, comes from that one release. Stepping
    # forward is the same command step-amazon-linux.sh runs later.
    release_file="${AL_RELEASE_FILE:-/etc/amazon-linux-release}"
    release_now() { sed -n 's/^Amazon Linux release \([0-9][0-9.]*\).*/\1/p' "$release_file" 2>/dev/null || true; }
    rel="$(release_now)"
    if [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]]; then
      echo "    Amazon Linux already at the pinned release ${AMAZON_LINUX_RELEASE}"
    else
      echo "==> Stepping Amazon Linux from ${rel:-an unknown release} to the pinned release ${AMAZON_LINUX_RELEASE}"
      dnf upgrade -y --releasever="$AMAZON_LINUX_RELEASE"
      rel="$(release_now)"
      [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]] || {
        echo "ERROR: after the upgrade the host reports Amazon Linux ${rel:-unknown}, not ${AMAZON_LINUX_RELEASE}." >&2
        exit 1
      }
    fi

    # The engine is the distribution's package at the pinned version and nothing
    # else. One at any other version, or an engine from another source such as
    # the Docker CE package an older runbook installed, is refused rather than
    # replaced: the package manager would swap the engine every container runs
    # on, and that is a deliberate step, not a side effect of a bootstrap.
    want=("$RSYNC_PACKAGE")
    if rpm -q "$DOCKER_PACKAGE" >/dev/null 2>&1; then
      have_docker="$(rpm -q --qf '%{VERSION}-%{RELEASE}' "$DOCKER_PACKAGE")"
      if [[ "$have_docker" != "$DOCKER_ENGINE_HOST" ]]; then
        echo "ERROR: ${DOCKER_PACKAGE} ${have_docker} is installed; the version list pins ${DOCKER_ENGINE_HOST}. Nothing installed." >&2
        exit 1
      fi
      echo "    ${DOCKER_PACKAGE} already at the pinned ${DOCKER_ENGINE_HOST}"
    elif docker --version >/dev/null 2>&1; then
      echo "ERROR: a container engine not from the distribution is installed ($(docker --version)); the version list pins ${DOCKER_PACKAGE} ${DOCKER_ENGINE_HOST}. Nothing installed." >&2
      exit 1
    else
      want=("${DOCKER_PACKAGE}-${DOCKER_ENGINE_HOST}" "${want[@]}")
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

    # sqlite3 is the pinned static build the workstation made, at the version the
    # application's engine bundles. It goes where the distribution's package put
    # it, because the root shells the deploy and restore halves run under search
    # only the system directories; the distribution's package is removed first so
    # nothing reinstalls its older binary over this one.
    sqlite_target="${SQLITE_INSTALL_PATH:-/usr/bin/sqlite3}"
    have_sqlite="$("$sqlite_target" --version 2>/dev/null | cut -d' ' -f1 || true)"
    if [[ "$have_sqlite" == "$SQLITE_VERSION" ]] && ! rpm -q sqlite >/dev/null 2>&1; then
      echo "    sqlite3 already at the pinned ${SQLITE_VERSION}"
    else
      if rpm -q sqlite >/dev/null 2>&1; then
        echo "==> Removing the distribution sqlite package; the pinned build replaces it"
        dnf remove -y sqlite
      fi
      sqlite_work="$(mktemp -d)"
      printf '%s' "$SQLITE3_B64" | base64 -d > "${sqlite_work}/sqlite3"
      chmod 755 "${sqlite_work}/sqlite3"
      got="$("${sqlite_work}/sqlite3" --version 2>/dev/null | cut -d' ' -f1 || true)"
      [[ "$got" == "$SQLITE_VERSION" ]] || {
        echo "ERROR: the shipped sqlite3 reports '${got:-nothing}', not the pinned ${SQLITE_VERSION}; nothing installed." >&2
        exit 1
      }
      install -m 755 -o root -g root "${sqlite_work}/sqlite3" "$sqlite_target"
      echo "    sqlite3 ${SQLITE_VERSION} installed at ${sqlite_target} and verified"
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
