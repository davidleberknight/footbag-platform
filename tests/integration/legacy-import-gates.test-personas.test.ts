/**
 * The shared-address gate judges the loaded legacy data, not the test personas
 * seeded beside it.
 *
 * A workstation or staging database holds the real member load and the test
 * personas together. One persona puts its sign-in address on a second account
 * on purpose, to exercise the claim path where an address identifies neither
 * account. That pair is a fixture, and counting it failed the cutover gate on
 * every database the personas reached. A persona sharing an address with a row
 * the export loaded is a different matter: it could reach a real person's
 * account, so the gate must still refuse it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3442');

/** The gate's stdout, whatever its exit status: other gates fail on these
 *  deliberately thin populations, and the shared-address line is under test. */
function sharedAddressLine(): string {
  let out: string;
  try {
    out = execFileSync('bash', ['scripts/validate-legacy-import-gates.sh'], {
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
      encoding: 'utf8',
      stdio: 'pipe',
      ...SPAWN_GUARD,
    });
  } catch (err) {
    out = (err as { stdout?: string }).stdout ?? '';
  }
  const line = out.split('\n').find((l) => l.startsWith('GATE: G1'));
  expect(line, 'the gate emitted no shared-address line at all').toBeDefined();
  return line!;
}

/** Replace the member population with two accounts sharing one address, the
 *  first on its primary column and the second on a secondary one. */
async function populatePair(firstSource: string, secondSource: string): Promise<void> {
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const { insertLegacyMember } = await import('../fixtures/factories');
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM legacy_members').run();
  insertLegacyMember(db, {
    legacy_member_id: 'legmem_shared_first',
    display_name: 'First Holder',
    legacy_email: 'Shared.Address@example.test',
    import_source: firstSource,
  });
  insertLegacyMember(db, {
    legacy_member_id: 'legmem_shared_second',
    display_name: 'Second Holder',
    legacy_email2: 'shared.address@example.test',
    import_source: secondSource,
  });
  db.close();
}

beforeAll(() => {
  createTestDb(dbPath).close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the shared-address gate counts legacy data, not test personas', () => {
  it('passes an address shared only between two test persona accounts', async () => {
    await populatePair('test', 'test');
    expect(sharedAddressLine()).toContain('G1 PASS');
  });

  it('fails a test persona sharing an address with an export-loaded account', async () => {
    await populatePair('test', 'legacy_site_data');
    expect(sharedAddressLine()).toContain('G1 FAIL: 1 email value(s) shared');
  });

  it('fails an address shared between two export-loaded accounts', async () => {
    await populatePair('legacy_site_data', 'legacy_site_data');
    expect(sharedAddressLine()).toContain('G1 FAIL: 1 email value(s) shared');
  });
});
