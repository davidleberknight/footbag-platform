#!/usr/bin/env bash
# Authorized footbag.org PRODUCTION mirror crawl — RESUME launcher.
#
# Use this after an interrupted crawl: it omits -fresh, so the crawler resumes
# from existing progress and does NOT wipe the mirror. Same password safety as
# the fresh launcher: the footbag.org password comes only from the hidden getpass
# prompt and never appears in argv, the environment, this script, shell history,
# the log, or any process argument. Videos are skipped (no --process-videos).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

unset FOOTBAG_MIRROR_STATE_DIR

MIRROR_DIR="$REPO_ROOT/legacy_data/mirror_footbag_org"
PROGRESS_FILE="$REPO_ROOT/legacy_data/mirror_progress.json"
LOG_FILE="$REPO_ROOT/legacy_data/mirror.log"

if [ ! -t 0 ] || [ ! -t 1 ]; then
  echo "REFUSING: not an interactive terminal. Run inside tmux in a real terminal so the hidden password prompt has a TTY." >&2
  exit 1
fi

if [ -n "${FOOTBAG_MIRROR_PASSWORD:-}" ]; then
  echo "REFUSING: FOOTBAG_MIRROR_PASSWORD is set. Unset it so the crawler uses the secure hidden getpass prompt (the password must not live in the environment)." >&2
  exit 1
fi

echo "=============================================================="
echo " Footbag.org PRODUCTION mirror crawl  —  RESUME (no -fresh)"
echo "=============================================================="
echo "  Repo root : $REPO_ROOT"
echo "  Username  : JLeberknight"
echo "  VIDEOS    : DISABLED (skipped; no --process-videos)."
echo "  Mirror    : $MIRROR_DIR   (kept; resumed, not wiped)"
echo "  Progress  : $PROGRESS_FILE (resumed)"
echo "  Log       : $LOG_FILE"
echo "=============================================================="
printf "Type 'yes' to RESUME the production crawl from existing progress: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted: confirmation was not 'yes'. Nothing was changed."
  exit 1
fi

echo "Resuming crawl. Enter the footbag.org password at the hidden prompt below."
set +e
legacy_data/.venv/bin/python \
  legacy_data/create_mirror_footbag_org.py \
  JLeberknight \
  -log
STATUS=$?
set -e
echo "--------------------------------------------------------------"
echo "Crawler exited with status: $STATUS"
exit "$STATUS"
