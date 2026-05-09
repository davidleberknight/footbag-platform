#!/usr/bin/env bash
# run_dev.sh — local dev launcher.
# Installs deps if missing, reseeds DB if stale, launches web + image worker
# together, kills both cleanly on Ctrl+C.
#
# Usage:
#   ./run_dev.sh                  # smart: skip reset if DB up to date
#   ./run_dev.sh --reset          # fast reset from committed seeds
#   ./run_dev.sh --from-csv       # full enrichment rebuild (deploy-parity, no mirror)
#   ./run_dev.sh --soup-to-nuts   # full rebuild from legacy mirror (clean slate)

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
FROM_CSV=0
SOUP_TO_NUTS=0
for arg in "$@"; do
  case "$arg" in
    --reset)         RESET=1 ;;
    --from-csv)      FROM_CSV=1 ;;
    --soup-to-nuts)  SOUP_TO_NUTS=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./run_dev.sh [MODE]

Local dev launcher.

DB rebuild modes (mutually exclusive; default = smart-skip via mtime):
  --reset          Fast reset from committed seeds.
                   Calls scripts/reset-local-db.sh.
  --from-csv       Full clean rebuild from committed canonical CSVs (drops
                   the DB file, reapplies schema, runs all enrichment
                   phases). Matches what deploy_to_aws.sh ships locally.
                   Calls scripts/deploy-local-data.sh --from-csv.
  --soup-to-nuts   Full clean rebuild from the legacy mirror (drops the DB
                   file, regenerates canonical_input CSVs, runs all
                   enrichment phases). Wipes modern operator tables
                   (members, votes, ballots, news_items, audit_entries, ...).
                   Requires legacy_data/mirror_footbag_org/ to be present.
                   Calls scripts/deploy-local-data.sh --soup-to-nuts.

  -h, --help       Show this message.

After --soup-to-nuts, working tree may show diffs in
legacy_data/event_results/canonical_input/, legacy_data/inputs/name_variants.csv,
and legacy_data/seed/. Review with 'git status' before pushing.
USAGE
      exit 0
      ;;
    *) echo "unknown arg: $arg"; exit 1 ;;
  esac
done

# Mutex: at most one rebuild mode.
if (( RESET + FROM_CSV + SOUP_TO_NUTS > 1 )); then
  echo "ERROR: --reset, --from-csv, and --soup-to-nuts are mutually exclusive." >&2
  exit 1
fi

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

# 3. DB seed.
# --from-csv / --soup-to-nuts always rebuild and bypass the mtime smart-skip.
if (( SOUP_TO_NUTS == 1 )); then
  echo "→ Soup-to-nuts rebuild from legacy mirror..."
  bash scripts/deploy-local-data.sh --soup-to-nuts
  echo ""
  echo "NOTE: --soup-to-nuts regenerated committed files. Working tree may now show diffs in:"
  echo "      legacy_data/event_results/canonical_input/, legacy_data/inputs/name_variants.csv,"
  echo "      legacy_data/seed/. Review with 'git status' before pushing."
elif (( FROM_CSV == 1 )); then
  echo "→ Full enrichment rebuild from canonical CSVs (deploy-parity)..."
  bash scripts/deploy-local-data.sh --from-csv
elif [[ "$RESET" == "1" ]] \
   || [[ ! -f database/footbag.db ]] \
   || [[ database/schema.sql -nt database/footbag.db ]]; then
  echo "→ Resetting local DB..."
  bash scripts/reset-local-db.sh
else
  echo "→ DB up to date; refreshing FH/curator content (run with --reset, --from-csv, or --soup-to-nuts to force a rebuild)."
  scripts/.venv/bin/python3 scripts/seed_fh_curator.py --db ./database/footbag.db --media-dir ./data/media
fi

# 4. Launch web + image together; trap-based cleanup is in scripts/dev.sh.
exec bash scripts/dev.sh
