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

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3438');

// Exit status of the gate script against this file's database, and the verdict
// each gate printed. The script fails non-zero whenever any gate fails.
function runGates(): { status: number; verdicts: Map<string, string> } {
  let stdout = '';
  let status = 0;
  try {
    stdout = execFileSync('bash', ['scripts/validate-legacy-import-gates.sh'], {
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
      encoding: 'utf8',
      stdio: 'pipe',
      ...SPAWN_GUARD,
    });
  } catch (err) {
    const e = err as { stdout?: string; status: number };
    stdout = e.stdout ?? '';
    status = e.status;
  }
  const verdicts = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const m = /^GATE: (G\d) (PASS|FAIL|SKIP): (.*)$/.exec(line);
    if (m) verdicts.set(m[1], `${m[2]}: ${m[3]}`);
  }
  return { status, verdicts };
}

function gateExitStatus(): number {
  return runGates().status;
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

  // Defect caught: a staging copy or workstation built without the member load
  // reports two red gates that read exactly like corrupt member data, so every
  // staging closing run is red and a real defect would look the same.
  it('reports the legal-name and honor gates as prerequisite not loaded, not as failures', () => {
    const { verdicts } = runGates();
    for (const gate of ['G4', 'G6']) {
      expect(verdicts.get(gate), gate).toMatch(/^SKIP: prerequisite not loaded: /);
    }
    for (const gate of ['G1', 'G2', 'G3', 'G5']) {
      expect(verdicts.get(gate), gate).toMatch(/^PASS: /);
    }
  });

  // Defect caught: a structural defect a mirror-derived load can carry hides
  // behind the "not loaded" status, so a shared address reaches staging unflagged.
  it('still fails outright when a structural gate fails on a load without the export', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { insertLegacyMember } = await import('../fixtures/factories');
    const db = new BetterSqlite3(dbPath);
    insertLegacyMember(db, {
      legacy_member_id: '910010', real_name: null, display_name: 'Mirror Ten', import_source: 'mirror',
      legacy_email: 'shared@example.test',
    });
    insertLegacyMember(db, {
      legacy_member_id: '910011', real_name: null, display_name: 'Mirror Eleven', import_source: 'mirror',
      legacy_email: 'SHARED@example.test',
    });
    db.close();

    try {
      const { status, verdicts } = runGates();
      expect(verdicts.get('G1')).toMatch(/^FAIL: /);
      expect(status).toBe(1);
    } finally {
      const cleanup = new BetterSqlite3(dbPath);
      cleanup.prepare("DELETE FROM legacy_members WHERE legacy_member_id IN ('910010', '910011')").run();
      cleanup.close();
    }
  });

  it('reports an ordinary failure once the export has written its first row', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { insertLegacyMember } = await import('../fixtures/factories');
    const db = new BetterSqlite3(dbPath);
    insertLegacyMember(db, {
      legacy_member_id: '910003', real_name: 'Exported Person', import_source: 'legacy_site_data',
    });
    db.close();

    // Defect caught: once the export has begun, the missing legal names are a
    // real defect, and a "not loaded" status there would wave it through.
    const { status, verdicts } = runGates();
    expect(verdicts.get('G4')).toMatch(/^FAIL: /);
    expect(status).toBe(1);
  });
});
