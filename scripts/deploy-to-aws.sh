#!/usr/bin/env bash
# =============================================================================
# deploy-to-aws.sh
#
# AWS staging deploy orchestrator. Composes:
#   scripts/deploy-local-data.sh   local DB rebuild (full pipeline)
#   scripts/deploy-code.sh         code + images only (no DB, no media)
#   scripts/deploy-rebuild.sh      code + images + DB replacement (+ media)
#
# Default with no flags = "ship everything fresh": rebuild local DB from
# committed CSVs, replace staging DB, sync code + media, run tests, run smoke.
# Each destructive step prompts before acting (rebuild local DB, replace
# staging DB, wipe S3 bucket).
#
# Mirror is NEVER required at deploy time. Committed seed CSVs carry all
# mirror-extracted data forward. Mirror extraction is an upstream
# legacy_data-owner workflow; deploys consume the resulting CSVs via
# `git pull`.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: bash deploy_to_aws.sh [flags]                       (recommended)
   or: < <operator credential file> bash scripts/deploy-to-aws.sh [flags]

Default (no flags): ship code, rebuild local DB, replace staging DB, sync
media, run tests + smoke. Prompts before each destructive step (rebuild,
replace, S3 wipe).

MODES (mutually exclusive)
─────────────────────────────────────────────────────────────────────
  (none)                       Default.
  -r, --reuse-local-db         Don't rebuild local DB; ship current
                               ./database/footbag.db to staging as-is.
  -k, --keep-staging-db        Don't touch staging DB at all. Code + media
                               still ship.

MODIFIERS
─────────────────────────────────────────────────────────────────────
  -y, --yes                    Accept every destructive prompt as its
                               default-yes answer. CI / scripted use.
  -W, --no-s3-wipe             When media sync runs, skip the S3 wipe;
                               still rsync new bytes additively.
  -n, --dry-run                Print planned actions; run nothing.
  -h, --help                   Show this message.

Combinations work: `-ryW` = reuse local DB, accept defaults, skip wipe.

ALWAYS-ON
─────────────────────────────────────────────────────────────────────
Code + docker images ship every deploy. `npm test` runs every deploy. The
post-deploy smoke check runs every deploy. The curator seed step
(seed_fh_curator.py against /curated/**/*.meta.json sidecars) runs
unconditionally before any DB ships to staging — this is the 79-vs-37 fix.

ENV OVERRIDES
─────────────────────────────────────────────────────────────────────
  DEPLOY_TARGET=<alias>            SSH alias (default: footbag-staging).
  AWS_OPERATOR_FILE=<path>         Override operator-credential file path
                                   (default: ~/AWS/AWS_OPERATOR.txt).
  SKIP_SMOKE=yes                   Skip post-deploy smoke check.
  SMOKE_BASE_URL=<url>             Override smoke target (default: the
                                   environment's public CloudFront URL).
  CURATOR_SEED=no                  Skip the curator seed step (rare; used
                                   when sidecars are known broken and the
                                   operator wants the existing DB curator
                                   rows preserved).

EXAMPLES
─────────────────────────────────────────────────────────────────────
  Routine code update (DB + S3 untouched):
      bash deploy_to_aws.sh -k

  Full deploy (the default):
      bash deploy_to_aws.sh

  Push the current local DB to staging without rebuilding:
      bash deploy_to_aws.sh -r

  Non-interactive default (CI):
      bash deploy_to_aws.sh -y

  Dry run:
      bash deploy_to_aws.sh -n
USAGE
}

# -----------------------------------------------------------------------------
# Parse flags. Single-letter shorts can be combined: -ry, -ryW, etc.
# -----------------------------------------------------------------------------
MODE=""              # "" = default, "reuse" = -r, "keep" = -k
YES_TO_ALL="no"
NO_S3_WIPE_FLAG="no"
DRY_RUN="no"

# Expand combined short flags (e.g. -ryW → -r -y -W) so the case below can
# handle each independently.
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

set_mode() {
  if [[ -n "$MODE" ]]; then
    echo "ERROR: $1 conflicts with prior mode flag" >&2
    exit 1
  fi
  MODE="$2"
}

for arg in "${EXPANDED_ARGS[@]+"${EXPANDED_ARGS[@]}"}"; do
  case "$arg" in
    -h|--help)             usage; exit 0 ;;
    -r|--reuse-local-db)   set_mode "$arg" "reuse" ;;
    -k|--keep-staging-db)  set_mode "$arg" "keep"  ;;
    -y|--yes)              YES_TO_ALL="yes" ;;
    -W|--no-s3-wipe)       NO_S3_WIPE_FLAG="yes" ;;
    -n|--dry-run)          DRY_RUN="yes" ;;
    *)
      echo "ERROR: unknown flag '$arg'" >&2
      echo "" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Operator credential file must be on stdin (deploy_to_aws.sh wrapper supplies
# it). Reject interactive stdin so we never hang waiting for a password.
if [[ -t 0 ]]; then
  echo "ERROR: must receive sudo password on stdin." >&2
  echo "       Run via: bash deploy_to_aws.sh ..." >&2
  echo "" >&2
  usage >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# Per-axis prompts. Mode flags pre-answer prompts. -y accepts all defaults.
# Reads from /dev/tty so the credential-file stdin pipe is preserved.
# -----------------------------------------------------------------------------
prompt_yn() {
  local question="$1"
  local default="$2"   # "Y" or "N"

  if [[ "$YES_TO_ALL" == "yes" ]]; then
    echo "  ${question} [auto-${default}]" >&2
    [[ "$default" == "Y" ]] && return 0 || return 1
  fi

  if [[ ! -r /dev/tty ]]; then
    echo "  ${question} [non-interactive default ${default}]" >&2
    [[ "$default" == "Y" ]] && return 0 || return 1
  fi

  local prompt_text
  if [[ "$default" == "Y" ]]; then
    prompt_text="  ${question} [Y/n] "
  else
    prompt_text="  ${question} [y/N] "
  fi

  local answer=""
  read -r -p "$prompt_text" answer </dev/tty || answer=""
  if [[ -z "$answer" ]]; then
    [[ "$default" == "Y" ]] && return 0 || return 1
  fi
  [[ "$answer" =~ ^[Yy] ]]
}

# -----------------------------------------------------------------------------
# Resolve the three destructive choices: REBUILD_LOCAL, REPLACE_STAGING, WIPE.
# Mode flags pre-answer; otherwise prompt.
# -----------------------------------------------------------------------------
case "$MODE" in
  reuse)  REBUILD_LOCAL="no";  REPLACE_STAGING="yes"; ;;
  keep)   REBUILD_LOCAL="no";  REPLACE_STAGING="no";  ;;
  "")     REBUILD_LOCAL="";    REPLACE_STAGING="";    ;;  # to be prompted
esac

if [[ -z "$REBUILD_LOCAL" ]]; then
  if prompt_yn "Rebuild local DB?" "Y"; then
    REBUILD_LOCAL="yes"
  else
    REBUILD_LOCAL="no"
  fi
fi

if [[ -z "$REPLACE_STAGING" ]]; then
  if [[ "$REBUILD_LOCAL" == "yes" ]]; then
    if prompt_yn "Replace staging DB with rebuilt local?" "Y"; then
      REPLACE_STAGING="yes"
    else
      REPLACE_STAGING="no"
    fi
  else
    if prompt_yn "Replace staging DB with current local?" "Y"; then
      REPLACE_STAGING="yes"
    else
      REPLACE_STAGING="no"
    fi
  fi
fi

# Wipe defaults: Y if a DB rebuild is happening (avatar S3 keys remap on fresh
# DB seed; orphaned objects would serve wrong-person photos). N otherwise.
WIPE_DEFAULT="N"
if [[ "$REBUILD_LOCAL" == "yes" && "$REPLACE_STAGING" == "yes" ]]; then
  WIPE_DEFAULT="Y"
fi

# -W / --no-s3-wipe pre-answers wipe=N without prompting.
if [[ "$NO_S3_WIPE_FLAG" == "yes" ]]; then
  WIPE_S3="no"
elif [[ "$REPLACE_STAGING" == "no" && "$MODE" == "keep" ]]; then
  # -k mode: media still rsync's additively, but no DB context → no wipe.
  WIPE_S3="no"
else
  if prompt_yn "Wipe S3 bucket before media sync?" "$WIPE_DEFAULT"; then
    WIPE_S3="yes"
  else
    WIPE_S3="no"
  fi
fi

# -----------------------------------------------------------------------------
# Plan summary (always shown; doubles as dry-run output).
# -----------------------------------------------------------------------------
echo ""
echo "==> Deploy plan"
echo "    target:           ${DEPLOY_TARGET:-footbag-staging}"
echo "    mode:             ${MODE:-default}"
echo "    rebuild local DB: ${REBUILD_LOCAL}"
echo "    replace staging:  ${REPLACE_STAGING}"
echo "    sync media:       yes (additive)"
echo "    wipe S3 first:    ${WIPE_S3}"
echo "    dry run:          ${DRY_RUN}"
echo ""

# -----------------------------------------------------------------------------
# Helpers preserved from prior orchestrator.
# -----------------------------------------------------------------------------
run_step() {
  if [[ "$DRY_RUN" == "yes" ]]; then
    echo "    DRY RUN: would run: $*"
    return 0
  fi
  # Local DB-prep steps must not consume the password from this orchestrator's
  # stdin; redirect from /dev/null so the password remains for exec_step.
  "$@" </dev/null
}

exec_step() {
  if [[ "$DRY_RUN" == "yes" ]]; then
    echo "    DRY RUN: would run: $*"
    if [[ -n "${SKIP_DB_REBUILD:-}" ]]; then
      echo "             with SKIP_DB_REBUILD=$SKIP_DB_REBUILD"
    fi
    if [[ -n "${SYNC_MEDIA:-}" ]]; then
      echo "             with SYNC_MEDIA=$SYNC_MEDIA"
    fi
    if [[ -n "${KEEP_MEDIA:-}" ]]; then
      echo "             with KEEP_MEDIA=$KEEP_MEDIA"
    fi
    exit 0
  fi
  # Inherit this orchestrator's stdin (the password line) and pass it through
  # to the leaf, which forwards via ssh to remote sudo -S. The password
  # remains in unnamed kernel pipes only; never lands in argv or a shell var.
  "$@"
  exit $?
}

check_canonical_freshness() {
  local ci_dir="${REPO_ROOT}/legacy_data/event_results/canonical_input"
  [[ -d "$ci_dir" ]] || return 0

  local ci_oldest
  ci_oldest=$(find "$ci_dir" -maxdepth 1 -name '*.csv' -printf '%T@\n' 2>/dev/null | sort -n | head -1)
  [[ -n "$ci_oldest" ]] || return 0

  local inputs_latest
  inputs_latest=$({
    find "${REPO_ROOT}/legacy_data/pipeline" -name '*.py' -type f -printf '%T@\n' 2>/dev/null
    find "${REPO_ROOT}/legacy_data/overrides" -type f -printf '%T@\n' 2>/dev/null
    find "${REPO_ROOT}/legacy_data/inputs/curated" -type f -printf '%T@\n' 2>/dev/null
    find "${REPO_ROOT}/legacy_data/inputs/identity_lock" -type f -printf '%T@\n' 2>/dev/null
    stat -c '%Y' "${REPO_ROOT}/legacy_data/inputs/canonical_discipline_fixes.csv" 2>/dev/null
  } | sort -rn | head -1)
  [[ -n "$inputs_latest" ]] || return 0

  if awk -v a="$inputs_latest" -v b="$ci_oldest" 'BEGIN{exit !(a > b)}'; then
    echo "" >&2
    echo "------------------------------------------------------------------------" >&2
    echo "WARNING: canonical CSVs are older than pipeline inputs or code." >&2
    echo "" >&2
    echo "  Oldest canonical_input csv:    $(date -d @${ci_oldest%.*} '+%Y-%m-%d %H:%M:%S')" >&2
    echo "  Newest pipeline input or code: $(date -d @${inputs_latest%.*} '+%Y-%m-%d %H:%M:%S')" >&2
    echo "" >&2
    echo "  The deploy will proceed with the committed canonical_input CSVs." >&2
    echo "  Recommendation: refresh the CSVs upstream (legacy_data owner)" >&2
    echo "  before deploying if the gap matters." >&2
    echo "------------------------------------------------------------------------" >&2
    echo "" >&2
  fi
}

# Warn if canonical CSVs trail pipeline code (informational only).
if [[ "$REBUILD_LOCAL" == "yes" ]]; then
  check_canonical_freshness
fi

# -----------------------------------------------------------------------------
# Thread the resolved choices to leaf scripts as env vars.
# -----------------------------------------------------------------------------
# CURATOR_SEED defaults to yes; honor the env override (CURATOR_SEED=no).
export CURATOR_SEED="${CURATOR_SEED:-yes}"

# SYNC_MEDIA: always yes when shipping anything (additive rsync).
export SYNC_MEDIA="yes"

# KEEP_MEDIA: yes means "skip wipe." Maps from WIPE_S3 (inverse semantics
# preserved from legacy code).
if [[ "$WIPE_S3" == "yes" ]]; then
  export KEEP_MEDIA="no"
else
  export KEEP_MEDIA="yes"
fi

# -----------------------------------------------------------------------------
# Dispatch. Three execution paths:
#   1. -k: code + media only (no DB).             → deploy-code.sh
#   2. -r or no rebuild: ship current local DB.   → deploy-rebuild.sh (SKIP_DB_REBUILD=yes)
#   3. Default rebuild + replace.                 → deploy-local-data.sh + deploy-rebuild.sh
#   3a. -f fast variant: deploy-rebuild.sh runs reset-local-db.sh internally.
# -----------------------------------------------------------------------------
if [[ "$REPLACE_STAGING" == "no" ]]; then
  echo "==> Step: scripts/deploy-code.sh (code + media; staging DB untouched)"
  exec_step bash "${SCRIPT_DIR}/deploy-code.sh"
fi

if [[ "$REBUILD_LOCAL" == "no" ]]; then
  echo "==> Step: scripts/deploy-rebuild.sh (ship current local DB; SKIP_DB_REBUILD=yes)"
  export SKIP_DB_REBUILD="yes"
  exec_step bash "${SCRIPT_DIR}/deploy-rebuild.sh"
fi

# REBUILD_LOCAL == yes. --from-csv is the no-mirror path: it loads the
# committed canonical_input/*.csv into the DB and runs the enrichment phases.
# deploy-local-data.sh:run_from_csv() bootstraps legacy_data/out/canonical/
# from the same canonical_input snapshot before invoking csv_only, so phase D
# (which reads out/canonical/events.csv) has its input without requiring the
# mirror.
echo "==> Step 1 (local DB rebuild): scripts/deploy-local-data.sh --from-csv"
run_step bash "${SCRIPT_DIR}/deploy-local-data.sh" --from-csv
echo ""
echo "==> Step 2 (AWS push + DB replace): scripts/deploy-rebuild.sh (SKIP_DB_REBUILD=yes)"
export SKIP_DB_REBUILD="yes"
exec_step bash "${SCRIPT_DIR}/deploy-rebuild.sh"
