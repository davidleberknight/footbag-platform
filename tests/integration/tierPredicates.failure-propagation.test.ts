/**
 * The tier predicates turn exactly one failure into "no entitlement": a member
 * the tier read cannot find. Every other failure of that read propagates.
 *
 * An unknown member is the soft-deleted-mid-session edge the predicates exist to
 * absorb, and it reads as a plain refusal. A database that cannot answer the tier
 * question is a different thing: swallowing it would quietly deny every member
 * their entitlements, answer 403 where the request should fail, and keep the
 * failure out of the error handler and the alarm that watches it. This file owns
 * its own database because the case removes the tier view to make the read fail
 * for a reason that is not a missing member.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4242');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let predicates: typeof import('../../src/services/tierPredicates');

const MEMBER_ID = 'member-pred-failure';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: 'pred_failure' });
  db.close();
  predicates = await import('../../src/services/tierPredicates');
});

afterAll(() => cleanupTestDb(dbPath));

describe('tier predicates when the tier read itself fails', () => {
  // Defect caught: a broken tier read is reported as "this member holds no
  // tier", so every member is refused and nothing reaches the error handler.
  it('propagates a failure that is not a missing member instead of answering false', () => {
    expect(predicates.isTier2Plus(MEMBER_ID), 'the read works before the view is removed').toBe(false);
    const db = new BetterSqlite3(dbPath);
    db.exec('DROP VIEW member_tier_current');
    db.close();
    for (const predicate of [predicates.hasTier1Benefits, predicates.isTier2Plus, predicates.isTier3]) {
      expect(() => predicate(MEMBER_ID), predicate.name).toThrow(/member_tier_current/);
    }
  });
});
