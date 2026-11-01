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
    echo "==> Building ${IMAGE} on ${BASE_IMAGE%%@*} (apk add ffmpeg=${PIN})"
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
[[ "$CEILING" =~ ^[0-9]+$ ]] || { echo "ERROR: FFMPEG_TIMEOUT_SECONDS must be a whole number of seconds." >&2; exit 2; }

# The same paths inside as outside, each mounted once.
MOUNTS=()
declare -A seen=()
for dir in /tmp "${HOME:-}" "$PWD"; do
  [[ -n "$dir" && -d "$dir" && -z "${seen[$dir]:-}" ]] || continue
  seen[$dir]=1
  MOUNTS+=(-v "${dir}:${dir}")
done

exec "$DOCKER" run --rm -i --user "$(id -u):$(id -g)" "${MOUNTS[@]}" -w "$PWD" \
  --entrypoint timeout "$IMAGE" -s KILL "$CEILING" "$TOOL" "$@"
