/**
 * The provenance gate distinguishes rows the legacy export loaded from system
 * fixtures the export never covered.
 *
 * The local build seeds the member table with fixtures: rows carrying a curated
 * display name and nothing else, whose purpose is to give historical references a
 * stable parent identity before any real export exists. They satisfy "every row
 * carries a populated import source" perfectly, so a check that stopped there
 * reported the same clean pass on three different states — a database the export
 * has never touched, one the export loaded completely, and one where the export
 * ran and left fixtures behind. The cutover cares about the difference, and the
 * third case is the one this card exists to surface.
 *
 * A surviving fixture is not an error by itself: a curated identity may
 * legitimately be absent from a dirty export, and the ruling default is to keep
 * it. What it may never be is invisible, because the cutover report has to
 * attribute each one to the exclusion rule that dropped it or to another known
 * reason. So these cases assert the counts are reported, not that survivors fail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3439');

/** The gate's stdout, whatever its exit status: other gates fail on these
 *  deliberately thin populations, and the provenance line is what is under test. */
function gateOutput(): string {
  try {
    return execFileSync('bash', ['scripts/validate-legacy-import-gates.sh'], {
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
      encoding: 'utf8',
      stdio: 'pipe',
      ...SPAWN_GUARD,
    });
  } catch (err) {
    return (err as { stdout?: string }).stdout ?? '';
  }
}

function provenanceLine(): string {
  const line = gateOutput().split('\n').find((l) => l.startsWith('GATE: G3'));
  expect(line, 'the gate emitted no provenance line at all').toBeDefined();
  return line!;
}

/** Replace the member population with exactly the given provenance mix. */
async function populate(sources: string[]): Promise<void> {
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const { insertLegacyMember } = await import('../fixtures/factories');
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM legacy_members').run();
  sources.forEach((source, index) => {
    insertLegacyMember(db, {
      legacy_member_id: `92${String(index).padStart(4, '0')}`,
      real_name: source === 'legacy_site_data' ? `Real ${index}` : null,
      display_name: `Member ${index}`,
      import_source: source,
    });
  });
  db.close();
}

beforeAll(() => {
  createTestDb(dbPath).close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the provenance gate separates export-loaded rows from system fixtures', () => {
  it('names a database the export has never touched as pre-load', async () => {
    await populate(['system_fixture', 'system_fixture', 'system_fixture']);
    const line = provenanceLine();
    expect(line).toContain('PASS');
    expect(line).toContain('no export-loaded rows yet');
    expect(line).toContain('3 system fixture(s)');
    expect(line).toContain('pre-load database');
  });

  it('says so plainly when the export covered every row', async () => {
    await populate(['legacy_site_data', 'legacy_site_data']);
    const line = provenanceLine();
    expect(line).toContain('PASS');
    expect(line).toContain('2 export-loaded');
    expect(line).toContain('no surviving fixtures');
  });

  it('names the survivors when the export left fixtures behind', async () => {
    // The state the card exists to surface, and the one that used to read as an
    // unremarkable clean pass.
    await populate(['legacy_site_data', 'legacy_site_data', 'system_fixture']);
    const line = provenanceLine();
    expect(line).toContain('PASS');
    expect(line).toContain('2 export-loaded');
    expect(line).toContain('1 surviving system fixture(s)');
    expect(line).toContain('recorded reason');
  });

  it('still fails a row carrying no provenance at all', async () => {
    // The gate's original job, which the added reporting must not displace.
    await populate(['legacy_site_data', '']);
    const line = provenanceLine();
    expect(line).toContain('FAIL');
    expect(line).toContain('missing import_source');
  });
});
