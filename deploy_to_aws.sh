#!/usr/bin/env bash
# deploy_to_aws.sh -- the only workstation-side AWS deploy entry point.
#
# Orchestrates: preflight (tools, ssh alias, disk, DB lock), credential pipe,
# pre-deploy summary, delegation to scripts/deploy-to-aws.sh.
#
# Where the host sudo password comes from depends on the target, and the
# difference is the point. Staging reads ~/AWS/AWS_OPERATOR.txt exactly once via
# shell `<` redirection, with nobody at the keyboard. Production reads it from the
# operator's terminal, silently, in the same gate that asks for the typed
# confirmation, and has no file to fall back to: the file proves only that its
# reader had filesystem access, which on this workstation is not the same as an
# operator being present and accountable.
#
# Either way the password never appears in any process's argv and never reaches
# disk on its way onward. Forward scripts (orchestrator, leaves) consume stdin and
# read exactly one line from it; none re-reads a file.

set -euo pipefail

# Anchored to this file's own checkout, not to the caller's directory: the
# orchestrator below is reached by absolute path so a run started from anywhere
# finds it. A relative `scripts/deploy-to-aws.sh` here meant this entry point only
# worked from the repository root, which is the same defect the leaves had on their
# rsync source, and it is the leaves that anchor everything downstream.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="${SCRIPT_DIR}/scripts/deploy-to-aws.sh"

# Then work in that checkout, for the same reason the leaves do. Anchoring the
# hand-off alone left every preflight below reading the caller's directory, so a
# deploy started from anywhere else still ran -- it just ran without its gates.
# The workstation disk check measured whatever filesystem the caller stood on;
# the database-lock check found no database and passed; and both schema gates are
# conditioned on `[[ -f database/schema.sql ]]`, so the local drift preflight and
# the deployed schema-sync gate that refuses a code-only deploy onto a drifted
# host both self-skipped in silence. A run from the home directory lost exactly
# the gate that exists to stop it.
cd "$SCRIPT_DIR"

# --help / -h short-circuits before any preflight or file read.
for arg in "$@"; do
  case "$arg" in
    --help|-h) exec bash "$ORCHESTRATOR" --help ;;
  esac
done

# -----------------------------------------------------------------------------
# Mode classification (drives mode-aware preflight skips below).
# -----------------------------------------------------------------------------
# Short combined flags (e.g. -rW) expand into their parts so the case below
# matches each independently. Duplicated by design in scripts/deploy-to-aws.sh:
# each deploy entry point stays standalone with no sourced dependencies.
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

MODE_CODE_ONLY=0   # -k / --keep-staging-db (and the bare default): no DB ops at all.
MODE_REUSE=0       # -r / --reuse-local-db: ship current ./database/footbag.db; no rebuild.
DB_REBUILD_INVOLVED=0   # set when --from-csv / --soup-to-nuts / --all-data opt into a DB rebuild.
DATA_REBUILD=0     # --from-csv / --soup-to-nuts / --all-data: opt-in DB rebuild + replace.
SEED_TEST_PERSONAS=0   # --seed-test-personas: opt-in persona-catalog seed after deploy (CUTOVER-REMOVE).
# --refresh-test-personas: persona rebuild after deploy (CUTOVER-REMOVE). The
# rebuild is ON BY DEFAULT for a code-only staging deploy; this counter tracks
# only whether the operator NAMED it, because the target allowlist below refuses
# an explicit request and the inner script re-checks the target for the default.
REFRESH_TEST_PERSONAS=0
MEDIA_INTENT_NAMED=0   # -W / -m / --no-media / --sync-media / --no-s3-wipe: the
                       # operator has stated what happens to the media bucket.

HAS_MODE=0
for arg in "${EXPANDED_ARGS[@]+"${EXPANDED_ARGS[@]}"}"; do
  case "$arg" in
    -k|--keep-staging-db)       MODE_CODE_ONLY=1; HAS_MODE=1 ;;
    -r|--reuse-local-db)        MODE_REUSE=1;     HAS_MODE=1 ;;
    --from-csv|--soup-to-nuts|--all-data)  DATA_REBUILD=1 ;;
    --seed-test-personas)       SEED_TEST_PERSONAS=1 ;;
    --refresh-test-personas)    REFRESH_TEST_PERSONAS=1 ;;
    # Whether the operator has said what happens to the media bucket. Any of
    # these answers it, in either direction; the production gate asks only when
    # none of them is present.
    -W|--no-s3-wipe|-m|--sync-media|--no-media) MEDIA_INTENT_NAMED=1 ;;
  esac
done
# Bare deploy (no -k/-r and no --from-csv/--soup-to-nuts/--all-data) is code-only:
# no DB ops at all. --from-csv / --soup-to-nuts / --all-data opt into a DB rebuild
# + replace; only then does the DB-touching preflight + prod-replace gate apply.
if (( HAS_MODE == 0 )); then
  if (( DATA_REBUILD == 1 )); then
    DB_REBUILD_INVOLVED=1
  else
    MODE_CODE_ONLY=1
  fi
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

# The maintainers' private checkout is a prerequisite for deploying, not an
# optional convenience. It carries the recorded human decisions the member intake
# applies, and a build without them is a different database that looks identical
# afterwards: duplicate accounts a human ruled to be two people get fused, and the
# directors sitting at cutover load as ordinary members. Neither failure raises an
# error of its own. Every operator is a maintainer and has the checkout, so this
# refuses rather than degrading, and it refuses here, ahead of the production gate,
# so a missing symlink never costs a typed confirmation or a typed password.
PRIVATE_CHECKOUT="${SCRIPT_DIR}/footbag_private_repo"
if [[ ! -d "$PRIVATE_CHECKOUT" ]]; then
  echo "ERROR: the maintainers' private checkout is not reachable: ${PRIVATE_CHECKOUT}" >&2
  echo "Recommendation: create the git-ignored repo-root footbag_private_repo symlink pointing at" >&2
  echo "  your private operations checkout, then re-run. A deploy requires it: the member intake" >&2
  echo "  reads the recorded account rulings and the board roster from it, and a database built" >&2
  echo "  without them is wrong in ways nothing afterwards reports." >&2
  exit 1
fi

# Set by the production gate below once the operator has typed the host password,
# and read twice afterwards: the credential-file block skips itself for production,
# and the handoff pipes the typed value instead of the file. Declared here so both
# readers are safe under `set -u` on a staging run, where the gate never fires.
PROD_PASSWORD_TYPED=0

# Set by the production gate when it asks what happens to the media bucket, and
# appended to the orchestrator's arguments at the handoff. Declared here so the
# handoff is safe under `set -u` on a staging run, where the gate never fires.
PROD_MEDIA_ARGS=()

# Production hard-confirm gate. EVERY production deploy through this wrapper
# requires a person at a terminal, whatever the mode. A code-only deploy does not
# touch the database, but it still replaces what the public is served, so no
# automated caller gets to make that change unattended: the confirmation is read
# from the terminal device, and a run with no terminal is refused rather than
# waved through. The database-touching modes add their own warning inside the same
# gate, so a production deploy costs one typed word rather than two, and the host
# password is asked for in the same place so the whole interaction is one stop.
#
# The gate fires here, before any preflight, so the operator sees the warning
# before incidental tools like ssh/jq/sqlite checks consume time.
if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-production" ]]; then
  PROD_DB_TOUCHING=0
  if (( DB_REBUILD_INVOLVED == 1 || MODE_REUSE == 1 )); then
    PROD_DB_TOUCHING=1
  fi
  echo "" >&2
  echo "═══════════════════════════════════════════════════════════════" >&2
  if (( PROD_DB_TOUCHING == 1 )); then
    echo "  PRODUCTION DB-TOUCHING DEPLOY" >&2
  else
    echo "  PRODUCTION DEPLOY" >&2
  fi
  echo "═══════════════════════════════════════════════════════════════" >&2
  echo "  Target:     footbag-production" >&2
  if (( MODE_REUSE == 1 )); then
    echo "  Mode:       reuse local DB (-r) — ships current ./database/footbag.db" >&2
  elif (( PROD_DB_TOUCHING == 1 )); then
    echo "  Mode:       full rebuild from sources" >&2
  else
    echo "  Mode:       code only — the on-host database is left alone" >&2
  fi
  if (( PROD_DB_TOUCHING == 1 )); then
    echo "  Effect:     The on-host production database will be REPLACED" >&2
    echo "              with the workstation-built file. This is irreversible" >&2
    echo "              without an off-host backup taken before the deploy." >&2
  else
    echo "  Effect:     The running release is replaced. Member data is untouched." >&2
  fi
  echo "═══════════════════════════════════════════════════════════════" >&2
  echo "" >&2
  # Ambient state decides nothing. This acknowledgement is produced here, by the
  # typed word, and handed to the leaf; it is never read from the launching shell.
  # An exported value used to skip the prompt outright, which is the same defect
  # the accept-without-asking flag had: a variable left in a profile or inherited
  # from a parent process stood in for a person typing, on the one operation that
  # destroys the live database.
  unset FOOTBAG_PROD_DB_REPLACE_ACK
  # Detect TTY availability via [[ -t ]] tests against fds 0/1/2 BEFORE
  # attempting any read. Reading from /dev/tty can succeed even in
  # subprocess contexts by picking up buffered terminal input from
  # an earlier prompt the operator answered in the parent shell; that
  # makes a read-success/empty-result check unreliable. When none of
  # stdin/stdout/stderr is a TTY (Vitest spawnSync, CI runners, an agent
  # session, systemd units), refuse with a clear message instead of prompting.
  if ! { [[ -t 0 ]] && [[ -t 1 ]] && [[ -t 2 ]]; }; then
    echo "" >&2
    echo "ERROR: a production deploy requires interactive confirmation, but stdin/stdout/stderr are not all TTYs." >&2
    echo "Recommendation: run it from a terminal. There is no non-interactive form of this confirmation." >&2
    exit 1
  fi
  # What happens to the media bucket, asked here or not at all.
  #
  # A rebuild couples the media sync on, because it reseeds curated media and
  # mints new storage keys, so the bytes have to reach the bucket or the rows it
  # just shipped point at objects that are not there. That sync defaults to
  # removing bucket objects with no local counterpart, and the leaf refuses to do
  # that on anything but staging. The refusal is right and it arrived in the wrong
  # place: at the end of step one, after the whole local database had been
  # rebuilt, and after this gate had already taken a typed word and a password,
  # telling the operator to start over with a flag. An intent nobody stated is a
  # question, so it is asked here, where the answer still costs nothing, and it
  # rides inside the one stop this gate already is. It adds no second password and
  # no second confirmation phrase: the typed word below now covers this answer
  # too, which is why the question comes first.
  #
  # Deleting is deliberately not on the menu. The operator who wants it can say
  # so on the command line, and no prompt default should be able to select it.
  if (( PROD_DB_TOUCHING == 1 && MEDIA_INTENT_NAMED == 0 )); then
    echo "  This rebuild reseeds curated media under new storage keys, so the bytes" >&2
    echo "  need to reach the bucket or the rows it ships point at objects that are" >&2
    echo "  not there. Nothing in the bucket is deleted either way." >&2
    echo "" >&2
    printf "  Skip the media upload, leaving the bucket exactly as it is? [y/N] " >&2
    if ! read -r _media </dev/tty 2>/dev/null; then
      echo "" >&2
      echo "ERROR: a production deploy requires interactive confirmation, but no TTY is available." >&2
      exit 1
    fi
    # Asked in the negative so the empty answer is the one that leaves the shipped
    # rows resolvable, and so this prompt defaults to no like every other prompt in
    # this file. Skipping has to be typed.
    if [[ "${_media:-}" =~ ^[Yy]$ ]]; then
      PROD_MEDIA_ARGS=(--no-media)
      echo "  → Media upload skipped. The bucket is left exactly as it is, and any" >&2
      echo "    row shipped under a new storage key will not resolve until those" >&2
      echo "    bytes are uploaded separately." >&2
    else
      PROD_MEDIA_ARGS=(-W)
      echo "  → Media uploaded additively, nothing deleted." >&2
    fi
    echo "" >&2
  fi
  printf "  Type 'APPLY' to confirm: " >&2
  if ! read -r _ack </dev/tty 2>/dev/null; then
    echo "" >&2
    echo "ERROR: a production deploy requires interactive confirmation, but no TTY is available." >&2
    echo "Recommendation: run it from a terminal. There is no non-interactive form of this confirmation." >&2
    exit 1
  fi
  if [[ "$_ack" != "APPLY" ]]; then
    echo "Aborted. Confirmation did not match." >&2
    exit 1
  fi
  echo "  → Confirmed. Proceeding." >&2
  echo "" >&2
  # Thread the confirmed ack through to the leaf, for the modes that need it:
  # deploy-rebuild.sh refuses a production database replacement without it, so a
  # direct leaf invocation cannot bypass this typed confirmation.
  if (( PROD_DB_TOUCHING == 1 )); then
    export FOOTBAG_PROD_DB_REPLACE_ACK=1
  fi

  # The host sudo password is typed for production, never read from a file. The
  # word above proves a person is present; it cannot prove which person, and on a
  # workstation where the credential file is readable those are different
  # properties: anyone who can read that file and reach a terminal could deploy
  # what the public is served. Staging keeps the file read, deliberately, because
  # its data is disposable and typing a password on every staging deploy is
  # friction that buys nothing.
  #
  # Asked for here rather than just before the handoff, so production costs one
  # interaction instead of a word now and a password after every preflight. The
  # cost of that choice is real and small: a later preflight refusal wastes a
  # typed password. The terminal test above has already run, so the read below
  # cannot be satisfied by anything but a person.
  printf "  Host sudo password for footbag-production: " >&2
  if ! read -rs _PROD_SUDO_PASS </dev/tty 2>/dev/null; then
    echo "" >&2
    echo "ERROR: could not read the host password from the terminal." >&2
    echo "Recommendation: run it from a terminal. There is no file fallback for production." >&2
    exit 1
  fi
  echo "" >&2
  if [[ -z "$_PROD_SUDO_PASS" ]]; then
    echo "ERROR: a production deploy will not proceed on an empty password." >&2
    exit 1
  fi
  PROD_PASSWORD_TYPED=1
  echo "  → Password captured. It is piped to the deploy and never written down." >&2
  echo "" >&2
fi

# CUTOVER-REMOVE: --seed-test-personas is allowlisted to a single explicit
# deploy target: DEPLOY_TARGET=footbag-staging. Any other target is refused
# before the SSH connection. The persona catalog is code (canonicalPersonas.ts),
# so this flag carries a signal only; there is no .local JSON payload to
# pre-validate. Defense in depth: the testkit import guard still throws when
# FOOTBAG_ENV=production.
if (( SEED_TEST_PERSONAS == 1 )); then
  _persona_target="${DEPLOY_TARGET:-footbag-staging}"
  if [[ "$_persona_target" != "footbag-staging" ]]; then
    echo "ERROR: --seed-test-personas is allowlisted to DEPLOY_TARGET=footbag-staging only (got '$_persona_target')." >&2
    echo "Recommendation: persona seeding must never reach production or any other environment. Remove the flag, or set DEPLOY_TARGET=footbag-staging explicitly if you intended to seed staging." >&2
    exit 1
  fi
fi

# CUTOVER-REMOVE: --refresh-test-personas carries the same staging-only
# allowlist as the seed, and is refused earlier and harder besides: it deletes
# persona-owned rows, so a target confusion would destroy test state rather than
# merely add to it.
if (( REFRESH_TEST_PERSONAS == 1 )); then
  _persona_target="${DEPLOY_TARGET:-footbag-staging}"
  if [[ "$_persona_target" != "footbag-staging" ]]; then
    echo "ERROR: --refresh-test-personas is allowlisted to DEPLOY_TARGET=footbag-staging only (got '$_persona_target')." >&2
    echo "Recommendation: the persona rebuild deletes persona-owned rows and must never reach production or any other environment. Remove the flag, or set DEPLOY_TARGET=footbag-staging explicitly if you intended to rebuild the staging personas." >&2
    exit 1
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
# Exported, not merely assigned. The legacy member load two scripts down reads
# DEPLOY_TARGET to decide whether the recorded account rulings and the board
# roster are mandatory, and it reaches that decision only if the value is in the
# environment. It is today, because an operator has to set it for the SSH alias
# to resolve at all -- but that is inheritance from the invocation rather than
# anything this script guarantees, and the failure mode if it ever stops holding
# is a development-shaped member load onto production that raises no error.
export DEPLOY_TARGET="${DEPLOY_TARGET:-footbag-staging}"
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

# Schema-drift preflight for the one mode that ships a database it did not
# build: -r / --reuse-local-db takes database/footbag.db as it stands and pushes
# it, so a schema.sql that has moved on since that file was last rebuilt means
# shipping a database the deployed code will crash against on the first query
# touching a new column.
#
# It deliberately does NOT gate the rebuild modes. --from-csv, --soup-to-nuts,
# --db-only and --all-data all drop the database file and reapply schema.sql
# (see the mode table in scripts/deploy-local-data.sh), so drift in the current
# file is exactly what they are about to fix. Gating them refused a deploy on
# the grounds that it had not yet done the thing it was about to do, and sent
# the operator to run the rebuild by hand first -- by hand, through a script the
# testing rules forbid on a workstation holding real legacy data, when the mode
# they had already chosen would have reached the same rebuild through the
# sanctioned wrapper.
#
# We compare actual column-sets (not mtimes): a crashed pipeline run leaves
# the live DB with a fresh mtime even though its schema is still stale, so
# mtime-based checks pass silently after every failed attempt.
if (( MODE_REUSE == 1 )) \
    && [[ "${FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK:-}" != "1" ]] \
    && [[ -f database/footbag.db ]] && [[ -f database/schema.sql ]]; then
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
      echo "       Drift detected between the local DB and the declared schema:" >&2
      for _line in "${_drift_lines[@]}"; do echo "$_line" >&2; done
      echo "" >&2
      echo "       -r / --reuse-local-db ships this database as it stands, without" >&2
      echo "       reapplying schema.sql, so the deployed application would crash on" >&2
      echo "       the first query touching a column the file does not have." >&2
      echo "" >&2
      echo "  Aborted. Rebuild the local database with a mode that reapplies the" >&2
      echo "  schema, then deploy that instead of reusing this file:" >&2
      echo "    bash deploy_to_aws.sh --from-csv        (rebuild from canonical CSVs)" >&2
      echo "    bash deploy_to_aws.sh --all-data        (the same, plus the member intake)" >&2
      echo "" >&2
      echo "  Both drop and rebuild the database before shipping it, so neither needs" >&2
      echo "  a separate reset step first." >&2
      echo "" >&2
      echo "  To rebuild locally without deploying:" >&2
      echo "    bash scripts/deploy-local-data.sh --from-csv" >&2
      echo "" >&2
      echo "  Or set FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK=1 to ship this file anyway." >&2
      exit 1
    fi
  fi
  rm -f "${_drift_tmp_db}" "${_drift_tmp_db}-wal" "${_drift_tmp_db}-shm"
  trap - EXIT
fi

# Operator credential source, for staging only. Production has none: its host
# password was typed at the gate above, so there is no file to resolve, nothing to
# check for readability and no mode to enforce. An AWS_OPERATOR_FILE aimed at a
# production run is ignored rather than honoured, because a variable that could
# redirect the read would leave the typed gate one environment variable away from
# gone, which is precisely the defect the inherited database-replacement
# acknowledgement used to have.
if (( PROD_PASSWORD_TYPED == 1 )); then
  if [[ -n "${AWS_OPERATOR_FILE:-}" ]]; then
    echo "NOTICE: AWS_OPERATOR_FILE is ignored for a production deploy; the host" >&2
    echo "        password was typed at the terminal. Staging still reads its file." >&2
    echo "" >&2
  fi
else
  # Default path is per-environment so a stale AWS_OPERATOR env var bleed cannot
  # accidentally feed one environment's credentials into another's deploy.
  # Explicit AWS_OPERATOR_FILE overrides the default. Generic error: never print
  # the resolved path.
  if [[ -z "${AWS_OPERATOR_FILE:-}" ]]; then
    AWS_OPERATOR_FILE="$HOME/AWS/AWS_OPERATOR.txt"
  fi
  if [[ ! -r "$AWS_OPERATOR_FILE" ]]; then
    echo "ERROR: operator credential source unavailable." >&2
    echo "Recommendation: verify the configured credential location is readable." >&2
    exit 1
  fi

  # The file holds a host sudo password, so anything readable beyond its owner is
  # an exposure rather than an inconvenience: every account on the workstation can
  # read it, and nothing else in the chain would notice. The requirement is
  # already the documented one; this refuses rather than trusting it, because a
  # wrong mode is silent and can persist for months. Generic message: never print
  # the resolved path.
  _cred_mode=$(stat -c '%a' "$AWS_OPERATOR_FILE" 2>/dev/null || echo "")
  if [[ "$_cred_mode" != "600" && "$_cred_mode" != "400" ]]; then
    echo "ERROR: operator credential file has mode ${_cred_mode:-unknown}; expected 600 (or 400)." >&2
    echo "Recommendation: restrict it to its owner, then rotate the password it holds," >&2
    echo "                since a readable file must be assumed to have been read." >&2
    exit 1
  fi
fi

# Code-only schema-sync (the bare default, or -k). A code-only deploy ships new
# TS but does NOT reapply schema.sql on the host, so code that depends on a
# table or column not yet on the host crashes at runtime. There is no in-place
# migration by design, so the remedy is a rebuild. Compare database/schema.sql
# against the schema of the DB the host actually runs on (read-only over SSH;
# key auth, no operator password, no sudo, </dev/null so the credential pipe is
# untouched). Git state is irrelevant — we compare against what is DEPLOYED, not
# what is committed. Best-effort: any failure to read the host schema warns and
# proceeds. Runs after the AWS_OPERATOR_FILE check so the more fundamental
# credential error fires first.
if (( MODE_CODE_ONLY == 1 )) \
    && [[ "${FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK:-}" != "1" ]] \
    && command -v sqlite3 >/dev/null 2>&1 \
    && [[ -f database/schema.sql ]]; then
  # Structural fingerprint: sorted "table|column" rows. Tables only — indexes
  # and triggers don't cause the missing-column crash we guard against.
  _schema_fp_query="SELECT m.name || '|' || p.name
                    FROM sqlite_schema m JOIN pragma_table_info(m.name) p
                    WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'
                    ORDER BY 1;"

  # Expected: build a throwaway DB from schema.sql and fingerprint it.
  _exp_db=$(mktemp -t schema_expect.XXXXXX.db)
  _expected_fp=""
  if sqlite3 "${_exp_db}" < database/schema.sql >/dev/null 2>&1; then
    _expected_fp=$(sqlite3 "${_exp_db}" "${_schema_fp_query}" 2>/dev/null || true)
  fi
  rm -f "${_exp_db}" "${_exp_db}-wal" "${_exp_db}-shm"

  # Actual: the schema of the DB the host runs on. Resolve FOOTBAG_DB_PATH from
  # the deployed DB, from inside the web container.
  #
  # This used to read /srv/footbag/env over a plain ssh to resolve
  # FOOTBAG_DB_PATH, then run the host's sqlite3 against it. Neither half was
  # reachable: the env file is root:root 0600 and the database is 0600 owned by
  # another account, so the remote body exited before it read anything and the
  # check took its "could not read" branch on every single deploy. A guard that
  # cannot fire is worse than none, because its silence reads as agreement.
  #
  # The container is the one route needing no elevation: it already has the path
  # in its environment and the file on a mount, and the operator is in the
  # host's docker group. It has no sqlite3, so the fingerprint is taken with the
  # driver the application itself bundles. Body cat-piped rather than quoted
  # inline, the same way the remote halves travel.
  _fp_js="scripts/internal/host-db-fingerprint.js"
  if [[ -r "$_fp_js" ]]; then
    _host_fp=$(ssh "$DEPLOY_TARGET" '
      c=$(docker ps --filter "name=web" --format "{{.Names}}" 2>/dev/null | head -1)
      [ -n "$c" ] || exit 9
      docker exec -i "$c" node
    ' < "$_fp_js" 2>/dev/null) || _host_fp="__UNREACHABLE__"
  else
    _host_fp="__UNREACHABLE__"
  fi

  if [[ -z "$_expected_fp" ]]; then
    echo "WARNING: schema-sync check could not read database/schema.sql; skipping." >&2
  elif [[ "$_host_fp" == "__UNREACHABLE__" ]]; then
    echo "WARNING: schema-sync check could not read the deployed DB schema on '$DEPLOY_TARGET'" >&2
    echo "         (host unreachable, /srv/footbag/env or DB missing, or sqlite3 absent on host)." >&2
    echo "         Proceeding with the code-only deploy without a schema-drift check." >&2
  elif [[ "$_host_fp" != "$_expected_fp" ]]; then
    echo "" >&2
    echo "WARNING: database/schema.sql differs from the DB schema deployed on '$DEPLOY_TARGET'." >&2
    echo "         A code-only deploy does NOT reapply schema on the host, so code that depends" >&2
    echo "         on the changed tables/columns will crash at runtime. There is no in-place" >&2
    echo "         migration; the fix is a rebuild that ships a fresh schema + DB." >&2
    echo "" >&2
    if [[ "${FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT:-}" == "1" ]]; then
      echo "  FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT=1 → proceeding code-only despite schema drift." >&2
    elif (( HAS_MODE == 0 )); then
      # A bare invocation states no intent about the database, so on drift there
      # is no answer this script can supply for the operator. It used to offer a
      # rebuild here with the prompt defaulting to yes, which meant a keystroke
      # meant as "get on with the deploy" re-ran the whole thing as a deploy that
      # replaces the deployed database. Declining was no better: it shipped code
      # against a schema it does not match, which the warning above says will
      # crash at runtime. Neither outcome is one an empty answer should be able
      # to select, so both now require the operator to say which they mean. This
      # is the same refusal the no-terminal branch below already makes, and it is
      # why that branch is no longer a special case.
      echo "ERROR: schema drift detected and this deploy states no intent for the database." >&2
      echo "Choose one explicitly and re-run:" >&2
      echo "  bash deploy_to_aws.sh -k         ship code only, leaving the deployed DB alone" >&2
      echo "  bash deploy_to_aws.sh --from-csv rebuild and REPLACE the deployed DB" >&2
      echo "" >&2
      echo "Code-only against a drifted schema is expected to crash at runtime; the rebuild" >&2
      echo "destroys the deployed database. Neither is a safe default, which is why there" >&2
      echo "is no longer one." >&2
      exit 1
    elif [[ -r /dev/tty ]]; then
      # Explicit -k: operator deliberately chose code-only. Confirm, default no.
      printf "  Proceed with code-only deploy despite schema drift? [y/N] " >&2
      read -r _ans </dev/tty || _ans=""
      if ! [[ "${_ans:-}" =~ ^[Yy]$ ]]; then
        echo "Aborted. Run a rebuild deploy (bash deploy_to_aws.sh --from-csv), or set" >&2
        echo "  FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT=1 to ship code-only despite drift." >&2
        exit 1
      fi
    else
      # Non-interactive and not acked: refuse rather than silently ship a crash.
      echo "ERROR: schema drift detected and no TTY to confirm." >&2
      echo "Recommendation: run a rebuild deploy (bash deploy_to_aws.sh --from-csv), or set" >&2
      echo "  FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT=1 to ship code-only anyway, or" >&2
      echo "  FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK=1 to skip this check." >&2
      exit 1
    fi
  fi
fi

# -----------------------------------------------------------------------------
# Pre-deploy summary. No paths, no secrets; just mode + target + host IP.
# Helps the operator catch a wrong DEPLOY_TARGET before the deploy proceeds.
# -----------------------------------------------------------------------------
# To stderr, for the reason both leaves send their own banners there: the
# production origin address is deliberately not public, because the host's web
# port is scoped to the CDN's origin ranges and publishing the address gives away
# what that scoping withholds. Standard output is what a wrapper, a
# continuous-integration job or an agent session captures, and this summary runs
# before the leaves do, so moving only their banners left the address reaching the
# capture anyway through the very first thing an operator runs. The operator still
# sees every line, because a terminal receives both streams.
echo "──────────────────────────────────────────────────────────" >&2
echo "  Deploy mode:    $*" >&2
echo "  Target alias:   $DEPLOY_TARGET" >&2
echo "  Resolved host:  $RESOLVED_HOST" >&2
echo "──────────────────────────────────────────────────────────" >&2

# Hand the host password to the orchestrator on stdin instead of as a positional
# arg. argv-leak hardening: the password never appears in any process's argv on
# the operator workstation, and everything downstream reads exactly one line
# (require_operator_stdin in scripts/lib/host-env-remote.sh), so a typed line and
# a file's first line are interchangeable.
#
# Production sends the typed value through a process substitution, which is a pipe
# on every bash. A here-string is the obvious shorthand and is avoided here because
# its backing store is not guaranteed: bash before 5.1 wrote every here-document to
# a temp file, and 5.1 still falls back to one above a size threshold (measured on
# 5.1.16: a short value gets a pipe, 64 KB gets /tmp/sh-thd.XXXXXX, unlinked but on
# disk). A password is short, so today's bash would keep it in a pipe either way;
# the point is that the guarantee comes from the construct rather than from the
# version and the length, and this is not a value to make that bet about.
# exec replaces this process image, so the variable does not outlive the handoff.
#
# PROD_MEDIA_ARGS carries the media intent the production gate asked for, appended
# rather than substituted: an operator who named one of the media flags themselves
# never reached that question, so the array is empty and the arguments are exactly
# what they typed.
if (( PROD_PASSWORD_TYPED == 1 )); then
  exec bash "$ORCHESTRATOR" "$@" "${PROD_MEDIA_ARGS[@]+"${PROD_MEDIA_ARGS[@]}"}" \
    < <(printf '%s\n' "$_PROD_SUDO_PASS")
else
  exec bash "$ORCHESTRATOR" "$@" "${PROD_MEDIA_ARGS[@]+"${PROD_MEDIA_ARGS[@]}"}" \
    < "$AWS_OPERATOR_FILE"
fi
