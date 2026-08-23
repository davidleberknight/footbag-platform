#!/usr/bin/env bash
# Execute the database-backed freestyle integrity guards against a built database.
#
# These guards assert over loaded data. Without a database they answer their
# precondition with a skip, and a skip reads as success, so a run that never has
# one reports green while checking nothing. This script is the run that declares
# it owns a database: FOOTBAG_REQUIRE_DB=1 turns an unmet precondition into a
# failure, so the guards either execute or the step fails.
#
# Usage: FOOTBAG_TEST_DB=/path/to/built.db scripts/ci/run_db_integrity_guards.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ -z "${FOOTBAG_TEST_DB:-}" ]; then
  echo "FOOTBAG_TEST_DB is required: name the built database these guards must read." >&2
  exit 1
fi

if [ ! -f "$FOOTBAG_TEST_DB" ]; then
  echo "FOOTBAG_TEST_DB points at no file: $FOOTBAG_TEST_DB" >&2
  echo "The guards cannot run without a built database, and skipping them is what this step exists to prevent." >&2
  exit 1
fi

# One source of truth for which guards must run: the registry the tests police.
guards=$(python3 -c "import sys; sys.path.insert(0, 'legacy_data/tests'); import built_db; print(' '.join('legacy_data/tests/' + g for g in built_db.REQUIRED_DB_INTEGRITY_GUARDS))")

if [ -z "$guards" ]; then
  echo "the required-guard registry is empty; nothing would be verified" >&2
  exit 1
fi

echo "database: $FOOTBAG_TEST_DB"
echo "guards:"
printf '  %s\n' $guards

# -p no:randomly and an explicit file list keep the executed set equal to the
# registry, so "passed" cannot mean "collected nothing".
FOOTBAG_REQUIRE_DB=1 PYTHONDONTWRITEBYTECODE=1 \
  python3 -m pytest $guards -q -p no:cacheprovider --no-header -rs
