#!/usr/bin/env bash
# deploy_to_aws.sh -- the only workstation-side AWS deploy entry point.
#
# Orchestrates: preflight (tools, ssh alias, disk, DB lock), credential pipe,
# pre-deploy summary, delegation to scripts/deploy-to-aws.sh.
#
# Reads ~/AWS/AWS_OPERATOR.txt exactly once via shell `<` redirection. The
# password never appears in any process's argv on the workstation. Forward
# scripts (orchestrator, leaves) consume stdin; none re-reads the file.

set -euo pipefail

# --help / -h short-circuits before any preflight or file read.
for arg in "$@"; do
  case "$arg" in
    --help|-h) exec bash scripts/deploy-to-aws.sh --help ;;
  esac
done

# -----------------------------------------------------------------------------
# Mode classification (drives mode-aware preflight skips below).
# -----------------------------------------------------------------------------
# Short combined flags (e.g. -rW) expand into their parts so the case below
# matches each independently.
EXPANDED_ARGS=()
for arg in "$@"; do
  if [[ "$arg" =~ ^-[a-zA-Z]{2,}$ && "$arg" != --* ]]; then
    for ((i = 1; i < ${#arg}; i++)); do
      EXPANDED_ARGS+=("-${arg:$i:1}")
    done
  else
    EXPANDED_ARGS+=("$arg")
  fi
done

MODE_CODE_ONLY=0   # -k / --keep-staging-db: no DB ops at all.
MODE_REUSE=0       # -r / --reuse-local-db: ship current ./database/footbag.db; no rebuild.
DB_REBUILD_INVOLVED=0   # default mode runs the full pipeline → DB rebuild.
SEED_DEV_ADMINS=0   # --seed-dev-admins: opt-in dev-admin seed after deploy (CUTOVER-REMOVE).

HAS_MODE=0
for arg in "${EXPANDED_ARGS[@]+"${EXPANDED_ARGS[@]}"}"; do
  case "$arg" in
    -k|--keep-staging-db)  MODE_CODE_ONLY=1; HAS_MODE=1 ;;
    -r|--reuse-local-db)   MODE_REUSE=1;     HAS_MODE=1 ;;
    --seed-dev-admins)     SEED_DEV_ADMINS=1 ;;
  esac
done
if (( HAS_MODE == 0 )); then
  DB_REBUILD_INVOLVED=1
fi

# DEPLOY_TARGET allowlist. Only two values are accepted: footbag-staging and
# footbag-production. Any other value (typo, alias confusion, copy-paste
# error like 'footbag-prod' or 'footbag-live') is refused at the entry
# point so a misconfigured operator alias cannot route the deploy to an
# unintended host. The corresponding SSH alias must exist in ~/.ssh/config;
# the alias-resolve preflight below will catch missing aliases.
case "${DEPLOY_TARGET:-footbag-staging}" in
  footbag-staging|footbag-production) ;;
  *)
    echo "ERROR: DEPLOY_TARGET must be 'footbag-staging' or 'footbag-production' (got '${DEPLOY_TARGET:-}')." >&2
    echo "Recommendation: set DEPLOY_TARGET=footbag-staging or DEPLOY_TARGET=footbag-production explicitly." >&2
    exit 1
    ;;
esac

# Production DB-replace hard-confirm gate. Any DB-touching mode against
# production requires a deliberate operator confirmation. DB-rebuild
# (default mode, no -k/-r flag) and reuse-local (-r) both REPLACE the
# on-host production database with the workstation-built file. -k
# (code-only) is permitted without this gate because it does not touch the
# DB. The gate fires here, before any preflight, so the operator sees the
# warning before incidental tools like ssh/jq/sqlite checks consume time.
if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-production" ]] \
    && (( DB_REBUILD_INVOLVED == 1 || MODE_REUSE == 1 )); then
  echo "" >&2
  echo "═══════════════════════════════════════════════════════════════" >&2
  echo "  PRODUCTION DB-TOUCHING DEPLOY" >&2
  echo "═══════════════════════════════════════════════════════════════" >&2
  echo "  Target:     footbag-production" >&2
  if (( MODE_REUSE == 1 )); then
    echo "  Mode:       reuse local DB (-r) — ships current ./database/footbag.db" >&2
  else
    echo "  Mode:       full rebuild from sources" >&2
  fi
  echo "  Effect:     The on-host production database will be REPLACED" >&2
  echo "              with the workstation-built file. This is irreversible" >&2
  echo "              without an off-host backup taken before the deploy." >&2
  echo "═══════════════════════════════════════════════════════════════" >&2
  echo "" >&2
  if [[ "${FOOTBAG_PROD_DB_REPLACE_ACK:-}" != "1" ]]; then
    # Detect TTY availability via [[ -t ]] tests against fds 0/1/2 BEFORE
    # attempting any read. Reading from /dev/tty can succeed even in
    # subprocess contexts by picking up buffered terminal input from
    # an earlier prompt the operator answered in the parent shell; that
    # makes a read-success/empty-result check unreliable. When none of
    # stdin/stdout/stderr is a TTY (Vitest spawnSync, CI runners,
    # systemd units), refuse with a clear message instead of prompting.
    if ! { [[ -t 0 ]] && [[ -t 1 ]] && [[ -t 2 ]]; }; then
      echo "" >&2
      echo "ERROR: production DB-replace requires interactive confirmation, but stdin/stdout/stderr are not all TTYs." >&2
      echo "Recommendation: run from a TTY, or set FOOTBAG_PROD_DB_REPLACE_ACK=1 to bypass (scripted runs only)." >&2
      exit 1
    fi
    printf "  Type 'REPLACE PRODUCTION DB' to confirm: " >&2
    if ! read -r _ack </dev/tty 2>/dev/null; then
      echo "" >&2
      echo "ERROR: production DB-replace requires interactive confirmation, but no TTY is available." >&2
      echo "Recommendation: run from a TTY, or set FOOTBAG_PROD_DB_REPLACE_ACK=1 to bypass (scripted runs only)." >&2
      exit 1
    fi
    if [[ "$_ack" != "REPLACE PRODUCTION DB" ]]; then
      echo "Aborted. Confirmation phrase did not match." >&2
      exit 1
    fi
    echo "  → Confirmed. Proceeding." >&2
    echo "" >&2
  else
    echo "  FOOTBAG_PROD_DB_REPLACE_ACK=1 → skipping interactive confirmation." >&2
  fi
fi

# CUTOVER-REMOVE: --seed-dev-admins is allowlisted to a single explicit
# deploy target: DEPLOY_TARGET=footbag-staging. Any other target is
# refused before the SSH connection. Defense in depth: seedConfig.ts still
# throws on import when FOOTBAG_ENV=production, but this is the first and
# most explicit guard.
if (( SEED_DEV_ADMINS == 1 )); then
  _seed_target="${DEPLOY_TARGET:-footbag-staging}"
  if [[ "$_seed_target" != "footbag-staging" ]]; then
    echo "ERROR: --seed-dev-admins is allowlisted to DEPLOY_TARGET=footbag-staging only (got '$_seed_target')." >&2
    echo "Recommendation: dev-admin shortcuts must never reach production or any other environment. Remove the flag, or set DEPLOY_TARGET=footbag-staging explicitly if you intended to seed staging." >&2
    exit 1
  fi
  if [[ -f .local/staging-admin-seed.json ]]; then
    if ! grep -v '^[[:space:]]*//' .local/staging-admin-seed.json | jq -e . >/dev/null 2>&1; then
      echo "ERROR: .local/staging-admin-seed.json is not valid JSON (after JSONC comment strip)." >&2
      echo "Recommendation: grep -v '^[[:space:]]*//' .local/staging-admin-seed.json | jq -e . to see the parse error." >&2
      exit 1
    fi
  fi
fi

# -----------------------------------------------------------------------------
# Preflight. Each check exits 1 with a one-line Recommendation. Mode-aware:
# skips checks irrelevant to the requested mode. Generic remediation strings;
# no on-disk credential paths are printed.
# -----------------------------------------------------------------------------
need_cmd() {
  local cmd="$1" pkg_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $cmd" >&2
    echo "Recommendation: $pkg_hint" >&2
    exit 1
  fi
}

# Universal tools.
need_cmd ssh    "Install OpenSSH client."
need_cmd rsync  "apt-get install -y rsync"
need_cmd docker "Install Docker (DEV_ONBOARDING -- container runtime install)."
need_cmd jq     "apt-get install -y jq"

# DB-touching modes need sqlite3 + (eventually, when prod activates) aws CLI.
if (( MODE_CODE_ONLY != 1 )); then
  need_cmd sqlite3 "apt-get install -y sqlite3"
  need_cmd aws     "Install AWS CLI v2 (see aws/install in this repo)."
fi

# Resolve the deploy target's SSH alias. The leaves derive FOOTBAG_ENV from
# the alias name; an unconfigured alias makes the deploy fail mid-flight with
# 'Could not resolve hostname'. Catch it here.
DEPLOY_TARGET="${DEPLOY_TARGET:-footbag-staging}"
# Avoid `awk ... exit` here: when awk exits before consuming all of ssh -G's
# output, the upstream `ssh -G` receives SIGPIPE and `set -o pipefail` then
# kills the wrapper with exit 141 before our own error message can print.
RESOLVED_HOST=$(ssh -G "$DEPLOY_TARGET" 2>/dev/null | awk '/^hostname / {print $2}' | tail -1)
if [[ -z "$RESOLVED_HOST" || "$RESOLVED_HOST" == "$DEPLOY_TARGET" ]]; then
  echo "ERROR: SSH alias '$DEPLOY_TARGET' is not configured (or resolves to itself)." >&2
  echo "Recommendation: add the deploy alias stanza to ~/.ssh/config." >&2
  exit 1
fi

# Workstation disk-space preflight: docker save tarballs + sqlite rebuild
# scratch can land 1-2 GB at peak.
WS_AVAIL_KB=$(df -k --output=avail . 2>/dev/null | tail -1 | tr -d ' ')
if [[ -n "$WS_AVAIL_KB" ]] && (( WS_AVAIL_KB < 2097152 )); then
  echo "ERROR: workstation has only ${WS_AVAIL_KB}K free in this directory; need >=2 GB." >&2
  echo "Recommendation: free disk (docker system prune -af; clear caches) and re-run." >&2
  exit 1
fi

# Local DB lock: a stuck `sqlite3` process or another tool holding the DB
# would let reset-local-db.sh's `rm -f` succeed but later loaders see a stale
# WAL. lsof is best-effort; we only fail if it's both available and reports
# active holders.
if (( (DB_REBUILD_INVOLVED == 1) || (MODE_REUSE == 1) )) && command -v lsof >/dev/null 2>&1; then
  if [[ -f database/footbag.db ]]; then
    _lock_holders=$(lsof -F pcR database/footbag.db 2>/dev/null || true)
    if [[ -n "$_lock_holders" ]]; then
      echo "ERROR: database/footbag.db is locked by another process." >&2
      echo "Holders:" >&2
      lsof database/footbag.db >&2 || true
      # Common case: local dev server (`tsx watch src/server.ts`) is running.
      _is_dev_server=0
      if pgrep -af 'tsx watch.*src/server\.ts' >/dev/null 2>&1 \
         || printf '%s\n' "$_lock_holders" | grep -qE '(tsx|src/server\.ts)'; then
        _is_dev_server=1
        echo "" >&2
        echo "Likely cause: local dev server is running (\`tsx watch src/server.ts\`)." >&2
      fi

      # Offer to kill the holders. Honors FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS=1
      # for non-interactive auto-yes (CI / cron). Reads from /dev/tty so the
      # credential-file stdin pipe at the end of this script is untouched.
      _do_kill=0
      if [[ "${FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS:-}" == "1" ]]; then
        echo "  FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS=1 → auto-killing." >&2
        _do_kill=1
      elif [[ -r /dev/tty ]]; then
        printf "  Kill the lock holder(s) now and continue? [y/N] " >&2
        read -r _ans </dev/tty || _ans=""
        [[ "${_ans:-}" =~ ^[Yy]$ ]] && _do_kill=1
      fi

      if (( _do_kill == 1 )); then
        echo "  → Killing lock holder(s)..." >&2
        # 1. Direct holders from lsof (covers any process, dev server or not).
        _holder_pids=$(lsof -t database/footbag.db 2>/dev/null | sort -u || true)
        for _pid in $_holder_pids; do
          kill -TERM "$_pid" 2>/dev/null || true
        done
        # 2. Dev watcher parent (regex bounded; matches only this app's watcher).
        if (( _is_dev_server == 1 )); then
          pkill -TERM -f 'tsx watch.*src/server\.ts' 2>/dev/null || true
        fi
        # Wait up to 5s for clean exit.
        for _i in 1 2 3 4 5; do
          sleep 1
          [[ -z "$(lsof -t database/footbag.db 2>/dev/null || true)" ]] && break
        done
        # Escalate if anyone still holds.
        if [[ -n "$(lsof -t database/footbag.db 2>/dev/null || true)" ]]; then
          for _pid in $_holder_pids; do
            kill -KILL "$_pid" 2>/dev/null || true
          done
          if (( _is_dev_server == 1 )); then
            pkill -KILL -f 'tsx watch.*src/server\.ts' 2>/dev/null || true
          fi
          sleep 1
        fi
        # Clean up stale WAL/SHM left behind by the killed process.
        rm -f database/footbag.db-wal database/footbag.db-shm
        # Re-verify before continuing.
        if [[ -n "$(lsof -t database/footbag.db 2>/dev/null || true)" ]]; then
          echo "ERROR: database/footbag.db is still locked after kill attempt." >&2
          lsof database/footbag.db >&2 || true
          exit 1
        fi
        echo "  → Lock cleared; continuing." >&2
      else
        echo "" >&2
        echo "Aborted. Manual fix:" >&2
        if (( _is_dev_server == 1 )); then
          echo "  pkill -f 'tsx watch.*src/server\\.ts' && rm -f database/footbag.db-wal database/footbag.db-shm" >&2
        else
          echo "  Stop the process(es) listed above, then re-run." >&2
        fi
        echo "  Or set FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS=1 to auto-kill on lock conflict." >&2
        exit 1
      fi
    fi
  fi
fi

# Schema-drift preflight: catch the case where database/schema.sql evolved
# (column added, table added) since database/footbag.db was last rebuilt.
# Default mode (full pipeline csv_only) appends to the existing DB without
# reapplying schema.sql, so a schema-touching commit silently fails mid-
# pipeline (e.g. "table legacy_club_candidates has no column named
# classification" in Phase G).
#
# We compare actual column-sets (not mtimes): a crashed pipeline run leaves
# the live DB with a fresh mtime even though its schema is still stale, so
# mtime-based checks pass silently after every failed attempt.
if (( DB_REBUILD_INVOLVED == 1 || MODE_REUSE == 1 )) \
    && [[ "${FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK:-}" != "1" ]] \
    && [[ -f database/footbag.db ]] && [[ -f database/schema.sql ]]; then
# Both DB-rebuild (default) AND reuse-local (-r) modes ship the local DB
# file to the host; both must verify the local DB's schema matches
# database/schema.sql before pushing. -r without this gate silently
# shipped a stale local DB that would crash the deployed app on any new
# column or table.
  _drift_tmp_db=$(mktemp -t schema_check.XXXXXX.db)
  # shellcheck disable=SC2064
  trap "rm -f '${_drift_tmp_db}' '${_drift_tmp_db}-wal' '${_drift_tmp_db}-shm'" EXIT
  if ! sqlite3 "${_drift_tmp_db}" < database/schema.sql >/dev/null 2>&1; then
    echo "WARNING: schema-drift preflight could not apply database/schema.sql to a tmp DB; skipping drift check." >&2
  else
    _expected_tables=$(sqlite3 "${_drift_tmp_db}" "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
    _live_tables=$(sqlite3 database/footbag.db "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>/dev/null || true)
    _drift_lines=()
    # First pass: report items in schema.sql that are missing from the live DB.
    while IFS= read -r _t; do
      [[ -z "$_t" ]] && continue
      if ! printf '%s\n' "${_live_tables}" | grep -qx "$_t"; then
        _drift_lines+=("  missing table: ${_t}")
        continue
      fi
      _expected_cols=$(sqlite3 "${_drift_tmp_db}" "SELECT name FROM pragma_table_info('${_t}') ORDER BY name;")
      _live_cols=$(sqlite3 database/footbag.db "SELECT name FROM pragma_table_info('${_t}') ORDER BY name;" 2>/dev/null || true)
      _missing_cols=$(comm -23 <(printf '%s\n' "${_expected_cols}") <(printf '%s\n' "${_live_cols}"))
      if [[ -n "${_missing_cols}" ]]; then
        _cols_str=$(printf '%s\n' "${_missing_cols}" | paste -sd ',' - | sed 's/,/, /g')
        _drift_lines+=("  ${_t}: missing column(s): ${_cols_str}")
      fi
    done <<< "${_expected_tables}"
    # Second pass: bi-directional drift detection. Report items in the live
    # DB that are NOT in schema.sql. Catches the case where schema.sql
    # dropped a column or table but the live DB still carries it (could
    # mean a stale local rebuild, a manually-applied schema patch, or
    # an upstream merge that lost a removal). Code that no longer
    # references the removed item is the silent risk; the loud message
    # here gives the operator a chance to reset before pushing.
    while IFS= read -r _t; do
      [[ -z "$_t" ]] && continue
      if ! printf '%s\n' "${_expected_tables}" | grep -qx "$_t"; then
        _drift_lines+=("  extra table not in schema.sql: ${_t}")
        continue
      fi
      _expected_cols=$(sqlite3 "${_drift_tmp_db}" "SELECT name FROM pragma_table_info('${_t}') ORDER BY name;")
      _live_cols=$(sqlite3 database/footbag.db "SELECT name FROM pragma_table_info('${_t}') ORDER BY name;" 2>/dev/null || true)
      _extra_cols=$(comm -13 <(printf '%s\n' "${_expected_cols}") <(printf '%s\n' "${_live_cols}"))
      if [[ -n "${_extra_cols}" ]]; then
        _cols_str=$(printf '%s\n' "${_extra_cols}" | paste -sd ',' - | sed 's/,/, /g')
        _drift_lines+=("  ${_t}: extra column(s) not in schema.sql: ${_cols_str}")
      fi
    done <<< "${_live_tables}"
    if (( ${#_drift_lines[@]} > 0 )); then
      echo "ERROR: database/footbag.db schema is out of sync with database/schema.sql." >&2
      echo "       Drift detected (live DB is missing items declared in schema.sql):" >&2
      for _line in "${_drift_lines[@]}"; do echo "$_line" >&2; done
      echo "" >&2
      echo "       The default rebuild appends to the existing DB without" >&2
      echo "       reapplying schema.sql, so the load will crash mid-pipeline against" >&2
      echo "       the stale schema (typically inside Phase G enrichment)." >&2
      echo "" >&2

      # Offer to run the reset now and re-invoke this deploy with the original
      # args. Honors FOOTBAG_AUTO_RESET_ON_DRIFT=1 for non-interactive auto-yes
      # (CI / cron). Reads from /dev/tty so the credential-file stdin pipe at
      # the end of this script is untouched.
      _do_reset=0
      if [[ "${FOOTBAG_AUTO_RESET_ON_DRIFT:-}" == "1" ]]; then
        echo "  FOOTBAG_AUTO_RESET_ON_DRIFT=1 → auto-resetting." >&2
        _do_reset=1
      elif [[ -r /dev/tty ]]; then
        printf "  Run 'bash scripts/reset-local-db.sh' now and re-deploy with current args? [y/N] " >&2
        read -r _ans </dev/tty || _ans=""
        [[ "${_ans:-}" =~ ^[Yy]$ ]] && _do_reset=1
      fi
      if (( _do_reset == 1 )); then
        echo "  → Resetting local DB, then re-invoking deploy with same args..." >&2
        rm -f "${_drift_tmp_db}" "${_drift_tmp_db}-wal" "${_drift_tmp_db}-shm"
        trap - EXIT
        bash scripts/reset-local-db.sh
        exec bash "$0" "$@"
      fi
      echo "  Aborted. To fix:" >&2
      echo "    bash scripts/reset-local-db.sh && bash deploy_to_aws.sh $*" >&2
      echo "  Or set FOOTBAG_AUTO_RESET_ON_DRIFT=1 to auto-reset on drift." >&2
      echo "  Or set FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK=1 to bypass this check entirely." >&2
      exit 1
    fi
  fi
  rm -f "${_drift_tmp_db}" "${_drift_tmp_db}-wal" "${_drift_tmp_db}-shm"
  trap - EXIT
fi

# Operator credential source. Default path is per-environment so a stale
# AWS_OPERATOR env var bleed cannot accidentally feed staging credentials
# into a production deploy (or vice versa). Explicit AWS_OPERATOR_FILE
# overrides both defaults. Generic error: never print the resolved path.
if [[ -z "${AWS_OPERATOR_FILE:-}" ]]; then
  if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-production" ]]; then
    AWS_OPERATOR_FILE="$HOME/AWS/AWS_OPERATOR_PRODUCTION.txt"
  else
    AWS_OPERATOR_FILE="$HOME/AWS/AWS_OPERATOR.txt"
  fi
fi
if [[ ! -r "$AWS_OPERATOR_FILE" ]]; then
  echo "ERROR: operator credential source unavailable." >&2
  echo "Recommendation: verify the configured credential location is readable." >&2
  exit 1
fi

# --keep-staging-db (-k): warn when schema.sql has uncommitted changes (or
# changes since the last deploy commit). Code-only deploys ship the new TS
# but DO NOT reapply schema.sql on the host, so a code path that depends on
# a new column or table will crash at runtime. The operator should choose
# either a full rebuild or accept the risk after reviewing the schema drift.
# Runs after the AWS_OPERATOR_FILE check so the more fundamental credential
# error fires first.
if (( MODE_CODE_ONLY == 1 )) && command -v git >/dev/null 2>&1; then
  _schema_changes=$(git diff HEAD -- database/schema.sql 2>/dev/null | head -5 || true)
  if [[ -n "$_schema_changes" ]]; then
    echo "WARNING: --keep-staging-db (-k) selected, but database/schema.sql has uncommitted changes." >&2
    echo "         Code-only deploys do not reapply schema.sql on the host. New tables or" >&2
    echo "         columns added in this batch will not exist on staging, and any code path" >&2
    echo "         that touches them will crash at runtime." >&2
    echo "" >&2
    echo "         Either run a full rebuild deploy (omit -k) to reapply schema, or accept" >&2
    echo "         the risk after reviewing the schema diff:" >&2
    echo "           git diff HEAD -- database/schema.sql" >&2
    echo "" >&2
    if [[ "${FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT:-}" != "1" ]] && [[ -r /dev/tty ]]; then
      printf "  Continue with -k deploy despite schema drift? [y/N] " >&2
      read -r _ans </dev/tty || _ans=""
      if ! [[ "${_ans:-}" =~ ^[Yy]$ ]]; then
        echo "Aborted. Set FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT=1 to bypass this prompt." >&2
        exit 1
      fi
    fi
  fi
fi

# -----------------------------------------------------------------------------
# Pre-deploy summary. No paths, no secrets; just mode + target + host IP.
# Helps the operator catch a wrong DEPLOY_TARGET before the deploy proceeds.
# -----------------------------------------------------------------------------
echo "──────────────────────────────────────────────────────────"
echo "  Deploy mode:    $*"
echo "  Target alias:   $DEPLOY_TARGET"
echo "  Resolved host:  $RESOLVED_HOST"
echo "──────────────────────────────────────────────────────────"

# Pipe the operator-secrets file to the orchestrator's stdin instead of
# passing as a positional arg. argv-leak hardening: the password never
# appears in any process's argv on the operator workstation.
exec bash scripts/deploy-to-aws.sh "$@" < "$AWS_OPERATOR_FILE"
