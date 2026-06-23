/**
 * Tier-mapping dry-run script contract: read-only preview of
 * grants-if-all-claimed under the honors + paid-history mapping. Honors
 * (legacy-flag or transitive-HP) and ever-paid Tier 2 map to tier2; bought Tier 1
 * Lifetime or active Tier 1 Annual map to tier1; everything else tier0. Claimed
 * rows are skipped; the database file is byte-identical after a run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');
const REPO_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'tier-mapping-dry-run.ts');

beforeAll(() => {
  const db = createTestDb(dbPath);

  // Unclaimed: legacy-flag HoF, transitive-HP BAP, plain.
  insertLegacyMember(db, { legacy_member_id: 'LM-dr-hof', legacy_email: 'dr-hof@example.com', is_hof: 1 });
  insertLegacyMember(db, { legacy_member_id: 'LM-dr-hpbap', legacy_email: 'dr-hpbap@example.com' });
  insertHistoricalPerson(db, { person_id: 'HP-dr-bap', person_name: 'Dr Bap', legacy_member_id: 'LM-dr-hpbap', bap_member: 1 });
  insertLegacyMember(db, { legacy_member_id: 'LM-dr-plain', legacy_email: 'dr-plain@example.com' });

  // Claimed: must be skipped.
  insertLegacyMember(db, { legacy_member_id: 'LM-dr-claimed', legacy_email: 'dr-claimed@example.com', is_hof: 1 });
  insertMember(db, { id: 'mem-dr-claimer', slug: 'mem_dr_claimer', login_email: 'dr-claimer@example.com' });
  db.prepare(`UPDATE legacy_members SET claimed_by_member_id = 'mem-dr-claimer', claimed_at = '2026-01-01T00:00:00.000Z' WHERE legacy_member_id = 'LM-dr-claimed'`).run();

  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

function run(): { stdout: string; status: number } {
  const r = spawnSync('npx', ['tsx', SCRIPT, '--db', dbPath], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000,
  });
  return { stdout: r.stdout ?? '', status: r.status ?? -1 };
}

function fileHash(): string {
  return createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
}

describe('tier-mapping dry-run script', () => {
  it('honors map to tier2; a row with no paid history stays tier0; claimed rows skipped; DB untouched', () => {
    const before = fileHash();
    const r = run();
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('honors + paid-history');
    expect(r.stdout).toContain('unclaimed rows examined: 3');
    expect(r.stdout).toContain('already claimed (skipped; grants exist or existed): 1');
    expect(r.stdout).toMatch(/tier2: 2/);   // legacy-flag HoF + transitive-HP BAP
    expect(r.stdout).toMatch(/tier0: 1/);   // the plain row
    expect(fileHash()).toBe(before);
  });

  it('a paid Tier 1 Lifetime flag maps the otherwise-plain row to tier1', () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare(`UPDATE legacy_members SET legacy_ever_paid_tier1_lifetime = 1 WHERE legacy_member_id = 'LM-dr-plain'`).run();
    db.close();

    const r = run();
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('honors + paid-history');
    expect(r.stdout).toMatch(/tier2: 2/);   // the two honors rows
    expect(r.stdout).toMatch(/tier1: 1/);   // the lifetime-paid row
    expect(r.stdout).toMatch(/p_tier1_lifetime: 1/);
  });
});
