#!/usr/bin/env bash
# Authorized footbag.org PRODUCTION mirror crawl — FRESH START launcher.
#
# Run this interactively (inside tmux) for the INITIAL launch only. The crawler
# prompts for the footbag.org password with a hidden getpass prompt; the password
# never appears in argv, the environment, this script, shell history, the log, or
# any process argument. Videos are skipped (no --process-videos). -fresh wipes any
# existing partial mirror + progress before starting.
#
# After meaningful crawl progress exists, DO NOT re-run this script; use
# resume_production_mirror.sh instead (it omits -fresh).
set -euo pipefail

# Resolve the repo root from this script's own location (script lives in
# legacy_data/), then run from there so the crawler's default paths resolve.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Never relocate crawl state: production must write the legacy_data/ defaults, not
# a smoke/throwaway directory that may linger in the environment.
unset FOOTBAG_MIRROR_STATE_DIR

MIRROR_DIR="$REPO_ROOT/legacy_data/mirror_footbag_org"
PROGRESS_FILE="$REPO_ROOT/legacy_data/mirror_progress.json"
LOG_FILE="$REPO_ROOT/legacy_data/mirror.log"

# Safety: require a real terminal, so the hidden password prompt has a TTY. A
# non-interactive invocation is refused BEFORE any crawl or -fresh wipe.
if [ ! -t 0 ] || [ ! -t 1 ]; then
  echo "REFUSING: not an interactive terminal. Run inside tmux in a real terminal so the hidden password prompt has a TTY." >&2
  exit 1
fi

# Safety: the password must come only from the hidden prompt, never the env.
if [ -n "${FOOTBAG_MIRROR_PASSWORD:-}" ]; then
  echo "REFUSING: FOOTBAG_MIRROR_PASSWORD is set. Unset it so the crawler uses the secure hidden getpass prompt (the password must not live in the environment)." >&2
  exit 1
fi

echo "=============================================================="
echo " Footbag.org PRODUCTION mirror crawl  —  FRESH START"
echo "=============================================================="
echo "  Repo root : $REPO_ROOT"
echo "  Username  : JLeberknight"
echo "  VIDEOS    : DISABLED (skipped; no --process-videos). Pages, posters,"
echo "              thumbnails, captions, and links are still captured."
echo "  Mirror    : $MIRROR_DIR"
echo "  Progress  : $PROGRESS_FILE"
echo "  Log       : $LOG_FILE"
echo "  Mode      : -fresh  (WIPES the existing mirror + progress first)"
echo "--------------------------------------------------------------"
echo "  WARNING: -fresh DELETES the existing partial mirror and progress."
echo "  Use this launcher ONLY for the initial run. After real progress"
echo "  exists, use resume_production_mirror.sh (no -fresh)."
echo "=============================================================="
printf "Type 'yes' to start the FRESH production crawl: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted: confirmation was not 'yes'. Nothing was changed."
  exit 1
fi

echo "Starting crawl. Enter the footbag.org password at the hidden prompt below."
# Call the crawler directly (no pipe/redirect on stdin) so its getpass prompt
# keeps this terminal's TTY. Preserve and report the exit status.
set +e
legacy_data/.venv/bin/python \
  legacy_data/create_mirror_footbag_org.py \
  JLeberknight \
  -fresh \
  -log
STATUS=$?
set -e
echo "--------------------------------------------------------------"
echo "Crawler exited with status: $STATUS"
exit "$STATUS"
