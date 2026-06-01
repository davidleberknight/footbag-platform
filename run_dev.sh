#!/usr/bin/env bash
# run_dev.sh — local dev launcher.
# Installs deps if missing, reseeds DB if stale, launches web + image worker
# together, kills both cleanly on Ctrl+C.
#
# Usage:
#   ./run_dev.sh                  # code only — just run dev (no DB work; bootstraps if DB missing)
#   ./run_dev.sh --reset          # fast reset from committed seeds
#   ./run_dev.sh --from-csv       # full enrichment rebuild (deploy-parity, no mirror)
#   ./run_dev.sh --soup-to-nuts   # everything on: mirror rebuild + media + personas + dev-admins (--no-* to opt out)

set -euo pipefail
cd "$(dirname "$0")"

# Pin the env identity for the dev stack. config.footbagEnv (src/config/env.ts)
# gates dev-only shortcuts on this value: the .local/initial-admins.txt reader,
# the Tier-2 invariant repair, the persona harness (seed + /dev/switch), and
# the boot-time guards for the FOOTBAG_DEV_* env vars. Without this export the
# dev shortcuts silently no-op. Staging/production set FOOTBAG_ENV via
# /srv/footbag/env on the host; the dev workstation has no host env file, so
# the launcher exports here. `dotenv` does not override existing env vars, so a
# stray .env entry won't clobber this.
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
SEED_TEST_PERSONAS=0
NO_MEDIA=0
NO_PERSONAS=0
NO_DEV_ADMINS=0
for arg in "$@"; do
  case "$arg" in
    --reset)               RESET=1 ;;
    --from-csv)            FROM_CSV=1 ;;
    --soup-to-nuts)        SOUP_TO_NUTS=1 ;;
    --seed-dev-admins)     SEED_DEV_ADMINS=1 ;;
    --seed-test-personas)  SEED_TEST_PERSONAS=1 ;;
    --no-media)            NO_MEDIA=1 ;;
    --no-personas)         NO_PERSONAS=1 ;;
    --no-dev-admins)       NO_DEV_ADMINS=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./run_dev.sh [MODE] [--seed-dev-admins] [--seed-test-personas]
                    [--no-media] [--no-personas] [--no-dev-admins]

Local dev launcher.

Default (no flags): just run the dev stack — code only. No DB rebuild, no
reseed. If database/footbag.db is missing, bootstrap with --reset first.

DB rebuild modes (mutually exclusive; opt-in only):
  --reset          Fast reset from committed seeds.
                   Calls scripts/reset-local-db.sh.
  --from-csv       Full clean rebuild from committed canonical CSVs (drops
                   the DB file, reapplies schema, runs all enrichment
                   phases). Matches what deploy_to_aws.sh ships locally.
                   Calls scripts/deploy-local-data.sh --from-csv.
  --soup-to-nuts   "Everything on": full clean rebuild from the legacy mirror
                   (drops the DB file, regenerates canonical_input CSVs, runs
                   all enrichment phases; wipes modern operator tables —
                   members, votes, ballots, news_items, audit_entries, ...),
                   plus curated media, the persona-catalog seed, and the
                   dev-admin seed. Opt out per axis with --no-media /
                   --no-personas / --no-dev-admins. Requires
                   legacy_data/mirror_footbag_org/ to be present.
                   Calls scripts/deploy-local-data.sh --soup-to-nuts.

Opt-outs (only valid with --soup-to-nuts):
  --no-media       Skip the curator media seed (exports CURATOR_SEED=no).
  --no-personas    Skip the canonical persona-catalog seed.
  --no-dev-admins  Skip the dev-admin account seed.

Dev-admin seeding (CUTOVER-REMOVE; opt-in; combinable with any rebuild mode):
  --seed-dev-admins Reads .local/dev-admin-seed.json (JSONC-tolerant,
                   gitignored, per-maintainer) and seeds maintainer admin
                   accounts via scripts/manage-dev-admin-seed.sh. Runs
                   after DB bootstrap, before the dev stack starts. Fails
                   loudly if no seed input is present.

Test-data personas (CUTOVER-REMOVE; opt-in; combinable with any rebuild mode):
  --seed-test-personas Seeds the canonical persona catalog (plus the optional
                   per-developer .local/test-personas.json) via
                   scripts/manage-test-personas.sh. Idempotent. Switch between
                   them in a browser at http://localhost:3000/dev/switch?as=<slug>.

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

# The --no-* opt-outs only make sense with --soup-to-nuts (the only mode that
# turns these axes on by default). Anywhere else they are already off, so a
# stray --no-* is almost certainly a mistake — fail loud (mirrors
# scripts/deploy-to-aws.sh).
if (( SOUP_TO_NUTS == 0 )); then
  for _pair in "--no-media:$NO_MEDIA" "--no-personas:$NO_PERSONAS" "--no-dev-admins:$NO_DEV_ADMINS"; do
    if (( ${_pair#*:} == 1 )); then
      echo "ERROR: ${_pair%%:*} is only meaningful with --soup-to-nuts (these axes are off by default otherwise)." >&2
      exit 1
    fi
  done
fi

# --soup-to-nuts is "everything on": the DB rebuild below plus curated media,
# persona seed, and dev-admin seed, each opt-out via --no-*. Curated media rides
# the DB rebuild via the curator seed in scripts/reset-local-db.sh; --no-media
# skips it by exporting CURATOR_SEED=no (inherited through deploy-local-data.sh).
if (( SOUP_TO_NUTS == 1 )); then
  (( NO_PERSONAS == 1 )) || SEED_TEST_PERSONAS=1
  # Dev-admin seed under --soup-to-nuts is best-effort: auto-enable it only when
  # .local/dev-admin-seed.json actually has entries. Explicit --seed-dev-admins
  # (already SEED_DEV_ADMINS=1 here) keeps its strict refuse-to-no-op behavior,
  # so a clean rebuild never aborts just because a developer has no seed file.
  if (( NO_DEV_ADMINS == 0 && SEED_DEV_ADMINS == 0 )); then
    _n=$(grep -v '^[[:space:]]*//' .local/dev-admin-seed.json 2>/dev/null \
           | jq 'if type=="array" then length else 0 end' 2>/dev/null || echo 0)
    if [[ "${_n:-0}" -gt 0 ]]; then
      SEED_DEV_ADMINS=1
    else
      echo "→ Skipping dev-admin seed under --soup-to-nuts (no entries in .local/dev-admin-seed.json; pass --seed-dev-admins to require it)."
    fi
  fi
  if (( NO_MEDIA == 1 )); then
    export CURATOR_SEED=no
  fi
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
  # Code-only schema-sync: a bare dev run launches against the existing
  # database/footbag.db (the file the local dev container mounts). If schema.sql
  # has moved ahead of that DB, app code may crash on a missing table/column.
  # There is no in-place migration; offer a reset (reapplies schema). Git state
  # is irrelevant — compare against the actual local DB. Best-effort: skipped if
  # the sqlite3 CLI is unavailable.
  _did_reset=0
  if [[ "${FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK:-}" != "1" ]] && command -v sqlite3 >/dev/null 2>&1; then
    _schema_fp_query="SELECT m.name || '|' || p.name
                      FROM sqlite_schema m JOIN pragma_table_info(m.name) p
                      WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'
                      ORDER BY 1;"
    _exp_db=$(mktemp -t schema_expect.XXXXXX.db)
    _expected_fp=""
    if sqlite3 "${_exp_db}" < database/schema.sql >/dev/null 2>&1; then
      _expected_fp=$(sqlite3 "${_exp_db}" "${_schema_fp_query}" 2>/dev/null || true)
    fi
    rm -f "${_exp_db}" "${_exp_db}-wal" "${_exp_db}-shm"
    _actual_fp=$(sqlite3 database/footbag.db "${_schema_fp_query}" 2>/dev/null || true)
    if [[ -n "$_expected_fp" && -n "$_actual_fp" && "$_expected_fp" != "$_actual_fp" ]]; then
      echo "" >&2
      echo "WARNING: database/schema.sql differs from your local database/footbag.db schema." >&2
      echo "         Running code-only against a stale DB may crash on a missing table/column." >&2
      echo "         There is no in-place migration; a reset reapplies the schema." >&2
      if [[ "${FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT:-}" == "1" ]]; then
        echo "  FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT=1 → proceeding without reset." >&2
      elif [[ -r /dev/tty ]]; then
        printf "  Reset the local DB now (reapply schema)? [Y/n] " >&2
        read -r _ans </dev/tty || _ans=""
        if [[ -z "$_ans" || "$_ans" =~ ^[Yy] ]]; then
          echo "→ Resetting local DB..."
          bash scripts/reset-local-db.sh
          _did_reset=1
        else
          echo "  → Proceeding against the existing DB at your own risk." >&2
        fi
      else
        echo "  → Non-interactive; proceeding. Set FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT=1 to silence." >&2
      fi
    fi
  fi
  if (( _did_reset == 0 )); then
    echo "→ Skipping DB work (use --reset, --from-csv, or --soup-to-nuts to rebuild)."
  fi
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

# CUTOVER-REMOVE: optional test-data persona seed. Runs after DB bootstrap so
# the harness has a database to insert against. Refuses on production
# (manage-test-personas.sh enforces); allowed on development and staging.
if (( SEED_TEST_PERSONAS == 1 )); then
  echo "→ Seeding test-data personas..."
  bash scripts/manage-test-personas.sh --seed-test-personas
fi

# 5. Launch web + image together; trap-based cleanup is in scripts/dev.sh.
exec bash scripts/dev.sh
