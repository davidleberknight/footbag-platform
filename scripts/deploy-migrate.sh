#!/usr/bin/env bash
# ============================================================================
# NOT YET IMPLEMENTED
#
# deploy-migrate.sh
#
# Deploys code changes and runs migration SQL against the existing live
# database. Non-destructive: all existing live data is preserved. New schema
# objects, backfilled rows, and additive data changes are applied in place.
#
# This script becomes the active schema/data-change deploy path once the
# project reaches the point where host data must be preserved. Until then,
# use scripts/deploy-rebuild.sh for schema and seed-data changes.
#
# When to use this script (future):
#   - schema changes (ALTER TABLE, CREATE TABLE, CREATE INDEX) that must
#     not destroy existing data
#   - additive data imports (new records, backfills) against the live DB
#   - any deploy where the host DB contains data worth keeping
#   - replacing scripts/deploy-rebuild.sh as the normal schema/data-change
#     path once the "staging data is disposable" phase ends
#
# When NOT to use this script:
#   - while staging data is still disposable (use deploy-rebuild.sh instead)
#   - for code-only changes with no DB modifications (use deploy-code.sh)
#
# Planned implementation sequence:
#   1.  Confirm SSH connectivity and run local test preflight.
#   2.  Validate that a migration file exists and has been reviewed.
#   3.  Back up the live DB on the host before touching anything.
#       (Prerequisite: Path G §7.4 backup/restore path must be tested first.)
#   4.  Deploy code and images using the same steps as deploy-code.sh.
#   5.  Stop the service.
#   6.  Run migration SQL against the live DB using sqlite3.
#   7.  Verify DB integrity and expected schema objects after migration.
#   8.  Restart the service.
#   9.  Run the smoke check.
#   10. On any failure: restore from the pre-migration backup and restart.
#
# Do not implement this script until the backup/restore path (Path G §7.4)
# is tested and a working restore has been rehearsed in staging. A migration
# without a tested restore path is unsafe.
# ============================================================================

set -euo pipefail

echo "ERROR: deploy-migrate.sh is not yet implemented." >&2
echo "" >&2
echo "Use scripts/deploy-rebuild.sh for schema or seed-data changes during" >&2
echo "the current development phase, while staging data is still disposable." >&2
echo "" >&2
echo "Implement this script once the backup/restore path (Path G §7.4) is" >&2
echo "tested and the project requires non-destructive schema migrations." >&2
exit 1
