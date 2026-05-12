#!/usr/bin/env bash
# run_dev.sh — local dev launcher.
# Installs deps if missing, reseeds DB if stale, launches web + image worker
# together, kills both cleanly on Ctrl+C.
#
# Usage:
#   ./run_dev.sh                  # just run dev (no DB work; bootstraps if DB missing)
#   ./run_dev.sh --reset          # fast reset from committed seeds
#   ./run_dev.sh --from-csv       # full enrichment rebuild (deploy-parity, no mirror)
#   ./run_dev.sh --soup-to-nuts   # full rebuild from legacy mirror (clean slate)

set -euo pipefail
cd "$(dirname "$0")"

# Pin the env identity for the dev stack. config.footbagEnv (src/config/env.ts)
# gates dev-only shortcuts on this value: applyDevAutologin, the
# .local/initial-admins.txt reader (devShortcuts.ts:154), the Tier-2 invariant
# repair, and the boot-time guards for FOOTBAG_DEV_AUTOLOGIN_* env vars. Without
# this export the dev shortcuts silently no-op. Staging/production set
# FOOTBAG_ENV via /srv/footbag/env on the host (deploy-rebuild-remote.sh:151);
# the dev workstation has no host env file, so the launcher exports here.
# `dotenv` does not override existing env vars, so a stray .env entry won't
# clobber this.
export FOOTBAG_ENV=development

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
SEED_DEV_ADMINS=0
for arg in "$@"; do
  case "$arg" in
    --reset)            RESET=1 ;;
    --from-csv)         FROM_CSV=1 ;;
    --soup-to-nuts)     SOUP_TO_NUTS=1 ;;
    --seed-dev-admins)  SEED_DEV_ADMINS=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./run_dev.sh [MODE] [--seed-dev-admins]

Local dev launcher.

Default (no flags): just run the dev stack. No DB rebuild, no reseed.
If database/footbag.db is missing, bootstrap with --reset first.

DB rebuild modes (mutually exclusive; opt-in only):
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

Dev-admin seeding (CUTOVER-REMOVE; opt-in; combinable with any rebuild mode):
  --seed-dev-admins Reads .local/dev-admin-seed.json (JSONC-tolerant,
                   gitignored, per-maintainer) and seeds maintainer admin
                   accounts via scripts/manage-dev-admin-seed.sh. Runs
                   after DB bootstrap, before the dev stack starts. Fails
                   loudly if no seed input is present.

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
# Default (no flag): no DB work. Bootstrap with --reset only if the DB file
# is missing entirely. Explicit --reset / --from-csv / --soup-to-nuts always
# rebuild.
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
elif [[ "$RESET" == "1" ]]; then
  echo "→ Resetting local DB..."
  bash scripts/reset-local-db.sh
elif [[ ! -f database/footbag.db ]]; then
  echo "→ database/footbag.db missing; bootstrapping with --reset..."
  bash scripts/reset-local-db.sh
else
  echo "→ Skipping DB work (use --reset, --from-csv, or --soup-to-nuts to rebuild)."
fi

# CUTOVER-REMOVE: optional dev-admin seed. Runs after DB bootstrap so the
# seed has rows to insert against. Refuses on production
# (manage-dev-admin-seed.sh enforces); allowed on development (the default
# here) and staging.
if (( SEED_DEV_ADMINS == 1 )); then
  # Pre-validate the dev seed JSON if present, parity with the staging
  # path (deploy_to_aws.sh validates .local/staging-admin-seed.json before
  # the SSH connection). A malformed JSON blob otherwise crashes the seed
  # mid-run after the DB bootstrap completes. JSONC tolerance: strip `//`
  # line comments before jq.
  if [[ -f .local/dev-admin-seed.json ]]; then
    if ! grep -v '^[[:space:]]*//' .local/dev-admin-seed.json | jq -e . >/dev/null 2>&1; then
      echo "ERROR: .local/dev-admin-seed.json is not valid JSON (after JSONC comment strip)." >&2
      echo "Recommendation: grep -v '^[[:space:]]*//' .local/dev-admin-seed.json | jq -e . to see the parse error." >&2
      exit 1
    fi
  fi
  echo "→ Seeding dev-admin accounts..."
  bash scripts/manage-dev-admin-seed.sh --seed-dev-admins
fi

# 5. Launch web + image together; trap-based cleanup is in scripts/dev.sh.
exec bash scripts/dev.sh
