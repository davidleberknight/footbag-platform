/**
 * The replay harness's seeding: the rows a captured sequence names are the rows
 * the replay finds.
 *
 * A golden payload refers to rows the platform wrote before the provider saw the
 * payment (the pending payment a checkout opened, the opening row of a recurring
 * donation, the member behind both). If the harness seeds the wrong rows, or
 * none, a real capture replays as "not ours" or as a retry, and the suite pins
 * that wrong verdict as golden. These events are hand-built in the synthetic id
 * pattern the sanitiser writes, carrying only what the handlers correlate on;
 * they test the harness, and are never committed to the golden set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { planGoldenSeed, seedGoldenRows } from '../fixtures/stripeGoldenSeed';

const { dbPath } = setTestEnv('4103');
process.env.PAYMENT_ADAPTER = 'stub';

const MEMBER = 'member_gold00000000000000000001';
const PAYMENT = 'pay_gold00000000000000000002';
const RECORD = 'rds_gold00000000000000000003';
const SESSION = 'cs_test_gold00000004';
const CUSTOMER = 'cus_gold00000005';

const oneTime = [
  JSON.stringify({
    id: 'evt_gold00000006', object: 'event', type: 'checkout.session.completed', created: 1767225600,
    livemode: false,
    data: { object: {
      id: SESSION, object: 'checkout.session', client_reference_id: PAYMENT, mode: 'payment',
      amount_total: 1500, currency: 'usd', metadata: { paymentId: PAYMENT, memberId: MEMBER },
    } },
  }, null, 2),
  JSON.stringify({
    id: 'evt_gold00000007', object: 'event', type: 'payment_intent.succeeded', created: 1767225601,
    livemode: false,
    data: { object: {
      id: 'pi_gold00000008', object: 'payment_intent', amount: 1500, amount_received: 1500,
      currency: 'usd', metadata: { paymentId: PAYMENT, memberId: MEMBER },
    } },
  }, null, 2),
];

const recurring = [
  JSON.stringify({
    id: 'evt_gold00000009', object: 'event', type: 'customer.subscription.created', created: 1767225700,
    livemode: false,
    data: { object: {
      id: 'sub_gold00000010', object: 'subscription', customer: CUSTOMER, status: 'active',
      metadata: { paymentId: RECORD, subscriptionRecordId: RECORD, memberId: MEMBER, amountCents: '2500' },
    } },
  }, null, 2),
];

const plan = planGoldenSeed([...oneTime, ...recurring]);

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedGoldenRows(db, plan);
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function row(sql: string, ...args: unknown[]): Record<string, unknown> | undefined {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(sql).get(...args) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

describe('planGoldenSeed', () => {
  it('names each row the events correlate on, once, with the provider\'s amount and session', () => {
    // A member named twice would collide on seeding; a payment seeded for the
    // wrong amount raises an amount-mismatch discrepancy the capture never had.
    expect(plan.members).toEqual([MEMBER]);
    expect(plan.payments).toEqual([{
      id: PAYMENT, memberId: MEMBER, amountCents: 1500, currency: 'USD', tier: null, checkoutSessionId: SESSION,
    }]);
    expect(plan.subscriptions).toEqual([{
      id: RECORD, memberId: MEMBER, amountCents: 2500, checkoutSessionId: null,
    }]);
  });

  it('reads a membership purchase as one, carrying its tier', () => {
    // Seeded as a donation, a captured membership purchase would replay without
    // granting the tier, and the replay would pin that as the real behaviour.
    const membership = planGoldenSeed([JSON.stringify({
      data: { object: {
        object: 'payment_intent', amount: 3000, currency: 'usd',
        metadata: { paymentId: 'pay_gold00000011', memberId: MEMBER, tier: 'tier2' },
      } },
    })]);
    expect(membership.payments[0]).toMatchObject({ id: 'pay_gold00000011', tier: 'tier2', amountCents: 3000 });
  });
});

describe('a seeded sequence replayed through the real handlers', () => {
  it('settles the one-time payment the sequence names', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    for (const body of oneTime) {
      paymentService.handleWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET));
    }
    // Without the seeded pending row the intent would be refused as a retry
    // and the payment would never leave pending.
    expect(row('SELECT status, member_id FROM payments WHERE id = ?', PAYMENT))
      .toEqual({ status: 'succeeded', member_id: MEMBER });
  });

  it('promotes the recurring donation\'s opening row rather than inserting a second', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const body = recurring[0];
    expect(paymentService.handleWebhook(body, signStripeWebhook(body, STUB_WEBHOOK_SECRET)))
      .toEqual({ outcome: 'processed' });
    // The ordinary production path is a promotion of the row checkout wrote; a
    // harness that seeded nothing would exercise only the fallback insert.
    // The seeded row is the factory's ('system'); a fallback insert would be
    // the handler's own.
    expect(row(
      'SELECT status, stripe_customer_id, created_by FROM recurring_donation_subscriptions WHERE id = ?', RECORD,
    )).toEqual({ status: 'active', stripe_customer_id: CUSTOMER, created_by: 'system' });
    expect(row('SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE member_id = ?', MEMBER))
      .toEqual({ c: 1 });
  });
});
