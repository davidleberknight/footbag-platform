#!/usr/bin/env bash
# check_migrations_additive.sh
#
# A migration file is additive. It does not drop and it does not rename.
#
# Reason: the migrating deploy promotes the new code and images BEFORE it runs
# the migration, and restoring the pre-migration database on failure does not
# put the old code back. The host therefore comes up running the new release
# against the old schema, and the only thing that makes that state serviceable
# rather than broken is expand-and-contract: add a column in one release, read
# it in the next, remove it in a third once nothing reads it. An additive
# migration is also the only shape that survives a restore to a snapshot taken
# before it ran, which is the recovery path the whole backup story rests on.
#
# A genuine contraction, once that third release arrives, declares itself with a
# `-- CONTRACTION: <why nothing reads this any more>` line, and this gate takes
# that as the acknowledgement rather than blocking work it cannot judge.
#
# Comment lines are exempt from the match, so a header explaining what a
# migration deliberately does not do cannot trip its own gate.
#
# Resolves its own root through git, so a test can stand up a throwaway
# repository and run this inside it rather than writing a fixture into the real
# tree. Delegated from scripts/ci/assert_conventions.sh.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MIGRATIONS_DIR="${ROOT}/database/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[migrations-additive] pass (no migrations directory)"
  exit 0
fi

# The leading group is optional so a statement that BEGINS with the keyword is
# still matched; requiring a character before it silently exempted the plainest
# case of all, a bare `DROP TABLE`. Its first alternative cannot start with a
# dash, which is what keeps a comment describing a drop from being read as one.
destructive=$(grep -rlEi \
  '^[[:space:]]*([^-].*)?(DROP[[:space:]]+(TABLE|INDEX|VIEW|TRIGGER|COLUMN)|RENAME[[:space:]]+(TO|COLUMN))' \
  "$MIGRATIONS_DIR" --include='*.sql' 2>/dev/null || true)

unacknowledged=$(echo "$destructive" | grep -v '^$' \
  | xargs -r grep -L '^-- CONTRACTION:' || true)

if [ -n "$unacknowledged" ]; then
  echo "$unacknowledged" >&2
  echo "  FAIL: a migration must be additive." >&2
  echo "        The deploy promotes new code before the migration runs and does not roll the" >&2
  echo "        code back if it fails, so the release must work against the previous schema." >&2
  echo "        A deliberate contraction declares itself with a header line:" >&2
  echo "          -- CONTRACTION: <why nothing reads this any more>" >&2
  exit 1
fi

migration_count=$(find "$MIGRATIONS_DIR" -name '*.sql' -type f | wc -l | tr -d ' ')
echo "[migrations-additive] pass (${migration_count} migration file(s))"
