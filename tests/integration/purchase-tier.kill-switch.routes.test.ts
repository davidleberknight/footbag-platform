import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3993');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, createTestSessionJwt, completeOnboarding } from '../fixtures/factories';

const MEMBER_ID = 'killswitch-buyer-001';
const MEMBER_SLUG = 'killswitch-buyer';

let createApp: Awaited<ReturnType<typeof importApp>>;

function memberCookie(memberId: string = MEMBER_ID): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

// The kill-switch is a runtime config toggle. system_config is append-only
// (DELETE is trigger-blocked), so each toggle appends a later-effective row and
// the service reads the new value on the next request with no restart. Every
// toggle gets a strictly-increasing effective_start_at (after the year-2000
// seed, before now) so the latest deterministically wins the
// system_config_current MAX filter with no same-millisecond tie.
let toggleSeq = 0;
function setPaymentsPaused(paused: boolean): void {
  toggleSeq += 1;
  const effectiveAt = `2020-01-01T00:00:00.${String(toggleSeq).padStart(3, '0')}Z`;
  const db = new BetterSqlite3(dbPath);
  try {
    db.prepare(
      `INSERT INTO system_config
         (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'payments_paused', ?, ?, 'Test toggle', NULL)`,
    ).run(`cfg_test_payments_paused_${toggleSeq}`, paused ? '1' : '0', effectiveAt);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Buyer', login_email: 'killswitch-buyer@example.com' });
  completeOnboarding(db, MEMBER_ID);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  const db = new BetterSqlite3(dbPath);
  try {
    // Clear any pending payment so the one-pending-membership index does not
    // reject a fresh start. Each test sets its own payments_paused state
    // explicitly (system_config is append-only, so it is never reset here).
    db.prepare("DELETE FROM payments WHERE status = 'pending'").run();
  } finally {
    db.close();
  }
});

describe('Membership-purchase kill-switch (payments_paused)', () => {
  it('starts checkout normally for an eligible member when payments are open', async () => {
    setPaymentsPaused(false);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/payments\/checkout\/cs_stub_/);
  });

  it('rejects the purchase with 503 and opens no checkout session when paused', async () => {
    setPaymentsPaused(true);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    expect(res.status).toBe(503);

    // The switch fires before any DB write, so no payment row exists for the member.
    const db = new BetterSqlite3(dbPath);
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM payments WHERE member_id = ?').get(MEMBER_ID) as { n: number };
      expect(row.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('resumes checkout once the pause is lifted', async () => {
    setPaymentsPaused(true);
    setPaymentsPaused(false);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/payments\/checkout\/cs_stub_/);
  });
});
