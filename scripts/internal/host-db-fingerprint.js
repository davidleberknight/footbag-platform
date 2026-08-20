// Structural fingerprint of the database a deployed host is actually running,
// printed as sorted "table|column" lines. Read by the schema-drift check in
// deploy_to_aws.sh, which compares it against the same fingerprint taken from
// database/schema.sql.
//
// Never run directly. It is piped into the web container:
//   cat scripts/internal/host-db-fingerprint.js \
//     | ssh REMOTE 'docker exec -i <web-container> node'
//
// It runs inside the container rather than on the host because nothing else can
// read the database without a password. /srv/footbag/env is root:root 0600, so
// the operator cannot resolve FOOTBAG_DB_PATH from it, and the database file
// itself is 0600 owned by another account, so even with the path a plain ssh
// sqlite3 is refused. The container already has the path in its environment and
// the file on a mount, and the operator is in the host's docker group, so this
// is the one route that needs no elevation. The host has sqlite3 and the
// container does not, which is why this is JavaScript against the driver the
// application already bundles.
//
// Tables and columns only: indexes and triggers do not cause the missing-column
// crash the check exists to prevent, and including them would report drift for
// changes that break nothing.
//
// Any failure exits non-zero with a message on stderr, so the caller reports
// "could not read" rather than mistaking an empty fingerprint for agreement.

'use strict';

const path = process.env.FOOTBAG_DB_PATH;
if (!path) {
  process.stderr.write('FOOTBAG_DB_PATH is not set in the container environment\n');
  process.exit(9);
}

let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  process.stderr.write(`better-sqlite3 unavailable in the container: ${err.message}\n`);
  process.exit(8);
}

let db;
try {
  db = new Database(path, { readonly: true, fileMustExist: true });
} catch (err) {
  process.stderr.write(`cannot open ${path}: ${err.message}\n`);
  process.exit(9);
}

try {
  const rows = db
    .prepare(
      `SELECT m.name || '|' || p.name AS fp
         FROM sqlite_schema m JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
        ORDER BY 1`,
    )
    .pluck()
    .all();
  if (rows.length === 0) {
    process.stderr.write('the deployed database reported no tables\n');
    process.exit(7);
  }
  process.stdout.write(`${rows.join('\n')}\n`);
} catch (err) {
  process.stderr.write(`fingerprint query failed: ${err.message}\n`);
  process.exit(6);
} finally {
  db.close();
}
