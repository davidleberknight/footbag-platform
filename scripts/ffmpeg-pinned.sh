#!/usr/bin/env bash
# scripts/ffmpeg-pinned.sh -- runs production's pinned ffmpeg and ffprobe on a
# workstation or a CI runner, so every environment encodes with one version.
#
# Why this exists: production's ffmpeg is the one the image container installs
# (FFMPEG_VERSION in ops/tool-versions.env, `apk add ffmpeg=<pin>` on the
# pinned base in docker/image/Dockerfile). A workstation's or runner's apt
# ffmpeg is another version, so a transcode, a test or a data tool run there
# proves nothing about production. This builds one small image from the same
# base and the same package pin, and runs ffmpeg inside it as the caller.
#
# Two modes:
#   --install <bin-dir>  build the image (once per pin) and put `ffmpeg` and
#                        `ffprobe` wrappers in <bin-dir>, which must come first
#                        on the PATH; workstation setup and the CI installer
#                        call this.
#   ffmpeg|ffprobe ARGS  run that tool in the image with ARGS, as the calling
#                        user, with /tmp, the home directory and the working
#                        directory mounted at the same paths, so every path an
#                        argument names resolves unchanged.
#
# The encoder's ceiling: production's image worker kills a stuck ffmpeg after
# FFMPEG_TIMEOUT_SECONDS. Killing this script's docker client would leave the
# encoder running in its container, so the same ceiling is applied inside the
# container as a hard kill. The default is read from the app's own constant
# (DEFAULT_FFMPEG_TIMEOUT_MS in src/lib/videoProcessing.ts), never copied here.
#
# A lost exit: on some Docker hosts (a WSL2 workstation is one) a container's
# process ends but the engine never records it, so `docker run` waits on a
# container that is doing nothing until the caller's ceiling kills it, and the
# encode that succeeded is reported as a timeout. So the runner does not rely
# on Docker's exit alone: the container writes the tool's exit code to a status
# file under /tmp, and once that file exists and the client has still not
# returned after a grace period (FOOTBAG_FFMPEG_EXIT_GRACE_SECONDS, default 10),
# the runner removes the container (bounded by FOOTBAG_FFMPEG_RM_TIMEOUT_SECONDS,
# default 20) and exits with the recorded code. Each container is named, so an
# interrupt, or a client that dies on its own, removes it too; and a run that
# records no result at all is ended at the runner's own deadline (exit 124).
#
# What it refuses to do: run when the image for the pinned version has not been
# built (it says to run the install), or install a build whose ffmpeg reports a
# version other than the pin.
#
# Test seam (announced on stderr): FOOTBAG_FFMPEG_DOCKER replaces docker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"

DOCKER="${FOOTBAG_FFMPEG_DOCKER:-docker}"
[[ -n "${FOOTBAG_FFMPEG_DOCKER:-}" ]] \
  && echo "SYNTHETIC: FOOTBAG_FFMPEG_DOCKER is set -- this run proves nothing about this machine." >&2

tool_pins_ok FFMPEG_VERSION || exit 1
tool_pin FFMPEG_VERSION
PIN="$TOOL_PIN_VALUE"
IMAGE="footbag-ffmpeg:${PIN}"

if [[ "${1:-}" == "--install" ]]; then
  BIN_DIR="${2:-}"
  [[ -n "$BIN_DIR" ]] || { echo "Usage: bash scripts/ffmpeg-pinned.sh --install <bin-dir>" >&2; exit 2; }
  BASE_IMAGE="$(sed -n 's/^FROM \(node:[^ ]*@sha256:[0-9a-f]\{64\}\) AS runtime$/\1/p' \
    "${REPO_ROOT}/docker/image/Dockerfile" | head -1)"
  [[ -n "$BASE_IMAGE" ]] || { echo "ERROR: no digest-pinned runtime base found in docker/image/Dockerfile." >&2; exit 1; }
  if ! "$DOCKER" image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "== Building ${IMAGE} on ${BASE_IMAGE%%@*} (apk add ffmpeg=${PIN})"
    printf 'FROM %s\nRUN apk add --no-cache ffmpeg=%s\n' "$BASE_IMAGE" "$PIN" \
      | "$DOCKER" build -t "$IMAGE" - >&2
  fi
  # The full installed list, not `apk info -v ffmpeg`: on this Alpine release
  # the latter prints the package's description and size, never its version.
  have="$("$DOCKER" run --rm --entrypoint sh "$IMAGE" -c 'apk info -v 2>/dev/null' \
    | sed -n 's/^ffmpeg-\([0-9][^ ]*\)$/\1/p' | head -1 || true)"
  if [[ "$have" != "$PIN" ]]; then
    echo "ERROR: ${IMAGE} holds ffmpeg ${have:-of no version}; the version list pins ${PIN}. Nothing installed." >&2
    exit 1
  fi
  mkdir -p "$BIN_DIR"
  for tool in ffmpeg ffprobe; do
    printf '#!/usr/bin/env bash\nexec bash %q %s "$@"\n' "${SCRIPT_DIR}/ffmpeg-pinned.sh" "$tool" \
      > "${BIN_DIR}/${tool}"
    chmod 755 "${BIN_DIR}/${tool}"
  done
  echo "installed ffmpeg and ffprobe ${PIN} (via ${IMAGE}) into ${BIN_DIR}"
  exit 0
fi

TOOL="${1:-}"
case "$TOOL" in
  ffmpeg|ffprobe) shift ;;
  *) echo "Usage: bash scripts/ffmpeg-pinned.sh {--install <bin-dir> | ffmpeg|ffprobe [args...]}" >&2; exit 2 ;;
esac

if ! "$DOCKER" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "ERROR: the pinned ffmpeg image ${IMAGE} is not built here." >&2
  echo "       Run: bash scripts/setup-dev-workstation.sh   (or scripts/ffmpeg-pinned.sh --install <bin-dir>)" >&2
  exit 1
fi

default_ms="$(sed -n 's/^export const DEFAULT_FFMPEG_TIMEOUT_MS = \([0-9_]*\);.*/\1/p' \
  "${REPO_ROOT}/src/lib/videoProcessing.ts" | tr -d _)"
[[ "$default_ms" =~ ^[0-9]+$ ]] || { echo "ERROR: cannot read DEFAULT_FFMPEG_TIMEOUT_MS from src/lib/videoProcessing.ts." >&2; exit 1; }
CEILING="${FFMPEG_TIMEOUT_SECONDS:-$(( default_ms / 1000 ))}"
# Zero is refused: `timeout 0` means no limit at all.
[[ "$CEILING" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: FFMPEG_TIMEOUT_SECONDS must be a positive whole number of seconds." >&2; exit 2; }

# The same paths inside as outside, each mounted once.
MOUNTS=()
declare -A seen=()
for dir in /tmp "${HOME:-}" "$PWD"; do
  [[ -n "$dir" && -d "$dir" && -z "${seen[$dir]:-}" ]] || continue
  seen[$dir]=1
  MOUNTS+=(-v "${dir}:${dir}")
done

GRACE="${FOOTBAG_FFMPEG_EXIT_GRACE_SECONDS:-10}"
RM_TIMEOUT="${FOOTBAG_FFMPEG_RM_TIMEOUT_SECONDS:-20}"
[[ "$GRACE" =~ ^[0-9]+$ && "$RM_TIMEOUT" =~ ^[1-9][0-9]*$ ]] \
  || { echo "ERROR: FOOTBAG_FFMPEG_EXIT_GRACE_SECONDS must be a whole number of seconds and FOOTBAG_FFMPEG_RM_TIMEOUT_SECONDS a positive one." >&2; exit 2; }
# The runner's own last resort, for a container that ends without recording a
# result (its shell killed) and whose exit Docker also loses: nothing else would
# ever end the wait, and not every caller has a watchdog of its own.
DEADLINE=$(( CEILING + GRACE + 10 ))

NAME="footbag-ffmpeg-$$-${RANDOM}${RANDOM}"
STATUS_DIR="$(mktemp -d /tmp/footbag-ffmpeg.XXXXXX)"
STATUS_FILE="${STATUS_DIR}/status"
CLIENT=""

# The caller's watchdog stops a stuck encode with SIGKILL, which no trap here
# can see. The docker client is given a parent-death signal so it dies with
# this script; otherwise it would outlive it, hold the caller's output pipe
# open, and the caller would learn of its timeout only when the container ended
# on its own. setpriv is util-linux; where it is missing the client runs
# without it and the in-container ceiling still ends the encode. A SIGKILL
# also leaves this run's status directory in /tmp, empty or holding one exit
# code; nothing reads it again.
PDEATH=()
command -v setpriv >/dev/null 2>&1 && PDEATH=(setpriv --pdeathsig KILL --)

# Bounded, because an engine that lost an exit can hang the removal as well.
remove_container() {
  local out
  if out="$(timeout "$RM_TIMEOUT" "$DOCKER" rm -f "$NAME" 2>&1)"; then
    return 0
  fi
  echo "WARNING: container ${NAME} could not be removed (${out:-docker rm did not answer within ${RM_TIMEOUT}s}); restarting the Docker service clears it." >&2
}

# Ends a docker client still waiting and removes its container, so neither an
# interrupt nor a lost exit leaves an encoder or a stuck container behind. The
# container goes first: removing it ends the client's streams, so output the
# client still holds is delivered before the client itself is killed.
stop_client() {
  set +e
  if [[ -n "$CLIENT" ]] && kill -0 "$CLIENT" 2>/dev/null; then
    remove_container
    kill -KILL "$CLIENT" 2>/dev/null
    wait "$CLIENT" 2>/dev/null
  fi
  CLIENT=""
}
# A second interrupt during cleanup must not abandon the removal half done.
cleanup() { trap '' INT TERM HUP; stop_client; rm -rf "$STATUS_DIR"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Inside the container: run the tool under the ceiling, then record its exit
# code where the host can read it without asking Docker. A ceiling kill exits
# 137 (128 + SIGKILL), measured on the pinned image. A failed write is said
# aloud, since it switches off the lost-exit recovery for this run.
IN_CONTAINER='status=$1; ceiling=$2; shift 2; timeout -s KILL "$ceiling" "$@"; rc=$?; echo "$rc" > "$status" || echo "ffmpeg-pinned: could not record the exit status in $status" >&2; exit "$rc"'

started=$SECONDS
"${PDEATH[@]}" "$DOCKER" run --rm -i --name "$NAME" --user "$(id -u):$(id -g)" "${MOUNTS[@]}" -w "$PWD" \
  --entrypoint sh "$IMAGE" -c "$IN_CONTAINER" ffmpeg-pinned "$STATUS_FILE" "$CEILING" "$TOOL" "$@" <&0 &
CLIENT=$!

seen_at=""
while kill -0 "$CLIENT" 2>/dev/null; do
  if (( SECONDS - started >= DEADLINE )); then
    echo "ERROR: ${TOOL} in ${NAME} recorded no result within ${DEADLINE}s, past its ${CEILING}s ceiling; removing the container." >&2
    stop_client
    exit 124
  fi
  if [[ -s "$STATUS_FILE" ]]; then
    seen_at="${seen_at:-$SECONDS}"
    if (( SECONDS - seen_at >= GRACE )); then
      recorded="$(<"$STATUS_FILE")"
      [[ "$recorded" =~ ^[0-9]+$ ]] || recorded=1
      echo "WARNING: Docker did not record the exit of ${NAME}; ${TOOL} ended with status ${recorded}, so the container is being removed." >&2
      stop_client
      exit "$recorded"
    fi
  fi
  sleep 0.1
done

rc=0
wait "$CLIENT" || rc=$?
CLIENT=""
# A client that failed without the tool recording a result may have died on its
# own (a dropped daemon connection, a kill) with the container still encoding,
# or Docker may have refused to start it; remove only a container that exists.
if (( rc != 0 )) && [[ ! -s "$STATUS_FILE" ]]; then
  present="$(timeout "$RM_TIMEOUT" "$DOCKER" ps -aq --filter "name=^${NAME}\$" 2>&1)" || present="unknown"
  [[ -z "$present" ]] || remove_container
fi
exit "$rc"
