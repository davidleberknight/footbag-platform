#!/usr/bin/env bash
# Root-side body of scripts/copy-production-db.sh. Never run directly: it runs
# as root because its wrapper pipes it into sudo, and it expects the closing
# report's remote library on the same stream just ahead of it.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     cat scripts/lib/closing-report-remote.sh scripts/internal/copy-production-db-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# Builds a copy of this host's live database beside it, in a directory only the
# database's own owner can enter, by running the copy builder once in a
# throwaway web container. The builder takes an online backup, so the live
# database is only read and the site keeps serving. It writes into a build
# file, and only a build that ends on the builder's own "production-copy: ok"
# line replaces the copy: the finished file is moved over the previous one in
# one rename, so a copy is replaced, never patched, and an interrupted or
# refused run leaves the previous copy as it was.
#
# The build file and the builder's snapshot hold member data, and the snapshot
# still holds every credential, so both are removed on every exit, interrupts
# included. The finished copy is left on this host; nothing here moves it.
#
# Refuses, before building:
#   - a host with no live database;
#   - less free space than three times the live database's size, which a
#     snapshot, a build and the previous copy can take at once.
#
# Test seams, each announced on stderr because a stubbed run proves nothing
# about the estate:
#   COPY_SRV_DIR       the host root in place of /srv/footbag
#   COPY_COMPOSE_BIN   the program run in place of docker

set -euo pipefail

SRV="${COPY_SRV_DIR:-/srv/footbag}"
COMPOSE_BIN="${COPY_COMPOSE_BIN:-docker}"
[[ -n "${COPY_SRV_DIR:-}" ]] && echo "SYNTHETIC: COPY_SRV_DIR='${COPY_SRV_DIR}' -- this run proves nothing about the estate." >&2
[[ -n "${COPY_COMPOSE_BIN:-}" ]] && echo "SYNTHETIC: COPY_COMPOSE_BIN='${COPY_COMPOSE_BIN}' -- this run proves nothing about the estate." >&2

ENV_PATH="${SRV}/env"
COMPOSE_DIR="${SRV}/docker"
DB_DIR="${SRV}/db"
LIVE_DB="${DB_DIR}/footbag.db"
COPY_DIR="${DB_DIR}/production-copy"
BUILD="${COPY_DIR}/build.db"
COPY="${COPY_DIR}/footbag-copy.db"

# What the containers see at the host's database directory.
CONTAINER_DB_DIR=/app/db

remove_build_files() {
  local f
  for f in "$BUILD" "$BUILD-wal" "$BUILD-shm" "$BUILD-journal" "$COPY_DIR"/snapshot-*.db*; do
    [[ -e "$f" ]] || continue
    if command -v shred >/dev/null 2>&1; then shred -u "$f"; else rm -f "$f"; fi
  done
}
trap remove_build_files EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if [[ ! -s "$LIVE_DB" ]]; then
  crr_error "no live database at ${LIVE_DB}, so there is nothing to copy."
  crr_finish
fi

owner="$(stat -c '%u:%g' "$DB_DIR")"
install -d -m 0700 -o "${owner%:*}" -g "${owner#*:}" "$COPY_DIR"
# A build or snapshot an earlier run left behind is never resumed: a copy is
# built whole or not at all.
remove_build_files

# The live database's size counts its write-ahead log, which a snapshot folds
# in. The site keeps writing to the same disk throughout, so the room the copy
# needs is three times that size plus a reserve the site keeps for itself.
SITE_RESERVE_KB=$((512 * 1024))
live_files=("$LIVE_DB")
[[ -e "$LIVE_DB-wal" ]] && live_files+=("$LIVE_DB-wal")
live_kb="$(du -kc "${live_files[@]}" | sed -n '$p' | cut -f1)"
free_kb="$(df -Pk "$DB_DIR" | sed -n '2p' | tr -s ' ' | cut -d' ' -f4)"
need_kb=$((3 * live_kb + SITE_RESERVE_KB))
if (( free_kb < need_kb )); then
  crr_error "only ${free_kb} KB free in ${DB_DIR}; the copy needs ${need_kb} KB: three times the live database's ${live_kb} KB, plus ${SITE_RESERVE_KB} KB left for the site."
  crr_finish
fi

echo "==> building the copy from ${LIVE_DB}"
# At the lowest CPU and disk priority, so the site it shares the host with
# keeps serving first; and from the deployed image only, never one built or
# pulled here.
build_started=$SECONDS
build_status=0
build_out="$(nice -n 19 ionice -c 3 "$COMPOSE_BIN" compose --env-file "$ENV_PATH" \
    -f "${COMPOSE_DIR}/docker-compose.yml" \
    -f "${COMPOSE_DIR}/docker-compose.prod.yml" \
    run --rm --no-deps --pull never -T \
    -e "FOOTBAG_DB_PATH=${CONTAINER_DB_DIR}/production-copy/build.db" \
    web node dist/runProductionCopy.js --source "${CONTAINER_DB_DIR}/footbag.db" </dev/null 2>&1)" \
  || build_status=$?
[[ -n "$build_out" ]] && printf '%s\n' "$build_out"
echo "COPY_BUILD_SECONDS=$((SECONDS - build_started))"

while IFS= read -r line; do
  crr_error "the copy builder ${line#production-copy: }"
done < <(grep -E '^production-copy: (refused|failed):' <<<"$build_out" || [[ $? == 1 ]])

if (( build_status != 0 )) || ! grep -qx 'production-copy: ok' <<<"$build_out"; then
  crr_error "the copy builder did not finish (exit ${build_status}); the previous copy, if any, is unchanged."
  crr_finish
fi
if [[ ! -s "$BUILD" ]]; then
  crr_error "the copy builder reported success but left no file at ${BUILD}; the previous copy, if any, is unchanged."
  crr_finish
fi

chmod 0600 "$BUILD"
mv -f "$BUILD" "$COPY"
echo "COPY_PATH=${COPY}"
echo "COPY_BYTES=$(stat -c '%s' "$COPY")"
crr_finish
