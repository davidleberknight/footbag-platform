/**
 * Every built database anchors its migration ledger to the schema it was built
 * from.
 *
 * A database is built from database/schema.sql, so its ledger starts empty, and
 * the first migration after go-live would land on a chain with no recorded
 * starting point. The build therefore writes one baseline row,
 * 'baseline:schema.sql', carrying the checksum of the schema bytes it used, ahead
 * of the rows that record bundled migrations as already applied.
 *
 * The build's own ledger lines are lifted from scripts/reset-local-db.sh and run
 * against a scratch database holding the real schema, so the code driven is the
 * shipped code without running the whole data build.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const scratch = createScratchDir('schema-baseline');
afterAll(() => removeScratch(scratch));

describe('the schema baseline row', () => {
  // Defect caught: a built database carries no anchor, so a later divergence
  // between production and a fresh build has nothing to be measured against.
  it('records the checksum of the schema bytes the database was built from', () => {
    const builder = readFileSync(join(REPO_ROOT, 'scripts/reset-local-db.sh'), 'utf8');
    const start = builder.indexOf('_schema_sum="$(sha256sum');
    const end = builder.indexOf('\ndone\n', start);
    expect(start, 'the baseline lines were not found in the build').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const db = join(scratch, 'built.db');
    const schema = join(REPO_ROOT, 'database/schema.sql');
    const setup = spawnSync('sqlite3', [db], { input: readFileSync(schema, 'utf8'), encoding: 'utf8', ...SPAWN_GUARD });
    expect(setup.status, setup.stderr).toBe(0);

    const harness = join(scratch, 'baseline.sh');
    writeFileSync(harness, [
      'set -euo pipefail',
      `cd ${JSON.stringify(REPO_ROOT)}`,
      `DB_FILE=${JSON.stringify(db)}; SCHEMA=database/schema.sql`,
      builder.slice(start, end + '\ndone'.length),
    ].join('\n'));
    const res = spawnSync('bash', [harness], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);

    const expected = createHash('sha256').update(readFileSync(schema)).digest('hex');
    const conn = new BetterSqlite3(db, { readonly: true });
    try {
      const row = conn.prepare("SELECT checksum, applied_by FROM schema_migrations WHERE filename = 'baseline:schema.sql'").get() as
        { checksum: string; applied_by: string } | undefined;
      expect(row, 'no baseline row was written').toBeDefined();
      expect(row!.checksum).toBe(expected);
      expect(row!.applied_by).toBe('reset-local-db.sh');
    } finally {
      conn.close();
    }
  });
});
