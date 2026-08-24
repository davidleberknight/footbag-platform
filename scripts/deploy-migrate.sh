#!/usr/bin/env bash
# ============================================================================
# deploy-migrate.sh
#
# Deploys the working tree AND applies a schema migration to the live database,
# preserving every row already there. This is the data-preserving deploy: the
# path a fix that needs a schema change takes once the host holds data worth
# keeping, which after the cutover is always.
#
# It is deliberately the same orchestration as deploy-code.sh rather than a
# second one. The migration has exactly one safe window — after the new code is
# in place and before the service comes back up — and that window lives inside
# the remote half both scripts share. Forking the orchestration to get at it
# would mean two deploy paths to keep correct, and the second one would be the
# one nobody exercises.
#
# What it does, in order:
#   1. Refuses without a migration file, and refuses a file it cannot read.
#   2. Shows the operator the migration and requires them to confirm it.
#   3. Hands the file to the shared deploy, which promotes the code.
#   4. Stops the service, copies the database, applies the migration and its
#      ledger row in one transaction, and checks integrity and foreign keys.
#   5. Restores the copy and restarts if any of that fails.
#   6. Restarts and smokes exactly as an ordinary deploy does.
#
# Each migration is applied at most once. The host records the filename and a
# checksum of its bytes, so naming the same file again is a no-op rather than a
# second ALTER, and naming a file that has been edited since it was applied is
# refused: the database no longer matches the file that claims to describe it,
# and the fix is a new migration rather than a re-run.
#
# When to use:
#   - a schema change (ALTER TABLE, CREATE TABLE, CREATE INDEX) against a
#     database whose rows must survive
#   - an additive backfill against live data
#
# When NOT to use:
#   - code-only changes with no schema change (deploy-code.sh)
#   - a rebuild from seed, where the live data is disposable (deploy-rebuild.sh)
#
# RESTORE DRILL. The safety of this script rests on the pre-migration copy it
# takes, and on a restore path that has been rehearsed rather than assumed. The
# drill is tracked as its own card and is an operator action; run it before
# relying on this script for anything you could not afford to lose.
#
# Reads the sudo password from stdin (line 1), like every other operator script
# here, so nothing secret reaches an argument list on either machine:
#   < <operator credential file> bash scripts/deploy-migrate.sh --migration path/to/change.sql
# ============================================================================

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: < <operator credential file> bash scripts/deploy-migrate.sh --migration <file.sql> [options]

  --migration <file>  Required. SQL applied to the live database in one transaction.
                      A bare name resolves against database/migrations/.
  --yes               Skip the confirmation prompt (for a scripted recovery).
  -h, --help          This message.

Every other option and environment variable behaves exactly as in
scripts/deploy-code.sh, which this reuses.
USAGE
  exit "${1:-0}"
}

MIGRATION_FILE=""
ASSUME_YES="no"
PASSTHROUGH=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --migration) MIGRATION_FILE="${2:-}"; shift 2 ;;
    --yes)       ASSUME_YES="yes"; shift ;;
    -h|--help)   usage 0 ;;
    *)           PASSTHROUGH+=("$1"); shift ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "${SCRIPT_DIR}/../database/migrations" 2>/dev/null && pwd || true)"

[[ -n "$MIGRATION_FILE" ]] \
  || die "--migration is required; use scripts/deploy-code.sh for a code-only deploy"

# A bare name resolves against the migrations directory, so the usual invocation
# names the migration rather than a path into the checkout. A path still works,
# for a one-off written outside the tree.
if [[ "$MIGRATION_FILE" != */* && -n "$MIGRATIONS_DIR" && -r "${MIGRATIONS_DIR}/${MIGRATION_FILE}" ]]; then
  MIGRATION_FILE="${MIGRATIONS_DIR}/${MIGRATION_FILE}"
fi

[[ -r "$MIGRATION_FILE" ]] || die "cannot read migration file '${MIGRATION_FILE}'"
[[ -s "$MIGRATION_FILE" ]] || die "migration file '${MIGRATION_FILE}' is empty"

MIGRATION_SQL="$(cat "$MIGRATION_FILE")"

# The host records what it applied under this name, so the name has to be stable
# and safe to embed in the SQL that writes that record. The character set is
# restricted rather than escaped: a migration filename has no reason to contain
# anything else, and a rejected name is a better outcome than a quoted one.
MIGRATION_NAME="$(basename "$MIGRATION_FILE")"
if ! printf '%s' "$MIGRATION_NAME" | grep -qE '^[A-Za-z0-9][A-Za-z0-9._-]*$'; then
  die "migration filename '${MIGRATION_NAME}' must contain only letters, digits, dot, dash and underscore"
fi

# Identifies the exact bytes that were applied. A later deploy naming this file
# again can then tell "already applied" from "edited since it was applied",
# which is a different and much worse situation.
MIGRATION_CHECKSUM="$(sha256sum "$MIGRATION_FILE" | cut -d' ' -f1)"

# The migration is wrapped in one transaction by the remote half, so a file that
# opens its own leaves a transaction inside a transaction and SQLite refuses it.
# Caught here, where the operator can fix the file, rather than on the host with
# the service already stopped.
if printf '%s' "$MIGRATION_SQL" | grep -qiE '^[[:space:]]*(BEGIN|COMMIT|ROLLBACK)\b'; then
  die "migration file must not manage its own transaction: the deploy wraps it in one"
fi

# Shown rather than summarised. This is the one deploy step that can destroy
# data no rebuild can recreate, and an operator who has not read the statements
# is not in a position to confirm them.
echo "Migration: ${MIGRATION_NAME}"
echo "The following SQL will be applied to the LIVE database:"
echo "----------------------------------------------------------------------"
printf '%s\n' "$MIGRATION_SQL"
echo "----------------------------------------------------------------------"
echo "A copy of the database is taken immediately beforehand and restored if"
echo "the migration or its integrity checks fail."
echo

if [[ "$ASSUME_YES" != "yes" ]]; then
  # From the terminal, never stdin: stdin carries the sudo password, and a read
  # against it would consume the credential as the answer and echo it on the
  # failed comparison.
  [[ -r /dev/tty ]] || die "no terminal available to confirm on; pass --yes deliberately instead"
  printf 'Type APPLY to continue: ' > /dev/tty
  IFS= read -r reply < /dev/tty
  [[ "$reply" == "APPLY" ]] || die "not confirmed; nothing was deployed and nothing was migrated"
fi

# The shared deploy reads the sudo password from its own stdin, so this hands
# its stdin straight through rather than consuming it here.
export MIGRATION_SQL MIGRATION_NAME MIGRATION_CHECKSUM
exec bash "${SCRIPT_DIR}/deploy-code.sh" "${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}"
