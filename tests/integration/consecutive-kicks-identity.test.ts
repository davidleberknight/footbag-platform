/**
 * Durable identity of consecutive_kicks_records.
 *
 * The table's primary key is a stable surrogate id, with created/updated
 * timestamps, so a coming admin edit path and its audit trail key on an identity
 * that does not change when an admin reorders rows. sort_order is retained as a
 * plain but unique display position. This suite pins that schema shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertConsecutiveKicksRecord } from '../fixtures/factories';

const { dbPath } = setTestEnv('3971');
let db: BetterSqlite3.Database;

beforeAll(() => { db = createTestDb(dbPath); });
afterAll(() => { db.close(); cleanupTestDb(dbPath); });

describe('consecutive_kicks_records durable identity', () => {
  it('carries a surrogate id primary key and created/updated timestamps, with sort_order intact', () => {
    const id = insertConsecutiveKicksRecord(db, { sort_order: 42, player_1: 'Identity Player' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const row = db.prepare(
      'SELECT id, sort_order, player_1, created_at, updated_at FROM consecutive_kicks_records WHERE id = ?',
    ).get(id) as { id: string; sort_order: number; player_1: string; created_at: string; updated_at: string };
    expect(row.id).toBe(id);
    expect(row.sort_order).toBe(42);
    expect(row.player_1).toBe('Identity Player');
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('keeps sort_order unique (a duplicate display position is rejected)', () => {
    insertConsecutiveKicksRecord(db, { sort_order: 7 });
    expect(() => insertConsecutiveKicksRecord(db, { sort_order: 7 })).toThrow();
  });
});
