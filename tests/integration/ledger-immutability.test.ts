/**
 * Ledger immutability: append-only tables reject UPDATE and DELETE.
 *
 * Two layers. The structural sweep asserts every ledger table still carries its
 * BEFORE UPDATE and BEFORE DELETE abort triggers, so a schema change that drops
 * one fails here rather than silently making a ledger mutable. The behavioral
 * cases prove the triggers actually fire on a seeded row, through the shared
 * assertAppendOnly helper that any ledger test reuses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertActivePlayerVouch } from '../fixtures/factories';
import { assertAppendOnly } from '../fixtures/assertAppendOnly';
import { isoDaysFromNow } from '../fixtures/clock';

const { dbPath } = setTestEnv('3419');

// Every append-only ledger in the schema. A new ledger table is added here when
// it lands so the structural sweep guards its immutability triggers too.
const LEDGER_TABLES = [
  'audit_entries',
  'member_tier_grants',
  'active_player_grants',
  'active_player_vouches',
  'system_config',
  'erasure_log',
  'payment_status_transitions',
  'recurring_donation_subscription_transitions',
  'vote_options',
  'vote_eligibility_snapshot',
  'ballots',
];

const SEED_TS = '2024-01-01T00:00:00.000Z';

beforeAll(() => {
  const db = createTestDb(dbPath);
  db.prepare(
    `INSERT INTO system_config (id, created_at, config_key, value_json, effective_start_at, reason_text)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('sc-immutable-1', SEED_TS, 'test_immutable_key', '"v"', SEED_TS, 'immutability seed');

  insertMember(db, { id: 'apv-voucher' });
  insertMember(db, { id: 'apv-target' });
  insertActivePlayerVouch(db, {
    id: 'apv-immutable-1',
    voucher_member_id: 'apv-voucher',
    target_member_id: 'apv-target',
    new_active_player_expires_at: isoDaysFromNow(365),
  });
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('ledger immutability', () => {
  it('every ledger table keeps its BEFORE UPDATE and BEFORE DELETE abort triggers', () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const triggers = db
        .prepare("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'trigger'")
        .all() as Array<{ tbl_name: string; sql: string }>;
      for (const table of LEDGER_TABLES) {
        const forTable = triggers.filter((t) => t.tbl_name === table && /RAISE\(ABORT/i.test(t.sql));
        const hasUpdate = forTable.some((t) => /BEFORE\s+UPDATE/i.test(t.sql));
        const hasDelete = forTable.some((t) => /BEFORE\s+DELETE/i.test(t.sql));
        expect(hasUpdate, `${table} has a BEFORE UPDATE abort trigger`).toBe(true);
        expect(hasDelete, `${table} has a BEFORE DELETE abort trigger`).toBe(true);
      }
    } finally {
      db.close();
    }
  });

  it('rejects UPDATE and DELETE on a system_config row', () => {
    const db = new BetterSqlite3(dbPath);
    try {
      assertAppendOnly(db, 'system_config', 'sc-immutable-1');
    } finally {
      db.close();
    }
  });

  it('rejects UPDATE and DELETE on an active_player_vouches row', () => {
    const db = new BetterSqlite3(dbPath);
    try {
      assertAppendOnly(db, 'active_player_vouches', 'apv-immutable-1');
    } finally {
      db.close();
    }
  });
});
