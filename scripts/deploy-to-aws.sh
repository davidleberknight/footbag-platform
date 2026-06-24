#!/usr/bin/env bash
# =============================================================================
# deploy-to-aws.sh
#
# AWS staging deploy orchestrator. Composes:
#   scripts/deploy-local-data.sh   local DB rebuild (full pipeline)
#   scripts/deploy-code.sh         code + images only (no DB, no media)
#   scripts/deploy-rebuild.sh      code + images + DB replacement (+ media w/ -m)
#
# Default with no flags = code-only: ship code + docker images, run tests +
# smoke; the staging DB and S3 media are left untouched. A DB rebuild + staging
# replace is opt-in via --from-csv (committed CSVs) or --soup-to-nuts
# (everything on). Media sync to S3 is opt-in via -m / --sync-media (default
# off). The media clean-sync step still prompts before acting.
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

Default (no flags): code-only — ship code + images, run tests + smoke; the
staging DB and S3 media are left untouched. A DB rebuild + staging replace is
opt-in via --from-csv or --soup-to-nuts. Media sync is opt-in via -m /
--sync-media (default off). Prompts before the media clean-sync step.

MODES (mutually exclusive)
─────────────────────────────────────────────────────────────────────
  (none)                       Default: code-only. Staging DB + S3 media
                               untouched (same as -k). Add --from-csv or
                               --soup-to-nuts to rebuild + replace the DB.
  -r, --reuse-local-db         Don't rebuild local DB; ship current
                               ./database/footbag.db to staging as-is.
  -k, --keep-staging-db        Don't touch staging DB at all. Code + media
                               still ship. (Now equivalent to no flags.)

DATA SOURCE (opt-in DB rebuild; mutually exclusive)
─────────────────────────────────────────────────────────────────────
  --from-csv                   Full clean rebuild of local DB from
                               committed canonical CSVs (drops the DB
                               file, reapplies schema, runs all
                               enrichment phases), then replaces the
                               staging DB. No mirror access. Opt-in: a
                               bare deploy is code-only. Seeds the persona
                               catalog by default on staging; opt out with
                               --no-personas.
  --soup-to-nuts               Full clean rebuild from the legacy mirror
                               (legacy_data/mirror_footbag_org/). Drops
                               the DB file, regenerates canonical_input
                               CSVs from the mirror, runs all enrichment
                               phases. Wipes modern operator tables
                               (members, votes, ballots, news_items,
                               audit_entries, ...). Working tree may show
                               diffs after the run. Conflicts with -r
                               and -k.
                               "Everything on" by default: turns ON media
                               sync (+ S3 clean wipe), persona seed, and
                               dev-admin seed (the seeds on staging only).
                               Opt out per axis with --no-media /
                               --no-personas / --no-dev-admins (and -W for
                               additive S3 sync). --no-personas also applies
                               to --from-csv, which seeds personas too.

MODIFIERS
─────────────────────────────────────────────────────────────────────
  -y, --yes                    Accept every destructive prompt as its
                               default-yes answer. CI / scripted use.
  -m, --sync-media             Opt in to the S3 media cycle: rebuild curated
                               media from /curated/ and sync it to the bucket.
                               Default OFF (curated DB rows still ship every
                               deploy; S3 bytes persist across deploys). Pass
                               this only when curated binaries changed.
  -W, --no-s3-wipe             When media sync runs (-m), skip --delete flag;
                               still sync new bytes additively.
  --seed-dev-admins            After the deploy completes, run the
                               dev-admin seed inside the web container.
                               Reads .local/staging-admin-seed.json
                               (gitignored, per-maintainer) and inserts
                               maintainer admin accounts. Allowlisted to
                               DEPLOY_TARGET=footbag-staging only.
                               CUTOVER-REMOVE.
  --seed-test-personas         After the deploy completes, run the persona
                               catalog seed inside the web container. The
                               catalog is code (canonicalPersonas.ts), so this
                               carries a signal only (no JSON payload). Seed is
                               idempotent (skips existing slugs). Allowlisted to
                               DEPLOY_TARGET=footbag-staging only. CUTOVER-REMOVE.
  -n, --dry-run                Print planned actions; run nothing.
  -h, --help                   Show this message.

Combinations work: `-rmW` = reuse local DB, sync media, additive (no S3 wipe).

ALWAYS-ON
─────────────────────────────────────────────────────────────────────
Code + docker images ship every deploy. `npm test` runs every deploy. The
post-deploy smoke check runs every deploy. The curator seed step
(seed_fh_curator.py against /curated/**/*.meta.json sidecars) runs
unconditionally before any DB ships to staging.

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
  Routine code update (the default; DB + S3 untouched):
      bash deploy_to_aws.sh

  Full deploy from committed CSVs (rebuild + replace staging DB):
      bash deploy_to_aws.sh --from-csv

  Push the current local DB to staging without rebuilding:
      bash deploy_to_aws.sh -r

  Soup-to-nuts deploy (everything on: mirror rebuild + media + seeds):
      bash deploy_to_aws.sh --soup-to-nuts

  Non-interactive (CI), accept default-yes prompts:
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
SYNC_MEDIA_FLAG="no" # -m / --sync-media: opt in to the S3 media cycle
NO_MEDIA_FLAG="no"       # --no-media: opt OUT of soup-to-nuts media sync
NO_PERSONAS_FLAG="no"    # --no-personas: opt OUT of soup-to-nuts persona seed
NO_DEV_ADMINS_FLAG="no"  # --no-dev-admins: opt OUT of soup-to-nuts dev-admin seed
DRY_RUN="no"
FROM_CSV="no"        # explicit alias for default rebuild source
SOUP_TO_NUTS="no"    # full clean rebuild from legacy mirror
# CUTOVER-REMOVE: --seed-dev-admins flag.
# Current: post-deploy seeds maintainer admin accounts into dev/staging only;
#   not part of the production path.
# Target: remove this flag and the seed pathway once the production
#   first-admin SSM-token flow is the only bootstrap mechanism.
SEED_DEV_ADMINS="no"
# CUTOVER-REMOVE: --seed-test-personas flag.
# Current: post-deploy seeds the canonical persona catalog into dev/staging
#   only; not part of the production path. Signal only, no JSON payload.
# Target: remove this flag and the seed pathway at production cutover.
SEED_TEST_PERSONAS="no"

# Expand combined short flags (e.g. -ryW → -r -y -W) so the case below can
# handle each independently. Duplicated by design in deploy_to_aws.sh: each
# deploy entry point stays standalone with no sourced dependencies.
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
    -m|--sync-media)       SYNC_MEDIA_FLAG="yes" ;;
    -n|--dry-run)          DRY_RUN="yes" ;;
    --from-csv)            FROM_CSV="yes" ;;
    --soup-to-nuts)        SOUP_TO_NUTS="yes" ;;
    --seed-dev-admins)     SEED_DEV_ADMINS="yes" ;;
    --seed-test-personas)  SEED_TEST_PERSONAS="yes" ;;
    --no-media)            NO_MEDIA_FLAG="yes" ;;
    --no-personas)         NO_PERSONAS_FLAG="yes" ;;
    --no-dev-admins)       NO_DEV_ADMINS_FLAG="yes" ;;
    *)
      echo "ERROR: unknown flag '$arg'" >&2
      echo "" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# --from-csv / --soup-to-nuts are valid only with the default rebuild mode.
if [[ "$FROM_CSV" == "yes" && "$SOUP_TO_NUTS" == "yes" ]]; then
  echo "ERROR: --from-csv and --soup-to-nuts are mutually exclusive." >&2
  exit 1
fi
if [[ "$SOUP_TO_NUTS" == "yes" || "$FROM_CSV" == "yes" ]]; then
  if [[ "$MODE" == "reuse" ]]; then
    echo "ERROR: --from-csv / --soup-to-nuts conflict with -r/--reuse-local-db (cannot rebuild and reuse simultaneously)." >&2
    exit 1
  fi
  if [[ "$MODE" == "keep" ]]; then
    echo "ERROR: --from-csv / --soup-to-nuts conflict with -k/--keep-staging-db (rebuild has no effect when staging DB is untouched). Use ./run_dev.sh --soup-to-nuts to rebuild locally without deploying." >&2
    exit 1
  fi
fi

# Opt-out / opt-in conflicts.
if [[ "$SYNC_MEDIA_FLAG" == "yes" && "$NO_MEDIA_FLAG" == "yes" ]]; then
  echo "ERROR: -m/--sync-media and --no-media are contradictory." >&2
  exit 1
fi
if [[ "$SEED_TEST_PERSONAS" == "yes" && "$NO_PERSONAS_FLAG" == "yes" ]]; then
  echo "ERROR: --seed-test-personas and --no-personas are contradictory." >&2
  exit 1
fi
if [[ "$SEED_DEV_ADMINS" == "yes" && "$NO_DEV_ADMINS_FLAG" == "yes" ]]; then
  echo "ERROR: --seed-dev-admins and --no-dev-admins are contradictory." >&2
  exit 1
fi

# The --no-* opt-outs only make sense in the mode that turns the axis on by
# default. --no-media / --no-dev-admins ride --soup-to-nuts; --no-personas rides
# --from-csv and --soup-to-nuts (both seed personas by default on staging). A
# stray --no-* anywhere else is almost certainly an operator mistake: fail loud.
if [[ "$SOUP_TO_NUTS" != "yes" ]]; then
  for _f in "--no-media:$NO_MEDIA_FLAG" "--no-dev-admins:$NO_DEV_ADMINS_FLAG"; do
    if [[ "${_f#*:}" == "yes" ]]; then
      echo "ERROR: ${_f%%:*} is only meaningful with --soup-to-nuts (these axes are off by default otherwise)." >&2
      exit 1
    fi
  done
  if [[ "$NO_PERSONAS_FLAG" == "yes" && "$FROM_CSV" != "yes" ]]; then
    echo "ERROR: --no-personas is only meaningful with --from-csv or --soup-to-nuts (personas are off by default otherwise)." >&2
    exit 1
  fi
fi

# Personas ride along with any staging DB rebuild (--from-csv or --soup-to-nuts)
# so a freshly rebuilt staging DB is never left without the test catalog. Opt out
# with --no-personas. Staging-only (CUTOVER-REMOVE): auto-enable ONLY on staging,
# re-enforcing the wrapper's allowlist (which scans literal --seed-* flags and
# cannot see this implicit enable). The seed runner is idempotent.
if [[ "$FROM_CSV" == "yes" || "$SOUP_TO_NUTS" == "yes" ]]; then
  if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-staging" ]]; then
    [[ "$NO_PERSONAS_FLAG" == "yes" ]] || SEED_TEST_PERSONAS="yes"
  else
    echo "NOTE: DB rebuild against non-staging target; persona seed skipped (staging-only)." >&2
  fi
fi

# --soup-to-nuts is "everything on": turn on media sync (+ S3 clean wipe via the
# existing WIPE_DEFAULT path) and the dev-admin seed, each opt-out via --no-*.
# These are staging-only (CUTOVER-REMOVE); auto-enable them ONLY on staging,
# re-enforcing the wrapper's allowlist (which scans literal --seed-* flags and
# cannot see these implicit enables).
if [[ "$SOUP_TO_NUTS" == "yes" ]]; then
  [[ "$NO_MEDIA_FLAG" == "yes" ]] || SYNC_MEDIA_FLAG="yes"
  if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-staging" ]]; then
    # Dev-admin seed under --soup-to-nuts is best-effort: auto-enable it only
    # when .local/staging-admin-seed.json actually has entries. Explicit
    # --seed-dev-admins (already SEED_DEV_ADMINS=yes here) keeps its strict
    # refuse-to-no-op behavior, so a deploy never aborts on an empty seed file.
    if [[ "$NO_DEV_ADMINS_FLAG" != "yes" && "$SEED_DEV_ADMINS" != "yes" ]]; then
      _n=$(grep -v '^[[:space:]]*//' .local/staging-admin-seed.json 2>/dev/null \
             | jq 'if type=="array" then length else 0 end' 2>/dev/null || echo 0)
      if [[ "${_n:-0}" -gt 0 ]]; then
        SEED_DEV_ADMINS="yes"
      else
        echo "NOTE: --soup-to-nuts: skipping dev-admin seed (no entries in .local/staging-admin-seed.json; pass --seed-dev-admins to require it)." >&2
      fi
    fi
  else
    echo "NOTE: --soup-to-nuts against non-staging target; dev-admin seed skipped (staging-only)." >&2
  fi
fi

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
# Bare deploy (no mode flag and no --from-csv/--soup-to-nuts) is code-only: the
# DB is left untouched. A DB rebuild + staging replace is opt-in via --from-csv
# or --soup-to-nuts. -r/-k pre-answer their own way. None of these prompt; the
# WIPE (media) choice below is non-interactive too, using its clean-sync default.
# -----------------------------------------------------------------------------
case "$MODE" in
  reuse)  REBUILD_LOCAL="no";  REPLACE_STAGING="yes"; ;;
  keep)   REBUILD_LOCAL="no";  REPLACE_STAGING="no";  ;;
  "")
    if [[ "$FROM_CSV" == "yes" || "$SOUP_TO_NUTS" == "yes" ]]; then
      REBUILD_LOCAL="yes"; REPLACE_STAGING="yes"
    else
      REBUILD_LOCAL="no";  REPLACE_STAGING="no"
    fi
    ;;
esac

# Clean-sync defaults: Y if a DB rebuild is happening (removes S3 objects that
# have no local counterpart). N otherwise (additive sync only).
WIPE_DEFAULT="N"
if [[ "$REBUILD_LOCAL" == "yes" && "$REPLACE_STAGING" == "yes" ]]; then
  WIPE_DEFAULT="Y"
fi

# No media sync (-m not passed) → nothing to wipe.
if [[ "$SYNC_MEDIA_FLAG" != "yes" ]]; then
  WIPE_S3="no"
# -W / --no-s3-wipe pre-answers wipe=N without prompting.
elif [[ "$NO_S3_WIPE_FLAG" == "yes" ]]; then
  WIPE_S3="no"
else
  # Non-interactive: use the clean-sync default (Y when a DB rebuild replaces
  # staging, N otherwise). No prompt; -W / --no-s3-wipe above opts out.
  [[ "$WIPE_DEFAULT" == "Y" ]] && WIPE_S3="yes" || WIPE_S3="no"
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
echo "    sync media:       ${SYNC_MEDIA_FLAG}"
echo "    clean S3 sync:    ${WIPE_S3}"
echo "    seed dev admins:  ${SEED_DEV_ADMINS}"
echo "    seed personas:    ${SEED_TEST_PERSONAS}"
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
  # SIGPIPE-safe "first line" idiom: do NOT replace `awk 'NR==1'` with
  # `head -1`.
  #
  # `head -N` closes its stdin after reading N lines. If the upstream
  # producer (`sort` here) is still writing (which can happen on slow
  # filesystems, under heavy parallel load, or non-deterministically at
  # large fan-in) the producer's next write receives SIGPIPE. With
  # `set -o pipefail` active, the pipeline's exit code becomes the
  # SIGPIPE exit (128 + 13 = 141), `set -e` aborts the script, and the
  # `[[ -n "$ci_oldest" ]]` empty-check below never runs.
  #
  # `awk 'NR==1'` reads stdin to EOF (printing only the first line as a
  # side effect), so the upstream never SIGPIPEs. Output is identical;
  # the only cost is reading the rest of the (small) input. Do NOT swap
  # in `awk 'NR==1 {print; exit}'`: `exit` reintroduces the same
  # early-close race. If you need the LAST line instead, GNU `tail -N`
  # is safe because it buffers and reads stdin to EOF before emitting.
  ci_oldest=$(find "$ci_dir" -maxdepth 1 -name '*.csv' -printf '%T@\n' 2>/dev/null | sort -n | awk 'NR==1')
  [[ -n "$ci_oldest" ]] || return 0

  local inputs_latest
  # See sibling pipeline above for the awk-vs-head rationale.
  inputs_latest=$({
    find "${REPO_ROOT}/legacy_data/pipeline" -name '*.py' -type f -printf '%T@\n' 2>/dev/null
    find "${REPO_ROOT}/legacy_data/overrides" -type f -printf '%T@\n' 2>/dev/null
    find "${REPO_ROOT}/legacy_data/inputs/curated" -type f -printf '%T@\n' 2>/dev/null
    find "${REPO_ROOT}/legacy_data/inputs/identity_lock" -type f -printf '%T@\n' 2>/dev/null
    stat -c '%Y' "${REPO_ROOT}/legacy_data/inputs/canonical_discipline_fixes.csv" 2>/dev/null
  } | sort -rn | awk 'NR==1')
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

if [[ "$REBUILD_LOCAL" == "yes" ]]; then
  check_canonical_freshness
fi

# -----------------------------------------------------------------------------
# Thread the resolved choices to leaf scripts as env vars.
# -----------------------------------------------------------------------------
export CURATOR_SEED="${CURATOR_SEED:-yes}"

# CUTOVER-REMOVE: SEED_DEV_ADMINS, explicit opt-in; defaults to no. The
# leaf scripts (deploy-code.sh / deploy-rebuild.sh) read this and, if
# yes, validate .local/staging-admin-seed.json and pipe its content
# through the SSH cat-pipe alongside FOOTBAG_DEV_INITIAL_ADMIN_EMAILS.
# The staging-side remote scripts then run the seed inside the web
# container.
export SEED_DEV_ADMINS

# CUTOVER-REMOVE: SEED_TEST_PERSONAS, explicit opt-in; defaults to no. The
# leaf scripts (deploy-code.sh / deploy-rebuild.sh) thread this signal through
# the SSH cat-pipe env block; the staging-side remote scripts then run the
# persona-catalog seed inside the web container. No JSON payload (the catalog
# is code).
export SEED_TEST_PERSONAS

# SYNC_MEDIA: opt-in via -m / --sync-media (default off). When off, the leaf
# scripts skip the curated build + rsync + S3 sync entirely; curated DB rows
# still ship with footbag.db and live S3 bytes are preserved.
export SYNC_MEDIA="${SYNC_MEDIA_FLAG}"

# KEEP_MEDIA: yes means "additive sync only, no --delete." Maps from WIPE_S3
# (inverse semantics preserved from legacy code).
if [[ "$WIPE_S3" == "yes" ]]; then
  export KEEP_MEDIA="no"
else
  export KEEP_MEDIA="yes"
fi

# -----------------------------------------------------------------------------
# Dispatch. Three execution paths:
#   1. -k: code only (no DB, no media).           → deploy-code.sh
#   2. -r or no rebuild: ship current local DB.   → deploy-rebuild.sh (SKIP_DB_REBUILD=yes)
#   3. Default rebuild + replace.                 → deploy-local-data.sh + deploy-rebuild.sh
# -----------------------------------------------------------------------------
if [[ "$REPLACE_STAGING" == "no" ]]; then
  echo "==> Step: scripts/deploy-code.sh (code only; staging DB + media untouched)"
  exec_step bash "${SCRIPT_DIR}/deploy-code.sh"
fi

if [[ "$REBUILD_LOCAL" == "no" ]]; then
  echo "==> Step: scripts/deploy-rebuild.sh (ship current local DB; SKIP_DB_REBUILD=yes)"
  export SKIP_DB_REBUILD="yes"
  exec_step bash "${SCRIPT_DIR}/deploy-rebuild.sh"
fi

# REBUILD_LOCAL == yes (opt-in via --from-csv / --soup-to-nuts). Two paths:
#   --from-csv : no-mirror path. Loads committed
#       canonical_input/*.csv and runs the enrichment phases.
#       deploy-local-data.sh:run_from_csv() bootstraps
#       legacy_data/out/canonical/ from the canonical_input snapshot before
#       invoking csv_only, so phase D (which reads out/canonical/events.csv)
#       has its input without requiring the mirror.
#   --soup-to-nuts : runs the full pipeline starting from the legacy
#       mirror. Regenerates committed canonical_input/*.csv, name
#       variants, and seed/*.csv as a side effect; working tree will show
#       diffs after the run.
if [[ "$SOUP_TO_NUTS" == "yes" ]]; then
  echo "==> Step 1 (local DB rebuild): scripts/deploy-local-data.sh --soup-to-nuts"
  run_step bash "${SCRIPT_DIR}/deploy-local-data.sh" --soup-to-nuts
  if [[ "$DRY_RUN" != "yes" ]]; then
    echo ""
    echo "NOTE: --soup-to-nuts regenerated committed files. Working tree may now show diffs in:"
    echo "      legacy_data/event_results/canonical_input/, legacy_data/inputs/name_variants.csv,"
    echo "      legacy_data/seed/. Commit or revert before deploying again."
  fi
else
  echo "==> Step 1 (local DB rebuild): scripts/deploy-local-data.sh --from-csv"
  run_step bash "${SCRIPT_DIR}/deploy-local-data.sh" --from-csv
fi
echo ""
echo "==> Step 2 (AWS push + DB replace): scripts/deploy-rebuild.sh (SKIP_DB_REBUILD=yes)"
export SKIP_DB_REBUILD="yes"
exec_step bash "${SCRIPT_DIR}/deploy-rebuild.sh"
