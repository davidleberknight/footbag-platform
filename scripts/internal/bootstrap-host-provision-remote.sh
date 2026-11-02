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
#     cat scripts/lib/closing-report-remote.sh;
#     cat scripts/internal/bootstrap-host-provision-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-bootstrap-provision'
#
# The remote reporting library travels ahead of this body because a body on
# stdin cannot source anything. Every problem is marked with crr_error or
# crr_warn, and every dnf transaction runs through crr_run, so a scriptlet
# failure dnf prints and then exits 0 on still lands in the caller's closing
# report; crr_finish ends the run, non-zero when any was an error.
#
# One body, four modes. Three are separate steps the bootstrap proves and
# resumes on its own; the fourth is the read the bootstrap asks before the
# first of them on a host that is serving:
#
#   preview   read-only: how many packages stepping to the pinned release would
#             change, from `dnf check-update`, printed after the
#             ---FOOTBAG-UPGRADE-COUNT--- line. The caller shows it and asks
#             for a typed APPLY before it sends packages.
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
# A refusal says what this run had already changed on the host before it, or
# that it had changed nothing, so the operator is never told a host is as it
# was after its release has been stepped.
#
# Required shell variables:
#   MODE                        preview | packages | layout | dbdir
#   for preview:  AMAZON_LINUX_RELEASE
#   for packages: DOCKER_PACKAGE DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE
#                 SQLITE_VERSION SQLITE3_B64 RSYNC_PACKAGE AWSCLI_PACKAGE
#                 COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256
#                 SQLITE3_B64 is the pinned sqlite3 binary the workstation built,
#                 base64 on one line; no compiler is installed on the host.
#                 AL_RELEASE_FILE names the release file to read (default
#                 /etc/amazon-linux-release), SQLITE_INSTALL_PATH the
#                 binary's path (default /usr/bin/sqlite3) and DNF_CONF the
#                 package manager's configuration (default /etc/dnf/dnf.conf);
#                 only the suite sets any of them.
#   for dbdir:    APP_UID (the containers' numeric account)

set -euo pipefail

: "${MODE:?remote half requires MODE}"

# What dnf prints that is a problem. A scriptlet that fails is printed as a
# warning by rpm and does not fail the transaction, so it is matched as an
# error here; every other warning dnf or rpm prints is listed as one.
DNF_ERRORS='^(Error|error):|scriptlet failed|^Problem( [0-9]+)?:'
DNF_WARNINGS='^(Warning|warning):'

# What this run has changed on the host, for the refusal that follows it.
CHANGED=()
changed_so_far() {
  if (( ${#CHANGED[@]} == 0 )); then
    printf 'nothing was changed on the host'
  else
    local IFS=';'
    printf 'this run had already changed:%s' "${CHANGED[*]/#/ }"
  fi
}
refuse() {
  crr_error "$*; $(changed_so_far)."
  crr_finish
}

work=""
sqlite_work=""
conf_tmp=""
cleanup() {
  [[ -n "$work" && -d "$work" ]] && rm -rf "$work"
  [[ -n "$sqlite_work" && -d "$sqlite_work" ]] && rm -rf "$sqlite_work"
  [[ -n "$conf_tmp" && -e "$conf_tmp" ]] && rm -f "$conf_tmp"
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

release_file="${AL_RELEASE_FILE:-/etc/amazon-linux-release}"
release_now() {
  [[ -r "$release_file" ]] || return 0
  sed -n 's/^Amazon Linux release \([0-9][0-9.]*\).*/\1/p' "$release_file"
}

case "$MODE" in
  preview)
    [[ -n "${AMAZON_LINUX_RELEASE:-}" ]] || refuse "remote half requires AMAZON_LINUX_RELEASE"
    # dnf check-update exits 100 when it lists updates, 0 when there are none,
    # and 1 on an error, so a failed read is never taken for "nothing to do".
    # Each listed update is one "name.arch version repository" line; the
    # section of packages a release obsoletes, which follows, is not counted
    # twice.
    rc=0
    listing="$(dnf check-update -q --releasever="$AMAZON_LINUX_RELEASE" 2>&1)" || rc=$?
    case "$rc" in
      0) count=0 ;;
      100)
        printf '%s\n' "$listing"
        count="$(sed '/^Obsoleting/,$d' <<< "$listing" \
          | grep -cE '^[^[:space:]]+\.[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]*$' || true)"
        (( count > 0 )) || refuse "dnf check-update --releasever=${AMAZON_LINUX_RELEASE} said there are updates and listed none this half can count"
        ;;
      *) refuse "dnf check-update --releasever=${AMAZON_LINUX_RELEASE} failed (exit ${rc}): ${listing##*$'\n'}" ;;
    esac
    echo "    stepping to Amazon Linux ${AMAZON_LINUX_RELEASE} from $(release_now) would change ${count} package(s)"
    echo "---FOOTBAG-UPGRADE-COUNT---"
    echo "$count"
    echo "---FOOTBAG-END---"
    ;;

  packages)
    for v in DOCKER_PACKAGE DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE SQLITE_VERSION SQLITE3_B64 \
             RSYNC_PACKAGE AWSCLI_PACKAGE COMPOSE_VERSION COMPOSE_URL COMPOSE_SHA256; do
      [[ -n "${!v:-}" ]] || refuse "remote half requires ${v}"
    done
    if [[ "${COMPOSE_VERSION}${COMPOSE_URL}${COMPOSE_SHA256}" == *REPLACE_WITH_* \
          || ! "$COMPOSE_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
      refuse "the Compose plugin pin is a placeholder or not a digest"
    fi
    arch="$(uname -m)"
    [[ "$arch" == "x86_64" ]] || refuse "this host is ${arch}; the pinned Compose plugin is built for x86_64"

    # The package repositories are locked to the pinned Amazon Linux release, so
    # every package below, docker included, comes from that one release. Stepping
    # forward is the same command step-amazon-linux.sh runs later.
    rel="$(release_now)"
    if [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]]; then
      echo "    Amazon Linux already at the pinned release ${AMAZON_LINUX_RELEASE}"
    else
      echo "==> Stepping Amazon Linux from ${rel:-an unknown release} to the pinned release ${AMAZON_LINUX_RELEASE}"
      # Recorded before the transaction: a failure part way has still changed
      # packages, and the refusal must not say otherwise.
      CHANGED+=("ran dnf upgrade from Amazon Linux ${rel:-unknown} to ${AMAZON_LINUX_RELEASE}")
      crr_run --errors "$DNF_ERRORS" --warnings "$DNF_WARNINGS" "dnf upgrade" -- \
        dnf upgrade -y --releasever="$AMAZON_LINUX_RELEASE" || refuse "the release upgrade failed"
      rel="$(release_now)"
      [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]] \
        || refuse "after the upgrade the host reports Amazon Linux ${rel:-unknown}, not ${AMAZON_LINUX_RELEASE}"
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
        refuse "${DOCKER_PACKAGE} ${have_docker} is installed; the version list pins ${DOCKER_ENGINE_HOST}"
      fi
      echo "    ${DOCKER_PACKAGE} already at the pinned ${DOCKER_ENGINE_HOST}"
    elif engine="$(docker --version 2>&1)"; then
      refuse "a container engine not from the distribution is installed (${engine}); the version list pins ${DOCKER_PACKAGE} ${DOCKER_ENGINE_HOST}"
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
      CHANGED+=("ran dnf install ${missing[*]}")
      crr_run --errors "$DNF_ERRORS" --warnings "$DNF_WARNINGS" "dnf install" -- \
        dnf install -y "${missing[@]}" || refuse "installing ${missing[*]} failed"
    else
      echo "    distribution packages already installed: ${want[*]}"
    fi

    # sqlite3 is the pinned static build the workstation made, at the version the
    # application's engine bundles. It goes where the distribution's package put
    # it, because the root shells the deploy and restore halves run under search
    # only the system directories. The shipped binary is decoded and checked
    # first, so a bad shipment is refused while the distribution's sqlite3 is
    # still in place; then dnf is told to exclude the distribution's package, so
    # no later transaction reinstalls its older binary over this one, and only
    # then is that package removed.
    sqlite_target="${SQLITE_INSTALL_PATH:-/usr/bin/sqlite3}"
    have_sqlite=""
    if [[ -x "$sqlite_target" ]]; then
      have_sqlite="$("$sqlite_target" --version 2>&1 | cut -d' ' -f1)" || have_sqlite=""
    fi
    distro_sqlite=0
    rpm -q sqlite >/dev/null 2>&1 && distro_sqlite=1
    install_sqlite=1
    if [[ "$have_sqlite" == "$SQLITE_VERSION" ]] && (( ! distro_sqlite )); then
      echo "    sqlite3 already at the pinned ${SQLITE_VERSION}"
      install_sqlite=0
    else
      sqlite_work="$(mktemp -d)"
      printf '%s' "$SQLITE3_B64" | base64 -d > "${sqlite_work}/sqlite3"
      chmod 755 "${sqlite_work}/sqlite3"
      got="$("${sqlite_work}/sqlite3" --version 2>&1 | cut -d' ' -f1)" || got=""
      [[ "$got" == "$SQLITE_VERSION" ]] \
        || refuse "the shipped sqlite3 reports '${got:-nothing}', not the pinned ${SQLITE_VERSION}; the host's sqlite3 was left as it is"
    fi

    # excludepkgs matches package names, so this excludes the package named
    # sqlite and not sqlite-libs, which rpm and dnf themselves need. A value
    # already listing other packages has sqlite appended to it rather than a
    # second line written, because a repeated key in one section is not a
    # list. Written through a temp file promoted with cat, so the file keeps
    # its owner and mode.
    dnf_conf="${DNF_CONF:-/etc/dnf/dnf.conf}"
    excludes_sqlite() {
      grep -qE '^[[:space:]]*(excludepkgs|exclude)[[:space:]]*=([^#]*[,[:space:]])?[[:space:]]*sqlite([,[:space:]]|$)' "$dnf_conf"
    }
    if excludes_sqlite; then
      echo "    ${dnf_conf} already excludes the distribution sqlite package"
    else
      [[ -w "$dnf_conf" ]] || refuse "${dnf_conf} cannot be written, so dnf could reinstall the distribution sqlite"
      conf_tmp="$(mktemp)"
      awk '
        /^\[/ {
          if (in_main && !done) { print "excludepkgs=sqlite"; done = 1 }
          in_main = ($0 == "[main]"); print; next
        }
        in_main && !done && /^[[:space:]]*(excludepkgs|exclude)[[:space:]]*=/ {
          sub(/[[:space:]]+$/, "")
          if ($0 ~ /=[[:space:]]*$/) print $0 "sqlite"; else print $0 ",sqlite"
          done = 1; next
        }
        { print }
        END {
          if (in_main && !done) { print "excludepkgs=sqlite"; done = 1 }
          if (!done) exit 3
        }' "$dnf_conf" > "$conf_tmp" || refuse "${dnf_conf} has no [main] section to exclude the distribution sqlite package in"
      cat "$conf_tmp" > "$dnf_conf"
      CHANGED+=("added sqlite to excludepkgs in ${dnf_conf}")
      excludes_sqlite || refuse "${dnf_conf} still does not exclude the distribution sqlite package after the edit"
      echo "    ${dnf_conf} now excludes the distribution sqlite package"
    fi

    if (( install_sqlite )); then
      if (( distro_sqlite )); then
        echo "==> Removing the distribution sqlite package; the pinned build replaces it"
        CHANGED+=("ran dnf remove sqlite")
        crr_run --errors "$DNF_ERRORS" --warnings "$DNF_WARNINGS" "dnf remove" -- \
          dnf remove -y sqlite || refuse "removing the distribution sqlite package failed"
      fi
      install -m 755 -o root -g root "${sqlite_work}/sqlite3" "$sqlite_target"
      CHANGED+=("installed sqlite3 ${SQLITE_VERSION} at ${sqlite_target}")
      got="$("$sqlite_target" --version 2>&1 | cut -d' ' -f1)" || got=""
      [[ "$got" == "$SQLITE_VERSION" ]] \
        || refuse "after the install ${sqlite_target} reports '${got:-nothing}', not ${SQLITE_VERSION}"
      echo "    sqlite3 ${SQLITE_VERSION} installed at ${sqlite_target} and verified"
    fi

    systemctl enable --now docker
    connecting="${SUDO_USER:-footbag}"
    if id "$connecting" >/dev/null 2>&1 && [[ " $(id -nG "$connecting") " != *" docker "* ]]; then
      usermod -aG docker "$connecting"
      CHANGED+=("added ${connecting} to the docker group")
      echo "    added ${connecting} to the docker group"
    fi

    have="$(docker compose version --short 2>/dev/null || true)"
    if [[ "v${have#v}" == "$COMPOSE_VERSION" ]]; then
      echo "    Compose plugin already at ${COMPOSE_VERSION}"
    else
      echo "==> Installing the Compose plugin ${COMPOSE_VERSION}"
      work="$(mktemp -d)"
      curl -fsSL "$COMPOSE_URL" -o "${work}/docker-compose" \
        || refuse "the Compose plugin could not be downloaded from ${COMPOSE_URL}"
      if ! printf '%s  %s\n' "$COMPOSE_SHA256" "${work}/docker-compose" \
           | sha256sum -c --quiet - >/dev/null 2>&1; then
        refuse "the downloaded Compose plugin does not match the pinned SHA-256 (pinned ${COMPOSE_SHA256}, downloaded $(sha256sum "${work}/docker-compose" | cut -d' ' -f1)); it was not installed"
      fi
      install -d -m 755 -o root -g root "$PLUGIN_DIR"
      install -m 755 -o root -g root "${work}/docker-compose" "${PLUGIN_DIR}/docker-compose"
      CHANGED+=("installed the Compose plugin ${COMPOSE_VERSION}")
      have="$(docker compose version --short 2>/dev/null || true)"
      [[ "v${have#v}" == "$COMPOSE_VERSION" ]] \
        || refuse "after the install docker compose reports '${have}', not ${COMPOSE_VERSION}"
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
    [[ -n "${APP_UID:-}" ]] || refuse "remote half requires APP_UID"
    [[ "$APP_UID" =~ ^[0-9]+$ ]] || refuse "APP_UID '${APP_UID}' is not a numeric account"
    install -d -m 750 -o "$APP_UID" -g "$APP_UID" "$DB_DIR"
    chown -R "${APP_UID}:${APP_UID}" "$DB_DIR"
    echo "    ${DB_DIR} owned ${APP_UID}:${APP_UID}"
    ;;

  *)
    refuse "unknown MODE '${MODE}'"
    ;;
esac

crr_finish
