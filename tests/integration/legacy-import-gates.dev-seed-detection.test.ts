/**
 * The legacy import gates separate a dataset with no authoritative member export
 * behind it from one that has begun loading it. That distinction decides whether a
 * failing real_name or honor-flag gate means missing data or a real defect, so it
 * carries its own exit status: an orchestrator running against a dev seed skips
 * those gates, while a cutover consumer blocking on any non-zero still stops.
 *
 * It keys on the provenance value the export itself writes. Keying on "any
 * provenance other than mirror" instead would be defeated by the seeded persona
 * catalog and the collision stub, which carry provenance values of their own and
 * would make a dev seed read as a real load.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3438');

// Exit status of the gate script against this file's database. The script fails
// non-zero whenever any gate fails, so the status is the contract under test, not
// the pass/fail lines it prints.
function gateExitStatus(): number {
  try {
    execFileSync('bash', ['scripts/validate-legacy-import-gates.sh'], {
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
      stdio: 'pipe',
    });
    return 0;
  } catch (err) {
    return (err as { status: number }).status;
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const { insertLegacyMember } = await import('../fixtures/factories');

  // A mirror-derived population: the roster name is present, the legal name is not.
  insertLegacyMember(db, {
    legacy_member_id: '910001', real_name: null, display_name: 'Mirror One', import_source: 'mirror',
  });
  insertLegacyMember(db, {
    legacy_member_id: '910002', real_name: null, display_name: 'Mirror Two', import_source: 'mirror',
  });
  // The seeded scaffolding that ships with a dev build, each carrying its own
  // provenance value rather than the mirror's.
  insertLegacyMember(db, {
    legacy_member_id: 'legmem_persona_probe', real_name: 'Pat Persona', import_source: 'test',
  });
  insertLegacyMember(db, {
    legacy_member_id: 'STUB_PROBE', real_name: 'Stub Placeholder', import_source: 'system_fixture',
  });
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('legacy import gates: authoritative-load detection', () => {
  it('reports a dev seed carrying seeded scaffolding as having no authoritative load', async () => {
    expect(gateExitStatus()).toBe(78);
  });

  it('reports an ordinary failure once the export has written its first row', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { insertLegacyMember } = await import('../fixtures/factories');
    const db = new BetterSqlite3(dbPath);
    insertLegacyMember(db, {
      legacy_member_id: '910003', real_name: 'Exported Person', import_source: 'legacy_site_data',
    });
    db.close();

    expect(gateExitStatus()).toBe(1);
  });
});
