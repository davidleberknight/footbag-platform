/**
 * Legacy-account email lookup is case-insensitive by lowercasing at the
 * boundaries (loader on write, service on the bound lookup value), not by a
 * COLLATE NOCASE predicate. This pins three things that must hold together:
 *  - the identifier lookup seeks the email indexes instead of scanning the
 *    whole legacy_members table (a scan is O(members x rows) at the cutover
 *    batch auto-link);
 *  - a lowercased lookup value matches a lowercase-stored email, while a raw
 *    mixed-case value does not, proving the query itself is binary and the
 *    boundary lowercasing is what carries case-insensitivity;
 *  - the unused single-row twin lookup is gone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertLegacyMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertLegacyMember(db, {
    legacy_member_id: 'LM-lower', legacy_email: 'mixed@example.com',
    real_name: 'Case Person', display_name: 'Case Person',
  });
  await importApp();
  dbMod = await import('../../src/db/db');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('legacy identifier lookup query plan', () => {
  it('seeks the email indexes and never scans the legacy_members table', () => {
    const sql = dbMod.legacyMembers.findAllByIdentifier.source;
    const plan = dbMod.db
      .prepare('EXPLAIN QUERY PLAN ' + sql)
      .all('LM-x', 'LM-x', 'a@b.com', 'a@b.com', 'a@b.com') as Array<{ detail: string }>;
    const details = plan.map((r) => r.detail);
    expect(details.some((d) => /SEARCH .*legacy_members.* USING (INDEX|COVERING INDEX)/.test(d))).toBe(true);
    expect(details.some((d) => /SCAN legacy_members/.test(d))).toBe(false);
  });
});

describe('legacy email lookup case handling', () => {
  it('matches a lowercased lookup value against a lowercase-stored email', () => {
    const rows = dbMod.legacyMembers.findAllByIdentifier.all(
      'mixed@example.com', 'mixed@example.com',
      'mixed@example.com', 'mixed@example.com', 'mixed@example.com',
    ) as Array<{ legacy_member_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.legacy_member_id).toBe('LM-lower');
  });

  it('does not match a raw mixed-case value: the query is binary, so boundary lowercasing is load-bearing', () => {
    const rows = dbMod.legacyMembers.findAllByIdentifier.all(
      'MiXeD@example.com', 'MiXeD@example.com',
      'MiXeD@example.com', 'MiXeD@example.com', 'MiXeD@example.com',
    ) as Array<unknown>;
    expect(rows).toHaveLength(0);
  });
});

describe('unused single-row identifier lookup is removed', () => {
  it('no longer exposes the dead single-row twin', () => {
    expect('findByIdentifier' in dbMod.legacyMembers).toBe(false);
  });
});
