import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3971');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const MEMBER_T0 = 'pay-stub-tier0-001';
const MEMBER_T1 = 'pay-stub-tier1-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_T0, slug: 'tier0buyer', display_name: 'Tier Zero', login_email: 'tier0@example.com' });
  insertMember(db, { id: MEMBER_T1, slug: 'tier1buyer', display_name: 'Tier One', login_email: 'tier1@example.com' });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('applyDevPaymentStub', () => {
  it('Tier 0 member purchasing tier1: creates payment, tier grant, and correct tier_current', async () => {
    const { applyDevPaymentStub } = await import('../../src/services/membershipTieringService');
    const result = applyDevPaymentStub(MEMBER_T0, 'tier1');

    expect(result.paymentId).toMatch(/^pay_/);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare('SELECT * FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.status).toBe('succeeded');
      expect(payment.payment_type).toBe('membership');
      expect(payment.purchased_tier_status).toBe('tier1');
      expect(payment.amount_cents).toBe(2000);
      expect(payment.member_id).toBe(MEMBER_T0);

      const transition = testDb.prepare('SELECT * FROM payment_status_transitions WHERE payment_id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(transition.from_status).toBe('pending');
      expect(transition.to_status).toBe('succeeded');

      const tier = testDb.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(MEMBER_T0) as Record<string, unknown>;
      expect(tier.tier_status).toBe('tier1');

      const grant = testDb.prepare('SELECT * FROM member_tier_grants WHERE member_id = ? ORDER BY created_at DESC LIMIT 1').get(MEMBER_T0) as Record<string, unknown>;
      expect(grant.reason_code).toBe('purchase.tier1');
      expect(grant.related_payment_id).toBe(result.paymentId);

      const audit = testDb.prepare("SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'dev_payment_stub'").get(MEMBER_T0) as Record<string, unknown>;
      expect(audit).toBeTruthy();
    } finally {
      testDb.close();
    }
  });

  it('Tier 0 member purchasing tier2: upgrades to tier2', async () => {
    const { applyDevPaymentStub } = await import('../../src/services/membershipTieringService');
    const result = applyDevPaymentStub(MEMBER_T1, 'tier2');

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare('SELECT * FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.purchased_tier_status).toBe('tier2');
      expect(payment.amount_cents).toBe(5000);

      const tier = testDb.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(MEMBER_T1) as Record<string, unknown>;
      expect(tier.tier_status).toBe('tier2');
    } finally {
      testDb.close();
    }
  });
});
