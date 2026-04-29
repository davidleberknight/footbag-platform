#!/usr/bin/env bash
# run_dev.sh — local dev launcher.
# Installs deps if missing, reseeds DB if stale, launches web + image worker
# together, kills both cleanly on Ctrl+C.
#
# Usage:
#   ./run_dev.sh           # smart: skip reset if DB up to date
#   ./run_dev.sh --reset   # force a fresh DB reset

set -euo pipefail
cd "$(dirname "$0")"

# Free any port already held by a leaked prior dev process.
kill_port() {
  local port=$1
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti:"${port}" 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${port}/tcp" 2>/dev/null | tr -d ' ' || true)
  fi
  if [[ -n "$pids" ]]; then
    echo "→ Reclaiming port ${port} from PIDs: ${pids}"
    kill -TERM ${pids} 2>/dev/null || true
    sleep 1
    kill -KILL ${pids} 2>/dev/null || true
  fi
}
kill_port 3000
kill_port 4001

RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    -h|--help) echo "Usage: $0 [--reset]"; exit 0 ;;
    *) echo "unknown arg: $arg"; exit 1 ;;
  esac
done

# 1. npm deps
if [[ ! -d node_modules ]]; then
  echo "→ Installing npm deps..."
  npm install
fi

# 2. Python venv + requirements
if [[ ! -d scripts/.venv ]]; then
  echo "→ Creating Python venv..."
  python3 -m venv scripts/.venv
fi
scripts/.venv/bin/pip install -q -r scripts/requirements.txt

# 3. DB seed (if missing, stale, or --reset)
if [[ "$RESET" == "1" ]] \
   || [[ ! -f database/footbag.db ]] \
   || [[ database/schema.sql -nt database/footbag.db ]]; then
  echo "→ Resetting local DB..."
  bash scripts/reset-local-db.sh
else
  echo "→ DB up to date; refreshing curator media (run with --reset to force a full DB reset)."
  scripts/.venv/bin/python3 legacy_data/scripts/seed_curator_media.py --db ./database/footbag.db --media-dir ./data/media
fi

# 4. Launch web + image together; trap-based cleanup is in scripts/dev.sh.
exec bash scripts/dev.sh
