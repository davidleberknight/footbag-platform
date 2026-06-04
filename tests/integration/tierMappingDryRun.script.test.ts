/**
 * Tier-mapping dry-run script contract: read-only preview of
 * grants-if-all-claimed. Honors-only fallback when the five tier-state
 * columns are absent (legacy-flag and transitive-HP honors both map to
 * tier2); full precedence when all five exist (board beats honors beats
 * paid history, with the board-underlying derivation); claimed rows are
 * skipped; the database file is byte-identical after a run.
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
  it('honors-only fallback: legacy-flag and transitive-HP honors map to tier2; claimed rows skipped; DB untouched', () => {
    const before = fileHash();
    const r = run();
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('honors-only fallback');
    expect(r.stdout).toContain('unclaimed rows examined: 3');
    expect(r.stdout).toContain('already claimed (skipped; grants exist or existed): 1');
    expect(r.stdout).toMatch(/tier2: 2/);
    expect(r.stdout).toMatch(/tier0: 1/);
    expect(fileHash()).toBe(before);
  });

  it('full precedence applies when all five tier fields exist (board beats honors; underlying derived)', () => {
    const db = new BetterSqlite3(dbPath);
    for (const col of [
      `legacy_ever_paid_tier2 INTEGER NOT NULL DEFAULT 0`,
      `legacy_ever_paid_tier1_lifetime INTEGER NOT NULL DEFAULT 0`,
      `legacy_tier1_annual_active_at_cutover INTEGER NOT NULL DEFAULT 0`,
      `legacy_was_board_at_cutover INTEGER NOT NULL DEFAULT 0`,
      `legacy_board_underlying_paid_tier TEXT`,
    ]) {
      db.exec(`ALTER TABLE legacy_members ADD COLUMN ${col}`);
    }
    // The HoF row was also board at cutover: board wins, underlying tier2 via honors.
    db.prepare(`UPDATE legacy_members SET legacy_was_board_at_cutover = 1 WHERE legacy_member_id = 'LM-dr-hof'`).run();
    // The plain row paid Tier 1 Lifetime.
    db.prepare(`UPDATE legacy_members SET legacy_ever_paid_tier1_lifetime = 1 WHERE legacy_member_id = 'LM-dr-plain'`).run();
    db.close();

    const r = run();
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('full precedence (five tier fields present)');
    expect(r.stdout).toMatch(/tier3: 1/);
    expect(r.stdout).toMatch(/tier2: 1/);  // transitive-HP BAP row
    expect(r.stdout).toMatch(/tier1: 1/);  // tier1-lifetime row
    expect(r.stdout).toMatch(/p1_board: 1/);
    expect(r.stdout).toMatch(/p4_tier1_lifetime: 1/);
    expect(r.stdout).toContain('tier3 underlying derivation:');
    expect(r.stdout).toMatch(/tier2: 1\s*$/m);
  });
});
