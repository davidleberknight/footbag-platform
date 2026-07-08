/**
 * Freestyle content tables are read-only at runtime outside admin curation.
 *
 * After cutover the live database is the source of truth for freestyle content,
 * so nothing in ordinary runtime (app boot, public page reads) may rewrite the
 * freestyle trick, world-record, or consecutive-kicks tables; only the admin
 * curation write paths may. This suite seeds one row in each table, boots the
 * app, serves the public pages that read them, and asserts all three tables are
 * unchanged, which is the runtime half of "content edits survive a
 * data-preserving deploy" (the transport half is pinned by the deploy-code
 * script check; the full drill is an operator rehearsal).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleRecord,
  insertConsecutiveKicksRecord,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3974');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

function snapshotTables(): string {
  const tricks = db.prepare('SELECT * FROM freestyle_tricks ORDER BY slug').all();
  const records = db.prepare('SELECT * FROM freestyle_records ORDER BY id').all();
  const consecutive = db.prepare('SELECT * FROM consecutive_kicks_records ORDER BY id').all();
  return JSON.stringify({ tricks, records, consecutive });
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'immutable_trick',
    canonical_name: 'Immutable Trick',
    adds: '3',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });
  insertFreestyleRecord(db, {
    id: 'immutable_record',
    display_name: 'Immutable Holder',
    trick_name: 'Immutable Trick',
    value_numeric: 21,
  });
  insertConsecutiveKicksRecord(db, {
    id: 'immutable_ck',
    sort_order: 11,
    player_1: 'Immutable Kicker',
    score: 12345,
  });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('freestyle content tables under ordinary runtime reads', () => {
  it('boot plus the public read surfaces leave all three tables byte-identical', async () => {
    const before = snapshotTables();

    const app = await createApp();
    const reads = [
      '/freestyle/tricks',
      '/freestyle/tricks/immutable_trick',
      '/freestyle/records',
      '/records',
    ];
    for (const path of reads) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should render`).toBe(200);
    }

    expect(snapshotTables()).toBe(before);
  });
});
