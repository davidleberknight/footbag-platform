/**
 * The platform payment kill-switch covers donations, not only membership
 * purchases. With payments_paused set, a donation is refused before any member
 * lookup, throttle token, or checkout-session call, so a paused platform opens
 * no session at the payment provider and reveals nothing about the member.
 *
 * The switch is seeded on for this suite's whole database, because the runtime
 * config reader has no cache to invalidate and flipping a global tunable partway
 * through a shared database would leak into unrelated tests.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4032');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, insertSystemConfig } from '../fixtures/factories';

const MEMBER = 'don-paused';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER,
    slug: 'don_paused',
    display_name: 'Don Paused',
    login_email: 'don-paused@example.com',
  });
  insertSystemConfig(db, { config_key: 'payments_paused', value_json: '1' });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('donations while payments are paused', () => {
  it('refuses a one-time and a recurring donation with a typed unavailable error', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    await expect(paymentService.startDonation(MEMBER, 2500, null, false, '/x'))
      .rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(paymentService.startDonation(MEMBER, 2500, null, true, '/x'))
      .rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('opens no checkout session and writes no payment row while paused', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getPaymentAdapter, getStubPaymentAdapterForTests } =
      await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const stub = getStubPaymentAdapterForTests()!;
    const sessionsBefore = stub.sessions.size;

    await expect(paymentService.startDonation(MEMBER, 2500, null, true, '/x')).rejects.toThrow();

    expect(stub.sessions.size).toBe(sessionsBefore);
    const db = new BetterSqlite3(dbPath);
    try {
      const rows = db
        .prepare('SELECT COUNT(*) AS c FROM payments WHERE member_id = ?')
        .get(MEMBER) as { c: number };
      expect(rows.c).toBe(0);
    } finally {
      db.close();
    }
  });

  it('refuses before the member is even looked up, so an unknown member is indistinguishable', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    await expect(paymentService.startDonation('no-such-member', 2500, null, false, '/x'))
      .rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
