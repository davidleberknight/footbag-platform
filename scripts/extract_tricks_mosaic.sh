#!/usr/bin/env bash
#
# Extract the 12 foundational-trick loops for the homepage mosaic from the PassBack
# "How to Identify & Name Freestyle Footbag Tricks" tutorial. Produces one
# mosaic-<slug>.mp4 (plus a poster frame) per core atom, named to match what the
# homepage loader expects (source_filename = mosaic-<slug>.mp4). Intended to run on
# a workstation with yt-dlp + ffmpeg; it does not run in the sandbox and writes
# only to a scratch output directory, never into the repo.
#
set -euo pipefail

# Default recovered from the curated PassBack tutorial media row; override via the
# environment if the stored source ever changes. Do not extrapolate a new URL.
SOURCE_URL="${SOURCE_URL:-https://www.youtube.com/watch?v=ft9SZPyXd54}"
OUT_DIR="${OUT_DIR:-./tricks-mosaic-clips}"
SOURCE_FILE="${SOURCE_FILE:-${OUT_DIR}/source.mp4}"
# Framing/scale + encode knobs, sized for small mosaic tiles (light files, not
# archival). CROP center-crops to a square and scales it; CRF and FPS trade
# quality for file size. All overridable via env (e.g. CROP='' keeps the source
# framing, CRF=20 for higher quality).
CROP="${CROP:--vf crop=in_h:in_h,scale=360:360}"
CRF="${CRF:-28}"
FPS="${FPS:-30}"

if [[ -z "${SOURCE_URL}" ]]; then
  echo "SOURCE_URL is required." >&2
  exit 2
fi
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found; install it first." >&2; exit 3; }

mkdir -p "${OUT_DIR}"

# slug  start  end   (positions within the source tutorial; ~3 repetitions each)
TRICKS=(
  "toe-stall 11:24 11:31"
  "clipper-stall 11:34 11:38"
  "around-the-world 11:39 11:49"
  "orbit 11:50 12:00"
  "legover 12:02 12:11"
  "mirage 12:12 12:25"
  "pickup 12:26 12:39"
  "illusion 12:40 12:52"
  "butterfly 12:54 13:06"
  "osis 13:07 13:17"
  "whirl 13:18 13:30"
  "swirl 13:31 13:40"
)

if [[ ! -f "${SOURCE_FILE}" ]]; then
  command -v yt-dlp >/dev/null 2>&1 || {
    echo "yt-dlp not found and ${SOURCE_FILE} missing; install yt-dlp or place the source at SOURCE_FILE." >&2
    exit 3
  }
  echo "Downloading source -> ${SOURCE_FILE}"
  yt-dlp -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4' -o "${SOURCE_FILE}" "${SOURCE_URL}"
fi

for entry in "${TRICKS[@]}"; do
  read -r slug start end <<< "${entry}"
  out="${OUT_DIR}/mosaic-${slug}.mp4"
  poster="${OUT_DIR}/mosaic-${slug}.jpg"
  echo "Extracting ${slug}: ${start} -> ${end}"
  # Both -ss and -to as input options take absolute source timestamps. Drop audio;
  # web-friendly H.264 + faststart so the loop starts instantly in the browser.
  # shellcheck disable=SC2086
  ffmpeg -y -ss "${start}" -to "${end}" -i "${SOURCE_FILE}" -an ${CROP} -r "${FPS}" \
    -c:v libx264 -crf "${CRF}" -preset slow -pix_fmt yuv420p -movflags +faststart "${out}"
  # shellcheck disable=SC2086
  ffmpeg -y -ss "${start}" -i "${SOURCE_FILE}" -frames:v 1 ${CROP} "${poster}"
done

echo "Done: ${#TRICKS[@]} clips in ${OUT_DIR} (mosaic-<slug>.mp4 + posters)."
echo "Next: curate each into the media lane with source_filename = mosaic-<slug>.mp4 to light up the homepage cells."
