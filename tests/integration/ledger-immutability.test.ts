/**
 * Ledger immutability: append-only tables reject UPDATE and DELETE.
 *
 * Two layers. The structural sweep asserts every ledger table still carries its
 * BEFORE UPDATE and BEFORE DELETE abort triggers AND that each abort is
 * unconditional (no WHEN guard), so a schema change that drops a trigger or
 * narrows it behind a condition fails here rather than silently making a ledger
 * mutable. An unconditional BEFORE UPDATE/DELETE trigger fires on every matching
 * mutation by construction, so the sweep proves the invariant for every ledger;
 * the behavioral cases then demonstrate that firing on representative ledgers
 * through the shared assertAppendOnly helper that any ledger test reuses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertActivePlayerVouch, insertMemberTierGrant } from '../fixtures/factories';
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
  'active_player_reminder_sent',
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

  insertMember(db, { id: 'mtg-immutable-member' });
  insertMemberTierGrant(db, {
    id: 'mtg-immutable-1',
    member_id: 'mtg-immutable-member',
    new_tier_status: 'tier1',
    created_at: SEED_TS,
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
        const updateTrigs = forTable.filter((t) => /BEFORE\s+UPDATE/i.test(t.sql));
        const deleteTrigs = forTable.filter((t) => /BEFORE\s+DELETE/i.test(t.sql));
        expect(updateTrigs.length, `${table} has a BEFORE UPDATE abort trigger`).toBeGreaterThan(0);
        expect(deleteTrigs.length, `${table} has a BEFORE DELETE abort trigger`).toBeGreaterThan(0);
        // The abort must be unconditional: a WHEN guard before the trigger body
        // could let a no-op or selective mutation slip past the RAISE, so no
        // ledger immutability trigger carries a WHEN clause. Check the header
        // ahead of BEGIN so a 'when' inside the RAISE message never false-trips.
        for (const t of [...updateTrigs, ...deleteTrigs]) {
          const header = t.sql.split(/\bBEGIN\b/i)[0];
          expect(
            /\bWHEN\b/i.test(header),
            `${table} immutability trigger fires unconditionally (no WHEN guard)`,
          ).toBe(false);
        }
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

  it('rejects UPDATE and DELETE on a member_tier_grants row', () => {
    const db = new BetterSqlite3(dbPath);
    try {
      assertAppendOnly(db, 'member_tier_grants', 'mtg-immutable-1');
    } finally {
      db.close();
    }
  });
});
